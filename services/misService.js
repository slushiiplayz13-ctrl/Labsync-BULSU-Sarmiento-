'use strict';

/**
 * services/misService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic and security domain service for MIS Staff account lifecycle management.
 * 
 * Enforces:
 * - Exclusive IT Dept. Head administration
 * - Strict single active MIS Staff account constraint with transactional locking
 * - Outgoing MIS account deactivation (preserves historical maintenance & audit attribution)
 * - Cryptographically secure temporary password generation
 * - Centralized input validation (Name, Email, Phone)
 * - Asynchronous welcome email dispatch
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const misRepository = require('../repositories/mis.repository');
const userRepository = require('../repositories/user.repository');
const { isValidEmailFormat, BCRYPT_SALT_ROUNDS } = require('./authService');
const { sendWelcomeEmail } = require('./emailService');

const SALT_ROUNDS = BCRYPT_SALT_ROUNDS || 12;

/**
 * Generates a cryptographically secure, high-entropy temporary password
 * meeting LabSync password complexity rules.
 */
function generateSecureTemporaryPassword(length = 12) {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    const all = uppercase + lowercase + digits + special;

    const chars = [
        uppercase[crypto.randomInt(0, uppercase.length)],
        lowercase[crypto.randomInt(0, lowercase.length)],
        digits[crypto.randomInt(0, digits.length)],
        special[crypto.randomInt(0, special.length)]
    ];

    for (let i = chars.length; i < length; i++) {
        chars.push(all[crypto.randomInt(0, all.length)]);
    }

    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
}

/**
 * Validates full name format and checks for duplicate names across users.
 */
async function validateName(name, excludeUserId = 0) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return { error: 'Full name is required.' };
    }
    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 2) {
        return { error: 'Full name must be at least 2 characters long.' };
    }
    if (trimmed.length > 60) {
        return { error: 'Full name must not exceed 60 characters.' };
    }
    if (/\d/.test(trimmed)) {
        return { error: 'Numbers are not allowed in full name.' };
    }
    const nameRegex = /^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s.',-]+$/;
    if (!nameRegex.test(trimmed)) {
        return { error: 'Special symbols are not allowed in full name.' };
    }

    const [existing] = await userRepository.findByNameExcludingUser(trimmed, excludeUserId);
    if (existing && existing.length > 0) {
        return {
            error: `A user with the name "${trimmed}" already exists. Please differentiate using a middle initial or suffix.`
        };
    }

    return { value: trimmed };
}

/**
 * Validates email format and checks for system-wide uniqueness.
 */
