'use strict';

/**
 * tests/test-mis-key-box-access.js
 * Comprehensive Verification Suite: MIS Staff QR Access to IoT Key Box for IT Maintenance.
 *
 * Verifies:
 * 1. Role Authorization:
 *    - Active MIS Staff + valid QR -> allowed (200 OK)
 *    - Deactivated / Inactive MIS Staff -> denied (403 Forbidden)
 *    - OJT -> denied for physical key-box access (403 Forbidden)
 *    - Student / Unauthorized role -> denied (403 Forbidden)
 *    - Invalid QR string -> denied (404 Not Found)
 * 2. Dynamic Physical Slot Binding:
 *    - Personal QR scan is NOT hardcoded to room 203; physical withdrawal of 203 binds 203.
 *    - Personal QR scan + physical withdrawal of 204 binds 204.
 * 3. Strict Accountability & Single-Use Consumption:
 *    - 1 scan = exactly 1 physical withdrawal.
 *    - Attempting a 2nd withdrawal immediately after inherits NO authorization (Current_User_ID = NULL).
 * 4. Custody Lifecycle & Maintenance Audit Trail:
 *    - Key withdrawal logs IOT_KEY_WITHDRAWAL with purpose: 'IT Maintenance' and actor role 'MIS Staff'.
 *    - Key return properly attributes previous holder before clearing Current_User_ID to NULL.
 *    - Key return logs IOT_KEY_RETURN with purpose: 'IT Maintenance'.
 * 5. Laboratory Service Status Reflection:
 *    - Reflects Borrowed state with MIS Staff holder name without 'Prof.' prefix.
 * 6. Frontend Profile QR Policy:
 *    - MIS Staff permitted personal QR code; OJT strictly excluded.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const iotService = require('../services/iotService');
const claimService = require('../services/iot/claim.service');
const laboratoryService = require('../services/laboratoryService');

const mockDevice = {
  id: 'ESP32-KeyBox',
  authorizedRooms: ['203', '204']
};

async function runMisKeyBoxAccessTests() {
  console.log('================================================================');
  console.log('🧪 MIS STAFF QR ACCESS TO IOT KEY BOX TEST SUITE');
  console.log('================================================================\n');

  let room203Id = null;
  let room204Id = null;
  let misActive = null;
  let misInactive = null;
  let ojtUser = null;
  let studentUser = null;

  let originalActiveQr = null;
  let originalInactiveQr = null;
  let originalOjtQr = null;
  let originalStudentQr = null;
  const createdUserIds = [];

  let baselineOccLogId = null;
  let baselineAuditLogId = null;

  // Helper to reset labs to Present & NULL holder
  async function resetLabs() {
    claimService.clearAllClaims();
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number IN ('203', '204')");
  }

  try {
    // 1. Ensure test laboratories 203 and 204 exist
    const [lab203Rows] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = '203' LIMIT 1");
    assert.ok(lab203Rows.length > 0, "Room 203 must exist");
    room203Id = lab203Rows[0].Room_ID;

    const [lab204Rows] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = '204' LIMIT 1");
    assert.ok(lab204Rows.length > 0, "Room 204 must exist");
    room204Id = lab204Rows[0].Room_ID;

    // Record baseline log IDs to clean up occupancy_log and audit_logs created during this test
    const [maxOccRows] = await db.query('SELECT COALESCE(MAX(Log_ID), 0) AS maxId FROM occupancy_log');
    baselineOccLogId = maxOccRows[0].maxId;

    const [maxAuditRows] = await db.query('SELECT COALESCE(MAX(Log_ID), 0) AS maxId FROM audit_logs');
    baselineAuditLogId = maxAuditRows[0].maxId;

    // Neutralize any legacy static test QR strings leftover in DB from older unisolated runs
    await db.query(
      "UPDATE users SET ID_QR_String = NULL WHERE ID_QR_String IN ('LABSYNC-USER-MIS-TEST-ACTIVE', 'LABSYNC-USER-MIS-TEST-INACT', 'LABSYNC-OJT-TEST-QR-999', 'LABSYNC-USER-STUDENT-TEST')"
    );

    // Generate unique dynamic QR strings for this test run
    const testRunId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const testQrActive = `LABSYNC-USER-MIS-ACT-${testRunId}`;
    const testQrInactive = `LABSYNC-USER-MIS-INA-${testRunId}`;
    const testQrOjt = `LABSYNC-USER-OJT-${testRunId}`;
    const testQrStudent = `LABSYNC-USER-STUDENT-${testRunId}`;

    // 2. Setup Test Accounts (Active MIS Staff, Inactive MIS Staff, OJT, Student)
    // Find or create active MIS Staff
    const [misRows] = await db.query("SELECT User_ID, Name, Email, Role, Status, ID_QR_String FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1");
    if (misRows.length > 0) {
      misActive = misRows[0];
      originalActiveQr = misActive.ID_QR_String;
      misActive.ID_QR_String = testQrActive;
      await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [testQrActive, misActive.User_ID]);
    } else {
      const [ins] = await db.query(
        "INSERT INTO users (Name, Email, Role, Status, ID_QR_String) VALUES ('Engr. Mark MIS', ?, 'MIS Staff', 'ACTIVE', ?)",
        [`mark.mis.${testRunId}@bulsu.edu.ph`, testQrActive]
      );
      misActive = { User_ID: ins.insertId, Name: 'Engr. Mark MIS', Role: 'MIS Staff', Status: 'ACTIVE', ID_QR_String: testQrActive };
      createdUserIds.push(ins.insertId);
    }

    // Find or create inactive/deactivated MIS Staff
    const [inactRows] = await db.query("SELECT User_ID, Name, Email, Role, Status, ID_QR_String FROM users WHERE Role = 'MIS Staff' AND Status = 'DEACTIVATED' LIMIT 1");
    if (inactRows.length > 0) {
      misInactive = inactRows[0];
      originalInactiveQr = misInactive.ID_QR_String;
      misInactive.ID_QR_String = testQrInactive;
      await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [testQrInactive, misInactive.User_ID]);
    } else {
      const [insInact] = await db.query(
        "INSERT INTO users (Name, Email, Role, Status, ID_QR_String) VALUES ('Deactivated MIS Tech', ?, 'MIS Staff', 'DEACTIVATED', ?)",
        [`deact.mis.${testRunId}@bulsu.edu.ph`, testQrInactive]
      );
      misInactive = { User_ID: insInact.insertId, Name: 'Deactivated MIS Tech', Role: 'MIS Staff', Status: 'DEACTIVATED', ID_QR_String: testQrInactive };
      createdUserIds.push(insInact.insertId);
    }

    // Find or create OJT user with OJT QR
    const [ojtRows] = await db.query("SELECT User_ID, Name, Email, Role, Status, ID_QR_String FROM users WHERE Role = 'OJT' AND Status = 'ACTIVE' LIMIT 1");
    if (ojtRows.length > 0) {
      ojtUser = ojtRows[0];
      originalOjtQr = ojtUser.ID_QR_String;
      ojtUser.ID_QR_String = testQrOjt;
      await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [testQrOjt, ojtUser.User_ID]);
    } else {
      const [insOjt] = await db.query(
        "INSERT INTO users (Name, Email, Role, Status, ID_QR_String) VALUES ('Juan OJT Trainee', ?, 'OJT', 'ACTIVE', ?)",
        [`juan.ojt.${testRunId}@bulsu.edu.ph`, testQrOjt]
      );
      ojtUser = { User_ID: insOjt.insertId, Name: 'Juan OJT Trainee', Role: 'OJT', Status: 'ACTIVE', ID_QR_String: testQrOjt };
      createdUserIds.push(insOjt.insertId);
    }

    // Find or create Student/Public user
    const [studRows] = await db.query("SELECT User_ID, Name, Email, Role, Status, ID_QR_String FROM users WHERE Role = 'Student' AND Status = 'ACTIVE' LIMIT 1");
    if (studRows.length > 0) {
      studentUser = studRows[0];
      originalStudentQr = studentUser.ID_QR_String;
      studentUser.ID_QR_String = testQrStudent;
      await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [testQrStudent, studentUser.User_ID]);
    } else {
      const [insStud] = await db.query(
        "INSERT INTO users (Name, Email, Role, Status, ID_QR_String) VALUES ('Student Juan', ?, 'Student', 'ACTIVE', ?)",
        [`student.${testRunId}@bulsu.edu.ph`, testQrStudent]
      );
      studentUser = { User_ID: insStud.insertId, Name: 'Student Juan', Role: 'Student', Status: 'ACTIVE', ID_QR_String: testQrStudent };
      createdUserIds.push(insStud.insertId);
    }

    await resetLabs();

    // -------------------------------------------------------------------------
    // TEST 1 — AUTHENTICATION & ROLE AUTHORIZATION MATRIX
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Role Authorization Matrix at Key Box ---');

    // 1A. Active MIS Staff -> Allowed
    const scanActiveMis = await iotService.logOccupancy({
      qrString: misActive.ID_QR_String,
      roomNumber: '203',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(scanActiveMis.status, 200, 'Active MIS Staff QR scan must succeed with status 200');
    assert.strictEqual(scanActiveMis.data.lcdLine1, 'Access Granted!', 'LCD line 1 must show Access Granted!');
    assert.ok(scanActiveMis.data.message.includes('MIS Staff QR verified'), 'Message must indicate MIS Staff verification');
    console.log('✔ 1A PASSED: Active MIS Staff QR scan allowed.');

    // 1B. Deactivated MIS Staff -> Denied
    const scanDeactMis = await iotService.logOccupancy({
      qrString: misInactive.ID_QR_String,
      roomNumber: '203',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(scanDeactMis.status, 403, 'Deactivated MIS Staff must be rejected with 403');
    assert.strictEqual(scanDeactMis.lcdLine1, 'Access Denied!', 'LCD line 1 must show Access Denied!');
    assert.strictEqual(scanDeactMis.lcdLine2, 'Account Inactive', 'LCD line 2 must show Account Inactive');
    console.log('✔ 1B PASSED: Deactivated MIS Staff QR scan rejected.');

    // 1C. OJT User -> Strictly Denied
    const scanOjt = await iotService.logOccupancy({
      qrString: ojtUser.ID_QR_String,
      roomNumber: '203',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(scanOjt.status, 403, 'OJT QR scan must be rejected with 403');
    assert.strictEqual(scanOjt.lcdLine1, 'Access Denied!', 'LCD line 1 must show Access Denied!');
    assert.strictEqual(scanOjt.lcdLine2, 'OJT Unauthorized', 'LCD line 2 must show OJT Unauthorized');
    console.log('✔ 1C PASSED: OJT physical key-box access strictly denied.');

    // 1D. Student / Unauthorized Role -> Denied
    const scanStudent = await iotService.logOccupancy({
      qrString: studentUser.ID_QR_String,
      roomNumber: '203',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(scanStudent.status, 403, 'Student QR scan must be rejected with 403');
    assert.strictEqual(scanStudent.lcdLine1, 'Access Denied!', 'LCD line 1 must show Access Denied!');
    assert.strictEqual(scanStudent.lcdLine2, 'Role Denied', 'LCD line 2 must show Role Denied');
    console.log('✔ 1D PASSED: Student / Unauthorized role rejected.');

    // 1E. Non-Existent QR String -> 404
    const scanInvalid = await iotService.logOccupancy({
      qrString: 'LABSYNC-NONEXISTENT-TOKEN-RANDOM',
      roomNumber: '203',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(scanInvalid.status, 404, 'Non-existent QR must return 404');
    assert.strictEqual(scanInvalid.lcdLine1, 'Access Denied!', 'LCD line 1 must show Access Denied!');
    console.log('✔ 1E PASSED: Non-existent QR rejected.');

    // -------------------------------------------------------------------------
    // TEST 2 — DYNAMIC PHYSICAL SLOT BINDING: WITHDRAW KEY 203
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Dynamic Physical Slot Binding (Key 203) ---');
    await resetLabs();

    // MIS scans personal identity QR
    const misScanRes = await iotService.logOccupancy({
      qrString: misActive.ID_QR_String,
      roomNumber: '203',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(misScanRes.status, 200, 'QR scan accepted');

    // Physical key 203 taken
    const take203Res = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '203'
    }, mockDevice);
    assert.strictEqual(take203Res.status, 200, 'Key Taken event accepted');
    assert.strictEqual(take203Res.data.registeredUser, misActive.Name, 'Holder registered must match MIS Staff name');

    // Check DB state
    const [lab203Db] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203Id]);
    assert.strictEqual(lab203Db[0].Key_Status, 'Absent', 'Key 203 status is Absent');
    assert.strictEqual(lab203Db[0].Current_User_ID, misActive.User_ID, 'Current_User_ID must match MIS Staff');

    // Check audit log for IOT_KEY_WITHDRAWAL with IT Maintenance
    const [auditWithdrawRows] = await db.query(
      `SELECT * FROM audit_logs 
       WHERE Action = 'IOT_KEY_WITHDRAWAL' AND User_ID = ? AND Resource_ID = ?
       ORDER BY Log_ID DESC LIMIT 1`,
      [misActive.User_ID, room203Id]
    );
    assert.ok(auditWithdrawRows.length > 0, 'Audit log must record IOT_KEY_WITHDRAWAL');
    assert.strictEqual(auditWithdrawRows[0].Actor_Role, 'MIS Staff', 'Actor_Role must be MIS Staff');
    const withdrawDetails = JSON.parse(auditWithdrawRows[0].Details);
    assert.strictEqual(withdrawDetails.purpose, 'IT Maintenance', 'Audit details must record purpose: IT Maintenance');
    console.log('✔ TEST 2 PASSED: Dynamic physical slot binding (Room 203) & IT Maintenance audit logged.');

    // -------------------------------------------------------------------------
    // TEST 3 — SINGLE-USE CONSUMPTION & SIBLING SLOT SAFETY
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Single-Use Consumption (Key 204 Cannot Inherit Authorization) ---');
    // Key 204 is removed immediately without another QR scan
    const take204Attempt = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    assert.strictEqual(take204Attempt.status, 200, 'Key event processed');

    // Verify Room 204 DB state: Current_User_ID MUST BE NULL!
    const [lab204Db] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room204Id]);
    assert.strictEqual(lab204Db[0].Key_Status, 'Absent', 'Room 204 key is Absent');
    assert.strictEqual(lab204Db[0].Current_User_ID, null, 'Room 204 Current_User_ID MUST BE NULL (single-use authorization was consumed by 203)');

    // Verify occupancy_log recorded User_ID = NULL for 204
    const [occLog204] = await db.query(
      `SELECT * FROM occupancy_log WHERE Room_ID = ? AND Auth_Method = 'Key Taken' ORDER BY Log_ID DESC LIMIT 1`,
      [room204Id]
    );
    assert.ok(occLog204.length > 0, 'Occupancy log must exist for 204');
    assert.strictEqual(occLog204[0].User_ID, null, 'Occupancy log User_ID must be NULL for unauthorized withdrawal');
    console.log('✔ TEST 3 PASSED: Single-use consumption verified. Sibling slot did NOT inherit authorization.');

    // Restore Key 204
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);

    // -------------------------------------------------------------------------
    // TEST 4 — LABORATORY SERVICE STATUS & FORMATTING FOR MIS STAFF
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Laboratory Service Status & Holder Formatting for MIS Staff ---');
    const allLabs = await laboratoryService.getAllLaboratories();
    const lab203 = allLabs.data.find(r => r.Room_Number === '203');
    assert.ok(lab203, 'Room 203 must exist in laboratory listing');
    assert.strictEqual(lab203.Key_Status, 'Absent', 'Key_Status is Absent');
    assert.strictEqual(lab203.Current_Status, 'Borrowed', 'Current_Status is Borrowed');
    assert.strictEqual(lab203.Current_Key_Holder, misActive.Name, 'Current_Key_Holder must match MIS Staff name exactly');
    assert.strictEqual(lab203.Current_Key_Holder_Role, 'MIS Staff', 'Current_Key_Holder_Role must be MIS Staff');
    assert.strictEqual(lab203.Borrow_Purpose, 'IT Maintenance', 'Borrow_Purpose must be IT Maintenance');
    assert.strictEqual(lab203.Current_Class, 'IT Maintenance', 'Current_Class reflects IT Maintenance');
    console.log('✔ TEST 4 PASSED: Laboratory service accurately presents Borrowed / IT Maintenance with clean MIS holder.');

    // -------------------------------------------------------------------------
    // TEST 5 — KEY RETURN & CUSTODY CLOSURE AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Key Return & Custody Closure Audit ---');
    // Key 203 is returned
    const return203Res = await iotService.logOccupancy({
      keyEvent: 'Key Returned',
      roomNumber: '203'
    }, mockDevice);
    assert.strictEqual(return203Res.status, 200, 'Key Returned processed');

    // Verify DB laboratory state: Current_User_ID = NULL, Key_Status = Present
    const [lab203ReturnedDb] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room203Id]);
    assert.strictEqual(lab203ReturnedDb[0].Key_Status, 'Present', 'Key_Status is Present');
    assert.strictEqual(lab203ReturnedDb[0].Current_User_ID, null, 'Current_User_ID is NULL after key return');

    // Verify audit log for IOT_KEY_RETURN captures the previous MIS Staff holder
    const [auditReturnRows] = await db.query(
      `SELECT * FROM audit_logs 
       WHERE Action = 'IOT_KEY_RETURN' AND User_ID = ? AND Resource_ID = ?
       ORDER BY Log_ID DESC LIMIT 1`,
      [misActive.User_ID, room203Id]
    );
    assert.ok(auditReturnRows.length > 0, 'Audit log must record IOT_KEY_RETURN');
    assert.strictEqual(auditReturnRows[0].Actor_Role, 'MIS Staff', 'Actor_Role must be MIS Staff');
    const returnDetails = JSON.parse(auditReturnRows[0].Details);
    assert.strictEqual(returnDetails.purpose, 'IT Maintenance', 'Audit details must record purpose: IT Maintenance');
    assert.strictEqual(returnDetails.status, 'Present', 'Status must be Present');
    console.log('✔ TEST 5 PASSED: Key return correctly closed custody and recorded IOT_KEY_RETURN audit log.');

    // -------------------------------------------------------------------------
    // TEST 6 — DYNAMIC PHYSICAL SLOT BINDING: WITHDRAW KEY 204
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Personal QR Dynamic Binding to Room 204 ---');
    await resetLabs();

    // MIS scans personal QR
    await iotService.logOccupancy({
      qrString: misActive.ID_QR_String,
      roomNumber: '203', // ESP32 sends default box room
      authMethod: 'QR Code'
    }, mockDevice);

    // MIS physically removes Key 204 (demonstrating personal QR is slot-neutral)
    const take204Res = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    assert.strictEqual(take204Res.status, 200, 'Key Taken for 204 accepted');
    assert.strictEqual(take204Res.data.registeredUser, misActive.Name, 'Holder registered must match MIS Staff');

    const [lab204ActiveDb] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [room204Id]);
    assert.strictEqual(lab204ActiveDb[0].Key_Status, 'Absent', 'Room 204 key is Absent');
    assert.strictEqual(lab204ActiveDb[0].Current_User_ID, misActive.User_ID, 'Room 204 is bound to MIS Staff');

    // Clean up
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);
    console.log('✔ TEST 6 PASSED: Personal identity QR successfully bound to Room 204 upon physical removal.');

    // -------------------------------------------------------------------------
    // TEST 7 — FRONTEND PROFILE QR POLICY RULE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Frontend Profile QR Policy Rule Verification ---');
    const accountModalJs = fs.readFileSync(path.join(__dirname, '../js/components/profile/account-modal.js'), 'utf8');

    // Extract isPersonalQrAllowed function from account-modal.js
    const fnStart = accountModalJs.indexOf('function isPersonalQrAllowed(');
    assert.ok(fnStart !== -1, 'isPersonalQrAllowed function must exist in account-modal.js');
    const fnEnd = accountModalJs.indexOf('}', accountModalJs.indexOf('return clean.includes', fnStart)) + 1;
    const fnCode = accountModalJs.substring(fnStart, fnEnd);

    const evalQrPolicy = new Function(`${fnCode}; return isPersonalQrAllowed;`)();

    assert.strictEqual(evalQrPolicy('MIS Staff'), true, 'MIS Staff must be allowed personal QR');
    assert.strictEqual(evalQrPolicy('mis staff'), true, 'Case-insensitive mis staff must be allowed');
    assert.strictEqual(evalQrPolicy('MIS'), true, 'MIS role must be allowed');
    assert.strictEqual(evalQrPolicy('Faculty'), true, 'Faculty must be allowed');
    assert.strictEqual(evalQrPolicy('IT Dept. Head'), true, 'IT Dept. Head must be allowed');
    assert.strictEqual(evalQrPolicy('OJT'), false, 'OJT must be strictly forbidden from personal QR');
    assert.strictEqual(evalQrPolicy('ojt trainee'), false, 'ojt trainee must be strictly forbidden');
    assert.strictEqual(evalQrPolicy('Student'), false, 'Student must be forbidden');
    console.log('✔ TEST 7 PASSED: Frontend Profile QR policy permits MIS Staff while strictly blocking OJT.');

    // -------------------------------------------------------------------------
    // TEST 8 — FRONTEND ROOM STATUS CARD MIS ROLE BADGE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Frontend Room Status Card MIS Role Badge Verification ---');
    const labServiceJs = fs.readFileSync(path.join(__dirname, '../js/services/laboratory.service.js'), 'utf8');
    const mockWindowLab = {
      location: { pathname: '/room-status.html' },
      currentUser: { Role: 'MIS Staff' },
      lucide: { createIcons: () => {} }
    };
    const evalLabFn = new Function('window', `
      ${labServiceJs}
      return renderLabCards;
    `);
    const renderLabCards = evalLabFn(mockWindowLab);

    function createMockElement(tag) {
      return {
        tagName: tag,
        innerHTML: '',
        _lastRenderSignature: null,
        querySelector: () => null,
        querySelectorAll: () => []
      };
    }

    // 8A. MIS Staff Holder
    const misRoomData = {
      Room_Number: '204',
      Building: 'Bldg. B',
      Key_Status: 'Absent',
      Current_Status: 'Borrowed',
      Current_Key_Holder: 'Miles Moralejo',
      Current_Key_Holder_Role: 'MIS Staff',
      Borrow_Purpose: 'IT Maintenance',
      deviceOnline: true
    };
    const containerMis = createMockElement('div');
    renderLabCards([misRoomData], containerMis);
    const htmlMis = containerMis.innerHTML;

    assert.ok(htmlMis.includes('Miles Moralejo'), 'Card must display MIS holder name');
    assert.ok(htmlMis.includes('mis-badge'), 'Card Claimed By must contain mis-badge class');
    assert.ok(htmlMis.includes('MIS'), 'Card Claimed By must display MIS label');
    assert.ok(htmlMis.includes('has-role-badge'), 'Card Claimed By must have has-role-badge class');
    console.log('✔ 8A PASSED: Room status card renders MIS badge for MIS Staff key holder.');

    // 8B. Faculty Holder (Should NOT have MIS badge)
    const facultyRoomData = {
      Room_Number: '204',
      Building: 'Bldg. B',
      Key_Status: 'Absent',
      Current_Status: 'Borrowed',
      Current_Key_Holder: 'Prof. Juan Dela Cruz',
      Current_Key_Holder_Role: 'Faculty',
      deviceOnline: true
    };
    const containerFaculty = createMockElement('div');
    renderLabCards([facultyRoomData], containerFaculty);
    const htmlFaculty = containerFaculty.innerHTML;

    assert.ok(htmlFaculty.includes('Juan Dela Cruz'), 'Card must display faculty name');
    assert.ok(!htmlFaculty.includes('mis-badge'), 'Faculty card must NOT contain mis-badge');
    console.log('✔ 8B PASSED: Faculty key holder does NOT receive MIS badge.');

    // -------------------------------------------------------------------------
    // TEST 9 — TIMELINE & NOTIFICATION FORMATTING FOR MIS STAFF (NO "Prof.")
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Timeline & Notification Formatting for MIS Staff (No "Prof.") ---');
    const timelineCode = fs.readFileSync(path.join(__dirname, '../js/pages/room-status/room-status.timeline.js'), 'utf8');
    const mockTlWindow = {
      lucide: { createIcons: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {} }
    };
    new Function('window', 'global', timelineCode)(mockTlWindow, mockTlWindow);

    const tlContainer = createMockElement('div');
    const misTimelineLog = [
      {
        id: 991,
        time: new Date().toISOString(),
        status: 'Key Taken',
        room_number: '204',
        description: 'Miles Moralejo',
        detail: 'MIS Staff',
        session_type: 'Borrowed',
        type: 'occupancy'
      }
    ];

    mockTlWindow.roomStatusTimeline.renderTimelineItems(misTimelineLog, tlContainer);
    const tlHtml = tlContainer.innerHTML;
    assert.ok(tlHtml.includes('Miles Moralejo'), 'Timeline must render Miles Moralejo');
    assert.ok(!tlHtml.includes('Prof. Miles Moralejo'), 'Timeline MUST NOT prefix Prof. to MIS Staff');
    assert.ok(tlHtml.includes('MIS Staff'), 'Timeline must display MIS Staff role');
    console.log('✔ 9A PASSED: Room status timeline renders MIS staff without "Prof." prefix.');

    // Test IT Head Room Status Timeline
    const itHeadTlCode = fs.readFileSync(path.join(__dirname, '../js/pages/it-head-room-status.js'), 'utf8');
    assert.ok(itHeadTlCode.includes('isMisPersonnel'), 'it-head-room-status.js must check isMisPersonnel');
    console.log('✔ 9B PASSED: IT Head room status timeline includes MIS role detection.');

    // Test Notifications helper
    const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
    const mockNotifWin = {};
    new Function('window', 'document', 'sessionStorage', notifCode)(mockNotifWin, {}, { getItem: () => null });
    const misNotifItem = {
      type: 'occupancy',
      status: 'Key Taken',
      session_type: 'Borrowed',
      room_number: '204',
      description: 'Miles Moralejo',
      detail: 'MIS Staff'
    };
    const notifResult = mockNotifWin.getNotificationDetails(misNotifItem);
    assert.ok(notifResult.text.includes('Miles Moralejo'), 'Notification must include Miles Moralejo');
    assert.ok(!notifResult.text.includes('Prof. Miles Moralejo'), 'Notification MUST NOT prefix Prof. to MIS Staff');
    console.log('✔ 9C PASSED: Notification details omit "Prof." prefix for MIS Staff.');

    console.log('\n================================================================');
    console.log('🎉 ALL 9 MIS KEY-BOX ACCESS TEST SCENARIOS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

  } finally {
    try {
      await resetLabs();
    } catch (e) {
      console.error('Error resetting labs in teardown:', e.message);
    }

    try {
      if (baselineOccLogId !== null && room203Id && room204Id) {
        await db.query(
          'DELETE FROM occupancy_log WHERE Log_ID > ? AND Room_ID IN (?, ?)',
          [baselineOccLogId, room203Id, room204Id]
        );
      }
    } catch (e) {
      console.error('Error cleaning occupancy_log in teardown:', e.message);
    }

    try {
      if (baselineAuditLogId !== null && room203Id && room204Id) {
        await db.query(
          'DELETE FROM audit_logs WHERE Log_ID > ? AND Resource_ID IN (?, ?)',
          [baselineAuditLogId, String(room203Id), String(room204Id)]
        );
      }
    } catch (e) {
      console.error('Error cleaning audit_logs in teardown:', e.message);
    }

    try {
      if (createdUserIds.length > 0) {
        await db.query('DELETE FROM users WHERE User_ID IN (' + createdUserIds.map(() => '?').join(',') + ')', createdUserIds);
      }
    } catch (e) {
      console.error('Error cleaning created users in teardown:', e.message);
    }

    const legacyHardcodedQrs = [
      'LABSYNC-USER-MIS-TEST-ACTIVE',
      'LABSYNC-USER-MIS-TEST-INACT',
      'LABSYNC-OJT-TEST-QR-999',
      'LABSYNC-USER-STUDENT-TEST'
    ];

    try {
      if (misActive && misActive.User_ID && !createdUserIds.includes(misActive.User_ID)) {
        const restoreQr = (originalActiveQr && !legacyHardcodedQrs.includes(originalActiveQr)) ? originalActiveQr : null;
        await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [restoreQr, misActive.User_ID]);
      }
    } catch (e) {}

    try {
      if (misInactive && misInactive.User_ID && !createdUserIds.includes(misInactive.User_ID)) {
        const restoreQr = (originalInactiveQr && !legacyHardcodedQrs.includes(originalInactiveQr)) ? originalInactiveQr : null;
        await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [restoreQr, misInactive.User_ID]);
      }
    } catch (e) {}

    try {
      if (ojtUser && ojtUser.User_ID && !createdUserIds.includes(ojtUser.User_ID)) {
        const restoreQr = (originalOjtQr && !legacyHardcodedQrs.includes(originalOjtQr)) ? originalOjtQr : null;
        await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [restoreQr, ojtUser.User_ID]);
      }
    } catch (e) {}

    try {
      if (studentUser && studentUser.User_ID && !createdUserIds.includes(studentUser.User_ID)) {
        const restoreQr = (originalStudentQr && !legacyHardcodedQrs.includes(originalStudentQr)) ? originalStudentQr : null;
        await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [restoreQr, studentUser.User_ID]);
      }
    } catch (e) {}
  }
}

runMisKeyBoxAccessTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ MIS KEY-BOX ACCESS TEST FAILED:', err);
    process.exit(1);
  });
