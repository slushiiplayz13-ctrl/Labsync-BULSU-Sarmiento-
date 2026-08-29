'use strict';

const db = require('../database/connection');

async function findAllSettings(executor = db) {
    return executor.query('SELECT Setting_Key, Setting_Value FROM system_settings');
}

async function upsertSetting(key, value, executor = db) {
    return executor.query(`
        INSERT INTO system_settings (Setting_Key, Setting_Value) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE Setting_Value = ?
    `, [key, value, value]);
}

async function pingDatabase(executor = db) {
    return executor.query('SELECT 1 + 1 AS result');
}

module.exports = {
    findAllSettings,
    upsertSetting,
    pingDatabase
};

