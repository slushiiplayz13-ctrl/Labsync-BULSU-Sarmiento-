'use strict';

/**
 * repositories/key-reminder.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for automatic key return reminders.
 * Provides parameterized queries for finding overdue schedule-key candidates,
 * enforcing atomic claims in schedule_key_reminders, and checking custody history.
 */

const db = require('../database/connection');

/**
 * Finds all candidate schedules for a given day of the week where the room key is currently absent.
 * Optionally filters by academic year and semester to prevent inactive term schedules from qualifying.
 * Strictly parameterized; never concatenates user input.
 *
 * @param {string} dayOfWeek - e.g. 'Monday', 'Thursday'
 * @param {string|null} [academicYear=null] - e.g. '2026-2027'
 * @param {string|null} [semester=null] - e.g. '1st Semester'
 * @param {object} [executor=db]
 * @returns {Promise<[Array, any]>}
 */
async function findActiveScheduleKeyCandidates(dayOfWeek, academicYear = null, semester = null, executor = db) {
    let query = `
        SELECT 
            s.Schedule_ID,
            s.User_ID AS Scheduled_User_ID,
            s.Room_ID,
            s.Subject_Name,
            s.Section,
            s.Day_of_Week,
            s.Start_Time,
            s.End_Time,
            s.Academic_Year,
            s.Semester,
            r.Room_Number,
            r.Building,
            r.Key_Status,
            r.Current_User_ID,
            u_sched.Name AS Scheduled_Faculty_Name,
            u_sched.Email AS Scheduled_Faculty_Email,
            u_curr.Name AS Current_Holder_Name,
            u_curr.Email AS Current_Holder_Email,
            u_curr.Role AS Current_Holder_Role,
            u_curr.Status AS Current_Holder_Status
        FROM schedules s
        JOIN laboratories r ON s.Room_ID = r.Room_ID
        LEFT JOIN users u_sched ON s.User_ID = u_sched.User_ID
        LEFT JOIN users u_curr ON r.Current_User_ID = u_curr.User_ID
        WHERE s.Day_of_Week = ?
          AND r.Key_Status = 'Absent'
          AND r.Current_User_ID IS NOT NULL
    `;
    const params = [dayOfWeek];

    if (academicYear && semester) {
        query += ' AND s.Academic_Year = ? AND s.Semester = ?';
        params.push(academicYear, semester);
    } else if (academicYear) {
        query += ' AND s.Academic_Year = ?';
        params.push(academicYear);
    }

    query += ' ORDER BY s.End_Time ASC';

    return executor.query(query, params);
}

/**
 * Retrieves the timestamp of the most recent key withdrawal for the specified room
 * up to the current evaluation timestamp.
 * Used to ensure a key taken anew after schedule end does not trigger an overdue reminder.
 *
 * @param {number} roomId
 * @param {string|Date|null} [beforeTime=null] - Maximum timestamp cutoff (e.g. 'YYYY-MM-DD HH:mm:ss' or Date)
 * @param {object} [executor=db]
 * @returns {Promise<Date|null>}
 */
async function findLatestKeyWithdrawalTime(roomId, beforeTime = null, executor = db) {
    let query = `
        SELECT Access_Time 
        FROM occupancy_log 
        WHERE Room_ID = ? 
          AND Auth_Method IN ('Key Taken', 'UNAUTHORIZED')
    `;
    const params = [roomId];

    if (beforeTime) {
        query += ' AND Access_Time <= ?';
        params.push(beforeTime instanceof Date ? beforeTime : new Date(beforeTime));
    }

    query += ' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1';

    const [rows] = await executor.query(query, params);
    if (rows && rows.length > 0 && rows[0].Access_Time) {
        return new Date(rows[0].Access_Time);
    }
    return null;
}

/**
 * Attempts an atomic insert to claim reminder processing for a specific schedule occurrence.
 * If another worker or previous tick already inserted (Schedule_ID, Occurrence_Date),
 * the UNIQUE constraint rejects the insert, guaranteeing zero race-condition duplicates.
 *
 * @param {object} params
 * @param {number} params.scheduleId
 * @param {string} params.occurrenceDate - 'YYYY-MM-DD'
 * @param {number} params.roomId
 * @param {number} params.recipientUserId
 * @param {number|null} params.scheduledUserId
 * @param {object} [executor=db]
 * @returns {Promise<{ claimed: boolean, reminderId?: number, reason?: string }>}
 */
