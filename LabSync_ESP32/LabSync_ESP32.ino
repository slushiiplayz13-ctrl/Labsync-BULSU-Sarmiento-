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

// QR Authorization State Machine
enum QrAuthState {
  QR_AUTH_IDLE = 0,
  QR_AUTH_VERIFYING = 1,
  QR_AUTH_GRANTED_AWAITING_TAKE = 2
};

// Authorization Window State (Thread-safe critical section)
portMUX_TYPE authMux = portMUX_INITIALIZER_UNLOCKED;
volatile QrAuthState qrAuthState = QR_AUTH_IDLE;
volatile uint32_t activeScanId = 0;
volatile unsigned long verifyingStartedMs = 0;
bool isAuthorized = false;
unsigned long authExpiresAt = 0;
const unsigned long AUTH_WINDOW_MS = 15000; // 15-second key retrieval countdown
const unsigned long QR_AUTH_DISPLAY_MS = 3500; // ~3.5-second readable display for authorization result and user name
const unsigned long QR_VERIFY_TIMEOUT_MS = 12000; // 12-second safety timeout for in-flight verification
int lastDisplayedCountdown = -1;

// Periodic Heartbeat Interval
const unsigned long HEARTBEAT_INTERVAL = 15000; // 15 seconds (reduced connection frequency to prevent socket backlog)

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
            Serial.printf("[GM65] Scanned QR payload received (length: %d) at %lu ms\n", scannedCode.length(), millis());
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
      Serial.printf("[GM65] Scanned QR payload received (idle, length: %d) at %lu ms\n", scannedCode.length(), millis());
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

// Diagnostic tracking of active network operations on Core 0
const char* volatile activeNetOp = "IDLE";
volatile unsigned long activeNetOpStartMs = 0;
const char* volatile lastCompletedNetOp = "NONE";
volatile unsigned long lastCompletedNetOpDurationMs = 0;
static uint32_t globalScanCounter = 0;

struct NetMessage {
  NetMsgType type;
  char room[8];
  bool keyPresent;
  char strPayload[64]; // alertType or qrString
  char eventId[32];
  unsigned long scanReceivedMs;
  unsigned long enqueuedMs;
  uint32_t scanId;
  int8_t rssiAtScan;
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

volatile bool alertNeedsSync203 = false;
char alertPayload203[32] = "";
char alertEventId203[32] = "";

volatile bool alertNeedsSync204 = false;
char alertPayload204[32] = "";
char alertEventId204[32] = "";

// Direct HTTP dispatch for key status transitions
bool sendKeyStatusHttp(const char* room, bool present) {
  if (WiFi.status() != WL_CONNECTED) return false;

  activeNetOp = "KEY_STATUS";
  activeNetOpStartMs = millis();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setReuse(false);
  http.setConnectTimeout(4000); // 4.0s connection timeout
  http.setTimeout(5000);        // 5.0s socket timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  String statusStr = present ? "Key Returned" : "Key Taken";
  String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + String(room) + "\"}";

  unsigned long httpStart = millis();
  int code = http.POST(jsonPayload);
  unsigned long httpDuration = millis() - httpStart;

  if (code > 0) {
    Serial.printf("[NetWorker HTTP] %s for Room %s: Status %d in %lu ms\n", statusStr.c_str(), room, code, httpDuration);
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) {
        stream->read();
      }
    }
  } else {
    Serial.printf("[NetWorker HTTP] %s for Room %s Failed: Status %d (%s) in %lu ms\n",
                  statusStr.c_str(), room, code, http.errorToString(code).c_str(), httpDuration);
  }
  http.end();
  client.stop();

  lastCompletedNetOp = "KEY_STATUS";
  lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
  activeNetOp = "IDLE";

  return (code > 0);
}

// Direct HTTP dispatch for security alerts
bool sendSecurityAlertHttp(const char* room, const char* alertType, const char* eventId = NULL) {
  if (WiFi.status() != WL_CONNECTED) return false;

  activeNetOp = "SECURITY_ALERT";
  activeNetOpStartMs = millis();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.setReuse(false);
  http.setConnectTimeout(4000); // 4.0s connection timeout
  http.setTimeout(5000);        // 5.0s socket timeout
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);
  http.addHeader("Connection", "close");

  StaticJsonDocument<256> reqDoc;
  reqDoc["keyEvent"] = alertType;
  reqDoc["roomNumber"] = room;
  if (eventId && eventId[0] != '\0') {
    reqDoc["eventId"] = eventId;
  }

  String jsonPayload;
  serializeJson(reqDoc, jsonPayload);

  unsigned long httpStart = millis();
  int code = http.POST(jsonPayload);
  unsigned long httpDuration = millis() - httpStart;

  if (code > 0) {
    Serial.printf("[NetWorker Alert] %s for Room %s: Status %d in %lu ms\n", alertType, room, code, httpDuration);
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) stream->read();
    }
  } else {
    Serial.printf("[NetWorker Alert] %s for Room %s Failed: Status %d (%s) in %lu ms\n",
                  alertType, room, code, http.errorToString(code).c_str(), httpDuration);
  }
  http.end();
  client.stop();

  lastCompletedNetOp = "SECURITY_ALERT";
  lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
  activeNetOp = "IDLE";

  return (code > 0);
}

