-- Migration: 024_create_schedule_metadata.sql
-- Description: Creates schedule_metadata table for optimistic concurrency control, draft/finalized lifecycle, and Super Admin finalization authority.

CREATE TABLE IF NOT EXISTS `schedule_metadata` (
    `Metadata_ID` INT AUTO_INCREMENT PRIMARY KEY,
    `Room_ID` INT NOT NULL,
    `Academic_Year` VARCHAR(15) NOT NULL,
    `Semester` VARCHAR(20) NOT NULL,
    `Version` INT NOT NULL DEFAULT 1,
    `Status` VARCHAR(20) NOT NULL DEFAULT 'Draft',
    `Finalized_By` INT NULL,
    `Finalized_At` DATETIME NULL,
    `Updated_By` INT NULL,
    `Created_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `Updated_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_room_term` (`Room_ID`, `Academic_Year`, `Semester`),
    INDEX `idx_room_term` (`Room_ID`, `Academic_Year`, `Semester`),
    INDEX `idx_term` (`Academic_Year`, `Semester`),
    FOREIGN KEY (`Room_ID`) REFERENCES `laboratories`(`Room_ID`) ON DELETE CASCADE,
    FOREIGN KEY (`Finalized_By`) REFERENCES `users`(`User_ID`) ON DELETE SET NULL,
    FOREIGN KEY (`Updated_By`) REFERENCES `users`(`User_ID`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
