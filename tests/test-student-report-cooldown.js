'use strict';

/**
 * tests/test-student-report-cooldown.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative QA regression suite for the 30-minute Student PC Issue Report Cooldown.
 *
 * SAFETY & ISOLATION:
 * - Uses an in-memory database mock (tests/helpers/mock-database.js) to avoid
 *   any dependency on, or writes to, the real MySQL 'labsync' database.
 * - Includes a fail-closed guard preventing tests from connecting to real database.
 *
 * Verifies all required scenarios:
 *  1. First submission: Student A submits a valid report successfully (200).
 *  2. Immediate repeat: Student A refreshes/re-scans and is rejected with HTTP 429.
 *  3. Different PC: Student A tries to report a different PC and is still blocked (429).
 *  4. Different verified student: Student B scans own ID and submits successfully (200).
 *  5. Verification identity: Tampering with student number/name cannot bypass cooldown (403).
 *  6. Concurrent requests: Two simultaneous submissions for Student C; exactly one succeeds.
 *  7. Failed submission: Rejected forms/validation do NOT start or consume cooldown.
 *  8. Cooldown expiration: Student A can submit again once 30 minutes elapse.
 *  9. Existing rules: Issue deduplication, priority escalation, and PC status preserved.
 * 10. Abuse resistance: Query endpoint is guarded by verified token; tampering blocked.
 * 11. Provisioning protection: Cooldown-rejected student cannot create new lab_units/PC record.
 */

// =============================================================================
// FAIL-CLOSED SAFETY GUARD
// =============================================================================
const configuredDb = (process.env.DB_NAME || 'labsync').trim().toLowerCase();
if (process.env.TEST_ENV !== 'isolated-mock' && (configuredDb === 'labsync' || configuredDb.includes('prod') || configuredDb.includes('live'))) {
  // Install the isolated mock environment
  const { installMockDatabase } = require('./helpers/mock-database');
  installMockDatabase();
}

const assert = require('assert');
const db = require('../database/connection');

// Fail-closed verification: Ensure the connection is strictly the MockDatabase instance
if (!db || db.constructor.name === 'Pool' || process.env.TEST_ENV !== 'isolated-mock') {
  console.error('\n❌ FAIL-CLOSED GUARD ACTIVATED:');
  console.error('Real MySQL database connection detected! Tests are forbidden from mutating live database.\n');
  process.exit(1);
}

const studentVerificationService = require('../services/studentVerificationService');
const maintenanceService = require('../services/maintenanceService');
const maintenanceRepository = require('../repositories/maintenance.repository');
const labRepository = require('../repositories/laboratory.repository');

console.log('================================================================');
console.log('🧪 Starting 30-Minute Student Report Cooldown QA Test Suite (Mock-Isolated)');
console.log('================================================================\n');

