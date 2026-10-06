-- Migration 021: Add Student_Number column to maintenance table
ALTER TABLE `maintenance`
  ADD COLUMN `Student_Number` varchar(50) DEFAULT NULL AFTER `Student_Name`;
