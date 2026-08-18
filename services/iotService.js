'use strict';

const db = require('../db');

// In-memory store for recent room claim scans
const recentRoomClaims = {};

async function logOccupancy(reqBody) {
    const { qrString, roomNumber, authMethod, keyEvent } = reqBody;

    if (!roomNumber) {
        return { status: 400, error: 'roomNumber is required.', lcdLine1: 'Error', lcdLine2: 'No Room Num' };
    }

    const [rooms] = await db.query(
        'SELECT Room_ID FROM laboratories WHERE Room_Number = ?',
        [roomNumber]
    );
    if (rooms.length === 0) {
        return { status: 404, error: `Room ${roomNumber} not found.`, lcdLine1: 'Error', lcdLine2: 'Invalid Room' };
    }
    const room = rooms[0];

    if (keyEvent) {
        const status = (keyEvent === 'Key Returned') ? 'Present' : 'Absent';
        await db.query(
            'UPDATE laboratories SET Key_Status = ? WHERE Room_ID = ?',
            [status, room.Room_ID]
        );

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

        await db.query(
            'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
            [claimUserId, room.Room_ID, keyEvent]
        );

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

    const [users] = await db.query(
        'SELECT User_ID, Name, Role FROM users WHERE ID_QR_String = ?',
        [qrString]
    );
    if (users.length === 0) {
        return { status: 404, error: 'User not found for the provided QR code.', lcdLine1: 'Access Denied!', lcdLine2: 'Invalid QR Code' };
    }
    const user = users[0];

    recentRoomClaims[roomNumber] = {
        userId: user.User_ID,
        userName: user.Name,
        role: user.Role,
        timestamp: Date.now()
    };

    await db.query(
        'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), ?)',
        [user.User_ID, room.Room_ID, authMethod || 'QR Code']
    );

    return {
        status: 200,
        data: {
            message: 'Professor QR verified. Awaiting key retrieval.',
            user: {
                name: user.Name,
                role: user.Role
            },
            lcdLine1: 'Scan Confirmed!',
            lcdLine2: 'You May Take Key'
        }
    };
}

module.exports = {
    logOccupancy
};
