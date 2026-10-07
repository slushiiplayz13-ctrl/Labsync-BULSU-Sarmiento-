'use strict';

const db = require('../database/connection');

async function findRoomIdByNumber(roomNumber, executor = db) {
    const raw = String(roomNumber || '').trim();
    const clean = raw.replace(/^(room|rm|laboratory|lab)\s*[-:]?\s*/i, '').trim();
    const withRoom = `Room ${clean}`;
    return executor.query(
        'SELECT Room_ID, Room_Number, Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = ? OR Room_Number = ? OR Room_Number = ?',
        [raw, clean, withRoom]
    );
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
    return executor.query("SELECT COUNT(*) AS pendingReports FROM maintenance_issues WHERE Status != 'Resolved'");
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

async function getScheduleMetadata(roomId, ay, sem, executor = db) {
    const [rows] = await executor.query(`
        SELECT sm.Metadata_ID, sm.Room_ID, sm.Academic_Year, sm.Semester, sm.Version, sm.Status,
               sm.Finalized_By, sm.Finalized_At, sm.Updated_By, sm.Updated_At,
               u.Name AS Finalized_By_Name, u.Email AS Finalized_By_Email
        FROM schedule_metadata sm
        LEFT JOIN users u ON sm.Finalized_By = u.User_ID
        WHERE sm.Room_ID = ? AND sm.Academic_Year = ? AND sm.Semester = ?
    `, [roomId, ay, sem]);
    return rows.length > 0 ? rows[0] : null;
}

async function getScheduleMetadataForUpdate(roomId, ay, sem, executor) {
    const [rows] = await executor.query(`
        SELECT sm.Metadata_ID, sm.Room_ID, sm.Academic_Year, sm.Semester, sm.Version, sm.Status,
               sm.Finalized_By, sm.Finalized_At, sm.Updated_By, sm.Updated_At
        FROM schedule_metadata sm
        WHERE sm.Room_ID = ? AND sm.Academic_Year = ? AND sm.Semester = ?
        FOR UPDATE
    `, [roomId, ay, sem]);
    return rows.length > 0 ? rows[0] : null;
}

async function upsertScheduleMetadata({ roomId, ay, sem, version, status, finalizedBy, finalizedAt, updatedBy }, executor = db) {
    return executor.query(`
        INSERT INTO schedule_metadata 
            (Room_ID, Academic_Year, Semester, Version, Status, Finalized_By, Finalized_At, Updated_By)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            Version = VALUES(Version),
            Status = VALUES(Status),
            Finalized_By = VALUES(Finalized_By),
            Finalized_At = VALUES(Finalized_At),
            Updated_By = VALUES(Updated_By),
            Updated_At = NOW()
    `, [roomId, ay, sem, version || 1, status || 'Draft', finalizedBy || null, finalizedAt || null, updatedBy || null]);
}

async function incrementScheduleVersion(roomId, ay, sem, updatedBy, executor = db) {
    return executor.query(`
        INSERT INTO schedule_metadata 
            (Room_ID, Academic_Year, Semester, Version, Status, Updated_By)
        VALUES (?, ?, ?, 2, 'Draft', ?)
        ON DUPLICATE KEY UPDATE
            Version = Version + 1,
            Updated_By = VALUES(Updated_By),
            Updated_At = NOW()
    `, [roomId, ay, sem, updatedBy || null]);
}

async function setRoomScheduleStatus(roomId, ay, sem, status, finalizedBy = null, finalizedAt = null, updatedBy = null, executor = db) {
    return executor.query(`
        INSERT INTO schedule_metadata 
            (Room_ID, Academic_Year, Semester, Version, Status, Finalized_By, Finalized_At, Updated_By)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            Status = VALUES(Status),
            Finalized_By = VALUES(Finalized_By),
            Finalized_At = VALUES(Finalized_At),
            Updated_By = VALUES(Updated_By),
            Updated_At = NOW()
    `, [roomId, ay, sem, status, finalizedBy, finalizedAt, updatedBy]);
}

async function getAllRoomsScheduleMetadata(ay, sem, executor = db) {
    return executor.query(`
        SELECT l.Room_ID, l.Room_Number, l.Building,
               COALESCE(sm.Version, 1) AS Version,
               COALESCE(sm.Status, 'Draft') AS Status,
               sm.Finalized_By, sm.Finalized_At, sm.Updated_At,
               u.Name AS Finalized_By_Name
        FROM laboratories l
        LEFT JOIN schedule_metadata sm ON l.Room_ID = sm.Room_ID 
             AND sm.Academic_Year = ? AND sm.Semester = ?
        LEFT JOIN users u ON sm.Finalized_By = u.User_ID
        ORDER BY l.Room_Number ASC
    `, [ay, sem]);
}

async function deleteRoomScheduleDraft(roomId, ay, sem, executor = db) {
    return executor.query(
        'DELETE FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );
}

async function insertScheduleDraft({ userId, roomId, subject, section, day, startTime, endTime, ay, sem, colorTheme }, executor = db) {
    return executor.query(
        'INSERT INTO schedule_drafts (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, roomId, subject, section, day, startTime, endTime, ay, sem, colorTheme]
    );
}

async function findRoomScheduleDrafts(roomId, ay, sem, executor = db) {
    return executor.query(`
        SELECT d.Draft_ID, d.Draft_ID AS Schedule_ID, d.User_ID, d.Room_ID, d.Section, d.Day_of_Week, d.Start_Time, d.End_Time, d.Academic_Year, d.Semester, d.Color_Theme,
               COALESCE(
                   CASE 
                       WHEN c.Subject_Name IS NOT NULL AND d.Subject_Name = c.Subject_Code THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       WHEN c.Subject_Code IS NOT NULL AND d.Subject_Name = c.Subject_Name THEN CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
                       ELSE d.Subject_Name
                   END,
                   d.Subject_Name
               ) AS Subject_Name,
               c.Subject_Code, c.Subject_Name AS Curriculum_Subject_Name,
               u.Name as ProfessorName,
               u.Name as Professor_Name
        FROM schedule_drafts d
        LEFT JOIN users u ON d.User_ID = u.User_ID
        LEFT JOIN curriculum c ON (
            d.Subject_Name = c.Subject_Code 
            OR d.Subject_Name = c.Subject_Name 
            OR d.Subject_Name = CONCAT(c.Subject_Code, ' - ', c.Subject_Name)
        )
        WHERE d.Room_ID = ? AND d.Academic_Year = ? AND d.Semester = ?
        ORDER BY FIELD(d.Day_of_Week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'), d.Start_Time
    `, [roomId, ay, sem]);
}

async function hasRoomScheduleDraft(roomId, ay, sem, executor = db) {
    const [rows] = await executor.query(
        'SELECT 1 FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ? LIMIT 1',
        [roomId, ay, sem]
    );
    return rows.length > 0;
}

async function copyOfficialToDraft(roomId, ay, sem, executor = db) {
    await executor.query(
        'DELETE FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );
    return executor.query(`
        INSERT INTO schedule_drafts (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
        SELECT User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme
        FROM schedules
        WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?
    `, [roomId, ay, sem]);
}

async function publishDraftToOfficial(roomId, ay, sem, executor = db) {
    await executor.query(
        'DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );
    return executor.query(`
        INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
        SELECT User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme
        FROM schedule_drafts
        WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?
    `, [roomId, ay, sem]);
}

async function clearRoomScheduleDraft(roomId, ay, sem, executor = db) {
    return executor.query(
        'DELETE FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [roomId, ay, sem]
    );
}

async function findUserSchedulesForConflictAll(userId, day, ay, sem, excludeRoomNumber, executor = db) {
    let query = `
        SELECT d.Draft_ID AS Schedule_ID, d.User_ID, d.Room_ID, d.Section, d.Day_of_Week, d.Start_Time, d.End_Time, d.Academic_Year, d.Semester,
               l.Room_Number, 'draft' AS source
        FROM schedule_drafts d
        JOIN laboratories l ON d.Room_ID = l.Room_ID
        WHERE d.User_ID = ? AND d.Day_of_Week = ? AND d.Academic_Year = ? AND d.Semester = ?
    `;
    const params = [userId, day, ay, sem];
    if (excludeRoomNumber) {
        query += ` AND l.Room_Number != ?`;
        params.push(excludeRoomNumber);
    }

    query += `
        UNION ALL
        SELECT s.Schedule_ID, s.User_ID, s.Room_ID, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester,
               l.Room_Number, 'official' AS source
        FROM schedules s
        JOIN laboratories l ON s.Room_ID = l.Room_ID
        WHERE s.User_ID = ? AND s.Day_of_Week = ? AND s.Academic_Year = ? AND s.Semester = ?
    `;
    params.push(userId, day, ay, sem);
    if (excludeRoomNumber) {
        query += ` AND l.Room_Number != ?`;
        params.push(excludeRoomNumber);
    }

    query += `
        AND NOT EXISTS (
            SELECT 1 FROM schedule_drafts sd
            WHERE sd.Room_ID = s.Room_ID AND sd.Academic_Year = s.Academic_Year AND sd.Semester = s.Semester
        )
    `;

    return executor.query(query, params);
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
    getScheduleMetadata,
    getScheduleMetadataForUpdate,
    upsertScheduleMetadata,
    incrementScheduleVersion,
    setRoomScheduleStatus,
    getAllRoomsScheduleMetadata,
    deleteRoomScheduleDraft,
    insertScheduleDraft,
    findRoomScheduleDrafts,
    hasRoomScheduleDraft,
    copyOfficialToDraft,
    publishDraftToOfficial,
    clearRoomScheduleDraft,
    findUserSchedulesForConflictAll,
    getConnection,
    withTransaction
};



