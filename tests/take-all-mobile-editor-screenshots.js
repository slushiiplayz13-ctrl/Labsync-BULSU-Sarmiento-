const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b';

async function captureAll() {
  const port = 9230;
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

  function sendBrowser(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = bMsgId++;
      bPending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const target = await sendBrowser('Target.createTarget', { url: 'about:blank' });
  const pWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
  await new Promise(r => pWs.onopen = r);

  let msgId = 1;
  const pending = new Map();
  pWs.onmessage = (event) => {
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
      pWs.send(JSON.stringify({ id, method, params }));
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
                  Start_Time: '08:30:00',
                  End_Time: '10:30:00',
                  Color_Theme: 'Teal'
                },
                {
                  Schedule_ID: 102,
                  Subject_Name: 'CS 101 - Intro to Computing',
                  Professor_Name: 'Dr. Ada Lovelace',
                  Section: '1A-1',
                  Day_of_Week: 'Monday',
                  Start_Time: '11:00:00',
                  End_Time: '13:00:00',
                  Color_Theme: 'Indigo'
                },
                {
                  Schedule_ID: 103,
                  Subject_Name: 'WEB 301 - Web Systems',
                  Professor_Name: 'Prof. Tim Berners-Lee',
                  Section: '3A-1',
                  Day_of_Week: 'Tuesday',
                  Start_Time: '09:00:00',
                  End_Time: '11:30:00',
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
  await new Promise(r => setTimeout(r, 2200));

  // 1. Switch to Monday to see placed schedule cards
  await send('Runtime.evaluate', {
    expression: `(() => {
      const monTab = document.querySelector('.mobile-day-tabs .day-tab[data-day="Monday"]');
      if (monTab) monTab.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  let outPath = path.join(ARTIFACT_DIR, 'room-editor-mobile-monday.png');
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('Saved Monday timetable to:', outPath);

  // 2. Click a card to open the quick actions modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const firstCard = document.querySelector('.grid-card');
      if (firstCard) firstCard.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  outPath = path.join(ARTIFACT_DIR, 'room-editor-mobile-card-modal.png');
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('Saved Card Modal to:', outPath);

  // Close modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.getElementById('card-modal-close');
      if (closeBtn) closeBtn.click();
      else if (window.closeCardDetailModal) window.closeCardDetailModal();
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  // 3. Click [+ New Block] to open create block drawer
  await send('Runtime.evaluate', {
    expression: `(() => {
      const createBtn = document.getElementById('mobile-dock-create-btn');
      if (createBtn) createBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  outPath = path.join(ARTIFACT_DIR, 'room-editor-mobile-create-sheet.png');
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('Saved Create Block Drawer to:', outPath);

  // Close drawer
  await send('Runtime.evaluate', {
    expression: `(() => {
      if (window.mobileScheduleEditor) window.mobileScheduleEditor.closeSheet();
    })()`
  });
  await new Promise(r => setTimeout(r, 400));

  // 4. Test Tap-To-Place bar appearance
  await send('Runtime.evaluate', {
    expression: `(() => {
      if (window.tapToPlaceEngine) {
        window.tapToPlaceEngine.startPlacingFromTray({
          id: 'test-block-1',
          subject: 'IT 301 - Operating Systems',
          professor: 'Dr. Linus Torvalds',
          section: '3A-1',
          color: 'Rose'
        });
      }
    })()`
  });
  await new Promise(r => setTimeout(r, 600));

  shot = await send('Page.captureScreenshot', { format: 'png' });
  outPath = path.join(ARTIFACT_DIR, 'room-editor-mobile-placement-mode.png');
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('Saved Placement Mode to:', outPath);

  pWs.close();
  ws.close();
  chrome.kill();
  console.log('All mobile screenshots generated successfully!');
}

captureAll().catch(err => {
  console.error(err);
  process.exit(1);
});
