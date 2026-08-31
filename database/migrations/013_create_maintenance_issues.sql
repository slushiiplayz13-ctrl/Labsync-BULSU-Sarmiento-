-- Migration: 013_create_maintenance_issues.sql
-- Description: Creates maintenance_issues table and links maintenance (student reports) to it with concurrency safeguards and conservative historical backfill.

CREATE TABLE IF NOT EXISTS maintenance_issues (
    Issue_ID INT AUTO_INCREMENT PRIMARY KEY,
    PC_ID INT NOT NULL,
    Issue_Type VARCHAR(50) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    Priority_Level VARCHAR(20) NOT NULL DEFAULT 'Low',
    Created_At DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    Resolved_At DATETIME NULL,
    Active_Issue_Key VARCHAR(80) GENERATED ALWAYS AS (
        IF(Status != 'Resolved', CONCAT(PC_ID, ':', Issue_Type), NULL)
    ) STORED,
    UNIQUE KEY uq_active_pc_issue (Active_Issue_Key),
    FOREIGN KEY (PC_ID) REFERENCES lab_units(PC_ID) ON DELETE CASCADE,
    INDEX idx_pc_issue_status (PC_ID, Status, Issue_Type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE maintenance
ADD COLUMN Maintenance_Issue_ID INT NULL AFTER PC_ID;

INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At)
SELECT 
    m.PC_ID,
    CASE 
        WHEN m.Issue_Description LIKE '%[Issues:%Monitor%]' THEN 'Monitor'
        WHEN m.Issue_Description LIKE '%[Issues:%Keyboard%]' THEN 'Keyboard'
        WHEN m.Issue_Description LIKE '%[Issues:%Mouse%]' THEN 'Mouse'
        WHEN m.Issue_Description LIKE '%[Issues:%System Unit%]' THEN 'System Unit'
        WHEN m.Issue_Description LIKE '%[Issues:%PC/Laptop%]' THEN 'PC/Laptop'
        ELSE 'Other'
    END AS Issue_Type,
    'Pending' AS Status,
    COALESCE(MAX(m.Priority_Level), 'Low') AS Priority_Level,
    MIN(m.Date_Reported) AS Created_At
FROM maintenance m
WHERE m.Status != 'Resolved' AND m.Maintenance_Issue_ID IS NULL
GROUP BY m.PC_ID, Issue_Type;

UPDATE maintenance m
JOIN (
    SELECT Issue_ID, PC_ID, Issue_Type
    FROM maintenance_issues
    WHERE Status != 'Resolved'
) i ON m.PC_ID = i.PC_ID 
   AND (
       CASE 
           WHEN m.Issue_Description LIKE '%[Issues:%Monitor%]' THEN 'Monitor'
           WHEN m.Issue_Description LIKE '%[Issues:%Keyboard%]' THEN 'Keyboard'
           WHEN m.Issue_Description LIKE '%[Issues:%Mouse%]' THEN 'Mouse'
           WHEN m.Issue_Description LIKE '%[Issues:%System Unit%]' THEN 'System Unit'
           WHEN m.Issue_Description LIKE '%[Issues:%PC/Laptop%]' THEN 'PC/Laptop'
           ELSE 'Other'
       END
   ) = i.Issue_Type
SET m.Maintenance_Issue_ID = i.Issue_ID
WHERE m.Status != 'Resolved' AND m.Maintenance_Issue_ID IS NULL;

INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At, Resolved_At)
SELECT 
    m.PC_ID,
    CASE 
        WHEN m.Issue_Description LIKE '%[Issues:%Monitor%]' THEN 'Monitor'
        WHEN m.Issue_Description LIKE '%[Issues:%Keyboard%]' THEN 'Keyboard'
        WHEN m.Issue_Description LIKE '%[Issues:%Mouse%]' THEN 'Mouse'
        WHEN m.Issue_Description LIKE '%[Issues:%System Unit%]' THEN 'System Unit'
        WHEN m.Issue_Description LIKE '%[Issues:%PC/Laptop%]' THEN 'PC/Laptop'
        ELSE 'Other'
    END AS Issue_Type,
    'Resolved' AS Status,
    COALESCE(m.Priority_Level, 'Low') AS Priority_Level,
    m.Date_Reported AS Created_At,
    m.Date_Reported AS Resolved_At
FROM maintenance m
WHERE m.Status = 'Resolved' AND m.Maintenance_Issue_ID IS NULL;

UPDATE maintenance m
JOIN maintenance_issues i ON m.PC_ID = i.PC_ID AND i.Status = 'Resolved' AND i.Created_At = m.Date_Reported
SET m.Maintenance_Issue_ID = i.Issue_ID
WHERE m.Status = 'Resolved' AND m.Maintenance_Issue_ID IS NULL;
