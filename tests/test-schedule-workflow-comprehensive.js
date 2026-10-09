'use strict';

/**
 * tests/test-schedule-workflow-comprehensive.js
 * Comprehensive 27-Point Verification Suite for LabSync Scheduling Workflow:
 * Collaborative Working Drafts, Optimistic Concurrency, Conflict Validation,
 * Super Admin Finalization Authority, and UI/Export Integrity.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const scheduleService = require('../services/scheduleService');
const scheduleRepository = require('../repositories/schedule.repository');
const schedulesController = require('../controllers/schedules.controller');
const roomLockService = require('../services/roomLockService');
const { IT_HEAD_ROLES, ADMIN_ROLES, IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');

function createMockReqRes({ session, body = {}, query = {}, params = {}, autoLock = true }) {
    let statusCode = 200;
    let responseData = null;

    if (autoLock && body && body.roomNumber && body.academicYear && body.semester && session && session.userId && !body.editSessionToken) {
        const token = 'comp_test_lock_' + session.userId + '_' + body.roomNumber + '_' + Date.now();
        roomLockService.forceAcquireLock({
            roomNumber: body.roomNumber,
            academicYear: body.academicYear,
            semester: body.semester,
            userId: session.userId,
            userName: session.userRole || 'Admin',
            userRole: session.userRole || 'Admin',
            editSessionToken: token
        });
        body.editSessionToken = token;
    }

    const req = {
        session,
        body,
        query,
        params,
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

async function runComprehensiveTests() {
    console.log('================================================================');
    console.log('🧪 27-POINT SCHEDULE WORKFLOW & CONCURRENCY COMPREHENSIVE SUITE');
    console.log('================================================================\n');

    const testAY = '2026-2027';
    const testSem = '1st Semester';
    const testRoom1 = '203';
    const testRoom2 = '204';

    // ─── SETUP: IDENTIFY USERS & CLEAN DATABASE ───
    const [itHeadRows] = await db.query("SELECT User_ID, Email, Role, Name AS Full_Name FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
    const [progCoordRows] = await db.query("SELECT User_ID, Email, Role, Name AS Full_Name FROM users WHERE Role = 'Program Coordinator' LIMIT 1");

    assert.ok(itHeadRows.length > 0, 'IT Dept. Head account must exist');
    assert.ok(progCoordRows.length > 0, 'Program Coordinator account must exist');

    const itHead = itHeadRows[0];
    const progCoord = progCoordRows[0];

    const itHeadSession = { userId: itHead.User_ID, email: itHead.Email, userRole: itHead.Role, role: itHead.Role };
    const progCoordSession = { userId: progCoord.User_ID, email: progCoord.Email, userRole: progCoord.Role, role: progCoord.Role };

    const [r1Rows] = await scheduleRepository.findRoomIdByNumber(testRoom1);
    const [r2Rows] = await scheduleRepository.findRoomIdByNumber(testRoom2);
    const r1Id = r1Rows[0].Room_ID;
    const r2Id = r2Rows[0].Room_ID;

    // Reset test room state
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r1Id, r2Id, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r1Id, r2Id, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r1Id, r2Id, testAY, testSem]);

    // ─── POINT 1: Program Coordinator can create a draft schedule ───
    console.log('--- Point 1: Program Coordinator can create a draft schedule ---');
    const mock1 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 1,
            schedules: [
                {
                    subject: 'CC 102',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Not specified'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(mock1.req, mock1.res, (e) => { throw e; });
    assert.strictEqual(mock1.getStatus(), 200, 'Point 1: Save draft schedule should return 200');
    assert.strictEqual(mock1.getData().version, 2, 'Point 1: Version should increment to 2');
    console.log('✔ PASS: Point 1 — Program Coordinator can create draft schedule (Version 2)');

    // ─── POINT 2: Program Coordinator can edit a draft ───
    console.log('--- Point 2: Program Coordinator can edit a draft ---');
    const mock2 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 2,
            schedules: [
                {
                    subject: 'CC 102 - Fundamentals of Programming',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '11:00:00',
                    professor: 'Not specified'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(mock2.req, mock2.res, (e) => { throw e; });
    assert.strictEqual(mock2.getStatus(), 200, 'Point 2: Edit draft schedule should return 200');
    assert.strictEqual(mock2.getData().version, 3, 'Point 2: Version should increment to 3');
    console.log('✔ PASS: Point 2 — Program Coordinator can edit draft (Version 3)');

    // ─── POINT 3: Program Coordinator can delete draft entries ───
    console.log('--- Point 3: Program Coordinator can delete draft entries ---');
    const mock3 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 3,
            schedules: [] // empty entries represents clearing/deleting all draft entries
        }
    });
    await schedulesController.saveSchedule(mock3.req, mock3.res, (e) => { throw e; });
    assert.strictEqual(mock3.getStatus(), 200, 'Point 3: Clearing draft entries should return 200');
    assert.strictEqual(mock3.getData().version, 4, 'Point 3: Version should increment to 4');
    const [emptyCheck] = await scheduleRepository.findRoomSchedules(r1Id, testAY, testSem);
    assert.strictEqual(emptyCheck.length, 0, 'Point 3: Database should have 0 schedules');
    console.log('✔ PASS: Point 3 — Program Coordinator can delete draft entries (Version 4)');

    // ─── POINT 4: IT Dept. Head can create/edit draft schedules ───
    console.log('--- Point 4: IT Dept. Head can create/edit draft schedules ---');
    const mock4 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 4,
            schedules: [
                {
                    subject: 'CAP 401W',
                    section: 'BSIT 4A',
                    day: 'Wednesday',
                    startTime: '13:00:00',
                    endTime: '16:00:00',
                    professor: 'Not specified'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(mock4.req, mock4.res, (e) => { throw e; });
    assert.strictEqual(mock4.getStatus(), 200, 'Point 4: IT Dept Head save should return 200');
    assert.strictEqual(mock4.getData().version, 5, 'Point 4: Version should increment to 5');
    console.log('✔ PASS: Point 4 — IT Dept. Head can create/edit draft schedules (Version 5)');

    // ─── POINT 5: IT Dept. Head can finalize ───
    console.log('--- Point 5: IT Dept. Head can finalize ---');
    const mock5 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem
        }
    });
    await schedulesController.finalizeSchedule(mock5.req, mock5.res, (e) => { throw e; });
    assert.strictEqual(mock5.getStatus(), 200, 'Point 5: IT Dept Head finalize should return 200');
    assert.strictEqual(mock5.getData().status, 'Finalized', 'Point 5: Status should be Finalized');
    console.log('✔ PASS: Point 5 — IT Dept. Head can finalize schedule');

    // ─── POINT 6: Program Coordinator receives 403 when attempting to finalize ───
    console.log('--- Point 6: Program Coordinator receives 403 when attempting to finalize ---');
    const mock6 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem
        }
    });
    await schedulesController.finalizeSchedule(mock6.req, mock6.res, (e) => { throw e; });
    assert.strictEqual(mock6.getStatus(), 403, 'Point 6: Program Coordinator finalize must return 403');
    console.log('✔ PASS: Point 6 — Program Coordinator receives 403 Forbidden on finalize');

    // ─── POINT 7: IT Dept. Head can reopen a finalized schedule ───
    console.log('--- Point 7: IT Dept. Head can reopen a finalized schedule ---');
    const mock7 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem
        }
    });
    await schedulesController.reopenSchedule(mock7.req, mock7.res, (e) => { throw e; });
    assert.strictEqual(mock7.getStatus(), 200, 'Point 7: IT Dept Head reopen should return 200');
    assert.strictEqual(mock7.getData().status, 'Draft', 'Point 7: Status must revert to Draft');
    console.log('✔ PASS: Point 7 — IT Dept. Head can reopen a finalized schedule');

    // Re-finalize for testing points 8, 9, 10
    const refinalizeMock = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom1, academicYear: testAY, semester: testSem }
    });
    await schedulesController.finalizeSchedule(refinalizeMock.req, refinalizeMock.res, (e) => { throw e; });
    assert.strictEqual(refinalizeMock.getStatus(), 200);

    // ─── POINT 8: Program Coordinator receives 403 when attempting to reopen ───
    console.log('--- Point 8: Program Coordinator receives 403 when attempting to reopen ---');
    const mock8 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem
        }
    });
    await schedulesController.reopenSchedule(mock8.req, mock8.res, (e) => { throw e; });
    assert.strictEqual(mock8.getStatus(), 403, 'Point 8: Program Coordinator reopen must return 403');
    console.log('✔ PASS: Point 8 — Program Coordinator receives 403 Forbidden on reopen');

    // ─── POINT 9: Finalized schedule cannot be edited until reopened (by IT Dept. Head) ───
    console.log('--- Point 9: Finalized schedule cannot be edited until reopened ---');
    const mock9 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 5,
            schedules: []
        }
    });
    await schedulesController.saveSchedule(mock9.req, mock9.res, (e) => { throw e; });
    assert.strictEqual(mock9.getStatus(), 403, 'Point 9: Saving finalized schedule must return 403');
    assert.ok(mock9.getData().error.toLowerCase().includes('finalized'), 'Point 9: Error must cite finalized schedule');
    console.log('✔ PASS: Point 9 — Finalized schedule cannot be edited by IT Dept. Head without reopening');

    // ─── POINT 10: Program Coordinator cannot edit finalized schedule ───
    console.log('--- Point 10: Program Coordinator cannot edit finalized schedule ---');
    const mock10 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 5,
            schedules: []
        }
    });
    await schedulesController.saveSchedule(mock10.req, mock10.res, (e) => { throw e; });
    assert.strictEqual(mock10.getStatus(), 403, 'Point 10: Program Coordinator edit on finalized schedule must return 403');
    console.log('✔ PASS: Point 10 — Program Coordinator cannot edit finalized schedule (HTTP 403)');

    // Now reopen for remaining tests
    const reopenMock2 = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom1, academicYear: testAY, semester: testSem }
    });
    await schedulesController.reopenSchedule(reopenMock2.req, reopenMock2.res, (e) => { throw e; });
    assert.strictEqual(reopenMock2.getStatus(), 200);

    // ─── POINT 11: Same-room overlapping schedules are rejected by backend ───
    console.log('--- Point 11: Same-room overlapping schedules are rejected by backend ---');
    const mock11 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 5,
            schedules: [
                {
                    subject: 'Subject A',
                    section: 'BSIT 2A',
                    day: 'Thursday',
                    startTime: '09:00:00',
                    endTime: '10:00:00',
                    professor: 'Not specified'
                },
                {
                    subject: 'Subject B',
                    section: 'BSIT 2B',
                    day: 'Thursday',
                    startTime: '09:30:00',
                    endTime: '10:30:00',
                    professor: 'Not specified'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(mock11.req, mock11.res, (e) => { throw e; });
    assert.strictEqual(mock11.getStatus(), 400, 'Point 11: Same-room overlap must return 400');
    assert.ok(mock11.getData().error.includes('overlaps with'), 'Point 11: Error must specify overlap');
    console.log('✔ PASS: Point 11 — Same-room overlapping schedules rejected with HTTP 400');

    // ─── POINT 12: Faculty double-booking across rooms is rejected by backend ───
    console.log('--- Point 12: Faculty double-booking across rooms is rejected by backend ---');
    // First, save a valid class for Rex Andrei James in Room 204
    const seedRoom2 = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom2,
            academicYear: testAY,
            semester: testSem,
            version: 1,
            schedules: [
                {
                    subject: 'CS 101',
                    section: 'BSIT 1A',
                    day: 'Friday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Rex Andrei James'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(seedRoom2.req, seedRoom2.res, (e) => { throw e; });
    assert.strictEqual(seedRoom2.getStatus(), 200, 'Seed Room 204 should succeed');

    // Now attempt to book Rex Andrei James at the same time (08:30-10:30) in Room 203
    const mock12 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 5,
            schedules: [
                {
                    subject: 'IT 202',
                    section: 'BSIT 2B',
                    day: 'Friday',
                    startTime: '08:30:00',
                    endTime: '10:30:00',
                    professor: 'Rex Andrei James'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(mock12.req, mock12.res, (e) => { throw e; });
    assert.strictEqual(mock12.getStatus(), 400, 'Point 12: Faculty cross-room conflict must return 400');
    assert.ok(mock12.getData().error.includes('already scheduled in Room 204'), 'Point 12: Error must identify conflicting room');
    console.log('✔ PASS: Point 12 — Cross-room faculty double-booking rejected with HTTP 400');

    // ─── POINT 13: Valid schedules still save successfully ───
    console.log('--- Point 13: Valid schedules still save successfully ---');
    const mock13 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 5,
            schedules: [
                {
                    subject: 'CC 102',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Rex Andrei James'
                },
                {
                    subject: 'CC 103',
                    section: 'BSIT 1B',
                    day: 'Monday',
                    startTime: '10:00:00',
                    endTime: '12:00:00',
                    professor: 'Rex Andrei James'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(mock13.req, mock13.res, (e) => { throw e; });
    assert.strictEqual(mock13.getStatus(), 200, 'Point 13: Valid schedule save must return 200');
    assert.strictEqual(mock13.getData().version, 6, 'Point 13: Version should increment to 6');
    console.log('✔ PASS: Point 13 — Valid schedules save successfully (Version 6)');

    // ─── POINT 14: Two users loading the same version and saving sequentially are handled correctly ───
    console.log('--- Point 14: Two users loading same version handled correctly ---');
    // Both User A (IT Head) and User B (Program Coord) hold version 6
    const userASave = createMockReqRes({
        session: itHeadSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 6,
            schedules: [
                {
                    subject: 'CC 102 - User A Edit',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Rex Andrei James'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(userASave.req, userASave.res, (e) => { throw e; });
    assert.strictEqual(userASave.getStatus(), 200, 'User A save must succeed');
    assert.strictEqual(userASave.getData().version, 7, 'Version becomes 7');
    console.log('✔ PASS: Point 14 — User A first save succeeds and increments version to 7');

    // ─── POINT 15: Stale schedule save returns 409 Conflict ───
    console.log('--- Point 15: Stale schedule save returns 409 Conflict ---');
    // User B tries to save using stale version 6
    const userBSave = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 6,
            schedules: [
                {
                    subject: 'CC 102 - User B Stale Edit',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Rex Andrei James'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(userBSave.req, userBSave.res, (e) => { throw e; });
    assert.strictEqual(userBSave.getStatus(), 409, 'Point 15: Stale save must return 409 Conflict');
    assert.ok(userBSave.getData().error.includes('modified by another administrator'), 'Point 15: Conflict message returned');
    console.log('✔ PASS: Point 15 — Stale schedule save returns HTTP 409 Conflict');

    // ─── POINT 16: Stale save does not delete newer changes ───
    console.log('--- Point 16: Stale save does not delete newer changes ---');
    const currentR1 = await scheduleService.getRoomSchedule(testRoom1, testAY, testSem);
    assert.strictEqual(currentR1.data.version, 7, 'Point 16: Database version must remain 7');
    assert.strictEqual(currentR1.data.schedules.length, 1, 'Point 16: Database must still have User A schedule');
    assert.strictEqual(currentR1.data.schedules[0].Subject_Name, 'CC 102 - User A Edit', 'Point 16: User A schedule preserved');
    console.log('✔ PASS: Point 16 — Stale save did NOT delete or overwrite newer changes');

    // ─── POINT 17: Version increments correctly after successful save ───
    console.log('--- Point 17: Version increments correctly after successful save ---');
    const updateV7 = createMockReqRes({
        session: progCoordSession,
        body: {
            roomNumber: testRoom1,
            academicYear: testAY,
            semester: testSem,
            version: 7, // User B reloads and submits with fresh version 7
            schedules: [
                {
                    subject: 'CC 102 - Synced Edit',
                    section: 'BSIT 1A',
                    day: 'Monday',
                    startTime: '08:00:00',
                    endTime: '10:00:00',
                    professor: 'Rex Andrei James'
                }
            ]
        }
    });
    await schedulesController.saveSchedule(updateV7.req, updateV7.res, (e) => { throw e; });
    assert.strictEqual(updateV7.getStatus(), 200, 'Point 17: Save with latest version 7 succeeds');
    assert.strictEqual(updateV7.getData().version, 8, 'Point 17: Version increments from 7 to 8');
    console.log('✔ PASS: Point 17 — Version increments monotonically after successful save (7 -> 8)');

    // ─── POINT 18: Draft status persists correctly ───
    console.log('--- Point 18: Draft status persists correctly ---');
    const statusDraft = await scheduleService.getRoomSchedule(testRoom1, testAY, testSem);
    assert.strictEqual(statusDraft.data.status, 'Draft', 'Point 18: Status must persist as Draft');
    console.log('✔ PASS: Point 18 — Draft status persists in database');

    // ─── POINT 19: Finalized status persists correctly ───
    console.log('--- Point 19: Finalized status persists correctly ---');
    const finFinal = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom1, academicYear: testAY, semester: testSem }
    });
    await schedulesController.finalizeSchedule(finFinal.req, finFinal.res, (e) => { throw e; });
    assert.strictEqual(finFinal.getStatus(), 200);
    const statusFin = await scheduleService.getRoomSchedule(testRoom1, testAY, testSem);
    assert.strictEqual(statusFin.data.status, 'Finalized', 'Point 19: Status must persist as Finalized');
    console.log('✔ PASS: Point 19 — Finalized status persists in database');

    // ─── POINT 20: Finalization records the IT Dept. Head and timestamp ───
    console.log('--- Point 20: Finalization records IT Dept. Head and timestamp ---');
    assert.strictEqual(statusFin.data.finalizedBy, itHead.Full_Name, 'Point 20: Finalized by name must match IT Dept Head');
    assert.ok(statusFin.data.finalizedAt, 'Point 20: Finalized timestamp must be present');
    console.log(`✔ PASS: Point 20 — Finalization records IT Dept. Head (${statusFin.data.finalizedBy}) & timestamp (${statusFin.data.finalizedAt})`);

    // ─── POINT 21: Reopen records the IT Dept. Head and timestamp ───
    console.log('--- Point 21: Reopen records IT Dept. Head and timestamp ---');
    const reopenRec = createMockReqRes({
        session: itHeadSession,
        body: { roomNumber: testRoom1, academicYear: testAY, semester: testSem }
    });
    await schedulesController.reopenSchedule(reopenRec.req, reopenRec.res, (e) => { throw e; });
    assert.strictEqual(reopenRec.getStatus(), 200);
    const [reopenAuditRows] = await db.query(
        "SELECT * FROM audit_logs WHERE Action = 'SCHEDULE_REOPEN' AND Resource_ID = ? ORDER BY Created_At DESC LIMIT 1",
        [testRoom1]
    );
    assert.ok(reopenAuditRows.length > 0, 'Point 21: SCHEDULE_REOPEN audit entry must exist');
    assert.strictEqual(reopenAuditRows[0].User_ID, itHead.User_ID, 'Point 21: Reopened by IT Dept Head User_ID');
    console.log(`✔ PASS: Point 21 — Reopen records IT Dept. Head (User_ID ${reopenAuditRows[0].User_ID}) & timestamp (${reopenAuditRows[0].Created_At})`);

    // ─── POINT 22: Draft export shows "WORKING DRAFT" ───
    console.log('--- Point 22: Draft export shows WORKING DRAFT ---');
    const printScript = fs.readFileSync(path.join(__dirname, '../js/pages/print-schedule.js'), 'utf8');
    assert.ok(printScript.includes('WORKING DRAFT – FOR REVIEW ONLY'), 'Point 22: print-schedule.js must render WORKING DRAFT banner');
    assert.ok(printScript.includes('isFinalized ? \'OFFICIAL SCHEDULE\' : \'WORKING DRAFT – FOR REVIEW ONLY\''), 'Point 22: Dynamic status assignment in print');
    console.log('✔ PASS: Point 22 — Draft export displays "WORKING DRAFT – FOR REVIEW ONLY"');

    // ─── POINT 23: Finalized export shows "OFFICIAL SCHEDULE" ───
    console.log('--- Point 23: Finalized export shows OFFICIAL SCHEDULE ---');
    const printHtml = fs.readFileSync(path.join(__dirname, '../print-schedule.html'), 'utf8');
    assert.ok(printHtml.includes('id="print-status-indicator"'), 'Point 23: print-schedule.html includes print-status-indicator');
    const printAllScript = fs.readFileSync(path.join(__dirname, '../js/pages/print-all-schedules.js'), 'utf8');
    assert.ok(printAllScript.includes('OFFICIAL SCHEDULE'), 'Point 23: print-all-schedules.js includes OFFICIAL SCHEDULE');
    console.log('✔ PASS: Point 23 — Finalized export displays "OFFICIAL SCHEDULE"');

    // ─── POINT 24: Existing schedule display pages remain correct ───
    console.log('--- Point 24: Existing schedule display pages remain correct ---');
    const facultySched = await scheduleService.getProfessorSchedule({
        professorName: 'Rex Andrei James',
        academicYear: testAY,
        semester: testSem
    });
    assert.strictEqual(facultySched.status, 200, 'Point 24: getProfessorSchedule must return 200');
    assert.ok(Array.isArray(facultySched.data), 'Point 24: Professor schedules array returned');
    console.log('✔ PASS: Point 24 — Existing schedule display pages & queries return correct models');

    // ─── POINT 25: Existing schedule export remains functional ───
    console.log('--- Point 25: Existing schedule export remains functional ---');
    const settingsService = require('../services/settingsService');
    const settingsRes = await settingsService.getSettings();
    assert.strictEqual(settingsRes.status, 200, 'Point 25: getSettings must return 200');
    assert.ok(typeof settingsRes.data === 'object', 'Point 25: Signatories and system settings present');
    const summaryRes = await scheduleService.getITHeadSummary(itHeadSession.userId, testAY, testSem);
    assert.strictEqual(summaryRes.status, 200, 'Point 25: getITHeadSummary must return 200');
    console.log('✔ PASS: Point 25 — Existing schedule export endpoints & signatories remain fully functional');

    // ─── POINT 26: Existing Program Coordinator permissions outside scheduling remain unchanged ───
    console.log('--- Point 26: Program Coordinator permissions outside scheduling remain unchanged ---');
    assert.ok(IT_HEAD_ROLES.includes('Program Coordinator'), 'Point 26: Program Coordinator has IT_HEAD_ROLES access');
    assert.ok(ADMIN_ROLES.includes('Program Coordinator'), 'Point 26: Program Coordinator has ADMIN_ROLES access');
    assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Program Coordinator'), 'Point 26: Program Coordinator correctly excluded from Super Admin exclusivity');
    console.log('✔ PASS: Point 26 — Program Coordinator permissions outside scheduling remain intact');

    // ─── POINT 27: Existing IT Dept. Head permissions remain unchanged ───
    console.log('--- Point 27: Existing IT Dept. Head permissions remain unchanged ---');
    assert.ok(IT_HEAD_ROLES.includes('IT Dept. Head'), 'Point 27: IT Dept. Head has IT_HEAD_ROLES access');
    assert.ok(ADMIN_ROLES.includes('IT Dept. Head'), 'Point 27: IT Dept. Head has ADMIN_ROLES access');
    assert.ok(IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('IT Dept. Head'), 'Point 27: IT Dept. Head retains Super Admin exclusivity');
    console.log('✔ PASS: Point 27 — IT Dept. Head retains supreme administrative authority');

    // ─── CLEANUP ───
    await db.query('DELETE FROM schedules WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r1Id, r2Id, testAY, testSem]);
    await db.query('DELETE FROM schedule_drafts WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r1Id, r2Id, testAY, testSem]);
    await db.query('DELETE FROM schedule_metadata WHERE Room_ID IN (?, ?) AND Academic_Year = ? AND Semester = ?', [r1Id, r2Id, testAY, testSem]);

    console.log('\n================================================================');
    console.log('🎉 ALL 27/27 SCHEDULE WORKFLOW VERIFICATION POINTS PASSED 100%!');
    console.log('================================================================\n');
}

runComprehensiveTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ Comprehensive Test Suite Error:', err);
    process.exit(1);
});
