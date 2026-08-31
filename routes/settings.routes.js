'use strict';

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const { requireRole, ADMIN_ROLES, IT_HEAD_ROLES } = require('../middleware/auth');

router.get('/', requireRole(ADMIN_ROLES), settingsController.getSettings);
router.post('/', requireRole(IT_HEAD_ROLES), settingsController.updateSettings);

module.exports = router;
