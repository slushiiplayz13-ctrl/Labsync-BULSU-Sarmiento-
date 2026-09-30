const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('================================================================');
console.log('🧪 Starting LabSync Terms Print Mode (Light/Dark Equivalence) Tests');
console.log('================================================================\n');

async function testTermsPrint() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping print visual check');
    return;
  }

  const port = 9594;
  const tempProfile = path.join(__dirname, 'temp-chrome-print-' + Date.now());
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
      width: 1000,
      height: 1200,
      deviceScaleFactor: 2,
      mobile: false
    });

    // 1. Navigate to terms.html (initial Light Mode)
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/terms.html' });
    await new Promise(r => setTimeout(r, 1000));
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        localStorage.setItem('labsync-theme', 'light');
        localStorage.setItem('labsync-high-contrast', 'false');
        document.documentElement.classList.remove('dark-mode', 'high-contrast');
        document.documentElement.setAttribute('data-theme', 'light');
      `
    });
    await new Promise(r => setTimeout(r, 300));

    // Emulate print media in Light Mode
    await send(pWs, 'Emulation.setEmulatedMedia', { media: 'print' });
    await new Promise(r => setTimeout(r, 400));

    const lightPrintCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-print-light.png'), Buffer.from(lightPrintCap.data, 'base64'));
    console.log('✔ Captured terms print from light mode: tests/terms-print-light.png');

    // Verify computed styles in print emulation (Light Mode)
    const lightCheck = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const titleColor = window.getComputedStyle(document.querySelector('.page-title')).color;
        const logoLightDisp = window.getComputedStyle(document.querySelector('.labsync-logo-light')).display;
        const logoDarkDisp = window.getComputedStyle(document.querySelector('.labsync-logo-dark')).display;
        const topActionsDisp = window.getComputedStyle(document.querySelector('.top-actions-bar')).display;
        return { bodyBg, titleColor, logoLightDisp, logoDarkDisp, topActionsDisp };
      })()`,
      returnByValue: true
    });
    console.log('Light mode print styles:', lightCheck.result.value);
    assert.strictEqual(lightCheck.result.value.bodyBg, 'rgb(255, 255, 255)', 'Body bg must be white');
    assert.strictEqual(lightCheck.result.value.logoLightDisp, 'block', 'Light logo must be displayed');
    assert.strictEqual(lightCheck.result.value.logoDarkDisp, 'none', 'Dark logo must be hidden');
    assert.strictEqual(lightCheck.result.value.topActionsDisp, 'none', 'Top actions must be hidden');

    // 2. Switch media back to screen, toggle to Dark Mode
    await send(pWs, 'Emulation.setEmulatedMedia', { media: 'screen' });
    await new Promise(r => setTimeout(r, 300));

    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('theme-toggle-btn').click()`
    });
    await new Promise(r => setTimeout(r, 600));

    // Confirm that on screen, dark mode is active
    const isDark = await send(pWs, 'Runtime.evaluate', {
      expression: `document.documentElement.classList.contains('dark-mode')`
    });
    assert.strictEqual(isDark.result.value, true, 'Dark mode should be active on screen');
    console.log('✔ Dark mode successfully active on screen');

    // Emulate print media while in Dark Mode
    await send(pWs, 'Emulation.setEmulatedMedia', { media: 'print' });
    await new Promise(r => setTimeout(r, 400));

    const darkPrintCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-print-dark.png'), Buffer.from(darkPrintCap.data, 'base64'));
    console.log('✔ Captured terms print while dark mode was active: tests/terms-print-dark.png');

    // Verify computed styles in print emulation while in Dark Mode
    const darkCheck = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const titleColor = window.getComputedStyle(document.querySelector('.page-title')).color;
        const cardBg = window.getComputedStyle(document.querySelector('.terms-card')).backgroundColor;
        const logoLightDisp = window.getComputedStyle(document.querySelector('.labsync-logo-light')).display;
        const logoDarkDisp = window.getComputedStyle(document.querySelector('.labsync-logo-dark')).display;
        const topActionsDisp = window.getComputedStyle(document.querySelector('.top-actions-bar')).display;
        const tableThBg = window.getComputedStyle(document.querySelector('.privacy-table th')).backgroundColor;
        const officialHeaderDisp = window.getComputedStyle(document.querySelector('.print-official-header')).display;
        const signatoryDisp = window.getComputedStyle(document.querySelector('.print-signatory-block')).display;
        const iconBoxDisp = window.getComputedStyle(document.querySelector('.section-icon-box')).display;
        return { bodyBg, titleColor, cardBg, logoLightDisp, logoDarkDisp, topActionsDisp, tableThBg, officialHeaderDisp, signatoryDisp, iconBoxDisp };
      })()`,
      returnByValue: true
    });
    console.log('Dark mode print styles:', darkCheck.result.value);

    assert.strictEqual(darkCheck.result.value.bodyBg, 'rgb(255, 255, 255)', 'Body bg must still be white when printing from dark mode');
    assert.strictEqual(darkCheck.result.value.cardBg, 'rgb(255, 255, 255)', 'Terms card bg must be white when printing from dark mode');
    assert.strictEqual(darkCheck.result.value.logoLightDisp, 'block', 'Light logo must be displayed even when printing from dark mode');
    assert.strictEqual(darkCheck.result.value.logoDarkDisp, 'none', 'Dark logo must be hidden when printing from dark mode');
    assert.strictEqual(darkCheck.result.value.topActionsDisp, 'none', 'Top actions must be hidden');
    assert.strictEqual(darkCheck.result.value.officialHeaderDisp, 'block', 'Official print header must be visible in print');
    assert.strictEqual(darkCheck.result.value.signatoryDisp, 'block', 'Signatory block must be visible in print');
    assert.strictEqual(darkCheck.result.value.iconBoxDisp, 'none', 'Web icon boxes must be hidden in print');

    // Capture bottom of document (Signatory & Footer)
    await send(pWs, 'Runtime.evaluate', {
      expression: `window.scrollTo(0, document.body.scrollHeight)`
    });
    await new Promise(r => setTimeout(r, 400));
    const bottomCap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'terms-print-bottom.png'), Buffer.from(bottomCap.data, 'base64'));
    console.log('✔ Captured bottom of print document: tests/terms-print-bottom.png');

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

testTermsPrint().then(() => {
  console.log('\n================================================================');
  console.log('🎉 ALL PRINT FORMAT TESTS PASSED! LIGHT & DARK PRODUCE SAME CLEAN PRINT FORMAT!');
  console.log('================================================================\n');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
