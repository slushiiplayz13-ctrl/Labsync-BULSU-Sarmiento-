'use strict';

const assert = require('assert');
const iotService = require('../services/iotService');
const claimService = require('../services/iot/claim.service');
const db = require('../database/connection');

async function testDuplicateKeySafety() {
  console.log('================================================================');
  console.log('🧪 Testing Duplicate Key Taken Safety & Unregistered Custody');
  console.log('================================================================\n');

  const mockDevice = {
    id: 'ESP32-KeyBox',
    authorizedRooms: ['203', '204']
  };

  const [users] = await db.query("SELECT User_ID, Name, ID_QR_String FROM users WHERE Role = 'Faculty' LIMIT 1");
  const facultyUser = users[0];

  try {
    // 1. Reset Room 204
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number = '204'");
    claimService.clearClaim('204');

    // 2. Scan valid QR for Faculty User
    console.log('--- 1. Authenticated QR Scan ---');
    const qrRes = await iotService.logOccupancy({
      qrString: facultyUser.ID_QR_String,
      roomNumber: '204',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(qrRes.status, 200);

    // 3. First Key Taken -> Authenticated Custody
    console.log('--- 2. First Key Taken (Legitimate withdrawal) ---');
    const takeRes1 = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    assert.strictEqual(takeRes1.status, 200);

    const [dbRow1] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'");
    assert.strictEqual(dbRow1[0].Key_Status, 'Absent');
    assert.strictEqual(dbRow1[0].Current_User_ID, facultyUser.User_ID, 'First key taken must attribute custody to facultyUser');
    console.log(`✔ Verified: Current_User_ID = ${facultyUser.User_ID} (${facultyUser.Name})`);

    // 4. Duplicate Key Taken (e.g. contact chatter / bounce / duplicate network packet)
    console.log('--- 3. Duplicate Key Taken (Chatter / duplicate event without new claim) ---');
    const takeRes2 = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    assert.strictEqual(takeRes2.status, 200);

    const [dbRow2] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'");
    assert.strictEqual(dbRow2[0].Key_Status, 'Absent');
    assert.strictEqual(dbRow2[0].Current_User_ID, facultyUser.User_ID, 'CRITICAL: Duplicate Key Taken MUST NOT wipe out Current_User_ID to NULL');
    console.log(`✔ Verified: Duplicate Key Taken preserved Current_User_ID = ${facultyUser.User_ID} (NOT wiped to NULL)`);

    // 5. Return Key
    console.log('--- 4. Key Returned ---');
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);
    const [dbRow3] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'");
    assert.strictEqual(dbRow3[0].Key_Status, 'Present');
    assert.strictEqual(dbRow3[0].Current_User_ID, null, 'Key returned must reset Current_User_ID to NULL');
    console.log('✔ Verified: Key Returned reset Key_Status to Present and Current_User_ID to NULL');

    // 6. Unauthenticated Key Taken -> Strictly NULL
    console.log('--- 5. Key Taken Without QR Scan (Strict Unregistered Accountability) ---');
    claimService.clearClaim('204');
    const takeResUnauth = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    assert.strictEqual(takeResUnauth.status, 200);

    const [dbRow4] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'");
    assert.strictEqual(dbRow4[0].Key_Status, 'Absent');
    assert.strictEqual(dbRow4[0].Current_User_ID, null, 'Unauthenticated Key Taken MUST result in Current_User_ID = NULL');
    console.log('✔ Verified: Unauthenticated key withdrawal strictly yields Current_User_ID = NULL (Unregistered)');

    // 7. Duplicate Key Taken on Unregistered key -> Remains NULL
    console.log('--- 6. Duplicate Key Taken on Unregistered Key ---');
    await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);
    const [dbRow5] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_Number = '204'");
    assert.strictEqual(dbRow5[0].Key_Status, 'Absent');
    assert.strictEqual(dbRow5[0].Current_User_ID, null, 'Duplicate unauthenticated Key Taken must remain NULL');
    console.log('✔ Verified: Duplicate unauthenticated Key Taken remains NULL');

    console.log('\n================================================================');
    console.log('🎉 ALL DUPLICATE KEY SAFETY TESTS PASSED!');
    console.log('================================================================\n');

  } finally {
    // Reset Room 204 state
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_Number = '204'");
    claimService.clearClaim('204');
    await db.end();
  }
}

testDuplicateKeySafety().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
