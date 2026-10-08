'use strict';

/**
 * services/email/email.transport.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Google Apps Script Web App HTTPS transport layer for LabSync.
 *
 * Forwards transactional email dispatches to a Google Apps Script Web App
 * which sends messages via Gmail MailApp. Eliminates reliance on custom domain
 * verification or third-party paid email APIs while operating within Railway's
 * outbound HTTPS network environment.
 *
 * Architecture:
 * LabSync (Railway) ──HTTPS POST──> Google Apps Script Web App ──MailApp──> Gmail Recipient
 */

const dotenv = require('dotenv');

dotenv.config();

/**
 * Resolves the Google Apps Script Web App webhook URL from EMAIL_WEBHOOK_URL.
 * @returns {string}
 */
function getWebhookUrl() {
    return (process.env.EMAIL_WEBHOOK_URL || '').trim();
}

/**
 * Resolves the shared webhook authentication secret from EMAIL_WEBHOOK_SECRET.
 * @returns {string}
 */
function getWebhookSecret() {
    return (process.env.EMAIL_WEBHOOK_SECRET || '').trim();
}

/**
 * Resolves the sender display name / address from EMAIL_FROM environment variable.
 * Defaults to 'LabSync' if not configured.
 * @returns {string}
 */
function getSenderAddress() {
    if (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim()) {
        return process.env.EMAIL_FROM.trim();
    }
    return 'LabSync';
}

/**
 * Compatibility alias for legacy callers expecting getTransporter().
 * Returns information about the active webhook transport status.
 * @returns {{ type: string, isConfigured: boolean }}
 */
function getTransporter() {
    return {
        type: 'google-apps-script-webhook',
        isConfigured: Boolean(getWebhookUrl() && getWebhookSecret())
    };
}

/**
 * Legacy compatibility stub. Resend has been replaced with Google Apps Script.
 * Preserved for backwards compatibility with any external diagnostic scripts.
 * @returns {null}
 */
function getResendClient() {
    return null;
}

/**
 * Dispatches an email via Google Apps Script Web App HTTPS POST with timeout protection.
 * Preserves the exact signature, options, and error contract expected by email.service.js.
 *
 * @param {object} mailOptions - { from, to, subject, html, text, replyTo, reply_to }
 * @param {number} [timeoutMs=12000] - Request timeout in milliseconds
 * @returns {Promise<{ id: string, messageId: string, success: boolean, [key: string]: any }>}
 */
