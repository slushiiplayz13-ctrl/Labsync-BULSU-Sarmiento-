-- Migration: 026_register_esp32_iot_device.sql
-- Registers or updates the physical LabSync ESP32 Key Box with its SHA-256 token hash and authorized rooms.
-- Idempotent registration: safe to execute multiple times.

INSERT INTO `iot_devices` (`Device_ID`, `Device_Name`, `Token_Hash`, `Authorized_Rooms`, `Is_Active`, `Created_At`)
VALUES (
    'ESP32-KeyBox',
    'Main Lab Key Box (Rooms 203/204)',
    '7dc35bc62bd76ddaa09874e476edff12a0d3324b4074f8557414cb7d410f81b7',
    '["203","204"]',
    1,
    NOW()
)
ON DUPLICATE KEY UPDATE
    `Device_Name` = VALUES(`Device_Name`),
    `Token_Hash` = VALUES(`Token_Hash`),
    `Authorized_Rooms` = VALUES(`Authorized_Rooms`),
    `Is_Active` = 1;
