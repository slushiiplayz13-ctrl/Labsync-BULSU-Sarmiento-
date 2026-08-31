'use strict';

const db = require('../database/connection');

async function insertOccupancyLog(userId, roomId, authMethod, executor = db) {
    return executor.query(
        'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
        [userId, roomId, authMethod]
    );
}

async function getConnection() {
    return db.getConnection();
}

async function withTransaction(workFn) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await workFn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        console.error('Error executing transaction in iotRepository:', err);
        throw err;
    } finally {
        connection.release();
    }
}

async function findByTokenHash(tokenHash, executor = db) {
    return executor.query(
        'SELECT Device_ID, Device_Name, Token_Hash, Authorized_Rooms, Is_Active, Last_Seen FROM iot_devices WHERE Token_Hash = ?',
        [tokenHash]
    );
}

async function findDeviceById(deviceId, executor = db) {
    return executor.query(
        'SELECT Device_ID, Device_Name, Token_Hash, Authorized_Rooms, Is_Active, Last_Seen FROM iot_devices WHERE Device_ID = ?',
        [deviceId]
    );
}

async function updateDeviceLastSeen(deviceId, executor = db) {
    return executor.query('UPDATE iot_devices SET Last_Seen = NOW() WHERE Device_ID = ?', [deviceId]);
}

async function updateDeviceTokenHash(deviceId, tokenHash, executor = db) {
    return executor.query('UPDATE iot_devices SET Token_Hash = ? WHERE Device_ID = ?', [tokenHash, deviceId]);
}

async function setDeviceActiveStatus(deviceId, isActive, executor = db) {
    return executor.query('UPDATE iot_devices SET Is_Active = ? WHERE Device_ID = ?', [isActive ? 1 : 0, deviceId]);
}

module.exports = {
    insertOccupancyLog,
    findByTokenHash,
    findDeviceById,
    updateDeviceLastSeen,
    updateDeviceTokenHash,
    setDeviceActiveStatus,
    getConnection,
    withTransaction
};

