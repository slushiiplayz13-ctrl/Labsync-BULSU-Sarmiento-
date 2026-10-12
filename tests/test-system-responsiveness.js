'use strict';

/**
 * tests/test-system-responsiveness.js
 * Focused automated regression test suite for LabSync full-system responsiveness.
 *
 * Verifies:
 * 1. MIS Maintenance Controls Row Tablet Responsiveness (768px - 1024px):
 *    - Search box and controls row flex without overflowing container borders at 810px, 820px, 834px, 1024px.
 *    - Page scrollWidth does not exceed viewport width.
 * 2. Mobile Table Header Suppression Invariant (320px - 768px, plus mobile landscape):
 *    - Under mobile card layout, table thead (even when empty/loading) is strictly hidden.
 *    - No fixed column headers leak outside the viewport.
 * 3. Desktop Layout Preservation (1280px, 1440px):
 *    - Table thead is preserved for tabular display.
 *    - Controls row maintains top-level desktop alignment.
 */

const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');

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

async function runResponsiveTests() {
  console.log('================================================================');
  console.log('🧪 Starting LabSync Responsiveness Verification Suite');
  console.log('================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9598;
  const tempProfile = path.join(__dirname, 'temp-chrome-resp-' + Date.now());

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1200));
    const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const versionData = await versionRes.json();
    const bWs = new WebSocket(versionData.webSocketDebuggerUrl);
    await new Promise(r => bWs.onopen = r);

    let id = 1;
    function send(ws, method, params = {}) {
      return new Promise((resolve) => {
        const curId = id++;
        const handler = (evt) => {
          const m = JSON.parse(evt.data);
          if (m.id === curId) {
            ws.removeEventListener('message', handler);
            resolve(m.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const t = await send(bWs, 'Target.createTarget', { url: 'about:blank' });
    const pWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${t.targetId}`);
    await new Promise(r => pWs.onopen = r);

    await send(pWs, 'Page.enable');
    await send(pWs, 'Runtime.enable');

    // Emulate authenticated MIS Staff
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const userObj = { id: 1, name: 'MIS Officer', email: 'mis@bulsu.edu.ph', role: 'MIS Staff', Role: 'MIS Staff' };
          localStorage.setItem('user', JSON.stringify(userObj));
          localStorage.setItem('labsync_last_activity', Date.now().toString());
          sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
        } catch(e) {}
      `
    });

    const fileUrl = 'file:///' + path.join(__dirname, '..', 'mis-maintenance.html').replace(/\\/g, '/');

    // ─── 1. Tablet Viewports Check (810px, 820px, 834px, 1024px) ───
    console.log('--- 1. Tablet Viewports Controls Row & Search Box ---');
    for (const w of [810, 820, 834, 1024]) {
      await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: w, height: 1080, deviceScaleFactor: 1, mobile: false });
      await send(pWs, 'Page.navigate', { url: fileUrl });
      await new Promise(r => setTimeout(r, 600));

      const res = await send(pWs, 'Runtime.evaluate', {
        expression: `(function() {
          const search = document.querySelector(".maint-search-wrap .search-box");
          const searchRect = search ? search.getBoundingClientRect() : null;
          const card = document.querySelector(".dashboard-card");
          const cardRect = card ? card.getBoundingClientRect() : null;
          const winW = window.innerWidth;
          const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
          return {
            winW,
            scrollW,
            hasHOverflow: scrollW > winW + 1,
            searchRight: searchRect ? Math.round(searchRect.right) : 0,
            cardRight: cardRect ? Math.round(cardRect.right) : 0,
            searchContained: searchRect && cardRect ? (searchRect.right <= cardRect.right + 2) : false
          };
        })()`,
        returnByValue: true
      });

      const data = res.result.value;
      testAssert(!data.hasHOverflow, `[${w}px] No horizontal page overflow (scrollWidth=${data.scrollW}px vs ${data.winW}px)`);
      testAssert(data.searchRight <= data.winW, `[${w}px] Search box is within viewport boundary (right=${data.searchRight}px <= ${data.winW}px)`);
      testAssert(data.searchContained, `[${w}px] Search box is contained within parent card boundary`);
    }

    // ─── 2. Mobile Viewports Check (320px, 360px, 375px, 480px, 768px, 667x375 landscape) ───
    console.log('\n--- 2. Mobile Viewports Table Header & Container Containment ---');
    const mobileViewports = [
      { w: 320, h: 640 },
      { w: 360, h: 740 },
      { w: 375, h: 667 },
      { w: 480, h: 800 },
      { w: 768, h: 1024 },
      { w: 667, h: 375 } // mobile landscape
    ];

    for (const vp of mobileViewports) {
      await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: true });
      await send(pWs, 'Page.navigate', { url: fileUrl });
      await new Promise(r => setTimeout(r, 600));

      const res = await send(pWs, 'Runtime.evaluate', {
        expression: `(function() {
          const thead = document.querySelector(".maint-table thead");
          const theadDisplay = thead ? window.getComputedStyle(thead).display : null;
          const theadRect = thead ? thead.getBoundingClientRect() : null;
          const winW = window.innerWidth;
          const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);

          // Find any elements sticking out past viewport width
          const outOfBounds = [];
          document.querySelectorAll("body *").forEach(el => {
            const s = window.getComputedStyle(el);
            if (s.display === 'none' || s.visibility === 'hidden') return;
            const r = el.getBoundingClientRect();
            if (r.right > winW + 2) {
              outOfBounds.push({ tag: el.tagName, id: el.id || el.className, right: Math.round(r.right), diff: Math.round(r.right - winW) });
            }
          });

          return {
            winW,
            scrollW,
            hasHOverflow: scrollW > winW + 1,
            theadDisplay,
            theadHidden: theadDisplay === 'none' || (theadRect && theadRect.height === 0),
            outOfBoundsCount: outOfBounds.length,
            outOfBounds
          };
        })()`,
        returnByValue: true
      });

      const data = res.result.value;
      testAssert(data.theadHidden, `[${vp.w}x${vp.h}] Table thead is suppressed on mobile layout (display=${data.theadDisplay})`);
      testAssert(!data.hasHOverflow, `[${vp.w}x${vp.h}] Page has zero horizontal overflow`);
      testAssert(data.outOfBoundsCount === 0, `[${vp.w}x${vp.h}] Zero elements sticking out past viewport boundary`);
    }

    // ─── 3. Desktop Preservation Check (1280px, 1440px) ───
    console.log('\n--- 3. Desktop Layout Preservation (1280px & 1440px) ---');
    for (const w of [1280, 1440]) {
      await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await send(pWs, 'Page.navigate', { url: fileUrl });
      await new Promise(r => setTimeout(r, 600));

      const res = await send(pWs, 'Runtime.evaluate', {
        expression: `(function() {
          const thead = document.querySelector(".maint-table thead");
          const theadDisplay = thead ? window.getComputedStyle(thead).display : null;
          const search = document.querySelector(".maint-search-wrap .search-box");
          const searchRect = search ? search.getBoundingClientRect() : null;
          const winW = window.innerWidth;
          const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
          return {
            winW,
            scrollW,
            hasHOverflow: scrollW > winW + 1,
            theadVisible: theadDisplay !== 'none',
            searchWidth: searchRect ? Math.round(searchRect.width) : 0
          };
        })()`,
        returnByValue: true
      });

      const data = res.result.value;
      testAssert(data.theadVisible, `[${w}px] Table thead is preserved for desktop tabular view`);
      testAssert(data.searchWidth >= 300 && data.searchWidth <= 362, `[${w}px] Search box maintains standard desktop width (~360px, actual=${data.searchWidth}px)`);
      testAssert(!data.hasHOverflow, `[${w}px] No horizontal page overflow on desktop`);
    }

    console.log('\n================================================================');
    console.log(`Summary: ${passedTests} passed, 0 failed out of ${totalTests} checks`);
    console.log('================================================================\n');

    pWs.close();
    bWs.close();
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (_) {}
  }
}

runResponsiveTests().catch(err => {
  console.error(err);
  process.exit(1);
});
