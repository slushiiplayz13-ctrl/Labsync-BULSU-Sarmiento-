'use strict';

const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const db = require('../db');

// Get all laboratories with real-time status and active classes computed dynamically
router.get('/', async (req, res) => {
    try {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const today = days[new Date().getDay()];
        const nowTime = new Date().toTimeString().split(' ')[0];

        const [rooms] = await db.query(
            `SELECT r.Room_ID, r.Room_Number, r.Building, r.Current_Status AS DB_Status, r.Key_Status,
                    s.Subject_Name, s.Section, u.Name AS ProfessorName
             FROM laboratories r
             LEFT JOIN schedules s ON r.Room_ID = s.Room_ID 
                 AND s.Day_of_Week = ? 
                 AND ? BETWEEN s.Start_Time AND s.End_Time
             LEFT JOIN users u ON s.User_ID = u.User_ID
             ORDER BY CAST(r.Room_Number AS UNSIGNED)`,
            [today, nowTime]
        );

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

        res.json(result);
    } catch (err) {
        console.error('Error fetching laboratories:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add new laboratory room
router.post('/add', async (req, res) => {
    const { roomNumber, building } = req.body;

    if (!roomNumber) {
        return res.status(400).json({ error: 'Room number is required' });
    }
    if (!/^\d+$/.test(roomNumber)) {
        return res.status(400).json({ error: 'Room number must contain only numbers.' });
    }

    try {
        const [existing] = await db.query('SELECT * FROM laboratories WHERE Room_Number = ?', [roomNumber]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Room number already exists' });
        }

        const [result] = await db.query(
            'INSERT INTO laboratories (Room_Number, Building, Current_Status) VALUES (?, ?, ?)',
            [roomNumber, building, 'Available']
        );

        res.json({ message: 'Room added successfully', roomId: result.insertId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a laboratory room
router.put('/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { roomNumber, building } = req.body;

    if (!roomNumber) {
        return res.status(400).json({ error: 'Room number is required' });
    }
    if (!/^\d+$/.test(roomNumber)) {
        return res.status(400).json({ error: 'Room number must contain only numbers.' });
    }

    try {
        const [existing] = await db.query('SELECT * FROM laboratories WHERE Room_Number = ? AND Room_ID != ?', [roomNumber, roomId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Room number already exists' });
        }

        await db.query(
            'UPDATE laboratories SET Room_Number = ?, Building = ? WHERE Room_ID = ?',
            [roomNumber, building, roomId]
        );

        res.json({ message: 'Room updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a laboratory room
router.delete('/:roomId', async (req, res) => {
    const { roomId } = req.params;

    try {
        await db.query('DELETE FROM laboratories WHERE Room_ID = ?', [roomId]);
        res.json({ message: 'Room deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all PCs for a specific room
router.get('/:roomId/pcs', async (req, res) => {
    try {
        const { roomId } = req.params;
        const [pcs] = await db.query('SELECT * FROM lab_units WHERE Room_ID = ? ORDER BY CAST(PC_Number AS UNSIGNED)', [roomId]);
        res.json(pcs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new PC to a room
router.post('/:roomId/pcs/add', async (req, res) => {
    try {
        const { roomId } = req.params;
        const { pcNumber } = req.body;

        if (!pcNumber) {
            return res.status(400).json({ error: 'PC Number is required' });
        }

        const [existing] = await db.query('SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?', [roomId, pcNumber]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'This PC number already exists in this room.' });
        }

        const qrString = `LABSYNC-PC-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        const [result] = await db.query(
            'INSERT INTO lab_units (Room_ID, PC_Number, Condition_Status, PC_QR_String) VALUES (?, ?, ?, ?)',
            [roomId, pcNumber, 'Functional', qrString]
        );

        res.json({ message: 'PC added successfully', pcId: result.insertId, pcNumber });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Bulk Add PCs to a room
router.post('/:roomId/pcs/add-bulk', async (req, res) => {
    try {
        const { roomId } = req.params;
        let { pcNumbers } = req.body;

        if (!pcNumbers || !Array.isArray(pcNumbers) || pcNumbers.length === 0) {
            return res.status(400).json({ error: 'At least one PC number is required.' });
        }

        const cleanNumbers = Array.from(new Set(pcNumbers.map(n => n.toString().trim()).filter(n => n !== '')));
        if (cleanNumbers.length === 0) {
            return res.status(400).json({ error: 'Valid PC numbers are required.' });
        }

        const [existing] = await db.query('SELECT PC_Number FROM lab_units WHERE Room_ID = ?', [roomId]);
        const existingSet = new Set(existing.map(p => p.PC_Number.toString().trim()));

        const added = [];
        const skipped = [];

        for (const num of cleanNumbers) {
            if (existingSet.has(num)) {
                skipped.push(num);
                continue;
            }
            const qrString = `LABSYNC-PC-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            await db.query(
                'INSERT INTO lab_units (Room_ID, PC_Number, Condition_Status, PC_QR_String) VALUES (?, ?, ?, ?)',
                [roomId, num, 'Functional', qrString]
            );
            added.push(num);
        }

        res.json({
            message: `Added ${added.length} PC(s).` + (skipped.length > 0 ? ` (${skipped.length} duplicate numbers skipped)` : ''),
            addedCount: added.length,
            skippedCount: skipped.length,
            added,
            skipped
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Batch QR code generation for all PCs in a room
router.get('/:roomId/pcs/qrcodes', async (req, res) => {
    try {
        const { roomId } = req.params;
        const [pcs] = await db.query(
            'SELECT p.PC_ID, p.PC_Number, r.Room_Number FROM lab_units p JOIN laboratories r ON p.Room_ID = r.Room_ID WHERE p.Room_ID = ? ORDER BY CAST(p.PC_Number AS UNSIGNED)',
            [roomId]
        );

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const qrList = await Promise.all(pcs.map(async (pc) => {
            const reportUrl = `${baseUrl}/submit-pc-report.html?room=${pc.Room_Number}&pc=${pc.PC_Number}`;
            const qrCodeDataURL = await QRCode.toDataURL(reportUrl, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#1EBBD7',
                    light: '#FFFFFF'
                }
            });
            return {
                pcId: pc.PC_ID,
                pcNumber: pc.PC_Number,
                roomNumber: pc.Room_Number,
                qrCode: qrCodeDataURL,
                reportUrl: reportUrl
            };
        }));

        res.json(qrList);
    } catch (err) {
        console.error('Batch QR error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
