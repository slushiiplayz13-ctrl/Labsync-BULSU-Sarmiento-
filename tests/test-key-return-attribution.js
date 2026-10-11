'use strict';

/**
 * tests/test-key-return-attribution.js
 * Verification of Strict Key-Return Attribution & Elimination of False Faculty Attribution.
 *
 * Verifies:
 * 1. Unauthorized removal followed by return: physical return logged with NULL User_ID,
 *    rendered as "Key Returned by Unidentified Person · Alarm Cleared" (NO false faculty attribution).
 * 2. Authorized faculty withdrawal followed by return: physical return logged with faculty User_ID,
 *    rendered as "Key Returned by Prof. <Name> · Faculty".
 * 3. Unauthorized removal after a previous authorized transaction: no stale historical user leakage.
 * 4. Independent key slot operation (Room 203 & Room 204).
 * 5. Original Unauthorized Access event preserved; no duplicate "Key Borrowed" logged on unauthorized removal.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const iotService = require('../services/iotService');
const claimService = require('../services/iot/claim.service');
const maintenanceRepository = require('../repositories/maintenance.repository');

const mockDevice = {
    id: 'ESP32-KeyBox',
    authorizedRooms: ['203', '204']
};

function loadTimelineRenderer() {
    const timelineJs = fs.readFileSync(path.join(__dirname, '../js/pages/room-status/room-status.timeline.js'), 'utf8');
    const mockWindow = {
        lucide: { createIcons: () => {} },
        escapeHtml: str => String(str || '')
    };
    const fn = new Function('window', 'global', timelineJs);
    fn(mockWindow, mockWindow);
    return mockWindow.roomStatusTimeline;
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('🧪 Testing Key-Return Attribution & Custody Session Validation');
    console.log('================================================================\n');

    const timelineModule = loadTimelineRenderer();

    // Fetch a verified test faculty user (e.g. Prof. Charl Jay Esplana or Rex Andrei James)
    const [facultyUsers] = await db.query(
        "SELECT User_ID, Name, Role, ID_QR_String FROM users WHERE Role IN ('Faculty', 'IT Dept. Head', 'Department Head') AND Status = 'Active' LIMIT 2"
    );
    assert.ok(facultyUsers.length >= 2, 'Need at least 2 active faculty users for testing');
    const facultyA = facultyUsers[0];
    const facultyB = facultyUsers[1];

    if (!facultyA.ID_QR_String) {
        facultyA.ID_QR_String = `LABSYNC-USER-FA-${Date.now()}`;
        await db.query("UPDATE users SET ID_QR_String = ? WHERE User_ID = ?", [facultyA.ID_QR_String, facultyA.User_ID]);
    }
    if (!facultyB.ID_QR_String) {
        facultyB.ID_QR_String = `LABSYNC-USER-FB-${Date.now()}`;
        await db.query("UPDATE users SET ID_QR_String = ? WHERE User_ID = ?", [facultyB.ID_QR_String, facultyB.User_ID]);
    }

    const [rooms203] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = '203' LIMIT 1");
    const [rooms204] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = '204' LIMIT 1");
    assert.ok(rooms203.length > 0 && rooms204.length > 0, 'Rooms 203 and 204 must exist');
    const room203 = rooms203[0];
    const room204 = rooms204[0];

    // Ensure initial clean state: both keys Present, holders null
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [room203.Room_ID, room204.Room_ID]);
    claimService.clearClaim('203');
    claimService.clearClaim('204');

    try {
        // =====================================================================
        // SCENARIO 1: Unauthorized removal followed by return -> NO false faculty attribution
        // =====================================================================
        console.log('--- SCENARIO 1: Unauthorized removal followed by key return ---');

        // 1a. Key physically removed without scanning QR code
        const unauthTakeRes = await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(unauthTakeRes.status, 200);

        // Simulate companion hardware packet if dispatched by firmware
        const companionTakenRes = await iotService.logOccupancy({
            keyEvent: 'Key Taken',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(companionTakenRes.status, 200);

        // Verify Key_Status is Absent and Current_User_ID is NULL
        const [room203State] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(room203State[0].Key_Status, 'Absent');
        assert.strictEqual(room203State[0].Current_User_ID, null);

        // Verify NO duplicate "Key Taken" log was inserted
        const [recentTaken] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Taken' ORDER BY Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        const [unauthLog] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'UNAUTHORIZED' ORDER BY Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.ok(unauthLog.length > 0, 'UNAUTHORIZED log must exist');
        if (recentTaken.length > 0) {
            assert.ok(recentTaken[0].Log_ID < unauthLog[0].Log_ID, 'Must NOT insert a Key Taken log after UNAUTHORIZED');
        }
        console.log('  ✔ Verified: Unauthorized removal recorded; companion Key Taken safely suppressed (no bogus "Key Borrowed").');

        // 1b. Physically return the key to the keybox
        const returnRes1 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes1.status, 200);

        // Verify occupancy_log for Key Returned has NULL User_ID
        const [returnLogs1] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.ok(returnLogs1.length > 0, 'Key Returned entry must exist');
        assert.strictEqual(returnLogs1[0].User_ID, null, 'Key returned after unauthorized removal MUST have NULL User_ID');

        // Verify timeline notification presentation
        const [notifs1] = await maintenanceRepository.findAllNotifications();
        const unauthNotif1 = notifs1.find(n => n.id === unauthLog[0].Log_ID);
        const returnNotif1 = notifs1.find(n => n.id === returnLogs1[0].Log_ID);
        assert.ok(unauthNotif1, 'Notification item for unauthorized access must exist');
        assert.strictEqual(unauthNotif1.description, 'Unidentified Person', 'Must be Unidentified Person');
        assert.strictEqual(unauthNotif1.detail, 'Security Alert', 'Must be Security Alert');
        assert.ok(returnNotif1, 'Notification item for return must exist');
        assert.strictEqual(returnNotif1.description, 'Unidentified Person', 'Must be Unidentified Person');
        assert.strictEqual(returnNotif1.detail, 'Alarm Cleared', 'Must be Alarm Cleared');

        // Test timeline rendering (simulating the Activity Log UI)
        const mockTimelineContainer = { innerHTML: '', _lastActivitySignature: '' };
        timelineModule.renderTimelineItems([unauthNotif1, returnNotif1], mockTimelineContainer);
        const renderedHtml1 = mockTimelineContainer.innerHTML;

        assert.ok(renderedHtml1.includes('Unauthorized Key Access'), 'Must preserve Unauthorized Key Access event');
        assert.ok(renderedHtml1.includes('Key Returned'), 'Must display Key Returned event');
        assert.ok(renderedHtml1.includes('Unidentified Person'), 'Must attribute return to Unidentified Person');
        assert.ok(renderedHtml1.includes('Alarm Cleared'), 'Must show Alarm Cleared detail');
        assert.ok(!renderedHtml1.includes(facultyA.Name), 'MUST NOT display faculty name for unauthorized return');
        assert.ok(!renderedHtml1.includes(facultyB.Name), 'MUST NOT display faculty name for unauthorized return');
        console.log('  ✔ SCENARIO 1 PASSED: Unauthenticated removal + return -> Zero false faculty attribution, Alarm Cleared by Unidentified Person.\n');

        // =====================================================================
        // SCENARIO 2: Authorized faculty withdrawal followed by return -> CORRECT faculty attribution
        // =====================================================================
        console.log('--- SCENARIO 2: Authorized faculty withdrawal followed by return ---');

        // 2a. Faculty A scans QR code
        const scanRes2 = await iotService.logOccupancy({
            qrString: facultyA.ID_QR_String,
            roomNumber: '203',
            authMethod: 'QR Code'
        }, mockDevice);
        assert.strictEqual(scanRes2.status, 200);

        // 2b. Faculty A removes key
        const takeRes2 = await iotService.logOccupancy({
            keyEvent: 'Key Taken',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(takeRes2.status, 200);

        // Verify active custody in DB
        const [room203State2] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(room203State2[0].Key_Status, 'Absent');
        assert.strictEqual(Number(room203State2[0].Current_User_ID), Number(facultyA.User_ID));

        // 2c. Faculty A returns key
        const returnRes2 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes2.status, 200);

        // Verify occupancy_log for Key Returned has Faculty A User_ID
        const [returnLogs2] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.ok(returnLogs2.length > 0);
        assert.strictEqual(Number(returnLogs2[0].User_ID), Number(facultyA.User_ID), 'Authorized return must record faculty User_ID');

        // Verify timeline notification presentation
        const [notifs2] = await maintenanceRepository.findAllNotifications();
        const returnNotif2 = notifs2.find(n => n.id === returnLogs2[0].Log_ID);
        assert.ok(returnNotif2);
        assert.strictEqual(returnNotif2.description, facultyA.Name, 'Notification description must be faculty name');

        // Render timeline
        const mockTimelineContainer2 = { innerHTML: '', _lastActivitySignature: '' };
        timelineModule.renderTimelineItems([returnNotif2], mockTimelineContainer2);
        const renderedHtml2 = mockTimelineContainer2.innerHTML;
        assert.ok(renderedHtml2.includes('Key Returned'), 'Must display Key Returned event');
        assert.ok(renderedHtml2.includes(facultyA.Name), 'Must display Faculty A name for legitimate return');
        console.log(`  ✔ SCENARIO 2 PASSED: Authorized transaction correctly attributed to Prof. ${facultyA.Name}.\n`);

        // =====================================================================
        // SCENARIO 3: Unauthorized removal after a previous authorized transaction
        //             -> Strict elimination of stale historical user leakage
        // =====================================================================
        console.log('--- SCENARIO 3: Unauthorized removal after a previous authorized transaction ---');

        // Key is now Present. Faculty A's previous transaction is in history.
        // An intruder pulls Key 203 without scanning any QR code:
        await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);

        // Intruder returns Key 203:
        const returnRes3 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes3.status, 200);

        // Verify that Faculty A from the earlier transaction was NOT leaked!
        const [returnLogs3] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(returnLogs3[0].User_ID, null, 'Must NOT leak Faculty A from previous historical transaction');

        const [notifs3] = await maintenanceRepository.findAllNotifications();
        const returnNotif3 = notifs3.find(n => n.id === returnLogs3[0].Log_ID);
        assert.strictEqual(returnNotif3.description, 'Unidentified Person', 'Must be Unidentified Person');
        assert.strictEqual(returnNotif3.detail, 'Alarm Cleared', 'Must be Alarm Cleared');
        console.log('  ✔ SCENARIO 3 PASSED: Zero stale identity leakage from earlier historical transactions.\n');

        // =====================================================================
        // SCENARIO 4: Independent Key Slots (Room 203 and Room 204)
        // =====================================================================
        console.log('--- SCENARIO 4: Independent key slots (Room 203 & Room 204) ---');

        // Faculty B legitimately takes Key 203
        await iotService.logOccupancy({ qrString: facultyB.ID_QR_String, roomNumber: '203', authMethod: 'QR Code' }, mockDevice);
        await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '203' }, mockDevice);

        // An unauthorized removal occurs on Room 204
        await iotService.logOccupancy({ keyEvent: 'Unauthorized Removal', roomNumber: '204' }, mockDevice);

        // Room 204 key is returned (unauthorized return)
        await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);

        // Verify Room 204 return has NULL User_ID
        const [returnLogs204] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room204.Room_ID]
        );
        assert.strictEqual(returnLogs204[0].User_ID, null, 'Room 204 return must have NULL User_ID');

        // Verify Room 203 remains actively held by Faculty B!
        const [room203State4] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(room203State4[0].Key_Status, 'Absent');
        assert.strictEqual(Number(room203State4[0].Current_User_ID), Number(facultyB.User_ID));

        // Faculty B returns Room 203
        await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '203' }, mockDevice);

        // Verify Room 203 return has Faculty B User_ID
        const [returnLogs203_4] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(Number(returnLogs203_4[0].User_ID), Number(facultyB.User_ID), 'Room 203 return must be attributed to Faculty B');
        console.log('  ✔ SCENARIO 4 PASSED: Room 203 and Room 204 slots operate independently without cross-contamination.\n');

        // =====================================================================
        // SCENARIO 5: Activity Log presentation verification
        // =====================================================================
        console.log('--- SCENARIO 5: Activity Log presentation invariant check ---');
        const [allRecentNotifs] = await maintenanceRepository.findAllNotifications();
        const unauthItems = allRecentNotifs.filter(n => n.status === 'UNAUTHORIZED');
        assert.ok(unauthItems.length > 0, 'Unauthorized events must be present in history');
        unauthItems.forEach(item => {
            assert.strictEqual(item.description, 'Unidentified Person');
            assert.strictEqual(item.detail, 'Security Alert');
        });
        console.log('  ✔ SCENARIO 5 PASSED: Activity Log presentation invariants strictly verified.\n');

        // =====================================================================
        // SCENARIO 6: Offline unauthorized removal -> Reconnection Heartbeat Sync -> Return
        // =====================================================================
        console.log('--- SCENARIO 6: Offline unauthorized removal & Reconnection Heartbeat Synchronization ---');

        // 6a. Reset Room 203 to Present with clean state
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

        // Count occupancy_log records before offline event
        const [[{ count: logCountBefore6 }]] = await db.query(
            "SELECT COUNT(*) as count FROM occupancy_log WHERE Room_ID = ?", [room203.Room_ID]
        );

        // 6b. Wi-Fi is offline during removal: No HTTP request is sent to /api/occupancy/log.
        // Physical state in hardware changes: slotTargetState203 = false.

        // 6c. Wi-Fi reconnects: Firmware sends immediate presence heartbeat with slots: { '203': false, '204': true }
        const hbRes6 = await iotService.recordHeartbeat({
            deviceId: 'ESP32-KeyBox',
            rooms: ['203', '204'],
            slots: {
                '203': false,
                '204': true
            }
        }, mockDevice);
        assert.strictEqual(hbRes6.status, 200);

        // Verify database: Room 203 Key_Status transitioned to Absent, Current_User_ID is NULL
        const [room203State6] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(room203State6[0].Key_Status, 'Absent', 'Heartbeat must synchronize key status to Absent');
        assert.strictEqual(room203State6[0].Current_User_ID, null, 'Current_User_ID must remain NULL');

        // Verify zero duplicate occupancy logs were inserted by the heartbeat
        const [[{ count: logCountAfterHb6 }]] = await db.query(
            "SELECT COUNT(*) as count FROM occupancy_log WHERE Room_ID = ?", [room203.Room_ID]
        );
        assert.strictEqual(logCountAfterHb6, logCountBefore6, 'Heartbeat must not insert bogus activity logs');
        console.log('  ✔ Verified: Reconnection heartbeat successfully synchronized Key_Status to Absent without creating duplicate activity logs.');

        // 6d. If an unauthenticated Key Taken status sync arrives later (e.g. from queue), verify it is treated as duplicate
        const takenSyncRes6 = await iotService.logOccupancy({
            keyEvent: 'Key Taken',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(takenSyncRes6.status, 200);

        const [[{ count: logCountAfterTaken6 }]] = await db.query(
            "SELECT COUNT(*) as count FROM occupancy_log WHERE Room_ID = ?", [room203.Room_ID]
        );
        assert.strictEqual(logCountAfterTaken6, logCountBefore6, 'Duplicate Key Taken must not insert bogus occupancy log');
        console.log('  ✔ Verified: Redundant Key Taken suppressed when key is already Absent.');

        // 6e. Physical key is returned to slot
        const returnRes6 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes6.status, 200);

        // Verify return log recorded with NULL User_ID and accurate timeline attribution
        const [returnLogs6] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(returnLogs6[0].User_ID, null, 'Return after offline removal must have NULL User_ID');

        const [notifs6] = await maintenanceRepository.findAllNotifications();
        const returnNotif6 = notifs6.find(n => n.id === returnLogs6[0].Log_ID);
        assert.ok(returnNotif6);
        assert.strictEqual(returnNotif6.description, 'Unidentified Person');
        assert.strictEqual(returnNotif6.detail, 'Alarm Cleared');
        console.log('  ✔ SCENARIO 6 PASSED: Offline removal synchronizes via heartbeat, prevents duplicate logs, and key return is accurately attributed to Unidentified Person.\n');

        // =====================================================================
        // SCENARIO 7: Non-null initial Current_User_ID -> Offline removal ->
        //             Reconnection Sync (Heartbeat + Queued Alert) -> Return ->
        //             Subsequent authorized borrow & return preservation
        // =====================================================================
        console.log('--- SCENARIO 7: Non-null Current_User_ID + Offline Removal + Reconnection Sync ---');

        // 7a. Seed Room 203 with a non-null Current_User_ID while docked (Key_Status = 'Present')
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = ? WHERE Room_ID = ?", [facultyA.User_ID, room203.Room_ID]);

        // Verify pre-condition: Current_User_ID is non-null
        const [preSeed] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(preSeed[0].Key_Status, 'Present');
        assert.strictEqual(Number(preSeed[0].Current_User_ID), Number(facultyA.User_ID));

        // 7b. Offline removal occurs: Wi-Fi down, intruder pulls key without QR scan.
        // Physical key becomes absent; ESP32 queues security alert and marks slotTargetState203 = false.

        // 7c. Wi-Fi restored: Reconnection heartbeat arrives first
        const hbRes7 = await iotService.recordHeartbeat({
            deviceId: 'ESP32-KeyBox',
            rooms: ['203', '204'],
            slots: { '203': false, '204': true }
        }, mockDevice);
        assert.strictEqual(hbRes7.status, 200);

        // 7d. Queued security alert delivered to backend immediately upon network reconnection
        const alertRes7 = await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(alertRes7.status, 200);

        // Verify backend state after queued alert delivery:
        // Key_Status must be Absent, and Current_User_ID MUST BE CLEARED to NULL
        const [postAlertRoom7] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(postAlertRoom7[0].Key_Status, 'Absent');
        assert.strictEqual(postAlertRoom7[0].Current_User_ID, null, 'Queued security alert must clear Current_User_ID to NULL');

        const [unauthLogs7] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'UNAUTHORIZED' ORDER BY Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.ok(unauthLogs7.length > 0);
        assert.strictEqual(unauthLogs7[0].User_ID, null);

        // 7e. Intruder returns key to dock
        const returnRes7 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes7.status, 200);

        // Verify return entry has NULL User_ID and zero false attribution to facultyA
        const [returnLogs7] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(returnLogs7[0].User_ID, null, 'Unauthorized return must have NULL User_ID');

        const [notifs7] = await maintenanceRepository.findAllNotifications();
        const returnNotif7 = notifs7.find(n => n.id === returnLogs7[0].Log_ID);
        assert.ok(returnNotif7);
        assert.strictEqual(returnNotif7.description, 'Unidentified Person');
        assert.strictEqual(returnNotif7.detail, 'Alarm Cleared');

        const mockTimelineContainer7 = { innerHTML: '', _lastActivitySignature: '' };
        timelineModule.renderTimelineItems([returnNotif7], mockTimelineContainer7);
        assert.ok(!mockTimelineContainer7.innerHTML.includes(facultyA.Name), 'MUST NOT falsely attribute return to Faculty A');
        console.log('  ✔ Verified: Non-null Current_User_ID cleared by queued security alert, zero false faculty attribution on return.');

        // 7f. Subsequent Legitimate Authorized Borrowing & Returning Verification
        console.log('  --- Sub-test: Legitimate authorized borrowing and returning ---');
        // Faculty A scans QR
        await iotService.logOccupancy({ qrString: facultyA.ID_QR_String, roomNumber: '203', authMethod: 'QR Code' }, mockDevice);
        // Faculty A takes key
        await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '203' }, mockDevice);

        // Verify active custody in DB
        const [roomAuth7] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(roomAuth7[0].Key_Status, 'Absent');
        assert.strictEqual(Number(roomAuth7[0].Current_User_ID), Number(facultyA.User_ID));

        // Periodic telemetry heartbeat arrives during class:
        // Must preserve Faculty A's active custody (MUST NOT clear Current_User_ID)
        await iotService.recordHeartbeat({
            deviceId: 'ESP32-KeyBox',
            rooms: ['203', '204'],
            slots: { '203': false, '204': true }
        }, mockDevice);

        const [roomAfterClassHb7] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(roomAfterClassHb7[0].Key_Status, 'Absent');
        assert.strictEqual(Number(roomAfterClassHb7[0].Current_User_ID), Number(facultyA.User_ID), 'Heartbeat must preserve active faculty custody during class');

        // Faculty A returns key legitimately
        await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '203' }, mockDevice);

        const [returnAuthLogs7] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(Number(returnAuthLogs7[0].User_ID), Number(facultyA.User_ID), 'Authorized return must record Faculty A User_ID');

        const [notifsAuth7] = await maintenanceRepository.findAllNotifications();
        const returnAuthNotif7 = notifsAuth7.find(n => n.id === returnAuthLogs7[0].Log_ID);
        assert.ok(returnAuthNotif7);
        assert.strictEqual(returnAuthNotif7.description, facultyA.Name, 'Notification description must be Faculty A name');
        console.log(`  ✔ SCENARIO 7 PASSED: Non-null initial ID handled securely; legitimate borrow/return perfectly preserves Prof. ${facultyA.Name}.\n`);

        // =====================================================================
        // SCENARIO 8: Critical Edge-Case Audit (Scenario A)
        //             Key returned BEFORE connectivity is restored (Room 203 & Room 204)
        // =====================================================================
        console.log('--- SCENARIO 8: Offline Removal followed by Return BEFORE Reconnection ---');

        // 8a. Reset Room 203 & Room 204 to clean docked state
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [room203.Room_ID, room204.Room_ID]);

        // Step 1 & 2: Disconnect Wi-Fi & Remove Key 203 without QR scan
        // Physical key removed while offline.
        // ESP32 sets slotTargetState203 = false, alertNeedsSync203 = true.

        // Step 3 & 4: While Wi-Fi remains disconnected, intruder returns Key 203 to its slot!
        // ESP32 sets slotTargetState203 = true, slotNeedsSync203 = true.
        // Crucially: alertNeedsSync203 is NOT discarded! It remains pending!

        // Step 5: Wi-Fi is restored! Reconnection delivery sequence:
        // 1. Pending security alert is dispatched first:
        const alertRes8 = await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(alertRes8.status, 200);

        // 2. Pending key return is dispatched second:
        const returnRes8 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes8.status, 200);

        // 3. Presence heartbeat sent third:
        const hbRes8 = await iotService.recordHeartbeat({
            deviceId: 'ESP32-KeyBox',
            rooms: ['203', '204'],
            slots: { '203': true, '204': true }
        }, mockDevice);
        assert.strictEqual(hbRes8.status, 200);

        // Verify database records:
        // A. Final key status MUST be 'Present'
        const [room203State8] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(room203State8[0].Key_Status, 'Present', 'Final Key_Status must be Present after return');
        assert.strictEqual(room203State8[0].Current_User_ID, null, 'Current_User_ID must be NULL (no false faculty attribution)');

        // B. Both events must exist in occupancy_log in correct logical order
        const [logs203_8] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method IN ('UNAUTHORIZED', 'Key Returned') ORDER BY Log_ID DESC LIMIT 2",
            [room203.Room_ID]
        );
        assert.strictEqual(logs203_8.length, 2, 'Must record BOTH Unauthorized Removal and Key Returned');
        const returnLog8 = logs203_8.find(l => l.Auth_Method === 'Key Returned');
        const unauthLog8 = logs203_8.find(l => l.Auth_Method === 'UNAUTHORIZED');
        assert.ok(returnLog8 && unauthLog8);
        assert.ok(unauthLog8.Log_ID < returnLog8.Log_ID, 'Unauthorized event must precede Key Returned event');
        assert.strictEqual(unauthLog8.User_ID, null);
        assert.strictEqual(returnLog8.User_ID, null);

        // C. Verify Activity Log presentation
        const [notifs8] = await maintenanceRepository.findAllNotifications();
        const unauthNotif8 = notifs8.find(n => n.id === unauthLog8.Log_ID);
        const returnNotif8 = notifs8.find(n => n.id === returnLog8.Log_ID);
        assert.ok(unauthNotif8);
        assert.ok(returnNotif8);
        assert.strictEqual(unauthNotif8.description, 'Unidentified Person');
        assert.strictEqual(unauthNotif8.detail, 'Security Alert');
        assert.strictEqual(returnNotif8.description, 'Unidentified Person');
        assert.strictEqual(returnNotif8.detail, 'Alarm Cleared');

        const mockTimelineContainer8 = { innerHTML: '', _lastActivitySignature: '' };
        timelineModule.renderTimelineItems([unauthNotif8, returnNotif8], mockTimelineContainer8);
        const html8 = mockTimelineContainer8.innerHTML;
        assert.ok(html8.includes('Unauthorized Key Access'));
        assert.ok(html8.includes('Key Returned'));
        assert.ok(!html8.includes(facultyA.Name));
        assert.ok(!html8.includes(facultyB.Name));
        console.log('  ✔ Room 203: Offline removal + return before reconnect correctly records both events in order, final status Present, zero false attribution.');

        // 8b. Verify identical resilience on Room 204
        await iotService.logOccupancy({ keyEvent: 'Unauthorized Removal', roomNumber: '204' }, mockDevice);
        await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);
        await iotService.recordHeartbeat({ deviceId: 'ESP32-KeyBox', rooms: ['203', '204'], slots: { '203': true, '204': true } }, mockDevice);

        const [room204State8] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room204.Room_ID]);
        assert.strictEqual(room204State8[0].Key_Status, 'Present');
        assert.strictEqual(room204State8[0].Current_User_ID, null);

        const [logs204_8] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method IN ('UNAUTHORIZED', 'Key Returned') ORDER BY Log_ID DESC LIMIT 2",
            [room204.Room_ID]
        );
        assert.strictEqual(logs204_8.length, 2);
        assert.strictEqual(logs204_8[0].User_ID, null);
        assert.strictEqual(logs204_8[1].User_ID, null);
        console.log('  ✔ Room 204: Independent slot operations confirmed for Scenario A.\n');
        console.log('  ✔ SCENARIO 8 PASSED: Critical offline edge-case fully validated on both key slots.\n');

        // =====================================================================
        // SCENARIO 9: Duplicate Security-Alert Delivery & HTTP Retry Idempotency
        // =====================================================================
        console.log('--- SCENARIO 9: Duplicate Security-Alert Delivery & HTTP Retry Idempotency ---');

        // 9a. Reset Room 203 to clean state
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

        const [[{ count: countBefore9 }]] = await db.query(
            "SELECT COUNT(*) as count FROM occupancy_log WHERE Room_ID = ?", [room203.Room_ID]
        );

        // 9b. First Unauthorized Removal request
        const alertRes9a = await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(alertRes9a.status, 200);

        // 9c. Duplicate Unauthorized Removal request (e.g. HTTP timeout retry or dual dispatch from queue + pending buffer)
        const alertRes9b = await iotService.logOccupancy({
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(alertRes9b.status, 200, 'Duplicate request must succeed with 200 OK');

        // 9d. Verify database has EXACTLY ONE new occupancy_log record (no duplicates)
        const [[{ count: countAfterAlerts9 }]] = await db.query(
            "SELECT COUNT(*) as count FROM occupancy_log WHERE Room_ID = ?", [room203.Room_ID]
        );
        assert.strictEqual(countAfterAlerts9, countBefore9 + 1, 'Duplicate Unauthorized Removal must NOT create duplicate occupancy_log rows');

        // 9e. Key is returned
        const returnRes9 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes9.status, 200);

        // 9f. Verify final database state: Key_Status = 'Present', Current_User_ID = NULL
        const [room203State9] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(room203State9[0].Key_Status, 'Present');
        assert.strictEqual(room203State9[0].Current_User_ID, null);

        // 9g. Verify return log attribution and presentation
        const [returnLog9] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(returnLog9[0].User_ID, null);

        const [notifs9] = await maintenanceRepository.findAllNotifications();
        const returnNotif9 = notifs9.find(n => n.id === returnLog9[0].Log_ID);
        assert.ok(returnNotif9);
        assert.strictEqual(returnNotif9.description, 'Unidentified Person');
        assert.strictEqual(returnNotif9.detail, 'Alarm Cleared');

        console.log('  ✔ Verified: Duplicate Unauthorized Removal safely deduplicated; returns 200 OK without creating duplicate DB rows.');
        console.log('  ✔ SCENARIO 9 PASSED: Duplicate security-alert delivery & HTTP retry idempotency fully verified.\n');

        // =====================================================================
        // SCENARIO 10: Unauthorized-Alert Retry AFTER Key Return
        // =====================================================================
        console.log('--- SCENARIO 10: Unauthorized-Alert Retry AFTER Key Return ---');

        // 10a. Reset Room 203 to clean state
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

        const originalAlertPayload10 = {
            keyEvent: 'Unauthorized Removal',
            roomNumber: '203',
            eventId: 'alert-203-sc10-' + Date.now()
        };

        // 10b. Step 1: Submit unauthorized removal (server stores it, client response drops)
        const unauthRes10 = await iotService.logOccupancy(originalAlertPayload10, mockDevice);
        assert.strictEqual(unauthRes10.status, 200);

        const [roomAfterUnauth10] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(roomAfterUnauth10[0].Key_Status, 'Absent');
        assert.strictEqual(roomAfterUnauth10[0].Current_User_ID, null);

        // 10c. Step 2: Record subsequent key return
        const returnRes10 = await iotService.logOccupancy({
            keyEvent: 'Key Returned',
            roomNumber: '203'
        }, mockDevice);
        assert.strictEqual(returnRes10.status, 200);

        const [roomAfterReturn10] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(roomAfterReturn10[0].Key_Status, 'Present');
        assert.strictEqual(roomAfterReturn10[0].Current_User_ID, null);

        // 10d. Step 3: Retry original unauthorized-removal request within 60-second window
        const retryRes10 = await iotService.logOccupancy(originalAlertPayload10, mockDevice);
        assert.strictEqual(retryRes10.status, 200, 'Delayed retry must succeed with 200 OK');

        // 10e. Step 4: Verify final database state and activity log
        // Final Key_Status MUST remain 'Present' (old alert retry must NOT overwrite newer physical return)
        const [roomFinal10] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(roomFinal10[0].Key_Status, 'Present', 'Final Key_Status must remain Present');
        assert.strictEqual(roomFinal10[0].Current_User_ID, null, 'Current_User_ID must be NULL');

        // Must have EXACTLY 1 UNAUTHORIZED entry and EXACTLY 1 Key Returned entry from this session
        const [recentLogs10] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method IN ('UNAUTHORIZED', 'Key Returned') ORDER BY Log_ID DESC LIMIT 2",
            [room203.Room_ID]
        );
        const unauthLogs10 = recentLogs10.filter(l => l.Auth_Method === 'UNAUTHORIZED');
        const returnLogs10 = recentLogs10.filter(l => l.Auth_Method === 'Key Returned');
        assert.strictEqual(unauthLogs10.length, 1, 'Must have exactly one unauthorized-removal entry');
        assert.strictEqual(returnLogs10.length, 1, 'Must have exactly one return entry');
        assert.ok(unauthLogs10[0].Log_ID < returnLogs10[0].Log_ID, 'Unauthorized must precede return');
        assert.strictEqual(unauthLogs10[0].User_ID, null);
        assert.strictEqual(returnLogs10[0].User_ID, null);

        const [notifs10] = await db.query(`
            SELECT 'occupancy' AS type, o.Log_ID AS id, o.Access_Time AS time, o.Auth_Method AS status,
                   NULL AS pc_number, r.Room_Number AS room_number,
                   (CASE 
                       WHEN o.Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT') THEN 'Unidentified Person'
                       WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Unidentified Person'
                       WHEN o.User_ID IS NULL THEN NULL
                       ELSE COALESCE(u.Name, 'Room Key')
                   END) AS description,
                   (CASE 
                       WHEN o.Auth_Method = 'UNAUTHORIZED' THEN 'Security Alert'
                       WHEN o.Auth_Method = 'WRONG_SLOT' THEN 'Hardware Warning'
                       WHEN (o.Auth_Method = 'Key Returned' OR o.Auth_Method = 'KEY_RETURN') AND o.User_ID IS NULL THEN 'Alarm Cleared'
                       WHEN o.User_ID IS NULL THEN NULL
                       ELSE COALESCE(u.Role, 'Faculty')
                   END) AS detail
            FROM occupancy_log o
            LEFT JOIN users u ON o.User_ID = u.User_ID
            JOIN laboratories r ON o.Room_ID = r.Room_ID
            WHERE o.Log_ID IN (?, ?)
        `, [unauthLogs10[0].Log_ID, returnLogs10[0].Log_ID]);
        const unauthNotif10 = notifs10.find(n => n.id === unauthLogs10[0].Log_ID);
        const returnNotif10 = notifs10.find(n => n.id === returnLogs10[0].Log_ID);
        assert.ok(unauthNotif10);
        assert.ok(returnNotif10);
        assert.strictEqual(unauthNotif10.description, 'Unidentified Person');
        assert.strictEqual(unauthNotif10.detail, 'Security Alert');
        assert.strictEqual(returnNotif10.description, 'Unidentified Person');
        assert.strictEqual(returnNotif10.detail, 'Alarm Cleared');

        const mockTimelineContainer10 = { innerHTML: '', _lastActivitySignature: '' };
        timelineModule.renderTimelineItems([unauthNotif10, returnNotif10], mockTimelineContainer10);
        const html10 = mockTimelineContainer10.innerHTML;
        assert.ok(html10.includes('Unauthorized Key Access'));
        assert.ok(html10.includes('Key Returned'));
        assert.ok(!html10.includes(facultyA.Name), 'MUST NOT falsely attribute to Faculty A');

        console.log('  ✔ Verified: Delayed unauthorized alert retry safely caught by deduplication; does NOT overwrite newer Present state.');
        console.log('  ✔ SCENARIO 10 PASSED: Alert retry after key return fully validated.\n');

        // =====================================================================
        // SCENARIO 11: Queued Key-Return Event Plus Pending-State Reconciliation
        // =====================================================================
        console.log('--- SCENARIO 11: Queued Key-Return Event Plus Pending-State Reconciliation ---');

        // Test independently on both Room 203 and Room 204
        for (const testRoom of [room203, room204]) {
            const roomNum = testRoom.Room_Number;
            await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [testRoom.Room_ID]);

            const [[{ maxId: baselineLogId }]] = await db.query(
                "SELECT COALESCE(MAX(Log_ID), 0) AS maxId FROM occupancy_log WHERE Room_ID = ?",
                [testRoom.Room_ID]
            );

            // 11a. Offline unauthorized removal
            await iotService.logOccupancy({ keyEvent: 'Unauthorized Removal', roomNumber: roomNum }, mockDevice);

            // 11b. Offline return queued (dispatches first Key Returned via netQueue)
            const firstReturnRes11 = await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: roomNum }, mockDevice);
            assert.strictEqual(firstReturnRes11.status, 200);

            // 11c. Pending slotNeedsSync reconciliation or network duplicate also delivers Key Returned
            const secondReturnRes11 = await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: roomNum }, mockDevice);
            assert.strictEqual(secondReturnRes11.status, 200, 'Duplicate Key Returned must succeed with 200 OK');

            // 11d. Reconnection heartbeat confirms slot presence
            const hbSlots = (roomNum === '203') ? { '203': true, '204': true } : { '203': true, '204': true };
            const hbRes11 = await iotService.recordHeartbeat({ deviceId: 'ESP32-KeyBox', rooms: ['203', '204'], slots: hbSlots }, mockDevice);
            assert.strictEqual(hbRes11.status, 200);

            // 11e. Verify database: Exactly 1 UNAUTHORIZED and exactly 1 Key Returned
            const [recentLogs11] = await db.query(
                "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Log_ID > ? AND Auth_Method IN ('UNAUTHORIZED', 'Key Returned') ORDER BY Log_ID ASC",
                [testRoom.Room_ID, baselineLogId]
            );
            const unauthLogs11 = recentLogs11.filter(l => l.Auth_Method === 'UNAUTHORIZED');
            const returnLogs11 = recentLogs11.filter(l => l.Auth_Method === 'Key Returned');
            assert.strictEqual(unauthLogs11.length, 1, `Room ${roomNum}: Exactly 1 unauthorized log`);
            assert.strictEqual(returnLogs11.length, 1, `Room ${roomNum}: Exactly 1 return log (no duplicate Key Returned)`);
            assert.strictEqual(unauthLogs11[0].User_ID, null);
            assert.strictEqual(returnLogs11[0].User_ID, null);
            assert.ok(unauthLogs11[0].Log_ID < returnLogs11[0].Log_ID, 'Unauthorized must precede return');

            // Final state: Key_Status = 'Present', Current_User_ID = NULL
            const [finalRoom11] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [testRoom.Room_ID]);
            assert.strictEqual(finalRoom11[0].Key_Status, 'Present');
            assert.strictEqual(finalRoom11[0].Current_User_ID, null);
            console.log(`  ✔ Room ${roomNum}: Queued return + pending-state duplicate cleanly deduplicated to exactly 1 return event.`);
        }

        // 11f. Preserve legitimate authorized borrow/return attribution
        console.log('  --- Sub-test: Preserving legitimate authorized borrow/return attribution ---');
        await iotService.logOccupancy({ qrString: facultyA.ID_QR_String, roomNumber: '203', authMethod: 'QR Code' }, mockDevice);
        await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '203' }, mockDevice);

        const [roomAuth11] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203.Room_ID]);
        assert.strictEqual(roomAuth11[0].Key_Status, 'Absent');
        assert.strictEqual(Number(roomAuth11[0].Current_User_ID), Number(facultyA.User_ID));

        await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '203' }, mockDevice);

        const [returnAuthLogs11] = await db.query(
            "SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1",
            [room203.Room_ID]
        );
        assert.strictEqual(Number(returnAuthLogs11[0].User_ID), Number(facultyA.User_ID), 'Authorized return must record Faculty A User_ID');
        console.log(`  ✔ Legitimate borrow/return perfectly preserves attribution for Prof. ${facultyA.Name}.`);
        console.log('  ✔ SCENARIO 11 PASSED: Queued key-return + pending-state duplicate reconciliation fully verified.\n');

        console.log('================================================================');
        console.log('🎉 ALL 11 KEY-RETURN ATTRIBUTION REGRESSION SCENARIOS PASSED 100%!');
        console.log('================================================================\n');

    } finally {
        // Teardown: Restore rooms to clean Present state
        await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [room203.Room_ID, room204.Room_ID]);
        claimService.clearClaim('203');
        claimService.clearClaim('204');
    }
}

runTestSuite().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
});
