-- LabSync Canonical Database Schema Initialization Dump
-- Baseline schema for Bulacan State University - Sarmiento Campus

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `labsync`
--

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Name` varchar(100) DEFAULT NULL,
  `Email` varchar(50) DEFAULT NULL,
  `Role` varchar(20) DEFAULT NULL,
  `Status` varchar(20) NOT NULL DEFAULT 'ACTIVE',
  `OJT_Start_Date` date DEFAULT NULL,
  `OJT_End_Date` date DEFAULT NULL,
  `Password` varchar(255) DEFAULT NULL,
  `ID_QR_String` varchar(255) DEFAULT NULL,
  `Reset_Token` varchar(255) DEFAULT NULL,
  `Reset_Token_Expiry` datetime DEFAULT NULL,
  `Profile_Photo` longtext DEFAULT NULL,
  `New_Email` varchar(255) DEFAULT NULL,
  `Email_Verify_Token` varchar(255) DEFAULT NULL,
  `Email_Verify_Token_Expiry` datetime DEFAULT NULL,
  `Phone` varchar(20) DEFAULT NULL,
  `Has_Completed_Tutorial` tinyint(1) NOT NULL DEFAULT 0,
  `Updated_At` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`User_ID`),
  KEY `idx_users_status` (`Status`),
  KEY `idx_users_role_status` (`Role`, `Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `laboratories`
--

