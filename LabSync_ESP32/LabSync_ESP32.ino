#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ==============================================================
// LabSync IoT Key Dock Firmware - High Performance & Multi-Slot
// Bulacan State University – Sarmiento Campus
// Architecture: Fully Decoupled Dual-Core (Core 1: Sensor/UI, Core 0: Network)
// ==============================================================

// Global LCD placeholder (auto-detected I2C address)
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdDetected = false;
SemaphoreHandle_t i2cMutex = NULL;

// Wi-Fi Credentials
const char* ssid = "BLK 26 LT POGI - 2.4Ghz";
const char* password = "POOHLIEPOGI";

// Device Secrets & Authentication (local-only credentials)
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #include "secrets.example.h"
#endif

// Server Configuration
const char* serverUrl = "https://labsync-bulsu-sarmiento-production.up.railway.app/api/occupancy/log";
const char* heartbeatUrl = "https://labsync-bulsu-sarmiento-production.up.railway.app/api/occupancy/heartbeat";
const char* defaultScanRoom = "203"; 

// Device Authentication Credential (loaded from secrets header)
const char* deviceToken = IOT_DEVICE_TOKEN;

// Key Slots Configuration
#define KEY_PIN_203 32 // D32 -> Slot 203 (Expects Key 203: ~1800 ADC)
#define KEY_PIN_204 33 // D33 -> Slot 204 (Expects Key 204: ~0 ADC)

enum KeyType {
  KEY_NONE = 0,   // Empty Slot (> 2900)
  KEY_204 = 1,    // 0 Ohm Direct Wire Key (0 - 600)
  KEY_203 = 2     // 10k Ohm Resistor Key (1000 - 2750)
};

KeyType lastSlotState203 = KEY_NONE;
KeyType lastSlotState204 = KEY_NONE;

// Unauthorized & Wrong Key Status Flags (Tracked per slot so both keys report independently)
bool isUnauthorized203 = false;
bool isUnauthorized204 = false;
bool isWrongKey203 = false;
bool isWrongKey204 = false;

// Maximum audible duration for security alarm (30 seconds)
const unsigned long SECURITY_ALARM_MAX_DURATION_MS = 30000;

// Per-slot audible alarm start timestamps (0 = inactive / stopped)
unsigned long unauthorizedAlarmStarted203 = 0;
unsigned long unauthorizedAlarmStarted204 = 0;
unsigned long wrongKeyAlarmStarted203 = 0;
unsigned long wrongKeyAlarmStarted204 = 0;

// Authorization Window State (Thread-safe critical section)
portMUX_TYPE authMux = portMUX_INITIALIZER_UNLOCKED;
bool isAuthorized = false;
unsigned long authExpiresAt = 0;
const unsigned long AUTH_WINDOW_MS = 15000; // 15-second key retrieval countdown
int lastDisplayedCountdown = -1;

// Periodic Heartbeat Interval
const unsigned long HEARTBEAT_INTERVAL = 5000; // 5 seconds (rapid freshness against network jitter)

// Non-blocking LCD Reversion Timer
unsigned long lcdRevertAt = 0;

// GM65 Scanner Pins
#define GM65_RX_PIN 17 
#define GM65_TX_PIN 16 

// I2C Pins for LCD
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

// Buzzer Configuration (Active Low-Level Trigger)
#define BUZZER_PIN 25 
bool isBuzzerCurrentlyOn = false;

void buzzerOn() {
  if (!isBuzzerCurrentlyOn) {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW); // LOW = Beep ON
    isBuzzerCurrentlyOn = true;
  }
}

void buzzerOff() {
  if (isBuzzerCurrentlyOn) {
    pinMode(BUZZER_PIN, INPUT); // High-Z float = Beep OFF
    isBuzzerCurrentlyOn = false;
  }
}

void triggerBuzzer(int durationMs = 80, int count = 1) {
  for (int i = 0; i < count; i++) {
    buzzerOn();
    delay(durationMs);
    buzzerOff();
    if (i < count - 1) delay(40);
  }
}

