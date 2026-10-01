'use strict';

const db = require('../../database/connection');
const iotRepository = require('../../repositories/iot.repository');
const scheduleRepository = require('../../repositories/schedule.repository');
const labRepository = require('../../repositories/laboratory.repository');
const userRepository = require('../../repositories/user.repository');

const { DEFAULT_HARDWARE_ROOMS, getRoomKeyVariations, normalizeRoomNumber } = require('./iot.config');
const { KEY_BOX_ACCESS_ROLES, MIS_STAFF_ROLES, OJT_ROLES } = require('../../middleware/auth');
const deviceStateService = require('./device-state.service');
const claimService = require('./claim.service');
const iotResponseService = require('./iot-response.service');

/**
 * Handle incoming IoT occupancy events (QR scans, Key Taken, Key Returned, or Heartbeat).
 *
 * @param {object} reqBody
 * @param {string} [reqBody.qrString]
 * @param {string|number} reqBody.roomNumber
 * @param {string} [reqBody.authMethod]
 * @param {string} [reqBody.keyEvent]
 * @param {boolean} [reqBody.heartbeat]
 * @param {object} [device] - Authenticated device from middleware
 * @returns {Promise<object>}
 */
async function logOccupancy(reqBody = {}, device = null) {
    const { qrString, roomNumber, authMethod, keyEvent } = reqBody;

    if (!roomNumber) {
        return iotResponseService.createErrorResponse(
            400,
            'roomNumber is required.',
            'Error',
            'No Room Num'
        );
    }

    const cleanRoom = normalizeRoomNumber(roomNumber);

    // Enforce server-side device room authorization (anti-spoofing)
    if (device && Array.isArray(device.authorizedRooms) && device.authorizedRooms.length > 0) {
        const isAuthorized = device.authorizedRooms.some(r => normalizeRoomNumber(r) === cleanRoom);
        if (!isAuthorized) {
            const auditService = require('../auditService');
            auditService.logSecurityEvent({
                action: 'IOT_UNAUTHORIZED_ROOM',
                resourceType: 'IOT_DEVICE',
                resourceId: device.id,
                details: { attemptedRoom: roomNumber, authorizedRooms: device.authorizedRooms },
                result: 'DENIED'
            });
            return iotResponseService.createErrorResponse(
                403,
                `Device '${device.id}' is not authorized to report for Room ${roomNumber}.`,
                'Access Denied',
                'Unauthorized Rm'
            );
        }
    }

    // Refresh device last seen timestamp on any active interaction for all rooms on the hardware box
    const now = Date.now();
    const activeRooms = (device && Array.isArray(device.authorizedRooms) && device.authorizedRooms.length > 0)
        ? [roomNumber, ...device.authorizedRooms]
        : [roomNumber, ...DEFAULT_HARDWARE_ROOMS];
    const activeRoomKeys = getRoomKeyVariations(activeRooms);
    deviceStateService.recordDeviceSeen(activeRoomKeys, now);

    try {
        await labRepository.updateLastSeenByRoomNumbers(activeRoomKeys);
    } catch (e) {
        console.error('[IoT Service] Failed to update Last_Seen in logOccupancy:', e.message);
    }

    // Validate that the target laboratory exists in the system
    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) {
        return iotResponseService.createErrorResponse(
            404,
            `Room ${roomNumber} not found.`,
            'Error',
            'Invalid Room'
        );
    }
    const room = rooms[0];

    // Validate keyEvent enum if provided
    const ALLOWED_KEY_EVENTS = ['Key Taken', 'Key Returned', 'Heartbeat', 'ping', 'Unauthorized Removal', 'Wrong Key Slot', 'Unauthorized Taken'];
    const isSecurityAlertEvent = keyEvent && (keyEvent === 'Unauthorized Removal' || keyEvent === 'Wrong Key Slot' || keyEvent === 'Unauthorized Taken');

    if (keyEvent !== undefined && keyEvent !== null && !ALLOWED_KEY_EVENTS.includes(keyEvent)) {
        return iotResponseService.createErrorResponse(
            400,
            `Invalid keyEvent: '${keyEvent}'. Allowed events: ${ALLOWED_KEY_EVENTS.join(', ')}.`,
            'Error',
            'Invalid Event'
        );
    }

    // 1. Heartbeat event sent to /log
    if (keyEvent === 'Heartbeat' || keyEvent === 'ping' || reqBody.heartbeat) {
        return iotResponseService.createHeartbeatResponse(roomNumber, now, true);
    }

    // 2. Security Alerts (Unauthorized Key Removal or Wrong Slot Insertion)
    if (isSecurityAlertEvent) {
        const auditService = require('../auditService');
        const actionType = (keyEvent.includes('Unauthorized'))
            ? 'IOT_UNAUTHORIZED_KEY_REMOVAL'
            : 'IOT_WRONG_KEY_SLOT';

        try {
            await auditService.logSecurityEvent({
                action: actionType,
                resourceType: 'LABORATORY',
                resourceId: room.Room_ID,
                details: { roomNumber, keyEvent, deviceId: device ? device.id : 'ESP32-KeyBox' },
                result: 'WARNING'
            });
        } catch (e) {
            console.error('[IoT Service] Security event log failed:', e.message);
        }

        const logAuthMethod = (keyEvent.includes('Unauthorized')) ? 'UNAUTHORIZED' : 'WRONG_SLOT';
        try {
            await iotRepository.insertOccupancyLog(null, room.Room_ID, logAuthMethod);
        } catch (e) {
            console.error('[IoT Service] Occupancy log insert failed:', e.message);
        }

        // When a key is removed without authorization, immediately update Key_Status to Absent
        if (keyEvent.includes('Unauthorized')) {
            try {
                await labRepository.updateKeyStatus(room.Room_ID, 'Absent', null);
            } catch (e) {
                console.error('[IoT Service] Failed to update Key_Status on unauthorized removal:', e.message);
            }
        }

        return {
            status: 200,
            data: {
                message: `Security alert '${keyEvent}' logged for Room ${roomNumber}.`,
                room: roomNumber,
                lcdLine1: 'Security Alert!',
                lcdLine2: keyEvent.substring(0, 16)
            }
        };
    }

    // 3. Physical Key Event (Key Taken / Key Returned)
    if (keyEvent === 'Key Taken' || keyEvent === 'Key Returned') {
        const status = (keyEvent === 'Key Returned') ? 'Present' : 'Absent';
        let isDuplicateState = (room.Key_Status === status);

        let claim = null;
        let claimUserId = null;
        let claimUserName = null;
        let logUserId = null;

        if (keyEvent === 'Key Taken') {
            claim = claimService.getValidClaim(roomNumber, now);
            if (claim) {
                claimUserId = claim.userId;
                claimUserName = claim.userName;
                logUserId = claimUserId;
                claimService.clearUserClaims(claimUserId);
            } else if (isDuplicateState) {
                // Duplicate Key Taken event while key is already Absent:
                // Treat as duplicate / no-op for custody state.
                // Preserve the existing authenticated holder so contact chatter or duplicate packets
                // do not wipe out Current_User_ID to NULL.
                claimUserId = room.Current_User_ID || null;
                claimUserName = null;
                logUserId = claimUserId;
            } else {
                // Key removed without valid claim: strictly unidentified
                claimUserId = null;
                claimUserName = null;
                logUserId = null;
            }
        } else if (keyEvent === 'Key Returned') {
            // Check if this key return is resolving an unauthorized key removal
            const [lastLogs] = await db.query(
                `SELECT Auth_Method, User_ID FROM occupancy_log 
                 WHERE Room_ID = ? ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1`,
                [room.Room_ID]
            );
            const isReturningAfterUnauthorized = (lastLogs && lastLogs.length > 0 && lastLogs[0].Auth_Method === 'UNAUTHORIZED');

            if (isReturningAfterUnauthorized) {
                // Key returned after unauthorized removal: actor is unidentified and log must not be skipped
                isDuplicateState = false;
                claimUserId = null;
                logUserId = null;
                claimService.clearClaim(roomNumber);
            } else {
                let returnUserId = room.Current_User_ID || null;
                if (!returnUserId) {
                    const [lastTaken] = await db.query(
                        `SELECT User_ID FROM occupancy_log 
                         WHERE Room_ID = ? AND Auth_Method = 'Key Taken' AND User_ID IS NOT NULL 
                         ORDER BY Access_Time DESC LIMIT 1`,
                        [room.Room_ID]
                    );
                    if (lastTaken && lastTaken.length > 0) {
                        returnUserId = lastTaken[0].User_ID;
                    }
                }
                claimService.clearClaim(roomNumber);
                claimUserId = null;
                logUserId = returnUserId;
            }
        }

        let misCustodyEvent = null;
        if (keyEvent === 'Key Taken' && claimUserId) {
            let userRole = (claim && claim.role) || null;
            if (!userRole) {
                const [roleRows] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [claimUserId]);
                if (roleRows && roleRows.length > 0) userRole = roleRows[0].Role;
            }
            if (userRole === 'MIS Staff') {
                misCustodyEvent = {
                    action: 'IOT_KEY_WITHDRAWAL',
                    userId: claimUserId,
                    actorRole: 'MIS Staff',
                    purpose: 'IT Maintenance'
                };
            }
        } else if (keyEvent === 'Key Returned' && logUserId) {
            const [roleRows] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [logUserId]);
            if (roleRows && roleRows.length > 0 && roleRows[0].Role === 'MIS Staff') {
                misCustodyEvent = {
                    action: 'IOT_KEY_RETURN',
                    userId: logUserId,
                    actorRole: 'MIS Staff',
                    purpose: 'IT Maintenance'
                };
            }
        }

        await iotRepository.withTransaction(async (connection) => {
            if (!isDuplicateState || (keyEvent === 'Key Taken' && claimUserId !== room.Current_User_ID)) {
                await labRepository.updateKeyStatus(room.Room_ID, status, claimUserId, connection);
            }
            if (!isDuplicateState) {
                await iotRepository.insertOccupancyLog(logUserId, room.Room_ID, keyEvent, connection);
            }

            // Sync multi-key authorization lifecycle
            if (keyEvent === 'Key Taken' && claimUserId) {
                const keyAuthRepo = require('../../repositories/key-authorization.repository');
                const [appr] = await keyAuthRepo.findActiveApprovedByUserIdAndRoom(claimUserId, room.Room_ID, connection);
                if (appr && appr.length > 0) {
                    await keyAuthRepo.markClaimed(appr[0].Request_ID, connection);
                }
            } else if (keyEvent === 'Key Returned' && logUserId) {
                const keyAuthRepo = require('../../repositories/key-authorization.repository');
                await keyAuthRepo.markCompletedByRoomAndUser(room.Room_ID, logUserId, connection);
            }
        });

        if (misCustodyEvent) {
            const auditService = require('../auditService');
            try {
                await auditService.logSecurityEvent({
                    userId: misCustodyEvent.userId,
                    actorRole: misCustodyEvent.actorRole,
                    action: misCustodyEvent.action,
                    resourceType: 'LABORATORY',
                    resourceId: room.Room_ID,
                    details: {
                        purpose: misCustodyEvent.purpose,
                        roomNumber: room.Room_Number || roomNumber,
                        deviceId: device ? device.id : 'ESP32-KeyBox',
                        keyEvent,
                        status
                    },
                    result: 'SUCCESS'
                });
            } catch (auditErr) {
                console.error('[IoT Service] Failed to log MIS key custody audit event:', auditErr.message);
            }
        }

        return iotResponseService.createKeyStatusResponse(roomNumber, status, claimUserName);
    }

    // 4. QR Identity Verification
    if (!qrString) {
        return iotResponseService.createErrorResponse(
            400,
            'qrString or keyEvent is required.',
            'Scan Error',
            'Missing QR'
        );
    }

    console.log(`[IoT QR Scan] Processing verification for qrString: "${qrString}"`);
    const [users] = await userRepository.findByQRString(qrString);
    if (users.length === 0) {
        console.warn(`[IoT QR Scan] Access Denied: No matching user found for qrString: "${qrString}"`);
        return iotResponseService.createErrorResponse(
            404,
            'User not found for the provided QR code.',
            'Access Denied!',
            'Invalid QR Code'
        );
    }
    const user = users[0];

    // 4a. Account Status & Role Authorization Check
    const userStatus = String(user.Status || '').toUpperCase();
    if (userStatus === 'DEACTIVATED' || (userStatus && userStatus !== 'ACTIVE')) {
        console.warn(`[IoT QR Scan] Access Denied: Account inactive/deactivated for user "${user.Name}" (${user.Role}, ID: ${user.User_ID})`);
        return iotResponseService.createErrorResponse(
            403,
            'Your account is inactive or deactivated. Please contact the administrator.',
            'Access Denied!',
            'Account Inactive'
        );
    }

    if (OJT_ROLES.includes(user.Role) || user.Role === 'OJT') {
        console.warn(`[IoT QR Scan] Access Denied: OJT role "${user.Role}" is not authorized for physical key withdrawal.`);
        return iotResponseService.createErrorResponse(
            403,
            'Forbidden: OJT is not authorized for independent physical key withdrawal.',
            'Access Denied!',
            'OJT Unauthorized'
        );
    }

    if (!KEY_BOX_ACCESS_ROLES.includes(user.Role)) {
        console.warn(`[IoT QR Scan] Access Denied: Role "${user.Role}" is not authorized for physical key-box access.`);
        return iotResponseService.createErrorResponse(
            403,
            'Forbidden: Insufficient privileges for physical key-box access.',
            'Access Denied!',
            'Role Denied'
        );
    }

    console.log(`[IoT QR Scan] Access Granted: User "${user.Name}" (${user.Role}, ID: ${user.User_ID})`);

    // 4b. Anti-Double-Tap Policy: Prevent user from claiming multiple keys simultaneously,
    // unless authorized by Department Head (strictly max 2 keys)
    const [activeKeys] = await labRepository.findActiveKeysByUserId(user.User_ID);
    if (activeKeys && activeKeys.length > 0) {
        if (activeKeys.length >= 2) {
            console.warn(`[IoT QR Scan] Strict Ceiling Block: User "${user.Name}" (${user.Role}) already holds 2 keys.`);
            return iotResponseService.createErrorResponse(
                403,
                'Strict key limit reached: You cannot hold more than 2 keys simultaneously under any circumstance.',
                'Max 2 Keys Held',
                'Max 2 Keys Limit'
            );
        }

        const keyAuthRepo = require('../../repositories/key-authorization.repository');
        const [approvedRows] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(user.User_ID, roomNumber);
        const [anyAuthRows] = await keyAuthRepo.findAnyActiveAuthorizationByUserId(user.User_ID);

        const hasAuthorization = (approvedRows && approvedRows.length > 0) || (anyAuthRows && anyAuthRows.length > 0);
        if (!hasAuthorization) {
            // Check if user has an upcoming approved reservation that is not yet ready for pickup
            const [upcomingRows] = await db.query(
                `SELECT r.*, lab.Room_Number 
                 FROM key_authorization_requests r
                 JOIN laboratories lab ON r.Room_ID = lab.Room_ID
                 WHERE r.User_ID = ? AND r.Status = 'APPROVED'
                   AND (r.Reservation_Date > CURDATE() OR (r.Reservation_Date = CURDATE() AND r.End_Time >= CURTIME()))
                 ORDER BY r.Reservation_Date ASC, r.Start_Time ASC LIMIT 1`,
                [user.User_ID]
            );

            if (upcomingRows && upcomingRows.length > 0) {
                const up = upcomingRows[0];
                const upDate = up.Reservation_Date instanceof Date 
                    ? up.Reservation_Date.toISOString().split('T')[0]
                    : String(up.Reservation_Date).split('T')[0];
                const timeStr = String(up.Start_Time).slice(0, 5);
                return iotResponseService.createErrorResponse(
                    403,
                    `Your reservation for Room ${up.Room_Number} is scheduled for ${upDate} at ${timeStr}. Key pickup opens 15 minutes before class.`,
                    'Pickup Not Yet',
                    `Res: ${upDate}`.substring(0, 16)
                );
            }

            const heldRoom = activeKeys[0].Room_Number;
            console.warn(`[IoT QR Scan] Anti-Double-Tap Block: User "${user.Name}" (${user.Role}) already holds key for Room ${heldRoom}.`);
            return iotResponseService.createErrorResponse(
                403,
                `User already holds an active key for Room ${heldRoom}. Please return it before claiming another room, or reserve 2nd key approval from the Department Head.`,
                'Return Key First',
                `Hold Key RM ${heldRoom}`.substring(0, 16)
            );
        }
        console.log(`[IoT QR Scan] Multi-Key Authorization Detected for User "${user.Name}". Permitting 2nd key withdrawal.`);
    }

    if (!user.ID_QR_String) {
        const newQR = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        await userRepository.updateUserQR(user.User_ID, newQR);
        user.ID_QR_String = newQR;
    }

    // Associate scanned identity with room claim across all hardware rooms on this keybox
    const claimRooms = (device && Array.isArray(device.authorizedRooms) && device.authorizedRooms.length > 0)
        ? device.authorizedRooms
        : DEFAULT_HARDWARE_ROOMS;

    const allTargetRooms = new Set([roomNumber, ...claimRooms]);
    for (const r of allTargetRooms) {
        claimService.recordClaim(r, {
            userId: user.User_ID,
            userName: user.Name,
            role: user.Role
        }, now);
    }

    await iotRepository.insertOccupancyLog(user.User_ID, room.Room_ID, authMethod || 'QR Code');

    return iotResponseService.createQrVerificationResponse(user);
}

module.exports = {
    logOccupancy
};
