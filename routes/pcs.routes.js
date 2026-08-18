'use strict';

const express = require('express');
const router = express.Router();
const labsController = require('../controllers/labs.controller');

// Standalone PC unit endpoints: DELETE /api/pcs/:pcId, GET /api/pcs/:pcId/qrcode
router.delete('/:pcId', labsController.deletePC);
router.get('/:pcId/qrcode', labsController.getPCQRCode);

module.exports = router;
