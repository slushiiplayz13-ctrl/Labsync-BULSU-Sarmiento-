'use strict';

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance.controller');
const { requireAuth, requireRole, ADMIN_ROLES } = require('../middleware/auth');
const { publicPCReportLimiter, pcDuplicateReportLimiter } = require('../middleware/rateLimiter');

router.post('/submit', publicPCReportLimiter, pcDuplicateReportLimiter, maintenanceController.submitReport);
router.get('/', requireAuth, maintenanceController.getAllReports);
router.put('/:reportId/status', requireRole(ADMIN_ROLES), maintenanceController.updateReportStatus);
router.delete('/:reportId', requireRole(ADMIN_ROLES), maintenanceController.deleteReport);

module.exports = router;
