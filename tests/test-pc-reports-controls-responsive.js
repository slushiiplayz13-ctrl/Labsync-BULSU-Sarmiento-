'use strict';

/**
 * tests/test-pc-reports-controls-responsive.js
 * Verification for PC Reports Search Bar & Completed Tickets Button Responsive Layout.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawn } = require('child_process');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting PC Reports Controls Responsive Layout Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  console.log('--- 1. Static CSS Invariant Verification ---');

  const buttonsCss = fs.readFileSync(path.join(__dirname, '../css/components/buttons.css'), 'utf8').replace(/\r\n/g, '\n');
  const reportCardsCss = fs.readFileSync(path.join(__dirname, '../css/components/report-cards.css'), 'utf8').replace(/\r\n/g, '\n');
  const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8').replace(/\r\n/g, '\n');

  test('buttons.css defines default inline .btn-text-full and hidden .btn-text-short', () => {
    assert.ok(buttonsCss.includes('.toggle-completed-btn .btn-text-full {\n  display: inline;'), 'Must have inline .btn-text-full');
    assert.ok(buttonsCss.includes('.toggle-completed-btn .btn-text-short {\n  display: none;'), 'Must have hidden .btn-text-short');
  });

  test('report-cards.css maintains single-row inline flex for .reports-controls at <=767px', () => {
    assert.ok(reportCardsCss.includes('.reports-controls {\n    display: flex !important;\n    flex-direction: row !important;'), 'Must be row flex in report-cards.css');
    assert.ok(reportCardsCss.includes('flex-wrap: nowrap !important;'), 'Must prevent wrapping in report-cards.css');
    assert.ok(reportCardsCss.includes('.reports-controls .search-box {\n    flex: 1 1 auto !important;'), 'Search box must take flexible width');
    assert.ok(reportCardsCss.includes('.reports-controls .toggle-completed-btn {\n    width: auto !important;'), 'Button must be auto width');
  });

  test('responsive.css defines single inline row for .reports-controls at <=1024px', () => {
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] .reports-controls {\n    display: flex !important;\n    flex-direction: row !important;'), 'Must be row flex in responsive.css');
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] .reports-controls .search-box {\n    flex: 1 1 auto !important;'), 'Search box must flex in responsive.css');
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] #completedToggleContainer {\n    display: flex !important;'), 'Container must be flex in responsive.css');
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] .reports-controls .toggle-completed-btn {\n    display: inline-flex !important;'), 'Toggle button must be inline-flex in responsive.css');
  });

  test('responsive.css defines mobile concise label at <=640px', () => {
    assert.ok(responsiveCss.includes('@media (max-width: 640px)'), 'Must have @media (max-width: 640px)');
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] .toggle-completed-btn .btn-text-full {\n    display: none !important;\n  }'), 'Must hide full text on mobile');
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] .toggle-completed-btn .btn-text-short {\n    display: inline !important;\n  }'), 'Must show short text on mobile');
  });

  test('responsive.css displays Completed Ticket text on ultra-narrow screens (<=360px) without hiding it', () => {
    assert.ok(responsiveCss.includes('@media (max-width: 360px)'), 'Must have @media (max-width: 360px)');
    assert.ok(responsiveCss.includes('body[data-page="pc-reports"] .toggle-completed-btn .btn-text-short {\n    display: inline !important;'), 'Must display short text on narrow screens');
  });

  console.log('\n--- 2. Static Controller & Template Verification ---');

  const controllerJs = fs.readFileSync(path.join(__dirname, '../js/reports/report.controller.js'), 'utf8');

  test('report.controller.js renders button with .btn-text-full, .btn-text-short (Completed Ticket), and NO number badge', () => {
    assert.ok(controllerJs.includes('class="btn-text-full">View Completed Tickets</span>'), 'Must render .btn-text-full');
    assert.ok(controllerJs.includes('class="btn-text-short">Completed Ticket</span>'), 'Must render Completed Ticket');
    assert.ok(!controllerJs.includes('completed-count-badge'), 'Must NOT render any count badge in button');
    assert.ok(controllerJs.includes('data-action="open-completed-modal"'), 'Must keep data-action for modal delegation');
  });

  test('report.controller.js includes updateSearchPlaceholder() for mobile vs desktop placeholders', () => {
    assert.ok(controllerJs.includes('function updateSearchPlaceholder()'), 'Must have updateSearchPlaceholder');
    assert.ok(controllerJs.includes("searchInput.placeholder = 'Search reports...'"), 'Must set mobile placeholder');
    assert.ok(controllerJs.includes("window.addEventListener('resize', updateSearchPlaceholder)"), 'Must attach resize listener');
  });

  console.log('\n--- 3. Headless Chrome DevTools Protocol (CDP) Runtime Verification ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('  ⚠️ Chrome binary not found at default path, skipping CDP runtime testing.');
    finish();
    return;
  }

  const port = 9558;
  const tempProfile = path.join(__dirname, `temp-chrome-controls-${Date.now()}`);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-translate',
    'about:blank'
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        if (wsUrl) break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 250));
      }
    }

    if (!wsUrl) {
      throw new Error('Could not obtain Chrome CDP WebSocket URL');
    }

    const browserWs = new WebSocket(wsUrl);
    await new Promise(r => browserWs.onopen = r);

    let bMsgId = 1;
    const bPending = new Map();
    browserWs.onmessage = (event) => {
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

    const newTarget = await sendBrowser('Target.createTarget', { url: 'about:blank' });
    const targetId = newTarget.targetId;
    const pageWsUrl = `ws://127.0.0.1:${port}/devtools/page/${targetId}`;

    const ws = new WebSocket(pageWsUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
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
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // Add authentication and mock data bootstrap script
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
              if (url.includes('/api/reports')) {
                return new Response(JSON.stringify([]), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
            return origFetch.apply(this, [url, ...args]);
          };
        } catch (e) {}
      `
    });

    // Test both IT Head and Faculty PC Reports pages
    const testUrls = [
      { name: 'it-head-pc-reports.html', url: 'http://localhost:3000/it-head-pc-reports.html' },
      { name: 'faculty-pc-reports.html', url: 'http://localhost:3000/faculty-pc-reports.html' }
    ];

    const viewports = [
      { width: 320, height: 600, label: '320px (Narrow Mobile)' },
      { width: 375, height: 667, label: '375px (iPhone SE)' },
      { width: 390, height: 844, label: '390px (iPhone 12/13/14)' },
      { width: 430, height: 932, label: '430px (iPhone Pro Max)' },
      { width: 768, height: 1024, label: '768px (iPad Portrait)' },
      { width: 1024, height: 768, label: '1024px (iPad Landscape)' },
      { width: 1440, height: 900, label: '1440px (Desktop Regression)' }
    ];

    for (const pageInfo of testUrls) {
      console.log(`\nTesting Page: ${pageInfo.name}`);
      await send('Page.navigate', { url: pageInfo.url });
      await new Promise(r => setTimeout(r, 1400));

      await send('Runtime.evaluate', {
        expression: `
          (function() {
            const mockReports = [
              { ReportID: 'REP-001', TicketID: 'TCK-101', AssetName: 'Room 333 – PC 1', Status: 'RESOLVED', IssueDetails: 'Keyboard issue' },
              { ReportID: 'REP-002', TicketID: 'TCK-102', AssetName: 'Room 333 – PC 2', Status: 'RESOLVED', IssueDetails: 'OS issue' },
              { ReportID: 'REP-003', TicketID: 'TCK-103', AssetName: 'Room 334 – PC 5', Status: 'PENDING', IssueDetails: 'Mouse issue' }
            ];
            if (window.reportController && typeof window.reportController.renderReports === 'function') {
              window.reportController.renderReports(mockReports);
            }
          })()
        `
      });
      await new Promise(r => setTimeout(r, 400));

      for (const vp of viewports) {
        // Set device emulation
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.width <= 1024
        });

        // Trigger resize event in page so JavaScript updateSearchPlaceholder fires
        await send('Runtime.evaluate', {
          expression: `window.dispatchEvent(new Event('resize'));`
        });

        await new Promise(r => setTimeout(r, 200));

        const layoutCheck = await send('Runtime.evaluate', {
          expression: `
            (function() {
              const controls = document.querySelector('.reports-controls');
              const searchBox = document.querySelector('.reports-controls .search-box');
              const searchInput = document.getElementById('reportSearchInput');
              const toggleBtn = document.getElementById('btn-view-completed-tickets');
              const fullText = toggleBtn ? toggleBtn.querySelector('.btn-text-full') : null;
              const shortText = toggleBtn ? toggleBtn.querySelector('.btn-text-short') : null;
              const badge = toggleBtn ? toggleBtn.querySelector('.completed-count-badge') : null;

              if (!controls || !searchBox || !searchInput || !toggleBtn) {
                return { error: 'Required DOM elements missing', found: { controls: !!controls, searchBox: !!searchBox, searchInput: !!searchInput, toggleBtn: !!toggleBtn, currentUrl: window.location.href } };
              }

              const controlsRect = controls.getBoundingClientRect();
              const searchRect = searchBox.getBoundingClientRect();
              const btnRect = toggleBtn.getBoundingClientRect();

              const fullStyle = fullText ? window.getComputedStyle(fullText) : null;
              const shortStyle = shortText ? window.getComputedStyle(shortText) : null;
              const btnStyle = window.getComputedStyle(toggleBtn);
              const controlsStyle = window.getComputedStyle(controls);

              return {
                controlsRect: { width: controlsRect.width, height: controlsRect.height },
                searchRect: { top: searchRect.top, left: searchRect.left, width: searchRect.width, height: searchRect.height, right: searchRect.right },
                btnRect: { top: btnRect.top, left: btnRect.left, width: btnRect.width, height: btnRect.height, right: btnRect.right },
                verticalAlignmentDelta: Math.abs(searchRect.top - btnRect.top),
                controlsFlexDirection: controlsStyle.flexDirection,
                isSingleRow: Math.abs(searchRect.top - btnRect.top) < 14,
                searchTakesFlexibleWidth: searchRect.width > 90,
                placeholder: searchInput.placeholder,
                fullTextDisplay: fullStyle ? fullStyle.display : null,
                shortTextDisplay: shortStyle ? shortStyle.display : null,
                shortTextContent: shortText ? shortText.textContent.trim() : null,
                hasBadge: !!badge,
                btnPadding: btnStyle.padding
              };
            })()
          `,
          returnByValue: true
        });

        const val = layoutCheck.result.value;

        test(`${pageInfo.name} at ${vp.label}: Single inline row layout (no vertical stacking)`, () => {
          assert.ok(!val.error, `DOM elements must exist: ${JSON.stringify(val.error)}`);
          assert.strictEqual(val.controlsFlexDirection, 'row', 'flex-direction must be row');
          assert.ok(val.isSingleRow, `Search and button must be on same row, delta was ${val.verticalAlignmentDelta}px`);
          assert.ok(val.searchTakesFlexibleWidth, `Search box must have flexible width, was ${val.searchRect.width}px`);
        });

        test(`${pageInfo.name} at ${vp.label}: Button has NO number badge on PC and mobile`, () => {
          assert.strictEqual(val.hasBadge, false, 'Button must have NO number badge');
        });

        test(`${pageInfo.name} at ${vp.label}: Button text displays "Completed Ticket" on mobile and full on desktop`, () => {
          assert.strictEqual(val.shortTextContent, 'Completed Ticket', 'Short text must say "Completed Ticket"');
          if (vp.width <= 640) {
            assert.strictEqual(val.fullTextDisplay, 'none', 'Full text must be hidden at <=640px');
            assert.ok(val.shortTextDisplay !== 'none', 'Short text "Completed Ticket" must be visible on mobile (including 320px)');
          } else {
            assert.ok(val.fullTextDisplay !== 'none', 'Full text must be visible on desktop/tablet');
            assert.strictEqual(val.shortTextDisplay, 'none', 'Short text must be hidden on desktop/tablet');
          }
        });

        test(`${pageInfo.name} at ${vp.label}: Adaptive search placeholder`, () => {
          if (vp.width <= 640) {
            assert.strictEqual(val.placeholder, 'Search reports...', 'Placeholder must be shortened on mobile');
          } else {
            assert.ok(val.placeholder.startsWith('Search by room'), 'Placeholder must be full on desktop/tablet');
          }
        });
      }
    }

    ws.close();
    browserWs.close();
  } catch (err) {
    console.error('CDP Error:', err);
    failed++;
  } finally {
    try {
      chromeProc.kill();
    } catch (e) {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }

  finish();

  function finish() {
    console.log('\n================================================================');
    console.log(`Summary: ${passed} passed, ${failed} failed`);
    console.log('================================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
