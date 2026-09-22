'use strict';

const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iot.controller');
const { requireIoTAuth } = require('../middleware/iotAuth');

// Send Connection: close header on all IoT responses to instruct microcontrollers (ESP32)
// to immediately terminate TCP sockets and avoid lwIP socket table exhaustion.
router.use((req, res, next) => {
    res.setHeader('Connection', 'close');
    next();
});

router.post('/log', requireIoTAuth, iotController.logOccupancy);
router.post('/heartbeat', requireIoTAuth, iotController.heartbeat);
router.post('/ping', requireIoTAuth, iotController.heartbeat);
router.get('/heartbeat', iotController.heartbeat);

module.exports = router;
