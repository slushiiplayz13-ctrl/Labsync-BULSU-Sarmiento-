'use strict';

/**
 * tests/test-pc-reports-quick-filters.js
 * Comprehensive Verification Suite for PC Reports Quick Status Filters (Pending & Ongoing Repair).
 *
 * Verifies:
 * 1. Both buttons render on Department Head & Program Coordinator view (it-head-pc-reports.html)
 * 2. Both buttons render on Faculty view (faculty-pc-reports.html)
 * 3. Clicking Pending displays only Pending reports
 * 4. Clicking Ongoing Repair displays only Ongoing Repair reports (canonical In Progress)
 * 5. Switching between the two filters updates visible records correctly without page reload
 * 6. Clearing the status filter (toggle or clear button) restores the appropriate report list
 * 7. Existing search, room, and other filters work seamlessly alongside the quick filters
 * 8. Resolved reports remain excluded from these two status views
 * 9. The selected filter continues to work after report data is rerendered or refreshed
 * 10. IT Department Head Follow Up button remains available only to authorized role
 * 11. Program Coordinator and Faculty remain read-only
 * 12. Clicking a filter never mutates stored report status or sends update requests
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

console.log('================================================================');
console.log('🧪 Starting PC Reports Quick Status Filters Verification Suite');
console.log('================================================================\n');

// ────────────────────────────────────────────────────────────────
// Section 1: Static HTML & CSS Invariant Checks
// ────────────────────────────────────────────────────────────────
console.log('--- 1. Static HTML & CSS Invariant Checks ---');

const itHeadHtml = fs.readFileSync(path.join(__dirname, '../it-head-pc-reports.html'), 'utf8');
const facultyHtml = fs.readFileSync(path.join(__dirname, '../faculty-pc-reports.html'), 'utf8');
const reportCardsCss = fs.readFileSync(path.join(__dirname, '../css/components/report-cards.css'), 'utf8');
const controllerJs = fs.readFileSync(path.join(__dirname, '../js/reports/report.controller.js'), 'utf8');

let passedCount = 0;
let failedCount = 0;

function reportPass(msg) {
  console.log(`  ✅ PASS: ${msg}`);
  passedCount++;
}

function reportFail(msg, detail) {
  console.error(`  ❌ FAIL: ${msg}`);
  if (detail) console.error(`     ${detail}`);
  failedCount++;
}

// Check it-head-pc-reports.html
assert.ok(itHeadHtml.includes('id="quickStatusFilters"'), 'it-head-pc-reports.html must have #quickStatusFilters');
assert.ok(itHeadHtml.includes('id="quickFilterAll"'), 'it-head-pc-reports.html must have #quickFilterAll');
assert.ok(itHeadHtml.includes('id="quickFilterPending"'), 'it-head-pc-reports.html must have #quickFilterPending');
assert.ok(itHeadHtml.includes('id="quickFilterOngoing"'), 'it-head-pc-reports.html must have #quickFilterOngoing');
assert.ok(itHeadHtml.includes('id="quickFilterClear"'), 'it-head-pc-reports.html must have #quickFilterClear');
reportPass('it-head-pc-reports.html contains quick status filter container and buttons');

// Check faculty-pc-reports.html
assert.ok(facultyHtml.includes('id="quickStatusFilters"'), 'faculty-pc-reports.html must have #quickStatusFilters');
assert.ok(facultyHtml.includes('id="quickFilterAll"'), 'faculty-pc-reports.html must have #quickFilterAll');
assert.ok(facultyHtml.includes('id="quickFilterPending"'), 'faculty-pc-reports.html must have #quickFilterPending');
assert.ok(facultyHtml.includes('id="quickFilterOngoing"'), 'faculty-pc-reports.html must have #quickFilterOngoing');
assert.ok(facultyHtml.includes('id="quickFilterClear"'), 'faculty-pc-reports.html must have #quickFilterClear');
reportPass('faculty-pc-reports.html contains quick status filter container and buttons');

// Check report-cards.css
assert.ok(reportCardsCss.includes('.reports-quick-filters'), 'CSS must style .reports-quick-filters');
assert.ok(reportCardsCss.includes('.btn-quick-filter'), 'CSS must style .btn-quick-filter');
assert.ok(reportCardsCss.includes('data-status="Pending"'), 'CSS must style Pending quick filter button');
assert.ok(reportCardsCss.includes('data-status="In Progress"'), 'CSS must style Ongoing Repair quick filter button');
assert.ok(reportCardsCss.includes('html.dark-mode .btn-quick-filter') || reportCardsCss.includes('body.dark-mode .btn-quick-filter'), 'CSS must support dark mode for quick filters');
reportPass('report-cards.css contains styling, active states, and dark mode for quick status filters');

// Check report.controller.js
assert.ok(controllerJs.includes('function setQuickStatusFilter'), 'Controller must define setQuickStatusFilter');
assert.ok(controllerJs.includes('function clearStatusFilter'), 'Controller must define clearStatusFilter');
assert.ok(controllerJs.includes('quickFilterPending'), 'Controller must reference quickFilterPending');
assert.ok(controllerJs.includes('quickFilterOngoing'), 'Controller must reference quickFilterOngoing');
reportPass('report.controller.js contains setQuickStatusFilter, clearStatusFilter, and event bindings');

// ────────────────────────────────────────────────────────────────
// Section 2: Headless Chrome DevTools Protocol (CDP) Runtime UI Verification
// ────────────────────────────────────────────────────────────────
console.log('\n--- 2. Headless Chrome DevTools Protocol (CDP) Runtime UI Verification ---');

const mockDataset = [
  {
    Report_ID: 501,
    Room_Number: '203',
    PC_Number: 1,
    Student_Name: 'John Doe',
    Student_Number: '2023-1001',
    Status: 'Pending',
    Issue_Type: 'Mouse',
    Priority_Level: 'Medium',
    Date_Reported: '2026-10-15T08:00:00Z',
    Issue_Description: '[Program & Section: BSIT-3A] [Issues: Mouse] Remarks: Mouse pointer jumps erratically.'
  },
  {
    Report_ID: 502,
    Room_Number: '203',
    PC_Number: 2,
    Student_Name: 'Jane Smith',
    Student_Number: '2023-1002',
    Status: 'In Progress',
    Display_Status: 'Ongoing Repair',
    Issue_Type: 'Keyboard',
    Priority_Level: 'High',
    Date_Reported: '2026-10-15T09:00:00Z',
    Issue_Description: '[Program & Section: BSIT-3A] [Issues: Keyboard] Remarks: Spacebar stuck.'
  },
  {
    Report_ID: 503,
    Room_Number: '204',
    PC_Number: 5,
    Student_Name: 'Alex Cruz',
    Student_Number: '2023-1003',
    Status: 'Pending',
    Issue_Type: 'Monitor',
    Priority_Level: 'Medium',
    Date_Reported: '2026-10-15T10:00:00Z',
    Issue_Description: '[Program & Section: BSIT-3B] [Issues: Monitor] Remarks: Display flickering.'
  },
  {
    Report_ID: 504,
    Room_Number: '204',
    PC_Number: 8,
    Student_Name: 'Chris Evans',
    Student_Number: '2023-1004',
    Status: 'Resolved',
    Issue_Type: 'System Unit',
    Priority_Level: 'Low',
    Date_Reported: '2026-10-14T11:00:00Z',
    Resolved_At: '2026-10-15T12:00:00Z',
    Resolved_By: 'MIS Staff',
    Issue_Description: '[Program & Section: BSIT-3B] [Issues: System Unit] Remarks: Boot failure fixed.'
  }
];

const ROLES_TO_TEST = [
  { name: 'IT Dept. Head', page: 'it-head-pc-reports.html', role: 'IT Dept. Head', expectFollowUp: true },
  { name: 'Program Coordinator', page: 'it-head-pc-reports.html', role: 'Program Coordinator', expectFollowUp: false },
  { name: 'Faculty', page: 'faculty-pc-reports.html', role: 'Faculty', expectFollowUp: false }
];

async function runCdpTests() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9248;
  const proc = spawn(chromePath, ['--remote-debugging-port=' + port, '--headless=new', '--no-sandbox'], { stdio: 'ignore' });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    try {
      const res = await new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:' + port + '/json/version', r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      wsUrl = res.webSocketDebuggerUrl;
      break;
    } catch (e) {
      await sleep(200);
    }
  }

  if (!wsUrl) {
    proc.kill();
    throw new Error('Could not connect to Headless Chrome remote debugging port.');
  }

  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);
  let msgId = 1;
  const send = (m, p = {}) => new Promise(res => {
    const curId = msgId++;
    const h = e => {
      const d = JSON.parse(e.data);
      if (d.id === curId) { ws.removeEventListener('message', h); res(d.result); }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: curId, method: m, params: p }));
  });

  const target = await send('Target.createTarget', { url: 'about:blank' });
  const pageWs = new WebSocket('ws://127.0.0.1:' + port + '/devtools/page/' + target.targetId);
  await new Promise(r => pageWs.onopen = r);

  const sendPage = (m, p = {}) => new Promise(res => {
    const curId = msgId++;
    const h = e => {
      const d = JSON.parse(e.data);
      if (d.id === curId) { pageWs.removeEventListener('message', h); res(d.result); }
    };
    pageWs.addEventListener('message', h);
    pageWs.send(JSON.stringify({ id: curId, method: m, params: p }));
  });

  await sendPage('Page.enable');
  await sendPage('Runtime.enable');

  try {
    for (const roleConfig of ROLES_TO_TEST) {
      console.log(`\nTesting Role: [${roleConfig.name}] on ${roleConfig.page}`);

      // Track any mutation requests (PUT/PATCH/POST/DELETE to /api/reports)
      await sendPage('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          try {
            const userObj = { role: '${roleConfig.role}', name: 'Test ${roleConfig.name}', email: 'test@bulsu.edu.ph' };
            localStorage.setItem('user', JSON.stringify(userObj));
            localStorage.setItem('labsync_last_activity', Date.now().toString());
            sessionStorage.setItem('labsync_user', JSON.stringify(userObj));

            window.__networkReportMutations = [];
            const origFetch = window.fetch;
            window.fetch = async function(url, opts = {}) {
              const method = (opts.method || 'GET').toUpperCase();
              if (typeof url === 'string') {
                if (url.includes('/api/user/current')) {
                  return new Response(JSON.stringify({ user: userObj }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                  });
                }
                if (url.includes('/api/reports')) {
                  if (method !== 'GET') {
                    window.__networkReportMutations.push({ url, method, body: opts.body });
                  }
                  return new Response(JSON.stringify(${JSON.stringify(mockDataset)}), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                  });
                }
              }
              return origFetch.apply(this, [url, opts]);
            };
          } catch(e) {}
        `
      });

      await sendPage('Page.navigate', { url: `http://localhost:3000/${roleConfig.page}` });
      await sleep(1200);

      // 1. Initial State Verification: both buttons visible, inactive
      const initialEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            const aBtn = document.getElementById('quickFilterAll');
            const pBtn = document.getElementById('quickFilterPending');
            const oBtn = document.getElementById('quickFilterOngoing');
            const cBtn = document.getElementById('quickFilterClear');
            const cards = document.querySelectorAll('.report-card');
            const activeHeader = document.querySelector('.active-section h4');

            return {
              aBtnExists: !!aBtn,
              aBtnText: aBtn ? aBtn.textContent.trim() : '',
              aBtnActive: aBtn ? aBtn.classList.contains('active') : false,
              aBtnAriaPressed: aBtn ? aBtn.getAttribute('aria-pressed') : null,
              pBtnExists: !!pBtn,
              pBtnText: pBtn ? pBtn.textContent.trim() : '',
              pBtnActive: pBtn ? pBtn.classList.contains('active') : false,
              pBtnAriaPressed: pBtn ? pBtn.getAttribute('aria-pressed') : null,
              oBtnExists: !!oBtn,
              oBtnText: oBtn ? oBtn.textContent.trim() : '',
              oBtnActive: oBtn ? oBtn.classList.contains('active') : false,
              oBtnAriaPressed: oBtn ? oBtn.getAttribute('aria-pressed') : null,
              cBtnDisplayed: cBtn ? cBtn.style.display !== 'none' : false,
              cardCount: cards.length,
              activeSectionText: activeHeader ? activeHeader.textContent.trim() : ''
            };
          })()
        `
      });

      const initVal = initialEval.result.value;
      assert.strictEqual(initVal.aBtnExists, true, 'All Tickets button must exist');
      assert.ok(initVal.aBtnText.includes('All Tickets'), 'All Tickets button text must be All Tickets');
      assert.strictEqual(initVal.aBtnActive, true, 'All Tickets button initially active');
      assert.strictEqual(initVal.aBtnAriaPressed, 'true', 'All Tickets button aria-pressed initially true');

      assert.strictEqual(initVal.pBtnExists, true, 'Pending button must exist');
      assert.ok(initVal.pBtnText.includes('Pending'), 'Pending button text must be Pending');
      assert.strictEqual(initVal.pBtnActive, false, 'Pending button initially inactive');
      assert.strictEqual(initVal.pBtnAriaPressed, 'false', 'Pending button aria-pressed initially false');

      assert.strictEqual(initVal.oBtnExists, true, 'Ongoing Repair button must exist');
      assert.ok(initVal.oBtnText.includes('Ongoing Repair'), 'Ongoing Repair button text must be Ongoing Repair');
      assert.strictEqual(initVal.oBtnActive, false, 'Ongoing Repair button initially inactive');
      assert.strictEqual(initVal.oBtnAriaPressed, 'false', 'Ongoing Repair button aria-pressed initially false');
      assert.strictEqual(initVal.cBtnDisplayed, false, 'Clear Status button initially hidden');
      assert.strictEqual(initVal.cardCount, 3, 'Initial active cards count must be 3 (excluding Resolved Report 504)');
      reportPass(`[${roleConfig.name}]: All Tickets starts active, and Pending & Ongoing Repair start inactive`);

      // 2. Click Pending Quick Filter
      const pendingClickEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            document.getElementById('quickFilterPending').click();
            const pBtn = document.getElementById('quickFilterPending');
            const oBtn = document.getElementById('quickFilterOngoing');
            const cBtn = document.getElementById('quickFilterClear');
            const cards = document.querySelectorAll('.report-card');
            const activeHeader = document.querySelector('.active-section h4');
            const dropdownStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';

            const cardStatuses = Array.from(cards).map(c => {
              const b = c.querySelector('.status-badge');
              return b ? b.textContent.trim().toUpperCase() : '';
            });

            return {
              pBtnActive: pBtn.classList.contains('active'),
              pBtnAriaPressed: pBtn.getAttribute('aria-pressed'),
              oBtnActive: oBtn.classList.contains('active'),
              cBtnDisplayed: cBtn.style.display !== 'none',
              cardCount: cards.length,
              cardStatuses,
              activeSectionText: activeHeader ? activeHeader.textContent.trim() : '',
              dropdownStatus
            };
          })()
        `
      });

      const pVal = pendingClickEval.result.value;
      assert.strictEqual(pVal.pBtnActive, true, 'Pending button must be active');
      assert.strictEqual(pVal.pBtnAriaPressed, 'true', 'Pending button aria-pressed must be true');
      assert.strictEqual(pVal.oBtnActive, false, 'Ongoing Repair button must remain inactive');
      assert.strictEqual(pVal.cBtnDisplayed, true, 'Clear Status button must be visible when filter active');
      assert.strictEqual(pVal.cardCount, 2, 'Pending view must display exactly 2 Pending cards (501 and 503)');
      assert.ok(pVal.cardStatuses.every(s => s === 'PENDING'), 'All displayed cards must have PENDING status badge');
      assert.strictEqual(pVal.dropdownStatus, 'Pending', 'Dropdown status select must synchronize to Pending');
      reportPass(`[${roleConfig.name}]: Clicking Pending displays only Pending reports (excludes Ongoing & Resolved)`);

      // 3. Switch directly to Ongoing Repair Quick Filter
      const ongoingClickEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            document.getElementById('quickFilterOngoing').click();
            const pBtn = document.getElementById('quickFilterPending');
            const oBtn = document.getElementById('quickFilterOngoing');
            const cBtn = document.getElementById('quickFilterClear');
            const cards = document.querySelectorAll('.report-card');
            const activeHeader = document.querySelector('.active-section h4');
            const dropdownStatus = document.getElementById('filterStatus') ? document.getElementById('filterStatus').value : '';

            const cardStatuses = Array.from(cards).map(c => {
              const b = c.querySelector('.status-badge');
              return b ? b.textContent.trim().toUpperCase() : '';
            });

            return {
              pBtnActive: pBtn.classList.contains('active'),
              oBtnActive: oBtn.classList.contains('active'),
              oBtnAriaPressed: oBtn.getAttribute('aria-pressed'),
              cBtnDisplayed: cBtn.style.display !== 'none',
              cardCount: cards.length,
              cardStatuses,
              activeSectionText: activeHeader ? activeHeader.textContent.trim() : '',
              dropdownStatus
            };
          })()
        `
      });

      const oVal = ongoingClickEval.result.value;
      assert.strictEqual(oVal.pBtnActive, false, 'Pending button must be deactivated');
      assert.strictEqual(oVal.oBtnActive, true, 'Ongoing Repair button must be active');
      assert.strictEqual(oVal.oBtnAriaPressed, 'true', 'Ongoing Repair button aria-pressed must be true');
      assert.strictEqual(oVal.cBtnDisplayed, true, 'Clear Status button must remain visible');
      assert.strictEqual(oVal.cardCount, 1, 'Ongoing view must display exactly 1 card (502 stored as In Progress)');
      assert.ok(oVal.cardStatuses.every(s => s === 'ONGOING REPAIR'), 'Displayed card must have ONGOING REPAIR status badge');
      assert.strictEqual(oVal.dropdownStatus, 'In Progress', 'Dropdown status select must synchronize to In Progress');
      reportPass(`[${roleConfig.name}]: Switching to Ongoing Repair updates records to canonical In Progress records`);

      // 4. Toggle off Ongoing Repair by clicking it again
      const toggleOffEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            document.getElementById('quickFilterOngoing').click();
            const aBtn = document.getElementById('quickFilterAll');
            const pBtn = document.getElementById('quickFilterPending');
            const oBtn = document.getElementById('quickFilterOngoing');
            const cBtn = document.getElementById('quickFilterClear');
            const cards = document.querySelectorAll('.report-card');

            return {
              aBtnActive: aBtn ? aBtn.classList.contains('active') : false,
              pBtnActive: pBtn.classList.contains('active'),
              oBtnActive: oBtn.classList.contains('active'),
              cBtnDisplayed: cBtn.style.display !== 'none',
              cardCount: cards.length
            };
          })()
        `
      });

      const tVal = toggleOffEval.result.value;
      assert.strictEqual(tVal.aBtnActive, true, 'All Tickets active after toggle off');
      assert.strictEqual(tVal.pBtnActive, false, 'Pending inactive after toggle off');
      assert.strictEqual(tVal.oBtnActive, false, 'Ongoing inactive after toggle off');
      assert.strictEqual(tVal.cardCount, 3, 'Toggling off restores all 3 active reports');
      reportPass(`[${roleConfig.name}]: Clicking active quick filter toggles off, restores All Tickets as active, and restores all reports`);

      // 4b. Explicit Click on All Tickets Filter Button
      const allClickEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            // First activate Pending
            document.getElementById('quickFilterPending').click();
            // Then click All Tickets to clear
            document.getElementById('quickFilterAll').click();
            const aBtn = document.getElementById('quickFilterAll');
            const pBtn = document.getElementById('quickFilterPending');
            const oBtn = document.getElementById('quickFilterOngoing');
            const cards = document.querySelectorAll('.report-card');

            return {
              aBtnActive: aBtn ? aBtn.classList.contains('active') : false,
              pBtnActive: pBtn.classList.contains('active'),
              oBtnActive: oBtn.classList.contains('active'),
              cardCount: cards.length
            };
          })()
        `
      });

      const allVal = allClickEval.result.value;
      assert.strictEqual(allVal.aBtnActive, true, 'All Tickets button active after direct click');
      assert.strictEqual(allVal.pBtnActive, false, 'Pending inactive after clicking All Tickets');
      assert.strictEqual(allVal.oBtnActive, false, 'Ongoing inactive after clicking All Tickets');
      assert.strictEqual(allVal.cardCount, 3, 'Clicking All Tickets displays all 3 active reports');
      reportPass(`[${roleConfig.name}]: Directly clicking All Tickets button resets filter and shows all reports`);

      // 5. Combination with Search Query
      const searchComboEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            // Set search input to "Room 204"
            const searchInput = document.getElementById('reportSearchInput');
            searchInput.value = 'Room 204';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));

            // Activate Pending quick filter
            document.getElementById('quickFilterPending').click();

            const cards = document.querySelectorAll('.report-card');
            const cardIds = Array.from(cards).map(c => {
              const title = c.querySelector('.rc-asset-title');
              return title ? title.textContent.trim() : '';
            });

            return {
              cardCount: cards.length,
              cardIds
            };
          })()
        `
      });

      const scVal = searchComboEval.result.value;
      assert.strictEqual(scVal.cardCount, 1, 'Only Report 503 matches both Room 204 AND Pending');
      assert.ok(scVal.cardIds[0].includes('Room 204 – PC 5'), 'Report 503 (Room 204 - PC 5) is isolated');
      reportPass(`[${roleConfig.name}]: Search query + Quick Filter combine correctly with AND logic`);

      // Reset search query
      await sendPage('Runtime.evaluate', {
        expression: `
          const searchInput = document.getElementById('reportSearchInput');
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('quickFilterClear').click();
        `
      });

      // 6. Data Refresh Invariance
      const rerenderEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            document.getElementById('quickFilterPending').click();
            // Simulate background re-fetch or rerender
            window.reportController.renderReports();

            const pBtn = document.getElementById('quickFilterPending');
            const cards = document.querySelectorAll('.report-card');

            return {
              pBtnActive: pBtn.classList.contains('active'),
              pBtnAriaPressed: pBtn.getAttribute('aria-pressed'),
              cardCount: cards.length
            };
          })()
        `
      });

      const rrVal = rerenderEval.result.value;
      assert.strictEqual(rrVal.pBtnActive, true, 'Pending filter remains active after rerender');
      assert.strictEqual(rrVal.pBtnAriaPressed, 'true', 'aria-pressed remains true after rerender');
      assert.strictEqual(rrVal.cardCount, 2, 'Pending filter still isolates 2 records after rerender');
      reportPass(`[${roleConfig.name}]: Selected quick filter remains active after data rerender/refresh`);

      // 7. Verify Role Permissions (Follow Up & Read-Only Invariance)
      const permEval = await sendPage('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (() => {
            const followUpBtns = document.querySelectorAll('.btn-card-followup, [data-action="followup-ticket"]');
            const startRepairBtns = document.querySelectorAll('.btn-start-repair, [data-action="start-repair"]');
            const resolveBtns = document.querySelectorAll('.btn-resolve-ticket, [data-action="resolve-ticket"]');
            const deleteBtns = document.querySelectorAll('.btn-delete-report, [data-action="delete-report"]');
            const mutations = window.__networkReportMutations || [];

            return {
              followUpCount: followUpBtns.length,
              startRepairCount: startRepairBtns.length,
              resolveCount: resolveBtns.length,
              deleteCount: deleteBtns.length,
              mutationCount: mutations.length,
              mutations
            };
          })()
        `
      });

      const pRes = permEval.result.value;
      if (roleConfig.expectFollowUp) {
        assert.ok(pRes.followUpCount > 0, 'IT Department Head must have Follow Up buttons on unresolved tickets');
        reportPass(`[${roleConfig.name}]: Retains Follow Up functionality for unresolved reports`);
      } else {
        assert.strictEqual(pRes.followUpCount, 0, `${roleConfig.name} must NOT have Follow Up buttons`);
        reportPass(`[${roleConfig.name}]: Strictly read-only (zero Follow Up buttons)`);
      }

      assert.strictEqual(pRes.startRepairCount, 0, `${roleConfig.name} must NOT have Start Repair buttons`);
      assert.strictEqual(pRes.resolveCount, 0, `${roleConfig.name} must NOT have Resolve Ticket buttons`);
      assert.strictEqual(pRes.deleteCount, 0, `${roleConfig.name} must NOT have Delete buttons`);
      assert.strictEqual(pRes.mutationCount, 0, 'Clicking filters must NEVER send PUT/PATCH/DELETE mutations');
      reportPass(`[${roleConfig.name}]: Clicking filters sends 0 mutation requests (pure client viewing)`);
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL QUICK STATUS FILTER TESTS PASSED (${passedCount} passed, ${failedCount} failed)`);
    console.log('================================================================\n');

  } finally {
    pageWs.close();
    ws.close();
    proc.kill();
  }
}

runCdpTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED WITH ERROR:');
  console.error(err);
  process.exit(1);
});
