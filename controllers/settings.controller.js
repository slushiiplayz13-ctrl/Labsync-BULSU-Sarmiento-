'use strict';

const settingsService = require('../services/settingsService');

async function getSettings(req, res, next) {
    try {
        const result = await settingsService.getSettings();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function updateSettings(req, res, next) {
    try {
        const sessionUserId = req.session ? req.session.userId : null;
        const sessionUserRole = req.session ? req.session.userRole : null;
        const result = await settingsService.updateSettings(req.body, sessionUserId, sessionUserRole);

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function healthCheck(req, res, next) {
    try {
        const result = await settingsService.checkHealth();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getSettings,
    updateSettings,
    healthCheck
};

