'use strict';

/**
 * tests/test-faculty-schedule-modal-responsive.js
 * Comprehensive automated layout and responsive overlap test for the Faculty Schedule modal.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting Faculty Schedule Modal Responsive Layout Tests');
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

  const scheduleCardsCss = fs.readFileSync(path.join(__dirname, '../css/components/schedule-cards.css'), 'utf8').replace(/\r\n/g, '\n');
  const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8').replace(/\r\n/g, '\n');

  test('schedule-cards.css defines safe word breaking for subject title', () => {
    assert.ok(scheduleCardsCss.includes('overflow-wrap: break-word;\n  word-break: normal;'), 'Must have safe word-break');
  });

  test('schedule-cards.css defines mobile adaptations under <=640px', () => {
    assert.ok(scheduleCardsCss.includes('.sched-modal-card {\n    flex-direction: column !important;'), 'Cards must stack vertically on mobile');
    assert.ok(scheduleCardsCss.includes('.sched-card-left {\n    width: 100% !important;'), 'Subject block must be full width');
    assert.ok(scheduleCardsCss.includes('.sched-card-right {\n    flex-direction: row !important;'), 'Right block must be horizontal bottom row');
    assert.ok(scheduleCardsCss.includes('#schedule-view-modal,\n  .sched-modal-backdrop {\n    padding: 18px 12px !important;'), 'Must have backdrop padding');
  });

  test('responsive.css provides synchronized faculty schedule modal responsive styles under <=640px and <=360px', () => {
    assert.ok(responsiveCss.includes('.sched-modal-card {\n    flex-direction: column !important;'), 'responsive.css must stack card vertically');
    assert.ok(responsiveCss.includes('.sched-card-right {\n    flex-direction: row !important;'), 'responsive.css must make bottom row horizontal');
    assert.ok(responsiveCss.includes('#schedule-view-modal,\n  .sched-modal-backdrop {\n    padding: 18px 12px !important;'), 'Must have 640px backdrop padding');
    assert.ok(responsiveCss.includes('#schedule-view-modal,\n  .sched-modal-backdrop {\n    padding: 14px 8px !important;'), 'Must have 360px backdrop padding');
  });

  console.log('\n--- 2. Static Script Verification ---');

  const modalJs = fs.readFileSync(path.join(__dirname, '../js/components/faculty-schedule-modal.js'), 'utf8').replace(/\r\n/g, '\n');

  test('faculty-schedule-modal.js includes sched-modal-backdrop and sched-modal-list classes', () => {
    assert.ok(modalJs.includes("modal.className = 'sched-modal-backdrop';"), 'Must assign sched-modal-backdrop class');
    assert.ok(modalJs.includes('class="sched-modal-list"'), 'Must have sched-modal-list class');
  });

  console.log('\n--- 3. Headless Chrome DevTools Protocol (CDP) Runtime Verification ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('  ⚠️ Chrome binary not found at default path, skipping CDP runtime testing.');
    printSummary(passed, failed);
    return;
  }

  const port = 9228;
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

    // Setup session storage and mock API
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
              if (url.includes('/api/schedules/faculty/')) {
                return new Response(JSON.stringify([
                  {
                    day: 'Monday',
                    subject: 'CC 102 – Introduction to Computing',
                    section: '4E',
                    Building: 'Bldg. B',
                    Room_Number: '204',
                    startTime: '12:00:00',
                    endTime: '13:30:00'
                  },
                  {
                    day: 'Tuesday',
                    subject: 'CC 104 – Computer Programming 2',
                    section: '1C-2',
                    Building: 'Bldg. E',
                    Room_Number: '203',
                    startTime: '07:00:00',
                    endTime: '09:00:00'
                  },
                  {
                    day: 'Tuesday',
                    subject: 'CAP 401W – Capstone Project & Research 2',
                    section: '1A-2',
                    Building: 'Bldg. E',
                    Room_Number: '203',
                    startTime: '09:00:00',
                    endTime: '10:30:00'
                  }
                ]), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
            return origFetch(url, ...args);
          };

          window.getFacultyScheduleByName = async function(name) {
            return [
              {
                day: 'Monday',
                subject: 'CC 102 – Introduction to Computing',
                section: '4E',
                Building: 'Bldg. B',
                Room_Number: '204',
                startTime: '12:00:00',
                endTime: '13:30:00'
              },
              {
                day: 'Tuesday',
                subject: 'CC 104 – Computer Programming 2',
                section: '1C-2',
                Building: 'Bldg. E',
                Room_Number: '203',
                startTime: '07:00:00',
                endTime: '09:00:00'
              },
              {
                day: 'Tuesday',
                subject: 'CAP 401W – Capstone Project & Research 2',
                section: '1A-2',
                Building: 'Bldg. E',
                Room_Number: '203',
                startTime: '09:00:00',
                endTime: '10:30:00'
              }
            ];
          };
        } catch (e) {
          console.error('Setup error:', e);
        }
      `
    });

    const targetUrl = 'http://localhost:3000/faculty-management.html';
    await send('Page.navigate', { url: targetUrl });
    await sleep(1500);

    const viewports = [
      { name: 'Narrow Mobile', width: 320, height: 600, isMobile: true },
      { name: 'Small Android', width: 360, height: 740, isMobile: true },
      { name: 'iPhone SE', width: 375, height: 667, isMobile: true },
      { name: 'iPhone 12/13/14', width: 390, height: 844, isMobile: true },
      { name: 'iPhone Pro Max', width: 430, height: 932, isMobile: true },
      { name: 'iPad Portrait', width: 768, height: 1024, isMobile: false },
      { name: 'iPad Landscape', width: 1024, height: 768, isMobile: false },
      { name: 'Desktop Regression', width: 1440, height: 900, isMobile: false }
    ];

    for (const vp of viewports) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.isMobile
      });
      await sleep(150);

      // Open faculty schedule modal
      await send('Runtime.evaluate', {
        expression: `
          (async () => {
            if (window.viewFacultySchedule) {
              await window.viewFacultySchedule('Andrei Gabito');
            }
          })();
        `,
        awaitPromise: true
      });
      await sleep(400);

      const evalRes = (await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const modal = document.getElementById('schedule-view-modal');
            if (!modal) return { error: 'Modal not found in DOM' };

            const dialog = modal.querySelector('.sched-modal-dialog');
            if (!dialog) return { error: 'Dialog not found' };

            const dialogRect = dialog.getBoundingClientRect();
            const cards = modal.querySelectorAll('.sched-modal-card');
            if (cards.length === 0) return { error: 'No schedule cards rendered' };

            // Check card elements layout
            let cardsOverlap = false;
            let overlapDetails = [];
            let subjectWidthRatioSum = 0;

            cards.forEach((card, idx) => {
              const left = card.querySelector('.sched-card-left');
              const right = card.querySelector('.sched-card-right');
              const subject = card.querySelector('.sched-card-subject');
              const timeBadge = card.querySelector('.sched-time-badge');
              const statusPill = card.querySelector('.sched-status-pill');

              const cardRect = card.getBoundingClientRect();
              const leftRect = left.getBoundingClientRect();
              const rightRect = right.getBoundingClientRect();
              const sRect = subject.getBoundingClientRect();

              subjectWidthRatioSum += (sRect.width / cardRect.width);

              if (window.innerWidth <= 640) {
                // On mobile, right block should be vertically stacked below left block
                if (rightRect.top < leftRect.bottom - 4) {
                  cardsOverlap = true;
                  overlapDetails.push('Card ' + idx + ': Right block is not below left block (right top: ' + rightRect.top + ', left bottom: ' + leftRect.bottom + ')');
                }

                // Check horizontal collision between time badge and status pill in the bottom row
                if (timeBadge && statusPill) {
                  const tRect = timeBadge.getBoundingClientRect();
                  const pRect = statusPill.getBoundingClientRect();
                  if (tRect.right > pRect.left && tRect.left < pRect.right && tRect.bottom > pRect.top && tRect.top < pRect.bottom) {
                    cardsOverlap = true;
                    overlapDetails.push('Card ' + idx + ': Time badge and status pill collide horizontally');
                  }
                }
              }
            });

            const avgSubjectWidthRatio = subjectWidthRatioSum / cards.length;
            const heightRatio = dialogRect.height / window.innerHeight;
            const widthRatio = dialogRect.width / window.innerWidth;
            const coversFullScreen = (heightRatio > 0.88 || widthRatio > 0.96);

            return {
              modalVisible: true,
              cardCount: cards.length,
              cardsOverlap,
              overlapDetails,
              avgSubjectWidthRatio,
              dialogWidth: dialogRect.width,
              dialogHeight: dialogRect.height,
              widthRatio,
              heightRatio,
              coversFullScreen
            };
          })()
        `
      })).result.value;

      test(`Faculty Schedule at ${vp.name} (${vp.width}px): Modal opens and renders 3 cards`, () => {
        assert.ok(evalRes.modalVisible, 'Modal must be visible');
        assert.strictEqual(evalRes.cardCount, 3, 'Must render 3 schedule cards');
      });

      test(`Faculty Schedule at ${vp.name} (${vp.width}px): ZERO card overlaps or collisions`, () => {
        assert.strictEqual(evalRes.cardsOverlap, false, `Overlap detected: ${evalRes.overlapDetails ? evalRes.overlapDetails.join('; ') : ''}`);
      });

      test(`Faculty Schedule at ${vp.name} (${vp.width}px): Subject title has generous width (${Math.round(evalRes.avgSubjectWidthRatio * 100)}% of card)`, () => {
        if (vp.isMobile) {
          assert.ok(evalRes.avgSubjectWidthRatio >= 0.85, 'Subject title must utilize >= 85% of card width on mobile');
        } else {
          assert.ok(evalRes.avgSubjectWidthRatio > 0.45, 'Subject title must utilize adequate width on desktop');
        }
      });

      test(`Faculty Schedule at ${vp.name} (${vp.width}px): Modal container DOES NOT cover the full screen (floating dialog)`, () => {
        assert.strictEqual(evalRes.coversFullScreen, false, `Dialog too large: widthRatio=${evalRes.widthRatio.toFixed(2)}, heightRatio=${evalRes.heightRatio.toFixed(2)}`);
      });

      // Capture visual screenshot at 390px
      if (vp.width === 390) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const shotPath = path.join('C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b', 'faculty-schedule-modal-mobile-390.png');
        fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
        console.log(`     📸 Captured screenshot: ${shotPath}`);
      }

      // Close modal before next viewport test
      await send('Runtime.evaluate', {
        expression: `
          const closeBtn = document.getElementById('close-sched-modal');
          if (closeBtn) closeBtn.click();
        `
      });
      await sleep(300);
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
