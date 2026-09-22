#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// Global LCD placeholder (auto-detected I2C address)
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdDetected = false;

// Wi-Fi Credentials
const char* ssid = "BLK 26 LT POGI - 2.4Ghz";
const char* password = "POOHLIEPOGI";

// Server Configuration
const char* serverUrl = "http://192.168.100.59:3000/api/occupancy/log";
const char* heartbeatUrl = "http://192.168.100.59:3000/api/occupancy/heartbeat";
const char* defaultScanRoom = "203"; 

// Device Authentication Credential
// Unique 256-bit bearer token provisioned for this physical ESP32 device.
const char* deviceToken = "labsync-esp32-keybox-token-2026"; 

// Key Slots Configuration
#define KEY_PIN_203 32 // D32 -> Slot 203 (Expects Key 203: ~1800 ADC)
#define KEY_PIN_204 33 // D33 -> Slot 204 (Expects Key 204: ~0 ADC)

enum KeyType {
  KEY_NONE = 0,   // Empty Slot (> 3000)
  KEY_204 = 1,    // 0 Ohm Direct Wire Key (0 - 500)
  KEY_203 = 2     // 10k Ohm Resistor Key (1000 - 2600)
};

KeyType lastSlotState203 = KEY_NONE;
KeyType lastSlotState204 = KEY_NONE;

// Authorization Window State (User must scan QR before key release)
bool isAuthorized = false;
unsigned long authExpiresAt = 0;
const unsigned long AUTH_WINDOW_MS = 15000; // 15-second key retrieval countdown
String authorizedUserName = "";
int lastDisplayedCountdown = -1;

// Periodic Heartbeat Timer
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000; // 10 seconds (prevents network socket congestion)

// GM65 Scanner Pins
#define GM65_RX_PIN 17 
#define GM65_TX_PIN 16 

// I2C Pins for LCD
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

// Buzzer Configuration (Active Low-Level Trigger)
#define BUZZER_PIN 25 

void buzzerOn() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // LOW = Beep ON
}

void buzzerOff() {
  pinMode(BUZZER_PIN, INPUT); // High-Z float = Beep OFF
}

void triggerBuzzer(int durationMs = 100, int count = 1) {
  for (int i = 0; i < count; i++) {
    buzzerOn();
    delay(durationMs);
    buzzerOff();
    if (i < count - 1) delay(50);
  }
}

void showReadyScreen() {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("    LabSync");
    lcd.setCursor(0, 1);
    lcd.print(" Ready to Scan!");
  }
}

void clearSerialBuffer() {
  delay(20);
  while (Serial2.available() > 0) {
    Serial2.read();
    delay(1);
  }
}

// Robust read helper for GM65 scanner
String readScannedCode() {
  if (Serial2.available() > 0) {
    String scannedCode = "";
    unsigned long startTime = millis();
    unsigned long lastCharTime = millis();
    
    while ((millis() - startTime < 1000) && (millis() - lastCharTime < 80)) {
      while (Serial2.available() > 0) {
        char c = Serial2.read();
        lastCharTime = millis();
        if (c == '\r' || c == '\n') {
          if (scannedCode.length() > 0) {
            delay(15);
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
      delay(2);
    }
    
    scannedCode.trim();
    if (scannedCode.length() > 0) {
      Serial.println("[GM65] Scanned barcode (idle): " + scannedCode);
    }
    return scannedCode;
  }
  return "";
}

// Forward declaration
KeyType detectKeyType(int pin);

// Lightweight 10-second Heartbeat with physical key slot presence
void sendHeartbeatToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, heartbeatUrl);
    http.setReuse(false);
    http.setTimeout(2500); // 2500ms timeout for network stability
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    bool key203Present = (detectKeyType(KEY_PIN_203) != KEY_NONE);
    bool key204Present = (detectKeyType(KEY_PIN_204) != KEY_NONE);

    String jsonPayload = "{\"deviceId\":\"ESP32-KeyBox\",\"rooms\":[\"203\",\"204\"],\"slots\":{\"203\":" +
                         String(key203Present ? "true" : "false") + ",\"204\":" +
                         String(key204Present ? "true" : "false") + "}}";
    int code = http.POST(jsonPayload);
    if (code > 0) {
      Serial.printf("[IoT Heartbeat] Sent successfully with slots (203: %s, 204: %s). Code: %d\n",
                    key203Present ? "Present" : "Absent",
                    key204Present ? "Present" : "Absent",
                    code);
    } else {
      Serial.printf("[IoT Heartbeat] Post failed: %d (%s)\n", code, http.errorToString(code).c_str());
    }
    http.end();
    client.stop();
  }
}

