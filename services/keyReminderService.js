'use strict';

/**
 * services/keyReminderService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automatic Key Return / Transfer Reminder Service.
 *
 * Core Business Rule:
 * Scheduled End Time + 15 Minutes = Reminder Deadline.
 *
 * Requirements:
 * 1. Checks every minute for active schedules that have passed End_Time + 15m.
 * 2. Recipient is always the actual current key holder from laboratories.Current_User_ID.
 * 3. Never sends reminder if key is returned at or before the 15-minute deadline.
 * 4. Never invents a recipient if Current_User_ID is NULL.
 * 5. Prevents duplicate emails across restarts and concurrent ticks via atomic database claims.
 * 6. Explicitly uses 'Asia/Manila' timezone for deterministic behavior in local and Railway environments.
 */

const keyReminderRepository = require('../repositories/key-reminder.repository');
const emailService = require('./email/email.service');
const auditService = require('./auditService');
const AcademicTerm = require('../js/utils/academic-term');

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute
const GRACE_PERIOD_MINUTES = 15;

let _reminderTimer = null;
let _isChecking = false;

/**
 * Derives current calendar date string (YYYY-MM-DD) in Asia/Manila timezone.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function getPhilippineDateString(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(d);
}

/**
 * Derives current weekday name ('Monday', 'Tuesday', etc.) in Asia/Manila timezone.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function getPhilippineDayOfWeek(d = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'long'
    }).format(d);
}

/**
 * Derives current time string ('HH:mm:ss') in Asia/Manila timezone.
 * @param {Date} [d=new Date()]
 * @returns {string}
 */
function getPhilippineTimeString(d = new Date()) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Manila',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);
}

/**
 * Normalizes a time string to 'HH:mm:ss'.
 * @param {string} t
 * @returns {string}
 */
