'use strict';

/**
 * repositories/occupancy.repository.js
 * Database operations for laboratory occupancy activity logs (occupancy_log table).
 *
 * Retention Policy:
 * Room Status activity logs are retained for 1 year. Logs older than 1 year
 * are automatically cleaned up to control database growth and maintain system performance.
 */

const db = require('../database/connection');

/**
 * Deletes occupancy logs older than the specified cutoff date.
 * Uses the indexed `Access_Time` column for high-performance direct deletion.
 *
 * @param {Date|string} cutoffDate - Threshold date; records with Access_Time < cutoffDate are deleted.
 * @param {object} [executor=db] - Query executor or transaction connection.
 * @returns {Promise<[import('mysql2').ResultSetHeader, any]>}
 */
async function deleteLogsOlderThan(cutoffDate, executor = db) {
    return executor.query(
        'DELETE FROM occupancy_log WHERE Access_Time < ?',
        [cutoffDate]
    );
}

/**
 * Counts occupancy logs older than the specified cutoff date.
 * Useful for diagnostics and test verifications.
 *
 * @param {Date|string} cutoffDate
 * @param {object} [executor=db]
 * @returns {Promise<number>}
 */
async function countLogsOlderThan(cutoffDate, executor = db) {
    const [rows] = await executor.query(
        'SELECT COUNT(*) AS total FROM occupancy_log WHERE Access_Time < ?',
        [cutoffDate]
    );
    return rows[0] ? Number(rows[0].total) : 0;
}

/**
 * Counts total occupancy logs currently stored.
 *
 * @param {object} [executor=db]
 * @returns {Promise<number>}
 */
async function countAllLogs(executor = db) {
    const [rows] = await executor.query(
        'SELECT COUNT(*) AS total FROM occupancy_log'
    );
    return rows[0] ? Number(rows[0].total) : 0;
}

/**
 * Inserts a new occupancy record.
 * Supports custom historical timestamps for unit testing or defaults to NOW().
 *
 * @param {number|null} userId
 * @param {number|null} roomId
 * @param {string} authMethod
 * @param {Date|string|null} [accessTime=null]
 * @param {object} [executor=db]
 * @returns {Promise<[import('mysql2').ResultSetHeader, any]>}
 */
async function insertLog(userId, roomId, authMethod, accessTime = null, executor = db) {
    if (accessTime) {
        return executor.query(
            'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, ?, ?)',
            [userId, roomId, accessTime, authMethod]
        );
    }
    return executor.query(
        'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
        [userId, roomId, authMethod]
    );
}

module.exports = {
    deleteLogsOlderThan,
    countLogsOlderThan,
    countAllLogs,
    insertLog
};
