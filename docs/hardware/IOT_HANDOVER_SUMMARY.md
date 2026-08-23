# LabSync IoT Hardware & Integration Handover Summary

This file summarizes the current state of the LabSync IoT device wiring, software code, backend server setup, and the current diagnostic status of the key detection system so that you can resume debugging.

---

## 1. Hardware Pinout & Wiring (ESP32 Dev Module)

| Component | ESP32 Pin | Wire/Connection | Notes |
| :--- | :--- | :--- | :--- |
| **I2C LCD (16x2)** | `GPIO 21 (SDA)` / `GPIO 22 (SCL)` | Standard I2C | Auto-scans I2C bus on boot (typically resolves to address `0x27`). |
| **GM65 QR Scanner** | `GPIO 17 (RX2)` / `GPIO 16 (TX2)` | `RX -> 17`, `TX -> 16` | **Baud Rate:** Configured to `9600` baud on scanner. |
| **Key Slot 203** | `GPIO 32 (D32)` / `GND` | `D32` & `GND` | Configured as `INPUT_PULLUP` on ESP32. |
| **Key Slot 204** | `GPIO 33 (D33)` / `GND` | `D33` & `GND` | Configured as `INPUT_PULLUP` on ESP32. |
| **Buzzer** | `GPIO 25 (D25)` / `GND` | `D25` (+) & `GND` (-) | Audio feedback for key actions & QR verification. |

---

## 2. Current Diagnostic Status of Key Slot
* **What works**: Touching the wire from ESP32 pin `D14` directly to a `GND` pin on the ESP32 changes the value in the Serial Monitor from `1` to `0` instantly. This proves the ESP32 pin and reading logic are 100% functional.
* **Socket Wiring**:
  * **White wire** is hooked to the base of the big curved hook-shaped spring leaf (which is the ground/switch leaf).
  * **Blue wire** is hooked to the top switched contact tab of the socket.
  * *Note:* Wires are currently wrapped/twisted through the solder tabs' holes without solder.
* **The Issue**: When the socket is empty, it reads `0` (closed circuit). When the 6.35mm metal key jack plug is inserted, it remains stuck on `0`.
* **Required Debugging**:
  1. Test if physically pushing the spring leaf away from the top tab contact using a **non-conductive plastic stick** (like a pen or coffee stirrer) changes the value on the Serial Monitor to `1`.
  2. If it does change to `1` with plastic, then the mechanical switch is working, but inserting the fully-metal key plug bridges both contacts together, keeping them shorted to `0`. If it doesn't change to `1`, the solder tabs or bare wires are touching each other at the socket base.

---

## 3. Web Server & Database Schema Details
* **Port / URL**: `http://192.168.100.59:3000/api/occupancy/log` (or `localhost:3000`)
* **MySQL Schema Updates**:
  * Added `Key_Status` (`VARCHAR(20) DEFAULT 'Present'`) column to the `laboratories` table.
  * Updated `occupancy_log` to support `User_ID = NULL` for generic device/key events.
  * Changed the `/api/notifications` feed to a `LEFT JOIN` on `users` so that generic key events (where `User_ID` is null) show up in real-time activity feeds.
* **Dynamic Frontend Alerts & Real-Time Refreshes (script.js)**: 
  * Updated to dynamically format key events (e.g. showing "was taken from the holder" / "was returned (Room Secured)" instead of hardcoding the word "unlocked" for all actions).
  * Linked the room card rendering (`loadDashboardStatsAndLabs`) and timeline logs (`loadRoomStatusActivityLog`) directly into the 3-second notification polling loop. Now the dashboard cards and timeline list refresh dynamically in real time without manual F5 refreshes!
* **Room Status Logic (Calculated dynamically in GET `/api/laboratories`)**:
  * If a class is currently scheduled, the status is **"In Use"**.
  * Otherwise, if the key is **Absent** (removed from the slot), the room status is **"Claimed"** (occupied).
  * If the key is **Present** (inserted in the slot), the room status is **"Available"**.

#### Endpoint Payload Structures:
* **QR Scan Post**:
  ```json
  {
    "qrString": "LABSYNC-USER-1778994645214-SE2SCZO3W",
    "roomNumber": "204",
    "authMethod": "QR Code"
  }
  ```