async function claimScheduleReminder({
    scheduleId,
    occurrenceDate,
    roomId,
    recipientUserId,
    scheduledUserId,
    attemptedAt = null
}, executor = db) {
    const effectiveNow = attemptedAt ? (attemptedAt instanceof Date ? attemptedAt : new Date(attemptedAt)) : null;
    const query = effectiveNow
        ? `INSERT INTO schedule_key_reminders 
            (Schedule_ID, Occurrence_Date, Room_ID, Recipient_User_ID, Scheduled_User_ID, Status, Retry_Count, Last_Attempt_At)
           VALUES (?, ?, ?, ?, ?, 'CLAIMED', 0, ?)`
        : `INSERT INTO schedule_key_reminders 
            (Schedule_ID, Occurrence_Date, Room_ID, Recipient_User_ID, Scheduled_User_ID, Status, Retry_Count, Last_Attempt_At)
           VALUES (?, ?, ?, ?, ?, 'CLAIMED', 0, NOW())`;

    const params = effectiveNow
        ? [scheduleId, occurrenceDate, roomId, recipientUserId, scheduledUserId || null, effectiveNow]
        : [scheduleId, occurrenceDate, roomId, recipientUserId, scheduledUserId || null];

    try {
        const [result] = await executor.query(query, params);
        return {
            claimed: true,
            reminderId: result.insertId
        };
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
            return {
                claimed: false,
                reason: 'ALREADY_EXISTS'
            };
        }
        throw err;
    }
}

/**
 * Atomically reclaims a failed reminder or a stale claim for safe retry.
 * Guarantees that only ONE worker can claim the retry via atomic conditional UPDATE.
 *
 * @param {object} params
 * @param {number} params.reminderId
 * @param {number} params.recipientUserId - Current key holder user ID (follows transfers)
 * @param {number} [params.maxRetries=3]
 * @param {number} [params.retryIntervalMinutes=3]
 * @param {number} [params.staleTimeoutMinutes=5]
 * @param {Date|string|null} [params.now=null]
 * @param {object} [executor=db]
 * @returns {Promise<{ reclaimed: boolean }>}
 */
async function reclaimFailedOrStaleReminder({
    reminderId,
    recipientUserId,
    maxRetries = 3,
    retryIntervalMinutes = 3,
    staleTimeoutMinutes = 5,
    now = null
}, executor = db) {
    const effectiveNow = now ? (now instanceof Date ? now : new Date(now)) : null;

    let query;
    let params;

    if (effectiveNow) {
        query = `
            UPDATE schedule_key_reminders
            SET Status = 'CLAIMED',
                Retry_Count = Retry_Count + 1,
                Last_Attempt_At = ?,
                Recipient_User_ID = ?
            WHERE Reminder_ID = ?
              AND Retry_Count < ?
              AND (
                  (Status = 'FAILED' AND (Last_Attempt_At IS NULL OR Last_Attempt_At <= DATE_SUB(?, INTERVAL ? MINUTE)))
                  OR
                  (Status = 'CLAIMED' AND (Last_Attempt_At IS NULL OR Last_Attempt_At <= DATE_SUB(?, INTERVAL ? MINUTE)))
              )
        `;
        params = [
            effectiveNow,
            recipientUserId,
            reminderId,
            maxRetries,
            effectiveNow,
            retryIntervalMinutes,
            effectiveNow,
            staleTimeoutMinutes
        ];
    } else {
        query = `
            UPDATE schedule_key_reminders
            SET Status = 'CLAIMED',
                Retry_Count = Retry_Count + 1,
                Last_Attempt_At = NOW(),
                Recipient_User_ID = ?
            WHERE Reminder_ID = ?
              AND Retry_Count < ?
              AND (
                  (Status = 'FAILED' AND (Last_Attempt_At IS NULL OR Last_Attempt_At <= DATE_SUB(NOW(), INTERVAL ? MINUTE)))
                  OR
                  (Status = 'CLAIMED' AND (Last_Attempt_At IS NULL OR Last_Attempt_At <= DATE_SUB(NOW(), INTERVAL ? MINUTE)))
              )
        `;
        params = [
            recipientUserId,
            reminderId,
            maxRetries,
            retryIntervalMinutes,
            staleTimeoutMinutes
        ];
    }

    const [result] = await executor.query(query, params);

    return {
        reclaimed: result && result.affectedRows > 0
    };
}

/**
 * Marks a claimed reminder as successfully sent.
 *
 * @param {number} reminderId
 * @param {Date|string|null} [sentAt=null]
 * @param {object} [executor=db]
 * @returns {Promise<any>}
 */
async function markReminderSent(reminderId, sentAt = null, executor = db) {
    const effectiveNow = sentAt ? (sentAt instanceof Date ? sentAt : new Date(sentAt)) : null;
    const query = effectiveNow
        ? `UPDATE schedule_key_reminders 
           SET Status = 'SENT', Sent_At = ?, Error_Message = NULL 
           WHERE Reminder_ID = ?`
        : `UPDATE schedule_key_reminders 
           SET Status = 'SENT', Sent_At = NOW(), Error_Message = NULL 
           WHERE Reminder_ID = ?`;

    const params = effectiveNow ? [effectiveNow, reminderId] : [reminderId];
    return executor.query(query, params);
}

