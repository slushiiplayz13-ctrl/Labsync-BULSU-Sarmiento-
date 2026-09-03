'use strict';

/**
 * repositories/keys.repository.js
 * Database operations for laboratory physical keys and transfer tracking.
 */

const db = require('../database/connection');

async function findAllKeysWithRoomDetails(executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status, k.Created_At, k.Updated_At,
               r.Room_Number, r.Building, r.Key_Status AS Room_Key_Status, r.Current_User_ID,
               u.Name AS Current_Holder_Name,
               (SELECT MAX(Access_Time) FROM occupancy_log ol WHERE ol.Room_ID = k.Room_ID) AS Last_Taken_At,
               (SELECT MAX(Access_Time) FROM occupancy_log ol WHERE ol.Room_ID = k.Room_ID) AS Last_Activity_At
        FROM laboratory_keys k
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        LEFT JOIN users u ON r.Current_User_ID = u.User_ID
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

async function findKeyWithRoomAndHolder(keyCode, executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status, k.Created_At, k.Updated_At,
               r.Room_Number, r.Building, r.Key_Status AS Room_Key_Status, r.Current_User_ID,
               u.Name AS Current_Holder_Name, u.Email AS Current_Holder_Email, u.Role AS Current_Holder_Role
        FROM laboratory_keys k
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        LEFT JOIN users u ON r.Current_User_ID = u.User_ID
        WHERE k.Key_Code = ?
    `, [keyCode]);
}

async function findKeyWithRoomForUpdate(keyCode, executor = db) {
    return executor.query(`
        SELECT k.Key_ID, k.Room_ID, k.Key_Code, k.Status,
               r.Room_Number, r.Building, r.Current_User_ID, r.Key_Status AS Room_Key_Status
        FROM laboratory_keys k
        JOIN laboratories r ON k.Room_ID = r.Room_ID
        WHERE k.Key_Code = ?
        FOR UPDATE
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

module.exports = {
    findAllKeysWithRoomDetails,
    findByKeyCode,
    findKeyWithRoomAndHolder,
    findKeyWithRoomForUpdate,
    findKeyById,
    findKeysByRoomId,
    insertKey,
    updateKeyStatus
};
