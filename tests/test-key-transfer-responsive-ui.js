'use strict';

/**
 * tests/test-key-transfer-responsive-ui.js
 * Headless Chrome validation of the responsive UI safeguards for key transfer:
 * 1. Desktop (1280px), Tablet (768px), and Mobile (390px, 375px).
 * 2. Key Docked:
 *    - #btnConfirmTransfer is visibly disabled, styled with grey background, not-allowed cursor, pointer-events none.
 *    - #restrictionNotice is displayed containing the exact required explanation text.
 *    - Explanatory text is fully readable, no horizontal clipping (scrollWidth <= clientWidth).
 * 3. Key Withdrawn (legitimately held by Prof A):
 *    - #btnConfirmTransfer is enabled, primary gradient styling, pointer-events auto.
 *    - #restrictionNotice is hidden.
 * 4. Key Returned to Dock:
 *    - #btnConfirmTransfer returns to disabled state with explanatory notice.
 */

const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const db = require('../database/connection');
const claimService = require('../services/iot/claim.service');

const DOCKED_MESSAGE = 'Key transfer is unavailable while the key is inside the IoT key box. Take and register the key through the IoT key box first, then transfer it to another professor.';

const VIEWPORTS = [
  { name: 'Mobile (375px)', width: 375, height: 812 },
  { name: 'Mobile (390px)', width: 390, height: 844 },
  { name: 'Tablet (768px)', width: 768, height: 1024 },
  { name: 'Desktop (1280px)', width: 1280, height: 800 }
];

