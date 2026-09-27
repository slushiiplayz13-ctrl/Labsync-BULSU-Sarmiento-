'use strict';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function test() {
  const port = 9256;
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

    await send('Runtime.evaluate', {
      expression: `
        (() => {
          const col = document.querySelector('.grid-day-column[data-day="Monday"]');
          const card = window.scheduleCardRenderer.createGridCard(101, 'CAP 401W - Capstone Project 2', 'Andrei Gabito', '2C-2', '08:00 AM', '09:30 AM', 'Default');
          col.appendChild(card);
          window.scheduleEditorController.openCardDetailModal(card);
        })()
      `
    });
    await new Promise(r => setTimeout(r, 500));

    const ss = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b\\clean-card-modal-mobile.png';
    fs.writeFileSync(outPath, Buffer.from(ss.data, 'base64'));
    console.log('Saved clean-card-modal-mobile.png');
  } finally {
    chrome.kill();
  }
}
test();
