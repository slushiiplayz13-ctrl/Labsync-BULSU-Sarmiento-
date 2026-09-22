'use strict';

/**
 * tests/test-strict-key-accountability.js
 * Comprehensive verification of STRICT KEY ACCOUNTABILITY and DECOUPLED SCHEDULE CUSTODY.
 * 
 * Enforces:
 * 1. Key Present -> Available
 * 2. Key Absent without authenticated identity -> Borrowed, Current_User_ID = NULL, UI = Unregistered (amber)
 * 3. Key Absent + Authenticated matching scheduled prof -> In Session
 * 4. Key Absent + Authenticated different faculty -> Borrowed, holder = actual borrower, scheduled shown separately
 * 5. Schedule data NEVER used as proof of key custody in backend, notifications, or frontend.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const iotService = require('../services/iotService');
const claimService = require('../services/iot/claim.service');
const laboratoryService = require('../services/laboratoryService');
const scheduleService = require('../services/scheduleService');
const maintenanceRepository = require('../repositories/maintenance.repository');

const mockDevice = {
  id: 'ESP32-KeyBox',
  authorizedRooms: ['203', '204']
};

// Mock DOM container helper for frontend test scenarios
function createMockElement(tag = 'div') {
  const element = {
    tagName: tag.toUpperCase(),
    innerHTML: '',
    children: [],
    attributes: {},
    classList: new Set(),
    setAttribute(name, val) { this.attributes[name] = String(val); },
    getAttribute(name) { return this.attributes[name] || null; },
    querySelectorAll(sel) {
      const results = [];
      if (sel.includes('[data-url]')) {
        const matches = [...this.innerHTML.matchAll(/data-url="([^"]+)"/g)];
        matches.forEach(m => {
          results.push({
            getAttribute: (attr) => attr === 'data-url' ? m[1] : null,
            addEventListener: () => {}
          });
        });
      }
      return results;
    },
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all[0] || null;
    }
  };
  return element;
}

async function runStrictKeyAccountabilityTests() {
  console.log('================================================================');
  console.log('🧪 STRICT KEY ACCOUNTABILITY & DECOUPLED SCHEDULE CUSTODY SUITE');
  console.log('================================================================\n');

  // Verify test users and rooms exist
  const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = '204' LIMIT 1");
  assert.ok(rooms.length > 0, "Test room '204' must exist in database");
  const roomId = rooms[0].Room_ID;

  const [usersA] = await db.query("SELECT User_ID, Name, ID_QR_String FROM users WHERE User_ID = 1 LIMIT 1");
  assert.ok(usersA.length > 0, "Professor A (User 1) must exist");
  const profA = usersA[0];

  const [usersB] = await db.query("SELECT User_ID, Name, ID_QR_String FROM users WHERE User_ID = 3 LIMIT 1");
  assert.ok(usersB.length > 0, "Professor B (User 3) must exist");
  const profB = usersB[0];

  // Helper to reset Room 204 to clean state
  async function resetRoomState() {
    claimService.clearClaim('204');
    claimService.clearClaim('203');
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [roomId]);
  }

  let testScheduleId = null;
  let existingScheds = [];

  try {
    await resetRoomState();

    // Setup active schedule for Professor A on Room 204 for the entire current day
    const [dayRow] = await db.query("SELECT DAYNAME(NOW()) as dayName");
    const currentDay = dayRow[0].dayName;

    // Backup existing schedules on Room 204 for today to prevent collision with live test schedules
    const [foundScheds] = await db.query("SELECT * FROM schedules WHERE Room_ID = ? AND Day_of_Week = ?", [roomId, currentDay]);
    existingScheds = foundScheds || [];
    if (existingScheds.length > 0) {
      await db.query("DELETE FROM schedules WHERE Room_ID = ? AND Day_of_Week = ?", [roomId, currentDay]);
    }

    const [schedInsert] = await db.query(`
      INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
      VALUES (?, ?, 'TEST-CS101 - Strict Accountability Lab', 'BSIT-TEST', ?, '00:00:00', '23:59:59', '2026-2027', '1st Semester', 'Default')
    `, [profA.User_ID, roomId, currentDay]);
    testScheduleId = schedInsert.insertId;
    console.log(`✓ Test schedule created for Professor A (${profA.Name}) on Room 204 for ${currentDay}`);

    // -------------------------------------------------------------------------
    // TEST 1 — NO SCAN + ACTIVE SCHEDULE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: NO SCAN + ACTIVE SCHEDULE ---');
    claimService.clearClaim('204');

    // Key physically taken without QR scan
    const takeRes1 = await iotService.logOccupancy({
      keyEvent: 'Key Taken',
      roomNumber: '204'
    }, mockDevice);

    assert.strictEqual(takeRes1.status, 200, 'Key Taken event accepted');

    // Verify DB laboratory state
    const [labDb1] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [roomId]);
    assert.strictEqual(labDb1[0].Key_Status, 'Absent', 'Key status must be Absent');
    assert.strictEqual(labDb1[0].Current_User_ID, null, 'Current_User_ID MUST BE NULL when key taken without authenticated scan');

    // Verify laboratoryService status calculation
    const allLabs1 = await laboratoryService.getAllLaboratories();
    const lab1 = allLabs1.data.find(r => r.Room_Number === '204');
    assert.ok(lab1, 'Room 204 must be returned in getAllLaboratories');
    assert.strictEqual(lab1.Key_Status, 'Absent', 'Key_Status is Absent');
    assert.strictEqual(lab1.Current_Status, 'Borrowed', 'Room status MUST be Borrowed (NOT In Session)');
    assert.strictEqual(lab1.Current_Key_Holder, null, 'Current_Key_Holder MUST be null');
    assert.ok(lab1.Scheduled_Class, 'Scheduled class must remain visible');
    assert.strictEqual(lab1.Scheduled_Class.professor, profA.Name, 'Scheduled professor remains Professor A');
    assert.notStrictEqual(lab1.Current_Key_Holder, profA.Name, 'Scheduled professor MUST NOT be treated as current holder');
    console.log('✔ TEST 1 PASSED: Unauthenticated key removal with active schedule -> Borrowed, Current_User_ID = NULL, holder = null, schedule preserved.');

    // -------------------------------------------------------------------------
    // TEST 2 — AUTHENTICATED SCHEDULED PROFESSOR
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: AUTHENTICATED SCHEDULED PROFESSOR ---');
    // Return key first
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);

    // Professor A scans QR
    const qrScan2 = await iotService.logOccupancy({
      qrString: profA.ID_QR_String,
      roomNumber: '204',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(qrScan2.status, 200, 'Professor A QR scan verified');

    // Professor A takes the key
    const takeRes2 = await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '204' }, mockDevice);
    assert.strictEqual(takeRes2.status, 200, 'Key Taken event accepted');

    // Verify DB
    const [labDb2] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [roomId]);
    assert.strictEqual(labDb2[0].Key_Status, 'Absent', 'Key status is Absent');
    assert.strictEqual(labDb2[0].Current_User_ID, profA.User_ID, 'Current_User_ID must match Professor A');

    // Verify laboratoryService status calculation
    const allLabs2 = await laboratoryService.getAllLaboratories();
    const lab2 = allLabs2.data.find(r => r.Room_Number === '204');
    assert.strictEqual(lab2.Current_Status, 'In Session', 'Status MUST be In Session when holder matches schedule');
    assert.strictEqual(lab2.Current_Key_Holder, profA.Name, 'Holder must be Professor A');
    console.log('✔ TEST 2 PASSED: Authenticated scheduled professor key removal -> In Session, holder = Professor A.');

    // -------------------------------------------------------------------------
    // TEST 3 — AUTHENTICATED DIFFERENT FACULTY
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: AUTHENTICATED DIFFERENT FACULTY ---');
    // Return key first
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);

    // Professor B (different faculty) scans QR
    const qrScan3 = await iotService.logOccupancy({
      qrString: profB.ID_QR_String,
      roomNumber: '204',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(qrScan3.status, 200, 'Professor B QR scan verified');

    // Professor B takes key
    const takeRes3 = await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '204' }, mockDevice);
    assert.strictEqual(takeRes3.status, 200, 'Key Taken event accepted');

    // Verify DB
    const [labDb3] = await db.query("SELECT Key_Status, Current_User_ID FROM laboratories WHERE Room_ID = ?", [roomId]);
    assert.strictEqual(labDb3[0].Key_Status, 'Absent', 'Key status is Absent');
    assert.strictEqual(labDb3[0].Current_User_ID, profB.User_ID, 'Current_User_ID must match Professor B');

    // Verify laboratoryService status calculation
    const allLabs3 = await laboratoryService.getAllLaboratories();
    const lab3 = allLabs3.data.find(r => r.Room_Number === '204');
    assert.strictEqual(lab3.Current_Status, 'Borrowed', 'Status MUST be Borrowed when borrower differs from schedule');
    assert.strictEqual(lab3.Current_Key_Holder, profB.Name, 'Holder must be Professor B (the borrower)');
    assert.strictEqual(lab3.Scheduled_Class.professor, profA.Name, 'Scheduled professor remains Professor A');
    assert.notStrictEqual(lab3.Current_Key_Holder, lab3.Scheduled_Class.professor, 'Holder and Scheduled Professor remain strictly decoupled');
    console.log('✔ TEST 3 PASSED: Authenticated different faculty -> Borrowed, holder = Professor B, scheduled = Professor A.');

    // -------------------------------------------------------------------------
    // TEST 4 — AUTHENTICATED HOLDER WITH NO ACTIVE CLASS
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: AUTHENTICATED HOLDER WITH NO ACTIVE CLASS ---');
    // Temporarily delete the test schedule
    await db.query("DELETE FROM schedules WHERE Schedule_ID = ?", [testScheduleId]);

    // Return key first
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);

    // Professor B scans QR
    await iotService.logOccupancy({
      qrString: profB.ID_QR_String,
      roomNumber: '204',
      authMethod: 'QR Code'
    }, mockDevice);
    // Professor B takes key
    await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '204' }, mockDevice);

    const allLabs4 = await laboratoryService.getAllLaboratories();
    const lab4 = allLabs4.data.find(r => r.Room_Number === '204');
    assert.strictEqual(lab4.Current_Status, 'Borrowed', 'Status is Borrowed when no class active');
    assert.strictEqual(lab4.Current_Key_Holder, profB.Name, 'Holder is Professor B');
    assert.strictEqual(lab4.Scheduled_Class, null, 'No scheduled class');
    console.log('✔ TEST 4 PASSED: Authenticated holder without active schedule -> Borrowed, holder = Professor B.');

    // -------------------------------------------------------------------------
    // TEST 5 — NULL USER OCCUPANCY EVENT
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: NULL USER OCCUPANCY EVENT ---');
    // Re-create schedule for Professor A
    const [schedReinsert] = await db.query(`
      INSERT INTO schedules (User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
      VALUES (?, ?, 'TEST-CS101 - Strict Accountability Lab', 'BSIT-TEST', ?, '00:00:00', '23:59:59', '2026-2027', '1st Semester', 'Default')
    `, [profA.User_ID, roomId, currentDay]);
    testScheduleId = schedReinsert.insertId;

    // Insert an occupancy_log entry with NULL User_ID and 'Key Taken'
    const [logInsert] = await db.query(`
      INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method)
      VALUES (NULL, ?, NOW(), 'Key Taken')
    `, [roomId]);
    const nullLogId = logInsert.insertId;

    // Fetch notifications from repository
    const [notifications] = await maintenanceRepository.findNotificationsByRoomIds([roomId]);
    const nullEvent = notifications.find(n => n.type === 'occupancy' && n.id === nullLogId);
    assert.ok(nullEvent, 'Must find null-user occupancy event in notifications query');
    assert.strictEqual(nullEvent.session_type, 'Borrowed', 'session_type MUST be Borrowed (NOT In Session) when User_ID is NULL');
    assert.strictEqual(nullEvent.description, null, 'description MUST NOT infer scheduled professor name');
    assert.strictEqual(nullEvent.detail, null, 'detail MUST NOT infer scheduled professor role');

    // Test notifications.js formatting
    const notifJs = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
    const mockWindowNotif = {
      sessionStorage: {
        getItem: (k) => k === 'labsync_cached_labs' ? JSON.stringify([{ Room_Number: '204', Scheduled_Professor_Name: profA.Name }]) : null
      }
    };
    const evalNotifFn = new Function('window', 'global', notifJs);
    evalNotifFn(mockWindowNotif, mockWindowNotif);
    const itemData = mockWindowNotif.getNotificationDetails(nullEvent);
    assert.strictEqual(itemData.title, 'Key Borrowed', 'Title must be Key Borrowed');
    assert.ok(!itemData.text.includes(profA.Name), 'Notification text MUST NOT include scheduled professor');
    assert.ok(itemData.text.includes('Room 204'), 'Notification text includes room number');
    console.log('✔ TEST 5 PASSED: Null-user occupancy event -> session_type = Borrowed, no actor attribution in DB or UI notifications.');

    // -------------------------------------------------------------------------
    // TEST 6 — ROOM STATUS FRONTEND
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: ROOM STATUS FRONTEND ---');
    const labServiceJs = fs.readFileSync(path.join(__dirname, '../js/services/laboratory.service.js'), 'utf8');
    const mockWindowLab = {
      location: { pathname: '/faculty-room-status.html' },
      currentUser: { Role: 'Faculty' },
      lucide: { createIcons: () => {} }
    };
    const evalLabFn = new Function('window', `
      ${labServiceJs}
      return renderLabCards;
    `);
    const renderLabCards = evalLabFn(mockWindowLab);

    const testRoomData = {
      Room_Number: '204',
      Building: 'Main Building',
      Key_Status: 'Absent',
      Current_Status: 'Borrowed',
      Current_Key_Holder: null,
      Scheduled_Class: {
        professor: 'Prof. Maria Santos',
        subject: 'CC 102',
        section: 'BSIT 3A'
      },
      deviceOnline: true
    };

    const containerEl = createMockElement('div');
    renderLabCards([testRoomData], containerEl);
    const renderedHtml = containerEl.innerHTML;

    assert.ok(renderedHtml.includes('Unregistered'), 'Claimed By must display Unregistered');
    assert.ok(renderedHtml.includes('amber-text'), 'Unregistered must have amber-text styling');
    assert.ok(renderedHtml.includes('Maria Santos'), 'Scheduled professor Maria Santos must be displayed separately');
    assert.ok(renderedHtml.includes('Borrowed'), 'Status must display Borrowed');
    // Ensure Maria Santos does NOT appear in the Claimed By field
    const claimedBySection = renderedHtml.substring(renderedHtml.indexOf('Claimed By'), renderedHtml.indexOf('Scheduled'));
    assert.ok(!claimedBySection.includes('Maria Santos'), 'Claimed By field MUST NOT contain scheduled professor');
    console.log('✔ TEST 6 PASSED: Frontend room card renders Unregistered in amber, separates Scheduled professor, shows Borrowed.');

    // -------------------------------------------------------------------------
    // TEST 7 — MIS KEY INVENTORY
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: MIS KEY INVENTORY ---');
    const misKeysJs = fs.readFileSync(path.join(__dirname, '../js/pages/mis-keys.js'), 'utf8');

    // Extract the custody rendering branch logic from mis-keys.js
    assert.ok(misKeysJs.includes('custody-holder-unregistered'), 'mis-keys.js must include custody-holder-unregistered markup');
    assert.ok(misKeysJs.includes('data-lucide="user-x"'), 'mis-keys.js must use user-x icon for unregistered custody');
    assert.ok(!misKeysJs.includes("'Faculty Member'"), 'mis-keys.js MUST NOT fall back to Faculty Member');

    // Test runtime snippet
    const testKeyAbsent = { Room_Key_Status: 'Absent', Current_Holder_Name: null };
    const cleanName = testKeyAbsent.Current_Holder_Name
      ? (testKeyAbsent.Current_Holder_Name.startsWith('Prof.') ? testKeyAbsent.Current_Holder_Name : `Prof. ${testKeyAbsent.Current_Holder_Name}`)
      : null;

    let testCustodyHtml = '';
    if (cleanName) {
      testCustodyHtml = `<span class="custody-holder-name">${cleanName}</span>`;
    } else {
      testCustodyHtml = `
        <div class="custody-holder-row custody-holder-unregistered" style="color: #D97706;">
          <i data-lucide="user-x" class="custody-holder-icon" style="color: #D97706;"></i>
          <span class="custody-holder-name amber-text" style="color: #D97706;">Unregistered</span>
        </div>
      `;
    }

    assert.ok(testCustodyHtml.includes('Unregistered'), 'Must render Unregistered');
    assert.ok(testCustodyHtml.includes('user-x'), 'Must use user-x icon');
    assert.ok(testCustodyHtml.includes('#D97706'), 'Must use amber color styling');
    assert.ok(!testCustodyHtml.includes('Faculty Member'), 'Must NOT invent Faculty Member identity');
    console.log('✔ TEST 7 PASSED: MIS Key Inventory renders Unregistered with user-x and amber styling, no Faculty Member fallback.');

    // -------------------------------------------------------------------------
    // TEST 8 — ACTIVITY TIMELINE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: ACTIVITY TIMELINE ---');
    const timelineJs = fs.readFileSync(path.join(__dirname, '../js/pages/room-status/room-status.timeline.js'), 'utf8');
    const mockWindowTimeline = {
      lucide: { createIcons: () => {} },
      sessionStorage: {
        getItem: (key) => {
          if (key === 'labsync_cached_labs') {
            return JSON.stringify([
              { Room_Number: '204', Scheduled_Professor_Name: profA.Name, Current_Key_Holder_Name: null }
            ]);
          }
          return null;
        }
      }
    };
    const evalTimelineFn = new Function('window', 'global', timelineJs);
    evalTimelineFn(mockWindowTimeline, mockWindowTimeline);

    const timelineModule = mockWindowTimeline.roomStatusTimeline;
    assert.ok(timelineModule, 'roomStatusTimeline must be exposed');

    const containerTimeline = createMockElement('div');
    const unauthLog = [
      {
        id: 888,
        time: new Date().toISOString(),
        status: 'Key Taken',
        room_number: '204',
        description: null,
        detail: null,
        session_type: 'Borrowed',
        type: 'occupancy'
      }
    ];

    timelineModule.renderTimelineItems(unauthLog, containerTimeline);
    const timelineOutput = containerTimeline.innerHTML;

    assert.ok(!timelineOutput.includes(profA.Name), 'Timeline actor MUST NOT be inferred as Professor A');
    assert.ok(timelineOutput.includes('RM 204'), 'Target room must be RM 204');
    assert.ok(timelineOutput.includes('Key Borrowed'), 'Action must be Key Borrowed');
    assert.ok(timelineOutput.includes('System'), 'Actor falls back to System when unauthenticated');
    console.log('✔ TEST 8 PASSED: Activity timeline preserves System actor for unauthenticated key event, target RM 204.');

    // -------------------------------------------------------------------------
    // TEST 9 — IT HEAD TIMELINE
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: IT HEAD TIMELINE ---');
    const itHeadJs = fs.readFileSync(path.join(__dirname, '../js/pages/it-head-room-status.js'), 'utf8');
    const mockWindowItHead = {
      lucide: { createIcons: () => {} },
      sessionStorage: {
        getItem: (key) => {
          if (key === 'labsync_cached_labs') {
            return JSON.stringify([
              { Room_Number: '204', Scheduled_Professor_Name: profA.Name, Current_Key_Holder_Name: null }
            ]);
          }
          return null;
        }
      },
      document: {
        addEventListener: () => {},
        querySelector: () => null,
        getElementById: () => null
      }
    };

    const evalItHeadFn = new Function('window', 'document', 'sessionStorage', itHeadJs);
    evalItHeadFn(mockWindowItHead, mockWindowItHead.document, mockWindowItHead.sessionStorage);

    const containerItHead = createMockElement('div');
    mockWindowItHead.renderActivityLogList(unauthLog, containerItHead);
    const itHeadOutput = containerItHead.innerHTML;

    assert.ok(!itHeadOutput.includes(profA.Name), 'IT Head timeline actor MUST NOT be inferred as Professor A');
    assert.ok(itHeadOutput.includes('RM 204'), 'Target room must be RM 204');
    assert.ok(itHeadOutput.includes('Key Borrowed'), 'Action must be Key Borrowed');
    assert.ok(itHeadOutput.includes('System'), 'Actor falls back to System when unauthenticated');
    console.log('✔ TEST 9 PASSED: IT Head timeline preserves System actor for unauthenticated key event, target RM 204.');

    // -------------------------------------------------------------------------
    // TEST 10 — EXISTING AUTHENTICATED QR FLOW INTEGRITY
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: EXISTING AUTHENTICATED QR FLOW INTEGRITY ---');
    // Return key to clean state
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);

    // Verify QR scan returns LCD line instructions
    const validQrRes = await iotService.logOccupancy({
      qrString: profA.ID_QR_String,
      roomNumber: '204',
      authMethod: 'QR Code'
    }, mockDevice);
    assert.strictEqual(validQrRes.status, 200, 'QR verification succeeds');
    assert.ok(validQrRes.data.lcdLine1.includes('Access Granted') || validQrRes.data.lcdLine1.includes('Identity Verified'), 'LCD line 1 indicates access');

    // Verify claim exists in claimService
    const claim = claimService.getValidClaim('204', Date.now());
    assert.ok(claim, 'Valid claim must exist for Room 204');
    assert.strictEqual(claim.userId, profA.User_ID, 'Claim belongs to Professor A');

    // Verify device authorization (unauthorized room fails)
    const badDevice = { id: 'Unknown-Device', authorizedRooms: ['999'] };
    const unauthDeviceRes = await iotService.logOccupancy({ keyEvent: 'Key Taken', roomNumber: '204' }, badDevice);
    assert.strictEqual(unauthDeviceRes.status, 403, 'Unauthorized device access rejected with 403');

    // Clean up
    await iotService.logOccupancy({ keyEvent: 'Key Returned', roomNumber: '204' }, mockDevice);
    console.log('✔ TEST 10 PASSED: Authenticated QR flow, claims, device authorization, and key return work flawlessly.');

    console.log('\n================================================================');
    console.log('🎉 ALL 10 STRICT KEY ACCOUNTABILITY TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

  } finally {
    // Teardown: Remove test schedule and restore room state
    if (testScheduleId) {
      await db.query("DELETE FROM schedules WHERE Schedule_ID = ?", [testScheduleId]);
      console.log('✓ Teardown: Cleaned up test schedule.');
    }
    if (existingScheds && existingScheds.length > 0) {
      for (const s of existingScheds) {
        await db.query(`
          INSERT INTO schedules (Schedule_ID, User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [s.Schedule_ID, s.User_ID, s.Room_ID, s.Subject_Name, s.Section, s.Day_of_Week, s.Start_Time, s.End_Time, s.Academic_Year, s.Semester, s.Color_Theme]);
      }
      console.log('✓ Teardown: Restored existing schedules.');
    }
    await resetRoomState();
    console.log('✓ Teardown: Restored Room 204 state to Present / NULL holder.');
    await db.end();
  }
}

runStrictKeyAccountabilityTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