// Direct HTTP dispatch for telemetry heartbeat
bool sendHeartbeatHttp() {
  if (WiFi.status() != WL_CONNECTED) return false;

  activeNetOp = "HEARTBEAT";
  activeNetOpStartMs = millis();

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, heartbeatUrl);
  http.setReuse(false);
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
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

  unsigned long httpStart = millis();
  int code = http.POST(jsonPayload);
  unsigned long httpDuration = millis() - httpStart;

  bool isSuccess = false;
  if (code == 200) {
    isSuccess = true;
    Serial.printf("[NetWorker Heartbeat] ✔ Success: HTTP 200 in %lu ms (203: %s, 204: %s). FreeHeap: %u\n",
                  httpDuration,
                  key203Present ? "Present" : "Absent",
                  key204Present ? "Present" : "Absent",
                  ESP.getFreeHeap());
    NetworkClient* stream = http.getStreamPtr();
    if (stream) {
      while (stream->available() > 0) stream->read();
    }
  } else if (code == 401 || code == 403) {
    Serial.printf("[NetWorker Heartbeat] ❌ Auth Failure: HTTP %d in %lu ms. Invalid or rejected device token!\n",
                  code, httpDuration);
  } else if (code >= 500) {
    Serial.printf("[NetWorker Heartbeat] ⚠️ Server Error: HTTP %d in %lu ms from Railway server\n",
                  code, httpDuration);
  } else if (code > 0) {
    Serial.printf("[NetWorker Heartbeat] ⚠️ Unexpected Status: HTTP %d in %lu ms\n",
                  code, httpDuration);
  } else {
    Serial.printf("[NetWorker Heartbeat] ❌ Transport Failure: Code %d (%s) in %lu ms\n",
                  code,
                  http.errorToString(code).c_str(),
                  httpDuration);
  }

  http.end();
  client.stop();

  lastCompletedNetOp = "HEARTBEAT";
  lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
  activeNetOp = "IDLE";

  return isSuccess;
}

