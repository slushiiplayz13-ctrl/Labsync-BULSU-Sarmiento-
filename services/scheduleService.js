'use strict';

const db = require('../db');

async function saveRoomSchedule(roomNumber, schedules, academicYear, semester) {
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
    if (rooms.length === 0) return { status: 404, error: 'Room not found' };
    const roomId = rooms[0].Room_ID;

    await db.query(
        'DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );

    if (schedules && schedules.length > 0) {
        for (const sched of schedules) {
            const [users] = await db.query('SELECT User_ID FROM users WHERE Name = ?', [sched.professor]);
            const userId = users.length > 0 ? users[0].User_ID : null;

            await db.query(
                'INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, roomId, sched.subject, sched.section, sched.day, sched.startTime, sched.endTime, ay, sem, sched.colorTheme]
            );
        }
    }

    return { status: 200, message: 'Schedule saved successfully' };
}

async function checkProfessorConflict(params) {
    const { professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber } = params;
    if (!professorName || !day || !startTime || !endTime) {
        return { status: 400, error: 'Missing required parameters' };
    }

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [users] = await db.query('SELECT User_ID FROM users WHERE Name = ?', [professorName]);
    if (users.length === 0) {
        return { status: 200, data: { conflict: false } };
    }
    const userId = users[0].User_ID;

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

    const [schedules] = await db.query(query, queryParams);

    const overlaps = schedules.filter(s => {
        const start1 = s.Start_Time.substring(0, 5);
        const end1 = s.End_Time.substring(0, 5);
        const maxStart = start1 > startTime ? start1 : startTime;
        const minEnd = end1 < endTime ? end1 : endTime;
        return maxStart < minEnd;
    });

    if (overlaps.length > 0) {
        return {
            status: 200,
            data: {
                conflict: true,
                conflictingRoom: overlaps[0].Room_Number,
                startTime: overlaps[0].Start_Time.substring(0, 5),
                endTime: overlaps[0].End_Time.substring(0, 5)
            }
        };
    }

    return { status: 200, data: { conflict: false } };
}

async function getProfessorSchedule(params) {
    const { professorName, academicYear, semester, excludeRoomNumber } = params;
    if (!professorName) {
        return { status: 400, error: 'Missing professorName' };
    }

    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [users] = await db.query('SELECT User_ID FROM users WHERE Name = ?', [professorName]);
    if (users.length === 0) {
        return { status: 200, data: [] };
    }
    const userId = users[0].User_ID;

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

    const [schedules] = await db.query(query, queryParams);
    return { status: 200, data: schedules };
}

async function getRoomSchedule(roomNumber, academicYear, semester) {
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [rooms] = await db.query('SELECT Room_ID FROM laboratories WHERE Room_Number = ?', [roomNumber]);
    if (rooms.length === 0) return { status: 404, error: 'Room not found' };

    const [schedules] = await db.query(`
        SELECT s.*, u.Name as ProfessorName
        FROM schedules s
        LEFT JOIN users u ON s.User_ID = u.User_ID
        WHERE s.Room_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
    `, [rooms[0].Room_ID, ay, sem]);

    return { status: 200, data: schedules };
}

async function getUserSchedule(userIdParam, academicYear, semester) {
    const userId = userIdParam || 1;
    const currentYear = new Date().getFullYear();
    const ay = academicYear || `${currentYear}-${currentYear + 1}`;
    const sem = semester || '1st Semester';

    const [schedules] = await db.query(`
        SELECT s.*, r.Room_Number, r.Building 
        FROM schedules s
        JOIN laboratories r ON s.Room_ID = r.Room_ID
        WHERE s.User_ID = ? AND s.Academic_Year = ? AND s.Semester = ?
        ORDER BY FIELD(s.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), s.Start_Time
    `, [userId, ay, sem]);

    return { status: 200, data: schedules };
}

async function getITHeadSummary(sessionUserId) {
    const userId = sessionUserId || null;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const nowTime = new Date().toTimeString().split(' ')[0];

    const [rooms] = await db.query(`
        SELECT 
            r.Room_ID, r.Room_Number, r.Key_Status,
            s.Subject_Name, s.Section
        FROM laboratories r
        LEFT JOIN schedules s ON r.Room_ID = s.Room_ID 
            AND s.Day_of_Week = ? 
            AND ? BETWEEN s.Start_Time AND s.End_Time
    `, [today, nowTime]);

    const totalRooms = rooms.length;
    let availableRooms = 0;
    let claimedRooms = 0;
    let inUseRooms = 0;

    rooms.forEach(r => {
        if (r.Subject_Name) inUseRooms++;
        else if (r.Key_Status === 'Absent') claimedRooms++;
        else availableRooms++;
    });

    const [[{ totalPcs }]] = await db.query('SELECT COUNT(*) AS totalPcs FROM lab_units');

    const [[{ pendingReports }]] = await db.query(
        "SELECT COUNT(*) AS pendingReports FROM maintenance WHERE Status != 'Resolved'"
    );

    const [[{ classesToday }]] = await db.query(
        "SELECT COUNT(*) AS classesToday FROM schedules WHERE Day_of_Week = ?",
        [today]
    );

    let myClassesToday = [];
    if (userId) {
        const [myScheds] = await db.query(`
            SELECT s.*, r.Room_Number, r.Building
            FROM schedules s
            JOIN laboratories r ON s.Room_ID = r.Room_ID
            WHERE s.User_ID = ? AND s.Day_of_Week = ?
            ORDER BY s.Start_Time
        `, [userId, today]);
        myClassesToday = myScheds;
    }

    return {
        status: 200,
        data: {
            totalRooms,
            availableRooms,
            claimedRooms,
            inUseRooms,
            totalPcs,
            pendingReports,
            classesToday,
            myClassesToday
        }
    };
}

module.exports = {
    saveRoomSchedule,
    checkProfessorConflict,
    getProfessorSchedule,
    getRoomSchedule,
    getUserSchedule,
    getITHeadSummary
};
