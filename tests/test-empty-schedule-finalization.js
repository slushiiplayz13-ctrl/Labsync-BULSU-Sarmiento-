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

async function runEmptyScheduleFinalizationTests() {
    console.log('================================================================');
    console.log('🧪 PREVENT EMPTY ROOM SCHEDULE FINALIZATION TEST SUITE');
    console.log('================================================================\n');

    const testAY = '2026-2027';
    const testSem = 'EmptyFinalize-Term';
    const testRoom = '203';
    const otherRoom = '204';

    // Locate test accounts
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

    async function cleanup() {
        await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
        await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
        await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [roomId, otherRoomId, testAY, testSem]);
        roomLockService.clearAllLocks();
    }

    try {
        await cleanup();

        // =========================================================================
        // CASE 1: Completely empty editor: Finalization is rejected, no official created
        // =========================================================================
        console.log('--- Case 1: Completely Empty Editor Rejected ---');
        const token1 = 'token_empty_case_1';
        roomLockService.acquireLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            userName: itHead.Name,
            userRole: itHead.Role,
            editSessionToken: token1
        });

        const mock1 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: [],
                version: 1
            }
        });

        await schedulesController.finalizeSchedule(mock1.req, mock1.res, (err) => { throw err; });
        assert.strictEqual(mock1.getStatus(), 400, 'Empty schedule must be rejected with HTTP 400');
        assert.ok(
            mock1.getData().error.includes('Cannot finalize an empty schedule'),
            `Error message must mention cannot finalize empty schedule, got: "${mock1.getData().error}"`
        );

        // Verify no official schedule records were created
        const [official1] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(official1.length, 0, 'No official schedule records must be created');

        // Verify status remains Draft / not Finalized
        const [meta1] = await db.query(
            'SELECT * FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        if (meta1.length > 0) {
            assert.notStrictEqual(meta1[0].Status, 'Finalized', 'Schedule must not be marked Finalized');
        }

        // Verify room lock was preserved
        const activeLock1 = roomLockService.getLock(testRoom, testAY, testSem);
        assert.ok(activeLock1, 'Room editing lock must be preserved when finalization fails');
        assert.strictEqual(activeLock1.editSessionToken, token1);
        console.log('✔ PASS: Completely empty editor finalization is rejected with 400 and lock preserved');

        // =========================================================================
        // CASE 2: Blank placeholder blocks only: Finalization is rejected
        // =========================================================================
        console.log('\n--- Case 2: Blank Placeholder Blocks Only Rejected ---');
        const placeholderBlocks = [
            { subject: '', day: 'Monday', startTime: '08:00:00', endTime: '10:00:00' },
            { subject: '   ', day: 'Tuesday', startTime: '09:00:00', endTime: '11:00:00' },
            { subject: 'TBA', day: 'Wednesday', startTime: '13:00:00', endTime: '15:00:00' },
            { subject: 'Not specified', day: 'Thursday', startTime: '10:00:00', endTime: '12:00:00' }
        ];

        const mock2 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: placeholderBlocks,
                version: 1
            }
        });

        await schedulesController.finalizeSchedule(mock2.req, mock2.res, (err) => { throw err; });
        assert.strictEqual(mock2.getStatus(), 400, 'Placeholder blocks only must be rejected with 400');
        assert.ok(
            mock2.getData().error.includes('Cannot finalize an empty schedule'),
            `Error message must indicate empty schedule, got: "${mock2.getData().error}"`
        );

        const [official2] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(official2.length, 0, 'No official schedule records must be created for placeholders');
        console.log('✔ PASS: Blank/placeholder blocks only are rejected with 400');

        // =========================================================================
        // CASE 3: Incomplete schedule entry: Finalization is rejected with useful message
        // =========================================================================
        console.log('\n--- Case 3: Incomplete Schedule Entry Rejected ---');
        // 3a. Invalid day
        const mock3a = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: [{ subject: 'CS 101', day: 'Funday', startTime: '08:00:00', endTime: '10:00:00' }],
                version: 1
            }
        });
        await schedulesController.finalizeSchedule(mock3a.req, mock3a.res, (err) => { throw err; });
        assert.strictEqual(mock3a.getStatus(), 400);
        assert.ok(mock3a.getData().error.includes('Invalid day'), 'Error must specify invalid day');

        // 3b. Missing times
        const mock3b = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: [{ subject: 'CS 101', day: 'Monday' }],
                version: 1
            }
        });
        await schedulesController.finalizeSchedule(mock3b.req, mock3b.res, (err) => { throw err; });
        assert.strictEqual(mock3b.getStatus(), 400);
        assert.ok(mock3b.getData().error.includes('Start time and end time are required'), 'Error must specify missing times');

        // 3c. Start time >= End time
        const mock3c = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: [{ subject: 'CS 101', day: 'Monday', startTime: '11:00:00', endTime: '09:00:00' }],
                version: 1
            }
        });
        await schedulesController.finalizeSchedule(mock3c.req, mock3c.res, (err) => { throw err; });
        assert.strictEqual(mock3c.getStatus(), 400);
        assert.ok(mock3c.getData().error.includes('Invalid time range'), 'Error must specify invalid time range');
        console.log('✔ PASS: Incomplete schedule entries rejected with useful validation messages');

        // =========================================================================
        // CASE 4: Valid schedule without saving draft first (Direct Finalization)
        // =========================================================================
        console.log('\n--- Case 4: Valid Schedule Direct Finalization ---');
        const validEditorBlocks = [
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

        const mock4 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token1,
                schedules: validEditorBlocks,
                version: 1
            }
        });

        await schedulesController.finalizeSchedule(mock4.req, mock4.res, (err) => { throw err; });
        assert.strictEqual(mock4.getStatus(), 200, 'Direct finalize of valid schedule must succeed with 200');
        assert.strictEqual(mock4.getData().status, 'Finalized');

        // Verify official schedule table
        const [official4] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(official4.length, 1);
        assert.strictEqual(official4[0].Subject_Name, 'IT 201 - Data Structures');

        // Verify My Schedule visibility
        const [facultySched] = await scheduleRepository.findUserSchedule(faculty.User_ID, testAY, testSem);
        assert.strictEqual(facultySched.length, 1);
        assert.strictEqual(facultySched[0].Subject_Name, 'IT 201 - Data Structures');
        console.log('✔ PASS: Valid schedule directly finalized without draft and appears in My Schedule');

        // =========================================================================
        // CASE 5: Empty submitted data with an older saved draft: System must NOT silently finalize draft
        // =========================================================================
        console.log('\n--- Case 5: Empty Submitted Data With Older Draft Must Reject ---');
        // Reopen room for editing
        const reopenMock = createMockReqRes({
            session: itHeadSession,
            body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
        });
        await schedulesController.reopenSchedule(reopenMock.req, reopenMock.res, (err) => { throw err; });
        assert.strictEqual(reopenMock.getStatus(), 200);
        const token5 = reopenMock.getData().editSessionToken;

        // Save a draft with existing content: Wednesday 08:00 - 09:00
        const draftBlocks = [
            {
                subject: 'IT 201 - Saved Working Draft',
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
                editSessionToken: token5,
                schedules: draftBlocks,
                version: 1
            }
        });
        await schedulesController.saveSchedule(saveDraftMock.req, saveDraftMock.res, (err) => { throw err; });
        assert.strictEqual(saveDraftMock.getStatus(), 200);

        // Verify draft exists in DB
        const [drafts5] = await db.query(
            'SELECT * FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(drafts5.length, 1, 'Draft must exist in DB');

        // Now user clears editor (0 cards) and submits finalization with schedules: []
        const emptyWithDraftMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token5,
                schedules: [],
                version: saveDraftMock.getData().version
            }
        });
        await schedulesController.finalizeSchedule(emptyWithDraftMock.req, emptyWithDraftMock.res, (err) => { throw err; });
        assert.strictEqual(emptyWithDraftMock.getStatus(), 400, 'Submitting empty schedules with existing draft must be rejected with 400');
        assert.ok(emptyWithDraftMock.getData().error.includes('Cannot finalize an empty schedule'));

        // Verify status was NOT changed to Finalized
        const [meta5] = await db.query(
            'SELECT Status FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.notStrictEqual(meta5[0].Status, 'Finalized', 'Schedule must remain in Draft state');

        // Verify draft records are still in schedule_drafts and NOT moved to schedules
        const [draftsAfter5] = await db.query(
            'SELECT * FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(draftsAfter5.length, 1, 'Draft records must remain intact');
        console.log('✔ PASS: Empty submitted data with older saved draft rejects and does not finalize older draft');

        // =========================================================================
        // CASE 6: Existing official schedule: Empty finalization must NOT alter or delete previous official records
        // =========================================================================
        console.log('\n--- Case 6: Existing Official Schedule Untouched by Empty Finalization ---');
        // First finalize a valid official schedule
        const finValidMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token5,
                schedules: draftBlocks,
                version: saveDraftMock.getData().version
            }
        });
        await schedulesController.finalizeSchedule(finValidMock.req, finValidMock.res, (err) => { throw err; });
        assert.strictEqual(finValidMock.getStatus(), 200);

        // Verify official schedule has the record
        const [official6Before] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(official6Before.length, 1);
        const originalScheduleId = official6Before[0].Schedule_ID;

        // Reopen room for editing
        const reopen6 = createMockReqRes({
            session: itHeadSession,
            body: { roomNumber: testRoom, academicYear: testAY, semester: testSem }
        });
        await schedulesController.reopenSchedule(reopen6.req, reopen6.res, (err) => { throw err; });
        assert.strictEqual(reopen6.getStatus(), 200);
        const token6 = reopen6.getData().editSessionToken;

        // Now attempt to finalize with empty schedules: []
        const meta6Before = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        const emptyFin6 = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token6,
                schedules: [],
                version: meta6Before ? Number(meta6Before.Version) : 1
            }
        });
        await schedulesController.finalizeSchedule(emptyFin6.req, emptyFin6.res, (err) => { throw err; });
        assert.strictEqual(emptyFin6.getStatus(), 400);

        // Verify official schedule table was NOT deleted or modified!
        const [official6After] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(official6After.length, 1, 'Previous official schedule records must not be deleted');
        assert.strictEqual(official6After[0].Schedule_ID, originalScheduleId, 'Original official record must remain untouched');
        assert.strictEqual(official6After[0].Subject_Name, 'IT 201 - Saved Working Draft');
        console.log('✔ PASS: Empty finalization attempt does not alter or delete existing official records');

        // =========================================================================
        // CASE 7: Authorization and locking safeguards preserved
        // =========================================================================
        console.log('\n--- Case 7: Authorization and Locking Safeguards Preserved ---');
        // 7a. Non-IT Head role rejected with 403
        const nonHeadMock = createMockReqRes({
            session: progCoordSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token6,
                schedules: validEditorBlocks
            }
        });
        await schedulesController.finalizeSchedule(nonHeadMock.req, nonHeadMock.res, (err) => { throw err; });
        assert.strictEqual(nonHeadMock.getStatus(), 403, 'Program Coordinator must be rejected with 403');

        // 7b. Missing or invalid lock token rejected with 423
        const badTokenMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: 'invalid_token_xyz',
                schedules: validEditorBlocks
            }
        });
        await schedulesController.finalizeSchedule(badTokenMock.req, badTokenMock.res, (err) => { throw err; });
        assert.strictEqual(badTokenMock.getStatus(), 423, 'Invalid edit session token must return 423');

        // 7c. Stale version rejected with 409
        const curMeta = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        const wrongVer = curMeta ? Number(curMeta.Version) + 99 : 999;
        const staleVerMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token6,
                schedules: validEditorBlocks,
                version: wrongVer
            }
        });
        await schedulesController.finalizeSchedule(staleVerMock.req, staleVerMock.res, (err) => { throw err; });
        assert.strictEqual(staleVerMock.getStatus(), 409, 'Stale version must return 409');
        console.log('✔ PASS: Role (403), lock (423), and version (409) safeguards strictly enforced');

        // =========================================================================
        // CASE 8: Save Draft workflow remains separate from official finalization
        // =========================================================================
        console.log('\n--- Case 8: Save Draft Workflow Remains Separate ---');
        const draftItems = [
            {
                subject: 'IT 301 - Operating Systems',
                professor: faculty.Name,
                section: '3A',
                day: 'Friday',
                startTime: '10:00:00',
                endTime: '12:00:00',
                colorTheme: 'purple'
            }
        ];
        const saveDraftSeparateMock = createMockReqRes({
            session: itHeadSession,
            body: {
                roomNumber: testRoom,
                academicYear: testAY,
                semester: testSem,
                editSessionToken: token6,
                schedules: draftItems,
                version: curMeta ? Number(curMeta.Version) : 1
            }
        });
        await schedulesController.saveSchedule(saveDraftSeparateMock.req, saveDraftSeparateMock.res, (err) => { throw err; });
        assert.strictEqual(saveDraftSeparateMock.getStatus(), 200);

        // Verify status remains Draft
        const [meta8] = await db.query(
            'SELECT Status FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(meta8[0].Status, 'Draft', 'Save draft must keep status Draft');

        // Verify official table still has previous official records, not the draft items
        const [official8] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.ok(
            !official8.some(s => s.Subject_Name === 'IT 301 - Operating Systems'),
            'Official table must not contain draft items'
        );
        console.log('✔ PASS: Save draft workflow remains separate and maintains Draft status');

        // =========================================================================
        // CASE 9: Concurrent / duplicate empty finalize requests cannot finalize
        // =========================================================================
        console.log('\n--- Case 9: Concurrent / Duplicate Empty Requests Handled Safely ---');
        const meta9Before = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        const curVer9 = meta9Before ? Number(meta9Before.Version) : 1;
        const concurrentPromises = [1, 2, 3, 4, 5].map(() => {
            const mock = createMockReqRes({
                session: itHeadSession,
                body: {
                    roomNumber: testRoom,
                    academicYear: testAY,
                    semester: testSem,
                    editSessionToken: token6,
                    schedules: [],
                    version: curVer9
                }
            });
            return schedulesController.finalizeSchedule(mock.req, mock.res, (err) => { throw err; })
                .then(() => mock.getStatus());
        });

        const results = await Promise.all(concurrentPromises);
        assert.ok(
            results.every(code => code === 400),
            `All concurrent empty finalization calls must return 400, got: ${results.join(', ')}`
        );

        // Verify status is STILL Draft
        const [meta9] = await db.query(
            'SELECT Status FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(meta9[0].Status, 'Draft');
        console.log('✔ PASS: Concurrent duplicate empty requests all rejected with 400 safely');

        // =========================================================================
        // CASE 11: Frontend UI Finalize Button & persistence.finalizeCurrentSchedule
        // =========================================================================
        console.log('\n--- Case 11: Frontend UI Finalize Button & Empty Guard Simulation ---');
        const vm = require('vm');
        const fs = require('fs');
        const path = require('path');

        let toastCalledWith = null;
        const mockWindow = {
            sessionStorage: {
                getItem: () => JSON.stringify({ role: 'IT Dept. Head', name: 'IT Head' }),
                setItem: () => {}
            },
            localStorage: { getItem: () => null, setItem: () => {} },
            showToast: (msg, type, title) => {
                toastCalledWith = { msg, type, title };
            },
            innerWidth: 1024,
            document: {
                body: { classList: { add: () => {}, remove: () => {}, contains: () => false } },
                querySelector: () => null,
                querySelectorAll: () => [],
                getElementById: (id) => ({
                    id,
                    style: {},
                    classList: { add: () => {}, remove: () => {}, contains: () => false },
                    addEventListener: () => {},
                    querySelector: () => null
                })
            }
        };

        const persistenceCode = fs.readFileSync(path.resolve(__dirname, '../js/scheduling/persistence/schedule.persistence.js'), 'utf8');
        const context = vm.createContext(mockWindow);
        vm.runInContext(persistenceCode, context);

        const clientPersistence = context.schedulePersistence;
        assert.ok(clientPersistence, 'schedulePersistence must be loaded in context');
        assert.strictEqual(typeof clientPersistence.finalizeCurrentSchedule, 'function');
        assert.strictEqual(typeof clientPersistence.getValidScheduleEntries, 'function');

        // Verify getValidScheduleEntries with mock items
        const testCards = [
            { subject: '', day: 'Monday', startTime: '08:00', endTime: '10:00' },
            { subject: 'TBA', day: 'Tuesday', startTime: '08:00', endTime: '10:00' },
            { subject: 'Math 101', day: 'Wednesday', startTime: '08:00', endTime: '10:00' }
        ];
        const filtered = clientPersistence.getValidScheduleEntries(testCards);
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].subject, 'Math 101');

        // Test finalizeCurrentSchedule throws on empty editor
        clientPersistence.setEditSessionToken('test_token_ui');
        let errorThrown = null;
        try {
            await clientPersistence.finalizeCurrentSchedule();
        } catch (err) {
            errorThrown = err;
        }

        assert.ok(errorThrown, 'finalizeCurrentSchedule must throw on empty editor');
        assert.strictEqual(errorThrown.status, 400);
        assert.ok(errorThrown.message.includes('Cannot finalize an empty schedule'));
        assert.ok(toastCalledWith, 'Toast must have been called');
        assert.ok(toastCalledWith.msg.includes('Cannot finalize an empty schedule'));
        assert.strictEqual(clientPersistence.getEditSessionToken(), 'test_token_ui', 'Edit token must be preserved on empty rejection');

        console.log('✔ PASS: Frontend persistence and UI empty schedule guard rejects and preserves token');

        console.log('\n🧹 Cleaning up isolated test records...');
        await cleanup();
        console.log('🧹 Cleaned up isolated test records.');

        console.log('\n================================================================');
        console.log('🎉 ALL 10 EMPTY SCHEDULE FINALIZATION TEST CASES PASSED 100%!');
        console.log('================================================================\n');

    } catch (err) {
        console.error('\n❌ Test failure:', err);
        try { await cleanup(); } catch (_) {}
        process.exit(1);
    } finally {
        await db.end();
    }
}

runEmptyScheduleFinalizationTests();
