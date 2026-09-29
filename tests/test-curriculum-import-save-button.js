const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 Starting Import Subjects Save Button State QA Verification Tests');
console.log('================================================================\n');

// 1. Static HTML & CSS checks
console.log('--- 1. Static HTML & CSS Markup Verification ---');
const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'master-schedule.html'), 'utf8');
assert(htmlContent.includes('id="saveImportCurriculumBtn"'), 'Button #saveImportCurriculumBtn must exist');
assert(htmlContent.includes('id="saveImportCurriculumBtn" class="import-btn-save" type="button" disabled'), 'Button must start disabled in HTML');
console.log('✔ PASS: master-schedule.html button has disabled attribute by default');

const modalsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'modals.css'), 'utf8');
assert(modalsCss.includes('#saveImportCurriculumBtn:disabled') || modalsCss.includes('.import-btn-save:disabled'), 'CSS must define disabled state for import-btn-save');
console.log('✔ PASS: modals.css defines disabled state styling for saveImportCurriculumBtn');

// 2. Unit Testing curriculum-import.modal.js behavior in simulated DOM
console.log('\n--- 2. Simulated DOM Lifecycle Verification ---');
const jsContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'master-schedule', 'curriculum', 'curriculum-import.modal.js'), 'utf8');

const elements = {};
const listeners = {};

function createElement(id, tagName = 'div') {
  const el = {
    id,
    tagName: tagName.toUpperCase(),
    classList: {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); }
    },
    textContent: '',
    value: '',
    style: {},
    innerHTML: '',
    attributes: {},
    disabled: false,
    setAttribute(k, v) { this.attributes[k] = v; if (k === 'disabled') this.disabled = true; },
    removeAttribute(k) { delete this.attributes[k]; if (k === 'disabled') this.disabled = false; },
    addEventListener(evt, fn) {
      if (!listeners[id]) listeners[id] = {};
      listeners[id][evt] = fn;
    },
    querySelector(sel) {
      return null;
    }
  };
  return el;
}

elements['importCurriculumModal'] = createElement('importCurriculumModal');
elements['openImportCurriculumBtn'] = createElement('openImportCurriculumBtn', 'button');
elements['closeImportCurriculumModalBtn'] = createElement('closeImportCurriculumModalBtn', 'button');
elements['cancelImportCurriculumBtn'] = createElement('cancelImportCurriculumBtn', 'button');
elements['curriculumFileInput'] = createElement('curriculumFileInput', 'input');
elements['dropZone'] = createElement('dropZone');
elements['downloadSampleCsvBtn'] = createElement('downloadSampleCsvBtn', 'button');
elements['saveImportCurriculumBtn'] = createElement('saveImportCurriculumBtn', 'button');
elements['clearCurriculumBtn'] = createElement('clearCurriculumBtn', 'button');
elements['curriculumTableBody'] = createElement('curriculumTableBody');

global.document = {
  getElementById(id) { return elements[id] || null; },
  querySelector(sel) {
    if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
    return null;
  }
};

let toastMsg = null;
global.window = {
  curriculumImport: {
    processUploadedFile(file, cb) {
      cb([
        { Subject_Code: 'CC 102', Subject_Name: 'Intro to Computing' },
        { Subject_Code: 'IT 104*', Subject_Name: 'Discrete Mathematics' }
      ]);
    }
  },
  showToast(msg, type) { toastMsg = { msg, type }; },
  setModalOpenState() {}
};

global.curriculumService = {
  async getCurriculum() {
    return [
      { Subject_Code: 'EXISTING 101', Subject_Name: 'Existing Subject' }
    ];
  },
  async deleteCurriculum() {
    return true;
  }
};
global.window.curriculumService = global.curriculumService;

eval(jsContent);

global.confirm = () => true;

// Test Initial State
window.curriculumImportModal.initCurriculumImportModal();
const saveBtn = elements['saveImportCurriculumBtn'];
assert.strictEqual(saveBtn.disabled, true, 'Save button must be disabled initially');
console.log('✔ PASS: Button is disabled upon initialization');

// Test Opening Modal with Existing Curriculum
listeners['openImportCurriculumBtn']['click']();
assert.strictEqual(window.curriculumImportModal.isFileUploaded, false, 'isFileUploaded must be false when modal opens with existing curriculum');
assert.strictEqual(saveBtn.disabled, true, 'Save button must remain disabled when existing curriculum is loaded without user file');
console.log('✔ PASS: Button remains disabled when existing curriculum is loaded');

// Test Clicking Save without File
listeners['saveImportCurriculumBtn']['click']();
assert(toastMsg && toastMsg.msg.includes('Please add and upload'), 'Should display warning toast when clicking save without uploading');
console.log('✔ PASS: Clicking Save without uploaded file triggers warning and blocks save');

// Test Adding a File via file input
const mockFile = { name: 'new_subjects.xlsx' };
listeners['curriculumFileInput']['change']({ target: { files: [mockFile], value: 'fake' } });
assert.strictEqual(window.curriculumImportModal.isFileUploaded, true, 'isFileUploaded must be true after file is parsed');
assert.strictEqual(saveBtn.disabled, false, 'Save button must be enabled once a file is added');
console.log('✔ PASS: Button becomes enabled after adding a file');

// Test Clearing Curriculum
(async () => {
  await listeners['clearCurriculumBtn']['click']();
  assert.strictEqual(window.curriculumImportModal.isFileUploaded, false, 'isFileUploaded must be reset after clear');
  assert.strictEqual(saveBtn.disabled, true, 'Save button must be disabled after clear');
  console.log('✔ PASS: Button becomes disabled after clearing subjects');

  // Test Uploading Again then Closing Modal
  listeners['curriculumFileInput']['change']({ target: { files: [mockFile], value: 'fake' } });
  assert.strictEqual(saveBtn.disabled, false, 'Button re-enabled after uploading file again');
  listeners['closeImportCurriculumModalBtn']['click']();
  // Simulate close timeout
  listeners['openImportCurriculumBtn']['click']();
  assert.strictEqual(saveBtn.disabled, true, 'Button is reset to disabled upon re-opening modal');
  console.log('✔ PASS: Button resets to disabled whenever modal is re-opened');

  console.log('\n================================================================');
  console.log('🎉 ALL CURRICULUM IMPORT SAVE BUTTON TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
})();
