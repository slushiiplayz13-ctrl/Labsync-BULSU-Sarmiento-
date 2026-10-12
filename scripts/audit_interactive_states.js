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

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9577;
  const tempProfile = path.join(__dirname, '..', 'tests', 'temp-chrome-audit-dyn-' + Date.now());

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

    const dynamicDefects = [];

    // Helper to evaluate and check page
    async function evaluateInteractiveCheck(testName, pageFile, role, setupFn) {
      console.log(`\nTesting Interactive: [${testName}] on ${pageFile}...`);

      const fileUrl = 'file:///' + path.join(__dirname, '..', pageFile).replace(/\\/g, '/');

      await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
        source: `
          (function() {
            try {
              const role = ${JSON.stringify(role)};
              if (role) {
                const userObj = { id: 1, name: 'Test ' + role, email: 'test@bulsu.edu.ph', role: role, Role: role };
                localStorage.setItem('user', JSON.stringify(userObj));
                localStorage.setItem('labsync_last_activity', Date.now().toString());
                sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
              }
              sessionStorage.setItem('labsync_verified_student', JSON.stringify({
                verificationToken: 'test-tok',
                studentName: 'ANDREI A GABITO',
                studentNumber: '2023500492',
                room: '203',
                pc: '04'
              }));
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

        // Execute interaction setup
        const triggerRes = await send(pWs, 'Runtime.evaluate', {
          expression: `(${setupFn.toString()})()`,
          returnByValue: true
        });

        await new Promise(r => setTimeout(r, 350));

        // Measure layout after interaction
        const checkRes = await send(pWs, 'Runtime.evaluate', {
          expression: `
            (function() {
              const winW = window.innerWidth;
              const winH = window.innerHeight;
              const html = document.documentElement;
              const body = document.body;
              const scrollW = Math.max(html.scrollWidth, body ? body.scrollWidth : 0);
              const hasHOverflow = scrollW > winW + 1.5;

              // Check visible modal / dropdown / filter containers
              const modalOverlays = Array.from(document.querySelectorAll('.modal, .modal-backdrop, .modal-overlay, #ticketDetailsModal, #completedTicketsModal, #facultyModal, #addKeyModal, #keyDetailModal, #keyApprovalModal, #reportsFilterDropdown, #policiesModal'))
                .filter(el => {
                  const s = window.getComputedStyle(el);
                  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
                });

              const modalIssues = [];
              for (const m of modalOverlays) {
                const mBox = m.querySelector('.modal-container, .modal-content, .completed-modal-container, .reports-filter-dropdown, .policies-modal-box') || m;
                const r = mBox.getBoundingClientRect();
                const fitsWidth = r.width <= winW + 2 && r.left >= -2 && r.right <= winW + 2;
                const closeBtn = m.querySelector('.close-btn, .modal-close-btn, .btn-close-modal, #close-modal-btn, [data-action="close"], .btn-close');
                const closeBtnVisible = closeBtn ? (function() {
                  const cr = closeBtn.getBoundingClientRect();
                  return cr.width > 0 && cr.height > 0 && cr.right <= winW && cr.left >= 0 && cr.top >= 0 && cr.bottom <= winH;
                })() : true;

                if (!fitsWidth || r.right > winW + 2) {
                  modalIssues.push({
                    name: mBox.className || mBox.id,
                    width: Math.round(r.width),
                    winW,
                    right: Math.round(r.right),
                    overflow: Math.round(r.right - winW),
                    closeBtnVisible
                  });
                }
              }

              // Check buttons touch targets (< 32px height)
              const smallButtons = [];
              const interactiveBtns = document.querySelectorAll('button:not([hidden]), .btn:not([hidden])');
              for (const b of interactiveBtns) {
                const s = window.getComputedStyle(b);
                if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
                const br = b.getBoundingClientRect();
                if (br.width > 0 && br.height > 0 && (br.height < 28 || br.width < 28)) {
                  smallButtons.push({
                    id: b.id || b.className,
                    text: (b.textContent || '').trim().slice(0, 20),
                    w: Math.round(br.width),
                    h: Math.round(br.height)
                  });
                }
              }

              // Check inputs / textareas overflowing their containers
              const overflowingInputs = [];
              const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
              for (const inp of inputs) {
                const s = window.getComputedStyle(inp);
                if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
                const ir = inp.getBoundingClientRect();
                if (ir.right > winW + 2) {
                  overflowingInputs.push({
                    name: inp.id || inp.name || inp.className,
                    right: Math.round(ir.right),
                    winW,
                    diff: Math.round(ir.right - winW)
                  });
                }
              }

              return {
                winW,
                winH,
                scrollW,
                hasHOverflow,
                modalOverlaysCount: modalOverlays.length,
                modalIssues,
                overflowingInputs,
                smallButtonsCount: smallButtons.length,
                smallButtons: smallButtons.slice(0, 3)
              };
            })()
          `,
          returnByValue: true
        });

        const res = checkRes && checkRes.result ? checkRes.result.value : null;
        if (res) {
          if (res.hasHOverflow || (res.modalIssues && res.modalIssues.length > 0) || (res.overflowingInputs && res.overflowingInputs.length > 0)) {
            console.log(`  ❌ [${vp.name}] Defect found:`, {
              hOverflow: res.hasHOverflow ? `scrollWidth ${res.scrollW}px vs ${res.winW}px` : false,
              modalIssues: res.modalIssues,
              overflowingInputs: res.overflowingInputs
            });
            dynamicDefects.push({
              test: testName,
              file: pageFile,
              viewport: vp.name,
              width: vp.width,
              res
            });
          } else {
            // pass
          }
        }
      }
    }

    // 1. Test PC Reports Filters Panel opened on it-head-pc-reports.html
    await evaluateInteractiveCheck(
      'PC Reports Filter Panel Open',
      'it-head-pc-reports.html',
      'IT Department Head',
      function() {
        const btn = document.getElementById('reportsFilterToggleBtn');
        if (btn) btn.click();
        const drop = document.getElementById('reportsFilterDropdown');
        if (drop) drop.classList.add('active', 'show', 'open');
      }
    );

    // 2. Test Completed Tickets Modal opened on it-head-pc-reports.html
    await evaluateInteractiveCheck(
      'Completed Tickets Modal Open',
      'it-head-pc-reports.html',
      'IT Department Head',
      function() {
        const modal = document.getElementById('completedTicketsModal');
        if (modal) {
          modal.style.display = 'flex';
          modal.classList.add('active', 'show', 'open');
        }
      }
    );

    // 3. Test View Ticket Modal with long remarks on it-head-pc-reports.html
    await evaluateInteractiveCheck(
      'View Ticket Modal Details Open',
      'it-head-pc-reports.html',
      'IT Department Head',
      function() {
        if (window.reportModal && window.reportModal.viewTicketModal) {
          window.reportModal.viewTicketModal(101, [{
            Report_ID: 101, Ticket_ID: 101, Issue_ID: 101, PC_Number: 4, Room_Number: '203',
            Student_Name: 'DELA CRUZ, JUAN MIGUEL S.', Student_Number: '2022-123456',
            Status: 'Pending', Priority_Level: 'High',
            Date_Reported: new Date().toISOString(),
            Issue_Description: '[Program: BSIT 3A] [Issues: Monitor, Keyboard, Mouse, Network] Remarks: Extremely long detailed description of the issue that might cause line wrapping or overflow if word-break is not set properly on mobile viewports.',
            reports: [
              { Student_Name: 'DELA CRUZ, JUAN MIGUEL S.', Student_Number: '2022-123456', Date_Reported: new Date().toISOString() },
              { Student_Name: 'SANTOS, MARIA CLARA', Student_Number: '2023-987654', Date_Reported: new Date().toISOString() }
            ]
          }]);
        }
      }
    );

    // 4. Test MIS Maintenance Modal Open on mis-maintenance.html
    await evaluateInteractiveCheck(
      'MIS Maintenance Ticket Modal Open',
      'mis-maintenance.html',
      'MIS Staff',
      function() {
        if (window.maintenanceModal && window.maintenanceModal.openModal) {
          window.maintenanceModal.openModal(101, [{
            Report_ID: 101, Ticket_ID: 101, Issue_ID: 101, PC_Number: 4, Room_Number: '203',
            Student_Name: 'DELA CRUZ, JUAN MIGUEL S.', Student_Number: '2022-123456',
            Status: 'Pending', Priority_Level: 'High',
            Date_Reported: new Date().toISOString(),
            Issue_Description: '[Program: BSIT 3A] [Issues: Monitor] Remarks: Testing long remarks inside MIS modal',
            reports: [{ Student_Name: 'DELA CRUZ, JUAN MIGUEL S.', Student_Number: '2022-123456', Date_Reported: new Date().toISOString() }]
          }]);
        }
      }
    );

    // 5. Test MIS Keys Add Key Modal on mis-keys.html
    await evaluateInteractiveCheck(
      'MIS Keys Add Key Modal Open',
      'mis-keys.html',
      'MIS Staff',
      function() {
        const btn = document.getElementById('addKeyBtn') || document.querySelector('.btn-add-key');
        if (btn) btn.click();
        const m = document.getElementById('addKeyModal') || document.querySelector('#addKeyModal');
        if (m) {
          m.style.display = 'flex';
          m.classList.add('active', 'show', 'open');
        }
      }
    );

    // 6. Test Login Page Policies Modal on login.html
    await evaluateInteractiveCheck(
      'Login Policies Modal Open',
      'login.html',
      null,
      function() {
        const link = document.querySelector('.policies-link, #terms-link, [data-modal="policies"]');
        if (link) link.click();
        const m = document.getElementById('policiesModal') || document.querySelector('.policies-modal-overlay');
        if (m) {
          m.style.display = 'flex';
          m.classList.add('active', 'show', 'open');
        }
      }
    );

    // 7. Test Submit PC Report Step 2 with remarks on submit-pc-report.html
    await evaluateInteractiveCheck(
      'Submit PC Report Step 2 Active',
      'submit-pc-report.html',
      null,
      function() {
        // Toggle Step 2 active
        const step1 = document.getElementById('step-1');
        const step2 = document.getElementById('step-2');
        if (step1 && step2) {
          step1.style.display = 'none';
          step2.style.display = 'block';
        }
      }
    );

    // 8. Test Room Schedule Editor Create Block Panel Drawer on room-schedule-editor.html
    await evaluateInteractiveCheck(
      'Room Schedule Editor Drawer Active',
      'room-schedule-editor.html',
      'IT Department Head',
      function() {
        const dockBtn = document.querySelector('#mobile-editor-dock .dock-btn, .btn-add-block');
        if (dockBtn) dockBtn.click();
        const panel = document.getElementById('create-block-panel');
        if (panel) {
          panel.classList.add('active', 'open');
          panel.style.transform = 'translateY(0)';
          panel.style.opacity = '1';
          panel.style.visibility = 'visible';
        }
      }
    );

    // 9. Test Faculty Management Add Faculty Modal on faculty-management.html
    await evaluateInteractiveCheck(
      'Faculty Management Modal Active',
      'faculty-management.html',
      'IT Department Head',
      function() {
        const btn = document.getElementById('addFacultyBtn') || document.querySelector('.btn-add-faculty');
        if (btn) btn.click();
        const m = document.getElementById('facultyModal');
        if (m) {
          m.style.display = 'flex';
          m.classList.add('active', 'show', 'open');
        }
      }
    );

    fs.writeFileSync(path.join(__dirname, 'interactive-defects.json'), JSON.stringify(dynamicDefects, null, 2));
    console.log(`\n================================================================`);
    console.log(`INTERACTIVE AUDIT FINISHED. Total defects logged: ${dynamicDefects.length}`);
    console.log(`Results saved to scripts/interactive-defects.json`);
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

run().catch(console.error);