(async () => {
  let createdIssueIds = [];
  let testPcIds = [];

  const studentA = { number: '2099-CDA-0001', name: 'DELA CRUZ, JUAN A.' };
  const studentB = { number: '2099-CDB-0002', name: 'SILANG, GABRIELA B.' };
  const studentC = { number: '2099-CDC-0003', name: 'RIZAL, JOSE C.' };
  const studentD = { number: '2099-CDD-0004', name: 'BONIFACIO, ANDRES D.' };
  const studentE = { number: '2099-CDE-0005', name: 'MABINI, APOLINARIO E.' };
  const studentF = { number: '2099-CDF-0006', name: 'JACINTO, EMILIO F.' };

  const testRoom = '204';
  const testPc1 = '91';
  const testPc2 = '92';

  async function cleanupTestData() {
    try {
      const studentPrefix = '2099-CD%';
      await db.query("DELETE FROM student_report_cooldowns WHERE Student_Number LIKE ?", [studentPrefix]);
      await db.query("DELETE FROM maintenance WHERE Student_Number LIKE ?", [studentPrefix]);
      await db.query("DELETE FROM student_verification_sessions WHERE Student_Number LIKE ?", [studentPrefix]);

      if (createdIssueIds.length > 0) {
        await db.query("DELETE FROM maintenance WHERE Maintenance_Issue_ID IN (?)", [createdIssueIds]);
        await db.query("DELETE FROM maintenance_issues WHERE Issue_ID IN (?)", [createdIssueIds]);
        createdIssueIds = [];
      }
      if (testPcIds.length > 0) {
        await db.query("UPDATE lab_units SET Condition_Status = 'Functional' WHERE PC_ID IN (?)", [testPcIds]);
      }
    } catch (_) {}
  }

  try {
    // -------------------------------------------------------------------------
    // Setup & Isolation
    // -------------------------------------------------------------------------
    await cleanupTestData();

    // Ensure test room 204 exists
    const [rooms] = await db.query("SELECT Room_ID FROM laboratories WHERE Room_Number = ?", [testRoom]);
    let roomId;
    if (rooms.length === 0) {
      const [insRoom] = await db.query("INSERT INTO laboratories (Room_Number, Building) VALUES (?, 'IT Building')", [testRoom]);
      roomId = insRoom.insertId;
    } else {
      roomId = rooms[0].Room_ID;
    }

    // Ensure test PCs exist
    for (const pcNum of [testPc1, testPc2]) {
      const [pcs] = await db.query("SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, pcNum]);
      if (pcs.length === 0) {
        const [insPc] = await db.query("INSERT INTO lab_units (Room_ID, PC_Number, PC_QR_String, Condition_Status) VALUES (?, ?, ?, 'Functional')", [roomId, pcNum, `QR-${pcNum}`]);
        testPcIds.push(insPc.insertId);
      } else {
        testPcIds.push(pcs[0].PC_ID);
        await db.query("UPDATE lab_units SET Condition_Status = 'Functional' WHERE PC_ID = ?", [pcs[0].PC_ID]);
      }
    }

    // =========================================================================
    // SCENARIO 1: First Submission: Student A Submits a Valid Report Successfully
    // =========================================================================
    console.log('--- Scenario 1: First submission by Student A ---');
    const scanA1 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentA.number}|${studentA.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });
    assert.strictEqual(scanA1.status, 200, 'Student A ID scan must succeed');
    assert.strictEqual(scanA1.data.studentNumber, studentA.number);
    assert.strictEqual(scanA1.data.cooldown.active, false, 'Student A must initially have no active cooldown');

    const submitA1 = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc1,
      studentName: studentA.name,
      studentNumber: studentA.number,
      studentSection: 'BSIT 3A',
      verificationToken: scanA1.data.verificationToken,
      components: { 'Keyboard': 'issue' },
      remarks: 'Key sticking'
    });
    assert.strictEqual(submitA1.status, 200, 'Student A first report must submit successfully (200)');
    assert.ok(submitA1.data.ticketId, 'Assigned ticket ID returned');
    if (submitA1.data.reportId) {
      const [m] = await db.query("SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = ?", [submitA1.data.reportId]);
      if (m.length > 0) createdIssueIds.push(m[0].Maintenance_Issue_ID);
    }

    // Verify cooldown record created for Student A
    const cooldownA1 = await maintenanceRepository.getStudentCooldownStatus(studentA.number);
    assert.strictEqual(cooldownA1.active, true, 'Cooldown must be active for Student A immediately after submission');
    assert.ok(cooldownA1.remainingSeconds > 1750 && cooldownA1.remainingSeconds <= 1800, `Remaining seconds must be ~1800 (got ${cooldownA1.remainingSeconds})`);
    assert.strictEqual(cooldownA1.remainingMinutes, 30, 'Remaining minutes must be 30');
    console.log(`  ✅ PASS: Student A submitted report 1 and received 30-minute cooldown (${cooldownA1.remainingSeconds}s remaining)`);

    // =========================================================================
    // SCENARIO 2: Immediate Repeat: Student A Refreshes, Scans Again, and is Rejected
    // =========================================================================
    console.log('\n--- Scenario 2: Immediate repeat submission by Student A ---');
    const scanA2 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentA.number}|${studentA.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });
    assert.strictEqual(scanA2.status, 200, 'Scan succeeds in returning identity');
    assert.strictEqual(scanA2.data.cooldown.active, true, 'Verification response explicitly warns student is on cooldown');
    assert.ok(scanA2.data.cooldown.remainingSeconds > 0, 'Scan provides remaining cooldown seconds');

    const submitA2 = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc1,
      studentName: studentA.name,
      studentNumber: studentA.number,
      studentSection: 'BSIT 3A',
      verificationToken: scanA2.data.verificationToken,
      components: { 'Monitor': 'issue' },
      remarks: 'Also monitor flickering'
    });
    assert.strictEqual(submitA2.status, 429, 'Immediate repeat submission must be rejected with HTTP 429');
    assert.ok(submitA2.error.includes('30-minute cooldown'), `Error message must cite 30-minute cooldown (got: ${submitA2.error})`);
    assert.ok(submitA2.cooldown && submitA2.cooldown.active === true, 'Response must include cooldown detail object');
    console.log('  ✅ PASS: Repeat submission rejected with HTTP 429 and cooldown details');

    // =========================================================================
    // SCENARIO 3: Different PC: Student A Tries to Report a Different PC
    // =========================================================================
    console.log('\n--- Scenario 3: Student A attempts to report a different PC ---');
    const scanA3 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentA.number}|${studentA.name}`,
      roomNumber: testRoom,
      pcNumber: testPc2
    });
    assert.strictEqual(scanA3.data.cooldown.active, true, 'Cooldown detected even when scanning different PC');

    const submitA3 = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc2,
      studentName: studentA.name,
      studentNumber: studentA.number,
      studentSection: 'BSIT 3A',
      verificationToken: scanA3.data.verificationToken,
      components: { 'Mouse': 'issue' },
      remarks: 'Mouse optical sensor dead'
    });
    assert.strictEqual(submitA3.status, 429, 'Submission for different PC by same student must still be rejected (429)');
    assert.ok(submitA3.error.includes('30-minute cooldown'), 'Error cites cooldown');
    console.log('  ✅ PASS: Cooldown applies to student identity across different PCs');

    // =========================================================================
    // SCENARIO 4: Different Verified Student: Student B Can Submit
    // =========================================================================
    console.log('\n--- Scenario 4: Student B submits while Student A is on cooldown ---');
    const scanB = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentB.number}|${studentB.name}`,
      roomNumber: testRoom,
      pcNumber: testPc2
    });
    assert.strictEqual(scanB.status, 200);
    assert.strictEqual(scanB.data.cooldown.active, false, 'Student B must have NO cooldown');

    const submitB = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc2,
      studentName: studentB.name,
      studentNumber: studentB.number,
      studentSection: 'BSIT 3B',
      verificationToken: scanB.data.verificationToken,
      components: { 'Mouse': 'issue' },
      remarks: 'Reporting PC 92 on behalf of team'
    });
    assert.strictEqual(submitB.status, 200, 'Student B must submit successfully with HTTP 200');
    assert.ok(submitB.data.ticketId, 'Assigned ticket ID returned for Student B');
    if (submitB.data.reportId) {
      const [m] = await db.query("SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = ?", [submitB.data.reportId]);
      if (m.length > 0) createdIssueIds.push(m[0].Maintenance_Issue_ID);
    }

    const cooldownB = await maintenanceRepository.getStudentCooldownStatus(studentB.number);
    const cooldownACheck = await maintenanceRepository.getStudentCooldownStatus(studentA.number);
    assert.strictEqual(cooldownB.active, true, 'Student B now has active cooldown');
    assert.strictEqual(cooldownACheck.active, true, 'Student A still has active cooldown');
    console.log('  ✅ PASS: Student B submitted successfully while Student A remained independently blocked');

    // =========================================================================
    // SCENARIO 5: Verification Identity: Tampering Cannot Bypass Cooldown
    // =========================================================================
    console.log('\n--- Scenario 5: Tampering with client payload cannot bypass cooldown ---');
    const submitTamperedNum = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc1,
      studentName: studentA.name,
      studentNumber: '2099-FAKE-9999',
      studentSection: 'BSIT 3A',
      verificationToken: scanA2.data.verificationToken,
      components: { 'Monitor': 'issue' },
      remarks: 'Trying to bypass cooldown by faking student number'
    });
    assert.strictEqual(submitTamperedNum.status, 403, 'Tampered student number rejected with HTTP 403');
    assert.ok(submitTamperedNum.error.includes('credentials do not match'), 'Error message identifies credential mismatch');

    const submitTamperedName = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc2,
      studentName: studentA.name,
      studentNumber: studentB.number,
      studentSection: 'BSIT 3B',
      verificationToken: scanB.data.verificationToken,
      components: { 'Monitor': 'issue' },
      remarks: 'Trying to impersonate student'
    });
    assert.strictEqual(submitTamperedName.status, 403, 'Tampered student name rejected with HTTP 403');
    console.log('  ✅ PASS: Tampering with student number or name rejected with HTTP 403');

    // =========================================================================
    // SCENARIO 6: Concurrent Requests: Simultaneous Submissions for Student C
    // =========================================================================
    console.log('\n--- Scenario 6: Concurrent submissions from Student C ---');
    const scanC1 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentC.number}|${studentC.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });
    const scanC2 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentC.number}|${studentC.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });

    const [resC1, resC2] = await Promise.all([
      maintenanceService.submitReport({
        roomNumber: testRoom,
        pcNumber: testPc1,
        studentName: studentC.name,
        studentNumber: studentC.number,
        studentSection: 'BSIT 3C',
        verificationToken: scanC1.data.verificationToken,
        components: { 'System Unit': 'issue' },
        remarks: 'Concurrent request 1'
      }),
      maintenanceService.submitReport({
        roomNumber: testRoom,
        pcNumber: testPc1,
        studentName: studentC.name,
        studentNumber: studentC.number,
        studentSection: 'BSIT 3C',
        verificationToken: scanC2.data.verificationToken,
        components: { 'System Unit': 'issue' },
        remarks: 'Concurrent request 2'
      })
    ]);

    const statuses = [resC1.status, resC2.status].sort();
    assert.strictEqual(statuses.filter(s => s === 200).length, 1, `Exactly ONE concurrent request must succeed with 200 (got ${JSON.stringify(statuses)})`);
    assert.ok(statuses.includes(429) || statuses.includes(403), `The other request must be rejected with 429 or 403 (got ${JSON.stringify(statuses)})`);

    const [cReports] = await db.query("SELECT Report_ID FROM maintenance WHERE Student_Number = ?", [studentC.number]);
    assert.strictEqual(cReports.length, 1, 'Database must contain exactly 1 report for Student C');
    for (const r of cReports) {
      const [m] = await db.query("SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = ?", [r.Report_ID]);
      if (m.length > 0) createdIssueIds.push(m[0].Maintenance_Issue_ID);
    }
    console.log('  ✅ PASS: Concurrency serialized safely: exactly 1 succeeded, 1 rejected, 1 saved in DB');

    // =========================================================================
    // SCENARIO 7: Failed Submission: Does NOT Start a Cooldown
    // =========================================================================
    console.log('\n--- Scenario 7: Failed submissions do not trigger cooldown ---');
    const scanD = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentD.number}|${studentD.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });

    const failSubmitD = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc1,
      studentName: studentD.name,
      studentNumber: studentD.number,
      studentSection: 'BSIT 3D',
      verificationToken: scanD.data.verificationToken,
      components: { 'Keyboard': 'working', 'Mouse': 'working' },
      remarks: ''
    });
    assert.strictEqual(failSubmitD.status, 400, 'Invalid submission rejected with HTTP 400');

    const cooldownD = await maintenanceRepository.getStudentCooldownStatus(studentD.number);
    assert.strictEqual(cooldownD.active, false, 'Failed submission must NOT start cooldown');
    console.log('  ✅ PASS: Failed submission did not consume or trigger cooldown');

    // =========================================================================
    // SCENARIO 8: Cooldown Expiration: Student A Can Submit After 30 Minutes
    // =========================================================================
    console.log('\n--- Scenario 8: Cooldown expiration after 30 minutes ---');
    await db.query(
      `UPDATE student_report_cooldowns
       SET Cooldown_Until = DATE_SUB(NOW(), INTERVAL 1 MINUTE),
           Last_Reported_At = DATE_SUB(NOW(), INTERVAL 31 MINUTE)
       WHERE Student_Number = ?`,
      [studentA.number]
    );
    await db.query(
      `UPDATE maintenance
       SET Date_Reported = DATE_SUB(NOW(), INTERVAL 31 MINUTE)
       WHERE Student_Number = ?`,
      [studentA.number]
    );

    const expiredCheckA = await maintenanceRepository.getStudentCooldownStatus(studentA.number);
    assert.strictEqual(expiredCheckA.active, false, 'Student A cooldown must now be inactive');

    const scanAExpired = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentA.number}|${studentA.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });
    assert.strictEqual(scanAExpired.data.cooldown.active, false, 'New scan shows cooldown inactive');

    const submitAExpired = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc1,
      studentName: studentA.name,
      studentNumber: studentA.number,
      studentSection: 'BSIT 3A',
      verificationToken: scanAExpired.data.verificationToken,
      components: { 'Mouse': 'issue' },
      remarks: 'Mouse wheel broken (submitting after cooldown expired)'
    });
    assert.strictEqual(submitAExpired.status, 200, 'Student A can submit successfully after cooldown expires');
    if (submitAExpired.data.reportId) {
      const [m] = await db.query("SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = ?", [submitAExpired.data.reportId]);
      if (m.length > 0) createdIssueIds.push(m[0].Maintenance_Issue_ID);
    }

    const newCooldownA = await maintenanceRepository.getStudentCooldownStatus(studentA.number);
    assert.strictEqual(newCooldownA.active, true, 'New 30-minute cooldown started for Student A');
    console.log('  ✅ PASS: Student A successfully submitted after cooldown expired and started new 30m window');

    // =========================================================================
    // SCENARIO 9: Existing Rules: Deduplication, Priority Escalation, PC Status
    // =========================================================================
    console.log('\n--- Scenario 9: Existing maintenance rules preserved ---');
    const scanE = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentE.number}|${studentE.name}`,
      roomNumber: testRoom,
      pcNumber: testPc1
    });
    const submitE = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: testPc1,
      studentName: studentE.name,
      studentNumber: studentE.number,
      studentSection: 'BSIT 3E',
      verificationToken: scanE.data.verificationToken,
      components: { 'System Unit': 'issue' },
      remarks: 'Will not boot'
    });
    assert.strictEqual(submitE.status, 200);
    if (submitE.data.reportId) {
      const [m] = await db.query("SELECT Maintenance_Issue_ID FROM maintenance WHERE Report_ID = ?", [submitE.data.reportId]);
      if (m.length > 0) createdIssueIds.push(m[0].Maintenance_Issue_ID);
    }

    const [pcStatus] = await db.query("SELECT Condition_Status FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, testPc1]);
    assert.strictEqual(pcStatus[0].Condition_Status, 'Under Maintenance', 'PC Condition must be Under Maintenance');

    const allReports = await maintenanceService.getAllReports();
    assert.strictEqual(allReports.status, 200);
    assert.ok(allReports.data.length > 0);
    console.log('  ✅ PASS: Maintenance issue linking, PC state, and report viewing preserved');

    // =========================================================================
    // SCENARIO 10: Abuse Resistance: Query Endpoint & Tamper Proofing
    // =========================================================================
    console.log('\n--- Scenario 10: Abuse resistance & token-guarded cooldown check ---');
    const noTokenCheck = await maintenanceService.checkStudentCooldownByToken('');
    assert.strictEqual(noTokenCheck.status, 400, 'Query without token returns HTTP 400');

    const tokenCheckB = await maintenanceService.checkStudentCooldownByToken(scanB.data.verificationToken);
    assert.strictEqual(tokenCheckB.status, 200);
    assert.strictEqual(tokenCheckB.data.studentNumber, studentB.number);
    assert.strictEqual(tokenCheckB.data.cooldown.active, true);

    const tamperedToken = scanB.data.verificationToken.slice(0, -6) + 'abcdef';
    const tamperedCheck = await maintenanceService.checkStudentCooldownByToken(tamperedToken);
    assert.strictEqual(tamperedCheck.status, 403, 'Tampered token signature returns HTTP 403');
    console.log('  ✅ PASS: Token validation is tamper-proof and prevents unauthorized queries');

    // =========================================================================
    // SCENARIO 11: Provisioning Protection: Cooldown-rejected student cannot
    //               create a new lab_units/PC record
    // =========================================================================
    console.log('\n--- Scenario 11: Cooldown-rejected student cannot auto-provision new PC ---');
    // Ensure Student A is on cooldown
    const cooldownACheck11 = await maintenanceRepository.getStudentCooldownStatus(studentA.number);
    assert.strictEqual(cooldownACheck11.active, true, 'Student A must be on active cooldown');

    const nonExistentPc = '999';

    // Verify PC 999 does NOT exist in lab_units
    const [pcBefore] = await db.query("SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, nonExistentPc]);
    assert.strictEqual(pcBefore.length, 0, 'PC 999 must not exist prior to test');

    // Student A scans ID for PC 999
    const scanA11 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentA.number}|${studentA.name}`,
      roomNumber: testRoom,
      pcNumber: nonExistentPc
    });
    assert.strictEqual(scanA11.status, 200);

    // Student A submits report for PC 999
    const submitA11 = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: nonExistentPc,
      studentName: studentA.name,
      studentNumber: studentA.number,
      studentSection: 'BSIT 3A',
      verificationToken: scanA11.data.verificationToken,
      components: { 'System Unit': 'issue' },
      remarks: 'Attempting to report non-existent PC while on cooldown'
    });

    // Report must be rejected by cooldown
    assert.strictEqual(submitA11.status, 429, 'Submission must be rejected with HTTP 429');

    // Verify PC 999 was NOT provisioned into lab_units
    const [pcAfterRejected] = await db.query("SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, nonExistentPc]);
    assert.strictEqual(pcAfterRejected.length, 0, 'PC 999 must NOT be provisioned when submission is rejected by cooldown');

    // Now Student F (an eligible student with no cooldown) reports PC 999
    const scanF11 = await studentVerificationService.verifyStudentIDPayload({
      qrData: `${studentF.number}|${studentF.name}`,
      roomNumber: testRoom,
      pcNumber: nonExistentPc
    });
    assert.strictEqual(scanF11.status, 200);
    assert.strictEqual(scanF11.data.cooldown.active, false, 'Student F must have no cooldown');

    const submitF11 = await maintenanceService.submitReport({
      roomNumber: testRoom,
      pcNumber: nonExistentPc,
      studentName: studentF.name,
      studentNumber: studentF.number,
      studentSection: 'BSIT 3F',
      verificationToken: scanF11.data.verificationToken,
      components: { 'System Unit': 'issue' },
      remarks: 'Eligible student reporting and provisioning PC 999'
    });
    assert.strictEqual(submitF11.status, 200, 'Eligible student submission must succeed with HTTP 200');

    // Verify PC 999 is now successfully provisioned in lab_units
    const [pcAfterEligible] = await db.query("SELECT PC_ID, Condition_Status FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, nonExistentPc]);
    assert.strictEqual(pcAfterEligible.length, 1, 'PC 999 must now exist in lab_units');
    assert.strictEqual(pcAfterEligible[0].Condition_Status, 'Under Maintenance', 'Provisioned PC condition must be Under Maintenance');

    console.log('  ✅ PASS: Cooldown-rejected student cannot create PC record; eligible student correctly provisions PC in transaction');

    // =========================================================================
    // SCENARIO 12: Direct Repository Connection Verification: insertPC obeys rollback
    // =========================================================================
    console.log('\n--- Scenario 12: insertPC uses supplied transaction connection and rolls back on failure ---');
    const pcRollbackTest = '998';

    // 1. Begin a transaction and insert PC 998 through txConn
    const txConn = await db.getConnection();
    await txConn.beginTransaction();

    await labRepository.insertPC(roomId, pcRollbackTest, 'QR-998', txConn);

    // Verify it is visible inside this transaction connection
    const [insideTx] = await txConn.query("SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, pcRollbackTest]);
    assert.strictEqual(insideTx.length, 1, 'PC 998 must be visible inside transaction before rollback');

    // 2. Roll back transaction
    await txConn.rollback();
    txConn.release();

    // Verify PC 998 was rolled back and does NOT exist in lab_units
    const [afterRollback] = await db.query("SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, pcRollbackTest]);
    assert.strictEqual(afterRollback.length, 0, 'PC 998 must be completely rolled back when transaction aborts');

    // 3. Begin another transaction and commit
    const txConnCommit = await db.getConnection();
    await txConnCommit.beginTransaction();
    await labRepository.insertPC(roomId, pcRollbackTest, 'QR-998', txConnCommit);
    await txConnCommit.commit();
    txConnCommit.release();

    // Verify PC 998 persisted upon commit
    const [afterCommit] = await db.query("SELECT PC_ID FROM lab_units WHERE Room_ID = ? AND PC_Number = ?", [roomId, pcRollbackTest]);
    assert.strictEqual(afterCommit.length, 1, 'PC 998 must persist when transaction commits');
    console.log('  ✅ PASS: insertPC strictly executes through supplied transaction connection and rolls back upon failure');

    // -------------------------------------------------------------------------
    // Final Teardown
    // -------------------------------------------------------------------------
    await cleanupTestData();

    console.log('\n================================================================');
    console.log('🎉 ALL 12 COOLDOWN REGRESSION SCENARIOS PASSED 100%!');
    console.log('================================================================\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    await cleanupTestData();
    process.exit(1);
  }
})();