CREATE TABLE `laboratories` (
  `Room_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Room_Number` varchar(10) DEFAULT NULL,
  `Building` varchar(50) DEFAULT NULL,
  `Current_Status` varchar(255) DEFAULT 'Available',
  `Key_Status` varchar(20) DEFAULT 'Present',
  `Current_User_ID` int(11) DEFAULT NULL,
  `Last_Seen` datetime DEFAULT NULL,
  PRIMARY KEY (`Room_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lab_units`
--

CREATE TABLE `lab_units` (
  `PC_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Room_ID` int(11) DEFAULT NULL,
  `PC_Number` varchar(10) DEFAULT NULL,
  `Condition_Status` text DEFAULT NULL,
  `PC_QR_String` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`PC_ID`),
  KEY `Room_ID` (`Room_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `curriculum`
--

CREATE TABLE `curriculum` (
  `Curriculum_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Subject_Code` varchar(50) DEFAULT NULL,
  `Subject_Name` varchar(255) NOT NULL,
  `Created_At` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Curriculum_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `schedules`
--

CREATE TABLE `schedules` (
  `Schedule_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) DEFAULT NULL,
  `Room_ID` int(11) DEFAULT NULL,
  `Subject_Name` varchar(255) DEFAULT NULL,
  `Section` varchar(10) DEFAULT NULL,
  `Day_of_Week` varchar(20) DEFAULT NULL,
  `Start_Time` time DEFAULT NULL,
  `End_Time` time DEFAULT NULL,
  `Academic_Year` varchar(15) DEFAULT '2025-2026',
  `Semester` varchar(20) DEFAULT '1st Semester',
  `Color_Theme` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`Schedule_ID`),
  KEY `User_ID` (`User_ID`),
  KEY `Room_ID` (`Room_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `occupancy_log`
--

CREATE TABLE `occupancy_log` (
  `Log_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) DEFAULT NULL,
  `Room_ID` int(11) DEFAULT NULL,
  `Access_Time` datetime DEFAULT NULL,
  `Auth_Method` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`Log_ID`),
  KEY `User_ID` (`User_ID`),
  KEY `Room_ID` (`Room_ID`),
  KEY `idx_occupancy_access_time` (`Access_Time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `system_settings`
--

CREATE TABLE `system_settings` (
  `Setting_Key` varchar(50) NOT NULL,
  `Setting_Value` varchar(255) NOT NULL,
  PRIMARY KEY (`Setting_Key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `iot_devices`
--

CREATE TABLE `iot_devices` (
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

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `Log_ID` int(11) NOT NULL AUTO_INCREMENT,
  `User_ID` int(11) DEFAULT NULL,
  `Actor_Email` varchar(150) DEFAULT NULL,
  `Actor_Role` varchar(50) DEFAULT NULL,
  `Action` varchar(50) NOT NULL,
  `Resource_Type` varchar(50) NOT NULL,
  `Resource_ID` varchar(100) DEFAULT NULL,
  `Details` text DEFAULT NULL,
  `Result` varchar(20) NOT NULL DEFAULT 'SUCCESS',
  `IP_Address` varchar(45) DEFAULT NULL,
  `Created_At` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`Log_ID`),
  KEY `idx_audit_user` (`User_ID`),
  KEY `idx_audit_action` (`Action`),
  KEY `idx_audit_created` (`Created_At`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `laboratory_keys`
--

CREATE TABLE `laboratory_keys` (
  `Key_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Room_ID` int(11) NOT NULL,
  `Key_Code` varchar(50) NOT NULL,
  `Status` varchar(30) NOT NULL DEFAULT 'ACTIVE',
  `Created_At` datetime DEFAULT CURRENT_TIMESTAMP,
  `Updated_At` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Key_ID`),
  UNIQUE KEY `Key_Code` (`Key_Code`),
  KEY `idx_keys_room` (`Room_ID`),
  KEY `idx_keys_code` (`Key_Code`),
  KEY `idx_keys_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `key_found_reports`
--

CREATE TABLE `key_found_reports` (
  `Report_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Key_ID` int(11) NOT NULL,
  `Found_Location` text NOT NULL,
  `Found_At` datetime NOT NULL,
  `Finder_Contact` varchar(255) DEFAULT NULL,
  `Message` text DEFAULT NULL,
  `Status` varchar(30) NOT NULL DEFAULT 'OPEN',
  `Created_At` datetime DEFAULT CURRENT_TIMESTAMP,
  `Resolved_At` datetime DEFAULT NULL,
  PRIMARY KEY (`Report_ID`),
  KEY `idx_found_key` (`Key_ID`),
  KEY `idx_found_status` (`Status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `maintenance`
--

CREATE TABLE `maintenance` (
  `Report_ID` int(11) NOT NULL AUTO_INCREMENT,
  `PC_ID` int(11) DEFAULT NULL,
  `Maintenance_Issue_ID` int(11) DEFAULT NULL,
  `User_ID` int(11) DEFAULT NULL,
  `Student_Name` varchar(100) DEFAULT NULL,
  `Issue_Description` text DEFAULT NULL,
  `Date_Reported` datetime DEFAULT NULL,
  `Status` varchar(20) DEFAULT NULL,
  `Priority_Level` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`Report_ID`),
  KEY `PC_ID` (`PC_ID`),
  KEY `User_ID` (`User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `maintenance_issues`
--

CREATE TABLE `maintenance_issues` (
  `Issue_ID` int(11) NOT NULL AUTO_INCREMENT,
  `PC_ID` int(11) NOT NULL,
  `Issue_Type` varchar(50) NOT NULL,
  `Status` varchar(20) NOT NULL DEFAULT 'Pending',
  `Priority_Level` varchar(20) NOT NULL DEFAULT 'Low',
  `Created_At` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Resolved_At` datetime DEFAULT NULL,
  `Resolved_By_User_ID` int(11) DEFAULT NULL,
  `Active_Issue_Key` varchar(80) GENERATED ALWAYS AS (IF(`Status` != 'Resolved', CONCAT(`PC_ID`, ':', `Issue_Type`), NULL)) STORED,
  PRIMARY KEY (`Issue_ID`),
  UNIQUE KEY `uq_active_pc_issue` (`Active_Issue_Key`),
  KEY `idx_pc_issue_status` (`PC_ID`, `Status`, `Issue_Type`),
  KEY `idx_maintenance_resolved_by` (`Resolved_By_User_ID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Foreign Keys and Constraints
-- --------------------------------------------------------

ALTER TABLE `lab_units`
  ADD CONSTRAINT `lab_units_ibfk_1` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;

ALTER TABLE `schedules`
  ADD CONSTRAINT `schedules_ibfk_1` FOREIGN KEY (`User_ID`) REFERENCES `users` (`User_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `schedules_ibfk_2` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;

ALTER TABLE `occupancy_log`
  ADD CONSTRAINT `occupancy_log_ibfk_1` FOREIGN KEY (`User_ID`) REFERENCES `users` (`User_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `occupancy_log_ibfk_2` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;

ALTER TABLE `laboratory_keys`
  ADD CONSTRAINT `fk_lab_keys_room` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;

ALTER TABLE `key_found_reports`
  ADD CONSTRAINT `fk_key_found_reports_key` FOREIGN KEY (`Key_ID`) REFERENCES `laboratory_keys` (`Key_ID`) ON DELETE CASCADE;

ALTER TABLE `maintenance`
  ADD CONSTRAINT `maintenance_ibfk_1` FOREIGN KEY (`PC_ID`) REFERENCES `lab_units` (`PC_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `maintenance_ibfk_2` FOREIGN KEY (`User_ID`) REFERENCES `users` (`User_ID`) ON DELETE SET NULL;

ALTER TABLE `maintenance_issues`
  ADD CONSTRAINT `maintenance_issues_ibfk_1` FOREIGN KEY (`PC_ID`) REFERENCES `lab_units` (`PC_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_maintenance_issues_resolved_by` FOREIGN KEY (`Resolved_By_User_ID`) REFERENCES `users` (`User_ID`) ON DELETE SET NULL;

-- --------------------------------------------------------
-- Seed Data
-- --------------------------------------------------------

-- Seed institutional settings
INSERT INTO `system_settings` (`Setting_Key`, `Setting_Value`) VALUES
('campus_dean', 'DR. MARICEL BALIGOD'),
('program_chair', 'ELENITA T. CAPARIÑO');

-- Seed standard physical laboratories
INSERT INTO `laboratories` (`Room_ID`, `Room_Number`, `Building`, `Current_Status`, `Key_Status`) VALUES
(1, '204', 'Bldg. B', 'Available', 'Present'),
(6, '203', 'Bldg. E', 'Available', 'Present'),
(68, '205', 'Bldg. B', 'Available', 'Present'),
(69, '206', 'Bldg. B', 'Available', 'Present'),
(70, '303', 'Bldg. B', 'Available', 'Present'),
(71, '304', 'Bldg. B', 'Available', 'Present'),
(72, '305', 'Bldg. B', 'Available', 'Present'),
(73, '306', 'Bldg. B', 'Available', 'Present');

COMMIT;
