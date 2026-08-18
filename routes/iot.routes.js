'use strict';

const express = require('express');
const router = express.Router();
const iotController = require('../controllers/iot.controller');

router.post('/log', iotController.logOccupancy);

module.exports = router;
