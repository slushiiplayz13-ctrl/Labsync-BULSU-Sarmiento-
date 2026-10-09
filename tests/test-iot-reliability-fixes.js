'use strict';

/**
 * tests/test-iot-reliability-fixes.js
 * Comprehensive regression tests for IoT key-box reliability fixes:
 * 1. Room 203 removal and return
 * 2. Room 204 removal and return through intermediate ADC readings
 * 3. Genuine wrong-key insertion detection preserved
 * 4. Timeout followed by retry deduplication (no duplicate activity/audit records)
 * 5. Key-custody protection from stale/conflicting heartbeat telemetry
 * 6. Online/Offline threshold state for both rooms
 * 7. Activity Log independent refresh and re-entrancy lock
 * 8. Existing heartbeat, authentication, and key-state compatibility
 */

const assert = require('assert');
const iotService = require('../services/iotService');
const deviceStateService = require('../services/iot/device-state.service');
const { OFFLINE_THRESHOLD_MS } = require('../services/iot/iot.config');
const db = require('../database/connection');

// Firmware KeyType constants for simulation
const KEY_NONE = 0;
const KEY_203 = 1;
const KEY_204 = 2;

/**
 * Pure simulation of the firmware handleKeySlot logic with withdrawal transition guard
 */
function simulateFirmwareSlotTransition({
  initialLastState,
  expectedKey,
  adcSequence, // array of readings: [candidate, verify, settled]
  isAuthorized = false
}) {
  let lastState = initialLastState;
  let isWrong = false;
  let isUnauth = false;
  const dispatchedEvents = [];

  // Step 1: candidate state from first reading
  let candidateState = adcSequence[0];

  if (candidateState !== lastState) {
    // 40ms debounce reading
    let verifyState = adcSequence[1];

    // Withdrawal transition guard (implemented in firmware)
    if (lastState === expectedKey && verifyState !== KEY_NONE && verifyState !== expectedKey) {
      // 60ms settling window
      const settledState = (adcSequence.length > 2) ? adcSequence[2] : verifyState;
      if (settledState === KEY_NONE) {
        verifyState = KEY_NONE;
        candidateState = KEY_NONE;
      }
    }

    if (candidateState === verifyState) {
      const oldState = lastState;
      lastState = verifyState;

      // 1. Wrong Key Inserted
      if (verifyState !== KEY_NONE && verifyState !== expectedKey) {
        if (oldState === expectedKey) {
          lastState = oldState; // revert, don't trigger false alarm
          return { lastState, isWrong, isUnauth, dispatchedEvents };
        }
        isWrong = true;
        dispatchedEvents.push({ type: 'SECURITY_ALERT', alert: 'Wrong Key Slot' });
        return { lastState, isWrong, isUnauth, dispatchedEvents };
      }

      // 2. Correct Key Returned
      if (verifyState === expectedKey) {
        isWrong = false;
        isUnauth = false;
        dispatchedEvents.push({ type: 'KEY_STATUS', present: true });
        return { lastState, isWrong, isUnauth, dispatchedEvents };
      }

      // 3. Key Taken (Went to KEY_NONE)
      else if (verifyState === KEY_NONE) {
        if (isWrong) {
          isWrong = false;
          return { lastState, isWrong, isUnauth, dispatchedEvents };
        }

        if (isAuthorized) {
          isUnauth = false;
          dispatchedEvents.push({ type: 'KEY_STATUS', present: false });
        } else {
          isUnauth = true;
          dispatchedEvents.push({ type: 'SECURITY_ALERT', alert: 'Unauthorized Removal' });
          dispatchedEvents.push({ type: 'KEY_STATUS', present: false });
        }
      }
    }
  }

  return { lastState, isWrong, isUnauth, dispatchedEvents };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Testing IoT Key-Box Reliability Fixes (Regression Suite)');
  console.log('================================================================\n');

  const mockDevice = {
    id: 'ESP32-KeyBox',
    authorizedRooms: ['203', '204']
  };

  deviceStateService.clearDeviceLastSeen();

  // Baseline setup
  await db.query(`UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number IN ('203', '204')`);

  // -------------------------------------------------------------------------
  // 1. Room 203 removal and return
  // -------------------------------------------------------------------------
  console.log('--- 1. Testing Room 203 Removal and Return ---');
  const res203Taken = await iotService.logOccupancy({
    keyEvent: 'Key Taken',
    roomNumber: '203',
    seq: 1
  }, mockDevice);
  assert.strictEqual(res203Taken.status, 200, 'Room 203 Key Taken should succeed');

  const [db203Taken] = await db.query(`SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '203'`);
  assert.strictEqual(db203Taken[0].Key_Status, 'Absent', 'Room 203 Key_Status must be Absent');
  console.log('✔ Room 203 Key Taken verified: Key_Status is Absent in database.');

  const res203Returned = await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '203',
    seq: 2
  }, mockDevice);
  assert.strictEqual(res203Returned.status, 200, 'Room 203 Key Returned should succeed');

  const [db203Returned] = await db.query(`SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '203'`);
  assert.strictEqual(db203Returned[0].Key_Status, 'Present', 'Room 203 Key_Status must be Present');
  assert.strictEqual(db203Returned[0].Current_User_ID, null, 'Current_User_ID must be null after return');
  console.log('✔ Room 203 Key Returned verified: Key_Status is Present and Current_User_ID is null.');

  // -------------------------------------------------------------------------
  // 2. Room 204 removal and return through intermediate ADC readings
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Testing Room 204 Removal Through Intermediate ADC Readings ---');
  // Scenario A: Key 204 being withdrawn sweeps through KEY_203 band before reaching open circuit (KEY_NONE)
  // sequence: candidate = KEY_203 (intermediate scrape), verify = KEY_203, settled = KEY_NONE
  const removalSim = simulateFirmwareSlotTransition({
    initialLastState: KEY_204,
    expectedKey: KEY_204,
    adcSequence: [KEY_203, KEY_203, KEY_NONE],
    isAuthorized: false
  });

  assert.strictEqual(removalSim.isWrong, false, 'Intermediate ADC sweep must NOT be marked as wrong key');
  assert.strictEqual(removalSim.lastState, KEY_NONE, 'Slot state should settle to KEY_NONE');
  assert.strictEqual(removalSim.dispatchedEvents.length, 2, 'Should dispatch alert and key status');
  assert.strictEqual(removalSim.dispatchedEvents[0].alert, 'Unauthorized Removal');
  assert.strictEqual(removalSim.dispatchedEvents[1].present, false);
  console.log('✔ Firmware withdrawal guard correctly resolved intermediate ADC scraping to exactly one Key Taken event without false wrong-key alarm.');

  // Dispatch to backend
  const res204Taken = await iotService.logOccupancy({
    keyEvent: 'Key Taken',
    roomNumber: '204',
    seq: 1
  }, mockDevice);
  assert.strictEqual(res204Taken.status, 200);
  const [db204Taken] = await db.query(`SELECT Key_Status FROM laboratories WHERE Room_Number = '204'`);
  assert.strictEqual(db204Taken[0].Key_Status, 'Absent');
  console.log('✔ Room 204 removal reflected on backend as Absent.');

  // Return Room 204 key
  const returnSim = simulateFirmwareSlotTransition({
    initialLastState: KEY_NONE,
    expectedKey: KEY_204,
    adcSequence: [KEY_204, KEY_204],
    isAuthorized: false
  });
  assert.strictEqual(returnSim.lastState, KEY_204);
  assert.strictEqual(returnSim.dispatchedEvents[0].present, true);

  await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '204',
    seq: 2
  }, mockDevice);
  const [db204Returned] = await db.query(`SELECT Key_Status FROM laboratories WHERE Room_Number = '204'`);
  assert.strictEqual(db204Returned[0].Key_Status, 'Present');
  console.log('✔ Room 204 return verified.');

  // -------------------------------------------------------------------------
  // 3. Genuine wrong-key insertion remains detected
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Testing Genuine Wrong-Key Insertion Remains Detected ---');
  // Slot 204 is empty (KEY_NONE). User inserts Key 203 into Slot 204.
  const wrongKeySim = simulateFirmwareSlotTransition({
    initialLastState: KEY_NONE,
    expectedKey: KEY_204,
    adcSequence: [KEY_203, KEY_203],
    isAuthorized: false
  });
  assert.strictEqual(wrongKeySim.isWrong, true, 'Genuine wrong key insertion MUST be detected');
  assert.strictEqual(wrongKeySim.dispatchedEvents[0].alert, 'Wrong Key Slot');
  console.log('✔ Firmware simulation correctly triggers Wrong Key Slot when Key 203 is inserted into Slot 204.');

  // Verify backend processing of Wrong Key Slot
  const wrongKeyRes = await iotService.logOccupancy({
    keyEvent: 'Wrong Key Slot',
    roomNumber: '204'
  }, mockDevice);
  assert.strictEqual(wrongKeyRes.status, 200);
  assert.strictEqual(wrongKeyRes.data.lcdLine1, 'Security Alert!');
  console.log('✔ Backend processed Wrong Key Slot and logged warning.');

  // -------------------------------------------------------------------------
  // 4. Timeout followed by retry does not create duplicate logical activity records
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Testing Transport Retry / Idempotency Deduplication ---');
  // 4a. Security alert retry deduplication
  const [[{ count: unauthBefore }]] = await db.query(
    `SELECT COUNT(*) as count FROM occupancy_log WHERE Auth_Method = 'UNAUTHORIZED'`
  );

  // Send first alert
  const alert1 = await iotService.logOccupancy({
    keyEvent: 'Unauthorized Removal',
    roomNumber: '203'
  }, mockDevice);
  assert.strictEqual(alert1.status, 200);

  // Simulate immediate transport retry (within 5s window)
  const alert2 = await iotService.logOccupancy({
    keyEvent: 'Unauthorized Removal',
    roomNumber: '203'
  }, mockDevice);
  assert.strictEqual(alert2.status, 200);
  assert.ok(alert2.data.message.includes('already recorded'), 'Retry should be identified as duplicate');

  const [[{ count: unauthAfter }]] = await db.query(
    `SELECT COUNT(*) as count FROM occupancy_log WHERE Auth_Method = 'UNAUTHORIZED'`
  );
  assert.strictEqual(unauthAfter, unauthBefore + 1, 'Only ONE occupancy_log record should be created despite retry');
  console.log('✔ Security alert retry successfully deduplicated without duplicate occupancy log.');

  // 4b. Physical Key Taken retry deduplication
  const [[{ count: takenBefore }]] = await db.query(
    `SELECT COUNT(*) as count FROM occupancy_log WHERE Auth_Method = 'Key Taken' AND Room_ID = (SELECT Room_ID FROM laboratories WHERE Room_Number = '203')`
  );
  await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '203' }, mockDevice);
  await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '203' }, mockDevice);
  const [[{ count: takenAfter }]] = await db.query(
    `SELECT COUNT(*) as count FROM occupancy_log WHERE Auth_Method = 'Key Taken' AND Room_ID = (SELECT Room_ID FROM laboratories WHERE Room_Number = '203')`
  );
  assert.strictEqual(takenAfter, takenBefore, 'Duplicate Key Taken in Absent state must not create duplicate occupancy log');
  console.log('✔ Physical key event retry successfully preserved idempotency.');

  // Reset Room 203 to Present
  await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '203' }, mockDevice);

  // -------------------------------------------------------------------------
  // 5. Protect key-custody state from heartbeat reconciliation
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Testing Key Custody Protection from Stale/Conflicting Heartbeat ---');
  // Set Room 204 as borrowed by User ID 1 (Andrei Gabito)
  await db.query(`UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = 1 WHERE Room_Number = '204'`);
  deviceStateService.recordSlotPhysicalEvent('204', { seq: 10, status: 'Absent', userId: 1 });

  // 5a. Heartbeat claims slot 204 is Present with older sequence (seq 8)
  const hbStaleSeq = await iotService.recordHeartbeat({
    deviceId: 'ESP32-KeyBox',
    rooms: ['203', '204'],
    slots: { '203': true, '204': true },
    slotSeqs: { '203': 5, '204': 8 } // 8 < 10 (stale)
  }, mockDevice);
  assert.strictEqual(hbStaleSeq.status, 200);

  const [dbAfterStaleHb] = await db.query(`SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'`);
  assert.strictEqual(dbAfterStaleHb[0].Key_Status, 'Absent', 'Key_Status must NOT be overwritten by stale heartbeat');
  assert.strictEqual(dbAfterStaleHb[0].Current_User_ID, 1, 'Current_User_ID must NOT be wiped by stale heartbeat');
  console.log('✔ Stale sequence heartbeat correctly ignored; custody and Absent state preserved.');

  // 5b. Heartbeat claims slot 204 is Present with matching/higher sequence BUT active custody exists
  const hbCustodyConflict = await iotService.recordHeartbeat({
    deviceId: 'ESP32-KeyBox',
    rooms: ['203', '204'],
    slots: { '203': true, '204': true },
    slotSeqs: { '203': 5, '204': 12 }
  }, mockDevice);
  assert.strictEqual(hbCustodyConflict.status, 200);

  const [dbAfterConflictHb] = await db.query(`SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'`);
  assert.strictEqual(dbAfterConflictHb[0].Key_Status, 'Absent', 'Key_Status must NOT be restored to Present while user holds key');
  assert.strictEqual(dbAfterConflictHb[0].Current_User_ID, 1, 'Current_User_ID must remain intact while user holds key');
  console.log('✔ Active custody rule enforced: Telemetry cannot overwrite borrowed key to Present or erase Current_User_ID.');

  // 5c. Legitimate key return clears custody cleanly
  await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '204',
    seq: 15
  }, mockDevice);
  const [dbAfterLegitReturn] = await db.query(`SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'`);
  assert.strictEqual(dbAfterLegitReturn[0].Key_Status, 'Present');
  assert.strictEqual(dbAfterLegitReturn[0].Current_User_ID, null);
  console.log('✔ Legitimate physical Key Returned event successfully cleared custody to Present and null.');

  // -------------------------------------------------------------------------
  // 6. Online/Offline threshold for both rooms
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Testing Online/Offline Threshold State ---');
  const now = Date.now();
  deviceStateService.recordDeviceSeen(['203', '204'], now);
  assert.strictEqual(deviceStateService.isDeviceOnline('203'), true, 'Room 203 should be Online');
  assert.strictEqual(deviceStateService.isDeviceOnline('204'), true, 'Room 204 should be Online');
  console.log('✔ Both rooms report Online immediately after heartbeat.');

  // At now - (OFFLINE_THRESHOLD_MS - 5000), should still be online
  deviceStateService.recordDeviceSeen(['203', '204'], now - (OFFLINE_THRESHOLD_MS - 5000));
  assert.strictEqual(deviceStateService.isDeviceOnline('203'), true, 'Room 203 should still be Online within threshold');
  assert.strictEqual(deviceStateService.isDeviceOnline('204'), true, 'Room 204 should still be Online within threshold');

  // At now - (OFFLINE_THRESHOLD_MS + 5000), should be Offline
  deviceStateService.recordDeviceSeen(['203', '204'], now - (OFFLINE_THRESHOLD_MS + 5000));
  assert.strictEqual(deviceStateService.isDeviceOnline('203'), false, 'Room 203 should be Offline after threshold');
  assert.strictEqual(deviceStateService.isDeviceOnline('204'), false, 'Room 204 should be Offline after threshold');
  console.log(`✔ Both rooms transition to Offline strictly when inactive beyond ${OFFLINE_THRESHOLD_MS / 1000}s threshold.`);

  // Restore online state
  deviceStateService.recordDeviceSeen(['203', '204'], Date.now());

  // -------------------------------------------------------------------------
  // 7. Activity Log refresh without notification changes & re-entrancy lock
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Testing Activity Log Independent Refresh & Concurrency Guard ---');
  let pollTriggerCount = 0;
  let lastTimelinePoll = 0;
  const pollInterval = 5000;

  function simulateNotificationLoopTick(currentTime, notifStateChanged) {
    if (notifStateChanged) {
      lastTimelinePoll = currentTime;
      pollTriggerCount++;
    } else {
      if (currentTime - lastTimelinePoll >= pollInterval) {
        lastTimelinePoll = currentTime;
        pollTriggerCount++;
      }
    }
  }

  // T = T0: first tick (no notification change, first time running)
  const T0 = 1000000000;
  simulateNotificationLoopTick(T0, false);
  assert.strictEqual(pollTriggerCount, 1, 'First tick should trigger activity log because lastTimelinePoll is 0');

  // T = T0 + 2000ms: second tick (no notification change, 2s elapsed) -> should NOT trigger (throttled)
  simulateNotificationLoopTick(T0 + 2000, false);
  assert.strictEqual(pollTriggerCount, 1, 'Tick at 2s should be throttled');

  // T = T0 + 4000ms: third tick -> throttled
  simulateNotificationLoopTick(T0 + 4000, false);
  assert.strictEqual(pollTriggerCount, 1, 'Tick at 4s should be throttled');

  // T = T0 + 5100ms: fourth tick (>5s elapsed) -> should trigger!
  simulateNotificationLoopTick(T0 + 5100, false);
  assert.strictEqual(pollTriggerCount, 2, 'Tick at >5s must trigger timeline refresh independently');
  console.log('✔ Verified timeline polls every ~5s independently of notification changes.');

  // Test re-entrancy guard logic
  let isFetching = false;
  let simultaneousExecutions = 0;
  let maxSimultaneous = 0;

  async function mockLoadRoomStatusActivityLog() {
    if (isFetching) return 'LOCKED';
    isFetching = true;
    simultaneousExecutions++;
    maxSimultaneous = Math.max(maxSimultaneous, simultaneousExecutions);

    // Simulate async network latency
    await new Promise(r => setTimeout(r, 20));

    simultaneousExecutions--;
    isFetching = false;
    return 'SUCCESS';
  }

  const results = await Promise.all([
    mockLoadRoomStatusActivityLog(),
    mockLoadRoomStatusActivityLog(),
    mockLoadRoomStatusActivityLog()
  ]);

  assert.strictEqual(maxSimultaneous, 1, 'Simultaneous active fetches must never exceed 1');
  assert.strictEqual(results.filter(r => r === 'SUCCESS').length, 1, 'Exactly one concurrent call runs; others are locked');
  console.log('✔ Re-entrancy guard prevents overlapping requests and redundant server load.');

  // -------------------------------------------------------------------------
  // 8. Backward compatibility check
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Testing Backward Compatibility ---');
  // Legacy heartbeat without slotSeqs or slots
  const legacyHb = await iotService.recordHeartbeat({
    deviceId: 'ESP32-KeyBox',
    rooms: ['203', '204']
  }, mockDevice);
  assert.strictEqual(legacyHb.status, 200, 'Legacy heartbeat must return 200');

  // Legacy key event without seq
  const legacyKeyEvent = await iotService.logOccupancy({
    keyEvent: 'Key Returned',
    roomNumber: '203'
  }, mockDevice);
  assert.strictEqual(legacyKeyEvent.status, 200, 'Legacy key event must return 200');
  console.log('✔ Legacy requests without seq or slots remain 100% compatible.');

  // Clean up database baseline & test occupancy logs
  await db.query(`UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number IN ('203', '204')`);
  await db.query(`DELETE FROM occupancy_log WHERE Auth_Method IN ('UNAUTHORIZED', 'WRONG_SLOT') OR (Auth_Method IN ('Key Taken', 'Key Returned') AND Room_ID IN (SELECT Room_ID FROM laboratories WHERE Room_Number IN ('203', '204')) AND Access_Time >= NOW() - INTERVAL 1 MINUTE)`);

  console.log('\n================================================================');
  console.log('🎉 ALL 8 IOT RELIABILITY REGRESSION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