async function sendMailWithTimeout(mailOptions, timeoutMs = 12000) {
    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) {
        const errorMsg = 'EMAIL_WEBHOOK_URL environment variable is not configured. Email dispatch aborted.';
        console.error(`[emailTransport] Configuration Error: ${errorMsg}`);
        const err = new Error(errorMsg);
        err.code = 'MISSING_EMAIL_WEBHOOK_URL';
        throw err;
    }

    const webhookSecret = getWebhookSecret();
    if (!webhookSecret) {
        const errorMsg = 'EMAIL_WEBHOOK_SECRET environment variable is not configured. Email dispatch aborted.';
        console.error(`[emailTransport] Configuration Error: ${errorMsg}`);
        const err = new Error(errorMsg);
        err.code = 'MISSING_EMAIL_WEBHOOK_SECRET';
        throw err;
    }

    const fromAddress = mailOptions.from || getSenderAddress();
    const toRecipients = Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to];

    const payload = {
        secret: webhookSecret,
        from: fromAddress,
        to: toRecipients,
        subject: mailOptions.subject,
        html: mailOptions.html
    };

    if (mailOptions.text) {
        payload.text = mailOptions.text;
    }
    if (mailOptions.replyTo || mailOptions.reply_to) {
        payload.replyTo = mailOptions.replyTo || mailOptions.reply_to;
    }

    let timerId;
    const controller = new AbortController();

    const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            controller.abort();
            const timeoutErr = new Error(`Google Apps Script webhook send timed out after ${timeoutMs}ms`);
            timeoutErr.code = 'WEBHOOK_TIMEOUT';
            reject(timeoutErr);
        }, timeoutMs);
    });

    const sendPromise = (async () => {
        return fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-LabSync-Webhook-Secret': webhookSecret,
                'Authorization': `Bearer ${webhookSecret}`
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
            redirect: 'follow'
        });
    })();

    let response;
    try {
        response = await Promise.race([sendPromise, timeoutPromise]);
    } catch (raceErr) {
        if (raceErr.code === 'WEBHOOK_TIMEOUT' || raceErr.name === 'AbortError' || controller.signal.aborted) {
            const timeoutErr = new Error(`Google Apps Script webhook send timed out after ${timeoutMs}ms`);
            timeoutErr.code = 'WEBHOOK_TIMEOUT';
            console.error(`[emailTransport] Webhook Timeout: ${timeoutErr.message}`);
            throw timeoutErr;
        }
        console.error(`[emailTransport] Network error sending email to ${toRecipients.join(', ')}:`, raceErr.message);
        const networkErr = new Error(`Network failure communicating with Google Apps Script: ${raceErr.message}`);
        networkErr.code = 'WEBHOOK_NETWORK_ERROR';
        networkErr.cause = raceErr;
        throw networkErr;
    } finally {
        if (timerId) clearTimeout(timerId);
    }

    // Handle HTTP-level errors (non-2xx responses)
    if (!response.ok) {
        let errorDetail = '';
        try {
            errorDetail = await response.text();
        } catch (_) {}

        if (response.status === 401 || response.status === 403) {
            const errMsg = 'Unauthorized: Google Apps Script rejected request. Invalid or missing secret.';
            console.error(`[emailTransport] Authentication Error: ${errMsg} (HTTP ${response.status})`);
            const err = new Error(errMsg);
            err.code = 'UNAUTHORIZED_WEBHOOK';
            err.statusCode = response.status;
            throw err;
        }

        const errMsg = `Google Apps Script returned HTTP error ${response.status}: ${errorDetail || response.statusText}`;
        console.error(`[emailTransport] HTTP Error sending to ${toRecipients.join(', ')}: [${response.status}] ${errMsg}`);
        const err = new Error(errMsg);
        err.code = 'WEBHOOK_HTTP_ERROR';
        err.statusCode = response.status;
        throw err;
    }

    // Parse JSON response body
    let result;
    try {
        result = await response.json();
    } catch (parseErr) {
        const errMsg = 'Invalid JSON response received from Google Apps Script webhook';
        console.error(`[emailTransport] Protocol Error: ${errMsg}: ${parseErr.message}`);
        const err = new Error(errMsg);
        err.code = 'INVALID_WEBHOOK_RESPONSE';
        throw err;
    }

    if (!result || typeof result !== 'object') {
        const errMsg = 'Malformed response object received from Google Apps Script webhook';
        console.error(`[emailTransport] Protocol Error: ${errMsg}`);
        const err = new Error(errMsg);
        err.code = 'INVALID_WEBHOOK_RESPONSE';
        throw err;
    }

    // Inspect business-level success flag
    if (result.success !== true) {
        const errMsg = result.error || 'Google Apps Script reported email delivery failure';
        const isUnauthorized = result.statusCode === 401 || /unauthorized/i.test(errMsg);
        const errCode = isUnauthorized ? 'UNAUTHORIZED_WEBHOOK' : (result.code || 'WEBHOOK_DISPATCH_FAILED');

        console.error(`[emailTransport] Dispatch Error sending to ${toRecipients.join(', ')}: [${errCode}] ${errMsg}`);
        const err = new Error(errMsg);
        err.code = errCode;
        err.statusCode = result.statusCode || (isUnauthorized ? 401 : 500);
        throw err;
    }

    const messageId = result.messageId || result.id || `gas_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    console.log(`[emailService] Email successfully sent to ${toRecipients.join(', ')}. Webhook ID: ${messageId}`);

    return {
        id: messageId,
        messageId: messageId,
        success: true,
        ...result
    };
}

module.exports = {
    getWebhookUrl,
    getWebhookSecret,
    getSenderAddress,
    getTransporter,
    getResendClient,
    sendMailWithTimeout
};
