'use strict';

const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenance.controller');

router.post('/submit', maintenanceController.submitReport);
router.get('/', maintenanceController.getAllReports);
router.put('/:reportId/status', maintenanceController.updateReportStatus);
router.delete('/:reportId', maintenanceController.deleteReport);

module.exports = router;
