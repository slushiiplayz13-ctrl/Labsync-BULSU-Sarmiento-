'use strict';

/**
 * tests/test-schedule-finalization-notification-flood.js
 * Regression QA Suite for LabSync Room Schedule Editor:
 * 1. Rapidly click Finalize Official Schedule several times; only one finalization request should be in flight.
 * 2. Successful finalization produces one success notification for the attempt.
 * 3. Failed finalization produces one error notification and re-enables the button for a retry.
 * 4. After success, repeated clicks do not submit finalization again.
 * 5. Existing authorization, validation, schedule conflict checks, and reopening behavior still work.
 * 6. Normal notifications unrelated to finalization continue to work.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
console.log('🧪 Starting Schedule Finalization Notification Flood QA Suite');
console.log('================================================================\n');

// ─── Simple DOM Mock Setup ───
class MockClassList {
  constructor() {
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
  constructor(tagName, id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this.eventListeners = {};
    this._textContent = '';
    this.value = '';
    this.disabled = false;
    this.attributes = {};
  }

  get textContent() {
    return this._textContent;
  }
  set textContent(val) {
    this._textContent = String(val);
  }

  get innerHTML() {
    return this._innerHTML || this._textContent;
  }
  set innerHTML(val) {
    this._innerHTML = String(val);
    this._textContent = String(val).replace(/<[^>]*>/g, '');
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'hidden') this.style.display = 'none';
  }
  getAttribute(name) {
    return this.attributes[name] || null;
  }
  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'hidden' && this.style.display === 'none') {
      delete this.style.display;
    }
  }

  appendChild(child) {
    if (child.parentNode) child.remove();
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

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(fn);
  }

  removeEventListener(event, fn) {
    if (!this.eventListeners[event]) return;
    this.eventListeners[event] = this.eventListeners[event].filter(h => h !== fn);
  }

  dispatchEvent(event) {
    let result;
    const handlers = this.eventListeners[event.type] || [];
    for (const handler of handlers) {
      result = handler.call(this, event);
    }
    if (typeof this[`on${event.type}`] === 'function') {
      result = this[`on${event.type}`].call(this, event);
    }
    return result;
  }

  click() {
    const evt = {
      type: 'click',
      target: this,
      preventDefault: () => {},
      stopPropagation: () => {}
    };
    return this.dispatchEvent(evt);
  }

  querySelector(sel) {
    for (const child of this.children) {
      if (matches(child, sel)) return child;
      const sub = child.querySelector(sel);
      if (sub) return sub;
    }
    return null;
  }

  querySelectorAll(sel) {
    const list = [];
    for (const child of this.children) {
      if (matches(child, sel)) list.push(child);
      list.push(...child.querySelectorAll(sel));
    }
    return list;
  }
}

function matches(el, sel) {
  if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
  if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return true;
  if (el.tagName.toLowerCase() === sel.toLowerCase()) return true;
  return false;
}

function createTestEnvironment(userRole = 'IT Dept. Head') {
  const elementsById = new Map();
  const toasts = [];

  function getOrCreate(id, tag = 'div', className = '') {
    if (!elementsById.has(id)) {
      elementsById.set(id, new MockElement(tag, id, className));
    }
    return elementsById.get(id);
  }

  // Pre-create standard elements
  const finalizeBtn = getOrCreate('finalize-schedule-btn', 'button');
  finalizeBtn.textContent = 'Finalize Official Schedule';
  finalizeBtn.innerHTML = '<i data-lucide="check-circle"></i> Finalize Official Schedule';

  const reopenBtn = getOrCreate('reopen-schedule-btn', 'button');
  reopenBtn.textContent = 'Reopen for Editing';

  const saveBtn = getOrCreate('save-schedule-btn', 'button');
  const printBtn = getOrCreate('print-schedule-btn', 'button');

  const statusBadge = getOrCreate('schedule-status-badge', 'span', 'schedule-status-badge badge-draft');
  const statusText = getOrCreate('schedule-status-text', 'span');
  statusText.textContent = 'WORKING DRAFT';

  const confirmModal = getOrCreate('schedule-status-confirm-modal', 'div', 'confirm-modal-overlay');
  confirmModal.style.display = 'none';

  const confirmBtn = getOrCreate('status-modal-confirm-btn', 'button', 'confirm-btn');
  confirmBtn.textContent = 'Confirm Finalization';
  const cancelBtn = getOrCreate('status-modal-cancel-btn', 'button', 'confirm-btn');
  cancelBtn.textContent = 'Cancel';
  const titleEl = getOrCreate('status-modal-title', 'h3');
  const descEl = getOrCreate('status-modal-desc', 'p');
  const iconWrap = getOrCreate('status-modal-icon-wrap', 'div');
  const iconEl = getOrCreate('status-modal-icon', 'i');

  confirmModal.appendChild(titleEl);
  confirmModal.appendChild(descEl);
  confirmModal.appendChild(iconWrap);
  iconWrap.appendChild(iconEl);
  confirmModal.appendChild(cancelBtn);
  confirmModal.appendChild(confirmBtn);

  const staleModal = getOrCreate('stale-schedule-modal', 'div');
  staleModal.style.display = 'none';

  const toastContainer = getOrCreate('labsync-toast-container', 'div');
  const origAppend = toastContainer.appendChild.bind(toastContainer);
  toastContainer.appendChild = (card) => {
    origAppend(card);
    const titleEl = card.querySelector('span');
    const title = titleEl ? titleEl.textContent : '';
    const msg = card.textContent;
    let type = (card.dataset && card.dataset.type) ? card.dataset.type : 'success';
    if (!card.dataset || !card.dataset.type) {
      if (msg.toLowerCase().includes('empty') || msg.toLowerCase().includes('conflict')) {
        type = 'warning';
      } else if (msg.toLowerCase().includes('error') || msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('transaction')) {
        type = 'error';
      } else if (msg.toLowerCase().includes('draft') || msg.toLowerCase().includes('curriculum')) {
        type = 'info';
      }
    }
    toasts.push({ msg, type, title, card });
  };

  const body = new MockElement('body');
  body.appendChild(finalizeBtn);
  body.appendChild(reopenBtn);
  body.appendChild(saveBtn);
  body.appendChild(printBtn);
  body.appendChild(confirmModal);
  body.appendChild(staleModal);
  body.appendChild(toastContainer);

  const mockWindow = {
    innerWidth: 1024,
    location: { search: '?room=204' },
    sessionStorage: {
      getItem: (k) => {
        if (k === 'labsync_user') return JSON.stringify({ role: userRole, name: 'Test User' });
        return null;
      },
      setItem: () => {},
      removeItem: () => {}
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    document: {
      body,
      documentElement: body,
      getElementById: (id) => elementsById.get(id) || null,
      querySelector: (sel) => body.querySelector(sel),
      querySelectorAll: (sel) => body.querySelectorAll(sel),
      createElement: (tag) => new MockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    showToast: (msg, type = 'success', title = null) => {
      toasts.push({ msg, type, title, time: Date.now() });
    },
    lucide: {
      createIcons: () => {}
    },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => { if (typeof cb === 'function') cb(); return 1; },
    cancelAnimationFrame: () => {},
    URLSearchParams,
    console,
    scheduleService: {
      acquireRoomLock: async () => ({ acquired: true, editSessionToken: 'test_token' }),
      renewRoomLockHeartbeat: async () => ({ renewed: true }),
      releaseRoomLock: async () => ({ released: true }),
      getRoomSchedule: async () => ({
        status: mockWindow.currentRoomStatus || 'Draft',
        version: mockWindow.currentRoomVersion || 1,
        schedules: mockWindow.currentRoomSchedules || []
      })
    },
    fetch: (url, opts) => {
      if (mockWindow.customFetch) {
        return mockWindow.customFetch(url, opts);
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
  };

  mockWindow.window = mockWindow;

  // Load toast.js, schedule.persistence.js, schedule-editor.controller.js
  const toastJs = fs.readFileSync(path.join(__dirname, '../js/components/toast.js'), 'utf8');
  const persistenceJs = fs.readFileSync(path.join(__dirname, '../js/scheduling/persistence/schedule.persistence.js'), 'utf8');
  const controllerJs = fs.readFileSync(path.join(__dirname, '../js/scheduling/controller/schedule-editor.controller.js'), 'utf8');

  const ctx = vm.createContext(mockWindow);
  vm.runInContext(toastJs, ctx);
  vm.runInContext(persistenceJs, ctx);
  vm.runInContext(controllerJs, ctx);

  return {
    mockWindow,
    ctx,
    toasts,
    finalizeBtn,
    confirmBtn,
    cancelBtn,
    confirmModal,
    statusBadge,
    statusText,
    getOrCreate
  };
}

// ─── Test Execution ───

async function runTests() {
  // =========================================================================
  // SCENARIO 1: Rapid Clicks on Finalize Button & Modal Confirm
  // =========================================================================
  console.log('\n--- Scenario 1: Rapidly click Finalize Official Schedule several times ---');
  {
    const env = createTestEnvironment('IT Dept. Head');
    const { ctx, finalizeBtn, confirmBtn, confirmModal } = env;

    let networkFinalizeCalls = 0;
    let finalizeResolve = null;

    // Mock fetch or persistence finalize to take some asynchronous time
    env.mockWindow.customFetch = async (url) => {
      if (url.includes('/api/schedules/finalize')) {
        networkFinalizeCalls++;
        return new Promise(resolve => {
          finalizeResolve = () => resolve({
            ok: true,
            json: async () => ({ status: 200, version: 2, message: 'Finalized successfully' })
          });
        });
      }
      return { ok: true, json: async () => ({}) };
    };

    // Populate mock schedule data so schedule is not empty
    ctx.schedulePersistence.getCurrentScheduleData = () => [
      { subject: 'CAP 401W', day: 'Monday', startTime: '08:00', endTime: '10:00', professor: 'Prof A', section: '4A-1' }
    ];
    ctx.schedulePersistence.setEditSessionToken('test_session_token_1');

    // Initialize controller bindings
    ctx.scheduleEditorController.initEditor();

    // 1A. Rapidly click Finalize Official Schedule button 5 times synchronously
    finalizeBtn.click();
    finalizeBtn.click();
    finalizeBtn.click();
    finalizeBtn.click();
    finalizeBtn.click();

    assert(confirmModal.style.display !== 'none', 'Confirmation modal is opened after first click');
    assert(finalizeBtn.disabled === true, 'Finalize button is disabled while confirmation modal is active');

    // 1B. Rapidly click Confirm Finalization button 5 times synchronously
    confirmBtn.click();
    confirmBtn.click();
    confirmBtn.click();
    confirmBtn.click();
    confirmBtn.click();

    assert(confirmBtn.disabled === true, 'Confirm button in modal is disabled while request is in flight');
    assert(finalizeBtn.disabled === true, 'Finalize button remains disabled while request is in flight');
    assert(finalizeBtn.classList.contains('loading'), 'Finalize button has loading class for visual feedback');
    assert(finalizeBtn.innerHTML.includes('Finalizing'), 'Finalize button displays "Finalizing..." visual feedback');
    assert(networkFinalizeCalls === 1, `Only ONE network finalize request in flight despite 5 rapid clicks (actual: ${networkFinalizeCalls})`);

    // Complete the async operation
    finalizeResolve();
    await new Promise(r => setTimeout(r, 10));

    assert(networkFinalizeCalls === 1, 'Still exactly 1 network request after completion');
  }

  // =========================================================================
  // SCENARIO 2: Successful Finalization Produces Exactly One Success Notification
  // =========================================================================
  console.log('\n--- Scenario 2: Successful finalization produces one success notification ---');
  {
    const env = createTestEnvironment('IT Dept. Head');
    const { ctx, finalizeBtn, confirmBtn, toasts } = env;

    let finalizeCallCount = 0;
    env.mockWindow.customFetch = async (url) => {
      if (url.includes('/api/schedules/finalize')) {
        finalizeCallCount++;
        env.mockWindow.currentRoomStatus = 'Finalized';
        return {
          ok: true,
          json: async () => ({ status: 200, version: 2, message: 'Schedule finalized' })
        };
      }
      return { ok: true, json: async () => ({ version: 2, status: 'Finalized' }) };
    };

    ctx.schedulePersistence.getCurrentScheduleData = () => [
      { subject: 'CS 101', day: 'Tuesday', startTime: '09:00', endTime: '11:00', professor: 'Prof B', section: '1A-1' }
    ];
    ctx.schedulePersistence.setEditSessionToken('test_session_token_2');

    ctx.scheduleEditorController.initEditor();

    // Trigger finalization
    finalizeBtn.click();
    await confirmBtn.click();
    await new Promise(r => setTimeout(r, 20));

    assert(finalizeCallCount === 1, 'Backend finalize called exactly once');
    const successToasts = toasts.filter(t => t.type === 'success' && t.msg.includes('finalized'));
    assert(successToasts.length === 1, `Produced exactly ONE success notification for the attempt (actual: ${successToasts.length})`);
    assert(ctx.schedulePersistence.getCurrentStatus() === 'Finalized', 'Persistence status updated to Finalized');
  }

  // =========================================================================
  // SCENARIO 3: Failed Finalization Produces One Error Toast & Restores Button for Retry
  // =========================================================================
  console.log('\n--- Scenario 3: Failed finalization produces one error notification and re-enables button ---');
  {
    const env = createTestEnvironment('IT Dept. Head');
    const { ctx, finalizeBtn, confirmBtn, confirmModal, toasts } = env;

    let failCount = 0;
    env.mockWindow.customFetch = async (url) => {
      if (url.includes('/api/schedules/finalize')) {
        failCount++;
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Database transaction error during finalization' })
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    ctx.schedulePersistence.getCurrentScheduleData = () => [
      { subject: 'MATH 201', day: 'Wednesday', startTime: '13:00', endTime: '15:00', professor: 'Prof C', section: '2B-1' }
    ];
    ctx.schedulePersistence.setEditSessionToken('test_session_token_3');

    ctx.scheduleEditorController.initEditor();

    // Trigger failing finalization
    finalizeBtn.click();
    await confirmBtn.click();
    await new Promise(r => setTimeout(r, 20));

    assert(failCount === 1, 'Finalize endpoint called once');
    const errorToasts = toasts.filter(t => t.type === 'error');
    assert(errorToasts.length === 1, `Exactly ONE error notification was shown on failure (actual: ${errorToasts.length})`);
    assert(errorToasts[0].msg.includes('Database transaction error'), 'Error toast contains server error message');

    // Confirm button is re-enabled for retry
    assert(finalizeBtn.disabled === false, 'Finalize button was restored and re-enabled for retry');
    assert(!finalizeBtn.classList.contains('loading'), 'Loading class removed from button');
    assert(finalizeBtn.innerHTML.includes('Finalize Official Schedule'), 'Button text restored to "Finalize Official Schedule"');

    // Retry should work now
    env.mockWindow.customFetch = async (url) => {
      if (url.includes('/api/schedules/finalize')) {
        return {
          ok: true,
          json: async () => ({ status: 200, version: 3, message: 'Retry succeeded' })
        };
      }
      return { ok: true, json: async () => ({ version: 3, status: 'Finalized' }) };
    };

    finalizeBtn.click();
    await confirmBtn.click();
    await new Promise(r => setTimeout(r, 20));

    const retrySuccessToasts = toasts.filter(t => t.type === 'success' && t.msg.includes('finalized'));
    assert(retrySuccessToasts.length === 1, 'Retry successfully finalized schedule');
  }

  // =========================================================================
  // SCENARIO 4: After Success, Repeated Clicks Do Not Submit Finalization Again
  // =========================================================================
  console.log('\n--- Scenario 4: After success, repeated clicks do not submit finalization again ---');
  {
    const env = createTestEnvironment('IT Dept. Head');
    const { ctx, finalizeBtn, confirmBtn, toasts } = env;

    let apiCalls = 0;
    env.mockWindow.customFetch = async (url) => {
      if (url.includes('/api/schedules/finalize')) {
        apiCalls++;
        env.mockWindow.currentRoomStatus = 'Finalized';
        return {
          ok: true,
          json: async () => ({ status: 200, version: 2, message: 'Success' })
        };
      }
      return { ok: true, json: async () => ({ version: 2, status: 'Finalized' }) };
    };

    ctx.schedulePersistence.getCurrentScheduleData = () => [
      { subject: 'ENG 101', day: 'Thursday', startTime: '10:00', endTime: '12:00', professor: 'Prof D', section: '1A-2' }
    ];
    ctx.schedulePersistence.setEditSessionToken('test_session_token_4');

    ctx.scheduleEditorController.initEditor();

    // Finalize schedule once
    finalizeBtn.click();
    await confirmBtn.click();
    await new Promise(r => setTimeout(r, 20));

    assert(apiCalls === 1, 'Initial finalization executed');
    assert(ctx.schedulePersistence.getCurrentStatus() === 'Finalized', 'Status is Finalized');

    const toastCountAfterSuccess = toasts.length;

    // Attempt multiple rapid clicks after finalization has succeeded
    finalizeBtn.click();
    finalizeBtn.click();
    finalizeBtn.click();
    await new Promise(r => setTimeout(r, 20));

    assert(apiCalls === 1, 'Zero subsequent API calls after already finalized');
    assert(toasts.length === toastCountAfterSuccess, 'Zero duplicate toasts spawned by clicks after finalization');
  }

  // =========================================================================
  // SCENARIO 5: Existing Authorization, Validation, Conflicts, and Reopening
  // =========================================================================
  console.log('\n--- Scenario 5: Authorization, validation, conflicts, and reopening ---');
  {
    // 5A. Non-IT Head authorization check
    const pcEnv = createTestEnvironment('Program Coordinator');
    pcEnv.schedulePersistence = pcEnv.ctx.schedulePersistence;
    pcEnv.ctx.scheduleEditorController.initEditor();

    pcEnv.finalizeBtn.click();
    assert(pcEnv.confirmModal.style.display === 'none', 'Program Coordinator cannot open finalization modal');
    const pcDenials = pcEnv.toasts.filter(t => t.type === 'error' && t.msg.includes('IT Department Head'));
    assert(pcDenials.length === 1, 'Program Coordinator receives Permission Denied notification');

    // 5B. Empty schedule validation
    const emptyEnv = createTestEnvironment('IT Dept. Head');
    emptyEnv.ctx.schedulePersistence.getCurrentScheduleData = () => [];
    emptyEnv.ctx.schedulePersistence.setEditSessionToken('empty_token');
    emptyEnv.ctx.scheduleEditorController.initEditor();

    // Click 3 times rapidly on empty schedule
    emptyEnv.finalizeBtn.click();
    emptyEnv.finalizeBtn.click();
    emptyEnv.finalizeBtn.click();

    assert(emptyEnv.confirmModal.style.display === 'none', 'Empty schedule does not open finalization modal');
    const emptyWarnings = emptyEnv.toasts.filter(t => t.type === 'warning' && t.msg.includes('empty'));
    assert(emptyWarnings.length === 1, `Empty schedule produces exactly ONE warning toast despite rapid clicking (actual: ${emptyWarnings.length})`);

    // 5C. Overlapping schedule conflict validation
    const overlapEnv = createTestEnvironment('IT Dept. Head');
    overlapEnv.ctx.schedulePersistence.getCurrentScheduleData = () => [
      { subject: 'Course 1', day: 'Monday', startTime: '08:00', endTime: '10:00' },
      { subject: 'Course 2', day: 'Monday', startTime: '09:00', endTime: '11:00' }
    ];
    overlapEnv.ctx.schedulePersistence.setEditSessionToken('overlap_token');
    overlapEnv.ctx.scheduleEditorController.initEditor();

    let overlapThrown = null;
    try {
      await overlapEnv.ctx.schedulePersistence.finalizeCurrentSchedule();
    } catch (e) {
      overlapThrown = e;
    }
    assert(overlapThrown !== null && overlapThrown.status === 400, 'Same-room overlap rejects with status 400');
    assert(overlapThrown.message.includes('overlaps with'), 'Overlap error message details overlapping classes');

    // 5D. Reopen functionality
    const reopenEnv = createTestEnvironment('IT Dept. Head');
    let reopenCalled = false;
    reopenEnv.ctx.scheduleService = {
      reopenSchedule: async () => {
        reopenCalled = true;
        return { editSessionToken: 'reopened_token' };
      }
    };
    reopenEnv.ctx.schedulePersistence.updateStatusUI('Finalized', 2);
    reopenEnv.ctx.scheduleEditorController.initEditor();

    const reopenBtn = reopenEnv.getOrCreate('reopen-schedule-btn');
    reopenBtn.click();

    assert(reopenEnv.confirmModal.style.display !== 'none', 'Reopen modal opens successfully');
    await reopenEnv.confirmBtn.click();
    await new Promise(r => setTimeout(r, 20));

    assert(reopenCalled === true, 'Reopen schedule API was called');
    const reopenToasts = reopenEnv.toasts.filter(t => t.type === 'success' && t.msg.includes('reopened'));
    assert(reopenToasts.length === 1, 'Reopen produces exactly one success toast');
  }

  // =========================================================================
  // SCENARIO 6: Normal Notifications Unrelated to Finalization Continue to Work
  // =========================================================================
  console.log('\n--- Scenario 6: Normal notifications unrelated to finalization continue to work ---');
  {
    const env = createTestEnvironment('IT Dept. Head');
    const { ctx } = env;

    // Use toast.js showToast directly
    const toastCards = [];
    ctx.document.getElementById('labsync-toast-container').appendChild = (card) => {
      toastCards.push(card);
    };

    // 6A. Different legitimate notifications are all delivered
    ctx.showToast('Draft saved successfully.', 'info', 'Draft Saved');
    ctx.showToast('Profile photo updated.', 'success', 'Profile');
    ctx.showToast('Curriculum subjects loaded.', 'info', 'Curriculum');

    const recentTexts = Array.from(ctx._labsyncRecentToasts ? ctx._labsyncRecentToasts.keys() : []);
    assert(recentTexts.length === 3, `All 3 distinct notifications were processed into cache (actual: ${recentTexts.length})`);

    // 6B. Identical duplicate notification within 1500ms is suppressed
    const preCount = recentTexts.length;
    ctx.showToast('Draft saved successfully.', 'info', 'Draft Saved');
    assert(Array.from(ctx._labsyncRecentToasts.keys()).length === preCount, 'Identical duplicate toast suppressed');

    // 6C. Another distinct message still passes immediately
    ctx.showToast('Room locked by another administrator.', 'error', 'Room Locked');
    assert(Array.from(ctx._labsyncRecentToasts.keys()).length === preCount + 1, 'Different toast passes immediately without suppression');
  }

  // =========================================================================
  // SCENARIO 7: Event Listeners Not Registered Multiple Times On Re-Init
  // =========================================================================
  console.log('\n--- Scenario 7: Idempotent initialization & listener registration ---');
  {
    const env = createTestEnvironment('IT Dept. Head');
    const { ctx, finalizeBtn } = env;

    ctx.schedulePersistence.getCurrentScheduleData = () => [];
    
    // Call initEditor multiple times
    ctx.scheduleEditorController.initEditor();
    ctx.scheduleEditorController.initEditor();
    ctx.scheduleEditorController.initEditor();

    assert(finalizeBtn.eventListeners['click'].length === 1,
      `Finalize button has exactly 1 click listener despite multiple initEditor calls (actual: ${finalizeBtn.eventListeners['click'].length})`);
  }

  console.log('\n================================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
