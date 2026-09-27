const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9560;
  const tempProfile = path.join(__dirname, 'temp-chrome-ojt-' + Date.now());
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

    // Emulate MIS Staff user with dark mode and mock OJT data
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const userObj = { role: 'MIS Staff', name: 'MIS Test Officer', email: 'mis@bulsu.edu.ph' };
          localStorage.setItem('user', JSON.stringify(userObj));
          localStorage.setItem('labsync_last_activity', Date.now().toString());
          localStorage.setItem('labsync-high-contrast', 'true');
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
              if (url.includes('/api/ojt')) {
                return new Response(JSON.stringify([
                  {
                    User_ID: 101,
                    Name: 'Violeta Guevarra',
                    Email: 'slushiplayz13@gmail.com',
                    Phone: '09123456789',
                    Profile_Photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60',
                    OJT_Start_Date: '2026-09-16',
                    OJT_End_Date: '2026-11-08',
                    Status: 'Active'
                  }
                ]), {
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

    // Mobile viewport narrow (360 x 800)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
      mobile: true
    });

    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/mis-ojt.html' });
    await new Promise(r => setTimeout(r, 2000));

    // High contrast mode as applied by accessibility settings
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.documentElement.classList.add('high-contrast');
      `
    });
    await new Promise(r => setTimeout(r, 400));

    // Measure positions and verify zero overlap
    const pos = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (() => {
          const card = document.querySelector('.ojt-main-card');
          const toolbar = document.querySelector('.ojt-toolbar-left');
          const bAll = document.getElementById('filterBtnAll');
          const bAct = document.getElementById('filterBtnActive');
          const bIna = document.getElementById('filterBtnInactive');
          const rCard = card.getBoundingClientRect();
          const rTool = toolbar.getBoundingClientRect();
          const rAll = bAll.getBoundingClientRect();
          const rAct = bAct.getBoundingClientRect();
          const rIna = bIna.getBoundingClientRect();
          const search = document.querySelector('.ojt-search-wrap');
          const btnAdd = document.getElementById('btnAddOjt');
          const rSearch = search.getBoundingClientRect();
          const rBtnAdd = btnAdd.getBoundingClientRect();
          return {
            card: { left: rCard.left, right: rCard.right, width: rCard.width },
            toolbar: { left: rTool.left, right: rTool.right, width: rTool.width },
            all: { left: rAll.left, right: rAll.right, width: rAll.width },
            act: { left: rAct.left, right: rAct.right, width: rAct.width },
            ina: { left: rIna.left, right: rIna.right, width: rIna.width },
            search: { left: rSearch.left, right: rSearch.right, width: rSearch.width, top: rSearch.top },
            btnAdd: { left: rBtnAdd.left, right: rBtnAdd.right, width: rBtnAdd.width, top: rBtnAdd.top },
            inSameRow: Math.abs(rSearch.top - rBtnAdd.top) < 5,
            addOjtOnRight: rBtnAdd.left >= rSearch.right
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Position Check:', JSON.stringify(pos.result.value, null, 2));

    const snapHC = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, 'ojt-stat-cards-hc.png'), Buffer.from(snapHC.data, 'base64'));
    console.log('High-contrast top screenshot saved to ojt-stat-cards-hc.png');

    // Also test light mode
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
      `
    });
    await new Promise(r => setTimeout(r, 400));

    const snapLight = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outLightPath = path.join(__dirname, 'ojt-mobile-light.png');
    fs.writeFileSync(outLightPath, Buffer.from(snapLight.data, 'base64'));
    console.log('Light mode mobile screenshot saved to', outLightPath);

    // Also test desktop (1280 x 800)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        window.scrollTo({ top: 0, behavior: 'instant' });
      `
    });
    await new Promise(r => setTimeout(r, 400));

    const snapDesktop = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const outDeskPath = path.join(__dirname, 'ojt-desktop-light.png');
    fs.writeFileSync(outDeskPath, Buffer.from(snapDesktop.data, 'base64'));
    console.log('Desktop light mode screenshot saved to', outDeskPath);

  } finally {
    chromeProc.kill();
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

run().catch(console.error);
