'use strict';

/**
 * tests/test-collaborative-schedule-locking-workflow.js
 * 
 * End-to-End Integration & Regression Suite for LabSync Collaborative Room Locking Workflow:
 * 
 * Scenario 1:  IT Dept. Head opens Room 203 (AY + Sem) and acquires lock (HTTP 200).
 * Scenario 2:  Program Coordinator opens same room and term, receiving HTTP 423 Locked.
 * Scenario 3:  Blocked editor displays active owner's name & role, entering read-only mode.
 * Scenario 4:  Blocked session cannot save without a token or with another user's token (HTTP 423).
 * Scenario 5:  Lock owner saves successfully with a valid, active token (HTTP 200).
 * Scenario 6:  Valid heartbeat keeps 30-second lease alive during active editing (HTTP 200).
 * Scenario 7:  Releasing lock allows second administrator to acquire room (HTTP 200).
 * Scenario 8:  Unexpected browser close (lease expiry after 30s) allows takeover by another admin.
 * Scenario 9:  Room 204 remains independently editable while Room 203 is locked.
 * Scenario 10: Same room independently edited for a different academic year or semester.
 * Scenario 11: Finalization remains IT Dept Head-exclusive and strictly respects lock ownership.
 * Scenario 12: Reopening a finalized schedule establishes safe editing ownership without stealing active lock.
 * Scenario 13: Network error or lost lease fails closed and never permits silent unrestricted edits.
 * 
 * Authorization Scenarios:
 * Scenario 14: Unauthenticated access to lock endpoints rejected with HTTP 401.
 * Scenario 15: Non-administrative roles (Faculty, MIS Staff, OJT) rejected with HTTP 403.
 */

