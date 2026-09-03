'use strict';

const express = require('express');
const router = express.Router();
const usersController = require('../controllers/users.controller');
const { requireAuth } = require('../middleware/auth');

router.get('/current', requireAuth, usersController.getCurrentUser);
router.put('/update', requireAuth, usersController.updateUser);
router.put('/profile', requireAuth, usersController.updateUser);
router.put('/password', requireAuth, usersController.changePassword);
router.get('/verify-email', usersController.verifyEmail);
router.get('/qrcode', requireAuth, usersController.getUserQRCode);
router.post('/scan', usersController.scanQRCode);
router.put('/tutorial-status', requireAuth, usersController.updateTutorialStatus);

module.exports = router;
