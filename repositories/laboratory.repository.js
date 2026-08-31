'use strict';

const db = require('../database/connection');

async function findAllLaboratoriesWithSchedule(today, nowTime, executor = db) {
    return executor.query(
        `SELECT r.Room_ID, r.Room_Number, r.Building, r.Current_Status AS DB_Status, r.Key_Status, r.Current_User_ID, r.Last_Seen,
                s.Section, s.User_ID AS Scheduled_User_ID, s.Start_Time, s.End_Time,
                COALESCE(
                    CASE 
                        WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                        WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                        ELSE s.Subject_Name
                    END,
                    s.Subject_Name
                ) AS Subject_Name,
                c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
                u_sched.Name AS Scheduled_Professor_Name,
                u_curr.Name AS Current_Key_Holder_Name
         FROM laboratories r
         LEFT JOIN schedules s ON r.Room_ID = s.Room_ID 
             AND s.Day_of_Week = ? 
             AND ? BETWEEN s.Start_Time AND s.End_Time
         LEFT JOIN curriculum c ON (
             s.Subject_Name = c.Subject_Code 
             OR s.Subject_Name = c.Subject_Name 
             OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
         )
         LEFT JOIN users u_sched ON s.User_ID = u_sched.User_ID
         LEFT JOIN users u_curr ON r.Current_User_ID = u_curr.User_ID
         ORDER BY CAST(r.Room_Number AS UNSIGNED)`,
        [today, nowTime]
    );
}

async function findByRoomNumber(roomNumber, executor = db) {
    return executor.query('SELECT * FROM laboratories WHERE Room_Number = ?', [roomNumber]);
}

async function findByRoomNumberExceptId(roomNumber, roomId, executor = db) {
    return executor.query('SELECT * FROM laboratories WHERE Room_Number = ? AND Room_ID != ?', [roomNumber, roomId]);
}

async function insertLaboratory(roomNumber, building, executor = db) {
    return executor.query(
        'INSERT INTO laboratories (Room_Number, Building, Current_Status) VALUES (?, ?, ?)',
        [roomNumber, building, 'Available']
    );
}

async function updateLaboratory(roomId, roomNumber, building, executor = db) {
    return executor.query(
        'UPDATE laboratories SET Room_Number = ?, Building = ? WHERE Room_ID = ?',
        [roomNumber, building, roomId]
    );
}

async function deleteLaboratory(roomId, executor = db) {
    return executor.query('DELETE FROM laboratories WHERE Room_ID = ?', [roomId]);
}

async function findPCsByRoomId(roomId, executor = db) {
    return executor.query('SELECT * FROM lab_units WHERE Room_ID = ? ORDER BY CAST(PC_Number AS UNSIGNED)', [roomId]);
}

async function findPCByRoomAndNumber(roomId, pcNumber, executor = db) {
    return executor.query('SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?', [roomId, pcNumber]);
}

async function findPCNumbersByRoomId(roomId, executor = db) {
    return executor.query('SELECT PC_Number FROM lab_units WHERE Room_ID = ?', [roomId]);
}

async function insertPC(roomId, pcNumber, qrString, executor = db) {
    return executor.query(
        'INSERT INTO lab_units (Room_ID, PC_Number, Condition_Status, PC_QR_String) VALUES (?, ?, ?, ?)',
        [roomId, pcNumber, 'Functional', qrString]
    );
}

async function deletePC(pcId, executor = db) {
    return executor.query('DELETE FROM lab_units WHERE PC_ID = ?', [pcId]);
}

async function deletePCsBulk(pcIds, roomId, executor = db) {
    if (!Array.isArray(pcIds) || pcIds.length === 0) return [{ affectedRows: 0 }];
    const placeholders = pcIds.map(() => '?').join(',');
    return executor.query(
        `DELETE FROM lab_units WHERE Room_ID = ? AND PC_ID IN (${placeholders})`,
        [roomId, ...pcIds]
    );
}

async function findPCWithRoomDetails(pcId, executor = db) {
    return executor.query(
        'SELECT p.*, r.Room_Number FROM lab_units p JOIN laboratories r ON p.Room_ID = r.Room_ID WHERE p.PC_ID = ?',
        [pcId]
    );
}

async function findRoomPCsWithRoomDetails(roomId, executor = db) {
    return executor.query(
        'SELECT p.PC_ID, p.PC_Number, r.Room_Number FROM lab_units p JOIN laboratories r ON p.Room_ID = r.Room_ID WHERE p.Room_ID = ? ORDER BY CAST(p.PC_Number AS UNSIGNED)',
        [roomId]
    );
}

async function updateConditionStatus(pcId, conditionStatus, executor = db) {
    return executor.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', [conditionStatus, pcId]);
}

async function updateKeyStatus(roomId, keyStatus, userId = null, executor = db) {
    return executor.query('UPDATE laboratories SET Key_Status = ?, Current_User_ID = ?, Last_Seen = NOW() WHERE Room_ID = ?', [keyStatus, userId, roomId]);
}

async function updateLastSeenByRoomNumbers(roomNumbers, executor = db) {
    if (!roomNumbers || !Array.isArray(roomNumbers) || roomNumbers.length === 0) return;
    const placeholders = roomNumbers.map(() => '?').join(',');
    return executor.query(
        `UPDATE laboratories SET Last_Seen = NOW() WHERE Room_Number IN (${placeholders})`,
        roomNumbers
    );
}

async function findActivePCIssuesGroupedByRoom(executor = db) {
    return executor.query(`
        SELECT p.Room_ID, m.Issue_Description, COUNT(DISTINCT m.PC_ID) AS pc_count
        FROM maintenance m
        JOIN lab_units p ON m.PC_ID = p.PC_ID
        WHERE m.Status != 'Resolved'
        GROUP BY p.Room_ID, m.Issue_Description
        ORDER BY pc_count DESC, m.Issue_Description ASC
    `);
}

module.exports = {
    findAllLaboratoriesWithSchedule,
    findByRoomNumber,
    findByRoomNumberExceptId,
    insertLaboratory,
    updateLaboratory,
    deleteLaboratory,
    findPCsByRoomId,
    findPCByRoomAndNumber,
    findPCNumbersByRoomId,
    insertPC,
    deletePC,
    deletePCsBulk,
    findPCWithRoomDetails,
    findRoomPCsWithRoomDetails,
    updateConditionStatus,
    updateKeyStatus,
    updateLastSeenByRoomNumbers,
    findActivePCIssuesGroupedByRoom
};
