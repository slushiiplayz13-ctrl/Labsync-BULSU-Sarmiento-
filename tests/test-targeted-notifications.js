'use strict';

/**
 * tests/test-targeted-notifications.js
 * Comprehensive unit & integration tests for Targeted Key Activity Notifications.
 * 
 * Verifies exact 11 business rules:
 * 1. Faculty assigned to Room 204 but NO schedule at event time -> NO routine key notification
 * 2. Faculty has a schedule in Room 204 at event time -> YES
 * 3. Faculty has a schedule in Room 204 but event is before class -> NO
 * 4. Faculty has a schedule in Room 204 but event is after class -> NO
 * 5. Faculty has a schedule in Room 204 but event occurs in Room 203 -> NO
 * 6. Another faculty has the active schedule for Room 204 -> first faculty receives NO notification
 * 7. Two faculty members have different schedules in Room 204 -> only the faculty whose schedule is active at that exact event time receives the routine key notification
 * 8. No schedule exists at event time -> nobody receives a routine faculty key notification
 * 9. Dept Head routine key notification -> same active-schedule rule
 * 10. Dept Head UNAUTHORIZED -> still receives critical alert across all labs
 * 11. Dept Head WRONG_SLOT -> still receives critical alert across all labs
 * 
 * Plus:
 * 12. Exact boundaries: Start_Time (inclusive), End_Time (inclusive).
 * 13. Service layer: scope=timeline returns full activity history (bypasses targeted filtering).
 * 14. Strict key accountability: NULL actor identity is strictly preserved, never inferred as scheduled professor.
 * 15. Frontend service & timeline contracts.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const maintenanceRepository = require('../repositories/maintenance.repository');
const maintenanceService = require('../services/maintenanceService');

async function runTargetedNotificationTests() {
  console.log('================================================================');
  console.log('🧪 TARGETED KEY ACTIVITY NOTIFICATION SUITE (STRICT CLASS TIME)');
  console.log('================================================================\n');

  // Verify test users and rooms
  const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number");
  assert.ok(rooms.length >= 2, "Must have at least Room 203 and Room 204 in database");
  const room203 = rooms.find(r => r.Room_Number === '203');
  const room204 = rooms.find(r => r.Room_Number === '204');

  const [usersA] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'Department Head') LIMIT 1");
  assert.ok(usersA.length > 0, "IT Dept. Head user must exist");
  const deptHead = usersA[0];

  const [usersFaculty] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'Faculty' AND User_ID != ? LIMIT 2", [deptHead.User_ID]);
  assert.ok(usersFaculty.length >= 2, "At least two Faculty users must exist for multi-faculty isolation tests");
  const facultyA = usersFaculty[0];
  const facultyB = usersFaculty[1];

  console.log(`✓ Test Users: Dept Head: ${deptHead.Name} (ID: ${deptHead.User_ID}), Faculty A: ${facultyA.Name} (ID: ${facultyA.User_ID}), Faculty B: ${facultyB.Name} (ID: ${facultyB.User_ID})`);
  console.log(`✓ Test Rooms: Room 204 (ID: ${room204.Room_ID}), Room 203 (ID: ${room203.Room_ID})`);

  const createdScheduleIds = [];
  const createdLogIds = [];

  try {
    const [dayRow] = await db.query("SELECT DAYNAME(NOW()) as dayName, DATE_FORMAT(NOW(), '%Y-%m-%d') as curDateStr");
    const currentDay = dayRow[0].dayName;
    const currentDate = dayRow[0].curDateStr; // YYYY-MM-DD

    // Setup Schedules:
    // Faculty A: Room 204, 10:00:00 to 12:00:00 today
    const [sched1] = await db.query(`
      INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
      VALUES (?, ?, 'TEST-FACULTY-A-CLASS', 'BSIT-3A', ?, '10:00:00', '12:00:00', '2026-2027', '1st Semester', 'Default')
    `, [facultyA.User_ID, room204.Room_ID, currentDay]);
    createdScheduleIds.push(sched1.insertId);

    // Faculty B: Room 204, 14:00:00 to 16:00:00 today
    const [sched2] = await db.query(`
      INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
      VALUES (?, ?, 'TEST-FACULTY-B-CLASS', 'BSIT-3B', ?, '14:00:00', '16:00:00', '2026-2027', '1st Semester', 'Default')
    `, [facultyB.User_ID, room204.Room_ID, currentDay]);
    createdScheduleIds.push(sched2.insertId);

    // Dept Head: Room 204, 23:00:00 to 23:59:00 today
    const [sched3] = await db.query(`
      INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
      VALUES (?, ?, 'TEST-HEAD-CLASS', 'BSIT-4A', ?, '23:00:00', '23:59:00', '2026-2027', '1st Semester', 'Default')
    `, [deptHead.User_ID, room204.Room_ID, currentDay]);
    createdScheduleIds.push(sched3.insertId);

    console.log(`✓ Test Schedules created on ${currentDay}:`);
    console.log(`  - Faculty A: Room 204, 10:00:00 - 12:00:00`);
    console.log(`  - Faculty B: Room 204, 14:00:00 - 16:00:00`);
    console.log(`  - Dept Head: Room 204, 23:00:00 - 23:59:00\n`);

    // Helper to insert test occupancy log
    async function addLog(roomId, timeStr, authMethod, userId = null) {
      const fullTimestamp = `${currentDate} ${timeStr}`;
      const [res] = await db.query(`
        INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method)
        VALUES (?, ?, ?, ?)
      `, [userId, roomId, fullTimestamp, authMethod]);
      createdLogIds.push(res.insertId);
      return res.insertId;
    }

    // -------------------------------------------------------------------------
    // TEST 1 — Faculty assigned to Room 204 but NO schedule at event time (13:00:00)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Faculty assigned to Room 204 but NO schedule at event time ---');
    const logNoSched = await addLog(room204.Room_ID, '13:00:00', 'Key Taken', null);
    const [facNotifs1] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found1 = facNotifs1.find(n => n.type === 'occupancy' && n.id === logNoSched);
    assert.strictEqual(found1, undefined, 'Faculty A MUST NOT receive notification when having no schedule at event time');
    console.log('✔ PASS: Faculty assigned to Room 204 receives NO routine key notification outside schedule');

    // -------------------------------------------------------------------------
    // TEST 2 — Faculty has a schedule in Room 204 at event time (10:30:00)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Faculty has a schedule in Room 204 at event time ---');
    const logDuringA = await addLog(room204.Room_ID, '10:30:00', 'Key Taken', facultyA.User_ID);
    const [facNotifs2] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found2 = facNotifs2.find(n => n.type === 'occupancy' && n.id === logDuringA);
    assert.ok(found2, 'Faculty A MUST receive notification for key taken during active class');
    console.log('✔ PASS: Faculty receives notification for key taken during active class');

    // -------------------------------------------------------------------------
    // TEST 3 — Faculty has a schedule in Room 204 but event is before class (09:50:00 & 09:59:59)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Faculty has a schedule in Room 204 but event is before class ---');
    const logBeforeA = await addLog(room204.Room_ID, '09:50:00', 'Key Taken', facultyA.User_ID);
    const logJustBeforeA = await addLog(room204.Room_ID, '09:59:59', 'Key Taken', facultyA.User_ID);
    const [facNotifs3] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found3a = facNotifs3.find(n => n.type === 'occupancy' && n.id === logBeforeA);
    const found3b = facNotifs3.find(n => n.type === 'occupancy' && n.id === logJustBeforeA);
    assert.strictEqual(found3a, undefined, 'Event 10m before class MUST NOT qualify (no 30m buffer)');
    assert.strictEqual(found3b, undefined, 'Event 1s before class MUST NOT qualify');
    console.log('✔ PASS: Pre-class events are excluded (ACTUAL CLASS TIME ONLY)');

    // -------------------------------------------------------------------------
    // TEST 4 — Faculty has a schedule in Room 204 but event is after class (12:00:01 & 12:01:00)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Faculty has a schedule in Room 204 but event is after class ---');
    const logJustAfterA = await addLog(room204.Room_ID, '12:00:01', 'Key Taken', facultyA.User_ID);
    const logAfterA = await addLog(room204.Room_ID, '12:01:00', 'Key Taken', facultyA.User_ID);
    const [facNotifs4] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found4a = facNotifs4.find(n => n.type === 'occupancy' && n.id === logJustAfterA);
    const found4b = facNotifs4.find(n => n.type === 'occupancy' && n.id === logAfterA);
    assert.strictEqual(found4a, undefined, 'Event 1s after class MUST NOT qualify');
    assert.strictEqual(found4b, undefined, 'Event 1m after class MUST NOT qualify');
    console.log('✔ PASS: Post-class events are excluded');

    // -------------------------------------------------------------------------
    // TEST 5 — Faculty has a schedule in Room 204 but event occurs in Room 203 (10:30:00)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Faculty has a schedule in Room 204 but event occurs in Room 203 ---');
    const logRoom203 = await addLog(room203.Room_ID, '10:30:00', 'Key Taken', null);
    const [facNotifs5] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found5 = facNotifs5.find(n => n.type === 'occupancy' && n.id === logRoom203);
    assert.strictEqual(found5, undefined, 'Faculty A MUST NOT receive notification for activity in Room 203');
    console.log('✔ PASS: Activity in another laboratory is excluded');

    // -------------------------------------------------------------------------
    // TEST 6 — Another faculty (Faculty B) has the active schedule for Room 204 (14:30:00)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Another faculty has active schedule for Room 204 ---');
    const logDuringB = await addLog(room204.Room_ID, '14:30:00', 'Key Taken', facultyB.User_ID);
    const [facNotifs6] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found6 = facNotifs6.find(n => n.type === 'occupancy' && n.id === logDuringB);
    assert.strictEqual(found6, undefined, 'Faculty A MUST NOT receive notification during Faculty B active class');
    console.log('✔ PASS: Faculty A receives NO notification during Faculty B class in same room');

    // -------------------------------------------------------------------------
    // TEST 7 — Two faculty members have different schedules in Room 204
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Two faculty members with different schedules in Room 204 ---');
    const [facBNotifs7] = await maintenanceRepository.findFacultyNotifications(facultyB.User_ID);
    const found7B = facBNotifs7.find(n => n.type === 'occupancy' && n.id === logDuringB);
    const found7AInB = facBNotifs7.find(n => n.type === 'occupancy' && n.id === logDuringA);
    assert.ok(found7B, 'Faculty B MUST receive notification for event during own 14:00-16:00 class');
    assert.strictEqual(found7AInB, undefined, 'Faculty B MUST NOT receive notification for event during Faculty A 10:00-12:00 class');
    console.log('✔ PASS: Only the faculty whose schedule is active at that exact event time receives the notification');

    // -------------------------------------------------------------------------
    // TEST 8 — No schedule exists at event time (18:00:00 in Room 204)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: No schedule exists at event time ---');
    const logUnscheduledTime = await addLog(room204.Room_ID, '18:00:00', 'Key Taken', null);
    const [facANotifs8] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const [facBNotifs8] = await maintenanceRepository.findFacultyNotifications(facultyB.User_ID);
    assert.strictEqual(facANotifs8.find(n => n.type === 'occupancy' && n.id === logUnscheduledTime), undefined);
    assert.strictEqual(facBNotifs8.find(n => n.type === 'occupancy' && n.id === logUnscheduledTime), undefined);
    console.log('✔ PASS: Nobody receives a routine faculty key notification when no schedule exists at event time');

    // -------------------------------------------------------------------------
    // TEST 9 — Dept Head routine key notification: same active-schedule rule
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Dept Head routine key notification ---');
    const logDuringHead = await addLog(room204.Room_ID, '23:30:00', 'Key Taken', deptHead.User_ID);
    const [headNotifs9] = await maintenanceRepository.findDeptHeadNotifications(deptHead.User_ID);
    const found9Sched = headNotifs9.find(n => n.type === 'occupancy' && n.id === logDuringHead);
    const found9Unrelated = headNotifs9.find(n => n.type === 'occupancy' && n.id === logRoom203);
    assert.ok(found9Sched, 'Dept Head receives routine key notification during own active schedule (23:30:00)');
    assert.strictEqual(found9Unrelated, undefined, 'Dept Head MUST NOT receive routine key notification for unscheduled room');
    console.log('✔ PASS: Dept Head routine key notifications follow exact same active-schedule rule');

    // -------------------------------------------------------------------------
    // TEST 10 — Dept Head UNAUTHORIZED: still receives critical alert across all labs
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Dept Head UNAUTHORIZED across all labs ---');
    const logUnauth = await addLog(room203.Room_ID, '23:40:00', 'UNAUTHORIZED', null);
    const [headNotifs10] = await maintenanceRepository.findDeptHeadNotifications(deptHead.User_ID);
    const found10 = headNotifs10.find(n => n.type === 'occupancy' && n.id === logUnauth);
    assert.ok(found10, 'Dept Head MUST receive UNAUTHORIZED critical alert across all labs');
    console.log('✔ PASS: Dept Head receives UNAUTHORIZED critical security alert across all rooms');

    // -------------------------------------------------------------------------
    // TEST 11 — Dept Head WRONG_SLOT: still receives critical alert across all labs
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Dept Head WRONG_SLOT across all labs ---');
    const logWrongSlot = await addLog(room203.Room_ID, '23:45:00', 'WRONG_SLOT', null);
    const [headNotifs11] = await maintenanceRepository.findDeptHeadNotifications(deptHead.User_ID);
    const found11 = headNotifs11.find(n => n.type === 'occupancy' && n.id === logWrongSlot);
    assert.ok(found11, 'Dept Head MUST receive WRONG_SLOT hardware warning across all labs');
    console.log('✔ PASS: Dept Head receives WRONG_SLOT hardware warning across all rooms');

    // -------------------------------------------------------------------------
    // TEST 12 — EXACT BOUNDARIES: Exact Start_Time and Exact End_Time
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: Exact Start_Time (10:00:00) and End_Time (12:00:00) ---');
    const logExactStart = await addLog(room204.Room_ID, '10:00:00', 'Key Taken', facultyA.User_ID);
    const logExactEnd = await addLog(room204.Room_ID, '12:00:00', 'Key Returned', facultyA.User_ID);
    const [facNotifs12] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    assert.ok(facNotifs12.find(n => n.type === 'occupancy' && n.id === logExactStart), 'Exact Start_Time (10:00:00) must be included');
    assert.ok(facNotifs12.find(n => n.type === 'occupancy' && n.id === logExactEnd), 'Exact End_Time (12:00:00) must be included');
    console.log('✔ PASS: Start_Time and End_Time exact boundaries are inclusive');

    // -------------------------------------------------------------------------
    // TEST 13 — SERVICE LAYER: scope=timeline BYPASSES FILTERING
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 13: scope=timeline bypasses filtering ---');
    const logTimelineEvent = await addLog(room203.Room_ID, '23:50:00', 'Key Taken', null);
    const timelineRes = await maintenanceService.getNotifications(facultyA.User_ID, 'Faculty', { scope: 'timeline' });
    assert.strictEqual(timelineRes.status, 200);
    const timelineData = timelineRes.data || [];
    assert.ok(timelineData.some(n => n.type === 'occupancy' && n.id === logTimelineEvent), 'Timeline includes all lab activities');
    console.log('✔ PASS: scope=timeline returns full activity history');

    // -------------------------------------------------------------------------
    // TEST 14 — STRICT KEY ACCOUNTABILITY: NULL ACTOR PRESERVATION
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 14: Strict key accountability NULL actor preservation ---');
    const logNullDuring = await addLog(room204.Room_ID, '11:15:00', 'Key Taken', null);
    const [facNotifs14] = await maintenanceRepository.findFacultyNotifications(facultyA.User_ID);
    const found14 = facNotifs14.find(n => n.type === 'occupancy' && n.id === logNullDuring);
    assert.ok(found14, 'Faculty receives notification of key taken during class');
    assert.strictEqual(found14.description, null, 'Unauthenticated key removal description MUST be null');
    assert.strictEqual(found14.session_type, 'Borrowed', 'session_type MUST be Borrowed (NOT In Session)');
    console.log('✔ PASS: NULL actor identity is preserved, never inferred as scheduled professor');

    // -------------------------------------------------------------------------
    // TEST 15 — FRONTEND SERVICE & TIMELINE CONTRACTS
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 15: Frontend service and timeline contracts ---');
    const notifServiceCode = fs.readFileSync(path.join(__dirname, '../js/services/notification.service.js'), 'utf8');
    assert.ok(notifServiceCode.includes('fetchTimelineActivities'), 'notification.service.js must export fetchTimelineActivities');
    assert.ok(notifServiceCode.includes("scope === 'timeline'"), 'notification.service.js must cache timeline activities');

    const timelineCode = fs.readFileSync(path.join(__dirname, '../js/pages/room-status/room-status.timeline.js'), 'utf8');
    assert.ok(timelineCode.includes('fetchTimelineActivities'), 'room-status.timeline.js must invoke fetchTimelineActivities');

    const itHeadTimelineCode = fs.readFileSync(path.join(__dirname, '../js/pages/it-head-room-status.js'), 'utf8');
    assert.ok(itHeadTimelineCode.includes('fetchTimelineActivities'), 'it-head-room-status.js must invoke fetchTimelineActivities');
    console.log('✔ PASS: Frontend service and timeline integrations verified');

    console.log('\n================================================================');
    console.log('🎉 ALL 15 TARGETED NOTIFICATION TESTS PASSED SUCCESSFULLY! 🚀');
    console.log('================================================================');

  } finally {
    // Teardown test data
    if (createdLogIds.length > 0) {
      await db.query("DELETE FROM occupancy_log WHERE Log_ID IN (?)", [createdLogIds]);
    }
    if (createdScheduleIds.length > 0) {
      await db.query("DELETE FROM schedules WHERE Schedule_ID IN (?)", [createdScheduleIds]);
    }
    console.log('✓ Teardown: Test schedules and occupancy logs cleaned up successfully.');
  }
}

if (require.main === module) {
  runTargetedNotificationTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Test failed with error:', err);
      process.exit(1);
    });
}

module.exports = { runTargetedNotificationTests };
