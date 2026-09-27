'use strict';

/**
 * tests/test-schedule-dropdown-responsive.js
 * Comprehensive automated layout test verifying that custom select dropdowns
 * in the schedule header do not crop their content, text, or checkmarks.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Schedule Dropdown Container Layout & Cropping Tests');
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

  const dropdownsCss = fs.readFileSync(path.join(__dirname, '../css/components/dropdowns.css'), 'utf8').replace(/\r\n/g, '\n');
  const formsCss = fs.readFileSync(path.join(__dirname, '../css/components/forms.css'), 'utf8').replace(/\r\n/g, '\n');
  const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8').replace(/\r\n/g, '\n');

  test('dropdowns.css defines width: max-content and min-width: 100% on .custom-select-dropdown', () => {
    assert.ok(dropdownsCss.includes('min-width: 100%;\n  width: max-content;'), 'Must have min-width 100% and width max-content');
  });

  test('forms.css defines generous min-width and right alignment for semester-wrapper', () => {
    assert.ok(formsCss.includes('.custom-select-wrapper.header-select .custom-select-dropdown {\n  min-width: max(100%, 150px);'), 'Must have min-width 150px for header select dropdown');
    assert.ok(formsCss.includes('.custom-select-wrapper.header-select#semester-wrapper .custom-select-dropdown'), 'Must have alignment rule for semester wrapper');
  });

  test('responsive.css defines min-width 150px for mobile header-select dropdown', () => {
    assert.ok(responsiveCss.includes('min-width: max(100%, 150px) !important;'), 'Must define min-width 150px in responsive.css');
  });

  console.log('\n--- 2. Headless Chrome DevTools Protocol (CDP) Runtime Verification ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('  ⚠️ Chrome binary not found at default path, skipping CDP runtime testing.');
    printSummary(passed, failed);
    return;
  }

  const port = 9229;
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1440,900'
  ], { stdio: 'ignore' });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function getWsUrl() {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${port}/json/version`, resp => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => resolve(JSON.parse(data)));
          }).on('error', reject);
        });
        return res.webSocketDebuggerUrl;
      } catch (e) {
        await sleep(200);
      }
    }
    throw new Error('Failed to connect to Chrome CDP version endpoint');
  }

  try {
    const wsUrl = await getWsUrl();
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
    await send('DOM.enable');

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
              if (url.includes('/api/schedules')) {
                return new Response(JSON.stringify([]), {
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

    const pages = ['my-schedule.html', 'it-head-my-schedule.html'];
    const viewports = [
      { name: 'Narrow Mobile', width: 320, height: 600, isMobile: true },
      { name: 'Small Android', width: 360, height: 740, isMobile: true },
      { name: 'iPhone 12/13/14', width: 390, height: 844, isMobile: true },
      { name: 'iPad Portrait', width: 768, height: 1024, isMobile: false },
      { name: 'Desktop Regression', width: 1440, height: 900, isMobile: false }
    ];

    for (const pageName of pages) {
      console.log(`\nTesting Page: ${pageName}`);
      await send('Page.navigate', { url: `http://localhost:3000/${pageName}` });
      await sleep(1200);

      for (const vp of viewports) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: vp.isMobile
        });
        await sleep(150);

        // Open semester dropdown
        await send('Runtime.evaluate', {
          expression: `
            (function() {
              const semWrapper = document.getElementById('semester-wrapper');
              if (semWrapper) {
                semWrapper.classList.add('open');
              }
            })()
          `
        });
        await sleep(150);

        const evalRes = (await send('Runtime.evaluate', {
          returnByValue: true,
          expression: `
            (function() {
              const semWrapper = document.getElementById('semester-wrapper');
              if (!semWrapper) return { error: 'semester-wrapper not found' };

              const trigger = semWrapper.querySelector('.custom-select-trigger');
              const dropdown = semWrapper.querySelector('.custom-select-dropdown');
              if (!dropdown) return { error: 'dropdown not found' };

              const dRect = dropdown.getBoundingClientRect();
              const options = Array.from(dropdown.querySelectorAll('.custom-select-option'));

              let optionsOverflow = false;
              let details = [];

              options.forEach((opt, idx) => {
                const oRect = opt.getBoundingClientRect();
                // Check if text/content extends outside the dropdown
                if (opt.scrollWidth > opt.clientWidth + 1) {
                  optionsOverflow = true;
                  details.push('Option ' + idx + ' (' + opt.textContent.trim() + ') scrollWidth (' + opt.scrollWidth + ') > clientWidth (' + opt.clientWidth + ')');
                }
              });

              // Check if dropdown itself extends past the screen boundary
              const rightEdgeOverflow = dRect.right > window.innerWidth + 2;
              const leftEdgeOverflow = dRect.left < -2;

              // Check two-tier header on mobile
              const ayWrapper = document.getElementById('academic-year-wrapper');
              const titleRow = document.querySelector('.schedule-header-title-row');
              const selectorsRow = document.querySelector('.schedule-selectors');
              let twoTierStacked = true;
              let equalPillWidths = true;

              if (window.innerWidth <= 768 && titleRow && selectorsRow) {
                const trRect = titleRow.getBoundingClientRect();
                const srRect = selectorsRow.getBoundingClientRect();
                twoTierStacked = (srRect.top >= trRect.bottom - 4);

                if (ayWrapper && semWrapper) {
                  const ayRect = ayWrapper.getBoundingClientRect();
                  const sRect = semWrapper.getBoundingClientRect();
                  equalPillWidths = Math.abs(ayRect.width - sRect.width) <= 4;
                }
              }

              return {
                open: semWrapper.classList.contains('open'),
                dropdownWidth: dRect.width,
                dropdownRight: dRect.right,
                windowWidth: window.innerWidth,
                optionsCount: options.length,
                optionsOverflow,
                details,
                rightEdgeOverflow,
                leftEdgeOverflow,
                twoTierStacked,
                equalPillWidths
              };
            })()
          `
        })).result.value;

        test(`${pageName} at ${vp.name} (${vp.width}px): Dropdown opens and has >= 140px width (actual: ${Math.round(evalRes.dropdownWidth)}px)`, () => {
          assert.ok(evalRes.open, 'Dropdown must be open');
          assert.ok(evalRes.dropdownWidth >= 140, `Dropdown width must be >= 140px to prevent cropping, got ${evalRes.dropdownWidth}`);
        });

        test(`${pageName} at ${vp.name} (${vp.width}px): ZERO option content cropping (scrollWidth <= clientWidth)`, () => {
          assert.strictEqual(evalRes.optionsOverflow, false, `Cropping detected: ${evalRes.details ? evalRes.details.join('; ') : ''}`);
        });

        test(`${pageName} at ${vp.name} (${vp.width}px): Dropdown does NOT overflow viewport edges`, () => {
          assert.strictEqual(evalRes.rightEdgeOverflow, false, `Dropdown overflows right edge: dRect.right=${evalRes.dropdownRight}, windowWidth=${evalRes.windowWidth}`);
          assert.strictEqual(evalRes.leftEdgeOverflow, false, 'Dropdown overflows left edge');
        });

        if (vp.isMobile) {
          test(`${pageName} at ${vp.name} (${vp.width}px): Two-tier header stacked and pills have equal 50%/50% width`, () => {
            assert.strictEqual(evalRes.twoTierStacked, true, 'Selectors must be stacked below title row on mobile');
            assert.strictEqual(evalRes.equalPillWidths, true, 'AY and Semester pills must be balanced equal widths');
          });
        }

        // Capture visual screenshot at 390px
        if (vp.width === 390 && pageName === 'my-schedule.html') {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          const shotPath = path.join('C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b', 'schedule-dropdown-mobile-390.png');
          fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
          console.log(`     📸 Captured screenshot: ${shotPath}`);
        }

        // Close dropdown
        await send('Runtime.evaluate', {
          expression: `
            const semWrapper = document.getElementById('semester-wrapper');
            if (semWrapper) semWrapper.classList.remove('open');
          `
        });
        await sleep(100);
      }
    }

    ws.close();
    browserWs.close();
  } finally {
    chromeProc.kill('SIGKILL');
  }

  printSummary(passed, failed);
}

function printSummary(passed, failed) {
  console.log('\n================================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
