# LabSync IoT Hardware & Integration Handover Summary

This file summarizes the current state of the LabSync IoT device wiring, software code, backend server setup, and the current diagnostic status of the key detection system so that you can resume debugging.

---

## 1. Hardware Pinout & Wiring (ESP32 Dev Module)

| Component | ESP32 Pin | Wire/Connection | Notes |
| :--- | :--- | :--- | :--- |
| **I2C LCD (16x2)** | `GPIO 21 (SDA)` / `GPIO 22 (SCL)` | Standard I2C | Auto-scans I2C bus on boot (typically resolves to address `0x27`). |
| **GM65 QR Scanner** | `GPIO 27 (RX2)` / `GPIO 26 (TX2)` | `RX -> 27`, `TX -> 26` | **Baud Rate:** Configured to `9600` baud on scanner. Works perfectly. |
| **Key Slot (6.35mm Jack)**| `GPIO 14 (D14)` / `GND` | `D14` & `GND` | Configured as `INPUT_PULLUP` on ESP32. |

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

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdDetected = false;

// Wi-Fi Credentials
const char* ssid = "BLK 26 LT POGI - 2.4Ghz";
const char* password = "POOHLIEPOGI";

// Server Configuration
const char* serverUrl = "http://192.168.100.59:3000/api/occupancy/log";
const char* roomNumber = "204"; 

// Key Sensor Configuration (6.35mm jack socket)
#define KEY_PIN 14 // Pin D14 on the ESP32
bool lastKeyState = true; // Tracks the last key presence state (true = Present, false = Absent)

void setup() {
  Serial.begin(9600);
  delay(1000);
  Serial.println("\n==================================");
  Serial.println("  LabSync Device Booting...");
  Serial.println("==================================");

  // Scan I2C Bus to find the LCD address
  Wire.begin();
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

  // Initialize GM65 Scanner at 9600 baud on pins 27 and 26
  Serial2.begin(9600, SERIAL_8N1, 27, 26); 

  // Initialize Key Sensor Pin (using internal pull-up)
  pinMode(KEY_PIN, INPUT_PULLUP);
  lastKeyState = (digitalRead(KEY_PIN) == LOW); 

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  Serial.println("\nConnected to Wi-Fi!");

  if (lcdDetected) {
    showReadyScreen();
  }
}

void showReadyScreen() {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("LabSync Room ");
    lcd.print(roomNumber);
    lcd.setCursor(0, 1);
    lcd.print("Ready to Scan!");
  }
}

void sendScanToServer(String scannedToken) {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Verifying...");
  }

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"qrString\":\"" + scannedToken + "\",\"roomNumber\":\"" + String(roomNumber) + "\",\"authMethod\":\"QR Code\"}";
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode == 200) {
      String response = http.getString();
      StaticJsonDocument<300> doc;
      deserializeJson(doc, response);
      String userName = doc["user"]["name"].as<String>();

      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Access Granted!");
        lcd.setCursor(0, 1);
        lcd.print(userName.substring(0, 16));
      }
    } else {
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Access Denied!");
      }
    }
    http.end();
  }
  delay(3000);
  showReadyScreen();
}

void sendKeyStatusToServer(bool present) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String statusStr = present ? "Key Returned" : "Key Taken";
    String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + String(roomNumber) + "\"}";
    http.POST(jsonPayload);
    http.end();
  }
}

void loop() {
  // 1. Listen to GM65 Scanner
  if (Serial2.available() > 0) {
    delay(150);
    String scannedCode = "";
    while (Serial2.available() > 0) {
      char c = Serial2.read();
      if (c >= 32 && c <= 126) {
        scannedCode += c;
      }
    }
    scannedCode.trim();
    if (scannedCode.length() > 0) {
      sendScanToServer(scannedCode);
    }
  }

  // 2. Listen to Key Sensor (6.35mm jack socket on Pin 14)
  bool currentPinState = digitalRead(KEY_PIN);
  bool currentKeyState = (currentPinState == LOW); 

  if (currentKeyState != lastKeyState) {
    delay(100); // Debounce
    if ((digitalRead(KEY_PIN) == LOW) == currentKeyState) {
      lastKeyState = currentKeyState;

      if (currentKeyState) {
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Key Returned!");
          lcd.setCursor(0, 1);
          lcd.print("Room Secured");
        }
      } else {
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print("Key Taken!");
          lcd.setCursor(0, 1);
          lcd.print("Room Active");
        }
      }

      sendKeyStatusToServer(currentKeyState);
      delay(3000);
      showReadyScreen();
    }
  }
  delay(50);
}
```
