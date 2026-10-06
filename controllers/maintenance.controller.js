'use strict';

const maintenanceService = require('../services/maintenanceService');
const auditService = require('../services/auditService');
const studentVerificationService = require('../services/studentVerificationService');

async function verifyStudentID(req, res, next) {
    try {
        const { qrData, roomNumber, pcNumber } = req.body || {};
        const result = await studentVerificationService.verifyStudentIDPayload({
            qrData,
            roomNumber,
            pcNumber
        });
        if (result.error) {
            await auditService.logSecurityEvent({
                req,
                action: 'STUDENT_ID_QR_CAPTURE',
                resourceType: 'PC',
                resourceId: pcNumber ? `${roomNumber || 'Unknown'}-PC-${pcNumber}` : null,
                actorRole: 'Student',
                details: { roomNumber, pcNumber, error: result.error },
                result: 'FAILURE'
            });
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'STUDENT_ID_QR_CAPTURE',
            resourceType: 'PC',
            resourceId: `${roomNumber}-PC-${pcNumber}`,
            actorRole: 'Student',
            details: {
                studentNumber: result.data.studentNumber,
                studentName: result.data.studentName,
                roomNumber,
                pcNumber
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function submitReport(req, res, next) {
    try {
        const result = await maintenanceService.submitReport(req.body);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'SUBMIT_PC_REPORT',
            resourceType: 'MAINTENANCE',
            resourceId: result.data?.reportId || result.data?.ticketId || null,
            actorRole: 'Student',
            details: {
                studentName: req.body?.studentName,
                studentNumber: req.body?.studentNumber,
                roomNumber: req.body?.roomNumber,
                pcNumber: req.body?.pcNumber,
                section: req.body?.studentSection,
                ticketId: result.data?.ticketId
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getAllReports(req, res, next) {
    try {
        const result = await maintenanceService.getAllReports();
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function updateReportStatus(req, res, next) {
    try {
        const { reportId } = req.params;
        const { status } = req.body;

        // Authoritatively derive actor from server session only (never trust client)
        const actor = {
            userId: req.session ? req.session.userId : null
        };

        const result = await maintenanceService.updateReportStatus(reportId, status, actor);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'TICKET_STATUS_UPDATE',
            resourceType: 'MAINTENANCE',
            resourceId: result.issueId || reportId,
            details: {
                previousStatus: result.previousStatus,
                newStatus: status
            },
            result: 'SUCCESS'
        });

        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function deleteReport(req, res, next) {
    try {
        const { reportId } = req.params;
        const result = await maintenanceService.deleteReport(reportId);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'TICKET_DELETE',
            resourceType: 'MAINTENANCE',
            resourceId: reportId,
            result: 'SUCCESS'
        });

        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function getNotifications(req, res, next) {
    try {
        const sessionUserId = req.session ? (req.session.userId || (req.session.user && req.session.user.id)) : null;
        const sessionUserRole = req.session ? (req.session.userRole || (req.session.user && req.session.user.role)) : null;
        const result = await maintenanceService.getNotifications(sessionUserId, sessionUserRole, req.query);
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function getPCInfo(req, res, next) {
    try {
        const result = await maintenanceService.getPCInfo(req.query);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    submitReport,
    verifyStudentID,
    getAllReports,
    updateReportStatus,
    deleteReport,
    getNotifications,
    getPCInfo
};