* **Key Event Post**:
  ```json
  {
    "keyEvent": "Key Taken" | "Key Returned",
    "roomNumber": "204"
  }
  ```

---

## 4. Complete ESP32 Arduino Sketch

The complete working sketch is saved in [`LabSync_ESP32.ino`](file:///c:/Users/andre/Downloads/LabSync/LabSync_ESP32.ino).

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// Global LCD placeholder (default 0x27)
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdDetected = false;

// Wi-Fi Credentials
const char* ssid = "BLK 26 LT POGI - 2.4Ghz";
const char* password = "POOHLIEPOGI";

// Server Configuration
const char* serverUrl = "http://192.168.100.59:3000/api/occupancy/log";
const char* defaultScanRoom = "203"; 

// Key Slots Configuration
#define KEY_PIN_203 32 // Pin D32 for Room 203
#define KEY_PIN_204 33 // Pin D33 for Room 204

bool lastKeyState203 = true;
bool lastKeyState204 = true;

// Pin Definitions for GM65 Scanner
#define GM65_RX_PIN 17 // ESP32 RX2 (connect to GM65 TX)
#define GM65_TX_PIN 16 // ESP32 TX2 (connect to GM65 RX)

// Pin Definitions for I2C LCD
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22

// Buzzer Configuration (Active Low-Level Trigger)
#define BUZZER_PIN 25 

void buzzerOn() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW); // Pull to GND -> Buzzer Sounds
}

void buzzerOff() {
  pinMode(BUZZER_PIN, INPUT); // High-Z / Float -> Buzzer OFF
}

void triggerBuzzer(int durationMs = 100, int count = 1) {
  for (int i = 0; i < count; i++) {
    buzzerOn();
    delay(durationMs);
    buzzerOff();
    if (i < count - 1) {
      delay(50);
    }
  }
}

void showReadyScreen() {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("LabSync System");
    lcd.setCursor(0, 1);
    lcd.print("Ready to Scan!");
  }
}

void clearSerialBuffer() {
  while (Serial2.available() > 0) {
    Serial2.read();
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n--- LabSync Device Booting ---");

  // 1. Initialize Buzzer safely
  buzzerOff();

  // 2. Initialize Key Sensor Pins
  pinMode(KEY_PIN_203, INPUT_PULLUP);
  pinMode(KEY_PIN_204, INPUT_PULLUP);
  delay(50);

  lastKeyState203 = (digitalRead(KEY_PIN_203) == LOW);
  lastKeyState204 = (digitalRead(KEY_PIN_204) == LOW);

  Serial.print("Initial Key 203 Status: ");
  Serial.println(lastKeyState203 ? "Present" : "Absent");
  Serial.print("Initial Key 204 Status: ");
  Serial.println(lastKeyState204 ? "Present" : "Absent");

  // 3. Initialize I2C LCD
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
    Serial.print("LCD Screen detected at: 0x");
    Serial.println(foundAddress, HEX);
    
    lcd = LiquidCrystal_I2C(foundAddress, 16, 2);
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Connecting to");
    lcd.setCursor(0, 1);
    lcd.print("Wi-Fi...");
    lcdDetected = true;
  } else {
    Serial.println("WARNING: No LCD Screen found on I2C pins.");
  }

  // 4. Initialize GM65 Scanner
  Serial2.begin(9600, SERIAL_8N1, GM65_RX_PIN, GM65_TX_PIN);
  clearSerialBuffer();

  // 5. Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 20) {
    delay(400);
    Serial.print(".");
    wifiTimeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to Wi-Fi!");
    triggerBuzzer(100, 1); // Fast boot beep
  } else {
    Serial.println("\nWi-Fi Connection Failed!");
  }

  if (lcdDetected) {
    showReadyScreen();
  }
}

