'use strict';

/**
 * Creates standardized error response objects matching the IoT LCD error contract.
 *
 * @param {number} status - HTTP status code
 * @param {string} error - Error description
 * @param {string} lcdLine1 - Line 1 text for ESP32 16x2 LCD
 * @param {string} lcdLine2 - Line 2 text for ESP32 16x2 LCD
 */
function createErrorResponse(status, error, lcdLine1, lcdLine2) {
    return {
        status,
        error,
        lcdLine1,
        lcdLine2
    };
}

/**
 * Formats response for heartbeat/ping requests.
 *
 * @param {string[]|string} rooms - List of rooms or single room identifier
 * @param {number|Date} [timestamp]
 * @param {boolean} [isSingleRoom] - Whether to use 'room' field (for /log) or 'rooms' field (for /heartbeat)
 */
function createHeartbeatResponse(rooms, timestamp = new Date(), isSingleRoom = false) {
    const isoString = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    const data = {
        status: 'online',
        timestamp: isoString
    };

    if (isSingleRoom) {
        data.room = Array.isArray(rooms) ? rooms[0] : rooms;
    } else {
        data.rooms = Array.isArray(rooms) ? rooms : [rooms];
    }

    return {
        status: 200,
        data
    };
}

/**
 * Formats response for successful Key Taken or Key Returned events.
 *
 * @param {string|number} roomNumber
 * @param {'Present'|'Absent'} status - 'Present' for Key Returned, 'Absent' for Key Taken
 * @param {string|null} [claimUserName] - Registered professor/user name if claimed
 */
function createKeyStatusResponse(roomNumber, status, claimUserName = null) {
    let lcdLine1 = 'Key Take Reg!';
    let lcdLine2 = claimUserName ? claimUserName.substring(0, 16) : 'System Updated';

    if (status === 'Present') {
        lcdLine1 = 'Key Returned!';
        lcdLine2 = 'Room Secured';
    }

    return {
        status: 200,
        data: {
            message: `Key status updated to ${status} successfully.`,
            room: roomNumber,
            keyStatus: status,
            registeredUser: claimUserName || null,
            lcdLine1,
            lcdLine2
        }
    };
}

/**
 * Formats response for successful QR identity verification.
 *
 * @param {{ Name: string, Role?: string }} user
 */
function createQrVerificationResponse(user) {
    const userName = user.Name || '';
    return {
        status: 200,
        data: {
            message: 'Professor QR verified. Awaiting key retrieval.',
            user: {
                name: user.Name,
                role: user.Role
            },
            name: user.Name,
            lcdLine1: 'Access Granted!',
            lcdLine2: userName.substring(0, 16)
        }
    };
}

module.exports = {
    createErrorResponse,
    createHeartbeatResponse,
    createKeyStatusResponse,
    createQrVerificationResponse
};
