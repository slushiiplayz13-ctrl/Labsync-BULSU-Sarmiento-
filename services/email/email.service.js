'use strict';

const { getSenderAddress, sendMailWithTimeout } = require('./email.transport');
const { renderWelcomeEmail } = require('./templates/welcome');
const { renderResetPasswordEmail } = require('./templates/reset-password');
const { renderEmailVerificationEmail } = require('./templates/verification');

/**
 * Sends a welcome email containing generated login credentials to a new faculty member.
 *
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} password — the plain-text generated password (temporary)
 * @returns {Promise<boolean>}
 */
async function sendWelcomeEmail(recipientEmail, recipientName, password) {
    const { subject, html } = renderWelcomeEmail(recipientEmail, recipientName, password);
    try {
        await sendMailWithTimeout({
            from: getSenderAddress(),
            to: recipientEmail,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendWelcomeEmail failed:', err.message);
        return false;
    }
}

/**
 * Sends a password-reset link email.
 *
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} resetLink — full URL with token
 * @returns {Promise<boolean>}
 */
async function sendResetPasswordEmail(recipientEmail, recipientName, resetLink) {
    const { subject, html } = renderResetPasswordEmail(recipientEmail, recipientName, resetLink);
    try {
        await sendMailWithTimeout({
            from: getSenderAddress(),
            to: recipientEmail,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendResetPasswordEmail failed:', err.message);
        return false;
    }
}

/**
 * Sends an email-change verification link to the user's NEW email address.
 *
 * @param {string} recipientEmail — the NEW email to verify
 * @param {string} recipientName
 * @param {string} verificationLink — full URL with token
 * @returns {Promise<boolean>}
 */
async function sendEmailVerificationEmail(recipientEmail, recipientName, verificationLink) {
    const { subject, html } = renderEmailVerificationEmail(recipientEmail, recipientName, verificationLink);
    try {
        await sendMailWithTimeout({
            from: getSenderAddress(),
            to: recipientEmail,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendEmailVerificationEmail failed:', err.message);
        return false;
    }
}

module.exports = {
    sendWelcomeEmail,
    sendResetPasswordEmail,
    sendEmailVerificationEmail
};