// Stable ADC reading with 20-sample averaging
KeyType detectKeyType(int pin) {
  long sum = 0;
  for (int i = 0; i < 20; i++) {
    sum += analogRead(pin);
    delayMicroseconds(100);
  }
  int avgReading = sum / 20;

  if (avgReading >= 3000) {
    return KEY_NONE;
  } else if (avgReading < 500) {
    return KEY_204;
  } else if (avgReading >= 1000 && avgReading <= 2600) {
    return KEY_203;
  }

  return KEY_NONE;
}

// Send security alarm events (Unauthorized Removal or Wrong Slot) to server
void sendSecurityAlertToServer(String room, String alertType) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setTimeout(2500);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    StaticJsonDocument<256> reqDoc;
    reqDoc["keyEvent"] = alertType;
    reqDoc["roomNumber"] = room;

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);

    http.POST(jsonPayload);
    http.end();
    client.stop();
  }
}

// Send key presence status transitions to server
void sendKeyStatusToServer(String room, bool present) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setTimeout(2500);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    String statusStr = present ? "Key Returned" : "Key Taken";
    String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + room + "\"}";
    
    http.POST(jsonPayload);
    http.end();
    client.stop();
  }
}

// Alarm loop when a key is put in the wrong hole
void handleWrongSlotAlarm(int pin, String expectedSlot, String insertedKey) {
  Serial.println("❌ WRONG KEY SLOT! Key " + insertedKey + " inserted into Slot " + expectedSlot);
  
  sendSecurityAlertToServer(expectedSlot, "Wrong Key Slot");

  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WRONG KEY SLOT!");
    lcd.setCursor(0, 1);
    lcd.print("Insert in " + insertedKey + "!");
  }

  while (detectKeyType(pin) != KEY_NONE) {
    buzzerOn();
    delay(80);
    buzzerOff();
    delay(50);
  }

  buzzerOff();
  Serial.println("Wrong key removed. System ready.");
  triggerBuzzer(60, 1);
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Key Removed");
    lcd.setCursor(0, 1);
    lcd.print("Insert in " + insertedKey + "!");
  }
  delay(1200);
  clearSerialBuffer();
  showReadyScreen();
}

// Forward declaration
bool sendScanToServer(String scannedToken);

// Alarm loop when a key is removed without scanning QR code first
void handleUnauthorizedRemovalAlarm(int pin, KeyType &lastState, String slotRoom, KeyType expectedKey) {
  Serial.println("🚨 UNAUTHORIZED KEY REMOVAL! Key " + slotRoom + " removed without scanning QR!");

  sendSecurityAlertToServer(slotRoom, "Unauthorized Removal");

  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("! UNAUTHORIZED !");
    lcd.setCursor(0, 1);
    lcd.print("RETURN KEY " + slotRoom + "!");
  }

  bool resolved = false;

  while (!resolved) {
    // 1. Check if key is returned to slot
    KeyType current = detectKeyType(pin);
    if (current == expectedKey) {
      // Key returned to correct slot!
      buzzerOff();
      resolved = true;
      lastState = expectedKey;
      triggerBuzzer(80, 2);
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Key Returned");
        lcd.setCursor(0, 1);
        lcd.print("Alarm Cleared");
      }
      sendKeyStatusToServer(slotRoom, true);
      delay(1200);
      clearSerialBuffer();
      showReadyScreen();
      return;
    } else if (current != KEY_NONE && current != expectedKey) {
      // Key was placed in the wrong slot
      buzzerOff();
      String insertedKeyName = (current == KEY_203) ? "203" : "204";
      handleWrongSlotAlarm(pin, slotRoom, insertedKeyName);
      lastState = KEY_NONE;
      return;
    }

    // 2. Check if user scans their QR code during the alarm to retroactively authorize
    String scanCode = readScannedCode();
    if (scanCode.length() > 0) {
      buzzerOff();
      if (sendScanToServer(scanCode)) {
        // Valid QR badge! Authorize the key that was taken
        resolved = true;
        isAuthorized = false; // consume authorization
        lastState = KEY_NONE;
        triggerBuzzer(80, 2);
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(slotRoom + " Key Taken");
          lcd.setCursor(0, 1);
          lcd.print("Room Active");
        }
        sendKeyStatusToServer(slotRoom, false);
        delay(1200);
        clearSerialBuffer();
        showReadyScreen();
        return;
      } else {
        // Re-display warning if scan was invalid
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("! UNAUTHORIZED !");
          lcd.setCursor(0, 1);
          lcd.print("RETURN KEY " + slotRoom + "!");
        }
      }
    }

    // 3. Continuous alarm cadence (80ms ON, 50ms OFF)
    buzzerOn();
    delay(80);
    buzzerOff();
    delay(50);
  }
}

