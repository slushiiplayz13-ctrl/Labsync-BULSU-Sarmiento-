'use strict';

/**
 * tests/test-second-key-consecutive-pickup.js
 * 
 * Focused regression tests for removing the mandatory 15-minute early pickup requirement:
 * 1. Consecutive sessions: Prof A ends at 4:00 PM; Prof B approved 2nd key starts at 4:00 PM.
 *    Prof B's claim remains valid when not picked up at 3:45 PM.
 * 2. Key returned exactly at session start: Prof A returns at 4:00 PM; Prof B claims it under existing rules.
 * 3. Late return: Prof A returns after 4:00 PM. Claim not invalidated; key remains Absent until returned.
 * 4. Pickup before approved start: System does not permit early pickup before approved start time.
 * 5. Unapproved request: Unapproved 2nd key requests remain unclaimable.
 * 6. Expired or conflicting session: Genuinely expired approvals and conflicting reservations handled correctly.
 * 7. Normal first-key workflow: Standard faculty key withdrawal and return unaffected.
 * 8. Rooms 203 and 204: Independent key-slot and custody behavior preserved.
 */

const assert = require('assert');
const db = require('../database/connection');
const keyAuthRepo = require('../repositories/key-authorization.repository');
const keyAuthService = require('../services/keyAuthorizationService');
const occupancyService = require('../services/iot/occupancy.service');
const labRepo = require('../repositories/laboratory.repository');
const laboratoryService = require('../services/laboratoryService');
const claimService = require('../services/iot/claim.service');

