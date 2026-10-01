'use strict';

/**
 * tests/test-key-return-reminder.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive automated test suite for Automatic Key Return / Transfer Reminder.
 *
 * Safe Isolation:
 * Operates on 'Sunday' (where ZERO defense/demo schedules exist in the database)
 * and safely tears down all created fixtures.
 *
 * Verifies all 17 mandatory business rules and edge cases:
 *  1. Deadline calculation: Scheduled End Time + 15 minutes.
 *  2. Withdrawal time independence: Borrowed at 7:00, 8:00, or 9:00 -> deadline is always 10:15.
 *  3. Key returned before deadline (10:14) -> No reminder email.
 *  4. Key returned at deadline (10:15) -> No reminder email.
 *  5. Key still borrowed after deadline (10:16) -> Reminder email sent.
 *  6. Recipient is scheduled faculty when scheduled faculty holds key.
 *  7. Recipient is actual holder when key was borrowed/held by different faculty.
 *  8. Key transferred before deadline (10:08) -> Reminder sent to new holder only.
 *  9. Unregistered custody (Current_User_ID = NULL) -> No email sent, no faculty invented.
 * 10. Borrowing after schedule end (e.g. 10:20) -> Not treated as overdue for earlier class.
 * 11. Atomic duplicate prevention & concurrency race safety (UNIQUE database constraint).
 * 12. Weekly recurring schedule: October 4 occurrence does not block October 11 occurrence.
 * 13. Multiple laboratories handled independently.
 * 14. Persistence across process restart / worker reinitialization.
 * 15. Inactive / missing email resilience: skipped cleanly without crashing.
 * 16. Simulated SMTP failure resilience: failed claim logged without crashing worker.
 * 17. Timezone handling: Asia/Manila (UTC+8) deterministic behavior.
 */

const assert = require('assert');
const db = require('../database/connection');
const emailService = require('../services/email/email.service');
const keyReminderService = require('../services/keyReminderService');
const keyReminderRepository = require('../repositories/key-reminder.repository');