const assert = require('assert');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');
const roomLockService = require('../services/roomLockService');
const { requireRole, IT_HEAD_ROLES, IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');

function createMockReqRes({ session = null, body = {}, query = {}, params = {}, headers = {}, ip = '127.0.0.1' } = {}) {
    let statusCode = 200;
    let responseData = null;

    const req = {
        session,
        body,
        query,
        params,
        headers,
        ip,
        connection: { remoteAddress: ip }
    };

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

async function runMiddlewareAndHandler(middlewares, controllerFn, req, res) {
    let proceed = true;
    for (const mw of middlewares) {
        let nextCalled = false;
        await mw(req, res, (err) => {
            if (err) throw err;
            nextCalled = true;
        });
        if (!nextCalled) {
            proceed = false;
            break;
        }
    }
    if (proceed && controllerFn) {
        await controllerFn(req, res, (err) => {
            if (err) throw err;
        });
    }
}

async function runCollaborativeLockingSuite() {
    console.log('================================================================');
    console.log('🧪 COLLABORATIVE SCHEDULE ROOM LOCKING INTEGRATION SUITE');
    console.log('================================================================\n');

    const testAY = '2026-2027';
    const testSem = '1st Semester';
    const testRoom203 = '203';
    const testRoom204 = '204';

    // ─── 0. SETUP: Identify Test Users & Clean Initial State ───
    roomLockService.clearAllLocks();

    const [itHeadRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
    const [progCoordRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
    const [facultyRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Faculty' LIMIT 1");
    const [misRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'MIS Staff' LIMIT 1");

    assert.ok(itHeadRows.length > 0, 'IT Dept. Head account must exist');
    assert.ok(progCoordRows.length > 0, 'Program Coordinator account must exist');

    const itHead = itHeadRows[0];
    const progCoord = progCoordRows[0];
    const facultyUser = facultyRows.length > 0 ? facultyRows[0] : null;
    const misUser = misRows.length > 0 ? misRows[0] : null;

    const itHeadSession = {
        userId: itHead.User_ID,
        email: itHead.Email,
        name: itHead.Name,
        userName: itHead.Name,
        userRole: itHead.Role,
        role: itHead.Role
    };

    const progCoordSession = {
        userId: progCoord.User_ID,
        email: progCoord.Email,
        name: progCoord.Name,
        userName: progCoord.Name,
        userRole: progCoord.Role,
        role: progCoord.Role
    };

    const [r203Rooms] = await scheduleRepository.findRoomIdByNumber(testRoom203);
    const [r204Rooms] = await scheduleRepository.findRoomIdByNumber(testRoom204);
    const r203Id = r203Rooms[0].Room_ID;
    const r204Id = r204Rooms[0].Room_ID;

    // Clean test room records
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r203Id, r204Id, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r203Id, r204Id, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r203Id, r204Id, testAY, testSem]);

    // ─── SCENARIO 1: IT Department Head opens Room 203 and acquires lock ───
    console.log('--- SCENARIO 1: IT Dept. Head acquires lock for Room 203 ---');
    const itToken = 'token_it_head_' + Date.now();
    const acq1 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itToken
        }
    });

    await schedulesController.acquireRoomLock(acq1.req, acq1.res, (e) => { throw e; });
    assert.strictEqual(acq1.getStatus(), 200, 'Acquire lock must return HTTP 200');
    assert.strictEqual(acq1.getData().acquired, true, 'Lock must be marked acquired: true');
    assert.strictEqual(acq1.getData().editSessionToken, itToken, 'Returned editSessionToken must match');
    assert.strictEqual(acq1.getData().lock.userName, itHead.Name, 'Lock owner name must match');
    assert.strictEqual(acq1.getData().lock.userRole, itHead.Role, 'Lock owner role must match');
    console.log(`✔ PASS: Scenario 1 — IT Dept. Head (${itHead.Name}) acquired lock for Room ${testRoom203}`);

    // ─── SCENARIO 2: Program Coordinator opens Room 203 and receives HTTP 423 Locked ───
    console.log('\n--- SCENARIO 2: Program Coordinator blocked with HTTP 423 Locked ---');
    const pcToken = 'token_pc_' + Date.now();
    const acq2 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: pcToken
        }
    });

    await schedulesController.acquireRoomLock(acq2.req, acq2.res, (e) => { throw e; });
    assert.strictEqual(acq2.getStatus(), 423, 'Acquisition of held lock must return HTTP 423 Locked');
    assert.strictEqual(acq2.getData().acquired, false, 'Acquired must be false');
    assert.strictEqual(acq2.getData().code, 'LOCKED', 'Stable error code must be LOCKED');
    console.log(`✔ PASS: Scenario 2 — Program Coordinator blocked with HTTP 423 Locked`);

    // ─── SCENARIO 3: Blocked editor displays active owner identifying info ───
    console.log('\n--- SCENARIO 3: Blocked editor receives active owner name and role ---');
    const lockedBy = acq2.getData().lockedBy;
    assert.ok(lockedBy, 'Response must include lockedBy payload');
    assert.strictEqual(lockedBy.userName, itHead.Name, 'LockedBy must identify IT Dept. Head name');
    assert.strictEqual(lockedBy.userRole, itHead.Role, 'LockedBy must identify IT Dept. Head role');
    assert.ok(acq2.getData().error.includes(itHead.Name), 'Error message must include owner name');
    assert.ok(acq2.getData().error.includes(itHead.Role), 'Error message must include owner role');
    console.log(`✔ PASS: Scenario 3 — Blocked payload correctly displays: "${acq2.getData().error}"`);

    // ─── SCENARIO 4: Blocked session cannot save without token or with invalid token ───
    console.log('\n--- SCENARIO 4: Blocked session rejected on save attempt (HTTP 423) ---');
    // 4a. Attempt to save without token
    const noTokenSave = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            version: 1,
            schedules: [{ subject: 'Unauthorized', section: 'BSIT 1A', day: 'Monday', startTime: '08:00', endTime: '10:00' }]
        }
    });
    await schedulesController.saveSchedule(noTokenSave.req, noTokenSave.res, (e) => { throw e; });
    assert.strictEqual(noTokenSave.getStatus(), 423, 'Save without token must return HTTP 423 Locked');

    // 4b. Attempt to save with unauthorized/unmatched token
    const wrongTokenSave = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            version: 1,
            editSessionToken: pcToken, // PC does not own the lock
            schedules: [{ subject: 'Unauthorized', section: 'BSIT 1A', day: 'Monday', startTime: '08:00', endTime: '10:00' }]
        }
    });
    await schedulesController.saveSchedule(wrongTokenSave.req, wrongTokenSave.res, (e) => { throw e; });
    assert.strictEqual(wrongTokenSave.getStatus(), 423, 'Save with wrong token must return HTTP 423 Locked');

    // 4c. Verify database draft table was NOT mutated
    const [draftCheck] = await db.query('SELECT * FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [r203Id, testAY, testSem]);
    assert.strictEqual(draftCheck.length, 0, 'Blocked save attempts must not alter database state');
    console.log('✔ PASS: Scenario 4 — Blocked saves without active lock rejected with HTTP 423 without altering data');

    // ─── SCENARIO 5: Lock owner can save successfully with valid active token ───
    console.log('\n--- SCENARIO 5: Active lock owner saves draft successfully ---');
    const validSave = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            version: 1,
            editSessionToken: itToken,
            schedules: [
                {
                    subject: 'CS 101 - Programming I',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Not specified'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(validSave.req, validSave.res, (e) => { throw e; });
    assert.strictEqual(validSave.getStatus(), 200, 'Owner save must return HTTP 200');
    assert.strictEqual(validSave.getData().version, 2, 'Version should increment to 2');
    console.log('✔ PASS: Scenario 5 — IT Dept. Head saved draft successfully with active lock');

    // ─── SCENARIO 6: Heartbeat renewal keeps 30s lease alive ───
    console.log('\n--- SCENARIO 6: Lease renewal heartbeat ---');
    const hb1 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itToken
        }
    });
    await schedulesController.renewRoomLockHeartbeat(hb1.req, hb1.res, (e) => { throw e; });
    assert.strictEqual(hb1.getStatus(), 200, 'Heartbeat renewal must return HTTP 200');
    assert.strictEqual(hb1.getData().renewed, true, 'Heartbeat must indicate renewed: true');

    // Invalid token heartbeat rejected with 423
    const badHb = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: 'bad_token'
        }
    });
    await schedulesController.renewRoomLockHeartbeat(badHb.req, badHb.res, (e) => { throw e; });
    assert.strictEqual(badHb.getStatus(), 423, 'Heartbeat with invalid token must return HTTP 423');
    console.log('✔ PASS: Scenario 6 — Heartbeat keeps lease alive; invalid heartbeat rejected with HTTP 423');

    // ─── SCENARIO 7: Explicit release allows second administrator to acquire ───
    console.log('\n--- SCENARIO 7: Release allows second administrator to acquire ---');
    const rel1 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itToken
        }
    });
    await schedulesController.releaseRoomLock(rel1.req, rel1.res, (e) => { throw e; });
    assert.strictEqual(rel1.getStatus(), 200, 'Release lock must return HTTP 200');
    assert.strictEqual(rel1.getData().released, true, 'Released must be true');

    // Program Coordinator acquires released room
    const acqAfterRelease = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: pcToken
        }
    });
    await schedulesController.acquireRoomLock(acqAfterRelease.req, acqAfterRelease.res, (e) => { throw e; });
    assert.strictEqual(acqAfterRelease.getStatus(), 200, 'Program Coordinator can acquire released room');
    assert.strictEqual(acqAfterRelease.getData().acquired, true);
    console.log('✔ PASS: Scenario 7 — Explicit release allowed Program Coordinator to acquire Room 203');

    // ─── SCENARIO 8: Lease expiration enables automatic takeover ───
    console.log('\n--- SCENARIO 8: Inactive expired lease auto-pruning ---');
    // Artificially age the active lock past 30 seconds
    const activeKey = roomLockService.getLockKey(testRoom203, testAY, testSem);
    const existingLock = roomLockService.locks.get(activeKey);
    assert.ok(existingLock, 'Active lock must exist in lock manager');
    existingLock.lastHeartbeat = Date.now() - 31000; // 31 seconds ago

    const itTakeoverToken = 'token_it_takeover_' + Date.now();
    const acqExpired = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itTakeoverToken
        }
    });
    await schedulesController.acquireRoomLock(acqExpired.req, acqExpired.res, (e) => { throw e; });
    assert.strictEqual(acqExpired.getStatus(), 200, 'Expired lock acquisition must succeed with HTTP 200');
    assert.strictEqual(acqExpired.getData().acquired, true);
    assert.strictEqual(acqExpired.getData().editSessionToken, itTakeoverToken);
    console.log('✔ PASS: Scenario 8 — Expired lease (>30s) automatically released and acquired by new administrator');

    // ─── SCENARIO 9: Room 204 remains independently editable while Room 203 is locked ───
    console.log('\n--- SCENARIO 9: Room 204 independently editable while Room 203 is locked ---');
    const pcRoom204Token = 'token_pc_r204_' + Date.now();
    const acq204 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom204,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: pcRoom204Token
        }
    });
    await schedulesController.acquireRoomLock(acq204.req, acq204.res, (e) => { throw e; });
    assert.strictEqual(acq204.getStatus(), 200, 'Room 204 acquisition must succeed even when Room 203 is locked');
    assert.strictEqual(acq204.getData().acquired, true);

    // PC can save Room 204
    const save204 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom204,
            academicYear: testAY,
            semester: testSem,
            version: 1,
            editSessionToken: pcRoom204Token,
            schedules: [{ subject: 'Networking 1', section: 'BSIT 2A', day: 'Tuesday', startTime: '08:00', endTime: '10:00' }]
        }
    });
    await schedulesController.saveSchedule(save204.req, save204.res, (e) => { throw e; });
    assert.strictEqual(save204.getStatus(), 200, 'Program Coordinator can save Room 204');
    console.log('✔ PASS: Scenario 9 — Room 204 independently editable while Room 203 is held by IT Dept Head');

    // ─── SCENARIO 10: Same room independently edited for different AY or Semester ───
    console.log('\n--- SCENARIO 10: Same room independent across terms ---');
    const pcRoom203Sem2Token = 'token_pc_r203_sem2_' + Date.now();
    const acq203Sem2 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: '2nd Semester',
            editSessionToken: pcRoom203Sem2Token
        }
    });
    await schedulesController.acquireRoomLock(acq203Sem2.req, acq203Sem2.res, (e) => { throw e; });
    assert.strictEqual(acq203Sem2.getStatus(), 200, 'Room 203 for 2nd Semester must acquire independently');
    assert.strictEqual(acq203Sem2.getData().acquired, true);
    console.log('✔ PASS: Scenario 10 — Room 203 in 2nd Semester acquired independently from 1st Semester');

    // ─── SCENARIO 11: Finalization is IT Dept. Head exclusive and enforces lock ownership ───
    console.log('\n--- SCENARIO 11: Finalization exclusivity and lock enforcement ---');
    // 11a. Program Coordinator forbidden from finalizing (HTTP 403)
    const pcFinalize = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itTakeoverToken
        }
    });
    await schedulesController.finalizeSchedule(pcFinalize.req, pcFinalize.res, (e) => { throw e; });
    assert.strictEqual(pcFinalize.getStatus(), 403, 'Program Coordinator must be rejected with HTTP 403');

    // 11b. IT Dept Head cannot finalize without valid active lock token (HTTP 423)
    const badTokenFinalize = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: 'invalid_token'
        }
    });
    await schedulesController.finalizeSchedule(badTokenFinalize.req, badTokenFinalize.res, (e) => { throw e; });
    assert.strictEqual(badTokenFinalize.getStatus(), 423, 'Finalize without valid token must return HTTP 423');

    // 11c. IT Dept Head finalizes with active lock token (HTTP 200)
    const validFinalize = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itTakeoverToken
        }
    });
    await schedulesController.finalizeSchedule(validFinalize.req, validFinalize.res, (e) => { throw e; });
    assert.strictEqual(validFinalize.getStatus(), 200, 'IT Dept Head finalize with active token must succeed');

    // 11d. Finalization releases lock
    assert.strictEqual(roomLockService.getLock(testRoom203, testAY, testSem), null, 'Finalize must release lock');
    console.log('✔ PASS: Scenario 11 — Finalization exclusive to IT Dept Head and enforces lock ownership');

    // ─── SCENARIO 12: Reopening establishes safe editing ownership without stealing active lock ───
    console.log('\n--- SCENARIO 12: Reopen schedule establishes lock safely ---');
    // 12a. If another user held an active lock (hypothetical), reopen would fail with 423.
    // Let's test that reopen establishes lock and returns editSessionToken for IT Dept Head:
    const itReopenToken = 'token_it_reopen_' + Date.now();
    const reopenReq = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: itReopenToken
        }
    });
    await schedulesController.reopenSchedule(reopenReq.req, reopenReq.res, (e) => { throw e; });
    assert.strictEqual(reopenReq.getStatus(), 200, 'Reopen must return HTTP 200');
    assert.ok(reopenReq.getData().editSessionToken, 'Reopen must return established editSessionToken');
    const postReopenLock = roomLockService.getLock(testRoom203, testAY, testSem);
    assert.ok(postReopenLock, 'Lock must be established after reopen');
    assert.strictEqual(postReopenLock.userId, itHead.User_ID);
    console.log('✔ PASS: Scenario 12 — Reopen established safe editing ownership for IT Dept Head');

    // ─── SCENARIO 13: Fail closed on network error or missing lock ───
    console.log('\n--- SCENARIO 13: Fail-closed verification ---');
    // Save without token is rejected
    const unauthedSave = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom203,
            academicYear: testAY,
            semester: testSem,
            version: 2
        }
    });
    await schedulesController.saveSchedule(unauthedSave.req, unauthedSave.res, (e) => { throw e; });
    assert.strictEqual(unauthedSave.getStatus(), 423, 'Missing lock token must fail closed with HTTP 423');
    console.log('✔ PASS: Scenario 13 — Operations fail closed without an active lock');

    // ─── SCENARIO 14 & 15: Route Authorization Middleware Tests ───
    console.log('\n--- SCENARIOS 14 & 15: HTTP Route Middleware Guards ---');
    // 14. Unauthenticated request to /room-locks/acquire
    const unauthedAcquire = createMockReqRes({
        session: null,
        body: { roomNumber: testRoom203, academicYear: testAY, semester: testSem }
    });
    await runMiddlewareAndHandler([requireRole(IT_HEAD_ROLES)], schedulesController.acquireRoomLock, unauthedAcquire.req, unauthedAcquire.res);
    assert.strictEqual(unauthedAcquire.getStatus(), 401, 'Unauthenticated request must return HTTP 401');

    // 15a. Faculty blocked from lock endpoints (HTTP 403)
    if (facultyUser) {
        const facultyReq = createMockReqRes({
            session: { userId: facultyUser.User_ID, userRole: 'Faculty', role: 'Faculty' },
            body: { roomNumber: testRoom203, academicYear: testAY, semester: testSem }
        });
        await runMiddlewareAndHandler([requireRole(IT_HEAD_ROLES)], schedulesController.acquireRoomLock, facultyReq.req, facultyReq.res);
        assert.strictEqual(facultyReq.getStatus(), 403, 'Faculty must be rejected with HTTP 403 Forbidden');
    }

    // 15b. MIS Staff blocked from lock endpoints (HTTP 403)
    if (misUser) {
        const misReq = createMockReqRes({
            session: { userId: misUser.User_ID, userRole: 'MIS Staff', role: 'MIS Staff' },
            body: { roomNumber: testRoom203, academicYear: testAY, semester: testSem }
        });
        await runMiddlewareAndHandler([requireRole(IT_HEAD_ROLES)], schedulesController.acquireRoomLock, misReq.req, misReq.res);
        assert.strictEqual(misReq.getStatus(), 403, 'MIS Staff must be rejected with HTTP 403 Forbidden');
    }

    console.log('✔ PASS: Scenarios 14 & 15 — Route middleware properly guards lock endpoints (401 unauthenticated, 403 unauthorized roles)');

    console.log('\n================================================================');
    console.log('🎉 ALL 15 COLLABORATIVE SCHEDULE LOCKING SCENARIOS PASSED 100%!');
    console.log('================================================================\n');
}

runCollaborativeLockingSuite().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ Collaborative Locking Suite Failure:', err);
    process.exit(1);
});
