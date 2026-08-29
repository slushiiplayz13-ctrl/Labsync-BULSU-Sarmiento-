'use strict';

const db = require('../database/connection');

async function findRoomIdByNumber(roomNumber, executor = db) {
    const clean = String(roomNumber || '').trim().replace(/^RM\s*/i, '');
    return executor.query('SELECT Room_ID, Room_Number, Key_Status FROM laboratories WHERE Room_Number = ? OR Room_Number = ?', [roomNumber, clean]);
}

async function deleteRoomSchedule(roomId, ay, sem, executor = db) {
    return executor.query(
        'DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );
}

async function findUserIdByName(professorName, executor = db) {
    if (!professorName || typeof professorName !== 'string') return [[]];
    const cleanName = professorName.trim().replace(/\s+/g, ' ');
    return executor.query(
        `SELECT User_ID, Name FROM users 
         WHERE LOWER(TRIM(REPLACE(Name, '  ', ' '))) = LOWER(?) 
            OR LOWER(TRIM(Name)) = LOWER(?)
            OR Name = ?`,
        [cleanName, cleanName, professorName]
    );
}

async function insertSchedule({ userId, roomId, subject, section, day, startTime, endTime, ay, sem, colorTheme }, executor = db) {
    return executor.query(
        'INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, roomId, subject, section, day, startTime, endTime, ay, sem, colorTheme]
    );
}

async function findUserSchedulesForConflict(userId, day, ay, sem, excludeRoomNumber, executor = db) {
    let query = `
        SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
               COALESCE(
                   CASE 
                       WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       ELSE s.Subject_Name
                   END,
                   s.Subject_Name
               ) AS Subject_Name,
               c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
               l.Room_Number
        FROM schedules s
        JOIN laboratories l ON s.Room_ID = l.Room_ID
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
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
        SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
               COALESCE(
                   CASE 
                       WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       ELSE s.Subject_Name
                   END,
                   s.Subject_Name
               ) AS Subject_Name,
               c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
               l.Room_Number, l.Building, u.Name as ProfessorName, u.Name as Professor_Name
        FROM schedules s
        JOIN laboratories l ON s.Room_ID = l.Room_ID
        JOIN users u ON s.User_ID = u.User_ID
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
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
        SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
               COALESCE(
                   CASE 
                       WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       ELSE s.Subject_Name
                   END,
                   s.Subject_Name
               ) AS Subject_Name,
               c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
               u.Name as ProfessorName,
               u.Name as Professor_Name
        FROM schedules s
        LEFT JOIN users u ON s.User_ID = u.User_ID
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
        WHERE s.Room_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
    `, [roomId, ay, sem]);
}

async function findUserSchedule(userId, ay, sem, executor = db) {
    return executor.query(`
        SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
               COALESCE(
                   CASE 
                       WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       ELSE s.Subject_Name
                   END,
                   s.Subject_Name
               ) AS Subject_Name,
               c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
               r.Room_Number, r.Building 
        FROM schedules s
        JOIN laboratories r ON s.Room_ID = r.Room_ID
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
        WHERE s.User_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
        ORDER BY FIELD(s.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), s.Start_Time
    `, [userId, ay, sem]);
}

async function findSummaryRoomsStatus(today, nowTime, ay, sem, executor = db) {
    if (ay && sem) {
        return executor.query(`
            SELECT 
                r.Room_ID, r.Room_Number, r.Key_Status, r.Current_User_ID, r.Last_Seen,
                COALESCE(
                    CASE 
                        WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                        WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                        ELSE s.Subject_Name
                    END,
                    s.Subject_Name
                ) AS Subject_Name,
                s.Section, s.User_ID AS Scheduled_User_ID
            FROM laboratories r
            LEFT JOIN schedules s ON r.Room_ID = s.Room_ID 
                AND s.Day_of_Week = ? 
                AND ? BETWEEN s.Start_Time AND s.End_Time
                AND s.Academic_Year = ?
                AND s.Semester = ?
            LEFT JOIN curriculum c ON (
                s.Subject_Name = c.Subject_Code 
                OR s.Subject_Name = c.Subject_Name 
                OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
            )
        `, [today, nowTime, ay, sem]);
    }
    return executor.query(`
        SELECT 
            r.Room_ID, r.Room_Number, r.Key_Status, r.Current_User_ID, r.Last_Seen,
            COALESCE(
                CASE 
                    WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                    WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                    ELSE s.Subject_Name
                END,
                s.Subject_Name
            ) AS Subject_Name,
            s.Section, s.User_ID AS Scheduled_User_ID
        FROM laboratories r
        LEFT JOIN schedules s ON r.Room_ID = s.Room_ID 
            AND s.Day_of_Week = ? 
            AND ? BETWEEN s.Start_Time AND s.End_Time
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
    `, [today, nowTime]);
}

