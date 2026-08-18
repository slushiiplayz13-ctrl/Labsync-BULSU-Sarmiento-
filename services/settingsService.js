'use strict';

const db = require('../db');

async function getSettings() {
    const [rows] = await db.query('SELECT Setting_Key, Setting_Value FROM system_settings');
    const settings = {};
    rows.forEach(row => {
        settings[row.Setting_Key] = row.Setting_Value;
    });
    return { status: 200, data: settings };
}

async function updateSettings(settings, sessionUserId, sessionUserRole) {
    let role = sessionUserRole;
    if (!role) {
        const [users] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [sessionUserId]);
        if (users.length > 0) {
            role = users[0].Role;
        }
    }

    const isAuthorized = role && (role.toLowerCase().includes('head') || role === 'MIS Staff');
    if (!isAuthorized) {
        return { status: 403, error: 'Privilege required: Only administrators can modify system settings.' };
    }

    for (const [key, value] of Object.entries(settings)) {
        await db.query(`
            INSERT INTO system_settings (Setting_Key, Setting_Value) 
            VALUES (?, ?) 
            ON DUPLICATE KEY UPDATE Setting_Value = ?
        `, [key, value, value]);
    }

    return { status: 200, message: 'System settings updated successfully.' };
}

module.exports = {
    getSettings,
    updateSettings
};
