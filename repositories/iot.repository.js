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

module.exports = {
    insertOccupancyLog,
    getConnection,
    withTransaction
};

