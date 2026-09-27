const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9565;
  const tempProfile = path.join(__dirname, 'temp-chrome-mis-help-' + Date.now());
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

    // Emulate MIS Staff user
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const userObj = { role: 'MIS Staff', name: 'MIS Test Officer', email: 'mis@bulsu.edu.ph' };
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
            }
            return origFetch.apply(this, [url, ...args]);
          };
        } catch(e) {}
      `
    });

    // Desktop viewport (1200 x 900)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/mis-staff-dashboard.html' });
    await new Promise(r => setTimeout(r, 2000));

    // Open Help Modal
    const openRes = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (async () => {
          if (typeof window.openHelpModal === 'function') {
            await window.openHelpModal();
            return { opened: true, count: document.querySelectorAll('#help-modal').length };
          }
          return { opened: false };
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log('Open Help Modal Result:', openRes.result.value);
    await new Promise(r => setTimeout(r, 600));

    const artifactDir = path.join('C:', 'Users', 'andre', '.gemini', 'antigravity-ide', 'brain', '9320f511-2c63-4a96-a592-4a9976ae1bca');

    // Capture Desktop Light Mode Top
    const snapDesktopLight = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outDesktopLight = path.join(artifactDir, 'mis-help-modal-desktop-light.png');
    fs.writeFileSync(outDesktopLight, Buffer.from(snapDesktopLight.data, 'base64'));
    console.log('Saved desktop light screenshot to', outDesktopLight);

    // Scroll to Key Features in Light Mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        const b = document.querySelector('.help-modal-body');
        if (b) b.scrollTop = 420;
      `
    });
    await new Promise(r => setTimeout(r, 400));
    const snapDesktopLightFeatures = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outDesktopLightFeatures = path.join(artifactDir, 'mis-help-modal-desktop-light-features.png');
    fs.writeFileSync(outDesktopLightFeatures, Buffer.from(snapDesktopLightFeatures.data, 'base64'));
    console.log('Saved desktop light features screenshot to', outDesktopLightFeatures);

    // Switch to Dark Mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
      `
    });
    await new Promise(r => setTimeout(r, 400));

    const snapDesktopDarkFeatures = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outDesktopDarkFeatures = path.join(artifactDir, 'mis-help-modal-desktop-dark-features.png');
    fs.writeFileSync(outDesktopDarkFeatures, Buffer.from(snapDesktopDarkFeatures.data, 'base64'));
    console.log('Saved desktop dark features screenshot to', outDesktopDarkFeatures);

    // Mobile Viewport (390 x 844) Scrolled to Key Features
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });
    const scrollInfo = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (() => {
          const b = document.querySelector('.help-modal-body');
          if (b) {
            b.scrollTop = 1250;
            return { scrollHeight: b.scrollHeight, clientHeight: b.clientHeight, scrollTop: b.scrollTop };
          }
          return null;
        })()
      `,
      returnByValue: true
    });
    console.log('Mobile Scroll Info:', scrollInfo.result.value);
    await new Promise(r => setTimeout(r, 400));

    const snapMobileDarkFeatures = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outMobileDarkFeatures = path.join(artifactDir, 'mis-help-modal-mobile-dark-features.png');
    fs.writeFileSync(outMobileDarkFeatures, Buffer.from(snapMobileDarkFeatures.data, 'base64'));
    console.log('Saved mobile dark features screenshot to', outMobileDarkFeatures);

    // Mobile Light Mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        document.documentElement.setAttribute('data-theme', 'light');
      `
    });
    await new Promise(r => setTimeout(r, 400));

    const snapMobileLight = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outMobileLight = path.join(artifactDir, 'mis-help-modal-mobile-light.png');
    fs.writeFileSync(outMobileLight, Buffer.from(snapMobileLight.data, 'base64'));
    console.log('Saved mobile light screenshot to', outMobileLight);

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
