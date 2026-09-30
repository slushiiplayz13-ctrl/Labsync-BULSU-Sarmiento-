const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('================================================================');
console.log('🧪 Starting LabSync Terms & Policies Page Tests');
console.log('================================================================\n');

// 1. Verify terms.html exists and has required sections
const termsPath = path.join(__dirname, '..', 'terms.html');
assert(fs.existsSync(termsPath), 'terms.html must exist');

const termsContent = fs.readFileSync(termsPath, 'utf8');
assert(termsContent.includes('RA 10173'), 'Must reference RA 10173 Data Privacy Act');
assert(termsContent.includes('Bulacan State University'), 'Must reference Bulacan State University');
assert(termsContent.includes('Sarmiento Campus'), 'Must reference Sarmiento Campus');
assert(termsContent.includes('Smart Key Cabinet'), 'Must reference Smart Key Cabinet');
assert(termsContent.includes('id="theme-toggle-btn"'), 'Must contain theme toggle button');
assert(termsContent.includes('sec-overview'), 'Must have overview section');
assert(termsContent.includes('sec-workstation'), 'Must have workstation section');
assert(termsContent.includes('sec-privacy'), 'Must have privacy section');
assert(termsContent.includes('sec-keys'), 'Must have keys section');
assert(termsContent.includes('sec-retention'), 'Must have retention section');
console.log('✔ PASS: terms.html content & regulatory sections verified');

// 2. Verify server.js includes terms.html
const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');
assert(serverContent.includes("'terms.html'"), 'server.js must allowlist terms.html in APPROVED_HTML_PAGES');
console.log('✔ PASS: server.js allows terms.html route');

// 3. Verify public and internal pages link to terms.html
const submitPath = path.join(__dirname, '..', 'submit-pc-report.html');
const submitContent = fs.readFileSync(submitPath, 'utf8');
assert(submitContent.includes('terms.html'), 'submit-pc-report.html must link to terms.html');

const profileDropdownPath = path.join(__dirname, '..', 'js', 'components', 'profile', 'profile-dropdown.js');
const profileDropdownContent = fs.readFileSync(profileDropdownPath, 'utf8');
assert(profileDropdownContent.includes('terms.html'), 'profile-dropdown.js must include link to terms.html');
assert(profileDropdownContent.includes('profile-menu-policies-btn'), 'profile-dropdown.js must have profile-menu-policies-btn');

const helpModalPath = path.join(__dirname, '..', 'js', 'components', 'profile', 'help-modal.js');
const helpModalContent = fs.readFileSync(helpModalPath, 'utf8');
assert(helpModalContent.includes('terms.html'), 'help-modal.js must include link to terms.html in footer');
console.log('✔ PASS: submit-pc-report.html, profile-dropdown.js & help-modal.js link to terms.html');

// 4. Capture Headless Chrome Screenshots
async function captureTermsScreenshots() {
  console.log('\n--- Capturing Headless Chrome Screenshots for Terms & Policies ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping visual check');
    return;
  }

  const port = 9592;
  const tempProfile = path.join(__dirname, 'temp-chrome-terms-' + Date.now());
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

    // Desktop Light
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 900,
      deviceScaleFactor: 2,
      mobile: false
    });

    const fileUrl = 'file:///' + termsPath.replace(/\\/g, '/');
    await send(pWs, 'Page.navigate', { url: fileUrl });
    await new Promise(r => setTimeout(r, 1500));

    // Verify print button visible on desktop
    const desktopPrintDisp = await send(pWs, 'Runtime.evaluate', {
      expression: `window.getComputedStyle(document.getElementById('btn-print-policy')).display`,
      returnByValue: true
    });
    assert.notStrictEqual(desktopPrintDisp.result.value, 'none', 'Print button must be visible on desktop');
    console.log('✔ PASS: Print button visible on desktop (' + desktopPrintDisp.result.value + ')');

    const lightDesktopCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-desktop-light.png'), Buffer.from(lightDesktopCap.data, 'base64'));
    console.log('✔ Captured desktop light mode: tests/terms-desktop-light.png');

    // Toggle to Dark Mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 800));

    const darkDesktopCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-desktop-dark.png'), Buffer.from(darkDesktopCap.data, 'base64'));
    console.log('✔ Captured desktop dark mode: tests/terms-desktop-dark.png');

    // Mobile Dark (<= 768px)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 420,
      height: 880,
      deviceScaleFactor: 2,
      mobile: true
    });
    await new Promise(r => setTimeout(r, 600));

    // Verify print button hidden on mobile
    const mobilePrintDisp = await send(pWs, 'Runtime.evaluate', {
      expression: `window.getComputedStyle(document.getElementById('btn-print-policy')).display`,
      returnByValue: true
    });
    assert.strictEqual(mobilePrintDisp.result.value, 'none', 'Print button must be hidden on mobile');
    console.log('✔ PASS: Print button hidden on mobile (' + mobilePrintDisp.result.value + ')');

    const darkMobileCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-mobile-dark.png'), Buffer.from(darkMobileCap.data, 'base64'));
    console.log('✔ Captured mobile dark mode: tests/terms-mobile-dark.png');

    // Mobile Light
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.click();
      })()`
    });
    await new Promise(r => setTimeout(r, 600));
    const lightMobileCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-mobile-light.png'), Buffer.from(lightMobileCap.data, 'base64'));
    console.log('✔ Captured mobile light mode: tests/terms-mobile-light.png');

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

captureTermsScreenshots().then(() => {
  console.log('\n================================================================');
  console.log('🎉 ALL TERMS & POLICIES TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
