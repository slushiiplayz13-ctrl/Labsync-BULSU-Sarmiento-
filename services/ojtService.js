'use strict';

/**
 * services/ojtService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Business logic and security domain service for OJT account lifecycle management.
 * 
 * Enforces:
 * - Least privilege and strict target-role boundaries (target must be Role = 'OJT')
 * - Cryptographically secure temporary password generation
 * - Centralized input validation (Name, Email, Dates, Phone)
 * - Derived expiration evaluation (no storing 'EXPIRED' in DB)
 * - Sensitive credential exclusion (no hashes or plaintext passwords in lists or audit logs)
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const ojtRepository = require('../repositories/ojt.repository');
const userRepository = require('../repositories/user.repository');
const { isValidEmailFormat, isOjtExpired, BCRYPT_SALT_ROUNDS } = require('./authService');

const SALT_ROUNDS = BCRYPT_SALT_ROUNDS || 12;

/**
 * Generates a cryptographically secure, high-entropy temporary password
 * meeting or exceeding LabSync password complexity rules.
 * Uses crypto.randomInt to eliminate modulo bias.
 *
 * @param {number} [length=12]
 * @returns {string}
 */
function generateSecureTemporaryPassword(length = 12) {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%&*';
    const all = uppercase + lowercase + digits + special;

    // Guarantee at least one character from each character class
    const chars = [
        uppercase[crypto.randomInt(0, uppercase.length)],
        lowercase[crypto.randomInt(0, lowercase.length)],
        digits[crypto.randomInt(0, digits.length)],
        special[crypto.randomInt(0, special.length)]
    ];

    for (let i = chars.length; i < length; i++) {
        chars.push(all[crypto.randomInt(0, all.length)]);
    }

    // Fisher-Yates shuffle using cryptographically secure random integers
    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }

    return chars.join('');
}

/**
 * Validates full name format and checks for duplicate names.
 */
async function validateName(name, excludeUserId = 0) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return { error: 'Name is required.' };
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
        return { error: 'Invalid email address format. Please enter a valid email.' };
    }

    const [existing] = await userRepository.findByEmailExceptId(cleanEmail, excludeUserId);
    if (existing && existing.length > 0) {
        return { error: 'Email address already exists in the system.' };
    }

    return { value: cleanEmail };
}

/**
 * Validates ISO date formats and logical date order.
 */
function validateDates(startDate, endDate) {
    if (!startDate || typeof startDate !== 'string') {
        return { error: 'OJT start date is required (YYYY-MM-DD).' };
    }
    if (!endDate || typeof endDate !== 'string') {
        return { error: 'OJT end date is required (YYYY-MM-DD).' };
    }

    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const cleanStart = startDate.trim();
    const cleanEnd = endDate.trim();

    if (!isoDateRegex.test(cleanStart)) {
        return { error: 'Invalid start date format. Expected YYYY-MM-DD.' };
    }
    if (!isoDateRegex.test(cleanEnd)) {
        return { error: 'Invalid end date format. Expected YYYY-MM-DD.' };
    }

    const parsedStart = new Date(`${cleanStart}T00:00:00`);
    const parsedEnd = new Date(`${cleanEnd}T00:00:00`);

    if (isNaN(parsedStart.getTime())) {
        return { error: 'Start date is not a valid calendar date.' };
    }
    if (isNaN(parsedEnd.getTime())) {
        return { error: 'End date is not a valid calendar date.' };
    }

    if (cleanEnd < cleanStart) {
        return { error: 'OJT end date cannot precede start date.' };
    }

    return { startDate: cleanStart, endDate: cleanEnd };
}

/**
 * Validates optional contact number format.
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
 * Checks that the target user exists and has Role = 'OJT'.
 * Returns 404 if not found, 403 if target has any role other than 'OJT'.
 */
async function verifyTargetIsOjt(userId) {
    const parsedId = Number(userId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
        return { status: 400, error: 'Invalid user ID. Must be a positive integer.' };
    }

    const [rows] = await ojtRepository.findUserRoleAndStatus(parsedId);
    if (!rows || rows.length === 0) {
        return { status: 404, error: 'User not found' };
    }

    const user = rows[0];
    if (user.Role !== 'OJT') {
        return {
            status: 403,
            error: 'Target user is not an OJT account. Modifications restricted.'
        };
    }

    return { user };
}

/**
 * Enriches an OJT user record with derived expiration and status fields.
 */
function enrichOjtRecord(user) {
    const expired = isOjtExpired(user.OJT_End_Date);
    return {
        User_ID: user.User_ID,
        Name: user.Name,
        Email: user.Email,
        Role: user.Role,
        Status: user.Status,
        Profile_Photo: user.Profile_Photo || user.profilePhoto || null,
        profilePhoto: user.Profile_Photo || user.profilePhoto || null,
        OJT_Start_Date: user.OJT_Start_Date,
        OJT_End_Date: user.OJT_End_Date,
        Phone: user.Phone,
        Updated_At: user.Updated_At,
        isExpired: expired,
        derivedStatus: user.Status === 'DEACTIVATED' ? 'DEACTIVATED' : (expired ? 'EXPIRED' : 'ACTIVE')
    };
}

/**
 * Lists all OJT accounts with derived status fields.
 */
async function listOjts() {
    const [rows] = await ojtRepository.findAll();
    const enriched = rows.map(enrichOjtRecord);
    return { status: 200, data: enriched };
}

