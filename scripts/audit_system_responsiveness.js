const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VIEWPORTS = [
  { name: '320px', width: 320, height: 640, mobile: true },
  { name: '360px', width: 360, height: 740, mobile: true },
  { name: '375px', width: 375, height: 667, mobile: true },
  { name: '390px', width: 390, height: 844, mobile: true },
  { name: '430px', width: 430, height: 932, mobile: true },
  { name: '480px', width: 480, height: 800, mobile: true },
  { name: '768px', width: 768, height: 1024, mobile: false },
  { name: '810px', width: 810, height: 1080, mobile: false },
  { name: '820px', width: 820, height: 1180, mobile: false },
  { name: '834px', width: 834, height: 1194, mobile: false },
  { name: '1024px', width: 1024, height: 768, mobile: false },
  { name: '1280px', width: 1280, height: 800, mobile: false },
  { name: '1440px', width: 1440, height: 900, mobile: false }
];

const PAGES = [
  // Student-facing
  { file: 'submit-pc-report.html', role: null, query: '?room=203&pc=04', name: 'Submit PC Report' },
  { file: 'student-id-verification.html', role: null, query: '?room=203&pc=04', name: 'Student ID Verification' },
  { file: 'key-found.html', role: null, query: '?key=KEY-IT-203-A', name: 'Key Found Public' },

  // Public / Auth
  { file: 'login.html', role: null, query: '', name: 'Login Page' },
  { file: 'terms.html', role: null, query: '', name: 'Terms & Conditions' },
  { file: 'reset-password.html', role: null, query: '', name: 'Reset Password' },

  // IT Department Head
  { file: 'it-head-dashboard.html', role: 'IT Department Head', query: '', name: 'IT Head Dashboard' },
  { file: 'it-head-pc-reports.html', role: 'IT Department Head', query: '', name: 'IT Head PC Reports' },
  { file: 'it-head-room-status.html', role: 'IT Department Head', query: '', name: 'IT Head Room Status' },
  { file: 'it-head-my-schedule.html', role: 'IT Department Head', query: '', name: 'IT Head My Schedule' },
  { file: 'faculty-management.html', role: 'IT Department Head', query: '', name: 'Faculty Management' },
  { file: 'master-schedule.html', role: 'IT Department Head', query: '', name: 'Master Schedule' },
  { file: 'room-schedule-editor.html', role: 'IT Department Head', query: '?room=203', name: 'Room Schedule Editor' },

  // MIS Staff & OJT
  { file: 'mis-staff-dashboard.html', role: 'MIS Staff', query: '', name: 'MIS Staff Dashboard' },
  { file: 'mis-maintenance.html', role: 'MIS Staff', query: '', name: 'MIS Maintenance' },
  { file: 'mis-keys.html', role: 'MIS Staff', query: '', name: 'MIS Keys' },
  { file: 'mis-ojt.html', role: 'MIS Staff', query: '', name: 'MIS OJT Management' },
  { file: 'mis-qr-generator.html', role: 'MIS Staff', query: '', name: 'MIS QR Generator' },

  // Faculty
  { file: 'index.html', role: 'Faculty', query: '', name: 'Faculty Home/Dashboard' },
  { file: 'faculty-pc-reports.html', role: 'Faculty', query: '', name: 'Faculty PC Reports' },
  { file: 'room-status.html', role: 'Faculty', query: '', name: 'Faculty Room Status' },
  { file: 'my-schedule.html', role: 'Faculty', query: '', name: 'Faculty My Schedule' },
  { file: 'key-transfer.html', role: 'Faculty', query: '', name: 'Key Transfer' }
];

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9566;
  const tempProfile = path.join(__dirname, '..', 'tests', 'temp-chrome-audit-res-' + Date.now());

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1500));
    const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const versionData = await versionRes.json();
    const bWs = new WebSocket(versionData.webSocketDebuggerUrl);
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

    const issuesFound = [];
    const matrix = {};

    for (const pageInfo of PAGES) {
      console.log(`\nAuditing page: ${pageInfo.name} (${pageInfo.file})...`);
      matrix[pageInfo.name] = {};

      const fileUrl = 'file:///' + path.join(__dirname, '..', pageInfo.file).replace(/\\/g, '/') + pageInfo.query;

      // Setup page mock environment before navigation
      await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
        source: `
          (function() {
            try {
              const role = ${JSON.stringify(pageInfo.role)};
              if (role) {
                const userObj = {
                  id: 1,
                  name: 'Test ' + role,
                  email: 'test@bulsu.edu.ph',
                  role: role,
                  Role: role,
                  department: 'IT Department'
                };
                localStorage.setItem('user', JSON.stringify(userObj));
                localStorage.setItem('labsync_last_activity', Date.now().toString());
                sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
              } else {
                localStorage.removeItem('user');
                sessionStorage.removeItem('labsync_user');
              }

              // Mock student verification if student page
              sessionStorage.setItem('labsync_verified_student', JSON.stringify({
                verificationToken: 'test-token-res',
                studentName: 'ANDREI A GABITO',
                studentNumber: '2023500492',
                room: '203',
                pc: '04',
                verificationTimestamp: Date.now()
              }));

              // Mock basic API responses so pages don't blank out
              const origFetch = window.fetch;
              window.fetch = async function(url, ...args) {
                if (typeof url === 'string') {
                  if (url.includes('/api/user/current') || url.includes('/api/auth/me')) {
                    return new Response(JSON.stringify({
                      user: pageInfo.role ? { id: 1, name: 'Test ' + pageInfo.role, role: pageInfo.role } : null
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                  }
                  if (url.includes('/api/reports') || url.includes('/api/maintenance')) {
                    return new Response(JSON.stringify({
                      success: true,
                      reports: [
                        {
                          Report_ID: 101, Ticket_ID: 101, Issue_ID: 101, PC_Number: 4, Room_Number: '203',
                          Student_Name: 'Juan Dela Cruz', Student_Number: '2022-123456',
                          Status: 'Pending', Priority_Level: 'High',
                          Date_Reported: new Date().toISOString(),
                          Issue_Description: '[Program: BSIT 3A] [Issues: Monitor] Remarks: Display flickering',
                          reports: [{ Student_Name: 'Juan Dela Cruz', Student_Number: '2022-123456', Date_Reported: new Date().toISOString() }]
                        }
                      ]
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                  }
                  if (url.includes('/api/keys')) {
                    return new Response(JSON.stringify({
                      success: true,
                      keys: [
                        { Key_ID: 1, Key_Code: 'KEY-IT-203-A', Room_Number: '203', Room_Key_Status: 'Present', deviceOnline: true }
                      ],
                      summary: { total: 1, inDock: 1, inUse: 0 }
                    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
                  }
                }
                return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
              };
            } catch(e) {}
          })();
        `
      });

      for (const vp of VIEWPORTS) {
        await send(pWs, 'Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.mobile
        });

        await send(pWs, 'Page.navigate', { url: fileUrl });
        await new Promise(r => setTimeout(r, 600));

        const evalResult = await send(pWs, 'Runtime.evaluate', {
          expression: `
            (function() {
              const html = document.documentElement;
              const body = document.body;
              const winW = window.innerWidth;
              const winH = window.innerHeight;
              const scrollW = Math.max(html.scrollWidth, body ? body.scrollWidth : 0);
              const hasHOverflow = scrollW > winW + 1.5;

              // Find elements sticking out horizontally
              const outOfBounds = [];
              const all = document.querySelectorAll('body *');
              for (const el of all) {
                // Ignore elements with display:none or visibility:hidden
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

                // Check position fixed or absolute outside
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  if (rect.right > winW + 3) {
                    const tag = el.tagName.toLowerCase();
                    const cls = el.className ? (typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : '') : '';
                    const id = el.id ? '#' + el.id : '';
                    outOfBounds.push({
                      selector: tag + id + cls,
                      right: Math.round(rect.right),
                      width: Math.round(rect.width),
                      overflow: Math.round(rect.right - winW)
                    });
                  }
                }
              }

              // Check if sidebar / mobile nav is overlapping or clipped
              const mobileNav = document.querySelector('.mobile-nav, .mobile-header, .top-nav, .sidebar');
              const mobileNavRect = mobileNav ? mobileNav.getBoundingClientRect() : null;

              // Check table containers
              const tables = document.querySelectorAll('table');
              const tableDetails = [];
              for (const t of tables) {
                const parent = t.parentElement;
                const pStyle = parent ? window.getComputedStyle(parent) : null;
                const parentOverflowX = pStyle ? pStyle.overflowX : '';
                const tRect = t.getBoundingClientRect();
                tableDetails.push({
                  width: Math.round(tRect.width),
                  parentHasScroll: parentOverflowX === 'auto' || parentOverflowX === 'scroll',
                  stickingOut: tRect.right > winW + 2
                });
              }

              return {
                winW,
                winH,
                scrollW,
                hasHOverflow,
                outOfBoundsCount: outOfBounds.length,
                topOutOfBounds: outOfBounds.slice(0, 5),
                tablesCount: tables.length,
                tableDetails
              };
            })()
          `,
          returnByValue: true
        });

        const res = evalResult && evalResult.result ? evalResult.result.value : null;
        if (res) {
          matrix[pageInfo.name][vp.name] = {
            hasHOverflow: res.hasHOverflow,
            scrollW: res.scrollW,
            winW: res.winW,
            outOfBoundsCount: res.outOfBoundsCount,
            topOutOfBounds: res.topOutOfBounds
          };

          if (res.hasHOverflow) {
            console.log(`  ❌ [${vp.name}] OVERFLOW: scrollWidth=${res.scrollW}px vs viewport=${res.winW}px (+${res.scrollW - res.winW}px)`);
            if (res.topOutOfBounds && res.topOutOfBounds.length > 0) {
              console.log(`     Elements:`, res.topOutOfBounds.map(e => `${e.selector} (+${e.overflow}px)`).join(', '));
            }
            issuesFound.push({
              page: pageInfo.name,
              file: pageInfo.file,
              viewport: vp.name,
              width: vp.width,
              scrollW: res.scrollW,
              diff: res.scrollW - res.winW,
              elements: res.topOutOfBounds
            });
          } else {
            // passed
          }
        }
      }
    }

    fs.writeFileSync(path.join(__dirname, 'audit-summary.json'), JSON.stringify({ issuesFound, matrix }, null, 2));
    console.log(`\n================================================================`);
    console.log(`AUDIT FINISHED. Total horizontal overflow issues logged: ${issuesFound.length}`);
    console.log(`Results saved to scripts/audit-summary.json`);
    console.log(`================================================================\n`);

    pWs.close();
    bWs.close();
  } finally {
    chromeProc.kill();
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch (_) {}
  }
}

main().catch(console.error);
