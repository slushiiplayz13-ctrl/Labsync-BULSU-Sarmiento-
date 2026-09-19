'use strict';

/**
 * tests/test-key-iot-status.js
 * Verification of IoT online/offline status integration for Key Inventory.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function main() {
  console.log('================================================================');
  console.log('🧪 Testing Key Inventory IoT Status & Dynamic Badge Rendering');
  console.log('================================================================\n');

  const keysService = require('../services/keysService');
  const iotService = require('../services/iotService');

  // 1. Test backend getAllKeys with current DB state (unplugged IoT)
  console.log('--- 1. Testing Backend getAllKeys with offline IoT key box ---');
  const allKeysResult = await keysService.getAllKeys();
  assert.strictEqual(allKeysResult.status, 200, 'Expected 200 from getAllKeys');
  assert.ok(Array.isArray(allKeysResult.data.keys), 'Expected keys array');
  assert(allKeysResult.data.keys.length > 0, 'Expected at least 1 key');

  for (const k of allKeysResult.data.keys) {
    assert('deviceOnline' in k, `Expected key ${k.Key_Code} to have deviceOnline property`);
    assert.strictEqual(
      k.deviceOnline,
      false,
      `Expected key ${k.Key_Code} for room ${k.Room_Number} to be offline (device is unplugged)`
    );
  }
  console.log(`✔ Verified all ${allKeysResult.data.keys.length} keys report deviceOnline = false when IoT key box is unplugged.`);

  // 2. Test simulating an online heartbeat from ESP32 Keybox
  console.log('\n--- 2. Testing simulated ESP32 heartbeat for Room 203 ---');
  iotService.recordHeartbeat('ESP32-KeyBox', ['203']);
  const afterHeartbeat = await keysService.getAllKeys();
  const room203Key = afterHeartbeat.data.keys.find(k => String(k.Room_Number) === '203');

  assert.ok(room203Key, 'Expected to find key for room 203');
  assert.strictEqual(room203Key.deviceOnline, true, 'Room 203 key should be deviceOnline = true after heartbeat');
  console.log('✔ Verified Room 203 key is reported online immediately after heartbeat.');

  // 3. Test frontend DOM rendering with mis-keys.js logic
  console.log('\n--- 3. Testing Frontend mis-keys.js Badge Rendering ---');
  const misKeysScript = fs.readFileSync(path.join(__dirname, '../js/pages/mis-keys.js'), 'utf8');

  // Verify offline pulse badge styling in mis-keys.html
  const keysHtml = fs.readFileSync(path.join(__dirname, '../mis-keys.html'), 'utf8');
  assert(keysHtml.includes('.status-badge-pulse.offline'), 'mis-keys.html must include .status-badge-pulse.offline styles');
  assert(keysHtml.includes('html.dark-mode .status-badge-pulse.offline'), 'mis-keys.html must include dark mode offline styles');
  console.log('✔ Verified .status-badge-pulse.offline CSS exists in mis-keys.html');

  // Verify mis-keys.js has offline badge markup
  assert(
    misKeysScript.includes('status-badge-pulse offline') && misKeysScript.includes('Offline'),
    'mis-keys.js must construct status-badge-pulse offline badge with text Offline'
  );
  console.log('✔ Verified mis-keys.js constructs offline badge correctly.');

  // Verify search index includes 'offline'
  assert(
    misKeysScript.includes('offline disconnected'),
    'mis-keys.js must include offline disconnected in statusStr when !isOnline'
  );
  console.log('✔ Verified mis-keys.js supports searching for offline keys.');

  console.log('\n================================================================');
  console.log('🎉 ALL KEY IOT STATUS TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
