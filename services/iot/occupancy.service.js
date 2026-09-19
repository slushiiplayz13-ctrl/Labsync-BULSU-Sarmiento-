'use strict';

const db = require('../../database/connection');
const iotRepository = require('../../repositories/iot.repository');
const scheduleRepository = require('../../repositories/schedule.repository');
const labRepository = require('../../repositories/laboratory.repository');
const userRepository = require('../../repositories/user.repository');

const { DEFAULT_HARDWARE_ROOMS, getRoomKeyVariations, normalizeRoomNumber } = require('./iot.config');
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
        const isDuplicateState = (room.Key_Status === status);

        let claimUserId = null;
        let claimUserName = null;
        let logUserId = null;

        if (keyEvent === 'Key Taken') {
            const claim = claimService.getValidClaim(roomNumber, now);
            if (claim) {
                claimUserId = claim.userId;
                claimUserName = claim.userName;
            } else {
                // Fallback: check if an instructor has scheduled class in this room right now
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const todayDay = days[now.getDay()];
                const nowTime = now.toTimeString().split(' ')[0];
                const [sched] = await db.query(
                    `SELECT s.User_ID, u.Name FROM schedules s JOIN users u ON s.User_ID = u.User_ID 
                     WHERE s.Room_ID = ? AND s.Day_of_Week = ? AND ? BETWEEN s.Start_Time AND s.End_Time LIMIT 1`,
                    [room.Room_ID, todayDay, nowTime]
                );
                if (sched && sched.length > 0) {
                    claimUserId = sched[0].User_ID;
                    claimUserName = sched[0].Name;
                } else {
                    const [assigned] = await db.query(
                        `SELECT s.User_ID, u.Name FROM schedules s JOIN users u ON s.User_ID = u.User_ID 
                         WHERE s.Room_ID = ? ORDER BY s.Schedule_ID ASC LIMIT 1`,
                        [room.Room_ID]
                    );
                    if (assigned && assigned.length > 0) {
                        claimUserId = assigned[0].User_ID;
                        claimUserName = assigned[0].Name;
                    }
                }
            }
            logUserId = claimUserId;
        } else if (keyEvent === 'Key Returned') {
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

        await iotRepository.withTransaction(async (connection) => {
            await labRepository.updateKeyStatus(room.Room_ID, status, claimUserId, connection);
            if (!isDuplicateState) {
                await iotRepository.insertOccupancyLog(logUserId, room.Room_ID, keyEvent, connection);
            }
        });

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

    const [users] = await userRepository.findByQRString(qrString);
    if (users.length === 0) {
        return iotResponseService.createErrorResponse(
            404,
            'User not found for the provided QR code.',
            'Access Denied!',
            'Invalid QR Code'
        );
    }
    const user = users[0];

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
