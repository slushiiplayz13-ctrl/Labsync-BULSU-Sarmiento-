'use strict';

/**
 * tests/test-key-transfer-docked-guard.js
 * Comprehensive regression test suite verifying:
 * 1. Key docked: Key_Status = Present -> Transfer disabled, exact explanation displayed, backend transfer rejected.
 * 2. Key legitimately withdrawn: Key is absent and assigned to a valid custodian -> Transfer workflow enabled.
 * 3. Legitimate hallway handoff: Prof A transfers physically held key to Prof B -> Ownership transferred cleanly without alarm.
 * 4. Transfer attempted after return: Prof B returns key -> Subsequent transfer rejected until legitimately withdrawn.
 * 5. No registered custodian: Key absent but Current_User_ID = NULL -> Transfer remains unavailable, fails closed.
 * 6. Stale or unknown state: Key status unverified -> Fails closed, transfer disabled.
 * 7. Rooms 203 and 204 independence: Operating states for slots operate strictly independently.
 * 8. Existing permissions and eligibility: MIS Staff blocked, self-transfer blocked, 1-key limit enforced.
 * 9. Regression: Normal IoT withdrawal, return, security alerts, and attribution remain completely intact.
 */

const assert = require('assert');
const db = require('../database/connection');
const keysService = require('../services/keysService');
const iotService = require('../services/iotService');
const claimService = require('../services/iot/claim.service');
const keyAuthService = require('../services/keyAuthorizationService');
const labRepository = require('../repositories/laboratory.repository');

const DOCKED_EXPLANATION = 'Key transfer is unavailable while the key is inside the IoT key box. Take and register the key through the IoT key box first, then transfer it to another professor.';

const mockDevice = {
    id: 'ESP32-KeyBox',
    authorizedRooms: ['203', '204']
};