// Scan verification handler (returns true if access granted)
bool sendScanToServer(String scannedToken) {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Verifying QR...");
    lcd.setCursor(0, 1);
    lcd.print("Please wait...");
  }

  bool success = false;
  String line1 = "Scan Denied";
  String line2 = "Please Wait...";

  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setTimeout(4000); // 4000ms timeout for reliable communication under rapid requests
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    StaticJsonDocument<256> reqDoc;
    reqDoc["qrString"] = scannedToken;
    reqDoc["roomNumber"] = defaultScanRoom;
    reqDoc["authMethod"] = "QR Code";

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);
    
    int httpResponseCode = http.POST(jsonPayload);
    String response = http.getString();
    Serial.printf("[IoT] Scan POST status: %d, err: %s, response: %s\n", 
                  httpResponseCode, http.errorToString(httpResponseCode).c_str(), response.c_str());

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
      success = true;
      triggerBuzzer(80, 2); 
      isAuthorized = true;
      authExpiresAt = millis() + AUTH_WINDOW_MS;
      authorizedUserName = line2;
      lastDisplayedCountdown = -1;

      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
      delay(1200);
    } else {
      triggerBuzzer(300, 1); 
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
      delay(3500); // Extended to 3.5s so user has plenty of time to read both lines comfortably
      clearSerialBuffer();
      showReadyScreen();
    }
    http.end();
    client.stop();
  } else {
    triggerBuzzer(300, 1);
    if (lcdDetected) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Wi-Fi Error!");
      lcd.setCursor(0, 1);
      lcd.print("Not Connected");
    }
    delay(2000);
    clearSerialBuffer();
    showReadyScreen();
  }

  return success;
}

