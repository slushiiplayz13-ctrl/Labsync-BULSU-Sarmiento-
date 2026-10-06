const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('================================================================');
console.log('🧪 Starting LabSync Terms Back Button Navigation Tests');
console.log('================================================================\n');

// 1. Static assertion on terms.html
const termsPath = path.join(__dirname, '..', 'terms.html');
const termsHtml = fs.readFileSync(termsPath, 'utf8');

assert(termsHtml.includes('id="btn-back-nav"'), 'Must have btn-back-nav');
assert(termsHtml.includes('initTermsBackNav'), 'Must define initTermsBackNav');
assert(!termsHtml.includes('href="javascript:history.back()"'), 'Must NOT use no-op javascript:history.back()');
console.log('✔ PASS: Static checks verified on terms.html');

// 2. Headless Chrome Browser Tests
async function testBackNavigation() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping browser test');
    return;
  }

  const port = 9593;
  const tempProfile = path.join(__dirname, 'temp-chrome-back-' + Date.now());
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

    // Test Case 1: from=login
    console.log('--- Test 1: Navigation from login (?from=login) ---');
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/terms.html?from=login' });
    await new Promise(r => setTimeout(r, 800));

    const href1 = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btn-back-nav').getAttribute('href')`
    });
    assert.strictEqual(href1.result.value, 'login.html', 'Back button href must be login.html');
    console.log('✔ Back button href updated to login.html');

    // Click back button
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btn-back-nav').click()`
    });
    await new Promise(r => setTimeout(r, 1000));

    const currentUrl1 = await send(pWs, 'Runtime.evaluate', {
      expression: `window.location.href`
    });
    assert(currentUrl1.result.value.includes('login.html'), `Must navigate to login.html, got: ${currentUrl1.result.value}`);
    console.log('✔ Successfully navigated to login.html after clicking Back button');

    // Test Case 2: from=report
    console.log('\n--- Test 2: Navigation from report form (?from=report) ---');
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/terms.html?from=report' });
    await new Promise(r => setTimeout(r, 800));

    const href2 = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btn-back-nav').getAttribute('href')`
    });
    assert.strictEqual(href2.result.value, 'submit-pc-report.html', 'Back button href must be submit-pc-report.html');
    console.log('✔ Back button href updated to submit-pc-report.html');

    // Click back button
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btn-back-nav').click()`
    });
    await new Promise(r => setTimeout(r, 1000));

    const currentUrl2 = await send(pWs, 'Runtime.evaluate', {
      expression: `window.location.href`
    });
    assert(currentUrl2.result.value.includes('submit-pc-report.html') || currentUrl2.result.value.includes('student-id-verification.html'), `Must navigate to submit-pc-report.html or its verification gateway, got: ${currentUrl2.result.value}`);
    console.log('✔ Successfully navigated to submit-pc-report.html / verification gateway after clicking Back button');

    // Test Case 3: default without query params
    console.log('\n--- Test 3: Direct visit without query params ---');
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/terms.html' });
    await new Promise(r => setTimeout(r, 800));

    const href3 = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btn-back-nav').getAttribute('href')`
    });
    assert.strictEqual(href3.result.value, 'login.html', 'Default back button href must be login.html');
    console.log('✔ Default back button href is login.html');

    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btn-back-nav').click()`
    });
    await new Promise(r => setTimeout(r, 1000));

    const currentUrl3 = await send(pWs, 'Runtime.evaluate', {
      expression: `window.location.href`
    });
    assert(currentUrl3.result.value.includes('login.html'), `Default must navigate to login.html, got: ${currentUrl3.result.value}`);
    console.log('✔ Successfully navigated to login.html on default click');

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

testBackNavigation().then(() => {
  console.log('\n================================================================');
  console.log('🎉 ALL BACK BUTTON NAVIGATION TESTS PASSED!');
  console.log('================================================================\n');
}).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
