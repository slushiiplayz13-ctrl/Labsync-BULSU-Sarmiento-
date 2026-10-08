'use strict';

/**
 * repositories/mis.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for MIS Staff account lifecycle management.
 * All mutations are strictly constrained to records where Role = 'MIS Staff'.
 */

const db = require('../database/connection');

/**
 * Retrieves the currently active MIS Staff account.
 */
async function findActiveMisStaff(executor = db) {
    return executor.query(
        `SELECT 
            User_ID, 
            Name, 
            Email, 
            Role, 
            Status, 
            Phone, 
            Profile_Photo, 
            Updated_At 
         FROM users 
         WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' 
         LIMIT 1`
    );
}

/**
 * Retrieves the active MIS Staff account with exclusive row locking (FOR UPDATE)
 * inside a database transaction to prevent concurrent duplicate activations.
 */
async function findActiveMisStaffForUpdate(connection) {
    return connection.query(
        `SELECT 
            User_ID, 
            Name, 
            Email, 
            Role, 
            Status 
         FROM users 
         WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' 
         FOR UPDATE`
    );
}

/**
 * Retrieves all MIS Staff accounts (active and deactivated) for auditing.
 */
async function findAllMisStaff(executor = db) {
    return executor.query(
        `SELECT 
            User_ID, 
            Name, 
            Email, 
            Role, 
            Status, 
            Phone, 
            Profile_Photo, 
            Updated_At 
         FROM users 
         WHERE Role = 'MIS Staff' 
         ORDER BY FIELD(Status, 'ACTIVE', 'DEACTIVATED'), User_ID DESC`
    );
}

/**
 * Retrieves a single MIS Staff account by User_ID.
 */
async function findById(userId, executor = db) {
    return executor.query(
        `SELECT 
            User_ID, 
            Name, 
            Email, 
            Role, 
            Status, 
            Phone, 
            Profile_Photo, 
            Updated_At 
         FROM users 
         WHERE User_ID = ? AND Role = 'MIS Staff'`,
        [userId]
    );
}

/**
 * Inserts a new MIS Staff account record.
 * Role is strictly 'MIS Staff' and Status is 'ACTIVE'.
 */
async function insertMisStaff({ name, email, passwordHash, phone = null, qrString }, executor = db) {
    return executor.query(
        `INSERT INTO users (
            Name, 
            Email, 
            Role, 
            Status, 
            Password, 
            Phone, 
            ID_QR_String, 
            Has_Completed_Tutorial
         ) VALUES (?, ?, 'MIS Staff', 'ACTIVE', ?, ?, ?, 0)`,
        [name, email, passwordHash, phone, qrString]
    );
}

/**
 * Updates profile details (Name, Email, Phone) for an MIS Staff account.
 */
async function updateMisStaff(userId, { name, email, phone = null }, executor = db) {
    return executor.query(
        `UPDATE users 
         SET Name = ?, 
             Email = ?, 
             Phone = ?, 
             Updated_At = NOW() 
         WHERE User_ID = ? AND Role = 'MIS Staff'`,
        [name, email, phone, userId]
    );
}

/**
 * Updates lifecycle status (ACTIVE or DEACTIVATED) for an MIS Staff account.
 */
async function updateStatus(userId, status, executor = db) {
    return executor.query(
        `UPDATE users 
         SET Status = ?, 
             Updated_At = NOW() 
         WHERE User_ID = ? AND Role = 'MIS Staff'`,
        [status, userId]
    );
}

/**
 * Named advisory lock constant for active MIS Staff lifecycle mutations.
 */
const MIS_LIFECYCLE_LOCK_NAME = 'labsync_active_mis_lifecycle_lock';
const MIS_LIFECYCLE_LOCK_TIMEOUT_SECONDS = 10;

/**
 * Transaction helper that serializes MIS Staff active lifecycle state
 * using a MariaDB named advisory lock ('labsync_active_mis_lifecycle_lock').
 * Prevents gap-lock deadlocks when zero active MIS rows exist concurrently.
 */
async function withLifecycleLockAndTransaction(workFn) {
    const connection = await db.getConnection();
    let lockAcquired = false;
    try {
        const [lockRows] = await connection.query(
            'SELECT GET_LOCK(?, ?) AS lock_status',
            [MIS_LIFECYCLE_LOCK_NAME, MIS_LIFECYCLE_LOCK_TIMEOUT_SECONDS]
        );
        const lockStatus = lockRows && lockRows[0] ? lockRows[0].lock_status : null;
        if (lockStatus !== 1) {
            return {
                lockFailed: true,
                error: 'Could not obtain active MIS Staff lifecycle lock. Please try again in a few moments.'
            };
        }
        lockAcquired = true;

        await connection.beginTransaction();
        const result = await workFn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback().catch(() => {});
        throw err;
    } finally {
        if (lockAcquired) {
            try {
                await connection.query('SELECT RELEASE_LOCK(?)', [MIS_LIFECYCLE_LOCK_NAME]);
            } catch (releaseErr) {
                console.error('[misRepository] Error releasing lifecycle lock:', releaseErr);
            }
        }
        connection.release();
    }
}

/**
 * Transaction helper ensuring transactional commit or rollback.
 */
async function withTransaction(workFn) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await workFn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = {
    findActiveMisStaff,
    findActiveMisStaffForUpdate,
    findAllMisStaff,
    findById,
    insertMisStaff,
    updateMisStaff,
    updateStatus,
    withTransaction,
    withLifecycleLockAndTransaction
};
