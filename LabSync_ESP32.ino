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

// Periodic Heartbeat Timer
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL = 5000; // 5 seconds

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

// Lightweight 5-second Heartbeat
void sendHeartbeatToServer() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(heartbeatUrl);
    http.setTimeout(800); // Fast 800ms non-blocking timeout
    http.addHeader("Content-Type", "application/json");

    String jsonPayload = "{\"deviceId\":\"ESP32-KeyBox\",\"rooms\":[\"203\",\"204\"]}";
    int code = http.POST(jsonPayload);
    
    // Fallback to /api/occupancy/log with keyEvent:Heartbeat if /heartbeat returns 404
    if (code == 404 || code < 0) {
      http.end();
      http.begin(serverUrl);
      http.setTimeout(800);
      http.addHeader("Content-Type", "application/json");
      http.POST("{\"keyEvent\":\"Heartbeat\",\"roomNumber\":\"203\"}");
    }
    http.end();
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

// Alarm loop when a key is put in the wrong hole
void handleWrongSlotAlarm(int pin, String expectedSlot, String insertedKey) {
  Serial.println("❌ WRONG KEY SLOT! Key " + insertedKey + " inserted into Slot " + expectedSlot);
  
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
  delay(300);
  showReadyScreen();
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
  while (WiFi.status() != WL_CONNECTED && wifiTimeout < 20) {
    delay(400);
    Serial.print(".");
    wifiTimeout++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected to Wi-Fi!");
    triggerBuzzer(100, 1);
    sendHeartbeatToServer(); // Immediately announce online presence on boot!
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
    http.setTimeout(1200);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<256> reqDoc;
    reqDoc["qrString"] = scannedToken;
    reqDoc["roomNumber"] = defaultScanRoom;
    reqDoc["authMethod"] = "QR Code";

    String jsonPayload;
    serializeJson(reqDoc, jsonPayload);
    
    int httpResponseCode = http.POST(jsonPayload);
    String response = http.getString();

    StaticJsonDocument<1024> resDoc;
    DeserializationError error = deserializeJson(resDoc, response);

    String line1 = "Access Granted!";
    String line2 = "Authorized User";

    if (!error) {
      if (resDoc.containsKey("lcdLine1")) line1 = resDoc["lcdLine1"].as<String>();
      if (resDoc.containsKey("lcdLine2")) line2 = resDoc["lcdLine2"].as<String>();
      else if (resDoc.containsKey("name")) line2 = resDoc["name"].as<String>();
      else if (resDoc.containsKey("user") && resDoc["user"].containsKey("name")) line2 = resDoc["user"]["name"].as<String>();
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
    } else {
      triggerBuzzer(300, 1); 
      if (lcdDetected) {
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print(line1.substring(0, 16));
        lcd.setCursor(0, 1);
        lcd.print(line2.substring(0, 16));
      }
    }
    http.end();
  } else {
    triggerBuzzer(300, 1);
    if (lcdDetected) {
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("Wi-Fi Error!");
    }
  }

  delay(1200);
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
    
    http.POST(jsonPayload);
    http.end();
  }
}

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

      lastState = verifyState;

      // 2. Correct Key Returned
      if (verifyState == expectedKey) {
        triggerBuzzer(80, 2);
        if (lcdDetected) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(slotRoom + " Key Return");
          lcd.setCursor(0, 1);
          lcd.print("Room Secured");
        }
        sendKeyStatusToServer(slotRoom, true);
        delay(1000);
        clearSerialBuffer();
        showReadyScreen();
      } 
      // 3. Key Taken
      else if (verifyState == KEY_NONE) {
        triggerBuzzer(150, 1);
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
      }
    }
  }
}

void loop() {
  // 1. GM65 Scanner
  if (Serial2.available() > 0) {
    String scannedCode = "";
    unsigned long startTime = millis();
    unsigned long lastCharTime = millis();
    int totalBytesRead = 0;
    
    while ((millis() - startTime < 60) && (millis() - lastCharTime < 20)) {
      while (Serial2.available() > 0) {
        char c = Serial2.read();
        totalBytesRead++;
        if (c >= 32 && c <= 126) scannedCode += c;
        lastCharTime = millis();
        if (scannedCode.length() >= 128 || totalBytesRead >= 256) break;
      }
    }
    
    scannedCode.trim();
    if (scannedCode.length() > 0) {
      sendScanToServer(scannedCode);
    } else {
      clearSerialBuffer();
    }
  }

  // 2. Key Monitoring
  handleKeySlot(KEY_PIN_203, lastSlotState203, "203", KEY_203);
  handleKeySlot(KEY_PIN_204, lastSlotState204, "204", KEY_204);

  // 3. Periodic 5-second Heartbeat
  if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
    lastHeartbeatTime = millis();
    sendHeartbeatToServer();
  }

  delay(20);
}