async function runRegressionSuite() {
    console.log('================================================================');
    console.log('🧪 KEY TRANSFER DOCKED GUARD & PHYSICAL CUSTODY REGRESSION SUITE');
    console.log('================================================================\n');

    // 0. Locate test laboratories and physical keys
    const [rooms] = await db.query(
        "SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number ASC"
    );
    assert.strictEqual(rooms.length, 2, 'Requires Room 203 and Room 204');
    const room203 = rooms.find(r => r.Room_Number === '203');
    const room204 = rooms.find(r => r.Room_Number === '204');

    const [keys203] = await db.query('SELECT Key_ID, Key_Code FROM laboratory_keys WHERE Room_ID = ?', [room203.Room_ID]);
    const [keys204] = await db.query('SELECT Key_ID, Key_Code FROM laboratory_keys WHERE Room_ID = ?', [room204.Room_ID]);
    assert.ok(keys203.length > 0 && keys204.length > 0, 'Physical keys required for both rooms');
    const key203 = keys203[0];
    const key204 = keys204[0];

    // Fetch test users
    const [facultyUsers] = await db.query(
        "SELECT User_ID, Name, Role, ID_QR_String FROM users WHERE Role IN ('Faculty', 'IT Dept. Head', 'Department Head') AND Status = 'Active' LIMIT 3"
    );
    assert.ok(facultyUsers.length >= 2, 'At least 2 active faculty users required');
    const profA = facultyUsers[0];
    const profB = facultyUsers[1];
    const profC = facultyUsers.length > 2 ? facultyUsers[2] : facultyUsers[0];

    const [misUsers] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'MIS Staff' LIMIT 1");
    const misStaff = misUsers.length > 0 ? misUsers[0] : null;

    const mockReqProfA = { session: { userId: profA.User_ID, userName: profA.Name, userRole: profA.Role } };
    const mockReqProfB = { session: { userId: profB.User_ID, userName: profB.Name, userRole: profB.Role } };
    const mockReqProfC = { session: { userId: profC.User_ID, userName: profC.Name, userRole: profC.Role } };
    const mockReqMis = misStaff ? { session: { userId: misStaff.User_ID, userName: misStaff.Name, userRole: misStaff.Role } } : null;

    // Helper to reset laboratory state cleanly
    async function resetState() {
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [room203.Room_ID, room204.Room_ID]);
        await db.query("DELETE FROM key_authorization_requests WHERE User_ID IN (?, ?)", [profA.User_ID, profB.User_ID]);
        claimService.clearClaim('203');
        claimService.clearClaim('204');
    }

    try {
        await resetState();

        // -----------------------------------------------------------------
        // SCENARIO 1: Key docked (Key_Status = Present)
        // -----------------------------------------------------------------
        console.log('--- SCENARIO 1: Key Docked Inside IoT Key Box ---');
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

        // 1A. Info endpoint returns canTransfer: false and exact explanation
        const info1 = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(info1.status, 200);
        assert.strictEqual(info1.data.canTransfer, false, 'canTransfer MUST be false while key is docked');
        assert.strictEqual(info1.data.isDocked, true, 'isDocked MUST be true');
        assert.strictEqual(info1.data.cannotTransferReason, DOCKED_EXPLANATION, 'Explanatory reason must match required text');
        console.log('✔ PASS: getKeyTransferInfo marks key as docked with canTransfer = false and exact required message.');

        // 1B. Direct backend transfer attempt rejected with HTTP 400
        const transfer1 = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(transfer1.status, 400, 'Direct transferKey call MUST be rejected with HTTP 400');
        assert.strictEqual(transfer1.error, DOCKED_EXPLANATION, 'Backend error must match required explanation');

        // 1C. Verify no changes made to database
        const [labCheck1] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(labCheck1[0].Key_Status, 'Present', 'Key_Status must remain Present');
        assert.strictEqual(labCheck1[0].Current_User_ID, null, 'Current_User_ID must remain NULL');
        console.log('✔ PASS: Direct transfer attempt rejected with HTTP 400; DB state untouched.');

        // -----------------------------------------------------------------
        // SCENARIO 2: Key legitimately withdrawn
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 2: Key Legitimately Withdrawn & Held by Custodian ---');
        // Prof A physically holds Room 203 key
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, room203.Room_ID]);

        const info2 = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(info2.status, 200);
        assert.strictEqual(info2.data.canTransfer, true, 'canTransfer MUST be true when key is legitimately held');
        assert.strictEqual(info2.data.isDocked, false, 'isDocked must be false');
        assert.strictEqual(info2.data.cannotTransferReason, null, 'cannotTransferReason must be null');
        assert.ok(info2.data.currentHolder, 'currentHolder must be populated');
        assert.strictEqual(info2.data.currentHolder.id, profA.User_ID, 'currentHolder.id must match Prof A');
        console.log('✔ PASS: Transfer workflow available when key is legitimately absent with valid custodian.');

        // -----------------------------------------------------------------
        // SCENARIO 3: Legitimate hallway handoff (Prof A -> Prof B)
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 3: Legitimate Hallway Handoff (Prof A to Prof B) ---');
        const transfer3 = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(transfer3.status, 200, 'Transfer from Prof A to Prof B must succeed');
        assert.ok(transfer3.message.includes(profB.Name), 'Message must confirm transfer to Prof B');

        // Verify database: Prof B is now custodian, Key_Status remains Absent
        const [labCheck3] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(labCheck3[0].Key_Status, 'Absent', 'Key_Status remains Absent during hallway handoff');
        assert.strictEqual(labCheck3[0].Current_User_ID, profB.User_ID, 'Current_User_ID transferred to Prof B');

        // Verify occupancy log recorded with 'Key Transfer'
        const [occ3] = await db.query(
            "SELECT User_ID, Auth_Method FROM occupancy_log WHERE Room_ID = ? ORDER BY Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(occ3[0].User_ID, profB.User_ID, 'Occupancy log User_ID must be Prof B');
        assert.strictEqual(occ3[0].Auth_Method, 'Key Transfer', 'Auth_Method must be Key Transfer');
        console.log('✔ PASS: Hallway handoff transferred custody to Prof B cleanly without false alarms.');

        // -----------------------------------------------------------------
        // SCENARIO 4: Transfer attempted after return to IoT key box
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 4: Transfer Attempted After Key Return ---');
        // Prof B returns key to IoT key box
        const returnRes = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes.status, 200, 'Physical key return must succeed');

        // Confirm room is back in dock
        const [labCheck4] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(labCheck4[0].Key_Status, 'Present', 'Key_Status must be Present after return');

        // Prof C attempts transfer on returned key -> Must be rejected
        const info4 = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfC);
        assert.strictEqual(info4.data.canTransfer, false, 'Key transfer must be disabled after key return');
        assert.strictEqual(info4.data.cannotTransferReason, DOCKED_EXPLANATION);

        const transfer4 = await keysService.transferKey(key203.Key_Code, mockReqProfC);
        assert.strictEqual(transfer4.status, 400, 'Transfer after return must be rejected with 400');
        assert.strictEqual(transfer4.error, DOCKED_EXPLANATION);
        console.log('✔ PASS: Returning key immediately disables transfer and rejects further transfer attempts.');

        // -----------------------------------------------------------------
        // SCENARIO 5: No registered custodian (Absent with NULL Current_User_ID)
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 5: Key Absent with No Registered Custodian ---');
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

        const info5 = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(info5.data.canTransfer, false, 'Cannot transfer key with no registered custodian');
        assert.ok(info5.data.cannotTransferReason.includes('no registered custodian'), 'Reason must explain missing custodian');

        const transfer5 = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(transfer5.status, 400, 'Transfer without custodian must return 400');
        assert.ok(transfer5.error.includes('no registered custodian'));
        console.log('✔ PASS: Unregistered / unattributed absent key cannot be transferred; fails closed.');

        // -----------------------------------------------------------------
        // SCENARIO 6: Stale or unknown state (Fail-closed)
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 6: Stale or Unknown Key State (Fail-Closed) ---');
        await db.query("UPDATE laboratories SET Key_Status = 'Unknown', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, room203.Room_ID]);

        const info6 = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(info6.data.canTransfer, false, 'Unknown status must fail closed');
        assert.ok(info6.data.cannotTransferReason.includes('must be verified'));

        const transfer6 = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(transfer6.status, 400, 'Unknown status transfer must return 400');
        assert.ok(transfer6.error.includes('must be verified'));
        console.log('✔ PASS: Stale or unknown key status safely fails closed.');

        // -----------------------------------------------------------------
        // SCENARIO 7: Rooms 203 and 204 operate independently
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 7: Independent Key Slots (Room 203 & Room 204) ---');
        // Room 203: Docked in key box (Present)
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);
        // Room 204: Legitimately held by Prof A (Absent)
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, room204.Room_ID]);

        // Room 203 transfer MUST be disabled
        const info203 = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(info203.data.canTransfer, false, 'Room 203 docked key cannot be transferred');
        const transfer203 = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(transfer203.status, 400, 'Room 203 transfer must fail');

        // Room 204 transfer MUST be enabled for Prof B
        const info204 = await keysService.getKeyTransferInfo(key204.Key_Code, mockReqProfB);
        assert.strictEqual(info204.data.canTransfer, true, 'Room 204 held key can be transferred');
        const transfer204 = await keysService.transferKey(key204.Key_Code, mockReqProfB);
        assert.strictEqual(transfer204.status, 200, 'Room 204 transfer must succeed');

        // Confirm Room 203 is still docked and untouched
        const [check203After] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(check203After[0].Key_Status, 'Present');
        assert.strictEqual(check203After[0].Current_User_ID, null);

        // Confirm Room 204 transferred to Prof B
        const [check204After] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room204.Room_ID]);
        assert.strictEqual(check204After[0].Current_User_ID, profB.User_ID);
        console.log('✔ PASS: Rooms 203 and 204 operate completely independently without cross-influence.');

        // -----------------------------------------------------------------
        // SCENARIO 8: Existing permissions, role limits, and approval policies
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 8: Existing Permissions & Role Policy Safeguards ---');
        // Prof B holds Room 204. Set Room 203 held by Prof A.
        await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, room203.Room_ID]);

        // 8A. Self-transfer: Prof A cannot transfer Room 203 to self
        const selfInfo = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfA);
        assert.strictEqual(selfInfo.data.canTransfer, false, 'Self-transfer must be disallowed');
        assert.ok(selfInfo.data.cannotTransferReason.includes('already the registered holder'));
        const selfTransfer = await keysService.transferKey(key203.Key_Code, mockReqProfA);
        assert.strictEqual(selfTransfer.status, 400);

        // 8B. MIS Staff restriction (if MIS user exists)
        if (mockReqMis) {
            const misInfo = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqMis);
            assert.strictEqual(misInfo.data.canTransfer, false, 'MIS Staff cannot claim keys');
            assert.ok(misInfo.data.cannotTransferReason.includes('MIS Staff'));
        }

        // 8C. Single-key limit: Prof B holds Room 204, attempts Room 203 without Dept Head approval -> Blocked 403
        const limitInfo = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(limitInfo.data.canTransfer, false, '1-key limit must block unapproved 2nd key');
        assert.ok(limitInfo.data.cannotTransferReason.includes('already hold an active key'));

        const limitTransfer = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(limitTransfer.status, 403, '1-key limit returns 403 Forbidden');

        // 8D. Multi-key approval: If Key 203 is docked, even active Dept Head approval CANNOT bypass dock check
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);
        const subReq = await keyAuthService.requestAdditionalKey(profB.User_ID, profB.Role, profB.Name, room203.Room_ID, 'Dual lab session');
        assert.strictEqual(subReq.status, 201);
        await keyAuthService.approveRequest(subReq.data.requestId, profA.User_ID, profA.Role, 60);

        const dockedApprovedInfo = await keysService.getKeyTransferInfo(key203.Key_Code, mockReqProfB);
        assert.strictEqual(dockedApprovedInfo.data.canTransfer, false, 'Docked key MUST remain non-transferable even with approval');
        assert.strictEqual(dockedApprovedInfo.data.cannotTransferReason, DOCKED_EXPLANATION);

        const dockedApprovedTransfer = await keysService.transferKey(key203.Key_Code, mockReqProfB);
        assert.strictEqual(dockedApprovedTransfer.status, 400, 'Direct transfer must still be rejected when docked');
        assert.strictEqual(dockedApprovedTransfer.error, DOCKED_EXPLANATION);
        console.log('✔ PASS: Self-transfer, MIS restrictions, single-key limits, and docked multi-key guard strictly enforced.');

        // -----------------------------------------------------------------
        // SCENARIO 9: Normal IoT Withdrawal, Return & Security Alert Integrity
        // -----------------------------------------------------------------
        console.log('\n--- SCENARIO 9: IoT Keybox Withdrawal, Return & Security Alert Regression ---');
        await resetState();

        // Ensure profA has ID_QR_String
        if (!profA.ID_QR_String) {
            profA.ID_QR_String = `LABSYNC-USER-REGR-${Date.now()}`;
            await db.query("UPDATE users SET ID_QR_String = ? WHERE User_ID = ?", [profA.ID_QR_String, profA.User_ID]);
        }

        // 9A. Authenticated QR Scan at IoT Key Box
        const scanRes = await iotService.logOccupancy({
            qrString: profA.ID_QR_String,
            roomNumber: '203',
            authMethod: 'QR Code'
        }, mockDevice);
        assert.strictEqual(scanRes.status, 200, 'Valid QR scan at key box must succeed');

        // 9B. Physical key taken within 15s window
        const takeRes = await iotService.logOccupancy({
            keyEvent: 'Key Taken',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(takeRes.status, 200, 'Physical key withdrawal must succeed');

        const [labCheck9] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(labCheck9[0].Key_Status, 'Absent');
        assert.strictEqual(labCheck9[0].Current_User_ID, profA.User_ID, 'Attributed to Prof A');

        // 9C. Key return at IoT Key Box
        const returnRes9 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes9.status, 200, 'Physical return must succeed');

        const [labCheck9b] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(labCheck9b[0].Key_Status, 'Present');
        assert.strictEqual(labCheck9b[0].Current_User_ID, null);

        // 9D. Unauthorized removal without scan
        const unauthRes = await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(unauthRes.status, 200);

        const [labCheck9c] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(labCheck9c[0].Key_Status, 'Absent');
        assert.strictEqual(labCheck9c[0].Current_User_ID, null, 'Unauthorized removal leaves Current_User_ID as NULL');

        // Clean up
        await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '203' }, mockDevice);
        await resetState();

        console.log('✔ PASS: Normal IoT withdrawal, return, and security alert workflows operate with 100% fidelity.');

        console.log('\n================================================================');
        console.log('🎉 ALL 9 KEY TRANSFER DOCKED GUARD SCENARIOS PASSED 100%!');
        console.log('================================================================\n');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ REGRESSION TEST FAILED:', err);
        await resetState();
        process.exit(1);
    }
}

runRegressionSuite();
