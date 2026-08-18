'use strict';

const facultyService = require('../services/facultyService');

async function addFaculty(req, res, next) {
    try {
        const result = await facultyService.addFaculty(req.body);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getAllFaculty(req, res, next) {
    try {
        const result = await facultyService.getAllFaculty();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function updateFacultyRole(req, res, next) {
    try {
        const { userId } = req.params;
        const { role } = req.body;
        const currentSessionUserId = req.session ? req.session.userId : null;

        const result = await facultyService.updateFacultyRole(userId, role, currentSessionUserId, req.session);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function deleteFaculty(req, res, next) {
    try {
        const { userId } = req.params;
        const result = await facultyService.deleteFaculty(userId);
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    addFaculty,
    getAllFaculty,
    updateFacultyRole,
    deleteFaculty
};
