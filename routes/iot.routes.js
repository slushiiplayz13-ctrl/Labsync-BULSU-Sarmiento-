'use strict';

const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iot.controller');
const { requireIoTAuth } = require('../middleware/iotAuth');

router.post('/log', requireIoTAuth, iotController.logOccupancy);
router.post('/heartbeat', requireIoTAuth, iotController.heartbeat);
router.post('/ping', requireIoTAuth, iotController.heartbeat);
router.get('/heartbeat', iotController.heartbeat);

module.exports = router;
