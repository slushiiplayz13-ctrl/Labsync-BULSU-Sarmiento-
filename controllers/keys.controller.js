'use strict';

/**
 * controllers/keys.controller.js
 * Controller endpoints for physical laboratory key inventory management
 * and faculty Key Transfer / Room Claim.
 */

const keysService = require('../services/keysService');

async function getAllKeys(req, res, next) {
    try {
        const result = await keysService.getAllKeys();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function registerKey(req, res, next) {
    try {
        const { roomId, keyCode } = req.body;
        const result = await keysService.registerKey(roomId, keyCode, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message, data: result.data });
    } catch (err) {
        next(err);
    }
}

async function getKeyTag(req, res, next) {
    try {
        const { keyId } = req.params;
        const result = await keysService.generateKeyTag(keyId, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function markMissing(req, res, next) {
    try {
        const { keyId } = req.params;
        const result = await keysService.markKeyMissing(keyId, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function markActive(req, res, next) {
    try {
        const { keyId } = req.params;
        const result = await keysService.markKeyActive(keyId, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function getKeyTransferInfo(req, res, next) {
    try {
        const { keyCode } = req.params;
        const result = await keysService.getKeyTransferInfo(keyCode, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function transferKey(req, res, next) {
    try {
        const { keyCode } = req.body;
        const result = await keysService.transferKey(keyCode, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({
            message: result.message,
            transfer: result.transfer
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getAllKeys,
    registerKey,
    getKeyTag,
    markMissing,
    markActive,
    getKeyTransferInfo,
    transferKey
};
