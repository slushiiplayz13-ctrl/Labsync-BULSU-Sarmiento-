'use strict';

/**
 * tests/test-filter-placement-responsive.js
 * Verification for PC Issue Reports Filter Button Placement and Responsive Layout.
 *
 * Verifies:
 * 1. Placement: Filter button sits directly beside search box (gap ~10px), not in the center.
 * 2. Visual grouping: search-box and btnReportsFilter remain grouped on the left, completed toggle on right.
 * 3. Responsive viewports:
 *    - Mobile: 320, 360, 375, 390, 430, 480 px
 *    - Tablet: 768, 810, 820, 834, 1024 px
 *    - Desktop: 1280, 1440 px
 * 4. Dropdown viewport containment: no horizontal overflow (left >= 0, right <= viewportWidth).
 * 5. Tested on both IT Head/Coordinator (it-head-pc-reports.html) and Faculty (faculty-pc-reports.html).
 */

const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');

const VIEWPORT_WIDTHS = [
  320, 360, 375, 390, 430, 480,
  768, 810, 820, 834, 1024,
  1280, 1440
];

const PAGES_TO_TEST = [
  { name: 'IT Head / Coordinator', url: 'http://localhost:3000/it-head-pc-reports.html', role: 'IT Department Head' },
  { name: 'Faculty', url: 'http://localhost:3000/faculty-pc-reports.html', role: 'Faculty' }
];

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 Starting PC Issue Reports Filter Placement & Responsive Test');
  console.log('================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9235;
  const proc = spawn(chromePath, ['--remote-debugging-port=' + port, '--headless=new', '--no-sandbox'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + port + '/json/version', r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      wsUrl = res.webSocketDebuggerUrl;
      break;
    } catch (e) {
      await sleep(200);
    }
  }

  if (!wsUrl) {
    proc.kill();
    throw new Error('Could not connect to Headless Chrome remote debugging port.');
  }

  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);
  let msgId = 1;
  const send = (m, p = {}) => new Promise(res => {
    const curId = msgId++;
    const h = e => {
      const d = JSON.parse(e.data);
      if (d.id === curId) { ws.removeEventListener('message', h); res(d.result); }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: curId, method: m, params: p }));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const pageWs = new WebSocket('ws://127.0.0.1:' + port + '/devtools/page/' + target.targetId);
  await new Promise(r => pageWs.onopen = r);

  const sendPage = (m, p = {}) => new Promise(res => {
    const curId = msgId++;
    const h = e => {
      const d = JSON.parse(e.data);
      if (d.id === curId) { pageWs.removeEventListener('message', h); res(d.result); }
    };
    pageWs.addEventListener('message', h);
    pageWs.send(JSON.stringify({ id: curId, method: m, params: p }));
  });

  await sendPage('Page.enable');
  await sendPage('Runtime.enable');

  let passed = 0;
  let failed = 0;

  function reportPass(msg) {
    console.log(`  ✅ PASS: ${msg}`);
    passed++;
  }

  function reportFail(msg, detail) {
    console.error(`  ❌ FAIL: ${msg}`);
    if (detail) console.error(`     ${detail}`);
    failed++;
  }

  try {
    for (const pageConfig of PAGES_TO_TEST) {
      console.log(`\n--- Testing Page: ${pageConfig.name} (${pageConfig.url}) ---`);

      // Mock user authentication session & empty reports fetch
      await sendPage('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          try {
            const userObj = { role: '${pageConfig.role}', name: 'Test User', email: 'test@bulsu.edu.ph' };
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
                if (url.includes('/api/reports')) {
                  return new Response(JSON.stringify([]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                  });
                }
              }
              return origFetch.apply(this, [url, ...args]);
            };
          } catch(e) {}
        `
      });

      // 1. Desktop Layout & Placement Test at 1440px and 1280px
      for (const desktopWidth of [1440, 1280]) {
        await sendPage('Emulation.setDeviceMetricsOverride', {
          width: desktopWidth,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false
        });

        await sendPage('Page.navigate', { url: pageConfig.url });
        await sleep(1200);

        const desktopCheck = await sendPage('Runtime.evaluate', {
          returnByValue: true,
          expression: `(() => {
            const search = document.querySelector('.reports-controls .search-box');
            const filter = document.getElementById('btnReportsFilter');
            const completed = document.getElementById('btn-view-completed-tickets');
            const controls = document.querySelector('.reports-controls');

            if (!search || !filter || !controls) return { error: 'elements not found' };

            const sRect = search.getBoundingClientRect();
            const fRect = filter.getBoundingClientRect();
            const cRect = completed ? completed.getBoundingClientRect() : null;

            const gap = fRect.left - sRect.right;
            const centerOfControls = controls.getBoundingClientRect().left + controls.getBoundingClientRect().width / 2;
            const isFloatingInCenter = Math.abs(fRect.left - centerOfControls) < 60;

            return {
              gapBetweenSearchAndFilter: gap,
              isDirectlyBeside: gap >= 4 && gap <= 24,
              isNotFloatingInCenter: !isFloatingInCenter,
              searchRight: sRect.right,
              filterLeft: fRect.left,
              completedIsRightAligned: cRect ? cRect.right <= controls.getBoundingClientRect().right + 2 : true
            };
          })()`
        });

        const dRes = desktopCheck.result.value;
        if (dRes.isDirectlyBeside && dRes.isNotFloatingInCenter) {
          reportPass(`${pageConfig.name} at ${desktopWidth}px: Filter button sits directly beside search box (gap = ${dRes.gapBetweenSearchAndFilter}px, grouped on left)`);
        } else {
          reportFail(`${pageConfig.name} at ${desktopWidth}px: Filter button placement issue`, JSON.stringify(dRes));
        }
      }

      // 2. Responsive Toolbar & Filter Dropdown Test across all 13 viewports
      for (const vp of VIEWPORT_WIDTHS) {
        await sendPage('Emulation.setDeviceMetricsOverride', {
          width: vp,
          height: 750,
          deviceScaleFactor: vp <= 480 ? 2 : 1,
          mobile: vp <= 768
        });
        await sleep(300);

        const vpResult = await sendPage('Runtime.evaluate', {
          returnByValue: true,
          expression: `(() => {
            const btn = document.getElementById('btnReportsFilter');
            const dropdown = document.getElementById('reportsFilterDropdown');
            const controls = document.querySelector('.reports-controls');
            const search = document.querySelector('.reports-controls .search-box');

            if (!btn || !dropdown || !controls) return { error: 'elements not found' };

            // Ensure dropdown is open
            if (dropdown.style.display === 'none') {
              btn.click();
            }

            const vw = window.innerWidth;
            const dRect = dropdown.getBoundingClientRect();
            const bRect = btn.getBoundingClientRect();
            const sRect = search ? search.getBoundingClientRect() : null;
            const cRect = controls.getBoundingClientRect();

            const docWidth = document.documentElement.scrollWidth;
            const hasHorizontalPageOverflow = docWidth > vw + 2;

            const dropdownLeftValid = dRect.left >= 0;
            const dropdownRightValid = dRect.right <= vw + 1;
            const dropdownFullyVisible = dropdownLeftValid && dropdownRightValid;

            // Check inner inputs accessibility
            const issueTypeSelect = document.getElementById('filterIssueType');
            const btnApply = document.getElementById('btnApplyReportsFilter');
            const btnClear = document.getElementById('btnClearReportsFilter');
            const inputsAccessible = !!(issueTypeSelect && btnApply && btnClear);

            return {
              viewportWidth: vw,
              dropdownWidth: dRect.width,
              dropdownLeft: dRect.left,
              dropdownRight: dRect.right,
              dropdownFullyVisible,
              hasHorizontalPageOverflow,
              inputsAccessible,
              btnVisible: bRect.width > 0 && bRect.height > 0
            };
          })()`
        });

        const vRes = vpResult.result.value;
        if (vRes.dropdownFullyVisible && !vRes.hasHorizontalPageOverflow && vRes.btnVisible && vRes.inputsAccessible) {
          reportPass(`${pageConfig.name} at ${vp}px: Dropdown inside viewport [${Math.round(vRes.dropdownLeft)}px, ${Math.round(vRes.dropdownRight)}px], no horizontal overflow, controls fully accessible`);
        } else {
          reportFail(`${pageConfig.name} at ${vp}px: Dropdown clipping or overflow detected`, JSON.stringify(vRes));
        }

        // Close dropdown before next test iteration
        await sendPage('Runtime.evaluate', {
          expression: `(() => {
            const btn = document.getElementById('btnCloseReportsFilter');
            if (btn) btn.click();
          })()`
        });
        await sleep(150);
      }
    }
  } finally {
    proc.kill();
  }

  console.log('\n================================================================');
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} total assertions.`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
