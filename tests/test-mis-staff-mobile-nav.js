const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9581;
  const tempProfile = path.join(__dirname, 'temp-chrome-staff-nav-' + Date.now());
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

    // Emulate regular MIS Staff user session
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const userObj = { role: 'MIS Staff', name: 'John Doe', email: 'staff@bulsu.edu.ph', department: 'MIS' };
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

    // Mobile Viewport (390 x 844)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/mis-staff-dashboard.html' });
    await new Promise(r => setTimeout(r, 2000));

    // Poll until navigation loads and sidebar buttons render
    let navButtons = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      navButtons = await send(pWs, 'Runtime.evaluate', {
        expression: `
          (() => {
            const buttons = Array.from(document.querySelectorAll('.sidebar-nav .sidebar-btn'));
            if (buttons.length === 0) return null;
            return buttons.map(b => {
              const style = window.getComputedStyle(b);
              const tooltip = b.getAttribute('data-tooltip') || b.getAttribute('title') || b.getAttribute('aria-label') || '';
              const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && b.offsetWidth > 0 && b.offsetHeight > 0;
              return {
                tooltip,
                display: style.display,
                isVisible,
                rect: { width: b.offsetWidth, height: b.offsetHeight }
              };
            });
          })()
        `,
        returnByValue: true
      });
      if (navButtons && navButtons.result && navButtons.result.value) {
        break;
      }
      await new Promise(r => setTimeout(r, 250));
    }

    const evalResult = (navButtons && navButtons.result && navButtons.result.value) || [];
    console.log('Regular Staff Nav Buttons Evaluation:', JSON.stringify(evalResult, null, 2));

    const visibleCount = evalResult.filter(b => b.isVisible).length;
    console.log(`Visible buttons count for Staff: ${visibleCount} (expected 5)`);
    assert.strictEqual(visibleCount, 5, 'Staff should see all 5 buttons');

  } catch (err) {
    console.error('Error in test:', err);
    process.exitCode = 1;
  } finally {
    try {
      chromeProc.kill();
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (e) {}
  }
}

run();
