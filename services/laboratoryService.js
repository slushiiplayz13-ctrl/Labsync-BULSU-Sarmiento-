'use strict';

const QRCode = require('qrcode');
const { APP_URL } = require('../config/app.config');
const pool = require('../database/connection');
const labRepository = require('../repositories/laboratory.repository');
const keysRepository = require('../repositories/keys.repository');
const iotService = require('./iotService');
const auditService = require('./auditService');

async function getAllLaboratories() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const nowTime = new Date().toTimeString().split(' ')[0];

    const [rooms] = await labRepository.findAllLaboratoriesWithSchedule(today, nowTime);
    const [activeIssues] = await labRepository.findActivePCIssuesGroupedByRoom();

    const roomIssuesMap = {};
    for (const row of activeIssues) {
        if (!roomIssuesMap[row.Room_ID]) {
            roomIssuesMap[row.Room_ID] = {
                total_issues: 0,
                issues: []
            };
        }
        const count = row.issue_count || row.pc_count || 1;
        roomIssuesMap[row.Room_ID].total_issues += count;
        roomIssuesMap[row.Room_ID].issues.push({
            issue: row.Issue_Description,
            count
        });
    }

    const result = rooms.map(room => {
        const hasScheduledClass = !!room.Subject_Name;
        const keyAbsent = room.Key_Status === 'Absent';

        const scheduledProfName = room.Scheduled_Professor_Name || null;
        const currentHolderName = room.Current_Key_Holder_Name || null;

        const isScheduledProfHolder = keyAbsent && hasScheduledClass && (
            (room.Current_User_ID != null && room.Scheduled_User_ID != null && String(room.Current_User_ID) === String(room.Scheduled_User_ID)) ||
            (room.Current_User_ID == null && scheduledProfName != null)
        );

        let resolvedHolderName = currentHolderName;
        if (!resolvedHolderName && keyAbsent && hasScheduledClass) {
            resolvedHolderName = scheduledProfName;
        }

        const formattedScheduledProf = scheduledProfName
            ? (scheduledProfName.startsWith('Prof.') ? scheduledProfName : `Prof. ${scheduledProfName}`)
            : 'Faculty';
        const formattedHolder = resolvedHolderName
            ? (resolvedHolderName.startsWith('Prof.') ? resolvedHolderName : `Prof. ${resolvedHolderName}`)
            : null;

        let currentStatus = 'Available';
        let currentClassInfo = 'None';

        if (!keyAbsent) {
            currentStatus = 'Available';
            if (hasScheduledClass) {
                currentClassInfo = 'Scheduled';
            } else {
                currentClassInfo = 'None';
            }
        } else {
            if (hasScheduledClass && isScheduledProfHolder) {
                currentStatus = 'In Session';
                currentClassInfo = 'In Session';
            } else {
                currentStatus = 'Borrowed';
                currentClassInfo = 'Borrowed';
            }
        }

        const isOnline = iotService.isDeviceOnline(room.Room_Number, room.Last_Seen);
        const lastSeenTimestamp = iotService.getLastSeen(room.Room_Number, room.Last_Seen);
        const roomIssueData = roomIssuesMap[room.Room_ID] || { total_issues: 0, issues: [] };

        return {
            Room_ID: room.Room_ID,
            Room_Number: room.Room_Number,
            Building: room.Building,
            Key_Status: room.Key_Status || 'Present',
            Current_Status: currentStatus,
            Current_Class: currentClassInfo,
            Scheduled_Class: hasScheduledClass ? {
                subject: room.Subject_Name,
                subjectCode: room.Subject_Code || '',
                subjectName: room.Curriculum_Subject_Name || room.Subject_Name,
                section: room.Section,
                professor: scheduledProfName,
                startTime: room.Start_Time,
                endTime: room.End_Time
            } : null,
            Current_Key_Holder: resolvedHolderName,
            deviceOnline: isOnline,
            lastSeen: lastSeenTimestamp,
            pc_issues: roomIssueData.issues,
            total_pc_issues: roomIssueData.total_issues
        };
    });

    return { status: 200, data: result };
}

