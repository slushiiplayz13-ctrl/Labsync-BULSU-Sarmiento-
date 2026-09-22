'use strict';

const db = require('../database/connection');

async function lockPCForUpdate(pcId, executor = db) {
    return executor.query('SELECT PC_ID FROM lab_units WHERE PC_ID = ? FOR UPDATE', [pcId]);
}

async function findActiveIssueByPCAndType(pcId, issueType, executor = db) {
    return executor.query(
        "SELECT Issue_ID, Priority_Level, Status FROM maintenance_issues WHERE PC_ID = ? AND Issue_Type = ? AND Status != 'Resolved' FOR UPDATE",
        [pcId, issueType]
    );
}

async function insertMaintenanceIssue({ pcId, issueType, status, priority }, executor = db) {
    return executor.query(
        'INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, ?, ?, ?, NOW())',
        [pcId, issueType, status, priority]
    );
}

async function updateIssuePriority(issueId, priority, executor = db) {
    return executor.query(
        'UPDATE maintenance_issues SET Priority_Level = ? WHERE Issue_ID = ?',
        [priority, issueId]
    );
}

async function insertStudentReport({ issueId, pcId, studentName, desc, status, priority }, executor = db) {
    return executor.query(
        'INSERT INTO maintenance (Maintenance_Issue_ID, PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, ?, ?, NOW(), ?, ?)',
        [issueId, pcId, studentName, desc, status, priority]
    );
}

async function findIssueForUpdate(issueId, executor = db) {
    return executor.query('SELECT Issue_ID, PC_ID, Status FROM maintenance_issues WHERE Issue_ID = ? FOR UPDATE', [issueId]);
}

async function findIssueIdByStudentReportId(reportId, executor = db) {
    return executor.query('SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = ?', [reportId]);
}

async function findAllMaintenanceIssues(executor = db) {
    const [issues] = await executor.query(`
        SELECT i.Issue_ID, i.PC_ID, i.Issue_Type, i.Status, i.Priority_Level, i.Created_At, i.Resolved_At,
               i.Resolved_By_User_ID, res_u.Name AS Resolved_By_Name, res_u.Role AS Resolved_By_Role,
               p.PC_Number, r.Room_Number, r.Building
        FROM maintenance_issues i
        JOIN lab_units p ON i.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID
        LEFT JOIN users res_u ON i.Resolved_By_User_ID = res_u.User_ID
        ORDER BY i.Created_At DESC
    `);

    if (issues.length === 0) return [[]];

    const issueIds = issues.map(i => i.Issue_ID);
    const [reports] = await executor.query(`
        SELECT Report_ID, Maintenance_Issue_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level
        FROM maintenance
        WHERE Maintenance_Issue_ID IN (?)
        ORDER BY Date_Reported ASC
    `, [issueIds]);

    const reportsMap = new Map();
    reports.forEach(r => {
        if (!reportsMap.has(r.Maintenance_Issue_ID)) {
            reportsMap.set(r.Maintenance_Issue_ID, []);
        }
        reportsMap.get(r.Maintenance_Issue_ID).push(r);
    });

    const result = issues.map(issue => {
        const linkedReports = reportsMap.get(issue.Issue_ID) || [];
        const latestReport = linkedReports.length > 0 ? linkedReports[linkedReports.length - 1] : null;

        return {
            Report_ID: issue.Issue_ID,
            Issue_ID: issue.Issue_ID,
            PC_ID: issue.PC_ID,
            PC_Number: issue.PC_Number,
            Room_Number: issue.Room_Number,
            Building: issue.Building,
            Issue_Type: issue.Issue_Type,
            Status: issue.Status,
            Priority_Level: issue.Priority_Level,
            Date_Reported: latestReport ? latestReport.Date_Reported : issue.Created_At,
            Created_At: issue.Created_At,
            Resolved_At: issue.Resolved_At,
            Resolved_By_User_ID: issue.Resolved_By_User_ID,
            Resolved_By_Name: issue.Resolved_By_Name,
            Resolved_By_Role: issue.Resolved_By_Role,
            Student_Name: latestReport ? latestReport.Student_Name : 'Student',
            Issue_Description: latestReport ? latestReport.Issue_Description : `[Issues: ${issue.Issue_Type}]`,
            Report_Count: linkedReports.length,
            reports: linkedReports
        };
    });

    return [result];
}

