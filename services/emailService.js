'use strict';

/**
 * services/emailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Compatibility facade for transactional email functions.
 * Re-exports implementation from services/email/email.service.js.
 */

const {
    sendWelcomeEmail,
    sendResetPasswordEmail,
    sendEmailVerificationEmail,
    sendKeyReturnReminderEmail
} = require('./email/email.service');

module.exports = {
    sendWelcomeEmail,
    sendResetPasswordEmail,
    sendEmailVerificationEmail,
    sendKeyReturnReminderEmail
};
