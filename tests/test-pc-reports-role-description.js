/**
 * tests/test-pc-reports-role-description.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification suite for PC Reports role-aware descriptions & permissions:
 * 1. Unit & Static HTML verification:
 *    - Department Head: "Review reported computer issues and follow up on unresolved maintenance concerns across IT labs."
 *    - Program Coordinator: "View and monitor reported computer issues and maintenance requests across IT labs."
 *    - Faculty: "View and monitor reported computer issues and maintenance requests across IT labs."
 * 2. Headless Chrome UI verification:
 *    - Evaluates live DOM greetingSub text for all 3 roles.
 *    - Verifies Department Head Follow Up button presence on reports.
 *    - Verifies Program Coordinator & Faculty view-only behavior (no Follow Up button).
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const EXPECTED_DEPT_HEAD = 'Review reported computer issues and follow up on unresolved maintenance concerns across IT labs.';
const EXPECTED_PC = 'View and monitor reported computer issues and maintenance requests across IT labs.';
const EXPECTED_FACULTY = 'View and monitor reported computer issues and maintenance requests across IT labs.';

async function findChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome executable not found');
}

let msgId = 1;
function send(ws, method, params = {}) {
  return new Promise((resolve) => {
    const curId = msgId++;
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

async function testRoleUI(bWs, cdpPort, role, pageUrl, expectedDescription, screenshotName, artifactsDir) {
  const newTab = await send(bWs, 'Target.createTarget', { url: 'about:blank' });
  const pWs = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/${newTab.targetId}`);
  await new Promise((res) => pWs.onopen = res);

  await send(pWs, 'Page.enable');
  await send(pWs, 'Runtime.enable');
  await send(pWs, 'DOM.enable');

  const u = {
    User_ID: 101,
    Name: role === 'IT Dept. Head' ? 'Andrei Gabito' : (role === 'Program Coordinator' ? 'Juan Dela Cruz' : 'Maria Santos'),
    Role: role,
    Email: 'test@labsync.com',
    Status: 'ACTIVE'
  };

  const sampleReports = [
    {
      Report_ID: 101,
      Room_Number: '203',
      PC_Number: 5,
      Status: 'Pending',
      Issue_Type: 'Monitor',
      Issue_Description: 'Monitor flickering during laboratory classes',
      Date_Reported: new Date().toISOString(),
      Follow_Up_Count: 0,
      Followed_Up_Today: false
    }
  ];

  await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const u = ${JSON.stringify(u)};
        const reps = ${JSON.stringify(sampleReports)};
        localStorage.setItem('user', JSON.stringify(u));
        sessionStorage.setItem('labsync_user', JSON.stringify(u));
        localStorage.setItem('labsync_last_activity', Date.now().toString());

        const origFetch = window.fetch;
        window.fetch = async function(url, ...args) {
          if (typeof url === 'string') {
            if (url.includes('/api/user/current') || url.includes('/api/auth/me')) {
              return new Response(JSON.stringify({ user: u }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.includes('/api/reports')) {
              return new Response(JSON.stringify(reps), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
          }
          return origFetch.apply(this, [url, ...args]);
        };
      } catch(e) {}
    `
  });

  await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send(pWs, 'Page.navigate', { url: pageUrl });
  await new Promise(r => setTimeout(r, 1600));

  const subVal = await send(pWs, 'Runtime.evaluate', {
    expression: `document.getElementById('greetingSub')?.textContent?.trim()`,
    returnByValue: true
  });

  console.log(`[${role}] Description:`, subVal.result.value);
  assert.strictEqual(subVal.result.value, expectedDescription, `Role ${role} must match expected description`);

  // Verify Follow Up button rules
  const followUpBtnCount = await send(pWs, 'Runtime.evaluate', {
    expression: `document.querySelectorAll('.btn-card-followup').length`,
    returnByValue: true
  });

  if (role === 'IT Dept. Head') {
    assert.ok(followUpBtnCount.result.value >= 1, 'Department Head MUST see the Follow Up button on pending reports');
    console.log(`✔ PASS: [${role}] Follow Up action button verified visible.`);
  } else {
    assert.strictEqual(followUpBtnCount.result.value, 0, `${role} MUST NOT see any Follow Up buttons`);
    console.log(`✔ PASS: [${role}] Strictly view/monitor only (0 Follow Up buttons).`);
  }

  const snap = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactsDir, screenshotName), Buffer.from(snap.data, 'base64'));
  console.log(`✔ Saved ${screenshotName}`);

  pWs.close();
  await send(bWs, 'Target.closeTarget', { targetId: newTab.targetId });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST: PC REPORTS ROLE-AWARE DESCRIPTION & PERMISSIONS');
  console.log('================================================================\n');

  // ─── 1. Static HTML & File Audits ──────────────────────────────────────────
  console.log('--- 1. Testing Static HTML Content ---');
  const itHeadHtml = fs.readFileSync(path.join(__dirname, '..', 'it-head-pc-reports.html'), 'utf8');
  const facultyHtml = fs.readFileSync(path.join(__dirname, '..', 'faculty-pc-reports.html'), 'utf8');
  const controllerJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.controller.js'), 'utf8');

  assert.ok(itHeadHtml.includes(EXPECTED_DEPT_HEAD), 'it-head-pc-reports.html must include Department Head description');
  assert.ok(itHeadHtml.includes(EXPECTED_PC), 'it-head-pc-reports.html must include Program Coordinator fallback description');
  assert.ok(facultyHtml.includes(EXPECTED_FACULTY), 'faculty-pc-reports.html must include Faculty description');
  assert.ok(controllerJs.includes('updateRoleGreetingDescription'), 'report.controller.js must define updateRoleGreetingDescription');
  assert.ok(!itHeadHtml.includes('Track and manage computer issues and maintenance requests across IT labs.'), 'Old description must not exist in it-head-pc-reports.html');
  assert.ok(!facultyHtml.includes('Track and manage computer issues and maintenance requests.'), 'Old description must not exist in faculty-pc-reports.html');
  console.log('✔ PASS: Static files correctly updated and contain zero legacy description text.');

  // ─── 2. Headless Chrome UI Verification Across 3 Roles ─────────────────────
  console.log('\n--- 2. Testing Live UI Render Across Roles in Headless Chrome ---');
  const chromePath = await findChromePath();
  const cdpPort = 9224;
  const tempProfile = path.join(__dirname, '..', `.temp-chrome-pcrep-${Date.now()}`);

  const proc = spawn(chromePath, [
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfile}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let bWs = null;

  try {
    await new Promise(r => setTimeout(r, 1500));
    const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
    const versionInfo = await versionRes.json();
    bWs = new WebSocket(versionInfo.webSocketDebuggerUrl);
    await new Promise((res) => bWs.onopen = res);

    const artifactsDir = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\30944a82-d643-49d4-8166-933354fafed3';

    // Test A: Department Head (it-head-pc-reports.html)
    console.log('\nTesting Role: IT Dept. Head...');
    await testRoleUI(
      bWs,
      cdpPort,
      'IT Dept. Head',
      'http://localhost:3000/it-head-pc-reports.html',
      EXPECTED_DEPT_HEAD,
      'pc-reports-dept-head.png',
      artifactsDir
    );

    // Test B: Program Coordinator (it-head-pc-reports.html)
    console.log('\nTesting Role: Program Coordinator...');
    await testRoleUI(
      bWs,
      cdpPort,
      'Program Coordinator',
      'http://localhost:3000/it-head-pc-reports.html',
      EXPECTED_PC,
      'pc-reports-program-coordinator.png',
      artifactsDir
    );

    // Test C: Faculty (faculty-pc-reports.html)
    console.log('\nTesting Role: Faculty...');
    await testRoleUI(
      bWs,
      cdpPort,
      'Faculty',
      'http://localhost:3000/faculty-pc-reports.html',
      EXPECTED_FACULTY,
      'pc-reports-faculty.png',
      artifactsDir
    );

    bWs.close();
  } finally {
    try { proc.kill(); } catch (e) {}
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n================================================================');
  console.log('🎉 ALL PC REPORTS ROLE-AWARE DESCRIPTION CHECKS PASSED 100%!');
  console.log('================================================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
