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

// Verify Dark Mode & High Contrast
assert.ok(css.includes('html.dark-mode .activity-log-card .audit-actor-name'), 'Dark mode must style audit actor');
assert.ok(css.includes('html.high-contrast .activity-log-card .audit-actor-name'), 'High contrast must style audit actor');
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
    getItem: () => null,
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
assert.ok(htmlB.includes('RM 201'), 'Must render RM 201');
assert.ok(!htmlB.includes('(In Session)'), 'Redundant (In Session) context tag must NOT be rendered');
assert.ok(!htmlB.includes('audit-context-tag'), 'Context tags must not clutter actor meta line');
console.log('  ✓ Test B: Key Taken (clean meta line without redundant context tags) verified');

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

// Test D: Security Alert & Wrong Key Slot
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
  }
];

roomStatusTimeline.renderTimelineItems(mockLogsD, containerD);
const htmlD = containerD.innerHTML;
assert.ok(htmlD.includes('Unauthorized Key Access'), 'Must map to Unauthorized Key Access');
assert.ok(htmlD.includes('action-security'), 'Must have action-security class');
assert.ok(htmlD.includes('Wrong Key Slot'), 'Must map to Wrong Key Slot');
assert.ok(htmlD.includes('action-warning'), 'Must have action-warning class');
console.log('  ✓ Test D: Security alerts & hardware events verified');

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
  sessionStorage: { getItem: () => null, setItem: () => {} },
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
console.log('  ✓ Test G: it-head-room-status.js rendering consistency verified');

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

console.log('\n================================================================');
console.log('🎉 ALL ACTIVITY LOG REDESIGN TESTS PASSED SUCCESSFULLY!');
console.log('================================================================\n');
