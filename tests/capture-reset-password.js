const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9570;
  const tempProfile = path.join(__dirname, 'temp-chrome-reset-' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1000));
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
    await send(pWs, 'Runtime.enable');

    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/reset-password.html' });
    await new Promise(r => setTimeout(r, 1500));

    // Force show formState for visual inspection
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('errorState').style.display = 'none';
        document.getElementById('formState').style.display = 'flex';
        document.documentElement.classList.add('high-contrast');
      `
    });
    await new Promise(r => setTimeout(r, 300));

    const snap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const artifactDir = path.join('C:', 'Users', 'andre', '.gemini', 'antigravity-ide', 'brain', '9320f511-2c63-4a96-a592-4a9976ae1bca');
    const outPath = path.join(artifactDir, 'reset-password-after.png');
    fs.writeFileSync(outPath, Buffer.from(snap.data, 'base64'));
    console.log('Saved after screenshot to', outPath);

    // Mobile view (390 x 844)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 300));
    const snapMobile = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outMobilePath = path.join(artifactDir, 'reset-password-after-mobile.png');
    fs.writeFileSync(outMobilePath, Buffer.from(snapMobile.data, 'base64'));
    console.log('Saved mobile screenshot to', outMobilePath);

  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    try {
      chromeProc.kill();
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

run();