// Direct HTTP dispatch for QR scan verification
void processQrScanHttp(const char* scannedToken, const char* room, uint32_t scanId = 0, unsigned long scanReceivedMs = 0, unsigned long enqueuedMs = 0, int8_t rssiAtScan = 0) {
  unsigned long workerStartMs = millis();
  unsigned long queueWaitMs = (enqueuedMs > 0) ? (workerStartMs - enqueuedMs) : 0;
  int8_t currentRssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;

  activeNetOp = "QR_SCAN";
  activeNetOpStartMs = workerStartMs;

  Serial.printf("[DIAG QR-Scan #%lu] Worker Dequeued: QueueWait=%lu ms | PrecedingOp=%s (%lu ms) | CurrentRSSI=%d dBm (ScanRSSI=%d dBm)\n",
                (unsigned long)scanId, queueWaitMs, lastCompletedNetOp, lastCompletedNetOpDurationMs,
                (int)currentRssi, (int)rssiAtScan);

  String line1 = "Scan Denied";
  String line2 = "Please Wait...";

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure();

    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setConnectTimeout(4000); // 4.0s connection timeout
    http.setTimeout(5000);        // 5.0s socket timeout
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    StaticJsonDocument<256> reqDoc;
    reqDoc["qrString"] = scannedToken;
    reqDoc["roomNumber"] = room;
    reqDoc["authMethod"] = "QR Code";
    reqDoc["authWindowMs"] = AUTH_WINDOW_MS;
    if (scanId > 0) {
      reqDoc["scanId"] = scanId;
    }

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);

    unsigned long httpStartMs = millis();
    int httpResponseCode = http.POST(jsonPayload);
    unsigned long httpEndMs = millis();
    unsigned long httpDurationMs = httpEndMs - httpStartMs;
    unsigned long totalElapsedMs = (scanReceivedMs > 0) ? (httpEndMs - scanReceivedMs) : (httpEndMs - workerStartMs);

    String response = http.getString();
    if (httpResponseCode > 0) {
      Serial.printf("[DIAG QR-Scan #%lu] HTTP Result: Status=%d | HttpDuration=%lu ms | TotalElapsed=%lu ms (QueueWait=%lu ms)\n",
                    (unsigned long)scanId, httpResponseCode, httpDurationMs, totalElapsedMs, queueWaitMs);
    } else {
      Serial.printf("[DIAG QR-Scan #%lu] ⚠️ Transport Failure: ErrorCode=%d (%s) | Connect/Socket Duration=%lu ms | TotalElapsed=%lu ms (QueueWait=%lu ms)\n",
                    (unsigned long)scanId, httpResponseCode, http.errorToString(httpResponseCode).c_str(),
                    httpDurationMs, totalElapsedMs, queueWaitMs);
    }

    StaticJsonDocument<1024> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);

    String verifiedName = "";
    if (!error) {
      if (resDoc.containsKey("lcdLine1")) line1 = resDoc["lcdLine1"].as<String>();
      if (resDoc.containsKey("lcdLine2")) line2 = resDoc["lcdLine2"].as<String>();

      // Extract verified user name strictly from successful server response
      if (httpResponseCode == 200) {
        if (resDoc.containsKey("name") && !resDoc["name"].isNull()) {
          verifiedName = resDoc["name"].as<String>();
        } else if (resDoc.containsKey("user") && resDoc["user"].is<JsonObject>() && resDoc["user"].containsKey("name") && !resDoc["user"]["name"].isNull()) {
          verifiedName = resDoc["user"]["name"].as<String>();
        } else if (resDoc.containsKey("userName") && !resDoc["userName"].isNull()) {
          verifiedName = resDoc["userName"].as<String>();
        } else if (resDoc.containsKey("lcdLine2") && !resDoc["lcdLine2"].isNull()) {
          String candidate = resDoc["lcdLine2"].as<String>();
          candidate.trim();
          if (!candidate.equalsIgnoreCase("TAKE YOUR KEY") &&
              !candidate.equalsIgnoreCase("PLEASE RETRY") &&
              !candidate.equalsIgnoreCase("SCAN LOCKED")) {
            verifiedName = candidate;
          }
        }
        verifiedName.trim();
      }
    } else {
      if (httpResponseCode == 404) {
        line1 = "Access Denied!";
        line2 = "Invalid QR Code";
      } else if (httpResponseCode < 0) {
        line1 = "System Busy";
        line2 = "Please Retry";
      }
    }

    bool isStillActive = false;
    portENTER_CRITICAL(&authMux);
    if (scanId == activeScanId && qrAuthState == QR_AUTH_VERIFYING) {
      isStillActive = true;
    }
    portEXIT_CRITICAL(&authMux);

    if (!isStillActive) {
      Serial.printf("[DIAG QR-Scan #%lu] Obsolete/stale response ignored (activeScanId=%lu, qrAuthState=%d)\n",
                    (unsigned long)scanId, (unsigned long)activeScanId, (int)qrAuthState);
      http.end();
      client.stop();
      lastCompletedNetOp = "QR_SCAN_STALE";
      lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
      activeNetOp = "IDLE";
      return;
    }

    if (httpResponseCode == 200) {
      portENTER_CRITICAL(&authMux);
      qrAuthState = QR_AUTH_GRANTED_AWAITING_TAKE;
      isAuthorized = true;
      authExpiresAt = millis() + AUTH_WINDOW_MS;
      lastDisplayedCountdown = -1;
      portEXIT_CRITICAL(&authMux);

      triggerBuzzer(80, 2);

      String grantLine1 = "ACCESS GRANTED  ";
      String grantLine2 = "TAKE YOUR KEY   ";
      if (verifiedName.length() > 0) {
        grantLine1 = "TAKE YOUR KEY   ";
        grantLine2 = (verifiedName.length() > 16) ? verifiedName.substring(0, 16) : verifiedName;
        Serial.printf("[DIAG QR-Scan #%lu] ✔ Access Granted to '%s'. Awaiting key take.\n",
                      (unsigned long)scanId, grantLine2.c_str());
      } else {
        Serial.printf("[DIAG QR-Scan #%lu] ✔ Access Granted (generic). Awaiting key take.\n",
                      (unsigned long)scanId);
      }

      safeLcdPrint(grantLine1, grantLine2);
      lcdRevertAt = millis() + QR_AUTH_DISPLAY_MS; // Keep "TAKE YOUR KEY" / verified user name visible for ~3.5s before countdown display takes over
    } else {
      portENTER_CRITICAL(&authMux);
      qrAuthState = QR_AUTH_IDLE;
      activeScanId = 0;
      isAuthorized = false;
      authExpiresAt = 0;
      portEXIT_CRITICAL(&authMux);

      if (httpResponseCode < 0) {
        line1 = "NETWORK ERROR   ";
        line2 = "PLEASE RETRY    ";
      }

      triggerBuzzer(250, 1);
      safeLcdPrint(line1, line2);
      lcdRevertAt = millis() + 2500;
    }
    http.end();
    client.stop();

    lastCompletedNetOp = "QR_SCAN";
    lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
    activeNetOp = "IDLE";
  } else {
    portENTER_CRITICAL(&authMux);
    if (scanId == activeScanId) {
      qrAuthState = QR_AUTH_IDLE;
      activeScanId = 0;
      isAuthorized = false;
      authExpiresAt = 0;
    }
    portEXIT_CRITICAL(&authMux);

    triggerBuzzer(250, 1);
    safeLcdPrint("Wi-Fi Error!", "Not Connected");
    lcdRevertAt = millis() + 2000;

    lastCompletedNetOp = "QR_SCAN_OFFLINE";
    lastCompletedNetOpDurationMs = millis() - activeNetOpStartMs;
    activeNetOp = "IDLE";
  }
}

