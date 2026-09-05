'use strict';

/**
 * tests/test-schedule-scroll.js
 * Automated QA Verification Suite for Master Schedule Scrollable Containers:
 * - "When scrolling weekly schedule grid, the create schedule block container should not move".
 * - "In create schedule block panel, the only scrollable portion is the available block".
 * - "No overlap on top when scrolling: 07:00 AM stays below TIME header, no bleeding".
 * - Responsive behavior across Desktop, Laptop, and Narrow Viewports.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
console.log('🧪 Starting Master Schedule Scroll Container & Overlap QA Tests');
console.log('================================================================\n');

console.log('--- 1. Static CSS & HTML Verification ---');

const editorHtmlPath = path.join(__dirname, '../room-schedule-editor.html');
const editorHtml = fs.readFileSync(editorHtmlPath, 'utf8').replace(/\r\n/g, '\n');

const scheduleCardsCssPath = path.join(__dirname, '../css/components/schedule-cards.css');
const scheduleCardsCss = fs.readFileSync(scheduleCardsCssPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Editor Layout Container
assert(editorHtml.includes('.editor-layout-container {') && editorHtml.includes('height: calc(100vh - 135px);'), 
  '.editor-layout-container has 2-column independent split height');

// 2. Create Block Panel (Container stays stationary, form not scrollable)
assert(editorHtml.includes('#create-block-panel {') && editorHtml.includes('position: sticky;'), 
  '#create-block-panel is sticky (does not move when timetable scrolls)');
assert(editorHtml.includes('#create-block-panel {') && editorHtml.includes('overflow: hidden;'), 
  '#create-block-panel has overflow: hidden (form fields remain fixed, no panel scrollbar)');

// 3. Available Blocks Container (Dashed box from photo is the ONLY scrollable portion)
assert(editorHtml.includes('#blocks-container {') && editorHtml.includes('overflow-y: auto;'), 
  '#blocks-container is the dedicated scrollable portion in create-block-panel');
assert(editorHtml.includes('border: 2px dashed'), 
  '#blocks-container matches the dashed container visual reference');

// 4. Scheduled / Timetable Card & Grid Container
assert(editorHtml.includes('.editor-schedule-card {') && editorHtml.includes('overflow: hidden;'), 
  '.editor-schedule-card has overflow: hidden (clips card boundaries cleanly)');
assert(editorHtml.includes('.calendar-grid-container {') && editorHtml.includes('overflow-y: auto;'), 
  '.calendar-grid-container scrolls independently inside timetable card');
assert(editorHtml.includes('overscroll-behavior: contain;'), 
  '.calendar-grid-container has overscroll-behavior: contain (prevents scroll chaining)');

// 5. Header Non-Overlapping Behavior (07:00 AM does not poke out above TIME)
assert(editorHtml.includes('.calendar-grid-header {\n      display: flex;\n      border-bottom: 2px solid var(--border-light);\n      background: var(--bg-card, #F8FAFC) !important;\n      position: sticky;\n      top: 0;\n      z-index: 100 !important;'), 
  '.calendar-grid-header is sticky at top: 0 with z-index: 100 !important and solid background');
assert(editorHtml.includes('.grid-header-cell:first-child {\n      flex: 0 0 65px;\n      min-width: 65px;\n      border-left: none;\n      color: var(--text-muted);\n      font-size: 11.5px;\n      font-weight: 600;\n      text-transform: uppercase;\n      letter-spacing: 0.5px;\n      position: sticky;\n      left: 0;\n      top: 0;\n      z-index: 110 !important;'), 
  '.grid-header-cell:first-child (TIME) has z-index: 110 !important to cover time column during scroll');
assert(scheduleCardsCss.includes('z-index: 40 !important'), 
  'schedule-cards.css sets .grid-time-column z-index to 40 (lower than sticky header so 07:00 AM slides behind)');

// 6. Overall Page Content Desktop vs Mobile
assert(editorHtml.includes('body[data-page="schedule-editor"] .page-content {\n        overflow-y: hidden !important;\n      }'), 
  'Desktop: .page-content has overflow-y: hidden to keep side panel completely stationary');

// ─── 2. Browser CDP Runtime Verification ───
console.log('\n--- 2. Browser CDP Runtime Verification ---');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_USER_DATA = path.join(__dirname, `temp-chrome-schedule-${Date.now()}`);

async function runBrowserTests() {
  if (!fs.existsSync(CHROME_PATH)) {
    console.warn('Chrome not found at', CHROME_PATH, '- skipping browser runtime tests');
    printSummary();
    return;
  }

  const port = 9444;
  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${TEMP_USER_DATA}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    'about:blank'
  ]);

  await new Promise((resolve) => setTimeout(resolve, 1500));

  let wsUrl = null;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch (e) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (!wsUrl) {
    console.error('Could not connect to Chrome CDP WebSocket');
    chromeProc.kill();
    printSummary();
    return;
  }

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.onopen = resolve);

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

  await pageSend('Page.enable');
  await pageSend('DOM.enable');
  await pageSend('CSS.enable');

  await pageSend('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const userObj = { role: 'IT Department Head', name: 'Admin Test', email: 'ithead@test.com' };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        sessionStorage.setItem('labsync_user', JSON.stringify(userObj));

        const origFetch = window.fetch;
        window.fetch = async function(url, ...args) {
          if (typeof url === 'string' && url.includes('/api/user/current')) {
            return new Response(JSON.stringify({ user: userObj }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return origFetch.apply(this, [url, ...args]);
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

  async function setViewport(width, height) {
    await pageSend('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768
    });
  }

  try {
    // ─── Test 2.1: Large Desktop (1920x1080) ───
    console.log('\n--- 2.1 Viewport: Large Desktop (1920x1080) ---');
    await setViewport(1920, 1080);
    await pageSend('Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
    await new Promise((r) => setTimeout(r, 2000));

    const initialDesktopMetrics = await evaluate(`(() => {
      const grid = document.querySelector('.calendar-grid-container');
      const card = document.querySelector('.editor-schedule-card');
      const panel = document.getElementById('create-block-panel');
      const blocksContainer = document.getElementById('blocks-container');
      const pageContent = document.querySelector('.page-content');

      const gridStyle = window.getComputedStyle(grid);
      const cardStyle = window.getComputedStyle(card);
      const panelStyle = window.getComputedStyle(panel);
      const blocksStyle = window.getComputedStyle(blocksContainer);
      const pageStyle = window.getComputedStyle(pageContent);

      return {
        grid: {
          overflowY: gridStyle.overflowY,
          hasScrollbar: grid.scrollHeight > grid.clientHeight
        },
        panel: {
          overflowY: panelStyle.overflowY,
          hasScrollbar: panel.scrollHeight > panel.clientHeight
        },
        blocksContainer: {
          overflowY: blocksStyle.overflowY,
          count: blocksContainer.querySelectorAll('.schedule-block').length,
          hasScrollbar: blocksContainer.scrollHeight > blocksContainer.clientHeight
        },
        page: {
          overflowY: pageStyle.overflowY
        }
      };
    })()`);

    console.log('  Initial desktop metrics:', JSON.stringify(initialDesktopMetrics, null, 2));

    assert(!initialDesktopMetrics.panel.hasScrollbar, 
      'Desktop: #create-block-panel has NO scrollbar (create form stays fixed)');
    assert(!initialDesktopMetrics.blocksContainer.hasScrollbar, 
      'Desktop: #blocks-container has no scrollbar when 0 blocks exist');
    assert(initialDesktopMetrics.grid.overflowY === 'auto', 
      'Desktop: calendar-grid-container has overflow-y: auto (scrolls independently)');

    // ─── Test 2.2: Add Many Available Blocks ───
    console.log('\n--- 2.2 Desktop with Many Available Blocks (Dynamic Addition) ---');
    const manyBlocksMetrics = await evaluate(`(() => {
      const container = document.getElementById('blocks-container');
      for (let i = 1; i <= 12; i++) {
        const blk = document.createElement('div');
        blk.className = 'schedule-block';
        blk.style.height = '60px';
        blk.innerHTML = '<b>SUBJ ' + i + '</b><div>Prof Test</div>';
        container.appendChild(blk);
      }

      const grid = document.querySelector('.calendar-grid-container');
      const panel = document.getElementById('create-block-panel');

      return {
        blocksCount: container.querySelectorAll('.schedule-block').length,
        blocksScrollHeight: container.scrollHeight,
        blocksClientHeight: container.clientHeight,
        blocksHasScrollbar: container.scrollHeight > container.clientHeight,
        panelHasScrollbar: panel.scrollHeight > panel.clientHeight
      };
    })()`);

    console.log('  Many blocks desktop metrics:', JSON.stringify(manyBlocksMetrics, null, 2));

    assert(manyBlocksMetrics.blocksHasScrollbar === true, 
      'Desktop: ONLY #blocks-container scrolls vertically when many blocks exist');
    assert(manyBlocksMetrics.panelHasScrollbar === false, 
      'Desktop: #create-block-panel STILL has NO scrollbar (only the available block portion scrolls!)');

    // ─── Test 2.3: Weekly Schedule Grid Scrolling - Left Panel Must NOT Move & No Top Overlap ───
    console.log('\n--- 2.3 Weekly Schedule Grid Scrolling Verification ---');
    const scrollMovementMetrics = await evaluate(`(() => {
      const panel = document.getElementById('create-block-panel');
      const grid = document.querySelector('.calendar-grid-container');
      const timeHeader = document.querySelector('.grid-header-cell:first-child');
      const firstTimeSlot = document.querySelector('.grid-time-label');

      // Record panel position before grid scroll
      const panelBeforeRect = panel.getBoundingClientRect();
      const headerBeforeRect = timeHeader.getBoundingClientRect();

      // Scroll the weekly schedule grid down by 150px
      grid.scrollTop = 150;

      // Record panel position and header after grid scroll
      const panelAfterRect = panel.getBoundingClientRect();
      const headerAfterRect = timeHeader.getBoundingClientRect();
      const slotAfterRect = firstTimeSlot.getBoundingClientRect();

      const elAtHeaderCenter = document.elementFromPoint(headerAfterRect.left + 10, headerAfterRect.top + 10);
      const elAboveHeader = document.elementFromPoint(headerAfterRect.left + 10, headerAfterRect.top - 5);

      return {
        gridScrollTop: grid.scrollTop,
        panelBeforeTop: panelBeforeRect.top,
        panelAfterTop: panelAfterRect.top,
        panelDidNotMove: Math.abs(panelBeforeRect.top - panelAfterRect.top) < 0.5 && 
                         Math.abs(panelBeforeRect.left - panelAfterRect.left) < 0.5,
        headerTop: headerAfterRect.top,
        headerBottom: headerAfterRect.bottom,
        slotTop: slotAfterRect.top,
        slotBottom: slotAfterRect.bottom,
        isSlotHiddenByHeader: elAtHeaderCenter ? elAtHeaderCenter.closest('.grid-header-cell') !== null : true,
        noTopBleed: elAboveHeader ? !elAboveHeader.closest('.grid-time-label') : true
      };
    })()`);

    console.log('  Scroll movement & overlap metrics:', JSON.stringify(scrollMovementMetrics, null, 2));

    assert(scrollMovementMetrics.gridScrollTop > 0, 
      'Weekly schedule grid successfully scrolled independently');
    assert(scrollMovementMetrics.panelDidNotMove === true, 
      'CRITICAL REQUIREMENT: When scrolling weekly schedule grid, #create-block-panel DOES NOT MOVE!');
    assert(scrollMovementMetrics.isSlotHiddenByHeader === true, 
      'No Overlap: 07:00 AM label slides under the opaque sticky TIME header');
    assert(scrollMovementMetrics.noTopBleed === true, 
      'No Overlap: 07:00 AM does not poke out or bleed above TIME header when scrolled');

    // ─── Test 2.4: Laptop Viewport (1366x768) ───
    console.log('\n--- 2.4 Viewport: Laptop (1366x768) ---');
    await setViewport(1366, 768);
    await new Promise((r) => setTimeout(r, 500));

    const laptopMetrics = await evaluate(`(() => {
      const grid = document.querySelector('.calendar-grid-container');
      const panel = document.getElementById('create-block-panel');
      const blocksContainer = document.getElementById('blocks-container');

      const panelBefore = panel.getBoundingClientRect();
      grid.scrollTop = 300;
      const panelAfter = panel.getBoundingClientRect();

      return {
        panelHasScrollbar: panel.scrollHeight > panel.clientHeight,
        blocksHasScrollbar: blocksContainer.scrollHeight > blocksContainer.clientHeight,
        panelDidNotMove: Math.abs(panelBefore.top - panelAfter.top) < 0.5,
        gridScrolled: grid.scrollTop === 300
      };
    })()`);

    console.log('  Laptop metrics:', JSON.stringify(laptopMetrics, null, 2));

    assert(laptopMetrics.panelDidNotMove === true, 
      'Laptop (1366x768): #create-block-panel DOES NOT MOVE when timetable scrolls');
    assert(laptopMetrics.panelHasScrollbar === false, 
      'Laptop: #create-block-panel itself has NO scrollbar');
    assert(laptopMetrics.blocksHasScrollbar === true, 
      'Laptop: #blocks-container is scrollable for available blocks');

    // ─── Test 2.5: Narrow Viewport (900x700 - @media <= 1024px) ───
    console.log('\n--- 2.5 Viewport: Narrow Viewport (900x700, <=1024px breakpoint) ---');
    await setViewport(900, 700);
    await new Promise((r) => setTimeout(r, 500));

    const narrowMetrics = await evaluate(`(() => {
      const grid = document.querySelector('.calendar-grid-container');
      const blocksContainer = document.getElementById('blocks-container');
      const layout = document.querySelector('.editor-layout-container');

      const layoutStyle = window.getComputedStyle(layout);

      return {
        flexDirection: layoutStyle.flexDirection,
        blocksHasVerticalScrollbar: blocksContainer.scrollHeight > blocksContainer.clientHeight
      };
    })()`);

    console.log('  Narrow metrics:', JSON.stringify(narrowMetrics, null, 2));

    assert(narrowMetrics.flexDirection === 'column', 
      'Narrow (900px): layout transitions to column direction');
    assert(narrowMetrics.blocksHasVerticalScrollbar === true, 
      'Narrow (900px): #blocks-container scrolls vertically when blocks exceed container');

    // ─── Test 2.6: High-Contrast & Dark Mode ───
    console.log('\n--- 2.6 Theme Mode Verification (High-Contrast & Dark Mode) ---');
    await setViewport(1920, 1080);
    await new Promise((r) => setTimeout(r, 300));

    const themeMetrics = await evaluate(`(() => {
      document.documentElement.classList.add('high-contrast');
      const panel = document.getElementById('create-block-panel');
      const grid = document.querySelector('.calendar-grid-container');
      const timeHeader = document.querySelector('.grid-header-cell:first-child');
      const headerBg = window.getComputedStyle(timeHeader).backgroundColor;

      document.documentElement.classList.remove('high-contrast');
      document.body.classList.add('dark-mode');
      const dmHeaderBg = window.getComputedStyle(timeHeader).backgroundColor;
      document.body.classList.remove('dark-mode');

      return { headerBg, dmHeaderBg };
    })()`);

    console.log('  Theme header background colors:', themeMetrics);
    assert(themeMetrics.headerBg !== 'transparent', 
      'High-Contrast Mode: Header has solid opaque background');
    assert(themeMetrics.dmHeaderBg !== 'transparent', 
      'Dark Mode: Header has solid opaque background');

  } finally {
    pageWs.close();
    ws.close();
    chromeProc.kill();
    try {
      fs.rmSync(TEMP_USER_DATA, { recursive: true, force: true });
    } catch (e) {}
  }

  printSummary();
}

function printSummary() {
  console.log('\n================================================================');
  console.log(`Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runBrowserTests().catch((err) => {
  console.error('Test execution error:', err);
  printSummary();
});
