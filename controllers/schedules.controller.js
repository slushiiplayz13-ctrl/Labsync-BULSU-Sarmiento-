'use strict';

const scheduleService = require('../services/scheduleService');

async function saveSchedule(req, res, next) {
    try {
        const { roomNumber, schedules, academicYear, semester } = req.body;
        const result = await scheduleService.saveRoomSchedule(roomNumber, schedules, academicYear, semester);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
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
        const { academicYear, semester } = req.query;
        const result = await scheduleService.getRoomSchedule(roomNumber, academicYear, semester);
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
        const result = await scheduleService.getITHeadSummary(userId);
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

module.exports = {
    saveSchedule,
    checkConflict,
    getProfessorSchedule,
    getFacultyScheduleByName,
    getRoomSchedule,
    getUserSchedule,
    getITHeadSummary
};

