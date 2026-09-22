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

  // 1b. Test Returning Key after Unauthorized Removal (Buzzer Alarm Cleared)
  console.log('\n--- 1b. Testing Key Returned After Unauthorized Removal ---');
  const returnUnauthRes = await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '203'
  }, mockDevice);

  assert.strictEqual(returnUnauthRes.status, 200, 'Expected 200 from Key Returned after unauthorized');
  console.log('✔ Key Returned after unauthorized event accepted.');

  // Verify DB occupancy_log record for Key Returned has NULL User_ID
  const [returnUnauthLogs] = await db.query(
    `SELECT * FROM occupancy_log WHERE Room_ID = (SELECT Room_ID FROM laboratories WHERE Room_Number = '203' LIMIT 1) 
     AND Auth_Method = 'Key Returned' ORDER BY Access_Time DESC, Log_ID DESC LIMIT 1`
  );
  assert.ok(returnUnauthLogs.length > 0, 'Expected Key Returned entry in occupancy_log');
  assert.strictEqual(returnUnauthLogs[0].User_ID, null, 'Key returned after unauthorized access must have NULL User_ID');
  console.log('✔ Verified Key Returned after unauthorized entry recorded in occupancy_log with NULL User_ID.');

  // Verify maintenance notification query returns Unidentified Person and Alarm Cleared
  const maintenanceRepo = require('../repositories/maintenance.repository');
  const [notifs] = await maintenanceRepo.findAllNotifications();
  const returnNotif = notifs.find(n => n.id === returnUnauthLogs[0].Log_ID);
  assert.ok(returnNotif, 'Expected notification item for Key Returned');
  assert.strictEqual(returnNotif.description, 'Unidentified Person', 'Expected Unidentified Person');
  assert.strictEqual(returnNotif.detail, 'Alarm Cleared', 'Expected Alarm Cleared');
  console.log('✔ Verified findAllNotifications returns Unidentified Person and Alarm Cleared.');

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

  // Clear existing claims and restore key presence baseline for test
  claimService.clearAllClaims();
  await db.query(`UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number IN ('203', '204')`);

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

  console.log('\n--- 4. Testing Anti-Double-Tapping / Multi-Room Key Claim Prevention ---');
  // 4a. User scans QR and claims Room 204
  const qrFirstScan = await iotService.logOccupancy({
    qrString: testUser.ID_QR_String,
    roomNumber: '203',
    authMethod: 'QR Code'
  }, mockDevice);
  assert.strictEqual(qrFirstScan.status, 200, 'First QR scan should succeed');

  // 4b. User takes Key 204
  await iotService.logOccupancy({
    keyEvent: 'Key Taken',
    roomNumber: '204'
  }, mockDevice);

  // Verify in-memory claim for sibling slot 203 was cleared immediately upon key withdrawal
  const siblingClaim = claimService.getValidClaim('203');
  assert.strictEqual(siblingClaim, null, 'In-memory claims for other slots must be cleared on key withdrawal');

  // 4c. User attempts to scan QR again while still holding Room 204's key
  const doubleTapRes = await iotService.logOccupancy({
    qrString: testUser.ID_QR_String,
    roomNumber: '203',
    authMethod: 'QR Code'
  }, mockDevice);

  assert.strictEqual(doubleTapRes.status, 403, 'Double-tap QR scan must be rejected with 403 Forbidden');
  assert.strictEqual(doubleTapRes.lcdLine1, 'Return Key First', 'LCD Line 1 must instruct Return Key First');
  assert.strictEqual(doubleTapRes.lcdLine2, 'Hold Key RM 204', 'LCD Line 2 must indicate held key Room 204');
  console.log('✔ Anti-double-tap blocked second QR scan: LCD shows "Return Key First / Hold Key RM 204"');

  // 4d. Return Key 204
  await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '204'
  }, mockDevice);
  console.log('✔ Room 204 key returned to slot.');

  // 4e. Now user scans QR code again (should be permitted since no keys are held)
  const qrAfterReturn = await iotService.logOccupancy({
    qrString: testUser.ID_QR_String,
    roomNumber: '203',
    authMethod: 'QR Code'
  }, mockDevice);
  assert.strictEqual(qrAfterReturn.status, 200, 'QR scan after returning key must succeed');
  assert.strictEqual(qrAfterReturn.data.lcdLine1, 'Access Granted!', 'Access Granted! displayed after returning key');
  console.log('✔ QR scan permitted after returning prior key.');

  // Clean up in-memory claims
  claimService.clearAllClaims();

  // Clean up test occupancy_log records
  await db.query(`DELETE FROM occupancy_log WHERE Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT') OR (Auth_Method = 'Key Returned' AND User_ID IS NULL)`);

  console.log('\n================================================================');
  console.log('🎉 ALL IOT SECURITY & PRE-AUTHORIZATION TESTS PASSED!');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