async function addLaboratory(roomNumber, building, req = null) {
    if (!roomNumber) {
        return { status: 400, error: 'Room number is required' };
    }
    const cleanNum = String(roomNumber).trim();
    const numVal = parseInt(cleanNum, 10);
    if (!/^\d{1,3}$/.test(cleanNum) || isNaN(numVal) || numVal < 1 || numVal > 999) {
        return { status: 400, error: 'Room number must be a valid number between 1 and 999 (up to 3 digits).' };
    }

    const [existing] = await labRepository.findByRoomNumber(roomNumber);
    if (existing.length > 0) {
        return { status: 400, error: 'Room number already exists' };
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [result] = await labRepository.insertLaboratory(roomNumber, building, connection);
        const roomId = result.insertId;

        // Automatically create default laboratory key: KEY-IT-[Room_Number]-A
        const defaultKeyCode = `KEY-IT-${cleanNum}-A`;
        const [existingKey] = await keysRepository.findByKeyCode(defaultKeyCode, connection);
        let keyId = null;
        if (existingKey.length === 0) {
            const [keyResult] = await keysRepository.insertKey(roomId, defaultKeyCode, 'ACTIVE', connection);
            keyId = keyResult.insertId;
        } else {
            keyId = existingKey[0].Key_ID;
        }

        await connection.commit();

        if (keyId) {
            await auditService.logSecurityEvent({
                req,
                action: 'KEY_CREATED',
                resourceType: 'LAB_KEY',
                resourceId: keyId,
                details: { roomId, keyCode: defaultKeyCode, autoCreated: true },
                result: 'SUCCESS'
            });
        }

        return { status: 200, message: 'Room added successfully', roomId, defaultKeyCode };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function updateLaboratory(roomId, roomNumber, building) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    if (!roomNumber) {
        return { status: 400, error: 'Room number is required' };
    }
    const cleanNum = String(roomNumber).trim();
    const numVal = parseInt(cleanNum, 10);
    if (!/^\d{1,3}$/.test(cleanNum) || isNaN(numVal) || numVal < 1 || numVal > 999) {
        return { status: 400, error: 'Room number must be a valid number between 1 and 999 (up to 3 digits).' };
    }

    const [existing] = await labRepository.findByRoomNumberExceptId(roomNumber, parsedRoomId);
    if (existing.length > 0) {
        return { status: 400, error: 'Room number already exists' };
    }

    await labRepository.updateLaboratory(parsedRoomId, roomNumber, building);

    return { status: 200, message: 'Room updated successfully' };
}

async function deleteLaboratory(roomId) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    await labRepository.deleteLaboratory(parsedRoomId);
    return { status: 200, message: 'Room deleted successfully' };
}

async function getRoomPCs(roomId) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    const [pcs] = await labRepository.findPCsByRoomId(parsedRoomId);
    return { status: 200, data: pcs };
}

async function addPC(roomId, pcNumber) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    if (!pcNumber) {
        return { status: 400, error: 'PC Number is required' };
    }

    const [existing] = await labRepository.findPCByRoomAndNumber(parsedRoomId, pcNumber);
    if (existing.length > 0) {
        return { status: 400, error: 'This PC number already exists in this room.' };
    }

    const qrString = `LABSYNC-PC-${parsedRoomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const [result] = await labRepository.insertPC(parsedRoomId, pcNumber, qrString);

    return { status: 200, message: 'PC added successfully', pcId: result.insertId, pcNumber };
}

async function addPCsBulk(roomId, pcNumbers) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    if (!pcNumbers || !Array.isArray(pcNumbers) || pcNumbers.length === 0) {
        return { status: 400, error: 'At least one PC number is required.' };
    }

    const cleanNumbers = Array.from(new Set(pcNumbers.map(n => n.toString().trim()).filter(n => n !== '')));
    if (cleanNumbers.length === 0) {
        return { status: 400, error: 'Valid PC numbers are required.' };
    }

    const [existing] = await labRepository.findPCNumbersByRoomId(parsedRoomId);
    const existingSet = new Set(existing.map(p => p.PC_Number.toString().trim()));

    const added = [];
    const skipped = [];

    for (const num of cleanNumbers) {
        if (existingSet.has(num)) {
            skipped.push(num);
            continue;
        }
        const qrString = `LABSYNC-PC-${parsedRoomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        await labRepository.insertPC(parsedRoomId, num, qrString);
        added.push(num);
    }

    return {
        status: 200,
        data: {
            message: `Added ${added.length} PC(s).` + (skipped.length > 0 ? ` (${skipped.length} duplicate numbers skipped)` : ''),
            addedCount: added.length,
            skippedCount: skipped.length,
            added,
            skipped
        }
    };
}

