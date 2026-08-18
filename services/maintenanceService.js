'use strict';

const db = require('../db');

async function submitReport(reqBody) {
    const { roomNumber, pcNumber, studentName, studentSection, components, remarks } = reqBody;

    if (!studentName || !studentSection) {
        return { status: 400, error: 'Student Name and Program & Section are required.' };
    }

    const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
    if (rooms.length === 0) {
        return { status: 404, error: `Room ${roomNumber} not found.` };
    }
    const roomId = rooms[0].Room_ID;

    const [pcs] = await db.query('SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?', [roomId, pcNumber]);
    if (pcs.length === 0) {
        return { status: 404, error: `PC Unit ${pcNumber} not found in Room ${roomNumber}.` };
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

    return {
        status: 200,
        data: {
            message: 'Report submitted successfully!',
            ticketId: `LS-TKT-${result.insertId}`
        }
    };
}

async function getAllReports() {
    const [reports] = await db.query(`
        SELECT m.Report_ID, m.Student_Name, m.Issue_Description, m.Date_Reported, m.Status, m.Priority_Level,
               p.PC_Number, r.Room_Number
        FROM maintenance m
        JOIN lab_units p ON m.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID
        ORDER BY m.Date_Reported DESC
    `);
    return { status: 200, data: reports };
}

async function updateReportStatus(reportId, status) {
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

    return { status: 200, message: `Report status updated to ${status} successfully.` };
}

async function deleteReport(reportId) {
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

    return { status: 200, message: 'Report deleted successfully.' };
}

async function getNotifications(sessionUserId, sessionUserRole) {
    const userId = sessionUserId;
    let role = sessionUserRole;
    if (!role) {
        const [users] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [userId]);
        if (users.length > 0) {
            role = users[0].Role;
        }
    }

    if (role === 'MIS Staff' || role === 'IT Dept. Head' || role === 'Department Head') {
        const [notifications] = await db.query(`
            (SELECT 'report' AS type, m.Report_ID AS id, m.Date_Reported AS time, m.Status AS status, 
                   p.PC_Number AS pc_number, r.Room_Number AS room_number, m.Issue_Description AS description, 
                   m.Student_Name AS detail, m.Priority_Level AS priority
            FROM maintenance m
            JOIN lab_units p ON m.PC_ID = p.PC_ID
            JOIN laboratories r ON p.Room_ID = r.Room_ID)
            UNION ALL
            (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
                   NULL AS pc_number, r.Room_Number AS room_number, IFNULL(u.Name, 'Room Key') AS description,
                   IFNULL(u.Role, 'System') AS detail, NULL AS priority
            FROM occupancy_log o
            LEFT JOIN users u ON o.User_ID = u.User_ID
            JOIN laboratories r ON o.Room_ID = r.Room_ID)
            ORDER BY time DESC
            LIMIT 20
        `);
        return { status: 200, data: notifications };
    } else {
        const [schedules] = await db.query('SELECT DISTINCT Room_ID FROM schedules WHERE User_ID = ?', [userId]);

        if (schedules.length === 0) {
            return { status: 200, data: [] };
        }

        const roomIds = schedules.map(s => s.Room_ID);

        const [reports] = await db.query(`
            (SELECT 'report' AS type, m.Report_ID AS id, m.Date_Reported AS time, m.Status AS status, 
                   p.PC_Number AS pc_number, r.Room_Number AS room_number, m.Issue_Description AS description, 
                   m.Student_Name AS detail, m.Priority_Level AS priority
            FROM maintenance m
            JOIN lab_units p ON m.PC_ID = p.PC_ID
            JOIN laboratories r ON p.Room_ID = r.Room_ID
            WHERE r.Room_ID IN (?))
            UNION ALL
            (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
                   NULL AS pc_number, r.Room_Number AS room_number, IFNULL(u.Name, 'Room Key') AS description,
                   IFNULL(u.Role, 'System') AS detail, NULL AS priority
            FROM occupancy_log o
            LEFT JOIN users u ON o.User_ID = u.User_ID
            JOIN laboratories r ON o.Room_ID = r.Room_ID
            WHERE r.Room_ID IN (?))
            ORDER BY time DESC
            LIMIT 15
        `, [roomIds, roomIds]);

        return { status: 200, data: reports };
    }
}

module.exports = {
    submitReport,
    getAllReports,
    updateReportStatus,
    deleteReport,
    getNotifications
};