/**
 * Retrieves details for a specific OJT account.
 */
async function getOjtById(userId) {
    const targetCheck = await verifyTargetIsOjt(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    const [rows] = await ojtRepository.findById(userId);
    if (!rows || rows.length === 0) {
        return { status: 404, error: 'OJT account not found' };
    }

    return { status: 200, data: enrichOjtRecord(rows[0]) };
}

/**
 * Creates a new OJT account with server-enforced Role = 'OJT' and Status = 'ACTIVE'.
 */
async function createOjt(reqBody) {
    const { name, email, phone } = reqBody;
    const startDate = reqBody.startDate || reqBody.ojtStartDate || reqBody.OJT_Start_Date;
    const endDate = reqBody.endDate || reqBody.ojtEndDate || reqBody.OJT_End_Date;

    // 1. Validate Name
    const nameResult = await validateName(name, 0);
    if (nameResult.error) {
        return { status: 400, error: nameResult.error };
    }

    // 2. Validate Email
    const emailResult = await validateEmail(email, 0);
    if (emailResult.error) {
        return { status: 400, error: emailResult.error };
    }

    // 3. Validate Dates
    const dateResult = validateDates(startDate, endDate);
    if (dateResult.error) {
        return { status: 400, error: dateResult.error };
    }

    // 4. Validate Phone
    const phoneResult = validatePhone(phone);
    if (phoneResult.error) {
        return { status: 400, error: phoneResult.error };
    }

    // 5. Generate secure temporary password & hash
    const generatedPassword = generateSecureTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(generatedPassword, SALT_ROUNDS);
    const qrString = `LABSYNC-OJT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    // 6. Insert into database (Role='OJT', Status='ACTIVE' enforced server-side)
    const [result] = await ojtRepository.insertOjt({
        name: nameResult.value,
        email: emailResult.value,
        passwordHash,
        startDate: dateResult.startDate,
        endDate: dateResult.endDate,
        phone: phoneResult.value,
        qrString
    });

    const newUserId = result.insertId;
    const [createdRows] = await ojtRepository.findById(newUserId);
    const createdUser = createdRows && createdRows.length > 0 ? enrichOjtRecord(createdRows[0]) : null;

    return {
        status: 201,
        data: {
            message: 'OJT account created successfully',
            user: createdUser,
            temporaryPassword: generatedPassword
        }
    };
}

/**
 * Updates profile details and internship dates for an existing OJT account.
 */
async function updateOjt(userId, reqBody) {
    const targetCheck = await verifyTargetIsOjt(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    const { name, email, phone } = reqBody;
    const startDate = reqBody.startDate || reqBody.ojtStartDate || reqBody.OJT_Start_Date;
    const endDate = reqBody.endDate || reqBody.ojtEndDate || reqBody.OJT_End_Date;

    // 1. Validate Name
    const nameResult = await validateName(name, Number(userId));
    if (nameResult.error) {
        return { status: 400, error: nameResult.error };
    }

    // 2. Validate Email
    const emailResult = await validateEmail(email, Number(userId));
    if (emailResult.error) {
        return { status: 400, error: emailResult.error };
    }

    // 3. Validate Dates
    const dateResult = validateDates(startDate, endDate);
    if (dateResult.error) {
        return { status: 400, error: dateResult.error };
    }

    // 4. Validate Phone
    const phoneResult = validatePhone(phone);
    if (phoneResult.error) {
        return { status: 400, error: phoneResult.error };
    }

    // 5. Update Record
    await ojtRepository.updateOjt(Number(userId), {
        name: nameResult.value,
        email: emailResult.value,
        startDate: dateResult.startDate,
        endDate: dateResult.endDate,
        phone: phoneResult.value
    });

    const [updatedRows] = await ojtRepository.findById(Number(userId));
    const updatedUser = enrichOjtRecord(updatedRows[0]);

    return {
        status: 200,
        data: {
            message: 'OJT account updated successfully',
            user: updatedUser
        }
    };
}

/**
 * Updates the lifecycle status of an OJT account (ACTIVE or DEACTIVATED).
 */
async function updateStatus(userId, status) {
    const targetCheck = await verifyTargetIsOjt(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    if (status !== 'ACTIVE' && status !== 'DEACTIVATED') {
        return {
            status: 400,
            error: "Invalid status value. Allowed values are 'ACTIVE' or 'DEACTIVATED'."
        };
    }

    await ojtRepository.updateStatus(Number(userId), status);

    const [updatedRows] = await ojtRepository.findById(Number(userId));
    const updatedUser = enrichOjtRecord(updatedRows[0]);

    return {
        status: 200,
        data: {
            message: `OJT account ${status.toLowerCase()}d successfully`,
            user: updatedUser
        }
    };
}

/**
 * Generates and assigns a new temporary password for an OJT account.
 */
async function resetPassword(userId) {
    const targetCheck = await verifyTargetIsOjt(userId);
    if (targetCheck.error) {
        return { status: targetCheck.status, error: targetCheck.error };
    }

    const temporaryPassword = generateSecureTemporaryPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, SALT_ROUNDS);

    await ojtRepository.updatePassword(Number(userId), passwordHash);

    return {
        status: 200,
        data: {
            message: 'Temporary password generated successfully',
            temporaryPassword
        }
    };
}

module.exports = {
    generateSecureTemporaryPassword,
    listOjts,
    getOjtById,
    createOjt,
    updateOjt,
    updateStatus,
    resetPassword
};
