'use strict';

/**
 * tests/test-key-reservation-timezone-eligibility.js
 * 
 * Regression Test Suite:
 * Validates timezone-safe eligibility and expiration for laboratory key reservations.
 * Evaluates consistent behavior in Philippine Time (Asia/Manila, UTC+08:00)
 * across both UTC (cloud/Railway) and Asia/Manila (local) host environments.
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

// If executed without SUBPROCESS_TZ, run the suite under both TZ='UTC' and TZ='Asia/Manila'
if (!process.env.SUBPROCESS_TZ) {
    console.log('================================================================');
    console.log('🧪 KEY RESERVATION TIMEZONE ELIGIBILITY TEST SUITE');
    console.log('================================================================');

    const timezones = ['UTC', 'Asia/Manila'];
    let allPassed = true;

    for (const tz of timezones) {
        console.log(`\n▶▶▶ RUNNING TEST MATRIX UNDER process.env.TZ = "${tz}" ◀◀◀\n`);
        const result = spawnSync(process.execPath, [__filename], {
            env: {
                ...process.env,
                TZ: tz,
                SUBPROCESS_TZ: tz
            },
            stdio: 'inherit'
        });

        if (result.status !== 0) {
            console.error(`❌ Suite FAILED under TZ = "${tz}" (Exit code: ${result.status})`);
            allPassed = false;
        } else {
            console.log(`✔ Suite PASSED cleanly under TZ = "${tz}"`);
        }
    }

    if (!allPassed) {
        console.error('\n❌ One or more timezone test runs failed.');
        process.exit(1);
    }

    console.log('\n================================================================');
    console.log('🎉 ALL TIMEZONE MATRIX TESTS PASSED 100% IN BOTH UTC & ASIA/MANILA!');
    console.log('================================================================\n');
    process.exit(0);
}

// -------------------------------------------------------------------------
// Subprocess test runner implementation
// -------------------------------------------------------------------------

const db = require('../database/connection');
const keyAuthService = require('../services/keyAuthorizationService');
const keyAuthRepo = require('../repositories/key-authorization.repository');
const occupancyService = require('../services/iot/occupancy.service');
const keysService = require('../services/keysService');

const currentTz = process.env.TZ || 'unknown';

async function runTimezoneTests() {
    console.log(`[Host Environment] Running in process.env.TZ = "${currentTz}"`);

    // -------------------------------------------------------------
    // SECTION 1: Pure Mathematical & Date Boundary Evaluation
    // Reservation: October 12, 2026 (3:00 PM - 5:00 PM Manila Time)
    // -------------------------------------------------------------
    console.log('\n--- 1. Verification of Fixed Time Boundaries for Oct 12, 2026 (3:00 PM - 5:00 PM) ---');

    const sampleApprovedRequest = {
        Request_ID: 99991,
        User_ID: 583,
        Room_ID: 6,
        Room_Number: '203',
        Reservation_Date: '2026-10-12',
        Start_Time: '15:00:00',
        End_Time: '17:00:00',
        Status: 'APPROVED',
        Duration_Minutes: 120
    };

    // Test matrix definition:
    // Times in Philippine Time (UTC+8) and their exact UTC equivalents
    const timeMatrix = [
        {
            label: '2:59:59 PM (1 second before window)',
            phTime: '2026-10-12T14:59:59+08:00',
            expectedPickupReady: false,
            expectedFuture: true,
            expectedExpired: false
        },
        {
            label: '3:00:00 PM (exact window start)',
            phTime: '2026-10-12T15:00:00+08:00',
            expectedPickupReady: true,
            expectedFuture: false,
            expectedExpired: false
        },
        {
            label: '4:59:59 PM (1 second before window end)',
            phTime: '2026-10-12T16:59:59+08:00',
            expectedPickupReady: true,
            expectedFuture: false,
            expectedExpired: false
        },
        {
            label: '5:00:00 PM (exact window end)',
            phTime: '2026-10-12T17:00:00+08:00',
            expectedPickupReady: false,
            expectedFuture: false,
            expectedExpired: true
        },
        {
            label: '5:01:00 PM (1 minute after window end)',
            phTime: '2026-10-12T17:01:00+08:00',
            expectedPickupReady: false,
            expectedFuture: false,
            expectedExpired: true
        },
        {
            label: '11:48:47 PM (investigation timestamp)',
            phTime: '2026-10-12T23:48:47+08:00',
            expectedPickupReady: false,
            expectedFuture: false,
            expectedExpired: true
        },
        {
            label: 'October 13, 10:00 AM (next morning)',
            phTime: '2026-10-13T10:00:00+08:00',
            expectedPickupReady: false,
            expectedFuture: false,
            expectedExpired: true
        }
    ];

    for (const testCase of timeMatrix) {
        const refDate = new Date(testCase.phTime);
        const startTimeStr = sampleApprovedRequest.Start_Time.slice(0, 5);
        const endTimeStr = sampleApprovedRequest.End_Time.slice(0, 5);
        const resDateStr = sampleApprovedRequest.Reservation_Date;

        const cleanStart = startTimeStr.length === 5 ? startTimeStr + ':00' : startTimeStr;
        const cleanEnd = endTimeStr.length === 5 ? endTimeStr + ':00' : endTimeStr;

        const pickupStart = new Date(`${resDateStr}T${cleanStart}+08:00`);
        const pickupEnd = new Date(`${resDateStr}T${cleanEnd}+08:00`);

        const isPickupReady = (sampleApprovedRequest.Status === 'APPROVED' && refDate >= pickupStart && refDate < pickupEnd);
        const isFutureReservation = (sampleApprovedRequest.Status === 'APPROVED' && refDate < pickupStart);
        const isExpired = (refDate >= pickupEnd && sampleApprovedRequest.Status !== 'CLAIMED' && sampleApprovedRequest.Status !== 'COMPLETED');

        assert.strictEqual(isPickupReady, testCase.expectedPickupReady,
            `isPickupReady mismatch at ${testCase.label}: expected ${testCase.expectedPickupReady}, got ${isPickupReady}`);
        assert.strictEqual(isFutureReservation, testCase.expectedFuture,
            `isFutureReservation mismatch at ${testCase.label}: expected ${testCase.expectedFuture}, got ${isFutureReservation}`);
        assert.strictEqual(isExpired, testCase.expectedExpired,
            `isExpired mismatch at ${testCase.label}: expected ${testCase.expectedExpired}, got ${isExpired}`);

        console.log(`✔ PASS: ${testCase.label} -> ready=${isPickupReady}, future=${isFutureReservation}, expired=${isExpired}`);
    }

    // -------------------------------------------------------------
    // SECTION 2: Valid Future Reservation Evaluation
    // Reservation: October 14, 2026 (9:00 AM - 11:00 AM)
    // Evaluated at October 12, 11:48:47 PM
    // -------------------------------------------------------------
    console.log('\n--- 2. Valid Future Reservation Preservation ---');
    const futureRequest = {
        Request_ID: 99992,
        User_ID: 583,
        Room_ID: 6,
        Reservation_Date: '2026-10-14',
        Start_Time: '09:00:00',
        End_Time: '11:00:00',
        Status: 'APPROVED'
    };

    const evalTime = new Date('2026-10-12T23:48:47+08:00');
    const futureStart = new Date(`${futureRequest.Reservation_Date}T${futureRequest.Start_Time}+08:00`);
    const futureEnd = new Date(`${futureRequest.Reservation_Date}T${futureRequest.End_Time}+08:00`);

    const futureReady = (futureRequest.Status === 'APPROVED' && evalTime >= futureStart && evalTime < futureEnd);
    const futureIsFuture = (futureRequest.Status === 'APPROVED' && evalTime < futureStart);
    const futureExpired = (evalTime >= futureEnd);

    assert.strictEqual(futureReady, false, 'Future reservation must NOT be pickup-ready on Oct 12');
    assert.strictEqual(futureIsFuture, true, 'Future reservation must be marked as future on Oct 12');
    assert.strictEqual(futureExpired, false, 'Future reservation must NOT be expired on Oct 12');
    console.log('✔ PASS: Future reservation remains APPROVED and NOT ready/expired on Oct 12.');

    // -------------------------------------------------------------
    // SECTION 3: Approval Flow Protection Against Reviving Expired Windows
    // -------------------------------------------------------------
    console.log('\n--- 3. Approval Flow: Reject Reviving Expired Reservations ---');

    // Setup temporary test records in database
    const [facultyUsers] = await db.query("SELECT User_ID, Role FROM users WHERE Role = 'Faculty' LIMIT 1");
    const [deptHeadUsers] = await db.query("SELECT User_ID, Role FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'IT Dept Head') LIMIT 1");
    const [labs] = await db.query("SELECT Room_ID, Room_Number FROM laboratories LIMIT 1");

    if (facultyUsers.length === 0 || deptHeadUsers.length === 0 || labs.length === 0) {
        console.warn('⚠️ Skipping DB integration checks: Missing test fixtures in local database.');
        return;
    }

    const testFaculty = facultyUsers[0];
    const testDeptHead = deptHeadUsers[0];
    const testLab = labs[0];

    // Clean any residual test records
    await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [testFaculty.User_ID]);

    // Insert a pending request for an expired slot (October 12, 3:00 PM - 5:00 PM)
    const [insertExpiredRes] = await db.query(
        `INSERT INTO key_authorization_requests 
         (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Duration_Minutes, Reason, Status, Requested_At)
         VALUES (?, ?, '2026-10-12', '15:00:00', '17:00:00', 120, 'Timezone test past session', 'PENDING', NOW())`,
        [testFaculty.User_ID, testLab.Room_ID]
    );
    const expiredReqId = insertExpiredRes.insertId;

    // Attempt to approve this request when current time is 11:48:47 PM on October 12
    const approvePastAttempt = await keyAuthService.approveRequest(
        expiredReqId,
        testDeptHead.User_ID,
        testDeptHead.Role,
        120,
        null,
        { referenceTime: new Date('2026-10-12T23:48:47+08:00') }
    );

    assert.strictEqual(approvePastAttempt.status, 400, 'Approving an already-ended session must return 400 Bad Request');
    assert.ok(approvePastAttempt.error.includes('scheduled reservation window has already ended'),
        `Error message must indicate session has ended: "${approvePastAttempt.error}"`);
    console.log('✔ PASS: Approval of already-ended reservation rejected with 400 (no revival/extension).');

    // Verify record transitioned to EXPIRED and was not approved
    const [checkExpiredRow] = await db.query('SELECT Status, Expires_At FROM key_authorization_requests WHERE Request_ID = ?', [expiredReqId]);
    assert.strictEqual(checkExpiredRow[0].Status, 'EXPIRED', 'Record status must transition to EXPIRED (not APPROVED) on failed approval');
    assert.strictEqual(checkExpiredRow[0].Expires_At, null, 'Expires_At must remain NULL');
    console.log('✔ PASS: Expired reservation transitioned to EXPIRED in database and was not approved.');

    // -------------------------------------------------------------
    // SECTION 4: Approval Flow: Permitting Valid Future Reservations
    // -------------------------------------------------------------
    console.log('\n--- 4. Approval Flow: Preserving Valid Future Reservations ---');

    const [insertFutureRes] = await db.query(
        `INSERT INTO key_authorization_requests 
         (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Duration_Minutes, Reason, Status, Requested_At)
         VALUES (?, ?, '2026-10-14', '09:00:00', '11:00:00', 120, 'Timezone test future session', 'PENDING', NOW())`,
        [testFaculty.User_ID, testLab.Room_ID]
    );
    const futureReqId = insertFutureRes.insertId;

    const approveFutureAttempt = await keyAuthService.approveRequest(
        futureReqId,
        testDeptHead.User_ID,
        testDeptHead.Role,
        120,
        null,
        { referenceTime: new Date('2026-10-12T23:48:47+08:00') }
    );

    assert.strictEqual(approveFutureAttempt.status, 200, 'Approving valid future reservation must return 200 OK');
    assert.strictEqual(approveFutureAttempt.data.status, 'APPROVED');

    // Verify Expires_At is set to scheduled end in Philippine Time (2026-10-14 11:00:00+08:00 -> 03:00:00 UTC)
    const expectedExpiryEpoch = new Date('2026-10-14T11:00:00+08:00').getTime();
    const actualExpiryEpoch = new Date(approveFutureAttempt.data.expiresAt).getTime();
    assert.strictEqual(actualExpiryEpoch, expectedExpiryEpoch, 'Expires_At must anchor to Philippine Time (+08:00)');
    console.log('✔ PASS: Valid future reservation successfully approved with exact Philippine end timestamp.');

    // -------------------------------------------------------------
    // SECTION 5: Repository Parameterized Queries at Time Boundaries
    // -------------------------------------------------------------
    console.log('\n--- 5. Repository Parameterized Queries (DB Timezone Independence) ---');

    // Test active authorization query for Room 203 across Philippine time points
    // Insert approved reservation for 2026-10-12 (15:00:00 - 17:00:00)
    await db.query(
        `UPDATE key_authorization_requests 
         SET Status = 'APPROVED', Approved_By = ?, Approved_At = '2026-10-12 10:00:00', 
             Expires_At = '2026-10-12 17:00:00'
         WHERE Request_ID = ?`,
        [testDeptHead.User_ID, expiredReqId]
    );

    // 2:59:59 PM -> Not Active
    const [rowsBefore] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(
        testFaculty.User_ID, testLab.Room_Number, db, '2026-10-12', '14:59:59'
    );
    assert.strictEqual(rowsBefore.length, 0, 'Must NOT find active authorization before start time (14:59:59)');

    // 3:00:00 PM -> Active
    const [rowsStart] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(
        testFaculty.User_ID, testLab.Room_Number, db, '2026-10-12', '15:00:00'
    );
    assert.strictEqual(rowsStart.length, 1, 'MUST find active authorization at start time (15:00:00)');

    // 4:59:59 PM -> Active
    const [rowsActive] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(
        testFaculty.User_ID, testLab.Room_Number, db, '2026-10-12', '16:59:59'
    );
    assert.strictEqual(rowsActive.length, 1, 'MUST find active authorization before end time (16:59:59)');

    // 5:00:00 PM -> Not Active
    const [rowsEnd] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(
        testFaculty.User_ID, testLab.Room_Number, db, '2026-10-12', '17:00:00'
    );
    assert.strictEqual(rowsEnd.length, 0, 'Must NOT find active authorization at end time (17:00:00)');

    // 11:48:47 PM -> Not Active
    const [rowsNight] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(
        testFaculty.User_ID, testLab.Room_Number, db, '2026-10-12', '23:48:47'
    );
    assert.strictEqual(rowsNight.length, 0, 'Must NOT find active authorization at night (23:48:47)');

    // Next day October 13 at 10:00 AM -> Not Active
    const [rowsNextDay] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(
        testFaculty.User_ID, testLab.Room_Number, db, '2026-10-13', '10:00:00'
    );
    assert.strictEqual(rowsNextDay.length, 0, 'Must NOT find active authorization on next day');

    console.log('✔ PASS: Repository active queries strictly match Philippine time bounds regardless of server clock.');

    // -------------------------------------------------------------
    // SECTION 6: Expiration Cleanup (expireOldApprovedRequests)
    // -------------------------------------------------------------
    console.log('\n--- 6. Lazy Expiration Cleanup at 11:48:47 PM ---');

    // Run expiration cleanup evaluated at Oct 12, 11:48:47 PM
    await keyAuthRepo.expireOldApprovedRequests('2026-10-12', '23:48:47');

    const [expiredCheck] = await keyAuthRepo.findById(expiredReqId);
    assert.strictEqual(expiredCheck[0].Status, 'EXPIRED', 'Oct 12 3-5 PM session must be marked EXPIRED at 11:48:47 PM');

    const [futureCheck] = await keyAuthRepo.findById(futureReqId);
    assert.strictEqual(futureCheck[0].Status, 'APPROVED', 'Oct 14 future session must REMAIN APPROVED');
    console.log('✔ PASS: Past session transitioned to EXPIRED; future reservation preserved as APPROVED.');

    // -------------------------------------------------------------
    // SECTION 7: getFacultyRequestStatus Integration
    // -------------------------------------------------------------
    console.log('\n--- 7. Faculty Request Status Endpoint Check ---');

    // At 11:48:47 PM, getFacultyRequestStatus for testFaculty
    const statusResult = await keyAuthService.getFacultyRequestStatus(testFaculty.User_ID, {
        referenceTime: new Date('2026-10-12T23:48:47+08:00')
    });

    assert.strictEqual(statusResult.status, 200);
    // The latest active/relevant request will either be the future one or the expired one
    if (statusResult.data.Request_ID === expiredReqId) {
        assert.strictEqual(statusResult.data.isPickupReady, false, 'Expired request must NOT be pickup ready');
        assert.strictEqual(statusResult.data.isExpired, true, 'Expired request must be flagged isExpired');
    } else if (statusResult.data.Request_ID === futureReqId) {
        assert.strictEqual(statusResult.data.isPickupReady, false, 'Future request must NOT be pickup ready on Oct 12');
        assert.strictEqual(statusResult.data.isFutureReservation, true, 'Future request must be flagged isFutureReservation');
    }
    console.log('✔ PASS: Faculty request status does NOT grant pickup readiness outside session window.');

    // -------------------------------------------------------------
    // SECTION 8: Reported Bug - Overdue Pending Reservation Expiration & Protection
    // Case: Room 203, Oct 12 8:00 AM - 10:00 AM, Reason "Laro tayo", Status PENDING
    // Evaluated at Oct 13, 2026, 12:29 AM Philippine Time
    // -------------------------------------------------------------
    console.log('\n--- 8. Reported Bug: Overdue PENDING Reservation (Oct 12 8-10 AM at Oct 13 12:29 AM) ---');

    // Clean any prior records
    await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [testFaculty.User_ID]);

    const [bugInsertRes] = await db.query(
        `INSERT INTO key_authorization_requests
         (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Duration_Minutes, Reason, Status, Requested_At)
         VALUES (?, ?, '2026-10-12', '08:00:00', '10:00:00', 120, 'Laro tayo', 'PENDING', '2026-10-11 18:00:00')`,
        [testFaculty.User_ID, testLab.Room_ID]
    );
    const bugReqId = bugInsertRes.insertId;

    const oct13MidnightTime = new Date('2026-10-13T00:29:00+08:00');

    // 8a. Verify lazy cleanup transitions the PENDING request to EXPIRED
    await keyAuthRepo.expireOldApprovedRequests('2026-10-13', '00:29:00');

    const [bugRowAfterCleanup] = await keyAuthRepo.findById(bugReqId);
    assert.strictEqual(bugRowAfterCleanup[0].Status, 'EXPIRED', 'Overdue PENDING reservation must transition to EXPIRED');
    console.log('✔ PASS: Overdue PENDING request transitioned to EXPIRED in database.');

    // 8b. Verify Department Head pending review queue excludes the expired request
    const deptHeadPendingList = await keyAuthService.getPendingRequestsForDeptHead(
        testDeptHead.User_ID, testDeptHead.Role, 'pending', { referenceTime: oct13MidnightTime }
    );
    assert.strictEqual(deptHeadPendingList.status, 200);
    const foundInPending = (deptHeadPendingList.data || []).find(r => r.Request_ID === bugReqId);
    assert.ok(!foundInPending, 'Overdue reservation must NOT appear in Dept Head pending queue');
    console.log('✔ PASS: Dept Head pending queue excludes the overdue reservation.');

    // 8c. Verify Department Head cannot approve the overdue reservation
    const overdueApproveRes = await keyAuthService.approveRequest(
        bugReqId, testDeptHead.User_ID, testDeptHead.Role, 120, null, { referenceTime: oct13MidnightTime }
    );
    assert.strictEqual(overdueApproveRes.status, 400, 'Attempting to approve overdue reservation must return 400 Bad Request');
    const [bugRowAfterApproveAttempt] = await keyAuthRepo.findById(bugReqId);
    assert.strictEqual(bugRowAfterApproveAttempt[0].Status, 'EXPIRED', 'Status must remain EXPIRED and not change to APPROVED');
    console.log('✔ PASS: Dept Head cannot approve overdue reservation; remains EXPIRED.');

    // 8d. Verify faculty request status endpoint reports it as EXPIRED (no longer pending banner)
    const facultyBugStatus = await keyAuthService.getFacultyRequestStatus(testFaculty.User_ID, {
        referenceTime: oct13MidnightTime
    });
    assert.strictEqual(facultyBugStatus.status, 200);
    assert.strictEqual(facultyBugStatus.data.Status, 'EXPIRED', 'Faculty request status must report Status as EXPIRED');
    assert.strictEqual(facultyBugStatus.data.isExpired, true, 'isExpired flag must be true');
    assert.strictEqual(facultyBugStatus.data.isPickupReady, false, 'isPickupReady must be false');
    console.log('✔ PASS: Faculty request status reports EXPIRED (Room Status banner will not show "Pending").');

    // 8e. Verify a reservation that has not yet reached its scheduled end time is NOT prematurely expired
    const [ongoingInsertRes] = await db.query(
        `INSERT INTO key_authorization_requests
         (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Duration_Minutes, Reason, Status, Requested_At)
         VALUES (?, ?, '2026-10-13', '14:00:00', '16:00:00', 120, 'Afternoon session', 'PENDING', '2026-10-13 10:00:00')`,
        [testFaculty.User_ID, testLab.Room_ID]
    );
    const ongoingReqId = ongoingInsertRes.insertId;

    // Evaluated at 12:29 PM (before 4:00 PM end time)
    await keyAuthRepo.expireOldApprovedRequests('2026-10-13', '12:29:00');
    const [ongoingCheckBefore] = await keyAuthRepo.findById(ongoingReqId);
    assert.strictEqual(ongoingCheckBefore[0].Status, 'PENDING', 'Active/ongoing reservation must NOT prematurely expire before end time');
    console.log('✔ PASS: Reservation prior to scheduled end time is not prematurely expired.');

    // 8f. Verify exact end-time boundary: at 16:00:00, reservation expires
    await keyAuthRepo.expireOldApprovedRequests('2026-10-13', '16:00:00');
    const [ongoingCheckAtEnd] = await keyAuthRepo.findById(ongoingReqId);
    assert.strictEqual(ongoingCheckAtEnd[0].Status, 'EXPIRED', 'Reservation must transition to EXPIRED exactly at scheduled end time');
    console.log('✔ PASS: Exact end-time boundary expires reservation.');

    // 8g. Verify valid future pending reservation remains PENDING
    const [futurePendingInsertRes] = await db.query(
        `INSERT INTO key_authorization_requests
         (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Duration_Minutes, Reason, Status, Requested_At)
         VALUES (?, ?, '2026-10-14', '09:00:00', '11:00:00', 120, 'Future pending session', 'PENDING', '2026-10-13 10:00:00')`,
        [testFaculty.User_ID, testLab.Room_ID]
    );
    const futurePendingReqId = futurePendingInsertRes.insertId;

    await keyAuthRepo.expireOldApprovedRequests('2026-10-13', '12:29:00');
    const [futurePendingCheck] = await keyAuthRepo.findById(futurePendingReqId);
    assert.strictEqual(futurePendingCheck[0].Status, 'PENDING', 'Valid future pending reservation must remain PENDING');
    console.log('✔ PASS: Valid future pending reservation remains PENDING.');

    // -------------------------------------------------------------
    // SECTION 9: Clean Up Test Fixtures
    // -------------------------------------------------------------
    await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [testFaculty.User_ID]);
    console.log('✔ PASS: Cleaned up test database records.');
}

runTimezoneTests()
    .then(() => {
        console.log(`\nAll tests under TZ = "${currentTz}" completed successfully.\n`);
        process.exit(0);
    })
    .catch(err => {
        console.error(`\n❌ Error under TZ = "${currentTz}":`, err);
        process.exit(1);
    });
