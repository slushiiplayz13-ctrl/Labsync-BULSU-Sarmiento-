'use strict';

const scheduleService = require('../services/scheduleService');
const auditService = require('../services/auditService');
const roomLockService = require('../services/roomLockService');

async function saveSchedule(req, res, next) {
    try {
        const { roomNumber, schedules, academicYear, semester, version, editSessionToken } = req.body;
        const userId = req.session ? req.session.userId : null;

        const activeLock = roomLockService.getLock(roomNumber, academicYear, semester);
        if (activeLock) {
            const hasValidLock = roomLockService.verifyLock({
                roomNumber,
                academicYear,
                semester,
                editSessionToken,
                userId
            });
            if (!hasValidLock) {
                return res.status(423).json({
                    error: `Room ${roomNumber} is currently being edited by ${activeLock.userName} (${activeLock.userRole}).`,
                    code: 'LOCKED',
                    lockedBy: {
                        userId: activeLock.userId,
                        userName: activeLock.userName,
                        userRole: activeLock.userRole
                    }
                });
            }
        }

        const result = await scheduleService.saveRoomSchedule(roomNumber, schedules, academicYear, semester, version, userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'SCHEDULE_UPDATE',
            resourceType: 'SCHEDULE',
            resourceId: String(roomNumber),
            details: {
                scheduleCount: Array.isArray(schedules) ? schedules.length : 0,
                academicYear,
                semester,
                version: result.version
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json({
            message: result.message,
            version: result.version,
            status: result.statusValue || 'Draft'
        });
    } catch (err) {
        next(err);
    }
}

async function checkConflict(req, res, next) {
    try {
        const result = await scheduleService.checkProfessorConflict(req.query);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getProfessorSchedule(req, res, next) {
    try {
        const result = await scheduleService.getProfessorSchedule(req.query);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getRoomSchedule(req, res, next) {
    try {
        const { roomNumber } = req.params;
        const { academicYear, semester, view, official } = req.query;
        const result = await scheduleService.getRoomSchedule(roomNumber, academicYear, semester, { view, official });
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getUserSchedule(req, res, next) {
    try {
        const userId = req.session ? req.session.userId : null;
        const { academicYear, semester } = req.query;
        const result = await scheduleService.getUserSchedule(userId, academicYear, semester);
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getITHeadSummary(req, res, next) {
    try {
        const userId = req.session ? req.session.userId : null;
        const { academicYear, semester } = req.query;
        const result = await scheduleService.getITHeadSummary(userId, academicYear, semester);
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getFacultyScheduleByName(req, res, next) {
    try {
        const { professorName } = req.params;
        const { academicYear, semester } = req.query;
        const result = await scheduleService.getFacultyScheduleByName(professorName, academicYear, semester);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function finalizeSchedule(req, res, next) {
    try {
        const { IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');
        const userRole = req.session ? (req.session.userRole || req.session.role) : null;
        const isExclusive = Array.isArray(IT_DEPT_HEAD_EXCLUSIVE_ROLES) && 
            IT_DEPT_HEAD_EXCLUSIVE_ROLES.some(r => r.toLowerCase() === String(userRole || '').trim().toLowerCase());

        if (!isExclusive) {
            await auditService.logSecurityEvent({
                req,
                action: 'SCHEDULE_FINALIZE_DENIED',
                resourceType: 'SCHEDULE',
                resourceId: req.body.roomNumber ? String(req.body.roomNumber) : 'ALL',
                details: { role: userRole, error: 'Insufficient permissions' },
                result: 'FAILURE'
            });
            return res.status(403).json({ error: 'Only the IT Department Head can finalize the official schedule.' });
        }

        const { roomNumber, academicYear, semester, editSessionToken } = req.body;
        const userId = req.session ? req.session.userId : null;

        const activeLock = roomLockService.getLock(roomNumber, academicYear, semester);
        if (activeLock) {
            const hasValidLock = roomLockService.verifyLock({
                roomNumber,
                academicYear,
                semester,
                editSessionToken,
                userId
            });
            if (!hasValidLock) {
                return res.status(423).json({
                    error: `Room ${roomNumber} is currently being edited by ${activeLock.userName} (${activeLock.userRole}).`,
                    code: 'LOCKED',
                    lockedBy: {
                        userId: activeLock.userId,
                        userName: activeLock.userName,
                        userRole: activeLock.userRole
                    }
                });
            }
        }

        const result = await scheduleService.finalizeSchedule({ roomNumber, academicYear, semester, userId });
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        roomLockService.releaseLock({ roomNumber, academicYear, semester, editSessionToken });

        await auditService.logSecurityEvent({
            req,
            action: 'SCHEDULE_FINALIZE',
            resourceType: 'SCHEDULE',
            resourceId: roomNumber ? String(roomNumber) : `${academicYear || ''} ${semester || ''}`.trim(),
            details: {
                academicYear,
                semester,
                roomNumber: roomNumber || 'ALL_ROOMS',
                finalizedBy: userId
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function reopenSchedule(req, res, next) {
    try {
        const { IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');
        const userRole = req.session ? (req.session.userRole || req.session.role) : null;
        const isExclusive = Array.isArray(IT_DEPT_HEAD_EXCLUSIVE_ROLES) && 
            IT_DEPT_HEAD_EXCLUSIVE_ROLES.some(r => r.toLowerCase() === String(userRole || '').trim().toLowerCase());

        if (!isExclusive) {
            await auditService.logSecurityEvent({
                req,
                action: 'SCHEDULE_REOPEN_DENIED',
                resourceType: 'SCHEDULE',
                resourceId: req.body.roomNumber ? String(req.body.roomNumber) : 'ALL',
                details: { role: userRole, error: 'Insufficient permissions' },
                result: 'FAILURE'
            });
            return res.status(403).json({ error: 'Only the IT Department Head can reopen a finalized schedule.' });
        }

        const { roomNumber, academicYear, semester, editSessionToken } = req.body;
        const userId = req.session ? req.session.userId : null;
        const userName = req.session ? (req.session.userName || req.session.name) : 'IT Dept. Head';
        const userRoleName = req.session ? (req.session.userRole || req.session.role) : 'IT Dept. Head';

        const result = await scheduleService.reopenSchedule({ roomNumber, academicYear, semester, userId });
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        if (editSessionToken) {
            roomLockService.forceAcquireLock({
                roomNumber,
                academicYear,
                semester,
                userId,
                userName,
                userRole: userRoleName,
                editSessionToken
            });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'SCHEDULE_REOPEN',
            resourceType: 'SCHEDULE',
            resourceId: roomNumber ? String(roomNumber) : `${academicYear || ''} ${semester || ''}`.trim(),
            details: {
                academicYear,
                semester,
                roomNumber: roomNumber || 'ALL_ROOMS',
                reopenedBy: userId
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getScheduleStatus(req, res, next) {
    try {
        const { roomNumber, academicYear, semester } = req.query;
        const result = await scheduleService.getScheduleStatus({ roomNumber, academicYear, semester });
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    saveSchedule,
    checkConflict,
    getProfessorSchedule,
    getFacultyScheduleByName,
    getRoomSchedule,
    getUserSchedule,
    getITHeadSummary,
    finalizeSchedule,
    reopenSchedule,
    getScheduleStatus
};

