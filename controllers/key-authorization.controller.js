'use strict';

/**
 * controllers/key-authorization.controller.js
 * Controller handling multi-key authorization requests, approvals, and status lookups.
 */

const keyAuthService = require('../services/keyAuthorizationService');

async function requestAdditionalKey(req, res, next) {
    try {
        const userId = req.session.userId;
        const userRole = req.session.userRole;
        const userName = req.session.userName;
        const { roomId, reason } = req.body;

        const result = await keyAuthService.requestAdditionalKey(userId, userRole, userName, roomId, reason, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({
            message: result.message,
            data: result.data
        });
    } catch (err) {
        next(err);
    }
}

async function getFacultyRequestStatus(req, res, next) {
    try {
        const userId = req.session.userId;
        const result = await keyAuthService.getFacultyRequestStatus(userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getPendingRequestsForDeptHead(req, res, next) {
    try {
        const userId = req.session.userId;
        const userRole = req.session.userRole;
        const result = await keyAuthService.getPendingRequestsForDeptHead(userId, userRole);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function approveRequest(req, res, next) {
    try {
        const approvedBy = req.session.userId;
        const userRole = req.session.userRole;
        const { requestId } = req.params;
        const { durationMinutes } = req.body || {};

        const result = await keyAuthService.approveRequest(requestId, approvedBy, userRole, durationMinutes, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({
            message: result.message,
            data: result.data
        });
    } catch (err) {
        next(err);
    }
}

async function rejectRequest(req, res, next) {
    try {
        const approvedBy = req.session.userId;
        const userRole = req.session.userRole;
        const { requestId } = req.params;
        const { reason } = req.body || {};

        const result = await keyAuthService.rejectRequest(requestId, approvedBy, userRole, reason, req);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({
            message: result.message,
            data: result.data
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    requestAdditionalKey,
    getFacultyRequestStatus,
    getPendingRequestsForDeptHead,
    approveRequest,
    rejectRequest
};