// Key slot transition monitor
void handleKeySlot(int pin, KeyType &lastState, String slotRoom, KeyType expectedKey) {
  KeyType currentState = detectKeyType(pin);
  
  if (currentState != lastState) {
    delay(100); // 100ms debounce
    KeyType verifyState = detectKeyType(pin);
    
    if (currentState == verifyState) {
      // 1. Wrong Key Inserted -> Sound Alarm
      if (verifyState != KEY_NONE && verifyState != expectedKey) {
        String insertedKeyName = (verifyState == KEY_203) ? "203" : "204";
        handleWrongSlotAlarm(pin, slotRoom, insertedKeyName);
        lastState = KEY_NONE;
        return;
      }

      // 2. Correct Key Returned
      if (verifyState == expectedKey) {
        lastState = verifyState;
        triggerBuzzer(80, 2);
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(slotRoom + " Key Return");
          lcd.setCursor(0, 1);
          lcd.print("Room Secured");
        }
        sendKeyStatusToServer(slotRoom, true);
        delay(1200);
        clearSerialBuffer();
        showReadyScreen();
        return;
      } 

      // 3. Key Taken
      else if (verifyState == KEY_NONE) {
        if (isAuthorized) {
          // AUTHORIZED KEY RETRIEVAL!
          isAuthorized = false; // consume authorization
          lastState = verifyState;
          triggerBuzzer(80, 2);
          if (lcdDetected) {
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print(slotRoom + " Key Taken");
            lcd.setCursor(0, 1);
            lcd.print("Room Active");
          }
          sendKeyStatusToServer(slotRoom, false);
          delay(1200);
          clearSerialBuffer();
          showReadyScreen();
          return;
        } else {
          // UNAUTHORIZED KEY REMOVAL -> Sound Alarm!
          handleUnauthorizedRemovalAlarm(pin, lastState, slotRoom, expectedKey);
          lastState = KEY_NONE;
          return;
        }
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- LabSync Device Booting ---");

  buzzerOff();

  analogSetPinAttenuation(KEY_PIN_203, ADC_11db);
  analogSetPinAttenuation(KEY_PIN_204, ADC_11db);
  analogReadResolution(12);
  delay(100);

  lastSlotState203 = detectKeyType(KEY_PIN_203);
  lastSlotState204 = detectKeyType(KEY_PIN_204);

  // Initialize LCD
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  byte count = 0;
  byte foundAddress = 0;

  for (byte i = 8; i < 120; i++) {
    Wire.beginTransmission(i);
    if (Wire.endTransmission() == 0) {
      foundAddress = i;
      count++;
    }
  }

  if (count > 0 && foundAddress != 0) {
    lcd = LiquidCrystal_I2C(foundAddress, 16, 2);
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting to");
    lcd.setCursor(0, 1);
    lcd.print("Wi-Fi...");
    lcdDetected = true;
  }

  // Initialize GM65 Scanner
  Serial2.begin(9600, SERIAL_8N1, GM65_RX_PIN, GM65_TX_PIN);
  clearSerialBuffer();

  // Connect Wi-Fi
  WiFi.begin(ssid, password);
  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 30) {
    delay(400);
    Serial.print(".");
    wifiTimeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to Wi-Fi!");
    triggerBuzzer(100, 1);
    lastHeartbeatTime = millis();
    sendHeartbeatToServer(); // Immediately announce online presence on boot!
  }

  if (lcdDetected) {
    showReadyScreen();
  }
}

// Track Wi-Fi status transitions for 0ms instant connect/reconnect announcement
wl_status_t lastWifiStatus = WL_IDLE_STATUS;

void loop() {
  // 0. Wi-Fi Auto-Reconnect Guard & Instant Connect Trigger
  wl_status_t currentWifiStatus = WiFi.status();

  if (currentWifiStatus != WL_CONNECTED) {
    static unsigned long lastWifiReconnectAttempt = 0;
    if (millis() - lastWifiReconnectAttempt > 10000) {
      lastWifiReconnectAttempt = millis();
      Serial.println("[IoT] Wi-Fi disconnected! Reconnecting...");
      WiFi.reconnect();
    }
  } else if (lastWifiStatus != WL_CONNECTED) {
    // Instant event trigger: Fired the exact millisecond Wi-Fi connects or reconnects!
    Serial.println("[IoT] Wi-Fi connected! Firing immediate presence heartbeat...");
    lastHeartbeatTime = millis();
    sendHeartbeatToServer();
  }
  lastWifiStatus = currentWifiStatus;

  // 1. GM65 Scanner Detection with anti-spam cooldown
  static unsigned long lastScanTime = 0;
  String scannedCode = readScannedCode();
  if (scannedCode.length() > 0) {
    if (millis() - lastScanTime >= 1500) {
      lastScanTime = millis();
      sendScanToServer(scannedCode);
      lastScanTime = millis();
      clearSerialBuffer();
    } else {
      clearSerialBuffer();
    }
  }

  // 2. Live Countdown Window Handling (when authorized)
  if (isAuthorized) {
    if (millis() < authExpiresAt) {
      int secLeft = (int)((authExpiresAt - millis() + 999) / 1000);
      if (secLeft != lastDisplayedCountdown) {
        lastDisplayedCountdown = secLeft;
        if (lcdDetected) {
          lcd.setCursor(0, 0);
          lcd.print("Access Granted! ");
          lcd.setCursor(0, 1);
          String cdText = "Take Key: " + String(secLeft) + "s   ";
          lcd.print(cdText.substring(0, 16));
        }
      }
    } else {
      // Authorization window expired without key withdrawal
      isAuthorized = false;
      triggerBuzzer(200, 1);
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Session Expired ");
        lcd.setCursor(0, 1);
        lcd.print("Scan QR Again   ");
      }
      delay(1200);
      clearSerialBuffer();
      showReadyScreen();
    }
  }

  // 3. Key Monitoring
  handleKeySlot(KEY_PIN_203, lastSlotState203, "203", KEY_203);
  handleKeySlot(KEY_PIN_204, lastSlotState204, "204", KEY_204);

  // 4. Periodic 10-second Heartbeat (only when idle, avoids colliding with QR scan or authorization)
  if (!isAuthorized && millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    sendHeartbeatToServer();
  }

  delay(20);
}
