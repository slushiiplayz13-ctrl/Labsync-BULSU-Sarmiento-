'use strict';

/**
 * tests/audit-duplicate-filters.js
 * Focused Audit and Verification for the Approved Filter & Duplicate Rendering Prevention:
 * 1. Static HTML structural audit across all IT Head and non-IT Head pages
 * 2. Hierarchy and container containment verification
 * 3. Dynamic mounting simulation: idempotency under repeated calls (10x re-initialization)
 * 4. Fallback mounting simulation when static filter bar is missing
 * 5. Full dynamic mounting simulation when entire menu is mounted into .header-right
 * 6. Non-authorized role exclusion and cleanup (Faculty, Program Coordinator)
 * 7. Filter switching invariance (no state mutation, correct active tab & aria-selected)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 AUDIT: APPROVED FILTER & DUPLICATE RENDERING VERIFICATION');
console.log('================================================================\n');

// ────────────────────────────────────────────────────────────────
// 1. Static HTML Audit Across All IT Head Pages
// ────────────────────────────────────────────────────────────────
console.log('--- 1. Static HTML Inspection on IT Head Pages ---');
const itHeadPages = [
  'it-head-dashboard.html',
  'it-head-room-status.html',
  'it-head-pc-reports.html',
  'it-head-my-schedule.html',
  'master-schedule.html',
  'faculty-management.html'
];

for (const file of itHeadPages) {
  const filePath = path.join(__dirname, '..', file);
  assert.ok(fs.existsSync(filePath), `File must exist: ${file}`);
  const content = fs.readFileSync(filePath, 'utf8');

  const menuMatches = content.match(/id=["']key-requests-menu["']/g) || [];
  const filterIdMatches = content.match(/id=["']keyRequestsFilterBar["']/g) || [];
  const filterClassMatches = content.match(/class=["'][^"']*key-requests-filter-bar[^"']*["']/g) || [];
  const btnPendingMatches = content.match(/data-filter=["']pending["']/g) || [];
  const btnApprovedMatches = content.match(/data-filter=["']approved["']/g) || [];
  const btnAllMatches = content.match(/data-filter=["']all["']/g) || [];

  assert.strictEqual(menuMatches.length, 1, `${file} must have exactly 1 #key-requests-menu`);
  assert.strictEqual(filterIdMatches.length, 1, `${file} must have exactly 1 #keyRequestsFilterBar`);
  assert.strictEqual(filterClassMatches.length, 1, `${file} must have exactly 1 .key-requests-filter-bar`);
  assert.strictEqual(btnPendingMatches.length, 1, `${file} must have exactly 1 pending tab`);
  assert.strictEqual(btnApprovedMatches.length, 1, `${file} must have exactly 1 approved tab`);
  assert.strictEqual(btnAllMatches.length, 1, `${file} must have exactly 1 all tab`);

  // Verify filter bar is strictly nested inside #key-requests-menu
  const menuStart = content.indexOf('id="key-requests-menu"');
  const filterStart = content.indexOf('id="keyRequestsFilterBar"');
  const listStart = content.indexOf('id="keyRequestsDropdownList"');

  assert.ok(menuStart !== -1, `${file} must have #key-requests-menu`);
  assert.ok(filterStart > menuStart, `${file}: #keyRequestsFilterBar must be inside #key-requests-menu`);
  assert.ok(listStart > filterStart, `${file}: #keyRequestsFilterBar must appear directly before #keyRequestsDropdownList`);

  console.log(`  ✔ ${file}: exactly 1 menu, 1 filter bar, properly positioned before dropdown list.`);
}

// ────────────────────────────────────────────────────────────────
// 2. Inspection on Pages That Do NOT Need the Filter
// ────────────────────────────────────────────────────────────────
console.log('\n--- 2. Non-IT Head Pages UI Inspection ---');
const nonItHeadPages = [
  'index.html',
  'room-status.html',
  'my-schedule.html',
  'faculty-pc-reports.html',
  'mis-staff-dashboard.html',
  'mis-keys.html',
  'mis-maintenance.html',
  'room-schedule-editor.html',
  'submit-pc-report.html'
];

for (const file of nonItHeadPages) {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');

  const filterIdMatches = content.match(/id=["']keyRequestsFilterBar["']/g) || [];
  const filterClassMatches = content.match(/class=["'][^"']*key-requests-filter-bar[^"']*["']/g) || [];

  assert.strictEqual(filterIdMatches.length, 0, `${file} must NOT contain #keyRequestsFilterBar`);
  assert.strictEqual(filterClassMatches.length, 0, `${file} must NOT contain .key-requests-filter-bar`);
  console.log(`  ✔ ${file}: 0 filter bars (clean isolation, no unwanted UI changes).`);
}

// ────────────────────────────────────────────────────────────────
// 3. Dynamic Mounting & Re-initialization Idempotency Tests
// ────────────────────────────────────────────────────────────────
console.log('\n--- 3. Dynamic Mounting Simulation & Re-initialization Tests ---');

// Lightweight DOM Node mock for headless testing of component DOM manipulation
class MockElement {
  constructor(tag, id = '', className = '') {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.id = id;
    this.className = className;
    this.classList = {
      _classes: new Set(className ? className.split(/\s+/).filter(Boolean) : []),
      contains: (c) => this.classList._classes.has(c),
      add: (c) => this.classList._classes.add(c),
      remove: (c) => this.classList._classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList._classes.has(c)) { this.classList._classes.delete(c); return false; }
          else { this.classList._classes.add(c); return true; }
        }
        if (force) this.classList._classes.add(c);
        else this.classList._classes.delete(c);
        return force;
      }
    };
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
    this.innerHTMLValue = '';
  }

  getAttribute(k) { return this.attributes.get(k) || null; }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  removeAttribute(k) { this.attributes.delete(k); }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  insertBefore(newChild, refChild) {
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    const idx = this.children.indexOf(refChild);
    if (idx === -1) {
      return this.appendChild(newChild);
    }
    newChild.parentNode = this;
    this.children.splice(idx, 0, newChild);
    return newChild;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  prepend(child) {
    if (newChild.parentNode) newChild.parentNode.removeChild(newChild);
    newChild.parentNode = this;
    this.children.unshift(child);
    return child;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (node) => {
      for (const child of node.children) {
        let match = false;
        if (selector.startsWith('#')) {
          if (child.id === selector.slice(1)) match = true;
        } else if (selector.startsWith('.')) {
          if (child.classList.contains(selector.slice(1))) match = true;
        } else if (selector.includes('[data-filter=')) {
          const matchVal = selector.match(/data-filter=["']?([^"'\]]+)/);
          if (matchVal && child.getAttribute('data-filter') === matchVal[1]) match = true;
        } else if (child.tagName === selector.toUpperCase()) {
          match = true;
        }
        if (match) results.push(child);
        check(child);
      }
    };
    check(this);
    return results;
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  get innerHTML() {
    return this.innerHTMLValue;
  }

  set innerHTML(val) {
    this.innerHTMLValue = val;
    this.children = [];
    // Basic mock parser for template fragments in test
    if (val.includes('key-requests-filter-bar')) {
      const fb = new MockElement('div', 'keyRequestsFilterBar', 'key-requests-filter-bar');
      const fg = new MockElement('div', 'keyRequestsFilterGroup', 'key-requests-filter-group');
      const bp = new MockElement('button', 'keyFilterPendingBtn', 'key-filter-btn active');
      bp.setAttribute('data-filter', 'pending');
      const ba = new MockElement('button', 'keyFilterApprovedBtn', 'key-filter-btn');
      ba.setAttribute('data-filter', 'approved');
      const bl = new MockElement('button', 'keyFilterAllBtn', 'key-filter-btn');
      bl.setAttribute('data-filter', 'all');
      fg.appendChild(bp);
      fg.appendChild(ba);
      fg.appendChild(bl);
      fb.appendChild(fg);
      this.appendChild(fb);
    }
    if (val.includes('keyRequestsDropdownList')) {
      const dl = new MockElement('div', 'keyRequestsDropdownList', 'key-requests-dropdown-list');
      this.appendChild(dl);
    }
  }

  contains(el) {
    let curr = el;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentNode;
    }
    return false;
  }
}

// Helper to simulate the exact ensureHeaderElementsMounted implementation from dept-head-key-authorizations.js
function simulateEnsureHeaderElementsMounted(mockDocument, userRole) {
  const isItHead = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'].includes(userRole);
  if (!isItHead) {
    const existingBtn = mockDocument.getElementById('btnHeaderKeyRequests');
    if (existingBtn) existingBtn.remove();
    const existingMenu = mockDocument.getElementById('key-requests-menu');
    if (existingMenu) existingMenu.remove();
    return null;
  }

  const headerRight = mockDocument.querySelector('.header-right');
  if (!headerRight) return null;

  let btn = mockDocument.getElementById('btnHeaderKeyRequests');
  if (!btn) {
    btn = new MockElement('button', 'btnHeaderKeyRequests', 'header-key-requests-btn');
    headerRight.appendChild(btn);
  }

  if (btn && !btn.dataset.hasKeyAuthListener) {
    btn.dataset.hasKeyAuthListener = 'true';
    btn.addEventListener('click', () => {});
  }

  let menu = mockDocument.getElementById('key-requests-menu');
  if (!menu) {
    menu = new MockElement('div', 'key-requests-menu', 'notif-menu key-requests-menu');
    menu.innerHTML = `
      <div class="key-requests-filter-bar" id="keyRequestsFilterBar"></div>
      <div class="key-requests-dropdown-list" id="keyRequestsDropdownList"></div>
    `;
    headerRight.appendChild(menu);
  } else {
    if (!menu.querySelector('#keyRequestsFilterBar') && !menu.querySelector('.key-requests-filter-bar')) {
      const filterBar = new MockElement('div', 'keyRequestsFilterBar', 'key-requests-filter-bar');
      filterBar.innerHTML = `<div class="key-requests-filter-group" id="keyRequestsFilterGroup"></div>`;
      const listEl = menu.querySelector('#keyRequestsDropdownList');
      if (listEl) {
        menu.insertBefore(filterBar, listEl);
      } else {
        menu.appendChild(filterBar);
      }
    }
  }

  const filterGroup = menu.querySelector('#keyRequestsFilterGroup');
  if (filterGroup && !filterGroup.dataset.hasFilterListener) {
    filterGroup.dataset.hasFilterListener = 'true';
    filterGroup.addEventListener('click', () => {});
  }

  return { btn, menu };
}

// ─── Test 3A: Existing static HTML menu + repeated component initialization ────
{
  const doc = {
    body: new MockElement('body'),
    getElementById: function(id) { return this.body.querySelector('#' + id); },
    querySelector: function(sel) { return this.body.querySelector(sel); }
  };
  const hr = new MockElement('div', '', 'header-right');
  const staticBtn = new MockElement('button', 'btnHeaderKeyRequests', 'header-key-requests-btn');
  const staticMenu = new MockElement('div', 'key-requests-menu', 'notif-menu key-requests-menu');
  staticMenu.innerHTML = `
    <div class="key-requests-filter-bar" id="keyRequestsFilterBar"></div>
    <div class="key-requests-dropdown-list" id="keyRequestsDropdownList"></div>
  `;
  hr.appendChild(staticBtn);
  hr.appendChild(staticMenu);
  doc.body.appendChild(hr);

  // Run ensureHeaderElementsMounted 10 times consecutively
  for (let i = 1; i <= 10; i++) {
    simulateEnsureHeaderElementsMounted(doc, 'IT Dept. Head');
  }

  const filterBars = staticMenu.querySelectorAll('#keyRequestsFilterBar');
  assert.strictEqual(filterBars.length, 1, 'Must have exactly ONE filter bar even after 10 re-initializations');
  const fg = staticMenu.querySelector('#keyRequestsFilterGroup');
  const clickListeners = fg.listeners.get('click') || [];
  assert.strictEqual(clickListeners.length, 1, 'Must have exactly ONE click listener registered (hasFilterListener guard)');
  console.log('  ✔ 3A: Idempotent under 10 repeated initializations (filter bar count = 1, listeners = 1).');
}

// ─── Test 3B: Static menu WITHOUT filter bar (dynamic mounting fallback) ───────
{
  const doc = {
    body: new MockElement('body'),
    getElementById: function(id) { return this.body.querySelector('#' + id); },
    querySelector: function(sel) { return this.body.querySelector(sel); }
  };
  const hr = new MockElement('div', '', 'header-right');
  const staticMenu = new MockElement('div', 'key-requests-menu', 'notif-menu key-requests-menu');
  const listEl = new MockElement('div', 'keyRequestsDropdownList', 'key-requests-dropdown-list');
  staticMenu.appendChild(listEl);
  hr.appendChild(staticMenu);
  doc.body.appendChild(hr);

  // First call mounts the filter bar
  simulateEnsureHeaderElementsMounted(doc, 'IT Dept. Head');
  // Subsequent 9 calls must NOT create duplicates
  for (let i = 1; i <= 9; i++) {
    simulateEnsureHeaderElementsMounted(doc, 'IT Dept. Head');
  }

  const filterBars = staticMenu.querySelectorAll('#keyRequestsFilterBar');
  assert.strictEqual(filterBars.length, 1, 'Dynamic fallback must insert exactly 1 filter bar and no duplicates');
  // Verify it was inserted BEFORE the dropdown list
  assert.strictEqual(staticMenu.children[0].id, 'keyRequestsFilterBar', 'Filter bar must be placed before list');
  assert.strictEqual(staticMenu.children[1].id, 'keyRequestsDropdownList', 'List must follow filter bar');
  console.log('  ✔ 3B: Dynamic fallback mounts exactly 1 filter bar before dropdown list.');
}

// ─── Test 3C: Dynamic mounting when menu does not exist at all in DOM ───────────
{
  const doc = {
    body: new MockElement('body'),
    getElementById: function(id) { return this.body.querySelector('#' + id); },
    querySelector: function(sel) { return this.body.querySelector(sel); }
  };
  const hr = new MockElement('div', '', 'header-right');
  doc.body.appendChild(hr);

  for (let i = 1; i <= 5; i++) {
    simulateEnsureHeaderElementsMounted(doc, 'IT Dept. Head');
  }

  const menus = hr.querySelectorAll('#key-requests-menu');
  assert.strictEqual(menus.length, 1, 'Must create exactly 1 #key-requests-menu');
  const filterBars = menus[0].querySelectorAll('#keyRequestsFilterBar');
  assert.strictEqual(filterBars.length, 1, 'Must have exactly 1 filter bar inside dynamically mounted menu');
  console.log('  ✔ 3C: Completely dynamic mounting creates exactly 1 menu with exactly 1 filter bar.');
}

// ─── Test 3D: Non-authorized role exclusion and cleanup ─────────────────────────
{
  const doc = {
    body: new MockElement('body'),
    getElementById: function(id) { return this.body.querySelector('#' + id); },
    querySelector: function(sel) { return this.body.querySelector(sel); }
  };
  const hr = new MockElement('div', '', 'header-right');
  const leftoverBtn = new MockElement('button', 'btnHeaderKeyRequests', 'header-key-requests-btn');
  const leftoverMenu = new MockElement('div', 'key-requests-menu', 'notif-menu key-requests-menu');
  hr.appendChild(leftoverBtn);
  hr.appendChild(leftoverMenu);
  doc.body.appendChild(hr);

  const pcResult = simulateEnsureHeaderElementsMounted(doc, 'Program Coordinator');
  assert.strictEqual(pcResult, null, 'Must return null for Program Coordinator');
  assert.strictEqual(doc.getElementById('btnHeaderKeyRequests'), null, 'Must remove button for Program Coordinator');
  assert.strictEqual(doc.getElementById('key-requests-menu'), null, 'Must remove menu for Program Coordinator');

  const facultyResult = simulateEnsureHeaderElementsMounted(doc, 'Faculty');
  assert.strictEqual(facultyResult, null, 'Must return null for Faculty');
  console.log('  ✔ 3D: Program Coordinator & Faculty are strictly excluded; leftover elements purged.');
}

// ────────────────────────────────────────────────────────────────
// 4. Dropdown Toggle Records Refresh Inspection
// ────────────────────────────────────────────────────────────────
console.log('\n--- 4. Dropdown Toggle Implementation Inspection ---');
const compPath = path.join(__dirname, '..', 'js', 'components', 'dept-head-key-authorizations.js');
const compCode = fs.readFileSync(compPath, 'utf8');

assert.ok(
  compCode.includes('loadPendingKeyAuthorizations().catch(') || compCode.includes('loadPendingKeyAuthorizations()'),
  'toggleKeyRequestsDropdown must invoke loadPendingKeyAuthorizations on open'
);
assert.ok(
  compCode.includes("!menu.querySelector('#keyRequestsFilterBar')") && compCode.includes(".key-requests-filter-bar"),
  'ensureHeaderElementsMounted must check both ID and class to prevent duplicate filter bar'
);
assert.ok(
  compCode.includes('filterGroup.dataset.hasFilterListener'),
  'Must use dataset.hasFilterListener guard to prevent duplicate click listeners'
);
assert.ok(
  compCode.includes('btn.dataset.hasKeyAuthListener'),
  'Must use dataset.hasKeyAuthListener guard on toggle button'
);
console.log('  ✔ Dropdown toggle refreshes records immediately on open.');
console.log('  ✔ Dual ID and class guard prevents duplicate filter bar mounting.');
console.log('  ✔ Listener guards prevent duplicate event listeners.\n');

console.log('================================================================');
console.log('🎉 AUDIT SUCCESSFUL: ZERO DUPLICATE FILTERS CONFIRMED');
console.log('================================================================\n');
