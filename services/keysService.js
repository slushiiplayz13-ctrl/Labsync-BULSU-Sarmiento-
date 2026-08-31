'use strict';

/**
 * services/keysService.js
 * Business logic for physical key management, QR key tag generation, lost key reporting, and lifecycle state management.
 */

const QRCode = require('qrcode');
const keysRepository = require('../repositories/keys.repository');
const auditService = require('./auditService');

/**
 * Fetches all registered physical lab keys and calculates summary metrics.
 */
async function getAllKeys() {
    const [keys] = await keysRepository.findAllKeysWithRoomDetails();

    const total = keys.length;
    const active = keys.filter(k => k.Status === 'ACTIVE').length;
    const missing = keys.filter(k => k.Status === 'MISSING').length;
    const found = keys.filter(k => k.Status === 'FOUND').length;

    return {
        status: 200,
        data: {
            keys,
            summary: {
                total,
                active,
                missing,
                found
            }
        }
    };
}

/**
 * Registers a new physical key for a laboratory room.
 */
async function registerKey(roomId, keyCode, req = null) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    if (!keyCode || typeof keyCode !== 'string' || !keyCode.trim()) {
        return { status: 400, error: 'Key Code is required.' };
    }

    const cleanCode = keyCode.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,50}$/.test(cleanCode)) {
        return { status: 400, error: 'Key Code must contain only letters, numbers, hyphens, or underscores (3-50 chars).' };
    }

    const [existing] = await keysRepository.findByKeyCode(cleanCode);
    if (existing.length > 0) {
        return { status: 400, error: 'A key with this Key Code already exists.' };
    }

    const [result] = await keysRepository.insertKey(parsedRoomId, cleanCode, 'ACTIVE');
    const keyId = result.insertId;

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_CREATED',
        resourceType: 'LAB_KEY',
        resourceId: keyId,
        details: { roomId: parsedRoomId, keyCode: cleanCode },
        result: 'SUCCESS'
    });

    return {
        status: 201,
        message: 'Key registered successfully',
        data: { keyId, keyCode: cleanCode, status: 'ACTIVE' }
    };
}

/**
 * Generates two-sided keychain insert metadata and server-side QR data URL for a key.
 */
async function generateKeyTag(keyId, req = null) {
    const parsedKeyId = Number(keyId);
    if (!Number.isInteger(parsedKeyId) || parsedKeyId <= 0) {
        return { status: 400, error: 'Invalid Key ID.' };
    }

    const [rows] = await keysRepository.findKeyById(parsedKeyId);
    if (rows.length === 0) {
        return { status: 404, error: 'Key record not found.' };
    }

    const key = rows[0];
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
    const publicUrl = `${baseUrl}/key-found.html?key=${encodeURIComponent(key.Key_Code)}`;

    const qrCodeDataURL = await QRCode.toDataURL(publicUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' }
    });

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_TAG_GENERATED',
        resourceType: 'LAB_KEY',
        resourceId: key.Key_ID,
        details: { keyCode: key.Key_Code, roomNumber: key.Room_Number },
        result: 'SUCCESS'
    });

    return {
        status: 200,
        data: {
            keyId: key.Key_ID,
            keyCode: key.Key_Code,
            roomNumber: key.Room_Number,
            building: key.Building || 'IT Building',
            qrCode: qrCodeDataURL,
            publicUrl
        }
    };
}

/**
 * Marks a key as MISSING.
 */
async function markKeyMissing(keyId, req = null) {
    const parsedKeyId = Number(keyId);
    if (!Number.isInteger(parsedKeyId) || parsedKeyId <= 0) {
        return { status: 400, error: 'Invalid Key ID.' };
    }

    const [rows] = await keysRepository.findKeyById(parsedKeyId);
    if (rows.length === 0) {
        return { status: 404, error: 'Key record not found.' };
    }

    const key = rows[0];
    await keysRepository.updateKeyStatus(parsedKeyId, 'MISSING');

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_MARKED_MISSING',
        resourceType: 'LAB_KEY',
        resourceId: parsedKeyId,
        details: { keyCode: key.Key_Code, previousStatus: key.Status },
        result: 'SUCCESS'
    });

    return { status: 200, message: `Key ${key.Key_Code} marked as MISSING.` };
}

/**
 * Marks a recovered key as ACTIVE (FOUND -> ACTIVE or MISSING -> ACTIVE) and resolves any open found reports.
 */
