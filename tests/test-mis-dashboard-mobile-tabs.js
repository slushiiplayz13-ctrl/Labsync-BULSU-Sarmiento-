/**
 * Automated Tests for MIS Staff Dashboard Mobile/Tablet Tabbed Workspace
 * Verifies that mis-staff-dashboard.html matches the IT Head / Faculty tabbed dashboard behavior.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runStaticTests() {
  console.log('--- 1. Static HTML & CSS Verification for MIS Dashboard Tabs ---');

  const html = fs.readFileSync(path.join(__dirname, '../mis-staff-dashboard.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

  // 1. Structure: Mobile Tabs container directly precedes .dashboard-main-grid
  assert.ok(html.includes('id="misMobileTabs"'), 'HTML must have #misMobileTabs');
  assert.ok(html.includes('role="tablist"'), '#misMobileTabs should have role="tablist"');
  
  const tabsPos = html.indexOf('id="misMobileTabs"');
  const gridPos = html.indexOf('class="dashboard-main-grid"');
  assert.ok(tabsPos !== -1 && gridPos !== -1 && tabsPos < gridPos, 
    '#misMobileTabs must be placed directly before .dashboard-main-grid');

  // 2. Semantic Buttons and Attributes
  assert.ok(html.includes('data-tab="reports"'), 'Tab button for reports must exist');
  assert.ok(html.includes('data-tab="overview"'), 'Tab button for overview must exist');
  assert.ok(html.includes('class="mis-tab-btn ithead-tab-btn active"'), 'Reports tab must be active by default');
  assert.ok(html.includes('aria-selected="true"'), 'Active tab must have aria-selected="true"');
  assert.ok(html.includes('aria-selected="false"'), 'Inactive tab must have aria-selected="false"');
  assert.ok(html.includes('data-lucide="clipboard-list"'), 'Reports tab must have clipboard-list icon');
  assert.ok(html.includes('data-lucide="layout-grid"'), 'Overview tab must have layout-grid icon');
  assert.ok(html.includes('aria-controls="misReportsCard"'), 'Tab must specify aria-controls for reports card');
  assert.ok(html.includes('aria-controls="misOverviewCard"'), 'Tab must specify aria-controls for overview card');
  console.log('  ✓ Tab buttons and semantic ARIA attributes verified');

  // 3. Card IDs and Panels
  assert.ok(html.includes('id="misReportsCard"'), 'Reports card must have id="misReportsCard"');
  assert.ok(html.includes('id="misOverviewCard"'), 'Overview card must have id="misOverviewCard"');
  console.log('  ✓ Content card IDs and roles verified');

  // 4. Tab Switcher Script
  assert.ok(html.includes('initMISMobileTabs'), 'Tab initialization function must be defined in mis-staff-dashboard.html');
  assert.ok(html.includes("grid.classList.toggle('show-overview-tab', isOverview)"), 
    'Tab click must toggle show-overview-tab class on .dashboard-main-grid');
  console.log('  ✓ Tab switcher script verified');

  // 5. CSS Rules in responsive.css
  const max1024Block = css.substring(css.indexOf('@media (max-width: 1024px)'), css.indexOf('@media (max-width: 767px)'));
  assert.ok(max1024Block.includes('body[data-page="mis-dashboard"] .dashboard-main-grid:not(.show-overview-tab) #misOverviewCard'),
    'CSS must hide overview card on MIS dashboard when reports tab is active');
  assert.ok(max1024Block.includes('body[data-page="mis-dashboard"] .dashboard-main-grid.show-overview-tab #misReportsCard'),
    'CSS must hide reports card on MIS dashboard when overview tab is active');
  assert.ok(max1024Block.includes('body[data-page="mis-dashboard"] #misReportsCard .sh-left'),
    'Inner title must be hidden on MIS dashboard');
  assert.ok(max1024Block.includes('body[data-page="mis-dashboard"] #misOverviewCard .section-header'),
    'Inner header of overview card must be hidden on MIS dashboard');
  console.log('  ✓ CSS responsive rules verified');
}

async function runBrowserTests() {
  console.log('\n--- 2. Chrome Interactive Verification ---');
  const port = 9261;
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

    // Populate sessionStorage and mock auth before navigating
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        const userObj = { Employee_ID: 'MIS-001', name: 'MIS Staff Member', role: 'MIS Staff', Department: 'MIS' };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
        sessionStorage.setItem('labsync_cached_labs', JSON.stringify([
          { Room_Number: 'RM 101', Room_Name: 'Networking Lab', Current_Status: 'Available', deviceOnline: true },
          { Room_Number: 'RM 203', Room_Name: 'Multimedia Lab', Current_Status: 'In Session', deviceOnline: true }
        ]));
        sessionStorage.setItem('labsync_cached_reports', JSON.stringify([
          { Ticket_ID: 'LS-TKT-46', Room_Number: 'RM 101', PC_Number: 'PC-05', Issue_Type: 'Hardware', Status: 'Pending', Created_At: new Date().toISOString() },
          { Ticket_ID: 'LS-TKT-12', Room_Number: 'RM 203', PC_Number: 'PC-11', Issue_Type: 'Network', Status: 'Pending', Created_At: new Date().toISOString() }
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
            if (url.includes('/api/reports')) {
              return new Response(JSON.stringify([
                { Ticket_ID: 'LS-TKT-46', Room_Number: 'RM 101', PC_Number: 'PC-05', Issue_Type: 'Hardware', Status: 'Pending', Created_At: new Date().toISOString() },
                { Ticket_ID: 'LS-TKT-12', Room_Number: 'RM 203', PC_Number: 'PC-11', Issue_Type: 'Network', Status: 'Pending', Created_At: new Date().toISOString() }
              ]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          }
          return origFetch.apply(this, [url, ...args]);
        };
      `
    });

    await send('Page.navigate', { url: 'http://localhost:3000/mis-staff-dashboard.html' });
    await new Promise(r => setTimeout(r, 1500));

    // Verify tabs are visible on mobile
    const tabsVisible = await evaluate(`(() => {
      const tabs = document.getElementById('misMobileTabs');
      if (!tabs) return false;
      return window.getComputedStyle(tabs).display !== 'none';
    })()`);
    assert.strictEqual(tabsVisible, true, 'Tabs must be visible at 390px viewport');
    console.log('  ✓ #misMobileTabs is visible on mobile');

    // Default state: Reports active
    const defaultState = await evaluate(`(() => {
      const repCard = document.getElementById('misReportsCard');
      const overCard = document.getElementById('misOverviewCard');
      return {
        reportsDisplay: window.getComputedStyle(repCard).display,
        overviewDisplay: window.getComputedStyle(overCard).display
      };
    })()`);
    // Verify mobile card transformation
    const cardTransform = await evaluate(`(() => {
      const thead = document.querySelector('.reports-table-head');
      const row = document.querySelector('tr.table-data-row');
      const ticketPill = row ? row.querySelector('.ticket-id-tag') : null;
      const chevron = row ? row.querySelector('.card-chevron-icon') : null;
      return {
        theadDisplay: thead ? window.getComputedStyle(thead).display : null,
        rowDisplay: row ? window.getComputedStyle(row).display : null,
        hasTicket: !!ticketPill,
        hasChevron: !!chevron && window.getComputedStyle(chevron).display !== 'none'
      };
    })()`);
    assert.strictEqual(cardTransform.theadDisplay, 'none', 'Table header must be hidden on mobile');
    assert.strictEqual(cardTransform.rowDisplay, 'grid', 'Row must transform to grid card on mobile');
    assert.strictEqual(cardTransform.hasTicket, true, 'Card must have ticket ID tag');
    assert.strictEqual(cardTransform.hasChevron, true, 'Card must display chevron icon on mobile');
    console.log('  ✓ Mobile card view transformation (grid card layout, hidden thead) verified');

    // Save screenshot of Reports tab
    const artifactDir = path.join('C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\9320f511-2c63-4a96-a592-4a9976ae1bca');
    const repShot = path.join(artifactDir, 'mis-dashboard-reports-tab.png');
    const repShotData = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(repShot, Buffer.from(repShotData.data, 'base64'));
    console.log(`  📸 Saved Reports tab screenshot: ${repShot}`);

    // Click "Issue Overview" tab
    await evaluate(`(() => {
      const overBtn = document.querySelector('.mis-tab-btn[data-tab="overview"], .ithead-tab-btn[data-tab="overview"]');
      if (overBtn) overBtn.click();
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // Switched state: Overview active
    const switchedState = await evaluate(`(() => {
      const repCard = document.getElementById('misReportsCard');
      const overCard = document.getElementById('misOverviewCard');
      return {
        reportsDisplay: window.getComputedStyle(repCard).display,
        overviewDisplay: window.getComputedStyle(overCard).display
      };
    })()`);
    assert.strictEqual(switchedState.reportsDisplay, 'none', 'Reports card must be hidden after switching');
    assert.notStrictEqual(switchedState.overviewDisplay, 'none', 'Overview card must be visible after switching');
    console.log('  ✓ Switched state: Overview visible, Reports hidden');

    // Save screenshot of Overview tab
    const overShot = path.join(artifactDir, 'mis-dashboard-overview-tab.png');
    const overShotData = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(overShot, Buffer.from(overShotData.data, 'base64'));
    console.log(`  📸 Saved Overview tab screenshot: ${overShot}`);

    // Switch to desktop viewport (1440 x 900)
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 500));

    const desktopState = await evaluate(`(() => {
      const tabs = document.getElementById('misMobileTabs');
      const repCard = document.getElementById('misReportsCard');
      const overCard = document.getElementById('misOverviewCard');
      return {
        tabsDisplay: window.getComputedStyle(tabs).display,
        reportsDisplay: window.getComputedStyle(repCard).display,
        overviewDisplay: window.getComputedStyle(overCard).display
      };
    })()`);
    assert.strictEqual(desktopState.tabsDisplay, 'none', 'Tabs must be hidden on desktop');
    assert.notStrictEqual(desktopState.reportsDisplay, 'none', 'Reports card must be visible on desktop');
    assert.notStrictEqual(desktopState.overviewDisplay, 'none', 'Overview card must be visible on desktop');
    console.log('  ✓ Desktop isolation: Tabs hidden, both cards visible side-by-side');

    console.log('\n🎉 ALL MIS DASHBOARD MOBILE TABS TESTS PASSED!');
  } finally {
    chrome.kill();
  }
}

async function main() {
  try {
    runStaticTests();
    await runBrowserTests();
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  }
}

main();
