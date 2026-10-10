'use strict';

const crypto = require('crypto');
const scheduleService = require('../services/scheduleService');
const auditService = require('../services/auditService');
const roomLockService = require('../services/roomLockService');

async function saveSchedule(req, res, next) {
    try {
        const { roomNumber, schedules, academicYear, semester, version } = req.body;
        const editSessionToken = req.body.editSessionToken || (req.headers && req.headers['x-edit-session-token']);
        const userId = req.session ? req.session.userId : null;

        const hasValidLock = roomLockService.verifyLock({
            roomNumber,
            academicYear,
            semester,
            editSessionToken,
            userId
        });
        if (!hasValidLock) {
            const activeLock = roomLockService.getLock(roomNumber, academicYear, semester);
            if (activeLock) {
                return res.status(423).json({
                    error: `Room ${roomNumber} is currently being edited by ${activeLock.userName} (${activeLock.userRole}).`,
                    code: 'LOCKED',
                    lockedBy: {
                        userId: activeLock.userId,
                        userName: activeLock.userName,
                        userRole: activeLock.userRole
                    }
                });
            } else {
                return res.status(423).json({
                    error: `Editing lock for Room ${roomNumber} has expired or was not acquired. Please open the room to acquire an editing lock.`,
                    code: 'LOCKED'
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

        const { roomNumber, academicYear, semester, schedules, version } = req.body;
        const editSessionToken = req.body.editSessionToken || (req.headers && req.headers['x-edit-session-token']);
        const userId = req.session ? req.session.userId : null;

        const hasValidLock = roomLockService.verifyLock({
            roomNumber,
            academicYear,
            semester,
            editSessionToken,
            userId
        });
        if (!hasValidLock) {
            const activeLock = roomLockService.getLock(roomNumber, academicYear, semester);
            if (activeLock) {
                return res.status(423).json({
                    error: `Room ${roomNumber} is currently being edited by ${activeLock.userName} (${activeLock.userRole}).`,
                    code: 'LOCKED',
                    lockedBy: {
                        userId: activeLock.userId,
                        userName: activeLock.userName,
                        userRole: activeLock.userRole
                    }
                });
            } else {
                return res.status(423).json({
                    error: `Editing lock for Room ${roomNumber} has expired or was not acquired.`,
                    code: 'LOCKED'
                });
            }
        }

        const result = await scheduleService.finalizeSchedule({ roomNumber, academicYear, semester, userId, schedules, version });
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

        const { roomNumber, academicYear, semester } = req.body;
        const editSessionToken = req.body.editSessionToken || (req.headers && req.headers['x-edit-session-token']);
        const userId = req.session ? req.session.userId : null;
        const userName = req.session ? (req.session.userName || req.session.name) : 'IT Dept. Head';
        const userRoleName = req.session ? (req.session.userRole || req.session.role) : 'IT Dept. Head';

        const activeLock = roomLockService.getLock(roomNumber, academicYear, semester);
        if (activeLock && Number(activeLock.userId) !== Number(userId)) {
            return res.status(423).json({
                error: `Room ${roomNumber} is currently locked by ${activeLock.userName} (${activeLock.userRole}).`,
                code: 'LOCKED',
                lockedBy: {
                    userId: activeLock.userId,
                    userName: activeLock.userName,
                    userRole: activeLock.userRole
                }
            });
        }

        const result = await scheduleService.reopenSchedule({ roomNumber, academicYear, semester, userId });
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        const token = editSessionToken || ('lock_' + crypto.randomUUID());
        roomLockService.forceAcquireLock({
            roomNumber,
            academicYear,
            semester,
            userId,
            userName,
            userRole: userRoleName,
            editSessionToken: token
        });

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

        return res.status(result.status).json({
            ...result.data,
            editSessionToken: token
        });
    } catch (err) {
        next(err);
    }
}

async function acquireRoomLock(req, res, next) {
    try {
        const { roomNumber, academicYear, semester } = req.body;
        const editSessionToken = req.body.editSessionToken || (req.headers && req.headers['x-edit-session-token']);
        if (!roomNumber || !academicYear || !semester) {
            return res.status(400).json({ error: 'Room number, academic year, and semester are required.' });
        }

        const userId = req.session ? req.session.userId : null;
        const userName = req.session ? (req.session.userName || req.session.name || 'Administrator') : 'Administrator';
        const userRole = req.session ? (req.session.userRole || req.session.role || 'IT Dept. Head') : 'IT Dept. Head';

        const token = (editSessionToken && typeof editSessionToken === 'string' && editSessionToken.trim().length > 0)
            ? editSessionToken.trim()
            : ('lock_' + crypto.randomUUID());

        const result = roomLockService.acquireLock({
            roomNumber,
            academicYear,
            semester,
            userId,
            userName,
            userRole,
            editSessionToken: token
        });

        if (result.acquired) {
            return res.status(200).json({
                acquired: true,
                editSessionToken: result.lock.editSessionToken,
                lock: result.lock
            });
        } else {
            return res.status(423).json({
                acquired: false,
                code: result.code || 'LOCKED',
                error: `Room ${roomNumber} is currently being edited by ${result.lockedBy.userName} (${result.lockedBy.userRole}).`,
                lockedBy: result.lockedBy,
                remainingSeconds: result.remainingSeconds
            });
        }
    } catch (err) {
        next(err);
    }
}

async function renewRoomLockHeartbeat(req, res, next) {
    try {
        const { roomNumber, academicYear, semester } = req.body;
        const editSessionToken = req.body.editSessionToken || (req.headers && req.headers['x-edit-session-token']);
        if (!roomNumber || !academicYear || !semester || !editSessionToken) {
            return res.status(400).json({ error: 'Room number, academic year, semester, and editSessionToken are required.' });
        }

        const result = roomLockService.renewHeartbeat({
            roomNumber,
            academicYear,
            semester,
            editSessionToken
        });

        if (result.renewed) {
            return res.status(200).json({
                renewed: true,
                lastHeartbeat: result.lastHeartbeat
            });
        } else {
            return res.status(423).json({
                renewed: false,
                code: result.code || 'LOCK_LOST',
                error: result.error || 'Editing lease expired or lost.',
                lockedBy: result.lockedBy
            });
        }
    } catch (err) {
        next(err);
    }
}

async function releaseRoomLock(req, res, next) {
    try {
        const { roomNumber, academicYear, semester } = req.body;
        const editSessionToken = req.body.editSessionToken || (req.headers && req.headers['x-edit-session-token']);
        if (!roomNumber || !academicYear || !semester) {
            return res.status(400).json({ error: 'Room number, academic year, and semester are required.' });
        }

        const result = roomLockService.releaseLock({
            roomNumber,
            academicYear,
            semester,
            editSessionToken
        });

        return res.status(200).json({
            released: result.released,
            message: result.message || 'Lock released successfully.'
        });
    } catch (err) {
        next(err);
    }
}

async function getRoomLockStatus(req, res, next) {
    try {
        const { roomNumber, academicYear, semester } = req.query;
        if (!roomNumber || !academicYear || !semester) {
            return res.status(400).json({ error: 'Room number, academic year, and semester are required.' });
        }

        const lock = roomLockService.getLock(roomNumber, academicYear, semester);
        if (lock) {
            return res.status(200).json({
                locked: true,
                lock: {
                    roomNumber: lock.roomNumber,
                    academicYear: lock.academicYear,
                    semester: lock.semester,
                    userId: lock.userId,
                    userName: lock.userName,
                    userRole: lock.userRole,
                    acquiredAt: lock.acquiredAt,
                    lastHeartbeat: lock.lastHeartbeat
                }
            });
        } else {
            return res.status(200).json({
                locked: false,
                lock: null
            });
        }
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
    getScheduleStatus,
    acquireRoomLock,
    renewRoomLockHeartbeat,
    releaseRoomLock,
    getRoomLockStatus
};