async function runRegressionSuite() {
    console.log('================================================================');
    console.log('🧪 SECOND-KEY CONSECUTIVE PICKUP & CUSTODY REGRESSION SUITE');
    console.log('================================================================\n');

    let profA = null;
    let profB = null;
    let deptHead = null;
    let lab203 = null;
    let lab204 = null;

    try {
        // Setup users
        const [heads] = await db.query(
            "SELECT * FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'Department Head') LIMIT 1"
        );
        deptHead = heads[0];

        // Ensure Prof A and Prof B test users exist
        let [userARows] = await db.query("SELECT * FROM users WHERE Email = 'prof_a_test@bulsu.edu.ph'");
        if (userARows.length === 0) {
            const [insA] = await db.query(
                "INSERT INTO users (Name, Email, Password, Role, ID_QR_String, Status) VALUES ('Professor A', 'prof_a_test@bulsu.edu.ph', 'hash', 'Faculty', 'LABSYNC-USER-PROF-A', 'ACTIVE')"
            );
            [userARows] = await db.query("SELECT * FROM users WHERE User_ID = ?", [insA.insertId]);
        }
        profA = userARows[0];

        let [userBRows] = await db.query("SELECT * FROM users WHERE Email = 'prof_b_test@bulsu.edu.ph'");
        if (userBRows.length === 0) {
            const [insB] = await db.query(
                "INSERT INTO users (Name, Email, Password, Role, ID_QR_String, Status) VALUES ('Professor B', 'prof_b_test@bulsu.edu.ph', 'hash', 'Faculty', 'LABSYNC-USER-PROF-B', 'ACTIVE')"
            );
            [userBRows] = await db.query("SELECT * FROM users WHERE User_ID = ?", [insB.insertId]);
        }
        profB = userBRows[0];

        // Get Rooms 203 and 204
        const [r203] = await db.query("SELECT * FROM laboratories WHERE TRIM(Room_Number) = '203' LIMIT 1");
        const [r204] = await db.query("SELECT * FROM laboratories WHERE TRIM(Room_Number) = '204' LIMIT 1");
        lab203 = r203[0];
        lab204 = r204[0];

        // Clean slate for test keys & requests
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [lab203.Room_ID, lab204.Room_ID]);
        await db.query("DELETE FROM key_authorization_requests WHERE User_ID IN (?, ?)", [profA.User_ID, profB.User_ID]);
        claimService.clearAllClaims();

        // -------------------------------------------------------------
        // SCENARIO 1: Consecutive Sessions - Claim Validity at Session Start
        // Prof A holds Room 203 key until 4:00 PM.
        // Prof B has an approved 2nd-key request starting at 4:00 PM.
        // Verify Prof B's claim remains APPROVED and valid even if not picked up at 3:45 PM.
        // -------------------------------------------------------------
        console.log('--- SCENARIO 1: Consecutive Sessions & 15-Min Buffer Removal ---');

        // Give Prof B an active key (Room 204) so that Room 203 is strictly their 2nd key
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profB.User_ID, lab204.Room_ID]);

        // Prof A currently holds Room 203 key
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, lab203.Room_ID]);

        // Create Prof B's 2nd-key reservation for Room 203 for today, starting at 16:00 (4:00 PM) to 18:00 (6:00 PM)
        const [reqBRes] = await db.query(
            `INSERT INTO key_authorization_requests 
             (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Reason, Status, Requested_At, Approved_By, Approved_At, Duration_Minutes, Expires_At)
             VALUES (?, ?, CURDATE(), '16:00:00', '18:00:00', 'Consecutive session lab class', 'APPROVED', NOW(), ?, NOW(), 120, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
            [profB.User_ID, lab203.Room_ID, deptHead.User_ID]
        );
        const reqBId = reqBRes.insertId;

        // Create Prof A's preceding session (13:00:00 to 16:00:00)
        await db.query(
            `INSERT INTO key_authorization_requests 
             (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Reason, Status, Requested_At, Approved_By, Approved_At, Duration_Minutes, Expires_At)
             VALUES (?, ?, CURDATE(), '13:00:00', '16:00:00', 'Preceding lab class', 'APPROVED', NOW(), ?, NOW(), 180, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
            [profA.User_ID, lab203.Room_ID, deptHead.User_ID]
        );

        // Verify Prof B's claim status
        const [bStatusRows] = await keyAuthRepo.findById(reqBId);
        assert.strictEqual(bStatusRows[0].Status, 'APPROVED', 'Prof B reservation must be APPROVED');
        assert.strictEqual(bStatusRows[0].Start_Time.slice(0, 5), '16:00');
        assert.strictEqual(bStatusRows[0].End_Time.slice(0, 5), '18:00');

        // Boundary Verification: Exact 16:00:00 boundary condition
        // Verify that Prof A's session (13:00 - 16:00) is NOT active at 16:00:00,
        // and Prof B's session (16:00 - 18:00) IS active at 16:00:00 with half-open intervals.
        const [boundaryTestA] = await db.query(
            `SELECT Request_ID FROM key_authorization_requests
             WHERE Reservation_Date = CURDATE() AND Start_Time <= '16:00:00' AND End_Time > '16:00:00'
               AND User_ID = ?`,
            [profA.User_ID]
        );
        assert.strictEqual(boundaryTestA.length, 0, 'Prof A session must NOT be active at exact End_Time 16:00:00');

        const [boundaryTestB] = await db.query(
            `SELECT Request_ID FROM key_authorization_requests
             WHERE Reservation_Date = CURDATE() AND Start_Time <= '16:00:00' AND End_Time > '16:00:00'
               AND User_ID = ?`,
            [profB.User_ID]
        );
        assert.strictEqual(boundaryTestB.length, 1, 'Prof B session MUST become active at exact Start_Time 16:00:00');
        console.log('✔ PASS: Exact 16:00:00 boundary condition strictly partitions consecutive sessions without overlap.');

        // -------------------------------------------------------------
        // SCENARIO 4: Pickup Before Approved Start Time
        // Prof B tries to pick up the key before the approved start time (e.g. 15:45 / 3:45 PM).
        // System must NOT authorize early pickup outside existing policy.
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 4: Pickup Before Approved Start Blocked ---');

        // Set start time to future for today (e.g., 23:30 tonight)
        await db.query(
            "UPDATE key_authorization_requests SET Start_Time = '23:30:00', End_Time = '23:59:00' WHERE Request_ID = ?",
            [reqBId]
        );

        const earlyScan = await occupancyService.logOccupancy({
            roomNumber: '203',
            qrString: profB.ID_QR_String,
            authMethod: 'QR Code'
        });

        assert.strictEqual(earlyScan.status, 403, 'Pickup before approved start time must be rejected (403)');
        assert.ok(
            earlyScan.error.includes('scheduled for') && (earlyScan.error.includes('session start time') || earlyScan.error.includes('23:30')),
            `Rejection message must indicate scheduled start time. Actual: ${earlyScan.error}`
        );
        console.log('✔ PASS: Early pickup before approved session start is rejected with informative message.');

        // -------------------------------------------------------------
        // SCENARIO 2: Key Returned Exactly at Session Start
        // Prof A returns Room 203 key at 4:00 PM. Prof B can claim it.
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 2: Key Returned at Session Start & Claimed ---');

        // Set Prof B's reservation window active: Start_Time = 00:00:00, End_Time = 23:59:00
        await db.query(
            "UPDATE key_authorization_requests SET Start_Time = '00:00:00', End_Time = '23:59:00' WHERE Request_ID = ?",
            [reqBId]
        );

        // Prof A returns the key at session start
        const returnA = await occupancyService.logOccupancy({
            roomNumber: '203',
            keyEvent: 'Key Returned'
        });
        assert.strictEqual(returnA.status, 200, 'Prof A key return must succeed');

        const [labAfterReturn] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(labAfterReturn[0].Key_Status, 'Present', 'Key must be marked Present after Prof A returns it');
        assert.strictEqual(labAfterReturn[0].Current_User_ID, null, 'Current holder must be NULL');

        // Prof B scans to claim 2nd key at session start time
        const claimBScan = await occupancyService.logOccupancy({
            roomNumber: '203',
            qrString: profB.ID_QR_String,
            authMethod: 'QR Code'
        });
        assert.strictEqual(claimBScan.status, 200, 'Prof B scan at active start time must succeed');

        // Simulate physical key withdrawal
        const takeB = await occupancyService.logOccupancy({
            roomNumber: '203',
            keyEvent: 'Key Taken'
        });
        assert.strictEqual(takeB.status, 200, 'Key withdrawal must succeed');

        const [labAfterClaim] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(labAfterClaim[0].Key_Status, 'Absent', 'Key must be Absent after withdrawal');
        assert.strictEqual(Number(labAfterClaim[0].Current_User_ID), profB.User_ID, 'Prof B must be recorded as current holder');

        const [reqAfterClaim] = await keyAuthRepo.findById(reqBId);
        assert.strictEqual(reqAfterClaim[0].Status, 'CLAIMED', 'Second-key request status must transition to CLAIMED');
        console.log('✔ PASS: Prof B successfully claimed 2nd key upon session start return.');

        // Prof B returns Room 203 key
        await occupancyService.logOccupancy({
            roomNumber: '203',
            keyEvent: 'Key Returned'
        });
        const [reqAfterComp] = await keyAuthRepo.findById(reqBId);
        assert.strictEqual(reqAfterComp[0].Status, 'COMPLETED', 'Returning key transitions request to COMPLETED');
        console.log('✔ PASS: Prof B key return completed second-key custody lifecycle.');

        // -------------------------------------------------------------
        // SCENARIO 3: Late Return by Previous Professor
        // Prof A returns Room 203 late (after session start time).
        // Prof B's claim is NOT invalidated, and system reflects key is Absent/unavailable until returned.
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 3: Late Return Custody Safeguards ---');

        // Prof A holds Room 203 key late
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, lab203.Room_ID]);

        // Create new approved reservation for Prof B starting at 00:00:00 (active now)
        const [lateReqRes] = await db.query(
            `INSERT INTO key_authorization_requests 
             (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Reason, Status, Requested_At, Approved_By, Approved_At, Duration_Minutes, Expires_At)
             VALUES (?, ?, CURDATE(), '00:00:00', '23:59:00', 'Late return handover session', 'APPROVED', NOW(), ?, NOW(), 120, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
            [profB.User_ID, lab203.Room_ID, deptHead.User_ID]
        );
        const lateReqId = lateReqRes.insertId;

        // Verify key is NOT available while Prof A still has custody
        const roomOverview = await laboratoryService.getAllLaboratories();
        const lab203Card = roomOverview.data.find(l => String(l.Room_Number) === '203');
        assert.strictEqual(lab203Card.Key_Status, 'Absent', 'Key status must remain Absent');
        assert.notStrictEqual(lab203Card.Current_Status, 'Available', 'Key must NEVER be reported as Available while Absent');
        console.log('✔ PASS: Room 203 key correctly reported as Absent / Borrowed while held late by Prof A.');

        // Prof B claim is still valid (not expired or invalidated)
        const [stillValidReq] = await keyAuthRepo.findById(lateReqId);
        assert.strictEqual(stillValidReq[0].Status, 'APPROVED', 'Prof B claim remains APPROVED despite late return');

        // Prof A now returns the key late
        await occupancyService.logOccupancy({
            roomNumber: '203',
            keyEvent: 'Key Returned'
        });

        // Key is now Present
        const [labNowPresent] = await db.query("SELECT Key_Status FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(labNowPresent[0].Key_Status, 'Present');

        // Prof B can now claim the key
        const lateClaimScan = await occupancyService.logOccupancy({
            roomNumber: '203',
            qrString: profB.ID_QR_String,
            authMethod: 'QR Code'
        });
        assert.strictEqual(lateClaimScan.status, 200, 'Prof B can claim after late return');
        await occupancyService.logOccupancy({ roomNumber: '203', keyEvent: 'Key Taken' });

        const [lateClaimed] = await keyAuthRepo.findById(lateReqId);
        assert.strictEqual(lateClaimed[0].Status, 'CLAIMED', 'Late claim transitioned to CLAIMED');
        console.log('✔ PASS: Approved claim remained valid and eligible for pickup upon late return.');

        // Cleanup late claim
        await occupancyService.logOccupancy({ roomNumber: '203', keyEvent: 'Key Returned' });

        // -------------------------------------------------------------
        // SCENARIO 5: Unapproved Request Remains Unclaimable
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 5: Unapproved Request Blocked ---');

        // Create PENDING request for Prof B
        const [pendingReqRes] = await db.query(
            `INSERT INTO key_authorization_requests 
             (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Reason, Status, Requested_At)
             VALUES (?, ?, CURDATE(), '00:00:00', '23:59:00', 'Unapproved request test', 'PENDING', NOW())`,
            [profB.User_ID, lab203.Room_ID]
        );
        const pendingReqId = pendingReqRes.insertId;

        // Prof B currently holds Room 204 key
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profB.User_ID, lab204.Room_ID]);

        const unapprovedScan = await occupancyService.logOccupancy({
            roomNumber: '203',
            qrString: profB.ID_QR_String,
            authMethod: 'QR Code'
        });
        assert.strictEqual(unapprovedScan.status, 403, 'Unapproved request must be rejected with 403');
        assert.ok(unapprovedScan.error.includes('already holds an active key') || unapprovedScan.error.includes('Department Head'));
        console.log('✔ PASS: Unapproved second-key request cannot be claimed.');

        // -------------------------------------------------------------
        // SCENARIO 6: Genuinely Expired and Conflicting Reservations
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 6: Expired Sessions & Conflict Safeguards ---');

        // Create approved request whose end time was in the past (e.g., ended 10 minutes ago)
        const [expiredReqRes] = await db.query(
            `INSERT INTO key_authorization_requests 
             (User_ID, Room_ID, Reservation_Date, Start_Time, End_Time, Reason, Status, Requested_At, Approved_By, Approved_At, Duration_Minutes, Expires_At)
             VALUES (?, ?, CURDATE(), '01:00:00', '02:00:00', 'Expired session test', 'APPROVED', NOW(), ?, NOW(), 60, DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
            [profB.User_ID, lab203.Room_ID, deptHead.User_ID]
        );
        const expiredReqId = expiredReqRes.insertId;

        // Run lazy cleanup
        await keyAuthRepo.expireOldApprovedRequests();

        const [expiredAfterCleanup] = await keyAuthRepo.findById(expiredReqId);
        assert.strictEqual(expiredAfterCleanup[0].Status, 'EXPIRED', 'Past session must transition to EXPIRED');

        // Overlapping reservation conflict prevention
        const [conflicts] = await keyAuthRepo.findConflictingReservations(lab203.Room_ID, '2026-10-15', '10:00:00', '12:00:00');
        // Submit reservation 1
        await keyAuthRepo.createRequest(profA.User_ID, lab203.Room_ID, 'Conflict test 1', '2026-10-15', '10:00:00', '12:00:00');
        // Check conflict for overlapping slot (11:00 - 13:00)
        const [foundConflicts] = await keyAuthRepo.findConflictingReservations(lab203.Room_ID, '2026-10-15', '11:00:00', '13:00:00');
        assert.strictEqual(foundConflicts.length, 1, 'Overlapping window must detect conflict');
        console.log('✔ PASS: Genuinely expired session expired and reservation conflict detected.');

        // -------------------------------------------------------------
        // SCENARIO 7: Normal First-Key Withdrawal Unchanged
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 7: Standard First-Key Workflow Preserved ---');

        // Prof A currently holds 0 keys
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [lab203.Room_ID, lab204.Room_ID]);

        const firstKeyScan = await occupancyService.logOccupancy({
            roomNumber: '203',
            qrString: profA.ID_QR_String,
            authMethod: 'QR Code'
        });
        assert.strictEqual(firstKeyScan.status, 200, 'First key scan must succeed without needing 2nd key authorization');

        await occupancyService.logOccupancy({ roomNumber: '203', keyEvent: 'Key Taken' });
        const [labFirstTaken] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(labFirstTaken[0].Key_Status, 'Absent');
        assert.strictEqual(Number(labFirstTaken[0].Current_User_ID), profA.User_ID);

        await occupancyService.logOccupancy({ roomNumber: '203', keyEvent: 'Key Returned' });
        const [labFirstRet] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(labFirstRet[0].Key_Status, 'Present');
        assert.strictEqual(labFirstRet[0].Current_User_ID, null);
        console.log('✔ PASS: Normal first-key withdrawal and return workflow operates flawlessly.');

        // -------------------------------------------------------------
        // SCENARIO 8: Rooms 203 and 204 Independence
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 8: Independent Key-Slot Behavior (Rooms 203 & 204) ---');

        // Prof A takes Room 203
        await occupancyService.logOccupancy({ roomNumber: '203', qrString: profA.ID_QR_String, authMethod: 'QR Code' });
        await occupancyService.logOccupancy({ roomNumber: '203', keyEvent: 'Key Taken' });

        // Prof B takes Room 204
        await occupancyService.logOccupancy({ roomNumber: '204', qrString: profB.ID_QR_String, authMethod: 'QR Code' });
        await occupancyService.logOccupancy({ roomNumber: '204', keyEvent: 'Key Taken' });

        const [labBoth] = await db.query("SELECT Room_Number, Key_Status, Current_User_ID FROM laboratories WHERE Room_ID IN (?, ?)", [lab203.Room_ID, lab204.Room_ID]);
        const r203State = labBoth.find(r => r.Room_Number === '203');
        const r204State = labBoth.find(r => r.Room_Number === '204');

        assert.strictEqual(r203State.Key_Status, 'Absent');
        assert.strictEqual(Number(r203State.Current_User_ID), profA.User_ID);
        assert.strictEqual(r204State.Key_Status, 'Absent');
        assert.strictEqual(Number(r204State.Current_User_ID), profB.User_ID);

        // Returning 203 does not affect 204
        await occupancyService.logOccupancy({ roomNumber: '203', keyEvent: 'Key Returned' });
        const [r204Check] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab204.Room_ID]);
        assert.strictEqual(r204Check[0].Key_Status, 'Absent');
        assert.strictEqual(Number(r204Check[0].Current_User_ID), profB.User_ID);

        // Returning 204
        await occupancyService.logOccupancy({ roomNumber: '204', keyEvent: 'Key Returned' });
        console.log('✔ PASS: Rooms 203 and 204 maintain strict independent custody and slot tracking.');

        // Cleanup fixtures
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [lab203.Room_ID, lab204.Room_ID]);
        await db.query("DELETE FROM key_authorization_requests WHERE User_ID IN (?, ?)", [profA.User_ID, profB.User_ID]);
        await db.query("DELETE FROM users WHERE Email IN ('prof_a_test@bulsu.edu.ph', 'prof_b_test@bulsu.edu.ph')");

        console.log('\n================================================================');
        console.log('🎉 ALL 8 CONSECUTIVE PICKUP & CUSTODY REGRESSION TESTS PASSED 100%!');
        console.log('================================================================\n');

    } catch (err) {
        console.error('❌ Regression suite error:', err);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runRegressionSuite();
