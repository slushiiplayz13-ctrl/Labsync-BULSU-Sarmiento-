'use strict';

/**
 * tests/test-multi-key-approval-workflow.js
 * End-to-end automated testing for the complete Multi-Key Authorization Workflow:
 * 1. Request initiation by faculty
 * 2. Real-time faculty account visibility (Pending state)
 * 3. Dept Head queue & review
 * 4. Dept Head approval with expiration window
 * 5. Real-time faculty account visibility (Approved state)
 * 6. Dual-channel fulfillment (Mobile QR Transfer & IoT Key Box)
 * 7. Two-key maximum ceiling enforcement
 * 8. Rejection and reason visibility in faculty account
 * 9. Safe return and lifecycle completion
 */

const assert = require('assert');
const db = require('../database/connection');
const keyAuthService = require('../services/keyAuthorizationService');
const keyAuthRepo = require('../repositories/key-authorization.repository');
const keysService = require('../services/keysService');
const iotService = require('../services/iotService');
const labRepo = require('../repositories/laboratory.repository');

const mockDevice = {
  id: 'ESP32-KeyBox',
  authorizedRooms: ['203', '204']
};

async function runTests() {
  console.log('================================================================');
  console.log('🧪 MULTI-KEY APPROVAL WORKFLOW & FACULTY VISIBILITY TEST SUITE');
  console.log('================================================================');

  // 1. Fetch test rooms and users
  const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number ASC");
  assert.strictEqual(rooms.length, 2, 'Requires Room 203 and 204 in database');
  const room203 = rooms[0];
  const room204 = rooms[1];

  const [keys203] = await db.query('SELECT Key_ID, Key_Code FROM laboratory_keys WHERE Room_ID = ?', [room203.Room_ID]);
  const [keys204] = await db.query('SELECT Key_ID, Key_Code FROM laboratory_keys WHERE Room_ID = ?', [room204.Room_ID]);
  const key203 = keys203[0];
  const key204 = keys204[0];

  const [deptHeads] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
  const [facultyUsers] = await db.query("SELECT User_ID, Name, Role, ID_QR_String FROM users WHERE Role = 'Faculty' LIMIT 1");
  assert.ok(deptHeads.length > 0, 'Requires IT Dept. Head');
  assert.ok(facultyUsers.length > 0, 'Requires Faculty member');

  const deptHead = deptHeads[0];
  const faculty = facultyUsers[0];

  console.log(`Dept Head: ${deptHead.Name} (ID: ${deptHead.User_ID})`);
  console.log(`Faculty:   ${faculty.Name} (ID: ${faculty.User_ID})`);

  // Ensure clean initial state
  await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [faculty.User_ID]);
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [room203.Room_ID, room204.Room_ID]);

  const mockReqFaculty = {
    session: {
      userId: faculty.User_ID,
      userName: faculty.Name,
      userRole: faculty.Role
    }
  };

  const mockReqDeptHead = {
    session: {
      userId: deptHead.User_ID,
      userName: deptHead.Name,
      userRole: deptHead.Role
    }
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: Faculty claims 1st Key (Room 203)
    // -------------------------------------------------------------
    console.log('\n--- 1. Faculty Claims Initial Key (Room 203) ---');
    const claim1 = await keysService.transferKey(key203.Key_Code, mockReqFaculty);
    assert.strictEqual(claim1.status, 200, 'First key claim must succeed');
    const [held1] = await labRepo.findActiveKeysByUserId(faculty.User_ID);
    assert.strictEqual(held1.length, 1, 'Faculty holds 1 key');
    console.log('✔ PASS: Faculty holds Key for Room 203.');

    // -------------------------------------------------------------
    // TEST 2: Faculty attempts 2nd Key (Room 204) without approval -> Blocked
    // -------------------------------------------------------------
    console.log('\n--- 2. Unapproved 2nd Key Attempt Blocked ---');
    const unapprovedInfo = await keysService.getKeyTransferInfo(key204.Key_Code, mockReqFaculty);
    assert.strictEqual(unapprovedInfo.data.canTransfer, false, 'Must not be allowed to claim 2nd key');
    assert.strictEqual(unapprovedInfo.data.canRequestApproval, true, 'canRequestApproval must be true');

    const unapprovedTransfer = await keysService.transferKey(key204.Key_Code, mockReqFaculty);
    assert.strictEqual(unapprovedTransfer.status, 403, 'Transfer must be rejected with 403');
    console.log('✔ PASS: Unapproved 2nd key claim successfully rejected.');

    // -------------------------------------------------------------
    // TEST 3: Faculty Submits Multi-Key Request for Room 204
    // -------------------------------------------------------------
    console.log('\n--- 3. Faculty Submits Multi-Key Request ---');
    const reqReason = 'Simultaneous dual-laboratory programming exam';
    const subRes = await keyAuthService.requestAdditionalKey(
      faculty.User_ID, faculty.Role, faculty.Name, room204.Room_ID, reqReason
    );
    assert.strictEqual(subRes.status, 201, 'Request submission must return 201 Created');
    const requestId = subRes.data.requestId;
    assert.ok(requestId > 0, 'Must return valid requestId');
    console.log(`✔ PASS: Request submitted with ID ${requestId}.`);

    // -------------------------------------------------------------
    // TEST 4: Faculty Account Visibility - PENDING State
    // -------------------------------------------------------------
    console.log('\n--- 4. Faculty Account Status Check: PENDING ---');
    const facultyStatusPending = await keyAuthService.getFacultyRequestStatus(faculty.User_ID);
    assert.strictEqual(facultyStatusPending.status, 200);
    assert.strictEqual(facultyStatusPending.data.Status, 'PENDING');
    assert.strictEqual(facultyStatusPending.data.Room_Number, room204.Room_Number);
    assert.strictEqual(facultyStatusPending.data.Reason, reqReason);
    console.log('✔ PASS: Faculty account correctly displays PENDING status with room & reason.');

    // -------------------------------------------------------------
    // TEST 5: Dept Head Pending Queue Check
    // -------------------------------------------------------------
    console.log('\n--- 5. Dept Head Pending Queue Inspection ---');
    const pendingList = await keyAuthService.getPendingRequestsForDeptHead(deptHead.User_ID, deptHead.Role);
    assert.strictEqual(pendingList.status, 200);
    const foundReq = pendingList.data.find(r => r.Request_ID === requestId);
    assert.ok(foundReq, 'Request must appear in Dept Head pending queue');
    assert.strictEqual(foundReq.Requester_Name, faculty.Name);
    assert.strictEqual(foundReq.Requested_Room_Number, room204.Room_Number);
    assert.ok(foundReq.Currently_Held_Rooms.includes(room203.Room_Number), 'Must show held room 203');
    console.log('✔ PASS: Dept Head sees request with requester details, held room, and requested room.');

    // -------------------------------------------------------------
    // TEST 6: Dept Head Approves Request (120 minutes)
    // -------------------------------------------------------------
    console.log('\n--- 6. Dept Head Approves Request ---');
    const approveRes = await keyAuthService.approveRequest(requestId, deptHead.User_ID, deptHead.Role, 120);
    assert.strictEqual(approveRes.status, 200, 'Approve must succeed with 200');
    assert.strictEqual(approveRes.data.status, 'APPROVED');
    assert.strictEqual(approveRes.data.durationMinutes, 120);
    assert.ok(new Date(approveRes.data.expiresAt) > new Date(), 'Expires_At must be in future');
    console.log('✔ PASS: Dept Head approved request for 120 minutes.');

    // -------------------------------------------------------------
    // TEST 7: Faculty Account Visibility - APPROVED State
    // -------------------------------------------------------------
    console.log('\n--- 7. Faculty Account Status Check: APPROVED ---');
    const facultyStatusApproved = await keyAuthService.getFacultyRequestStatus(faculty.User_ID);
    assert.strictEqual(facultyStatusApproved.status, 200);
    assert.strictEqual(facultyStatusApproved.data.Status, 'APPROVED');
    assert.strictEqual(facultyStatusApproved.data.Approver_Name, deptHead.Name);
    assert.ok(facultyStatusApproved.data.Minutes_Remaining > 0, 'Must have remaining minutes');
    console.log(`✔ PASS: Faculty account displays APPROVED by ${deptHead.Name} (${facultyStatusApproved.data.Minutes_Remaining}m remaining).`);

    // -------------------------------------------------------------
    // TEST 8: Mobile QR Transfer of Approved Key 204
    // -------------------------------------------------------------
    console.log('\n--- 8. Mobile QR Key Transfer with Active Approval ---');
    const approvedInfo = await keysService.getKeyTransferInfo(key204.Key_Code, mockReqFaculty);
    assert.strictEqual(approvedInfo.data.canTransfer, true, 'Approved multi-key must allow transfer');
    assert.strictEqual(approvedInfo.data.isApprovedMultiKey, true, 'isApprovedMultiKey must be true');

    const approvedTransfer = await keysService.transferKey(key204.Key_Code, mockReqFaculty);
    assert.strictEqual(approvedTransfer.status, 200, 'Transfer must now succeed');

    // Verify DB: Faculty holds BOTH keys
    const [heldBoth] = await labRepo.findActiveKeysByUserId(faculty.User_ID);
    assert.strictEqual(heldBoth.length, 2, 'Faculty must now hold BOTH keys');
    const heldNumbers = heldBoth.map(k => k.Room_Number);
    assert.ok(heldNumbers.includes(room203.Room_Number), 'Holds Room 203');
    assert.ok(heldNumbers.includes(room204.Room_Number), 'Holds Room 204');

    // Verify request status transitioned to CLAIMED
    const [reqAfterClaim] = await db.query('SELECT Status, Claimed_At FROM key_authorization_requests WHERE Request_ID = ?', [requestId]);
    assert.strictEqual(reqAfterClaim[0].Status, 'CLAIMED', 'Status must transition to CLAIMED');
    assert.ok(reqAfterClaim[0].Claimed_At, 'Claimed_At must be recorded');
    console.log('✔ PASS: Faculty successfully claimed 2nd key; request status transitioned to CLAIMED.');

    // -------------------------------------------------------------
    // TEST 9: Strict Ceiling: Cannot request a 3rd key
    // -------------------------------------------------------------
    console.log('\n--- 9. Strict Two-Key Limit Ceiling Check ---');
    const thirdReq = await keyAuthService.requestAdditionalKey(
      faculty.User_ID, faculty.Role, faculty.Name, room204.Room_ID, 'Trying a third key'
    );
    assert.strictEqual(thirdReq.status, 400, 'Must block 3rd key request');
    assert.ok(thirdReq.error.includes('cannot hold more than 2 keys'), 'Must mention 2 keys limit');
    console.log('✔ PASS: Strict two-key ceiling enforced.');

    // -------------------------------------------------------------
    // TEST 10: Faculty Returns Key 204 -> Authorization COMPLETED
    // -------------------------------------------------------------
    console.log('\n--- 10. Key 204 Return & Authorization Completion ---');
    await iotService.logOccupancy({
      keyEvent: 'Key Returned',
      roomNumber: '204'
    }, mockDevice);

    const [heldAfterReturn] = await labRepo.findActiveKeysByUserId(faculty.User_ID);
    assert.strictEqual(heldAfterReturn.length, 1, 'Faculty now holds only 1 key (Room 203)');
    assert.strictEqual(heldAfterReturn[0].Room_Number, room203.Room_Number);

    const [reqCompleted] = await db.query('SELECT Status, Returned_At FROM key_authorization_requests WHERE Request_ID = ?', [requestId]);
    assert.strictEqual(reqCompleted[0].Status, 'COMPLETED', 'Authorization must transition to COMPLETED');
    assert.ok(reqCompleted[0].Returned_At, 'Returned_At must be recorded');
    console.log('✔ PASS: Returning Key 204 marked authorization as COMPLETED while preserving Key 203.');

    // -------------------------------------------------------------
    // TEST 11: Rejection Flow & Rejection Reason Visibility
    // -------------------------------------------------------------
    console.log('\n--- 11. Rejection Flow & Reason in Faculty Account ---');
    const rejectSub = await keyAuthService.requestAdditionalKey(
      faculty.User_ID, faculty.Role, faculty.Name, room204.Room_ID, 'Need room for project rehearsal'
    );
    assert.strictEqual(rejectSub.status, 201);
    const rejectReqId = rejectSub.data.requestId;

    const declineReason = 'Room 204 is reserved for maintenance team inspection';
    const declineRes = await keyAuthService.rejectRequest(rejectReqId, deptHead.User_ID, deptHead.Role, declineReason);
    assert.strictEqual(declineRes.status, 200);
    assert.strictEqual(declineRes.data.status, 'REJECTED');

    const facultyStatusRejected = await keyAuthService.getFacultyRequestStatus(faculty.User_ID);
    assert.strictEqual(facultyStatusRejected.status, 200);
    assert.strictEqual(facultyStatusRejected.data.Status, 'REJECTED');
    assert.strictEqual(facultyStatusRejected.data.Rejection_Reason, declineReason);
    console.log(`✔ PASS: Faculty account clearly displays REJECTED status with Dept Head note: "${declineReason}".`);

    // -------------------------------------------------------------
    // TEST 12: IoT Key Box Approved Multi-Key QR Scan & Solenoid Release
    // -------------------------------------------------------------
    console.log('\n--- 12. Physical IoT Key Box Multi-Key Flow ---');
    // Ensure faculty has clean ID_QR_String
    if (!faculty.ID_QR_String) {
      faculty.ID_QR_String = 'LABSYNC-USER-TEST-MULTIKY';
      await db.query('UPDATE users SET ID_QR_String = ? WHERE User_ID = ?', [faculty.ID_QR_String, faculty.User_ID]);
    }

    // Submit and approve new request for Room 204
    const iotReqSub = await keyAuthService.requestAdditionalKey(
      faculty.User_ID, faculty.Role, faculty.Name, room204.Room_ID, 'IoT box test retrieval'
    );
    const iotReqId = iotReqSub.data.requestId;
    await keyAuthService.approveRequest(iotReqId, deptHead.User_ID, deptHead.Role, 60);

    // Faculty scans QR at IoT Key Box while still holding Room 203
    const iotScanRes = await iotService.logOccupancy({
      qrString: faculty.ID_QR_String,
      roomNumber: '204',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(iotScanRes.status, 200, 'IoT scan must succeed with active authorization');

    // Faculty takes key from slot 204
    const takeRes = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    assert.strictEqual(takeRes.status, 200, 'Key Taken must succeed');

    // Verify DB holds both and status is CLAIMED
    const [iotReqStatus] = await db.query('SELECT Status FROM key_authorization_requests WHERE Request_ID = ?', [iotReqId]);
    assert.strictEqual(iotReqStatus[0].Status, 'CLAIMED', 'Status must be CLAIMED after IoT Key Taken');

    // Return keys and clean up
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '203' }, mockDevice);

    console.log('✔ PASS: IoT Key Box approved QR scan, slot release, and Key Taken lifecycle verified.');

    console.log('\n================================================================');
    console.log('🎉 ALL 12 MULTI-KEY APPROVAL & VISIBILITY TESTS PASSED 100%!');
    console.log('================================================================');

  } finally {
    // Teardown
    await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [faculty.User_ID]);
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [room203.Room_ID, room204.Room_ID]);
  }
}

runTests().then(() => {
  process.exit(0);
}).catch(async (err) => {
  console.error('\n❌ TEST FAILED:', err);
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL");
  process.exit(1);
});