// Thread-safe LCD print helper
void safeLcdPrint(const String& line1, const String& line2) {
  if (!lcdDetected) return;
  if (i2cMutex != NULL && xSemaphoreTake(i2cMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print(line1.substring(0, 16));
    lcd.setCursor(0, 1);
    lcd.print(line2.substring(0, 16));
    xSemaphoreGive(i2cMutex);
  }
}

void showReadyScreen() {
  safeLcdPrint("    LabSync", " Ready to Scan!");
}

void showUnauthorizedScreen() {
  String l2 = "RETURN KEY!     ";
  if (isUnauthorized203 && isUnauthorized204) l2 = "RETURN 203 & 204";
  else if (isUnauthorized203) l2 = "RETURN KEY 203! ";
  else if (isUnauthorized204) l2 = "RETURN KEY 204! ";
  safeLcdPrint("! UNAUTHORIZED !", l2);
}

void showWrongKeyScreen() {
  String l2 = "Wrong Key Insert";
  if (isWrongKey203) l2 = "Slot 203 Wrong! ";
  else if (isWrongKey204) l2 = "Slot 204 Wrong! ";
  safeLcdPrint("WRONG KEY SLOT!", l2);
}

void clearSerialBuffer() {
  while (Serial2.available() > 0) {
    Serial2.read();
  }
}

// Robust read helper for GM65 scanner
String readScannedCode() {
  if (Serial2.available() > 0) {
    String scannedCode = "";
    unsigned long startTime = millis();
    unsigned long lastCharTime = millis();
    
    while ((millis() - startTime < 400) && (millis() - lastCharTime < 40)) {
      while (Serial2.available() > 0) {
        char c = Serial2.read();
        lastCharTime = millis();
        if (c == '\r' || c == '\n') {
          if (scannedCode.length() > 0) {
            while (Serial2.available() > 0) {
              char nextC = Serial2.peek();
              if (nextC == '\r' || nextC == '\n') Serial2.read();
              else break;
            }
            scannedCode.trim();
            Serial.println("[GM65] Scanned barcode: " + scannedCode);
            return scannedCode;
          }
        } else if (c >= 32 && c <= 126) {
          scannedCode += c;
          if (scannedCode.length() >= 128) break;
        }
      }
      delay(1);
    }
    
    scannedCode.trim();
    if (scannedCode.length() > 0) {
      Serial.println("[GM65] Scanned barcode (idle): " + scannedCode);
    }
    return scannedCode;
  }
  return "";
}

// Rapid ADC reading with 16-sample averaging (~800 microseconds)
KeyType detectKeyType(int pin) {
  long sum = 0;
  for (int i = 0; i < 16; i++) {
    sum += analogRead(pin);
    delayMicroseconds(50);
  }
  int avgReading = sum / 16;

  if (avgReading >= 2900) {
    return KEY_NONE;
  } else if (avgReading < 600) {
    return KEY_204;
  } else if (avgReading >= 1000 && avgReading <= 2750) {
    return KEY_203;
  }

  return KEY_NONE;
}

// ==============================================================
// FreeRTOS Decoupled Network Worker Subsystem (Core 0)
// ==============================================================

enum NetMsgType {
  MSG_KEY_STATUS,
  MSG_SECURITY_ALERT,
  MSG_QR_SCAN
};

struct NetMessage {
  NetMsgType type;
  char room[8];
  bool keyPresent;
  char strPayload[64]; // alertType or qrString
};

QueueHandle_t netQueue = NULL;
const int NET_QUEUE_LEN = 16;
TaskHandle_t netTaskHandle = NULL;

// Coalesced pending synchronization state with critical section protection
portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool slotNeedsSync203 = false;
volatile bool slotTargetState203 = true; // true = Present, false = Absent

volatile bool slotNeedsSync204 = false;
volatile bool slotTargetState204 = true;

// Direct HTTP dispatch for key status transitions
bool sendKeyStatusHttp(const char* room, bool present) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setReuse(false);
  http.setConnectTimeout(1500); // 1.5s connection timeout
  http.setTimeout(2000);        // 2.0s socket timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  String statusStr = present ? "Key Returned" : "Key Taken";
  String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + String(room) + "\"}";

  int code = http.POST(jsonPayload);
  Serial.printf("[NetWorker HTTP] %s for Room %s: Status %d\n", statusStr.c_str(), room, code);

  if (code > 0) {
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) {
        stream->read();
      }
    }
  }
  http.end();
  client.stop();
  return (code > 0);
}

