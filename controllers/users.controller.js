'use strict';

const usersService = require('../services/usersService');

async function getCurrentUser(req, res, next) {
    try {
        const userId = req.session ? req.session.userId : null;
        const result = await usersService.getCurrentUser(userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.user);
    } catch (err) {
        next(err);
    }
}

async function updateUser(req, res, next) {
    try {
        const userId = req.session ? req.session.userId : null;
        const result = await usersService.updateUserAccount(userId, req.body, req.session);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function verifyEmail(req, res, next) {
    try {
        const { token } = req.query;
        const result = await usersService.verifyEmailToken(token, req.session);
        return res.status(result.status).send(result.html);
    } catch (err) {
        next(err);
    }
}

async function getUserQRCode(req, res, next) {
    try {
        const userId = req.session ? req.session.userId : null;
        const result = await usersService.getUserQRCode(userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function scanQRCode(req, res, next) {
    try {
        const { qrString } = req.body;
        const result = await usersService.scanQRCode(qrString);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function updateTutorialStatus(req, res, next) {
    try {
        const userId = req.session ? req.session.userId : null;
        const { completed } = req.body;
        const result = await usersService.updateTutorialStatus(userId, completed !== undefined ? completed : true);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getCurrentUser,
    updateUser,
    verifyEmail,
    getUserQRCode,
    scanQRCode,
    updateTutorialStatus
};
