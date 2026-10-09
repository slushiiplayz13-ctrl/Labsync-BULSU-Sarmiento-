'use strict';

const assert = require('assert');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');
const roomLockService = require('../services/roomLockService');
const keyReminderRepository = require('../repositories/key-reminder.repository');
const maintenanceRepository = require('../repositories/maintenance.repository');

function createMockReqRes({ session, body = {}, query = {}, params = {} }) {
    const req = {
        session,
        body,
        query,
        params,
        ip: '127.0.0.1'
    };
    let statusCode = 200;
    let responseData = null;

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseData = data;
            return this;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runSeparationTests() {
    console.log('================================================================');
    console.log('🧪 DRAFT VS OFFICIAL SCHEDULE SEPARATION VERIFICATION SUITE');
    console.log('================================================================\n');

    const testAY = '2026-2027';
    const testSem = '1st Semester';
    const testRoom = '203';
    const otherRoom = '204';

    // 0. Locate test accounts
    const [itHeadRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
    const [progCoordRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
    const [facultyRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Faculty' LIMIT 1");

    assert.ok(itHeadRows.length > 0, 'IT Dept. Head account must exist');
    assert.ok(progCoordRows.length > 0, 'Program Coordinator account must exist');
    assert.ok(facultyRows.length > 0, 'Faculty account must exist');

    const itHead = itHeadRows[0];
    const progCoord = progCoordRows[0];
    const faculty = facultyRows[0];

    const itHeadSession = { userId: itHead.User_ID, email: itHead.Email, userRole: itHead.Role, role: itHead.Role };
    const progCoordSession = { userId: progCoord.User_ID, email: progCoord.Email, userRole: progCoord.Role, role: progCoord.Role };
    const facultySession = { userId: faculty.User_ID, email: faculty.Email, userRole: faculty.Role, role: faculty.Role };

    const [rooms] = await scheduleRepository.findRoomIdByNumber(testRoom);
    const [otherRooms] = await scheduleRepository.findRoomIdByNumber(otherRoom);
    const roomId = rooms[0].Room_ID;
    const otherRoomId = otherRooms[0].Room_ID;

    // Reset test room state
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);

    // Seed baseline OFFICIAL schedule in Room 203 for Faculty: Monday 08:00 - 09:00
    await db.query(`
        INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
        VALUES (?, ?, 'IT 101 - Intro to Computing', '1A-1', 'Monday', '08:00:00', '09:00:00', ?, ?, 'blue')
    `, [faculty.User_ID, roomId, testAY, testSem]);
    await scheduleRepository.upsertScheduleMetadata({
        roomId,
        ay: testAY,
        sem: testSem,
        version: 1,
        status: 'Finalized',
        finalizedBy: itHead.User_ID,
        finalizedAt: new Date(),
        updatedBy: itHead.User_ID
    });

    console.log('--- Initial State Verified: Room 203 has Official Schedule (Monday 08:00-09:00) ---');
    const [initFacultySched] = await scheduleRepository.findUserSchedule(faculty.User_ID, testAY, testSem);
    assert.strictEqual(initFacultySched.length, 1);
    assert.strictEqual(initFacultySched[0].Start_Time, '08:00:00');
    console.log('✔ Initial Faculty My Schedule displays official Monday 08:00-09:00');

    // ─── TEST SCENARIO A: Reopen and Save Working Draft by Program Coordinator ───
    console.log('\n--- 1. IT Dept Head Reopens Schedule for Editing ---');
    const reopenRes = await scheduleService.reopenSchedule({ roomNumber: testRoom, academicYear: testAY, semester: testSem, userId: itHead.User_ID });
    assert.strictEqual(reopenRes.status, 200);
    assert.strictEqual(reopenRes.data.status, 'Draft');
    console.log('✔ IT Dept Head successfully reopened schedule (Status: Draft)');

    // Verify official schedule in `schedules` was NOT deleted during reopen
    const [postReopenOfficial] = await scheduleRepository.findRoomSchedules(roomId, testAY, testSem);
    assert.strictEqual(postReopenOfficial.length, 1, 'Official schedules row must remain intact after reopen');
    console.log('✔ Official schedules row remains intact after reopen');

    // Verify working draft in `schedule_drafts` was initialized from official
    const [draftInitRows] = await scheduleRepository.findRoomScheduleDrafts(roomId, testAY, testSem);
    assert.strictEqual(draftInitRows.length, 1, 'Working draft must be initialized from official');
    console.log('✔ Working draft was initialized from official');

    // ─── TEST SCENARIO B: Program Coordinator modifies and saves Draft: Monday 09:00 - 10:00 ───
    console.log('\n--- 2. Program Coordinator Saves New Working Draft (Monday 09:00-10:00) ---');
    const newDraftPayload = [
        {
            subject: 'IT 102 - Advanced Programming',
            section: '1B-1',
            day: 'Monday',
            startTime: '09:00:00',
            endTime: '10:00:00',
            professor: faculty.Name
        }
    ];

    const pcSaveRes = await scheduleService.saveRoomSchedule(testRoom, newDraftPayload, testAY, testSem, 1, progCoord.User_ID);
    assert.strictEqual(pcSaveRes.status, 200, 'PC save draft must succeed');
    assert.strictEqual(pcSaveRes.statusValue, 'Draft');
    console.log('✔ Program Coordinator saved draft (Monday 09:00-10:00)');

    // ─── CRITICAL ASSERTION 1: Data Separation ───
    console.log('\n--- 3. Verifying True Backend Data Separation ---');
    // Check schedule_drafts table: MUST contain new 09:00-10:00 class
    const [draftRows] = await scheduleRepository.findRoomScheduleDrafts(roomId, testAY, testSem);
    assert.strictEqual(draftRows.length, 1, 'schedule_drafts must have 1 row');
    assert.strictEqual(draftRows[0].Start_Time, '09:00:00', 'Draft Start_Time must be 09:00');
    console.log('✔ schedule_drafts contains WORKING DRAFT (09:00-10:00)');

    // Check schedules table: MUST STILL contain old official 08:00-09:00 class!
    const [officialRows] = await scheduleRepository.findRoomSchedules(roomId, testAY, testSem);
    assert.strictEqual(officialRows.length, 1, 'official schedules must have 1 row');
    assert.strictEqual(officialRows[0].Start_Time, '08:00:00', 'Official Start_Time must STILL be 08:00');
    console.log('✔ official schedules STILL contains OFFICIAL (08:00-09:00)');

    // ─── CRITICAL ASSERTION 2: Production Read Paths Do NOT See Draft ───
    console.log('\n--- 4. Verifying Production Read Paths (Draft Leakage Prevention) ---');

    // Path A: Faculty My Schedule
    const facultySchedRes = await scheduleService.getUserSchedule(faculty.User_ID, testAY, testSem);
    assert.strictEqual(facultySchedRes.status, 200);
    assert.strictEqual(facultySchedRes.data.length, 1);
    assert.strictEqual(facultySchedRes.data[0].Start_Time, '08:00:00', 'Faculty My Schedule MUST STILL show 08:00-09:00');
    console.log('✔ PASS: Faculty My Schedule STILL shows 08:00–09:00 (Draft 09:00–10:00 NOT visible to faculty)');

    // Path B: Faculty Schedule by Name
    const facultyByNameRes = await scheduleService.getFacultyScheduleByName(faculty.Name, testAY, testSem);
    assert.strictEqual(facultyByNameRes.status, 200);
    assert.strictEqual(facultyByNameRes.data[0].Start_Time, '08:00:00', 'Faculty by name query MUST STILL show 08:00-09:00');
    console.log('✔ PASS: Faculty query by name STILL shows 08:00–09:00');

    // Path C: Room Status schedule query (at Monday 08:30:00)
    const [roomStatusAt830] = await scheduleRepository.findSummaryRoomsStatus('Monday', '08:30:00', testAY, testSem);
    const room203At830 = roomStatusAt830.find(r => r.Room_Number === '203');
    assert.ok(room203At830, 'Room 203 found in room status');
    assert.strictEqual(room203At830.Scheduled_User_ID, faculty.User_ID, 'Room Status at 08:30 uses official schedule (occupied)');
    console.log('✔ PASS: Room Status at 08:30 uses official schedule (occupied by faculty)');

    // Path D: Room Status schedule query (at Monday 09:30:00) -> Draft must NOT make it occupied!
    const [roomStatusAt930] = await scheduleRepository.findSummaryRoomsStatus('Monday', '09:30:00', testAY, testSem);
    const room203At930 = roomStatusAt930.find(r => r.Room_Number === '203');
    assert.strictEqual(room203At930.Scheduled_User_ID, null, 'Room Status at 09:30 MUST be vacant because 09:00-10:00 is only a draft');
    console.log('✔ PASS: Room Status at 09:30 is vacant (unfinalized draft does not affect live room status)');

    // Path E: Schedule Studio Read vs Official Read
    const editorReadRes = await scheduleService.getRoomSchedule(testRoom, testAY, testSem);
    assert.strictEqual(editorReadRes.data.status, 'Draft');
    assert.strictEqual(editorReadRes.data.schedules[0].Start_Time, '09:00:00', 'Editor receives working draft 09:00');
    console.log('✔ PASS: Schedule Studio editor receives working draft (09:00–10:00)');

    const officialReadRes = await scheduleService.getRoomSchedule(testRoom, testAY, testSem, { view: 'official' });
    assert.strictEqual(officialReadRes.data.schedules[0].Start_Time, '08:00:00', 'Official view receives official schedule 08:00');
    console.log('✔ PASS: Explicit official view receives official schedule (08:00–09:00)');

    // ─── TEST SCENARIO C: Program Coordinator cannot Finalize ───
    console.log('\n--- 5. Authorization: Program Coordinator Cannot Finalize ---');
    const pcFinalizeReq = createMockReqRes({
        session: progCoordSession,
        body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
    });
    await schedulesController.finalizeSchedule(pcFinalizeReq.req, pcFinalizeReq.res, (e) => { throw e; });
    assert.strictEqual(pcFinalizeReq.getStatus(), 403, 'PC finalize must be 403 Forbidden');
    console.log('✔ PASS: Program Coordinator blocked with 403 Forbidden on finalize');

    // ─── TEST SCENARIO D: IT Dept Head Finalizes Schedule ───
    console.log('\n--- 6. IT Dept Head Finalizes Official Schedule ---');
    const itToken = 'sep_test_finalize_' + Date.now();
    roomLockService.acquireLock({
        roomNumber: testRoom,
        academicYear: testAY,
        semester: testSem,
        userId: itHeadSession.userId,
        userName: itHeadSession.userName || 'IT Dept. Head',
        userRole: itHeadSession.userRole,
        editSessionToken: itToken
    });
    const itFinalizeReq = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom, academicYear: testAY, semester: testSem, editSessionToken: itToken }
    });
    await schedulesController.finalizeSchedule(itFinalizeReq.req, itFinalizeReq.res, (e) => { throw e; });
    assert.strictEqual(itFinalizeReq.getStatus(), 200, 'IT Dept Head finalize must succeed');
    console.log('✔ PASS: IT Dept Head finalized schedule (HTTP 200)');

    // ─── CRITICAL ASSERTION 3: After Finalization, Official Schedule Updated ───
    console.log('\n--- 7. Verifying Official Publication ---');
    // Check official schedules table: NOW contains 09:00-10:00!
    const [postFinalizeOfficial] = await scheduleRepository.findRoomSchedules(roomId, testAY, testSem);
    assert.strictEqual(postFinalizeOfficial.length, 1);
    assert.strictEqual(postFinalizeOfficial[0].Start_Time, '09:00:00', 'Official schedule now updated to 09:00-10:00');
    console.log('✔ PASS: official schedules table now updated to 09:00–10:00');

    // Check Faculty My Schedule: NOW shows 09:00-10:00!
    const postFinalizeFacultySched = await scheduleService.getUserSchedule(faculty.User_ID, testAY, testSem);
    assert.strictEqual(postFinalizeFacultySched.data[0].Start_Time, '09:00:00', 'Faculty now sees updated class 09:00-10:00');
    console.log('✔ PASS: Faculty My Schedule now shows updated class 09:00–10:00');

    // ─── TEST SCENARIO E: Finalized Schedule Lock ───
    console.log('\n--- 8. Finalized Schedule Lock Enforcement ---');
    const editLockedResPC = await scheduleService.saveRoomSchedule(testRoom, [], testAY, testSem, 2, progCoord.User_ID);
    assert.strictEqual(editLockedResPC.status, 403, 'PC cannot save to finalized schedule');
    console.log('✔ PASS: PC blocked from modifying finalized schedule');

    const editLockedResIT = await scheduleService.saveRoomSchedule(testRoom, [], testAY, testSem, 2, itHead.User_ID);
    assert.strictEqual(editLockedResIT.status, 403, 'IT Head cannot save to finalized schedule without reopening');
    console.log('✔ PASS: IT Dept Head blocked from modifying finalized schedule without reopening first');

    // ─── TEST SCENARIO F: Reopening Preserves Official Schedule ───
    console.log('\n--- 9. Reopening Preserves Official Schedule Visible to Faculty ---');
    const reopen2Res = await scheduleService.reopenSchedule({ roomNumber: testRoom, academicYear: testAY, semester: testSem, userId: itHead.User_ID });
    assert.strictEqual(reopen2Res.status, 200);

    // Save a draft changing class to Monday 10:00 - 11:00
    const draft3Payload = [
        {
            subject: 'IT 103 - Data Structures',
            section: '1C-1',
            day: 'Monday',
            startTime: '10:00:00',
            endTime: '11:00:00',
            professor: faculty.Name
        }
    ];
    const saveDraft3Res = await scheduleService.saveRoomSchedule(testRoom, draft3Payload, testAY, testSem, 2, itHead.User_ID);
    assert.strictEqual(saveDraft3Res.status, 200);

    // Faculty My Schedule MUST STILL SHOW 09:00-10:00!
    const facultySchedWhileDraft3 = await scheduleService.getUserSchedule(faculty.User_ID, testAY, testSem);
    assert.strictEqual(facultySchedWhileDraft3.data[0].Start_Time, '09:00:00', 'Faculty MUST continue seeing official 09:00-10:00 while 10:00-11:00 draft is being prepared');
    console.log('✔ PASS: Faculty CONTINUES seeing official 09:00–10:00 while new draft 10:00–11:00 is being prepared');

    // ─── TEST SCENARIO G: Concurrency Control on Working Drafts ───
    console.log('\n--- 10. Concurrency Control on Working Drafts (Optimistic Locking) ---');
    // Save draft with stale version (expected 2, current is 3)
    const staleSaveRes = await scheduleService.saveRoomSchedule(testRoom, draft3Payload, testAY, testSem, 2, progCoord.User_ID);
    assert.strictEqual(staleSaveRes.status, 409, 'Stale save must return 409 Conflict');
    console.log('✔ PASS: Stale draft save rejected with HTTP 409 Conflict');

    // ─── TEST SCENARIO H: Conflict Checking Across Drafts and Official ───
    console.log('\n--- 11. Conflict Checking Across Drafts and Official Schedules ---');
    // Try to schedule same professor in Room 204 at overlapping time (Monday 10:30 - 11:30)
    const clashPayload = [
        {
            subject: 'IT 201',
            section: '2A',
            day: 'Monday',
            startTime: '10:30:00',
            endTime: '11:30:00',
            professor: faculty.Name
        }
    ];
    const clashSaveRes = await scheduleService.saveRoomSchedule(otherRoom, clashPayload, testAY, testSem, 1, itHead.User_ID);
    assert.strictEqual(clashSaveRes.status, 400, 'Cross-room clash against active draft must be rejected');
    assert.ok(clashSaveRes.error.includes('Schedule conflict: Professor'));
    console.log('✔ PASS: Professor clash across rooms detected against active draft');

    // ─── CLEANUP ───
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);

    console.log('\n================================================================');
    console.log('🎉 ALL DRAFT VS OFFICIAL SEPARATION TESTS PASSED PERFECTLY!');
    console.log('================================================================\n');
}

runSeparationTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ Separation Test Error:', err);
    process.exit(1);
});
