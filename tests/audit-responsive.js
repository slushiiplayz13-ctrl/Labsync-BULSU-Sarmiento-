const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VIEWPORTS = [
  { name: '320_mobile', width: 320, height: 800, mobile: true },
  { name: '360_mobile', width: 360, height: 800, mobile: true },
  { name: '375_mobile', width: 375, height: 812, mobile: true },
  { name: '390_mobile', width: 390, height: 844, mobile: true },
  { name: '430_mobile', width: 430, height: 932, mobile: true },
  { name: '480_mobile', width: 480, height: 854, mobile: true },
  { name: '768_tablet', width: 768, height: 1024, mobile: false },
  { name: '810_tablet', width: 810, height: 1080, mobile: false },
  { name: '820_tablet', width: 820, height: 1180, mobile: false },
  { name: '834_tablet', width: 834, height: 1194, mobile: false },
  { name: '1024_landscape', width: 1024, height: 768, mobile: false },
  { name: '1280_desktop', width: 1280, height: 800, mobile: false },
  { name: '1440_desktop', width: 1440, height: 900, mobile: false }
];

async function runAudit() {
  const screenshotsDir = path.join(__dirname, 'audit-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9599;
  const tempProfile = path.join(__dirname, 'temp-chrome-audit-' + Date.now());

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

    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        sessionStorage.setItem('labsync_verified_student', JSON.stringify({
          verificationToken: 'test-token-audit',
          studentName: 'ANDREI A GABITO',
          studentNumber: '2023500492',
          room: '203',
          pc: '04',
          verificationTimestamp: Date.now()
        }));
      `
    });

    const pages = [
      { name: 'verify', file: 'student-id-verification.html', query: '?room=203&pc=04' },
      { name: 'report', file: 'submit-pc-report.html', query: '?room=203&pc=04' }
    ];

    const auditResults = { verify: {}, report: {} };

    for (const pageInfo of pages) {
      const fileUrl = 'file:///' + path.join(__dirname, '..', pageInfo.file).replace(/\\/g, '/') + pageInfo.query;
      auditResults[pageInfo.name] = {};

      for (const vp of VIEWPORTS) {
        await send(pWs, 'Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 2,
          mobile: vp.mobile
        });

        await send(pWs, 'Page.navigate', { url: fileUrl });
        await new Promise(r => setTimeout(r, 1200));

        // Evaluate DOM responsive health
        const domHealth = await send(pWs, 'Runtime.evaluate', {
          expression: `
            (function() {
              const body = document.body;
              const html = document.documentElement;
              const winWidth = window.innerWidth;
              const docScrollWidth = Math.max(html.scrollWidth, body.scrollWidth);
              const hasHScroll = docScrollWidth > winWidth + 1;

              // Find any elements sticking out past viewport width
              const overflowingElements = [];
              const allElements = document.querySelectorAll('*');
              for (const el of allElements) {
                const r = el.getBoundingClientRect();
                if (r.right > winWidth + 2 && el.tagName !== 'HTML' && el.tagName !== 'BODY') {
                  const idOrCls = el.id ? '#' + el.id : (el.className ? '.' + el.className.toString().split(' ')[0] : el.tagName);
                  overflowingElements.push({
                    tag: el.tagName,
                    selector: idOrCls,
                    right: Math.round(r.right),
                    winWidth,
                    diff: Math.round(r.right - winWidth)
                  });
                }
              }

              const card = document.querySelector('.form-card');
              const cardRect = card ? card.getBoundingClientRect() : null;
              const infoBox = document.querySelector('.info-header-box');
              const infoBoxRect = infoBox ? infoBox.getBoundingClientRect() : null;
              const stepBar = document.querySelector('.step-indicator-bar');
              const stepBarRect = stepBar ? stepBar.getBoundingClientRect() : null;
              const appContainer = document.querySelector('.app-container');
              const appContainerRect = appContainer ? appContainer.getBoundingClientRect() : null;

              // Check equipment cards if on report page
              const eqGrid = document.querySelector('.equipment-list, .equipment-grid');
              const eqCards = Array.from(document.querySelectorAll('.equipment-card')).map(c => {
                const r = c.getBoundingClientRect();
                return { width: Math.round(r.width), right: Math.round(r.right) };
              });

              return {
                winWidth,
                docScrollWidth,
                hasHScroll,
                overflowCount: overflowingElements.length,
                overflowingElements: overflowingElements.slice(0, 5),
                appContainerWidth: appContainerRect ? Math.round(appContainerRect.width) : null,
                cardWidth: cardRect ? Math.round(cardRect.width) : null,
                cardPadding: card ? window.getComputedStyle(card).padding : null,
                infoBoxWidth: infoBoxRect ? Math.round(infoBoxRect.width) : null,
                infoBoxColumns: infoBox ? window.getComputedStyle(infoBox).gridTemplateColumns : null,
                stepBarWidth: stepBarRect ? Math.round(stepBarRect.width) : null,
                eqCardsCount: eqCards.length,
                firstCardWidth: eqCards.length > 0 ? eqCards[0].width : null
              };
            })()
          `,
          returnByValue: true
        });

        auditResults[pageInfo.name][vp.name] = domHealth.result.value;

        // Capture screenshot
        const shot = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
        const shotName = `${pageInfo.name}_${vp.name}.png`;
        fs.writeFileSync(path.join(screenshotsDir, shotName), Buffer.from(shot.data, 'base64'));
      }
    }

    fs.writeFileSync(path.join(__dirname, 'audit-results.json'), JSON.stringify(auditResults, null, 2));
    console.log('AUDIT COMPLETED. Results written to tests/audit-results.json');

    pWs.close();
    bWs.close();
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (_) {}
  }
}

runAudit().catch(console.error);
