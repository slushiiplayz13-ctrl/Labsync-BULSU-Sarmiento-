'use strict';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function testUnblurredSheet() {
  console.log('🧪 Verifying mobile bottom sheet is unblurred and crisp on open...');
  const port = 9252;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));

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

  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      const userObj = { role: 'IT Department Head', name: 'Admin Test', email: 'ithead@test.com' };
      localStorage.setItem('user', JSON.stringify(userObj));
      localStorage.setItem('labsync_last_activity', Date.now().toString());
      sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
      window.fetch = async (url) => {
        if (url.includes('/api/user/current')) return new Response(JSON.stringify({ user: userObj }));
        if (url.includes('/api/schedules/room/')) return new Response(JSON.stringify([]));
        return new Response(JSON.stringify({}));
      };
    `
  });

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  await send('Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
  await new Promise(r => setTimeout(r, 2200));

  // 1. Click "+ New Block" to open create block drawer
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('mobile-dock-create-btn').click();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  const createBlockCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const panel = document.getElementById('create-block-panel');
      const backdrop = document.getElementById('mobile-sheet-backdrop');
      const r = panel.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + 60);

      return {
        isOpen: panel.classList.contains('mobile-sheet-open'),
        isBackdropActive: backdrop.classList.contains('active'),
        panelZIndex: parseInt(window.getComputedStyle(panel).zIndex),
        backdropZIndex: parseInt(window.getComputedStyle(backdrop).zIndex),
        topElTag: topEl ? topEl.tagName : null,
        topElClass: topEl ? topEl.className : null,
        topElId: topEl ? topEl.id : null,
        isInsidePanel: panel.contains(topEl),
        isNotBackdrop: topEl !== backdrop
      };
    })()`,
    returnByValue: true
  });

  const res1 = createBlockCheck.result.value;
  console.log('Create Block Sheet Verification:', res1);

  assert(res1.isOpen, 'Panel is open');
  assert(res1.isBackdropActive, 'Backdrop is active');
  assert(res1.panelZIndex > res1.backdropZIndex, 'Panel zIndex > backdrop zIndex');
  assert(res1.isInsidePanel, 'Top element at drawer coordinates is INSIDE panel, NOT backdrop');
  assert(res1.isNotBackdrop, 'Top element is NOT the backdrop');
  console.log('  ✅ PASS: Create Block sheet is completely in front of backdrop (not blurred)');

  // Take screenshot of Create Block sheet
  const outDir = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b';
  const shot1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'fixed-create-sheet-mobile.png'), Buffer.from(shot1.data, 'base64'));
  console.log('  📸 Saved fixed-create-sheet-mobile.png');

  // 2. Switch to Blocks tab
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelector('.mobile-sheet-tab[data-tab="blocks"]').click();
    })()`
  });
  await new Promise(r => setTimeout(r, 200));

  const blocksCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const panel = document.getElementById('create-block-panel');
      const backdrop = document.getElementById('mobile-sheet-backdrop');
      const r = panel.getBoundingClientRect();
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + 60);

      return {
        isOpen: panel.classList.contains('mobile-sheet-open'),
        activeTab: document.querySelector('.mobile-sheet-tab.active').dataset.tab,
        isInsidePanel: panel.contains(topEl),
        isNotBackdrop: topEl !== backdrop
      };
    })()`,
    returnByValue: true
  });

  const res2 = blocksCheck.result.value;
  console.log('Blocks Sheet Verification:', res2);
  assert(res2.activeTab === 'blocks', 'Active tab is blocks');
  assert(res2.isInsidePanel, 'Top element at drawer coordinates is INSIDE panel');
  assert(res2.isNotBackdrop, 'Top element is NOT the backdrop');
  console.log('  ✅ PASS: Blocks tab sheet is completely in front of backdrop (not blurred)');

  // Take screenshot of Blocks sheet
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, 'fixed-blocks-sheet-mobile.png'), Buffer.from(shot2.data, 'base64'));
  // 3. Close the sheet via backdrop click
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('mobile-sheet-backdrop').click();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));

  const closeCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const panel = document.getElementById('create-block-panel');
      const backdrop = document.getElementById('mobile-sheet-backdrop');
      const dock = document.getElementById('mobile-editor-dock');
      const container = document.querySelector('.editor-layout-container');

      return {
        isClosed: !panel.classList.contains('mobile-sheet-open'),
        isBackdropInactive: !backdrop.classList.contains('active'),
        dockVisible: window.getComputedStyle(dock).display !== 'none',
        isRestoredToContainer: panel.parentElement === container
      };
    })()`,
    returnByValue: true
  });

  const res3 = closeCheck.result.value;
  console.log('Close Sheet Verification:', res3);
  assert(res3.isClosed, 'Panel is closed');
  assert(res3.isBackdropInactive, 'Backdrop is inactive');
  assert(res3.dockVisible, 'Floating dock is restored');
  assert(res3.isRestoredToContainer, 'Panel is restored to .editor-layout-container');
  console.log('  ✅ PASS: Sheet closed cleanly and restored to .editor-layout-container');

  pWs.close();
  ws.close();
  chrome.kill();
  console.log('\n🎉 ALL MOBILE SHEET UNBLURRED TESTS PASSED!');
}

testUnblurredSheet().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
