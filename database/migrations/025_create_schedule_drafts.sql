-- Migration: 025_create_schedule_drafts.sql
-- Description: Creates schedule_drafts table for working draft schedules, isolating unfinalized draft edits from official production schedule views.

CREATE TABLE IF NOT EXISTS `schedule_drafts` (
    `Draft_ID` INT AUTO_INCREMENT PRIMARY KEY,
    `User_ID` INT NULL,
    `Room_ID` INT NOT NULL,
    `Subject_Name` VARCHAR(255) NULL,
    `Section` VARCHAR(10) NULL,
    `Day_of_Week` VARCHAR(20) NOT NULL,
    `Start_Time` TIME NOT NULL,
    `End_Time` TIME NOT NULL,
    `Academic_Year` VARCHAR(15) NOT NULL DEFAULT '2025-2026',
    `Semester` VARCHAR(20) NOT NULL DEFAULT '1st Semester',
    `Color_Theme` VARCHAR(50) NULL DEFAULT 'blue',
    `Created_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `Updated_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_draft_room_term` (`Room_ID`, `Academic_Year`, `Semester`),
    INDEX `idx_draft_user_term` (`User_ID`, `Academic_Year`, `Semester`),
    INDEX `idx_draft_term` (`Academic_Year`, `Semester`),
    FOREIGN KEY (`Room_ID`) REFERENCES `laboratories`(`Room_ID`) ON DELETE CASCADE,
    FOREIGN KEY (`User_ID`) REFERENCES `users`(`User_ID`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Phase 0 Data Reconciliation:
-- If any schedule rows currently exist in `schedules` whose corresponding `schedule_metadata.Status` is 'Draft',
-- safely evacuate them into `schedule_drafts` and delete them from `schedules`.
-- This guarantees that unapproved drafts will never accidentally become official schedules.
INSERT INTO `schedule_drafts` (`User_ID`, `Room_ID`, `Subject_Name`, `Section`, `Day_of_Week`, `Start_Time`, `End_Time`, `Academic_Year`, `Semester`, `Color_Theme`)
SELECT s.`User_ID`, s.`Room_ID`, s.`Subject_Name`, s.`Section`, s.`Day_of_Week`, s.`Start_Time`, s.`End_Time`, s.`Academic_Year`, s.`Semester`, s.`Color_Theme`
FROM `schedules` s
JOIN `schedule_metadata` m ON s.`Room_ID` = m.`Room_ID` AND s.`Academic_Year` = m.`Academic_Year` AND s.`Semester` = m.`Semester`
WHERE m.`Status` = 'Draft';

DELETE s FROM `schedules` s
JOIN `schedule_metadata` m ON s.`Room_ID` = m.`Room_ID` AND s.`Academic_Year` = m.`Academic_Year` AND s.`Semester` = m.`Semester`
WHERE m.`Status` = 'Draft';
