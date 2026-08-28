ALTER TABLE schedules MODIFY COLUMN Subject_Name VARCHAR(255) DEFAULT NULL;

UPDATE schedules s
JOIN curriculum c ON (
  s.Subject_Name = c.Subject_Code
  OR s.Subject_Name LIKE CONCAT(c.Subject_Code, ' - %')
  OR s.Subject_Name LIKE CONCAT(c.Subject_Code, '%')
)
SET s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
WHERE c.Subject_Name IS NOT NULL;
