'use strict';

/**
 * tests/test-iot-heartbeat-sync.js
 * Verification of self-healing slot state synchronization via IoT Heartbeat.
 */

const assert = require('assert');
const iotService = require('../services/iotService');
const keysService = require('../services/keysService');
const laboratoryService = require('../services/laboratoryService');
const db = require('../database/connection');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Testing IoT Heartbeat Slot State Synchronization');
  console.log('================================================================\n');

  const mockDevice = {
    id: 'ESP32-KeyBox',
    authorizedRooms: ['203', '204']
  };

  // 0. Setup baseline: ensure rooms 203 and 204 are initialized as Present
  await db.query(`UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number IN ('203', '204')`);

  // 1. Send heartbeat where Key 203 is missing/unplugged (hardware says false)
  console.log('--- 1. Testing Heartbeat with Key 203 Absent and Key 204 Present ---');
  const hbRes1 = await iotService.recordHeartbeat({
    deviceId: 'ESP32-KeyBox',
    rooms: ['203', '204'],
    slots: {
      '203': false,
      '204': true
    }
  }, mockDevice);

  assert.strictEqual(hbRes1.status, 200, 'Heartbeat should succeed with status 200');

  // Verify DB state
  const [roomsAfterHb1] = await db.query(
    `SELECT Room_Number, Key_Status, Current_Status FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number ASC`
  );

  const room203_1 = roomsAfterHb1.find(r => String(r.Room_Number) === '203');
  const room204_1 = roomsAfterHb1.find(r => String(r.Room_Number) === '204');

  assert.strictEqual(room203_1.Key_Status, 'Absent', 'Room 203 Key_Status should be Absent in DB');
  assert.strictEqual(room204_1.Key_Status, 'Present', 'Room 204 Key_Status should be Present in DB');
  console.log('✔ Verified DB Key_Status: Room 203 is "Absent", Room 204 is "Present".');

  // Verify getAllKeys service reflects this
  const allKeys1 = await keysService.getAllKeys();
  const key203_1 = allKeys1.data.keys.find(k => String(k.Room_Number) === '203');
  assert.strictEqual(key203_1.deviceOnline, true, 'Room 203 device should be online');
  assert.strictEqual(key203_1.Room_Key_Status, 'Absent', 'Room 203 key status in keysService should be Absent');
  console.log('✔ Verified keysService reports Room 203 key as Absent while deviceOnline = true.');

  // Verify laboratoryService reports room as Borrowed (NOT Available!)
  const allLabs1 = await laboratoryService.getAllLaboratories();
  const lab203_1 = allLabs1.data.find(l => String(l.Room_Number) === '203');
  assert.strictEqual(lab203_1.deviceOnline, true, 'Lab 203 should be online');
  assert.strictEqual(lab203_1.Key_Status, 'Absent', 'Lab 203 Key_Status should be Absent');
  assert.notStrictEqual(lab203_1.Current_Status, 'Available', 'Lab 203 MUST NOT be reported as Available when key is absent!');
  assert.strictEqual(lab203_1.Current_Status, 'Borrowed', 'Lab 203 should be reported as Borrowed');
  console.log('✔ Verified laboratoryService reports Room 203 as "Borrowed" (NOT "Available") when key is missing on boot.');

  // 2. Simulate inserting Key 203 back into the slot (hardware says true)
  console.log('\n--- 2. Testing Heartbeat Reconciliation when Key 203 is Returned ---');
  const hbRes2 = await iotService.recordHeartbeat({
    deviceId: 'ESP32-KeyBox',
    rooms: ['203', '204'],
    slots: {
      '203': true,
      '204': true
    }
  }, mockDevice);

  assert.strictEqual(hbRes2.status, 200, 'Heartbeat should succeed with status 200');

  // Verify DB reconciled back to Present
  const [roomsAfterHb2] = await db.query(
    `SELECT Room_Number, Key_Status FROM laboratories WHERE Room_Number IN ('203', '204') ORDER BY Room_Number ASC`
  );
  const room203_2 = roomsAfterHb2.find(r => String(r.Room_Number) === '203');
  assert.strictEqual(room203_2.Key_Status, 'Present', 'Room 203 Key_Status should be reconciled back to Present');

  // Verify laboratoryService now reports Available
  const allLabs2 = await laboratoryService.getAllLaboratories();
  const lab203_2 = allLabs2.data.find(l => String(l.Room_Number) === '203');
  assert.strictEqual(lab203_2.Key_Status, 'Present', 'Lab 203 Key_Status should be Present');
  assert.strictEqual(lab203_2.Current_Status, 'Available', 'Lab 203 should now be Available');
  console.log('✔ Verified Room 203 successfully reconciled back to "Present" and "Available".');

  // 3. Test backward compatibility: heartbeat without slots object
  console.log('\n--- 3. Testing Backward Compatibility (Heartbeat without slots) ---');
  const hbRes3 = await iotService.recordHeartbeat({
    deviceId: 'ESP32-KeyBox',
    rooms: ['203', '204']
  }, mockDevice);
  assert.strictEqual(hbRes3.status, 200, 'Heartbeat without slots should succeed');
  console.log('✔ Heartbeat without slots payload remains fully backward-compatible.');

  console.log('\n================================================================');
  console.log('🎉 ALL IOT HEARTBEAT SLOT SYNC TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
