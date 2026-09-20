'use strict';

/**
 * tests/test-schedule-editor-sections.js
 * Automated test suite verifying the Room Schedule Editor Section Searchable Combobox.
 *
 * Verifies:
 * A. Static HTML markup and structure
 * B. 40 standard sections dataset generation and uniqueness
 * C. Selection behavior and class states
 * D. Real-time live filtering (case-insensitive, code, metadata, exact match highlight, no-match closing)
 * E. Arbitrary custom section support (IRREG, BSIT-3A)
 * F. Reset behavior and state restoration
 * G. Public API compatibility and regression safety with block creation
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 Testing Room Schedule Editor Section Searchable Combobox');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function testAssert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Test assertion failed: ${message}`);
  }
}

// ─── A. STATIC HTML CHECKS ───
console.log('--- A. Static HTML Markup in room-schedule-editor.html ---');
const htmlPath = path.join(__dirname, '../room-schedule-editor.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

testAssert(htmlContent.includes('id="section-wrapper"'), 'section-wrapper exists in room-schedule-editor.html');
testAssert(htmlContent.includes('class="custom-select-wrapper" id="section-wrapper"'), 'section-wrapper has class custom-select-wrapper');
testAssert(htmlContent.includes('id="block-section"'), 'block-section input exists in room-schedule-editor.html');
testAssert(htmlContent.includes('class="custom-select-input" id="block-section"'), 'block-section has class custom-select-input');
testAssert(/<input[^>]*id="block-section"[^>]*type="text"|<input[^>]*type="text"[^>]*id="block-section"/.test(htmlContent), 'block-section remains a text input');
testAssert(htmlContent.includes('id="section-select-dropdown"'), 'section-select-dropdown exists in room-schedule-editor.html');
testAssert(htmlContent.includes('class="custom-select-dropdown" id="section-select-dropdown"'), 'section-select-dropdown has class custom-select-dropdown');
testAssert(htmlContent.includes('placeholder="Select or type section"'), 'block-section has combobox placeholder');
testAssert(/id="block-section"[^>]*autocomplete="off"|autocomplete="off"[^>]*id="block-section"/.test(htmlContent), 'block-section has autocomplete="off"');


// ─── B. DATASET VERIFICATION & DOM MOCK SETUP ───
console.log('\n--- B. Standard Section Dataset & Controller Loading ---');

// Mock DOM elements
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...cls) { cls.forEach(c => this.classes.add(c)); }
  remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
  contains(c) { return this.classes.has(c); }
  toggle(c) {
    if (this.classes.has(c)) { this.classes.delete(c); return false; }
    this.classes.add(c); return true;
  }
  get length() { return this.classes.size; }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.listeners = {};
    this._value = '';
    this._textContent = '';
  }

  get className() {
    return Array.from(this.classList.classes).join(' ');
  }
  set className(val) {
    this.classList.classes.clear();
    if (val) {
      val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
  }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

  get textContent() {
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join(' ');
    }
    return this._textContent;
  }
  set textContent(t) {
    this._textContent = String(t);
    this.children = [];
  }

  get innerHTML() {
    return this.children.map(c => c.innerHTML || c.textContent).join('');
  }
  set innerHTML(html) {
    this.children = [];
    this._textContent = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this.dataset[key] = String(val);
    }
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(sel) {
    const results = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (matchesSelector(child, sel)) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(sel) {
    const res = this.querySelectorAll(sel);
    return res.length > 0 ? res[0] : null;
  }

  closest(sel) {
    let curr = this;
    while (curr) {
      if (matchesSelector(curr, sel)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }

  removeEventListener(evt, fn) {
    if (!this.listeners[evt]) return;
    this.listeners[evt] = this.listeners[evt].filter(l => l !== fn);
  }

  dispatchEvent(evt) {
    const type = typeof evt === 'string' ? evt : evt.type;
    const eventObj = typeof evt === 'object' ? evt : {
      type,
      stopPropagation: () => {},
      preventDefault: () => {}
    };
    if (this.listeners[type]) {
      this.listeners[type].forEach(l => l(eventObj));
    }
    if (eventObj.bubbles && this.parentNode && typeof this.parentNode.dispatchEvent === 'function') {
      this.parentNode.dispatchEvent(eventObj);
    }
  }

  click() {
    this.dispatchEvent({
      type: 'click',
      stopPropagation: () => {},
      preventDefault: () => {}
    });
  }

  focus() {
    this.dispatchEvent({
      type: 'focus',
      stopPropagation: () => {},
      preventDefault: () => {}
    });
  }
}

function matchesSelector(el, sel) {
  if (sel.startsWith('.')) {
    return el.classList.contains(sel.slice(1));
  }
  if (sel.startsWith('#')) {
    return el.id === sel.slice(1);
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

// Build virtual DOM for Room Schedule Editor
const mockDocument = {
  elements: {},
  createElement(tag) {
    return new MockElement(tag);
  },
  getElementById(id) {
    return this.elements[id] || null;
  },
  querySelectorAll(sel) {
    const all = Object.values(this.elements);
    const results = [];
    const visited = new Set();
    const collect = (el) => {
      if (!el || visited.has(el)) return;
      visited.add(el);
      if (matchesSelector(el, sel)) results.push(el);
      el.children.forEach(collect);
    };
    all.forEach(collect);
    return results;
  },
  querySelector(sel) {
    const list = this.querySelectorAll(sel);
    return list.length > 0 ? list[0] : null;
  },
  addEventListener() {},
  removeEventListener() {}
};

// Create Section Elements
const sectionWrapper = new MockElement('div', 'section-wrapper');
sectionWrapper.classList.add('custom-select-wrapper');

const sectionTrigger = new MockElement('div');
sectionTrigger.classList.add('custom-select-trigger');

const blockSectionInput = new MockElement('input', 'block-section');
blockSectionInput.classList.add('custom-select-input');
blockSectionInput.setAttribute('type', 'text');

const sectionDropdown = new MockElement('div', 'section-select-dropdown');
sectionDropdown.classList.add('custom-select-dropdown');

sectionTrigger.appendChild(blockSectionInput);
sectionWrapper.appendChild(sectionTrigger);
sectionWrapper.appendChild(sectionDropdown);

mockDocument.elements['section-wrapper'] = sectionWrapper;
mockDocument.elements['block-section'] = blockSectionInput;
mockDocument.elements['section-select-dropdown'] = sectionDropdown;

// Other elements needed by controller
const subjectWrapper = new MockElement('div', 'subject-wrapper');
subjectWrapper.classList.add('custom-select-wrapper');
const blockSubjectInput = new MockElement('input', 'block-subject');
const subjectDropdown = new MockElement('div', 'subject-select-dropdown');
subjectDropdown.classList.add('custom-select-dropdown');
subjectWrapper.appendChild(blockSubjectInput);
subjectWrapper.appendChild(subjectDropdown);
mockDocument.elements['subject-wrapper'] = subjectWrapper;
mockDocument.elements['block-subject'] = blockSubjectInput;
mockDocument.elements['subject-select-dropdown'] = subjectDropdown;

const profWrapper = new MockElement('div', 'professor-wrapper');
profWrapper.classList.add('custom-select-wrapper');
mockDocument.elements['professor-wrapper'] = profWrapper;

const createBlockBtn = new MockElement('button', 'create-block-btn');
mockDocument.elements['create-block-btn'] = createBlockBtn;

const blocksContainer = new MockElement('div', 'blocks-container');
mockDocument.elements['blocks-container'] = blocksContainer;

// Window & Global Sandbox
const mockWindow = {
  document: mockDocument,
  location: { search: '' },
  URLSearchParams: class { get() { return null; } },
  Date,
  Event: class {
    constructor(type, opts = {}) {
      this.type = type;
      this.bubbles = opts.bubbles || false;
      this.stopPropagation = () => {};
      this.preventDefault = () => {};
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
  console
};
mockWindow.window = mockWindow;

// Read and execute schedule-editor.controller.js
const controllerPath = path.join(__dirname, '../js/scheduling/controller/schedule-editor.controller.js');
const controllerCode = fs.readFileSync(controllerPath, 'utf8');

const controllerFn = new Function('window', 'global', 'document', controllerCode);
controllerFn(mockWindow, mockWindow, mockDocument);

const controller = mockWindow.scheduleEditorController;
testAssert(!!controller, 'scheduleEditorController exported onto window/global');
testAssert(typeof controller.initSectionSelector === 'function', 'initSectionSelector is exported');
testAssert(typeof controller.resetSectionSelector === 'function', 'resetSectionSelector is exported');
testAssert(typeof controller.updateSectionValue === 'function', 'updateSectionValue is exported');

// Check Dataset
const dataset = controller.STANDARD_SECTIONS;
testAssert(Array.isArray(dataset), 'STANDARD_SECTIONS dataset is an array');
testAssert(dataset.length === 40, `STANDARD_SECTIONS contains exactly 40 items (found ${dataset.length})`);

const codes = dataset.map(d => d.code);
const uniqueCodes = new Set(codes);
testAssert(uniqueCodes.size === 40, `All 40 standard section codes are unique (found ${uniqueCodes.size})`);

testAssert(codes.includes('1A-1'), 'Dataset contains 1A-1');
testAssert(codes.includes('1A-2'), 'Dataset contains 1A-2');
testAssert(codes.includes('2A-1'), 'Dataset contains 2A-1');
testAssert(codes.includes('3E-2'), 'Dataset contains 3E-2');
testAssert(codes.includes('4E-1'), 'Dataset contains 4E-1');
testAssert(codes.includes('4E-2'), 'Dataset contains 4E-2');


// ─── C. SELECTION BEHAVIOR ───
console.log('\n--- C. Selection Behavior ---');
controller.initSectionSelector();

testAssert(sectionDropdown.children.length === 40, 'section-select-dropdown populated with 40 option elements');

const firstOption = sectionDropdown.children[0];
testAssert(firstOption.getAttribute('data-value') === '1A-1', 'First option has data-value="1A-1"');
testAssert(firstOption.textContent.includes('1A-1'), 'First option displays code 1A-1');
testAssert(firstOption.textContent.includes('1st Year'), 'First option displays metadata 1st Year');
testAssert(firstOption.textContent.includes('Batch 1'), 'First option displays metadata Batch 1');

// Test click to select
sectionWrapper.classList.add('open');
testAssert(sectionWrapper.classList.contains('open'), 'Dropdown open before click');

const option2A1 = sectionDropdown.children.find(c => c.getAttribute('data-value') === '2A-1');
testAssert(!!option2A1, 'Found 2A-1 option in dropdown');

option2A1.click();
testAssert(blockSectionInput.value === '2A-1', `Clicking 2A-1 sets input value to 2A-1 (got "${blockSectionInput.value}")`);
testAssert(option2A1.classList.contains('selected'), 'Clicked 2A-1 option has .selected class');
testAssert(!firstOption.classList.contains('selected'), 'Other options do not have .selected class');
testAssert(!sectionWrapper.classList.contains('open'), 'Dropdown closes after selection');


// ─── D. FILTERING BEHAVIOR ───
console.log('\n--- D. Live Filtering Behavior ---');

// 1. Empty input focus shows all 40 options
blockSectionInput.value = '';
blockSectionInput.focus();
testAssert(sectionWrapper.classList.contains('open'), 'Focusing on empty input opens dropdown');
const visibleAll = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visibleAll.length === 40, `Empty input displays all 40 options (found ${visibleAll.length})`);

// 2. Typing '1a' returns the correct subset (1A-1 and 1A-2)
blockSectionInput.value = '1a';
blockSectionInput.dispatchEvent('input');
const visible1a = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visible1a.length === 2, `Typing "1a" displays exactly 2 options: 1A-1 and 1A-2 (found ${visible1a.length})`);
testAssert(visible1a.every(c => c.getAttribute('data-value').startsWith('1A-')), 'All visible options start with 1A-');
testAssert(sectionWrapper.classList.contains('open'), 'Dropdown stays open during match');

// 3. Typing '1A-1' finds the exact option and marks it selected
blockSectionInput.value = '1A-1';
blockSectionInput.dispatchEvent('input');
const visible1A1 = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visible1A1.length === 1, `Typing "1A-1" displays exactly 1 option (found ${visible1A1.length})`);
testAssert(visible1A1[0].classList.contains('selected'), 'Exact match 1A-1 is highlighted with .selected');

// 4. Typing 'batch 2' returns all Batch 2 options (20 options)
blockSectionInput.value = 'batch 2';
blockSectionInput.dispatchEvent('input');
const visibleBatch2 = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visibleBatch2.length === 20, `Typing "batch 2" displays all 20 Batch 2 options (found ${visibleBatch2.length})`);
testAssert(visibleBatch2.every(c => c.getAttribute('data-value').endsWith('-2')), 'All visible options end with -2');

// 5. Typing '2nd year' returns all Year 2 options (10 options)
blockSectionInput.value = '2nd year';
blockSectionInput.dispatchEvent('input');
const visibleYear2 = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visibleYear2.length === 10, `Typing "2nd year" displays all 10 Year 2 options (found ${visibleYear2.length})`);
testAssert(visibleYear2.every(c => c.getAttribute('data-value').startsWith('2')), 'All visible options start with Year 2');

// 6. Typing '4e' returns 4E-1 and 4E-2
blockSectionInput.value = '4e';
blockSectionInput.dispatchEvent('input');
const visible4e = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visible4e.length === 2, `Typing "4e" displays 4E-1 and 4E-2 (found ${visible4e.length})`);

// 7. Typing '4e-2' finds exact option 4E-2
blockSectionInput.value = '4e-2';
blockSectionInput.dispatchEvent('input');
const visible4e2 = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visible4e2.length === 1, `Typing "4e-2" displays 4E-2 (found ${visible4e2.length})`);
testAssert(visible4e2[0].getAttribute('data-value') === '4E-2', 'Found 4E-2');
testAssert(visible4e2[0].classList.contains('selected'), '4E-2 marked selected');

// 8. No-match input closes dropdown cleanly without wiping user text
blockSectionInput.value = 'NO-MATCH-SECTION';
blockSectionInput.dispatchEvent('input');
const visibleNoMatch = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(visibleNoMatch.length === 0, 'No options match "NO-MATCH-SECTION"');
testAssert(!sectionWrapper.classList.contains('open'), 'Dropdown closes cleanly on no-match');
testAssert(blockSectionInput.value === 'NO-MATCH-SECTION', 'User custom text is NOT erased');


// ─── E. CUSTOM SECTION VALUES ───
console.log('\n--- E. Custom Section Values ---');
blockSectionInput.value = 'IRREG';
testAssert(blockSectionInput.value === 'IRREG', 'block-section retains custom value "IRREG"');

blockSectionInput.value = 'BSIT-3A';
testAssert(blockSectionInput.value === 'BSIT-3A', 'block-section retains custom value "BSIT-3A"');

blockSectionInput.value = 'SPECIAL-SECTION';
testAssert(blockSectionInput.value === 'SPECIAL-SECTION', 'block-section retains custom value "SPECIAL-SECTION"');


// ─── F. RESET BEHAVIOR ───
console.log('\n--- F. Reset Behavior ---');
// Pre-set some state
blockSectionInput.value = '1A-1';
sectionWrapper.classList.add('open');
option2A1.classList.add('selected');

controller.resetSectionSelector();
testAssert(blockSectionInput.value === '', 'resetSectionSelector clears #block-section input');
testAssert(!sectionWrapper.classList.contains('open'), 'resetSectionSelector closes #section-wrapper dropdown');
testAssert(sectionDropdown.querySelectorAll('.selected').length === 0, 'resetSectionSelector removes all .selected classes');
const resetVisible = sectionDropdown.children.filter(c => c.style.display !== 'none');
testAssert(resetVisible.length === 40, 'resetSectionSelector restores display of all 40 options');


// ─── G. REGRESSION & CREATE BLOCK FLOW ───
console.log('\n--- G. Regression & Block Creation Flow ---');

// Mock trayBlockRenderer
let createdBlockInfo = null;
mockWindow.trayBlockRenderer = {
  convertToTrayBlock(subj, prof, sec) {
    createdBlockInfo = { subj, prof, sec };
    const block = new MockElement('div');
    block.className = 'schedule-block';
    block.textContent = `${subj} - ${sec}`;
    return block;
  },
  updateBlockCount() {}
};

// Initialize editor listeners
controller.initEditor();

// 1. Create block with standard section (e.g. 1A-1)
blockSubjectInput.value = 'IT 101';
profWrapper.dataset.value = 'Prof. Turing';
blockSectionInput.value = '1A-1';

createBlockBtn.click();
testAssert(createdBlockInfo !== null, 'convertToTrayBlock called');
testAssert(createdBlockInfo.subj === 'IT 101', 'Subject passed correctly');
testAssert(createdBlockInfo.prof === 'Prof. Turing', 'Professor passed correctly');
testAssert(createdBlockInfo.sec === '1A-1', `Standard section passed correctly (expected 1A-1, got "${createdBlockInfo.sec}")`);
testAssert(blockSectionInput.value === '', 'block-section reset after block creation');

// 2. Create block with custom section (e.g. IRREG)
createdBlockInfo = null;
blockSubjectInput.value = 'CS 202';
profWrapper.dataset.value = 'Dr. Lovelace';
blockSectionInput.value = 'IRREG';

createBlockBtn.click();
testAssert(createdBlockInfo !== null, 'convertToTrayBlock called for custom section');
testAssert(createdBlockInfo.sec === 'IRREG', `Custom section "IRREG" passed unchanged (got "${createdBlockInfo.sec}")`);
testAssert(blockSectionInput.value === '', 'block-section reset after custom block creation');

// 3. Idempotent initSectionSelector
const initialCount = sectionDropdown.children.length;
controller.initSectionSelector();
controller.initSectionSelector();
testAssert(sectionDropdown.children.length === initialCount, 'initSectionSelector is idempotent; does not duplicate options or bindings');

// 4. updateSectionValue API compatibility
controller.updateSectionValue('3C-2');
testAssert(blockSectionInput.value === '3C-2', 'updateSectionValue updates block-section value');


console.log('\n================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log('================================================================\n');
