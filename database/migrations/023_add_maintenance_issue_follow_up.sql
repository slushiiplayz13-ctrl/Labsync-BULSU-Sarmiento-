-- Migration: 023_add_maintenance_issue_follow_up.sql
-- Description: Adds follow-up tracking fields to maintenance_issues for IT Dept. Head escalation.

ALTER TABLE maintenance_issues
ADD COLUMN Follow_Up_Count INT NOT NULL DEFAULT 0 AFTER Resolved_By_User_ID;

ALTER TABLE maintenance_issues
ADD COLUMN Followed_Up_At DATETIME NULL AFTER Follow_Up_Count;

ALTER TABLE maintenance_issues
ADD COLUMN Followed_Up_By_User_ID INT NULL AFTER Followed_Up_At;

ALTER TABLE maintenance_issues
ADD CONSTRAINT fk_maintenance_issues_followed_up_by 
    FOREIGN KEY (Followed_Up_By_User_ID) REFERENCES users(User_ID) ON DELETE SET NULL;

ALTER TABLE maintenance_issues
ADD INDEX idx_maintenance_followed_up_by (Followed_Up_By_User_ID);
