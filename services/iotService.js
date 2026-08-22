'use strict';

const db = require('../database/connection');
const iotRepository = require('../repositories/iot.repository');
const scheduleRepository = require('../repositories/schedule.repository');
const labRepository = require('../repositories/laboratory.repository');
const userRepository = require('../repositories/user.repository');

// In-memory store for recent room claim scans
const recentRoomClaims = {};

async function logOccupancy(reqBody) {
    const { qrString, roomNumber, authMethod, keyEvent } = reqBody;

    if (!roomNumber) {
        return { status: 400, error: 'roomNumber is required.', lcdLine1: 'Error', lcdLine2: 'No Room Num' };
    }

    const [rooms] = await scheduleRepository.findRoomIdByNumber(roomNumber);
    if (rooms.length === 0) {
        return { status: 404, error: `Room ${roomNumber} not found.`, lcdLine1: 'Error', lcdLine2: 'Invalid Room' };
    }
    const room = rooms[0];

    if (keyEvent) {
        const status = (keyEvent === 'Key Returned') ? 'Present' : 'Absent';

        let claimUserId = null;
        let claimUserName = null;

        if (keyEvent === 'Key Taken') {
            const claim = recentRoomClaims[roomNumber];
            if (claim && (Date.now() - claim.timestamp < 15 * 60 * 1000)) {
                claimUserId = claim.userId;
                claimUserName = claim.userName;
            }
        } else if (keyEvent === 'Key Returned') {
            delete recentRoomClaims[roomNumber];
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            await labRepository.updateKeyStatus(room.Room_ID, status, claimUserId, connection);
            await iotRepository.insertOccupancyLog(claimUserId, room.Room_ID, keyEvent, connection);

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
    logOccupancy
};
