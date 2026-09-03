'use strict';

const dotenv = require('dotenv');

dotenv.config();

const { APP_URL } = require('../../../config/app.config');
const { wrapEmailHtml, warningBox, ctaButton } = require('./shell');

/**
 * Renders HTML body and subject for the welcome email to a new faculty member.
 *
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} password — the plain-text generated password (temporary)
 * @returns {{ subject: string, html: string }}
 */
function renderWelcomeEmail(recipientEmail, recipientName, password) {
    const bodyHtml = `
        <h2 class="text-title" style="margin-top: 0; margin-bottom: 18px; font-size: 22px; font-weight: 800; color: #0F172A; text-align: center; letter-spacing: -0.4px;">
            Welcome to LabSync!
        </h2>

        <p class="text-body" style="margin-top: 0; margin-bottom: 16px; font-size: 15px; color: #334155; line-height: 1.6;">
            Hello <strong>${recipientName}</strong>,
        </p>
        <p class="text-secondary" style="margin-top: 0; margin-bottom: 24px; font-size: 14.5px; color: #475569; line-height: 1.6;">
            Your faculty account has been created successfully. Below are your temporary login credentials:
        </p>

        <!-- Credentials Block -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="box-credential" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; margin-bottom: 24px;">
            <tr>
                <td style="padding: 20px;">
                    <!-- Email Field Block -->
                    <div style="margin-bottom: 16px;">
                        <div class="field-label" style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px;">
                            Email Address
                        </div>
                        <div class="field-value" style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 14.5px; font-weight: 700; color: #0F172A; background-color: #FFFFFF; border: 1.5px solid #CBD5E1; padding: 10px 14px; border-radius: 10px; word-break: break-all;">
                            ${recipientEmail}
                        </div>
                    </div>

                    <!-- Password Field Block -->
                    <div>
                        <div class="field-label" style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px;">
                            Temporary Password
                        </div>
                        <div class="field-value" style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; font-size: 15px; font-weight: 700; color: #0F172A; background-color: #FFFFFF; border: 1.5px solid #CBD5E1; padding: 10px 14px; border-radius: 10px; word-break: break-all; letter-spacing: 0.5px;">
                            ${password}
                        </div>
                    </div>
                </td>
            </tr>
        </table>

        ${warningBox('⚠️ Action Required',
        'For security reasons, you are required to change this temporary password immediately after your first sign-in.')}

        ${ctaButton('Access Your Account',
        `${APP_URL}/login.html`)}

        <hr class="divider-line" style="border: 0; border-top: 1px solid #F1F5F9; margin: 32px 0 24px 0;">
        <p class="text-secondary" style="margin-bottom: 0; font-size: 14px; color: #64748B; line-height: 1.5;">
            Best regards,<br>
            <strong class="text-title" style="color: #0F172A; font-size: 14.5px;">LabSync IT Team</strong>
        </p>`;

    return {
        subject: 'Welcome to LabSync - Your Account Credentials',
        html: wrapEmailHtml(bodyHtml)
    };
}

module.exports = { renderWelcomeEmail };
