'use strict';

const QRCode = require('qrcode');
const labRepository = require('../repositories/laboratory.repository');

async function getAllLaboratories() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const nowTime = new Date().toTimeString().split(' ')[0];

    const [rooms] = await labRepository.findAllLaboratoriesWithSchedule(today, nowTime);

    const result = rooms.map(room => {
        const hasClass = !!room.Subject_Name;
        const keyAbsent = room.Key_Status === 'Absent';

        return {
            Room_ID: room.Room_ID,
            Room_Number: room.Room_Number,
            Building: room.Building,
            Key_Status: room.Key_Status || 'Present',
            Current_Status: hasClass ? 'In Use' : (keyAbsent ? 'Claimed' : 'Available'),
            Current_Class: hasClass ? `${room.Subject_Name} (${room.Section})` : (keyAbsent ? 'Open Lab Session' : 'None')
        };
    });

    return { status: 200, data: result };
}

async function addLaboratory(roomNumber, building) {
    if (!roomNumber) {
        return { status: 400, error: 'Room number is required' };
    }
    if (!/^\d+$/.test(roomNumber)) {
        return { status: 400, error: 'Room number must contain only numbers.' };
    }

    const [existing] = await labRepository.findByRoomNumber(roomNumber);
    if (existing.length > 0) {
        return { status: 400, error: 'Room number already exists' };
    }

    const [result] = await labRepository.insertLaboratory(roomNumber, building);

    return { status: 200, message: 'Room added successfully', roomId: result.insertId };
}

async function updateLaboratory(roomId, roomNumber, building) {
    if (!roomNumber) {
        return { status: 400, error: 'Room number is required' };
    }
    if (!/^\d+$/.test(roomNumber)) {
        return { status: 400, error: 'Room number must contain only numbers.' };
    }

    const [existing] = await labRepository.findByRoomNumberExceptId(roomNumber, roomId);
    if (existing.length > 0) {
        return { status: 400, error: 'Room number already exists' };
    }

    await labRepository.updateLaboratory(roomId, roomNumber, building);

    return { status: 200, message: 'Room updated successfully' };
}

async function deleteLaboratory(roomId) {
    await labRepository.deleteLaboratory(roomId);
    return { status: 200, message: 'Room deleted successfully' };
}

async function getRoomPCs(roomId) {
    const [pcs] = await labRepository.findPCsByRoomId(roomId);
    return { status: 200, data: pcs };
}

async function addPC(roomId, pcNumber) {
    if (!pcNumber) {
        return { status: 400, error: 'PC Number is required' };
    }

    const [existing] = await labRepository.findPCByRoomAndNumber(roomId, pcNumber);
    if (existing.length > 0) {
        return { status: 400, error: 'This PC number already exists in this room.' };
    }

    const qrString = `LABSYNC-PC-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const [result] = await labRepository.insertPC(roomId, pcNumber, qrString);

    return { status: 200, message: 'PC added successfully', pcId: result.insertId, pcNumber };
}

async function addPCsBulk(roomId, pcNumbers) {
    if (!pcNumbers || !Array.isArray(pcNumbers) || pcNumbers.length === 0) {
        return { status: 400, error: 'At least one PC number is required.' };
    }

    const cleanNumbers = Array.from(new Set(pcNumbers.map(n => n.toString().trim()).filter(n => n !== '')));
    if (cleanNumbers.length === 0) {
        return { status: 400, error: 'Valid PC numbers are required.' };
    }

    const [existing] = await labRepository.findPCNumbersByRoomId(roomId);
    const existingSet = new Set(existing.map(p => p.PC_Number.toString().trim()));

    const added = [];
    const skipped = [];

    for (const num of cleanNumbers) {
        if (existingSet.has(num)) {
            skipped.push(num);
            continue;
        }
        const qrString = `LABSYNC-PC-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        await labRepository.insertPC(roomId, num, qrString);
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
    await labRepository.deletePC(pcId);
    return { status: 200, message: 'PC deleted successfully' };
}

async function getPCQRCode(pcId) {
    const [pcs] = await labRepository.findPCWithRoomDetails(pcId);

    if (pcs.length === 0) {
        return { status: 404, error: 'PC not found' };
    }

    const pc = pcs[0];
    const reportUrl = `${process.env.APP_URL || 'http://localhost:3000'}/submit-pc-report.html?room=${pc.Room_Number}&pc=${pc.PC_Number}`;

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

    const baseUrl = process.env.APP_URL || 'http://localhost:3000';
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
    getPCQRCode,
    getBatchQRCodes
};
