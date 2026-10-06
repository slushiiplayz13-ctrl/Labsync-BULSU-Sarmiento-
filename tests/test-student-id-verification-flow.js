'use strict';

/**
 * test-student-id-verification-flow.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete, authoritative test suite for QR-based Student Identity Capture,
 * Workstation Binding, and Persistent Replay Protection in LabSync:
 *
 * Covers all required security and deployment fixes:
 *  1. Valid camera/image QR flow.
 *  2. Manual QR string submission is rejected / not available.
 *  3. Valid verification session submits successfully.
 *  4. Modified student name rejected.
 *  5. Modified student number rejected.
 *  6. Modified room rejected.
 *  7. Modified PC rejected.
 *  8. Expired session rejected.
 *  9. Reused session rejected.
 * 10. Server/process restart does not make a previously-used verification session reusable.
 * 11. Direct /api/reports/submit without verification rejected.
 * 12. Existing PC report functionality still passes (deduplication, priority escalation, audit).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const studentVerificationService = require('../services/studentVerificationService');
const studentVerificationRepository = require('../repositories/student-verification.repository');
const maintenanceService = require('../services/maintenanceService');
const maintenanceRepository = require('../repositories/maintenance.repository');
const securityHeaders = require('../middleware/securityHeaders');

console.log('================================================================');
console.log('🧪 Starting LabSync Persistent Student ID QR Verification Suite');
console.log('================================================================\n');

(async () => {
  try {
    // -------------------------------------------------------------------------
    // PRELIMINARY TEST: Security Headers & Camera Permissions-Policy
    // -------------------------------------------------------------------------
    console.log('--- PRELIMINARY: Security Headers & Camera Permissions-Policy ---');
    let capturedHeaders = {};
    const mockReq = { headers: {} };
    const mockRes = {
      headers: {},
      setHeader: (k, v) => { capturedHeaders[k] = v; mockRes.headers[k] = v; },
      getHeader: (k) => mockRes.headers[k],
      removeHeader: (k) => { delete capturedHeaders[k]; delete mockRes.headers[k]; }
    };
    securityHeaders(mockReq, mockRes, () => {});
    assert.ok(capturedHeaders['Permissions-Policy'], 'Permissions-Policy header must exist');
    assert.ok(
      capturedHeaders['Permissions-Policy'].includes('camera=(self)'),
      `Permissions-Policy must allow camera=(self), got: ${capturedHeaders['Permissions-Policy']}`
    );
    console.log('✔ PASS: Camera permission is allowed for (self) in Permissions-Policy');

    // -------------------------------------------------------------------------
    // PRELIMINARY TEST: Database Table Verification
    // -------------------------------------------------------------------------
    console.log('\n--- PRELIMINARY: Persistent student_verification_sessions Schema ---');
    const [svsColumns] = await db.query('DESCRIBE student_verification_sessions');
    const columnNames = svsColumns.map(c => c.Field);
    const requiredCols = [
      'Session_ID', 'Verification_ID', 'Nonce', 'Student_Name',
      'Student_Number', 'Room_Number', 'PC_Number', 'Issued_At',
      'Expires_At', 'Used_At'
    ];
    for (const reqCol of requiredCols) {
      assert.ok(columnNames.includes(reqCol), `student_verification_sessions must have column ${reqCol}`);
    }
    console.log('✔ PASS: student_verification_sessions table verified with all required columns');

    // -------------------------------------------------------------------------
    // PRELIMINARY TEST: QR Payload Decoding & Parsing
    // -------------------------------------------------------------------------
    console.log('\n--- PRELIMINARY: Student ID QR Decoding & Parsing ---');
    assert.strictEqual(studentVerificationService.parseStudentIDQR('2022-109842|DELA CRUZ, JUAN M.').studentNumber, '2022-109842');
    assert.strictEqual(studentVerificationService.parseStudentIDQR('MARIA CLARA SANTOS|2021-300451').studentNumber, '2021-300451');
    assert.strictEqual(studentVerificationService.parseStudentIDQR(JSON.stringify({ studentNumber: '2023-400122', studentName: 'Andres Bonifacio' })).studentName, 'Andres Bonifacio');
    assert.strictEqual(studentVerificationService.parseStudentIDQR('Student Number: 2020-500789\nName: Jose Rizal').studentNumber, '2020-500789');
    assert.strictEqual(studentVerificationService.parseStudentIDQR('https://portal.bulsu.edu.ph/verify?id=2024-998877&name=Emilio%20Aguinaldo').studentName, 'Emilio Aguinaldo');
    // BulSU Official Physical Student ID QR structure (verified with fake test values)
    const bulsuActualFormat = 'Student No.: 2024109988\nFull Name: JUAN P. DELA CRUZ\nProgram: Bachelor of Science in Information Technology';
    const parsedBulSU = studentVerificationService.parseStudentIDQR(bulsuActualFormat);
    assert.ok(parsedBulSU, 'BulSU actual QR payload format must parse successfully');
    assert.strictEqual(parsedBulSU.studentNumber, '2024109988', 'studentNumber must be extracted correctly');
    assert.strictEqual(parsedBulSU.studentName, 'JUAN P. DELA CRUZ', 'studentName must be extracted correctly');
    console.log('✔ PASS: Multiple QR payload formats cleanly decoded (including BulSU Student No.: / Full Name: format)');

    // Ensure Room 204 exists for tests
    const [existingRooms] = await db.query("SELECT Room_ID FROM laboratories WHERE Room_Number = '204'");
    if (existingRooms.length === 0) {
      await db.query("INSERT INTO laboratories (Room_Number, Building) VALUES ('204', 'IT Building')");
    }

    console.log('\n================================================================');
    console.log('🛡️ EXECUTING 12 MANDATORY TEST SCENARIOS');
    console.log('================================================================');

    // -------------------------------------------------------------------------
    // TEST 1: Valid Camera / Image QR Flow
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Valid Camera / Image QR Flow ---');
    const test1Verify = await studentVerificationService.verifyStudentIDPayload({
      qrData: '2022-100234|DELA CRUZ, JUAN M.',
      roomNumber: '204',
      pcNumber: '1'
    });
    assert.strictEqual(test1Verify.status, 200, 'Valid Student ID scan must yield 200');
    assert.strictEqual(test1Verify.data.studentName, 'DELA CRUZ, JUAN M.');
    assert.strictEqual(test1Verify.data.studentNumber, '2022-100234');
    assert.ok(test1Verify.data.verificationToken, 'Verification token must be generated');
    assert.ok(test1Verify.data.verificationId, 'Verification ID must be present');

    // Verify session was inserted into persistent MySQL table
    const [persisted1] = await studentVerificationRepository.findSessionByVerificationId(test1Verify.data.verificationId);
    assert.strictEqual(persisted1.length, 1, 'Verification session must be persisted in database');
    assert.strictEqual(persisted1[0].Student_Number, '2022-100234');
    assert.strictEqual(persisted1[0].Student_Name, 'DELA CRUZ, JUAN M.');
    assert.strictEqual(persisted1[0].Used_At, null, 'Session must initially be unused (Used_At IS NULL)');
    console.log('✔ PASS: Test 1 - Camera/image QR decoded and persistent session created');

    // -------------------------------------------------------------------------
    // TEST 2: Manual QR String Submission is Rejected / Not Available
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Manual QR String Submission is Rejected / Not Available ---');
    const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'submit-pc-report.html'), 'utf8');
    const jsContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'submit-pc-report.js'), 'utf8');

    // Confirm manual string input UI elements were completely removed
    assert.strictEqual(htmlContent.includes('id="manual-qr-input"'), false, 'Manual QR text input must be removed from HTML');
    assert.strictEqual(htmlContent.includes('id="manual-verify-btn"'), false, 'Manual verify button must be removed from HTML');
    assert.strictEqual(htmlContent.includes('or enter QR string'), false, 'Manual string label must be removed from HTML');
    assert.strictEqual(jsContent.includes('handleManualQRVerification'), false, 'handleManualQRVerification must be removed from JS');

    // Confirm that submitting without valid token (e.g. typing raw text) is rejected
    const unverifiedAttempt = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: 'DELA CRUZ, JUAN M.',
      studentNumber: '2022-100234',
      studentSection: 'BSIT 3A',
      verificationToken: null, // No token generated via camera/image
      components: { 'Keyboard': 'issue' },
      remarks: 'Attempting to report without actual scan'
    });
    assert.strictEqual(unverifiedAttempt.status, 403, 'Submission without verified session token must return 403');
    console.log('✔ PASS: Test 2 - Manual QR string entry UI removed and unverified submission rejected');

    // -------------------------------------------------------------------------
    // TEST 3: Valid Verification Session Submits Successfully
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Valid Verification Session Submits Successfully ---');
    const test3Submit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: test1Verify.data.studentName,
      studentNumber: test1Verify.data.studentNumber,
      studentSection: 'BSIT 3A',
      verificationToken: test1Verify.data.verificationToken,
      components: { 'Keyboard': 'issue' },
      remarks: 'Spacebar key sticking intermittently'
    });
    assert.strictEqual(test3Submit.status, 200, 'Report submission with valid session must return 200');
    assert.ok(test3Submit.data.ticketId, 'Assigned ticket ID must be returned');

    // Verify session is now atomically marked used in database
    const [persistedUsed] = await studentVerificationRepository.findSessionByVerificationId(test1Verify.data.verificationId);
    assert.ok(persistedUsed[0].Used_At !== null, 'Session Used_At must be stamped in database');
    console.log('✔ PASS: Test 3 - Valid verification session submitted and marked used in DB');

    // -------------------------------------------------------------------------
    // TEST 4: Modified Student Name Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Modified Student Name Rejected ---');
    const test4TokenObj = await studentVerificationService.createCaptureToken('2022-100234', 'DELA CRUZ, JUAN M.', '204', '1');
    const test4Submit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: 'TAMPERED_NAME', // Altered student name
      studentNumber: '2022-100234',
      studentSection: 'BSIT 3A',
      verificationToken: test4TokenObj.token,
      components: { 'Keyboard': 'issue' },
      remarks: 'Attempting to submit with altered name'
    });
    assert.strictEqual(test4Submit.status, 403, 'Modified student name must be rejected with HTTP 403');
    assert.ok(test4Submit.error.includes('credentials do not match'), 'Error message must state credential mismatch');
    console.log('✔ PASS: Test 4 - Modified student name rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 5: Modified Student Number Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Modified Student Number Rejected ---');
    const test5TokenObj = await studentVerificationService.createCaptureToken('2022-100234', 'DELA CRUZ, JUAN M.', '204', '1');
    const test5Submit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: 'DELA CRUZ, JUAN M.',
      studentNumber: '2099-000000', // Altered student number
      studentSection: 'BSIT 3A',
      verificationToken: test5TokenObj.token,
      components: { 'Keyboard': 'issue' },
      remarks: 'Attempting to submit with altered number'
    });
    assert.strictEqual(test5Submit.status, 403, 'Modified student number must be rejected with HTTP 403');
    assert.ok(test5Submit.error.includes('credentials do not match'), 'Error message must state credential mismatch');
    console.log('✔ PASS: Test 5 - Modified student number rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 6: Modified Room Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Modified Room Rejected ---');
    const test6TokenObj = await studentVerificationService.createCaptureToken('2022-100234', 'DELA CRUZ, JUAN M.', '204', '1');
    const test6Submit = await maintenanceService.submitReport({
      roomNumber: '205', // Captured for Room 204, submitting for Room 205
      pcNumber: '1',
      studentName: 'DELA CRUZ, JUAN M.',
      studentNumber: '2022-100234',
      studentSection: 'BSIT 3A',
      verificationToken: test6TokenObj.token,
      components: { 'Keyboard': 'issue' },
      remarks: 'Attempting to use Room 204 token on Room 205'
    });
    assert.strictEqual(test6Submit.status, 403, 'Modified room must be rejected with HTTP 403');
    assert.ok(test6Submit.error.includes('workstation mismatch'), 'Error message must cite workstation mismatch');
    console.log('✔ PASS: Test 6 - Modified room rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 7: Modified PC Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Modified PC Rejected ---');
    const test7TokenObj = await studentVerificationService.createCaptureToken('2022-100234', 'DELA CRUZ, JUAN M.', '204', '1');
    const test7Submit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '2', // Captured for PC 1, submitting for PC 2
      studentName: 'DELA CRUZ, JUAN M.',
      studentNumber: '2022-100234',
      studentSection: 'BSIT 3A',
      verificationToken: test7TokenObj.token,
      components: { 'Keyboard': 'issue' },
      remarks: 'Attempting to use PC 1 token on PC 2'
    });
    assert.strictEqual(test7Submit.status, 403, 'Modified PC must be rejected with HTTP 403');
    assert.ok(test7Submit.error.includes('workstation mismatch'), 'Error message must cite workstation mismatch');
    console.log('✔ PASS: Test 7 - Modified PC rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 8: Expired Session Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Expired Session Rejected ---');
    const expiredTimestamp = Date.now() - (15 * 60 * 1000); // 15 mins ago (> 10m TTL)
    const test8TokenObj = await studentVerificationService.createCaptureToken(
      '2022-100234',
      'DELA CRUZ, JUAN M.',
      '204',
      '1',
      expiredTimestamp
    );
    const test8Submit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: 'DELA CRUZ, JUAN M.',
      studentNumber: '2022-100234',
      studentSection: 'BSIT 3A',
      verificationToken: test8TokenObj.token,
      components: { 'Keyboard': 'issue' },
      remarks: 'Attempting submission with expired session'
    });
    assert.strictEqual(test8Submit.status, 403, 'Expired session must be rejected with HTTP 403');
    assert.ok(test8Submit.error.includes('expired'), 'Error message must state session expired');
    console.log('✔ PASS: Test 8 - Expired session rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 9: Reused Session Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Reused Session Rejected ---');
    const test9Scan = await studentVerificationService.verifyStudentIDPayload({
      qrData: '2022-100234|DELA CRUZ, JUAN M.',
      roomNumber: '204',
      pcNumber: '1'
    });

    // 9A: First submission: succeeds
    const test9SubmitFirst = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: test9Scan.data.studentName,
      studentNumber: test9Scan.data.studentNumber,
      studentSection: 'BSIT 3A',
      verificationToken: test9Scan.data.verificationToken,
      components: { 'Monitor': 'issue' },
      remarks: 'Monitor blinking'
    });
    assert.strictEqual(test9SubmitFirst.status, 200, 'First submission must succeed');

    // 9B: Immediate second submission with exact same token: rejected
    const test9SubmitSecond = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: test9Scan.data.studentName,
      studentNumber: test9Scan.data.studentNumber,
      studentSection: 'BSIT 3A',
      verificationToken: test9Scan.data.verificationToken,
      components: { 'Monitor': 'issue' },
      remarks: 'Replaying token in same process'
    });
    assert.strictEqual(test9SubmitSecond.status, 403, 'Reused session must be rejected with HTTP 403');
    assert.ok(test9SubmitSecond.error.includes('already been used'), 'Error must indicate session already used');
    console.log('✔ PASS: Test 9 - Reused session rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 10: Server/Process Restart Does Not Make Used Session Reusable
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Server/Process Restart Does Not Make Used Session Reusable ---');
    // Simulate a total server restart:
    // 1. Check that database permanently retains Used_At
    const [dbSessionCheck] = await studentVerificationRepository.findSessionByVerificationId(test9Scan.data.verificationId);
    assert.ok(dbSessionCheck[0].Used_At !== null, 'Used_At must be persisted in database');

    // 2. Invoke verifyCaptureToken directly with no memory cache dependency
    const postRestartVerify = await studentVerificationService.verifyCaptureToken(
      test9Scan.data.verificationToken,
      test9Scan.data.studentNumber,
      test9Scan.data.studentName,
      '204',
      '1'
    );
    assert.strictEqual(postRestartVerify.valid, false, 'Persistent DB check must reject used token across process restarts');
    assert.ok(postRestartVerify.error.includes('already been used'), 'Error must specify session already used');

    // 3. Attempt submitReport as if a new server instance handled the request
    const postRestartSubmit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: test9Scan.data.studentName,
      studentNumber: test9Scan.data.studentNumber,
      studentSection: 'BSIT 3A',
      verificationToken: test9Scan.data.verificationToken,
      components: { 'Monitor': 'issue' },
      remarks: 'Replay after simulated server restart'
    });
    assert.strictEqual(postRestartSubmit.status, 403, 'Restarted process must still reject used session');
    assert.ok(postRestartSubmit.error.includes('already been used'), 'Error must state session already used');
    console.log('✔ PASS: Test 10 - Server/process restart does not allow replay of consumed verification sessions');

    // -------------------------------------------------------------------------
    // TEST 11: Direct /api/reports/submit Without Verification Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Direct /api/reports/submit Without Verification Rejected ---');
    const directApiCall = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: 'Direct API Attacker',
      studentSection: 'BSIT 3A',
      components: { 'PC/Laptop': 'issue' },
      remarks: 'Bypassing verification step completely'
    });
    assert.strictEqual(directApiCall.status, 403, 'Direct submission without token must be rejected with HTTP 403');
    assert.ok(directApiCall.error.includes('verification token is missing'), 'Error must indicate token is missing');
    console.log('✔ PASS: Test 11 - Direct API submission rejected with HTTP 403');

    // -------------------------------------------------------------------------
    // TEST 12: Existing PC Report Functionality Still Passes
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: Existing PC Report Functionality Still Passes ---');
    // 12A: Section can be manually entered and freely updated
    const test12Scan = await studentVerificationService.verifyStudentIDPayload({
      qrData: '2023-778899|SANTOS, CLARA P.',
      roomNumber: '204',
      pcNumber: '1'
    });
    const sectionManual = 'BSIT 3-A';
    const test12Submit = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: test12Scan.data.studentName,
      studentNumber: test12Scan.data.studentNumber,
      studentSection: sectionManual,
      verificationToken: test12Scan.data.verificationToken,
      components: { 'System Unit': 'issue' },
      remarks: 'System unit power button broken'
    });
    assert.strictEqual(test12Submit.status, 200);

    // Verify database record has manually entered section and student number
    const [savedRecord] = await db.query(
      "SELECT Student_Name, Student_Number, Issue_Description FROM maintenance WHERE Student_Number = ? ORDER BY Report_ID DESC LIMIT 1",
      ['2023-778899']
    );
    assert.strictEqual(savedRecord[0].Student_Name, 'SANTOS, CLARA P.');
    assert.strictEqual(savedRecord[0].Student_Number, '2023-778899');
    assert.ok(savedRecord[0].Issue_Description.includes(`[Program & Section: ${sectionManual}]`), 'Manually entered section must be saved');

    // 12B: Deduplication works (another report for System Unit links to existing issue)
    const test12ScanB = await studentVerificationService.verifyStudentIDPayload({
      qrData: '2024-554433|DELFIN, PEDRO R.',
      roomNumber: '204',
      pcNumber: '1'
    });
    const test12SubmitB = await maintenanceService.submitReport({
      roomNumber: '204',
      pcNumber: '1',
      studentName: test12ScanB.data.studentName,
      studentNumber: test12ScanB.data.studentNumber,
      studentSection: 'BSIT 3-B',
      verificationToken: test12ScanB.data.verificationToken,
      components: { 'System Unit': 'issue' },
      remarks: 'Also reporting power button issue'
    });
    assert.strictEqual(test12SubmitB.status, 200);

    const [allIssues] = await maintenanceRepository.findAllMaintenanceIssues();
    const systemIssues = allIssues.filter(i => i.Room_Number === '204' && i.PC_Number === '1' && i.Issue_Type === 'System Unit' && i.Status !== 'Resolved');
    assert.strictEqual(systemIssues.length, 1, 'Deduplication must maintain 1 active Maintenance Issue');
    assert.ok(systemIssues[0].Report_Count >= 2, 'Report_Count must reflect corroborating reports');
    assert.strictEqual(systemIssues[0].Priority_Level, 'High', 'System Unit priority must be High');

    // 12C: PC condition is Under Maintenance
    const [pcCheck] = await db.query('SELECT Condition_Status FROM lab_units WHERE PC_ID = ?', [systemIssues[0].PC_ID]);
    assert.strictEqual(pcCheck[0].Condition_Status, 'Under Maintenance', 'PC Condition must be Under Maintenance');

    // 12D: Security audit logs recorded
    const [auditRows] = await db.query("SELECT * FROM audit_logs WHERE Action = 'STUDENT_ID_QR_CAPTURE' ORDER BY Log_ID DESC LIMIT 1");
    assert.ok(auditRows.length > 0, 'Audit log must record STUDENT_ID_QR_CAPTURE');

    const [auditSubmits] = await db.query("SELECT * FROM audit_logs WHERE Action = 'SUBMIT_PC_REPORT' ORDER BY Log_ID DESC LIMIT 1");
    assert.ok(auditSubmits.length > 0, 'Audit log must record SUBMIT_PC_REPORT');
    console.log('✔ PASS: Test 12 - Existing PC report functionality (manual section, deduplication, escalation, audit) preserved');

    // -------------------------------------------------------------------------
    // Cleanup test records
    // -------------------------------------------------------------------------
    const [cleanupIssues] = await db.query("SELECT Issue_ID FROM maintenance_issues WHERE PC_ID = ?", [systemIssues[0].PC_ID]);
    for (const row of cleanupIssues) {
      await db.query("DELETE FROM maintenance WHERE Maintenance_Issue_ID = ?", [row.Issue_ID]);
      await db.query("DELETE FROM maintenance_issues WHERE Issue_ID = ?", [row.Issue_ID]);
    }
    await db.query("DELETE FROM student_verification_sessions WHERE Student_Number IN ('2022-100234', '2023-778899', '2024-554433')");

    console.log('\n================================================================');
    console.log('🎉 ALL 12 MANDATORY TEST SCENARIOS PASSED 100%!');
    console.log('================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
})();
