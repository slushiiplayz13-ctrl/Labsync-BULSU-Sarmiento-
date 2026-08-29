'use strict';

const { wrapEmailHtml, ctaButton, warningBox, fallbackLinkBox } = require('./shell');

/**
 * Renders HTML body and subject for password-reset email.
 *
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} resetLink — full URL with token
 * @returns {{ subject: string, html: string }}
 */
function renderResetPasswordEmail(recipientEmail, recipientName, resetLink) {
    const bodyHtml = `
        <h2 class="text-title" style="margin-top: 0; margin-bottom: 18px; font-size: 22px; font-weight: 800; color: #0F172A; text-align: center; letter-spacing: -0.4px;">
            Reset Your Password
        </h2>

        <p class="text-body" style="margin-top: 0; margin-bottom: 16px; font-size: 15px; color: #334155; line-height: 1.6;">
            Hello <strong>${recipientName}</strong>,
        </p>
        <p class="text-secondary" style="margin-top: 0; margin-bottom: 24px; font-size: 14.5px; color: #475569; line-height: 1.6;">
            We received a request to reset the password for your LabSync account. Click the button below to set a new password:
        </p>

        ${ctaButton('Reset Password', resetLink)}

        ${warningBox('🕒 Link Expiration',
        'This reset link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.')}

        ${fallbackLinkBox(resetLink)}

        <hr class="divider-line" style="border: 0; border-top: 1px solid #F1F5F9; margin: 32px 0 24px 0;">
        <p class="text-secondary" style="margin-bottom: 0; font-size: 14px; color: #64748B; line-height: 1.5;">
            Best regards,<br>
            <strong class="text-title" style="color: #0F172A; font-size: 14.5px;">LabSync IT Team</strong>
        </p>`;

    return {
        subject: 'Reset Your LabSync Password',
        html: wrapEmailHtml(bodyHtml)
    };
}

module.exports = { renderResetPasswordEmail };
