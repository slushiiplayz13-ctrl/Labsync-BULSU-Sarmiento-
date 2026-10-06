'use strict';

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance.controller');
const reportsController = require('../controllers/reports.controller');
const { requireAuth, requireRole, ADMIN_ROLES, TICKET_UPDATE_ROLES, IT_HEAD_ROLES } = require('../middleware/auth');
const { publicPCReportLimiter, pcDuplicateReportLimiter, studentVerifyLimiter } = require('../middleware/rateLimiter');

// Room Status Activity Log PDF Report — Department Head Only
router.get('/room-status', requireRole(IT_HEAD_ROLES), reportsController.generateRoomStatusReport);

router.post('/verify-student-id', studentVerifyLimiter, maintenanceController.verifyStudentID);
router.post('/submit', publicPCReportLimiter, pcDuplicateReportLimiter, maintenanceController.submitReport);
router.get('/pc-info', maintenanceController.getPCInfo);
router.get('/', requireAuth, maintenanceController.getAllReports);
router.put('/:reportId/status', requireRole(TICKET_UPDATE_ROLES), maintenanceController.updateReportStatus);
router.delete('/:reportId', requireRole(ADMIN_ROLES), maintenanceController.deleteReport);

module.exports = router;
