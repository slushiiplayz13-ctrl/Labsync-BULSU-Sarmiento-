-- Migration 018: Add reservation date and time fields to key_authorization_requests
ALTER TABLE `key_authorization_requests`
ADD COLUMN `Reservation_Date` DATE NULL AFTER `Room_ID`,
ADD COLUMN `Start_Time` TIME NULL AFTER `Reservation_Date`,
ADD COLUMN `End_Time` TIME NULL AFTER `Start_Time`;

ALTER TABLE `key_authorization_requests`
ADD INDEX `idx_reservation_lookup` (`Room_ID`, `Reservation_Date`, `Status`);
