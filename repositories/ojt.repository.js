'use strict';

/**
 * repositories/ojt.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for OJT (On-the-Job Training) account lifecycle management.
 * All mutations are strictly constrained to records where Role = 'OJT'.
 */

const db = require('../database/connection');

/**
 * Retrieves all OJT user accounts.
 * Passwords and sensitive tokens are strictly excluded from projection.
 */
async function findAll(executor = db) {
    return executor.query(
        `SELECT 
            User_ID, 
            Name, 
            Email, 
            Role, 
            Status, 
            Profile_Photo, 
            DATE_FORMAT(OJT_Start_Date, '%Y-%m-%d') AS OJT_Start_Date, 
            DATE_FORMAT(OJT_End_Date, '%Y-%m-%d') AS OJT_End_Date, 
            Phone, 
            Updated_At 
         FROM users 
         WHERE Role = 'OJT' 
         ORDER BY User_ID DESC`
    );
}

/**
 * Retrieves a single OJT account by User_ID.
 * Strictly filters by Role = 'OJT'.
 */
async function findById(userId, executor = db) {
    return executor.query(
        `SELECT 
            User_ID, 
            Name, 
            Email, 
            Role, 
            Status, 
            Profile_Photo, 
            DATE_FORMAT(OJT_Start_Date, '%Y-%m-%d') AS OJT_Start_Date, 
            DATE_FORMAT(OJT_End_Date, '%Y-%m-%d') AS OJT_End_Date, 
            Phone, 
            Updated_At 
         FROM users 
         WHERE User_ID = ? AND Role = 'OJT'`,
        [userId]
    );
}

/**
 * Retrieves basic role and status information for any user by User_ID.
 * Used for authoritative target-role boundary checks (distinguishing 404 from 403).
 */
async function findUserRoleAndStatus(userId, executor = db) {
    return executor.query(
        'SELECT User_ID, Role, Status, Email, Name FROM users WHERE User_ID = ?',
        [userId]
    );
}

/**
 * Inserts a new OJT user record.
 * Role is hardcoded to 'OJT' and Status to 'ACTIVE'.
 */
async function insertOjt({ name, email, passwordHash, startDate, endDate, phone = null, qrString }, executor = db) {
    return executor.query(
        `INSERT INTO users (
            Name, 
            Email, 
            Role, 
            Status, 
            Password, 
            OJT_Start_Date, 
            OJT_End_Date, 
            Phone, 
            ID_QR_String, 
            Has_Completed_Tutorial
         ) VALUES (?, ?, 'OJT', 'ACTIVE', ?, ?, ?, ?, ?, 0)`,
        [name, email, passwordHash, startDate, endDate, phone, qrString]
    );
}

/**
 * Updates profile details and internship dates for an OJT account.
 * Scoped strictly to User_ID AND Role = 'OJT'.
 */
async function updateOjt(userId, { name, email, startDate, endDate, phone = null }, executor = db) {
    return executor.query(
        `UPDATE users 
         SET Name = ?, 
             Email = ?, 
             OJT_Start_Date = ?, 
             OJT_End_Date = ?, 
             Phone = ?, 
             Updated_At = NOW() 
         WHERE User_ID = ? AND Role = 'OJT'`,
        [name, email, startDate, endDate, phone, userId]
    );
}

/**
 * Updates account lifecycle status (ACTIVE or DEACTIVATED).
 * Scoped strictly to User_ID AND Role = 'OJT'.
 */
async function updateStatus(userId, status, executor = db) {
    return executor.query(
        `UPDATE users 
         SET Status = ?, 
             Updated_At = NOW() 
         WHERE User_ID = ? AND Role = 'OJT'`,
        [status, userId]
    );
}

/**
 * Updates account password hash for an OJT account.
 * Scoped strictly to User_ID AND Role = 'OJT'.
 */
async function updatePassword(userId, passwordHash, executor = db) {
    return executor.query(
        `UPDATE users 
         SET Password = ?, 
             Reset_Token = NULL, 
             Reset_Token_Expiry = NULL, 
             Updated_At = NOW() 
         WHERE User_ID = ? AND Role = 'OJT'`,
        [passwordHash, userId]
    );
}

module.exports = {
    findAll,
    findById,
    findUserRoleAndStatus,
    insertOjt,
    updateOjt,
    updateStatus,
    updatePassword
};
