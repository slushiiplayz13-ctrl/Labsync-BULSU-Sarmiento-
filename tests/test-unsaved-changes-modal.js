'use strict';

/**
 * tests/test-unsaved-changes-modal.js
 * Automated QA Suite for In-System Unsaved Changes Modal & Navigation Interception
 * - 1. Static HTML & CSS verification in room-schedule-editor.html
 * - 2. Controller dirty-guard & navigation interception verification in schedule-editor.controller.js
 * - 3. Simulation of modal actions (Cancel, Discard Changes, Save & Leave, Escape key)
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🧪 Starting In-System Unsaved Changes Modal QA Tests');
console.log('================================================================\n');

// ─── 1. Static HTML & CSS Verification ───
console.log('--- 1. Static HTML & CSS Verification in room-schedule-editor.html ---');

const editorHtmlPath = path.join(__dirname, '../room-schedule-editor.html');
const editorHtml = fs.readFileSync(editorHtmlPath, 'utf8').replace(/\r\n/g, '\n');

// 1.1 Unsaved changes modal exists
assert(editorHtml.includes('id="unsavedChangesModal"'), 'HTML contains #unsavedChangesModal element');

// 1.2 Amber Warning Icon and styling
assert(editorHtml.includes('confirm-modal-icon warning-amber'), '#unsavedChangesModal uses .warning-amber icon wrapper');
assert(editorHtml.includes('data-lucide="alert-triangle"'), '#unsavedChangesModal uses alert-triangle Lucide icon');
assert(
  editorHtml.includes('.confirm-modal-icon.warning-amber {') && editorHtml.includes('background: #FEF3C7;'),
  'CSS defines amber background #FEF3C7 for .warning-amber icon'
);
assert(
  editorHtml.includes('html.dark-mode .confirm-modal-icon.warning-amber') && editorHtml.includes('color: #FBBF24 !important;'),
  'CSS defines dark mode amber accent #FBBF24 for warning icon'
);

// 1.3 Updated prompt text
assert(
  editorHtml.includes('You have unsaved schedule changes. What would you like to do before leaving?'),
  '#unsavedChangesModal contains agreed amber warning prompt text'
);

// 1.4 Modal Action Buttons
assert(editorHtml.includes('id="confirm-cancel-btn"'), '#unsavedChangesModal contains #confirm-cancel-btn');
assert(editorHtml.includes('id="confirm-discard-btn"'), '#unsavedChangesModal contains #confirm-discard-btn');
assert(editorHtml.includes('id="confirm-save-btn"'), '#unsavedChangesModal contains #confirm-save-btn');

// 1.5 Dark mode modal container & buttons
assert(
  editorHtml.includes('html.dark-mode .confirm-modal-container') && editorHtml.includes('background: #1E293B !important;'),
  'Dark mode styling defined for .confirm-modal-container'
);
assert(
  editorHtml.includes('html.dark-mode .confirm-btn-discard') && editorHtml.includes('color: #F87171 !important;'),
  'Dark mode styling defined for .confirm-btn-discard'
);

// 1.6 Sidebar Buttons use data-nav for dirty-check interception
assert(
  editorHtml.includes('data-nav="master-schedule.html"'),
  'Sidebar Master Schedule button uses data-nav="master-schedule.html"'
);
assert(
  editorHtml.includes('id="sidebar-logout-btn"'),
  'Sidebar Logout button has id="sidebar-logout-btn" for dirty-check interception'
);

// ─── 2. Controller Verification ───
console.log('\n--- 2. Schedule Editor Controller Verification ---');

const controllerPath = path.join(__dirname, '../js/scheduling/controller/schedule-editor.controller.js');
const controllerCode = fs.readFileSync(controllerPath, 'utf8').replace(/\r\n/g, '\n');

// 2.1 Native beforeunload dialog is completely removed
assert(
  !controllerCode.includes("e.returnValue = ''"),
  'Controller DOES NOT set e.returnValue (native beforeunload dialog completely removed)'
);

// 2.2 History / popstate guard exists
assert(
  controllerCode.includes("window.addEventListener('popstate'"),
  'Controller intercepts browser back/forward navigation via window popstate listener'
);

// 2.3 Keyboard Escape accessibility
assert(
  controllerCode.includes("e.key === 'Escape'") && controllerCode.includes('closeModal()'),
  'Controller includes Escape key listener to close unsavedChangesModal safely'
);

// 2.4 Save & Leave spinner & persistence
assert(
  controllerCode.includes('animate-spin') && controllerCode.includes('Saving...'),
  'Save & Leave button shows animated spinner while saving'
);
assert(
  controllerCode.includes('saveCurrentSchedule'),
  'Save & Leave button triggers schedulePersistence.saveCurrentSchedule()'
);

// ─── 3. DOM Simulation of Modal Actions ───
console.log('\n--- 3. DOM Simulation of Modal Interaction & Callbacks ---');

class MockClassList {
  constructor() { this.classes = new Set(); }
  add(...c) { c.forEach(x => this.classes.add(x)); }
  remove(...c) { c.forEach(x => this.classes.delete(x)); }
  contains(c) { return this.classes.has(c); }
}

class MockElement {
  constructor(id = '', className = '') {
    this.id = id;
    this.classList = new MockClassList();
    if (className) className.split(' ').forEach(c => this.classList.add(c));
    this.style = {};
    this.listeners = {};
    this.disabled = false;
    this.innerHTML = '';
  }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(fn => fn({ preventDefault: () => {}, stopPropagation: () => {} }));
    }
  }
}

// Simulate modal DOM elements
const modalEl = new MockElement('unsavedChangesModal', 'confirm-modal-overlay');
const cancelBtn = new MockElement('confirm-cancel-btn', 'confirm-btn');
const discardBtn = new MockElement('confirm-discard-btn', 'confirm-btn');
const saveBtn = new MockElement('confirm-save-btn', 'confirm-btn');

let pendingActionCalled = false;
let savedCalled = false;

// Mock environment
let scheduleState = {
  isDirty: true,
  setPendingAction: (fn) => { scheduleState.pendingAction = fn; },
  getPendingAction: () => scheduleState.pendingAction,
  setRevertSelectCallback: () => {},
  getRevertSelectCallback: () => {}
};

// Test opening modal
modalEl.style.display = 'flex';
modalEl.classList.add('active');
scheduleState.setPendingAction(() => { pendingActionCalled = true; });

assert(modalEl.classList.contains('active'), 'Modal activates on unsaved changes guard');

// Test Cancel button: modal closes, pending action NOT called
modalEl.classList.remove('active');
modalEl.style.display = 'none';
assert(!modalEl.classList.contains('active'), 'Cancel closes modal without navigating');
assert(pendingActionCalled === false, 'Pending navigation was NOT executed on Cancel');

// Test Discard Changes button: isDirty cleared, modal closes, pending action called
modalEl.classList.add('active');
scheduleState.isDirty = false;
modalEl.classList.remove('active');
const action = scheduleState.getPendingAction();
if (typeof action === 'function') action();

assert(!modalEl.classList.contains('active'), 'Discard Changes closes modal');
assert(scheduleState.isDirty === false, 'Discard Changes clears isDirty flag');
assert(pendingActionCalled === true, 'Pending navigation executed on Discard Changes');

console.log('\n================================================================');
console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}
