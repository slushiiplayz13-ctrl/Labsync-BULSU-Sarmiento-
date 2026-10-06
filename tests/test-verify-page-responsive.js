const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const assert = require('assert');

async function testResponsive() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9591;
  const tempProfile = path.join(__dirname, 'temp-chrome-responsive-' + Date.now());
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

    const viewports = [
      { name: 'Narrow Mobile (320px)', width: 320, height: 568 },
      { name: 'Small Android (360px)', width: 360, height: 640 },
      { name: 'iPhone SE (375px)', width: 375, height: 667 },
      { name: 'iPhone 13 (390px)', width: 390, height: 844 },
      { name: 'Large Mobile (430px)', width: 430, height: 932 },
      { name: 'Tablet (768px)', width: 768, height: 1024 },
      { name: 'Desktop (1280px)', width: 1280, height: 800 }
    ];

    const verifyUrl = 'http://localhost:3000/student-id-verification.html?room=204&pc=1';

    console.log('================================================================');
    console.log('🧪 Testing Student ID Verification Page Responsive Viewports');
    console.log('================================================================');

    for (const vp of viewports) {
      await send(pWs, 'Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 768
      });

      await send(pWs, 'Page.navigate', { url: verifyUrl });
      await new Promise(r => setTimeout(r, 600));

      const metrics = await send(pWs, 'Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const container = document.querySelector('.app-container');
          const card = document.querySelector('.form-card');
          const header = document.querySelector('.brand-header');
          const infoBox = document.querySelector('.info-header-box');
          const scanBox = document.querySelector('.scanner-viewport-container');

          return {
            viewportWidth: window.innerWidth,
            scrollWidth: docEl.scrollWidth,
            hasHorizontalOverflow: docEl.scrollWidth > window.innerWidth,
            containerWidth: container ? container.getBoundingClientRect().width : 0,
            cardWidth: card ? card.getBoundingClientRect().width : 0,
            headerVisible: Boolean(header && header.offsetHeight > 0),
            infoBoxVisible: Boolean(infoBox && infoBox.offsetHeight > 0),
            scanBoxVisible: Boolean(scanBox && scanBox.offsetHeight > 0),
            hasToggleBtn: Boolean(document.getElementById('theme-toggle-btn')),
            dataTheme: docEl.getAttribute('data-theme'),
            hasDarkClass: docEl.classList.contains('dark-mode')
          };
        })()`,
        returnByValue: true
      });

      const m = metrics.result.value;
      assert.strictEqual(m.hasHorizontalOverflow, false, `${vp.name} must not have horizontal overflow`);
      assert.strictEqual(m.headerVisible, true, `${vp.name} header must be visible`);
      assert.strictEqual(m.infoBoxVisible, true, `${vp.name} info-header-box must be visible`);
      assert.strictEqual(m.scanBoxVisible, true, `${vp.name} scanBox must be visible`);
      assert.strictEqual(m.hasToggleBtn, false, `${vp.name} theme-toggle-btn must NOT exist`);
      assert.strictEqual(m.dataTheme, 'light', `${vp.name} data-theme must be light`);
      assert.strictEqual(m.hasDarkClass, false, `${vp.name} must not have dark-mode class`);
      console.log(`✔ PASS: ${vp.name} — Card: ${Math.round(m.cardWidth)}px, Overflow: ${m.hasHorizontalOverflow}, Light Mode Enforced`);
    }

    // Additional check: Pre-seed dark theme in localStorage and reload
    await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        localStorage.setItem('labsync-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('labsync-high-contrast', 'true');
      })()`
    });
    await send(pWs, 'Page.reload');
    await new Promise(r => setTimeout(r, 800));

    const darkCheck = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        return {
          hasToggleBtn: Boolean(document.getElementById('theme-toggle-btn')),
          dataTheme: document.documentElement.getAttribute('data-theme'),
          hasDarkClass: document.documentElement.classList.contains('dark-mode'),
          hasHcClass: document.documentElement.classList.contains('high-contrast')
        };
      })()`,
      returnByValue: true
    });
    assert.strictEqual(darkCheck.result.value.hasToggleBtn, false, 'Theme toggle must remain absent with dark localStorage');
    assert.strictEqual(darkCheck.result.value.dataTheme, 'light', 'data-theme must remain light with dark localStorage');
    assert.strictEqual(darkCheck.result.value.hasDarkClass, false, 'dark-mode class must not be applied');
    assert.strictEqual(darkCheck.result.value.hasHcClass, false, 'high-contrast class must not be applied');
    console.log('✔ PASS: student-id-verification.html strictly ignores pre-existing dark theme and remains Light Mode');

    console.log('\n🎉 ALL RESPONSIVE & LIGHT MODE TESTS PASSED SUCCESSFULLY!');
    pWs.close();
    bWs.close();
  } finally {
    chromeProc.kill();
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_) {}
  }
}

testResponsive().catch(err => {
  console.error(err);
  process.exit(1);
});
