'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/check', authController.checkAuth);
router.post('/recover-password', authController.recoverPassword);
router.get('/validate-reset-token', authController.validateResetToken);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
