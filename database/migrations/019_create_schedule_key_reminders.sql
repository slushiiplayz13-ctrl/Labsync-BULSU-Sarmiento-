-- Migration 019: Create schedule_key_reminders table for tracking key return reminders
-- Enforces atomic duplicate prevention via UNIQUE KEY on (Schedule_ID, Occurrence_Date).

CREATE TABLE IF NOT EXISTS `schedule_key_reminders` (
    `Reminder_ID` INT AUTO_INCREMENT PRIMARY KEY,
    `Schedule_ID` INT NOT NULL,
    `Occurrence_Date` DATE NOT NULL,
    `Room_ID` INT NOT NULL,
    `Recipient_User_ID` INT NOT NULL,
    `Scheduled_User_ID` INT NULL,
    `Status` ENUM('CLAIMED', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'CLAIMED',
    `Sent_At` DATETIME NULL,
    `Error_Message` TEXT NULL,
    `Created_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `Updated_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_schedule_occurrence` (`Schedule_ID`, `Occurrence_Date`),
    INDEX `idx_reminder_lookup` (`Room_ID`, `Occurrence_Date`),
    INDEX `idx_reminder_status` (`Status`),
    CONSTRAINT `fk_skr_schedule` FOREIGN KEY (`Schedule_ID`) REFERENCES `schedules`(`Schedule_ID`) ON DELETE CASCADE,
    CONSTRAINT `fk_skr_room` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories`(`Room_ID`) ON DELETE CASCADE,
    CONSTRAINT `fk_skr_recipient` FOREIGN KEY (`Recipient_User_ID`) REFERENCES `users`(`User_ID`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
