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

async function findActivityLogsForReport({ startDateTime, endDateTime, roomNumber = null, excludeIntermediateQr = true }, executor = db) {
    let sql = `
        SELECT 
            o.Log_ID AS id,
            o.Access_Time AS access_time,
            DATE_FORMAT(o.Access_Time, '%Y-%m-%d') AS log_date,
            DATE_FORMAT(o.Access_Time, '%h:%i %p') AS log_time,
            r.Room_ID AS room_id,
            r.Room_Number AS room_number,
            r.Building AS building,
            o.Auth_Method AS raw_auth_method,
            o.User_ID AS user_id,
            u.Name AS user_name,
            u.Role AS user_role,
            (CASE 
                WHEN o.Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT') THEN 'Unidentified Person'
                WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Unidentified Person'
                WHEN o.User_ID IS NULL THEN 'System'
                ELSE COALESCE(u.Name, 'System')
            END) AS actor_name,
            (CASE 
                WHEN o.Auth_Method = 'UNAUTHORIZED' THEN 'Security Alert'
                WHEN o.Auth_Method = 'WRONG_SLOT' THEN 'Hardware Warning'
                WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Alarm Cleared'
                WHEN o.User_ID IS NULL THEN 'System'
                ELSE COALESCE(u.Role, 'N/A')
            END) AS actor_role,
            (CASE 
                WHEN o.Auth_Method = 'Key Taken' AND o.User_ID IS NOT NULL AND EXISTS (
                    SELECT 1 FROM schedules s 
                    WHERE s.Room_ID = o.Room_ID 
                      AND s.User_ID = o.User_ID
                      AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                      AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time
                ) THEN 'In Session'
                WHEN o.Auth_Method = 'Key Taken' THEN 'Borrowed'
                ELSE NULL
            END) AS session_type
        FROM occupancy_log o
        LEFT JOIN users u ON o.User_ID = u.User_ID
        JOIN laboratories r ON o.Room_ID = r.Room_ID
        WHERE o.Access_Time >= ? AND o.Access_Time <= ?
    `;

    const params = [startDateTime, endDateTime];

    if (excludeIntermediateQr) {
        sql += ` AND LOWER(o.Auth_Method) NOT IN ('qr code', 'qr verified', 'qr')`;
    }

    if (roomNumber && String(roomNumber).toLowerCase() !== 'all') {
        sql += ` AND r.Room_Number = ?`;
        params.push(String(roomNumber));
    }

    sql += ` ORDER BY o.Access_Time DESC, o.Log_ID DESC`;

    return executor.query(sql, params);
}

/**
 * Retrieves valid laboratory rooms for room filtering in reports.
 *
 * @param {object} [executor=db]
 * @returns {Promise<[Array, any]>}
 */
async function getAvailableRoomsForReport(executor = db) {
    return executor.query(
        'SELECT Room_ID, Room_Number, Building FROM laboratories ORDER BY Room_Number ASC'
    );
}

module.exports = {
    deleteLogsOlderThan,
    countLogsOlderThan,
    countAllLogs,
    insertLog,
    findActivityLogsForReport,
    getAvailableRoomsForReport
};
