'use strict';

const assert = require('assert');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');
const roomLockService = require('../services/roomLockService');

function createMockReqRes({ session, body = {} }) {
    let statusCode = 200;
    let responseData = null;

    const req = {
        session,
        body,
        query: {},
        params: {},
        ip: '127.0.0.1'
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

async function runTests() {
    console.log('🧪 Starting Schedule Concurrency & Conflict Validation Test Suite...');

    const testAY = '2026-2027';
    const testSem = '1st Semester';
    const testRoom1 = '203';
    const testRoom2 = '204';

    // 0. Ensure clean state for test room and test terms
    const [rooms1] = await scheduleRepository.findRoomIdByNumber(testRoom1);
    const [rooms2] = await scheduleRepository.findRoomIdByNumber(testRoom2);
    assert.ok(rooms1.length > 0, 'Room 203 must exist');
    assert.ok(rooms2.length > 0, 'Room 204 must exist');
    const roomId1 = rooms1[0].Room_ID;
    const roomId2 = rooms2[0].Room_ID;

    // Reset schedules and metadata for test rooms
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId1, roomId2, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId1, roomId2, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId1, roomId2, testAY, testSem]);

    // Fetch initial schedule (should return empty schedules and version 1)
    const initial = await scheduleService.getRoomSchedule(testRoom1, testAY, testSem);
    assert.strictEqual(initial.status, 200);
    assert.strictEqual(initial.data.version, 1);
    assert.strictEqual(initial.data.status, 'Draft');
    assert.strictEqual(initial.data.schedules.length, 0);
    console.log('✓ Initial getRoomSchedule returns version 1 and status Draft');

    // 1. Same-room overlap validation: Two overlapping classes in Room 203
    const overlappingSchedule = [
        {
            subject: 'Subject A',
            section: 'BSIT 3A',
            day: 'Monday',
            startTime: '09:00:00',
            endTime: '10:00:00',
            professor: 'Not specified'
        },
        {
            subject: 'Subject B',
            section: 'BSIT 3B',
            day: 'Monday',
            startTime: '09:30:00',
            endTime: '10:30:00',
            professor: 'Not specified'
        }
    ];

    const overlapResult = await scheduleService.saveRoomSchedule(testRoom1, overlappingSchedule, testAY, testSem, 1, 1);
    assert.strictEqual(overlapResult.status, 400);
    assert.ok(overlapResult.error.includes('overlaps with'), `Expected overlap error but got: ${overlapResult.error}`);
    console.log('✓ Same-room overlapping classes correctly rejected with 400');

    // 2. Adjacent classes (09:00–10:00 and 10:00–11:00) should NOT overlap
    const adjacentSchedule = [
        {
            subject: 'Subject A',
            section: 'BSIT 3A',
            day: 'Monday',
            startTime: '09:00:00',
            endTime: '10:00:00',
            professor: 'Not specified'
        },
        {
            subject: 'Subject B',
            section: 'BSIT 3B',
            day: 'Monday',
            startTime: '10:00:00',
            endTime: '11:00:00',
            professor: 'Not specified'
        }
    ];

    const validSaveResult = await scheduleService.saveRoomSchedule(testRoom1, adjacentSchedule, testAY, testSem, 1, 1);
    assert.strictEqual(validSaveResult.status, 200, `Save should succeed: ${JSON.stringify(validSaveResult)}`);
    assert.strictEqual(validSaveResult.version, 2, 'Version should increment to 2');
    console.log('✓ Valid adjacent schedule saves successfully and increments version to 2');

    // Verify persisted version
    const afterFirstSave = await scheduleService.getRoomSchedule(testRoom1, testAY, testSem);
    assert.strictEqual(afterFirstSave.data.version, 2);
    assert.strictEqual(afterFirstSave.data.schedules.length, 2);
    console.log('✓ getRoomSchedule returns updated version 2 and 2 entries');

    // 3. Stale save rejection (Optimistic Concurrency Control):
    // Trying to save with stale version 1 when current version is 2
    const staleSave = await scheduleService.saveRoomSchedule(testRoom1, [], testAY, testSem, 1, 1);
    assert.strictEqual(staleSave.status, 409, 'Stale save must return 409 Conflict');
    assert.ok(staleSave.error.includes('modified by another administrator'), 'Expected stale modification error');
    console.log('✓ Stale save with version 1 rejected with 409 Conflict');

    // Verify database was NOT wiped out by the stale save
    const afterStaleAttempt = await scheduleService.getRoomSchedule(testRoom1, testAY, testSem);
    assert.strictEqual(afterStaleAttempt.data.version, 2);
    assert.strictEqual(afterStaleAttempt.data.schedules.length, 2, 'Existing schedules must NOT be wiped by stale save');
    console.log('✓ Stale save did NOT delete existing schedules in database');

    // 4. Save with correct current version 2 succeeds and increments to version 3
    const validSecondSave = await scheduleService.saveRoomSchedule(testRoom1, adjacentSchedule, testAY, testSem, 2, 1);
    assert.strictEqual(validSecondSave.status, 200);
    assert.strictEqual(validSecondSave.version, 3, 'Version should increment to 3');
    console.log('✓ Save with current version 2 succeeds and increments to version 3');

    // 5. Cross-room faculty double-booking validation:
    // Find an actual faculty user in database
    const [facultyUsers] = await db.query("SELECT Name FROM users WHERE Role IN ('Faculty', 'IT Dept. Head', 'Program Coordinator') LIMIT 1");
    assert.ok(facultyUsers.length > 0, 'Must have at least one faculty user in DB');
    const testProfessor = facultyUsers[0].Name;

    // Schedule testProfessor in Room 203 on Tuesday 08:00–10:00
    const profRoom1Schedule = [
        {
            subject: 'Web Development',
            section: 'BSIT 2A',
            day: 'Tuesday',
            startTime: '08:00:00',
            endTime: '10:00:00',
            professor: testProfessor
        }
    ];
    const saveRoom1Prof = await scheduleService.saveRoomSchedule(testRoom1, profRoom1Schedule, testAY, testSem, 3, 1);
    assert.strictEqual(saveRoom1Prof.status, 200);
    console.log(`✓ Scheduled Professor ${testProfessor} in Room 203 on Tuesday 08:00–10:00`);

    // Now attempt to schedule the SAME professor in Room 204 on Tuesday 09:00–11:00 (overlapping 09:00–10:00)
    const profRoom2Clash = [
        {
            subject: 'Database Systems',
            section: 'BSIT 2B',
            day: 'Tuesday',
            startTime: '09:00:00',
            endTime: '11:00:00',
            professor: testProfessor
        }
    ];
    const clashResult = await scheduleService.saveRoomSchedule(testRoom2, profRoom2Clash, testAY, testSem, 1, 1);
    assert.strictEqual(clashResult.status, 400, 'Cross-room faculty clash must be rejected with 400');
    assert.ok(clashResult.error.includes('already scheduled in Room 203'), `Expected cross-room clash error, got: ${clashResult.error}`);
    console.log('✓ Cross-room faculty double-booking correctly rejected by backend');

    // Non-overlapping class for same professor in Room 204 (Tuesday 10:00–12:00) should SUCCEED
    const profRoom2NoClash = [
        {
            subject: 'Database Systems',
            section: 'BSIT 2B',
            day: 'Tuesday',
            startTime: '10:00:00',
            endTime: '12:00:00',
            professor: testProfessor
        }
    ];
    const noClashResult = await scheduleService.saveRoomSchedule(testRoom2, profRoom2NoClash, testAY, testSem, 1, 1);
    assert.strictEqual(noClashResult.status, 200, `Non-overlapping class should save: ${JSON.stringify(noClashResult)}`);
    console.log('✓ Non-overlapping class for same professor in Room 204 succeeds');

    // Cleanup test data
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId1, roomId2, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId1, roomId2, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId1, roomId2, testAY, testSem]);

    console.log('\n🎉 Phase 1 Sequential Concurrency & Conflict Tests PASSED SUCCESSFULLY!\n');

    // =================================================================
    // PHASE 2: TRUE CONCURRENT CROSS-ROOM PROFESSOR CONFLICT SUITE
    // =================================================================
    console.log('================================================================');
    console.log('🧪 Starting Phase 2: Real Concurrent Cross-Room Conflict Tests...');
    console.log('================================================================\n');

    const concAY = '2098-2099';
    const concSem = '1st Semester';

    async function cleanupPhase2() {
        await db.query('DELETE FROM schedules WHERE Academic_Year = ?', [concAY]);
        await db.query('DELETE FROM schedule_drafts WHERE Academic_Year = ?', [concAY]);
        await db.query('DELETE FROM schedule_metadata WHERE Academic_Year = ?', [concAY]);
        roomLockService.clearAllLocks();
    }

    try {
        await cleanupPhase2();

        // Identify administrators and professors
        const [itRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
        const [pcRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
        const [facRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Faculty' LIMIT 2");

        assert.ok(itRows.length > 0, 'IT Dept. Head must exist');
        assert.ok(pcRows.length > 0, 'Program Coordinator must exist');
        assert.ok(facRows.length >= 2, 'At least 2 Faculty users must exist for independent concurrency tests');

        const adminIT = itRows[0];
        const adminPC = pcRows[0];
        const profA = facRows[0];
        const profB = facRows[1];

        // --- CASE A: Same professor, conflicting assignments across rooms (concurrent saves) ---
        console.log('--- Case A: Concurrent conflicting saves across rooms for same professor ---');
        const tokenA1 = 'token_it_203_' + Date.now();
        const tokenA2 = 'token_pc_204_' + Date.now();

        roomLockService.acquireLock({
            roomNumber: testRoom1, academicYear: concAY, semester: concSem,
            userId: adminIT.User_ID, userName: adminIT.Name, userRole: adminIT.Role, editSessionToken: tokenA1
        });
        roomLockService.acquireLock({
            roomNumber: testRoom2, academicYear: concAY, semester: concSem,
            userId: adminPC.User_ID, userName: adminPC.Name, userRole: adminPC.Role, editSessionToken: tokenA2
        });

        const reqA1 = createMockReqRes({
            session: { userId: adminIT.User_ID, email: adminIT.Email, userRole: adminIT.Role, role: adminIT.Role },
            body: {
                roomNumber: testRoom1, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokenA1,
                schedules: [{ subject: 'Web Dev', section: '3A', day: 'Monday', startTime: '08:00:00', endTime: '10:00:00', professor: profA.Name }]
            }
        });
        const reqA2 = createMockReqRes({
            session: { userId: adminPC.User_ID, email: adminPC.Email, userRole: adminPC.Role, role: adminPC.Role },
            body: {
                roomNumber: testRoom2, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokenA2,
                schedules: [{ subject: 'Database Sys', section: '3B', day: 'Monday', startTime: '08:00:00', endTime: '10:00:00', professor: profA.Name }]
            }
        });

        let errA1 = null, errA2 = null;
        await Promise.allSettled([
            schedulesController.saveSchedule(reqA1.req, reqA1.res, (e) => { errA1 = e; }),
            schedulesController.saveSchedule(reqA2.req, reqA2.res, (e) => { errA2 = e; })
        ]);

        const statusesA = [reqA1.getStatus(), reqA2.getStatus()].sort((a, b) => a - b);
        assert.deepStrictEqual(statusesA, [200, 400], `Expected exactly one HTTP 200 and one HTTP 400, got: [${reqA1.getStatus()}, ${reqA2.getStatus()}]`);
        assert.strictEqual(errA1, null, 'Save 1 must not throw unhandled exception');
        assert.strictEqual(errA2, null, 'Save 2 must not throw unhandled exception');

        const rejectedDataA = (reqA1.getStatus() === 400 ? reqA1.getData() : reqA2.getData());
        assert.ok(rejectedDataA && rejectedDataA.error && rejectedDataA.error.includes('already scheduled in Room'), 'Conflict rejection error must identify conflicting room');

        // Verify directly in DB that only 1 draft row exists for profA on Monday
        const [persistedDraftsA] = await db.query(
            'SELECT Draft_ID, Room_ID FROM schedule_drafts WHERE Academic_Year = ? AND User_ID = ? AND Day_of_Week = "Monday"',
            [concAY, profA.User_ID]
        );
        assert.strictEqual(persistedDraftsA.length, 1, `Database must contain exactly 1 draft, but found ${persistedDraftsA.length}`);
        console.log('✓ Case A: Concurrent conflicting save serialized: exactly 1 succeeded (200), exactly 1 rejected (400), 1 persisted in DB');

        await cleanupPhase2();

        // --- CASE B: Sequential conflict remains protected ---
        console.log('\n--- Case B: Sequential cross-room conflict validation ---');
        const tokenB1 = 'token_b1_' + Date.now();
        const tokenB2 = 'token_b2_' + Date.now();

        roomLockService.acquireLock({
            roomNumber: testRoom1, academicYear: concAY, semester: concSem,
            userId: adminIT.User_ID, userName: adminIT.Name, userRole: adminIT.Role, editSessionToken: tokenB1
        });
        roomLockService.acquireLock({
            roomNumber: testRoom2, academicYear: concAY, semester: concSem,
            userId: adminPC.User_ID, userName: adminPC.Name, userRole: adminPC.Role, editSessionToken: tokenB2
        });

        const reqB1 = createMockReqRes({
            session: { userId: adminIT.User_ID, email: adminIT.Email, userRole: adminIT.Role, role: adminIT.Role },
            body: {
                roomNumber: testRoom1, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokenB1,
                schedules: [{ subject: 'Networking', section: '2A', day: 'Wednesday', startTime: '08:00:00', endTime: '10:00:00', professor: profA.Name }]
            }
        });
        await schedulesController.saveSchedule(reqB1.req, reqB1.res, (e) => { throw e; });
        assert.strictEqual(reqB1.getStatus(), 200, 'Initial save must return 200');

        const reqB2 = createMockReqRes({
            session: { userId: adminPC.User_ID, email: adminPC.Email, userRole: adminPC.Role, role: adminPC.Role },
            body: {
                roomNumber: testRoom2, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokenB2,
                schedules: [{ subject: 'Operating Sys', section: '2B', day: 'Wednesday', startTime: '09:00:00', endTime: '11:00:00', professor: profA.Name }]
            }
        });
        await schedulesController.saveSchedule(reqB2.req, reqB2.res, (e) => { throw e; });
        assert.strictEqual(reqB2.getStatus(), 400, 'Sequential overlapping save must return 400');
        assert.ok(reqB2.getData().error.includes('already scheduled in Room 203'));
        console.log('✓ Case B: Sequential conflicting save correctly rejected with 400');

        await cleanupPhase2();

        // --- CASE C: Non-conflicting assignments remain possible ---
        console.log('\n--- Case C: Concurrent non-conflicting saves remain possible ---');
        const tokenC1 = 'token_c1_' + Date.now();
        const tokenC2 = 'token_c2_' + Date.now();

        roomLockService.acquireLock({
            roomNumber: testRoom1, academicYear: concAY, semester: concSem,
            userId: adminIT.User_ID, userName: adminIT.Name, userRole: adminIT.Role, editSessionToken: tokenC1
        });
        roomLockService.acquireLock({
            roomNumber: testRoom2, academicYear: concAY, semester: concSem,
            userId: adminPC.User_ID, userName: adminPC.Name, userRole: adminPC.Role, editSessionToken: tokenC2
        });

        // Admin 1 saves profA in Room 203; Admin 2 saves profB in Room 204 (different professors)
        const reqC1 = createMockReqRes({
            session: { userId: adminIT.User_ID, email: adminIT.Email, userRole: adminIT.Role, role: adminIT.Role },
            body: {
                roomNumber: testRoom1, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokenC1,
                schedules: [{ subject: 'Software Eng', section: '4A', day: 'Thursday', startTime: '08:00:00', endTime: '10:00:00', professor: profA.Name }]
            }
        });
        const reqC2 = createMockReqRes({
            session: { userId: adminPC.User_ID, email: adminPC.Email, userRole: adminPC.Role, role: adminPC.Role },
            body: {
                roomNumber: testRoom2, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokenC2,
                schedules: [{ subject: 'Information Sec', section: '4B', day: 'Thursday', startTime: '08:00:00', endTime: '10:00:00', professor: profB.Name }]
            }
        });

        await Promise.all([
            schedulesController.saveSchedule(reqC1.req, reqC1.res, (e) => { throw e; }),
            schedulesController.saveSchedule(reqC2.req, reqC2.res, (e) => { throw e; })
        ]);

        assert.strictEqual(reqC1.getStatus(), 200, 'Non-conflicting save 1 must return 200');
        assert.strictEqual(reqC2.getStatus(), 200, 'Non-conflicting save 2 must return 200');

        // Also save same professor (profA) in Room 204 at non-overlapping time (10:00-12:00)
        const reqC3 = createMockReqRes({
            session: { userId: adminPC.User_ID, email: adminPC.Email, userRole: adminPC.Role, role: adminPC.Role },
            body: {
                roomNumber: testRoom2, academicYear: concAY, semester: concSem, version: 2, editSessionToken: tokenC2,
                schedules: [
                    { subject: 'Information Sec', section: '4B', day: 'Thursday', startTime: '08:00:00', endTime: '10:00:00', professor: profB.Name },
                    { subject: 'Mobile Dev', section: '4C', day: 'Thursday', startTime: '10:00:00', endTime: '12:00:00', professor: profA.Name }
                ]
            }
        });
        await schedulesController.saveSchedule(reqC3.req, reqC3.res, (e) => { throw e; });
        assert.strictEqual(reqC3.getStatus(), 200, 'Non-overlapping class for same professor must save with 200');
        console.log('✓ Case C: Concurrent non-conflicting saves and non-overlapping professor saves succeeded with 200');

        await cleanupPhase2();

        // --- CASE D: Repeated concurrency test ---
        console.log('\n--- Case D: Repeated concurrency race testing (5 iterations) ---');
        for (let i = 1; i <= 5; i++) {
            await cleanupPhase2();

            const tokD1 = 'tok_d1_' + i + '_' + Date.now();
            const tokD2 = 'tok_d2_' + i + '_' + Date.now();

            roomLockService.acquireLock({
                roomNumber: testRoom1, academicYear: concAY, semester: concSem,
                userId: adminIT.User_ID, userName: adminIT.Name, userRole: adminIT.Role, editSessionToken: tokD1
            });
            roomLockService.acquireLock({
                roomNumber: testRoom2, academicYear: concAY, semester: concSem,
                userId: adminPC.User_ID, userName: adminPC.Name, userRole: adminPC.Role, editSessionToken: tokD2
            });

            const reqD1 = createMockReqRes({
                session: { userId: adminIT.User_ID, email: adminIT.Email, userRole: adminIT.Role, role: adminIT.Role },
                body: {
                    roomNumber: testRoom1, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokD1,
                    schedules: [{ subject: 'Iter Subject', section: '3A', day: 'Friday', startTime: '13:00:00', endTime: '15:00:00', professor: profA.Name }]
                }
            });
            const reqD2 = createMockReqRes({
                session: { userId: adminPC.User_ID, email: adminPC.Email, userRole: adminPC.Role, role: adminPC.Role },
                body: {
                    roomNumber: testRoom2, academicYear: concAY, semester: concSem, version: 1, editSessionToken: tokD2,
                    schedules: [{ subject: 'Iter Subject B', section: '3B', day: 'Friday', startTime: '13:00:00', endTime: '15:00:00', professor: profA.Name }]
                }
            });

            let errD1 = null, errD2 = null;
            await Promise.allSettled([
                schedulesController.saveSchedule(reqD1.req, reqD1.res, (e) => { errD1 = e; }),
                schedulesController.saveSchedule(reqD2.req, reqD2.res, (e) => { errD2 = e; })
            ]);

            const iterStatuses = [reqD1.getStatus(), reqD2.getStatus()].sort((a, b) => a - b);
            assert.deepStrictEqual(iterStatuses, [200, 400], `Iteration ${i}: Expected [200, 400], got [${reqD1.getStatus()}, ${reqD2.getStatus()}]`);
            assert.strictEqual(errD1, null, `Iteration ${i}: Save 1 must not throw exception`);
            assert.strictEqual(errD2, null, `Iteration ${i}: Save 2 must not throw exception`);

            const [iterDrafts] = await db.query(
                'SELECT Draft_ID FROM schedule_drafts WHERE Academic_Year = ? AND User_ID = ? AND Day_of_Week = "Friday"',
                [concAY, profA.User_ID]
            );
            assert.strictEqual(iterDrafts.length, 1, `Iteration ${i}: DB must contain exactly 1 draft, found ${iterDrafts.length}`);
            console.log(`  ✓ Iteration ${i}/5 passed: Exactly 1 save succeeded, 1 rejected with 400, 0 unhandled exceptions`);
        }

        console.log('✓ Case D: Repeated concurrency test passed all 5 iterations consistently');

    } finally {
        await cleanupPhase2();
        console.log('✓ Cleaned up Phase 2 test data for AY 2098-2099.');
    }

    console.log('\n🎉 ALL Phase 1 & Phase 2 Concurrency & Conflict Tests PASSED SUCCESSFULLY!\n');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
