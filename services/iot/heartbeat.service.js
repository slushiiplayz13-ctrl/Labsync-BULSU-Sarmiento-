'use strict';

const labRepository = require('../../repositories/laboratory.repository');
const { DEFAULT_HARDWARE_ROOMS, getRoomKeyVariations, normalizeRoomNumber } = require('./iot.config');
const deviceStateService = require('./device-state.service');
const iotResponseService = require('./iot-response.service');

/**
 * Records an IoT device heartbeat and synchronizes database Last_Seen timestamps.
 *
 * @param {object} reqBody
 * @param {string|number} [reqBody.roomNumber]
 * @param {string[]} [reqBody.rooms]
 * @param {string} [reqBody.deviceId]
 * @param {object} [device] - Authenticated device from middleware
 * @returns {Promise<{ status: number, data?: object, error?: string }>}
 */
async function recordHeartbeat(reqBody = {}, device = null) {
    const { roomNumber, rooms } = reqBody;
    
    let targetRooms;
    if (rooms && Array.isArray(rooms) && rooms.length > 0) {
        targetRooms = rooms;
    } else if (roomNumber) {
        targetRooms = [roomNumber];
    } else if (device && Array.isArray(device.authorizedRooms) && device.authorizedRooms.length > 0) {
        targetRooms = [...device.authorizedRooms];
    } else {
        targetRooms = [...DEFAULT_HARDWARE_ROOMS];
    }

    // Enforce room authorization if authenticated device is present
    if (device && Array.isArray(device.authorizedRooms) && device.authorizedRooms.length > 0) {
        const unauthorizedRooms = targetRooms.filter(
            r => !device.authorizedRooms.some(ar => normalizeRoomNumber(ar) === normalizeRoomNumber(r))
        );
        if (unauthorizedRooms.length > 0) {
            return {
                status: 403,
                error: `Device '${device.id}' is not authorized for rooms: ${unauthorizedRooms.join(', ')}`
            };
        }
    }

    const now = Date.now();
    const allRoomKeys = getRoomKeyVariations(targetRooms);

    // Update in-memory device state
    deviceStateService.recordDeviceSeen(allRoomKeys, now);

    // Synchronize Last_Seen in database
    try {
        await labRepository.updateLastSeenByRoomNumbers(allRoomKeys);
    } catch (err) {
        console.error('[IoT Service] Failed to update Last_Seen in database:', err.message);
    }

    // Reconcile physical key slot presence if telemetry reports slot states
    const slots = (reqBody && typeof reqBody === 'object') ? (reqBody.slots || reqBody.keyStates) : null;
    if (slots && typeof slots === 'object') {
        try {
            const slotEntries = Array.isArray(slots)
                ? slots.map(s => [s.roomNumber || s.room, s.keyPresent !== undefined ? s.keyPresent : (s.status === 'Present')])
                : Object.entries(slots);

            for (const [rNum, isPresent] of slotEntries) {
                if (!rNum) continue;
                const clean = normalizeRoomNumber(rNum);
                const expectedStatus = (isPresent === true || isPresent === 'Present' || isPresent === 1 || isPresent === 'true')
                    ? 'Present'
                    : 'Absent';

                const [roomsFound] = await labRepository.findByRoomNumber(clean);
                if (roomsFound && roomsFound.length > 0) {
                    const currentRoom = roomsFound[0];
                    if (currentRoom.Key_Status !== expectedStatus) {
                        const userId = (expectedStatus === 'Present') ? null : currentRoom.Current_User_ID;
                        await labRepository.updateKeyStatus(currentRoom.Room_ID, expectedStatus, userId);
                    }
                }
            }
        } catch (syncErr) {
            console.error('[IoT Service] Failed to reconcile slot state in heartbeat:', syncErr.message);
        }
    }

    return iotResponseService.createHeartbeatResponse(targetRooms, now);
}

module.exports = {
    recordHeartbeat
};

