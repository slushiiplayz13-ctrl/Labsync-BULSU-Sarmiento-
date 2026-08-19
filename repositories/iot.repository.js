'use strict';

const db = require('../database/connection');

async function insertOccupancyLog(userId, roomId, authMethod, executor = db) {
    return executor.query(
        'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
        [userId, roomId, authMethod]
    );
}

module.exports = {
    insertOccupancyLog
};
