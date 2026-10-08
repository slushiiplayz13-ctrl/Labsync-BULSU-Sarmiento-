'use strict';

const { Resend } = require('resend');
const dotenv = require('dotenv');

dotenv.config();

let cachedClient = null;
let cachedApiKey = null;

/**
 * Returns a cached Resend client instance initialized with RESEND_API_KEY.
 * Returns null if RESEND_API_KEY is not configured.
 * @returns {Resend|null}
 */
function getResendClient() {
    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
        return null;
    }
    if (!cachedClient || cachedApiKey !== apiKey) {
        cachedClient = new Resend(apiKey);
        cachedApiKey = apiKey;
    }
    return cachedClient;
}

/**
 * Compatibility alias for legacy callers expecting getTransporter().
 * @returns {Resend|null}
 */
function getTransporter() {
    return getResendClient();
}

/**
 * Resolves the sender address from EMAIL_FROM environment variable.
 * Defaults to Resend's standard sandbox sender (onboarding@resend.dev) if not set.
 * @returns {string}
 */
function getSenderAddress() {
    if (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim()) {
        return process.env.EMAIL_FROM.trim();
    }
    return 'LabSync <onboarding@resend.dev>';
}

/**
 * Dispatches an email via Resend HTTPS API with a maximum timeout safeguard.
 * Preserves the exact signature and behavior expected by email.service.js.
 *
 * @param {object} mailOptions - { from, to, subject, html, text, replyTo }
 * @param {number} [timeoutMs=12000]
 * @returns {Promise<{ id: string, messageId: string }>}
 */
async function sendMailWithTimeout(mailOptions, timeoutMs = 12000) {
    const client = getResendClient();
    if (!client) {
        const errorMsg = 'RESEND_API_KEY environment variable is not configured. Email dispatch aborted.';
        console.error(`[emailTransport] Configuration Error: ${errorMsg}`);
        const err = new Error(errorMsg);
        err.code = 'MISSING_RESEND_API_KEY';
        throw err;
    }

    const fromAddress = mailOptions.from || getSenderAddress();
    const toRecipients = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];

    const payload = {
        from: fromAddress,
        to: toRecipients,
        subject: mailOptions.subject,
        html: mailOptions.html
    };

    if (mailOptions.text) {
        payload.text = mailOptions.text;
    }
    if (mailOptions.replyTo || mailOptions.reply_to) {
        payload.reply_to = mailOptions.replyTo || mailOptions.reply_to;
    }

    let timerId;
    const sendPromise = client.emails.send(payload);
    const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            reject(new Error(`Resend HTTPS send timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        const response = await Promise.race([sendPromise, timeoutPromise]);
        const { data, error } = response || {};

        if (error) {
            const errMsg = error.message || 'Resend API error';
            const errCode = error.name || error.statusCode || 'RESEND_ERROR';
            console.error(`[emailTransport] Resend API error sending to ${toRecipients.join(', ')}: [${errCode}] ${errMsg}`);
            const err = new Error(errMsg);
            err.code = errCode;
            err.statusCode = error.statusCode;
            throw err;
        }

        const messageId = data && data.id;
        console.log(`[emailService] Email successfully sent to ${toRecipients.join(', ')}. Resend ID: ${messageId}`);
        return {
            id: messageId,
            messageId: messageId,
            ...data
        };
    } catch (err) {
        if (err.code !== 'RESEND_ERROR' && !err.statusCode && err.code !== 'MISSING_RESEND_API_KEY') {
            console.error(`[emailTransport] Unexpected error sending email to ${toRecipients.join(', ')}:`, err.message);
        }
        throw err;
    } finally {
        if (timerId) clearTimeout(timerId);
    }
}

module.exports = {
    getResendClient,
    getTransporter,
    getSenderAddress,
    sendMailWithTimeout
};