async function validateEmail(email, excludeUserId = 0) {
    if (!email || typeof email !== 'string' || email.trim().length === 0) {
        return { error: 'Email address is required.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidEmailFormat(cleanEmail)) {
        return { error: 'Invalid email address format. Please enter a valid email (e.g., user@domain.com).' };
    }

    const [existing] = await userRepository.findByEmailExceptId(cleanEmail, excludeUserId);
    if (existing && existing.length > 0) {
        return { error: 'Email address already exists in the system.' };
    }

    return { value: cleanEmail };
}

/**
 * Validates optional contact number format (Philippine 11-digit standard).
 */
function validatePhone(phone) {
    if (phone === undefined || phone === null || phone === '') {
        return { value: null };
    }
    if (typeof phone !== 'string') {
        return { error: 'Contact number must contain exactly 11 digits.' };
    }
    const cleanPhone = phone.trim();
    if (!/^\d{11}$/.test(cleanPhone)) {
        return { error: 'Contact number must contain exactly 11 digits.' };
    }
    return { value: cleanPhone };
}

/**
 * Checks that the target user exists and has Role = 'MIS Staff'.
 */
async function verifyTargetIsMisStaff(userId) {
    const parsedId = Number(userId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return { status: 400, error: 'Invalid user ID. Must be a positive integer.' };
    }

    const [rows] = await misRepository.findById(parsedId);
    if (!rows || rows.length === 0) {
        return { status: 404, error: 'MIS Staff account not found.' };
    }

    return { user: rows[0] };
}

/**
 * Retrieves the roster of MIS Staff accounts grouped into active and historical accounts.
 */
async function getMisStaffRoster() {
    const [rows] = await misRepository.findAllMisStaff();
    const active = rows.find(u => u.Status === 'ACTIVE') || null;
    const history = rows.filter(u => u.Status === 'DEACTIVATED');

    return {
        status: 200,
        data: {
            active,
            history,
            all: rows
        }
    };
}

/**
 * Creates a new MIS Staff account with concurrency-safe single active account enforcement.
 */
async function createMisStaff(reqBody) {
    const { name, email, phone } = reqBody;

    // 1. Validate inputs
    const nameResult = await validateName(name, 0);
    if (nameResult.error) {
        return { status: 400, error: nameResult.error };
    }

    const emailResult = await validateEmail(email, 0);
    if (emailResult.error) {
        return { status: 400, error: emailResult.error };
    }

    const phoneResult = validatePhone(phone);
    if (phoneResult.error) {
        return { status: 400, error: phoneResult.error };
    }

    // 2. Generate secure temporary password & QR string
    const temporaryPassword = generateSecureTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);
    const qrString = `LABSYNC-USER-MISSTAFF-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // 3. Concurrency-safe insertion inside database transaction with row locking
    let newUserId = null;
    try {
        const txResult = await misRepository.withLifecycleLockAndTransaction(async (connection) => {
            // Check if an active MIS Staff account already exists with exclusive lock
            const [activeRows] = await misRepository.findActiveMisStaffForUpdate(connection);
            if (activeRows && activeRows.length > 0) {
                return {
                    conflict: true,
                    error: 'An active MIS Staff account already exists. Please deactivate the current MIS Staff account before creating a replacement.'
                };
            }

            const [insertResult] = await misRepository.insertMisStaff({
                name: nameResult.value,
                email: emailResult.value,
                passwordHash,
                phone: phoneResult.value,
                qrString
            }, connection);

            newUserId = insertResult.insertId;
            return { conflict: false };
        });

        if (txResult && txResult.lockFailed) {
            return { status: 503, error: txResult.error };
        }

        if (txResult && txResult.conflict) {
            return { status: 409, error: txResult.error };
        }
    } catch (err) {
        console.error('[misService] Error in createMisStaff transaction:', err);
        throw err;
    }

    // 4. Retrieve created record
    const [createdRows] = await misRepository.findById(newUserId);
    const createdUser = createdRows && createdRows.length > 0 ? createdRows[0] : null;

    // 5. Asynchronously dispatch welcome email with credentials
    sendWelcomeEmail(emailResult.value, nameResult.value, temporaryPassword)
        .then(sent => {
            if (!sent) {
                console.warn(`[misService] Welcome email failed for ${emailResult.value}; manual credential delivery required.`);
            } else {
                console.log(`[misService] Welcome email successfully delivered to ${emailResult.value}`);
            }
        })
        .catch(err => {
            console.error(`[misService] Welcome email error for ${emailResult.value}:`, err.message);
        });

    return {
        status: 201,
        data: {
            message: 'MIS Staff account created successfully',
            user: createdUser,
            temporaryPassword
        }
    };
}

/**
 * Updates profile details (Name, Email, Phone) for an existing MIS Staff account.
 */
async function updateMisStaff(userId, reqBody) {
    const targetCheck = await verifyTargetIsMisStaff(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    const { name, email, phone } = reqBody;

    const nameResult = await validateName(name, Number(userId));
    if (nameResult.error) {
        return { status: 400, error: nameResult.error };
    }

    const emailResult = await validateEmail(email, Number(userId));
    if (emailResult.error) {
        return { status: 400, error: emailResult.error };
    }

    const phoneResult = validatePhone(phone);
    if (phoneResult.error) {
        return { status: 400, error: phoneResult.error };
    }

    await misRepository.updateMisStaff(Number(userId), {
        name: nameResult.value,
        email: emailResult.value,
        phone: phoneResult.value
    });

    const [updatedRows] = await misRepository.findById(Number(userId));
    return {
        status: 200,
        data: {
            message: 'MIS Staff account details updated successfully',
            user: updatedRows[0]
        }
    };
}

/**
 * Deactivates an active MIS Staff account, archiving it and clearing the way for a replacement.
 */
async function deactivateMisStaff(userId) {
    const targetCheck = await verifyTargetIsMisStaff(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    if (targetCheck.user.Status === 'DEACTIVATED') {
        return { status: 400, error: 'This MIS Staff account is already deactivated.' };
    }

    await misRepository.updateStatus(Number(userId), 'DEACTIVATED');

    const [updatedRows] = await misRepository.findById(Number(userId));
    return {
        status: 200,
        data: {
            message: 'MIS Staff account deactivated successfully. You may now create a replacement MIS Staff account.',
            user: updatedRows[0]
        }
    };
}

/**
 * Reactivates a deactivated MIS Staff account, ensuring no other active MIS account exists.
 */
async function reactivateMisStaff(userId) {
    const targetCheck = await verifyTargetIsMisStaff(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    if (targetCheck.user.Status === 'ACTIVE') {
        return { status: 400, error: 'This MIS Staff account is already active.' };
    }

    const txResult = await misRepository.withLifecycleLockAndTransaction(async (connection) => {
        const [activeRows] = await misRepository.findActiveMisStaffForUpdate(connection);
        if (activeRows && activeRows.length > 0) {
            return {
                conflict: true,
                error: 'Cannot reactivate: Another active MIS Staff account already exists. Please deactivate the active account first.'
            };
        }

        await misRepository.updateStatus(Number(userId), 'ACTIVE', connection);
        return { conflict: false };
    });

    if (txResult && txResult.lockFailed) {
        return { status: 503, error: txResult.error };
    }

    if (txResult && txResult.conflict) {
        return { status: 409, error: txResult.error };
    }

    const [updatedRows] = await misRepository.findById(Number(userId));
    return {
        status: 200,
        data: {
            message: 'MIS Staff account reactivated successfully.',
            user: updatedRows[0]
        }
    };
}

module.exports = {
    generateSecureTemporaryPassword,
    getMisStaffRoster,
    createMisStaff,
    updateMisStaff,
    deactivateMisStaff,
    reactivateMisStaff
};
