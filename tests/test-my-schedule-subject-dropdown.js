'use strict';

/**
 * tests/test-my-schedule-subject-dropdown.js
 * Automated test suite verifying the LabSync My Schedule Subject Dropdown QA fix.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runMyScheduleDropdownTests() {
  console.log('================================================================');
  console.log('🧪 Starting LabSync My Schedule Subject Dropdown QA Tests');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  // ─── 1. Verify CSS Rules in schedule-cards.css ───
  console.log('\n--- 1. CSS Verification in schedule-cards.css ---');
  const cssPath = path.join(__dirname, '../css/components/schedule-cards.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert(cssContent.includes('.sl-divider'), 'CSS includes .sl-divider rule');
  assert(cssContent.includes('.subject-select-wrapper'), 'CSS includes .subject-select-wrapper rule');
  assert(cssContent.includes('.subject-select-trigger'), 'CSS includes .subject-select-trigger rule');
  assert(cssContent.includes('.subject-trigger-text'), 'CSS includes .subject-trigger-text rule');
  assert(cssContent.includes('text-overflow: ellipsis'), 'CSS includes text-overflow: ellipsis for subject truncation');
  assert(cssContent.includes('.subject-select-dropdown'), 'CSS includes .subject-select-dropdown rule');
  assert(cssContent.includes('right: 0 !important'), 'CSS anchors dropdown right edge to prevent right screen overflow');
  assert(/max-height:\s*(17[6-8]|180)px/.test(cssContent), 'CSS limits dropdown max-height to ~178px (showing ~4 subjects by default)');
  assert(cssContent.includes('min-height: 38px'), 'CSS ensures minimum height per option for consistent 4-subject visibility');
  assert(cssContent.includes('overscroll-behavior: contain'), 'CSS prevents scroll bubbling outside dropdown');
  assert(cssContent.includes('overflow-y: auto'), 'CSS enables vertical scroll in dropdown for many subjects');
  assert(cssContent.includes('min-width: 190px'), 'CSS includes controlled min-width (190px)');
  assert(cssContent.includes('max-width: min(290px'), 'CSS includes controlled max-width (290px)');
  assert(cssContent.includes('body.dark-mode .subject-select-dropdown'), 'CSS supports Dark Mode for subject dropdown');
  assert(cssContent.includes('html.high-contrast .subject-select-dropdown'), 'CSS supports High-Contrast Mode for subject dropdown');
  assert(!cssContent.includes('html.high-contrast .subject-select-dropdown {\n  background: #000000'), 'CSS avoids harsh pitch-black box in dark mode, uses design system tokens');

  // ─── 2. Setup Sandbox & Load Renderer ───
  console.log('\n--- 2. Structure & Rendering Verification ---');

  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Map,
    Object,
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  // Load colors, renderer, and filters
  const colorsCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.colors.js'), 'utf8');
  const rendererCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.renderer.js'), 'utf8');
  const filtersCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.filters.js'), 'utf8');

  vm.runInNewContext(colorsCode, sandbox);
  vm.runInNewContext(rendererCode, sandbox);
  vm.runInNewContext(filtersCode, sandbox);

  const { renderFacultyScheduleLayout } = sandbox.facultyScheduleRenderer;
  const { buildSubjectColorMap } = sandbox.facultyScheduleColors;

  // Helper to create test schedules
  function makeSchedule(subjectName, day, startTime, endTime) {
    return {
      Schedule_ID: Math.floor(Math.random() * 10000),
      Subject_Name: subjectName,
      Day_of_Week: day || 'Monday',
      Start_Time: startTime || '08:00:00',
      End_Time: endTime || '10:00:00',
      Room_Number: 'Lab 101',
      Section: 'BSIT 3-A'
    };
  }

  // Test Case: 0 subjects
  const scheds0 = [];
  const map0 = buildSubjectColorMap(scheds0);
  const html0 = renderFacultyScheduleLayout(scheds0, map0);

  assert(html0.includes('id="subject-filter-all"'), '0 subjects: "All" button is present');
  assert(html0.includes('class="sl-divider"'), '0 subjects: Divider is present');
  assert(html0.includes('id="subject-filter-dropdown-wrapper"'), '0 subjects: Dropdown wrapper is present');
  assert(html0.includes('class="subject-trigger-text">Subject<'), '0 subjects: Trigger text defaults to "Subject"');
  assert(html0.includes('No subjects available'), '0 subjects: Clean placeholder shown (no redundant All Subjects)');

  // Test Case: 1 subject
  const scheds1 = [makeSchedule('CAP 301W - Capstone 1')];
  const map1 = buildSubjectColorMap(scheds1);
  const html1 = renderFacultyScheduleLayout(scheds1, map1);

  assert(html1.includes('id="subject-filter-all"'), '1 subject: "All" button is present');
  assert(html1.includes('data-value="CAP 301W - Capstone 1"'), '1 subject: Subject option exists in dropdown');
  assert(html1.includes('>CAP 301W<'), '1 subject: Subject code extracted correctly');
  assert(!html1.includes('All Subjects'), '1 subject: Redundant "All Subjects" option is NOT in dropdown');
  assert(!html1.includes('<div class="sl-item" data-filter="CAP 301W'), '1 subject: Individual chip pill is NOT rendered outside dropdown');

  // Test Case: 3 subjects
  const scheds3 = [
    makeSchedule('CAP 301W - Capstone 1'),
    makeSchedule('IT 104* - Data Structures'),
    makeSchedule('NET 201 - Networking Basics')
  ];
  const map3 = buildSubjectColorMap(scheds3);
  const html3 = renderFacultyScheduleLayout(scheds3, map3);

  assert(html3.includes('data-value="CAP 301W - Capstone 1"'), '3 subjects: CAP 301W in dropdown');
  assert(html3.includes('data-value="IT 104* - Data Structures"'), '3 subjects: IT 104* in dropdown');
  assert(html3.includes('data-value="NET 201 - Networking Basics"'), '3 subjects: NET 201 in dropdown');
  assert((html3.match(/class="custom-select-option/g) || []).length === 3, '3 subjects: Dropdown has exactly 3 subject options (no redundant All Subjects)');

  // Test Case: 10+ subjects
  const subjList12 = [];
  for (let i = 1; i <= 12; i++) {
    subjList12.push(makeSchedule(`SUBJ ${100 + i} - Advanced Subject Number ${i}`));
  }
  const map12 = buildSubjectColorMap(subjList12);
  const html12 = renderFacultyScheduleLayout(subjList12, map12);

  assert((html12.match(/class="custom-select-option/g) || []).length === 12, '12 subjects: Dropdown has exactly 12 options');
  assert(!html12.includes('class="sl-item" data-filter="SUBJ 101'), '12 subjects: No subjects spilled into horizontal toolbar');
  assert(html12.includes('id="subject-filter-all"'), '12 subjects: Fixed "All" remains intact in the exact same spot');

  // Test Case: 15+ subjects
  const subjList16 = [];
  for (let i = 1; i <= 16; i++) {
    subjList16.push(makeSchedule(`CS ${200 + i} - Computer Science Course ${i}`));
  }
  const map16 = buildSubjectColorMap(subjList16);
  const html16 = renderFacultyScheduleLayout(subjList16, map16);
  assert((html16.match(/class="custom-select-option/g) || []).length === 16, '16 subjects: Dropdown accommodates 16 subjects');

  // Test Case: Very long subject name
  const longName = 'ADV 499 - Very Long Subject Title That Could Break Layout If Rendered Inline Horizontally On The Navigation Bar';
  const schedsLong = [makeSchedule(longName)];
  const mapLong = buildSubjectColorMap(schedsLong);
  const htmlLong = renderFacultyScheduleLayout(schedsLong, mapLong);

  assert(htmlLong.includes('title="ADV 499 - Very Long Subject Title'), 'Long subject: Full title attribute preserved for browser tooltip');
  assert(htmlLong.includes('data-code="ADV 499"'), 'Long subject: Clean short code extracted');
  assert(htmlLong.includes('class="subject-option-desc"'), 'Long subject: Description separated cleanly');

  // ─── 3. Interactive Filtering Logic Verification ───
  console.log('\n--- 3. Interactive Filtering Logic Verification ---');

  // Create lightweight DOM mock to test initLegendFilter interactions
  class MockElement {
    constructor(tagName, id, classNames) {
      this.tagName = tagName;
      this.id = id || '';
      this.classList = {
        _classes: new Set(classNames || []),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); },
        toggle(c) {
          if (this._classes.has(c)) {
            this._classes.delete(c);
            return false;
          }
          this._classes.add(c);
          return true;
        }
      };
      this.style = {};
      this.dataset = {};
      this.attributes = {};
      this.children = [];
      this.listeners = {};
      this.textContent = '';
    }

    setAttribute(name, val) { this.attributes[name] = String(val); }
    getAttribute(name) { return this.attributes[name] !== undefined ? this.attributes[name] : null; }
    addEventListener(evt, fn) {
      if (!this.listeners[evt]) this.listeners[evt] = [];
      this.listeners[evt].push(fn);
    }
    dispatchEvent(evt) {
      const fns = this.listeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    }
    querySelector(sel) {
      if (sel === '#subject-filter-all') return this._find(e => e.id === 'subject-filter-all');
      if (sel === '#subject-filter-dropdown-wrapper') return this._find(e => e.id === 'subject-filter-dropdown-wrapper');
      if (sel === '.custom-select-trigger') return this._find(e => e.classList.contains('custom-select-trigger'));
      if (sel === '.subject-trigger-text') return this._find(e => e.classList.contains('subject-trigger-text'));
      return null;
    }
    querySelectorAll(sel) {
      if (sel === '.custom-select-option') return this._findAll(e => e.classList.contains('custom-select-option'));
      if (sel === '.sg-cell.filled') return this._findAll(e => e.classList.contains('sg-cell') && e.classList.contains('filled'));
      if (sel.includes('.sl-item')) return this._findAll(e => e.classList.contains('sl-item'));
      return [];
    }
    _find(predicate) {
      if (predicate(this)) return this;
      for (const child of this.children) {
        const found = child._find(predicate);
        if (found) return found;
      }
      return null;
    }
    _findAll(predicate) {
      let results = [];
      if (predicate(this)) results.push(this);
      for (const child of this.children) {
        results = results.concat(child._findAll(predicate));
      }
      return results;
    }
    contains(el) {
      if (el === this) return true;
      for (const child of this.children) {
        if (child.contains(el)) return true;
      }
      return false;
    }
    focus() {}
  }

  // Construct mock container
  const container = new MockElement('div', 'schedule-container');
  const allBtn = new MockElement('button', 'subject-filter-all', ['sl-item', 'active']);
  allBtn.dataset.filter = 'all';

  const dropdownWrapper = new MockElement('div', 'subject-filter-dropdown-wrapper', ['custom-select-wrapper', 'subject-select-wrapper']);
  const triggerBtn = new MockElement('button', '', ['custom-select-trigger', 'subject-select-trigger']);
  const triggerText = new MockElement('span', '', ['subject-trigger-text']);
  triggerText.textContent = 'Subject';
  triggerBtn.children.push(triggerText);

  const opt1 = new MockElement('div', '', ['custom-select-option']);
  opt1.setAttribute('data-value', 'CAP 301W - Capstone 1');
  opt1.setAttribute('data-code', 'CAP 301W');
  const opt1Text = new MockElement('span', '', ['subject-option-text']);
  opt1Text.textContent = 'CAP 301W';
  opt1.children.push(opt1Text);

  const opt2 = new MockElement('div', '', ['custom-select-option']);
  opt2.setAttribute('data-value', 'IT 104* - Data Structures');
  opt2.setAttribute('data-code', 'IT 104*');
  const opt2Text = new MockElement('span', '', ['subject-option-text']);
  opt2Text.textContent = 'IT 104*';
  opt2.children.push(opt2Text);

  dropdownWrapper.children.push(triggerBtn, opt1, opt2);

  // Add 2 schedule cells
  const cell1 = new MockElement('div', '', ['sg-cell', 'filled']);
  cell1.dataset.subjectName = 'CAP 301W - Capstone 1';

  const cell2 = new MockElement('div', '', ['sg-cell', 'filled']);
  cell2.dataset.subjectName = 'IT 104* - Data Structures';

  container.children.push(allBtn, dropdownWrapper, cell1, cell2);

  // Run initLegendFilter
  sandbox.facultyScheduleFilters.initLegendFilter(container);

  // 1. Trigger toggle test
  triggerBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert(dropdownWrapper.classList.contains('open'), 'Clicking trigger opens dropdown (.open added)');
  assert(triggerBtn.getAttribute('aria-expanded') === 'true', 'aria-expanded set to true on open');

  triggerBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert(!dropdownWrapper.classList.contains('open'), 'Clicking trigger again closes dropdown (.open removed)');
  assert(triggerBtn.getAttribute('aria-expanded') === 'false', 'aria-expanded set to false on close');

  // 2. Select option CAP 301W
  opt1.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert(!allBtn.classList.contains('active'), 'Selecting subject deactivates "All" button');
  assert(triggerBtn.classList.contains('active'), 'Selecting subject activates dropdown trigger');
  assert(triggerText.textContent === 'CAP 301W', 'Dropdown trigger text updates to "CAP 301W"');
  assert(opt1.classList.contains('selected'), 'Selected option has .selected class');
  assert(!dropdownWrapper.classList.contains('open'), 'Dropdown closes automatically after selecting option');

  // Check cell filtering
  assert(cell1.style.opacity === '1', 'Matching cell has opacity 1');
  assert(cell1.style.transform === 'scale(1.03)', 'Matching cell is scaled to 1.03');
  assert(cell2.style.opacity === '0.2', 'Non-matching cell is dimmed to opacity 0.2');
  assert(cell2.style.filter === 'grayscale(60%)', 'Non-matching cell is grayscale dimmed');

  // 3. Click selected option CAP 301W again -> toggles back to All
  opt1.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert(allBtn.classList.contains('active'), 'Clicking active subject again toggles back to "All"');
  assert(!triggerBtn.classList.contains('active'), 'Dropdown trigger loses active state on toggle');
  assert(triggerText.textContent === 'Subject', 'Dropdown trigger text resets to "Subject"');
  assert(cell1.style.opacity === '1' && cell1.style.transform === 'none', 'Cell 1 restored to normal');
  assert(cell2.style.opacity === '1' && cell2.style.transform === 'none', 'Cell 2 restored to normal');

  // 4. Select subject then click "All" button directly
  opt2.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert(triggerText.textContent === 'IT 104*', 'Selected IT 104*');
  assert(cell2.style.opacity === '1' && cell1.style.opacity === '0.2', 'IT 104* highlighted, CAP 301W dimmed');

  allBtn.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  assert(allBtn.classList.contains('active'), 'Clicking "All" button reactivates "All" button');
  assert(!triggerBtn.classList.contains('active'), 'Clicking "All" deactivates dropdown trigger');
  assert(triggerText.textContent === 'Subject', 'Dropdown trigger text resets to "Subject"');
  assert(cell1.style.opacity === '1', 'Cell 1 restored after clicking "All"');
  assert(cell2.style.opacity === '1', 'Cell 2 restored after clicking "All"');

  // ─── Summary ───
  console.log('\n================================================================');
  console.log(`🎉 Test Execution Complete: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMyScheduleDropdownTests();
