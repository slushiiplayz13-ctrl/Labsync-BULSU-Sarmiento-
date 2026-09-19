'use strict';

/**
 * tests/test-iot-security-events.js
 * Verification of IoT Security Alerts and QR Multi-Room Pre-Authorization.
 */

const assert = require('assert');
const iotService = require('../services/iotService');
const claimService = require('../services/iot/claim.service');
const db = require('../database/connection');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Testing IoT Security Alerts & QR Pre-Authorization Claims');
  console.log('================================================================\n');

  const mockDevice = {
    id: 'ESP32-KeyBox',
    authorizedRooms: ['203', '204']
  };

  // 1. Test Unauthorized Key Removal Alert
  console.log('--- 1. Testing Unauthorized Key Removal Security Event ---');
  const unauthRes = await iotService.logOccupancy({
    keyEvent: 'Unauthorized Removal',
    roomNumber: '203'
  }, mockDevice);

  assert.strictEqual(unauthRes.status, 200, 'Expected 200 from Unauthorized Removal event');
  assert.strictEqual(unauthRes.data.lcdLine1, 'Security Alert!', 'Expected Security Alert! on LCD Line 1');
  console.log('✔ Unauthorized Removal event accepted with LCD status: Security Alert!');

  // Verify DB occupancy_log record
  const [unauthLogs] = await db.query(
    `SELECT * FROM occupancy_log WHERE Room_ID = (SELECT Room_ID FROM laboratories WHERE Room_Number = '203' LIMIT 1) 
     AND Auth_Method = 'UNAUTHORIZED' ORDER BY Access_Time DESC LIMIT 1`
  );
  assert.ok(unauthLogs.length > 0, 'Expected UNAUTHORIZED entry in occupancy_log');
  console.log('✔ Verified UNAUTHORIZED entry recorded in occupancy_log table.');

  // 2. Test Wrong Key Slot Security Event
  console.log('\n--- 2. Testing Wrong Key Slot Security Event ---');
  const wrongSlotRes = await iotService.logOccupancy({
    keyEvent: 'Wrong Key Slot',
    roomNumber: '204'
  }, mockDevice);

  assert.strictEqual(wrongSlotRes.status, 200, 'Expected 200 from Wrong Key Slot event');
  assert.strictEqual(wrongSlotRes.data.lcdLine1, 'Security Alert!', 'Expected Security Alert! on LCD Line 1');
  console.log('✔ Wrong Key Slot event accepted with LCD status: Security Alert!');

  // Verify DB occupancy_log record
  const [wrongSlotLogs] = await db.query(
    `SELECT * FROM occupancy_log WHERE Room_ID = (SELECT Room_ID FROM laboratories WHERE Room_Number = '204' LIMIT 1) 
     AND Auth_Method = 'WRONG_SLOT' ORDER BY Access_Time DESC LIMIT 1`
  );
  assert.ok(wrongSlotLogs.length > 0, 'Expected WRONG_SLOT entry in occupancy_log');
  console.log('✔ Verified WRONG_SLOT entry recorded in occupancy_log table.');

  // 3. Test QR Multi-Room Pre-Authorization Claim
  console.log('\n--- 3. Testing QR Multi-Room Pre-Authorization Claim ---');
  // Get an active user's QR
  const [users] = await db.query(`SELECT User_ID, Name, ID_QR_String FROM users WHERE ID_QR_String IS NOT NULL LIMIT 1`);
  assert.ok(users.length > 0, 'Expected at least one user with QR in database');
  const testUser = users[0];

  // Clear existing claims
  claimService.clearAllClaims();

  // Simulate QR scan at keybox (sends default room '203')
  const qrRes = await iotService.logOccupancy({
    qrString: testUser.ID_QR_String,
    roomNumber: '203',
    authMethod: 'QR Code'
  }, mockDevice);

  assert.strictEqual(qrRes.status, 200, 'Expected 200 from QR scan verification');
  assert.strictEqual(qrRes.data.lcdLine1, 'Access Granted!', 'Expected Access Granted! on LCD Line 1');
  console.log(`✔ QR Scan verified for user "${testUser.Name}".`);

  // Verify claim was registered for BOTH Room 203 and Room 204
  const claim203 = claimService.getValidClaim('203');
  const claim204 = claimService.getValidClaim('204');

  assert.ok(claim203, 'Claim should exist for Room 203');
  assert.strictEqual(claim203.userId, testUser.User_ID, 'Claim 203 should match user ID');

  assert.ok(claim204, 'Claim should exist for Room 204');
  assert.strictEqual(claim204.userId, testUser.User_ID, 'Claim 204 should match user ID');
  console.log('✔ Verified QR pre-authorization claim applies to all keybox slots (Room 203 & 204).');

  // Simulate taking Key 204
  const keyTakeRes = await iotService.logOccupancy({
    keyEvent: 'Key Taken',
    roomNumber: '204'
  }, mockDevice);

  assert.strictEqual(keyTakeRes.status, 200, 'Expected 200 from Key Taken event');
  assert.strictEqual(keyTakeRes.data.registeredUser, testUser.Name, 'Key Taken should be registered to test user');
  console.log(`✔ Verified Key Taken for Room 204 attributed to "${testUser.Name}".`);

  // Return key to restore DB state
  await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '204'
  }, mockDevice);
  console.log('✔ Room 204 key returned and state cleaned up.');

  // Clean up test occupancy_log records
  await db.query(`DELETE FROM occupancy_log WHERE Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT')`);

  console.log('\n================================================================');
  console.log('🎉 ALL IOT SECURITY & PRE-AUTHORIZATION TESTS PASSED!');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
