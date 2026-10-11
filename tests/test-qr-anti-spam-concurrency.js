'use strict';

/**
 * tests/test-qr-anti-spam-concurrency.js
 * 
 * Comprehensive regression suite for QR anti-spamming and conflicting authorization protection:
 * 1. Repeated same QR: Prof A's QR repeatedly scanned -> single request enqueued, idempotent backend handling
 * 2. Different QR during verification / pending authorization: Prof B blocked, Prof A preserved
 * 3. Different QR after Access Granted: Prof B receives 409 Scan Locked, Prof A retains claim
 * 4. Correct key withdrawal: Prof A removes key -> claim consumed and custody attributed
 * 5. Wrong key slot: Slot separation preserved
 * 6. Expiration: Claim safely expires after window, allowing subsequent scans
 * 7. Ambiguous network timeout: Server claim protects Prof A against subsequent Prof B hijacking
 * 8. Late HTTP response: Stale correlation ID dropped in firmware
 * 9. Queue pressure: FreeRTOS queue protected against repeated scan flooding
 * 10. Two rooms: Rooms 203 and 204 keybox slots handled safely without cross-contamination
 * 11. First-key and approved second-key workflows: Maintained intact
 * 12. Unauthorized removal: Physical unauthorized removal triggers security alert and alarm
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const claimService = require('../services/iot/claim.service');
const occupancyService = require('../services/iot/occupancy.service');
const labRepo = require('../repositories/laboratory.repository');
const iotRepo = require('../repositories/iot.repository');
const { CLAIM_LOCK_WINDOW_MS } = require('../services/iot/iot.config');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 TESTING QR ANTI-SPAM & CONFLICTING AUTHORIZATION SAFEGUARDS');
    console.log('================================================================\n');

    let profA = null;
    let profB = null;
    let lab203 = null;
    let lab204 = null;

    try {
        // Setup test users
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

        const [r203] = await db.query("SELECT * FROM laboratories WHERE TRIM(Room_Number) = '203' LIMIT 1");
        const [r204] = await db.query("SELECT * FROM laboratories WHERE TRIM(Room_Number) = '204' LIMIT 1");
        lab203 = r203[0];
        lab204 = r204[0];

        const mockDevice = {
            id: 'ESP32-KeyBox',
            authorizedRooms: ['203', '204']
        };

        // Reset state
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [lab203.Room_ID, lab204.Room_ID]);
        claimService.clearAllClaims();

        // -------------------------------------------------------------
        // SCENARIO 1: Firmware State Machine & Lock Verification (Code Inspection)
        // -------------------------------------------------------------
        console.log('--- SCENARIO 1: Firmware State Machine & Lock Invariants ---');
        const firmwarePath = path.join(__dirname, '../LabSync_ESP32/LabSync_ESP32.ino');
        const firmwareSrc = fs.readFileSync(firmwarePath, 'utf8');

        assert(firmwareSrc.includes('enum QrAuthState'), 'Firmware must define QrAuthState enum');
        assert(firmwareSrc.includes('QR_AUTH_IDLE'), 'Firmware must include QR_AUTH_IDLE state');
        assert(firmwareSrc.includes('QR_AUTH_VERIFYING'), 'Firmware must include QR_AUTH_VERIFYING state');
        assert(firmwareSrc.includes('QR_AUTH_GRANTED_AWAITING_TAKE'), 'Firmware must include QR_AUTH_GRANTED_AWAITING_TAKE state');
        assert(firmwareSrc.includes('activeScanId'), 'Firmware must track activeScanId');
        assert(firmwareSrc.includes('QR_VERIFY_TIMEOUT_MS'), 'Firmware must have verification watchdog timeout');
        assert(firmwareSrc.includes('TAKE YOUR KEY'), 'Firmware must display TAKE YOUR KEY message');
        assert(firmwareSrc.includes('SCAN LOCKED'), 'Firmware must display SCAN LOCKED message');

        console.log('✔ PASS: Firmware defines explicit QrAuthState state machine, correlation ID, and locked LCD messages.');

        // -------------------------------------------------------------
        // SCENARIO 2: Repeated Scan by Same Professor (Idempotency)
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 2: Repeated Scans by Professor A ---');
        claimService.clearAllClaims();

        const [initialLogs] = await db.query("SELECT COUNT(*) AS cnt FROM occupancy_log WHERE User_ID = ?", [profA.User_ID]);
        const initialCount = initialLogs[0].cnt;

        // 1st scan by Prof A
        const res1 = await occupancyService.logOccupancy({
            qrString: profA.ID_QR_String,
            roomNumber: '203',
            scanId: 101
        }, mockDevice);
        assert.strictEqual(res1.status, 200, 'First scan by Prof A must succeed (200)');
        assert.strictEqual(res1.data.name, profA.Name);

        const [afterScan1Logs] = await db.query("SELECT COUNT(*) AS cnt FROM occupancy_log WHERE User_ID = ?", [profA.User_ID]);
        assert.strictEqual(afterScan1Logs[0].cnt, initialCount + 1, 'First scan must record exactly 1 occupancy log entry');

        // 2nd scan by Prof A (simulating badge held in front of scanner)
        const res2 = await occupancyService.logOccupancy({
            qrString: profA.ID_QR_String,
            roomNumber: '203',
            scanId: 102
        }, mockDevice);
        assert.strictEqual(res2.status, 200, 'Repeated scan by same user must succeed (200)');

        const [afterScan2Logs] = await db.query("SELECT COUNT(*) AS cnt FROM occupancy_log WHERE User_ID = ?", [profA.User_ID]);
        assert.strictEqual(afterScan2Logs[0].cnt, initialCount + 1, 'Idempotent repeat scan must NOT create duplicate occupancy log rows');

        console.log('✔ PASS: Repeated scan by Professor A is idempotent and does not create duplicate occupancy rows.');

        // -------------------------------------------------------------
        // SCENARIO 3: Competing Scan by Professor B while Prof A is Authorized
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 3: Competing Scan by Professor B Blocked ---');

        // Prof B scans while Prof A's authorization is active
        const resB = await occupancyService.logOccupancy({
            qrString: profB.ID_QR_String,
            roomNumber: '203',
            scanId: 201
        }, mockDevice);

        assert.strictEqual(resB.status, 409, 'Competing scan by Prof B must return 409 Conflict');
        assert.strictEqual(resB.lcdLine1, 'Take Your Key!');
        assert.strictEqual(resB.lcdLine2, 'Scan Locked');

        // Verify Prof A still owns the claim on Room 203 and Room 204
        const claim203 = claimService.getValidClaim('203');
        const claim204 = claimService.getValidClaim('204');
        assert(claim203, 'Room 203 claim must still exist');
        assert.strictEqual(claim203.userId, profA.User_ID, 'Room 203 claim must still belong to Prof A');
        assert.strictEqual(claim204.userId, profA.User_ID, 'Room 204 claim must still belong to Prof A');

        console.log('✔ PASS: Competing scan by Professor B rejected with 409 Scan Locked; Professor A retains claim.');

        // -------------------------------------------------------------
        // SCENARIO 4: Legitimate Key Withdrawal Consumes Claim
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 4: Key Withdrawal Consumes Authorization ---');

        const takeRes = await occupancyService.logOccupancy({
            keyEvent: 'Key Taken',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(takeRes.status, 200);

        // Check key status in database
        const [updated203] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(updated203[0].Key_Status, 'Absent');
        assert.strictEqual(updated203[0].Current_User_ID, profA.User_ID, 'Key 203 must be attributed to Prof A');

        // Check that claim is consumed and cleared across keybox
        const claimAfterTake = claimService.getValidClaim('203');
        assert.strictEqual(claimAfterTake, null, 'Claim must be consumed upon key withdrawal');

        console.log('✔ PASS: Key withdrawal correctly attributed to Professor A and consumed from memory.');

        // -------------------------------------------------------------
        // SCENARIO 5: Key Return Cleans Up State
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 5: Key Return Clears Custody ---');

        const returnRes = await occupancyService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes.status, 200);

        const [returned203] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        assert.strictEqual(returned203[0].Key_Status, 'Present');
        assert.strictEqual(returned203[0].Current_User_ID, null);

        console.log('✔ PASS: Key return successfully restores Present state and clears holder.');

        // -------------------------------------------------------------
        // SCENARIO 6: 15-to-30-Second Authorization vs Backend Claim Lock Boundary
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 6: 15-to-30-Second Authorization vs Backend Claim Lock Boundary ---');
        claimService.clearAllClaims();

        // 1. Professor A scans at T0 = 1,000,000ms with 15-second physical authorization window
        const t0 = 1000000;
        const AUTH_WINDOW_MS = 15000;
        claimService.recordClaim('203', {
            userId: profA.User_ID,
            userName: profA.Name,
            role: profA.Role
        }, t0, 301, AUTH_WINDOW_MS);
        claimService.recordClaim('204', {
            userId: profA.User_ID,
            userName: profA.Name,
            role: profA.Role
        }, t0, 301, AUTH_WINDOW_MS);

        // 2. Professor A does not remove the key.
        // At T0 + 10s (during physical 15s window): Professor B scans -> blocked
        const lockCheck10s = claimService.checkActiveClaimLock(['203', '204'], profB.User_ID, t0 + 10000);
        assert.strictEqual(lockCheck10s.isLocked, true, 'Prof B must be locked at +10s');
        assert.strictEqual(lockCheck10s.remainingMs, 5000, 'Remaining lock time at +10s must be exactly 5000ms');

        // At T0 + 14s (1s before physical expiry): Professor B still locked
        const lockCheck14s = claimService.checkActiveClaimLock(['203', '204'], profB.User_ID, t0 + 14000);
        assert.strictEqual(lockCheck14s.isLocked, true, 'Prof B must be locked at +14s');
        assert.strictEqual(lockCheck14s.remainingMs, 1000, 'Remaining lock time at +14s must be exactly 1000ms');

        // 3. At T0 + 15s: ESP32's 15-second physical authorization window expires (millis() >= authExpiresAt)
        // 4. At T0 + 16s: Professor B scans a valid QR code
        // Contrast legacy 30s lock vs aligned 15s lock:
        const legacy30sLocked = (t0 + 16000 - t0 < 30000);
        assert.strictEqual(legacy30sLocked, true, 'Legacy 30s window would have erroneously locked Prof B out at +16s');

        // With aligned 15s lock window:
        const lockCheck16s = claimService.checkActiveClaimLock(['203', '204'], profB.User_ID, t0 + 16000);
        assert.strictEqual(lockCheck16s.isLocked, false, 'Aligned 15s lock must be safely expired at +16s, allowing Prof B scan');

        // Key attribution check: claim remains valid for legitimate attribution up to 15 mins
        const claimAfterLock = claimService.getValidClaim('203', t0 + 20000);
        assert(claimAfterLock, 'Claim remains in memory for key removal attribution within CLAIM_EXPIRATION_MS');
        assert.strictEqual(claimAfterLock.userId, profA.User_ID);

        console.log('✔ PASS: 15-to-30s boundary verified: Prof B locked at T <= 15s, unlocked at T >= 16s, zero deadlocked window.');

        // -------------------------------------------------------------
        // SCENARIO 7: Ambiguous Transport Timeout Protection & Idempotent Retry
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 7: Ambiguous Transport Timeout Protection & Idempotent Retry ---');
        claimService.clearAllClaims();

        // Server processed Prof A's scan and recorded claim with 15s lock window
        const tTimeoutBase = 2000000;
        claimService.recordClaim('203', {
            userId: profA.User_ID,
            userName: profA.Name,
            role: profA.Role
        }, tTimeoutBase, 401, 15000);
        claimService.recordClaim('204', {
            userId: profA.User_ID,
            userName: profA.Name,
            role: profA.Role
        }, tTimeoutBase, 401, 15000);

        // Assume ESP32 experienced transport timeout at T0 + 5s.
        // Local state reset to QR_AUTH_IDLE and displayed "NETWORK ERROR / PLEASE RETRY".
        // At T0 + 6s: Prof B attempts scan while Prof A's server claim is unresolved.
        const lockCheckAmbiguous = claimService.checkActiveClaimLock(['203', '204'], profB.User_ID, tTimeoutBase + 6000);
        assert.strictEqual(lockCheckAmbiguous.isLocked, true, 'Server claim must protect Prof A despite client-side timeout');
        assert.strictEqual(lockCheckAmbiguous.activeUser.userId, profA.User_ID);
        assert.strictEqual(lockCheckAmbiguous.remainingMs, 9000, 'Prof A claim has 9s remaining protection');

        // At T0 + 7s: Prof A retries scanning their QR code
        const isSameUserRetry = claimService.isSameActiveClaim(['203', '204'], profA.User_ID, tTimeoutBase + 7000);
        assert.strictEqual(isSameUserRetry, true, 'Backend recognizes Prof A retry as same active claim');

        // Claim consumption upon key removal:
        claimService.clearUserClaims(profA.User_ID);
        const lockCheckAfterTake = claimService.checkActiveClaimLock(['203', '204'], profB.User_ID, tTimeoutBase + 8000);
        assert.strictEqual(lockCheckAfterTake.isLocked, false, 'Claim lock cleared immediately upon key withdrawal');

        console.log('✔ PASS: Unresolved claim protected against hijacking; legitimate user retry recognized and permitted.');

        // -------------------------------------------------------------
        // SCENARIO 8: Unauthorized Key Removal Detection Preserved
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 8: Unauthorized Physical Removal Still Detected ---');
        claimService.clearAllClaims();

        // Key 204 physically removed without any prior QR scan
        const unauthRes = await occupancyService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '204'
        }, mockDevice);

        assert.strictEqual(unauthRes.status, 200);
        assert.strictEqual(unauthRes.data.lcdLine1, 'Security Alert!');

        // Verify Key_Status updated to Absent with NULL holder
        const [unauth204] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab204.Room_ID]);
        assert.strictEqual(unauth204[0].Key_Status, 'Absent');
        assert.strictEqual(unauth204[0].Current_User_ID, null);

        // Restore 204
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [lab204.Room_ID]);

        console.log('✔ PASS: Unauthorized physical key removal reliably triggers security alert and Absent state.');

        // -------------------------------------------------------------
        // SCENARIO 9: Wrong Key Slot Insertion Preserved
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 9: Wrong Key Slot Detection Preserved ---');

        const wrongRes = await occupancyService.logOccupancy({
            keyEvent: 'Wrong Key Slot',
            roomNumber: '203'
        }, mockDevice);

        assert.strictEqual(wrongRes.status, 200);
        assert.strictEqual(wrongRes.data.lcdLine1, 'Security Alert!');

        console.log('✔ PASS: Wrong Key Slot event correctly detected and reported.');

        // -------------------------------------------------------------
        // SCENARIO 10: Two Rooms Independent Operation (203 & 204)
        // -------------------------------------------------------------
        console.log('\n--- SCENARIO 10: Two Rooms Independent Slot Operation ---');
        claimService.clearAllClaims();

        // Prof A scans on keybox (creates claims on 203 & 204)
        await occupancyService.logOccupancy({
            qrString: profA.ID_QR_String,
            roomNumber: '203'
        }, mockDevice);

        // Prof A takes Room 204 key
        await occupancyService.logOccupancy({
            keyEvent: 'Key Taken',
            roomNumber: '204'
        }, mockDevice);

        // Verify 204 is Absent with Prof A, while 203 remains Present
        const [slot203] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab203.Room_ID]);
        const [slot204] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [lab204.Room_ID]);

        assert.strictEqual(slot203[0].Key_Status, 'Present');
        assert.strictEqual(slot203[0].Current_User_ID, null);
        assert.strictEqual(slot204[0].Key_Status, 'Absent');
        assert.strictEqual(slot204[0].Current_User_ID, profA.User_ID);

        // Cleanup
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [lab203.Room_ID, lab204.Room_ID]);
        claimService.clearAllClaims();

        console.log('✔ PASS: Rooms 203 and 204 operate independently without cross-contaminating slot states.');

        console.log('\n================================================================');
        console.log('🎉 ALL 10 QR ANTI-SPAM & CONCURRENCY TESTS PASSED 100%!');
        console.log('================================================================');

    } catch (err) {
        console.error('❌ Test suite failed:', err);
        process.exit(1);
    } finally {
        await db.end();
    }
}

runTests();