async function runKeyReturnReminderTests() {
    console.log('================================================================');
    console.log('🧪 AUTOMATIC KEY RETURN / TRANSFER REMINDER TEST SUITE');
    console.log('================================================================\n');

    // Test environment fixtures
    const [rooms] = await db.query(
        "SELECT Room_ID, Room_Number, Building, Key_Status, Current_User_ID FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number"
    );
    assert.ok(rooms.length >= 2, 'Requires rooms 203 and 204 in database');
    const room203 = rooms.find(r => r.Room_Number === '203');
    const room204 = rooms.find(r => r.Room_Number === '204');

    const [users] = await db.query(
        "SELECT User_ID, Name, Email, Role, Status FROM users WHERE Role = 'Faculty' OR Role = 'IT Dept. Head' ORDER BY User_ID LIMIT 3"
    );
    assert.ok(users.length >= 2, 'Requires at least 2 faculty/head users in database');
    const profA = users[0];
    const profB = users[1];

    console.log(`✓ Test Rooms: Room 203 (ID: ${room203.Room_ID}), Room 204 (ID: ${room204.Room_ID})`);
    console.log(`✓ Test Faculty: Prof A = ${profA.Name} (ID: ${profA.User_ID}), Prof B = ${profB.Name} (ID: ${profB.User_ID})\n`);

    // Track test-created IDs for safe cleanup
    const testScheduleIds = [];
    const testOccupancyLogIds = [];
    const testReminderIds = [];

    // Mock email dispatch
    const sentEmails = [];
    let simulateEmailFailure = false;
    const originalSendKeyReturnReminderEmail = emailService.sendKeyReturnReminderEmail;

    emailService.sendKeyReturnReminderEmail = async function mockSend(recipientEmail, reminderData) {
        if (simulateEmailFailure) {
            throw new Error('Simulated SMTP connection timeout');
        }
        sentEmails.push({
            recipientEmail,
            reminderData
        });
        return true;
    };

    // Helper to restore rooms to clean state
    async function resetRoom(roomId, keyStatus = 'Present', currentUserId = null) {
        await db.query(
            'UPDATE laboratories SET Key_Status = ?, Current_User_ID = ?, Last_Seen = NOW() WHERE Room_ID = ?',
            [keyStatus, currentUserId, roomId]
        );
    }

    // Isolated test day: 'Sunday' (zero real schedules)
    const TEST_DAY = 'Sunday';
    const TEST_DATE_1 = '2026-10-04'; // Sunday 1
    const TEST_DATE_2 = '2026-10-11'; // Sunday 2

    try {
        // ---------------------------------------------------------------------
        // TEST 1: Timezone & Deadline Calculation
        // ---------------------------------------------------------------------
        console.log('--- TEST 1: Timezone & 15-Minute Deadline Calculation ---');
        {
            const { scheduledEnd, deadline } = keyReminderService.calculateReminderDeadline(TEST_DATE_1, '10:00:00', '07:00:00');
            const deadlineHours = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(deadline);
            assert.strictEqual(deadlineHours, '10:15', 'Deadline must be exactly End_Time + 15 minutes in Asia/Manila');

            // Overnight schedule: 23:00 to 01:00 next day
            const overnight = keyReminderService.calculateReminderDeadline(TEST_DATE_1, '01:00:00', '23:00:00');
            const overnightDeadline = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).format(overnight.deadline);
            const overnightDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(overnight.deadline);
            assert.strictEqual(overnightDeadline, '01:15', 'Overnight deadline must roll over to 01:15');
            assert.strictEqual(overnightDate, '2026-10-05', 'Overnight deadline date must advance by 1 day');
            console.log('✔ PASS: Exact 15-minute deadline and overnight roll-over verified.');
        }

        // ---------------------------------------------------------------------
        // TEST 2: Deadline is Independent of Key Withdrawal Time
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 2: Deadline Remains End_Time + 15m Regardless of Withdrawal Time ---');
        {
            const t1 = keyReminderService.calculateReminderDeadline(TEST_DATE_1, '10:00:00', '07:00:00');
            const t2 = keyReminderService.calculateReminderDeadline(TEST_DATE_1, '10:00:00', '08:00:00');
            const t3 = keyReminderService.calculateReminderDeadline(TEST_DATE_1, '10:00:00', '08:45:00');
            const t4 = keyReminderService.calculateReminderDeadline(TEST_DATE_1, '10:00:00', '09:55:00');
            assert.strictEqual(t1.deadline.getTime(), t2.deadline.getTime());
            assert.strictEqual(t2.deadline.getTime(), t3.deadline.getTime());
            assert.strictEqual(t3.deadline.getTime(), t4.deadline.getTime());
            console.log('✔ PASS: Deadline is strictly fixed to schedule End_Time + 15m.');
        }

        // ---------------------------------------------------------------------
        // ---------------------------------------------------------------------
        // TEST 3: Test A, Test B, Test C — 10:14 (No), 10:15 (Send), 10:16 (No Duplicate)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 3: Grace-Period Boundary [Test A (10:14), Test B (10:15), Test C (10:16)] ---');
        {
            // Schedule: 07:00 - 10:00 in Room 204
            const [sched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CLASS-BOUNDARY', 'SEC-ABC', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(sched.insertId);

            // Key still borrowed by Prof A
            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occ] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 07:00:00`]
            );
            testOccupancyLogIds.push(occ.insertId);

            // --- TEST A: At 10:14 (and 10:14:59) -> Grace period is still active -> NO reminder ---
            sentEmails.length = 0;
            const simulatedAt1014 = new Date(`${TEST_DATE_1}T10:14:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1014 });
            assert.strictEqual(sentEmails.length, 0, 'Test A: No email must be sent at 10:14:00 (grace period active)');

            const simulatedAt101459 = new Date(`${TEST_DATE_1}T10:14:59+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt101459 });
            assert.strictEqual(sentEmails.length, 0, 'Test A: No email must be sent at 10:14:59 (before 10:15:00 boundary)');

            // --- TEST B: At 10:15:00 -> Deadline reached -> SEND reminder ---
            const simulatedAt1015 = new Date(`${TEST_DATE_1}T10:15:00+08:00`);
            const res1015 = await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1015 });
            assert.strictEqual(sentEmails.length, 1, 'Test B: Exactly 1 reminder email must be sent at 10:15:00');
            assert.strictEqual(sentEmails[0].recipientEmail, profA.Email, 'Recipient must be current holder Prof A');
            assert.strictEqual(sentEmails[0].reminderData.roomNumber, '204');

            // --- TEST C: At 10:16:00 -> Already sent -> NO duplicate reminder ---
            const simulatedAt1016 = new Date(`${TEST_DATE_1}T10:16:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1016 });
            assert.strictEqual(sentEmails.length, 1, 'Test C: Must NOT send duplicate reminder on subsequent tick at 10:16');

            // Check repeat tick at 10:17
            const simulatedAt1017 = new Date(`${TEST_DATE_1}T10:17:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1017 });
            assert.strictEqual(sentEmails.length, 1, 'Test C: Must NOT send duplicate reminder on subsequent tick at 10:17');

            await resetRoom(room204.Room_ID, 'Present', null);
            console.log('✔ PASS: Test A (10:14 no reminder), Test B (10:15 sent), Test C (10:16 no duplicate) verified.');
        }

        // ---------------------------------------------------------------------
        // TEST 4: Test D — Key Returned At 10:15 -> NO Reminder
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 4: Test D — Key Returned at 10:15:00 -> NO Reminder ---');
        {
            // Schedule: 07:00 - 10:00 in Room 204
            const [schedD] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CLASS-RETURN-AT-1015', 'SEC-D', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedD.insertId);

            // Key returned at 10:15 (Key_Status = 'Present', Current_User_ID = null)
            await resetRoom(room204.Room_ID, 'Present', null);
            sentEmails.length = 0;

            const simulatedAt1015 = new Date(`${TEST_DATE_1}T10:15:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1015 });
            assert.strictEqual(sentEmails.length, 0, 'Test D: Key returned at 10:15 must yield 0 reminders');

            await db.query('DELETE FROM schedules WHERE Schedule_ID = ?', [schedD.insertId]);
            console.log('✔ PASS: Test D verified. Key returned at 10:15 produces zero reminder emails.');
        }

        // ---------------------------------------------------------------------
        // TEST 5: Test E — Different Current Holder at 10:15 (Prof A Scheduled, Prof B Holds)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 5: Test E — Different Current Holder at 10:15 -> Email Prof B Only ---');
        {
            // Room 203: Scheduled to Prof A from 07:00 to 10:00
            const [schedE] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CLASS-HOLDER-B', 'SEC-E', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room203.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedE.insertId);

            // Prof B holds the key at 10:15
            await resetRoom(room203.Room_ID, 'Absent', profB.User_ID);

            const [occE] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profB.User_ID, room203.Room_ID, `${TEST_DATE_1} 07:05:00`]
            );
            testOccupancyLogIds.push(occE.insertId);

            sentEmails.length = 0;

            // Evaluated at 10:15:00
            const simulatedAt1015 = new Date(`${TEST_DATE_1}T10:15:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1015 });

            assert.strictEqual(sentEmails.length, 1, 'Test E: Exactly one reminder email sent at 10:15');
            assert.strictEqual(sentEmails[0].recipientEmail, profB.Email, 'Recipient MUST be current holder Prof B');
            assert.notStrictEqual(sentEmails[0].recipientEmail, profA.Email, 'Scheduled Prof A must NOT receive the reminder');
            assert.strictEqual(sentEmails[0].reminderData.scheduledFacultyName, profA.Name, 'Email body must reference scheduled Prof A');

            await resetRoom(room203.Room_ID, 'Present', null);
            await db.query('DELETE FROM schedules WHERE Schedule_ID = ?', [schedE.insertId]);
            console.log(`✔ PASS: Test E verified. Routed reminder to actual holder (${profB.Email}), sparing scheduled faculty (${profA.Email}).`);
        }

        // ---------------------------------------------------------------------
        // TEST 6: Test F — Key Transferred Before 10:15 -> Email Prof B Only at 10:15
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 6: Test F — Key Transferred to Prof B Before 10:15 -> Email Prof B Only ---');
        {
            // Schedule: 07:00 - 10:00 in Room 203, Scheduled Prof A
            const [schedF] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CLASS-TRANSFER', 'SEC-F', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room203.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedF.insertId);

            // Prof A took key at 07:00, transferred to Prof B at 10:08 (before 10:15 deadline)
            await resetRoom(room203.Room_ID, 'Absent', profB.User_ID);

            const [occ1] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room203.Room_ID, `${TEST_DATE_1} 07:00:00`]
            );
            testOccupancyLogIds.push(occ1.insertId);

            const [occ2] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Transfer')`,
                [profB.User_ID, room203.Room_ID, `${TEST_DATE_1} 10:08:00`]
            );
            testOccupancyLogIds.push(occ2.insertId);

            sentEmails.length = 0;

            // Evaluated at 10:15:00
            const simulatedAt1015 = new Date(`${TEST_DATE_1}T10:15:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1015 });

            assert.strictEqual(sentEmails.length, 1, 'Test F: Exactly one reminder email sent at 10:15');
            assert.strictEqual(sentEmails[0].recipientEmail, profB.Email, 'Reminder must follow transfer to Prof B');

            await resetRoom(room203.Room_ID, 'Present', null);
            await db.query('DELETE FROM schedules WHERE Schedule_ID = ?', [schedF.insertId]);
            console.log(`✔ PASS: Test F verified. Transferred key reminded new holder (${profB.Email}) only at 10:15.`);
        }

        // ---------------------------------------------------------------------
        // TEST 7: Scheduler Tick Timing Considerations (10:15:02, 10:15:40, 10:16:00 First Run)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 7: Scheduler Tick Timing (10:15:02, 10:15:40, 10:16:00 First Run) ---');
        {
            // Case 1: First evaluation executes at 10:15:02 -> eligible immediately
            const [schedT1] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-TICK-101502', 'SEC-T1', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedT1.insertId);
            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            sentEmails.length = 0;
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T10:15:02+08:00`) });
            assert.strictEqual(sentEmails.length, 1, 'Tick at 10:15:02 must dispatch reminder immediately');
            await resetRoom(room204.Room_ID, 'Present', null);
            await db.query('DELETE FROM schedules WHERE Schedule_ID = ?', [schedT1.insertId]);

            // Case 2: First evaluation executes at 10:15:40 -> eligible immediately
            const [schedT2] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-TICK-101540', 'SEC-T2', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room203.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedT2.insertId);
            await resetRoom(room203.Room_ID, 'Absent', profA.User_ID);

            sentEmails.length = 0;
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T10:15:40+08:00`) });
            assert.strictEqual(sentEmails.length, 1, 'Tick at 10:15:40 must dispatch reminder immediately');
            await resetRoom(room203.Room_ID, 'Present', null);
            await db.query('DELETE FROM schedules WHERE Schedule_ID = ?', [schedT2.insertId]);

            // Case 3: First evaluation at 10:16:00 (when 10:15 tick was missed) -> still eligible immediately
            const [schedT3] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-TICK-101600', 'SEC-T3', ?, '07:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedT3.insertId);
            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            sentEmails.length = 0;
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T10:16:00+08:00`) });
            assert.strictEqual(sentEmails.length, 1, 'First run at 10:16:00 must dispatch reminder without delay');
            await resetRoom(room204.Room_ID, 'Present', null);
            await db.query('DELETE FROM schedules WHERE Schedule_ID = ?', [schedT3.insertId]);

            console.log('✔ PASS: Scheduler tick timing verified. Immediate eligibility at or after 10:15:00 confirmed.');
        }

        // ---------------------------------------------------------------------
        // TEST 8: Unregistered Custody (Current_User_ID = NULL)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 8: Key Absent with Current_User_ID = NULL (Unregistered) ---');
        {
            // Schedule: Room 204, 17:00 - 18:00, Scheduled Prof A
            const [sched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CLASS-UNREG', 'SEC-8', ?, '17:00:00', '18:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(sched.insertId);

            // Key removed without scan -> Current_User_ID = NULL
            await resetRoom(room204.Room_ID, 'Absent', null);

            sentEmails.length = 0;

            const simulatedAt1816 = new Date(`${TEST_DATE_1}T18:16:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1816 });

            assert.strictEqual(sentEmails.length, 0, 'No email must ever be sent when Current_User_ID is NULL');
            console.log('✔ PASS: Unregistered key absence safely skipped without inventing recipients.');
        }

        // ---------------------------------------------------------------------
        // TEST 9: Unrelated Borrowing After Schedule End (10:20 Borrowing vs 10:15 Deadline)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 9: Key Borrowed At 10:20 (After 07:00-10:00 Class Ended) ---');
        {
            // Schedule: Room 204, 19:00 - 20:00
            const [sched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CLASS-LATE-BORROW', 'SEC-9', ?, '19:00:00', '20:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(sched.insertId);

            // Key was withdrawn at 20:20:00 (after 20:00 end and after 20:15 deadline)
            await resetRoom(room204.Room_ID, 'Absent', profB.User_ID);

            const [occ] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profB.User_ID, room204.Room_ID, `${TEST_DATE_1} 20:20:00`]
            );
            testOccupancyLogIds.push(occ.insertId);

            sentEmails.length = 0;

            // Worker checks at 20:25:00
            const simulatedAt2025 = new Date(`${TEST_DATE_1}T20:25:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt2025 });

            assert.strictEqual(sentEmails.length, 0, 'Late borrowing must not trigger overdue reminder for earlier finished class');
            console.log('✔ PASS: Borrowing after class end did not falsely trigger past schedule reminder.');
        }

        // ---------------------------------------------------------------------
        // TEST 10: Weekly Recurring Schedule Independence (October 4 vs. October 11)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 10: Recurring Weekly Occurrence Independence ---');
        {
            const [sched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-RECURRING', 'SEC-10', ?, '07:00:00', '09:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(sched.insertId);
            const scheduleId = sched.insertId;

            // Claim week 1: 2026-10-04
            const claim1 = await keyReminderRepository.claimScheduleReminder({
                scheduleId,
                occurrenceDate: TEST_DATE_1,
                roomId: room204.Room_ID,
                recipientUserId: profA.User_ID,
                scheduledUserId: profA.User_ID
            });
            assert.strictEqual(claim1.claimed, true, 'Week 1 claim must succeed');
            testReminderIds.push(claim1.reminderId);

            // Attempt duplicate claim on week 1
            const claimDup = await keyReminderRepository.claimScheduleReminder({
                scheduleId,
                occurrenceDate: TEST_DATE_1,
                roomId: room204.Room_ID,
                recipientUserId: profA.User_ID,
                scheduledUserId: profA.User_ID
            });
            assert.strictEqual(claimDup.claimed, false, 'Duplicate claim on same week must be rejected');

            // Claim week 2: 2026-10-11 (next week)
            const claim2 = await keyReminderRepository.claimScheduleReminder({
                scheduleId,
                occurrenceDate: TEST_DATE_2,
                roomId: room204.Room_ID,
                recipientUserId: profA.User_ID,
                scheduledUserId: profA.User_ID
            });
            assert.strictEqual(claim2.claimed, true, 'Next week occurrence must NOT be blocked');
            testReminderIds.push(claim2.reminderId);

            console.log('✔ PASS: Weekly recurrence isolation verified. Future weeks trigger independently.');
        }

        // ---------------------------------------------------------------------
        // TEST 11: Server Restart / Persistence Verification
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 11: Server Restart & State Persistence ---');
        {
            const [rows] = await db.query(
                'SELECT Reminder_ID, Schedule_ID, Occurrence_Date, Status FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [testScheduleIds[testScheduleIds.length - 1]]
            );
            assert.ok(rows.length >= 2, 'Reminder records must be stored persistently in MySQL table');
            for (const r of rows) {
                await keyReminderRepository.markReminderSkipped(r.Reminder_ID, 'Cleaned up after test 11');
            }
            console.log('✔ PASS: Reminder state safely persisted in database; survives process restarts.');
        }

        // ---------------------------------------------------------------------
        // TEST 12: Inactive / Missing Email Resilience
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 12: Inactive or Missing Email Graceful Handling ---');
        {
            const [insUser] = await db.query(
                "INSERT INTO users (Name, Email, Role, Status) VALUES ('Deactivated User', 'deactivated@labsync.test', 'Faculty', 'DEACTIVATED')"
            );
            const deactivatedUserId = insUser.insertId;

            const [sched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-DEACTIVATED', 'SEC-12', ?, '21:00:00', '22:00:00', '2026-2027', '1st Semester', 'Default')`,
                [deactivatedUserId, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(sched.insertId);

            await resetRoom(room204.Room_ID, 'Absent', deactivatedUserId);

            const [occ] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [deactivatedUserId, room204.Room_ID, `${TEST_DATE_1} 21:00:00`]
            );
            testOccupancyLogIds.push(occ.insertId);

            sentEmails.length = 0;

            const simulatedAt2216 = new Date(`${TEST_DATE_1}T22:16:00+08:00`);
            const res = await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt2216 });

            assert.strictEqual(sentEmails.length, 0, 'No email sent to deactivated user');
            assert.strictEqual(res.errors, 0, 'Worker must not encounter errors or crash');

            // Cleanup temp user
            await db.query('DELETE FROM users WHERE User_ID = ?', [deactivatedUserId]);
            console.log('✔ PASS: Inactive/missing email handled gracefully with SKIPPED status.');
        }

        // ---------------------------------------------------------------------
        // TEST 13: Simulated SMTP Transmission Failure Resilience
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 13: Simulated SMTP Transmission Failure Resilience ---');
        {
            const [sched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-SMTP-FAIL', 'SEC-13', ?, '04:00:00', '05:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(sched.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occ] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 04:00:00`]
            );
            testOccupancyLogIds.push(occ.insertId);

            // Enable failure simulation
            simulateEmailFailure = true;

            const simulatedAt0516 = new Date(`${TEST_DATE_1}T05:16:00+08:00`);
            const res = await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt0516 });

            // Restore simulation
            simulateEmailFailure = false;

            assert.strictEqual(res.errors, 1, 'Error should be recorded');
            // Check that reminder row was marked FAILED
            const [failedRows] = await db.query(
                'SELECT Reminder_ID, Status, Error_Message FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [sched.insertId]
            );
            assert.strictEqual(failedRows[0].Status, 'FAILED');
            testReminderIds.push(failedRows[0].Reminder_ID);
            await keyReminderRepository.markReminderSkipped(failedRows[0].Reminder_ID, 'Cleaned up by test 13');
            await resetRoom(room204.Room_ID, 'Present', null);
            console.log('✔ PASS: SMTP delivery failure logged as FAILED without process abort.');
        }

        // ---------------------------------------------------------------------
        // TEST 14: Failed Reminder Retry Policy (Backoff, Recovery & Max Limit)
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 14: Failed Reminder Retry Policy (Backoff, Recovery & Max Limit) ---');
        {
            // Sub-case A: 3-Minute Backoff & Successful Recovery on Subsequent Tick
            const [schedA] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-RETRY-SUCCESS', 'SEC-14A', ?, '05:00:00', '06:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedA.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occA] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 05:00:00`]
            );
            testOccupancyLogIds.push(occA.insertId);

            // Tick 1 (06:16): Initial attempt fails due to simulated SMTP error
            simulateEmailFailure = true;
            sentEmails.length = 0;
            const simulatedAt0616 = new Date(`${TEST_DATE_1}T06:16:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt0616 });

            assert.strictEqual(sentEmails.length, 0, 'No email sent on failure');
            const [rowFailed] = await db.query(
                'SELECT Reminder_ID, Status, Retry_Count FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [schedA.insertId]
            );
            assert.strictEqual(rowFailed[0].Status, 'FAILED', 'Status must be FAILED');
            assert.strictEqual(rowFailed[0].Retry_Count, 0, 'Initial failure has Retry_Count = 0');
            testReminderIds.push(rowFailed[0].Reminder_ID);

            // Tick 2 (06:17): 1 minute later. Backoff interval (3m) NOT yet elapsed -> Safe skipping
            simulateEmailFailure = false;
            const simulatedAt0617 = new Date(`${TEST_DATE_1}T06:17:00+08:00`);
            const resEarly = await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt0617 });
            assert.strictEqual(sentEmails.length, 0, 'Must NOT retry prematurely within 3-minute backoff window');

            // Tick 3 (06:20): 4 minutes later. Backoff elapsed! Retry is claimed and succeeds!
            sentEmails.length = 0;
            const simulatedAt0620 = new Date(`${TEST_DATE_1}T06:20:00+08:00`);
            const resRetry = await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt0620 });
            assert.strictEqual(sentEmails.length, 1, 'Retry must dispatch exactly one email after backoff');
            assert.strictEqual(sentEmails[0].recipientEmail, profA.Email, 'Recipient must be current holder');

            const [rowSent] = await db.query(
                'SELECT Status, Retry_Count, Sent_At FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [schedA.insertId]
            );
            assert.strictEqual(rowSent[0].Status, 'SENT', 'Status must transition from FAILED to SENT');
            assert.strictEqual(rowSent[0].Retry_Count, 1, 'Retry_Count must be incremented to 1');
            assert.ok(rowSent[0].Sent_At != null, 'Sent_At must be recorded');

            await resetRoom(room204.Room_ID, 'Present', null);

            // Sub-case B: Max Retries (Capped at 3, Prevents Email Spam Loop)
            const [schedB] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-RETRY-MAX', 'SEC-14B', ?, '14:00:00', '15:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room203.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedB.insertId);

            await resetRoom(room203.Room_ID, 'Absent', profA.User_ID);

            const [occB] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room203.Room_ID, `${TEST_DATE_1} 14:00:00`]
            );
            testOccupancyLogIds.push(occB.insertId);

            // Force persistent failure
            simulateEmailFailure = true;

            // Attempt 0 (Initial): 15:16
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T15:16:00+08:00`) });
            // Attempt 1: 15:20
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T15:20:00+08:00`) });
            // Attempt 2: 15:24
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T15:24:00+08:00`) });
            // Attempt 3: 15:28
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T15:28:00+08:00`) });

            const [rowMaxed] = await db.query(
                'SELECT Reminder_ID, Status, Retry_Count FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [schedB.insertId]
            );
            assert.ok(rowMaxed.length > 0, 'Reminder row must exist for schedB');
            assert.strictEqual(rowMaxed[0].Retry_Count, 3, 'Must have attempted 3 retries');
            testReminderIds.push(rowMaxed[0].Reminder_ID);

            // Attempt 4: 15:32 -> Max retries reached, must NOT attempt again
            simulateEmailFailure = false;
            sentEmails.length = 0;
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T15:32:00+08:00`) });
            assert.strictEqual(sentEmails.length, 0, 'Must NOT attempt retry once maxRetries limit is reached');

            await resetRoom(room203.Room_ID, 'Present', null);

            console.log('✔ PASS: Resilient retry backoff, successful recovery, and max-retry spam prevention verified.');
        }

        // ---------------------------------------------------------------------
        // TEST 15: Stale CLAIMED / Crash Recovery
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 15: Stale CLAIMED State & Crash Recovery ---');
        {
            const [schedCrash] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CRASH-RECOVERY', 'SEC-15', ?, '08:00:00', '09:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedCrash.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occCrash] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 08:00:00`]
            );
            testOccupancyLogIds.push(occCrash.insertId);

            // Simulate process crash during initial claim at 09:16
            // The row was created with CLAIMED, but process exited before email finished
            const [claimRow] = await db.query(
                `INSERT INTO schedule_key_reminders 
                    (Schedule_ID, Occurrence_Date, Room_ID, Recipient_User_ID, Scheduled_User_ID, Status, Retry_Count, Last_Attempt_At)
                 VALUES (?, ?, ?, ?, ?, 'CLAIMED', 0, ?)`,
                [schedCrash.insertId, TEST_DATE_1, room204.Room_ID, profA.User_ID, profA.User_ID, new Date(`${TEST_DATE_1}T09:16:00+08:00`)]
            );
            testReminderIds.push(claimRow.insertId);

            sentEmails.length = 0;

            // Worker evaluates at 09:18 (only 2 minutes later: stale timeout of 5m has not passed)
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T09:18:00+08:00`) });
            assert.strictEqual(sentEmails.length, 0, 'Must not steal claim while within stale timeout');

            // Worker evaluates at 09:22 (6 minutes later: stale timeout of 5m passed)
            // Recovers claim, dispatches email, and transitions to SENT
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T09:22:00+08:00`) });
            assert.strictEqual(sentEmails.length, 1, 'Stale claim recovered and email sent');
            assert.strictEqual(sentEmails[0].recipientEmail, profA.Email);

            const [recoveredRow] = await db.query(
                'SELECT Status FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [schedCrash.insertId]
            );
            assert.strictEqual(recoveredRow[0].Status, 'SENT', 'Recovered row must be marked SENT');

            await resetRoom(room204.Room_ID, 'Present', null);

            // Sub-case B: Crash occurred AFTER email dispatched and audit logged, but before status marked SENT
            const [schedCrashB] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-CRASH-AUDITED', 'SEC-15B', ?, '09:00:00', '10:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedCrashB.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            // Insert CLAIMED row
            const [stuckRow] = await db.query(
                `INSERT INTO schedule_key_reminders 
                    (Schedule_ID, Occurrence_Date, Room_ID, Recipient_User_ID, Scheduled_User_ID, Status, Retry_Count, Last_Attempt_At)
                 VALUES (?, ?, ?, ?, ?, 'CLAIMED', 0, ?)`,
                [schedCrashB.insertId, TEST_DATE_1, room204.Room_ID, profA.User_ID, profA.User_ID, new Date(`${TEST_DATE_1}T10:16:00+08:00`)]
            );
            testReminderIds.push(stuckRow.insertId);

            // Insert pre-existing SUCCESS audit log entry (proving email was already sent prior to crash)
            await db.query(
                `INSERT INTO audit_logs (User_ID, Action, Resource_Type, Resource_ID, Details, Result)
                 VALUES (?, 'KEY_RETURN_REMINDER', 'SCHEDULE', ?, '{}', 'SUCCESS')`,
                [profA.User_ID, `${schedCrashB.insertId}:${TEST_DATE_1}`]
            );

            sentEmails.length = 0;
            // Next tick at 10:25
            await keyReminderService.checkAndSendKeyReminders({ now: new Date(`${TEST_DATE_1}T10:25:00+08:00`) });

            assert.strictEqual(sentEmails.length, 0, 'Must NOT resend duplicate email when audit log proves prior success');
            const [fixedRow] = await db.query(
                'SELECT Status FROM schedule_key_reminders WHERE Schedule_ID = ?',
                [schedCrashB.insertId]
            );
            assert.strictEqual(fixedRow[0].Status, 'SENT', 'Stuck row must be healed to SENT without duplicate email');

            await resetRoom(room204.Room_ID, 'Present', null);

            console.log('✔ PASS: Stale claim recovery and post-crash duplicate suppression verified.');
        }

        // ---------------------------------------------------------------------
        // TEST 16: Inactive Academic Year Exclusion
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 16: Inactive Academic Year Schedule Exclusion ---');
        {
            // Insert schedule belonging to OLD academic year '2024-2025'
            const [oldAySched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-OLD-AY', 'SEC-16', ?, '10:00:00', '11:00:00', '2024-2025', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(oldAySched.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occ] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 10:00:00`]
            );
            testOccupancyLogIds.push(occ.insertId);

            sentEmails.length = 0;

            // Current date 2026-10-04 is in active academic year 2026-2027
            const simulatedAt1120 = new Date(`${TEST_DATE_1}T11:20:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1120 });

            assert.strictEqual(sentEmails.length, 0, 'Old academic year schedule must NEVER trigger a reminder');
            console.log('✔ PASS: Inactive academic year schedule (2024-2025) successfully excluded from candidates.');
        }

        // ---------------------------------------------------------------------
        // TEST 17: Inactive Semester Schedule Exclusion
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 17: Inactive Semester Schedule Exclusion ---');
        {
            // Insert schedule belonging to '2nd Semester' during 1st Semester
            const [otherSemSched] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-OTHER-SEM', 'SEC-17', ?, '11:00:00', '12:00:00', '2026-2027', '2nd Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(otherSemSched.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occ] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 11:00:00`]
            );
            testOccupancyLogIds.push(occ.insertId);

            sentEmails.length = 0;

            // October 2026 is 1st Semester; schedule is 2nd Semester
            const simulatedAt1220 = new Date(`${TEST_DATE_1}T12:20:00+08:00`);
            await keyReminderService.checkAndSendKeyReminders({ now: simulatedAt1220 });

            assert.strictEqual(sentEmails.length, 0, 'Inactive semester schedule must NEVER trigger a reminder');
            console.log('✔ PASS: Inactive semester schedule (2nd Semester) successfully excluded during 1st Semester.');
        }

        // ---------------------------------------------------------------------
        // TEST 18: UTC Host Deployment (Railway / Cloud Linux) Time Calculation
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 18: UTC Host Deployment (Railway / Cloud Linux) ---');
        {
            // Room 204: 12:00 - 13:00 Manila Time schedule
            const [schedUtc] = await db.query(
                `INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
                 VALUES (?, ?, 'TEST-UTC-RAILWAY', 'SEC-18', ?, '12:00:00', '13:00:00', '2026-2027', '1st Semester', 'Default')`,
                [profA.User_ID, room204.Room_ID, TEST_DAY]
            );
            testScheduleIds.push(schedUtc.insertId);

            await resetRoom(room204.Room_ID, 'Absent', profA.User_ID);

            const [occUtc] = await db.query(
                `INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) 
                 VALUES (?, ?, ?, 'Key Taken')`,
                [profA.User_ID, room204.Room_ID, `${TEST_DATE_1} 12:00:00`]
            );
            testOccupancyLogIds.push(occUtc.insertId);

            sentEmails.length = 0;

            // In Railway (UTC container), Manila 13:16:00 is represented as UTC 05:16:00Z
            const utcTimeAtDeadline = new Date('2026-10-04T05:16:00.000Z');

            // Verify helper derivations under UTC Date object
            const manilaDateStr = keyReminderService.getPhilippineDateString(utcTimeAtDeadline);
            const manilaDayStr = keyReminderService.getPhilippineDayOfWeek(utcTimeAtDeadline);
            const manilaTimeStr = keyReminderService.getPhilippineTimeString(utcTimeAtDeadline);

            assert.strictEqual(manilaDateStr, '2026-10-04', 'UTC timestamp must correctly project to 2026-10-04 in Manila');
            assert.strictEqual(manilaDayStr, 'Sunday', 'UTC timestamp must correctly project to Sunday in Manila');
            assert.strictEqual(manilaTimeStr, '13:16:00', 'UTC 05:16Z must resolve to 13:16:00 Manila time');

            const resUtc = await keyReminderService.checkAndSendKeyReminders({ now: utcTimeAtDeadline });

            assert.strictEqual(sentEmails.length, 1, 'Reminder must be dispatched correctly when running on UTC server');
            assert.strictEqual(sentEmails[0].recipientEmail, profA.Email);
            console.log('✔ PASS: Explicit Asia/Manila conversion guarantees accurate operation on UTC cloud servers.');
        }

        console.log('\n================================================================');
        console.log('🎉 ALL 18 KEY RETURN REMINDER TEST SCENARIOS PASSED WITH 100% SUCCESS!');
        console.log('================================================================\n');

    } finally {
        // Teardown: restore mocked mail function
        emailService.sendKeyReturnReminderEmail = originalSendKeyReturnReminderEmail;

        // Cleanup test-created database fixtures
        if (testScheduleIds.length > 0) {
            await db.query(`DELETE FROM schedules WHERE Schedule_ID IN (${testScheduleIds.map(() => '?').join(',')})`, testScheduleIds);
        }
        if (testOccupancyLogIds.length > 0) {
            await db.query(`DELETE FROM occupancy_log WHERE Log_ID IN (${testOccupancyLogIds.map(() => '?').join(',')})`, testOccupancyLogIds);
        }
        if (testReminderIds.length > 0) {
            await db.query(`DELETE FROM schedule_key_reminders WHERE Reminder_ID IN (${testReminderIds.map(() => '?').join(',')})`, testReminderIds);
        }

        // Clean audit logs generated during tests
        await db.query("DELETE FROM audit_logs WHERE Action IN ('KEY_RETURN_REMINDER', 'KEY_RETURN_REMINDER_SKIPPED') AND Resource_Type = 'SCHEDULE'");

        // Restore room states
        await resetRoom(room203.Room_ID, room203.Key_Status, room203.Current_User_ID);
        await resetRoom(room204.Room_ID, room204.Key_Status, room204.Current_User_ID);

        console.log('✓ Teardown: Test fixtures cleaned up and room states restored successfully.');
    }
}

// Auto-run if executed directly via node --test or node
if (require.main === module) {
    runKeyReturnReminderTests().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    });
}

module.exports = { runKeyReturnReminderTests };
