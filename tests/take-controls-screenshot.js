const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function snap() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9557;
  const tempProfile = path.join(__dirname, 'temp-chrome-snap');
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
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
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
              if (url.includes('/api/reports')) {
                return new Response(JSON.stringify([]), {
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

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/it-head-pc-reports.html' });
    await new Promise(r => setTimeout(r, 1400));

    await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const mockReports = [
            { ReportID: 'REP-01', Status: 'RESOLVED', AssetName: 'Room 333 – PC 1', IssueDetails: 'Keyboard issue' },
            { ReportID: 'REP-02', Status: 'RESOLVED', AssetName: 'Room 333 – PC 2', IssueDetails: 'OS issue' },
            { ReportID: 'REP-03', Status: 'PENDING', AssetName: 'Room 334 – PC 5', IssueDetails: 'Mouse issue' }
          ];
          if (window.reportController) {
            window.reportController.renderReports(mockReports);
          }
        })()
      `
    });

    // 390px mobile snapshot
    await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send(pWs, 'Runtime.evaluate', { expression: 'window.dispatchEvent(new Event("resize"));' });
    await new Promise(r => setTimeout(r, 400));

    // Capture clip of controls area
    const clip390 = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const c = document.querySelector('.reports-controls');
          const r = c.getBoundingClientRect();
          return { x: 0, y: Math.max(0, r.top - 10), width: 390, height: r.height + 20, scale: 2 };
        })()
      `,
      returnByValue: true
    });

    const snapMobile = await send(pWs, 'Page.captureScreenshot', { format: 'png', clip: clip390.result.value });
    fs.writeFileSync(path.join(__dirname, 'pc-reports-controls-mobile-390.png'), Buffer.from(snapMobile.data, 'base64'));

    // 320px ultra narrow mobile snapshot
    await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: 320, height: 600, deviceScaleFactor: 2, mobile: true });
    await send(pWs, 'Runtime.evaluate', { expression: 'window.dispatchEvent(new Event("resize"));' });
    await new Promise(r => setTimeout(r, 400));

    const clip320 = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const c = document.querySelector('.reports-controls');
          const r = c.getBoundingClientRect();
          return { x: 0, y: Math.max(0, r.top - 10), width: 320, height: r.height + 20, scale: 2 };
        })()
      `,
      returnByValue: true
    });

    const snapNarrow = await send(pWs, 'Page.captureScreenshot', { format: 'png', clip: clip320.result.value });
    fs.writeFileSync(path.join(__dirname, 'pc-reports-controls-narrow-320.png'), Buffer.from(snapNarrow.data, 'base64'));

    pWs.close();
    bWs.close();
    console.log('Screenshots saved successfully!');
  } finally {
    chromeProc.kill();
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

snap().catch(e => console.error(e));
