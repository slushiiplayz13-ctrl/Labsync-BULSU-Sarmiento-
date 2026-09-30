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

    // Check visibility of desktop nav vs mobile nav
    let navState = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const desktopNav = document.querySelector('.desktop-nav');
        const mobileNav = document.querySelector('.mobile-nav-wrapper');
        const dStyle = window.getComputedStyle(desktopNav);
        const mStyle = window.getComputedStyle(mobileNav);
        return {
          desktopDisplay: dStyle.display,
          mobileDisplay: mStyle.display
        };
      })()`,
      returnByValue: true
    });
    console.log('Mobile nav state:', navState.result.value);

    if (navState.result.value.desktopDisplay !== 'none') {
      throw new Error('.desktop-nav should be hidden on mobile (got: ' + navState.result.value.desktopDisplay + ')');
    }
    if (navState.result.value.mobileDisplay !== 'block') {
      throw new Error('.mobile-nav-wrapper should be visible on mobile (got: ' + navState.result.value.mobileDisplay + ')');
    }

    // Capture screenshot of mobile header
    const cap1 = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const out1 = path.join(__dirname, 'login-mobile-header.png');
    fs.writeFileSync(out1, Buffer.from(cap1.data, 'base64'));
    console.log('✔ Captured mobile header screenshot:', out1);

    // 2. Open Mobile Dropdown
    console.log('Clicking #mobileMenuBtn...');
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('mobileMenuBtn').click()`
    });
    await new Promise(r => setTimeout(r, 350));

    let dropState = await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('mobileMenuDropdown').classList.contains('active')`,
      returnByValue: true
    });
    console.log('Dropdown active after click:', dropState.result.value);
    if (!dropState.result.value) {
      throw new Error('Mobile menu dropdown is not active after clicking menu button');
    }

    const cap2 = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const out2 = path.join(__dirname, 'login-mobile-dropdown-open.png');
    fs.writeFileSync(out2, Buffer.from(cap2.data, 'base64'));
    console.log('✔ Captured open mobile dropdown screenshot:', out2);

    // 3. Click Policies inside dropdown -> should open policies modal
    console.log('Clicking #mobilePoliciesBtn...');
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('mobilePoliciesBtn').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    let modalState = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const drop = document.getElementById('mobileMenuDropdown');
        const modal = document.getElementById('policiesModal');
        return {
          dropdownActive: drop.classList.contains('active'),
          policiesModalActive: modal.classList.contains('active')
        };
      })()`,
      returnByValue: true
    });
    console.log('After clicking mobile policies item:', modalState.result.value);

    if (modalState.result.value.dropdownActive) {
      throw new Error('Dropdown should close when item is clicked');
    }
    if (!modalState.result.value.policiesModalActive) {
      throw new Error('Policies modal should open when mobile policies item is clicked');
    }

    // Close modal
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('closePoliciesModalBtn').click()`
    });
    await new Promise(r => setTimeout(r, 400));

    // 4. Desktop Check (1200x800)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 800,
      deviceScaleFactor: 2,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 500));

    let desktopCheck = await send(pWs, 'Runtime.evaluate', {
      expression: `(() => {
        const desktopNav = document.querySelector('.desktop-nav');
        const mobileNav = document.querySelector('.mobile-nav-wrapper');
        const links = Array.from(desktopNav.querySelectorAll('a')).map(a => a.textContent.trim());
        return {
          desktopDisplay: window.getComputedStyle(desktopNav).display,
          mobileDisplay: window.getComputedStyle(mobileNav).display,
          linkOrder: links
        };
      })()`,
      returnByValue: true
    });
    console.log('Desktop layout check:', desktopCheck.result.value);

    if (desktopCheck.result.value.desktopDisplay !== 'flex') {
      throw new Error('Desktop nav should be display:flex on desktop');
    }
    if (desktopCheck.result.value.mobileDisplay !== 'none') {
      throw new Error('Mobile nav wrapper should be display:none on desktop');
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
