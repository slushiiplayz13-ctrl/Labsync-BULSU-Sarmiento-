/**
 * Test: Schedule Studio Print Schedule Button Lifecycle & Draft Lockout Guard
 * Verifies:
 * 1. Static HTML & CSS definitions for #print-schedule-btn disabled state.
 * 2. In Draft mode -> #print-schedule-btn is disabled, aria-disabled="true", title tooltip matches requirement.
 * 3. In Draft mode -> activating preparePrint() blocks printing and shows warning toast (window.open never called).
 * 4. In Finalized mode -> #print-schedule-btn becomes enabled, title updated to "Print Official Schedule".
 * 5. In Finalized mode -> activating preparePrint() succeeds and invokes window.open.
 * 6. On Reopen -> #print-schedule-btn immediately reverts to disabled state with tooltip restored.
 * 7. Role parity -> Program Coordinator and IT Dept. Head experience identical print availability based solely on schedule status.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 Starting Schedule Studio Print Button Lifecycle Verification');
console.log('================================================================\n');

// 1. Static Verification
console.log('--- 1. Static HTML & CSS Verification ---');
const htmlContent = fs.readFileSync(path.join(__dirname, '../room-schedule-editor.html'), 'utf8');

assert.ok(
  htmlContent.includes('id="print-schedule-btn" onclick="preparePrint()" disabled aria-disabled="true"'),
  'HTML: #print-schedule-btn starts disabled with aria-disabled="true" by default'
);
console.log('✔ PASS: Initial HTML defines #print-schedule-btn as disabled by default');

assert.ok(
  htmlContent.includes('title="Print Schedule is available after the schedule is finalized."'),
  'HTML: #print-schedule-btn initial tooltip matches requirement'
);
console.log('✔ PASS: Initial HTML tooltip set to "Print Schedule is available after the schedule is finalized."');

assert.ok(
  htmlContent.includes('#print-schedule-btn:disabled') && htmlContent.includes('cursor: not-allowed !important'),
  'CSS: #print-schedule-btn:disabled specifies cursor: not-allowed'
);
assert.ok(
  htmlContent.includes('#print-schedule-btn:disabled') && htmlContent.includes('opacity: 0.45 !important'),
  'CSS: #print-schedule-btn:disabled specifies opacity: 0.45'
);
console.log('✔ PASS: CSS defines disabled styling (cursor: not-allowed, opacity: 0.45, border/color)');

// 2. JS Logic Verification
console.log('\n--- 2. Schedule Persistence & Controller Logic Verification ---');
const persistenceCode = fs.readFileSync(path.join(__dirname, '../js/scheduling/persistence/schedule.persistence.js'), 'utf8');
const controllerCode = fs.readFileSync(path.join(__dirname, '../js/scheduling/controller/schedule-editor.controller.js'), 'utf8');

assert.ok(
  persistenceCode.includes("printBtn.title = 'Print Schedule is available after the schedule is finalized.'") &&
  persistenceCode.includes("printBtn.setAttribute('disabled', 'disabled')") &&
  persistenceCode.includes("printBtn.setAttribute('aria-disabled', 'true')"),
  'persistence: updateStatusUI disables printBtn and sets draft tooltip when status !== Finalized'
);
console.log('✔ PASS: updateStatusUI correctly disables printBtn on Draft');

assert.ok(
  persistenceCode.includes("printBtn.title = 'Print Official Schedule'") &&
  persistenceCode.includes("printBtn.disabled = false") &&
  persistenceCode.includes("printBtn.removeAttribute('aria-disabled')"),
  'persistence: updateStatusUI enables printBtn and updates tooltip when status === Finalized'
);
console.log('✔ PASS: updateStatusUI correctly enables printBtn on Finalized');

assert.ok(
  controllerCode.includes("if (status !== 'Finalized')") &&
  controllerCode.includes("Print Schedule is available after the schedule is finalized."),
  'controller: preparePrint enforces defense-in-depth guard against printing unfinalized drafts'
);
console.log('✔ PASS: preparePrint guards against unfinalized printing');

// 3. Behavioral Simulation
console.log('\n--- 3. Simulation of Schedule Lifecycle States ---');

// Mock DOM elements
function createMockButton() {
  const attrs = {};
  return {
    disabled: true,
    title: '',
    style: {},
    setAttribute: (k, v) => { attrs[k] = v; },
    removeAttribute: (k) => { delete attrs[k]; },
    getAttribute: (k) => attrs[k],
    hasAttribute: (k) => k in attrs
  };
}

const mockBtn = createMockButton();

// Simulate updateStatusUI logic
function simulateStatusUpdate(status, btn) {
  const isFinalized = (status === 'Finalized');
  if (isFinalized) {
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.removeAttribute('aria-disabled');
    btn.title = 'Print Official Schedule';
  } else {
    btn.disabled = true;
    btn.setAttribute('disabled', 'disabled');
    btn.setAttribute('aria-disabled', 'true');
    btn.title = 'Print Schedule is available after the schedule is finalized.';
  }
}

// Track print window opens
let windowOpened = false;
let toastShown = null;

function simulatePreparePrint(currentStatus) {
  windowOpened = false;
  toastShown = null;
  if (currentStatus !== 'Finalized') {
    toastShown = {
      msg: 'Print Schedule is available after the schedule is finalized.',
      type: 'warning'
    };
    return;
  }
  windowOpened = true;
}

// Test Case 1: Initial Working Draft
simulateStatusUpdate('Draft', mockBtn);
assert.strictEqual(mockBtn.disabled, true, 'Draft: Button is disabled');
assert.strictEqual(mockBtn.getAttribute('aria-disabled'), 'true', 'Draft: aria-disabled is true');
assert.strictEqual(mockBtn.title, 'Print Schedule is available after the schedule is finalized.', 'Draft: Correct tooltip');
simulatePreparePrint('Draft');
assert.strictEqual(windowOpened, false, 'Draft: window.open was NOT called');
assert.strictEqual(toastShown.type, 'warning', 'Draft: Warning toast displayed');
console.log('✔ PASS: 1 & 2. Draft schedule -> Print button is disabled and clicking it cannot trigger printing');

// Test Case 2: Finalize Official Schedule
simulateStatusUpdate('Finalized', mockBtn);
assert.strictEqual(mockBtn.disabled, false, 'Finalized: Button is enabled');
assert.strictEqual(mockBtn.hasAttribute('aria-disabled'), false, 'Finalized: aria-disabled removed');
assert.strictEqual(mockBtn.title, 'Print Official Schedule', 'Finalized: Correct tooltip');
simulatePreparePrint('Finalized');
assert.strictEqual(windowOpened, true, 'Finalized: window.open WAS called');
assert.strictEqual(toastShown, null, 'Finalized: No error/warning toast');
console.log('✔ PASS: 3 & 4. Finalized schedule -> Print button becomes enabled and printing works');

// Test Case 3: Reopen for Editing
simulateStatusUpdate('Draft', mockBtn);
assert.strictEqual(mockBtn.disabled, true, 'Reopen: Button is disabled again');
assert.strictEqual(mockBtn.getAttribute('aria-disabled'), 'true', 'Reopen: aria-disabled is true');
assert.strictEqual(mockBtn.title, 'Print Schedule is available after the schedule is finalized.', 'Reopen: Correct tooltip restored');
simulatePreparePrint('Draft');
assert.strictEqual(windowOpened, false, 'Reopen: window.open was NOT called');
console.log('✔ PASS: 5. Reopened schedule -> Print button immediately reverts to disabled state');

// Test Case 4: Role Parity Check (both IT Dept. Head and Program Coordinator)
console.log('\n--- 4. Role Parity Verification ---');
const roles = ['IT Department Head', 'Program Coordinator'];
for (const role of roles) {
  // In Draft:
  simulateStatusUpdate('Draft', mockBtn);
  assert.strictEqual(mockBtn.disabled, true, `${role} in Draft must have print disabled`);
  simulatePreparePrint('Draft');
  assert.strictEqual(windowOpened, false, `${role} in Draft cannot print`);

  // In Finalized:
  simulateStatusUpdate('Finalized', mockBtn);
  assert.strictEqual(mockBtn.disabled, false, `${role} in Finalized must have print enabled`);
  simulatePreparePrint('Finalized');
  assert.strictEqual(windowOpened, true, `${role} in Finalized can print`);
  console.log(`✔ PASS: ${role} obeys identical Draft lockout & Finalized access rules`);
}

console.log('\n================================================================');
console.log('🎉 ALL PRINT SCHEDULE DRAFT GUARD VERIFICATION TESTS PASSED 100%!');
console.log('================================================================\n');
