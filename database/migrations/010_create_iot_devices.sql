-- Migration: 010_create_iot_devices.sql
-- Creates the iot_devices table for authenticating physical LabSync IoT key boxes.

CREATE TABLE IF NOT EXISTS `iot_devices` (
  `Device_ID` varchar(64) NOT NULL,
  `Device_Name` varchar(100) NOT NULL,
  `Token_Hash` varchar(64) NOT NULL,
  `Authorized_Rooms` text NOT NULL,
  `Is_Active` tinyint(1) NOT NULL DEFAULT 1,
  `Last_Seen` datetime DEFAULT NULL,
  `Created_At` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Device_ID`),
  KEY `idx_token_hash` (`Token_Hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
