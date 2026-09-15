-- Migration: 016_add_user_lifecycle_fields.sql
-- Description: Adds account lifecycle status and OJT duration fields to the users table.

ALTER TABLE users ADD COLUMN Status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' AFTER Role;
ALTER TABLE users ADD COLUMN OJT_Start_Date DATE NULL AFTER Status;
ALTER TABLE users ADD COLUMN OJT_End_Date DATE NULL AFTER OJT_Start_Date;

ALTER TABLE users ADD INDEX idx_users_status (Status);
ALTER TABLE users ADD INDEX idx_users_role_status (Role, Status);
