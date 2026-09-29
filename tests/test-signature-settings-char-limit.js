'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 Starting Signature Settings Character Limit (50 Chars) Tests');
console.log('================================================================\n');

// 1. Static HTML Verification
console.log('--- 1. Static HTML Verification in master-schedule.html ---');
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'master-schedule.html'), 'utf8');

assert.ok(
  htmlContent.includes('id="programChairInput"') && htmlContent.includes('maxlength="50"'),
  'programChairInput must have maxlength="50"'
);
assert.ok(
  htmlContent.includes('id="campusDeanInput"'),
  'campusDeanInput must exist in master-schedule.html'
);
assert.ok(
  htmlContent.includes('id="chairCharCount"'),
  'chairCharCount character counter element must exist'
);
assert.ok(
  htmlContent.includes('id="deanCharCount"'),
  'deanCharCount character counter element must exist'
);
console.log('✔ PASS: master-schedule.html contains maxlength="50" and character counter badges');

// 2. Client-side Controller & Guard Verification
console.log('\n--- 2. Static Script Verification in signature-settings.modal.js ---');
const jsContent = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'master-schedule', 'modals', 'signature-settings.modal.js'),
  'utf8'
);

assert.ok(jsContent.includes('updateCharCount'), 'signature-settings.modal.js must include updateCharCount helper');
assert.ok(jsContent.includes('chair.length > 50'), 'Must enforce max 50 character limit on program chair before saving');
assert.ok(jsContent.includes('dean.length > 50'), 'Must enforce max 50 character limit on campus dean before saving');
console.log('✔ PASS: signature-settings.modal.js validates 50-char length and updates counters');

// 3. Backend Service Length Enforcement Verification
console.log('\n--- 3. Backend Service Rejection on Exceeded Limit ---');
const settingsService = require('../services/settingsService');

(async () => {
  const adminId = 1;
  const adminRole = 'IT Dept. Head';

  // Test Chair exceeding 50 characters
  const tooLongChair = 'A'.repeat(51);
  const chairRes = await settingsService.updateSettings(
    { program_chair: tooLongChair, campus_dean: 'Dr. Valid Dean' },
    adminId,
    adminRole
  );
  assert.strictEqual(chairRes.status, 400, 'Should reject program chair > 50 characters with status 400');
  assert.ok(chairRes.error.includes('50 characters'), 'Error message should mention 50 characters');
  console.log('✔ PASS: Backend rejected program_chair with 51 characters (status 400)');

  // Test Dean exceeding 50 characters
  const tooLongDean = 'B'.repeat(55);
  const deanRes = await settingsService.updateSettings(
    { program_chair: 'Valid Chair', campus_dean: tooLongDean },
    adminId,
    adminRole
  );
  assert.strictEqual(deanRes.status, 400, 'Should reject campus dean > 50 characters with status 400');
  assert.ok(deanRes.error.includes('50 characters'), 'Error message should mention 50 characters');
  console.log('✔ PASS: Backend rejected campus_dean with 55 characters (status 400)');

  // Test Valid names within 50 characters
  const validChair = 'ASSOC. PROF. ELENITA T. CAPARIÑO, MSIT';
  const validDean = 'DR. MARICEL BALIGOD, DIT';
  assert.ok(validChair.length <= 50, 'validChair within limit');
  assert.ok(validDean.length <= 50, 'validDean within limit');

  const validRes = await settingsService.updateSettings(
    { program_chair: validChair, campus_dean: validDean },
    adminId,
    adminRole
  );
  assert.strictEqual(validRes.status, 200, 'Valid names within 50 chars must be accepted with 200');
  console.log('✔ PASS: Backend successfully accepted valid names within 50 characters');

  console.log('\n================================================================');
  console.log('🎉 ALL SIGNATURE SETTINGS CHARACTER LIMIT TESTS PASSED!');
  console.log('================================================================');
  process.exit(0);
})().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
