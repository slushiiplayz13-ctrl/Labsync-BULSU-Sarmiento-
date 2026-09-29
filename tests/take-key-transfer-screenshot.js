const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function snap() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9561;
  const tempProfile = path.join(__dirname, 'temp-chrome-kt-' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    'about:blank'
  ]);

  const db = require('../database/connection');
  const [uRows] = await db.query('SELECT Profile_Photo FROM users WHERE User_ID = 1');
  const userPhoto = (uRows[0] && uRows[0].Profile_Photo) || null;

  try {
    await new Promise(r => setTimeout(r, 1200));
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    const data = await res.json();
    const bWs = new WebSocket(data.webSocketDebuggerUrl);
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

    // Intercept /api/keys/transfer-info/ to provide realistic mock data with actual photo
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        const origFetch = window.fetch;
        const actualUserPhoto = ${JSON.stringify(userPhoto)};
        window.fetch = async function(url, options) {
          if (typeof url === 'string' && url.includes('/api/keys/transfer-info/')) {
            return new Response(JSON.stringify({
              keyCode: 'KEY-IT-203-A',
              roomId: 1,
              roomNumber: '203',
              building: 'Bldg. E',
              keyStatus: 'ACTIVE',
              roomKeyStatus: 'Absent',
              currentHolder: null,
              currentUser: {
                id: 1,
                name: 'Andrei Gabito',
                role: 'IT Dept. Head',
                profilePhoto: actualUserPhoto
              },
              canTransfer: true,
              cannotTransferReason: null
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          if (typeof url === 'string' && url.includes('/api/user/current')) {
            return new Response(JSON.stringify({
              user: {
                id: 1,
                name: 'Andrei Gabito',
                role: 'IT Dept. Head',
                profilePhoto: actualUserPhoto
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          if (typeof url === 'string' && url.includes('/api/keys/transfer')) {
            return new Response(JSON.stringify({
              success: true,
              message: 'Key transferred successfully',
              transfer: {
                keyCode: 'KEY-IT-203-A',
                roomNumber: '203',
                previousHolder: 'Prof. Juan Dela Cruz',
                newHolder: 'Prof. Maria Santos',
                transferredAt: new Date().toISOString()
              }
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return origFetch.apply(this, arguments);
        };
      `
    });

    // 1. Mobile Screenshot (390 x 844)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await send(pWs, 'Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/key-transfer.html?key=KEY-IT-203-A' });
    await new Promise(r => setTimeout(r, 1500));

    const mobileSnap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const mobileOut = path.join(__dirname, 'mobile-key-transfer-new.png');
    fs.writeFileSync(mobileOut, Buffer.from(mobileSnap.data, 'base64'));
    console.log('✓ Mobile key transfer screenshot saved to:', mobileOut);

    // 2. Mobile Success View Screenshot
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btnConfirmTransfer').click();`
    });
    await new Promise(r => setTimeout(r, 800));

    const successSnap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const successOut = path.join(__dirname, 'mobile-key-transfer-success.png');
    fs.writeFileSync(successOut, Buffer.from(successSnap.data, 'base64'));
    console.log('✓ Mobile key transfer success screenshot saved to:', successOut);

    // 3. Desktop Screenshot (1280 x 800)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/key-transfer.html?key=KEY-IT-203-A' });
    await new Promise(r => setTimeout(r, 1200));

    const deskSnap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const deskOut = path.join(__dirname, 'desktop-key-transfer-new.png');
    fs.writeFileSync(deskOut, Buffer.from(deskSnap.data, 'base64'));
    console.log('✓ Desktop key transfer screenshot saved to:', deskOut);

    pWs.close();
    bWs.close();
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

snap().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
