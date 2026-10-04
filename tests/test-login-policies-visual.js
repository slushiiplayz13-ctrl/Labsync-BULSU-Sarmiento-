const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function testLoginPoliciesVisual() {
  console.log('--- Testing Login Policies Modal in Headless Chrome ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping visual test');
    return;
  }

  const port = 9594;
  const tempProfile = path.join(__dirname, 'temp-chrome-login-policies-' + Date.now());
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
      width: 1280,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    const url = 'http://localhost:3000/login.html';
    console.log('Navigating to', url);
    await send(pWs, 'Page.navigate', { url });
    await new Promise(r => setTimeout(r, 1500));

    // Evaluate initial state
    let state = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const link = document.getElementById('policiesLink');
        const modal = document.getElementById('policiesModal');
        return {
          hasLink: !!link,
          hasModal: !!modal,
          isActive: modal ? modal.classList.contains('active') : false
        };
      })()`,
      returnByValue: true
    });
    console.log('Initial state:', state.result.value);

    // Click policiesLink
    console.log('Clicking #policiesLink...');
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesLink').click()`
    });
    await new Promise(r => setTimeout(r, 600));

    // Check modal active
    state = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const modal = document.getElementById('policiesModal');
        const title = document.getElementById('policiesModalTitle');
        return {
          isActive: modal ? modal.classList.contains('active') : false,
          titleText: title ? title.textContent : null,
          cardsCount: modal ? modal.querySelectorAll('.policy-highlight-card').length : 0
        };
      })()`,
      returnByValue: true
    });
    console.log('After clicking policiesLink:', state.result.value);

    if (!state.result.value.isActive) {
      throw new Error('Modal is not active after clicking policiesLink');
    }

    // Capture screenshot of open modal
    const cap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outPath = path.join(__dirname, 'login-policies-modal.png');
    fs.writeFileSync(outPath, Buffer.from(cap.data, 'base64'));
    console.log('✔ Screenshot saved to', outPath);

    // Test close button
    console.log('Clicking close button...');
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('closePoliciesModalBtn').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    state = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesModal').classList.contains('active')`,
      returnByValue: true
    });
    console.log('After close button, isActive:', state.result.value);
    if (state.result.value !== false) {
      throw new Error('Modal did not close on close button click');
    }

    // Test that footerPoliciesLink is removed (single Policies button in header)
    const hasFooterLink = await send(pWs, 'Runtime.evaluate', {
      expression: `!!document.getElementById('footerPoliciesLink')`,
      returnByValue: true
    });
    console.log('footerPoliciesLink exists:', hasFooterLink.result.value);
    if (hasFooterLink.result.value !== false) {
      throw new Error('footerPoliciesLink should be removed from login card footer');
    }

    // Capture clean login page screenshot (with only 1 Policies button in header)
    const cleanCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const cleanOutPath = path.join(__dirname, 'login-single-policies-clean.png');
    fs.writeFileSync(cleanOutPath, Buffer.from(cleanCap.data, 'base64'));
    console.log('✔ Clean login screenshot saved to', cleanOutPath);

    // Verify closePoliciesActionBtn remains absent from the DOM (approved design)
    const checkActionBtn = await send(pWs, 'Runtime.evaluate', {
      expression: `!document.getElementById('closePoliciesActionBtn')`,
      returnByValue: true
    });
    if (!checkActionBtn.result.value) {
      throw new Error('closePoliciesActionBtn must remain absent from DOM');
    }

    // Test re-open and closing via Escape key handling
    console.log('Re-opening modal via #policiesLink...');
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesLink').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    await send(pWs, 'Runtime.evaluate', {
      expression: `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`
    });
    await new Promise(r => setTimeout(r, 400));

    state = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesModal').classList.contains('active')`,
      returnByValue: true
    });
    if (state.result.value !== false) {
      throw new Error('Modal did not close on Escape key');
    }

    console.log('🎉 VISUAL TEST PASSED 100%!');

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

testLoginPoliciesVisual().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
