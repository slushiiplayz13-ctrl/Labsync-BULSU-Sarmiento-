'use strict';

const db = require('../database/connection');

async function insertReport({ pcId, studentName, desc, status, priority }, executor = db) {
    return executor.query(
        'INSERT INTO maintenance (PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, ?, NOW(), ?, ?)',
        [pcId, studentName, desc, status, priority]
    );
}

async function findAllReports(executor = db) {
    return executor.query(`
        SELECT m.Report_ID, m.Student_Name, m.Issue_Description, m.Date_Reported, m.Status, m.Priority_Level,
               p.PC_Number, r.Room_Number
        FROM maintenance m
        JOIN lab_units p ON m.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID
        ORDER BY m.Date_Reported DESC
    `);
}

async function updateReportStatus(reportId, status, executor = db) {
    return executor.query('UPDATE maintenance SET Status = ? WHERE Report_ID = ?', [status, reportId]);
}

async function findPCIdByReportId(reportId, executor = db) {
    return executor.query('SELECT PC_ID FROM maintenance WHERE Report_ID = ?', [reportId]);
}

async function findPCIdAndStatusByReportId(reportId, executor = db) {
    return executor.query('SELECT PC_ID, Status FROM maintenance WHERE Report_ID = ?', [reportId]);
}

async function countPendingReportsByPCId(pcId, executor = db) {
    return executor.query("SELECT COUNT(*) as count FROM maintenance WHERE PC_ID = ? AND Status != 'Resolved'", [pcId]);
}

async function deleteReport(reportId, executor = db) {
    return executor.query('DELETE FROM maintenance WHERE Report_ID = ?', [reportId]);
}

async function findAllNotifications(executor = db) {
    return executor.query(`
        (SELECT 'report' AS type, m.Report_ID AS id, m.Date_Reported AS time, m.Status AS status, 
               p.PC_Number AS pc_number, r.Room_Number AS room_number, m.Issue_Description AS description, 
               m.Student_Name AS detail, m.Priority_Level AS priority, NULL AS session_type
        FROM maintenance m
        JOIN lab_units p ON m.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID)
        UNION ALL
        (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
               NULL AS pc_number, r.Room_Number AS room_number, IFNULL(u.Name, 'Room Key') AS description,
               IFNULL(u.Role, 'System') AS detail, NULL AS priority,
               (CASE 
                   WHEN o.Auth_Method = 'Key Taken' AND o.User_ID IS NOT NULL AND EXISTS (
                       SELECT 1 FROM schedules s 
                       WHERE s.Room_ID = o.Room_ID 
                         AND s.User_ID = o.User_ID 
                         AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                         AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time
                   ) THEN 'In Session'
                   WHEN o.Auth_Method = 'Key Taken' AND o.User_ID IS NOT NULL THEN 'Borrowed'
                   ELSE NULL
                END) AS session_type
        FROM occupancy_log o
        LEFT JOIN users u ON o.User_ID = u.User_ID
        JOIN laboratories r ON o.Room_ID = r.Room_ID)
        ORDER BY time DESC
        LIMIT 20
    `);
}

async function findNotificationsByRoomIds(roomIds, executor = db) {
    return executor.query(`
        (SELECT 'report' AS type, m.Report_ID AS id, m.Date_Reported AS time, m.Status AS status, 
               p.PC_Number AS pc_number, r.Room_Number AS room_number, m.Issue_Description AS description, 
               m.Student_Name AS detail, m.Priority_Level AS priority, NULL AS session_type
        FROM maintenance m
        JOIN lab_units p ON m.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID
        WHERE r.Room_ID IN (?))
        UNION ALL
        (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
               NULL AS pc_number, r.Room_Number AS room_number, IFNULL(u.Name, 'Room Key') AS description,
               IFNULL(u.Role, 'System') AS detail, NULL AS priority,
               (CASE 
                   WHEN o.Auth_Method = 'Key Taken' AND o.User_ID IS NOT NULL AND EXISTS (
                       SELECT 1 FROM schedules s 
                       WHERE s.Room_ID = o.Room_ID 
                         AND s.User_ID = o.User_ID 
                         AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                         AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time
                   ) THEN 'In Session'
                   WHEN o.Auth_Method = 'Key Taken' AND o.User_ID IS NOT NULL THEN 'Borrowed'
                   ELSE NULL
                END) AS session_type
        FROM occupancy_log o
        LEFT JOIN users u ON o.User_ID = u.User_ID
        JOIN laboratories r ON o.Room_ID = r.Room_ID
        WHERE r.Room_ID IN (?))
        ORDER BY time DESC
        LIMIT 15
    `, [roomIds, roomIds]);
}

async function getConnection() {
    return db.getConnection();
}

async function withTransaction(workFn) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const result = await workFn(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        console.error('Error executing transaction in maintenanceRepository:', err);
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = {
    insertReport,
    findAllReports,
    updateReportStatus,
    findPCIdByReportId,
    findPCIdAndStatusByReportId,
    countPendingReportsByPCId,
    deleteReport,
    findAllNotifications,
    findNotificationsByRoomIds,
    getConnection,
    withTransaction
};

