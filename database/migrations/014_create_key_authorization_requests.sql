-- Migration: Create key_authorization_requests table for multi-key approval workflow
CREATE TABLE IF NOT EXISTS `key_authorization_requests` (
    `Request_ID` INT AUTO_INCREMENT PRIMARY KEY,
    `User_ID` INT NOT NULL,
    `Room_ID` INT NOT NULL,
    `Reason` TEXT NOT NULL,
    `Status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CLAIMED', 'EXPIRED', 'COMPLETED') DEFAULT 'PENDING',
    `Requested_At` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `Approved_By` INT NULL,
    `Approved_At` DATETIME NULL,
    `Duration_Minutes` INT DEFAULT 120,
    `Expires_At` DATETIME NULL,
    `Rejection_Reason` TEXT NULL,
    `Claimed_At` DATETIME NULL,
    `Returned_At` DATETIME NULL,
    INDEX `idx_user_status` (`User_ID`, `Status`),
    INDEX `idx_room_status` (`Room_ID`, `Status`),
    FOREIGN KEY (`User_ID`) REFERENCES `users`(`User_ID`) ON DELETE CASCADE,
    FOREIGN KEY (`Room_ID`) REFERENCES `laboratories`(`Room_ID`) ON DELETE CASCADE,
    FOREIGN KEY (`Approved_By`) REFERENCES `users`(`User_ID`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
