'use strict';

const assert = require('assert');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');

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

async function runTests() {
    console.log('🧪 Starting Schedule Draft/Finalized Lifecycle & Role Finalization Tests...');

    const testAY = '2026-2027';
    const testSem = '1st Semester';
    const testRoom = '203';

    // 0. Setup test users and clean test state
    const [itHeadRows] = await db.query("SELECT User_ID, Email, Role FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
    const [progCoordRows] = await db.query("SELECT User_ID, Email, Role FROM users WHERE Role = 'Program Coordinator' LIMIT 1");

    assert.ok(itHeadRows.length > 0, 'IT Dept. Head account must exist');
    assert.ok(progCoordRows.length > 0, 'Program Coordinator account must exist');

    const itHeadSession = {
        userId: itHeadRows[0].User_ID,
        email: itHeadRows[0].Email,
        userRole: itHeadRows[0].Role,
        role: itHeadRows[0].Role
    };

    const progCoordSession = {
        userId: progCoordRows[0].User_ID,
        email: progCoordRows[0].Email,
        userRole: progCoordRows[0].Role,
        role: progCoordRows[0].Role
    };

    const [rooms] = await scheduleRepository.findRoomIdByNumber(testRoom);
    const roomId = rooms[0].Room_ID;

    // Reset room test state
    await db.query('DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);

    // 1. Program Coordinator creates a draft schedule (should SUCCEED)
    const draftSched = [
        {
            subject: 'IT Project 1',
            section: 'BSIT 4A',
            day: 'Wednesday',
            startTime: '08:00:00',
            endTime: '11:00:00',
            professor: 'Not specified'
        }
    ];

    const pcSave = await scheduleService.saveRoomSchedule(testRoom, draftSched, testAY, testSem, 1, progCoordSession.userId);
    assert.strictEqual(pcSave.status, 200, `PC save should succeed: ${JSON.stringify(pcSave)}`);
    console.log('✓ Program Coordinator successfully created and saved Draft schedule');

    // Verify status is Draft
    const roomState1 = await scheduleService.getRoomSchedule(testRoom, testAY, testSem);
    assert.strictEqual(roomState1.data.status, 'Draft');
    assert.strictEqual(roomState1.data.version, 2);
    console.log('✓ Schedule status verified as Draft (Version 2)');

    // 2. Program Coordinator attempts to FINALIZE schedule -> MUST BE REJECTED WITH 403 FORBIDDEN
    const pcFinalizeReq = createMockReqRes({
        session: progCoordSession,
        body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
    });
    await schedulesController.finalizeSchedule(pcFinalizeReq.req, pcFinalizeReq.res, (err) => { throw err; });
    assert.strictEqual(pcFinalizeReq.getStatus(), 403, 'Program Coordinator finalize attempt MUST return 403 Forbidden');
    console.log('✓ Program Coordinator forbidden from finalizing official schedule (HTTP 403)');

    // 3. Program Coordinator attempts to REOPEN schedule -> MUST BE REJECTED WITH 403 FORBIDDEN
    const pcReopenReq = createMockReqRes({
        session: progCoordSession,
        body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
    });
    await schedulesController.reopenSchedule(pcReopenReq.req, pcReopenReq.res, (err) => { throw err; });
    assert.strictEqual(pcReopenReq.getStatus(), 403, 'Program Coordinator reopen attempt MUST return 403 Forbidden');
    console.log('✓ Program Coordinator forbidden from reopening schedule (HTTP 403)');

    // 4. IT Dept. Head FINALIZE schedule -> MUST SUCCEED (200 OK)
    const itFinalizeReq = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
    });
    await schedulesController.finalizeSchedule(itFinalizeReq.req, itFinalizeReq.res, (err) => { throw err; });
    assert.strictEqual(itFinalizeReq.getStatus(), 200, 'IT Dept. Head finalize MUST succeed with 200 OK');
    console.log('✓ IT Dept. Head successfully finalized the schedule');

    // Verify database state: status is Finalized, finalizedBy is IT Head
    const finalizedState = await scheduleService.getRoomSchedule(testRoom, testAY, testSem);
    assert.strictEqual(finalizedState.data.status, 'Finalized');
    assert.strictEqual(finalizedState.data.scheduleStatus, 'Finalized');
    assert.ok(finalizedState.data.finalizedAt !== null, 'Finalized_At must be recorded');
    console.log('✓ Schedule status successfully updated to Finalized with IT Dept. Head finalizer recorded');

    // 5. Attempt to edit/save a finalized schedule -> MUST BE BLOCKED FOR EVERYONE
    // Attempt by Program Coordinator:
    const pcEditFinalized = await scheduleService.saveRoomSchedule(testRoom, [], testAY, testSem, 2, progCoordSession.userId);
    assert.strictEqual(pcEditFinalized.status, 403, 'Saving a finalized schedule by PC must be rejected with 403');
    assert.ok(pcEditFinalized.error.includes('Cannot modify a finalized schedule'), 'Expected finalized restriction error');
    console.log('✓ Program Coordinator blocked from modifying finalized schedule');

    // Attempt by IT Dept. Head without reopening:
    const itEditFinalized = await scheduleService.saveRoomSchedule(testRoom, [], testAY, testSem, 2, itHeadSession.userId);
    assert.strictEqual(itEditFinalized.status, 403, 'Saving a finalized schedule by IT Head must be rejected with 403 until reopened');
    console.log('✓ IT Dept. Head blocked from modifying finalized schedule without reopening first');

    // 6. IT Dept. Head REOPENS schedule for editing -> MUST SUCCEED (200 OK)
    const itReopenReq = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
    });
    await schedulesController.reopenSchedule(itReopenReq.req, itReopenReq.res, (err) => { throw err; });
    assert.strictEqual(itReopenReq.getStatus(), 200, 'IT Dept. Head reopen MUST succeed with 200 OK');
    console.log('✓ IT Dept. Head successfully reopened the schedule for editing');

    // Verify database state: status is Draft again
    const reopenedState = await scheduleService.getRoomSchedule(testRoom, testAY, testSem);
    assert.strictEqual(reopenedState.data.status, 'Draft');
    console.log('✓ Schedule returned to Draft status');

    // 7. Both administrators can now edit the schedule again
    const pcSaveAfterReopen = await scheduleService.saveRoomSchedule(testRoom, draftSched, testAY, testSem, 2, progCoordSession.userId);
    assert.strictEqual(pcSaveAfterReopen.status, 200, 'PC must be able to save after schedule was reopened');
    console.log('✓ Program Coordinator can save changes again on reopened Draft schedule');

    // 8. Audit log verification
    const [finalizeLogs] = await db.query(
        "SELECT * FROM audit_logs WHERE Action = 'SCHEDULE_FINALIZE' AND Resource_ID = ? ORDER BY Created_At DESC LIMIT 1",
        [testRoom]
    );
    assert.ok(finalizeLogs.length > 0, 'SCHEDULE_FINALIZE audit log must exist');
    assert.strictEqual(finalizeLogs[0].User_ID, itHeadSession.userId);
    console.log('✓ Audit log confirmed: SCHEDULE_FINALIZE correctly attributed to IT Dept. Head');

    const [reopenLogs] = await db.query(
        "SELECT * FROM audit_logs WHERE Action = 'SCHEDULE_REOPEN' AND Resource_ID = ? ORDER BY Created_At DESC LIMIT 1",
        [testRoom]
    );
    assert.ok(reopenLogs.length > 0, 'SCHEDULE_REOPEN audit log must exist');
    assert.strictEqual(reopenLogs[0].User_ID, itHeadSession.userId);
    console.log('✓ Audit log confirmed: SCHEDULE_REOPEN correctly attributed to IT Dept. Head');

    // Cleanup test data
    await db.query('DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);

    console.log('\n🎉 ALL Phase 2 Draft/Finalized Tests PASSED SUCCESSFULLY!\n');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Phase 2 test failed:', err);
    process.exit(1);
});
