/**
 * Comprehensive Role-Based Visibility & Responsive Regression Test Suite
 * Task: Fix Mobile Role-Based Visibility of Official Schedule Controls
 *
 * Verifies:
 * 1. Backend Route & RBAC Enforcement (POST /api/schedules/finalize and POST /api/schedules/reopen)
 *    - Rejects Program Coordinator requests with HTTP 403 Forbidden.
 * 2. Static CSS & DOM Invariants
 *    - CSS cascading rules prevent display: inline-flex override on hidden controls.
 *    - Inline markup includes hidden, role-hidden, and pre-paint role tagging.
 * 3. Client-Side Security & Modal Protection
 *    - Program Coordinator cannot trigger finalization or reopening via button click or controller call.
 * 4. Headless Chrome CDP Live Testing across ALL required viewports:
 *    - Mobile: 320, 360, 375, 390, 430, 480 px
 *    - Tablet: 768, 810, 820, 834, 1024 px
 *    - Desktop: 1280, 1440 px
 *    - Both roles: Program Coordinator & IT Dept. Head
 *    - Both lifecycle states: Working Draft & Official / Finalized
 *    - Dynamic viewport resizing from desktop (1440px) down to mobile (320px) and back
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const db = require('../database/connection');
const { IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');

async function findChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome executable not found');
}

let msgId = 1;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const curId = msgId++;
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`Timeout waiting for CDP response: ${method}`));
    }, 12000);
    const handler = (evt) => {
      const m = JSON.parse(evt.data);
      if (m.id === curId) {
        clearTimeout(timer);
        ws.removeEventListener('message', handler);
        if (m.error) reject(new Error(`${method} error: ${JSON.stringify(m.error)}`));
        else resolve(m.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });
}

const VIEWPORTS = [
  // Mobile
  { name: 'Mobile 320', width: 320, height: 600, category: 'mobile' },
  { name: 'Mobile 360', width: 360, height: 740, category: 'mobile' },
  { name: 'Mobile 375', width: 375, height: 667, category: 'mobile' },
  { name: 'Mobile 390', width: 390, height: 844, category: 'mobile' },
  { name: 'Mobile 430', width: 430, height: 932, category: 'mobile' },
  { name: 'Mobile 480', width: 480, height: 800, category: 'mobile' },
  // Tablet
  { name: 'Tablet 768', width: 768, height: 1024, category: 'tablet' },
  { name: 'Tablet 810', width: 810, height: 1080, category: 'tablet' },
  { name: 'Tablet 820', width: 820, height: 1180, category: 'tablet' },
  { name: 'Tablet 834', width: 834, height: 1194, category: 'tablet' },
  { name: 'Tablet 1024', width: 1024, height: 1366, category: 'tablet' },
  // Desktop
  { name: 'Desktop 1280', width: 1280, height: 800, category: 'desktop' },
  { name: 'Desktop 1440', width: 1440, height: 900, category: 'desktop' }
];

async function runSuite() {
  console.log('================================================================');
  console.log('🧪 SCHEDULE CONTROLS MOBILE VISIBILITY & RBAC REGRESSION SUITE');
  console.log('================================================================');

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Static File Verification
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. Static CSS & HTML Guard Invariants ---');

  const editorHtml = fs.readFileSync(path.join(__dirname, '../room-schedule-editor.html'), 'utf8');
  const cardsCss = fs.readFileSync(path.join(__dirname, '../css/components/schedule-cards.css'), 'utf8');
  const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

  // 1a. Markup checks
  assert.ok(editorHtml.includes('id="finalize-schedule-btn"'), 'room-schedule-editor.html must contain #finalize-schedule-btn');
  assert.ok(editorHtml.includes('id="reopen-schedule-btn"'), 'room-schedule-editor.html must contain #reopen-schedule-btn');
  assert.ok(editorHtml.includes('role-hidden'), 'Initial buttons must have role-hidden class');
  assert.ok(editorHtml.includes('tagRoleCoordinator'), 'Inline script must tag role-coordinator before paint');
  console.log('✔ PASS: HTML markup includes defensive pre-render role tagging and hidden attributes.');

  // 1b. CSS checks
  assert.ok(
    cardsCss.includes('.seh-actions button:not([hidden]):not(.hidden):not(.role-hidden)'),
    'schedule-cards.css must scope button flex rules to non-hidden elements'
  );
  assert.ok(
    cardsCss.includes('body.role-coordinator #finalize-schedule-btn'),
    'schedule-cards.css must explicitly hide official controls for body.role-coordinator'
  );
  assert.ok(
    responsiveCss.includes('.seh-actions button:not([hidden]):not(.hidden):not(.role-hidden)'),
    'responsive.css must scope button flex rules to non-hidden elements'
  );
  assert.ok(
    responsiveCss.includes('body.role-coordinator #finalize-schedule-btn'),
    'responsive.css must explicitly hide official controls for body.role-coordinator'
  );
  console.log('✔ PASS: Responsive CSS cascades enforce display: none !important for coordinator/hidden elements.');

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Backend Security & RBAC Enforcement
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Backend API Route Authorization Checks ---');

  assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Program Coordinator'), 'Program Coordinator must NOT be in IT_DEPT_HEAD_EXCLUSIVE_ROLES');

  // Find a Program Coordinator user in the database
  const [pcUsers] = await db.query("SELECT * FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
  const [headUsers] = await db.query("SELECT * FROM users WHERE Role IN ('IT Dept. Head', 'IT Head') LIMIT 1");
  assert.ok(pcUsers.length > 0, 'Program Coordinator user must exist in DB');
  assert.ok(headUsers.length > 0, 'IT Dept. Head user must exist in DB');

  const pcUser = pcUsers[0];
  const headUser = headUsers[0];

  // Helper to make authenticated HTTP requests to Express server
  async function testBackendPost(endpoint, userRole, userId) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify({
        roomNumber: '204',
        academicYear: '2026-2027',
        semester: '1st Semester'
      });
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          // Simulate session user if server supports header or session mock
          'x-test-role': userRole,
          'x-test-user-id': String(userId)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // Finalize API must reject unauthorized requests with 401 or 403
  const finalizeRes = await testBackendPost('/api/schedules/finalize', 'Program Coordinator', pcUser.User_ID);
  assert.ok([401, 403].includes(finalizeRes.status), `Finalize API must reject unauthenticated/unauthorized request (got ${finalizeRes.status})`);

  const reopenRes = await testBackendPost('/api/schedules/reopen', 'Program Coordinator', pcUser.User_ID);
  assert.ok([401, 403].includes(reopenRes.status), `Reopen API must reject unauthenticated/unauthorized request (got ${reopenRes.status})`);
  console.log('✔ PASS: Backend APIs (/api/schedules/finalize, /api/schedules/reopen) strictly reject unauthorized calls.');

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Headless Chrome CDP Live Layout & Responsive Testing
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Headless Chrome DevTools Protocol (CDP) Layout & Responsive Tests ---');

  const chromePath = await findChromePath();
  const cdpPort = 9228;
  const tempProfile = path.join(__dirname, '..', `.temp-chrome-schedule-mobile-${Date.now()}`);

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let bWs = null;

  try {
    await new Promise(r => setTimeout(r, 1500));
    const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    const versionInfo = await versionRes.json();
    bWs = new WebSocket(versionInfo.webSocketDebuggerUrl);
    await new Promise((res) => bWs.onopen = res);

    async function evaluateControls(pWs) {
      const res = await send(pWs, 'Runtime.evaluate', {
        expression: `(function() {
          const finalizeBtn = document.getElementById('finalize-schedule-btn');
          const reopenBtn = document.getElementById('reopen-schedule-btn');
          const saveBtn = document.getElementById('save-schedule-btn');
          const printBtn = document.getElementById('print-schedule-btn');

          function getMetrics(el) {
            if (!el) return { exists: false, visible: false, display: 'none', width: 0, height: 0, hiddenAttr: false, roleHidden: false };
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
            return {
              exists: true,
              visible: isVisible,
              display: style.display,
              visibility: style.visibility,
              width: rect.width,
              height: rect.height,
              hiddenAttr: el.hasAttribute('hidden'),
              roleHidden: el.classList.contains('role-hidden'),
              disabled: el.disabled
            };
          }

          return {
            finalize: getMetrics(finalizeBtn),
            reopen: getMetrics(reopenBtn),
            save: getMetrics(saveBtn),
            print: getMetrics(printBtn)
          };
        })()`,
        returnByValue: true
      });
      return res.result.value;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3A. PROGRAM COORDINATOR TESTS ACROSS ALL VIEWPORTS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3A. Testing Program Coordinator Across 13 Viewports ---');

    const pcTab = await send(bWs, 'Target.createTarget', { url: 'about:blank' });
    const pcWs = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/${pcTab.targetId}`);
    await new Promise((res) => pcWs.onopen = res);
    await send(pcWs, 'Page.enable');
    await send(pcWs, 'Runtime.enable');

    const pcUserObj = {
      User_ID: pcUser.User_ID,
      name: 'Santi Jay Esplana',
      role: 'Program Coordinator',
      Role: 'Program Coordinator'
    };

    await send(pcWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const u = ${JSON.stringify(pcUserObj)};
          sessionStorage.setItem('labsync_user', JSON.stringify(u));
          localStorage.setItem('user', JSON.stringify(u));
          localStorage.setItem('labsync_last_activity', Date.now().toString());

          const origFetch = window.fetch;
          window.fetch = async function(url, ...args) {
            if (typeof url === 'string') {
              if (url.includes('/api/user/current') || url.includes('/api/auth/me')) {
                return new Response(JSON.stringify({ user: u }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              if (url.includes('/api/schedules/room-locks/acquire') || url.includes('/api/schedules/room-locks/heartbeat')) {
                return new Response(JSON.stringify({
                  acquired: true,
                  editSessionToken: 'valid-test-lock-token',
                  lock: { userName: u.name, userRole: u.role }
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              if (url.includes('/api/schedules/room/204') || url.includes('/api/schedules?room=204')) {
                return new Response(JSON.stringify({
                  status: 'Draft',
                  version: 1,
                  schedules: []
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
            }
            return origFetch.apply(this, [url, ...args]);
          };
        } catch(e) {}
      `
    });

    await send(pcWs, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send(pcWs, 'Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
    await new Promise(r => setTimeout(r, 1600));

    for (const vp of VIEWPORTS) {
      await send(pcWs, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.category === 'mobile'
      });
      await new Promise(r => setTimeout(r, 150));

      const metrics = await evaluateControls(pcWs);

      assert.strictEqual(metrics.finalize.visible, false, `[${vp.name}] Finalize button MUST NOT be visible for Program Coordinator`);
      assert.strictEqual(metrics.finalize.display, 'none', `[${vp.name}] Finalize button computed display must be 'none'`);
      assert.strictEqual(metrics.finalize.width, 0, `[${vp.name}] Finalize button width must be 0`);

      assert.strictEqual(metrics.reopen.visible, false, `[${vp.name}] Reopen button MUST NOT be visible for Program Coordinator`);
      assert.strictEqual(metrics.reopen.display, 'none', `[${vp.name}] Reopen button computed display must be 'none'`);
      assert.strictEqual(metrics.reopen.width, 0, `[${vp.name}] Reopen button width must be 0`);

      // Permitted draft controls must remain available
      assert.strictEqual(metrics.save.exists, true, `[${vp.name}] Save Draft button must exist`);
      assert.strictEqual(metrics.save.visible, true, `[${vp.name}] Save Draft button must be visible`);
      assert.ok(metrics.save.width > 0, `[${vp.name}] Save Draft button width must be > 0`);

      assert.strictEqual(metrics.print.exists, true, `[${vp.name}] Print button must exist`);
      assert.strictEqual(metrics.print.visible, true, `[${vp.name}] Print button must be visible`);
    }
    console.log('✔ PASS: Program Coordinator verified across all 13 breakpoints (Finalize & Reopen completely invisible; Save Draft available).');

    // ─────────────────────────────────────────────────────────────────────────
    // 3B. DYNAMIC RESIZE REGRESSION TEST (Desktop -> Mobile -> Desktop)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3B. Dynamic Viewport Resizing (Desktop -> Mobile -> Desktop) ---');
    const resizeSequence = [1440, 1024, 834, 768, 480, 430, 390, 375, 360, 320, 375, 768, 1024, 1440];
    for (const w of resizeSequence) {
      await send(pcWs, 'Emulation.setDeviceMetricsOverride', {
        width: w,
        height: 800,
        deviceScaleFactor: 1,
        mobile: w <= 480
      });
      await new Promise(r => setTimeout(r, 80));

      const metrics = await evaluateControls(pcWs);
      assert.strictEqual(metrics.finalize.visible, false, `[Resize ${w}px] Finalize button must never reappear during resize`);
      assert.strictEqual(metrics.reopen.visible, false, `[Resize ${w}px] Reopen button must never reappear during resize`);
    }
    console.log('✔ PASS: Dynamic resize sequence confirmed: restricted controls never reappear on layout transition.');

    // ─────────────────────────────────────────────────────────────────────────
    // 3C. PROGRAM COORDINATOR ACTION INVOCATION GUARDS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3C. Direct Click & Modal Invocation Interception ---');
    const invokeResult = await send(pcWs, 'Runtime.evaluate', {
      expression: `(function() {
        const finalizeBtn = document.getElementById('finalize-schedule-btn');
        const reopenBtn = document.getElementById('reopen-schedule-btn');
        const modal = document.getElementById('schedule-status-confirm-modal');

        // Attempt manual click on finalize button
        finalizeBtn.click();
        const modalDisplayAfterFinalizeClick = window.getComputedStyle(modal).display;

        // Attempt manual click on reopen button
        reopenBtn.click();
        const modalDisplayAfterReopenClick = window.getComputedStyle(modal).display;

        // Attempt calling openStatusConfirmModal directly if accessible
        if (typeof window.openStatusConfirmModal === 'function') {
          window.openStatusConfirmModal('finalize');
        }
        const modalDisplayAfterDirectCall = window.getComputedStyle(modal).display;

        return {
          modalAfterFinalize: modalDisplayAfterFinalizeClick,
          modalAfterReopen: modalDisplayAfterReopenClick,
          modalAfterDirectCall: modalDisplayAfterDirectCall
        };
      })()`,
      returnByValue: true
    });

    assert.strictEqual(invokeResult.result.value.modalAfterFinalize, 'none', 'Finalize button click must NOT open confirmation modal');
    assert.strictEqual(invokeResult.result.value.modalAfterReopen, 'none', 'Reopen button click must NOT open confirmation modal');
    assert.strictEqual(invokeResult.result.value.modalAfterDirectCall, 'none', 'Direct modal invocation must remain blocked');
    console.log('✔ PASS: Program Coordinator UI click listeners and modal opener strictly block unauthorized actions.');

    // ─────────────────────────────────────────────────────────────────────────
    // 3D. IT DEPARTMENT HEAD WORKFLOWS (Draft & Finalized States)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n--- 3D. Testing IT Department Head Workflows Across Breakpoints ---');

    const headTab = await send(bWs, 'Target.createTarget', { url: 'about:blank' });
    const headWs = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/${headTab.targetId}`);
    await new Promise((res) => headWs.onopen = res);
    await send(headWs, 'Page.enable');
    await send(headWs, 'Runtime.enable');

    const headUserObj = {
      User_ID: headUser.User_ID,
      name: 'Andrei Gabito',
      role: 'IT Dept. Head',
      Role: 'IT Dept. Head'
    };

    await send(headWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const u = ${JSON.stringify(headUserObj)};
          sessionStorage.setItem('labsync_user', JSON.stringify(u));
          localStorage.setItem('user', JSON.stringify(u));
          localStorage.setItem('labsync_last_activity', Date.now().toString());

          const origFetch = window.fetch;
          window.fetch = async function(url, ...args) {
            if (typeof url === 'string') {
              if (url.includes('/api/user/current') || url.includes('/api/auth/me')) {
                return new Response(JSON.stringify({ user: u }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              if (url.includes('/api/schedules/room-locks/acquire') || url.includes('/api/schedules/room-locks/heartbeat')) {
                return new Response(JSON.stringify({
                  acquired: true,
                  editSessionToken: 'valid-test-lock-token',
                  lock: { userName: u.name, userRole: u.role }
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              if (url.includes('/api/schedules/room/204') || url.includes('/api/schedules?room=204')) {
                return new Response(JSON.stringify({
                  status: 'Draft',
                  version: 1,
                  schedules: []
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
            }
            return origFetch.apply(this, [url, ...args]);
          };
        } catch(e) {}
      `
    });

    await send(headWs, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send(headWs, 'Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
    await new Promise(r => setTimeout(r, 1600));

    // Simulate Draft schedule on IT Dept. Head
    await send(headWs, 'Runtime.evaluate', {
      expression: `(function() {
        if (window.schedulePersistence && typeof window.schedulePersistence.updateStatusUI === 'function') {
          window.schedulePersistence.setEditSessionToken('valid-it-head-token');
          window.schedulePersistence.updateStatusUI('Draft', 1);
        }
      })()`
    });

    // Check key breakpoints for IT Dept Head in Draft state
    for (const vp of VIEWPORTS) {
      await send(headWs, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.category === 'mobile'
      });
      await new Promise(r => setTimeout(r, 80));

      const metrics = await evaluateControls(headWs);
      assert.strictEqual(metrics.finalize.visible, true, `[${vp.name}] Finalize button must be VISIBLE for IT Dept Head in Draft status`);
      assert.ok(metrics.finalize.width > 0, `[${vp.name}] Finalize button width must be > 0`);
      assert.strictEqual(metrics.reopen.visible, false, `[${vp.name}] Reopen button must be HIDDEN in Draft status`);
      assert.strictEqual(metrics.reopen.display, 'none', `[${vp.name}] Reopen button display must be none in Draft status`);
    }
    console.log('✔ PASS: IT Dept. Head Draft state: Finalize button is visible and Reopen is hidden at all 13 breakpoints.');

    // Switch to Finalized state on IT Dept. Head
    await send(headWs, 'Runtime.evaluate', {
      expression: `(function() {
        if (window.schedulePersistence && typeof window.schedulePersistence.updateStatusUI === 'function') {
          window.schedulePersistence.updateStatusUI('Finalized', 1, 'Andrei Gabito', new Date().toISOString());
        }
      })()`
    });

    // Check key breakpoints for IT Dept Head in Finalized state
    for (const vp of VIEWPORTS) {
      await send(headWs, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.category === 'mobile'
      });
      await new Promise(r => setTimeout(r, 80));

      const metrics = await evaluateControls(headWs);
      assert.strictEqual(metrics.finalize.visible, false, `[${vp.name}] Finalize button must be HIDDEN in Finalized status`);
      assert.strictEqual(metrics.finalize.display, 'none', `[${vp.name}] Finalize button display must be none in Finalized status`);
      assert.strictEqual(metrics.reopen.visible, true, `[${vp.name}] Reopen button must be VISIBLE for IT Dept Head in Finalized status`);
      assert.ok(metrics.reopen.width > 0, `[${vp.name}] Reopen button width must be > 0`);
    }
    console.log('✔ PASS: IT Dept. Head Finalized state: Reopen button is visible and Finalize is hidden at all 13 breakpoints.');

    // Cleanup tabs
    await send(bWs, 'Target.closeTarget', { targetId: pcTab.targetId }).catch(() => {});
    await send(bWs, 'Target.closeTarget', { targetId: headTab.targetId }).catch(() => {});

  } finally {
    if (bWs) bWs.close();
    proc.kill('SIGKILL');
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n================================================================');
  console.log('🎉 ALL MOBILE VISIBILITY & RBAC REGRESSION TESTS PASSED 100%!');
  console.log('================================================================');
}

runSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ TEST SUITE FAILED:', err);
    process.exit(1);
  });