// Direct HTTP dispatch for security alerts
bool sendSecurityAlertHttp(const char* room, const char* alertType) {
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setReuse(false);
  http.setConnectTimeout(1500);
  http.setTimeout(2000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  StaticJsonDocument<256> reqDoc;
  reqDoc["keyEvent"] = alertType;
  reqDoc["roomNumber"] = room;

  String jsonPayload;
  serializeJson(reqDoc, jsonPayload);

  int code = http.POST(jsonPayload);
  Serial.printf("[NetWorker Alert] %s for Room %s: Status %d\n", alertType, room, code);

  if (code > 0) {
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) stream->read();
    }
  }
  http.end();
  client.stop();
  return (code > 0);
}

// Direct HTTP dispatch for telemetry heartbeat
void sendHeartbeatHttp() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.begin(client, heartbeatUrl);
    http.setReuse(false);
    http.setConnectTimeout(1500);
    http.setTimeout(2000);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    bool key203Present = false;
    bool key204Present = false;
    portENTER_CRITICAL(&stateMux);
    key203Present = slotTargetState203;
    key204Present = slotTargetState204;
    portEXIT_CRITICAL(&stateMux);

    String jsonPayload = "{\"deviceId\":\"ESP32-KeyBox\",\"rooms\":[\"203\",\"204\"],\"slots\":{\"203\":" +
                        String(key203Present ? "true" : "false") + ",\"204\":" +
                        String(key204Present ? "true" : "false") + "}}";
    int code = http.POST(jsonPayload);
    if (code > 0) {
      Serial.printf("[NetWorker Heartbeat] Sent (203: %s, 204: %s). Code: %d, FreeHeap: %u, MinHeap: %u\n",
                    key203Present ? "Present" : "Absent",
                    key204Present ? "Present" : "Absent",
                    code,
                    ESP.getFreeHeap(),
                    ESP.getMinFreeHeap());
      NetworkClient* stream = http.getStreamPtr();
      if (stream) {
        while (stream->available() > 0) stream->read();
      }
    }
    http.end();
    client.stop();
  }
}

// Direct HTTP dispatch for QR scan verification
void processQrScanHttp(const char* scannedToken, const char* room) {
  String line1 = "Scan Denied";
  String line2 = "Please Wait...";

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setConnectTimeout(1500);
    http.setTimeout(3500);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    StaticJsonDocument<256> reqDoc;
    reqDoc["qrString"] = scannedToken;
    reqDoc["roomNumber"] = room;
    reqDoc["authMethod"] = "QR Code";

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);

    int httpResponseCode = http.POST(jsonPayload);
    String response = http.getString();
    Serial.printf("[NetWorker Scan] POST status: %d, response: %s\n", httpResponseCode, response.c_str());

    StaticJsonDocument<1024> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);

    if (!error) {
      if (resDoc.containsKey("lcdLine1")) line1 = resDoc["lcdLine1"].as<String>();
      if (resDoc.containsKey("lcdLine2")) line2 = resDoc["lcdLine2"].as<String>();
      else if (resDoc.containsKey("name")) line2 = resDoc["name"].as<String>();
      else if (resDoc.containsKey("user") && resDoc["user"].containsKey("name")) line2 = resDoc["user"]["name"].as<String>();
    } else {
      if (httpResponseCode == 404) {
        line1 = "Access Denied!";
        line2 = "Invalid QR Code";
      } else if (httpResponseCode < 0) {
        line1 = "System Busy";
        line2 = "Please Retry";
      }
    }

    if (httpResponseCode == 200) {
      portENTER_CRITICAL(&authMux);
      isAuthorized = true;
      authExpiresAt = millis() + AUTH_WINDOW_MS;
      lastDisplayedCountdown = -1;
      portEXIT_CRITICAL(&authMux);

      triggerBuzzer(80, 2);
      safeLcdPrint(line1, line2);
      lcdRevertAt = millis() + 800; // Countdown display takes over after 800ms
    } else {
      triggerBuzzer(250, 1);
      safeLcdPrint(line1, line2);
      lcdRevertAt = millis() + 2500;
    }
    http.end();
    client.stop();
  } else {
    triggerBuzzer(250, 1);
    safeLcdPrint("Wi-Fi Error!", "Not Connected");
    lcdRevertAt = millis() + 2000;
  }
}

