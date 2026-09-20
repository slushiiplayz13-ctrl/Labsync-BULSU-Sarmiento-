'use strict';

/**
 * tests/test-schedule-studio-term-sync.js
 * Automated test suite verifying that Schedule Studio properly synchronizes
 * with Academic Year and Semester selections and does not bleed schedules across terms.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runScheduleStudioTermSyncTests() {
  console.log('================================================================');
  console.log('🧪 Starting Schedule Studio Academic Year / Term Sync Tests');
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

  // ─── 1. Load Source Code ───
  console.log('--- 1. Loading Source Files ---');
  const coreUtilsCode = fs.readFileSync(path.join(__dirname, '../js/utils/core-utils.js'), 'utf8');
  const timeUtilsCode = fs.readFileSync(path.join(__dirname, '../js/utils/time-utils.js'), 'utf8');
  const controllerCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.controller.js'), 'utf8');
  const studioCode = fs.readFileSync(path.join(__dirname, '../js/schedule-studio.js'), 'utf8');

  assert(controllerCode.includes('getSelectedAcademicYear'), 'faculty-schedule.controller exports getSelectedAcademicYear');
  assert(controllerCode.includes('getSelectedSemester'), 'faculty-schedule.controller exports getSelectedSemester');
  assert(controllerCode.includes('global.updateStudioPreview?.()') || controllerCode.includes('global.updateStudioPreview()'), 'faculty-schedule.controller invokes updateStudioPreview on render and filter changes');
  assert(studioCode.includes('window.updateStudioPreview = updateStudioPreview;'), 'schedule-studio.js exports window.updateStudioPreview');
  assert(studioCode.includes('isEmptyStateInDOM'), 'schedule-studio.js inspects UI empty state');

  // ─── 2. DOM & Context Simulation ───
  console.log('\n--- 2. Setting Up Virtual DOM Context ---');

  // Lightweight mock of DOM elements
  class MockElement {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = className;
      this.classList = {
        _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
        add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
        remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
        contains: (c) => this.classList._classes.has(c),
        toggle: (c) => {
          if (this.classList._classes.has(c)) {
            this.classList._classes.delete(c);
            return false;
          } else {
            this.classList._classes.add(c);
            return true;
          }
        }
      };
      this.children = [];
      this.attributes = {};
      this.dataset = {};
      this.style = {};
      this._innerHTML = '';
      this._textContent = '';
      this.parentElement = null;
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(val) {
      this._innerHTML = val;
    }

    get textContent() {
      return this._textContent || this._innerHTML.replace(/<[^>]*>/g, '');
    }

    set textContent(val) {
      this._textContent = val;
    }

    setAttribute(key, val) {
      this.attributes[key] = String(val);
      if (key.startsWith('data-')) {
        const dKey = key.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        this.dataset[dKey] = String(val);
      }
    }

    getAttribute(key) {
      return this.attributes[key] !== undefined ? this.attributes[key] : null;
    }

    removeAttribute(key) {
      delete this.attributes[key];
      if (key.startsWith('data-')) {
        const dKey = key.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        delete this.dataset[dKey];
      }
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentElement = null;
      }
      return child;
    }

    querySelector(selector) {
      if (selector === '.ui-empty-state') {
        if (this._innerHTML && this._innerHTML.includes('ui-empty-state')) {
          return new MockElement('div', '', 'ui-empty-state');
        }
        return null;
      }
      if (selector === '.schedule-columns, .ui-empty-state') {
        if (this._innerHTML && (this._innerHTML.includes('schedule-columns') || this._innerHTML.includes('ui-empty-state'))) {
          return new MockElement('div');
        }
        return null;
      }
      if (selector === '.custom-select-trigger span') {
        return { textContent: this._triggerText || '' };
      }
      if (selector === '.profile-name') return { textContent: 'Prof. Andrei Gabito' };
      if (selector === '.profile-role') return { textContent: 'IT Dept. Head' };
      return null;
    }

    querySelectorAll(selector) {
      return [];
    }

    closest(selector) {
      return null;
    }
  }

  const elementsMap = new Map();
  const scheduleContainer = new MockElement('div', 'schedule-container');
  const ayWrapper = new MockElement('div', 'academic-year-wrapper');
  const semWrapper = new MockElement('div', 'semester-wrapper');
  const studioCanvasContainer = new MockElement('div', 'studio-canvas-container');
  const studioRenderCard = new MockElement('div', 'studio-render-card');

  elementsMap.set('schedule-container', scheduleContainer);
  elementsMap.set('academic-year-wrapper', ayWrapper);
  elementsMap.set('semester-wrapper', semWrapper);
  elementsMap.set('studio-canvas-container', studioCanvasContainer);
  elementsMap.set('studio-render-card', studioRenderCard);

  const documentMock = {
    getElementById: (id) => elementsMap.get(id) || null,
    querySelector: (sel) => {
      if (sel === '.profile-name') return { textContent: 'Prof. Andrei Gabito' };
      if (sel === '.profile-role') return { textContent: 'IT Dept. Head • BulSU Sarmiento' };
      if (sel === '#schedule-container') return scheduleContainer;
      if (sel === '#academic-year-wrapper') return ayWrapper;
      if (sel === '#semester-wrapper') return semWrapper;
      return null;
    },
    querySelectorAll: (sel) => [],
    createElement: (tag) => new MockElement(tag),
    body: new MockElement('body'),
    readyState: 'complete',
    addEventListener: () => {}
  };

  const sandbox = {
    window: {},
    document: documentMock,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    console: console,
    Set: Set,
    Map: Map,
    Array: Array,
    Object: Object,
    String: String,
    Boolean: Boolean,
    Number: Number,
    JSON: JSON,
    Date: Date,
    lucide: { createIcons: () => {} },
    facultyScheduleColors: {
      buildSubjectColorMap: () => new Map()
    },
    facultyScheduleRenderer: {
      renderFacultyScheduleLayout: (schedules) => `<div class="schedule-columns">${schedules.length} classes</div>`
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.createContext(sandbox);

  // Run utility scripts
  vm.runInContext(coreUtilsCode, sandbox);
  vm.runInContext(timeUtilsCode, sandbox);
  // Run controller script
  vm.runInContext(controllerCode, sandbox);
  // Run studio script
  vm.runInContext(studioCode, sandbox);

  // ─── 3. Test: Initial State with Schedules in AY 2026-2027 ───
  console.log('\n--- 3. Testing Normal Schedule Render for AY 2026-2027 ---');
  ayWrapper.dataset.value = '2026-2027';
  semWrapper.dataset.value = '1st Semester';

  const mockSchedules2026 = [
    {
      Schedule_ID: 101,
      Day_of_Week: 'Monday',
      Start_Time: '12:00',
      End_Time: '13:30',
      Subject_Name: 'CC 102 - Computer Programming 1',
      Subject_Code: 'CC 102',
      Room_Name: 'RM 204',
      Section_Name: '4E',
      Academic_Year: '2026-2027',
      Semester: '1st Semester'
    },
    {
      Schedule_ID: 102,
      Day_of_Week: 'Tuesday',
      Start_Time: '09:00',
      End_Time: '10:30',
      Subject_Name: 'CAP 401W - Capstone Project 1',
      Subject_Code: 'CAP 401W',
      Room_Name: 'RM 203',
      Section_Name: '1A-2',
      Academic_Year: '2026-2027',
      Semester: '1st Semester'
    }
  ];

  sandbox.facultyScheduleController.renderFacultySchedule(
    mockSchedules2026,
    scheduleContainer,
    '2026-2027',
    '1st Semester'
  );

  assert(Array.isArray(sandbox.latestUserSchedules) && sandbox.latestUserSchedules.length === 2, 'latestUserSchedules has 2 items populated for 2026-2027');
  assert(sandbox.latestUserSchedules[0].Academic_Year === '2026-2027', 'Items in latestUserSchedules are tagged with Academic_Year');
  assert(sandbox.latestUserSchedules[0].Semester === '1st Semester', 'Items in latestUserSchedules are tagged with Semester');

  // Check Schedule Studio preview
  sandbox.updateStudioPreview();
  const cardHtml2026 = studioRenderCard.innerHTML;
  assert(cardHtml2026.includes('CC 102'), 'Schedule Studio renders CC 102 for 2026-2027');
  assert(cardHtml2026.includes('CAP 401W'), 'Schedule Studio renders CAP 401W for 2026-2027');
  assert(cardHtml2026.includes('AY 2026-2027 | 1st Semester'), 'Schedule Studio header shows AY 2026-2027');

  // ─── 4. Test: Switching to AY 2027-2028 (Empty Schedule) ───
  console.log('\n--- 4. Testing Switch to AY 2027-2028 (Empty State) ---');
  ayWrapper.dataset.value = '2027-2028';
  semWrapper.dataset.value = '1st Semester';

  // Simulate rendering empty schedule for 2027-2028 (backend returned [])
  sandbox.facultyScheduleController.renderFacultySchedule(
    [],
    scheduleContainer,
    '2027-2028',
    '1st Semester'
  );

  assert(Array.isArray(sandbox.latestUserSchedules) && sandbox.latestUserSchedules.length === 0, 'latestUserSchedules was reset to empty array on empty render');
  assert(scheduleContainer.innerHTML.includes('ui-empty-state'), 'Schedule container rendered ui-empty-state');

  // Verify Schedule Studio preview updated
  sandbox.updateStudioPreview();
  const cardHtml2027 = studioRenderCard.innerHTML;
  assert(!cardHtml2027.includes('CC 102'), 'Schedule Studio does NOT show stale CC 102');
  assert(!cardHtml2027.includes('CAP 401W'), 'Schedule Studio does NOT show stale CAP 401W');
  assert(!cardHtml2027.includes('canvas-class-block'), 'Schedule Studio contains 0 class blocks');
  assert(cardHtml2027.includes('canvas-empty-day'), 'Schedule Studio contains canvas-empty-day elements');
  assert(cardHtml2027.includes('No Classes'), 'Schedule Studio cleanly renders "No Classes" for empty days');
  assert(cardHtml2027.includes('AY 2027-2028 | 1st Semester'), 'Schedule Studio badge displays AY 2027-2028 | 1st Semester');

  // ─── 5. Test: Cross-Term Contamination Defense ───
  console.log('\n--- 5. Testing Cross-Term Contamination Defense ---');
  // Scenario: latestUserSchedules somehow still had 2026-2027 items, but active wrapper is 2027–2028
  ayWrapper.dataset.value = '2027–2028'; // En-dash variant
  sandbox.latestUserSchedules = [...mockSchedules2026]; // 2026-2027 items
  scheduleContainer.innerHTML = '<div>Simulated DOM with no empty state</div>';

  sandbox.updateStudioPreview();
  const cardHtmlCrossTerm = studioRenderCard.innerHTML;
  assert(!cardHtmlCrossTerm.includes('CC 102'), 'Cross-term filter successfully blocked 2026-2027 class CC 102 when viewing 2027-2028');
  assert(!cardHtmlCrossTerm.includes('CAP 401W'), 'Cross-term filter successfully blocked 2026-2027 class CAP 401W when viewing 2027-2028');
  assert(cardHtmlCrossTerm.includes('canvas-empty-day'), 'Renders canvas-empty-day when no classes match active academic year');

  // ─── 6. Test: En-Dash / Hyphen Tolerance ───
  console.log('\n--- 6. Testing En-Dash / Hyphen Tolerance ---');
  // If schedule item has '2027-2028' and wrapper has '2027–2028'
  const schedule2027 = [
    {
      Schedule_ID: 201,
      Day_of_Week: 'Wednesday',
      Start_Time: '08:00',
      End_Time: '11:30',
      Subject_Name: 'IT 203 - Database Systems',
      Subject_Code: 'IT 203',
      Room_Name: 'RM 204',
      Section_Name: '4E',
      Academic_Year: '2027-2028',
      Semester: '1st Semester'
    }
  ];

  sandbox.facultyScheduleController.renderFacultySchedule(
    schedule2027,
    scheduleContainer,
    '2027-2028',
    '1st Semester'
  );

  sandbox.updateStudioPreview();
  const cardHtmlMatched = studioRenderCard.innerHTML;
  assert(cardHtmlMatched.includes('IT 203'), 'Matches and renders IT 203 even when wrapper uses en-dash (2027–2028)');
  assert(cardHtmlMatched.includes('AY 2027–2028 | 1st Semester'), 'Badge preserves display formatting of active wrapper');

  // ─── Summary ───
  console.log('\n================================================================');
  console.log(`Test Results: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runScheduleStudioTermSyncTests();
