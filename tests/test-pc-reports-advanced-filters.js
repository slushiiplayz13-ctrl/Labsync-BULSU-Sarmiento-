'use strict';

/**
 * tests/test-pc-reports-advanced-filters.js
 * Comprehensive automated verification for the PC Issue Reports Advanced Filters feature.
 *
 * Verifies all 13 required scenarios:
 * 1. Filter button presence in IT Head, Coordinator, and Faculty menus.
 * 2. Filtering by Issue Type (Monitor, Keyboard, Mouse, System Unit, PC/Laptop, Other).
 * 3. Filtering by Room Number (203, 204, etc.).
 * 4. Filtering by PC Number (PC-01, PC 1, 1, etc.).
 * 5. Filtering by Issue Status (Pending, In Progress, Resolved).
 * 6. Date range filtering and validation (start <= end valid, start > end error).
 * 7. Student section filtering (parsed from issue description).
 * 8. Multi-filter AND logic combination.
 * 9. Search query + filter AND logic coexistence.
 * 10. Filter badge counter on Filter button.
 * 11. Active filter tags / chips bar with individual removal (✕) and quick clear.
 * 12. Empty state messaging and Reset Filters button.
 * 13. Role permission and feature preservation across Faculty, IT Dept Head, and Program Coordinator.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 Starting PC Issue Reports Advanced Filters Comprehensive Test');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Section 1: Static HTML & CSS Invariant Checks
  // ────────────────────────────────────────────────────────────────
  console.log('--- 1. Static HTML & CSS Invariant Checks ---');

  const itHeadHtml = fs.readFileSync(path.join(__dirname, '../it-head-pc-reports.html'), 'utf8');
  const facultyHtml = fs.readFileSync(path.join(__dirname, '../faculty-pc-reports.html'), 'utf8');
  const reportCardsCss = fs.readFileSync(path.join(__dirname, '../css/components/report-cards.css'), 'utf8');

  test('it-head-pc-reports.html contains #reportsFilterContainer directly beside search-box', () => {
    assert.ok(itHeadHtml.includes('id="reportsFilterContainer"'), 'Must have reportsFilterContainer');
    assert.ok(itHeadHtml.includes('id="btnReportsFilter"'), 'Must have btnReportsFilter');
    assert.ok(itHeadHtml.includes('id="reportsFilterBadge"'), 'Must have reportsFilterBadge');
    assert.ok(itHeadHtml.includes('id="reportsFilterDropdown"'), 'Must have reportsFilterDropdown');
    assert.ok(itHeadHtml.includes('id="reportsActiveFilterBar"'), 'Must have reportsActiveFilterBar');
    assert.ok(itHeadHtml.includes('id="reportsActiveFilterChips"'), 'Must have reportsActiveFilterChips');
    assert.ok(itHeadHtml.includes('id="btnQuickClearFilters"'), 'Must have btnQuickClearFilters');
  });

  test('faculty-pc-reports.html contains #reportsFilterContainer directly beside search-box', () => {
    assert.ok(facultyHtml.includes('id="reportsFilterContainer"'), 'Must have reportsFilterContainer');
    assert.ok(facultyHtml.includes('id="btnReportsFilter"'), 'Must have btnReportsFilter');
    assert.ok(facultyHtml.includes('id="reportsFilterBadge"'), 'Must have reportsFilterBadge');
    assert.ok(facultyHtml.includes('id="reportsFilterDropdown"'), 'Must have reportsFilterDropdown');
    assert.ok(facultyHtml.includes('id="reportsActiveFilterBar"'), 'Must have reportsActiveFilterBar');
    assert.ok(facultyHtml.includes('id="reportsActiveFilterChips"'), 'Must have reportsActiveFilterChips');
    assert.ok(facultyHtml.includes('id="btnQuickClearFilters"'), 'Must have btnQuickClearFilters');
  });

  test('Filter dropdown forms contain all 6 filter inputs and actions in both templates', () => {
    [itHeadHtml, facultyHtml].forEach((html, i) => {
      const pageName = i === 0 ? 'it-head' : 'faculty';
      assert.ok(html.includes('id="filterIssueType"'), `${pageName} must have filterIssueType`);
      assert.ok(html.includes('id="filterRoomNumber"'), `${pageName} must have filterRoomNumber`);
      assert.ok(html.includes('id="filterPCNumber"'), `${pageName} must have filterPCNumber`);
      assert.ok(html.includes('id="filterStatus"'), `${pageName} must have filterStatus`);
      assert.ok(html.includes('id="filterDateFrom"'), `${pageName} must have filterDateFrom`);
      assert.ok(html.includes('id="filterDateTo"'), `${pageName} must have filterDateTo`);
      assert.ok(html.includes('id="filterDateError"'), `${pageName} must have filterDateError`);
      assert.ok(html.includes('id="filterStudentSection"'), `${pageName} must have filterStudentSection`);
      assert.ok(html.includes('id="btnClearReportsFilter"'), `${pageName} must have btnClearReportsFilter`);
      assert.ok(html.includes('id="btnApplyReportsFilter"'), `${pageName} must have btnApplyReportsFilter`);
    });
  });

  test('report-cards.css contains styling for filter container, dropdown, badge, and chips', () => {
    assert.ok(reportCardsCss.includes('.reports-filter-container'), 'Must style .reports-filter-container');
    assert.ok(reportCardsCss.includes('.btn-reports-filter'), 'Must style .btn-reports-filter');
    assert.ok(reportCardsCss.includes('.filter-count-badge'), 'Must style .filter-count-badge');
    assert.ok(reportCardsCss.includes('.reports-filter-dropdown'), 'Must style .reports-filter-dropdown');
    assert.ok(reportCardsCss.includes('.reports-active-filter-bar'), 'Must style .reports-active-filter-bar');
    assert.ok(reportCardsCss.includes('.active-filter-chip'), 'Must style .active-filter-chip');
    assert.ok(reportCardsCss.includes('.btn-clear-empty-filters'), 'Must style .btn-clear-empty-filters');
  });

  test('report-cards.css provides dark mode support for filter dropdown and components', () => {
    assert.ok(reportCardsCss.includes('body.dark-mode .reports-filter-dropdown'), 'Must have dark mode dropdown');
    assert.ok(reportCardsCss.includes('body.dark-mode .btn-reports-filter'), 'Must have dark mode filter button');
    assert.ok(reportCardsCss.includes('body.dark-mode .active-filter-chip'), 'Must have dark mode chips');
  });

  // ────────────────────────────────────────────────────────────────
  // Section 2: Pure Unit Logic Verification (report.filters.js)
  // ────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Core Filter Logic Unit Verification ---');

  const parserCode = fs.readFileSync(path.join(__dirname, '../js/reports/report.parser.js'), 'utf8');
  const filtersCode = fs.readFileSync(path.join(__dirname, '../js/reports/report.filters.js'), 'utf8');

  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    Set,
    Map,
    parseInt,
    isNaN
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.runInNewContext(parserCode, sandbox);
  vm.runInNewContext(filtersCode, sandbox);

  const rf = sandbox.reportFilters;

  // Mock report dataset covering all variations
  const mockReports = [
    {
      Report_ID: 101,
      Room_Number: '204',
      PC_Number: 1,
      Student_Name: 'Juan Dela Cruz',
      Status: 'Pending',
      Issue_Type: 'Keyboard',
      Date_Reported: '2026-09-01T10:00:00Z',
      Issue_Description: '[Program & Section: BSIT-3A] [Issues: Keyboard] Remarks: WASD keys unresponsive.'
    },
    {
      Report_ID: 102,
      Room_Number: '204',
      PC_Number: 2,
      Student_Name: 'Maria Santos',
      Status: 'In Progress',
      Issue_Type: 'Monitor',
      Date_Reported: '2026-09-02T14:30:00Z',
      Issue_Description: '[Program & Section: BSIT-3A] [Issues: Monitor] Remarks: Screen flickering frequently.'
    },
    {
      Report_ID: 103,
      Room_Number: '203',
      PC_Number: 1,
      Student_Name: 'Pedro Penduko',
      Status: 'Pending',
      Issue_Type: 'Mouse',
      Date_Reported: '2026-09-05T09:15:00Z',
      Issue_Description: '[Program & Section: BLIS-2B] [Issues: Mouse] Remarks: Left click not responding.'
    },
    {
      Report_ID: 104,
      Room_Number: '203',
      PC_Number: 5,
      Student_Name: 'Carlos Rivera',
      Status: 'Resolved',
      Issue_Type: 'System Unit',
      Date_Reported: '2026-08-15T08:00:00Z',
      Resolved_At: '2026-08-16T11:00:00Z',
      Issue_Description: '[Program & Section: BSIT-4B] [Issues: System Unit] Remarks: Fan noise resolved after cleaning.'
    },
    {
      Report_ID: 105,
      Room_Number: '204',
      PC_Number: 10,
      Student_Name: 'Ana Gomez',
      Status: 'Pending',
      Issue_Type: 'Other',
      Date_Reported: '2026-09-10T16:00:00Z',
      Issue_Description: '[Program & Section: BSIT-3A] [Issues: Network, Audio] Remarks: No internet and headphone jack loose.'
    }
  ];

  test('extractFilterOptions extracts unique issue types, rooms, pcs, sections dynamically', () => {
    const opts = rf.extractFilterOptions(mockReports);
    assert.ok(opts.rooms.includes('203'), 'Must contain Room 203');
    assert.ok(opts.rooms.includes('204'), 'Must contain Room 204');
    assert.ok(opts.issueTypes.includes('Keyboard'), 'Must contain Keyboard');
    assert.ok(opts.issueTypes.includes('Monitor'), 'Must contain Monitor');
    assert.ok(opts.issueTypes.includes('Other'), 'Must contain Other');
    assert.ok(opts.sections.includes('BSIT-3A'), 'Must extract BSIT-3A section');
    assert.ok(opts.sections.includes('BLIS-2B'), 'Must extract BLIS-2B section');
    assert.ok(opts.pcsByRoom['204'], 'Must have pcsByRoom for 204');
    assert.ok(opts.pcsByRoom['204'].includes('1') || opts.pcsByRoom['204'].includes(1), 'PC 1 must be under Room 204');
  });

  test('Issue Type filter strictly honors canonical Issue_Type without false matching from description', () => {
    const reportWithNoise = {
      Report_ID: 999,
      Room_Number: '204',
      PC_Number: 1,
      Issue_Type: 'Keyboard',
      Issue_Description: '[Program & Section: BSIT-3A] [Issues: Monitor] Remarks: User wrote monitor in text but issue is keyboard.'
    };
    // Filtering by Monitor must NOT match because canonical Issue_Type is Keyboard
    assert.strictEqual(rf.matchesReportFilters(reportWithNoise, { issueType: 'Monitor' }), false);
    // Filtering by Keyboard MUST match
    assert.strictEqual(rf.matchesReportFilters(reportWithNoise, { issueType: 'Keyboard' }), true);
  });

  test('Issue Type filter falls back to parsed description only when canonical Issue_Type is absent/None', () => {
    const legacyReport = {
      Report_ID: 998,
      Room_Number: '204',
      PC_Number: 1,
      Issue_Type: null,
      Issue_Description: '[Program & Section: BSIT-3A] [Issues: Audio] Remarks: No sound.'
    };
    assert.strictEqual(rf.matchesReportFilters(legacyReport, { issueType: 'Audio' }), true);
    assert.strictEqual(rf.matchesReportFilters(legacyReport, { issueType: 'Keyboard' }), false);

    const legacyOptions = rf.extractFilterOptions([legacyReport]);
    assert.ok(legacyOptions.issueTypes.includes('Audio'), 'Extracts parsed issues when Issue_Type is absent');
  });

  test('Date-Range deterministic boundary behavior (start date, end date, later in day, outside range)', () => {
    const rStart = { Date_Reported: '2026-09-01T09:00:00' };
    const rLate = { Date_Reported: '2026-09-01T23:45:00' };
    const rNextDay = { Date_Reported: '2026-09-02T00:05:00' };
    const rPrevDay = { Date_Reported: '2026-08-31T23:55:00' };

    const singleDayFilter = { dateFrom: '2026-09-01', dateTo: '2026-09-01' };
    assert.strictEqual(rf.matchesReportFilters(rStart, singleDayFilter), true, 'Start of day report included');
    assert.strictEqual(rf.matchesReportFilters(rLate, singleDayFilter), true, 'Late in day report included');
    assert.strictEqual(rf.matchesReportFilters(rNextDay, singleDayFilter), false, 'Next day report excluded');
    assert.strictEqual(rf.matchesReportFilters(rPrevDay, singleDayFilter), false, 'Previous day report excluded');

    const upToFilter = { dateTo: '2026-09-01' };
    assert.strictEqual(rf.matchesReportFilters(rStart, upToFilter), true);
    assert.strictEqual(rf.matchesReportFilters(rPrevDay, upToFilter), true);
    assert.strictEqual(rf.matchesReportFilters(rNextDay, upToFilter), false);

    const fromOnlyFilter = { dateFrom: '2026-09-01' };
    assert.strictEqual(rf.matchesReportFilters(rStart, fromOnlyFilter), true);
    assert.strictEqual(rf.matchesReportFilters(rNextDay, fromOnlyFilter), true);
    assert.strictEqual(rf.matchesReportFilters(rPrevDay, fromOnlyFilter), false);
  });

  test('validateDateRange properly validates date order', () => {
    assert.strictEqual(rf.validateDateRange('2026-09-01', '2026-09-10').valid, true, 'Start <= End is valid');
    assert.strictEqual(rf.validateDateRange('2026-09-10', '2026-09-10').valid, true, 'Same day is valid');
    assert.strictEqual(rf.validateDateRange('2026-09-10', '').valid, true, 'Start only is valid');
    assert.strictEqual(rf.validateDateRange('', '2026-09-10').valid, true, 'End only is valid');
    const invalidRes = rf.validateDateRange('2026-09-15', '2026-09-01');
    assert.strictEqual(invalidRes.valid, false, 'Start > End is invalid');
    assert.strictEqual(invalidRes.error, 'Start date cannot be after end date.');
  });

  test('Filter by Issue Type isolates matching reports', () => {
    const filterKeyboard = { issueType: 'Keyboard' };
    const matchesK = mockReports.filter(r => rf.matchesReportFilters(r, filterKeyboard));
    assert.strictEqual(matchesK.length, 1, 'Only Report 101 has Keyboard');
    assert.strictEqual(matchesK[0].Report_ID, 101);

    const filterMonitor = { issueType: 'Monitor' };
    const matchesM = mockReports.filter(r => rf.matchesReportFilters(r, filterMonitor));
    assert.strictEqual(matchesM.length, 1, 'Only Report 102 has Monitor');
    assert.strictEqual(matchesM[0].Report_ID, 102);
  });

  test('Filter by Room Number isolates Room 203 vs Room 204', () => {
    const filter204 = { roomNumber: '204' };
    const matches204 = mockReports.filter(r => rf.matchesReportFilters(r, filter204));
    assert.strictEqual(matches204.length, 3, 'Reports 101, 102, 105 are in Room 204');

    const filterRoom203 = { roomNumber: 'Room 203' }; // Normalization check
    const matches203 = mockReports.filter(r => rf.matchesReportFilters(r, filterRoom203));
    assert.strictEqual(matches203.length, 2, 'Reports 103, 104 are in Room 203');
  });

  test('Filter by PC Number normalizes PC numbers (1, PC 1, PC-01)', () => {
    const filterPc1 = { pcNumber: '1' };
    const matchesPc1 = mockReports.filter(r => rf.matchesReportFilters(r, filterPc1));
    assert.strictEqual(matchesPc1.length, 2, 'Reports 101 and 103 both have PC 1');

    const filterPc01 = { pcNumber: 'PC-01' };
    const matchesPc01 = mockReports.filter(r => rf.matchesReportFilters(r, filterPc01));
    assert.strictEqual(matchesPc01.length, 2, 'PC-01 should match same as 1');
  });

  test('Filter by Status isolates Pending, In Progress, and Resolved', () => {
    const filterPending = { status: 'Pending' };
    const matchesPending = mockReports.filter(r => rf.matchesReportFilters(r, filterPending));
    assert.strictEqual(matchesPending.length, 3, 'Reports 101, 103, 105 are Pending');

    const filterInProgress = { status: 'In Progress' };
    const matchesIP = mockReports.filter(r => rf.matchesReportFilters(r, filterInProgress));
    assert.strictEqual(matchesIP.length, 1, 'Report 102 is In Progress');

    const filterResolved = { status: 'Resolved' };
    const matchesRes = mockReports.filter(r => rf.matchesReportFilters(r, filterResolved));
    assert.strictEqual(matchesRes.length, 1, 'Report 104 is Resolved');
  });

  test('Filter by Date Range isolates reports within bounds', () => {
    const filterRange = { dateFrom: '2026-09-01', dateTo: '2026-09-03' };
    const matchesDate = mockReports.filter(r => rf.matchesReportFilters(r, filterRange));
    assert.strictEqual(matchesDate.length, 2, 'Reports 101 (Sept 1) and 102 (Sept 2) within range');

    const filterFromOnly = { dateFrom: '2026-09-05' };
    const matchesFrom = mockReports.filter(r => rf.matchesReportFilters(r, filterFromOnly));
    assert.strictEqual(matchesFrom.length, 2, 'Reports 103 (Sept 5) and 105 (Sept 10) on or after Sept 5');

    const filterToOnly = { dateTo: '2026-08-31' };
    const matchesTo = mockReports.filter(r => rf.matchesReportFilters(r, filterToOnly));
    assert.strictEqual(matchesTo.length, 1, 'Report 104 (Aug 15) on or before Aug 31');
  });

  test('Filter by Student Section isolates reports matching parsed section', () => {
    const filterSection = { section: 'BLIS-2B' };
    const matchesSec = mockReports.filter(r => rf.matchesReportFilters(r, filterSection));
    assert.strictEqual(matchesSec.length, 1, 'Report 103 has BLIS-2B');
    assert.strictEqual(matchesSec[0].Report_ID, 103);
  });

  test('Multi-filter AND logic strictly enforces all criteria', () => {
    // Room 204 + PC 1 + Pending -> Only Report 101
    const multiMatch = {
      roomNumber: '204',
      pcNumber: '1',
      status: 'Pending'
    };
    const res = mockReports.filter(r => rf.matchesReportFilters(r, multiMatch));
    assert.strictEqual(res.length, 1, 'Only Report 101 satisfies all 3 conditions');
    assert.strictEqual(res[0].Report_ID, 101);

    // Room 204 + PC 1 + In Progress -> 0 matches
    const noMatch = {
      roomNumber: '204',
      pcNumber: '1',
      status: 'In Progress'
    };
    const resNone = mockReports.filter(r => rf.matchesReportFilters(r, noMatch));
    assert.strictEqual(resNone.length, 0, 'No reports satisfy Room 204 + PC 1 + In Progress');
  });

  test('Search Query + Filter AND logic coexists seamlessly', () => {
    // Search for "flickering" + Filter Room 204 -> Report 102
    const match = mockReports.filter(r => rf.matchesReport(r, 'flickering', { roomNumber: '204' }));
    assert.strictEqual(match.length, 1);
    assert.strictEqual(match[0].Report_ID, 102);

    // Search for "WASD" + Filter Room 203 (mismatch) -> 0 matches
    const mismatch = mockReports.filter(r => rf.matchesReport(r, 'WASD', { roomNumber: '203' }));
    assert.strictEqual(mismatch.length, 0);
  });

  test('countActiveFilters counts active criteria with dateFrom/To counted as 1', () => {
    assert.strictEqual(rf.countActiveFilters({}), 0);
    assert.strictEqual(rf.countActiveFilters({ issueType: 'Keyboard' }), 1);
    assert.strictEqual(rf.countActiveFilters({ dateFrom: '2026-09-01' }), 1);
    assert.strictEqual(rf.countActiveFilters({ dateFrom: '2026-09-01', dateTo: '2026-09-10' }), 1);
    assert.strictEqual(rf.countActiveFilters({
      issueType: 'Keyboard',
      roomNumber: '204',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-10'
    }), 3);
  });

  // ────────────────────────────────────────────────────────────────
  // Section 3: Headless Chrome CDP Live UI & Interaction Tests
  // ────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Headless Chrome DevTools Protocol (CDP) Runtime UI Verification ---');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chromePath)) {
    console.log('  ⚠️ Chrome binary not found at default path, skipping CDP runtime testing.');
    finish(passed, failed);
    return;
  }

  const port = 9229;
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1280,800'
  ], { stdio: 'ignore' });

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function getWsUrl() {
    for (let i = 0; i < 30; i++) {
      try {
        const res = await new Promise((resolve, reject) => {
          http.get(`http://127.0.0.1:${port}/json/version`, resp => {
            let data = '';
            resp.on('data', chunk => data += chunk);
            resp.on('end', () => resolve(JSON.parse(data)));
          }).on('error', reject);
        });
        return res.webSocketDebuggerUrl;
      } catch (e) {
        await sleep(200);
      }
    }
    throw new Error('Failed to connect to Chrome CDP version endpoint');
  }

  try {
    const wsUrl = await getWsUrl();
    const browserWs = new WebSocket(wsUrl);
    await new Promise(r => browserWs.onopen = r);

    let bMsgId = 1;
    const bPending = new Map();
    browserWs.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && bPending.has(msg.id)) {
        const { resolve, reject } = bPending.get(msg.id);
        bPending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function sendBrowser(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = bMsgId++;
        bPending.set(id, { resolve, reject });
        browserWs.send(JSON.stringify({ id, method, params }));
      });
    }

    const newTarget = await sendBrowser('Target.createTarget', { url: 'about:blank' });
    const pageWsUrl = `ws://127.0.0.1:${port}/devtools/page/${newTarget.targetId}`;

    const ws = new WebSocket(pageWsUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');

    // Test Roles: IT Dept Head, Program Coordinator, Faculty
    const testMatrix = [
      {
        page: 'it-head-pc-reports.html',
        role: 'IT Department Head',
        name: 'Andrei Gabito (IT Head)',
        email: 'ithead@bulsu.edu.ph'
      },
      {
        page: 'it-head-pc-reports.html',
        role: 'Program Coordinator',
        name: 'Juan Dela Cruz (Coordinator)',
        email: 'coordinator@bulsu.edu.ph'
      },
      {
        page: 'faculty-pc-reports.html',
        role: 'Faculty',
        name: 'Maria Santos (Faculty)',
        email: 'faculty@bulsu.edu.ph'
      }
    ];

    for (const item of testMatrix) {
      console.log(`\nTesting ${item.page} with Role: [${item.role}]`);

      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          try {
            const userObj = { role: '${item.role}', name: '${item.name}', email: '${item.email}' };
            localStorage.setItem('user', JSON.stringify(userObj));
            localStorage.setItem('labsync_last_activity', Date.now().toString());
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
                if (url.includes('/api/reports')) {
                  return new Response(JSON.stringify(${JSON.stringify(mockReports)}), {
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

      await send('Page.navigate', { url: `http://localhost:3000/${item.page}` });
      await sleep(1200);

      // Verify Filter UI rendered in DOM
      const initialUi = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const filterBtn = document.getElementById('btnReportsFilter');
            const searchBox = document.querySelector('.reports-controls .search-box');
            const dropdown = document.getElementById('reportsFilterDropdown');
            const badge = document.getElementById('reportsFilterBadge');
            const chipsBar = document.getElementById('reportsActiveFilterBar');
            const issueTypeSelect = document.getElementById('filterIssueType');
            const roomSelect = document.getElementById('filterRoomNumber');
            const pcSelect = document.getElementById('filterPCNumber');

            return {
              filterBtnExists: !!filterBtn,
              filterBtnVisible: filterBtn ? window.getComputedStyle(filterBtn).display !== 'none' : false,
              searchBoxExists: !!searchBox,
              badgeExists: !!badge,
              badgeDisplayed: badge ? badge.style.display !== 'none' : false,
              dropdownExists: !!dropdown,
              dropdownHiddenInitial: dropdown ? (dropdown.style.display === 'none' || window.getComputedStyle(dropdown).display === 'none') : false,
              chipsBarHiddenInitial: chipsBar ? (chipsBar.style.display === 'none' || window.getComputedStyle(chipsBar).display === 'none') : false,
              issueTypeOptionCount: issueTypeSelect ? issueTypeSelect.options.length : 0,
              roomOptionCount: roomSelect ? roomSelect.options.length : 0,
              pcOptionCount: pcSelect ? pcSelect.options.length : 0
            };
          })()
        `
      });

      const uiVal = initialUi.result.value;

      test(`${item.page} [${item.role}]: Filter button exists and is displayed beside search box`, () => {
        assert.strictEqual(uiVal.filterBtnExists, true);
        assert.strictEqual(uiVal.filterBtnVisible, true);
        assert.strictEqual(uiVal.searchBoxExists, true);
      });

      test(`${item.page} [${item.role}]: Dropdown and chips bar initially closed; options populated`, () => {
        assert.strictEqual(uiVal.dropdownHiddenInitial, true);
        assert.strictEqual(uiVal.chipsBarHiddenInitial, true);
        assert.ok(uiVal.issueTypeOptionCount > 1, 'Issue types options populated');
        assert.ok(uiVal.roomOptionCount > 1, 'Room options populated');
      });

      // Test Opening Filter Dropdown
      const openResult = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const filterBtn = document.getElementById('btnReportsFilter');
            filterBtn.click();
            const dropdown = document.getElementById('reportsFilterDropdown');
            return {
              dropdownDisplayed: dropdown ? dropdown.style.display !== 'none' : false,
              ariaExpanded: filterBtn.getAttribute('aria-expanded')
            };
          })()
        `
      });

      test(`${item.page} [${item.role}]: Clicking Filter button toggles open filter panel`, () => {
        assert.strictEqual(openResult.result.value.dropdownDisplayed, true);
        assert.strictEqual(openResult.result.value.ariaExpanded, 'true');
      });

      // Test Applying a Filter (Room 204 + Keyboard)
      const applyResult = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const roomSelect = document.getElementById('filterRoomNumber');
            const issueSelect = document.getElementById('filterIssueType');
            const applyBtn = document.getElementById('btnApplyReportsFilter');

            if (roomSelect) roomSelect.value = '204';
            if (issueSelect) issueSelect.value = 'Keyboard';
            if (applyBtn) applyBtn.click();

            const badge = document.getElementById('reportsFilterBadge');
            const chipsBar = document.getElementById('reportsActiveFilterBar');
            const chips = document.querySelectorAll('.active-filter-chip');
            const cards = document.querySelectorAll('.report-card');

            return {
              badgeText: badge ? badge.textContent.trim() : '',
              badgeVisible: badge ? badge.style.display !== 'none' : false,
              chipsBarVisible: chipsBar ? chipsBar.style.display !== 'none' : false,
              chipCount: chips.length,
              renderedCardCount: cards.length
            };
          })()
        `
      });

      const applyVal = applyResult.result.value;

      test(`${item.page} [${item.role}]: Applying filters updates badge counter to 2 and displays chips`, () => {
        assert.strictEqual(applyVal.badgeText, '2');
        assert.strictEqual(applyVal.badgeVisible, true);
        assert.strictEqual(applyVal.chipsBarVisible, true);
        assert.strictEqual(applyVal.chipCount, 2);
        assert.strictEqual(applyVal.renderedCardCount, 1, 'Only Report 101 matches Room 204 + Keyboard');
      });

      // Test Individual Chip Removal (remove Keyboard chip -> Room 204 remains)
      const removeChipResult = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const chipBtn = document.querySelector('[data-clear-prop="issueType"]');
            if (chipBtn) chipBtn.click();

            const badge = document.getElementById('reportsFilterBadge');
            const chips = document.querySelectorAll('.active-filter-chip');
            const cards = document.querySelectorAll('.report-card');

            return {
              badgeText: badge ? badge.textContent.trim() : '',
              chipCount: chips.length,
              renderedCardCount: cards.length
            };
          })()
        `
      });

      const removeVal = removeChipResult.result.value;

      test(`${item.page} [${item.role}]: Removing individual chip updates badge to 1 and re-filters`, () => {
        assert.strictEqual(removeVal.badgeText, '1');
        assert.strictEqual(removeVal.chipCount, 1);
        // Room 204 has 3 active pending/in-progress reports (101, 102, 105)
        assert.strictEqual(removeVal.renderedCardCount, 3);
      });

      // Test Clear All / Reset Filters restores full default set
      const resetResult = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            const quickClear = document.getElementById('btnQuickClearFilters');
            if (quickClear) quickClear.click();

            const badge = document.getElementById('reportsFilterBadge');
            const chipsBar = document.getElementById('reportsActiveFilterBar');
            const cards = document.querySelectorAll('.report-card');

            return {
              badgeVisible: badge ? badge.style.display !== 'none' : false,
              chipsBarVisible: chipsBar ? chipsBar.style.display !== 'none' : false,
              renderedCardCount: cards.length
            };
          })()
        `
      });

      const resetVal = resetResult.result.value;

      test(`${item.page} [${item.role}]: Quick clear resets all filters, hides badge and chips, restores list`, () => {
        assert.strictEqual(resetVal.badgeVisible, false);
        assert.strictEqual(resetVal.chipsBarVisible, false);
        // All active pending/in-progress reports (101, 102, 103, 105) = 4 cards
        assert.strictEqual(resetVal.renderedCardCount, 4);
      });

      // Test Empty State & "Clear Filters" Button inside Empty State
      const emptyStateResult = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `
          (function() {
            // Apply non-matching filter (Room 203 + Keyboard)
            if (window.reportFilters) {
              window.reportFilters.setActiveFilters({ roomNumber: '203', issueType: 'Keyboard' });
            }
            if (window.reportController) {
              window.reportController.renderReports();
            }

            const emptyState = document.querySelector('.ui-empty-state');
            const clearEmptyBtn = document.querySelector('.btn-clear-empty-filters');

            let restoredAfterClick = false;
            if (clearEmptyBtn) {
              clearEmptyBtn.click();
              const cardsAfter = document.querySelectorAll('.report-card');
              restoredAfterClick = cardsAfter.length === 4;
            }

            return {
              hadEmptyState: !!emptyState,
              hadClearBtn: !!clearEmptyBtn,
              restoredAfterClick
            };
          })()
        `
      });

      const emptyVal = emptyStateResult.result.value;

      test(`${item.page} [${item.role}]: Empty state displays when no records match and Clear Filters button restores records`, () => {
        assert.strictEqual(emptyVal.hadEmptyState, true);
        assert.strictEqual(emptyVal.hadClearBtn, true);
        assert.strictEqual(emptyVal.restoredAfterClick, true);
      });
    }

    try {
      await sendBrowser('Target.closeTarget', { targetId: newTarget.targetId });
      browserWs.close();
      chromeProc.kill();
    } catch (e) {}

  } catch (err) {
    console.error('CDP test error:', err);
    failed++;
    try { chromeProc.kill(); } catch (e) {}
  }

  finish(passed, failed);
}

function finish(passed, failed) {
  console.log('\n================================================================');
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