/**
 * Marks a claimed reminder as failed (e.g. SMTP connection timeout).
 * Records timestamp and error message for retry calculation.
 *
 * @param {number} reminderId
 * @param {string} errorMessage
 * @param {Date|string|null} [attemptedAt=null]
 * @param {object} [executor=db]
 * @returns {Promise<any>}
 */
async function markReminderFailed(reminderId, errorMessage, attemptedAt = null, executor = db) {
    const effectiveNow = attemptedAt ? (attemptedAt instanceof Date ? attemptedAt : new Date(attemptedAt)) : null;
    const query = effectiveNow
        ? `UPDATE schedule_key_reminders 
           SET Status = 'FAILED', Last_Attempt_At = ?, Error_Message = ? 
           WHERE Reminder_ID = ?`
        : `UPDATE schedule_key_reminders 
           SET Status = 'FAILED', Last_Attempt_At = NOW(), Error_Message = ? 
           WHERE Reminder_ID = ?`;

    const params = effectiveNow
        ? [effectiveNow, String(errorMessage || 'Unknown send error').substring(0, 500), reminderId]
        : [String(errorMessage || 'Unknown send error').substring(0, 500), reminderId];

    return executor.query(query, params);
}

/**
 * Marks a claimed reminder as skipped (e.g. recipient has no valid email or is inactive).
 *
 * @param {number} reminderId
 * @param {string} reason
 * @param {Date|string|null} [attemptedAt=null]
 * @param {object} [executor=db]
 * @returns {Promise<any>}
 */
async function markReminderSkipped(reminderId, reason, attemptedAt = null, executor = db) {
    const effectiveNow = attemptedAt ? (attemptedAt instanceof Date ? attemptedAt : new Date(attemptedAt)) : null;
    const query = effectiveNow
        ? `UPDATE schedule_key_reminders 
           SET Status = 'SKIPPED', Last_Attempt_At = ?, Error_Message = ? 
           WHERE Reminder_ID = ?`
        : `UPDATE schedule_key_reminders 
           SET Status = 'SKIPPED', Last_Attempt_At = NOW(), Error_Message = ? 
           WHERE Reminder_ID = ?`;

    const params = effectiveNow
        ? [effectiveNow, String(reason || 'Skipped').substring(0, 500), reminderId]
        : [String(reason || 'Skipped').substring(0, 500), reminderId];

    return executor.query(query, params);
}

/**
 * Checks if a reminder record already exists for the given schedule occurrence.
 *
 * @param {number} scheduleId
 * @param {string} occurrenceDate - 'YYYY-MM-DD'
 * @param {object} [executor=db]
 * @returns {Promise<object|null>}
 */
async function findReminderByScheduleAndDate(scheduleId, occurrenceDate, executor = db) {
    const query = `
        SELECT Reminder_ID, Schedule_ID, Occurrence_Date, Status, Retry_Count, Last_Attempt_At, Sent_At 
        FROM schedule_key_reminders 
        WHERE Schedule_ID = ? AND Occurrence_Date = ?
        LIMIT 1
    `;
    const [rows] = await executor.query(query, [scheduleId, occurrenceDate]);
    return (rows && rows.length > 0) ? rows[0] : null;
}

/**
 * Checks if a SUCCESS audit log entry exists for this schedule occurrence.
 *
 * @param {number} scheduleId
 * @param {string} occurrenceDate - 'YYYY-MM-DD'
 * @param {object} [executor=db]
 * @returns {Promise<boolean>}
 */
async function hasSuccessfulAuditLog(scheduleId, occurrenceDate, executor = db) {
    const resourceId = `${scheduleId}:${occurrenceDate}`;
    const query = `
        SELECT Log_ID 
        FROM audit_logs 
        WHERE Action = 'KEY_RETURN_REMINDER' 
          AND Resource_Type = 'SCHEDULE' 
          AND Resource_ID = ? 
          AND Result = 'SUCCESS' 
        LIMIT 1
    `;
    const [rows] = await executor.query(query, [resourceId]);
    return rows && rows.length > 0;
}

module.exports = {
    findActiveScheduleKeyCandidates,
    findLatestKeyWithdrawalTime,
    claimScheduleReminder,
    reclaimFailedOrStaleReminder,
    markReminderSent,
    markReminderFailed,
    markReminderSkipped,
    findReminderByScheduleAndDate,
    hasSuccessfulAuditLog
};
