-- Migration: 011_create_audit_logs.sql
-- Description: Creates the persistent audit_logs table for administrative accountability and security tracking.

CREATE TABLE IF NOT EXISTS audit_logs (
    Log_ID INT AUTO_INCREMENT PRIMARY KEY,
    User_ID INT NULL,
    Actor_Email VARCHAR(150) NULL,
    Actor_Role VARCHAR(50) NULL,
    Action VARCHAR(50) NOT NULL,
    Resource_Type VARCHAR(50) NOT NULL,
    Resource_ID VARCHAR(100) NULL,
    Details TEXT NULL,
    Result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    IP_Address VARCHAR(45) NULL,
    Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_user (User_ID),
    INDEX idx_audit_action (Action),
    INDEX idx_audit_created (Created_At)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
