'use strict';

const settingsRepository = require('../repositories/settings.repository');
const userRepository = require('../repositories/user.repository');

async function getSettings() {
    const [rows] = await settingsRepository.findAllSettings();
    const settings = {};
    rows.forEach(row => {
        settings[row.Setting_Key] = row.Setting_Value;
    });
    return { status: 200, data: settings };
}

async function updateSettings(settings, sessionUserId, sessionUserRole) {
    let role = sessionUserRole;
    if (!role) {
        const [users] = await userRepository.getRoleById(sessionUserId);
        if (users.length > 0) {
            role = users[0].Role;
        }
    }

    const isAuthorized = role && (role.toLowerCase().includes('head') || role === 'MIS Staff');
    if (!isAuthorized) {
        return { status: 403, error: 'Privilege required: Only administrators can modify system settings.' };
    }

    for (const [key, value] of Object.entries(settings)) {
        await settingsRepository.upsertSetting(key, value);
    }

    return { status: 200, message: 'System settings updated successfully.' };
}

async function checkHealth() {
    const [rows] = await settingsRepository.pingDatabase();
    return {
        status: 200,
        data: { message: 'Database connected successfully', result: rows[0].result }
    };
}

module.exports = {
    getSettings,
    updateSettings,
    checkHealth
};

