'use strict';

const labRepository = require('../../repositories/laboratory.repository');
const { DEFAULT_HARDWARE_ROOMS, getRoomKeyVariations } = require('./iot.config');
const deviceStateService = require('./device-state.service');
const iotResponseService = require('./iot-response.service');

/**
 * Records an IoT device heartbeat and synchronizes database Last_Seen timestamps.
 *
 * @param {object} reqBody
 * @param {string|number} [reqBody.roomNumber]
 * @param {string[]} [reqBody.rooms]
 * @param {string} [reqBody.deviceId]
 * @returns {Promise<{ status: number, data: { status: string, rooms: string[], timestamp: string } }>}
 */
async function recordHeartbeat(reqBody = {}) {
    const { roomNumber, rooms } = reqBody;
    const targetRooms = rooms && Array.isArray(rooms) && rooms.length > 0
        ? rooms
        : (roomNumber ? [roomNumber] : [...DEFAULT_HARDWARE_ROOMS]);

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

    return iotResponseService.createHeartbeatResponse(targetRooms, now);
}

module.exports = {
    recordHeartbeat
};
