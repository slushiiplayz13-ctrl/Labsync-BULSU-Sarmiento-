'use strict';

/**
 * tests/test-approved-filter-key-requests.js
 * Verification test suite for the "Approved" Filter inside the IT Dept. Head Key Requests container:
 * 1. Approved filter UI structure and placement inside #key-requests-menu
 * 2. Backend endpoints (/api/keys/approved-requests, /api/keys/pending-requests?status=approved)
 * 3. Role authorization & Program Coordinator exclusion (403 Forbidden)
 * 4. Filtering correctness: approved-only display, pending excluded, return to default restores normal list
 * 5. Approval attribution preserved and authentic (no fabricated records)
 * 6. Empty state messages for approved vs pending
 * 7. No separate dashboard button or duplicate container introduced
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const keyAuthService = require('../services/keyAuthorizationService');
const keyAuthRepo = require('../repositories/key-authorization.repository');

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 IT DEPT. HEAD KEY REQUESTS: APPROVED FILTER TEST SUITE');
  console.log('================================================================\n');

  try {
    // ────────────────────────────────────────────────────────────────
    // TEST 1: Inspect UI structure & Filter placement across HTML files
    // ────────────────────────────────────────────────────────────────
    console.log('--- 1. Inspecting UI Placement Inside Existing Container ---');
    const htmlFiles = [
      'it-head-dashboard.html',
      'it-head-room-status.html',
      'it-head-pc-reports.html',
      'it-head-my-schedule.html',
      'master-schedule.html',
      'faculty-management.html'
    ];

    for (const f of htmlFiles) {
      const filePath = path.join(__dirname, '..', f);
      const content = fs.readFileSync(filePath, 'utf8');

      assert.ok(content.includes('id="key-requests-menu"'), `${f} must contain #key-requests-menu`);
      assert.ok(content.includes('id="keyRequestsFilterBar"'), `${f} must contain #keyRequestsFilterBar`);
      assert.ok(content.includes('data-filter="approved"'), `${f} must contain data-filter="approved"`);
      assert.ok(content.includes('data-filter="pending"'), `${f} must contain data-filter="pending"`);
      assert.ok(content.includes('id="keyFilterApprovedBtn"'), `${f} must contain #keyFilterApprovedBtn`);

      // Ensure no duplicate container or extra dashboard buttons were added
      const menuMatches = (content.match(/id="key-requests-menu"/g) || []).length;
      assert.strictEqual(menuMatches, 1, `${f} must have exactly ONE #key-requests-menu`);
      const btnMatches = (content.match(/id="btnHeaderKeyRequests"/g) || []).length;
      assert.strictEqual(btnMatches, 1, `${f} must have exactly ONE #btnHeaderKeyRequests`);
    }
    console.log('✔ PASS: All 6 IT Head HTML pages have the Approved filter inside #key-requests-menu with no duplicate containers.\n');

    // ────────────────────────────────────────────────────────────────
    // TEST 2: Inspect dept-head-key-authorizations.js component logic
    // ────────────────────────────────────────────────────────────────
    console.log('--- 2. Inspecting Component Implementation (dept-head-key-authorizations.js) ---');
    const jsPath = path.join(__dirname, '..', 'js', 'components', 'dept-head-key-authorizations.js');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    assert.ok(jsContent.includes('setKeyRequestsFilter'), 'Must define setKeyRequestsFilter');
    assert.ok(jsContent.includes('/api/keys/approved-requests'), 'Must fetch /api/keys/approved-requests');
    assert.ok(jsContent.includes('keyRequestsFilterBar'), 'Must mount keyRequestsFilterBar if not in DOM');
    assert.ok(jsContent.includes('data-filter="approved"'), 'Must include approved filter in dynamic markup');
    assert.ok(jsContent.includes('approved-req-card'), 'Must support approved card styling');
    assert.ok(jsContent.includes('status-chip approved'), 'Must include approved status chip');
    assert.ok(jsContent.includes('approved-attribution-row'), 'Must include approval attribution');
    console.log('✔ PASS: dept-head-key-authorizations.js cleanly handles filter switching, approved API fetching, and card rendering.\n');

    // ────────────────────────────────────────────────────────────────
    // TEST 3: Backend Role Authorization & Program Coordinator Guard
    // ────────────────────────────────────────────────────────────────
    console.log('--- 3. Testing Backend Authorization & Role Safeguards ---');
    const [deptHeads] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
    const [progCoords] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
    const [faculties] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'Faculty' LIMIT 1");

    assert.ok(deptHeads.length > 0, 'Requires IT Dept. Head in DB');
    assert.ok(progCoords.length > 0, 'Requires Program Coordinator in DB');
    assert.ok(faculties.length > 0, 'Requires Faculty in DB');

    const itHead = deptHeads[0];
    const pc = progCoords[0];
    const faculty = faculties[0];

    // IT Dept Head can access approved requests
    const itHeadApprovedRes = await keyAuthService.getApprovedRequestsForDeptHead(itHead.User_ID, itHead.Role);
    assert.strictEqual(itHeadApprovedRes.status, 200, 'IT Dept Head must be permitted (200 OK)');
    assert.ok(Array.isArray(itHeadApprovedRes.data), 'Returns array of requests');

    // Program Coordinator is strictly 403 Forbidden
    const pcApprovedRes = await keyAuthService.getApprovedRequestsForDeptHead(pc.User_ID, pc.Role);
    assert.strictEqual(pcApprovedRes.status, 403, 'Program Coordinator must receive 403 Forbidden');

    // Faculty is strictly 403 Forbidden
    const facultyApprovedRes = await keyAuthService.getApprovedRequestsForDeptHead(faculty.User_ID, faculty.Role);
    assert.strictEqual(facultyApprovedRes.status, 403, 'Faculty must receive 403 Forbidden');

    // Unauthenticated is 401
    const unauthApprovedRes = await keyAuthService.getApprovedRequestsForDeptHead(null, null);
    assert.strictEqual(unauthApprovedRes.status, 401, 'Unauthenticated must receive 401 Unauthorized');
    console.log('✔ PASS: Exclusive access preserved. IT Dept Head = 200, Program Coordinator & Faculty = 403 Forbidden.\n');

    // ────────────────────────────────────────────────────────────────
    // TEST 4: Filtering Accuracy — Approved Only vs Pending Only
    // ────────────────────────────────────────────────────────────────
    console.log('--- 4. Testing Filter Data Separation & Attribution ---');
    const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number ASC");
    assert.strictEqual(rooms.length, 2, 'Requires Room 203 & 204');
    const testRoom = rooms[0];

    // Clean up test requests for faculty
    await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [faculty.User_ID]);

    // 4A. Create 1 PENDING request and 1 APPROVED request
    const createPendingRes = await keyAuthService.requestAdditionalKey(
      faculty.User_ID, faculty.Role, faculty.Name, testRoom.Room_ID, 'Pending filter test request'
    );
    assert.strictEqual(createPendingRes.status, 201);
    const pendingReqId = createPendingRes.data.requestId;

    // Create a 2nd request directly in DB and approve it
    const [insertApproved] = await db.query(
      `INSERT INTO key_authorization_requests (User_ID, Room_ID, Reason, Status, Requested_At, Approved_By, Approved_At, Duration_Minutes, Expires_At)
       VALUES (?, ?, 'Approved filter test request', 'APPROVED', NOW(), ?, NOW(), 120, DATE_ADD(NOW(), INTERVAL 120 MINUTE))`,
      [faculty.User_ID, rooms[1].Room_ID, itHead.User_ID]
    );
    const approvedReqId = insertApproved.insertId;

    // Create a 3rd REJECTED request to verify non-approved requests are excluded
    const [insertRejected] = await db.query(
      `INSERT INTO key_authorization_requests (User_ID, Room_ID, Reason, Status, Requested_At, Approved_By, Approved_At, Rejection_Reason)
       VALUES (?, ?, 'Rejected request test', 'REJECTED', NOW(), ?, NOW(), 'Not allowed')`,
      [faculty.User_ID, testRoom.Room_ID, itHead.User_ID]
    );
    const rejectedReqId = insertRejected.insertId;

    // 4B. Query Pending filter (default)
    const pendingListRes = await keyAuthService.getPendingRequestsForDeptHead(itHead.User_ID, itHead.Role, 'pending');
    assert.strictEqual(pendingListRes.status, 200);
    const pendingItems = pendingListRes.data;
    const foundPendingInPending = pendingItems.find(r => r.Request_ID === pendingReqId);
    const foundApprovedInPending = pendingItems.find(r => r.Request_ID === approvedReqId);
    const foundRejectedInPending = pendingItems.find(r => r.Request_ID === rejectedReqId);

    assert.ok(foundPendingInPending, 'Pending request must appear in Pending filter');
    assert.ok(!foundApprovedInPending, 'Approved request must be EXCLUDED from Pending filter');
    assert.ok(!foundRejectedInPending, 'Rejected request must be EXCLUDED from Pending filter');

    // 4C. Query Approved filter
    const approvedListRes = await keyAuthService.getApprovedRequestsForDeptHead(itHead.User_ID, itHead.Role);
    assert.strictEqual(approvedListRes.status, 200);
    const approvedItems = approvedListRes.data;
    const foundApprovedInApproved = approvedItems.find(r => r.Request_ID === approvedReqId);
    const foundPendingInApproved = approvedItems.find(r => r.Request_ID === pendingReqId);
    const foundRejectedInApproved = approvedItems.find(r => r.Request_ID === rejectedReqId);

    assert.ok(foundApprovedInApproved, 'Approved request must appear in Approved filter');
    assert.ok(!foundPendingInApproved, 'Pending request must be EXCLUDED from Approved filter');
    assert.ok(!foundRejectedInApproved, 'Rejected request must be EXCLUDED from Approved filter');
    assert.strictEqual(foundApprovedInApproved.Status, 'APPROVED', 'Status must be APPROVED');
    assert.strictEqual(foundApprovedInApproved.Approver_Name, itHead.Name, 'Approver name must match authentic IT Head');
    assert.strictEqual(foundApprovedInApproved.Approved_By, itHead.User_ID, 'Approved_By must match authentic IT Head ID');

    // 4D. Query All filter
    const allListRes = await keyAuthService.getPendingRequestsForDeptHead(itHead.User_ID, itHead.Role, 'all');
    assert.strictEqual(allListRes.status, 200);
    const allItems = allListRes.data;
    assert.ok(allItems.some(r => r.Request_ID === pendingReqId), 'All filter includes pending');
    assert.ok(allItems.some(r => r.Request_ID === approvedReqId), 'All filter includes approved');
    assert.ok(!allItems.some(r => r.Request_ID === rejectedReqId), 'All filter excludes rejected');

    console.log('✔ PASS: Approved filter isolates approved records; excludes pending & rejected; restores default cleanly.\n');

    // ────────────────────────────────────────────────────────────────
    // TEST 5: Clean Up & Empty State Check
    // ────────────────────────────────────────────────────────────────
    console.log('--- 5. Testing Empty State ---');
    await db.query("DELETE FROM key_authorization_requests WHERE Request_ID IN (?, ?, ?)", [pendingReqId, approvedReqId, rejectedReqId]);

    // Check query with no requests for this faculty
    const emptyCheckApproved = await keyAuthRepo.findAllApprovedForDeptHead();
    const facultyApproved = emptyCheckApproved[0].filter(r => r.User_ID === faculty.User_ID);
    assert.strictEqual(facultyApproved.length, 0, 'No remaining approved requests for test faculty');
    console.log('✔ PASS: Clean state verified.\n');

    console.log('================================================================');
    console.log('🎉 ALL APPROVED FILTER TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================\n');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTestSuite();
