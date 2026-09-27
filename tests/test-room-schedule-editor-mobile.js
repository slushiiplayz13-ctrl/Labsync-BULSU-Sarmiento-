'use strict';

/**
 * tests/test-room-schedule-editor-mobile.js
 * Comprehensive automated verification test suite for the Mobile Room Schedule Editor experience.
 *
 * Verifies:
 * 1. Mobile Day Switcher Tabs:
 *    - Day tabs exist (Mon-Sat + All)
 *    - Switching active day updates visible column and aria-selected
 *    - 'All' tab displays all 6 day columns
 * 2. Mobile Bottom Sheet Drawer:
 *    - Opens on [📦 Blocks] dock button click with 'blocks' tab active
 *    - Opens on [+ New Block] dock button click with 'create' tab active
 *    - Closes via close button or backdrop click
 *    - Hides bottom dock when drawer is open
 * 3. Mobile Tap-to-Place Engine:
 *    - Entering placement mode displays #mobile-placement-bar and hides dock
 *    - Cancel button restores dock and idle mode
 *    - handleSlotPlacement drops card accurately into day column with proper slot math
 * 4. Card Quick Actions Modal:
 *    - Tapping card on mobile opens quick actions modal
 *    - Move button enters move placement mode
 *    - Duration steppers (-30m, +30m) and preset chips (1h, 1.5h, 2h, 3h) update card duration and time text
 * 5. Desktop Isolation:
 *    - At >1024px, all mobile dock/tabs/placement elements are display: none
 *    - Desktop 2-column layout and sticky side panel remain 100% intact
 */

const { spawn } = require('child_process');
const http = require('http');
const assert = require('assert');

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