async function countTotalPCs(executor = db) {
    return executor.query('SELECT COUNT(*) AS totalPcs FROM lab_units');
}

async function countPendingReports(executor = db) {
    return executor.query("SELECT COUNT(*) AS pendingReports FROM maintenance WHERE Status != 'Resolved'");
}

async function countClassesToday(today, ay, sem, executor = db) {
    if (ay && sem) {
        return executor.query("SELECT COUNT(*) AS classesToday FROM schedules WHERE Day_of_Week = ? AND Academic_Year = ? AND Semester = ?", [today, ay, sem]);
    }
    return executor.query("SELECT COUNT(*) AS classesToday FROM schedules WHERE Day_of_Week = ?", [today]);
}

async function findUserClassesToday(userId, today, ay, sem, executor = db) {
    if (ay && sem) {
        return executor.query(`
            SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
                   COALESCE(
                       CASE 
                           WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                           WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                           ELSE s.Subject_Name
                       END,
                       s.Subject_Name
                   ) AS Subject_Name,
                   c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
                   r.Room_Number, r.Building
            FROM schedules s
            JOIN laboratories r ON s.Room_ID = r.Room_ID
            LEFT JOIN curriculum c ON (
                s.Subject_Name = c.Subject_Code 
                OR s.Subject_Name = c.Subject_Name 
                OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
            )
            WHERE s.User_ID = ? AND s.Day_of_Week = ? AND s.Academic_Year = ? AND s.Semester = ?
            ORDER BY s.Start_Time
        `, [userId, today, ay, sem]);
    }
    return executor.query(`
        SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
               COALESCE(
                   CASE 
                       WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       ELSE s.Subject_Name
                   END,
                   s.Subject_Name
               ) AS Subject_Name,
               c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
               r.Room_Number, r.Building
        FROM schedules s
        JOIN laboratories r ON s.Room_ID = r.Room_ID
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
        WHERE s.User_ID = ? AND s.Day_of_Week = ?
        ORDER BY s.Start_Time
    `, [userId, today]);
}

async function findFacultySchedulesByName(professorName, ay, sem, executor = db) {
    const trimmedName = (professorName || '').trim();
    const query = `
        SELECT 
            s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme,
            COALESCE(
                CASE 
                    WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                    WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                    ELSE s.Subject_Name
                END,
                s.Subject_Name
            ) as Subject_Name,
            COALESCE(
                CASE 
                    WHEN c.Subject_Name IS NOT NULL AND s.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                    WHEN c.Subject_Code IS NOT NULL AND s.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                    ELSE s.Subject_Name
                END,
                s.Subject_Name
            ) as subject,
            c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
            s.Section as section,
            s.Day_of_Week as day,
            s.Start_Time as startTime,
            s.End_Time as endTime,
            l.Room_Number,
            l.Building,
            u.Name as ProfessorName,
            u.Name as professor
        FROM schedules s
        JOIN laboratories l ON s.Room_ID = l.Room_ID
        JOIN users u ON s.User_ID = u.User_ID
        LEFT JOIN curriculum c ON (
            s.Subject_Name = c.Subject_Code 
            OR s.Subject_Name = c.Subject_Name 
            OR s.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
        WHERE (LOWER(TRIM(u.Name)) = LOWER(?) OR LOWER(TRIM(u.Name)) LIKE LOWER(CONCAT('%', ?, '%')))
          AND s.Academic_Year = ? AND s.Semester = ?
        ORDER BY FIELD(s.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), s.Start_Time
    `;
    return executor.query(query, [trimmedName, trimmedName, ay, sem]);
}

async function findDistinctRoomIdsByUserId(userId, executor = db) {
    return executor.query('SELECT DISTINCT Room_ID FROM schedules WHERE User_ID = ?', [userId]);
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
        console.error('Error executing transaction in scheduleRepository:', err);
        throw err;
    } finally {
        connection.release();
    }
}

module.exports = {
    findRoomIdByNumber,
    deleteRoomSchedule,
    findUserIdByName,
    insertSchedule,
    findUserSchedulesForConflict,
    findProfessorSchedules,
    findFacultySchedulesByName,
    findRoomSchedules,
    findUserSchedule,
    findSummaryRoomsStatus,
    countTotalPCs,
    countPendingReports,
    countClassesToday,
    findUserClassesToday,
    findDistinctRoomIdsByUserId,
    getConnection,
    withTransaction
};


