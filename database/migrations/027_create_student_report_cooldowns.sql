-- Migration 027: Create student_report_cooldowns table for 30-minute student reporting cooldown
CREATE TABLE IF NOT EXISTS `student_report_cooldowns` (
  `Student_Number` VARCHAR(50) NOT NULL,
  `Last_Reported_At` DATETIME NOT NULL,
  `Cooldown_Until` DATETIME NOT NULL,
  `Last_Report_ID` INT(11) DEFAULT NULL,
  PRIMARY KEY (`Student_Number`),
  KEY `idx_src_cooldown_until` (`Cooldown_Until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
