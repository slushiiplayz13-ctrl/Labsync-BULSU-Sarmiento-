'use strict';

const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iot.controller');

router.post('/log', iotController.logOccupancy);
router.post('/heartbeat', iotController.heartbeat);
router.post('/ping', iotController.heartbeat);
router.get('/heartbeat', iotController.heartbeat);

module.exports = router;
