'use strict';

const assert = require('assert');
const db = require('../database/connection');
const keysService = require('../services/keysService');
const labRepository = require('../repositories/laboratory.repository');

async function run() {
  console.log('🧪 Testing Key Transfer: 1 Key Per Faculty Enforcement');

  // Find 2 distinct rooms and a faculty member
  const [rooms] = await db.query('SELECT Room_ID, Room_Number FROM laboratories ORDER BY Room_Number ASC LIMIT 2');
  if (rooms.length < 2) {
    throw new Error('At least 2 rooms required for test');
  }
  const roomA = rooms[0];
  const roomB = rooms[1];

  const [keysA] = await db.query('SELECT Key_ID, Key_Code FROM laboratory_keys WHERE Room_ID = ?', [roomA.Room_ID]);
  const [keysB] = await db.query('SELECT Key_ID, Key_Code FROM laboratory_keys WHERE Room_ID = ?', [roomB.Room_ID]);

  if (keysA.length === 0 || keysB.length === 0) {
    throw new Error('Keys required for both rooms');
  }
  const keyA = keysA[0];
  const keyB = keysB[0];

  const [facultyUsers] = await db.query("SELECT User_ID, Name, Role FROM users WHERE Role = 'Faculty' LIMIT 1");
  if (facultyUsers.length === 0) {
    throw new Error('Faculty user required for test');
  }
  const faculty = facultyUsers[0];

  console.log(`Faculty: ${faculty.Name} (ID: ${faculty.User_ID})`);
  console.log(`Room A: ${roomA.Room_Number} (${keyA.Key_Code})`);
  console.log(`Room B: ${roomB.Room_Number} (${keyB.Key_Code})`);

  // Ensure initial state: clean custody
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [roomA.Room_ID, roomB.Room_ID]);

  const mockReqFaculty = {
    session: {
      userId: faculty.User_ID,
      userName: faculty.Name,
      userRole: faculty.Role
    }
  };

  // Step 1: Faculty claims Key A via key transfer
  const infoA = await keysService.getKeyTransferInfo(keyA.Key_Code, mockReqFaculty);
  assert.strictEqual(infoA.data.canTransfer, true, 'Faculty with no keys should be allowed to claim Key A');
  assert.strictEqual(infoA.data.cannotTransferReason, null, 'No transfer restriction for faculty with 0 keys');

  const transferA = await keysService.transferKey(keyA.Key_Code, mockReqFaculty);
  assert.strictEqual(transferA.status, 200, 'Transfer Key A must succeed');
  console.log('✔ PASS: Faculty successfully claimed Key A (Room', roomA.Room_Number, ')');

  // Verify DB state: Faculty holds Key A
  const [activeKeys1] = await labRepository.findActiveKeysByUserId(faculty.User_ID);
  assert.strictEqual(activeKeys1.length, 1, 'Faculty must hold exactly 1 key');
  assert.strictEqual(activeKeys1[0].Room_ID, roomA.Room_ID, 'Faculty holds Room A key');

  // Step 2: Faculty scans Key B QR code while holding Key A
  const infoB = await keysService.getKeyTransferInfo(keyB.Key_Code, mockReqFaculty);
  assert.strictEqual(infoB.data.canTransfer, false, 'Faculty holding Key A MUST NOT be allowed to claim Key B');
  assert.ok(infoB.data.cannotTransferReason.includes(`Room ${roomA.Room_Number}`), 'Reason must mention currently held Room A');
  assert.strictEqual(infoB.data.heldOtherRoom, roomA.Room_Number, 'heldOtherRoom must match held room');
  console.log('✔ PASS: getKeyTransferInfo blocked Key B claim and returned held room reason');

  // Step 3: Direct API call to transfer Key B while holding Key A must be rejected
  const transferB = await keysService.transferKey(keyB.Key_Code, mockReqFaculty);
  assert.strictEqual(transferB.status, 403, 'transferKey MUST return 403 Forbidden when faculty holds another key');
  assert.ok(transferB.error.includes(`Room ${roomA.Room_Number}`), 'Error must state that user already holds Room A');
  console.log('✔ PASS: transferKey rejected Key B with 403 and preserved single-key policy');

  // Verify DB state did not change: Faculty STILL holds ONLY Key A
  const [activeKeys2] = await labRepository.findActiveKeysByUserId(faculty.User_ID);
  assert.strictEqual(activeKeys2.length, 1, 'Faculty MUST still hold only 1 key');
  assert.strictEqual(activeKeys2[0].Room_ID, roomA.Room_ID, 'Faculty STILL holds only Room A key');

  // Step 4: Now return Key A (key returned to dock)
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [roomA.Room_ID]);

  // Step 5: Now faculty scans Key B again (now that Key A is returned)
  const infoBAfterReturn = await keysService.getKeyTransferInfo(keyB.Key_Code, mockReqFaculty);
  assert.strictEqual(infoBAfterReturn.data.canTransfer, true, 'Faculty who returned Key A is now allowed to claim Key B');
  assert.strictEqual(infoBAfterReturn.data.cannotTransferReason, null, 'No transfer restriction after returning prior key');

  const transferBSuccess = await keysService.transferKey(keyB.Key_Code, mockReqFaculty);
  assert.strictEqual(transferBSuccess.status, 200, 'Transfer Key B must now succeed');
  console.log('✔ PASS: Faculty successfully claimed Key B after returning Key A');

  // Restore DB state
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID IN (?, ?)", [roomA.Room_ID, roomB.Room_ID]);

  console.log('🎉 ALL KEY TRANSFER 1-KEY LIMIT TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

run().catch(async (err) => {
  console.error('Test error:', err);
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL");
  process.exit(1);
});
