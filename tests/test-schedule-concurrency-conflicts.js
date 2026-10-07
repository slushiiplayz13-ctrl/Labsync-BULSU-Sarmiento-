'use strict';

const assert = require('assert');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');

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

    console.log('\n🎉 ALL Phase 1 Concurrency & Conflict Tests PASSED SUCCESSFULLY!\n');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
