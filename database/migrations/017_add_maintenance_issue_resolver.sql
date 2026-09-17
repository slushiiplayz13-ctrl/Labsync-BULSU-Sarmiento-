-- Migration: 017_add_maintenance_issue_resolver.sql
-- Description: Adds nullable foreign key to maintenance_issues to attribute the authenticated resolver.

ALTER TABLE maintenance_issues
ADD COLUMN Resolved_By_User_ID INT NULL AFTER Resolved_At;

ALTER TABLE maintenance_issues
ADD CONSTRAINT fk_maintenance_issues_resolved_by 
    FOREIGN KEY (Resolved_By_User_ID) REFERENCES users(User_ID) ON DELETE SET NULL;

ALTER TABLE maintenance_issues
ADD INDEX idx_maintenance_resolved_by (Resolved_By_User_ID);
