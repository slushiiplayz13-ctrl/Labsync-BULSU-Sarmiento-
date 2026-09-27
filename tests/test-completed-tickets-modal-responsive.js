'use strict';

/**
 * tests/test-completed-tickets-modal-responsive.js
 * Comprehensive automated layout and responsive overlap test for the Completed Tickets History modal.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Completed Tickets History Modal Responsive Layout Tests');
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

  const reportCardsCss = fs.readFileSync(path.join(__dirname, '../css/components/report-cards.css'), 'utf8').replace(/\r\n/g, '\n');
  const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8').replace(/\r\n/g, '\n');

  test('report-cards.css defines flex-wrap and gap on .report-card-middle-row', () => {
    assert.ok(reportCardsCss.includes('.report-card-middle-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: flex-end;\n  gap: 10px 12px;\n  min-width: 0;\n  flex-wrap: wrap;'), 'report-card-middle-row must wrap');
  });

  test('report-cards.css truncates .rc-asset-title with ellipsis and overflow protection', () => {
    assert.ok(reportCardsCss.includes('.rc-asset-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n  flex: 1 1 auto;\n  overflow: hidden;'), 'rc-asset-row must have flex and overflow hidden');
    assert.ok(reportCardsCss.includes('.rc-asset-title {\n  font-size: 15px;\n  font-weight: 800;\n  color: var(--text-dark, #0F172A);\n  letter-spacing: -0.1px;\n  line-height: 1.2;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  min-width: 0;'), 'rc-asset-title must have ellipsis');
  });

  test('report-cards.css provides responsive mobile styles under <=640px', () => {
    assert.ok(reportCardsCss.includes('@media (max-width: 640px)'), 'Must have 640px media query');
    assert.ok(reportCardsCss.includes('.report-card-middle-row {\n    flex-direction: column !important;'), 'Must stack middle row vertically on mobile');
    assert.ok(reportCardsCss.includes('.rc-action-block .btn-view-full-report {\n    width: 100% !important;'), 'Must make View Full Report button full width on mobile');
    assert.ok(reportCardsCss.includes('.completed-modal-container .modal-filter-chip {\n    flex: 1 1 0 !important;'), 'Chips must flex evenly on mobile');
  });

  test('responsive.css provides synchronized completed modal responsive styles under <=640px and <=360px', () => {
    assert.ok(responsiveCss.includes('#completedTicketsModal {\n    padding: 20px 14px !important;\n  }'), 'Must have backdrop padding in 640px responsive.css');
    assert.ok(responsiveCss.includes('.report-card-middle-row {\n    flex-direction: column !important;\n    align-items: stretch !important;'), 'Must have vertical middle row in responsive.css');
    assert.ok(responsiveCss.includes('#completedTicketsModal {\n    padding: 14px 8px !important;\n  }'), 'Must have 360px backdrop padding in responsive.css');
  });

  console.log('\n--- 2. Static HTML Template & Script Verification ---');

  const itHeadHtml = fs.readFileSync(path.join(__dirname, '../it-head-pc-reports.html'), 'utf8').replace(/\r\n/g, '\n');
  const facultyHtml = fs.readFileSync(path.join(__dirname, '../faculty-pc-reports.html'), 'utf8').replace(/\r\n/g, '\n');
  const modalJs = fs.readFileSync(path.join(__dirname, '../js/reports/report.modal.js'), 'utf8').replace(/\r\n/g, '\n');

  test('it-head-pc-reports.html has semantic completed modal header and resolved count badge removed', () => {
    assert.ok(itHeadHtml.includes('class="modal-header completed-modal-header"'), 'Must have completed-modal-header');
    assert.ok(itHeadHtml.includes('class="modal-title-full">Completed Tickets History</span>'), 'Must have full title');
    assert.ok(itHeadHtml.includes('class="modal-title-short">Completed Tickets</span>'), 'Must have short title');
    assert.ok(!itHeadHtml.includes('id="modalResolvedCountBadge"'), 'Must remove resolved count badge');
  });

  test('faculty-pc-reports.html has semantic completed modal header and resolved count badge removed', () => {
    assert.ok(facultyHtml.includes('class="modal-header completed-modal-header"'), 'Must have completed-modal-header');
    assert.ok(facultyHtml.includes('class="modal-title-full">Completed Tickets History</span>'), 'Must have full title');
    assert.ok(facultyHtml.includes('class="modal-title-short">Completed Tickets</span>'), 'Must have short title');
    assert.ok(!facultyHtml.includes('id="modalResolvedCountBadge"'), 'Must remove resolved count badge');
  });

  test('report.modal.js includes updateModalSearchPlaceholder and resize hook', () => {
    assert.ok(modalJs.includes('function updateModalSearchPlaceholder()'), 'Must define updateModalSearchPlaceholder');
    assert.ok(modalJs.includes("modalSearch.placeholder = isMobile\n      ? 'Search completed tickets...'"), 'Must set concise mobile search placeholder');
    assert.ok(modalJs.includes("window.addEventListener('resize', updateModalSearchPlaceholder)"), 'Must attach resize listener');
  });

  console.log('\n--- 3. Headless Chrome DevTools Protocol (CDP) Runtime Overlap Verification ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('  ⚠️ Chrome binary not found at default path, skipping CDP runtime testing.');
    printSummary(passed, failed);
    return;
  }

  const port = 9227;
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

    const targetPages = [
      'it-head-pc-reports.html',
      'faculty-pc-reports.html'
    ];

    const testViewports = [
      { name: 'Narrow Mobile (320px)', width: 320, height: 600 },
      { name: 'Small Android (360px)', width: 360, height: 640 },
      { name: 'iPhone SE (375px)', width: 375, height: 667 },
      { name: 'iPhone 12/13/14 (390px)', width: 390, height: 844 },
      { name: 'iPhone Pro Max (430px)', width: 430, height: 932 },
      { name: 'iPad Portrait (768px)', width: 768, height: 1024 },
      { name: 'iPad Landscape (1024px)', width: 1024, height: 768 },
      { name: 'Desktop Regression (1440px)', width: 1440, height: 900 }
    ];

    for (const pageName of targetPages) {
      console.log(`\nTesting Page: ${pageName}`);
      await send('Page.navigate', { url: `http://localhost:3000/${pageName}` });
      await sleep(1500);

      // Open completed tickets modal and seed sample tickets
      await send('Runtime.evaluate', {
        expression: `
          (function() {
            window.allReports = [
              {
                Report_ID: 101,
                Room_Number: 204,
                PC_Number: 1,
                Status: 'Resolved',
                Issue_Type: 'Keyboard',
                Issue_Description: 'WASD keys not working',
                Reported_At: new Date(Date.now() - 3600000).toISOString(),
                Resolved_At: new Date().toISOString(),
                Resolved_By_Name: 'Miles Moralejo',
                Resolved_By_Role: 'MIS Staff'
              },
              {
                Report_ID: 102,
                Room_Number: 204,
                PC_Number: 2,
                Status: 'Resolved',
                Issue_Type: 'Display / Monitor',
                Issue_Description: 'Monitor flickering and display glitch',
                Reported_At: new Date(Date.now() - 7200000).toISOString(),
                Resolved_At: new Date().toISOString()
              },
              {
                Report_ID: 103,
                Room_Number: 301,
                PC_Number: 5,
                Status: 'Resolved',
                Issue_Type: 'Operating System',
                Issue_Description: 'Blue screen of death on startup',
                Reported_At: new Date(Date.now() - 86400000).toISOString(),
                Resolved_At: new Date().toISOString(),
                Resolved_By_Name: 'Alex Ramos',
                Resolved_By_Role: 'IT Head'
              }
            ];

            if (window.reportStore && typeof window.reportStore.getReports === 'function') {
              window.reportStore.getReports = () => window.allReports;
            }

            if (window.reportModal && typeof window.reportModal.openCompletedModal === 'function') {
              window.reportModal.openCompletedModal();
            } else {
              const modal = document.getElementById('completedTicketsModal');
              if (modal) modal.style.display = 'flex';
            }
          })()
        `
      });
      await sleep(500);

      for (const vp of testViewports) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: vp.width <= 768
        });
        await sleep(300);

        const checkRes = await send('Runtime.evaluate', {
          returnByValue: true,
          expression: `
            (function() {
              const modal = document.getElementById('completedTicketsModal');
              if (!modal || modal.style.display === 'none') {
                return { error: 'Modal not open' };
              }

              const modalContainer = modal.querySelector('.completed-modal-container');
              const containerRect = modalContainer.getBoundingClientRect();

              // 1. Header elements overlap check
              const titleEl = modal.querySelector('.completed-modal-title');
              const closeBtn = modal.querySelector('.modal-close-btn');

              let headerCollision = false;
              if (titleEl && closeBtn) {
                const tRect = titleEl.getBoundingClientRect();
                const cRect = closeBtn.getBoundingClientRect();
                if (tRect.right > cRect.left && tRect.left < cRect.right && tRect.bottom > cRect.top && tRect.top < cRect.bottom) {
                  headerCollision = true;
                }
              }

              // 2. Toolbar search & filters check
              const searchInput = document.getElementById('modalTicketSearch');
              const timeFilters = modal.querySelector('.modal-time-filters');
              let toolbarCollision = false;
              if (searchInput && timeFilters) {
                const sRect = searchInput.getBoundingClientRect();
                const fRect = timeFilters.getBoundingClientRect();
                if (sRect.right > fRect.left && sRect.left < fRect.right && sRect.bottom > fRect.top && sRect.top < fRect.bottom) {
                  toolbarCollision = true;
                }
              }

              // 3. Middle row overlap check for every rendered card
              const cards = modal.querySelectorAll('.modal-ticket-card');
              let cardOverlapFound = false;
              let overlapDetails = [];
              let headerOverlapFound = false;

              cards.forEach((card, idx) => {
                const faultBadge = card.querySelector('.issue-badge-fault, .rc-badges-list');
                const viewBtn = card.querySelector('.btn-view-full-report');
                if (faultBadge && viewBtn) {
                  const bRect = faultBadge.getBoundingClientRect();
                  const vRect = viewBtn.getBoundingClientRect();
                  
                  // Check bounding box intersection
                  const intersects = (bRect.right > vRect.left && bRect.left < vRect.right &&
                                      bRect.bottom > vRect.top && bRect.top < vRect.bottom);
                  if (intersects) {
                    cardOverlapFound = true;
                    overlapDetails.push('Card ' + idx + ': badge [' + bRect.left + ',' + bRect.right + '] intersects btn [' + vRect.left + ',' + vRect.right + ']');
                  }

                  // On mobile <= 640px, verify vertical separation (button is below badge)
                  if (window.innerWidth <= 640) {
                    if (vRect.top < bRect.bottom - 2) {
                      cardOverlapFound = true;
                      overlapDetails.push('Card ' + idx + ': button is not below badge on mobile (btn top: ' + vRect.top + ', badge bottom: ' + bRect.bottom + ')');
                    }
                  }
                }

                // Check card header: asset title vs status badge
                const assetTitle = card.querySelector('.rc-asset-title');
                const statusBadge = card.querySelector('.status-badge');
                if (assetTitle && statusBadge) {
                  const aRect = assetTitle.getBoundingClientRect();
                  const sRect = statusBadge.getBoundingClientRect();
                  if (aRect.right > sRect.left && aRect.left < sRect.right && aRect.bottom > sRect.top && aRect.top < sRect.bottom) {
                    headerOverlapFound = true;
                  }
                }
              });

              // Check filter chips layout
              const filterChips = modal.querySelectorAll('.modal-filter-chip');
              let chipsOverflow = false;
              filterChips.forEach(chip => {
                const cRect = chip.getBoundingClientRect();
                if (cRect.right > containerRect.right + 2 || cRect.left < containerRect.left - 2) {
                  chipsOverflow = true;
                }
              });

              const heightRatio = containerRect.height / window.innerHeight;
              const widthRatio = containerRect.width / window.innerWidth;
              const coversFullScreen = (heightRatio > 0.88 || widthRatio > 0.95);

              return {
                modalVisible: true,
                cardCount: cards.length,
                headerCollision,
                toolbarCollision,
                cardOverlapFound,
                overlapDetails,
                headerOverlapFound,
                chipsOverflow,
                coversFullScreen,
                heightRatio,
                widthRatio,
                placeholder: searchInput ? searchInput.placeholder : ''
              };
            })()
          `
        });

        const data = checkRes.result.value;

        test(`${pageName} at ${vp.name}: Modal opens and cards render cleanly`, () => {
          assert.strictEqual(data.modalVisible, true, 'Modal must be open');
          assert.ok(data.cardCount > 0, 'Must render ticket cards');
        });

        test(`${pageName} at ${vp.name}: ZERO overlap between Reported Issue badge and View Full Report button`, () => {
          assert.strictEqual(data.cardOverlapFound, false, `Overlap detected: ${data.overlapDetails.join('; ')}`);
        });

        test(`${pageName} at ${vp.name}: ZERO collision between Asset title and Status badge`, () => {
          assert.strictEqual(data.headerOverlapFound, false, 'Asset title and status badge must not collide');
        });

        test(`${pageName} at ${vp.name}: Modal header and toolbar clean layout without overlap`, () => {
          assert.strictEqual(data.headerCollision, false, 'Header title must not collide with close button');
          assert.strictEqual(data.toolbarCollision, false, 'Search and filters must not collide');
          assert.strictEqual(data.chipsOverflow, false, 'Filter chips must not overflow modal');
        });

        test(`${pageName} at ${vp.name}: Modal container DOES NOT cover the full screen (floating dialog)`, () => {
          assert.strictEqual(data.coversFullScreen, false, `Modal is covering full screen: heightRatio=${data.heightRatio.toFixed(2)}, widthRatio=${data.widthRatio.toFixed(2)}`);
        });

        if (vp.width <= 640) {
          test(`${pageName} at ${vp.name}: Search placeholder is concise on mobile`, () => {
            assert.strictEqual(data.placeholder, 'Search completed tickets...', 'Must use mobile search placeholder');
          });
        }

        // Take snapshot for mobile verification
        if (pageName === 'it-head-pc-reports.html' && (vp.width === 390 || vp.width === 320)) {
          const shot = await send('Page.captureScreenshot', { format: 'png' });
          const artifactDir = path.resolve('C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b');
          const shotPath = path.join(artifactDir, `completed-modal-mobile-${vp.width}.png`);
          fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
          console.log(`     📸 Captured screenshot: ${shotPath}`);
        }
      }
    }

    ws.close();
    browserWs.close();
  } catch (err) {
    console.error('CDP Error:', err);
    failed++;
  } finally {
    try {
      chromeProc.kill('SIGKILL');
    } catch (e) {}
  }

  printSummary(passed, failed);
}

function printSummary(passed, failed) {
  console.log('\n================================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Unhandled fatal test runner error:', err);
  process.exit(1);
});
