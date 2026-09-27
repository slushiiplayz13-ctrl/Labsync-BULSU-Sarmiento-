const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function capture() {
  const port = 9228;
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

  const wsUrl = listRes.webSocketDebuggerUrl;
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
  const pageWsUrl = `ws://127.0.0.1:${port}/devtools/page/${newTarget.targetId}`;

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
            if (url.includes('/api/schedules/room/')) {
              return new Response(JSON.stringify([
                {
                  Schedule_ID: 101,
                  Subject_Name: 'IT 201 - Data Structures',
                  Professor_Name: 'Prof. Alan Turing',
                  Section: '2A-1',
                  Day_of_Week: 'Monday',
                  Start_Time: '09:00:00',
                  End_Time: '11:00:00',
                  Color_Theme: 'Teal'
                },
                {
                  Schedule_ID: 102,
                  Subject_Name: 'CS 101 - Intro to Computing',
                  Professor_Name: 'Dr. Ada Lovelace',
                  Section: '1A-1',
                  Day_of_Week: 'Monday',
                  Start_Time: '13:00:00',
                  End_Time: '15:00:00',
                  Color_Theme: 'Indigo'
                },
                {
                  Schedule_ID: 103,
                  Subject_Name: 'WEB 301 - Web Systems',
                  Professor_Name: 'Prof. Tim Berners-Lee',
                  Section: '3A-1',
                  Day_of_Week: 'Tuesday',
                  Start_Time: '10:00:00',
                  End_Time: '12:00:00',
                  Color_Theme: 'Amber'
                }
              ]), {
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

  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true
  });

  await send('Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
  await new Promise(r => setTimeout(r, 2000));

  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  const outPath = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b\\room-editor-mobile-390.png';
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, 'base64'));
  console.log('Saved screenshot to:', outPath);

  ws.close();
  browserWs.close();
  chrome.kill();
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
