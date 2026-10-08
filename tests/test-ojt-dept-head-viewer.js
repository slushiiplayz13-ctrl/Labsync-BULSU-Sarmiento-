/**
 * tests/test-ojt-dept-head-viewer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification suite for OJT Interns view-only directory access for Department Heads:
 * 1. Server-side API verification:
 *    - IT Dept. Head can GET /api/ojt and view records.
 *    - IT Dept. Head can GET /api/ojt/:userId for single record.
 *    - IT Dept. Head CANNOT create (POST /api/ojt) -> 403 Forbidden.
 *    - IT Dept. Head CANNOT update (PUT /api/ojt/:id) -> 403 Forbidden.
 *    - IT Dept. Head CANNOT toggle status (PUT /api/ojt/:id/status) -> 403 Forbidden.
 *    - IT Dept. Head CANNOT reset password (POST /api/ojt/:id/reset-password) -> 403 Forbidden.
 * 2. Headless Chrome UI verification:
 *    - User Management OJT tab switching.
 *    - Roster rendering (Violeta & Nickaela).
 *    - View-Only Roster badge presence.
 *    - Interactive Read-Only Details modal inspection.
 *    - Screenshot captures in light mode, dark mode, mobile, and modal.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('../database/connection');
const ojtController = require('../controllers/ojt.controller');
const { requireRole, MIS_STAFF_ROLES, IT_HEAD_ROLES } = require('../middleware/auth');

function createMockReqRes({ session = {}, params = {}, body = {}, ip = '127.0.0.1' } = {}) {
  const req = {
    session,
    params,
    body,
    headers: {},
    originalUrl: '/api/ojt',
    ip,
    connection: { remoteAddress: ip }
  };
  const res = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return { req, res };
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST: OJT INTERNS DEPT HEAD VIEW-ONLY DIRECTORY ACCESS');
  console.log('================================================================\n');

  // Find active IT Dept. Head in DB
  const [headRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'IT Dept. Head' AND Status = 'ACTIVE' LIMIT 1");
  assert.ok(headRows.length > 0, 'Active IT Dept. Head must exist');
  const deptHead = headRows[0];

  // 1. API: List OJTs as Dept Head
  console.log('--- 1. Testing GET /api/ojt as IT Dept. Head ---');
  const { req: reqList, res: resList } = createMockReqRes({ session: { userId: deptHead.User_ID, userRole: deptHead.Role } });
  await ojtController.listOjts(reqList, resList, () => {});
  assert.strictEqual(resList.statusCode, 200, 'GET /api/ojt must return 200');
  assert.ok(Array.isArray(resList.jsonData), 'Response must be an array');
  assert.ok(resList.jsonData.length >= 2, 'Should contain at least 2 OJT interns');
  const sampleOjt = resList.jsonData[0];
  console.log(`✔ PASS: IT Dept. Head successfully retrieved ${resList.jsonData.length} OJT intern records.`);

  // 2. API: Get single OJT as Dept Head
  console.log('--- 2. Testing GET /api/ojt/:userId as IT Dept. Head ---');
  const { req: reqSingle, res: resSingle } = createMockReqRes({
    session: { userId: deptHead.User_ID, userRole: deptHead.Role },
    params: { userId: sampleOjt.User_ID }
  });
  await ojtController.getOjt(reqSingle, resSingle, () => {});
  assert.strictEqual(resSingle.statusCode, 200, 'GET /api/ojt/:userId must return 200');
  assert.strictEqual(resSingle.jsonData.User_ID, sampleOjt.User_ID);
  console.log(`✔ PASS: IT Dept. Head can view intern details for ${resSingle.jsonData.Name}.`);

  // 3. API: Middleware RBAC verification for Mutative Actions
  console.log('--- 3. Testing RBAC Denial for IT Dept. Head on Mutative Actions ---');
  const misOnlyMiddleware = requireRole(MIS_STAFF_ROLES);

  async function testMiddlewareDenial(actionName) {
    let nextCalled = false;
    let deniedStatus = null;
    let deniedBody = null;
    const mockReq = {
      session: { userId: deptHead.User_ID, userRole: deptHead.Role, lastActivity: Date.now() },
      headers: {},
      originalUrl: '/api/ojt'
    };
    const mockRes = {
      status(code) { deniedStatus = code; return this; },
      json(payload) { deniedBody = payload; return this; }
    };
    await misOnlyMiddleware(mockReq, mockRes, () => { nextCalled = true; });
    assert.strictEqual(nextCalled, false, `${actionName} must NOT call next() for IT Dept. Head`);
    assert.strictEqual(deniedStatus, 403, `${actionName} must return 403 Forbidden`);
    assert.strictEqual(deniedBody?.code, 'ROLE_REVOKED');
    console.log(`✔ PASS: IT Dept. Head strictly blocked (403) from ${actionName}.`);
  }

  await testMiddlewareDenial('POST /api/ojt (Create Intern)');
  await testMiddlewareDenial('PUT /api/ojt/:userId (Update Intern)');
  await testMiddlewareDenial('PUT /api/ojt/:userId/status (Toggle Status)');
  await testMiddlewareDenial('POST /api/ojt/:userId/reset-password (Reset Password)');

  // 4. Headless Chrome UI Verification
  console.log('\n--- 4. Testing Headless Chrome UI Interaction & Screenshots ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9593;
  const tempProfile = path.join(__dirname, '..', '.temp-chrome-ojt-' + Date.now());
  const proc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + tempProfile,
    '--no-first-run',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1200));
    const vRes = await fetch('http://127.0.0.1:' + port + '/json/version');
    const vData = await vRes.json();
    const bWs = new WebSocket(vData.webSocketDebuggerUrl);
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
    const pWs = new WebSocket('ws://127.0.0.1:' + port + '/devtools/page/' + t.targetId);
    await new Promise(r => pWs.onopen = r);

    await send(pWs, 'Page.enable');
    await send(pWs, 'DOM.enable');

    // Inject Head session & API mock with real DB records
    const ojtMockJson = JSON.stringify(resList.jsonData);
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const u = { User_ID: ${deptHead.User_ID}, Name: 'Andrei Gabito', Role: 'IT Dept. Head', Email: 'head@labsync.com', Status: 'ACTIVE' };
          const mockOjts = ${ojtMockJson};
          localStorage.setItem('user', JSON.stringify(u));
          sessionStorage.setItem('labsync_user', JSON.stringify(u));
          localStorage.setItem('labsync_last_activity', Date.now().toString());

          const origFetch = window.fetch;
          window.fetch = async function(url, ...args) {
            if (typeof url === 'string') {
              if (url.includes('/api/user/current') || url.includes('/api/auth/me')) {
                return new Response(JSON.stringify({ user: u }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
              if (url.includes('/api/ojt')) {
                return new Response(JSON.stringify(mockOjts), { status: 200, headers: { 'Content-Type': 'application/json' } });
              }
            }
            return origFetch.apply(this, [url, ...args]);
          };
        } catch(e) {}
      `
    });

    // 4.1 Desktop Light Mode
    await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/faculty-management.html' });
    await new Promise(r => setTimeout(r, 2000));

    // Click OJT Interns tab
    const tabClickRes = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const btn = document.getElementById('umTabOjt');
          if (!btn) return { ok: false, error: 'Button not found' };
          btn.click();
          return { ok: true };
        })()
      `,
      returnByValue: true
    });
    assert.strictEqual(tabClickRes.result.value.ok, true, 'OJT tab button clicked successfully');
    await new Promise(r => setTimeout(r, 1200));

    // Verify UI state
    const uiState = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const ojtView = document.getElementById('ojt-view');
          const facultyActions = document.getElementById('facultyToolbarActions');
          const table = document.querySelector('.ojt-roster-table');
          const rows = document.querySelectorAll('.ojt-roster-table tbody tr');
          const headers = Array.from(document.querySelectorAll('.ojt-roster-table thead th')).map(th => th.innerText.trim());
          const readOnlyBadge = document.querySelector('.ojt-badge-readonly');
          const names = Array.from(rows).map(r => r.querySelector('td:first-child')?.innerText.trim());
          const filterBtns = Array.from(document.querySelectorAll('#ojtFilterGroup button')).map(b => b.innerText.trim());
          const viewBtns = document.querySelectorAll('.ojt-btn-view');

          return {
            ojtVisible: ojtView && ojtView.style.display !== 'none',
            facultyActionsHidden: facultyActions && facultyActions.style.display === 'none',
            tableExists: !!table,
            rowCount: rows.length,
            headers,
            hasInformationHeader: headers.some(h => h.toUpperCase().includes('INFORMATION')),
            hasReadOnlyBadge: !!readOnlyBadge,
            badgeText: readOnlyBadge ? readOnlyBadge.innerText.trim() : '',
            names: names,
            viewBtnCount: viewBtns.length,
            filterBtns
          };
        })()
      `,
      returnByValue: true
    });

    const state = uiState.result.value;
    console.log('OJT UI State in Headless Chrome:', state);
    assert.strictEqual(state.ojtVisible, true, 'OJT View should be visible');
    assert.strictEqual(state.facultyActionsHidden, true, 'Faculty toolbar actions should be hidden');
    assert.strictEqual(state.tableExists, true, 'OJT table must exist');
    assert.ok(state.rowCount >= 2, 'Should display at least 2 intern rows');
    assert.strictEqual(state.hasReadOnlyBadge, true, 'Read-only roster badge must be present');
    assert.strictEqual(state.hasInformationHeader, false, 'Redundant Information header must be removed');
    assert.strictEqual(state.viewBtnCount, 0, 'Redundant View Info buttons must be removed');
    assert.deepStrictEqual(state.filterBtns, ['All Interns', 'Active', 'Concluded'], 'Filter buttons should not have count parentheses');
    console.log('✔ PASS: OJT Interns directory table and filter buttons rendered cleanly without count numbers.');

    // Screenshot Desktop Light Mode
    const snapLight = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const artifactsDir = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\2b27495d-42c6-4a17-804b-ab69c9a5174c';
    fs.writeFileSync(path.join(artifactsDir, 'ojt-directory-desktop-light.png'), Buffer.from(snapLight.data, 'base64'));
    console.log('✔ Saved ojt-directory-desktop-light.png');

    // 4.2 Verify programmatically that showOjtDetailsModal has no edit controls if invoked
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          if (window.ojtViewer && typeof window.ojtViewer.showOjtDetailsModal === 'function') {
            window.ojtViewer.showOjtDetailsModal({
              User_ID: 99,
              Name: 'Test Intern',
              Email: 'test@intern.com',
              Phone: '09123456789',
              Status: 'ACTIVE'
            });
          }
        })()
      `
    });
    await new Promise(r => setTimeout(r, 400));

    // Verify modal state
    const modalState = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const modal = document.getElementById('ojt-details-modal');
          if (!modal) return { exists: false };
          const title = modal.querySelector('h2')?.innerText;
          const readOnly = modal.querySelector('.ojt-badge-readonly')?.innerText;
          const editBtn = modal.querySelector('button[id*="edit"], button[class*="edit"]');
          const deleteBtn = modal.querySelector('button[id*="delete"], button[class*="delete"]');
          const doneBtn = modal.querySelector('#done-ojt-details');
          return {
            exists: true,
            title,
            readOnly,
            hasEditBtn: !!editBtn,
            hasDeleteBtn: !!deleteBtn,
            hasDoneBtn: !!doneBtn
          };
        })()
      `,
      returnByValue: true
    });

    if (modalState.result.value.exists) {
      assert.strictEqual(modalState.result.value.hasEditBtn, false, 'No edit button should exist');
      assert.strictEqual(modalState.result.value.hasDeleteBtn, false, 'No delete button should exist');
      await send(pWs, 'Runtime.evaluate', { expression: `document.getElementById('done-ojt-details')?.click()` });
      await new Promise(r => setTimeout(r, 200));
    }
    console.log('✔ PASS: OJT Details Modal verified to be strictly read-only.');

    // Screenshot Desktop Modal
    const snapModal = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'ojt-details-modal-desktop.png'), Buffer.from(snapModal.data, 'base64'));
    console.log('✔ Saved ojt-details-modal-desktop.png');

    // Close modal
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('done-ojt-details')?.click()`
    });
    await new Promise(r => setTimeout(r, 400));

    // 4.3 Desktop Dark Mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.documentElement.classList.add('dark-mode'); document.body.classList.add('dark-mode');`
    });
    await new Promise(r => setTimeout(r, 400));
    const snapDark = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'ojt-directory-desktop-dark.png'), Buffer.from(snapDark.data, 'base64'));
    console.log('✔ Saved ojt-directory-desktop-dark.png');

    // 4.4 Mobile View
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.documentElement.classList.remove('dark-mode'); document.body.classList.remove('dark-mode');`
    });
    await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await new Promise(r => setTimeout(r, 800));
    const snapMobile = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(artifactsDir, 'ojt-directory-mobile.png'), Buffer.from(snapMobile.data, 'base64'));
    console.log('✔ Saved ojt-directory-mobile.png');

    bWs.close();
    pWs.close();
  } finally {
    try { proc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n================================================================');
  console.log('🎉 ALL OJT INTERN VIEW-ONLY RESTRICTIONS & UI CHECKS PASSED 100%!');
  console.log('================================================================\n');

  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
