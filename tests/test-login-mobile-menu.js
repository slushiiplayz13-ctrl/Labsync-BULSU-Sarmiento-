const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function testMobileMenu() {
  console.log('--- Testing Login Mobile Header & Dropdown in Headless Chrome ---');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('Chrome not found, skipping visual test');
    return;
  }

  const port = 9598;
  const tempProfile = path.join(__dirname, 'temp-chrome-mobile-menu-' + Date.now());
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

    // 1. Mobile Viewport (iPhone SE / Standard Android: 375x720)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 720,
      deviceScaleFactor: 2,
      mobile: true
    });

    const url = 'http://localhost:3000/login.html';
    console.log('Navigating to mobile view:', url);
    await send(pWs, 'Page.navigate', { url });
    await new Promise(r => setTimeout(r, 1500));

    // Check visibility and responsive styling of header navigation on mobile
    let navState = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const headerLeft = document.querySelector('.header-left');
        const headerRight = document.querySelector('.header-right');
        const lStyle = window.getComputedStyle(headerLeft);
        const rStyle = window.getComputedStyle(headerRight);
        const links = Array.from(headerRight.querySelectorAll('a')).map(a => a.textContent.trim());
        return {
          headerLeftDisplay: lStyle.display,
          headerRightDisplay: rStyle.display,
          linkCount: links.length,
          links: links
        };
      })()`,
      returnByValue: true
    });
    console.log('Mobile nav state:', navState.result.value);

    if (navState.result.value.headerRightDisplay !== 'flex') {
      throw new Error('.header-right should be display:flex on mobile (got: ' + navState.result.value.headerRightDisplay + ')');
    }
    if (navState.result.value.linkCount !== 3) {
      throw new Error('.header-right should have 3 links on mobile (got: ' + navState.result.value.linkCount + ')');
    }

    const expectedMobileOrder = ['About', 'Policies', 'Contact'];
    if (JSON.stringify(navState.result.value.links) !== JSON.stringify(expectedMobileOrder)) {
      throw new Error('Expected mobile links ' + JSON.stringify(expectedMobileOrder) + ' but got ' + JSON.stringify(navState.result.value.links));
    }

    // Capture screenshot of mobile header
    const cap1 = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const out1 = path.join(__dirname, 'login-mobile-header.png');
    fs.writeFileSync(out1, Buffer.from(cap1.data, 'base64'));
    console.log('✔ Captured mobile header screenshot:', out1);

    // 2. Click Policies link on mobile -> opens policies modal
    console.log('Clicking #policiesLink on mobile...');
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesLink').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    let modalState = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const modal = document.getElementById('policiesModal');
        return {
          policiesModalActive: modal ? modal.classList.contains('active') : false
        };
      })()`,
      returnByValue: true
    });
    console.log('After clicking policies item on mobile:', modalState.result.value);

    if (!modalState.result.value.policiesModalActive) {
      throw new Error('Policies modal should open when policies link is clicked on mobile');
    }

    const cap2 = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const out2 = path.join(__dirname, 'login-mobile-dropdown-open.png');
    fs.writeFileSync(out2, Buffer.from(cap2.data, 'base64'));
    console.log('✔ Captured mobile policies modal screenshot:', out2);

    // Close modal
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('closePoliciesModalBtn').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    let closedState = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('policiesModal').classList.contains('active')`,
      returnByValue: true
    });
    if (closedState.result.value !== false) {
      throw new Error('Policies modal should close when close button is clicked');
    }

    // 3. Desktop Check (1200x800)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 500));

    let desktopCheck = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const headerRight = document.querySelector('.header-right');
        const links = Array.from(headerRight.querySelectorAll('a')).map(a => a.textContent.trim());
        return {
          desktopDisplay: window.getComputedStyle(headerRight).display,
          linkOrder: links
        };
      })()`,
      returnByValue: true
    });
    console.log('Desktop layout check:', desktopCheck.result.value);

    if (desktopCheck.result.value.desktopDisplay !== 'flex') {
      throw new Error('.header-right should be display:flex on desktop');
    }

    const expectedOrder = ['About', 'Policies', 'Contact'];
    if (JSON.stringify(desktopCheck.result.value.linkOrder) !== JSON.stringify(expectedOrder)) {
      throw new Error('Expected link order ' + JSON.stringify(expectedOrder) + ' but got ' + JSON.stringify(desktopCheck.result.value.linkOrder));
    }
    console.log('✔ Desktop link order verified:', expectedOrder.join(' | '));

    console.log('\n🎉 ALL MOBILE AND DESKTOP NAVIGATION TESTS PASSED 100%!');

    bWs.close();
    pWs.close();
  } finally {
    try { chromeProc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }
}

testMobileMenu().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
