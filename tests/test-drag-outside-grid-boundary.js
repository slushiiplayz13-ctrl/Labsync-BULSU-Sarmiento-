'use strict';

/**
 * tests/test-drag-outside-grid-boundary.js
 * Regression QA Suite for LabSync Room Schedule Editor:
 * - Dragging outside grid boundaries and releasing outside
 * - Moving outside grid and back in
 * - Dropping schedule blocks onto Subject/Section input boxes (preventing invalid drops)
 * - Restoring blocks to original slot & preserving valid grid drops
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
console.log('🧪 Starting Schedule Editor Drag-and-Drop QA Suite');
console.log('================================================================\n');

// ─── Simple DOM Mock for Testing ───
class MockClassList {
  constructor(el) {
    this.el = el;
    this.classes = new Set();
  }
  add(...names) {
    names.forEach(n => this.classes.add(n));
  }
  remove(...names) {
    names.forEach(n => this.classes.delete(n));
  }
  contains(name) {
    return this.classes.has(name);
  }
  toString() {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  constructor(tagName, className = '', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList(this);
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.eventListeners = {};
    this.textContent = '';
    this.value = '';
    this._rect = { top: 100, bottom: 900, left: 100, right: 300, width: 200, height: 800 };
  }

  set className(val) {
    this.classList.classes.clear();
    if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
  }
  get className() {
    return this.classList.toString();
  }

  appendChild(child) {
    if (child.parentNode) {
      child.remove();
    }
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

  addEventListener(event, fn, options) {
    const useCapture = typeof options === 'boolean' ? options : !!(options && options.capture);
    const key = useCapture ? `${event}_capture` : event;
    if (!this.eventListeners[key]) this.eventListeners[key] = [];
    this.eventListeners[key].push(fn);
  }

  removeEventListener(event, fn, options) {
    const useCapture = typeof options === 'boolean' ? options : !!(options && options.capture);
    const key = useCapture ? `${event}_capture` : event;
    if (!this.eventListeners[key]) return;
    this.eventListeners[key] = this.eventListeners[key].filter(f => f !== fn);
  }

  async dispatchEvent(event, extra = {}) {
    let stopped = false;
    let defaultPrevented = false;
    const ev = {
      type: event,
      target: this,
      get defaultPrevented() { return defaultPrevented; },
      preventDefault() { defaultPrevented = true; },
      stopPropagation() { stopped = true; },
      dataTransfer: {
        _data: {},
        dropEffect: 'copy',
        setData(k, v) { this._data[k] = v; },
        getData(k) { return this._data[k] || ''; }
      },
      ...extra
    };

    // 1. Ancestry path for capture & bubbling
    const ancestry = [];
    let curr = this;
    while (curr) {
      ancestry.unshift(curr);
      curr = curr.parentNode;
    }
    if (mockDocument && !ancestry.includes(mockDocument)) {
      ancestry.unshift(mockDocument);
    }

    // 2. Capture phase (top down)
    for (const node of ancestry) {
      if (stopped) break;
      const captureKey = `${event}_capture`;
      if (node.eventListeners && node.eventListeners[captureKey]) {
        for (const fn of node.eventListeners[captureKey]) {
          await fn(ev);
          if (stopped) break;
        }
      }
    }

    // 3. Target and bubbling phase (bottom up)
    for (let i = ancestry.length - 1; i >= 0; i--) {
      if (stopped) break;
      const node = ancestry[i];
      if (node.eventListeners && node.eventListeners[event]) {
        for (const fn of node.eventListeners[event]) {
          await fn(ev);
          if (stopped) break;
        }
      }
    }

    // 4. Browser native default action simulation for text inputs on drop
    if (event === 'drop' && this.tagName === 'INPUT' && !defaultPrevented) {
      const droppedText = ev.dataTransfer.getData('text/plain');
      if (droppedText) {
        this.value = droppedText;
      }
    }

    return ev;
  }

  contains(other) {
    if (!other) return false;
    if (other === this) return true;
    for (const child of this.children) {
      if (child.contains(other)) return true;
    }
    return false;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (mockMatches(curr, selector)) return curr;
      curr = curr.parentNode;
    }
    return null;
  }

  getBoundingClientRect() {
    return this._rect;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    function traverse(node) {
      for (const child of node.children) {
        if (mockMatches(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    }
    traverse(this);
    return results;
  }
}

function mockMatches(el, selector) {
  if (!el || !el.classList) return false;
  if (selector.includes(',')) {
    return selector.split(',').map(s => s.trim()).some(s => mockMatches(el, s));
  }
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) {
    const parts = selector.split('.');
    return parts.filter(Boolean).every(p => {
      if (p.includes('[')) {
        const cls = p.split('[')[0];
        return el.classList.contains(cls);
      }
      return el.classList.contains(p);
    });
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

const mockDocument = {
  body: new MockElement('body'),
  eventListeners: {},
  addEventListener(event, fn, options) {
    const useCapture = typeof options === 'boolean' ? options : !!(options && options.capture);
    const key = useCapture ? `${event}_capture` : event;
    if (!this.eventListeners[key]) this.eventListeners[key] = [];
    this.eventListeners[key].push(fn);
  },
  removeEventListener(event, fn, options) {
    const useCapture = typeof options === 'boolean' ? options : !!(options && options.capture);
    const key = useCapture ? `${event}_capture` : event;
    if (!this.eventListeners[key]) return;
    this.eventListeners[key] = this.eventListeners[key].filter(f => f !== fn);
  },
  async dispatchEvent(event, extra = {}) {
    return await this.body.dispatchEvent(event, extra);
  },
  getElementById(id) {
    return this.querySelector(`#${id}`);
  },
  querySelector(selector) {
    if (mockMatches(this.body, selector)) return this.body;
    return this.body.querySelector(selector);
  },
  querySelectorAll(selector) {
    const res = [];
    if (mockMatches(this.body, selector)) res.push(this.body);
    return res.concat(this.body.querySelectorAll(selector));
  },
  createElement(tag) {
    return new MockElement(tag);
  },
  elementFromPoint(x, y) {
    if (x < 0 || y < 0 || x > 1920 || y > 1080) return null;
    const all = this.body.querySelectorAll('*');
    for (let i = all.length - 1; i >= 0; i--) {
      const el = all[i];
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return el;
      }
    }
    return this.body;
  }
};

const mockWindow = {
  innerWidth: 1200,
  innerHeight: 800,
  document: mockDocument,
  timeUtils: {
    slotsToTime: (s) => {
      const totalMin = 7 * 60 + s * 30;
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    formatTimeLabel: (t) => t,
    formatShortTime: (t) => t
  },
  slotMath: {
    TOTAL_SLOTS: 27,
    getSlotHeight: () => 36,
    getScheduleContext: () => ({ academicYear: '2026-2027', semester: '1st Semester', roomNumber: '204' })
  },
  scheduleValidator: {
    validatePlacement: async () => ({ valid: true })
  },
  ghostScheduleRenderer: {
    loadProfessorGhostSchedule: () => {},
    restoreDefaultOrClearGhost: () => {},
    refreshSplits: () => {}
  },
  scheduleAutoScroller: {
    update: () => {},
    stop: () => {},
    getGridContainer: () => null
  }
};

global.window = mockWindow;
global.document = mockDocument;
global.timeUtils = mockWindow.timeUtils;
global.slotMath = mockWindow.slotMath;
global.scheduleValidator = mockWindow.scheduleValidator;
global.ghostScheduleRenderer = mockWindow.ghostScheduleRenderer;
global.scheduleAutoScroller = mockWindow.scheduleAutoScroller;

// Load schedule-card.renderer.js
const cardRendererCode = fs.readFileSync(path.join(__dirname, '../js/scheduling/rendering/schedule-card.renderer.js'), 'utf8');
const runCardRenderer = new Function('global', 'window', 'document', cardRendererCode);
runCardRenderer(mockWindow, mockWindow, mockDocument);
global.scheduleCardRenderer = mockWindow.scheduleCardRenderer || global.scheduleCardRenderer;
global.showPlaceholder = mockWindow.showPlaceholder || global.showPlaceholder;
global.removePlaceholder = mockWindow.removePlaceholder || global.removePlaceholder;

// Load mouse-drag.js
const mouseDragCode = fs.readFileSync(path.join(__dirname, '../js/scheduling/interactions/mouse-drag.js'), 'utf8');
const runMouseDrag = new Function('global', 'window', 'document', mouseDragCode);
runMouseDrag(mockWindow, mockWindow, mockDocument);
global.scheduleMouseDrag = mockWindow.scheduleMouseDrag || global.scheduleMouseDrag;

// ─── Build DOM Layout (Sidebar Form + Calendar Grid) ───
// 1. Sidebar Panel
const sidebarPanel = new MockElement('div', 'sidebar', 'create-block-panel');
sidebarPanel._rect = { top: 0, bottom: 900, left: 0, right: 350, width: 350, height: 900 };
mockDocument.body.appendChild(sidebarPanel);

const createFormSection = new MockElement('div', 'editor-create-form-section');
createFormSection._rect = { top: 20, bottom: 350, left: 10, right: 340, width: 330, height: 330 };
sidebarPanel.appendChild(createFormSection);

// Subject input
const subjectInput = new MockElement('input', 'custom-select-input', 'block-subject');
subjectInput.placeholder = 'Select or type subject';
subjectInput.value = '';
subjectInput._rect = { top: 80, bottom: 125, left: 20, right: 330, width: 310, height: 45 };
createFormSection.appendChild(subjectInput);

// Section input
const sectionInput = new MockElement('input', 'custom-select-input', 'block-section');
sectionInput.placeholder = 'Select or type section';
sectionInput.value = '';
sectionInput._rect = { top: 180, bottom: 225, left: 20, right: 330, width: 310, height: 45 };
createFormSection.appendChild(sectionInput);

// Available Blocks Tray
const availableBlocksSection = new MockElement('div', 'available-blocks-section');
availableBlocksSection._rect = { top: 380, bottom: 850, left: 10, right: 340, width: 330, height: 470 };
sidebarPanel.appendChild(availableBlocksSection);

const blocksContainer = new MockElement('div', 'schedule-blocks', 'blocks-container');
blocksContainer._rect = { top: 400, bottom: 850, left: 10, right: 340, width: 330, height: 450 };
availableBlocksSection.appendChild(blocksContainer);

// 2. Calendar Grid
const gridContainer = new MockElement('div', 'calendar-grid-container', 'grid-container');
mockDocument.body.appendChild(gridContainer);

const gridHeader = new MockElement('div', 'calendar-grid-header', 'grid-header');
gridHeader._rect = { top: 50, bottom: 99, left: 360, right: 1160, width: 800, height: 49 };
gridContainer.appendChild(gridHeader);

const thurHeaderCell = new MockElement('div', 'grid-header-cell', 'header-thursday');
thurHeaderCell._rect = { top: 50, bottom: 99, left: 760, right: 960, width: 200, height: 49 };
thurHeaderCell.textContent = 'Thursday';
gridHeader.appendChild(thurHeaderCell);

const gridBody = new MockElement('div', 'calendar-grid-body', 'grid-body');
gridBody._rect = { top: 100, bottom: 900, left: 360, right: 1160, width: 800, height: 800 };
gridContainer.appendChild(gridBody);

const thursdayCol = new MockElement('div', 'grid-day-column', 'col-thursday');
thursdayCol.dataset.day = 'Thursday';
thursdayCol._rect = { top: 100, bottom: 900, left: 760, right: 960, width: 200, height: 800 };
gridBody.appendChild(thursdayCol);

const fridayCol = new MockElement('div', 'grid-day-column', 'col-friday');
fridayCol.dataset.day = 'Friday';
fridayCol._rect = { top: 100, bottom: 900, left: 961, right: 1160, width: 200, height: 800 };
gridBody.appendChild(fridayCol);

// Init dropzones and form guards
global.scheduleMouseDrag.initDayColumnDropZones([thursdayCol, fridayCol], blocksContainer);
global.scheduleMouseDrag.initTrayDropZone(blocksContainer);

// Create sample card in Thursday: CC 103, 10:30 AM - 1:00 PM (slots 7 to 12)
const sampleCard = new MockElement('div', 'grid-card', 'card-sample-1');
sampleCard.dataset.start = '7';
sampleCard.dataset.end = '12';
sampleCard.style.top = `${7 * 36}px`;
sampleCard.style.height = `${5 * 36}px`;
thursdayCol.appendChild(sampleCard);
global.scheduleMouseDrag.bindCardDragListeners(sampleCard, 'Santi Jay Esplana');

(async () => {
  // ─── Test 1: Dragging block outside grid boundaries (moves outside) ───
  console.log('--- Test 1: Dragging block outside grid boundaries (pointer moves to header/outside) ---');
  await sampleCard.dispatchEvent('dragstart');
  assert(sampleCard.classList.contains('dragging'), 'Card has dragging class on dragstart');
  assert(mockDocument.body.classList.contains('dragging-active'), 'Body has dragging-active on dragstart');

  await thursdayCol.dispatchEvent('dragover', { clientX: 860, clientY: 200 });
  let placeholder = mockDocument.body.querySelector('.grid-card-placeholder');
  assert(placeholder !== null, 'Placeholder element is rendered when dragging over Thursday column');

  await mockDocument.dispatchEvent('dragover', { clientX: 860, clientY: 40 });
  let placeholderAfterMoveOut = mockDocument.body.querySelector('.grid-card-placeholder');
  assert(placeholderAfterMoveOut === null, 'Placeholder is REMOVED when pointer moves outside grid boundaries');

  // ─── Test 2: Releasing block outside grid (dragend without drop) ───
  console.log('\n--- Test 2: Releasing block outside the grid (dragend without drop) ---');
  await thursdayCol.dispatchEvent('dragover', { clientX: 860, clientY: 105 });
  assert(mockDocument.body.querySelector('.grid-card-placeholder') !== null, 'Placeholder rendered near top boundary (slot 0)');

  await sampleCard.dispatchEvent('dragend');
  await mockDocument.dispatchEvent('dragend');

  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'Placeholder is REMOVED when drag finishes outside grid (dragend)');
  assert(!thursdayCol.classList.contains('drag-over'), 'Thursday column drag-over class is cleared');
  assert(!sampleCard.classList.contains('dragging'), 'Card dragging class is removed');
  assert(!mockDocument.body.classList.contains('dragging-active'), 'Body dragging-active is removed');
  assert(sampleCard.parentNode === thursdayCol, 'Card remains in Thursday column');
  assert(Number(sampleCard.dataset.start) === 7, 'Card start slot is preserved at 7 (10:30 AM)');
  assert(Number(sampleCard.dataset.end) === 12, 'Card end slot is preserved at 12 (1:00 PM)');

  // ─── Test 3: Dragging outside and moving BACK into grid ───
  console.log('\n--- Test 3: Dragging outside and moving BACK into the grid ---');
  await sampleCard.dispatchEvent('dragstart');
  await thursdayCol.dispatchEvent('dragover', { clientX: 860, clientY: 200 });
  assert(mockDocument.body.querySelector('.grid-card-placeholder') !== null, 'Placeholder shows in Thursday');

  await mockDocument.dispatchEvent('dragover', { clientX: 860, clientY: 20 });
  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'Placeholder disappears when moved outside');

  await fridayCol.dispatchEvent('dragover', { clientX: 1060, clientY: 244 });
  const placeholderInFriday = mockDocument.body.querySelector('.grid-card-placeholder');
  assert(placeholderInFriday !== null, 'Placeholder reappears when moving back into Friday');
  assert(placeholderInFriday.parentNode === fridayCol, 'Placeholder is attached to Friday column');

  await sampleCard.dispatchEvent('dragend');
  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'Placeholder cleaned up after ending drag');

  // ─── Test 4: Tray Block dragged outside grid and released ───
  console.log('\n--- Test 4: Tray Block dragged outside grid and released ---');
  const trayBlock = new MockElement('div', 'schedule-block', 'tray-block-1');
  const divSub = new MockElement('div'); divSub.textContent = 'CS 101';
  const divProf = new MockElement('div'); divProf.textContent = 'Prof X';
  const divSec = new MockElement('div'); divSec.textContent = '1A';
  trayBlock.appendChild(divSub);
  trayBlock.appendChild(divProf);
  trayBlock.appendChild(divSec);
  blocksContainer.appendChild(trayBlock);
  global.scheduleMouseDrag.bindTrayBlockDragListeners(trayBlock, 'Prof X');

  await trayBlock.dispatchEvent('dragstart');
  await thursdayCol.dispatchEvent('dragover', { clientX: 860, clientY: 150 });
  assert(mockDocument.body.querySelector('.grid-card-placeholder') !== null, 'Placeholder rendered for tray block');

  await trayBlock.dispatchEvent('dragend');
  await mockDocument.dispatchEvent('dragend');

  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'Placeholder removed when tray block released outside');
  assert(trayBlock.parentNode === blocksContainer, 'Tray block remains safely in tray container');
  assert(thursdayCol.querySelectorAll('.grid-card').length === 1, 'No unintended card created on grid');

  // ─── Test 5: Dropping existing schedule card over Subject input (#block-subject) ───
  console.log('\n--- Test 5: Dropping existing schedule card over Subject input ---');
  subjectInput.value = '';
  await sampleCard.dispatchEvent('dragstart');
  // Drag over Subject input
  await subjectInput.dispatchEvent('dragover', { clientX: 100, clientY: 100 });
  // Drop onto Subject input
  await subjectInput.dispatchEvent('drop', {
    clientX: 100,
    clientY: 100,
    dataTransfer: { getData: () => 'card-sample-1' }
  });
  await sampleCard.dispatchEvent('dragend');

  assert(subjectInput.value === '', 'Subject input value is NOT modified to card ID (retains original value)');
  assert(sampleCard.parentNode === thursdayCol, 'Card remains safely in Thursday column after drop on Subject input');
  assert(Number(sampleCard.dataset.start) === 7, 'Card start slot is preserved (7 / 10:30 AM)');
  assert(Number(sampleCard.dataset.end) === 12, 'Card end slot is preserved (12 / 1:00 PM)');
  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'No stuck placeholder after dropping on Subject input');

  // ─── Test 6: Dropping existing schedule card over Section input (#block-section) ───
  console.log('\n--- Test 6: Dropping existing schedule card over Section input ---');
  sectionInput.value = '';
  await sampleCard.dispatchEvent('dragstart');
  await sectionInput.dispatchEvent('dragover', { clientX: 100, clientY: 200 });
  await sectionInput.dispatchEvent('drop', {
    clientX: 100,
    clientY: 200,
    dataTransfer: { getData: () => 'card-sample-1' }
  });
  await sampleCard.dispatchEvent('dragend');

  assert(sectionInput.value === '', 'Section input value is NOT modified to card ID (retains original value)');
  assert(sampleCard.parentNode === thursdayCol, 'Card remains safely in Thursday column after drop on Section input');
  assert(Number(sampleCard.dataset.start) === 7, 'Card start slot is preserved (7 / 10:30 AM)');
  assert(Number(sampleCard.dataset.end) === 12, 'Card end slot is preserved (12 / 1:00 PM)');
  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'No stuck placeholder after dropping on Section input');

  // ─── Test 7: Releasing a new tray block over Subject & Section inputs ───
  console.log('\n--- Test 7: Releasing new tray block over Subject & Section inputs ---');
  subjectInput.value = 'Existing Subject';
  sectionInput.value = 'Existing Section';

  // Over Subject input
  await trayBlock.dispatchEvent('dragstart');
  await subjectInput.dispatchEvent('drop', {
    clientX: 100,
    clientY: 100,
    dataTransfer: { getData: () => 'tray-block-1' }
  });
  await trayBlock.dispatchEvent('dragend');

  assert(subjectInput.value === 'Existing Subject', 'Subject input retains original value after dropping tray block');
  assert(trayBlock.parentNode === blocksContainer, 'Tray block remains safely in tray container');
  assert(thursdayCol.querySelectorAll('.grid-card').length === 1, 'No new card created on grid');

  // Over Section input
  await trayBlock.dispatchEvent('dragstart');
  await sectionInput.dispatchEvent('drop', {
    clientX: 100,
    clientY: 200,
    dataTransfer: { getData: () => 'tray-block-1' }
  });
  await trayBlock.dispatchEvent('dragend');

  assert(sectionInput.value === 'Existing Section', 'Section input retains original value after dropping tray block');
  assert(trayBlock.parentNode === blocksContainer, 'Tray block remains safely in tray container');
  assert(thursdayCol.querySelectorAll('.grid-card').length === 1, 'No new card created on grid');

  // ─── Test 8: Normal valid drop inside schedule grid still works ───
  console.log('\n--- Test 8: Normal valid drop inside schedule grid still works ---');
  await sampleCard.dispatchEvent('dragstart');
  await fridayCol.dispatchEvent('dragover', { clientX: 1060, clientY: 172 });
  // Drop onto Friday at clientY = 172 -> dropY = 72 -> slot 2 (08:00 AM)
  await fridayCol.dispatchEvent('drop', {
    clientX: 1060,
    clientY: 172,
    dataTransfer: { getData: () => 'card-sample-1' }
  });
  await sampleCard.dispatchEvent('dragend');

  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'Placeholder removed after successful drop');
  assert(sampleCard.parentNode === fridayCol, 'Card successfully moved to Friday column');
  assert(Number(sampleCard.dataset.start) === 2, 'Card start slot updated to 2 (08:00 AM)');
  assert(Number(sampleCard.dataset.end) === 7, 'Card end slot updated to 7 (5 slots duration preserved)');

  // ─── Test 9: Dropping card into #blocks-container tray ───
  console.log('\n--- Test 9: Dropping grid card back into tray container ---');
  await sampleCard.dispatchEvent('dragstart');
  await blocksContainer.dispatchEvent('dragover', { clientX: 100, clientY: 500 });
  await blocksContainer.dispatchEvent('drop', {
    clientX: 100,
    clientY: 500,
    dataTransfer: { getData: () => 'card-sample-1' }
  });
  await sampleCard.dispatchEvent('dragend');

  assert(mockDocument.body.querySelector('.grid-card-placeholder') === null, 'Placeholder removed when card dropped into tray');
  assert(!fridayCol.contains(sampleCard), 'Card removed from timetable column after drop to tray');

  console.log('\n================================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');
  if (failed > 0) process.exit(1);
})();
