'use strict';

const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

function getTransporter() {
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT) || 465,
        secure: process.env.EMAIL_SECURE !== 'false' && (Number(process.env.EMAIL_PORT) === 465 || !process.env.EMAIL_PORT),
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000
    });
}

function getSenderAddress() {
    return process.env.EMAIL_FROM || (process.env.EMAIL_USER ? `"LabSync - BulSU" <${process.env.EMAIL_USER}>` : '"LabSync" <noreply@labsync.local>');
}

/**
 * Wraps transporter.sendMail with a maximum timeout safeguard to prevent hanging HTTP responses.
 * @param {object} mailOptions
 * @param {number} [timeoutMs=12000]
 * @returns {Promise<any>}
 */
async function sendMailWithTimeout(mailOptions, timeoutMs = 12000) {
    let timerId;
    const transporter = getTransporter();
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            reject(new Error(`SMTP send timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        const info = await Promise.race([sendPromise, timeoutPromise]);
        console.log(`[emailService] Email successfully sent to ${mailOptions.to}. MessageId: ${info && info.messageId}`);
        return info;
    } finally {
        if (timerId) clearTimeout(timerId);
    }
}

module.exports = {
    getTransporter,
    getSenderAddress,
    sendMailWithTimeout
};
