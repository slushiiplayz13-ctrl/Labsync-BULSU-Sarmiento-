CREATE TABLE IF NOT EXISTS system_settings (
    Setting_Key   VARCHAR(50)  PRIMARY KEY,
    Setting_Value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
