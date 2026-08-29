# LabSync IoT Hardware & Integration Handover Summary

This document details the hardware wiring, ESP32 firmware architecture, backend API integration, and diagnostics for the **LabSync IoT Key Dock & Access Monitoring System** developed for **Bulacan State University – Sarmiento Campus**.

---

## 1. Hardware Specifications & Pinout Mapping

### Microcontroller
- **Model**: ESP32 Dev Module (30-pin Dual Core)
- **Framework**: Arduino Framework / ESP32 Core

### Pinout Table

| Component | ESP32 Pin | Wire / Connection | Notes |
| :--- | :--- | :--- | :--- |
| **I2C LCD (16x2)** | `GPIO 21 (SDA)` / `GPIO 22 (SCL)` | Standard I2C | Auto-scans I2C bus on boot (resolves to `0x27` or `0x3F`). |
| **GM65 QR Scanner** | `GPIO 17 (RX2)` / `GPIO 16 (TX2)` | `ESP32 RX2 (17) -> GM65 TX`<br>`ESP32 TX2 (16) -> GM65 RX` | **Baud Rate:** 9600 baud. Scans user ID QR codes. |
| **Key Slot 203** | `GPIO 32 (ADC1_CH4)` / `GND` | `D32` & `GND` (via 10kΩ pull-down / voltage divider) | Expects Key 203 with 10kΩ resistor (~1800 ADC reading). |
| **Key Slot 204** | `GPIO 33 (ADC1_CH5)` / `GND` | `D33` & `GND` (via 10kΩ pull-down / voltage divider) | Expects Key 204 with direct 0Ω wire (~0 ADC reading). |
| **Piezo Buzzer** | `GPIO 25 (D25)` / `GND` | `D25` (+) & `GND` (-) | Active Low trigger: pulls LOW to sound, High-Z float to mute. |

---

## 2. Key Identification Mechanism (ADC Voltage Divider)

To distinguish between physical keys placed in slots (e.g., preventing Key 203 from being accepted in Slot 204), the system uses an ADC resistor discriminator:

```
                  ESP32 3.3V
                      │
                 [10kΩ Internal/Slot Resistor]
                      │
       GPIO 32/33 ────┼──── [Key Jack Plug Contacts]
                      │          │
                      │     [Key Resistor (0Ω or 10kΩ)]
                      │          │
                      └───────── GND
```

### Key Discrimination ADC Ranges
| Key Identifier | Physical Key Resistance | ADC Reading (12-bit, 0–4095) | Enum State |
|---|---|---|---|
| **Empty Slot** | Open Circuit | `> 3000` | `KEY_NONE` (0) |
| **Key 204** | 0Ω Direct Wire | `0 – 500` | `KEY_204` (1) |
| **Key 203** | 10kΩ Resistor | `1000 – 2600` | `KEY_203` (2) |

---

## 3. Web Server & Backend Integration

- **Primary API Base URL**: `http://<server-ip>:3000/api/occupancy`
- **Endpoints**:
  - `POST /api/occupancy/log`: Submits QR scan events or key removal/return state transitions.
  - `POST /api/occupancy/heartbeat`: 5-second periodic connectivity ping from the ESP32.

### JSON Payload Formats

#### 1. QR Badge Scan
```json
{
  "qrString": "LABSYNC-USER-1778994645214-SE2SCZO3W",
  "roomNumber": "203",
  "authMethod": "QR Code"
}
```

#### 2. Key Dock Event
```json
{
  "keyEvent": "Key Taken",
  "roomNumber": "204"
}
```
*(Or `"keyEvent": "Key Returned"`)*

#### 3. Heartbeat Payload
```json
{
  "deviceId": "ESP32-KeyBox",
  "rooms": ["203", "204"]
}
```

#### 4. Server LCD Response
```json
{
  "lcdLine1": "Scan Confirmed!",
  "lcdLine2": "You May Take Key"
}
```

---

## 4. Room Availability Engine

The backend dynamically calculates room status (`GET /api/laboratories`) using schedule and key state:

| Key State in Dock | Active Class Slot | Faculty Match | Computed Status | Card Badge |
|---|---|---|---|---|
| **Present** | Any | N/A | **Available** | Green (`#10b981`) |
| **Absent** | Active | Scheduled Faculty | **In Session** | Red (`#ef4444`) |
| **Absent** | Active / Inactive | Other Faculty / Open | **Borrowed** | Orange (`#f59e0b`) |

---

## 5. ESP32 Arduino Sketch Reference

The full, verified firmware sketch is located at [`LabSync_ESP32.ino`](../../LabSync_ESP32.ino).

### Setup and Flashing
1. Open `LabSync_ESP32.ino` in the Arduino IDE.
2. Select Board: **ESP32 Dev Module**.
3. Install required libraries:
   - `LiquidCrystal_I2C` by Frank de Brabander
   - `ArduinoJson` (v6 or v7) by Benoit Blanchon
4. Configure Wi-Fi SSID and Password in the sketch header:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   const char* serverUrl = "http://YOUR_SERVER_IP:3000/api/occupancy/log";
   const char* heartbeatUrl = "http://YOUR_SERVER_IP:3000/api/occupancy/heartbeat";
   ```
5. Compile and flash to the ESP32.

---

## 6. Hardware Limitations & Operational Notes

- **Occupancy Inference**: Room availability is inferred from the physical key dock state. It does not detect human body presence or count occupants inside the laboratory.
- **Physical Contact Cleanliness**: Ensure 6.35mm jack solder tabs and socket leaves are clean and unoxidized to prevent fluctuating ADC voltage readings.

---

*Document maintained for Bulacan State University – Sarmiento Campus IoT Laboratory Setup.*