// Background FreeRTOS Worker Task running on Core 0
void networkWorkerTask(void* pvParameters) {
  Serial.printf("[NetWorker] Task active on Core %d\n", xPortGetCoreID());

  unsigned long lastWorkerHeartbeat = millis();

  while (true) {
    NetMessage msg;
    // Block on FreeRTOS queue for up to 200ms
    BaseType_t gotMsg = xQueueReceive(netQueue, &msg, pdMS_TO_TICKS(200));

    if (gotMsg == pdPASS) {
      if (WiFi.status() == WL_CONNECTED) {
        if (msg.type == MSG_KEY_STATUS) {
          if (sendKeyStatusHttp(msg.room, msg.keyPresent)) {
            portENTER_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0 && slotTargetState203 == msg.keyPresent) slotNeedsSync203 = false;
            if (strcmp(msg.room, "204") == 0 && slotTargetState204 == msg.keyPresent) slotNeedsSync204 = false;
            portEXIT_CRITICAL(&stateMux);
          }
        } else if (msg.type == MSG_SECURITY_ALERT) {
          sendSecurityAlertHttp(msg.room, msg.strPayload);
        } else if (msg.type == MSG_QR_SCAN) {
          processQrScanHttp(msg.strPayload, msg.room);
        }
      } else {
        // Wi-Fi offline: guarantee coalesced state retention
        if (msg.type == MSG_KEY_STATUS) {
          portENTER_CRITICAL(&stateMux);
          if (strcmp(msg.room, "203") == 0) slotNeedsSync203 = true;
          if (strcmp(msg.room, "204") == 0) slotNeedsSync204 = true;
          portEXIT_CRITICAL(&stateMux);
        }
      }
    }

    // Coalesced pending state reconciliation when Wi-Fi is connected
    wl_status_t currentWifiStatus = WiFi.status();
    static wl_status_t lastRecordedWifi = WL_IDLE_STATUS;

    if (currentWifiStatus == WL_CONNECTED) {
      // If link was just restored, immediately announce presence!
      if (lastRecordedWifi != WL_CONNECTED) {
        Serial.println("[NetWorker] Wi-Fi link restored! Sending immediate presence heartbeat...");
        lastWorkerHeartbeat = millis();
        sendHeartbeatHttp();
      }

      bool need203 = false, target203 = true;
      bool need204 = false, target204 = true;

      portENTER_CRITICAL(&stateMux);
      need203 = slotNeedsSync203; target203 = slotTargetState203;
      need204 = slotNeedsSync204; target204 = slotTargetState204;
      portEXIT_CRITICAL(&stateMux);

      if (need203) {
        if (sendKeyStatusHttp("203", target203)) {
          portENTER_CRITICAL(&stateMux);
          if (slotTargetState203 == target203) slotNeedsSync203 = false;
          portEXIT_CRITICAL(&stateMux);
        }
      }

      if (need204) {
        if (sendKeyStatusHttp("204", target204)) {
          portENTER_CRITICAL(&stateMux);
          if (slotTargetState204 == target204) slotNeedsSync204 = false;
          portEXIT_CRITICAL(&stateMux);
        }
      }

      // Periodic 5-second heartbeat
      if (millis() - lastWorkerHeartbeat >= HEARTBEAT_INTERVAL) {
        lastWorkerHeartbeat = millis();
        sendHeartbeatHttp();
      }
    }

    // Auto-reconnect guard
    if (currentWifiStatus != WL_CONNECTED) {
      static unsigned long lastReconnect = 0;
      if (millis() - lastReconnect >= 5000) {
        lastReconnect = millis();
        Serial.println("[NetWorker] Wi-Fi disconnected! Reconnecting...");
        WiFi.reconnect();
      }
    }
    lastRecordedWifi = currentWifiStatus;

    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// Helpers to push into FreeRTOS queue non-blockingly
void dispatchKeyStatusAsync(const char* room, bool present) {
  portENTER_CRITICAL(&stateMux);
  if (strcmp(room, "203") == 0) {
    slotTargetState203 = present;
    slotNeedsSync203 = true;
  } else if (strcmp(room, "204") == 0) {
    slotTargetState204 = present;
    slotNeedsSync204 = true;
  }
  portEXIT_CRITICAL(&stateMux);

  if (netQueue != NULL) {
    NetMessage msg;
    msg.type = MSG_KEY_STATUS;
    strncpy(msg.room, room, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = present;
    msg.strPayload[0] = '\0';
    xQueueSend(netQueue, &msg, 0); // 0 timeout: non-blocking immediate return
  }
}

void dispatchSecurityAlertAsync(const char* room, const char* alertType) {
  if (netQueue != NULL) {
    NetMessage msg;
    msg.type = MSG_SECURITY_ALERT;
    strncpy(msg.room, room, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = false;
    strncpy(msg.strPayload, alertType, sizeof(msg.strPayload) - 1);
    msg.strPayload[sizeof(msg.strPayload) - 1] = '\0';
    xQueueSend(netQueue, &msg, 0);
  }
}

void dispatchQrScanAsync(const String& scannedCode) {
  if (netQueue != NULL) {
    NetMessage msg;
    msg.type = MSG_QR_SCAN;
    strncpy(msg.room, defaultScanRoom, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = false;
    strncpy(msg.strPayload, scannedCode.c_str(), sizeof(msg.strPayload) - 1);
    msg.strPayload[sizeof(msg.strPayload) - 1] = '\0';
    xQueueSend(netQueue, &msg, 0);
  }
}

// Backward-compatible wrappers
void sendKeyStatusToServer(String room, bool present) {
  dispatchKeyStatusAsync(room.c_str(), present);
}

void sendSecurityAlertToServer(String room, String alertType) {
  dispatchSecurityAlertAsync(room.c_str(), alertType.c_str());
}

// Non-blocking Key slot transition monitor (Runs on Core 1 in loop())
void handleKeySlot(int pin, KeyType &lastState, String slotRoom, KeyType expectedKey,
                  bool &isUnauth, bool &isWrong,
                  unsigned long &unauthAlarmStarted, unsigned long &wrongAlarmStarted) {
  KeyType candidateState = detectKeyType(pin);
  
  if (candidateState != lastState) {
    delay(40); // 40ms fast debounce (rejects contact friction while responding instantly)
    KeyType verifyState = detectKeyType(pin);
    
    if (candidateState == verifyState) {
      KeyType oldState = lastState;
      lastState = verifyState;

      Serial.printf("[Slot %s] State changed: %d -> %d\n", slotRoom.c_str(), (int)oldState, (int)verifyState);

      // 1. Wrong Key Inserted
      if (verifyState != KEY_NONE && verifyState != expectedKey) {
        isWrong = true;
        wrongAlarmStarted = millis(); // Start audible timer for wrong key
        String insertedKeyName = (verifyState == KEY_203) ? "203" : "204";
        Serial.printf("❌ WRONG KEY SLOT! Key %s inserted into Slot %s\n", insertedKeyName.c_str(), slotRoom.c_str());
        dispatchSecurityAlertAsync(slotRoom.c_str(), "Wrong Key Slot");
        showWrongKeyScreen();
        lcdRevertAt = millis() + 2500;
        return;
      }

      // 2. Correct Key Returned
      if (verifyState == expectedKey) {
        bool wasUnauth = isUnauth;
        isUnauth = false;
        isWrong = false;
        unauthAlarmStarted = 0; // Reset audible alarm timers
        wrongAlarmStarted = 0;

        triggerBuzzer(80, 2);
        safeLcdPrint(slotRoom + " Key Return", wasUnauth ? "Alarm Cleared " : "Room Secured  ");
        dispatchKeyStatusAsync(slotRoom.c_str(), true);
        lcdRevertAt = millis() + 1500;
        return;
      } 

      // 3. Key Taken (Went to KEY_NONE)
      else if (verifyState == KEY_NONE) {
        // If it was just a wrong key being removed
        if (isWrong) {
          isWrong = false;
          wrongAlarmStarted = 0;
          triggerBuzzer(60, 1);
          safeLcdPrint("Key Removed", "System Ready");
          lcdRevertAt = millis() + 1000;
          return;
        }

        bool hasValidAuth = false;
        portENTER_CRITICAL(&authMux);
        if (isAuthorized && millis() < authExpiresAt) {
          isAuthorized = false; // strictly single-use
          authExpiresAt = 0;
          hasValidAuth = true;
        }
        portEXIT_CRITICAL(&authMux);

        if (hasValidAuth) {
          isUnauth = false;
          unauthAlarmStarted = 0;
          triggerBuzzer(80, 2);
          safeLcdPrint(slotRoom + " Key Taken", "Room Active");
          dispatchKeyStatusAsync(slotRoom.c_str(), false);
          lcdRevertAt = millis() + 1500;
          return;
        } else {
          // UNAUTHORIZED KEY REMOVAL!
          isUnauth = true;
          unauthAlarmStarted = millis(); // Start audible alarm timer
          Serial.printf("🚨 UNAUTHORIZED KEY REMOVAL! Key %s removed without scanning QR!\n", slotRoom.c_str());
          dispatchSecurityAlertAsync(slotRoom.c_str(), "Unauthorized Removal");
          dispatchKeyStatusAsync(slotRoom.c_str(), false);
          showUnauthorizedScreen();
          buzzerOn(); // Immediate alarm tone without waiting for network!
          return;
        }
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n--- LabSync Device Booting (Dual-Core Architecture) ---");

  buzzerOff();
  isBuzzerCurrentlyOn = false;

  analogSetPinAttenuation(KEY_PIN_203, ADC_11db);
  analogSetPinAttenuation(KEY_PIN_204, ADC_11db);
  analogReadResolution(12);
  delay(50);

  lastSlotState203 = detectKeyType(KEY_PIN_203);
  lastSlotState204 = detectKeyType(KEY_PIN_204);
  portENTER_CRITICAL(&stateMux);
  slotTargetState203 = (lastSlotState203 != KEY_NONE);
  slotTargetState204 = (lastSlotState204 != KEY_NONE);
  portEXIT_CRITICAL(&stateMux);

  // Initialize LCD & Mutex
  i2cMutex = xSemaphoreCreateMutex();
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setTimeOut(50); // 50ms I2C timeout protects against infinite bus lockup
  byte count = 0;
  byte foundAddress = 0;

  for (byte i = 8; i < 120; i++) {
    Wire.beginTransmission(i);
    if (Wire.endTransmission() == 0) {
      foundAddress = i;
      count++;
    }
  }

  unsigned long connectingScreenShownAt = 0;
  if (count > 0 && foundAddress != 0) {
    lcd = LiquidCrystal_I2C(foundAddress, 16, 2);
    lcd.init();
    lcd.backlight();
    lcdDetected = true; // MUST be true before safeLcdPrint can succeed
    safeLcdPrint("Connecting to", "Wi-Fi...");
    connectingScreenShownAt = millis();
  }

  // Initialize GM65 Scanner
  Serial2.begin(9600, SERIAL_8N1, GM65_RX_PIN, GM65_TX_PIN);
  clearSerialBuffer();

  // Create FreeRTOS Network Queue (16 elements)
  netQueue = xQueueCreate(NET_QUEUE_LEN, sizeof(NetMessage));

  // Connect Wi-Fi
  WiFi.setAutoReconnect(true); // Enable ESP32 hardware Wi-Fi auto-reconnect
  WiFi.setSleep(false); // Disable modem sleep to prevent latency spikes and ARP drops
  WiFi.begin(ssid, password);
  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 30) {
    delay(300);
    Serial.print(".");
    wifiTimeout++;
  }
  
  // Enforce small minimum display time (~800ms) so "Connecting to Wi-Fi..." is visibly readable
  if (connectingScreenShownAt > 0) {
    while (millis() - connectingScreenShownAt < 800) {
      delay(50);
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to Wi-Fi!");
    triggerBuzzer(80, 1);
    safeLcdPrint("Connected!", "Wi-Fi Ready     ");
    delay(1200); // 1.2s confirmation screen
  } else {
    Serial.println("\nWi-Fi connection timed out!");
    safeLcdPrint("Wi-Fi Offline", "Scan/Retry Later");
    delay(1500); // 1.5s offline notification screen
  }

  // Spawn Dedicated Network Worker Task pinned to Core 0 (8192 bytes stack)
  xTaskCreatePinnedToCore(
    networkWorkerTask,   // Task function
    "NetWorkerTask",     // Task name
    8192,                // Stack size in bytes
    NULL,                // Parameter
    1,                   // Priority (1 = background network priority)
    &netTaskHandle,      // Task handle
    0                    // Core 0 (dedicated network core)
  );

  if (lcdDetected) {
    showReadyScreen();
  }
}

// Main Hardware Monitoring Loop (Runs on Core 1)
void loop() {
  bool alarmActive = (isUnauthorized203 || isUnauthorized204 || isWrongKey203 || isWrongKey204);

  // 1. GM65 Scanner Detection with anti-spam cooldown
  static unsigned long lastScanTime = 0;
  String scannedCode = readScannedCode();
  if (scannedCode.length() > 0) {
    if (millis() - lastScanTime >= 1200) {
      lastScanTime = millis();
      buzzerOff();

      // Immediate local verification screen
      safeLcdPrint("Verifying QR...", "Please wait...");

      // Offload HTTP verification asynchronously to Core 0 network worker!
      dispatchQrScanAsync(scannedCode);
      lastScanTime = millis();
      clearSerialBuffer();

      // Handle retroactive authorization if alarm was active
      if (isUnauthorized203 || isUnauthorized204) {
        if (isUnauthorized204 && !isUnauthorized203) {
          isUnauthorized204 = false;
          unauthorizedAlarmStarted204 = 0;
          dispatchKeyStatusAsync("204", false);
        } else if (isUnauthorized203 && !isUnauthorized204) {
          isUnauthorized203 = false;
          unauthorizedAlarmStarted203 = 0;
          dispatchKeyStatusAsync("203", false);
        } else if (isUnauthorized203 && isUnauthorized204) {
          isUnauthorized204 = false;
          isUnauthorized203 = false;
          unauthorizedAlarmStarted204 = 0;
          unauthorizedAlarmStarted203 = 0;
          dispatchKeyStatusAsync("204", false);
          dispatchKeyStatusAsync("203", false);
        }
        portENTER_CRITICAL(&authMux);
        isAuthorized = false;
        portEXIT_CRITICAL(&authMux);

        buzzerOff();
        triggerBuzzer(80, 2);
        safeLcdPrint("Access Granted! ", "Key Authorized  ");
        lcdRevertAt = millis() + 1500;
      }
    } else {
      clearSerialBuffer();
    }
  }

  // 2. Multi-Slot Key Monitoring: BOTH slots are checked on Core 1 without network delay!
  handleKeySlot(KEY_PIN_203, lastSlotState203, "203", KEY_203, isUnauthorized203, isWrongKey203, unauthorizedAlarmStarted203, wrongKeyAlarmStarted203);
  handleKeySlot(KEY_PIN_204, lastSlotState204, "204", KEY_204, isUnauthorized204, isWrongKey204, unauthorizedAlarmStarted204, wrongKeyAlarmStarted204);

  // 3. Alarm Buzzer Sounding (Non-blocking: 70ms on, 50ms off with 30s auto-stop)
  bool audible203 = (isUnauthorized203 && (millis() - unauthorizedAlarmStarted203 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey203 && (millis() - wrongKeyAlarmStarted203 < SECURITY_ALARM_MAX_DURATION_MS));
  bool audible204 = (isUnauthorized204 && (millis() - unauthorizedAlarmStarted204 < SECURITY_ALARM_MAX_DURATION_MS)) ||
                    (isWrongKey204 && (millis() - wrongKeyAlarmStarted204 < SECURITY_ALARM_MAX_DURATION_MS));
  bool shouldSoundAlarm = audible203 || audible204;

  if (shouldSoundAlarm) {
    unsigned long cycle = millis() % 120;
    if (cycle < 70) buzzerOn();
    else buzzerOff();
  } else {
    buzzerOff();
  }

  // 4. Non-Blocking LCD Screen Reversion
  if (lcdRevertAt > 0 && millis() >= lcdRevertAt) {
    lcdRevertAt = 0;
    clearSerialBuffer();
    if (isUnauthorized203 || isUnauthorized204) {
      showUnauthorizedScreen();
    } else if (isWrongKey203 || isWrongKey204) {
      showWrongKeyScreen();
    } else if (!isAuthorized) {
      showReadyScreen();
    }
  }

  // 5. Live Countdown Window Handling (when authorized and no alarm active)
  if (!alarmActive && isAuthorized) {
    if (millis() < authExpiresAt) {
      int secLeft = (int)((authExpiresAt - millis() + 999) / 1000);
      if (secLeft != lastDisplayedCountdown) {
        lastDisplayedCountdown = secLeft;
        String cdText = "Take Key: " + String(secLeft) + "s   ";
        safeLcdPrint("Access Granted! ", cdText);
      }
    } else {
      // Authorization window expired without key withdrawal
      portENTER_CRITICAL(&authMux);
      isAuthorized = false;
      authExpiresAt = 0;
      portEXIT_CRITICAL(&authMux);

      triggerBuzzer(180, 1);
      safeLcdPrint("Session Expired ", "Scan QR Again   ");
      lcdRevertAt = millis() + 1500;
    }
  }

  delay(10);
}