void sendScanToServer(String scannedToken) {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Verifying...");
    lcd.setCursor(0, 1);
    lcd.print("Please wait...");
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.setTimeout(1200); // 1.2s timeout prevents hanging on slow network
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> reqDoc;
    reqDoc["qrString"] = scannedToken;
    reqDoc["roomNumber"] = defaultScanRoom;
    reqDoc["authMethod"] = "QR Code";

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);

    Serial.print("Sending QR Token to server: ");
    Serial.println(jsonPayload);
    
    int httpResponseCode = http.POST(jsonPayload);
    String response = http.getString();
    Serial.print("HTTP Response Code: ");
    Serial.println(httpResponseCode);

    StaticJsonDocument<1024> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);

    String line1 = "Access Granted!";
    String line2 = "Authorized User";

    if (!error) {
      if (resDoc.containsKey("lcdLine1")) {
        line1 = resDoc["lcdLine1"].as<String>();
      }
      if (resDoc.containsKey("lcdLine2")) {
        line2 = resDoc["lcdLine2"].as<String>();
      } else if (resDoc.containsKey("name")) {
        line2 = resDoc["name"].as<String>();
      } else if (resDoc.containsKey("user") && resDoc["user"].containsKey("name")) {
        line2 = resDoc["user"]["name"].as<String>();
      }
    }

    if (httpResponseCode == 200) {
      triggerBuzzer(80, 2); 
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
      Serial.println("Access Granted for: " + line2);
    } else {
      triggerBuzzer(300, 1); 
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
      Serial.print("Access Denied. Code: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    triggerBuzzer(300, 1);
    if (lcdDetected) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Wi-Fi Error!");
      lcd.setCursor(0, 1);
      lcd.print("Disconnected");
    }
    Serial.println("Wi-Fi Disconnected!");
  }

  delay(1200); // Snappy 1.2s display before returning to ready screen
  clearSerialBuffer();
  showReadyScreen();
}

void sendKeyStatusToServer(String room, bool present) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.setTimeout(1000);
    http.addHeader("Content-Type", "application/json");

    String statusStr = present ? "Key Returned" : "Key Taken";
    String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + room + "\"}";

    Serial.print("Sending Key Event for Room " + room + ": ");
    Serial.println(statusStr);
    
    int httpResponseCode = http.POST(jsonPayload);
    if (httpResponseCode == 200) {
      Serial.println("Server confirmed: Key status updated for Room " + room);
    } else {
      Serial.print("Server error logging key event. Code: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    Serial.println("Wi-Fi Disconnected! Cannot send key status.");
  }
}

void handleKeySlot(int pin, bool &lastState, String roomName) {
  bool readState1 = (digitalRead(pin) == LOW);
  
  if (readState1 != lastState) {
    delay(40); // Snappy 40ms debounce
    bool readState2 = (digitalRead(pin) == LOW);
    
    if (readState1 == readState2) {
      lastState = readState2;

      if (readState2) {
        triggerBuzzer(80, 2); // 2 quick beeps on key return
        Serial.println("KEY SENSOR [" + roomName + "]: Key returned.");
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(roomName + " Key Return");
          lcd.setCursor(0, 1);
          lcd.print("Room Secured");
        }
      } else {
        triggerBuzzer(150, 1); // 1 quick beep on key take
        Serial.println("KEY SENSOR [" + roomName + "]: Key taken.");
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(roomName + " Key Taken");
          lcd.setCursor(0, 1);
          lcd.print("Room Active");
        }
      }

      sendKeyStatusToServer(roomName, readState2);
      delay(1000); // 1s message hold
      clearSerialBuffer();
      showReadyScreen();
    }
  }
}

void loop() {
  // 1. Instant GM65 Scanner Detection
  if (Serial2.available() > 0) {
    String scannedCode = "";
    unsigned long startTime = millis();
    unsigned long lastCharTime = millis();
    int totalBytesRead = 0;
    
    // Tight 60ms scan window for zero perceptible input lag
    while ((millis() - startTime < 60) && (millis() - lastCharTime < 20)) {
      while (Serial2.available() > 0) {
        char c = Serial2.read();
        totalBytesRead++;
        if (c >= 32 && c <= 126) {
          scannedCode += c;
        }
        lastCharTime = millis();
        
        if (scannedCode.length() >= 128 || totalBytesRead >= 256) {
          break;
        }
      }
    }
    
    scannedCode.trim();

    if (scannedCode.length() > 0) {
      Serial.print("QR Code Detected: [");
      Serial.print(scannedCode);
      Serial.println("]");
      sendScanToServer(scannedCode);
    } else {
      clearSerialBuffer();
    }
  }

  // 2. Continuous Key Monitoring
  handleKeySlot(KEY_PIN_203, lastKeyState203, "203");
  handleKeySlot(KEY_PIN_204, lastKeyState204, "204");

  delay(10); // Minimal loop rest
}
```
