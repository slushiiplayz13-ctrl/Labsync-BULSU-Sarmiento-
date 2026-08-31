'use strict';

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const {
    loginLimiter,
    passwordRecoveryLimiter,
    passwordResetLimiter,
    validateResetTokenLimiter
} = require('../middleware/rateLimiter');

router.post('/login', loginLimiter, authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/check', authController.checkAuth);
router.post('/recover-password', passwordRecoveryLimiter, authController.recoverPassword);
router.get('/validate-reset-token', validateResetTokenLimiter, authController.validateResetToken);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

module.exports = router;
