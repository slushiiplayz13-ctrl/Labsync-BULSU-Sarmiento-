'use strict';

const { getSenderAddress, sendMailWithTimeout } = require('./email.transport');
const { renderWelcomeEmail } = require('./templates/welcome');
const { renderResetPasswordEmail } = require('./templates/reset-password');
const { renderEmailVerificationEmail } = require('./templates/verification');
const {
    renderKeyAuthorizationRequestEmail,
    renderKeyAuthorizationOutcomeEmail
} = require('./templates/key-authorization');
const { renderKeyReturnReminderEmail } = require('./templates/key-reminder');

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

/**
 * Dispatches an urgent email notice to the Department Head when a faculty member requests a 2nd key.
 *
 * @param {string} recipientEmail - Department Head's email
 * @param {string} recipientName - Department Head's name
 * @param {object} details - Request details
 * @returns {Promise<boolean>}
 */
async function sendKeyAuthorizationEmail(recipientEmail, recipientName, details) {
    const { subject, html } = renderKeyAuthorizationRequestEmail(recipientName, details);
    try {
        await sendMailWithTimeout({
            from: getSenderAddress(),
            to: recipientEmail,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendKeyAuthorizationEmail failed:', err.message);
        return false;
    }
}

/**
 * Dispatches an outcome email to the faculty member when Department Head approves or declines.
 *
 * @param {string} recipientEmail - Faculty member's email
 * @param {string} recipientName - Faculty member's name
 * @param {object} details - Outcome details
 * @returns {Promise<boolean>}
 */
async function sendKeyAuthorizationOutcomeEmail(recipientEmail, recipientName, details) {
    const { subject, html } = renderKeyAuthorizationOutcomeEmail(recipientName, details);
    try {
        await sendMailWithTimeout({
            from: getSenderAddress(),
            to: recipientEmail,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendKeyAuthorizationOutcomeEmail failed:', err.message);
        return false;
    }
}

/**
 * Dispatches an automated key return / transfer reminder email to the actual current key holder.
 *
 * @param {string} recipientEmail - Registered email of the current key holder
 * @param {object} reminderData - Reminder details
 * @returns {Promise<boolean>}
 */
async function sendKeyReturnReminderEmail(recipientEmail, reminderData) {
    const { subject, html } = renderKeyReturnReminderEmail(reminderData);
    try {
        const emailTransport = require('./email.transport');
        await emailTransport.sendMailWithTimeout({
            from: emailTransport.getSenderAddress(),
            to: recipientEmail,
            subject,
            html,
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendKeyReturnReminderEmail failed:', err.message);
        return false;
    }
}

module.exports = {
    sendWelcomeEmail,
    sendResetPasswordEmail,
    sendEmailVerificationEmail,
    sendKeyAuthorizationEmail,
    sendKeyAuthorizationOutcomeEmail,
    sendKeyReturnReminderEmail
};
