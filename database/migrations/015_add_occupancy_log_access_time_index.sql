-- Migration: 015_add_occupancy_log_access_time_index.sql
-- Description: Adds an index on occupancy_log(Access_Time) to support high-performance 1-year retention cleanup and rapid timeline ordering.

ALTER TABLE `occupancy_log` ADD INDEX `idx_occupancy_access_time` (`Access_Time`);
