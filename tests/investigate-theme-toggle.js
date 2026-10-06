const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function investigate() {
  console.log('================================================================');
  console.log('🔍 RUNTIME BROWSER INVESTIGATION: Theme Toggle Visibility');
  console.log('================================================================\n');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.error('Chrome not found');
    return;
  }

  const port = 9586;
  const tempProfile = path.join(__dirname, 'temp-chrome-diag-' + Date.now());
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
    await send(pWs, 'Network.enable');

    const networkRequests = [];
    pWs.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.method === 'Network.responseReceived') {
        networkRequests.push({
          url: msg.params.response.url,
          status: msg.params.response.status,
          headers: msg.params.response.headers,
          fromDiskCache: msg.params.response.fromDiskCache,
          fromServiceWorker: msg.params.response.fromServiceWorker
        });
      }
    });

    console.log('--- SCENARIO 1: Fresh Visit to submit-pc-report.html?room=203&pc=04 without verified session ---');
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/submit-pc-report.html?room=203&pc=04' });
    await new Promise(r => setTimeout(r, 2000));

    const s1 = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        const allToggleBtns = Array.from(document.querySelectorAll('.theme-toggle-btn, [id*="theme"], [class*="theme-toggle"], [title*="theme" i], [aria-label*="theme" i], [aria-label*="dark" i]')).map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          outerHTML: el.outerHTML.slice(0, 120),
          rect: el.getBoundingClientRect()
        }));
        return {
          currentUrl: window.location.href,
          documentTitle: document.title,
          h1Title: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
          hasToggleBtn: !!toggleBtn,
          toggleBtnHTML: toggleBtn ? toggleBtn.outerHTML : null,
          allToggleBtns: allToggleBtns
        };
      })()`,
      returnByValue: true
    });
    console.log('Scenario 1 Result:', JSON.stringify(s1.result.value, null, 2));

    const shot1 = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'diag-scenario-1.png'), Buffer.from(shot1.data, 'base64'));

    console.log('\n--- SCENARIO 2: Visit with verified student session in sessionStorage ---');
    // Set student verification session in sessionStorage
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        sessionStorage.setItem('labsync_verified_student', JSON.stringify({
          verificationToken: 'test-tok-999',
          studentName: 'DELA CRUZ, JUAN M.',
          studentNumber: '2023-100456',
          roomNumber: '203',
          pcNumber: '04',
          verificationTimestamp: Date.now()
        }));
      })()`
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/submit-pc-report.html?room=203&pc=04' });
    await new Promise(r => setTimeout(r, 2000));

    const s2 = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const toggleBtn = document.getElementById('theme-toggle-btn');
        const allToggleBtns = Array.from(document.querySelectorAll('.theme-toggle-btn, [id*="theme"], [class*="theme-toggle"], [title*="theme" i], [aria-label*="theme" i], [aria-label*="dark" i]')).map(el => ({
          tag: el.tagName,
          id: el.id,
          className: el.className,
          outerHTML: el.outerHTML.slice(0, 120),
          rect: el.getBoundingClientRect()
        }));
        return {
          currentUrl: window.location.href,
          documentTitle: document.title,
          h1Title: document.querySelector('h1') ? document.querySelector('h1').textContent : null,
          hasToggleBtn: !!toggleBtn,
          toggleBtnHTML: toggleBtn ? toggleBtn.outerHTML : null,
          allToggleBtns: allToggleBtns
        };
      })()`,
      returnByValue: true
    });
    console.log('Scenario 2 Result:', JSON.stringify(s2.result.value, null, 2));

    const shot2 = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'diag-scenario-2.png'), Buffer.from(shot2.data, 'base64'));

    console.log('\n--- NETWORK RESPONSES FOR HTML & JS ---');
    for (const req of networkRequests) {
      if (req.url.includes('html') || req.url.includes('js/pages/')) {
        console.log(`URL: ${req.url} -> Status: ${req.status}, fromDiskCache: ${req.fromDiskCache}, cache-control: ${req.headers['cache-control'] || req.headers['Cache-Control'] || 'none'}, etag: ${req.headers['etag'] || req.headers['ETag'] || 'none'}`);
      }
    }

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

investigate().then(() => console.log('\nInvestigation completed.')).catch(console.error);
