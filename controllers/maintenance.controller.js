'use strict';

const maintenanceService = require('../services/maintenanceService');
const auditService = require('../services/auditService');

async function submitReport(req, res, next) {
    try {
        const result = await maintenanceService.submitReport(req.body);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
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
        const result = await maintenanceService.updateReportStatus(reportId, status);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        await auditService.logSecurityEvent({
            req,
            action: 'TICKET_STATUS_UPDATE',
            resourceType: 'MAINTENANCE',
            resourceId: reportId,
            details: { newStatus: status },
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
        const sessionUserId = req.session ? req.session.userId : null;
        const sessionUserRole = req.session ? req.session.userRole : null;
        const result = await maintenanceService.getNotifications(sessionUserId, sessionUserRole);
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    submitReport,
    getAllReports,
    updateReportStatus,
    deleteReport,
    getNotifications
};