async function markKeyActive(keyId, req = null) {
    const parsedKeyId = Number(keyId);
    if (!Number.isInteger(parsedKeyId) || parsedKeyId <= 0) {
        return { status: 400, error: 'Invalid Key ID.' };
    }

    const [rows] = await keysRepository.findKeyById(parsedKeyId);
    if (rows.length === 0) {
        return { status: 404, error: 'Key record not found.' };
    }

    const key = rows[0];
    await keysRepository.updateKeyStatus(parsedKeyId, 'ACTIVE');
    await keysRepository.resolveFoundReportsForKey(parsedKeyId);

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_REACTIVATED',
        resourceType: 'LAB_KEY',
        resourceId: parsedKeyId,
        details: { keyCode: key.Key_Code, previousStatus: key.Status },
        result: 'SUCCESS'
    });

    return { status: 200, message: `Key ${key.Key_Code} recovered and marked as ACTIVE.` };
}

/**
 * Safe public lookup endpoint for non-authenticated users scanning key QR.
 * Exposes ONLY building, laboratory room number, and key code. Zero sensitive data.
 */
async function getPublicInfo(keyCode) {
    if (!keyCode || typeof keyCode !== 'string' || !keyCode.trim()) {
        return { status: 400, error: 'Key identifier is required.' };
    }

    const cleanCode = keyCode.trim().toUpperCase();
    const [rows] = await keysRepository.findByKeyCode(cleanCode);

    if (rows.length === 0) {
        return { status: 404, error: 'Key identifier not found.' };
    }

    const key = rows[0];
    return {
        status: 200,
        data: {
            keyCode: key.Key_Code,
            roomNumber: key.Room_Number,
            building: key.Building || 'IT Building'
        }
    };
}

/**
 * Public submission of a found key report.
 * Updates key status to FOUND and logs audit event.
 */
async function submitFoundKeyReport({ keyCode, foundLocation, foundAt, finderContact, message }, req = null) {
    if (!keyCode || typeof keyCode !== 'string' || !keyCode.trim()) {
        return { status: 400, error: 'Key identifier is required.' };
    }

    if (!foundLocation || typeof foundLocation !== 'string' || !foundLocation.trim()) {
        return { status: 400, error: 'Please specify where you found the key.' };
    }

    if (!foundAt) {
        return { status: 400, error: 'Please specify when you found the key.' };
    }

    const cleanCode = keyCode.trim().toUpperCase();
    const cleanLocation = foundLocation.trim().slice(0, 500);
    const cleanContact = finderContact ? String(finderContact).trim().slice(0, 255) : null;
    const cleanMessage = message ? String(message).trim().slice(0, 1000) : null;

    let parsedFoundAt = new Date(foundAt);
    if (isNaN(parsedFoundAt.getTime())) {
        parsedFoundAt = new Date();
    }
    const formattedFoundAt = parsedFoundAt.toISOString().slice(0, 19).replace('T', ' ');

    const [rows] = await keysRepository.findByKeyCode(cleanCode);
    if (rows.length === 0) {
        return { status: 404, error: 'Key identifier not found.' };
    }

    const key = rows[0];

    // Insert report record
    await keysRepository.insertFoundReport(
        key.Key_ID,
        cleanLocation,
        formattedFoundAt,
        cleanContact,
        cleanMessage
    );

    // Update key status to FOUND
    await keysRepository.updateKeyStatus(key.Key_ID, 'FOUND');

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_FOUND_REPORTED',
        resourceType: 'LAB_KEY',
        resourceId: key.Key_ID,
        details: { keyCode: key.Key_Code, roomNumber: key.Room_Number, location: cleanLocation },
        result: 'SUCCESS'
    });

    return {
        status: 200,
        message: 'Thank you! Your report has been submitted to IT/MIS Office and Campus Security.'
    };
}

/**
 * Retrieves found key reports history.
 */
async function getFoundReports(keyId = null) {
    if (keyId) {
        const parsedKeyId = Number(keyId);
        if (!Number.isInteger(parsedKeyId) || parsedKeyId <= 0) {
            return { status: 400, error: 'Invalid Key ID.' };
        }
        const [reports] = await keysRepository.findFoundReportsByKeyId(parsedKeyId);
        return { status: 200, data: reports };
    } else {
        const [reports] = await keysRepository.findAllFoundReports();
        return { status: 200, data: reports };
    }
}

module.exports = {
    getAllKeys,
    registerKey,
    generateKeyTag,
    markKeyMissing,
    markKeyActive,
    getPublicInfo,
    submitFoundKeyReport,
    getFoundReports
};
