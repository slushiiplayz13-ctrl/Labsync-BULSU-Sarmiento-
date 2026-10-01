-- Migration 020: Add retry tracking fields to schedule_key_reminders
-- Supports resilient retry of failed reminders and recovery of stale claims
-- without removing database-level uniqueness.

ALTER TABLE `schedule_key_reminders`
ADD COLUMN `Retry_Count` INT NOT NULL DEFAULT 0 AFTER `Status`,
ADD COLUMN `Last_Attempt_At` DATETIME NULL AFTER `Retry_Count`;
