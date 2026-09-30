const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('================================================================');
console.log('🧪 Starting Submit PC Report Light/Dark Mode Toggle Tests');
console.log('================================================================\n');

// 1. Verify Markup in submit-pc-report.html
const htmlPath = path.join(__dirname, '..', 'submit-pc-report.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert(htmlContent.includes('id="theme-toggle-btn"'), 'Must contain theme toggle button with id="theme-toggle-btn"');
assert(htmlContent.includes('class="theme-toggle-btn"'), 'Must contain class="theme-toggle-btn"');
assert(htmlContent.includes('theme-icon-moon'), 'Must contain moon icon for light mode');
assert(htmlContent.includes('theme-icon-sun'), 'Must contain sun icon for dark mode');
assert(htmlContent.includes('applySavedTheme'), 'Must contain early theme restore script in head');
assert(htmlContent.includes('[data-theme="dark"] .form-title') || htmlContent.includes('html.dark-mode .form-title'), 'Must style form-title in dark mode');
console.log('✔ PASS: submit-pc-report.html markup and styles verified');

// 2. Verify Logic in js/pages/submit-pc-report.js
const jsPath = path.join(__dirname, '..', 'js', 'pages', 'submit-pc-report.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

assert(jsContent.includes('function initThemeToggle'), 'Must contain initThemeToggle function');
assert(jsContent.includes('function toggleTheme') || jsContent.includes('toggleTheme ='), 'Must contain toggleTheme logic');
assert(jsContent.includes('window.initThemeToggle'), 'Must export initThemeToggle globally');
console.log('✔ PASS: submit-pc-report.js theme toggle controller code verified');

// 3. Headless Chrome Visual Capture (Light & Dark Mode)
async function captureScreenshots() {
  console.log('\n--- Capturing Headless Chrome Screenshots (Light & Dark Mode) ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping visual snapshot');
    return;
  }

  const port = 9585;
  const tempProfile = path.join(__dirname, 'temp-chrome-theme-' + Date.now());
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
      width: 420,
      height: 880,
      deviceScaleFactor: 2,
      mobile: true
    });

    const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/') + '?room=203&pc=04';
    await send(pWs, 'Page.navigate', { url: fileUrl });
    await new Promise(r => setTimeout(r, 1500));

    // Capture Light Mode
    const lightCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'submit-pc-report-light.png'), Buffer.from(lightCap.data, 'base64'));
    console.log('✔ Captured light mode screenshot: tests/submit-pc-report-light.png');

    // Click theme toggle button
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 800));

    // Verify dark mode attributes in DOM
    const evalRes = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          dataTheme: document.documentElement.getAttribute('data-theme'),
          hasDarkClass: document.documentElement.classList.contains('dark-mode'),
          hasHcClass: document.documentElement.classList.contains('high-contrast'),
          themeStorage: localStorage.getItem('labsync-theme')
        };
      })()`,
      returnByValue: true
    });

    console.log('Evaluated DOM state after toggle:', evalRes.result.value);
    assert.strictEqual(evalRes.result.value.dataTheme, 'dark', 'data-theme must be dark');
    assert.strictEqual(evalRes.result.value.hasDarkClass, true, 'html must have dark-mode class');
    assert.strictEqual(evalRes.result.value.themeStorage, 'dark', 'localStorage must store dark theme');
    console.log('✔ PASS: In-browser toggle to Dark Mode verified');

    // Capture Dark Mode
    const darkCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'submit-pc-report-dark.png'), Buffer.from(darkCap.data, 'base64'));
    console.log('✔ Captured dark mode screenshot: tests/submit-pc-report-dark.png');

    // Desktop view test
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 600));

    const darkDesktopCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'submit-pc-report-dark-desktop.png'), Buffer.from(darkDesktopCap.data, 'base64'));
    console.log('✔ Captured dark mode desktop screenshot: tests/submit-pc-report-dark-desktop.png');

    // Toggle back to light mode on desktop
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 600));

    const lightDesktopCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'submit-pc-report-light-desktop.png'), Buffer.from(lightDesktopCap.data, 'base64'));
    console.log('✔ Captured light mode desktop screenshot: tests/submit-pc-report-light-desktop.png');

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

captureScreenshots().then(() => {
  console.log('\n================================================================');
  console.log('🎉 ALL THEME TOGGLE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