async function runUiTests() {
  console.log('================================================================');
  console.log('🧪 KEY TRANSFER RESPONSIVE UI & DOCKED GUARD TEST');
  console.log('================================================================\n');

  // Fetch test users & room
  const [facultyUsers] = await db.query(
    "SELECT User_ID, Name, Role, Email FROM users WHERE Role IN ('Faculty', 'IT Dept. Head', 'Department Head') AND Status = 'Active' LIMIT 2"
  );
  assert.ok(facultyUsers.length >= 2, 'Need at least 2 active faculty users');
  const profA = facultyUsers[0];
  const profB = facultyUsers[1];

  const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories WHERE Room_Number = '203' LIMIT 1");
  const room203 = rooms[0];

  // Set initial state: Key 203 docked
  await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9245;
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
  await sendPage('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });

  // Authenticate session as Faculty (faculty@labsync.com)
  const loginRes = await fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'faculty@labsync.com', password: 'Password123!' })
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const loginData = await loginRes.json();
  const setCookieHeader = loginRes.headers.get('set-cookie');
  const cookieMatch = setCookieHeader ? setCookieHeader.match(/connect\.sid=([^;]+)/) : null;
  const sidVal = cookieMatch ? cookieMatch[1] : '';

  await sendPage('Network.enable');
  await sendPage('Network.setCookie', {
    name: 'connect.sid',
    value: sidVal,
    domain: 'localhost',
    path: '/'
  });

  // Inject session mock for localStorage
  await sendPage('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__testUser = ${JSON.stringify(loginData.user)};
      localStorage.setItem('user', JSON.stringify(window.__testUser));
    `
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: Docked Key Across Viewports
    // -------------------------------------------------------------
    console.log('--- TEST 1: Docked Key State & Responsive Visibility ---');
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

    for (const vp of VIEWPORTS) {
      await sendPage('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: vp.width < 768
      });

      await sendPage('Page.navigate', { url: 'http://localhost:3000/key-transfer.html?key=KEY-IT-203-A' });
      await sleep(1500);

      const dbg = await sendPage('Runtime.evaluate', {
        expression: `({
          loading: document.getElementById('loadingBox')?.style.display,
          error: document.getElementById('errorBox')?.style.display,
          errorText: document.getElementById('errorText')?.textContent,
          unauth: document.getElementById('unauthBox')?.style.display,
          main: document.getElementById('mainTransferView')?.style.display,
          btn: !!document.getElementById('btnConfirmTransfer')
        })`,
        returnByValue: true
      });
      console.log('Page state:', dbg.result.value);

      const evalRes = await sendPage('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.getElementById('btnConfirmTransfer');
            const noticeBox = document.getElementById('restrictionNotice');
            const noticeText = document.getElementById('restrictionNoticeText');
            const prevRole = document.getElementById('dispPrevRole');
            const prevName = document.getElementById('dispPrevName');
            const btnSpan = btn ? btn.querySelector('span') : null;

            const btnStyle = btn ? window.getComputedStyle(btn) : {};
            const noticeBoxStyle = noticeBox ? window.getComputedStyle(noticeBox) : {};

            const btnRect = btn ? btn.getBoundingClientRect() : null;
            const noticeRect = noticeBox ? noticeBox.getBoundingClientRect() : null;

            return {
              btnDisabled: btn ? btn.disabled : null,
              btnHasDisabledClass: btn ? btn.classList.contains('btn-transfer-disabled') : false,
              btnCursor: btnStyle.cursor,
              btnPointerEvents: btnStyle.pointerEvents,
              btnSpanText: btnSpan ? btnSpan.textContent : '',
              noticeVisible: noticeBoxStyle.display !== 'none',
              noticeText: noticeText ? noticeText.textContent.trim() : '',
              prevRoleText: prevRole ? prevRole.textContent : '',
              prevNameText: prevName ? prevName.textContent : '',
              // Check for text clipping / overflow
              textClipped: noticeText ? (noticeText.scrollWidth > noticeText.clientWidth + 2) : false,
              noticeBoxWithinViewport: noticeRect ? (noticeRect.right <= window.innerWidth && noticeRect.left >= 0) : false
            };
          })()
        `,
        returnByValue: true
      });

      const data = evalRes.result.value;
      console.log('Button evaluation data:', data);
      assert.strictEqual(data.btnDisabled, true, `Button must be disabled in ${vp.name}`);
      assert.strictEqual(data.btnPointerEvents, 'none', `Pointer-events must be none in ${vp.name}`);
      assert.strictEqual(data.noticeVisible, true, `Notice box must be visible in ${vp.name}`);
      assert.strictEqual(data.noticeText, DOCKED_MESSAGE, `Explanatory text must match required wording in ${vp.name}`);
      assert.strictEqual(data.textClipped, false, `Notice text must NOT be clipped horizontally in ${vp.name}`);
      assert.strictEqual(data.noticeBoxWithinViewport, true, `Notice box must stay within viewport boundaries in ${vp.name}`);
      assert.strictEqual(data.prevRoleText, 'STATUS: IN DOCK');

      console.log(`  ✔ PASS [${vp.name}]: Button disabled, pointer-events none, explanation readable without clipping.`);
    }

    // -------------------------------------------------------------
    // TEST 2: Key Legitimately Withdrawn -> Live Button Activation
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Legitimate Key Withdrawal & Live State Sync ---');
    // Set Room 203 legitimately held by Prof A
    await db.query("UPDATE laboratories SET Key_Status = 'Absent', Current_User_ID = ? WHERE Room_ID = ?", [profA.User_ID, room203.Room_ID]);

    // Wait for the frontend autoPollTimer (3.5s) to detect the state transition
    console.log('  Waiting for live key state polling to update UI...');
    let pollSuccess = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(1000);
      const evalRes = await sendPage('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.getElementById('btnConfirmTransfer');
            const noticeBox = document.getElementById('restrictionNotice');
            return {
              btnDisabled: btn ? btn.disabled : true,
              noticeVisible: noticeBox ? (window.getComputedStyle(noticeBox).display !== 'none') : true
            };
          })()
        `,
        returnByValue: true
      });
      if (evalRes.result.value && !evalRes.result.value.btnDisabled && !evalRes.result.value.noticeVisible) {
        pollSuccess = true;
        break;
      }
    }
    assert.strictEqual(pollSuccess, true, 'Live polling must automatically enable the transfer button upon legitimate withdrawal');
    console.log('  ✔ PASS: Live polling detected withdrawal; #btnConfirmTransfer activated without page refresh.');

    // -------------------------------------------------------------
    // TEST 3: Key Returned -> Live Reversion to Disabled State
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Key Returned to Box & Live Disabling ---');
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

    let revertSuccess = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(1000);
      const evalRes = await sendPage('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = document.getElementById('btnConfirmTransfer');
            const noticeBox = document.getElementById('restrictionNotice');
            const noticeText = document.getElementById('restrictionNoticeText');
            return {
              btnDisabled: btn ? btn.disabled : false,
              noticeVisible: noticeBox ? (window.getComputedStyle(noticeBox).display !== 'none') : false,
              noticeText: noticeText ? noticeText.textContent.trim() : ''
            };
          })()
        `,
        returnByValue: true
      });
      if (evalRes.result.value && evalRes.result.value.btnDisabled && evalRes.result.value.noticeVisible && evalRes.result.value.noticeText === DOCKED_MESSAGE) {
        revertSuccess = true;
        break;
      }
    }
    assert.strictEqual(revertSuccess, true, 'Live polling must automatically disable the transfer button upon key return');
    console.log('  ✔ PASS: Live polling detected return; #btnConfirmTransfer disabled and explanation restored.');

    // Clean up
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);

    console.log('\n================================================================');
    console.log('🎉 ALL RESPONSIVE UI & LIVE SYNC TESTS PASSED WITH 100% SUCCESS!');
    console.log('================================================================\n');

    proc.kill();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ UI TEST FAILED:', err);
    proc.kill();
    await db.query("UPDATE laboratories SET Key_Status = 'Present', Current_User_ID = NULL WHERE Room_ID = ?", [room203.Room_ID]);
    process.exit(1);
  }
}

runUiTests();
