'use strict';

/**
 * services/emailService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Configures the Nodemailer transporter and exposes the three transactional
 * email functions used throughout LabSync:
 *
 *   • sendWelcomeEmail          — new faculty account credentials
 *   • sendResetPasswordEmail    — password recovery link
 *   • sendEmailVerificationEmail — new-email verification link
 *
 * All functions return true on success, false on failure (they do NOT throw).
 */

const nodemailer = require('nodemailer');
const path = require('path');

// ─── Transporter ─────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
});

/**
 * Wraps transporter.sendMail with a maximum timeout safeguard to prevent hanging HTTP responses.
 * @param {object} mailOptions
 * @param {number} [timeoutMs=12000]
 * @returns {Promise<any>}
 */
async function sendMailWithTimeout(mailOptions, timeoutMs = 12000) {
    let timerId;
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            reject(new Error(`SMTP send timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
        if (timerId) clearTimeout(timerId);
    }
}

// ─── Shared Assets ───────────────────────────────────────────────────────────

const LOGO_ATTACHMENT = {
    filename: 'labsync-logo.png',
    path: path.join(__dirname, '..', 'assets', 'labsync-logo.png'),
    cid: 'labsync-logo',
};

/** Shared email wrapper — outer container used in every template. */
function wrapEmailHtml(bodyHtml) {
    return `
        <div style="font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                    background-color:#F8FAFC;padding:40px 20px;line-height:1.6;">
            <div style="max-width:540px;margin:0 auto;background-color:#FFFFFF;border-radius:20px;
                        border:1px solid #E2E8F0;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.03);">

                <!-- Header -->
                <div style="padding:32px 40px;background:linear-gradient(135deg,#FAFAFA 0%,#F4F5F7 100%);
                            border-bottom:1px solid #E2E8F0;text-align:center;">
                    <img src="cid:labsync-logo" alt="LabSync Logo"
                         style="height:52px;display:block;margin:0 auto;">
                </div>

                <!-- Body -->
                <div style="padding:40px;">
                    ${bodyHtml}
                </div>

                <!-- Footer -->
                <div style="padding:24px 40px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;
                            text-align:center;font-size:12px;color:#94A3B8;font-weight:500;">
                    <p style="margin:0 0 6px 0;">Bulacan State University — Sarmiento Campus</p>
                    <p style="margin:0;">© 2026 LabSync. All rights reserved.</p>
                </div>
            </div>
        </div>`;
}

/** Standard action-button CTA used across templates. */
function ctaButton(label, href) {
    return `
        <div style="text-align:center;margin:32px 0;">
            <a href="${href}"
               style="background-color:#1EBBD7;color:#FFFFFF;text-decoration:none;
                      padding:14px 28px;font-size:14.5px;font-weight:700;border-radius:8px;
                      display:inline-block;box-shadow:0 4px 14px rgba(30,187,215,0.3);">
                ${label}
            </a>
        </div>`;
}

/** Warning callout with amber left-border. */
function warningBox(titleText, bodyText) {
    return `
        <div style="background-color:#FFFBEB;border-left:4px solid #F59E0B;padding:16px;
                    border-radius:8px;margin-bottom:28px;font-size:13.5px;color:#B45309;line-height:1.5;">
            <strong style="color:#92400E;display:block;margin-bottom:4px;">${titleText}</strong>
            ${bodyText}
        </div>`;
}

/** Fallback plain-text link box shown below buttons. */
function fallbackLinkBox(href) {
    return `
        <div style="font-size:12px;color:#94A3B8;word-break:break-all;background-color:#F8FAFC;
                    border:1px solid #E2E8F0;padding:12px;border-radius:8px;">
            If you're having trouble clicking the button, copy and paste this link in your browser:<br>
            <a href="${href}" style="color:#1EBBD7;text-decoration:underline;">${href}</a>
        </div>`;
}

// ─── Email Functions ──────────────────────────────────────────────────────────

/**
 * Sends a welcome email containing generated login credentials to a new faculty member.
 *
 * @param {string} recipientEmail
 * @param {string} recipientName
 * @param {string} password — the plain-text generated password (temporary)
 * @returns {Promise<boolean>}
 */
async function sendWelcomeEmail(recipientEmail, recipientName, password) {
    const bodyHtml = `
        <h2 style="margin-top:0;margin-bottom:24px;font-size:20px;font-weight:700;
                   color:#0F172A;text-align:center;letter-spacing:-0.3px;">Welcome to LabSync!</h2>

        <p style="margin-top:0;margin-bottom:20px;font-size:15px;color:#334155;">
            Hello <strong>${recipientName}</strong>,
        </p>
        <p style="margin-top:0;margin-bottom:24px;font-size:14.5px;color:#475569;line-height:1.6;">
            Your faculty account has been created successfully. Below are your temporary login credentials:
        </p>

        <!-- Credentials Block -->
        <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;padding:24px;
                    border-radius:12px;margin-bottom:24px;">
            <div style="margin-bottom:14px;">
                <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;
                            letter-spacing:0.5px;margin-bottom:4px;">Email Address</div>
                <div style="font-family:'Consolas','Courier New',monospace;font-size:15px;font-weight:700;
                            color:#0F172A;background-color:#FFFFFF;border:1px solid #E2E8F0;
                            padding:8px 12px;border-radius:8px;word-break:break-all;">
                    ${recipientEmail}
                </div>
            </div>
            <div>
                <div style="font-size:12px;font-weight:700;color:#64748B;text-transform:uppercase;
                            letter-spacing:0.5px;margin-bottom:4px;">Temporary Password</div>
                <div style="font-family:'Consolas','Courier New',monospace;font-size:15px;font-weight:700;
                            color:#0F172A;background-color:#FFFFFF;border:1px solid #E2E8F0;
                            padding:8px 12px;border-radius:8px;word-break:break-all;">
                    ${password}
                </div>
            </div>
        </div>

        ${warningBox('⚠️ Action Required',
        'For security reasons, you are required to change this password immediately after your first sign-in.')}

        ${ctaButton('Access Your Account',
            `${process.env.APP_URL || 'http://localhost:3000'}/login.html`)}

        <hr style="border:0;border-top:1px solid #F1F5F9;margin:32px 0;">
        <p style="margin-bottom:0;font-size:14px;color:#64748B;">
            Best regards,<br>
            <strong style="color:#0F172A;">LabSync Team</strong>
        </p>`;

    try {
        await sendMailWithTimeout({
            from: process.env.EMAIL_USER,
            to: recipientEmail,
            subject: 'Welcome to LabSync - Your Account Credentials',
            html: wrapEmailHtml(bodyHtml),
            attachments: [LOGO_ATTACHMENT],
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
    const bodyHtml = `
        <h2 style="margin-top:0;margin-bottom:24px;font-size:20px;font-weight:700;
                   color:#0F172A;text-align:center;letter-spacing:-0.3px;">Reset Your Password</h2>

        <p style="margin-top:0;margin-bottom:20px;font-size:15px;color:#334155;">
            Hello <strong>${recipientName}</strong>,
        </p>
        <p style="margin-top:0;margin-bottom:24px;font-size:14.5px;color:#475569;line-height:1.6;">
            We received a request to reset the password for your LabSync account.
            Click the button below to set a new password:
        </p>

        ${ctaButton('Reset Password', resetLink)}

        ${warningBox('🕒 Link Expiration',
        'This reset link is valid for <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.')}

        ${fallbackLinkBox(resetLink)}

        <hr style="border:0;border-top:1px solid #F1F5F9;margin:32px 0;">
        <p style="margin-bottom:0;font-size:14px;color:#64748B;">
            Best regards,<br>
            <strong style="color:#0F172A;">LabSync Team</strong>
        </p>`;

    try {
        await sendMailWithTimeout({
            from: process.env.EMAIL_USER,
            to: recipientEmail,
            subject: 'Reset Your LabSync Password',
            html: wrapEmailHtml(bodyHtml),
            attachments: [LOGO_ATTACHMENT],
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
    const bodyHtml = `
        <h2 style="margin-top:0;margin-bottom:24px;font-size:20px;font-weight:700;
                   color:#0F172A;text-align:center;letter-spacing:-0.3px;">Verify Your New Email Address</h2>

        <p style="margin-top:0;margin-bottom:20px;font-size:15px;color:#334155;">
            Hello <strong>${recipientName}</strong>,
        </p>
        <p style="margin-top:0;margin-bottom:24px;font-size:14.5px;color:#475569;line-height:1.6;">
            We received a request to change your LabSync account email to this address.
            Click the button below to verify and complete this change:
        </p>

        ${ctaButton('Verify Email Address', verificationLink)}

        ${warningBox('🕒 Link Expiration',
        'This verification link is valid for <strong>1 hour</strong>. If you did not request this, your current active email will remain unchanged.')}

        ${fallbackLinkBox(verificationLink)}

        <hr style="border:0;border-top:1px solid #F1F5F9;margin:32px 0;">
        <p style="margin-bottom:0;font-size:14px;color:#64748B;">
            Best regards,<br>
            <strong style="color:#0F172A;">LabSync Team</strong>
        </p>`;

    try {
        await sendMailWithTimeout({
            from: process.env.EMAIL_USER,
            to: recipientEmail,
            subject: 'Verify Your New LabSync Email Address',
            html: wrapEmailHtml(bodyHtml),
            attachments: [LOGO_ATTACHMENT],
        });
        return true;
    } catch (err) {
        console.error('[emailService] sendEmailVerificationEmail failed:', err.message);
        return false;
    }
}

module.exports = { sendWelcomeEmail, sendResetPasswordEmail, sendEmailVerificationEmail };
