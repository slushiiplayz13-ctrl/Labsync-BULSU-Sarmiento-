const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function snap() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9559;
  const tempProfile = path.join(__dirname, 'temp-chrome-login-' + Date.now());
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
    
    // Set mobile device metrics (390 x 844 iPhone 14 size)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await send(pWs, 'Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/login.html' });
    await new Promise(r => setTimeout(r, 1500));

    const evalRes = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const inp = document.querySelector('#rememberMe');
        const custom = document.querySelector('.custom-checkbox');
        const label = document.querySelector('.remember-me-label');
        return {
          rowHtml: document.querySelector('.login-options-row')?.outerHTML,
          inputDisplay: window.getComputedStyle(inp).display,
          inputOpacity: window.getComputedStyle(inp).opacity,
          customDisplay: custom ? window.getComputedStyle(custom).display : 'none',
          labelDisplay: window.getComputedStyle(label).display
        };
      })()`,
      returnByValue: true
    });
    console.log('Evaluated DOM & Styles:', evalRes.result.value);

    // 1. Mobile Screenshot (390 x 844)
    const mobileSnap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const mobileOut = path.join(__dirname, 'mobile-login-remember.png');
    fs.writeFileSync(mobileOut, Buffer.from(mobileSnap.data, 'base64'));
    console.log('✓ Mobile screenshot saved to:', mobileOut);

    // 2. Desktop Screenshot (1280 x 800)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send(pWs, 'Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/login.html' });
    await new Promise(r => setTimeout(r, 1200));

    const deskSnap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const deskOut = path.join(__dirname, 'desktop-login-clean.png');
    fs.writeFileSync(deskOut, Buffer.from(deskSnap.data, 'base64'));
    console.log('✓ Desktop screenshot saved to:', deskOut);

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
