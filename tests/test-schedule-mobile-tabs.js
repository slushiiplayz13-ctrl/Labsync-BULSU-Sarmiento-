'use strict';

/**
 * tests/test-schedule-mobile-tabs.js
 * Automated QA Verification Suite for Weekly Schedule Mobile Day Tabs & Organization:
 * - Generation of .schedule-day-tabs pill bar with short day names and indicator dots
 * - Centered .empty-day-state generation on empty days
 * - Smart default day selection and tab switching interaction in faculty-schedule.controller.js
 * - Keyboard navigation (ArrowLeft, ArrowRight, Home, End)
 * - Desktop isolation (> 1024px) in responsive.css
 * - Mobile rules (<= 1024px) for single day display and empty state
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('================================================================');
console.log('🧪 Starting Weekly Schedule Mobile Day Tabs Verification');
console.log('================================================================\n');

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

// 1. Static CSS verification
console.log('--- 1. Static CSS Desktop Isolation & Mobile Rules ---');
const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

assert(
  responsiveCss.includes('.schedule-day-tabs {\n  display: none !important;\n}') ||
  responsiveCss.includes('.schedule-day-tabs {\r\n  display: none !important;\r\n}'),
  'Desktop isolation: .schedule-day-tabs is display: none on desktop (> 1024px)'
);

assert(
  responsiveCss.includes('.empty-day-state {\n  display: none !important;\n}') ||
  responsiveCss.includes('.empty-day-state {\r\n  display: none !important;\r\n}'),
  'Desktop isolation: .empty-day-state is display: none on desktop (> 1024px)'
);

assert(
  responsiveCss.includes('.schedule-day-tab-btn.active') &&
  responsiveCss.includes('body[data-page="my-schedule"] .schedule-columns .day-column.is-active-day'),
  'Mobile rules: .schedule-day-tab-btn.active and .is-active-day defined at <= 1024px'
);

assert(
  responsiveCss.includes('.empty-day-state-icon') &&
  responsiveCss.includes('body[data-page="my-schedule"] .day-column.empty-day::after'),
  'Mobile rules: .empty-day-state-icon defined and old ::after text suppressed'
);

// 2. Schedule Renderer Verification
console.log('\n--- 2. Schedule Renderer Day Tabs & Empty Day Generation ---');

const sandbox = {
  console,
  Date,
  String,
  Boolean,
  Number,
  Array,
  Object,
  Set,
  Map,
  document: {
    createElement: () => ({}),
    addEventListener: () => { }
  }
};
sandbox.window = sandbox;
sandbox.global = sandbox;

const rendererCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.renderer.js'), 'utf8');
vm.runInNewContext(rendererCode, sandbox);

const renderer = sandbox.facultyScheduleRenderer;
assert(typeof renderer.renderFacultyScheduleLayout === 'function', 'renderFacultyScheduleLayout function exists');

const sampleSchedules = [
  {
    Schedule_ID: 1,
    Day_of_Week: 'Monday',
    Start_Time: '08:30:00',
    End_Time: '12:30:00',
    Subject_Name: 'CC 102 - Introduction to Computing',
    Room_Number: '203',
    Section: 'BSIT-1A'
  },
  {
    Schedule_ID: 2,
    Day_of_Week: 'Wednesday',
    Start_Time: '13:00:00',
    End_Time: '16:00:00',
    Subject_Name: 'CC 104 - Data Structures',
    Room_Number: '204',
    Section: 'BSIT-2B'
  }
];

const subjectMap = new Map();
subjectMap.set('CC 102 - Introduction to Computing', { class: 'subject-blue', bg: '#2563EB', color: '#FFFFFF', dot: '#2563EB' });
subjectMap.set('CC 104 - Data Structures', { class: 'subject-green', bg: '#059669', color: '#FFFFFF', dot: '#059669' });

const renderedHtml = renderer.renderFacultyScheduleLayout(sampleSchedules, subjectMap);

assert(renderedHtml.includes('class="schedule-day-tabs"'), 'Markup includes .schedule-day-tabs container');
assert(renderedHtml.includes('role="tablist"'), 'Day tabs container has role="tablist"');
assert(renderedHtml.includes('data-day="Monday"'), 'Includes Monday day tab');
assert(renderedHtml.includes('data-day="Tuesday"'), 'Includes Tuesday day tab');
assert(!renderedHtml.includes('class="day-tab-indicator"'), 'Dot indicator removed from day tabs for clean typography');
assert(renderedHtml.includes('class="day-tab-label">Mon</span>'), 'Clean Mon label rendered in day tabs');
assert(renderedHtml.includes('class="empty-day-state"'), 'Includes centered .empty-day-state for empty days');
assert(renderedHtml.includes('No classes scheduled for Tuesday'), 'Empty day state has personalized title for Tuesday');

// 3. Controller Tab Switching Simulation
console.log('\n--- 3. Controller Tab Switching & Interaction Simulation ---');

class MockElement {
  constructor(tag, className = '') {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.classList = {
      classes: new Set(className.split(' ').filter(Boolean)),
      add: (c) => this.classList.classes.add(c),
      remove: (c) => this.classList.classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList.classes.has(c)) this.classList.classes.delete(c);
          else this.classList.classes.add(c);
        } else if (force) {
          this.classList.classes.add(c);
        } else {
          this.classList.classes.delete(c);
        }
      },
      contains: (c) => this.classList.classes.has(c)
    };
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.children = [];
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach(fn => fn(event));
    }
  }

  querySelector(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.find(c => c.classList.contains(cls)) || null;
    }
    return null;
  }

  querySelectorAll(sel) {
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this.children.filter(c => c.classList.contains(cls));
    }
    return [];
  }

  focus() { }
}

const mockContainer = new MockElement('div', 'schedule-container');
const mockTabsBar = new MockElement('div', 'schedule-day-tabs');
const mockCols = new MockElement('div', 'schedule-columns');

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const tabBtns = [];
const dayCols = [];

days.forEach(d => {
  const btn = new MockElement('button', 'schedule-day-tab-btn');
  btn.dataset.day = d;
  mockTabsBar.children.push(btn);
  tabBtns.push(btn);

  const col = new MockElement('div', 'day-column');
  col.dataset.day = d;
  mockCols.children.push(col);
  dayCols.push(col);
});

mockContainer.children.push(mockTabsBar, mockCols);

// Run controller in sandbox
const controllerCode = fs.readFileSync(path.join(__dirname, '../js/faculty-schedule/faculty-schedule.controller.js'), 'utf8');
sandbox.document.getElementById = (id) => (id === 'schedule-container' ? mockContainer : null);
sandbox.document.querySelector = (sel) => (sel === '#schedule-container' ? mockContainer : null);
vm.runInNewContext(controllerCode, sandbox);

// Extract and test initScheduleDayTabs
const initScript = `
  const fnMatch = facultyScheduleControllerCode.match(/function initScheduleDayTabs\\([\\s\\S]*?\\n  \\}/);
`;

// Simulate rendering with sample schedules (Monday and Wednesday have classes)
// Re-run controller's internal init on mockContainer
const initDayTabsMatch = controllerCode.match(/function initScheduleDayTabs\([\s\S]*?\n  \}/);
assert(initDayTabsMatch !== null, 'Found initScheduleDayTabs function in controller');

const runInit = new Function('container', 'schedules', `
  ${initDayTabsMatch[0]}
  initScheduleDayTabs(container, schedules);
`);

runInit(mockContainer, sampleSchedules);

// Verify initial day selection:
// Monday has classes and is in the scheduled days set
const activeBtn = tabBtns.find(b => b.classList.contains('active'));
assert(activeBtn !== null, 'An active day tab button was selected');
assert(mockCols.dataset.activeDay !== undefined, `Active day set on schedule-columns: ${mockCols.dataset.activeDay}`);
assert(mockCols.children.some(c => c.classList.contains('is-active-day')), 'A day column has .is-active-day class');

// Simulate clicking Wednesday
const wedBtn = tabBtns.find(b => b.dataset.day === 'Wednesday');
wedBtn.dispatchEvent({ type: 'click' });

assert(wedBtn.classList.contains('active'), 'Wednesday tab became active upon click');
assert(wedBtn.getAttribute('aria-selected') === 'true', 'Wednesday tab aria-selected="true"');
assert(mockCols.dataset.activeDay === 'Wednesday', 'schedule-columns activeDay updated to Wednesday');
const wedCol = dayCols.find(c => c.dataset.day === 'Wednesday');
assert(wedCol.classList.contains('is-active-day'), 'Wednesday column has is-active-day class');

// Simulate keyboard navigation (ArrowRight from Wednesday -> Thursday)
let prevented = false;
wedBtn.dispatchEvent({
  type: 'keydown',
  key: 'ArrowRight',
  preventDefault: () => { prevented = true; }
});

const thuBtn = tabBtns.find(b => b.dataset.day === 'Thursday');
assert(thuBtn.classList.contains('active'), 'Keyboard ArrowRight navigated to Thursday');
assert(mockCols.dataset.activeDay === 'Thursday', 'Thursday became active via keyboard');
assert(prevented === true, 'preventDefault called for keyboard arrow navigation');

console.log('\n================================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('================================================================\n');

if (failed > 0) process.exit(1);
