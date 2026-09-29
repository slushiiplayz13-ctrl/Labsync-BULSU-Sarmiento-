const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 Starting Submit PC Report Issue/Remarks Requirement Tests');
console.log('================================================================\n');

// 1. Check submit-pc-report.html markup
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'submit-pc-report.html'), 'utf8');
assert(htmlContent.includes('id="submit-button" disabled'), 'Submit button must start disabled');
console.log('✔ PASS: submit-pc-report.html markup verified');

// 2. Simulate browser environment for submit-pc-report.js
const jsContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'submit-pc-report.js'), 'utf8');

const elements = {};
const listeners = {};

function createElement(id, classes = '') {
  const el = {
    id,
    classList: {
      _classes: new Set(classes.split(' ').filter(Boolean)),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) {
        if (force !== undefined) {
          force ? this.add(c) : this.remove(c);
        } else {
          this._classes.has(c) ? this.remove(c) : this.add(c);
        }
      },
      contains(c) { return this._classes.has(c); }
    },
    textContent: '',
    value: '',
    style: {},
    innerHTML: '',
    attributes: {},
    disabled: classes.includes('btn-disabled'),
    setAttribute(k, v) { this.attributes[k] = v; if (k === 'disabled') this.disabled = true; },
    removeAttribute(k) { delete this.attributes[k]; if (k === 'disabled') this.disabled = false; },
    addEventListener(evt, fn) {
      if (!listeners[id]) listeners[id] = {};
      listeners[id][evt] = fn;
    },
    querySelector(sel) {
      return null;
    },
    focus() {}
  };
  return el;
}

elements['room-display'] = createElement('room-display');
elements['pc-display'] = createElement('pc-display');
elements['current-date'] = createElement('current-date');
elements['student-name'] = createElement('student-name');
elements['student-section'] = createElement('student-section');
elements['remarks'] = createElement('remarks');
elements['remarks-char-counter'] = createElement('remarks-char-counter');
elements['custom-checkbox'] = createElement('custom-checkbox');
elements['submit-button'] = createElement('submit-button', 'submit-btn btn-disabled');
elements['success-modal'] = createElement('success-modal');
elements['ticket-id'] = createElement('ticket-id');

let toastCalled = null;

global.document = {
  getElementById(id) { return elements[id] || null; },
  querySelector(sel) {
    if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
    if (sel === '.confirm-row') return createElement('confirm-row');
    if (sel === '.equipment-section') return createElement('equipment-section');
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener(evt, fn) {
    if (!listeners['document']) listeners['document'] = {};
    listeners['document'][evt] = fn;
  },
  readyState: 'complete',
  activeElement: null
};

global.window = {
  location: { search: '?room=203&pc=1' },
  lucide: { createIcons() {} },
  showToast(msg, type, title) {
    toastCalled = { msg, type, title };
  }
};

eval(jsContent);

console.log('\n--- 2. Testing hasReportableIssue logic ---');
assert.strictEqual(window.hasReportableIssue(), false, 'Initially hasReportableIssue must be false (all working, empty remarks)');
console.log('✔ PASS: Initial state hasReportableIssue is false');

console.log('\n--- 3. Testing Submit Button Disabled State without Issue ---');
// Toggle checkbox on
window.toggleCheckbox(true);
assert.strictEqual(elements['submit-button'].disabled, true, 'Submit button must stay disabled when confirmed but NO equipment issue or remarks');
assert(elements['submit-button'].classList.contains('btn-disabled'), 'Submit button must retain btn-disabled class');
console.log('✔ PASS: Checkbox checked without issue keeps button disabled');

console.log('\n--- 4. Testing Submit Button Enabled on Equipment Issue ---');
// Mock equipment card button and toggle Keyboard to issue
const mockCard = {
  dataset: { component: 'Keyboard' },
  querySelector() { return { querySelectorAll() { return []; } }; },
  classList: { add() {}, remove() {} }
};
const mockBtn = {
  closest(sel) { return sel === '.equipment-card' ? mockCard : null; },
  classList: { add() {}, remove() {} }
};
window.toggleStatus(mockBtn, 'issue');
assert.strictEqual(window.hasReportableIssue(), true, 'hasReportableIssue must be true when Keyboard has issue');
assert.strictEqual(elements['submit-button'].disabled, false, 'Submit button must be ENABLED when confirmed and equipment issue exists');
assert(!elements['submit-button'].classList.contains('btn-disabled'), 'Submit button must not have btn-disabled');
console.log('✔ PASS: Flagging equipment issue enables submit button');

console.log('\n--- 5. Testing Submit Button when Reverting Equipment to Working ---');
window.toggleStatus(mockBtn, 'working');
assert.strictEqual(window.hasReportableIssue(), false, 'hasReportableIssue must be false when Keyboard reverted to working');
assert.strictEqual(elements['submit-button'].disabled, true, 'Submit button must disable when equipment issue cleared');
console.log('✔ PASS: Reverting equipment to working disables button');

console.log('\n--- 6. Testing Submit Button with Remarks Only ---');
elements['remarks'].value = 'Broken screen cable loose';
if (listeners['remarks'] && listeners['remarks']['input']) {
  listeners['remarks']['input']();
} else {
  window.updateSubmitButtonState();
}
assert.strictEqual(window.hasReportableIssue(), true, 'hasReportableIssue must be true with remarks entered');
assert.strictEqual(elements['submit-button'].disabled, false, 'Submit button must be ENABLED with remarks only');
console.log('✔ PASS: Entering remarks enables submit button even if no equipment flagged');

console.log('\n--- 7. Testing Submit Button when Remarks Cleared ---');
elements['remarks'].value = '   ';
if (listeners['remarks'] && listeners['remarks']['input']) {
  listeners['remarks']['input']();
} else {
  window.updateSubmitButtonState();
}
assert.strictEqual(window.hasReportableIssue(), false, 'hasReportableIssue must be false when remarks only whitespace');
assert.strictEqual(elements['submit-button'].disabled, true, 'Submit button must disable when remarks cleared');
console.log('✔ PASS: Clearing remarks disables submit button');

console.log('\n--- 8. Testing handleSubmit validation block when no issue ---');
elements['student-name'].value = 'Juan Dela Cruz';
elements['student-section'].value = 'BSIT 3A';
let apiCalled = false;
window.submitReport = async () => { apiCalled = true; };

toastCalled = null;
window.handleSubmit();
assert.strictEqual(apiCalled, false, 'API must NOT be called when no issue/remarks are present');
assert(toastCalled && toastCalled.title === 'No Issue Reported', 'Warning toast must be displayed when submitting without issue');
console.log('✔ PASS: handleSubmit blocks submission and shows toast');

console.log('\n--- 9. Testing Backend Service Rejection ---');
const maintenanceService = require('../services/maintenanceService');
(async () => {
  const result = await maintenanceService.submitReport({
    roomNumber: '203',
    pcNumber: '1',
    studentName: 'Juan Dela Cruz',
    studentSection: 'BSIT 3A',
    components: {
      'PC/Laptop': 'working',
      'Monitor': 'working',
      'System Unit': 'working',
      'Keyboard': 'working',
      'Mouse': 'working'
    },
    remarks: ''
  });

  assert.strictEqual(result.status, 400, 'Backend must return HTTP 400');
  assert(result.error.includes('No equipment issue was selected and no issue remarks were provided'), 'Error message must state no equipment issue or remarks');
  console.log('✔ PASS: Backend maintenanceService rejects empty issue report with HTTP 400');

  console.log('\n================================================================');
  console.log('🎉 ALL ISSUE/REMARKS REQUIREMENT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
  process.exit(0);
})();