async function updateMaintenanceIssueStatus(issueId, status, resolverUserId = null, executor = db) {
    if (status === 'Resolved') {
        return executor.query(
            "UPDATE maintenance_issues SET Status = 'Resolved', Resolved_At = NOW(), Resolved_By_User_ID = ? WHERE Issue_ID = ?",
            [resolverUserId, issueId]
        );
    }
    return executor.query(
        'UPDATE maintenance_issues SET Status = ?, Resolved_At = NULL, Resolved_By_User_ID = NULL WHERE Issue_ID = ?',
        [status, issueId]
    );
}

async function updateLinkedStudentReportsStatus(issueId, status, executor = db) {
    return executor.query('UPDATE maintenance SET Status = ? WHERE Maintenance_Issue_ID = ?', [status, issueId]);
}

async function countActiveIssuesByPCId(pcId, executor = db) {
    return executor.query(
        "SELECT COUNT(*) as count FROM maintenance_issues WHERE PC_ID = ? AND Status != 'Resolved'",
        [pcId]
    );
}

async function findPCIdAndStatusByIssueId(issueId, executor = db) {
    return executor.query('SELECT PC_ID, Status FROM maintenance_issues WHERE Issue_ID = ?', [issueId]);
}

async function deleteMaintenanceIssue(issueId, executor = db) {
    await executor.query('DELETE FROM maintenance WHERE Maintenance_Issue_ID = ?', [issueId]);
    return executor.query('DELETE FROM maintenance_issues WHERE Issue_ID = ?', [issueId]);
}

// Preserve existing report functions for compatibility
async function insertReport({ pcId, studentName, desc, status, priority }, executor = db) {
    return executor.query(
        'INSERT INTO maintenance (PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, ?, NOW(), ?, ?)',
        [pcId, studentName, desc, status, priority]
    );
}

async function findAllReports(executor = db) {
    return findAllMaintenanceIssues(executor);
}

async function updateReportStatus(reportId, status, resolverUserId = null, executor = db) {
    return updateMaintenanceIssueStatus(reportId, status, resolverUserId, executor);
}

async function resolveAllPendingReportsByPCId(pcId, executor = db) {
    return executor.query("UPDATE maintenance_issues SET Status = 'Resolved', Resolved_At = NOW() WHERE PC_ID = ? AND Status != 'Resolved'", [pcId]);
}

async function findActivePendingReportByPCId(pcId, executor = db) {
    return executor.query(
        "SELECT Issue_ID AS Report_ID, Issue_Type FROM maintenance_issues WHERE PC_ID = ? AND Status != 'Resolved' ORDER BY Created_At DESC LIMIT 1",
        [pcId]
    );
}

async function findPCIdByReportId(reportId, executor = db) {
    return executor.query('SELECT PC_ID FROM maintenance_issues WHERE Issue_ID = ?', [reportId]);
}

async function findPCIdAndStatusByReportId(reportId, executor = db) {
    return findPCIdAndStatusByIssueId(reportId, executor);
}

async function countPendingReportsByPCId(pcId, executor = db) {
    return countActiveIssuesByPCId(pcId, executor);
}

async function deleteReport(reportId, executor = db) {
    return deleteMaintenanceIssue(reportId, executor);
}

async function findReportNotifications(executor = db) {
    return executor.query(`
        SELECT 'report' AS type, i.Issue_ID AS id, i.Created_At AS time, i.Status AS status, 
               p.PC_Number AS pc_number, r.Room_Number AS room_number, 
               CONCAT('[Issues: ', i.Issue_Type, ']') AS description, 
               'Student Report' AS detail, i.Priority_Level AS priority, NULL AS session_type
        FROM maintenance_issues i
        JOIN lab_units p ON i.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID
        ORDER BY time DESC
        LIMIT 20
    `);
}

