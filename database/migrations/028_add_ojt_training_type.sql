-- Migration: 028_add_ojt_training_type.sql
-- Description: Adds Training_Type column to the users table for On-the-Job Trainee classification (Internship vs Work Immersion).

ALTER TABLE users ADD COLUMN Training_Type VARCHAR(50) NULL AFTER OJT_End_Date;
