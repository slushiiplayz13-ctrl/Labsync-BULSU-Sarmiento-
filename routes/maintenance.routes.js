'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper middleware check for authenticated session
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

// Submit a student PC report
router.post('/submit', async (req, res) => {
    const { roomNumber, pcNumber, studentName, studentSection, components, remarks } = req.body;

    try {
        if (!studentName || !studentSection) {
            return res.status(400).json({ error: 'Student Name and Program & Section are required.' });
        }

        const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
        if (rooms.length === 0) {
            return res.status(404).json({ error: `Room ${roomNumber} not found.` });
        }
        const roomId = rooms[0].Room_ID;

        const [pcs] = await db.query('SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?', [roomId, pcNumber]);
        if (pcs.length === 0) {
            return res.status(404).json({ error: `PC Unit ${pcNumber} not found in Room ${roomNumber}.` });
        }
        const pcId = pcs[0].PC_ID;

        const issueComponents = Object.keys(components || {}).filter(key => components[key] === 'issue');

        const desc = `[Program & Section: ${studentSection}] [Issues: ${issueComponents.join(', ') || 'None'}] Remarks: ${remarks || 'None'}`;

        let priority = 'Low';
        let status = 'Pending';
        let pcCondition = 'Under Maintenance';

        const hasIssues = issueComponents.length > 0;
        const hasRemarks = remarks && remarks.trim() !== '' && remarks.trim().toLowerCase() !== 'none';

        if (!hasIssues && !hasRemarks) {
            status = 'Resolved';
            pcCondition = 'Functional';
        } else {
            if (components['PC/Laptop'] === 'issue' || components['System Unit'] === 'issue') {
                priority = 'High';
            } else if (components['Monitor'] === 'issue') {
                priority = 'Medium';
            }
        }

        const [result] = await db.query(
            'INSERT INTO maintenance (PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, ?, NOW(), ?, ?)',
            [pcId, studentName, desc, status, priority]
        );

        await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', [pcCondition, pcId]);

        res.json({
            message: 'Report submitted successfully!',
            ticketId: `LS-TKT-${result.insertId}`
        });
    } catch (err) {
        console.error('Error submitting report:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all reports for MIS / IT Head dashboards
router.get('/', async (req, res) => {
    try {
        const [reports] = await db.query(`
            SELECT m.Report_ID, m.Student_Name, m.Issue_Description, m.Date_Reported, m.Status, m.Priority_Level,
                   p.PC_Number, r.Room_Number
            FROM maintenance m
            JOIN lab_units p ON m.PC_ID = p.PC_ID
            JOIN laboratories r ON p.Room_ID = r.Room_ID
            ORDER BY m.Date_Reported DESC
        `);
        res.json(reports);
    } catch (err) {
        console.error('Error fetching reports:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update a report status (MIS / IT Head)
router.put('/:reportId/status', async (req, res) => {
    const { reportId } = req.params;
    const { status } = req.body;

    try {
        await db.query('UPDATE maintenance SET Status = ? WHERE Report_ID = ?', [status, reportId]);

        if (status === 'Resolved') {
            const [reports] = await db.query('SELECT PC_ID FROM maintenance WHERE Report_ID = ?', [reportId]);
            if (reports.length > 0) {
                const pcId = reports[0].PC_ID;
                const [pending] = await db.query("SELECT COUNT(*) as count FROM maintenance WHERE PC_ID = ? AND Status != 'Resolved'", [pcId]);
                if (pending[0].count === 0) {
                    await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', ['Functional', pcId]);
                }
            }
        }

        res.json({ message: `Report status updated to ${status} successfully.` });
    } catch (err) {
        console.error('Error updating report status:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a report
router.delete('/:reportId', async (req, res) => {
    const { reportId } = req.params;

    try {
        const [reports] = await db.query('SELECT PC_ID, Status FROM maintenance WHERE Report_ID = ?', [reportId]);
        if (reports.length > 0) {
            const { PC_ID, Status } = reports[0];
            await db.query('DELETE FROM maintenance WHERE Report_ID = ?', [reportId]);
            const [pending] = await db.query("SELECT COUNT(*) as count FROM maintenance WHERE PC_ID = ? AND Status != 'Resolved'", [PC_ID]);
            if (pending[0].count === 0) {
                await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', ['Functional', PC_ID]);
            }
        } else {
            await db.query('DELETE FROM maintenance WHERE Report_ID = ?', [reportId]);
        }

        res.json({ message: 'Report deleted successfully.' });
    } catch (err) {
        console.error('Error deleting report:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