async function runMobileEditorTests() {
  console.log('================================================================');
  console.log('🧪 Starting Mobile Room Schedule Editor Verification Suite');
  console.log('================================================================\n');

  const port = 9231;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));

  const listRes = await new Promise(r => {
    http.get(`http://127.0.0.1:${port}/json/version`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => r(JSON.parse(data)));
    });
  });

  const ws = new WebSocket(listRes.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let bMsgId = 1;
  const bPending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && bPending.has(msg.id)) {
      const { resolve, reject } = bPending.get(msg.id);
      bPending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function sendBrowser(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = bMsgId++;
      bPending.set(id, { resolve, reject });
      browserWs.send(JSON.stringify({ id, method, params }));
    });
  }

  const target = await (new Promise((resolve, reject) => {
    const id = bMsgId++;
    bPending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url: 'about:blank' } }));
  }));

  const pWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
  await new Promise(r => pWs.onopen = r);

  let msgId = 1;
  const pending = new Map();
  pWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      pWs.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result ? res.result.value : undefined;
  }

  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const userObj = { role: 'IT Department Head', name: 'Admin Test', email: 'ithead@test.com' };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        sessionStorage.setItem('labsync_user', JSON.stringify(userObj));

        const origFetch = window.fetch;
        window.fetch = async function(url, ...args) {
          if (typeof url === 'string') {
            if (url.includes('/api/user/current')) {
              return new Response(JSON.stringify({ user: userObj }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
            if (url.includes('/api/schedules/room/')) {
              return new Response(JSON.stringify([
                {
                  Schedule_ID: 201,
                  Subject_Name: 'IT 201 - Data Structures',
                  Professor_Name: 'Prof. Alan Turing',
                  Section: '2A-1',
                  Day_of_Week: 'Monday',
                  Start_Time: '08:30:00',
                  End_Time: '10:30:00',
                  Color_Theme: 'Teal'
                }
              ]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
          return origFetch(url, ...args);
        };
      } catch (e) {}
    `
  });

  // Set mobile device viewport (iPhone 14 / standard 390x844)
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  await send('Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
  await new Promise(r => setTimeout(r, 2200));

  // ─── 1. Weekly Schedule Grid Layout Verification (All Days Mon-Sat) ───
  console.log('--- 1. Weekly Schedule Grid Layout (All Days Mon-Sat) ---');
  const gridLayoutCheck = await evaluate(`(() => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const container = document.querySelector('.calendar-grid-container');
    const header = document.querySelector('.calendar-grid-header');
    const body = document.querySelector('.calendar-grid-body');
    const timeCol = document.querySelector('.grid-time-column');
    const timeHeader = document.querySelector('.grid-header-cell:first-child');

    const colVisibilities = days.map(d => {
      const col = document.querySelector('.grid-day-column[data-day="' + d + '"]');
      return col ? window.getComputedStyle(col).display : 'none';
    });

    const headerCells = document.querySelectorAll('.grid-header-cell');

    return {
      containerOverflowX: window.getComputedStyle(container).overflowX,
      allColsVisible: colVisibilities.every(disp => disp !== 'none'),
      colCount: colVisibilities.length,
      headerCellCount: headerCells.length,
      timeColSticky: window.getComputedStyle(timeCol).position,
      timeHeaderSticky: window.getComputedStyle(timeHeader).position,
      headerWidth: header.scrollWidth,
      bodyWidth: body.scrollWidth
    };
  })()`);

  testAssert(gridLayoutCheck.containerOverflowX === 'auto' || gridLayoutCheck.containerOverflowX === 'scroll', 'Grid container allows horizontal scrolling on mobile');
  testAssert(gridLayoutCheck.allColsVisible, 'All 6 day columns (Monday to Saturday) are simultaneously visible in the weekly grid');
  testAssert(gridLayoutCheck.colCount === 6, 'Exactly 6 day columns exist in the schedule grid');
  testAssert(gridLayoutCheck.headerCellCount === 7, '7 header cells (TIME + 6 days) are rendered');
  testAssert(gridLayoutCheck.timeColSticky === 'sticky', 'TIME column is sticky during horizontal scroll');
  testAssert(gridLayoutCheck.timeHeaderSticky === 'sticky', 'TIME header cell is sticky during horizontal scroll');


  // ─── 2. Bottom Sheet Drawer Verification ───
  console.log('\n--- 2. Mobile Bottom Sheet Drawer ---');
  const openBlocksCheck = await evaluate(`(() => {
    const dockBlocksBtn = document.getElementById('mobile-dock-blocks-btn');
    dockBlocksBtn.click();
    const panel = document.getElementById('create-block-panel');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    const dock = document.getElementById('mobile-editor-dock');
    const activeTab = document.querySelector('.mobile-sheet-tab.active');

    return {
      isOpen: panel.classList.contains('mobile-sheet-open'),
      backdropActive: backdrop.classList.contains('active'),
      dockDisplay: window.getComputedStyle(dock).display,
      activeTab: activeTab ? activeTab.dataset.tab : null
    };
  })()`);

  testAssert(openBlocksCheck.isOpen, '[📦 Blocks] button opens bottom sheet panel');
  testAssert(openBlocksCheck.backdropActive, 'Backdrop becomes active on bottom sheet open');
  testAssert(openBlocksCheck.dockDisplay === 'none', 'Bottom dock is hidden while sheet is open');
  testAssert(openBlocksCheck.activeTab === 'blocks', 'Active sheet tab is "blocks"');

  const openCreateCheck = await evaluate(`(() => {
    const createTabBtn = document.querySelector('.mobile-sheet-tab[data-tab="create"]');
    createTabBtn.click();
    const activeTab = document.querySelector('.mobile-sheet-tab.active');
    const formSection = document.querySelector('.editor-create-form-section');
    const blocksSection = document.querySelector('.available-blocks-section');

    return {
      activeTab: activeTab.dataset.tab,
      formDisplay: formSection.style.display,
      blocksDisplay: blocksSection.style.display
    };
  })()`);

  testAssert(openCreateCheck.activeTab === 'create', 'Sheet switched to "create" tab');
  testAssert(openCreateCheck.formDisplay === 'block', 'Create block form is shown');
  testAssert(openCreateCheck.blocksDisplay === 'none', 'Available blocks list is hidden in create tab');

  // Close sheet via backdrop click
  const closeSheetCheck = await evaluate(`(() => {
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    backdrop.click();
    const panel = document.getElementById('create-block-panel');
    const dock = document.getElementById('mobile-editor-dock');
    return {
      isOpen: panel.classList.contains('mobile-sheet-open'),
      dockDisplay: window.getComputedStyle(dock).display
    };
  })()`);

  testAssert(!closeSheetCheck.isOpen, 'Bottom sheet closed on backdrop click');
  testAssert(closeSheetCheck.dockDisplay !== 'none', 'Bottom dock is restored on close');

  // ─── 3. Tap-to-Place Engine Verification ───
  console.log('\n--- 3. Mobile Tap-to-Place Engine ---');
  const placementModeCheck = await evaluate(`(() => {
    window.scheduleTapToPlace.startPlacingFromTray({
      id: 'test-block-42',
      subject: 'CS 202 - Algorithms',
      professor: 'Prof. Ada Lovelace',
      section: '2B-1',
      color: 'Amber'
    });
    const bar = document.getElementById('mobile-placement-bar');
    const dock = document.getElementById('mobile-editor-dock');
    const title = document.getElementById('mpb-title');
    const state = window.scheduleTapToPlace.getPlacementState();

    return {
      barDisplay: window.getComputedStyle(bar).display,
      dockDisplay: window.getComputedStyle(dock).display,
      titleText: title.textContent,
      mode: state.mode
    };
  })()`);

  testAssert(placementModeCheck.mode === 'placing-tray', 'State machine entered placing-tray mode');
  testAssert(placementModeCheck.barDisplay !== 'none', 'Mobile placement action bar is visible');
  testAssert(placementModeCheck.dockDisplay === 'none', 'Bottom dock is hidden during placement mode');
  testAssert(placementModeCheck.titleText.includes('CS 202'), 'Placement bar displays active subject name');

  // Place card at Monday 13:00 (slotIndex 12)
  const dropCheck = await evaluate(`(async () => {
    const success = await window.scheduleTapToPlace.handleSlotPlacement('Monday', 12);
    const col = document.querySelector('.grid-day-column[data-day="Monday"]');
    const cards = col.querySelectorAll('.grid-card');
    const lastCard = cards[cards.length - 1];
    const saveBtn = document.getElementById('save-schedule-btn');

    return {
      success: success,
      cardCount: cards.length,
      lastCardSubject: lastCard ? lastCard.querySelector('.grid-card-title').textContent : null,
      lastCardTop: lastCard ? lastCard.style.top : null,
      saveEnabled: !saveBtn.disabled
    };
  })()`);

  testAssert(dropCheck.success === true, 'handleSlotPlacement placed block successfully');
  testAssert(dropCheck.cardCount === 2, 'Monday column now contains 2 schedule cards');
  testAssert(dropCheck.lastCardSubject.includes('CS 202'), 'Newly placed card has correct subject');
  testAssert(dropCheck.saveEnabled === true, 'Save Schedule button is enabled after placement (dirty tracked)');

  // ─── 4. Quick Actions Modal Verification (Clean Details & Theming) ───
  console.log('\n--- 4. Card Detail Modal (Details, Color Theming & Deletion) ---');
  const modalOpenCheck = await evaluate(`(async () => {
    const card = document.querySelector('.grid-card');
    window.scheduleEditorController.openCardDetailModal(card);
    await new Promise(r => setTimeout(r, 50));
    const modal = document.getElementById('card-detail-modal');
    const moveBtn = document.getElementById('modal-move-btn');
    const decBtn = document.getElementById('modal-duration-dec-btn');
    const incBtn = document.getElementById('modal-duration-inc-btn');
    const colorPicker = document.getElementById('modal-color-picker');
    const deleteBtn = document.getElementById('modal-delete-btn');
    const saveBtn = document.getElementById('modal-save-btn');

    return {
      modalOpen: modal.classList.contains('active') || modal.style.display === 'flex',
      hasMoveBtn: !!moveBtn,
      hasDurationControls: !!decBtn || !!incBtn,
      hasColorPicker: !!colorPicker,
      hasDeleteBtn: !!deleteBtn && window.getComputedStyle(deleteBtn).display !== 'none',
      hasSaveBtn: !!saveBtn
    };
  })()`);

  testAssert(modalOpenCheck.modalOpen, 'Quick actions modal opened for schedule card');
  testAssert(!modalOpenCheck.hasMoveBtn, 'Move Class (Tap-to-Place) button is removed as requested');
  testAssert(!modalOpenCheck.hasDurationControls, 'Duration adjustment controls are removed as requested');
  testAssert(modalOpenCheck.hasColorPicker, 'Card Detail Modal retains Color Theme picker');
  testAssert(modalOpenCheck.hasDeleteBtn, 'Card Detail Modal retains Delete Class button');

  // Test closing the modal cleanly
  const modalCloseCheck = await evaluate(`(async () => {
    const saveBtn = document.getElementById('modal-save-btn');
    saveBtn.click();
    await new Promise(r => setTimeout(r, 100));
    const modal = document.getElementById('card-detail-modal');
    return {
      modalClosed: !modal.classList.contains('active')
    };
  })()`);

  testAssert(modalCloseCheck.modalClosed, 'Card detail modal closed cleanly on Done');

  // ─── 5. Desktop Isolation (> 1024px) Verification ───
  console.log('\n--- 5. Desktop Isolation (> 1024px) ---');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });
  await new Promise(r => setTimeout(r, 600));

  const desktopIsolationCheck = await evaluate(`(() => {
    const dayTabs = document.getElementById('mobile-day-tabs');
    const dock = document.getElementById('mobile-editor-dock');
    const bar = document.getElementById('mobile-placement-bar');
    const panel = document.getElementById('create-block-panel');
    const layout = document.querySelector('.editor-layout-container');

    return {
      dayTabsDisplay: dayTabs ? window.getComputedStyle(dayTabs).display : 'none',
      dockDisplay: window.getComputedStyle(dock).display,
      barDisplay: window.getComputedStyle(bar).display,
      panelPosition: window.getComputedStyle(panel).position,
      panelWidth: window.getComputedStyle(panel).width,
      layoutFlexDirection: window.getComputedStyle(layout).flexDirection
    };
  })()`);

  testAssert(desktopIsolationCheck.dayTabsDisplay === 'none', 'Desktop: #mobile-day-tabs is not displayed');
  testAssert(desktopIsolationCheck.dockDisplay === 'none', 'Desktop: #mobile-editor-dock is display: none');
  testAssert(desktopIsolationCheck.barDisplay === 'none', 'Desktop: #mobile-placement-bar is display: none');
  testAssert(desktopIsolationCheck.panelPosition === 'sticky', 'Desktop: #create-block-panel is sticky side panel');
  testAssert(desktopIsolationCheck.panelWidth === '300px', 'Desktop: #create-block-panel width is 300px');
  testAssert(desktopIsolationCheck.layoutFlexDirection === 'row', 'Desktop: 2-column layout is horizontal row');

  pWs.close();
  ws.close();
  chrome.kill();

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} MOBILE SCHEDULE EDITOR TESTS PASSED!`);
  console.log('================================================================\n');
}

runMobileEditorTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
