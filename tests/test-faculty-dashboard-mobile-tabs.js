/**
 * Automated Tests for Faculty Dashboard Mobile/Tablet Tabbed Workspace
 * Verifies that index.html matches the IT Head tabbed dashboard behavior.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runStaticTests() {
  console.log('--- 1. Static HTML & CSS Verification for Faculty Dashboard Tabs ---');

  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

  // 1. Structure: Mobile Tabs container directly precedes .dashboard-main-grid
  assert.ok(html.includes('id="itheadMobileTabs"'), 'HTML must have #itheadMobileTabs');
  assert.ok(html.includes('role="tablist"'), '#itheadMobileTabs should have role="tablist"');
  
  const tabsPos = html.indexOf('id="itheadMobileTabs"');
  const gridPos = html.indexOf('class="dashboard-main-grid"');
  assert.ok(tabsPos !== -1 && gridPos !== -1 && tabsPos < gridPos, 
    '#itheadMobileTabs must be placed directly before .dashboard-main-grid');

  // 2. Semantic Buttons and Attributes
  assert.ok(html.includes('data-tab="labs"'), 'Tab button for laboratories must exist');
  assert.ok(html.includes('data-tab="schedule"'), 'Tab button for schedule must exist');
  assert.ok(html.includes('class="ithead-tab-btn active"'), 'My Laboratories tab must be active by default');
  assert.ok(html.includes('aria-selected="true"'), 'Active tab must have aria-selected="true"');
  assert.ok(html.includes('aria-selected="false"'), 'Inactive tab must have aria-selected="false"');
  assert.ok(html.includes('data-lucide="monitor"'), 'My Laboratories tab must have monitor icon');
  assert.ok(html.includes('data-lucide="calendar-days"'), 'My Schedule tab must have calendar-days icon');
  assert.ok(html.includes('aria-controls="itheadLabsCard"'), 'Tab must specify aria-controls for labs card');
  assert.ok(html.includes('aria-controls="itheadScheduleCard"'), 'Tab must specify aria-controls for schedule card');
  console.log('  ✓ Tab buttons and semantic ARIA attributes verified');

  // 3. Card IDs and Panels
  assert.ok(html.includes('id="itheadLabsCard"'), 'My Laboratories card must have id="itheadLabsCard"');
  assert.ok(html.includes('id="itheadScheduleCard"'), 'My Schedule card must have id="itheadScheduleCard"');
  console.log('  ✓ Content card IDs and roles verified');

  // 4. Tab Switcher Script
  assert.ok(html.includes('initFacultyMobileTabs'), 'Tab initialization function must be defined in index.html');
  assert.ok(html.includes("grid.classList.toggle('show-schedule-tab', isSchedule)"), 
    'Tab click must toggle show-schedule-tab class on .dashboard-main-grid');
  console.log('  ✓ Tab switcher script verified');

  // 5. CSS Rules in responsive.css
  const max1024Block = css.substring(css.indexOf('@media (max-width: 1024px)'), css.indexOf('@media (max-width: 767px)'));
  assert.ok(max1024Block.includes('body[data-page="dashboard"] .dashboard-main-grid:not(.show-schedule-tab) #itheadScheduleCard'),
    'CSS must hide schedule card on faculty dashboard when labs tab is active');
  assert.ok(max1024Block.includes('body[data-page="dashboard"] .dashboard-main-grid.show-schedule-tab #itheadLabsCard'),
    'CSS must hide labs card on faculty dashboard when schedule tab is active');
  assert.ok(max1024Block.includes('body[data-page="dashboard"] #itheadLabsCard .sh-left'),
    'Inner title must be hidden on faculty dashboard');
  console.log('  ✓ CSS responsive rules verified');
}

async function runBrowserTests() {
  console.log('\n--- 2. Chrome Interactive Verification ---');
  const port = 9260;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));

  try {
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

    const target = await (new Promise((resolve, reject) => {
      const id = bMsgId++;
      bPending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url: 'about:blank' } }));
    }));

    const pWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
    await new Promise(r => pWs.onopen = r);

    let pMsgId = 1;
    const pPending = new Map();
    pWs.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pPending.has(msg.id)) {
        const { resolve, reject } = pPending.get(msg.id);
        pPending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = pMsgId++;
        pPending.set(id, { resolve, reject });
        pWs.send(JSON.stringify({ id, method, params }));
      });
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) {
        throw new Error(JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    }

    await send('Page.enable');
    await send('DOM.enable');

    // 1. Set mobile viewport (390 x 844)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    // Populate sessionStorage before navigating
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        const userObj = { Employee_ID: 'FAC-001', name: 'John Doe', role: 'Faculty', Department: 'IT' };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
        sessionStorage.setItem('labsync_cached_labs', JSON.stringify([
          { Room_Number: 'RM 101', Room_Name: 'Lab 1', Current_Status: 'Available', deviceOnline: true },
          { Room_Number: 'RM 102', Room_Name: 'Lab 2', Current_Status: 'In Session', deviceOnline: true }
        ]));
        sessionStorage.setItem('labsync_cached_assigned_rooms', JSON.stringify(['101', '102']));
        sessionStorage.setItem('labsync_cached_user_schedule', JSON.stringify([
          {
            Schedule_ID: '1',
            Day_of_Week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
            Start_Time: '08:00',
            End_Time: '10:00',
            Subject: 'Web Systems',
            Room_Number: 'RM 101',
            Section: 'BSIT 3A'
          }
        ]));

        const origFetch = window.fetch;
        window.fetch = async function(url, ...args) {
          if (typeof url === 'string') {
            if (url.includes('/api/user/current')) {
              return new Response(JSON.stringify({ user: userObj }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
          return origFetch.apply(this, [url, ...args]);
        };
      `
    });

    await send('Page.navigate', { url: 'http://localhost:3000/index.html' });
    await new Promise(r => setTimeout(r, 1500));

    // Verify tabs are visible on mobile
    const tabsVisible = await evaluate(`(() => {
      const tabs = document.getElementById('itheadMobileTabs');
      if (!tabs) return false;
      return window.getComputedStyle(tabs).display !== 'none';
    })()`);
    assert.strictEqual(tabsVisible, true, 'Tabs must be visible at 390px viewport');
    console.log('  ✓ #itheadMobileTabs is visible on mobile');

    // Default state: Laboratories active
    const defaultState = await evaluate(`(() => {
      const labsCard = document.getElementById('itheadLabsCard');
      const schedCard = document.getElementById('itheadScheduleCard');
      return {
        labsDisplay: window.getComputedStyle(labsCard).display,
        schedDisplay: window.getComputedStyle(schedCard).display
      };
    })()`);
    assert.notStrictEqual(defaultState.labsDisplay, 'none', 'Labs card must be visible initially');
    assert.strictEqual(defaultState.schedDisplay, 'none', 'Schedule card must be hidden initially');
    console.log('  ✓ Default state: Labs visible, Schedule hidden');

    // Save screenshot of Labs tab
    const artifactDir = path.join('C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b');
    const labsShot = path.join(artifactDir, 'faculty-dashboard-labs-tab.png');
    const labsShotData = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(labsShot, Buffer.from(labsShotData.data, 'base64'));
    console.log(`  📸 Saved Labs tab screenshot: ${labsShot}`);

    // Click "My Schedule" tab
    await evaluate(`(() => {
      const schedBtn = document.querySelector('.ithead-tab-btn[data-tab="schedule"]');
      if (schedBtn) schedBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // Switched state: Schedule active
    const switchedState = await evaluate(`(() => {
      const labsCard = document.getElementById('itheadLabsCard');
      const schedCard = document.getElementById('itheadScheduleCard');
      const schedBtn = document.querySelector('.ithead-tab-btn[data-tab="schedule"]');
      const labsBtn = document.querySelector('.ithead-tab-btn[data-tab="labs"]');
      return {
        labsDisplay: window.getComputedStyle(labsCard).display,
        schedDisplay: window.getComputedStyle(schedCard).display,
        schedBtnActive: schedBtn.classList.contains('active'),
        schedBtnSelected: schedBtn.getAttribute('aria-selected'),
        labsBtnActive: labsBtn.classList.contains('active'),
        labsBtnSelected: labsBtn.getAttribute('aria-selected')
      };
    })()`);
    assert.strictEqual(switchedState.labsDisplay, 'none', 'Labs card must be hidden when Schedule tab active');
    assert.notStrictEqual(switchedState.schedDisplay, 'none', 'Schedule card must be visible when Schedule tab active');
    assert.strictEqual(switchedState.schedBtnActive, true, 'Schedule button must have active class');
    assert.strictEqual(switchedState.schedBtnSelected, 'true', 'Schedule button must have aria-selected="true"');
    assert.strictEqual(switchedState.labsBtnActive, false, 'Labs button must NOT have active class');
    assert.strictEqual(switchedState.labsBtnSelected, 'false', 'Labs button must have aria-selected="false"');
    console.log('  ✓ Switched state: Schedule visible, Labs hidden');

    // Save screenshot of Schedule tab
    const schedShot = path.join(artifactDir, 'faculty-dashboard-schedule-tab.png');
    const schedShotData = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(schedShot, Buffer.from(schedShotData.data, 'base64'));
    console.log(`  📸 Saved Schedule tab screenshot: ${schedShot}`);

    // Desktop verification (> 1024px)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 400));

    const desktopState = await evaluate(`(() => {
      const tabs = document.getElementById('itheadMobileTabs');
      const labsCard = document.getElementById('itheadLabsCard');
      const schedCard = document.getElementById('itheadScheduleCard');
      return {
        tabsDisplay: window.getComputedStyle(tabs).display,
        labsDisplay: window.getComputedStyle(labsCard).display,
        schedDisplay: window.getComputedStyle(schedCard).display
      };
    })()`);
    assert.strictEqual(desktopState.tabsDisplay, 'none', 'Tabs must be hidden on desktop (> 1024px)');
    assert.notStrictEqual(desktopState.labsDisplay, 'none', 'Labs card must be visible on desktop');
    assert.notStrictEqual(desktopState.schedDisplay, 'none', 'Schedule card must be visible on desktop');
    console.log('  ✓ Desktop isolation: Tabs hidden, both cards visible side-by-side');

    pWs.close();
    ws.close();
  } finally {
    chrome.kill();
  }
}

async function main() {
  try {
    runStaticTests();
    await runBrowserTests();
    console.log('\n🎉 ALL FACULTY DASHBOARD MOBILE TABS TESTS PASSED!\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

main();
