'use strict';

/**
 * repositories/keys.repository.js
 * Database operations for laboratory physical keys and lost/found reports.
 */

const db = require('../database/connection');

async function findAllKeysWithRoomDetails(executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status, k.Created_At, k.Updated_At,
               r.Room_Number, r.Building,
               (SELECT MAX(Access_Time) FROM occupancy_log ol WHERE ol.Room_ID = k.Room_ID) AS Last_Taken_At,
               (SELECT COUNT(*) FROM key_found_reports rpt WHERE rpt.Key_ID = k.Key_ID AND rpt.Status = 'OPEN') AS Open_Reports_Count
        FROM laboratory_keys k
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        ORDER BY CAST(r.Room_Number AS UNSIGNED) ASC, k.Key_Code ASC
    `);
}

async function findByKeyCode(keyCode, executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status, k.Created_At, k.Updated_At,
               r.Room_Number, r.Building
        FROM laboratory_keys k
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        WHERE k.Key_Code = ?
    `, [keyCode]);
}

async function findKeyById(keyId, executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status, k.Created_At, k.Updated_At,
               r.Room_Number, r.Building
        FROM laboratory_keys k
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        WHERE k.Key_ID = ?
    `, [keyId]);
}

async function findKeysByRoomId(roomId, executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status, k.Created_At, k.Updated_At
        FROM laboratory_keys k
        WHERE k.Room_ID = ?
        ORDER BY k.Key_Code ASC
    `, [roomId]);
}

async function insertKey(roomId, keyCode, status = 'ACTIVE', executor = db) {
    return executor.query(
        'INSERT INTO laboratory_keys (Room_ID, Key_Code, Status) VALUES (?, ?, ?)',
        [roomId, keyCode, status]
    );
}

async function updateKeyStatus(keyId, status, executor = db) {
    return executor.query(
        'UPDATE laboratory_keys SET Status = ?, Updated_At = NOW() WHERE Key_ID = ?',
        [status, keyId]
    );
}

async function insertFoundReport(keyId, foundLocation, foundAt, finderContact, message, executor = db) {
    return executor.query(
        `INSERT INTO key_found_reports (Key_ID, Found_Location, Found_At, Finder_Contact, Message, Status)
         VALUES (?, ?, ?, ?, ?, 'OPEN')`,
        [keyId, foundLocation, foundAt, finderContact || null, message || null]
    );
}

async function findFoundReportsByKeyId(keyId, executor = db) {
    return executor.query(
        'SELECT * FROM key_found_reports WHERE Key_ID = ? ORDER BY Created_At DESC',
        [keyId]
    );
}

async function findAllFoundReports(executor = db) {
    return executor.query(`
        SELECT rpt.*, k.Key_Code, k.Status AS Key_Status, r.Room_Number, r.Building
        FROM key_found_reports rpt
        JOIN laboratory_keys k ON rpt.Key_ID = k.Key_ID
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        ORDER BY rpt.Created_At DESC
    `);
}

async function resolveFoundReportsForKey(keyId, executor = db) {
    return executor.query(
        "UPDATE key_found_reports SET Status = 'RESOLVED', Resolved_At = NOW() WHERE Key_ID = ? AND Status = 'OPEN'",
        [keyId]
    );
}

async function resolveFoundReportById(reportId, executor = db) {
    return executor.query(
        "UPDATE key_found_reports SET Status = 'RESOLVED', Resolved_At = NOW() WHERE Report_ID = ?",
        [reportId]
    );
}

module.exports = {
    findAllKeysWithRoomDetails,
    findByKeyCode,
    findKeyById,
    findKeysByRoomId,
    insertKey,
    updateKeyStatus,
    insertFoundReport,
    findFoundReportsByKeyId,
    findAllFoundReports,
    resolveFoundReportsForKey,
    resolveFoundReportById
};
