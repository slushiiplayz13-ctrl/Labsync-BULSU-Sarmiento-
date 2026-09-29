#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// ==============================================================
// LabSync IoT Key Dock Firmware - High Performance & Multi-Slot
// Bulacan State University – Sarmiento Campus
// ==============================================================

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
const char* deviceToken = "labsync-esp32-keybox-token-2026"; 

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

// Authorization Window State (User must scan QR before key release)
bool isAuthorized = false;
unsigned long authExpiresAt = 0;
const unsigned long AUTH_WINDOW_MS = 15000; // 15-second key retrieval countdown
String authorizedUserName = "";
int lastDisplayedCountdown = -1;

// Periodic Heartbeat Timer
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 10000; // 10 seconds

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

void triggerBuzzer(int durationMs = 80, int count = 1) {
  for (int i = 0; i < count; i++) {
    buzzerOn();
    delay(durationMs);
    buzzerOff();
    if (i < count - 1) delay(40);
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

void showUnauthorizedScreen() {
  if (!lcdDetected) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("! UNAUTHORIZED !");
  lcd.setCursor(0, 1);
  if (isUnauthorized203 && isUnauthorized204) {
    lcd.print("RETURN 203 & 204");
  } else if (isUnauthorized203) {
    lcd.print("RETURN KEY 203! ");
  } else if (isUnauthorized204) {
    lcd.print("RETURN KEY 204! ");
  }
}

void showWrongKeyScreen() {
  if (!lcdDetected) return;
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WRONG KEY SLOT!");
  lcd.setCursor(0, 1);
  if (isWrongKey203) lcd.print("Slot 203 Wrong! ");
  else if (isWrongKey204) lcd.print("Slot 204 Wrong! ");
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

// Send key presence status transitions to server
void sendKeyStatusToServer(String room, bool present) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setTimeout(1500); // 1.5s timeout: snappy and responsive
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    String statusStr = present ? "Key Returned" : "Key Taken";
    String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + room + "\"}";
    
    int code = http.POST(jsonPayload);
    Serial.printf("[IoT HTTP] %s for Room %s: Status %d\n", statusStr.c_str(), room.c_str(), code);
    http.end();
    client.stop();
  }
}

// Send security alarm events (Unauthorized Removal or Wrong Slot) to server
void sendSecurityAlertToServer(String room, String alertType) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, serverUrl);
    http.setReuse(false);
    http.setTimeout(1500);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", String("Bearer ") + deviceToken);
    http.addHeader("Connection", "close");

    StaticJsonDocument<256> reqDoc;
    reqDoc["keyEvent"] = alertType;
    reqDoc["roomNumber"] = room;

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);

    int code = http.POST(jsonPayload);
    Serial.printf("[IoT HTTP Alert] %s for Room %s: Status %d\n", alertType.c_str(), room.c_str(), code);
    http.end();
    client.stop();
  }
}

// Periodic Heartbeat with physical key slot presence
void sendHeartbeatToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, heartbeatUrl);
    http.setReuse(false);
    http.setTimeout(1500);
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
      Serial.printf("[IoT Heartbeat] Sent (203: %s, 204: %s). Code: %d\n",
                    key203Present ? "Present" : "Absent",
                    key204Present ? "Present" : "Absent",
                    code);
    }
    http.end();
    client.stop();
  }
}

// Non-blocking Key slot transition monitor (Monitors each slot independently without blocking the loop)
void handleKeySlot(int pin, KeyType &lastState, String slotRoom, KeyType expectedKey, bool &isUnauth, bool &isWrong) {
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
        String insertedKeyName = (verifyState == KEY_203) ? "203" : "204";
        Serial.printf("❌ WRONG KEY SLOT! Key %s inserted into Slot %s\n", insertedKeyName.c_str(), slotRoom.c_str());
        sendSecurityAlertToServer(slotRoom, "Wrong Key Slot");
        showWrongKeyScreen();
        return;
      }

      // 2. Correct Key Returned
      if (verifyState == expectedKey) {
        bool wasUnauth = isUnauth;
        isUnauth = false;
        isWrong = false;

        triggerBuzzer(80, 2);
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(slotRoom + " Key Return");
          lcd.setCursor(0, 1);
          lcd.print(wasUnauth ? "Alarm Cleared " : "Room Secured  ");
        }
        sendKeyStatusToServer(slotRoom, true);
        delay(1000);
        clearSerialBuffer();

        // If the other slot is still unauthorized, show its warning; otherwise return to ready screen
        if (isUnauthorized203 || isUnauthorized204) {
          showUnauthorizedScreen();
        } else if (isWrongKey203 || isWrongKey204) {
          showWrongKeyScreen();
        } else {
          showReadyScreen();
        }
        return;
      } 

      // 3. Key Taken (Went to KEY_NONE)
      else if (verifyState == KEY_NONE) {
        // If it was just a wrong key being removed
        if (isWrong) {
          isWrong = false;
          triggerBuzzer(60, 1);
          if (lcdDetected) {
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print("Key Removed");
            lcd.setCursor(0, 1);
            lcd.print("System Ready");
          }
          delay(800);
          clearSerialBuffer();
          if (isUnauthorized203 || isUnauthorized204) showUnauthorizedScreen();
          else showReadyScreen();
          return;
        }

        if (isAuthorized) {
          // Authorized key withdrawal
          isAuthorized = false; // consume authorization
          isUnauth = false;
          triggerBuzzer(80, 2);
          if (lcdDetected) {
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print(slotRoom + " Key Taken");
            lcd.setCursor(0, 1);
            lcd.print("Room Active");
          }
          sendKeyStatusToServer(slotRoom, false);
          delay(1000);
          clearSerialBuffer();
          showReadyScreen();
          return;
        } else {
          // UNAUTHORIZED KEY REMOVAL!
          // Flags this specific slot as unauthorized and notifies the server immediately!
          // NEVER blocks loop(): other slots will continue being monitored concurrently!
          isUnauth = true;
          Serial.printf("🚨 UNAUTHORIZED KEY REMOVAL! Key %s removed without scanning QR!\n", slotRoom.c_str());
          sendSecurityAlertToServer(slotRoom, "Unauthorized Removal");
          showUnauthorizedScreen();
          return;
        }
      }
    }
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
    http.setTimeout(3500); // 3.5s timeout
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
      delay(800); // Brief 800ms display so user sees confirmation, then countdown begins
    } else {
      triggerBuzzer(250, 1); 
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
      delay(2500);
      clearSerialBuffer();
      showReadyScreen();
    }
    http.end();
    client.stop();
  } else {
    triggerBuzzer(250, 1);
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

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n--- LabSync Device Booting ---");

  buzzerOff();

  analogSetPinAttenuation(KEY_PIN_203, ADC_11db);
  analogSetPinAttenuation(KEY_PIN_204, ADC_11db);
  analogReadResolution(12);
  delay(50);

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
    delay(300);
    Serial.print(".");
    wifiTimeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to Wi-Fi!");
    triggerBuzzer(80, 1);
    lastHeartbeatTime = millis();
    sendHeartbeatToServer(); // Immediately announce online presence on boot
  }

  if (lcdDetected) {
    showReadyScreen();
  }
}

