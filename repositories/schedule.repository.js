'use strict';

const db = require('../database/connection');

async function findRoomIdByNumber(roomNumber, executor = db) {
    return executor.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
}

async function deleteRoomSchedule(roomId, ay, sem, executor = db) {
    return executor.query(
        'DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );
}

async function findUserIdByName(professorName, executor = db) {
    return executor.query('SELECT User_ID FROM users WHERE Name = ?', [professorName]);
}

async function insertSchedule({ userId, roomId, subject, section, day, startTime, endTime, ay, sem, colorTheme }, executor = db) {
    return executor.query(
        'INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, roomId, subject, section, day, startTime, endTime, ay, sem, colorTheme]
    );
}

async function findUserSchedulesForConflict(userId, day, ay, sem, excludeRoomNumber, executor = db) {
    let query = `
        SELECT s.*, l.Room_Number
        FROM schedules s
        JOIN laboratories l ON s.Room_ID = l.Room_ID
        WHERE s.User_ID = ? AND s.Day_of_Week = ? AND s.Academic_Year = ? AND s.Semester = ?
    `;
    const queryParams = [userId, day, ay, sem];

    if (excludeRoomNumber) {
        query += ` AND l.Room_Number != ?`;
        queryParams.push(excludeRoomNumber);
    }

    return executor.query(query, queryParams);
}

async function findProfessorSchedules(userId, ay, sem, excludeRoomNumber, executor = db) {
    let query = `
        SELECT s.*, l.Room_Number, l.Building, u.Name as ProfessorName
        FROM schedules s
        JOIN laboratories l ON s.Room_ID = l.Room_ID
        JOIN users u ON s.User_ID = u.User_ID
        WHERE s.User_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
    `;
    const queryParams = [userId, ay, sem];

    if (excludeRoomNumber) {
        query += ` AND l.Room_Number != ?`;
        queryParams.push(excludeRoomNumber);
    }

    query += ` ORDER BY FIELD(s.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), s.Start_Time`;

    return executor.query(query, queryParams);
}

async function findRoomSchedules(roomId, ay, sem, executor = db) {
    return executor.query(`
        SELECT s.*, u.Name as ProfessorName
        FROM schedules s
        LEFT JOIN users u ON s.User_ID = u.User_ID
        WHERE s.Room_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
    `, [roomId, ay, sem]);
}

async function findUserSchedule(userId, ay, sem, executor = db) {
    return executor.query(`
        SELECT s.*, r.Room_Number, r.Building 
        FROM schedules s
        JOIN laboratories r ON s.Room_ID = r.Room_ID
        WHERE s.User_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
        ORDER BY FIELD(s.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), s.Start_Time
    `, [userId, ay, sem]);
}

async function findSummaryRoomsStatus(today, nowTime, executor = db) {
    return executor.query(`
        SELECT 
            r.Room_ID, r.Room_Number, r.Key_Status,
            s.Subject_Name, s.Section
        FROM laboratories r
        LEFT JOIN schedules s ON r.Room_ID = s.Room_ID 
            AND s.Day_of_Week = ? 
            AND ? BETWEEN s.Start_Time AND s.End_Time
    `, [today, nowTime]);
}

async function countTotalPCs(executor = db) {
    return executor.query('SELECT COUNT(*) AS totalPcs FROM lab_units');
}

async function countPendingReports(executor = db) {
    return executor.query("SELECT COUNT(*) AS pendingReports FROM maintenance WHERE Status != 'Resolved'");
}

async function countClassesToday(today, executor = db) {
    return executor.query("SELECT COUNT(*) AS classesToday FROM schedules WHERE Day_of_Week = ?", [today]);
}

async function findUserClassesToday(userId, today, executor = db) {
    return executor.query(`
        SELECT s.*, r.Room_Number, r.Building
        FROM schedules s
        JOIN laboratories r ON s.Room_ID = r.Room_ID
        WHERE s.User_ID = ? AND s.Day_of_Week = ?
        ORDER BY s.Start_Time
    `, [userId, today]);
}

async function findDistinctRoomIdsByUserId(userId, executor = db) {
    return executor.query('SELECT DISTINCT Room_ID FROM schedules WHERE User_ID = ?', [userId]);
}

module.exports = {
    findRoomIdByNumber,
    deleteRoomSchedule,
    findUserIdByName,
    insertSchedule,
    findUserSchedulesForConflict,
    findProfessorSchedules,
    findRoomSchedules,
    findUserSchedule,
    findSummaryRoomsStatus,
    countTotalPCs,
    countPendingReports,
    countClassesToday,
    findUserClassesToday,
    findDistinctRoomIdsByUserId
};
