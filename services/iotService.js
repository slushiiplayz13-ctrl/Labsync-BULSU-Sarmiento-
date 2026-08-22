'use strict';

const db = require('../database/connection');
const iotRepository = require('../repositories/iot.repository');
const scheduleRepository = require('../repositories/schedule.repository');
const labRepository = require('../repositories/laboratory.repository');
const userRepository = require('../repositories/user.repository');

// In-memory store for recent room claim scans
const recentRoomClaims = {};

// In-memory store for real-time IoT device heartbeats
const deviceLastSeen = {};
const OFFLINE_THRESHOLD_MS = 15 * 1000; // 15 seconds (3 missed 5-second heartbeats)

function isDeviceOnline(roomNumber, dbLastSeen) {
    const now = Date.now();
    const cleanNum = String(roomNumber || '').trim().replace(/^RM\s*/i, '');
    const memTime = deviceLastSeen[cleanNum] || deviceLastSeen[String(roomNumber)] || 0;
    const dbTime = dbLastSeen ? new Date(dbLastSeen).getTime() : 0;
    const latest = Math.max(memTime, dbTime);
    return latest > 0 && (now - latest) <= OFFLINE_THRESHOLD_MS;
}

function getLastSeen(roomNumber, dbLastSeen) {
    const cleanNum = String(roomNumber || '').trim().replace(/^RM\s*/i, '');
    const memTime = deviceLastSeen[cleanNum] || deviceLastSeen[String(roomNumber)] || 0;
    const dbTime = dbLastSeen ? new Date(dbLastSeen).getTime() : 0;
    const latest = Math.max(memTime, dbTime);
    return latest > 0 ? new Date(latest).toISOString() : null;
}

async function recordHeartbeat(reqBody = {}) {
    const { roomNumber, rooms, deviceId } = reqBody;
    const targetRooms = rooms && Array.isArray(rooms) && rooms.length > 0
        ? rooms
        : (roomNumber ? [roomNumber] : ['203', '204']);

    const now = Date.now();
    const allRoomKeys = [];
    for (const rNum of targetRooms) {
        const clean = String(rNum).trim().replace(/^RM\s*/i, '');
        deviceLastSeen[clean] = now;
        deviceLastSeen[String(rNum)] = now;
        allRoomKeys.push(clean);
        allRoomKeys.push(String(rNum));
    }

    try {
        await labRepository.updateLastSeenByRoomNumbers(allRoomKeys);
    } catch (err) {
        console.error('[IoT Service] Failed to update Last_Seen in database:', err.message);
    }

    return {
        status: 200,
        data: {
            status: 'online',
            rooms: targetRooms,
            timestamp: new Date(now).toISOString()
        }
    };
}

async function logOccupancy(reqBody) {
    const { qrString, roomNumber, authMethod, keyEvent } = reqBody;

    if (!roomNumber) {
        return { status: 400, error: 'roomNumber is required.', lcdLine1: 'Error', lcdLine2: 'No Room Num' };
    }

    // Refresh device last seen timestamp on any active interaction for all rooms on the hardware box
    const cleanRoomNum = String(roomNumber).trim().replace(/^RM\s*/i, '');
    const now = Date.now();
    deviceLastSeen[cleanRoomNum] = now;
    deviceLastSeen[String(roomNumber)] = now;
    deviceLastSeen['203'] = now;
    deviceLastSeen['204'] = now;

    try {
        await labRepository.updateLastSeenByRoomNumbers([cleanRoomNum, String(roomNumber), '203', '204']);
    } catch (e) {
        console.error('[IoT Service] Failed to update Last_Seen in logOccupancy:', e.message);
    }

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) {
        return { status: 404, error: `Room ${roomNumber} not found.`, lcdLine1: 'Error', lcdLine2: 'Invalid Room' };
    }
    const room = rooms[0];

    if (keyEvent === 'Heartbeat' || keyEvent === 'ping' || reqBody.heartbeat) {
        return {
            status: 200,
            data: {
                status: 'online',
                room: roomNumber,
                timestamp: new Date(now).toISOString()
            }
        };
    }

    if (keyEvent) {
        const status = (keyEvent === 'Key Returned') ? 'Present' : 'Absent';
        const isDuplicateState = (room.Key_Status === status);

        let claimUserId = null;
        let claimUserName = null;

        if (keyEvent === 'Key Taken') {
            const claim = recentRoomClaims[cleanRoomNum] || recentRoomClaims[roomNumber];
            if (claim && (Date.now() - claim.timestamp < 15 * 60 * 1000)) {
                claimUserId = claim.userId;
                claimUserName = claim.userName;
            }
        } else if (keyEvent === 'Key Returned') {
            delete recentRoomClaims[cleanRoomNum];
            delete recentRoomClaims[roomNumber];
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await labRepository.updateKeyStatus(room.Room_ID, status, claimUserId, connection);
            if (!isDuplicateState) {
                await iotRepository.insertOccupancyLog(claimUserId, room.Room_ID, keyEvent, connection);
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            console.error('Error logging key status occupancy within transaction:', err);
            throw err;
        } finally {
            connection.release();
        }

        let lcdLine1 = 'Key Take Reg!';
        let lcdLine2 = claimUserName ? claimUserName.substring(0, 16) : 'System Updated';

        if (keyEvent === 'Key Returned') {
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

    if (!qrString) {
        return { status: 400, error: 'qrString or keyEvent is required.', lcdLine1: 'Scan Error', lcdLine2: 'Missing QR' };
    }

    const [users] = await userRepository.findByQRString(qrString);
    if (users.length === 0) {
        return { status: 404, error: 'User not found for the provided QR code.', lcdLine1: 'Access Denied!', lcdLine2: 'Invalid QR Code' };
    }
    const user = users[0];

    if (!user.ID_QR_String) {
        const newQR = `LABSYNC-USER-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        await userRepository.updateUserQR(user.User_ID, newQR);
        user.ID_QR_String = newQR;
    }

    recentRoomClaims[roomNumber] = {
        userId: user.User_ID,
        userName: user.Name,
        role: user.Role,
        timestamp: Date.now()
    };

    await iotRepository.insertOccupancyLog(user.User_ID, room.Room_ID, authMethod || 'QR Code');

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
            lcdLine2: user.Name.substring(0, 16)
        }
    };
}

module.exports = {
    logOccupancy,
    recordHeartbeat,
    isDeviceOnline,
    getLastSeen
};