// Track Wi-Fi status transitions for 0ms instant connect/reconnect announcement
wl_status_t lastWifiStatus = WL_IDLE_STATUS;

void loop() {
  bool alarmActive = (isUnauthorized203 || isUnauthorized204 || isWrongKey203 || isWrongKey204);

  // 0. Wi-Fi Auto-Reconnect Guard
  wl_status_t currentWifiStatus = WiFi.status();
  if (currentWifiStatus != WL_CONNECTED) {
    static unsigned long lastWifiReconnectAttempt = 0;
    if (millis() - lastWifiReconnectAttempt > 10000) {
      lastWifiReconnectAttempt = millis();
      Serial.println("[IoT] Wi-Fi disconnected! Reconnecting...");
      WiFi.reconnect();
    }
  } else if (lastWifiStatus != WL_CONNECTED) {
    Serial.println("[IoT] Wi-Fi connected! Firing presence heartbeat...");
    lastHeartbeatTime = millis();
    sendHeartbeatToServer();
  }
  lastWifiStatus = currentWifiStatus;

  // 1. GM65 Scanner Detection with anti-spam cooldown
  static unsigned long lastScanTime = 0;
  String scannedCode = readScannedCode();
  if (scannedCode.length() > 0) {
    if (millis() - lastScanTime >= 1200) {
      lastScanTime = millis();
      buzzerOff(); // Mute buzzer while scanning

      bool scanSuccess = sendScanToServer(scannedCode);
      lastScanTime = millis();
      clearSerialBuffer();

      if (scanSuccess && (isUnauthorized203 || isUnauthorized204)) {
        // Retroactively authorize removed key(s)
        if (isUnauthorized204 && !isUnauthorized203) {
          isUnauthorized204 = false;
          sendKeyStatusToServer("204", false);
        } else if (isUnauthorized203 && !isUnauthorized204) {
          isUnauthorized203 = false;
          sendKeyStatusToServer("203", false);
        } else if (isUnauthorized203 && isUnauthorized204) {
          isUnauthorized204 = false;
          isUnauthorized203 = false;
          sendKeyStatusToServer("204", false);
          sendKeyStatusToServer("203", false);
        }
        isAuthorized = false;
        buzzerOff();
        triggerBuzzer(80, 2);
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Access Granted! ");
          lcd.setCursor(0, 1);
          lcd.print("Key Authorized  ");
        }
        delay(1200);
        clearSerialBuffer();
        showReadyScreen();
      }
    } else {
      clearSerialBuffer();
    }
  }

  // 2. Multi-Slot Key Monitoring: BOTH slots are checked on every iteration!
  handleKeySlot(KEY_PIN_203, lastSlotState203, "203", KEY_203, isUnauthorized203, isWrongKey203);
  handleKeySlot(KEY_PIN_204, lastSlotState204, "204", KEY_204, isUnauthorized204, isWrongKey204);

  // 3. Alarm Buzzer Sounding (Non-blocking: 70ms on, 50ms off)
  alarmActive = (isUnauthorized203 || isUnauthorized204 || isWrongKey203 || isWrongKey204);
  if (alarmActive) {
    unsigned long cycle = millis() % 120;
    if (cycle < 70) buzzerOn();
    else buzzerOff();
  } else {
    buzzerOff();
  }

  // 4. Live Countdown Window Handling (when authorized and no alarm active)
  if (!alarmActive && isAuthorized) {
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
      triggerBuzzer(180, 1);
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

  // 5. Periodic 10-second Heartbeat (only when idle, avoids colliding with QR scan or authorization)
  if (!isAuthorized && !alarmActive && (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL)) {
    lastHeartbeatTime = millis();
    sendHeartbeatToServer();
  }

  delay(10);
}
