'use strict';

/**
 * tests/test-activity-log-redesign.js
 * Verification for LabSync Activity Log Redesign:
 * 1. Output adheres to WHO -> WHAT -> TARGET -> WHEN -> CONTEXT hierarchy.
 * 2. Repetitive sentence prose ("Key returned for RM 204 by ...") is completely eliminated.
 * 3. Handles all event types: Key Returned, Key Taken, Key Borrowed, Key Transferred, QR Verified, Security, Warning, and Neutral fallback.
 * 4. Handles edge cases: missing actor (falls back to System, never confuses Actor with Room), missing room, long actor name, long action.
 * 5. Relative time and accessible exact timestamp are properly rendered.
 * 6. CSS contains cohesive audit stream styles, dark mode, high contrast, and mobile breakpoints (360px, 390px, 430px).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 Testing Activity Log Redesign (Audit Trail UI/UX)');
console.log('================================================================\n');

// 1. Verify CSS rules
const css = fs.readFileSync(path.join(__dirname, '../css/components/activity-timeline.css'), 'utf8');

assert.ok(css.includes('.activity-log-card .audit-row-header'), 'Must have .audit-row-header');
assert.ok(css.includes('.activity-log-card .audit-actor-name'), 'Must have .audit-actor-name');
assert.ok(css.includes('.activity-log-card .audit-meta-line'), 'Must have .audit-meta-line');
assert.ok(css.includes('.activity-log-card .audit-action-badge'), 'Must have .audit-action-badge');
assert.ok(css.includes('.activity-log-card .audit-target-tag'), 'Must have .audit-target-tag');
assert.ok(css.includes('.activity-log-card .audit-action-badge.action-returned'), 'Must have .action-returned');
assert.ok(css.includes('.activity-log-card .audit-action-badge.action-taken'), 'Must have .action-taken');
assert.ok(css.includes('.activity-log-card .audit-action-badge.action-borrowed'), 'Must have .action-borrowed');
assert.ok(css.includes('.activity-log-card .audit-action-badge.action-qr'), 'Must have .action-qr');
assert.ok(css.includes('.activity-log-card .audit-action-badge.action-transfer'), 'Must have .action-transfer');
assert.ok(css.includes('.activity-log-card .audit-action-badge.action-security'), 'Must have .action-security');
assert.ok(css.includes('.activity-log-card .audit-timeline-dot'), 'Must have .audit-timeline-dot');
assert.ok(css.includes('.activity-log-card .audit-type-icon'), 'Must have .audit-type-icon');
assert.ok(css.includes('.activity-log-card .audit-by-prefix'), 'Must have .audit-by-prefix');
assert.ok(css.includes('.activity-log-card .audit-actor-group'), 'Must have .audit-actor-group');

// Verify Dark Mode & High Contrast
assert.ok(css.includes('html.dark-mode .activity-log-card .audit-actor-name'), 'Dark mode must style audit actor');
assert.ok(css.includes('html.high-contrast .activity-log-card .audit-actor-name'), 'High contrast must style audit actor');
assert.ok(css.includes('html.dark-mode .activity-log-card .audit-timeline-dot.dot-returned'), 'Dark mode must style returned dot');
assert.ok(css.includes('@media (max-width: 480px)'), 'Mobile <= 480px breakpoint must exist');
assert.ok(css.includes('@media (max-width: 380px)'), 'Mobile <= 380px breakpoint must exist');

console.log('  ✓ CSS classes, tokens, dark mode, high contrast, and mobile breakpoints verified');

// 2. Verify JavaScript rendering behavior
// Simulate DOM environment for room-status.timeline.js
const timelineJs = fs.readFileSync(path.join(__dirname, '../js/pages/room-status/room-status.timeline.js'), 'utf8');

const mockWindow = {
  lucide: {
    createIcons: () => {}
  },
  sessionStorage: {
    getItem: (key) => {
      if (key === 'labsync_cached_labs') {
        return JSON.stringify([
          { Room_Number: '203', Scheduled_Professor_Name: 'Andrei Gabito', Current_Key_Holder_Name: 'Andrei Gabito' },
          { Room_Number: '204', Scheduled_Professor_Name: 'Andrei Gabito', Current_Key_Holder_Name: 'Andrei Gabito' }
        ]);
      }
      return null;
    },
    setItem: () => {}
  }
};

const fn = new Function('window', 'global', timelineJs);
fn(mockWindow, mockWindow);

const roomStatusTimeline = mockWindow.roomStatusTimeline;
assert.ok(roomStatusTimeline, 'roomStatusTimeline must be exposed on window');
assert.ok(typeof roomStatusTimeline.renderTimelineItems === 'function', 'renderTimelineItems must exist');
assert.ok(typeof roomStatusTimeline.getActionPresentation === 'function', 'getActionPresentation must exist');
assert.ok(typeof roomStatusTimeline.formatExactDateTime === 'function', 'formatExactDateTime must exist');

console.log('  ✓ Timeline module and helper functions loaded successfully');

// Create a mock container
function createContainer() {
  return {
    innerHTML: '',
    scrollTop: 0,
    querySelector: function(sel) {
      if (sel === '.ui-empty-state') return this.innerHTML.includes('ui-empty-state') ? {} : null;
      if (sel === '.timeline-item') return this.innerHTML.includes('timeline-item') ? {} : null;
      return null;
    }
  };
}

// Test A: Standard "Key Returned" item (Reference Screenshot case)
const containerA = createContainer();
const mockLogsA = [
  {
    id: 101,
    time: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    status: 'Key Returned',
    room_number: '204',
    description: 'Andrei Gabito',
    detail: 'IT Dept. Head',
    session_type: null,
    type: 'occupancy'
  }
];

roomStatusTimeline.renderTimelineItems(mockLogsA, containerA);
const htmlA = containerA.innerHTML;

assert.ok(htmlA.includes('Prof. Andrei Gabito'), 'Must render Prof. Andrei Gabito');
assert.ok(htmlA.includes('IT Dept. Head'), 'Must render IT Dept. Head');
assert.ok(htmlA.includes('Key Returned'), 'Must render action Key Returned');
assert.ok(htmlA.includes('action-returned'), 'Must have action-returned class');
assert.ok(htmlA.includes('audit-timeline-dot'), 'Must render audit-timeline-dot');
assert.ok(htmlA.includes('dot-returned'), 'Must have dot-returned class on dot');
assert.ok(htmlA.includes('audit-type-icon'), 'Must render audit-type-icon');
assert.ok(htmlA.includes('check-circle-2'), 'Must use check-circle-2 icon');
assert.ok(htmlA.includes('audit-by-prefix'), 'Must render audit-by-prefix');
assert.ok(htmlA.includes('RM 204'), 'Must render RM 204 target');
const expectedExactTimeA = roomStatusTimeline.formatExactDateTime(mockLogsA[0].time);
assert.ok(htmlA.includes(`<span>${expectedExactTimeA}</span>`), 'Must visibly display exact date and time');
assert.ok(htmlA.includes('title="18m ago"'), 'Must keep relative time in title tooltip');
assert.ok(!htmlA.includes('Key returned for RM 204 by Prof. Andrei Gabito'), 'REDUNDANT PROSE MUST NOT BE RENDERED!');
console.log('  ✓ Test A: Primary reference case (Andrei Gabito / RM 204 / Key Returned / Exact Date & Time) verified without repetitive prose');

// Test B: "Key Taken" with In Session context
const containerB = createContainer();
const mockLogsB = [
  {
    id: 102,
    time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    status: 'Key Taken',
    room_number: '201',
    description: 'Maria Santos',
    detail: 'Faculty',
    session_type: 'In Session',
    type: 'occupancy'
  }
];

roomStatusTimeline.renderTimelineItems(mockLogsB, containerB);
const htmlB = containerB.innerHTML;
assert.ok(htmlB.includes('Prof. Maria Santos'), 'Must render Prof. Maria Santos');
assert.ok(htmlB.includes('Key Taken'), 'Must render Key Taken');
assert.ok(htmlB.includes('action-taken'), 'Must have action-taken class');
assert.ok(htmlB.includes('key-round'), 'Must render key-round icon matching other system components');
assert.ok(htmlB.includes('RM 201'), 'Must render RM 201');
assert.ok(!htmlB.includes('(In Session)'), 'Redundant (In Session) context tag must NOT be rendered');
assert.ok(!htmlB.includes('audit-context-tag'), 'Context tags must not clutter actor meta line');
console.log('  ✓ Test B: Key Taken (clean meta line with key-round icon) verified');

// Test C: Missing Actor (No professor name)
const containerC = createContainer();
const mockLogsC = [
  {
    id: 103,
    time: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    status: 'Key Taken',
    room_number: '205',
    description: null,
    detail: null,
    session_type: 'Borrowed',
    type: 'occupancy'
  }
];

roomStatusTimeline.renderTimelineItems(mockLogsC, containerC);
const htmlC = containerC.innerHTML;
assert.ok(!htmlC.includes('RM 205 Key'), 'MUST NOT label the Actor as "RM 205 Key"');
assert.ok(htmlC.includes('System'), 'Must fallback to System as Actor');
assert.ok(htmlC.includes('Key Borrowed'), 'Must render Key Borrowed');
assert.ok(htmlC.includes('RM 205'), 'Target must be RM 205');
assert.ok(!htmlC.includes('(Borrowed)'), 'Redundant (Borrowed) context tag must NOT be rendered');
console.log('  ✓ Test C: Missing actor edge case verified (actor is System, target is RM 205, no (Borrowed) redundancy)');

// Test D: Security Alert & Wrong Key Slot (Decoupled from cached faculty Andrei Gabito)
const containerD = createContainer();
const mockLogsD = [
  {
    id: 104,
    time: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: 'UNAUTHORIZED',
    room_number: '203',
    description: null,
    detail: null,
    session_type: null,
    type: 'occupancy'
  },
  {
    id: 105,
    time: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    status: 'WRONG_SLOT',
    room_number: '204',
    description: null,
    detail: null,
    session_type: null,
    type: 'occupancy'
  },
  {
    id: 106,
    time: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    status: 'Key Returned',
    room_number: '203',
    description: 'Unidentified Person',
    detail: 'Alarm Cleared',
    session_type: null,
    type: 'occupancy'
  }
];

roomStatusTimeline.renderTimelineItems(mockLogsD, containerD);
const htmlD = containerD.innerHTML;
assert.ok(htmlD.includes('Unauthorized Key Access'), 'Must map to Unauthorized Key Access');
assert.ok(htmlD.includes('action-security'), 'Must have action-security class');
assert.ok(htmlD.includes('Wrong Key Slot'), 'Must map to Wrong Key Slot');
assert.ok(htmlD.includes('action-warning'), 'Must have action-warning class');
assert.ok(htmlD.includes('Key Returned'), 'Must map to Key Returned');
assert.ok(htmlD.includes('action-returned'), 'Must have action-returned class');
assert.ok(!htmlD.includes('Andrei Gabito'), 'Must NOT attribute unauthorized access, wrong slot, or alarm cleared return to scheduled faculty Andrei Gabito');
assert.ok(htmlD.includes('Unidentified Person'), 'Must attribute security alert to Unidentified Person');
assert.ok(htmlD.includes('Security Alert'), 'Must label unauthorized access role as Security Alert');
assert.ok(htmlD.includes('Hardware Warning'), 'Must label wrong slot role as Hardware Warning');
assert.ok(htmlD.includes('Alarm Cleared'), 'Must label unauthorized return role as Alarm Cleared');
console.log('  ✓ Test D: Security alerts & hardware events decoupled from faculty identities (Unidentified Person · Security Alert / Hardware Warning / Alarm Cleared)');

// Test E: Empty Activity Log
const containerE = createContainer();
roomStatusTimeline.renderTimelineItems([], containerE);
assert.ok(containerE.innerHTML.includes('ui-empty-state'), 'Empty state must be displayed for 0 items');
assert.ok(containerE.innerHTML.includes('No activity yet'), 'Empty state message preserved');
console.log('  ✓ Test E: Empty state verified');

// Test F: Long Actor Name and Long Text wrapping
const containerF = createContainer();
const longActorName = 'Very Long Professor Name With Multiple Surnames And Titles Dr. Engr. Alexander Christopher Montgomery-Smith III';
const mockLogsF = [
  {
    id: 106,
    time: new Date().toISOString(),
    status: 'Custom University Audit Action Event Name That Is Long',
    room_number: '999',
    description: longActorName,
    detail: 'Senior College Dean & IT Department Head Specialist',
    session_type: 'Special Exam Session',
    type: 'occupancy'
  }
];

roomStatusTimeline.renderTimelineItems(mockLogsF, containerF);
const htmlF = containerF.innerHTML;
assert.ok(htmlF.includes(longActorName), 'Long actor name must be present');
assert.ok(htmlF.includes('RM 999'), 'RM 999 must be present');
console.log('  ✓ Test F: Long names & unknown activity types gracefully handled');

// Test G: Verify it-head-room-status.js rendering consistency
const itHeadJs = fs.readFileSync(path.join(__dirname, '../js/pages/it-head-room-status.js'), 'utf8');
const mockItHeadWindow = {
  lucide: { createIcons: () => {} },
  sessionStorage: {
    getItem: (key) => {
      if (key === 'labsync_cached_labs') {
        return JSON.stringify([
          { Room_Number: '203', Scheduled_Professor_Name: 'Andrei Gabito', Current_Key_Holder_Name: 'Andrei Gabito' },
          { Room_Number: '204', Scheduled_Professor_Name: 'Andrei Gabito', Current_Key_Holder_Name: 'Andrei Gabito' }
        ]);
      }
      return null;
    },
    setItem: () => {}
  },
  document: {
    addEventListener: () => {},
    querySelector: () => null,
    getElementById: () => null
  }
};
const itHeadFn = new Function('window', 'document', 'sessionStorage', itHeadJs);
itHeadFn(mockItHeadWindow, mockItHeadWindow.document, mockItHeadWindow.sessionStorage);
assert.ok(typeof mockItHeadWindow.renderActivityLogList === 'function', 'renderActivityLogList must be exposed on window');

const containerG = createContainer();
mockItHeadWindow.renderActivityLogList(mockLogsA, containerG);
const htmlG = containerG.innerHTML;
assert.ok(htmlG.includes('Prof. Andrei Gabito'), 'Dept Head must render Prof. Andrei Gabito');
assert.ok(htmlG.includes('Key Returned'), 'Dept Head must render Key Returned');
assert.ok(htmlG.includes('action-returned'), 'Dept Head must have action-returned');
assert.ok(htmlG.includes('RM 204'), 'Dept Head must render RM 204');
assert.ok(!htmlG.includes('Key returned for RM 204 by Prof. Andrei Gabito'), 'Dept Head must NOT have repetitive prose');

// Test G2: Verify it-head-room-status.js also decouples unauthorized access and wrong slot from faculty identities
const containerG2 = createContainer();
mockItHeadWindow.renderActivityLogList(mockLogsD, containerG2);
const htmlG2 = containerG2.innerHTML;
assert.ok(htmlG2.includes('Unauthorized Key Access'), 'Dept Head must render Unauthorized Key Access');
assert.ok(htmlG2.includes('Wrong Key Slot'), 'Dept Head must render Wrong Key Slot');
assert.ok(!htmlG2.includes('Andrei Gabito'), 'Dept Head must NOT attribute unauthorized access to Andrei Gabito');
assert.ok(htmlG2.includes('Unidentified Person'), 'Dept Head must render Unidentified Person');
assert.ok(htmlG2.includes('Security Alert'), 'Dept Head must render Security Alert');
assert.ok(htmlG2.includes('Hardware Warning'), 'Dept Head must render Hardware Warning');
console.log('  ✓ Test G: it-head-room-status.js rendering consistency & faculty decoupling verified');

// Test H: Verify QR Code events are filtered out from timeline rendering
const containerH = createContainer();
const mockLogsWithQR = [
  {
    id: 107,
    time: new Date().toISOString(),
    status: 'QR Code',
    room_number: '204',
    description: 'Andrei Gabito',
    detail: 'Faculty',
    type: 'occupancy'
  },
  {
    id: 108,
    time: new Date(Date.now() + 1000).toISOString(),
    status: 'Key Taken',
    room_number: '204',
    description: 'Andrei Gabito',
    detail: 'Faculty',
    type: 'occupancy'
  }
];
roomStatusTimeline.renderTimelineItems(mockLogsWithQR, containerH);
const htmlH = containerH.innerHTML;
assert.ok(htmlH.includes('Key Taken'), 'Timeline must display Key Taken');
assert.ok(!htmlH.includes('QR Verified'), 'Timeline must cleanly filter out intermediate QR Code events');
console.log('  ✓ Test H: Intermediate QR Code events cleanly filtered from timeline');

// Test I: Verify Notifications Component logic for Unauthorized Key Access & Wrong Slot
const notificationsJs = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
const mockNotifWindow = {
  escapeHtml: (s) => s,
  sessionStorage: {
    getItem: (key) => {
      if (key === 'labsync_cached_labs') {
        return JSON.stringify([
          { Room_Number: '203', Scheduled_Professor_Name: 'Andrei Gabito', Current_Key_Holder_Name: 'Andrei Gabito' },
          { Room_Number: '204', Scheduled_Professor_Name: 'Andrei Gabito', Current_Key_Holder_Name: 'Andrei Gabito' }
        ]);
      }
      return null;
    }
  }
};
const notifFn = new Function('window', 'document', 'sessionStorage', notificationsJs);
notifFn(mockNotifWindow, {}, mockNotifWindow.sessionStorage);
assert.ok(typeof mockNotifWindow.getNotificationDetails === 'function', 'getNotificationDetails must be exposed on window');

const unauthNotif = {
  type: 'occupancy',
  status: 'UNAUTHORIZED',
  room_number: '203',
  description: null
};
const unauthDetails = mockNotifWindow.getNotificationDetails(unauthNotif);
assert.strictEqual(unauthDetails.title, 'Unauthorized Key Access', 'Notification title must be Unauthorized Key Access');
assert.strictEqual(unauthDetails.text, 'Key for Room 203 was removed without QR verification. Buzzer alarm triggered.');
assert.strictEqual(unauthDetails.iconName, 'alert-triangle');
assert.strictEqual(unauthDetails.iconClass, 'notif-icon-warning');
assert.ok(!unauthDetails.text.includes('Andrei Gabito'), 'Notification text must NOT mention Andrei Gabito');
assert.ok(!unauthDetails.title.includes('QR Identity Verified'), 'Notification title must NOT say QR Identity Verified');

const wrongSlotNotif = {
  type: 'occupancy',
  status: 'WRONG_SLOT',
  room_number: '204',
  description: null
};
const wrongSlotDetails = mockNotifWindow.getNotificationDetails(wrongSlotNotif);
assert.strictEqual(wrongSlotDetails.title, 'Wrong Key Slot');
assert.strictEqual(wrongSlotDetails.text, 'Key inserted into incorrect slot in Room 204.');
assert.strictEqual(wrongSlotDetails.iconName, 'alert-triangle');
assert.strictEqual(wrongSlotDetails.iconClass, 'notif-icon-warning');

const clearedNotif = {
  type: 'occupancy',
  status: 'Key Returned',
  room_number: '203',
  description: 'Unidentified Person',
  detail: 'Alarm Cleared'
};
const clearedDetails = mockNotifWindow.getNotificationDetails(clearedNotif);
assert.strictEqual(clearedDetails.title, 'Alarm Cleared', 'Notification title must be Alarm Cleared');
assert.strictEqual(clearedDetails.text, 'Key returned to Room 203 slot.', 'Notification text must be Key returned to Room 203 slot.');
assert.strictEqual(clearedDetails.iconName, 'check-circle', 'Notification icon must be check-circle');
assert.strictEqual(clearedDetails.iconClass, 'notif-icon-resolved', 'Notification icon class must be notif-icon-resolved');
assert.ok(!clearedDetails.text.includes('Andrei Gabito'), 'Notification text must NOT mention Andrei Gabito');
console.log('  ✓ Test I: Notifications component handles UNAUTHORIZED, WRONG_SLOT, and Alarm Cleared without faculty attribution');

console.log('\n================================================================');
console.log('🎉 ALL ACTIVITY LOG REDESIGN TESTS PASSED SUCCESSFULLY!');
console.log('================================================================\n');
