'use strict';

const db = require('../db');
const crypto = require('crypto');
const { sendResetPasswordEmail } = require('./emailService');

function isValidEmailFormat(email) {
    if (!email || typeof email !== 'string') return false;
    const cleanEmail = email.trim().toLowerCase();

    const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
    if (!basicRegex.test(cleanEmail)) return false;

    if (cleanEmail.includes('..') || cleanEmail.includes('@.') || cleanEmail.includes('.@')) return false;

    const parts = cleanEmail.split('@');
    if (parts.length !== 2) return false;
    const domainParts = parts[1].split('.');
    if (domainParts.length < 2) return false;

    const fullTld = domainParts.slice(1).join('.');
    const mainTld = domainParts[domainParts.length - 1];

    const validTLDs = new Set([
        'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'store', 'tech', 'app', 'dev',
        'ph', 'edu.ph', 'com.ph', 'gov.ph', 'org.ph', 'net.ph',
        'us', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'de', 'fr', 'br', 'ru', 'sg', 'my'
    ]);

    return validTLDs.has(fullTld) || validTLDs.has(mainTld);
}

async function loginUser(email, password) {
    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Please enter a valid email address format (e.g., user@domain.com).' };
    }

    const [users] = await db.query('SELECT * FROM users WHERE Email = ?', [email]);

    if (users.length === 0 || users[0].Password !== password) {
        return { status: 401, error: 'Invalid email or password' };
    }

    const user = users[0];
    return {
        status: 200,
        data: {
            message: 'Login successful',
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role
            }
        },
        rawUser: user
    };
}

async function recoverPassword(email) {
    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Please enter a valid email address (e.g., user@domain.com).' };
    }

    const [users] = await db.query('SELECT User_ID, Name, Email FROM users WHERE Email = ?', [email]);
    if (users.length === 0) {
        return { status: 404, error: 'No account found with this email address.' };
    }

    const user = users[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);

    await db.query(
        'UPDATE users SET Reset_Token = ?, Reset_Token_Expiry = ? WHERE User_ID = ?',
        [token, expiry, user.User_ID]
    );

    const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
    const emailSent = await sendResetPasswordEmail(user.Email, user.Name, resetLink);

    if (!emailSent) {
        return { status: 500, error: 'Failed to send recovery email. Please try again later.' };
    }

    return { status: 200, message: 'Password recovery email sent. Please check your inbox.' };
}

async function validateResetToken(token) {
    if (!token) {
        return { status: 400, valid: false, error: 'Token is required.' };
    }

    const [users] = await db.query(
        'SELECT User_ID FROM users WHERE Reset_Token = ? AND Reset_Token_Expiry > NOW()',
        [token]
    );

    if (users.length === 0) {
        return { status: 400, valid: false, error: 'Reset link is invalid or has expired.' };
    }

    return { status: 200, valid: true };
}

async function resetPassword(token, password) {
    if (!token || !password) {
        return { status: 400, error: 'Token and new password are required.' };
    }

    const [users] = await db.query(
        'SELECT User_ID FROM users WHERE Reset_Token = ? AND Reset_Token_Expiry > NOW()',
        [token]
    );

    if (users.length === 0) {
        return { status: 400, error: 'Reset link is invalid or has expired.' };
    }

    const user = users[0];
    await db.query(
        'UPDATE users SET Password = ?, Reset_Token = NULL, Reset_Token_Expiry = NULL WHERE User_ID = ?',
        [password, user.User_ID]
    );

    return { status: 200, message: 'Password has been reset successfully. You can now log in with your new password.' };
}

module.exports = {
    isValidEmailFormat,
    loginUser,
    recoverPassword,
    validateResetToken,
    resetPassword
};