async function findAllNotifications(executor = db) {
    return executor.query(`
        (SELECT 'report' AS type, i.Issue_ID AS id, i.Created_At AS time, i.Status AS status, 
               p.PC_Number AS pc_number, r.Room_Number AS room_number, 
               CONCAT('[Issues: ', i.Issue_Type, ']') AS description, 
               'Student Report' AS detail, i.Priority_Level AS priority, NULL AS session_type
        FROM maintenance_issues i
        JOIN lab_units p ON i.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID)
        UNION ALL
        (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
               NULL AS pc_number, r.Room_Number AS room_number,
               (CASE 
                   WHEN o.Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT') THEN 'Unidentified Person'
                   WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Unidentified Person'
                   ELSE COALESCE(
                       u.Name,
                       (SELECT u_sched.Name 
                        FROM schedules s 
                        JOIN users u_sched ON s.User_ID = u_sched.User_ID 
                        WHERE s.Room_ID = o.Room_ID 
                          AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                          AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time 
                        LIMIT 1),
                       (SELECT u_prev.Name 
                        FROM occupancy_log o_prev 
                        JOIN users u_prev ON o_prev.User_ID = u_prev.User_ID 
                        WHERE o_prev.Room_ID = o.Room_ID 
                          AND o_prev.Auth_Method = 'Key Taken' 
                          AND o_prev.Access_Time <= o.Access_Time 
                          AND o_prev.User_ID IS NOT NULL 
                        ORDER BY o_prev.Access_Time DESC LIMIT 1),
                       (SELECT u_curr.Name 
                        FROM laboratories r2 
                        JOIN users u_curr ON r2.Current_User_ID = u_curr.User_ID 
                        WHERE r2.Room_ID = o.Room_ID),
                       (SELECT u_assigned.Name 
                        FROM schedules s_any 
                        JOIN users u_assigned ON s_any.User_ID = u_assigned.User_ID 
                        WHERE s_any.Room_ID = o.Room_ID 
                        ORDER BY s_any.Schedule_ID ASC LIMIT 1),
                       'Room Key'
                   )
               END) AS description,
               (CASE 
                   WHEN o.Auth_Method = 'UNAUTHORIZED' THEN 'Security Alert'
                   WHEN o.Auth_Method = 'WRONG_SLOT' THEN 'Hardware Warning'
                   WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Alarm Cleared'
                   ELSE COALESCE(
                       u.Role,
                       (SELECT u_sched.Role 
                        FROM schedules s 
                        JOIN users u_sched ON s.User_ID = u_sched.User_ID 
                        WHERE s.Room_ID = o.Room_ID 
                          AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                          AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time 
                        LIMIT 1),
                       (SELECT u_prev.Role 
                        FROM occupancy_log o_prev 
                        JOIN users u_prev ON o_prev.User_ID = u_prev.User_ID 
                        WHERE o_prev.Room_ID = o.Room_ID 
                          AND o_prev.Auth_Method = 'Key Taken' 
                          AND o_prev.Access_Time <= o.Access_Time 
                          AND o_prev.User_ID IS NOT NULL 
                        ORDER BY o_prev.Access_Time DESC LIMIT 1),
                       (SELECT u_curr.Role 
                        FROM laboratories r2 
                        JOIN users u_curr ON r2.Current_User_ID = u_curr.User_ID 
                        WHERE r2.Room_ID = o.Room_ID),
                       (SELECT u_assigned.Role 
                        FROM schedules s_any 
                        JOIN users u_assigned ON s_any.User_ID = u_assigned.User_ID 
                        WHERE s_any.Room_ID = o.Room_ID 
                        ORDER BY s_any.Schedule_ID ASC LIMIT 1),
                       'Faculty'
                   )
               END) AS detail,
               NULL AS priority,
               (CASE 
                   WHEN o.Auth_Method = 'Key Taken' AND EXISTS (
                       SELECT 1 FROM schedules s 
                       WHERE s.Room_ID = o.Room_ID 
                         AND (s.User_ID = o.User_ID OR o.User_ID IS NULL)
                         AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                         AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time
                   ) THEN 'In Session'
                   WHEN o.Auth_Method = 'Key Taken' THEN 'Borrowed'
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
        (SELECT 'report' AS type, i.Issue_ID AS id, i.Created_At AS time, i.Status AS status, 
               p.PC_Number AS pc_number, r.Room_Number AS room_number, 
               CONCAT('[Issues: ', i.Issue_Type, ']') AS description, 
               'Student Report' AS detail, i.Priority_Level AS priority, NULL AS session_type
        FROM maintenance_issues i
        JOIN lab_units p ON i.PC_ID = p.PC_ID
        JOIN laboratories r ON p.Room_ID = r.Room_ID
        WHERE r.Room_ID IN (?))
        UNION ALL
        (SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
               NULL AS pc_number, r.Room_Number AS room_number,
               (CASE 
                   WHEN o.Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT') THEN 'Unidentified Person'
                   WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Unidentified Person'
                   ELSE COALESCE(
                       u.Name,
                       (SELECT u_sched.Name 
                        FROM schedules s 
                        JOIN users u_sched ON s.User_ID = u_sched.User_ID 
                        WHERE s.Room_ID = o.Room_ID 
                          AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                          AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time 
                        LIMIT 1),
                       (SELECT u_prev.Name 
                        FROM occupancy_log o_prev 
                        JOIN users u_prev ON o_prev.User_ID = u_prev.User_ID 
                        WHERE o_prev.Room_ID = o.Room_ID 
                          AND o_prev.Auth_Method = 'Key Taken' 
                          AND o_prev.Access_Time <= o.Access_Time 
                          AND o_prev.User_ID IS NOT NULL 
                        ORDER BY o_prev.Access_Time DESC LIMIT 1),
                       (SELECT u_curr.Name 
                        FROM laboratories r2 
                        JOIN users u_curr ON r2.Current_User_ID = u_curr.User_ID 
                        WHERE r2.Room_ID = o.Room_ID),
                       (SELECT u_assigned.Name 
                        FROM schedules s_any 
                        JOIN users u_assigned ON s_any.User_ID = u_assigned.User_ID 
                        WHERE s_any.Room_ID = o.Room_ID 
                        ORDER BY s_any.Schedule_ID ASC LIMIT 1),
                       'Room Key'
                   )
               END) AS description,
               (CASE 
                   WHEN o.Auth_Method = 'UNAUTHORIZED' THEN 'Security Alert'
                   WHEN o.Auth_Method = 'WRONG_SLOT' THEN 'Hardware Warning'
                   WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Alarm Cleared'
                   ELSE COALESCE(
                       u.Role,
                       (SELECT u_sched.Role 
                        FROM schedules s 
                        JOIN users u_sched ON s.User_ID = u_sched.User_ID 
                        WHERE s.Room_ID = o.Room_ID 
                          AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                          AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time 
                        LIMIT 1),
                       (SELECT u_prev.Role 
                        FROM occupancy_log o_prev 
                        JOIN users u_prev ON o_prev.User_ID = u_prev.User_ID 
                        WHERE o_prev.Room_ID = o.Room_ID 
                          AND o_prev.Auth_Method = 'Key Taken' 
                          AND o_prev.Access_Time <= o.Access_Time 
                          AND o_prev.User_ID IS NOT NULL 
                        ORDER BY o_prev.Access_Time DESC LIMIT 1),
                       (SELECT u_curr.Role 
                        FROM laboratories r2 
                        JOIN users u_curr ON r2.Current_User_ID = u_curr.User_ID 
                        WHERE r2.Room_ID = o.Room_ID),
                       (SELECT u_assigned.Role 
                        FROM schedules s_any 
                        JOIN users u_assigned ON s_any.User_ID = u_assigned.User_ID 
                        WHERE s_any.Room_ID = o.Room_ID 
                        ORDER BY s_any.Schedule_ID ASC LIMIT 1),
                       'Faculty'
                   )
               END) AS detail,
               NULL AS priority,
               (CASE 
                   WHEN o.Auth_Method = 'Key Taken' AND EXISTS (
                       SELECT 1 FROM schedules s 
                       WHERE s.Room_ID = o.Room_ID 
                         AND (s.User_ID = o.User_ID OR o.User_ID IS NULL)
                         AND s.Day_of_Week = DAYNAME(o.Access_Time) 
                         AND TIME(o.Access_Time) BETWEEN s.Start_Time AND s.End_Time
                   ) THEN 'In Session'
                   WHEN o.Auth_Method = 'Key Taken' THEN 'Borrowed'
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
    lockPCForUpdate,
    findActiveIssueByPCAndType,
    insertMaintenanceIssue,
    updateIssuePriority,
    insertStudentReport,
    findAllMaintenanceIssues,
    updateMaintenanceIssueStatus,
    updateLinkedStudentReportsStatus,
    countActiveIssuesByPCId,
    findPCIdAndStatusByIssueId,
    findIssueForUpdate,
    findIssueIdByStudentReportId,
    deleteMaintenanceIssue,
    insertReport,
    findAllReports,
    updateReportStatus,
    resolveAllPendingReportsByPCId,
    findActivePendingReportByPCId,
    findPCIdByReportId,
    findPCIdAndStatusByReportId,
    countPendingReportsByPCId,
    deleteReport,
    findReportNotifications,
    findAllNotifications,
    findNotificationsByRoomIds,
    getConnection,
    withTransaction
};