// Background FreeRTOS Worker Task running on Core 0
void networkWorkerTask(void* pvParameters) {
  Serial.printf("[NetWorker] Task active on Core %d\n", xPortGetCoreID());

  unsigned long nextHeartbeatDueMs = millis();
  uint8_t heartbeatRetryCount = 0;
  const uint8_t MAX_HEARTBEAT_RETRIES = 3;
  const unsigned long HEARTBEAT_RETRY_DELAYS[3] = { 3000, 5000, 8000 };
  const unsigned long PENDING_SYNC_RETRY_DELAY_MS = 5000;

  unsigned long nextAlertRetryMs203 = millis();
  unsigned long nextAlertRetryMs204 = millis();
  unsigned long nextSlotRetryMs203 = millis();
  unsigned long nextSlotRetryMs204 = millis();
  uint8_t pendingSyncRoundRobin = 0;

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
            if (strcmp(msg.room, "203") == 0) nextSlotRetryMs203 = millis();
            if (strcmp(msg.room, "204") == 0) nextSlotRetryMs204 = millis();
          } else {
            if (strcmp(msg.room, "203") == 0) nextSlotRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
            if (strcmp(msg.room, "204") == 0) nextSlotRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          }
        } else if (msg.type == MSG_SECURITY_ALERT) {
          if (sendSecurityAlertHttp(msg.room, msg.strPayload, msg.eventId)) {
            portENTER_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0) alertNeedsSync203 = false;
            if (strcmp(msg.room, "204") == 0) alertNeedsSync204 = false;
            portEXIT_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0) nextAlertRetryMs203 = millis();
            if (strcmp(msg.room, "204") == 0) nextAlertRetryMs204 = millis();
          } else {
            portENTER_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0) {
              alertNeedsSync203 = true;
              strncpy(alertPayload203, msg.strPayload, sizeof(alertPayload203) - 1);
              strncpy(alertEventId203, msg.eventId, sizeof(alertEventId203) - 1);
            } else if (strcmp(msg.room, "204") == 0) {
              alertNeedsSync204 = true;
              strncpy(alertPayload204, msg.strPayload, sizeof(alertPayload204) - 1);
              strncpy(alertEventId204, msg.eventId, sizeof(alertEventId204) - 1);
            }
            portEXIT_CRITICAL(&stateMux);
            if (strcmp(msg.room, "203") == 0) nextAlertRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
            if (strcmp(msg.room, "204") == 0) nextAlertRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          }
        } else if (msg.type == MSG_QR_SCAN) {
          bool shouldProcess = false;
          portENTER_CRITICAL(&authMux);
          if (msg.scanId == activeScanId && qrAuthState == QR_AUTH_VERIFYING) {
            shouldProcess = true;
          }
          portEXIT_CRITICAL(&authMux);

          if (shouldProcess) {
            processQrScanHttp(msg.strPayload, msg.room, msg.scanId, msg.scanReceivedMs, msg.enqueuedMs, msg.rssiAtScan);
          } else {
            Serial.printf("[NetWorker] Dropped stale/superseded scan #%lu (activeScanId=%lu, qrAuthState=%d)\n",
                          (unsigned long)msg.scanId, (unsigned long)activeScanId, (int)qrAuthState);
          }
        }
      } else {
        // Wi-Fi offline: guarantee coalesced state retention
        if (msg.type == MSG_KEY_STATUS) {
          portENTER_CRITICAL(&stateMux);
          if (strcmp(msg.room, "203") == 0) slotNeedsSync203 = true;
          if (strcmp(msg.room, "204") == 0) slotNeedsSync204 = true;
          portEXIT_CRITICAL(&stateMux);
        } else if (msg.type == MSG_SECURITY_ALERT) {
          portENTER_CRITICAL(&stateMux);
          if (strcmp(msg.room, "203") == 0) {
            alertNeedsSync203 = true;
            strncpy(alertPayload203, msg.strPayload, sizeof(alertPayload203) - 1);
            strncpy(alertEventId203, msg.eventId, sizeof(alertEventId203) - 1);
          } else if (strcmp(msg.room, "204") == 0) {
            alertNeedsSync204 = true;
            strncpy(alertPayload204, msg.strPayload, sizeof(alertPayload204) - 1);
            strncpy(alertEventId204, msg.eventId, sizeof(alertEventId204) - 1);
          }
          portEXIT_CRITICAL(&stateMux);
        } else if (msg.type == MSG_QR_SCAN) {
          portENTER_CRITICAL(&authMux);
          if (msg.scanId == activeScanId) {
            qrAuthState = QR_AUTH_IDLE;
            activeScanId = 0;
            isAuthorized = false;
          }
          portEXIT_CRITICAL(&authMux);
          triggerBuzzer(250, 1);
          safeLcdPrint("Wi-Fi Error!", "Not Connected");
          lcdRevertAt = millis() + 2000;
        }
      }
    }

    // Coalesced pending state reconciliation when Wi-Fi is connected
    wl_status_t currentWifiStatus = WiFi.status();
    static wl_status_t lastRecordedWifi = WL_IDLE_STATUS;

    if (currentWifiStatus == WL_CONNECTED) {
      if (lastRecordedWifi != WL_CONNECTED) {
        // Reset retry backoffs upon link restoration so pending sync is attempted immediately
        nextAlertRetryMs203 = millis();
        nextAlertRetryMs204 = millis();
        nextSlotRetryMs203 = millis();
        nextSlotRetryMs204 = millis();
      }

      unsigned long nowMs = millis();
      bool needAlert203 = false;
      char alert203[32] = "";
      char eventId203[32] = "";
      bool needAlert204 = false;
      char alert204[32] = "";
      char eventId204[32] = "";
      bool need203 = false, target203 = true;
      bool need204 = false, target204 = true;

      portENTER_CRITICAL(&stateMux);
      needAlert203 = alertNeedsSync203;
      strncpy(alert203, alertPayload203, sizeof(alert203) - 1);
      strncpy(eventId203, alertEventId203, sizeof(eventId203) - 1);
      needAlert204 = alertNeedsSync204;
      strncpy(alert204, alertPayload204, sizeof(alert204) - 1);
      strncpy(eventId204, alertEventId204, sizeof(eventId204) - 1);
      need203 = slotNeedsSync203;
      target203 = slotTargetState203;
      need204 = slotNeedsSync204;
      target204 = slotTargetState204;
      portEXIT_CRITICAL(&stateMux);

      // Circular round-robin selection among the 4 pending sync operations
      // ensures fair service and prevents static priority starvation of lower-index items.
      int selectedSyncOp = -1;
      for (int i = 0; i < 4; i++) {
        int candidate = (pendingSyncRoundRobin + i) % 4;
        if (candidate == 0 && needAlert203 && ((int32_t)(nowMs - nextAlertRetryMs203) >= 0)) {
          selectedSyncOp = 0;
          break;
        } else if (candidate == 1 && needAlert204 && ((int32_t)(nowMs - nextAlertRetryMs204) >= 0)) {
          selectedSyncOp = 1;
          break;
        } else if (candidate == 2 && need203 && ((int32_t)(nowMs - nextSlotRetryMs203) >= 0)) {
          selectedSyncOp = 2;
          break;
        } else if (candidate == 3 && need204 && ((int32_t)(nowMs - nextSlotRetryMs204) >= 0)) {
          selectedSyncOp = 3;
          break;
        }
      }

      if (selectedSyncOp == 0) {
        pendingSyncRoundRobin = 1;
        if (sendSecurityAlertHttp("203", alert203, eventId203)) {
          portENTER_CRITICAL(&stateMux);
          alertNeedsSync203 = false;
          portEXIT_CRITICAL(&stateMux);
          nextAlertRetryMs203 = millis();
        } else {
          nextAlertRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Alert sync for 203 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      } else if (selectedSyncOp == 1) {
        pendingSyncRoundRobin = 2;
        if (sendSecurityAlertHttp("204", alert204, eventId204)) {
          portENTER_CRITICAL(&stateMux);
          alertNeedsSync204 = false;
          portEXIT_CRITICAL(&stateMux);
          nextAlertRetryMs204 = millis();
        } else {
          nextAlertRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Alert sync for 204 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      } else if (selectedSyncOp == 2) {
        pendingSyncRoundRobin = 3;
        if (sendKeyStatusHttp("203", target203)) {
          portENTER_CRITICAL(&stateMux);
          if (slotTargetState203 == target203) slotNeedsSync203 = false;
          portEXIT_CRITICAL(&stateMux);
          nextSlotRetryMs203 = millis();
        } else {
          nextSlotRetryMs203 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Slot sync for 203 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      } else if (selectedSyncOp == 3) {
        pendingSyncRoundRobin = 0;
        if (sendKeyStatusHttp("204", target204)) {
          portENTER_CRITICAL(&stateMux);
          if (slotTargetState204 == target204) slotNeedsSync204 = false;
          portEXIT_CRITICAL(&stateMux);
          nextSlotRetryMs204 = millis();
        } else {
          nextSlotRetryMs204 = millis() + PENDING_SYNC_RETRY_DELAY_MS;
          Serial.printf("[NetWorker] Slot sync for 204 failed. Retry scheduled in %lu ms\n", PENDING_SYNC_RETRY_DELAY_MS);
        }
      }

      // If link was just restored, announce presence after pending transition reconciliation!
      if (lastRecordedWifi != WL_CONNECTED) {
        Serial.println("[NetWorker] Wi-Fi link restored! Sending presence heartbeat after pending event sync...");
        heartbeatRetryCount = 0;
        bool hbOk = sendHeartbeatHttp();
        nextHeartbeatDueMs = millis() + (hbOk ? HEARTBEAT_INTERVAL : 3000);
      }

      // Check for higher priority network work before attempting periodic/retry heartbeats
      bool hasHigherPriorityWork = (netQueue != NULL && uxQueueMessagesWaiting(netQueue) > 0) ||
                                    (alertNeedsSync203 && ((int32_t)(millis() - nextAlertRetryMs203) >= 0)) ||
                                    (alertNeedsSync204 && ((int32_t)(millis() - nextAlertRetryMs204) >= 0)) ||
                                    (slotNeedsSync203 && ((int32_t)(millis() - nextSlotRetryMs203) >= 0)) ||
                                    (slotNeedsSync204 && ((int32_t)(millis() - nextSlotRetryMs204) >= 0));

      // Periodic or bounded retry heartbeat dispatch (wraparound-safe 32-bit signed difference).
      // Heartbeat deadlines must be honored: if a heartbeat is due, higher priority work may only
      // defer it up to MAX_HEARTBEAT_DEFERRAL_MS so that repeated sync failures or non-empty queues
      // cannot indefinitely starve heartbeats.
      const unsigned long MAX_HEARTBEAT_DEFERRAL_MS = 5000;
      bool heartbeatDue = ((int32_t)(millis() - nextHeartbeatDueMs) >= 0);
      bool heartbeatOverdue = ((int32_t)(millis() - (nextHeartbeatDueMs + MAX_HEARTBEAT_DEFERRAL_MS)) >= 0);

      if ((!hasHigherPriorityWork && heartbeatDue) || heartbeatOverdue) {
        bool hbOk = sendHeartbeatHttp();
        if (hbOk) {
          heartbeatRetryCount = 0;
          nextHeartbeatDueMs = millis() + HEARTBEAT_INTERVAL;
        } else {
          if (heartbeatRetryCount < MAX_HEARTBEAT_RETRIES) {
            unsigned long delayMs = HEARTBEAT_RETRY_DELAYS[heartbeatRetryCount];
            heartbeatRetryCount++;
            nextHeartbeatDueMs = millis() + delayMs;
            Serial.printf("[NetWorker Heartbeat] Retry #%u scheduled in %lu ms\n",
                          (unsigned int)heartbeatRetryCount, delayMs);
          } else {
            Serial.printf("[NetWorker Heartbeat] Max retries (%u) reached. Resuming nominal %lu ms interval.\n",
                          (unsigned int)MAX_HEARTBEAT_RETRIES, HEARTBEAT_INTERVAL);
            heartbeatRetryCount = 0;
            nextHeartbeatDueMs = millis() + HEARTBEAT_INTERVAL;
          }
        }
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

void dispatchSecurityAlertAsync(const char* room, const char* alertType, const char* eventId = NULL) {
  if (netQueue != NULL) {
    NetMessage msg;
    msg.type = MSG_SECURITY_ALERT;
    strncpy(msg.room, room, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = false;
    strncpy(msg.strPayload, alertType, sizeof(msg.strPayload) - 1);
    msg.strPayload[sizeof(msg.strPayload) - 1] = '\0';
    if (eventId && eventId[0] != '\0') {
      strncpy(msg.eventId, eventId, sizeof(msg.eventId) - 1);
      msg.eventId[sizeof(msg.eventId) - 1] = '\0';
    } else {
      msg.eventId[0] = '\0';
    }
    xQueueSend(netQueue, &msg, 0);
  }
}

void dispatchQrScanAsync(const String& scannedCode, unsigned long scanReceivedMs = 0, uint32_t scanId = 0) {
  if (netQueue != NULL) {
    if (scanId == 0) scanId = ++globalScanCounter;
    unsigned long enqueuedMs = millis();
    if (scanReceivedMs == 0) scanReceivedMs = enqueuedMs;

    UBaseType_t queueDepthBefore = uxQueueMessagesWaiting(netQueue);
    int8_t rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : 0;
    const char* inFlightOp = activeNetOp;
    unsigned long inFlightDur = (strcmp(inFlightOp, "IDLE") != 0) ? (millis() - activeNetOpStartMs) : 0;

    NetMessage msg;
    msg.type = MSG_QR_SCAN;
    strncpy(msg.room, defaultScanRoom, sizeof(msg.room) - 1);
    msg.room[sizeof(msg.room) - 1] = '\0';
    msg.keyPresent = false;
    strncpy(msg.strPayload, scannedCode.c_str(), sizeof(msg.strPayload) - 1);
    msg.strPayload[sizeof(msg.strPayload) - 1] = '\0';
    msg.scanReceivedMs = scanReceivedMs;
    msg.enqueuedMs = enqueuedMs;
    msg.scanId = scanId;
    msg.rssiAtScan = rssi;

    BaseType_t sent = xQueueSend(netQueue, &msg, 0); // 0 timeout: non-blocking immediate return
    if (sent == pdPASS) {
      Serial.printf("[DIAG QR-Scan #%lu] Enqueued | QueueDepth=%u/%d | RSSI=%d dBm | InFlightOp=%s (%lu ms)\n",
                    (unsigned long)scanId, (unsigned int)(queueDepthBefore + 1), NET_QUEUE_LEN, (int)rssi,
                    inFlightOp, inFlightDur);
    } else {
      Serial.printf("[DIAG QR-Scan #%lu] ❌ Queue Full! Dropped scan | QueueDepth=%u/%d | RSSI=%d dBm | InFlightOp=%s (%lu ms)\n",
                    (unsigned long)scanId, (unsigned int)queueDepthBefore, NET_QUEUE_LEN, (int)rssi,
                    inFlightOp, inFlightDur);
      portENTER_CRITICAL(&authMux);
      if (activeScanId == scanId && qrAuthState == QR_AUTH_VERIFYING) {
        qrAuthState = QR_AUTH_IDLE;
        activeScanId = 0;
      }
      portEXIT_CRITICAL(&authMux);
      safeLcdPrint("Queue Full!     ", "Please Retry    ");
      lcdRevertAt = millis() + 2000;
    }
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
          qrAuthState = QR_AUTH_IDLE;
          activeScanId = 0;
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
          Serial.printf("🚨 UNAUTHORIZED KEY REMOVAL! Key %s removed without scanning QR!\n", slotRoom.c_str());
          isUnauth = true;
          unauthAlarmStarted = millis(); // Start audible alarm timer

          // Update local slot tracking for heartbeat telemetry without queuing redundant Key Taken
          portENTER_CRITICAL(&stateMux);
          if (slotRoom == "203") {
            slotTargetState203 = false;
            slotNeedsSync203 = false;
            alertNeedsSync203 = true;
            strncpy(alertPayload203, "Unauthorized Removal", sizeof(alertPayload203) - 1);
            snprintf(alertEventId203, sizeof(alertEventId203), "203-%lu", millis());
          } else if (slotRoom == "204") {
            slotTargetState204 = false;
            slotNeedsSync204 = false;
            alertNeedsSync204 = true;
            strncpy(alertPayload204, "Unauthorized Removal", sizeof(alertPayload204) - 1);
            snprintf(alertEventId204, sizeof(alertEventId204), "204-%lu", millis());
          }
          portEXIT_CRITICAL(&stateMux);

          const char* curEvtId = (slotRoom == "203") ? alertEventId203 : alertEventId204;
          dispatchSecurityAlertAsync(slotRoom.c_str(), "Unauthorized Removal", curEvtId);
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

  // 1. GM65 Scanner Detection with state machine and lock
  String scannedCode = readScannedCode();
  if (scannedCode.length() > 0) {
    unsigned long scanCompleteMs = millis();

    QrAuthState curState;
    uint32_t curScanId;
    bool curAuth;
    unsigned long curAuthExpires;
    portENTER_CRITICAL(&authMux);
    curState = qrAuthState;
    curScanId = activeScanId;
    curAuth = isAuthorized;
    curAuthExpires = authExpiresAt;
    portEXIT_CRITICAL(&authMux);

    if (curState == QR_AUTH_VERIFYING) {
      // Discard repeated scan while first scan is verifying
      Serial.printf("[GM65] Scan ignored: Verification already in progress (Scan #%lu)\n", (unsigned long)curScanId);
      clearSerialBuffer();
    } else if (curState == QR_AUTH_GRANTED_AWAITING_TAKE || curAuth) {
      // Discard competing scan while authorization is awaiting physical key withdrawal
      Serial.printf("[GM65] Scan ignored: Authorization active, awaiting physical key withdrawal (Expires in %lu ms)\n",
                    (curAuthExpires > millis()) ? (curAuthExpires - millis()) : 0);
      clearSerialBuffer();

      static unsigned long lastLockedMsgMs = 0;
      if (millis() - lastLockedMsgMs >= 2000) {
        lastLockedMsgMs = millis();
        safeLcdPrint("TAKE YOUR KEY   ", "SCAN LOCKED     ");
        lcdRevertAt = millis() + 1500;
      }
    } else {
      // Idle: Atomically claim the authorization lock for this scan
      uint32_t newScanId = 0;
      portENTER_CRITICAL(&authMux);
      if (qrAuthState == QR_AUTH_IDLE && !isAuthorized) {
        newScanId = ++globalScanCounter;
        activeScanId = newScanId;
        qrAuthState = QR_AUTH_VERIFYING;
        verifyingStartedMs = millis();
      }
      portEXIT_CRITICAL(&authMux);

      if (newScanId > 0) {
        buzzerOff();
        safeLcdPrint("VERIFYING QR... ", "PLEASE WAIT...  ");
        dispatchQrScanAsync(scannedCode, scanCompleteMs, newScanId);
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
          qrAuthState = QR_AUTH_IDLE;
          activeScanId = 0;
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
    } else if (!isAuthorized && qrAuthState == QR_AUTH_IDLE) {
      showReadyScreen();
    }
  }

  // 5. Verification Watchdog Timeout (prevents permanent lock if network worker is blocked)
  if (qrAuthState == QR_AUTH_VERIFYING && (millis() - verifyingStartedMs >= QR_VERIFY_TIMEOUT_MS)) {
    portENTER_CRITICAL(&authMux);
    qrAuthState = QR_AUTH_IDLE;
    activeScanId = 0;
    isAuthorized = false;
    portEXIT_CRITICAL(&authMux);

    triggerBuzzer(250, 1);
    safeLcdPrint("Network Timeout ", "Please Retry    ");
    lcdRevertAt = millis() + 2000;
  }

  // 6. Live Countdown Window Handling (when authorized and no alarm active)
  if (!alarmActive && (isAuthorized || qrAuthState == QR_AUTH_GRANTED_AWAITING_TAKE)) {
    if (millis() >= authExpiresAt) {
      // Authorization window expired without key withdrawal
      portENTER_CRITICAL(&authMux);
      isAuthorized = false;
      authExpiresAt = 0;
      qrAuthState = QR_AUTH_IDLE;
      activeScanId = 0;
      portEXIT_CRITICAL(&authMux);

      triggerBuzzer(180, 1);
      safeLcdPrint("Session Expired ", "Scan QR Again   ");
      lcdRevertAt = millis() + 1500;
    } else if (lcdRevertAt > 0 && millis() < lcdRevertAt) {
      // Hold authorization result screen ("ACCESS GRANTED" + user name) until display timer expires
    } else {
      int secLeft = (int)((authExpiresAt - millis() + 999) / 1000);
      if (secLeft != lastDisplayedCountdown) {
        lastDisplayedCountdown = secLeft;
        String cdText = "Take Key: " + String(secLeft) + "s   ";
        safeLcdPrint("Access Granted! ", cdText);
      }
    }
  }

  delay(10);
}
