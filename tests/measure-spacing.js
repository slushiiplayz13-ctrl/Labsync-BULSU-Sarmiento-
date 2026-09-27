'use strict';

const { spawn } = require('child_process');
const http = require('http');

async function check() {
  const port = 9254;
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

  try {
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
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
    await new Promise(r => setTimeout(r, 2000));

    const metrics = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const header = document.querySelector('.schedule-editor-header');
          const sehLeft = document.querySelector('.seh-left');
          const sehActions = document.querySelector('.seh-actions');
          const sehActionsParent = sehActions ? sehActions.parentElement : null;
          const printBtn = document.getElementById('print-schedule-btn');
          const saveBtn = document.getElementById('save-schedule-btn');
          const layoutContainer = document.querySelector('.editor-layout-container');
          const scheduleCard = document.querySelector('.editor-schedule-card');
          const schedHeader = document.querySelector('.schedule-header');
          const pageContent = document.querySelector('.page-content');

          function getBox(el) {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const s = window.getComputedStyle(el);
            return {
              left: r.left,
              right: r.right,
              width: r.width,
              top: r.top,
              bottom: r.bottom,
              height: r.height,
              marginTop: s.marginTop,
              marginBottom: s.marginBottom,
              paddingTop: s.paddingTop,
              paddingBottom: s.paddingBottom,
              gap: s.gap
            };
          }

          const dock = document.getElementById('mobile-editor-dock');
          const sidebar = document.querySelector('.sidebar');

          return {
            dock: getBox(dock),
            sidebar: getBox(sidebar),
            dockOverlapSidebar: dock && sidebar ? (dock.getBoundingClientRect().bottom - sidebar.getBoundingClientRect().top) : null
          };
        })()
      `,
      returnByValue: true
    });
    console.log(JSON.stringify(metrics.result.value, null, 2));

    const fs = require('fs');
    const ss = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 700, width: 390, height: 144, scale: 2 }
    });
    fs.writeFileSync('C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b\\dock-spacing-current.png', Buffer.from(ss.data, 'base64'));
  } finally {
    chrome.kill();
  }
}
check();
