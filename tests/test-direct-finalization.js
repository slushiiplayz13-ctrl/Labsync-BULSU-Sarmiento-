'use strict';

const assert = require('assert');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');
const roomLockService = require('../services/roomLockService');

function createMockReqRes({ session, body = {}, query = {}, params = {}, headers = {} }) {
    const req = {
        session,
        body,
        query,
        params,
        headers,
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

async function runDirectFinalizationTests() {
    console.log('================================================================');
    console.log('🧪 DIRECT FINALIZATION REGRESSION TEST SUITE');
    console.log('================================================================\n');

    const testAY = '2026-2027';
    const testSem = 'DirectFinalize-Term';
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

    const [rooms] = await scheduleRepository.findRoomIdByNumber(testRoom);
    const [otherRooms] = await scheduleRepository.findRoomIdByNumber(otherRoom);
    const roomId = rooms[0].Room_ID;
    const otherRoomId = otherRooms[0].Room_ID;

    // Helper for cleaning test records
    async function cleanup() {
        await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
        await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
        await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
        roomLockService.clearAllLocks();
    }

    try {
        await cleanup();

        // =========================================================================
        // SCENARIO 1: Direct Finalization without saving draft
        // =========================================================================
        console.log('--- 1. Direct Finalization Without Saving Draft ---');
        const token1 = 'token_direct_fin_1';
        roomLockService.acquireLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            userName: itHead.Name,
            userRole: itHead.Role,
            editSessionToken: token1
        });

        // Current editor contents: Monday 08:00 - 10:00 for faculty
        const editorCards1 = [
            {
                subject: 'IT 201 - Data Structures',
                professor: faculty.Name,
                section: '2A',
                day: 'Monday',
                startTime: '08:00:00',
                endTime: '10:00:00',
                colorTheme: 'blue'
            }
        ];

        const finMock1 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: editorCards1,
                version: 1
            }
        });

        await schedulesController.finalizeSchedule(finMock1.req, finMock1.res, (err) => { throw err; });
        assert.strictEqual(finMock1.getStatus(), 200, 'Direct finalize must return 200');
        assert.strictEqual(finMock1.getData().status, 'Finalized', 'Status must be Finalized');

        // Verify official schedules table now has the newly finalized schedule
        const [savedOfficial] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(savedOfficial.length, 1, 'Official schedules must have 1 record');
        assert.strictEqual(savedOfficial[0].Subject_Name, 'IT 201 - Data Structures');
        assert.strictEqual(savedOfficial[0].User_ID, faculty.User_ID);
        assert.strictEqual(savedOfficial[0].Start_Time, '08:00:00');
        assert.strictEqual(savedOfficial[0].End_Time, '10:00:00');

        // Verify schedule_drafts is empty
        const [draftsLeft] = await db.query(
            'SELECT * FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(draftsLeft.length, 0, 'No draft records should remain');

        // Verify lock was released upon finalization
        const lockAfter = roomLockService.getLock(testRoom, testAY, testSem);
        assert.strictEqual(lockAfter, null, 'Editing lock must be released after successful finalization');
        console.log('✔ PASS: Direct finalization persists editor entries directly to official schedules');

        // =========================================================================
        // SCENARIO 2: My Schedule panel visibility
        // =========================================================================
        console.log('\n--- 2. My Schedule Panel Data Source Visibility ---');
        const [userSched] = await scheduleRepository.findUserSchedule(faculty.User_ID, testAY, testSem);
        assert.strictEqual(userSched.length, 1, 'My Schedule must return 1 entry for the faculty member');
        assert.strictEqual(userSched[0].Subject_Name, 'IT 201 - Data Structures');
        assert.strictEqual(userSched[0].Room_Number, testRoom);
        assert.strictEqual(userSched[0].Start_Time, '08:00:00');
        assert.strictEqual(userSched[0].End_Time, '10:00:00');

        const userSchedServiceRes = await scheduleService.getUserSchedule(faculty.User_ID, testAY, testSem);
        assert.strictEqual(userSchedServiceRes.status, 200);
        assert.strictEqual(userSchedServiceRes.data.length, 1);
        console.log('✔ PASS: Finalized schedule entries appear correctly in My Schedule data source');

        // =========================================================================
        // SCENARIO 3: Unsaved Edits on an existing draft published directly
        // =========================================================================
        console.log('\n--- 3. Unsaved Edits Directly Finalized Over Stale Draft ---');
        // Reopen schedule for editing
        const reopenMock = createMockReqRes({
            session: itHeadSession,
            body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
        });
        await schedulesController.reopenSchedule(reopenMock.req, reopenMock.res, (err) => { throw err; });
        assert.strictEqual(reopenMock.getStatus(), 200);

        // Save a draft with STALE content: Wednesday 08:00 - 09:00
        const token2 = reopenMock.getData().editSessionToken;
        const staleDraftCards = [
            {
                subject: 'IT 201 - Stale Old Draft',
                professor: faculty.Name,
                section: '2A',
                day: 'Wednesday',
                startTime: '08:00:00',
                endTime: '09:00:00',
                colorTheme: 'blue'
            }
        ];
        const saveDraftMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token2,
                schedules: staleDraftCards,
                version: 1
            }
        });
        await schedulesController.saveSchedule(saveDraftMock.req, saveDraftMock.res, (err) => { throw err; });
        assert.strictEqual(saveDraftMock.getStatus(), 200);

        // User now modifies schedule in editor to Thursday 13:00 - 15:00 and clicks FINALIZE DIRECTLY without Save Draft
        const modifiedEditorCards = [
            {
                subject: 'IT 201 - Brand New Unsaved Edits',
                professor: faculty.Name,
                section: '2B',
                day: 'Thursday',
                startTime: '13:00:00',
                endTime: '15:00:00',
                colorTheme: 'green'
            }
        ];
        const finMock3 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token2,
                schedules: modifiedEditorCards,
                version: saveDraftMock.getData().version
            }
        });
        await schedulesController.finalizeSchedule(finMock3.req, finMock3.res, (err) => { throw err; });
        assert.strictEqual(finMock3.getStatus(), 200);

        // Verify that the OFFICIAL table has the NEW edits (Thursday 13:00-15:00), NOT the stale draft (Wednesday)
        const [updatedOfficial] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(updatedOfficial.length, 1);
        assert.strictEqual(updatedOfficial[0].Subject_Name, 'IT 201 - Brand New Unsaved Edits');
        assert.strictEqual(updatedOfficial[0].Day_of_Week, 'Thursday');
        assert.strictEqual(updatedOfficial[0].Start_Time, '13:00:00');
        assert.strictEqual(updatedOfficial[0].End_Time, '15:00:00');

        // Verify Faculty My Schedule shows the brand new edits
        const [updatedUserSched] = await scheduleRepository.findUserSchedule(faculty.User_ID, testAY, testSem);
        assert.strictEqual(updatedUserSched.length, 1);
        assert.strictEqual(updatedUserSched[0].Subject_Name, 'IT 201 - Brand New Unsaved Edits');
        assert.strictEqual(updatedUserSched[0].Day_of_Week, 'Thursday');
        console.log('✔ PASS: Direct finalization publishes the latest editor contents, not stale draft contents');

        // =========================================================================
        // SCENARIO 4: Validation Failure preserves editor contents & rejects
        // =========================================================================
        console.log('\n--- 4. Validation Failure Rejection ---');
        // Reopen to edit
        const reopenMock2 = createMockReqRes({
            session: itHeadSession,
            body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
        });
        await schedulesController.reopenSchedule(reopenMock2.req, reopenMock2.res, (err) => { throw err; });
        const token3 = reopenMock2.getData().editSessionToken;

        // 4a. Same-room overlap conflict
        const overlappingCards = [
            {
                subject: 'Subject A',
                professor: faculty.Name,
                section: 'A',
                day: 'Monday',
                startTime: '08:00:00',
                endTime: '10:00:00'
            },
            {
                subject: 'Subject B',
                professor: faculty.Name,
                section: 'B',
                day: 'Monday',
                startTime: '09:00:00',
                endTime: '11:00:00'
            }
        ];
        const failFinMock1 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token3,
                schedules: overlappingCards
            }
        });
        await schedulesController.finalizeSchedule(failFinMock1.req, failFinMock1.res, (err) => { throw err; });
        assert.strictEqual(failFinMock1.getStatus(), 400, 'Same-room overlap must be rejected with 400');
        assert.ok(failFinMock1.getData().error.includes('overlaps with'), 'Error message must describe overlap');

        // 4b. Invalid time range (start >= end)
        const invalidTimeCards = [
            {
                subject: 'Subject Invalid Time',
                professor: faculty.Name,
                section: 'A',
                day: 'Monday',
                startTime: '11:00:00',
                endTime: '10:00:00'
            }
        ];
        const failFinMock2 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token3,
                schedules: invalidTimeCards
            }
        });
        await schedulesController.finalizeSchedule(failFinMock2.req, failFinMock2.res, (err) => { throw err; });
        assert.strictEqual(failFinMock2.getStatus(), 400, 'Invalid time range must be rejected with 400');
        assert.ok(failFinMock2.getData().error.includes('Invalid time range'), 'Error message must describe time range');

        // 4c. Cross-room professor double booking
        // Seed official schedule for faculty in Room 204: Friday 08:00 - 10:00
        await db.query(`
            INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
            VALUES (?, ?, 'Room 204 Class', 'Sec 1', 'Friday', '08:00:00', '10:00:00', ?, ?, 'purple')
        `, [faculty.User_ID, otherRoomId, testAY, testSem]);

        const clashingCards = [
            {
                subject: 'Room 203 Conflicting Class',
                professor: faculty.Name,
                section: 'Sec 2',
                day: 'Friday',
                startTime: '09:00:00',
                endTime: '11:00:00'
            }
        ];
        const failFinMock3 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token3,
                schedules: clashingCards
            }
        });
        await schedulesController.finalizeSchedule(failFinMock3.req, failFinMock3.res, (err) => { throw err; });
        assert.strictEqual(failFinMock3.getStatus(), 400, 'Cross-room professor clash must be rejected with 400');
        assert.ok(failFinMock3.getData().error.includes('already scheduled in Room 204'), 'Error message must specify conflicting room');

        // Verify editing lock is RETAINED on validation error so user can fix cards without losing session
        const lockStillActive = roomLockService.getLock(testRoom, testAY, testSem);
        assert.ok(lockStillActive !== null, 'Lock must be preserved when validation fails');
        assert.strictEqual(lockStillActive.editSessionToken, token3);
        console.log('✔ PASS: Validation failures (overlaps, invalid times, professor conflicts) correctly rejected with HTTP 400 and lock retained');

        // =========================================================================
        // SCENARIO 5: Role Authorization (IT Dept. Head Exclusivity)
        // =========================================================================
        console.log('\n--- 5. Role Authorization Exclusivity ---');
        // Program Coordinator attempt to finalize
        const pcToken = 'token_pc_test';
        roomLockService.clearAllLocks();
        roomLockService.acquireLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: progCoord.User_ID,
            userName: progCoord.Name,
            userRole: progCoord.Role,
            editSessionToken: pcToken
        });

        const pcFinMock = createMockReqRes({
            session: progCoordSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: pcToken,
                schedules: []
            }
        });
        await schedulesController.finalizeSchedule(pcFinMock.req, pcFinMock.res, (err) => { throw err; });
        assert.strictEqual(pcFinMock.getStatus(), 403, 'Program Coordinator direct finalize must return 403');

        // Program Coordinator attempt to reopen
        const pcReopenMock = createMockReqRes({
            session: progCoordSession,
            body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
        });
        await schedulesController.reopenSchedule(pcReopenMock.req, pcReopenMock.res, (err) => { throw err; });
        assert.strictEqual(pcReopenMock.getStatus(), 403, 'Program Coordinator reopen must return 403');
        console.log('✔ PASS: Program Coordinator is strictly 403 Forbidden from finalize and reopen');

        // =========================================================================
        // SCENARIO 6: Lock and Version Protection
        // =========================================================================
        console.log('\n--- 6. Lock and Version Protection ---');
        // 6a. Missing edit session token
        const noTokenMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                schedules: []
            }
        });
        await schedulesController.finalizeSchedule(noTokenMock.req, noTokenMock.res, (err) => { throw err; });
        assert.strictEqual(noTokenMock.getStatus(), 423, 'Missing token must return 423');

        // 6b. Token mismatch / another user has lock
        const badTokenMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: 'completely_bogus_token',
                schedules: []
            }
        });
        await schedulesController.finalizeSchedule(badTokenMock.req, badTokenMock.res, (err) => { throw err; });
        assert.strictEqual(badTokenMock.getStatus(), 423, 'Invalid token must return 423');

        // 6c. Version mismatch (optimistic concurrency)
        roomLockService.clearAllLocks();
        const finLockToken = 'token_version_test';
        roomLockService.acquireLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            userName: itHead.Name,
            userRole: itHead.Role,
            editSessionToken: finLockToken
        });

        // Current metadata version is known
        const curMeta = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        const wrongVersion = curMeta ? Number(curMeta.Version) + 99 : 999;

        const staleVersionMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: finLockToken,
                schedules: [],
                version: wrongVersion
            }
        });
        await schedulesController.finalizeSchedule(staleVersionMock.req, staleVersionMock.res, (err) => { throw err; });
        assert.strictEqual(staleVersionMock.getStatus(), 409, 'Stale version must return 409 Conflict');
        console.log('✔ PASS: Lock verification (423) and optimistic version check (409) strictly enforced on direct finalization');

        // =========================================================================
        // SCENARIO 7: Existing workflow - Save Draft remains draft
        // =========================================================================
        console.log('\n--- 7. Existing Workflow - Save Draft Remains Draft ---');
        const draftCards = [
            {
                subject: 'Draft Only Class',
                professor: faculty.Name,
                section: 'D1',
                day: 'Tuesday',
                startTime: '10:00:00',
                endTime: '12:00:00'
            }
        ];
        const draftSaveMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: finLockToken,
                schedules: draftCards,
                version: curMeta ? Number(curMeta.Version) : 1
            }
        });
        await schedulesController.saveSchedule(draftSaveMock.req, draftSaveMock.res, (err) => { throw err; });
        assert.strictEqual(draftSaveMock.getStatus(), 200);

        // Check metadata status is 'Draft'
        const metaAfterDraft = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        assert.strictEqual(metaAfterDraft.Status, 'Draft');

        // Check official schedules table does NOT have this draft class
        const [officialAfterDraft] = await db.query(
            "SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ? AND Subject_Name = 'Draft Only Class'",
            [roomId, testAY, testSem]
        );
        assert.strictEqual(officialAfterDraft.length, 0, 'Draft save must not leak into official schedules table');
        console.log('✔ PASS: Save Draft correctly stays in Draft status and does not publish to official table');

        // =========================================================================
        // SCENARIO 8: Failure handling does not falsely mark status as official
        // =========================================================================
        console.log('\n--- 8. Failure Handling Preserves Status ---');
        // Ensure status is Draft
        assert.strictEqual(metaAfterDraft.Status, 'Draft');

        // Attempt direct finalization with conflicting payload
        const failingDirectFin = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: finLockToken,
                schedules: [
                    { subject: 'Class 1', day: 'Monday', startTime: '08:00:00', endTime: '10:00:00', professor: faculty.Name },
                    { subject: 'Class 2', day: 'Monday', startTime: '08:30:00', endTime: '09:30:00', professor: faculty.Name }
                ]
            }
        });
        await schedulesController.finalizeSchedule(failingDirectFin.req, failingDirectFin.res, (err) => { throw err; });
        assert.strictEqual(failingDirectFin.getStatus(), 400);

        // Metadata status MUST STILL BE 'Draft', NOT 'Finalized'!
        const metaAfterFailure = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        assert.strictEqual(metaAfterFailure.Status, 'Draft', 'Schedule status must remain Draft after failed finalization');
        console.log('✔ PASS: Failed finalization leaves schedule status as Draft without false official state');

    } finally {
        await cleanup();
        console.log('\n🧹 Cleaned up isolated test records.');
    }

    console.log('\n================================================================');
    console.log('🎉 ALL 8 DIRECT FINALIZATION REGRESSION SCENARIOS PASSED 100%!');
    console.log('================================================================\n');
}

runDirectFinalizationTests()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Test failure:', err);
        process.exit(1);
    });
