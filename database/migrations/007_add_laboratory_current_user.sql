-- Add Current_User_ID to laboratories table to track key holder
ALTER TABLE laboratories ADD COLUMN Current_User_ID INT NULL;
