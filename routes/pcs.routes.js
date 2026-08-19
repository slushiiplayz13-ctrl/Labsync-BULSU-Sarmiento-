'use strict';

const express = require('express');
const router = express.Router();
const labsController = require('../controllers/labs.controller');
const { requireRole, ADMIN_ROLES } = require('../middleware/auth');

// Standalone PC unit endpoints: DELETE /api/pcs/:pcId, GET /api/pcs/:pcId/qrcode
router.delete('/:pcId', requireRole(ADMIN_ROLES), labsController.deletePC);
router.get('/:pcId/qrcode', requireRole(ADMIN_ROLES), labsController.getPCQRCode);

module.exports = router;
