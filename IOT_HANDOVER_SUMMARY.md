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

// LCD Configuration
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdDetected = false;

// Wi-Fi Credentials
const char* ssid = "BLK 26 LT POGI - 2.4Ghz";
const char* password = "POOHLIEPOGI";

// Server Configuration
const char* serverUrl = "http://192.168.100.59:3000/api/occupancy/log";
const char* roomNumber = "204";

// GM65 pins
#define GM65_RX_PIN 27 // Connects to Scanner TX (Black wire)
#define GM65_TX_PIN 26 // Connects to Scanner RX (Yellow wire)

// Key Sensor Pin (6.35mm jack socket on Pin 14)
#define KEY_PIN 14 
bool lastKeyState = true; // true = Present, false = Absent

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==================================");
  Serial.println("  LabSync Device Booting...");
  Serial.println("==================================");

  // Scan I2C Bus for LCD
  Wire.begin();
  Serial.println("Scanning I2C Bus for LCD...");
  byte foundAddress = 0;
  for (byte i = 8; i < 120; i++) {
    Wire.beginTransmission(i);
    if (Wire.endTransmission() == 0) {
      Serial.print("-> Found I2C Device at: 0x");
      Serial.println(i, HEX);
      foundAddress = i;
    }
  }

  // Initialize LCD if detected
  if (foundAddress != 0) {
    Serial.print("LCD Screen detected successfully at 0x");
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
    Serial.println("WARNING: No LCD Screen found.");
  }

  // Initialize GM65 Scanner on Serial2
  Serial2.begin(9600, SERIAL_8N1, GM65_RX_PIN, GM65_TX_PIN); 

  // Initialize Key Sensor Pin
  pinMode(KEY_PIN, INPUT_PULLUP);
  lastKeyState = (digitalRead(KEY_PIN) == LOW); 

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to Wi-Fi!");

  if (lcdDetected) {
    showReadyScreen();
  }
  
  Serial.println("==================================");
  Serial.println("  Ready! Scan a QR code now.");
  Serial.println("==================================\n");
}

void showReadyScreen() {
  if (lcdDetected) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("  LabSync System  ");
    lcd.setCursor(0, 1);
    lcd.print(" Ready to Scan! ");
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
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"qrString\":\"" + scannedToken + "\",\"roomNumber\":\"" + String(roomNumber) + "\",\"authMethod\":\"QR Code\"}";

    Serial.print("Sending QR Token to server: ");
    Serial.println(scannedToken);
    
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode == 200) {
      String response = http.getString();
      Serial.print("Server Response: ");
      Serial.println(response);

      StaticJsonDocument<300> doc;
      DeserializationError error = deserializeJson(doc, response);

      String line1 = "Scan Confirmed!";
      String line2 = "You May Take Key";

      if (!error) {
        if (doc.containsKey("lcdLine1")) {
          line1 = doc["lcdLine1"].as<String>();
        }
        if (doc.containsKey("lcdLine2")) {
          line2 = doc["lcdLine2"].as<String>();
        }
      }

      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }

      Serial.println("Scan Confirmed. Displaying instruction to take key.");
    } 
    else {
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("Access Denied!");
        lcd.setCursor(0, 1);
        lcd.print("Invalid QR Code");
      }

      Serial.print("Access Denied. HTTP Code: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
    if (lcdDetected) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Wi-Fi Error!");
    }
    Serial.println("Wi-Fi Disconnected!");
  }

  delay(3500);
  showReadyScreen();
}

void sendKeyStatusToServer(bool present) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    String statusStr = present ? "Key Returned" : "Key Taken";
    String jsonPayload = "{\"keyEvent\":\"" + statusStr + "\",\"roomNumber\":\"" + String(roomNumber) + "\"}";
    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode == 200) {
      String response = http.getString();
      StaticJsonDocument<300> doc;
      DeserializationError error = deserializeJson(doc, response);

      String line1 = error ? (present ? "Key Returned!" : "Key Take Reg!") : doc["lcdLine1"].as<String>();
      String line2 = error ? (present ? "Room Secured" : "System Updated") : doc["lcdLine2"].as<String>();

      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
    }
    http.end();
  }
}

void loop() {
  // 1. Listen for GM65 QR Scanner data
  if (Serial2.available() > 0) {
    delay(150);
    String scannedCode = "";
    while (Serial2.available() > 0) {
      char c = (char)Serial2.read();
      if (c >= 32 && c <= 126) {
        scannedCode += c;
      }
    }
    scannedCode.trim();

    if (scannedCode.length() > 0) {
      Serial.print("QR Code Detected: ");
      Serial.println(scannedCode);
      sendScanToServer(scannedCode);
    }
  }

  // 2. Listen to Key Sensor (Pin D14)
  bool currentPinState = digitalRead(KEY_PIN);
  bool currentKeyState = (currentPinState == LOW); 

  if (currentKeyState != lastKeyState) {
    delay(100); // Debounce
    if ((digitalRead(KEY_PIN) == LOW) == currentKeyState) {
      lastKeyState = currentKeyState;

      sendKeyStatusToServer(currentKeyState);
      delay(3000);
      showReadyScreen();
    }
  }
  delay(50);
}
```
