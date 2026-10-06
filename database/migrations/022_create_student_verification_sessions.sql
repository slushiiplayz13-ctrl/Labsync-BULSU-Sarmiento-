-- Migration 022: Create student_verification_sessions table for persistent replay protection
CREATE TABLE IF NOT EXISTS `student_verification_sessions` (
  `Session_ID` int(11) NOT NULL AUTO_INCREMENT,
  `Verification_ID` varchar(64) NOT NULL,
  `Nonce` varchar(64) NOT NULL,
  `Student_Name` varchar(100) NOT NULL,
  `Student_Number` varchar(50) NOT NULL,
  `Room_Number` varchar(50) NOT NULL,
  `PC_Number` varchar(50) NOT NULL,
  `Issued_At` datetime NOT NULL,
  `Expires_At` datetime NOT NULL,
  `Used_At` datetime DEFAULT NULL,
  PRIMARY KEY (`Session_ID`),
  UNIQUE KEY `idx_svs_nonce` (`Nonce`),
  KEY `idx_svs_verification_id` (`Verification_ID`),
  KEY `idx_svs_expires_at` (`Expires_At`),
  KEY `idx_svs_used_at` (`Used_At`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
