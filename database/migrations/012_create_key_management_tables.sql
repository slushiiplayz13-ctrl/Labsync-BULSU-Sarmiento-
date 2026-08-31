-- Migration: 012_create_key_management_tables.sql
-- Description: Creates laboratory_keys and key_found_reports tables for physical key tracking.

CREATE TABLE IF NOT EXISTS laboratory_keys (
    Key_ID INT AUTO_INCREMENT PRIMARY KEY,
    Room_ID INT NOT NULL,
    Key_Code VARCHAR(50) NOT NULL UNIQUE,
    Status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    Updated_At DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lab_keys_room FOREIGN KEY (Room_ID) REFERENCES laboratories(Room_ID) ON DELETE CASCADE,
    INDEX idx_keys_room (Room_ID),
    INDEX idx_keys_code (Key_Code),
    INDEX idx_keys_status (Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS key_found_reports (
    Report_ID INT AUTO_INCREMENT PRIMARY KEY,
    Key_ID INT NOT NULL,
    Found_Location TEXT NOT NULL,
    Found_At DATETIME NOT NULL,
    Finder_Contact VARCHAR(255) NULL,
    Message TEXT NULL,
    Status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    Created_At DATETIME DEFAULT CURRENT_TIMESTAMP,
    Resolved_At DATETIME NULL,
    CONSTRAINT fk_key_found_reports_key FOREIGN KEY (Key_ID) REFERENCES laboratory_keys(Key_ID) ON DELETE CASCADE,
    INDEX idx_found_key (Key_ID),
    INDEX idx_found_status (Status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default key per laboratory if no keys exist for that lab yet
INSERT INTO laboratory_keys (Room_ID, Key_Code, Status)
SELECT l.Room_ID, CONCAT('KEY-IT-', l.Room_Number, '-A'), 'ACTIVE'
FROM laboratories l
LEFT JOIN laboratory_keys k ON l.Room_ID = k.Room_ID
WHERE k.Key_ID IS NULL;
