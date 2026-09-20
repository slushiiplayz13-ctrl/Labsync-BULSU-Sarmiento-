'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { APP_URL } = require('../config/app.config');
const { sendResetPasswordEmail } = require('./emailService');
const userRepository = require('../repositories/user.repository');

const BCRYPT_SALT_ROUNDS = 12;
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Checks if a string conforms to the standard Modular Crypt Format for bcrypt hashes ($2a$, $2b$, or $2y$).
 * @param {string} value
 * @returns {boolean}
 */
function isBcryptHash(value) {
    return typeof value === 'string' && BCRYPT_HASH_REGEX.test(value);
}

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

/**
 * Evaluates whether an OJT account's internship period has concluded.
 * Returns true only if ojtEndDate is set and the current local calendar date has strictly passed it.
 * An OJT whose OJT_End_Date is TODAY is strictly permitted to log in.
 *
 * @param {Date|string|null} ojtEndDate
 * @returns {boolean}
 */
function isOjtExpired(ojtEndDate) {
    if (!ojtEndDate) return false;

    let endYMD;
    if (ojtEndDate instanceof Date) {
        const y = ojtEndDate.getFullYear();
        const m = String(ojtEndDate.getMonth() + 1).padStart(2, '0');
        const d = String(ojtEndDate.getDate()).padStart(2, '0');
        endYMD = `${y}-${m}-${d}`;
    } else if (typeof ojtEndDate === 'string') {
        endYMD = ojtEndDate.substring(0, 10);
    } else {
        return false;
    }

    const now = new Date();
    const curY = now.getFullYear();
    const curM = String(now.getMonth() + 1).padStart(2, '0');
    const curD = String(now.getDate()).padStart(2, '0');
    const curYMD = `${curY}-${curM}-${curD}`;

    return curYMD > endYMD;
}

async function loginUser(email, password) {
    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Please enter a valid email address format (e.g., user@domain.com).' };
    }

    if (!password || typeof password !== 'string') {
        return { status: 401, error: 'Invalid email or password' };
    }

    const [users] = await userRepository.findByEmail(email);

    if (users.length === 0) {
        return { status: 401, error: 'Invalid email or password' };
    }

    const user = users[0];
    const storedPassword = user.Password;

    if (!storedPassword || !isBcryptHash(storedPassword)) {
        return { status: 401, error: 'Invalid email or password' };
    }

    const isMatch = await bcrypt.compare(password, storedPassword);
    if (!isMatch) {
        return { status: 401, error: 'Invalid email or password' };
    }

    // Lifecycle status enforcement
    if (user.Status === 'DEACTIVATED') {
        return {
            status: 401,
            error: 'Your account has been deactivated. Please contact the administrator.',
            code: 'ACCOUNT_DEACTIVATED'
        };
    }

    // OJT temporal period enforcement
    if (user.Role === 'OJT' && isOjtExpired(user.OJT_End_Date)) {
        return {
            status: 401,
            error: 'Your OJT internship period has concluded. Please contact the MIS Staff.',
            code: 'OJT_EXPIRED'
        };
    }

    return {
        status: 200,
        data: {
            message: 'Login successful',
            user: {
                id: user.User_ID,
                name: user.Name,
                email: user.Email,
                role: user.Role,
                status: user.Status
            }
        },
        rawUser: user
    };
}

const GENERIC_RECOVERY_MESSAGE = 'If an account exists with that email address, a password recovery link has been sent.';

/**
 * Computes a deterministic SHA-256 hash of a reset token for secure database storage and lookup.
 * @param {string} token
 * @returns {string}
 */
function hashResetToken(token) {
    if (!token || typeof token !== 'string') {
        return '';
    }
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

async function recoverPassword(email) {
    if (!email || !isValidEmailFormat(email)) {
        return { status: 400, error: 'Please enter a valid email address (e.g., user@domain.com).' };
    }

    const [users] = await userRepository.findBasicByEmail(email);
    if (users.length === 0) {
        return { status: 200, message: GENERIC_RECOVERY_MESSAGE };
    }

    const user = users[0];
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = hashResetToken(rawToken);
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);

    await userRepository.updateResetToken(user.User_ID, hashedToken, expiry);

    const resetLink = `${APP_URL}/reset-password.html?token=${rawToken}`;
    const emailSent = await sendResetPasswordEmail(user.Email, user.Name, resetLink);

    if (!emailSent) {
        console.error(`[authService] Failed to dispatch password reset email to user ${user.User_ID}`);
    }

    return { status: 200, message: GENERIC_RECOVERY_MESSAGE };
}

async function validateResetToken(token) {
    if (!token || typeof token !== 'string' || !token.trim()) {
        return { status: 400, valid: false, error: 'Token is required.' };
    }

    const hashedToken = hashResetToken(token);
    const [users] = await userRepository.findByResetToken(hashedToken);

    if (users.length === 0) {
        return { status: 400, valid: false, error: 'Reset link is invalid or has expired.' };
    }

    return { status: 200, valid: true };
}

const auditService = require('./auditService');

async function resetPassword(token, password) {
    if (!token || typeof token !== 'string' || !token.trim() || !password) {
        return { status: 400, error: 'Token and new password are required.' };
    }

    const hashedToken = hashResetToken(token);
    const [users] = await userRepository.findByResetToken(hashedToken);

    if (users.length === 0) {
        return { status: 400, error: 'Reset link is invalid or has expired.' };
    }

    const user = users[0];
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await userRepository.updatePasswordReset(user.User_ID, hashedPassword);

    auditService.logSecurityEvent({
        userId: user.User_ID,
        actorEmail: user.Email,
        actorRole: user.Role,
        action: 'PASSWORD_RESET',
        resourceType: 'USER',
        resourceId: user.User_ID,
        result: 'SUCCESS'
    });

    return { status: 200, message: 'Password has been reset successfully. You can now log in with your new password.' };
}

module.exports = {
    BCRYPT_SALT_ROUNDS,
    isBcryptHash,
    isValidEmailFormat,
    isOjtExpired,
    loginUser,
    recoverPassword,
    validateResetToken,
    resetPassword,
    hashResetToken
};
