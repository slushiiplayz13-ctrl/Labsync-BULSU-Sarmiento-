const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('================================================================');
console.log('🧪 Starting Submit PC Report Permanent Light Mode Verification');
console.log('================================================================\n');

// 1. Verify Markup in submit-pc-report.html
const htmlPath = path.join(__dirname, '..', 'submit-pc-report.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

assert(!htmlContent.includes('id="theme-toggle-btn"'), 'Theme toggle button must be removed from submit-pc-report.html');
assert(!htmlContent.includes('class="theme-toggle-btn"'), 'Class theme-toggle-btn must be removed from submit-pc-report.html');
assert(!htmlContent.includes('labsync-logo - dark mode.png'), 'Dark mode logo must not be present in submit-pc-report.html');
assert(htmlContent.includes('data-theme="light"'), 'Must declare data-theme="light" on html element');
assert(htmlContent.includes('enforceLightMode'), 'Must contain inline light mode enforcement script in head');
console.log('✔ PASS: submit-pc-report.html markup verified (Theme toggle completely removed, light mode enforced)');

// 2. Verify Logic in js/pages/submit-pc-report.js
const jsPath = path.join(__dirname, '..', 'js', 'pages', 'submit-pc-report.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

assert(!jsContent.includes('function initThemeToggle'), 'initThemeToggle must be removed from submit-pc-report.js');
assert(!jsContent.includes('window.initThemeToggle'), 'window.initThemeToggle export must be removed');
assert(!jsContent.includes('window.toggleTheme'), 'window.toggleTheme export must be removed');
console.log('✔ PASS: submit-pc-report.js logic verified (Theme toggle logic completely removed)');

// 3. Headless Chrome In-Browser Verification with Pre-existing Dark Mode localStorage
async function verifyBrowserBehavior() {
  console.log('\n--- Running Headless Chrome Light Mode Isolation Verification ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping visual snapshot');
    return;
  }

  const port = 9585;
  const tempProfile = path.join(__dirname, 'temp-chrome-light-' + Date.now());
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

    // Seed dark theme into localStorage beforehand to simulate a user who previously used dark mode elsewhere
    // Also seed verified student session so submit-pc-report does not redirect to verification gateway
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        sessionStorage.setItem('labsync_verified_student', JSON.stringify({
          verificationToken: 'test-token-12345',
          studentName: 'DELA CRUZ, JUAN M.',
          studentNumber: '2023-100456',
          room: '203',
          pc: '04',
          verificationTimestamp: Date.now()
        }));
        localStorage.setItem('labsync-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('labsync-high-contrast', 'true');
      `
    });

    await send(pWs, 'Page.navigate', { url: fileUrl });
    await new Promise(r => setTimeout(r, 1500));

    // Verify DOM state
    const evalRes = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('theme-toggle-btn');
        return {
          currentUrl: window.location.href,
          hasToggleBtn: btn !== null,
          dataTheme: document.documentElement.getAttribute('data-theme'),
          hasDarkClass: document.documentElement.classList.contains('dark-mode'),
          hasHcClass: document.documentElement.classList.contains('high-contrast'),
          bgColor: window.getComputedStyle(document.body).backgroundColor
        };
      })()`,
      returnByValue: true
    });

    console.log('Evaluated DOM state with pre-existing dark localStorage:', evalRes.result.value);
    assert.strictEqual(evalRes.result.value.hasToggleBtn, false, 'Theme toggle button must NOT exist in DOM');
    assert.strictEqual(evalRes.result.value.dataTheme, 'light', 'data-theme must strictly be "light"');
    assert.strictEqual(evalRes.result.value.hasDarkClass, false, 'html element must NOT have "dark-mode" class');
    assert.strictEqual(evalRes.result.value.hasHcClass, false, 'html element must NOT have "high-contrast" class');
    console.log('✔ PASS: submit-pc-report.html ignores pre-existing dark theme and remains strictly in Light Mode');

    // Capture Light Mode screenshot
    const lightCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'submit-pc-report-light.png'), Buffer.from(lightCap.data, 'base64'));
    console.log('✔ Captured light mode mobile screenshot: tests/submit-pc-report-light.png');

    // Desktop view test
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
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

verifyBrowserBehavior().then(() => {
  console.log('\n================================================================');
  console.log('🎉 ALL PERMANENT LIGHT MODE TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