async function deletePC(pcId) {
    const parsedPCId = Number(pcId);
    if (!Number.isInteger(parsedPCId) || parsedPCId <= 0) {
        return { status: 400, error: 'Invalid PC ID. Must be a positive integer.' };
    }

    await labRepository.deletePC(parsedPCId);
    return { status: 200, message: 'PC deleted successfully' };
}

async function deletePCsBulk(roomId, pcIds) {
    const parsedRoomId = Number(roomId);
    if (!Number.isInteger(parsedRoomId) || parsedRoomId <= 0) {
        return { status: 400, error: 'Invalid room ID. Must be a positive integer.' };
    }

    if (!Array.isArray(pcIds) || pcIds.length === 0) {
        return { status: 400, error: 'At least one PC ID is required for bulk deletion.' };
    }

    const cleanPcIds = pcIds
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);

    if (cleanPcIds.length === 0) {
        return { status: 400, error: 'Valid PC IDs are required for bulk deletion.' };
    }

    const [result] = await labRepository.deletePCsBulk(cleanPcIds, parsedRoomId);
    const affectedCount = result ? (result.affectedRows || 0) : cleanPcIds.length;

    return {
        status: 200,
        data: {
            message: `Successfully deleted ${affectedCount} PC(s).`,
            deletedCount: affectedCount
        }
    };
}

async function getPCQRCode(pcId) {
    const parsedPCId = Number(pcId);
    if (!Number.isInteger(parsedPCId) || parsedPCId <= 0) {
        return { status: 400, error: 'Invalid PC ID. Must be a positive integer.' };
    }

    const [pcs] = await labRepository.findPCWithRoomDetails(parsedPCId);

    if (pcs.length === 0) {
        return { status: 404, error: 'PC not found' };
    }

    const pc = pcs[0];
    const reportUrl = `${APP_URL}/submit-pc-report.html?room=${pc.Room_Number}&pc=${pc.PC_Number}`;

    const qrCodeDataURL = await QRCode.toDataURL(reportUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#1EBBD7', light: '#FFFFFF' }
    });

    return {
        status: 200,
        data: {
            qrCode: qrCodeDataURL,
            pcNumber: pc.PC_Number,
            roomNumber: pc.Room_Number,
            reportUrl
        }
    };
}

async function getBatchQRCodes(roomId) {
    const [pcs] = await labRepository.findRoomPCsWithRoomDetails(roomId);

    const baseUrl = APP_URL;
    const qrList = await Promise.all(pcs.map(async (pc) => {
        const reportUrl = `${baseUrl}/submit-pc-report.html?room=${pc.Room_Number}&pc=${pc.PC_Number}`;
        const qrCodeDataURL = await QRCode.toDataURL(reportUrl, {
            width: 300,
            margin: 2,
            color: { dark: '#1EBBD7', light: '#FFFFFF' }
        });
        return {
            pcId: pc.PC_ID,
            pcNumber: pc.PC_Number,
            roomNumber: pc.Room_Number,
            qrCode: qrCodeDataURL,
            reportUrl
        };
    }));

    return { status: 200, data: qrList };
}

module.exports = {
    getAllLaboratories,
    addLaboratory,
    updateLaboratory,
    deleteLaboratory,
    getRoomPCs,
    addPC,
    addPCsBulk,
    deletePC,
    deletePCsBulk,
    getPCQRCode,
    getBatchQRCodes
};
