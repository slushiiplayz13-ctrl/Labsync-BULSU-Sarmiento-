'use strict';

/**
 * controllers/mis.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * HTTP controller layer for MIS Staff account lifecycle management.
 * Delegates business logic to misService and logs security audit events.
 */

const misService = require('../services/misService');
const auditService = require('../services/auditService');

async function listMisStaff(req, res, next) {
    try {
        const result = await misService.getMisStaffRoster();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function createMisStaff(req, res, next) {
    try {
        const result = await misService.createMisStaff(req.body);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        const createdUser = result.data.user;
        await auditService.logSecurityEvent({
            req,
            action: 'MIS_CREATE',
            resourceType: 'USER',
            resourceId: createdUser.User_ID,
            details: {
                name: createdUser.Name,
                email: createdUser.Email,
                role: 'MIS Staff',
                status: 'ACTIVE'
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function updateMisStaff(req, res, next) {
    try {
        const { userId } = req.params;
        const result = await misService.updateMisStaff(userId, req.body);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        const updatedUser = result.data.user;
        await auditService.logSecurityEvent({
            req,
            action: 'MIS_UPDATE',
            resourceType: 'USER',
            resourceId: Number(userId),
            details: {
                name: updatedUser.Name,
                email: updatedUser.Email,
                phone: updatedUser.Phone
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function deactivateMisStaff(req, res, next) {
    try {
        const { userId } = req.params;
        const result = await misService.deactivateMisStaff(userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'MIS_DEACTIVATE',
            resourceType: 'USER',
            resourceId: Number(userId),
            details: {
                name: result.data.user.Name,
                email: result.data.user.Email,
                newStatus: 'DEACTIVATED'
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function reactivateMisStaff(req, res, next) {
    try {
        const { userId } = req.params;
        const result = await misService.reactivateMisStaff(userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'MIS_REACTIVATE',
            resourceType: 'USER',
            resourceId: Number(userId),
            details: {
                name: result.data.user.Name,
                email: result.data.user.Email,
                newStatus: 'ACTIVE'
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listMisStaff,
    createMisStaff,
    updateMisStaff,
    deactivateMisStaff,
    reactivateMisStaff
};