function normalizeTime(t) {
    if (!t) return '00:00:00';
    const parts = String(t).trim().split(':');
    const h = (parts[0] || '0').padStart(2, '0');
    const m = (parts[1] || '0').padStart(2, '0');
    const s = (parts[2] || '0').padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * Calculates the exact scheduled end timestamp and reminder deadline.
 * Handles overnight schedules (where End_Time < Start_Time) by rolling over to next day.
 *
 * @param {string} occurrenceDate - 'YYYY-MM-DD'
 * @param {string} endTime - 'HH:mm:ss' or 'HH:mm'
 * @param {string} [startTime] - 'HH:mm:ss' or 'HH:mm'
 * @returns {{ scheduledEnd: Date, deadline: Date }}
 */
function calculateReminderDeadline(occurrenceDate, endTime, startTime = null) {
    const cleanEnd = normalizeTime(endTime);
    const cleanStart = startTime ? normalizeTime(startTime) : null;

    let targetDateStr = occurrenceDate;

    // Overnight schedule check: if End_Time is earlier than Start_Time, class ended the next day
    if (cleanStart && cleanEnd < cleanStart) {
        const baseDate = new Date(`${occurrenceDate}T12:00:00+08:00`);
        baseDate.setDate(baseDate.getDate() + 1);
        targetDateStr = getPhilippineDateString(baseDate);
    }

    const scheduledEnd = new Date(`${targetDateStr}T${cleanEnd}+08:00`);
    const deadline = new Date(scheduledEnd.getTime() + GRACE_PERIOD_MINUTES * 60 * 1000);

    return { scheduledEnd, deadline };
}

/**
 * Checks for overdue schedule keys and sends reminder emails.
 * Traps all errors to ensure the background interval never crashes the process.
 *
 * @param {object} [options={}]
 * @param {Date} [options.now] - Optional explicit Date for testing/simulation
 * @returns {Promise<{ checked: number, sent: number, skipped: number, errors: number }>}
 */
async function checkAndSendKeyReminders(options = {}) {
    if (_isChecking) {
        return { checked: 0, sent: 0, skipped: 0, errors: 0, message: 'Check already in progress' };
    }

    _isChecking = true;
    const now = options.now ? new Date(options.now) : new Date();
    const occurrenceDate = getPhilippineDateString(now);
    const dayOfWeek = getPhilippineDayOfWeek(now);

    // Derive active term from BulSU academic calendar rules (or test overrides)
    const basePhilippineDate = new Date(`${occurrenceDate}T12:00:00+08:00`);
    const activeTerm = (options.academicYear && options.semester)
        ? { academicYear: options.academicYear, semester: options.semester }
        : AcademicTerm.getActiveTerm(basePhilippineDate);

    let checked = 0;
    let sent = 0;
    let skipped = 0;
    let errors = 0;

    try {
        const [candidates] = await keyReminderRepository.findActiveScheduleKeyCandidates(
            dayOfWeek,
            activeTerm.academicYear,
            activeTerm.semester
        );

        for (const candidate of candidates) {
            checked++;

            // 1. Calculate schedule end time and 15-minute deadline
            const { scheduledEnd, deadline } = calculateReminderDeadline(
                occurrenceDate,
                candidate.End_Time,
                candidate.Start_Time
            );

            // 2. Strict timing rule: grace period is active when now < deadline
            // - If current time is strictly before deadline (< 10:15), grace period is active -> skip
            // - If current time is at or after deadline (>= 10:15), grace period ended -> evaluate custody and send reminder
            if (now.getTime() < deadline.getTime()) {
                skipped++;
                continue;
            }

            // 3. Custody timing check: ensure custody was not initiated AFTER the schedule ended
            // If key was withdrawn anew after the class ended (e.g. at 10:20 AM for a 7:00-10:00 class),
            // do not treat the earlier class deadline as an overdue event for this new borrowing.
            const latestWithdrawal = await keyReminderRepository.findLatestKeyWithdrawalTime(candidate.Room_ID, now);
            if (latestWithdrawal) {
                // Buffer of 60 seconds around scheduledEnd to allow clock variances
                if (latestWithdrawal.getTime() > scheduledEnd.getTime() + 60 * 1000) {
                    skipped++;
                    continue;
                }
            }

            // 4. Atomic Database Claim & Resilient Retry / Stale Recovery
            let reminderId = null;
            const existingReminder = await keyReminderRepository.findReminderByScheduleAndDate(
                candidate.Schedule_ID,
                occurrenceDate
            );

            if (!existingReminder) {
                // Fresh claim for this weekly occurrence
                const claimResult = await keyReminderRepository.claimScheduleReminder({
                    scheduleId: candidate.Schedule_ID,
                    occurrenceDate,
                    roomId: candidate.Room_ID,
                    recipientUserId: candidate.Current_User_ID,
                    scheduledUserId: candidate.Scheduled_User_ID,
                    attemptedAt: now
                });

                if (!claimResult.claimed) {
                    skipped++;
                    continue;
                }
                reminderId = claimResult.reminderId;
            } else {
                // Existing row: verify if eligible for safe retry or stale crash recovery
                if (existingReminder.Status === 'SENT' || existingReminder.Status === 'SKIPPED') {
                    skipped++;
                    continue;
                }

                if (existingReminder.Status === 'FAILED' || existingReminder.Status === 'CLAIMED') {
                    // Crash safety check: if email succeeded and was logged prior to process crash, mark SENT
                    const alreadyLoggedSuccess = await keyReminderRepository.hasSuccessfulAuditLog(
                        candidate.Schedule_ID,
                        occurrenceDate
                    );
                    if (alreadyLoggedSuccess) {
                        await keyReminderRepository.markReminderSent(existingReminder.Reminder_ID, now);
                        skipped++;
                        continue;
                    }

                    // Attempt atomic reclaim (max 3 retries, 3-min retry backoff, 5-min stale timeout)
                    const reclaimResult = await keyReminderRepository.reclaimFailedOrStaleReminder({
                        reminderId: existingReminder.Reminder_ID,
                        recipientUserId: candidate.Current_User_ID,
                        maxRetries: 3,
                        retryIntervalMinutes: 3,
                        staleTimeoutMinutes: 5,
                        now
                    });

                    if (!reclaimResult.reclaimed) {
                        skipped++;
                        continue;
                    }
                    reminderId = existingReminder.Reminder_ID;
                } else {
                    skipped++;
                    continue;
                }
            }

            // 5. Account safety: verify recipient email and active status
            const recipientEmail = candidate.Current_Holder_Email ? candidate.Current_Holder_Email.trim() : null;
            const isRecipientActive = candidate.Current_Holder_Status !== 'DEACTIVATED';

            if (!recipientEmail || !isRecipientActive) {
                console.warn(`[KeyReminder] Skipping reminder for Schedule ${candidate.Schedule_ID}: Recipient User ${candidate.Current_User_ID} has no valid email or is inactive.`);
                await keyReminderRepository.markReminderSkipped(reminderId, 'Recipient has no valid email or is inactive', now);

                await auditService.logSecurityEvent({
                    userId: candidate.Current_User_ID,
                    actorEmail: recipientEmail,
                    actorRole: candidate.Current_Holder_Role,
                    action: 'KEY_RETURN_REMINDER_SKIPPED',
                    resourceType: 'SCHEDULE',
                    resourceId: `${candidate.Schedule_ID}:${occurrenceDate}`,
                    details: {
                        roomId: candidate.Room_ID,
                        roomNumber: candidate.Room_Number,
                        scheduleId: candidate.Schedule_ID,
                        currentUserId: candidate.Current_User_ID,
                        reason: 'Missing email or inactive user'
                    },
                    result: 'WARNING'
                });

                skipped++;
                continue;
            }

            // 6. Build reminder details
            const reminderData = {
                recipientName: candidate.Current_Holder_Name || 'Faculty Member',
                roomNumber: candidate.Room_Number,
                building: candidate.Building || 'IT Building',
                subjectName: candidate.Subject_Name || 'Scheduled Class',
                section: candidate.Section || '',
                scheduledStartTime: candidate.Start_Time,
                scheduledEndTime: candidate.End_Time,
                reminderDeadline: deadline,
                scheduledFacultyName: candidate.Scheduled_Faculty_Name || '',
                keyStatus: candidate.Key_Status || 'Borrowed'
            };

            // 7. Dispatch reminder email
            let emailSent = false;
            try {
                emailSent = await emailService.sendKeyReturnReminderEmail(recipientEmail, reminderData);
            } catch (mailErr) {
                console.error(`[KeyReminder] Failed sending email to ${recipientEmail}:`, mailErr.message);
                emailSent = false;
            }

            // 8. Update claim status & audit trail
            if (emailSent) {
                await keyReminderRepository.markReminderSent(reminderId, now);

                await auditService.logSecurityEvent({
                    userId: candidate.Current_User_ID,
                    actorEmail: recipientEmail,
                    actorRole: candidate.Current_Holder_Role,
                    action: 'KEY_RETURN_REMINDER',
                    resourceType: 'SCHEDULE',
                    resourceId: `${candidate.Schedule_ID}:${occurrenceDate}`,
                    details: {
                        roomId: candidate.Room_ID,
                        roomNumber: candidate.Room_Number,
                        scheduleId: candidate.Schedule_ID,
                        scheduledUserId: candidate.Scheduled_User_ID,
                        scheduledFacultyName: candidate.Scheduled_Faculty_Name,
                        currentUserId: candidate.Current_User_ID,
                        currentHolderName: candidate.Current_Holder_Name,
                        currentHolderEmail: recipientEmail,
                        scheduledStartTime: candidate.Start_Time,
                        scheduledEndTime: candidate.End_Time,
                        reminderDeadline: deadline.toISOString(),
                        occurrenceDate
                    },
                    result: 'SUCCESS'
                });

                sent++;
                console.log(`[KeyReminder] Sent key return reminder for Room ${candidate.Room_Number} to ${candidate.Current_Holder_Name} (${recipientEmail}).`);
            } else {
                await keyReminderRepository.markReminderFailed(reminderId, 'Email transmission failed', now);

                await auditService.logSecurityEvent({
                    userId: candidate.Current_User_ID,
                    actorEmail: recipientEmail,
                    actorRole: candidate.Current_Holder_Role,
                    action: 'KEY_RETURN_REMINDER',
                    resourceType: 'SCHEDULE',
                    resourceId: `${candidate.Schedule_ID}:${occurrenceDate}`,
                    details: {
                        roomId: candidate.Room_ID,
                        roomNumber: candidate.Room_Number,
                        scheduleId: candidate.Schedule_ID,
                        currentUserId: candidate.Current_User_ID,
                        error: 'Email transmission failed'
                    },
                    result: 'FAILURE'
                });

                errors++;
            }
        }
    } catch (err) {
        console.error('[KeyReminder] Unexpected error during key reminder evaluation:', err.message);
        errors++;
    } finally {
        _isChecking = false;
    }

    return { checked, sent, skipped, errors };
}

/**
 * Initializes the automated recurring key return reminder worker.
 * Runs an initial startup pass and schedules recurring checks every minute.
 *
 * @param {number} [intervalMs=CHECK_INTERVAL_MS]
 */
function initKeyReturnReminderSchedule(intervalMs = CHECK_INTERVAL_MS) {
    if (_reminderTimer) {
        clearInterval(_reminderTimer);
        _reminderTimer = null;
    }

    console.log('[KeyReminder] Initializing Automatic Key Return Reminder service (15-min post-schedule rule).');

    // Run initial check asynchronously after server startup
    setImmediate(async () => {
        try {
            await checkAndSendKeyReminders();
        } catch (err) {
            console.error('[KeyReminder] Initial startup check non-fatal error:', err.message);
        }
    });

    // Schedule recurring interval
    _reminderTimer = setInterval(async () => {
        try {
            await checkAndSendKeyReminders();
        } catch (err) {
            console.error('[KeyReminder] Scheduled worker non-fatal error:', err.message);
        }
    }, intervalMs);

    // Prevent background timer from blocking graceful exit or unit tests
    if (_reminderTimer && typeof _reminderTimer.unref === 'function') {
        _reminderTimer.unref();
    }
}

/**
 * Stops the key reminder background schedule during server shutdown.
 */
function stopKeyReturnReminderSchedule() {
    if (_reminderTimer) {
        clearInterval(_reminderTimer);
        _reminderTimer = null;
        console.log('[KeyReminder] Automatic key return reminder scheduler stopped.');
    }
}

module.exports = {
    getPhilippineDateString,
    getPhilippineDayOfWeek,
    getPhilippineTimeString,
    calculateReminderDeadline,
    checkAndSendKeyReminders,
    initKeyReturnReminderSchedule,
    stopKeyReturnReminderSchedule,
    CHECK_INTERVAL_MS,
    GRACE_PERIOD_MINUTES
};
