'use strict';

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, settingsController.getSettings);
router.post('/', requireAuth, settingsController.updateSettings);

module.exports = router;
