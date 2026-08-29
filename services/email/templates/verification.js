'use strict';

const { wrapEmailHtml, ctaButton, warningBox, fallbackLinkBox } = require('./shell');

/**
 * Renders HTML body and subject for email-change verification email.
 *
 * @param {string} recipientEmail — the NEW email to verify
 * @param {string} recipientName
 * @param {string} verificationLink — full URL with token
 * @returns {{ subject: string, html: string }}
 */
function renderEmailVerificationEmail(recipientEmail, recipientName, verificationLink) {
    const bodyHtml = `
        <h2 class="text-title" style="margin-top: 0; margin-bottom: 18px; font-size: 22px; font-weight: 800; color: #0F172A; text-align: center; letter-spacing: -0.4px;">
            Verify Your New Email
        </h2>

        <p class="text-body" style="margin-top: 0; margin-bottom: 16px; font-size: 15px; color: #334155; line-height: 1.6;">
            Hello <strong>${recipientName}</strong>,
        </p>
        <p class="text-secondary" style="margin-top: 0; margin-bottom: 24px; font-size: 14.5px; color: #475569; line-height: 1.6;">
            We received a request to update your LabSync account email to this address. Click the button below to verify and complete this change:
        </p>

        ${ctaButton('Verify Email Address', verificationLink)}

        ${warningBox('🕒 Link Expiration',
        'This verification link is valid for <strong>1 hour</strong>. If you did not request this, your current active email will remain unchanged.')}

        ${fallbackLinkBox(verificationLink)}

        <hr class="divider-line" style="border: 0; border-top: 1px solid #F1F5F9; margin: 32px 0 24px 0;">
        <p class="text-secondary" style="margin-bottom: 0; font-size: 14px; color: #64748B; line-height: 1.5;">
            Best regards,<br>
            <strong class="text-title" style="color: #0F172A; font-size: 14.5px;">LabSync IT Team</strong>
        </p>`;

    return {
        subject: 'Verify Your New LabSync Email Address',
        html: wrapEmailHtml(bodyHtml)
    };
}

module.exports = { renderEmailVerificationEmail };
