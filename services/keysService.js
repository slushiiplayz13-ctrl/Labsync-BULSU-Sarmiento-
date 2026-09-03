'use strict';

/**
 * services/keysService.js
 * Business logic for physical key management, QR key tag generation,
 * and authorized faculty key transfer / room claim workflow.
 */

const QRCode = require('qrcode');
const { APP_URL } = require('../config/app.config');
const db = require('../database/connection');
const keysRepository = require('../repositories/keys.repository');
const auditService = require('./auditService');
const { KEY_TRANSFER_ROLES } = require('../middleware/auth');

/**
 * Fetches all registered physical lab keys and calculates summary metrics.
 */
async function getAllKeys() {
    const [keys] = await keysRepository.findAllKeysWithRoomDetails();

    const total = keys.length;
    const active = keys.filter(k => k.Status === 'ACTIVE').length;
    const missing = keys.filter(k => k.Status === 'MISSING').length;
    const inDock = keys.filter(k => (k.Room_Key_Status || 'Present') === 'Present').length;
    const inUse = keys.filter(k => k.Room_Key_Status === 'Absent').length;

    return {
        status: 200,
        data: {
            keys,
            summary: {
                total,
                active,
                missing,
                inDock,
                inUse
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
 * Generates two-sided keychain insert metadata and server-side QR data URL for Key Transfer.
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
    const baseUrl = APP_URL;
    const transferUrl = `${baseUrl}/key-transfer.html?key=${encodeURIComponent(key.Key_Code)}`;

    const qrCodeDataURL = await QRCode.toDataURL(transferUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#0EA5C9', light: '#FFFFFF' }
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
            transferUrl
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
 * Marks a physical key as ACTIVE.
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

    await auditService.logSecurityEvent({
        req,
        action: 'KEY_REACTIVATED',
        resourceType: 'LAB_KEY',
        resourceId: parsedKeyId,
        details: { keyCode: key.Key_Code, previousStatus: key.Status },
        result: 'SUCCESS'
    });

    return { status: 200, message: `Key ${key.Key_Code} marked as ACTIVE.` };
}

/**
 * Fetches key transfer details for confirmation UI.
 */
async function getKeyTransferInfo(keyCode, req = null) {
    if (!keyCode || typeof keyCode !== 'string' || !keyCode.trim()) {
        return { status: 400, error: 'Key identifier is required.' };
    }

    const cleanCode = keyCode.trim().toUpperCase();
    const [rows] = await keysRepository.findKeyWithRoomAndHolder(cleanCode);

    if (rows.length === 0) {
        return { status: 404, error: 'Key identifier not found.' };
    }

    const key = rows[0];
    const sessionUserId = req && req.session ? req.session.userId : null;
    const sessionUserRole = req && req.session ? req.session.userRole : null;
    const sessionUserName = req && req.session ? req.session.userName : null;

    let currentHolder = null;
    if (key.Current_User_ID) {
        currentHolder = {
            id: key.Current_User_ID,
            name: key.Current_Holder_Name || 'Unknown Faculty',
            email: key.Current_Holder_Email || '',
            role: key.Current_Holder_Role || 'Faculty'
        };
    }

    const isEligibleRole = sessionUserRole ? KEY_TRANSFER_ROLES.includes(sessionUserRole) : false;
    const isSelf = Boolean(sessionUserId && key.Current_User_ID && String(sessionUserId) === String(key.Current_User_ID));

    let cannotTransferReason = null;
    if (!sessionUserId) {
        cannotTransferReason = 'Please log in with your Faculty or Department Head account to transfer this key.';
    } else if (sessionUserRole === 'MIS Staff') {
        cannotTransferReason = 'MIS Staff accounts are key inventory custodians and cannot hold or transfer classroom keys. Only Faculty and Department Heads may claim or transfer this key.';
    } else if (isSelf) {
        cannotTransferReason = 'You are already the registered holder of this key.';
    } else if (!isEligibleRole) {
        cannotTransferReason = 'Only authorized Faculty and Department Heads can claim or transfer this key.';
    }

    const canTransfer = Boolean(sessionUserId && isEligibleRole && !isSelf);

    return {
        status: 200,
        data: {
            keyCode: key.Key_Code,
            roomId: key.Room_ID,
            roomNumber: key.Room_Number,
            building: key.Building || 'IT Building',
            keyStatus: key.Key_Status,
            roomKeyStatus: key.Room_Key_Status,
            currentHolder,
            currentUser: sessionUserId ? {
                id: sessionUserId,
                name: sessionUserName,
                role: sessionUserRole
            } : null,
            canTransfer,
            cannotTransferReason
        }
    };
}

/**
 * Transfers key and room responsibility to the currently logged-in professor.
 * Uses strict row-locking transaction to protect against concurrent duplicate transfers.
 */
async function transferKey(keyCode, req) {
    if (!req.session || !req.session.userId) {
        return { status: 401, error: 'Authentication required' };
    }

    const sessionRole = req.session.userRole;
    if (!KEY_TRANSFER_ROLES.includes(sessionRole)) {
        return {
            status: 403,
            error: 'Forbidden: Only Faculty and Department Heads are authorized to claim or transfer laboratory keys.'
        };
    }

    if (!keyCode || typeof keyCode !== 'string' || !keyCode.trim()) {
        return { status: 400, error: 'Key identifier is required.' };
    }

    const cleanCode = keyCode.trim().toUpperCase();
    const newUserId = req.session.userId;
    const newUserName = req.session.userName;

    const connection = await db.getConnection();
    let keyInfo = null;
    let previousUserId = null;
    let previousUserName = 'Key Dock / No Active Holder';

    try {
        await connection.beginTransaction();

        // 1. Lock key and room row
        const [rows] = await keysRepository.findKeyWithRoomForUpdate(cleanCode, connection);
        if (rows.length === 0) {
            await connection.rollback();
            return { status: 404, error: 'Key identifier not found.' };
        }

        keyInfo = rows[0];
        previousUserId = keyInfo.Current_User_ID;

        // 2. Reject self-transfer
        if (previousUserId && String(previousUserId) === String(newUserId)) {
            await connection.rollback();
            return { status: 400, error: 'You are already the registered holder of this key.' };
        }

        // 3. Resolve previous holder name for audit trail
        if (previousUserId) {
            const [prevUsers] = await connection.query('SELECT Name FROM users WHERE User_ID = ?', [previousUserId]);
            if (prevUsers.length > 0 && prevUsers[0].Name) {
                previousUserName = prevUsers[0].Name;
            }
        }

        // 4. Update laboratory holder (key is in active handoff, status remains Absent from dock)
        await connection.query(
            'UPDATE laboratories SET Current_User_ID = ?, Key_Status = ?, Last_Seen = NOW() WHERE Room_ID = ?',
            [newUserId, 'Absent', keyInfo.Room_ID]
        );

        // 5. Ensure physical key record is marked ACTIVE
        await connection.query(
            'UPDATE laboratory_keys SET Status = ?, Updated_At = NOW() WHERE Key_ID = ?',
            ['ACTIVE', keyInfo.Key_ID]
        );

        // 6. Log historical accountability in occupancy_log with explicit 'Key Transfer' Auth_Method
        await connection.query(
            'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
            [newUserId, keyInfo.Room_ID, 'Key Transfer']
        );

        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }

    // 7. Security audit event logging
    await auditService.logSecurityEvent({
        req,
        action: 'KEY_TRANSFERRED',
        resourceType: 'LAB_KEY',
        resourceId: keyInfo.Key_ID,
        details: {
            roomId: keyInfo.Room_ID,
            roomNumber: keyInfo.Room_Number,
            keyCode: keyInfo.Key_Code,
            previousUserId: previousUserId || null,
            previousUserName: previousUserName,
            newUserId: newUserId,
            newUserName: newUserName
        },
        result: 'SUCCESS'
    });

    return {
        status: 200,
        message: `Key for Laboratory ${keyInfo.Room_Number} successfully transferred to ${newUserName}.`,
        transfer: {
            roomNumber: keyInfo.Room_Number,
            keyCode: keyInfo.Key_Code,
            building: keyInfo.Building,
            previousHolder: previousUserName,
            newHolder: newUserName,
            transferredAt: new Date().toISOString()
        }
    };
}

module.exports = {
    getAllKeys,
    registerKey,
    generateKeyTag,
    markKeyMissing,
    markKeyActive,
    getKeyTransferInfo,
    transferKey
};
