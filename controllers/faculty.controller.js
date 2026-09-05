'use strict';

const facultyService = require('../services/facultyService');
const auditService = require('../services/auditService');

async function addFaculty(req, res, next) {
    try {
        const result = await facultyService.addFaculty(req.body);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'FACULTY_CREATE',
            resourceType: 'FACULTY',
            resourceId: result.data ? result.data.userId : null,
            details: { role: req.body.role || 'Faculty' },
            result: 'SUCCESS'
        });

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

        await auditService.logSecurityEvent({
            req,
            action: 'FACULTY_ROLE_UPDATE',
            resourceType: 'FACULTY',
            resourceId: userId,
            details: { newRole: role },
            result: 'SUCCESS'
        });

        if (req.session) {
            req.session.save((saveErr) => {
                if (saveErr) console.error('Session save error on role update:', saveErr);
                return res.status(result.status).json({
                    message: result.message,
                    currentRole: result.currentRole || req.session.userRole
                });
            });
            return;
        }

        return res.status(result.status).json({ message: result.message, currentRole: result.currentRole });
    } catch (err) {
        next(err);
    }
}

async function deleteFaculty(req, res, next) {
    try {
        const { userId } = req.params;
        const result = await facultyService.deleteFaculty(userId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'FACULTY_DELETE',
            resourceType: 'FACULTY',
            resourceId: userId,
            result: 'SUCCESS'
        });

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
