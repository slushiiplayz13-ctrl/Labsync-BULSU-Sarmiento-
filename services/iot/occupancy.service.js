'use strict';

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
    const ALLOWED_KEY_EVENTS = ['Key Taken', 'Key Returned', 'Heartbeat', 'ping'];
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

    // 2. Physical Key Event (Key Taken / Key Returned)
    if (keyEvent === 'Key Taken' || keyEvent === 'Key Returned') {
        const status = (keyEvent === 'Key Returned') ? 'Present' : 'Absent';
        const isDuplicateState = (room.Key_Status === status);

        let claimUserId = null;
        let claimUserName = null;

        if (keyEvent === 'Key Taken') {
            const claim = claimService.getValidClaim(roomNumber, now);
            if (claim) {
                claimUserId = claim.userId;
                claimUserName = claim.userName;
            }
        } else if (keyEvent === 'Key Returned') {
            claimService.clearClaim(roomNumber);
        }

        await iotRepository.withTransaction(async (connection) => {
            await labRepository.updateKeyStatus(room.Room_ID, status, claimUserId, connection);
            if (!isDuplicateState) {
                await iotRepository.insertOccupancyLog(claimUserId, room.Room_ID, keyEvent, connection);
            }
        });

        return iotResponseService.createKeyStatusResponse(roomNumber, status, claimUserName);
    }

    // 3. QR Identity Verification
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

    // Associate scanned identity with room claim
    claimService.recordClaim(roomNumber, {
        userId: user.User_ID,
        userName: user.Name,
        role: user.Role
    }, now);

    await iotRepository.insertOccupancyLog(user.User_ID, room.Room_ID, authMethod || 'QR Code');

    return iotResponseService.createQrVerificationResponse(user);
}

module.exports = {
    logOccupancy
};
