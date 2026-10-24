-- Migration: 029_create_backup_history.sql
-- Description: Creates the backup_history table to track metadata for database backup generation.

CREATE TABLE IF NOT EXISTS `backup_history` (
  `Backup_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Filename` varchar(255) NOT NULL,
  `Trigger_Type` varchar(20) NOT NULL DEFAULT 'MANUAL',
  `Status` varchar(20) NOT NULL DEFAULT 'SUCCESS',
  `File_Size_Bytes` bigint(20) DEFAULT 0,
  `Table_Count` int(11) DEFAULT 0,
  `Checksum_SHA256` varchar(64) DEFAULT NULL,
  `Error_Message` text DEFAULT NULL,
  `Executed_By_Email` varchar(150) DEFAULT NULL,
  `IP_Address` varchar(45) DEFAULT NULL,
  `Created_At` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Backup_ID`),
  KEY `idx_backup_history_status` (`Status`),
  KEY `idx_backup_history_created` (`Created_At`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
