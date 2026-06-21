-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 02, 2026 at 03:23 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

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
-- Table structure for table `laboratories`
--

CREATE TABLE `laboratories` (
  `Room_ID` int(11) NOT NULL,
  `Room_Number` varchar(10) DEFAULT NULL,
  `Building` varchar(50) DEFAULT NULL,
  `Current_Status` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `lab_units`
--

CREATE TABLE `lab_units` (
  `PC_ID` int(11) NOT NULL,
  `Room_ID` int(11) DEFAULT NULL,
  `PC_Number` varchar(10) DEFAULT NULL,
  `Condition_Status` text DEFAULT NULL,
  `PC_QR_String` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `maintenance`
--

CREATE TABLE `maintenance` (
  `Report_ID` int(11) NOT NULL,
  `PC_ID` int(11) DEFAULT NULL,
  `User_ID` int(11) DEFAULT NULL,
  `Student_Name` varchar(100) DEFAULT NULL,
  `Issue_Description` text DEFAULT NULL,
  `Date_Reported` datetime DEFAULT NULL,
  `Status` varchar(20) DEFAULT NULL,
  `Priority_Level` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `occupancy_log`
--

CREATE TABLE `occupancy_log` (
  `Log_ID` int(11) NOT NULL,
  `User_ID` int(11) DEFAULT NULL,
  `Room_ID` int(11) DEFAULT NULL,
  `Access_Time` datetime DEFAULT NULL,
  `Auth_Method` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `schedules`
--

CREATE TABLE `schedules` (
  `Schedule_ID` int(11) NOT NULL,
  `User_ID` int(11) DEFAULT NULL,
  `Room_ID` int(11) DEFAULT NULL,
  `Subject_Name` varchar(15) DEFAULT NULL,
  `Section` varchar(10) DEFAULT NULL,
  `Day_of_Week` varchar(20) DEFAULT NULL,
  `Start_Time` time DEFAULT NULL,
  `End_Time` time DEFAULT NULL,
  `Academic_Year` varchar(15) DEFAULT '2025-2026',
  `Semester` varchar(20) DEFAULT '1st Semester'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `User_ID` int(11) NOT NULL,
  `Name` varchar(100) DEFAULT NULL,
  `Email` varchar(50) DEFAULT NULL,
  `Role` varchar(20) DEFAULT NULL,
  `Password` varchar(255) DEFAULT NULL,
  `ID_QR_String` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `laboratories`
--
ALTER TABLE `laboratories`
  ADD PRIMARY KEY (`Room_ID`);

--
-- Indexes for table `lab_units`
--
ALTER TABLE `lab_units`
  ADD PRIMARY KEY (`PC_ID`),
  ADD KEY `Room_ID` (`Room_ID`);

--
-- Indexes for table `maintenance`
--
ALTER TABLE `maintenance`
  ADD PRIMARY KEY (`Report_ID`),
  ADD KEY `PC_ID` (`PC_ID`),
  ADD KEY `User_ID` (`User_ID`);

--
-- Indexes for table `occupancy_log`
--
ALTER TABLE `occupancy_log`
  ADD PRIMARY KEY (`Log_ID`),
  ADD KEY `User_ID` (`User_ID`),
  ADD KEY `Room_ID` (`Room_ID`);

--
-- Indexes for table `schedules`
--
ALTER TABLE `schedules`
  ADD PRIMARY KEY (`Schedule_ID`),
  ADD KEY `User_ID` (`User_ID`),
  ADD KEY `Room_ID` (`Room_ID`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`User_ID`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `laboratories`
--
ALTER TABLE `laboratories`
  MODIFY `Room_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lab_units`
--
ALTER TABLE `lab_units`
  MODIFY `PC_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `maintenance`
--
ALTER TABLE `maintenance`
  MODIFY `Report_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `occupancy_log`
--
ALTER TABLE `occupancy_log`
  MODIFY `Log_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `schedules`
--
ALTER TABLE `schedules`
  MODIFY `Schedule_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `User_ID` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `lab_units`
--
ALTER TABLE `lab_units`
  ADD CONSTRAINT `lab_units_ibfk_1` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;

--
-- Constraints for table `maintenance`
--
ALTER TABLE `maintenance`
  ADD CONSTRAINT `maintenance_ibfk_1` FOREIGN KEY (`PC_ID`) REFERENCES `lab_units` (`PC_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `maintenance_ibfk_2` FOREIGN KEY (`User_ID`) REFERENCES `users` (`User_ID`) ON DELETE SET NULL;

--
-- Constraints for table `occupancy_log`
--
ALTER TABLE `occupancy_log`
  ADD CONSTRAINT `occupancy_log_ibfk_1` FOREIGN KEY (`User_ID`) REFERENCES `users` (`User_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `occupancy_log_ibfk_2` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;

--
-- Constraints for table `schedules`
--
ALTER TABLE `schedules`
  ADD CONSTRAINT `schedules_ibfk_1` FOREIGN KEY (`User_ID`) REFERENCES `users` (`User_ID`) ON DELETE CASCADE,
  ADD CONSTRAINT `schedules_ibfk_2` FOREIGN KEY (`Room_ID`) REFERENCES `laboratories` (`Room_ID`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
