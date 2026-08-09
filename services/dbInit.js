'use strict';

/**
 * services/dbInit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs all one-time database migrations on server startup.
 *
 * Each migration is isolated: if the change has already been applied (e.g.,
 * column already exists), the error is silently swallowed so the server still
 * boots cleanly.
 */

const db = require('../db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Runs a single DDL statement, ignoring the expected "already exists" errors.
 *
 * @param {string} sql
 * @param {string[]} ignoreCodes — MySQL error codes to treat as non-fatal
 */
async function safeDDL(sql, ignoreCodes = []) {
    try {
        await db.query(sql);
    } catch (err) {
        if (!ignoreCodes.includes(err.code) && !ignoreCodes.includes(err.errno)) {
            throw err; // Re-throw truly unexpected errors
        }
    }
}

// ─── Migration List ───────────────────────────────────────────────────────────

/**
 * Initialises the database schema additions required by LabSync v1.x.
 * Safe to call on every startup.
 */
async function initializeDatabase() {
    try {
        // ── users table columns ───────────────────────────────────────────────
        await safeDDL('ALTER TABLE users ADD COLUMN Reset_Token VARCHAR(255) NULL',           ['ER_DUP_FIELDNAME']);
        await safeDDL('ALTER TABLE users ADD COLUMN Reset_Token_Expiry DATETIME NULL',         ['ER_DUP_FIELDNAME']);
        await safeDDL('ALTER TABLE users ADD COLUMN Profile_Photo LONGTEXT NULL',              ['ER_DUP_FIELDNAME']);
        await safeDDL('ALTER TABLE users ADD COLUMN New_Email VARCHAR(255) NULL',              ['ER_DUP_FIELDNAME']);
        await safeDDL('ALTER TABLE users ADD COLUMN Email_Verify_Token VARCHAR(255) NULL',     ['ER_DUP_FIELDNAME']);
        await safeDDL('ALTER TABLE users ADD COLUMN Email_Verify_Token_Expiry DATETIME NULL',  ['ER_DUP_FIELDNAME']);
        await safeDDL('ALTER TABLE users ADD COLUMN Phone VARCHAR(20) NULL',                   ['ER_DUP_FIELDNAME']);

        // ── laboratories table ────────────────────────────────────────────────
        // Drop legacy Capacity column (no longer used)
        await safeDDL('ALTER TABLE laboratories DROP COLUMN Capacity',                         ['ER_CANT_DROP_FIELD_OR_KEY', 1091]);
        await safeDDL("ALTER TABLE laboratories ADD COLUMN Key_Status VARCHAR(20) DEFAULT 'Present'", ['ER_DUP_FIELDNAME']);

        // ── schedules table ───────────────────────────────────────────────────
        await safeDDL('ALTER TABLE schedules ADD COLUMN Color_Theme VARCHAR(50) NULL',         ['ER_DUP_FIELDNAME']);

        // ── system_settings table ─────────────────────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                Setting_Key   VARCHAR(50)  PRIMARY KEY,
                Setting_Value VARCHAR(255) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `);

        // Seed defaults only when the table is empty
        const [[{ count }]] = await db.query('SELECT COUNT(*) AS count FROM system_settings');
        if (count === 0) {
            await db.query(`
                INSERT INTO system_settings (Setting_Key, Setting_Value) VALUES
                    ('program_chair', 'ELENITA T. CAPARIÑO'),
                    ('campus_dean',   'DR. MARICEL BALIGOD')
            `);
        }

        // ── curriculum table ──────────────────────────────────────────────────
        await db.query(`
            CREATE TABLE IF NOT EXISTS curriculum (
                Curriculum_ID INT AUTO_INCREMENT PRIMARY KEY,
                Subject_Code  VARCHAR(50)  NULL,
                Subject_Name  VARCHAR(255) NOT NULL,
                Created_At    DATETIME     DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
        `);

        console.log('[dbInit] Database initialisation complete.');
    } catch (err) {
        console.error('[dbInit] Database initialisation failed:', err);
    }
}

module.exports = { initializeDatabase };
