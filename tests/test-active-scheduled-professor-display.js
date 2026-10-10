'use strict';

/**
 * tests/test-active-scheduled-professor-display.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression Test Suite: Active Scheduled Professor Display on Room Status
 * and Dashboard Laboratory Cards.
 *
 * Verifies:
 * 1. Direct finalization persists valid schedules to official `schedules` table.
 * 2. Official persistence stores correct User_ID and room linkage.
 * 3. Room Status API reflects active scheduled professor during session.
 * 4. Dashboard laboratory card renderer displays scheduled professor accurately.
 * 5. Exact start boundary (17:00:00) is recognized as active.
 * 6. End boundary (18:00:00) is recognized as inactive (half-open interval).
 * 7. Wrong day or time outside interval results in Scheduled: None (no invented professors).
 * 8. Timezone consistency: Asia/Manila (UTC+8) deterministic behavior independent of server TZ.
 * 9. Latest official data reflected over stale drafts, with sessionStorage cache invalidated.
 * 10. Existing safeguards: Empty guard, room locks, role auth, and professor conflict checks intact.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const laboratoryService = require('../services/laboratoryService');
const scheduleRepository = require('../repositories/schedule.repository');
const labRepository = require('../repositories/laboratory.repository');
const schedulesController = require('../controllers/schedules.controller');
const labsController = require('../controllers/labs.controller');
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
        setHeader(name, val) {
            return this;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

function createMockElement(tag = 'div') {
    const element = {
        tagName: tag.toUpperCase(),
        innerHTML: '',
        children: [],
        attributes: {},
        classList: new Set(),
        setAttribute(name, val) { this.attributes[name] = String(val); },
        getAttribute(name) { return this.attributes[name] || null; },
        querySelectorAll(sel) {
            const results = [];
            if (sel.includes('[data-url]')) {
                const matches = [...this.innerHTML.matchAll(/data-url="([^"]+)"/g)];
                matches.forEach(m => {
                    results.push({
                        getAttribute: (attr) => attr === 'data-url' ? m[1] : null,
                        addEventListener: () => {}
                    });
                });
            }
            return results;
        },
        querySelector(sel) {
            const all = this.querySelectorAll(sel);
            return all[0] || null;
        }
    };
    return element;
}

async function runActiveScheduledProfessorTests() {
    console.log('================================================================');
    console.log('🧪 ACTIVE SCHEDULED PROFESSOR DISPLAY REGRESSION SUITE');
    console.log('================================================================\n');

    const testAY = '2097-2098'; // Isolated AY to avoid touching real official data
    const testSem = '1st Semester';
    const testRoom = '204';
    const testDay = 'Monday';
    const testStartTime = '17:00:00';
    const testEndTime = '18:00:00';
    const testSubject = 'IT 301 - Test Systems Analysis';

    // 0. Locate test accounts and rooms
    const [itHeadRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
    const [progCoordRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
    const [facultyRows] = await db.query("SELECT User_ID, Email, Role, Name FROM users WHERE Role = 'Faculty' LIMIT 1");
    const [roomRows] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = ? LIMIT 1", [testRoom]);

    assert.ok(itHeadRows.length > 0, 'IT Dept. Head account must exist');
    assert.ok(progCoordRows.length > 0, 'Program Coordinator account must exist');
    assert.ok(facultyRows.length > 0, 'Faculty account must exist');
    assert.ok(roomRows.length > 0, `Test Room ${testRoom} must exist`);

    const itHead = itHeadRows[0];
    const progCoord = progCoordRows[0];
    const faculty = facultyRows[0];
    const roomId = roomRows[0].Room_ID;

    console.log(`✓ Test accounts: IT Head="${itHead.Name}", Faculty="${faculty.Name}", Room="${testRoom}" (ID: ${roomId})`);

    const cleanup = async () => {
        roomLockService.clearAllLocks();
        await db.query('DELETE FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);
        await db.query('DELETE FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);
        await db.query('DELETE FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?', [roomId, testAY, testSem]);
    };

    try {
        await cleanup();

        // -------------------------------------------------------------------------
        // SCENARIO 1 & 2: DIRECT FINALIZATION & OFFICIAL PERSISTENCE
        // -------------------------------------------------------------------------
        console.log('\n--- 1 & 2. Direct Finalization & Official Schedule Persistence ---');

        const lockRes = roomLockService.acquireLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            userName: itHead.Name,
            userRole: itHead.Role,
            editSessionToken: 'token_it_head_active_1'
        });
        assert.strictEqual(lockRes.acquired, true, 'IT Dept. Head acquires room lock');

        // Submit schedule directly with "Prof. <Name>" to test prefix resilience as well
        const scheduleEntries = [{
            day: testDay,
            startTime: '17:00',
            endTime: '18:00',
            subject: testSubject,
            section: 'BSIT-3A',
            professor: `Prof. ${faculty.Name}`,
            colorTheme: 'blue'
        }];

        const finRes = await scheduleService.finalizeSchedule({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            schedules: scheduleEntries,
            version: 1
        });

        assert.strictEqual(finRes.status, 200, 'Direct finalization must succeed with 200');
        assert.strictEqual(finRes.data.status, 'Finalized');

        // Verify stored in official `schedules` table with correct User_ID
        const [persisted] = await db.query(
            'SELECT * FROM schedules WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(persisted.length, 1, 'Exactly one official schedule row persisted');
        assert.strictEqual(persisted[0].User_ID, faculty.User_ID, 'Official row links to correct faculty User_ID');
        assert.strictEqual(persisted[0].Start_Time, '17:00:00');
        assert.strictEqual(persisted[0].End_Time, '18:00:00');
        assert.strictEqual(persisted[0].Day_of_Week, testDay);

        // Verify working drafts are clean
        const [drafts] = await db.query(
            'SELECT * FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
            [roomId, testAY, testSem]
        );
        assert.strictEqual(drafts.length, 0, 'No lingering drafts in schedule_drafts after direct finalization');
        console.log('✔ PASS: Direct finalization persists to authoritative schedules table with resolved faculty User_ID');

        // -------------------------------------------------------------------------
        // SCENARIO 3: ROOM STATUS VISIBILITY (ACTIVE TIME INTERVAL)
        // -------------------------------------------------------------------------
        console.log('\n--- 3. Room Status API Visibility (Active Mid-Interval: Monday 17:30:00) ---');

        // Simulated Philippine date: Monday 2026-10-12 at 17:30:00 Manila (UTC+8) = 09:30:00 UTC
        const activeDateMid = new Date('2026-10-12T09:30:00.000Z');

        const allLabsMid = await laboratoryService.getAllLaboratories(testAY, testSem, { now: activeDateMid });
        assert.strictEqual(allLabsMid.status, 200);

        const labRoomMid = allLabsMid.data.find(r => String(r.Room_Number) === testRoom);
        assert.ok(labRoomMid, `Room ${testRoom} must be present in laboratory listing`);
        assert.ok(labRoomMid.Scheduled_Class, 'Scheduled_Class must NOT be null during active interval');
        assert.strictEqual(labRoomMid.Scheduled_Class.professor, faculty.Name, 'Scheduled_Class.professor must match scheduled faculty');
        assert.strictEqual(labRoomMid.Scheduled_Class.startTime, '17:00:00');
        assert.strictEqual(labRoomMid.Scheduled_Class.endTime, '18:00:00');
        assert.strictEqual(labRoomMid.Scheduled_Class.section, 'BSIT-3A');

        // Also verify via controller HTTP mock
        const { req: reqCtrl, res: resCtrl, getStatus, getData } = createMockReqRes({
            query: { academicYear: testAY, semester: testSem, targetDate: activeDateMid.toISOString() }
        });
        await labsController.getAllLaboratories(reqCtrl, resCtrl, (err) => { if (err) throw err; });
        assert.strictEqual(getStatus(), 200);
        const ctrlLab = getData().find(r => String(r.Room_Number) === testRoom);
        assert.ok(ctrlLab.Scheduled_Class, 'Controller response must include active Scheduled_Class');
        assert.strictEqual(ctrlLab.Scheduled_Class.professor, faculty.Name);
        console.log('✔ PASS: Room Status backend endpoint and service accurately returns scheduled professor during active interval');

        // -------------------------------------------------------------------------
        // SCENARIO 4: DASHBOARD LABORATORY CARD RENDERING
        // -------------------------------------------------------------------------
        console.log('\n--- 4. Dashboard Laboratory Card Rendering ---');

        const labServiceJs = fs.readFileSync(path.join(__dirname, '../js/services/laboratory.service.js'), 'utf8');
        const mockWindowLab = {
            location: { pathname: '/it-head-dashboard.html' },
            currentUser: { Role: 'IT Dept. Head' },
            lucide: { createIcons: () => {} }
        };
        const evalLabFn = new Function('window', `
            ${labServiceJs}
            return renderLabCards;
        `);
        const renderLabCards = evalLabFn(mockWindowLab);

        const cardContainer = createMockElement('div');
        renderLabCards(allLabsMid.data, cardContainer);
        const cardHtml = cardContainer.innerHTML;

        assert.ok(cardHtml.includes(`RM ${testRoom}`), `Card must include RM ${testRoom}`);
        assert.ok(cardHtml.includes(faculty.Name), `Laboratory card must render scheduled professor "${faculty.Name}"`);
        assert.ok(cardHtml.includes('Scheduled'), 'Card must have Scheduled section');
        console.log(`✔ PASS: Laboratory card renders scheduled professor "${faculty.Name}" on RM ${testRoom}`);

        // -------------------------------------------------------------------------
        // SCENARIO 5: EXACT START BOUNDARY (17:00:00 MANILA)
        // -------------------------------------------------------------------------
        console.log('\n--- 5. Exact Start Boundary (Monday 17:00:00 Manila) ---');

        // Monday at exactly 17:00:00 Manila = 09:00:00 UTC
        const exactStartDate = new Date('2026-10-12T09:00:00.000Z');
        const labsAtStart = await laboratoryService.getAllLaboratories(testAY, testSem, { now: exactStartDate });
        const roomAtStart = labsAtStart.data.find(r => String(r.Room_Number) === testRoom);

        assert.ok(roomAtStart.Scheduled_Class, 'Schedule MUST be active at its exact start time (17:00:00)');
        assert.strictEqual(roomAtStart.Scheduled_Class.professor, faculty.Name, 'Professor must be displayed at exact start time');
        console.log('✔ PASS: Schedule is recognized as active at its exact start time (17:00:00)');

        // -------------------------------------------------------------------------
        // SCENARIO 6: END BOUNDARY (18:00:00 MANILA)
        // -------------------------------------------------------------------------
        console.log('\n--- 6. Exact End Boundary (Monday 18:00:00 Manila) ---');

        // Monday at exactly 18:00:00 Manila = 10:00:00 UTC (half-open interval: now >= start AND now < end)
        const exactEndDate = new Date('2026-10-12T10:00:00.000Z');
        const labsAtEnd = await laboratoryService.getAllLaboratories(testAY, testSem, { now: exactEndDate });
        const roomAtEnd = labsAtEnd.data.find(r => String(r.Room_Number) === testRoom);

        assert.strictEqual(roomAtEnd.Scheduled_Class, null, 'Schedule MUST be inactive once end time (18:00:00) is reached');

        const endContainer = createMockElement('div');
        renderLabCards(labsAtEnd.data, endContainer);
        assert.ok(endContainer.innerHTML.includes('None'), 'Card displays "None" when schedule has reached end time');
        console.log('✔ PASS: Schedule is strictly inactive at its exact end time (18:00:00)');

        // -------------------------------------------------------------------------
        // SCENARIO 7: WRONG DAY OR OUTSIDE TIME INTERVAL
        // -------------------------------------------------------------------------
        console.log('\n--- 7. Wrong Day or Outside Time Interval ---');

        // 7a. 1 minute before start: Monday 16:59:59 Manila = 08:59:59 UTC
        const beforeDate = new Date('2026-10-12T08:59:59.000Z');
        const labsBefore = await laboratoryService.getAllLaboratories(testAY, testSem, { now: beforeDate });
        const roomBefore = labsBefore.data.find(r => String(r.Room_Number) === testRoom);
        assert.strictEqual(roomBefore.Scheduled_Class, null, 'No schedule before start time');

        // 7b. 1 second after end: Monday 18:00:01 Manila = 10:00:01 UTC
        const afterDate = new Date('2026-10-12T10:00:01.000Z');
        const labsAfter = await laboratoryService.getAllLaboratories(testAY, testSem, { now: afterDate });
        const roomAfter = labsAfter.data.find(r => String(r.Room_Number) === testRoom);
        assert.strictEqual(roomAfter.Scheduled_Class, null, 'No schedule after end time');

        // 7c. Wrong day: Tuesday 17:30:00 Manila = 09:30:00 UTC Tuesday
        const wrongDayDate = new Date('2026-10-13T09:30:00.000Z');
        const labsWrongDay = await laboratoryService.getAllLaboratories(testAY, testSem, { now: wrongDayDate });
        const roomWrongDay = labsWrongDay.data.find(r => String(r.Room_Number) === testRoom);
        assert.strictEqual(roomWrongDay.Scheduled_Class, null, 'No schedule on Tuesday for Monday class');
        console.log('✔ PASS: Outside time interval and on different days, Scheduled_Class is null and no professor is invented');

        // -------------------------------------------------------------------------
        // SCENARIO 8: TIMEZONE CONSISTENCY ACROSS SERVER ENVIRONMENTS & MIDNIGHT
        // -------------------------------------------------------------------------
        console.log('\n--- 8. Timezone Consistency (Asia/Manila vs UTC Server Environment) ---');

        // Save original TZ and simulate UTC environment (standard on Railway)
        const origTZ = process.env.TZ;
        process.env.TZ = 'UTC';

        try {
            const timeCtx = laboratoryService.getPhilippineTimeContext(activeDateMid);
            assert.strictEqual(timeCtx.day, 'Monday');
            assert.strictEqual(timeCtx.time, '17:30:00', 'Must evaluate to 17:30:00 Manila even when process.env.TZ = "UTC"');

            // Midnight rollover test: Sunday 00:15:00 Manila is Saturday 16:15:00 UTC
            const midnightRolloverDate = new Date('2026-10-11T16:15:00.000Z');
            const midnightCtx = laboratoryService.getPhilippineTimeContext(midnightRolloverDate);
            assert.strictEqual(midnightCtx.day, 'Monday', 'Must recognize Manila day of week across UTC midnight boundary');
            assert.strictEqual(midnightCtx.time, '00:15:00', 'Must evaluate to 00:15:00 Manila');

            // IT Head summary evaluation under UTC TZ
            const itSummary = await scheduleService.getITHeadSummary(itHead.User_ID, testAY, testSem, { now: activeDateMid });
            assert.strictEqual(itSummary.status, 200);
            assert.ok(itSummary.data.totalRooms >= 1, 'Total rooms must be at least 1');
        } finally {
            if (origTZ !== undefined) process.env.TZ = origTZ;
            else delete process.env.TZ;
        }
        console.log('✔ PASS: Asia/Manila day and time evaluated deterministically even under UTC server timezone');

        // -------------------------------------------------------------------------
        // SCENARIO 9: LATEST OFFICIAL DATA & CLIENT CACHE INVALIDATION
        // -------------------------------------------------------------------------
        console.log('\n--- 9. Latest Official Data & SWR Cache Invalidation ---');

        // 9a. Verify client persistence script invalidates sessionStorage caches on finalization
        const persistenceJs = fs.readFileSync(path.join(__dirname, '../js/scheduling/persistence/schedule.persistence.js'), 'utf8');
        assert.ok(
            persistenceJs.includes("sessionStorage.removeItem('labsync_cached_labs')"),
            'schedule.persistence.js must clear labsync_cached_labs on finalization'
        );
        assert.ok(
            persistenceJs.includes("sessionStorage.removeItem('labsync_cached_user_schedule')"),
            'schedule.persistence.js must clear labsync_cached_user_schedule on finalization'
        );
        assert.ok(
            persistenceJs.includes("localStorage.setItem('labsync_schedule_updated'"),
            'schedule.persistence.js must broadcast schedule update to other tabs via localStorage'
        );

        // 9b. Verify laboratory.service.js listens for cross-tab storage updates
        const labServiceUpdatedJs = fs.readFileSync(path.join(__dirname, '../js/services/laboratory.service.js'), 'utf8');
        assert.ok(
            labServiceUpdatedJs.includes("addEventListener('storage'") && labServiceUpdatedJs.includes('labsync_schedule_updated'),
            'laboratory.service.js must listen for cross-tab storage events to invalidate other tabs'
        );
        assert.ok(
            labServiceUpdatedJs.includes("visibilitychange"),
            'laboratory.service.js must check for schedule updates on visibilitychange'
        );

        // 9c. Verify findUserIdByName resolution precision with and without academic titles
        const [exactProfRows] = await scheduleRepository.findUserIdByName(faculty.Name);
        assert.strictEqual(exactProfRows.length, 1, 'Exact name match returns exactly 1 user');
        assert.strictEqual(exactProfRows[0].User_ID, faculty.User_ID);

        const titlesToTest = ['Prof. ', 'Professor ', 'Dr. ', 'Engr. '];
        for (const title of titlesToTest) {
            const [titledRows] = await scheduleRepository.findUserIdByName(title + faculty.Name);
            assert.strictEqual(titledRows.length, 1, `Title "${title}" must resolve exactly 1 user`);
            assert.strictEqual(titledRows[0].User_ID, faculty.User_ID, `Title "${title}" must resolve to the correct faculty User_ID`);
        }

        // Must not match a different professor
        const [wrongProfRows] = await scheduleRepository.findUserIdByName('Prof. Nonexistent Professor');
        assert.strictEqual(wrongProfRows.length, 0, 'Nonexistent professor name returns 0 rows');

        // Partial non-matching names do not cross-match
        const [andreiRows] = await scheduleRepository.findUserIdByName('Prof. Andrei');
        assert.strictEqual(andreiRows.length, 0, 'Incomplete first name does not ambiguously match full name');

        // 9d. Update finalized schedule to another professor
        roomLockService.releaseLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            editSessionToken: 'token_it_head_active_1'
        });

        const lockRes2 = roomLockService.acquireLock({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            userName: itHead.Name,
            userRole: itHead.Role,
            editSessionToken: 'token_it_head_active_2'
        });
        assert.strictEqual(lockRes2.acquired, true);

        const updatedEntries = [{
            day: testDay,
            startTime: '17:00',
            endTime: '18:00',
            subject: 'IT 302 - Advanced Systems',
            section: 'BSIT-4A',
            professor: itHead.Name, // Changed professor to Andrei Gabito
            colorTheme: 'green'
        }];

        const currentMeta = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        const updateFinRes = await scheduleService.finalizeSchedule({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            schedules: updatedEntries,
            version: currentMeta ? Number(currentMeta.Version) : 1
        });
        assert.strictEqual(updateFinRes.status, 200);

        // Fetch fresh laboratories: verify it reflects the updated professor
        const updatedLabs = await laboratoryService.getAllLaboratories(testAY, testSem, { now: activeDateMid });
        const updatedRoom = updatedLabs.data.find(r => String(r.Room_Number) === testRoom);
        assert.strictEqual(updatedRoom.Scheduled_Class.professor, itHead.Name, 'Updated professor immediately visible');
        assert.strictEqual(updatedRoom.Scheduled_Class.subject, 'IT 302 - Advanced Systems');
        console.log('✔ PASS: Updated official schedule reflected immediately and stale cache cleared');

        // -------------------------------------------------------------------------
        // SCENARIO 10: EXISTING SAFEGUARDS PRESERVATION
        // -------------------------------------------------------------------------
        console.log('\n--- 10. Existing Safeguards Preservation ---');

        // 10a. Empty schedule finalization guard
        const latestMeta = await scheduleRepository.getScheduleMetadata(roomId, testAY, testSem);
        const currentVersion = latestMeta ? Number(latestMeta.Version) : 1;
        const emptyFinRes = await scheduleService.finalizeSchedule({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            schedules: [],
            version: currentVersion
        });
        assert.strictEqual(emptyFinRes.status, 400, 'Empty schedule finalization must be rejected with 400');
        assert.ok(emptyFinRes.error.includes('Cannot finalize an empty schedule'));

        // 10b. Program Coordinator cannot finalize (403)
        const mockPCCtrl = createMockReqRes({
            session: { userId: progCoord.User_ID, userRole: progCoord.Role, userName: progCoord.Name },
            body: { roomNumber: testRoom, academicYear: testAY, semester: testSem, schedules: updatedEntries }
        });
        await schedulesController.finalizeSchedule(mockPCCtrl.req, mockPCCtrl.res, (err) => { if (err) throw err; });
        assert.strictEqual(mockPCCtrl.getStatus(), 403, 'Program Coordinator must be rejected from finalize with 403');

        // 10c. Same-room overlap guard
        const overlappingEntries = [
            { day: 'Tuesday', startTime: '08:00', endTime: '10:00', subject: 'Class 1', section: 'A', professor: faculty.Name },
            { day: 'Tuesday', startTime: '09:00', endTime: '11:00', subject: 'Class 2', section: 'B', professor: faculty.Name }
        ];
        const overlapFinRes = await scheduleService.finalizeSchedule({
            roomNumber: testRoom,
            academicYear: testAY,
            semester: testSem,
            userId: itHead.User_ID,
            schedules: overlappingEntries,
            version: currentVersion
        });
        assert.strictEqual(overlapFinRes.status, 400, 'Overlapping entries must be rejected with 400');
        console.log('✔ PASS: Empty-schedule guard, role authorization, and schedule conflict safeguards fully operational');

    } finally {
        await cleanup();
        console.log('\n🧹 Cleaned up isolated test records.');
    }

    console.log('\n================================================================');
    console.log('🎉 ALL 10 ACTIVE SCHEDULED PROFESSOR REGRESSION TESTS PASSED 100%!');
    console.log('================================================================\n');
}

runActiveScheduledProfessorTests()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Test failure:', err);
        process.exit(1);
    });
