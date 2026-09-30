const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function testThemes() {
  console.log('--- Capturing Policies Modal in Light & Dark Modes ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9593;
  const tempProfile = path.join(__dirname, 'temp-chrome-themes-' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    'about:blank'
  ]);

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
    await send(pWs, 'Runtime.enable');

    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    const url = 'http://localhost:3000/login.html';
    await send(pWs, 'Page.navigate', { url });
    await new Promise(r => setTimeout(r, 1500));

    // 1. Open modal in Light Mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesLink').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    // Verify closePoliciesActionBtn is NOT in the DOM
    const checkBtn = await send(pWs, 'Runtime.evaluate', {
      expression: `!document.getElementById('closePoliciesActionBtn')`,
      returnByValue: true
    });
    if (!checkBtn.result.value) {
      throw new Error('closePoliciesActionBtn should be removed from DOM');
    }

    const capLight = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outLight = path.join(__dirname, 'policies-modal-light.png');
    fs.writeFileSync(outLight, Buffer.from(capLight.data, 'base64'));
    console.log('✔ Saved light mode screenshot to', outLight);

    // 2. Switch to Dark Mode (high-contrast / dark-mode)
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        document.documentElement.classList.add('high-contrast');
        localStorage.setItem('labsync-high-contrast', 'true');
        const modal = document.getElementById('policiesModal');
        // Reset scroll position
        const card = modal.querySelector('.policies-modal-card');
        if (card) card.scrollTop = 0;
      })()`
    });
    await new Promise(r => setTimeout(r, 400));

    const capDark = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outDark = path.join(__dirname, 'policies-modal-dark.png');
    fs.writeFileSync(outDark, Buffer.from(capDark.data, 'base64'));
    console.log('✔ Saved dark mode screenshot to', outDark);

    // 3. Close modal via top-right x button
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('closePoliciesModalBtn').click()`
    });
    await new Promise(r => setTimeout(r, 300));

    const isClosed = await send(pWs, 'Runtime.evaluate', {
      expression: `!document.getElementById('policiesModal').classList.contains('active')`,
      returnByValue: true
    });
    if (!isClosed.result.value) {
      throw new Error('Modal did not close via top-right x button');
    }
    console.log('✔ Verified: Top-right x button successfully closes the modal');

    console.log('\n🎉 ALL POLICIES MODAL THEME TESTS PASSED!');
    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

testThemes().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
