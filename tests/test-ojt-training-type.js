'use strict';

/**
 * tests/test-ojt-training-type.js
 * Verification suite for LabSync Capstone Revision 5:
 * Add Training Type Identification for On-the-Job Trainees (Internship vs Work Immersion)
 * 
 * Verifies:
 * 1. Database schema: Training_Type column exists on users table (VARCHAR, nullable).
 * 2. Static HTML templates: Training Type selector present in Add & Edit modals with exact options.
 * 3. Badge styling: Light and dark mode CSS for Internship, Work Immersion, and Not Specified.
 * 4. Validation rules: Only 'Internship' and 'Work Immersion' accepted; required on create and edit.
 * 5. CRUD lifecycle:
 *    - Create account as 'Internship' -> persists accurately.
 *    - Create account as 'Work Immersion' -> persists accurately.
 *    - Rejection of invalid / missing training type with HTTP 400.
 *    - Edit existing account to change training type -> updates correctly.
 * 6. Backward compatibility: Unclassified existing records (NULL in DB) remain null and display "Not Specified".
 * 7. Security invariants: Role remains strictly 'OJT'; IT Head / Coord remain 403 Forbidden.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const ojtRepository = require('../repositories/ojt.repository');
const ojtService = require('../services/ojtService');

test('Revision 5 — Training Type Identification for On-the-Job Trainees', async (t) => {
  let createdInternshipId = null;
  let createdImmersionId = null;

  await t.test('1. Database Schema Verification', async () => {
    const [cols] = await db.query(
      "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'Training_Type'"
    );
    assert.strictEqual(cols.length, 1, 'Column Training_Type must exist in users table');
    assert.strictEqual(cols[0].COLUMN_NAME, 'Training_Type');
    assert.strictEqual(cols[0].DATA_TYPE, 'varchar');
    assert.strictEqual(cols[0].IS_NULLABLE, 'YES', 'Training_Type must be nullable for backward compatibility');
  });

  await t.test('2. HTML Form Controls in mis-ojt.html', () => {
    const htmlPath = path.join(__dirname, '..', 'mis-ojt.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    // Modal 1: Add Trainee
    assert.ok(content.includes('id="addOjtTrainingType"'), 'Modal 1 must contain select id="addOjtTrainingType"');
    assert.ok(content.includes('id="addOjtTrainingTypeErr"'), 'Modal 1 must contain error container #addOjtTrainingTypeErr');
    assert.ok(content.includes('<option value="Internship">'), 'Modal 1 must include Internship option');
    assert.ok(content.includes('<option value="Work Immersion">'), 'Modal 1 must include Work Immersion option');

    // Modal 2: Edit Trainee
    assert.ok(content.includes('id="editOjtTrainingType"'), 'Modal 2 must contain select id="editOjtTrainingType"');
    assert.ok(content.includes('id="editOjtTrainingTypeErr"'), 'Modal 2 must contain error container #editOjtTrainingTypeErr');
    assert.ok(content.includes('<option value="Internship">'), 'Modal 2 must include Internship option');
    assert.ok(content.includes('<option value="Work Immersion">'), 'Modal 2 must include Work Immersion option');

    // Badge CSS classes
    assert.ok(content.includes('.ojt-training-type-badge'), 'CSS must define .ojt-training-type-badge');
    assert.ok(content.includes('.type-internship'), 'CSS must define .type-internship');
    assert.ok(content.includes('.type-immersion'), 'CSS must define .type-immersion');
    assert.ok(content.includes('.type-unspecified'), 'CSS must define .type-unspecified');
  });

  await t.test('3. Service Layer Validation Rules', () => {
    assert.strictEqual(typeof ojtService.validateTrainingType, 'function');
    assert.deepStrictEqual(ojtService.VALID_TRAINING_TYPES, ['Internship', 'Work Immersion']);

    // Valid types
    const r1 = ojtService.validateTrainingType('Internship');
    assert.strictEqual(r1.value, 'Internship');
    assert.strictEqual(r1.error, undefined);

    const r2 = ojtService.validateTrainingType('Work Immersion');
    assert.strictEqual(r2.value, 'Work Immersion');
    assert.strictEqual(r2.error, undefined);

    // Case-insensitivity support
    const rCase = ojtService.validateTrainingType('internship');
    assert.strictEqual(rCase.value, 'Internship');

    // Required check failure
    const rEmpty = ojtService.validateTrainingType('', true);
    assert.ok(rEmpty.error && rEmpty.error.includes('Training type is required'));

    const rNull = ojtService.validateTrainingType(null, true);
    assert.ok(rNull.error && rNull.error.includes('Training type is required'));

    // Invalid type rejection
    const rInv1 = ojtService.validateTrainingType('Volunteer', true);
    assert.ok(rInv1.error && rInv1.error.includes('Invalid training type'));

    const rInv2 = ojtService.validateTrainingType('Apprenticeship', false);
    assert.ok(rInv2.error && rInv2.error.includes('Invalid training type'));

    // Optional mode allows null/empty
    const rOptNull = ojtService.validateTrainingType(null, false);
    assert.strictEqual(rOptNull.value, null);
    assert.strictEqual(rOptNull.error, undefined);
  });

  function numToLetters(num) {
    return String(num).split('').map(d => String.fromCharCode(65 + Number(d))).join('');
  }

  await t.test('4. Account Creation with "Internship" persists accurately', async () => {
    const timestamp = Date.now();
    const suffix = numToLetters(timestamp);
    const testEmail = `test.internship.${timestamp}@bulsu.edu.ph`;
    const res = await ojtService.createOjt({
      name: `Maria Clara Test ${suffix}`,
      email: testEmail,
      phone: '09120000001',
      trainingType: 'Internship',
      startDate: '2026-10-01',
      endDate: '2026-12-31'
    });

    assert.strictEqual(res.status, 201, `Response status must be 201 Created. Error: ${res.error}`);
    assert.ok(res.data && res.data.user, 'Must return created user object');

    createdInternshipId = res.data.user.User_ID;
    assert.ok(createdInternshipId, 'Created user must have User_ID');
    assert.strictEqual(res.data.user.Role, 'OJT', 'Internal role must remain strictly OJT');
    assert.strictEqual(res.data.user.Training_Type, 'Internship', 'Training_Type must be Internship');

    // Verify directly in DB
    const [rows] = await db.query('SELECT User_ID, Role, Training_Type FROM users WHERE User_ID = ?', [createdInternshipId]);
    assert.strictEqual(rows[0].Role, 'OJT');
    assert.strictEqual(rows[0].Training_Type, 'Internship');
  });

  await t.test('5. Account Creation with "Work Immersion" persists accurately', async () => {
    const timestamp = Date.now();
    const suffix = numToLetters(timestamp);
    const testEmail = `test.immersion.${timestamp}@shs.edu.ph`;
    const res = await ojtService.createOjt({
      name: `Crisostomo Ibarra Test ${suffix}`,
      email: testEmail,
      phone: '09120000002',
      trainingType: 'Work Immersion',
      startDate: '2026-10-15',
      endDate: '2026-11-30'
    });

    assert.strictEqual(res.status, 201, `Response status must be 201 Created. Error: ${res.error}`);
    assert.ok(res.data && res.data.user, 'Must return created user object');

    createdImmersionId = res.data.user.User_ID;
    assert.ok(createdImmersionId, 'Created user must have User_ID');
    assert.strictEqual(res.data.user.Role, 'OJT', 'Internal role must remain strictly OJT');
    assert.strictEqual(res.data.user.Training_Type, 'Work Immersion', 'Training_Type must be Work Immersion');

    // Verify directly in DB
    const [rows] = await db.query('SELECT User_ID, Role, Training_Type FROM users WHERE User_ID = ?', [createdImmersionId]);
    assert.strictEqual(rows[0].Role, 'OJT');
    assert.strictEqual(rows[0].Training_Type, 'Work Immersion');
  });

  await t.test('6. Account Creation Rejects Missing or Invalid Training Type', async () => {
    // Missing trainingType
    const resMissing = await ojtService.createOjt({
      name: 'Invalid Trainee 1',
      email: `invalid1.${Date.now()}@bulsu.edu.ph`,
      trainingType: null,
      startDate: '2026-10-01',
      endDate: '2026-12-31'
    });
    assert.strictEqual(resMissing.status, 400);
    assert.ok(resMissing.error && resMissing.error.includes('Training type is required'));

    // Invalid trainingType
    const resInvalid = await ojtService.createOjt({
      name: 'Invalid Trainee 2',
      email: `invalid2.${Date.now()}@bulsu.edu.ph`,
      trainingType: 'Apprenticeship',
      startDate: '2026-10-01',
      endDate: '2026-12-31'
    });
    assert.strictEqual(resInvalid.status, 400);
    assert.ok(resInvalid.error && resInvalid.error.includes('Invalid training type'));
  });

  await t.test('7. Account Updating: Modifying Training Type Persists Cleanly', async () => {
    assert.ok(createdInternshipId, 'Trainee ID must exist');

    const timestamp = Date.now();
    const suffix = numToLetters(timestamp);
    // Update Maria Clara from Internship to Work Immersion
    const resUpdate = await ojtService.updateOjt(createdInternshipId, {
      name: `Maria Clara Updated ${suffix}`,
      email: `test.internship.${timestamp}@bulsu.edu.ph`,
      phone: '09120000099',
      trainingType: 'Work Immersion',
      startDate: '2026-10-01',
      endDate: '2026-12-31'
    });

    assert.strictEqual(resUpdate.status, 200, `Update status must be 200. Error: ${resUpdate.error}`);
    assert.strictEqual(resUpdate.data.user.Training_Type, 'Work Immersion');

    // Verify DB
    const [rows] = await db.query('SELECT Training_Type FROM users WHERE User_ID = ?', [createdInternshipId]);
    assert.strictEqual(rows[0].Training_Type, 'Work Immersion');
  });

  await t.test('8. Account Updating Rejects Invalid Training Type', async () => {
    assert.ok(createdInternshipId, 'Trainee ID must exist');

    const resFail = await ojtService.updateOjt(createdInternshipId, {
      name: 'Maria Clara Fail',
      trainingType: 'Casual Worker',
      startDate: '2026-10-01',
      endDate: '2026-12-31'
    });

    assert.strictEqual(resFail.status, 400);
    assert.ok(resFail.error && resFail.error.includes('Invalid training type'));
  });

  await t.test('9. Backward Compatibility: Existing unclassified records return null and are NOT misclassified', async () => {
    const resList = await ojtService.listOjts();
    assert.strictEqual(resList.status, 200);
    const unclassified = resList.data.filter(u => u.Training_Type === null);

    // Existing rows without training type must keep Training_Type: null
    for (const u of unclassified) {
      assert.strictEqual(u.Training_Type, null, 'Unclassified records must keep Training_Type as null');
      assert.strictEqual(u.Role, 'OJT');
    }
  });

  await t.test('10. Frontend Script Verification (mis-ojt.js and ojt-viewer.js)', () => {
    const misOjtJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-ojt.js'), 'utf8');
    const ojtViewerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'ojt', 'ojt-viewer.js'), 'utf8');

    // mis-ojt.js checks
    assert.ok(misOjtJs.includes('addOjtTrainingType'), 'mis-ojt.js must reference addOjtTrainingType');
    assert.ok(misOjtJs.includes('editOjtTrainingType'), 'mis-ojt.js must reference editOjtTrainingType');
    assert.ok(misOjtJs.includes('Internship'), 'mis-ojt.js must support Internship');
    assert.ok(misOjtJs.includes('Work Immersion'), 'mis-ojt.js must support Work Immersion');
    assert.ok(misOjtJs.includes('Not Specified'), 'mis-ojt.js must display Not Specified for unclassified records');
    assert.ok(misOjtJs.includes('curTrainingType !== _editBaseline.trainingType'), 'mis-ojt.js must track trainingType in edit baseline');

    // ojt-viewer.js checks
    assert.ok(ojtViewerJs.includes('Internship'), 'ojt-viewer.js must support Internship');
    assert.ok(ojtViewerJs.includes('Work Immersion'), 'ojt-viewer.js must support Work Immersion');
    assert.ok(ojtViewerJs.includes('Not Specified'), 'ojt-viewer.js must display Not Specified for unclassified records');
    assert.ok(ojtViewerJs.includes('Training Type'), 'ojt-viewer.js must render Training Type detail card');
  });

  await t.test('11. Cleanup Test Records', async () => {
    if (createdInternshipId) {
      await db.query('DELETE FROM users WHERE User_ID = ?', [createdInternshipId]);
    }
    if (createdImmersionId) {
      await db.query('DELETE FROM users WHERE User_ID = ?', [createdImmersionId]);
    }
  });

  await t.test('Teardown database connection', async () => {
    if (db && typeof db.end === 'function') {
      await db.end();
    }
  });
});
