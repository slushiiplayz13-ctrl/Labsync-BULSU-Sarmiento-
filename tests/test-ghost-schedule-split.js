'use strict';

/**
 * tests/test-ghost-schedule-split.js
 * Automated QA Suite for Professor Ghost Schedule Overlap & 50/50 Side-by-Side Split:
 * - 1. Static CSS verification in room-schedule-editor.html and schedule-cards.css
 * - 2. JS collision detection logic & DOM classes (is-split-left, is-split-right)
 * - 3. Clean restoration on clearGhostBlocks()
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
console.log('🧪 Starting Ghost Schedule Side-by-Side Collision QA Tests');
console.log('================================================================\n');

// ─── 1. Static CSS Verification ───
console.log('--- 1. Static CSS Verification in room-schedule-editor.html & schedule-cards.css ---');

const editorHtmlPath = path.join(__dirname, '../room-schedule-editor.html');
const editorHtml = fs.readFileSync(editorHtmlPath, 'utf8').replace(/\r\n/g, '\n');

const scheduleCardsCssPath = path.join(__dirname, '../css/components/schedule-cards.css');
const scheduleCardsCss = fs.readFileSync(scheduleCardsCssPath, 'utf8').replace(/\r\n/g, '\n');

// Verify .grid-card has width/left/right transitions
assert(
  editorHtml.includes('.grid-card') && editorHtml.includes('left 0.25s ease, width 0.25s ease, right 0.25s ease'),
  'room-schedule-editor.html: .grid-card includes smooth transition for left, width, right'
);
assert(
  scheduleCardsCss.includes('.grid-card') && scheduleCardsCss.includes('left 0.25s ease, width 0.25s ease, right 0.25s ease'),
  'schedule-cards.css: .grid-card includes smooth transition for left, width, right'
);

// Verify .grid-card.is-split-left rules
assert(
  editorHtml.includes('.grid-card.is-split-left') && editorHtml.includes('width: calc(50% - 6px) !important;'),
  'room-schedule-editor.html: .grid-card.is-split-left defines width: calc(50% - 6px)'
);
assert(
  editorHtml.includes('.grid-card.is-split-left') && editorHtml.includes('left: 4px !important;'),
  'room-schedule-editor.html: .grid-card.is-split-left defines left: 4px !important'
);
assert(
  editorHtml.includes('.grid-card.is-split-left') && editorHtml.includes('border-left: 3.5px solid #EF4444 !important;'),
  'room-schedule-editor.html: .grid-card.is-split-left defines subtle red clash border'
);

// Verify .grid-card-ghost.is-split-right rules
assert(
  editorHtml.includes('.grid-card-ghost.is-split-right') && editorHtml.includes('left: calc(50% + 2px) !important;'),
  'room-schedule-editor.html: .grid-card-ghost.is-split-right defines left: calc(50% + 2px) !important'
);
assert(
  editorHtml.includes('.grid-card-ghost.is-split-right') && editorHtml.includes('width: calc(50% - 6px) !important;'),
  'room-schedule-editor.html: .grid-card-ghost.is-split-right defines width: calc(50% - 6px) !important'
);

// Verify Dark mode & High contrast rules for split cards
assert(
  editorHtml.includes('html.dark-mode .grid-card.is-split-left') && editorHtml.includes('border-left: 3.5px solid #F87171 !important;'),
  'room-schedule-editor.html: Dark mode override for .grid-card.is-split-left'
);
assert(
  editorHtml.includes('html.dark-mode .grid-card-ghost.is-split-right') && editorHtml.includes('border-left: 3.5px solid #F87171 !important;'),
  'room-schedule-editor.html: Dark mode override for .grid-card-ghost.is-split-right'
);

// Verify schedule-cards.css parity
assert(
  scheduleCardsCss.includes('.grid-card.is-split-left') && scheduleCardsCss.includes('width: calc(50% - 6px) !important;'),
  'schedule-cards.css: .grid-card.is-split-left has parity with editor'
);
assert(
  scheduleCardsCss.includes('.grid-card-ghost.is-split-right') && scheduleCardsCss.includes('left: calc(50% + 2px) !important;'),
  'schedule-cards.css: .grid-card-ghost.is-split-right has parity with editor'
);

// ─── 2. DOM Simulation of Collision Detection Logic ───
console.log('\n--- 2. Ghost Schedule Collision Detection & Reset Logic ---');

// Mock a lightweight browser environment to test ghost-schedule.renderer.js
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(...cls) { cls.forEach(c => this.classes.add(c)); }
  remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
  contains(cls) { return this.classes.has(cls); }
  get value() { return Array.from(this.classes).join(' '); }
}

class MockElement {
  constructor(tag = 'div', className = '') {
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList();
    this.className = className;
    this.style = {};
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
  }
  get className() {
    return Array.from(this.classList.classes).join(' ');
  }
  set className(val) {
    this.classList.classes.clear();
    if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }
  querySelectorAll(selector) {
    const results = [];
    function traverse(node) {
      for (const child of node.children) {
        if (matches(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(this);
    return results;
  }
}

function matches(el, selector) {
  if (selector === '.grid-card-ghost') return el.classList.contains('grid-card-ghost');
  if (selector === '.grid-card:not(.grid-card-ghost)') return el.classList.contains('grid-card') && !el.classList.contains('grid-card-ghost');
  if (selector === '.grid-card.is-split-left, .grid-card.is-clash-conflict') {
    return el.classList.contains('grid-card') && (el.classList.contains('is-split-left') || el.classList.contains('is-clash-conflict'));
  }
  if (selector.startsWith('.grid-day-column[data-day="')) {
    const day = selector.match(/data-day="([^"]+)"/)[1];
    return el.classList.contains('grid-day-column') && el.dataset.day === day;
  }
  return false;
}

const mockDocument = {
  root: new MockElement('body'),
  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  },
  querySelectorAll(selector) {
    return this.root.querySelectorAll(selector);
  },
  createElement(tag) {
    return new MockElement(tag);
  }
};

// Set up mock window and day columns
const mockWindow = {
  innerWidth: 1024,
  document: mockDocument,
  timeUtils: {
    timeToSlots: (t) => {
      // 07:00 AM = slot 0; 30 min per slot
      const [h, m] = t.split(':').map(Number);
      return (h - 7) * 2 + (m >= 30 ? 1 : 0);
    },
    formatShortTime: (t) => t
  },
  slotMath: {
    getSlotHeight: () => 36,
    getScheduleContext: () => ({ academicYear: '2026-2027', semester: '1st Semester', roomNumber: '204' })
  },
  scheduleService: {
    getProfessorSchedule: async () => [
      // 1. Ghost with NO collision: Tuesday 07:00 - 09:00 (Room is empty at this time)
      {
        Schedule_ID: 101,
        Day_of_Week: 'Tuesday',
        Start_Time: '07:00:00',
        End_Time: '09:00:00',
        Subject_Name: 'CC 104 - Computer Programming 2',
        Room_Number: '203',
        Professor_Name: 'Andrei Gabito'
      },
      // 2. Ghost WITH collision: Tuesday 09:00 - 10:30 (Room 204 already has IT 101 Discrete Math)
      {
        Schedule_ID: 102,
        Day_of_Week: 'Tuesday',
        Start_Time: '09:00:00',
        End_Time: '10:30:00',
        Subject_Name: 'CAP 401W - Capstone Project 2',
        Room_Number: '203',
        Professor_Name: 'Andrei Gabito'
      }
    ]
  }
};

// Setup Tuesday column
const tuesdayCol = new MockElement('div', 'grid-day-column');
tuesdayCol.dataset.day = 'Tuesday';
mockDocument.root.appendChild(tuesdayCol);

// Add existing card in Room 204: Tuesday 09:00 - 10:30 (slots 4 to 7)
const existingCard = new MockElement('div', 'grid-card');
existingCard.dataset.start = 4; // 09:00
existingCard.dataset.end = 7;   // 10:30
existingCard.style.top = '144px';
existingCard.style.height = '108px';
tuesdayCol.appendChild(existingCard);

global.document = mockDocument;
global.window = mockWindow;
global.scheduleService = mockWindow.scheduleService;
global.slotMath = mockWindow.slotMath;
global.timeUtils = mockWindow.timeUtils;

// Load the updated ghost-schedule.renderer.js in this mock environment
const ghostRendererCode = fs.readFileSync(path.join(__dirname, '../js/scheduling/rendering/ghost-schedule.renderer.js'), 'utf8');
const runRenderer = new Function('global', 'window', 'document', ghostRendererCode);
runRenderer(global, global.window, global.document);
global.ghostScheduleRenderer = mockWindow.ghostScheduleRenderer || global.ghostScheduleRenderer;

(async () => {
  // Execute loading professor ghost schedule
  try {
    await global.ghostScheduleRenderer.loadProfessorGhostSchedule('Andrei Gabito', '2026-2027', '1st Semester', '204');
  } catch (e) {
    console.error('Renderer threw error:', e);
  }

  const ghosts = tuesdayCol.querySelectorAll('.grid-card-ghost');
  assert(ghosts.length === 2, `Rendered exactly 2 ghost blocks (found: ${ghosts.length})`);

  // Ghost 1: 07:00 - 09:00 (slots 0 to 4) -> No overlap with existing card at slots 4-7
  const freeGhost = ghosts[0];
  assert(!freeGhost.classList.contains('is-split-right'), 'Free slot ghost (07:00-09:00) stays full-width without .is-split-right');

  // Ghost 2: 09:00 - 10:30 (slots 4 to 7) -> Overlaps with existing card!
  const collidingGhost = ghosts[1];
  assert(collidingGhost.classList.contains('is-split-right'), 'Colliding ghost (09:00-10:30) gets .is-split-right');
  assert(collidingGhost.classList.contains('is-clash-conflict'), 'Colliding ghost gets .is-clash-conflict');

  // Existing card in Room 204 should now be shifted to left half
  assert(existingCard.classList.contains('is-split-left'), 'Existing card gets .is-split-left (shifts to left 50%)');
  assert(existingCard.classList.contains('is-clash-conflict'), 'Existing card gets .is-clash-conflict');

  // ─── 3. Test Reset / Cleanup ───
  console.log('\n--- 3. Testing Cleanup via clearGhostBlocks() ---');
  mockWindow.ghostScheduleRenderer.clearGhostBlocks();

  const remainingGhosts = tuesdayCol.querySelectorAll('.grid-card-ghost');
  assert(remainingGhosts.length === 0, 'clearGhostBlocks(): All ghost elements removed from DOM');
  assert(!existingCard.classList.contains('is-split-left'), 'clearGhostBlocks(): Existing card loses .is-split-left');
  assert(!existingCard.classList.contains('is-clash-conflict'), 'clearGhostBlocks(): Existing card loses .is-clash-conflict');

  console.log('\n================================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
})();
