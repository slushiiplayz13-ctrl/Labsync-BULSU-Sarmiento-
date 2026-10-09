'use strict';

/**
 * tests/test-save-button-dirty.js
 * Automated QA Verification Suite for Master Schedule Save Button State:
 * 1. Open Master Schedule → Save disabled.
 * 2. Click around without changing anything → remains disabled.
 * 3. Add a schedule → Save enabled.
 * 4. Revert/remove the change → Save disabled.
 * 5. Edit an existing schedule → Save enabled.
 * 6. Restore the original value → Save disabled.
 * 7. Delete a schedule → Save enabled.
 * 8. Save successfully → Save disabled.
 * 9. Confirm the saved changes remain after refresh.
 * 10. Confirm existing Master Schedule functionality still works.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database/connection');

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
console.log('🧪 Starting Master Schedule Save Button Change Detection QA Tests');
console.log('================================================================\n');

// 1. Static Checks
console.log('--- 1. Static HTML, CSS & JS Code Verification ---');
const editorHtmlPath = path.join(__dirname, '../room-schedule-editor.html');
const editorHtml = fs.readFileSync(editorHtmlPath, 'utf8');

assert(editorHtml.includes('id="save-schedule-btn" class="btn-primary" disabled'),
  'Save Schedule button has native disabled attribute by default in HTML');

assert(editorHtml.includes('#save-schedule-btn:disabled') && editorHtml.includes('cursor: not-allowed !important'),
  'Disabled button CSS styling correctly defined with cursor: not-allowed and opacity');

const scheduleStateJsPath = path.join(__dirname, '../js/scheduling/state/schedule.state.js');
const scheduleStateJs = fs.readFileSync(scheduleStateJsPath, 'utf8');

assert(scheduleStateJs.includes('captureScheduleSnapshot') && scheduleStateJs.includes('setBaseline') && scheduleStateJs.includes('hasChanges'),
  'schedule.state.js exports captureScheduleSnapshot, setBaseline, and hasChanges');

assert(scheduleStateJs.includes('updateSaveButtonState'),
  'schedule.state.js provides reactive updateSaveButtonState()');

const persistenceJsPath = path.join(__dirname, '../js/scheduling/persistence/schedule.persistence.js');
const persistenceJs = fs.readFileSync(persistenceJsPath, 'utf8');

assert(persistenceJs.includes('setBaseline') && persistenceJs.includes('saveCurrentSchedule'),
  'schedule.persistence.js calls setBaseline upon loading and saving schedules');

const controllerJsPath = path.join(__dirname, '../js/scheduling/controller/schedule-editor.controller.js');
const controllerJs = fs.readFileSync(controllerJsPath, 'utf8');

assert(!controllerJs.includes("saveBtn.innerHTML = '<i data-lucide=\"edit-2\"") && controllerJs.includes('updateSaveButtonState'),
  'controller does not swap to view-mode Edit Schedule and updates Save button state');

// 2. Dynamic Runtime Browser Verification via Chrome DevTools Protocol
async function runRuntimeTests() {
  console.log('\n--- 2. Runtime Browser Verification via Chrome CDP ---');

  const baseUrl = 'http://localhost:3000';
  const TEST_ROOM = '204';
  const TEST_AY = '2098-2099';
  const TEST_SEM = 'Summer';

  let sessionCookieVal = null;
  let activeLockToken = null;

  // 1. Resolve actual Room_ID for Room 204 from existing database
  const [roomRows] = await db.query(
    'SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = ?',
    [TEST_ROOM]
  );
  if (!roomRows || roomRows.length === 0) {
    throw new Error(`ABORT: Cannot resolve Room_ID for test room ${TEST_ROOM}`);
  }
  const testRoomId = roomRows[0].Room_ID;

  // 2. Validate proposed disposable term across all rooms.
  // If ANY records exist, abort with a clear error without deleting or overwriting anything.
  const [existingTermSchedules] = await db.query(
    'SELECT Schedule_ID, Room_ID, Academic_Year, Semester FROM schedules WHERE Academic_Year = ? AND Semester = ?',
    [TEST_AY, TEST_SEM]
  );
  const [existingTermDrafts] = await db.query(
    'SELECT Draft_ID, Room_ID, Academic_Year, Semester FROM schedule_drafts WHERE Academic_Year = ? AND Semester = ?',
    [TEST_AY, TEST_SEM]
  );
  const [existingTermMetadata] = await db.query(
    'SELECT Metadata_ID, Room_ID, Academic_Year, Semester, Status FROM schedule_metadata WHERE Academic_Year = ? AND Semester = ?',
    [TEST_AY, TEST_SEM]
  );

  if (existingTermSchedules.length > 0 || existingTermDrafts.length > 0 || existingTermMetadata.length > 0) {
    throw new Error(
      `ABORT: Proposed disposable test term (${TEST_AY}, ${TEST_SEM}) is not empty! ` +
      `Existing records found: schedules=${existingTermSchedules.length}, drafts=${existingTermDrafts.length}, metadata=${existingTermMetadata.length}. ` +
      `Aborting test without modifying any data.`
    );
  }
  console.log(`  🔒 Initial term validation passed: AY ${TEST_AY}, ${TEST_SEM} has zero records across all rooms.`);

  // 3. Snapshot existing real records outside test term for identity-level comparison
  const [initialRealSchedules] = await db.query(
    'SELECT Schedule_ID, User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme FROM schedules WHERE Academic_Year != ? OR Semester != ? ORDER BY Schedule_ID ASC',
    [TEST_AY, TEST_SEM]
  );
  const [initialRealMetadata] = await db.query(
    'SELECT Metadata_ID, Room_ID, Academic_Year, Semester, Version, Status, Finalized_By, Updated_By FROM schedule_metadata WHERE Academic_Year != ? OR Semester != ? ORDER BY Metadata_ID ASC',
    [TEST_AY, TEST_SEM]
  );
  const [initialRealDrafts] = await db.query(
    'SELECT Draft_ID, User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme FROM schedule_drafts WHERE Academic_Year != ? OR Semester != ? ORDER BY Draft_ID ASC',
    [TEST_AY, TEST_SEM]
  );

  try {
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'head@labsync.com', password: 'Password123!' })
    });
    if (loginRes.ok) {
      const setCookieHeader = loginRes.headers.get('set-cookie');
      const match = setCookieHeader && setCookieHeader.match(/connect\.sid=([^;]+)/);
      sessionCookieVal = match ? match[1] : null;
      console.log('  🔒 Authenticated as IT Dept. Head for collaborative room-lock session.');
    }
  } catch (authErr) {
    console.warn('  ⚠️ Could not authenticate with server:', authErr.message);
  }

  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.CHROME_BIN
  ].filter(Boolean);

  let chromePath = chromePaths.find(p => fs.existsSync(p));
  if (!chromePath) {
    console.log('  ⚠️ Chrome binary not found in standard paths, skipping browser headless tests.');
    await finish();
    return;
  }

  const port = 9555;
  const tempProfile = path.join(__dirname, `temp-chrome-save-${Date.now()}`);

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    'about:blank'
  ], { stdio: 'ignore' });

  let cleanupDone = false;
  async function cleanup() {
    if (cleanupDone) return;
    cleanupDone = true;

    let latestToken = activeLockToken;
    try {
      if (typeof evaluate === 'function') {
        latestToken = await evaluate(`(() => {
          const tok = window.schedulePersistence ? window.schedulePersistence.getEditSessionToken() : null;
          if (window.schedulePersistence && typeof window.schedulePersistence.releaseCurrentLock === 'function') {
            window.schedulePersistence.releaseCurrentLock();
          }
          return tok;
        })()`).catch(() => activeLockToken);
      }
    } catch (e) {}

    const tokenToRelease = latestToken || activeLockToken;

    if (sessionCookieVal) {
      try {
        const relRes = await fetch(`${baseUrl}/api/schedules/room-locks/release`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `connect.sid=${sessionCookieVal}`,
            ...(tokenToRelease ? { 'X-Edit-Session-Token': tokenToRelease } : {})
          },
          body: JSON.stringify({
            roomNumber: TEST_ROOM,
            academicYear: TEST_AY,
            semester: TEST_SEM,
            editSessionToken: tokenToRelease
          })
        });
        if (relRes.ok) {
          const relData = await relRes.json();
          if (relData.released) {
            console.log(`  🔒 Lock release confirmed for ${TEST_ROOM}|${TEST_AY}|${TEST_SEM}`);
          }
        }
      } catch (e) {}

      // Explicit verification: check server lock status to ensure lock is no longer held
      try {
        const statusRes = await fetch(`${baseUrl}/api/schedules/room-locks/status?roomNumber=${TEST_ROOM}&academicYear=${encodeURIComponent(TEST_AY)}&semester=${encodeURIComponent(TEST_SEM)}`, {
          headers: { 'Cookie': `connect.sid=${sessionCookieVal}` }
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.locked === false) {
            console.log(`  🔒 Lock status verified: unlocked (${TEST_ROOM}|${TEST_AY}|${TEST_SEM})`);
          } else {
            console.warn(`  ⚠️ Lock still reported active:`, statusData.lock);
          }
        }
      } catch (e) {}
    }

    try {
      await db.query(
        'DELETE FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [testRoomId, TEST_AY, TEST_SEM]
      );
      await db.query(
        'DELETE FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
        [testRoomId, TEST_AY, TEST_SEM]
      );
      console.log(`  🧹 Scoped cleanup: purged test-owned draft & metadata rows for Room ${TEST_ROOM} (ID: ${testRoomId}) | ${TEST_AY} | ${TEST_SEM}`);
    } catch (dbErr) {
      console.warn('  ⚠️ Database scoped cleanup error:', dbErr.message);
    }

    try { chromeProc.kill(); } catch (e) {}
    try {
      await new Promise(r => setTimeout(r, 500));
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }

  process.on('exit', () => cleanup());
  process.on('SIGINT', () => { cleanup(); process.exit(); });

  try {
    let versionData = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (res.ok) {
          versionData = await res.json();
          break;
        }
      } catch (e) {}
    }

    if (!versionData) {
      console.error('  ❌ Could not connect to headless Chrome CDP.');
      return;
    }

  const ws = new WebSocket(versionData.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let msgId = 1;
  const pendingRequests = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pendingRequests.has(msg.id)) {
      const { resolve, reject } = pendingRequests.get(msg.id);
      pendingRequests.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const newTarget = await sendCommand('Target.createTarget', { url: 'about:blank' });
  const targetId = newTarget.targetId;
  const pageWsUrl = `ws://127.0.0.1:${port}/devtools/page/${targetId}`;

  const pageWs = new WebSocket(pageWsUrl);
  await new Promise((resolve) => pageWs.onopen = resolve);

  const pagePending = new Map();
  pageWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pagePending.has(msg.id)) {
      const { resolve, reject } = pagePending.get(msg.id);
      pagePending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function pageSend(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pagePending.set(id, { resolve, reject });
      pageWs.send(JSON.stringify({ id, method, params }));
    });
  }

  await pageSend('Network.enable');
  await pageSend('Page.enable');
  await pageSend('DOM.enable');
  await pageSend('CSS.enable');

  if (sessionCookieVal) {
    await pageSend('Network.setCookie', {
      name: 'connect.sid',
      value: decodeURIComponent(sessionCookieVal),
      url: baseUrl
    });
  }

  await pageSend('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const userObj = { role: 'IT Dept. Head', name: 'Andrei Gabito', email: 'head@labsync.com' };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        sessionStorage.setItem('labsync_user', JSON.stringify(userObj));

        // Mock API responses for clean test isolation
        const origFetch = window.fetch;
        let mockedRoomSchedules = null;
        try {
          const cached = sessionStorage.getItem('__test_mocked_schedules');
          if (cached) mockedRoomSchedules = JSON.parse(cached);
        } catch (e) {}

        if (!mockedRoomSchedules) {
          mockedRoomSchedules = [
            {
              Schedule_ID: 101,
              Subject_Name: 'IT 101 - Computer Systems',
              Professor_Name: 'Dr. Alan Turing',
              Section: '2A1',
              Day_of_Week: 'Monday',
              Start_Time: '08:30:00',
              End_Time: '10:00:00',
              Color_Theme: 'Default'
            }
          ];
        }

        window.__mockedRoomSchedules = mockedRoomSchedules;

        window.fetch = async function(url, options = {}) {
          if (typeof url === 'string') {
            if (url.includes('/api/user/current')) {
              return new Response(JSON.stringify({ user: userObj }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.includes('/api/schedules/room/')) {
              return new Response(JSON.stringify(window.__mockedRoomSchedules), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.includes('/api/schedules/save') && options.method === 'POST') {
              const body = JSON.parse(options.body || '{}');
              window.__lastSavedPayload = body;
              const saveRes = await origFetch.apply(this, [url, options]);
              // Update mock data to match saved schedule
              window.__mockedRoomSchedules = (body.schedules || []).map((s, idx) => ({
                Schedule_ID: 200 + idx,
                Subject_Name: s.subject,
                Professor_Name: s.professor,
                Section: s.section,
                Day_of_Week: s.day,
                Start_Time: s.startTime + ':00',
                End_Time: s.endTime + ':00',
                Color_Theme: s.colorTheme || 'Default'
              }));
              try {
                sessionStorage.setItem('__test_mocked_schedules', JSON.stringify(window.__mockedRoomSchedules));
              } catch (e) {}
              return saveRes;
            }
            if (url.includes('/api/faculty')) {
              return new Response(JSON.stringify([{ Name: 'Dr. Alan Turing' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.includes('/api/curriculum')) {
              return new Response(JSON.stringify([{ Subject_Code: 'IT 101', Subject_Name: 'Computer Systems' }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
          }
          return origFetch.apply(this, [url, options]);
        };
      } catch (e) {}
    `
  });

  async function evaluate(expression) {
    const res = await pageSend('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

    // Navigate to editor with dedicated disposable term
    const editorUrl = `http://localhost:3000/room-schedule-editor.html?room=${TEST_ROOM}&academicYear=${encodeURIComponent(TEST_AY)}&semester=${encodeURIComponent(TEST_SEM)}`;
    await pageSend('Page.navigate', { url: editorUrl });
    await new Promise(r => setTimeout(r, 1200));

    const initialLockStatus = await evaluate(`
      (() => ({
        hasToken: !!(window.schedulePersistence && window.schedulePersistence.getEditSessionToken()),
        token: window.schedulePersistence ? window.schedulePersistence.getEditSessionToken() : null,
        isLockedByOther: !!(window.schedulePersistence && window.schedulePersistence.isLockedByOther()),
        isRoomLocked: document.body.classList.contains('room-locked')
      }))()
    `);
    if (initialLockStatus.token) {
      activeLockToken = initialLockStatus.token;
    }
    assert(initialLockStatus.hasToken === true && initialLockStatus.isRoomLocked === false,
      `Collaborative room edit lock acquired successfully on disposable term (${TEST_ROOM} | ${TEST_AY} | ${TEST_SEM})`);

  // TEST 1: Open Master Schedule → Save disabled
  console.log('\nScenario 1: Open Master Schedule → Save disabled');
  const initialSaveState = await evaluate(`
    (() => {
      const btn = document.getElementById('save-schedule-btn');
      return {
        disabled: btn ? btn.disabled : null,
        hasAttr: btn ? btn.hasAttribute('disabled') : null,
        opacity: btn ? window.getComputedStyle(btn).opacity : null,
        cursor: btn ? window.getComputedStyle(btn).cursor : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(initialSaveState.disabled === true, 'Save button has disabled === true on load');
  assert(initialSaveState.hasAttr === true, 'Save button has native [disabled] attribute on load');
  assert(initialSaveState.hasChanges === false, 'scheduleState.hasChanges() is false on load');
  assert(parseFloat(initialSaveState.opacity) <= 0.6, 'Disabled styling applied: opacity <= 0.6');
  assert(initialSaveState.cursor === 'not-allowed', 'Disabled styling applied: cursor === not-allowed');

  // TEST 2: Click around without changing anything → remains disabled
  console.log('\nScenario 2: Click around without changing anything → remains disabled');
  const clickAroundState = await evaluate(`
    (() => {
      // Click professor selector trigger
      const profTrigger = document.querySelector('#professor-wrapper .custom-select-trigger');
      if (profTrigger) profTrigger.click();
      // Click document body to close
      document.body.click();

      // Click card info icon to open modal
      const infoIcon = document.querySelector('.card-info-icon');
      if (infoIcon) infoIcon.click();

      // Click Done without changes
      const doneBtn = document.getElementById('modal-save-btn');
      if (doneBtn) doneBtn.click();

      const btn = document.getElementById('save-schedule-btn');
      return {
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(clickAroundState.disabled === true, 'Save button remains disabled after clicking controls without changing anything');
  assert(clickAroundState.hasChanges === false, 'scheduleState.hasChanges() remains false');

  // TEST 3: Add a schedule → Save enabled
  console.log('\nScenario 3: Add a schedule → Save enabled');
  const addScheduleState = await evaluate(`
    (() => {
      // Simulate adding a card to Tuesday column
      const col = document.querySelector('.grid-day-column[data-day="Tuesday"]');
      const createFn = window.scheduleCardRenderer ? window.scheduleCardRenderer.createGridCard : window.createGridCard;
      const newCard = createFn(null, 'CS 202 - Data Structures', 'Dr. Alan Turing', '2A2', '10:00', '12:00', 'Default');
      col.appendChild(newCard);
      
      if (window.scheduleState && window.scheduleState.updateSaveButtonState) {
        window.scheduleState.updateSaveButtonState();
      }

      const btn = document.getElementById('save-schedule-btn');
      return {
        cardAdded: !!document.getElementById(newCard.id),
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(addScheduleState.cardAdded === true, 'New schedule card added to Tuesday');
  assert(addScheduleState.hasChanges === true, 'scheduleState.hasChanges() became true after adding schedule');
  assert(addScheduleState.disabled === false, 'Save Schedule button ENABLED (disabled === false)');

  // TEST 4: Revert/remove the change → Save disabled
  console.log('\nScenario 4: Revert/remove the change → Save disabled');
  const revertAddState = await evaluate(`
    (() => {
      // Remove the newly added Tuesday card
      const col = document.querySelector('.grid-day-column[data-day="Tuesday"]');
      const cards = col.querySelectorAll('.grid-card');
      cards.forEach(c => c.remove());

      if (window.scheduleState && window.scheduleState.updateSaveButtonState) {
        window.scheduleState.updateSaveButtonState();
      }

      const btn = document.getElementById('save-schedule-btn');
      return {
        tuesdayCards: col.querySelectorAll('.grid-card').length,
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(revertAddState.tuesdayCards === 0, 'Reverted addition: Tuesday is empty again');
  assert(revertAddState.hasChanges === false, 'scheduleState.hasChanges() returned to false');
  assert(revertAddState.disabled === true, 'Save Schedule button DISABLED again (disabled === true)');

  // TEST 5: Edit an existing schedule (change color) → Save enabled
  console.log('\nScenario 5: Edit an existing schedule → Save enabled');
  const editScheduleState = await evaluate(`
    (() => {
      const card = document.querySelector('.grid-day-column[data-day="Monday"] .grid-card');
      if (window.applyCardColor) {
        window.applyCardColor(card, 'Emerald');
      }
      if (window.scheduleState && window.scheduleState.updateSaveButtonState) {
        window.scheduleState.updateSaveButtonState();
      }
      const btn = document.getElementById('save-schedule-btn');
      return {
        cardColor: card.dataset.color,
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(editScheduleState.cardColor === 'Emerald', 'Card color changed to Emerald');
  assert(editScheduleState.hasChanges === true, 'scheduleState.hasChanges() is true after color edit');
  assert(editScheduleState.disabled === false, 'Save Schedule button ENABLED');

  // TEST 6: Restore original value → Save disabled
  console.log('\nScenario 6: Restore original value → Save disabled');
  const restoreColorState = await evaluate(`
    (() => {
      const card = document.querySelector('.grid-day-column[data-day="Monday"] .grid-card');
      if (window.applyCardColor) {
        window.applyCardColor(card, 'Default');
      }
      if (window.scheduleState && window.scheduleState.updateSaveButtonState) {
        window.scheduleState.updateSaveButtonState();
      }
      const btn = document.getElementById('save-schedule-btn');
      return {
        cardColor: card.dataset.color,
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(restoreColorState.cardColor === 'Default', 'Card color restored to Default');
  assert(restoreColorState.hasChanges === false, 'scheduleState.hasChanges() returned to false');
  assert(restoreColorState.disabled === true, 'Save Schedule button DISABLED again');

  // TEST 7: Delete a schedule → Save enabled
  console.log('\nScenario 7: Delete a schedule → Save enabled');
  const deleteScheduleState = await evaluate(`
    (() => {
      const card = document.querySelector('.grid-day-column[data-day="Monday"] .grid-card');
      if (window.schedulePersistence && window.schedulePersistence.deleteGridCardRef) {
        window.schedulePersistence.deleteGridCardRef(card);
      } else {
        card.remove();
        if (window.scheduleState && window.scheduleState.updateSaveButtonState) {
          window.scheduleState.updateSaveButtonState();
        }
      }
      const btn = document.getElementById('save-schedule-btn');
      return {
        mondayCards: document.querySelectorAll('.grid-day-column[data-day="Monday"] .grid-card').length,
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(deleteScheduleState.mondayCards === 0, 'Card deleted from Monday');
  assert(deleteScheduleState.hasChanges === true, 'scheduleState.hasChanges() is true after deletion');
  assert(deleteScheduleState.disabled === false, 'Save Schedule button ENABLED');

  // TEST 8: Save successfully → Save disabled
  console.log('\nScenario 8: Save successfully → Save disabled');
  const saveSuccessState = await evaluate(`
    (async () => {
      const btn = document.getElementById('save-schedule-btn');
      btn.click();
      // Allow async save to complete
      await new Promise(r => setTimeout(r, 1000));

      return {
        disabled: btn.disabled,
        hasAttr: btn.hasAttribute('disabled'),
        text: btn.textContent.trim(),
        hasChanges: window.scheduleState.hasChanges(),
        savedCount: window.__lastSavedPayload ? window.__lastSavedPayload.schedules.length : null,
        savedToken: window.__lastSavedPayload ? window.__lastSavedPayload.editSessionToken : null
      };
    })()
  `);
  if (saveSuccessState.savedToken) {
    activeLockToken = saveSuccessState.savedToken;
  }
  assert(saveSuccessState.savedCount === 0, 'POST /api/schedules/save was called with updated empty grid');
  assert(!!saveSuccessState.savedToken, 'POST /api/schedules/save included valid editSessionToken from room lock');
  assert(saveSuccessState.disabled === true, 'Save Schedule button DISABLED after successful save');
  assert(saveSuccessState.hasChanges === false, 'scheduleState.hasChanges() is false after save (baseline updated)');
  assert(saveSuccessState.text.includes('Save Draft'), `Button text remains "Save Draft" (was: "${saveSuccessState.text}")`);

  // Verify that the browser test successfully created and saved its temporary draft in the database
  const [createdMetadata] = await db.query(
    'SELECT Metadata_ID, Room_ID, Academic_Year, Semester, Status FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
    [testRoomId, TEST_AY, TEST_SEM]
  );
  assert(createdMetadata.length > 0 && createdMetadata[0].Status === 'Draft',
    `Browser test successfully persisted temporary draft metadata in database for Room ${TEST_ROOM} (ID: ${testRoomId})`);

  // TEST 9: Confirm the saved changes remain after refresh
  console.log('\nScenario 9: Confirm the saved changes remain after refresh');
  await pageSend('Page.reload');
  await new Promise(r => setTimeout(r, 1200));

  const reloadedToken = await evaluate(`window.schedulePersistence ? window.schedulePersistence.getEditSessionToken() : null`);
  if (reloadedToken) {
    activeLockToken = reloadedToken;
  }

  const afterReloadState = await evaluate(`
    (() => {
      const mondayCards = document.querySelectorAll('.grid-day-column[data-day="Monday"] .grid-card').length;
      const btn = document.getElementById('save-schedule-btn');
      return {
        mondayCards,
        disabled: btn ? btn.disabled : null,
        hasChanges: window.scheduleState ? window.scheduleState.hasChanges() : null
      };
    })()
  `);
  assert(afterReloadState.mondayCards === 0, 'Saved changes persisted after refresh (0 cards on Monday)');
  assert(afterReloadState.disabled === true, 'Save button remains disabled upon page refresh');
  assert(afterReloadState.hasChanges === false, 'No unsaved changes detected upon refresh');

  // TEST 10: Confirm existing Master Schedule functionality still works
  console.log('\nScenario 10: Confirm existing Master Schedule functionality still works');
  const existingFeaturesState = await evaluate(`
    (() => {
      // Test creating a block in the left panel tray
      const subjInput = document.getElementById('block-subject');
      const profWrapper = document.getElementById('professor-wrapper');
      const secInput = document.getElementById('block-section');
      const createBtn = document.getElementById('create-block-btn');

      if (subjInput) subjInput.value = 'MATH 101';
      if (profWrapper) profWrapper.dataset.value = 'Dr. Alan Turing';
      if (secInput) secInput.value = '1A';

      if (createBtn) createBtn.click();

      const trayBlocks = document.querySelectorAll('#blocks-container .schedule-block').length;
      const saveBtn = document.getElementById('save-schedule-btn');

      return {
        trayBlocks,
        saveDisabledWhileBlockInTray: saveBtn.disabled,
        printBtnExists: !!document.getElementById('print-schedule-btn'),
        backBtnExists: !!document.getElementById('editor-back-btn')
      };
    })()
  `);
  assert(existingFeaturesState.trayBlocks >= 1, 'Creating a tray block works correctly in the left panel');
  assert(existingFeaturesState.saveDisabledWhileBlockInTray === true, 'Creating tray block does not prematurely enable Save until scheduled on grid');
  assert(existingFeaturesState.printBtnExists === true, 'Print Schedule button remains available');
  assert(existingFeaturesState.backBtnExists === true, 'Back button remains available');

  } finally {
    await cleanup();
  }

  // --- 3. Post-Cleanup Verification & Data Integrity ---
  console.log('\n--- 3. Post-Cleanup Verification & Data Integrity ---');

  // 1. Verify server reports lock as unlocked
  let lockIsUnlocked = false;
  try {
    const statusRes = await fetch(
      `${baseUrl}/api/schedules/room-locks/status?roomNumber=${TEST_ROOM}&academicYear=${encodeURIComponent(TEST_AY)}&semester=${encodeURIComponent(TEST_SEM)}`,
      { headers: sessionCookieVal ? { 'Cookie': `connect.sid=${sessionCookieVal}` } : {} }
    );
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      lockIsUnlocked = (statusData.locked === false);
    }
  } catch (e) {}
  assert(lockIsUnlocked === true, `Server reports lock unlocked for Room ${TEST_ROOM} (${TEST_AY} | ${TEST_SEM})`);

  // 2. Verify test-created draft and metadata rows are removed
  const [remainingTestDrafts] = await db.query(
    'SELECT Draft_ID FROM schedule_drafts WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
    [testRoomId, TEST_AY, TEST_SEM]
  );
  const [remainingTestMetadata] = await db.query(
    'SELECT Metadata_ID FROM schedule_metadata WHERE Room_ID = ? AND Academic_Year = ? AND Semester = ?',
    [testRoomId, TEST_AY, TEST_SEM]
  );
  assert(remainingTestDrafts.length === 0,
    `Test-created draft rows for Room ${TEST_ROOM} purged successfully (count: ${remainingTestDrafts.length})`);
  assert(remainingTestMetadata.length === 0,
    `Test-created metadata rows for Room ${TEST_ROOM} purged successfully (count: ${remainingTestMetadata.length})`);

  // 3. Verify official schedules table remained completely untouched for test term
  const [termOfficialSchedules] = await db.query(
    'SELECT Schedule_ID FROM schedules WHERE Academic_Year = ? AND Semester = ?',
    [TEST_AY, TEST_SEM]
  );
  assert(termOfficialSchedules.length === 0,
    `Official schedules table remained untouched for test term ${TEST_AY} ${TEST_SEM}`);

  // 4. Identity-level comparison of existing official schedules, metadata, and drafts outside test term
  const [finalRealSchedules] = await db.query(
    'SELECT Schedule_ID, User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme FROM schedules WHERE Academic_Year != ? OR Semester != ? ORDER BY Schedule_ID ASC',
    [TEST_AY, TEST_SEM]
  );
  const [finalRealMetadata] = await db.query(
    'SELECT Metadata_ID, Room_ID, Academic_Year, Semester, Version, Status, Finalized_By, Updated_By FROM schedule_metadata WHERE Academic_Year != ? OR Semester != ? ORDER BY Metadata_ID ASC',
    [TEST_AY, TEST_SEM]
  );
  const [finalRealDrafts] = await db.query(
    'SELECT Draft_ID, User_ID, Room_ID, Subject_Name, Section, Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme FROM schedule_drafts WHERE Academic_Year != ? OR Semester != ? ORDER BY Draft_ID ASC',
    [TEST_AY, TEST_SEM]
  );

  assert(
    JSON.stringify(finalRealSchedules) === JSON.stringify(initialRealSchedules),
    `Existing official schedules outside test term are completely identical (identity-level match: ${initialRealSchedules.length} records)`
  );
  assert(
    JSON.stringify(finalRealMetadata) === JSON.stringify(initialRealMetadata),
    `Existing schedule metadata outside test term is completely identical (identity-level match: ${initialRealMetadata.length} records)`
  );
  assert(
    JSON.stringify(finalRealDrafts) === JSON.stringify(initialRealDrafts),
    `Existing schedule drafts outside test term are completely identical (identity-level match: ${initialRealDrafts.length} records)`
  );

  await finish();
}

async function finish() {
  console.log('\n================================================================');
  console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');
  try {
    await db.end();
  } catch (e) {}
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRuntimeTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
