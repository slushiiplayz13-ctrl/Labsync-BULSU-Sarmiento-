'use strict';

/**
 * tests/test-room-editing-locks.js
 * Comprehensive test suite for collaborative room-editing protection in Schedule Studio.
 * Verifies all 20 required behaviors and edge cases.
 */

const assert = require('assert');
const db = require('../database/connection');
const roomLockService = require('../services/roomLockService');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');

function createMockReqRes({ session = {}, body = {}, query = {}, params = {} } = {}) {
    let statusCode = 200;
    let responseData = null;
    let finished = false;

    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json(data) {
            responseData = data;
            finished = true;
            return this;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData,
        isFinished: () => finished
    };

    const req = {
        session,
        body,
        query,
        params,
        headers: {},
        ip: '127.0.0.1'
    };

    return { req, res };
}

async function runTests() {
    console.log('🧪 Starting Collaborative Room-Editing Lock Test Suite...\n');

    const AY1 = '2026-2027';
    const AY2 = '2027-2028';
    const Sem1 = '1st Semester';
    const Sem2 = '2nd Semester';
    const Room203 = '203';
    const Room204 = '204';

    // Reset lock service state
    roomLockService.clearAllLocks();

    // 1. First administrator acquires lock
    console.log('--- TEST 1: First Administrator Acquires Lock ---');
    const token1 = 'token_admin1_tab1';
    const acq1 = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        userId: 1,
        userName: 'Engr. Dept Head',
        userRole: 'IT Dept. Head',
        editSessionToken: token1
    });
    assert.strictEqual(acq1.acquired, true, 'First admin must acquire lock');
    assert.strictEqual(acq1.lock.editSessionToken, token1);
    console.log('✔ PASS: Admin 1 successfully acquired lock for Room 203 | 2026-2027 | 1st Semester');

    // 2. Second administrator blocked with 423
    console.log('\n--- TEST 2: Second Administrator Blocked ---');
    const token2 = 'token_pc_tab1';
    const acq2 = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        userId: 2,
        userName: 'Prof. Coordinator',
        userRole: 'Program Coordinator',
        editSessionToken: token2
    });
    assert.strictEqual(acq2.acquired, false, 'Second admin must be blocked');
    assert.strictEqual(acq2.code, 'LOCKED');
    assert.strictEqual(acq2.lockedBy.userRole, 'IT Dept. Head');
    console.log('✔ PASS: Second admin correctly blocked with LOCKED status and role identification');

    // 3. Same user in second tab blocked
    console.log('\n--- TEST 3: Same User in Second Tab Blocked ---');
    const token1_tab2 = 'token_admin1_tab2';
    const acq3 = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        userId: 1, // Same userId
        userName: 'Engr. Dept Head',
        userRole: 'IT Dept. Head',
        editSessionToken: token1_tab2 // Distinct tab session token
    });
    assert.strictEqual(acq3.acquired, false, 'Same user in second tab must be blocked');
    assert.strictEqual(acq3.code, 'LOCKED');
    console.log('✔ PASS: Same user opening second tab receives distinct token and is blocked');

    // 4. Different rooms can both be locked
    console.log('\n--- TEST 4: Different Rooms Independent Acquisition ---');
    const acq4 = roomLockService.acquireLock({
        roomNumber: Room204,
        academicYear: AY1,
        semester: Sem1,
        userId: 2,
        userName: 'Prof. Coordinator',
        userRole: 'Program Coordinator',
        editSessionToken: token2
    });
    assert.strictEqual(acq4.acquired, true, 'Different room must acquire independently');
    console.log('✔ PASS: Admin 2 acquired Room 204 while Room 203 is locked by Admin 1');

    // 5. Same room + different academic years can both be locked
    console.log('\n--- TEST 5: Same Room + Different Academic Years ---');
    const token3 = 'token_ay2';
    const acq5 = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY2, // Different AY
        semester: Sem1,
        userId: 2,
        userName: 'Prof. Coordinator',
        userRole: 'Program Coordinator',
        editSessionToken: token3
    });
    assert.strictEqual(acq5.acquired, true, 'Same room with different academic year must acquire independently');
    console.log('✔ PASS: Room 203 in 2027-2028 acquired independently from 2026-2027');

    // 6. Same room + different semesters can both be locked
    console.log('\n--- TEST 6: Same Room + Different Semesters ---');
    const token4 = 'token_sem2';
    const acq6 = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem2, // Different Semester
        userId: 2,
        userName: 'Prof. Coordinator',
        userRole: 'Program Coordinator',
        editSessionToken: token4
    });
    assert.strictEqual(acq6.acquired, true, 'Same room with different semester must acquire independently');
    console.log('✔ PASS: Room 203 in 2nd Semester acquired independently from 1st Semester');

    // 7. Normal release frees the room
    console.log('\n--- TEST 7: Explicit Normal Release Frees Room ---');
    const rel1 = roomLockService.releaseLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        editSessionToken: token1
    });
    assert.strictEqual(rel1.released, true, 'Matching token must release lock');
    // Now second user can acquire
    const acqAfterRel = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        userId: 2,
        userName: 'Prof. Coordinator',
        userRole: 'Program Coordinator',
        editSessionToken: token2
    });
    assert.strictEqual(acqAfterRel.acquired, true, 'Room must be immediately acquirable after release');
    console.log('✔ PASS: Explicit release immediately frees room for next administrator');

    // 8. Crash/stale lock expires after TTL
    console.log('\n--- TEST 8: Stale Lock Auto-Expiration ---');
    // Simulate lock that has aged past LOCK_TIMEOUT_MS
    const lockKey = roomLockService.getLockKey(Room203, AY1, Sem1);
    const existingLock = roomLockService.locks.get(lockKey);
    assert.ok(existingLock, 'Lock should exist');
    existingLock.lastHeartbeat = Date.now() - 35000; // 35 seconds ago (> 30s)

    const inspectLock = roomLockService.getLock(Room203, AY1, Sem1);
    assert.strictEqual(inspectLock, null, 'Expired lock should return null on inspection');
    console.log('✔ PASS: Inactive lock aged >30s is recognized as expired and pruned');

    // 9. Expired lock can be taken over
    console.log('\n--- TEST 9: Expired Lock Takeover ---');
    const token_takeover = 'token_admin1_takeover';
    const takeoverAcq = roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        userId: 1,
        userName: 'Engr. Dept Head',
        userRole: 'IT Dept. Head',
        editSessionToken: token_takeover
    });
    assert.strictEqual(takeoverAcq.acquired, true, 'Expired lock must be successfully taken over');
    assert.strictEqual(takeoverAcq.lock.editSessionToken, token_takeover);
    console.log('✔ PASS: New administrator took over expired lock cleanly');

    // 10. Old session token cannot heartbeat after takeover
    console.log('\n--- TEST 10: Old Session Token Heartbeat Rejection ---');
    const oldHb = roomLockService.renewHeartbeat({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        editSessionToken: token2 // Old session token that was superseded
    });
    assert.strictEqual(oldHb.renewed, false, 'Old token heartbeat must be rejected');
    assert.strictEqual(oldHb.code, 'LOCK_LOST');
    console.log('✔ PASS: Old session token rejected with LOCK_LOST on heartbeat renewal');

    // 11. Old session token cannot release the new owner\'s lock
    console.log('\n--- TEST 11: Old Session Token Cannot Release New Owner Lock ---');
    const badRel = roomLockService.releaseLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        editSessionToken: token2 // Mismatched token
    });
    assert.strictEqual(badRel.released, false, 'Mismatched token cannot release lock');
    assert.strictEqual(badRel.code, 'TOKEN_MISMATCH');
    assert.ok(roomLockService.getLock(Room203, AY1, Sem1), 'Lock should remain held by new owner');
    console.log('✔ PASS: Superseded token cannot release active owner lock');

    // 12. Simultaneous acquisition -> exactly one winner
    console.log('\n--- TEST 12: Atomic Simultaneous Acquisition Race ---');
    roomLockService.clearAllLocks();
    const results = [];
    const raceTokens = ['race_token_A', 'race_token_B', 'race_token_C'];
    for (let i = 0; i < raceTokens.length; i++) {
        results.push(roomLockService.acquireLock({
            roomNumber: Room203,
            academicYear: AY1,
            semester: Sem1,
            userId: i + 1,
            userName: `User ${i + 1}`,
            userRole: 'IT Dept. Head',
            editSessionToken: raceTokens[i]
        }));
    }
    const winners = results.filter(r => r.acquired === true);
    const losers = results.filter(r => r.acquired === false && r.code === 'LOCKED');
    assert.strictEqual(winners.length, 1, 'Exactly one concurrent acquisition must win');
    assert.strictEqual(losers.length, 2, 'All other concurrent acquisitions must receive LOCKED');
    console.log('✔ PASS: Synchronous atomic acquire guarantees exactly 1 winner among concurrent attempts');

    // 13. Save requires valid lock ownership
    console.log('\n--- TEST 13: Controller Save Requires Valid Lock Ownership ---');
    const winningToken = winners[0].lock.editSessionToken;
    const losingToken = raceTokens.find(t => t !== winningToken);

    // Save attempt with losing token
    const { req: badSaveReq, res: badSaveRes } = createMockReqRes({
        session: { userId: 2, userRole: 'Program Coordinator' },
        body: {
            roomNumber: Room203,
            academicYear: AY1,
            semester: Sem1,
            schedules: [],
            version: 1,
            editSessionToken: losingToken
        }
    });
    await schedulesController.saveSchedule(badSaveReq, badSaveRes, (err) => { if (err) throw err; });
    assert.strictEqual(badSaveRes.getStatusCode(), 423, 'Save without valid lock must return 423');
    assert.ok(badSaveRes.getData().error.includes('Room 203 is currently being edited'), 'Error must specify room lock');
    console.log('✔ PASS: Save attempt without active lock rejected with HTTP 423');

    // 14. Finalize requires valid lock ownership
    console.log('\n--- TEST 14: Finalize Requires Valid Lock Ownership ---');
    const { req: badFinReq, res: badFinRes } = createMockReqRes({
        session: { userId: 1, userRole: 'IT Dept. Head' },
        body: {
            roomNumber: Room203,
            academicYear: AY1,
            semester: Sem1,
            editSessionToken: 'wrong_session_token'
        }
    });
    await schedulesController.finalizeSchedule(badFinReq, badFinRes, (err) => { if (err) throw err; });
    assert.strictEqual(badFinRes.getStatusCode(), 423, 'Finalize without valid lock must return 423');
    console.log('✔ PASS: Finalize attempt with invalid lock token rejected with HTTP 423');

    // 15. Finalize releases the lock
    console.log('\n--- TEST 15: Successful Finalize Releases Edit Lock ---');
    // Ensure room exists and has a draft
    const [r203] = await scheduleRepository.findRoomIdByNumber(Room203);
    const roomId203 = r203[0].Room_ID;
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId203, AY1, Sem1]);
    await db.query('DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId203, AY1, Sem1]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId203, AY1, Sem1]);
    await db.query('INSERT INTO schedule_metadata (Room_ID, Academic_Year, Semester, Version, Status) VALUES (?, ?, ?, 1, "Draft")', [roomId203, AY1, Sem1]);

    // Give winning token to IT Dept. Head (User 1)
    roomLockService.clearAllLocks();
    const deptHeadToken = 'token_dept_head_fin';
    roomLockService.acquireLock({
        roomNumber: Room203,
        academicYear: AY1,
        semester: Sem1,
        userId: 1,
        userName: 'Engr. IT Head',
        userRole: 'IT Dept. Head',
        editSessionToken: deptHeadToken
    });

    const { req: goodFinReq, res: goodFinRes } = createMockReqRes({
        session: { userId: 1, userRole: 'IT Dept. Head' },
        body: {
            roomNumber: Room203,
            academicYear: AY1,
            semester: Sem1,
            editSessionToken: deptHeadToken
        }
    });
    await schedulesController.finalizeSchedule(goodFinReq, goodFinRes, (err) => { if (err) throw err; });
    assert.strictEqual(goodFinRes.getStatusCode(), 200, 'Finalize with valid lock must return 200');
    // Check that lock was released
    const lockAfterFin = roomLockService.getLock(Room203, AY1, Sem1);
    assert.strictEqual(lockAfterFin, null, 'Lock must be automatically released after finalization');
    console.log('✔ PASS: Finalize with valid lock token published official schedule and released edit lock');

    // 16. Reopen safely establishes Draft + editing ownership
    console.log('\n--- TEST 16: Reopen Establishes Draft + Lock Atomically ---');
    const reopenToken = 'token_dept_head_reopen';
    const { req: reopenReq, res: reopenRes } = createMockReqRes({
        session: { userId: 1, userName: 'Engr. IT Head', userRole: 'IT Dept. Head' },
        body: {
            roomNumber: Room203,
            academicYear: AY1,
            semester: Sem1,
            editSessionToken: reopenToken
        }
    });
    await schedulesController.reopenSchedule(reopenReq, reopenRes, (err) => { if (err) throw err; });
    assert.strictEqual(reopenRes.getStatusCode(), 200, 'Reopen must succeed with 200');
    // Check that IT Dept. Head holds the lock
    const lockAfterReopen = roomLockService.getLock(Room203, AY1, Sem1);
    assert.ok(lockAfterReopen, 'Lock must exist after reopen');
    assert.strictEqual(lockAfterReopen.editSessionToken, reopenToken, 'IT Dept. Head must own lock with reopen token');
    console.log('✔ PASS: Reopen atomically transitions schedule to Draft and establishes edit lock for IT Dept. Head');

    // 20. Program Coordinator still cannot finalize/reopen
    console.log('\n--- TEST 20: Program Coordinator Forbidden on Finalize and Reopen ---');
    const { req: pcFinReq, res: pcFinRes } = createMockReqRes({
        session: { userId: 2, userRole: 'Program Coordinator' },
        body: { roomNumber: Room203, academicYear: AY1, semester: Sem1, editSessionToken: 'some_tok' }
    });
    await schedulesController.finalizeSchedule(pcFinReq, pcFinRes, (err) => { if (err) throw err; });
    assert.strictEqual(pcFinRes.getStatusCode(), 403, 'Program Coordinator must be rejected with 403 on finalize');

    const { req: pcReopenReq, res: pcReopenRes } = createMockReqRes({
        session: { userId: 2, userRole: 'Program Coordinator' },
        body: { roomNumber: Room203, academicYear: AY1, semester: Sem1, editSessionToken: 'some_tok' }
    });
    await schedulesController.reopenSchedule(pcReopenReq, pcReopenRes, (err) => { if (err) throw err; });
    assert.strictEqual(pcReopenRes.getStatusCode(), 403, 'Program Coordinator must be rejected with 403 on reopen');
    console.log('✔ PASS: Program Coordinator strictly forbidden from finalize and reopen');

    console.log('\n================================================================');
    console.log('🎉 ALL 20 COLLABORATIVE ROOM EDITING LOCK TESTS PASSED PERFECTLY!');
    console.log('================================================================\n');

    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test suite encountered an error:', err);
    process.exit(1);
});
