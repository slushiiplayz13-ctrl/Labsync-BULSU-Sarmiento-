'use strict';

/**
 * tests/test-pc-reports-consistency.js
 * Automated verification for PC Reports Pending vs Completed Ticket consistency and dynamic year display.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runConsistencyTests() {
  console.log('================================================================');
  console.log('🧪 Starting PC Reports Layout Consistency & Year Display Verification');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failedTests++;
    }
  }

  // Setup DOM / Window sandbox
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    document: {
      body: {
        dataset: { page: 'faculty-pc-reports' }
      },
      addEventListener: () => {}
    },
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  // Load report parser and renderer into sandbox
  const parserCode = fs.readFileSync(path.join(__dirname, '../js/reports/report.parser.js'), 'utf8');
  const rendererCode = fs.readFileSync(path.join(__dirname, '../js/reports/report.renderer.js'), 'utf8');

  vm.runInNewContext(parserCode, sandbox);
  vm.runInNewContext(rendererCode, sandbox);

  const { renderSingleCard, renderModalTicketCard, formatTicketDate } = sandbox.reportRenderer;

  // Test 1: Dynamic Year in Date Formatter
  console.log('\n--- 1. Dynamic Year Display in formatTicketDate ---');
  const date2024 = formatTicketDate('2024-03-15T10:30:00Z');
  const date2025 = formatTicketDate('2025-11-20T14:45:00Z');
  const date2026 = formatTicketDate('2026-09-01T19:49:00Z');
  const date2027 = formatTicketDate('2027-01-05T08:15:00Z');

  assert(date2024.includes('2024'), `Year 2024 included in: ${date2024}`);
  assert(date2025.includes('2025'), `Year 2025 included in: ${date2025}`);
  assert(date2026.includes('2026'), `Year 2026 included in: ${date2026}`);
  assert(date2027.includes('2027'), `Year 2027 included in: ${date2027}`);
  assert(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/.test(date2026), `Matches format 'Month Day, Year' (${date2026})`);

  // Test 2: Pending Ticket Display
  console.log('\n--- 2. Pending Ticket Layout & Field Structure ---');
  const pendingReport = {
    Report_ID: 101,
    Room_Number: '333',
    PC_Number: 2,
    Student_Name: 'Mae Luga',
    Status: 'Pending',
    Date_Reported: '2026-09-01T19:49:00Z',
    Issue_Description: '[Program & Section: BSITIE] [Issues: System Unit] Remarks: hoy!! walang kanin bussing???'
  };

  const pendingHtml = renderSingleCard(pendingReport);

  assert(pendingHtml.includes('Room 333 – PC 2'), 'Pending ticket displays asset name (Room 333 – PC 2)');
  assert(pendingHtml.includes('PENDING'), 'Pending ticket displays status badge (PENDING)');
  assert(pendingHtml.includes('REPORTED ISSUE'), 'Pending ticket displays REPORTED ISSUE label');
  assert(pendingHtml.includes('System Unit'), 'Pending ticket displays reported issue badge (System Unit)');
  assert(pendingHtml.includes('btn-view-full-report'), 'Pending ticket preserves "View Full Report" button');
  assert(pendingHtml.includes('REMARKS &amp; PROBLEM DETAILS') || pendingHtml.includes('REMARKS & PROBLEM DETAILS'), 'Pending ticket displays REMARKS & PROBLEM DETAILS label');
  assert(pendingHtml.includes('hoy!! walang kanin bussing???'), 'Pending ticket displays remarks body text');
  // Card summary cleanly reserves detailed metadata for the modal
  assert(!pendingHtml.includes('Mae Luga'), 'Card summary reserves reporter name for View Full Report modal');
  assert(!pendingHtml.includes('BSITIE'), 'Card summary reserves section for View Full Report modal');

  // Test 3: Completed / Resolved Ticket Display
  console.log('\n--- 3. Completed/Resolved Ticket Layout & Field Structure ---');
  const resolvedReport = {
    Report_ID: 2,
    Room_Number: '333',
    PC_Number: 2,
    Student_Name: 'Mae Luga',
    Status: 'Resolved',
    Date_Reported: '2026-09-01T14:00:00Z',
    Resolved_At: '2026-09-01T19:49:00Z',
    Issue_Description: '[Program & Section: BSITIE] [Issues: Mouse] Remarks: none'
  };

  const resolvedHtml = renderModalTicketCard(resolvedReport);

  assert(resolvedHtml.includes('Room 333 – PC 2'), 'Resolved ticket displays asset name (Room 333 – PC 2)');
  assert(resolvedHtml.includes('2026'), 'Resolved ticket displays dynamic year (2026)');
  assert(resolvedHtml.includes('RESOLVED'), 'Resolved ticket displays status badge (RESOLVED)');
  assert(resolvedHtml.includes('REPORTED ISSUE'), 'Resolved ticket displays REPORTED ISSUE label');
  assert(resolvedHtml.includes('Mouse'), 'Resolved ticket displays reported issue badge (Mouse)');
  assert(resolvedHtml.includes('btn-view-full-report'), 'Resolved ticket displays "View Full Report" button');
  assert(resolvedHtml.includes('REMARKS &amp; PROBLEM DETAILS') || resolvedHtml.includes('REMARKS & PROBLEM DETAILS'), 'Resolved ticket displays REMARKS & PROBLEM DETAILS label');
  assert(resolvedHtml.includes('No additional remarks provided'), 'Resolved ticket displays clean empty placeholder when remarks are none');

  // Test 4: Field Hierarchy & Order Consistency
  console.log('\n--- 4. Visual Hierarchy & Container Order Consistency ---');
  const headerIdxPending = pendingHtml.indexOf('report-card-header');
  const middleIdxPending = pendingHtml.indexOf('report-card-middle-row');
  const remarksIdxPending = pendingHtml.indexOf('report-card-remarks-section');

  const headerIdxResolved = resolvedHtml.indexOf('report-card-header');
  const middleIdxResolved = resolvedHtml.indexOf('report-card-middle-row');
  const remarksIdxResolved = resolvedHtml.indexOf('report-card-remarks-section');

  assert(headerIdxPending < middleIdxPending && middleIdxPending < remarksIdxPending,
    'Pending ticket follows order: Header (Asset/Status) -> Middle Row (Issues/Actions) -> Remarks');
  assert(headerIdxResolved < middleIdxResolved && middleIdxResolved < remarksIdxResolved,
    'Resolved ticket follows identical order: Header (Asset/Date/Status) -> Middle Row (Issues/Actions) -> Remarks');

  // Test 5: Subcomponents Presence
  console.log('\n--- 5. Equivalent Subcomponents Presence ---');
  const requiredClasses = [
    'report-card-header',
    'rc-asset-row',
    'rc-asset-icon',
    'rc-asset-title',
    'rc-header-right',
    'status-badge',
    'report-card-middle-row',
    'rc-issue-block',
    'rc-block-label',
    'rc-badges-list',
    'rc-action-block',
    'btn-view-full-report',
    'report-card-remarks-section',
    'remarks-box'
  ];

  for (const cls of requiredClasses) {
    const hasInPending = pendingHtml.includes(cls);
    const hasInResolved = resolvedHtml.includes(cls);
    assert(hasInPending && hasInResolved, `Class "${cls}" present in both Pending and Resolved cards`);
  }

  // Test 6: Status-Specific Action Preservation on MIS Pages
  console.log('\n--- 6. Status-Specific Action Preservation ---');
  sandbox.document.body.dataset.page = 'mis-pc-reports';
  const misPendingHtml = renderSingleCard(pendingReport);
  assert(misPendingHtml.includes('Resolve Ticket') && misPendingHtml.includes('btn-action resolve'),
    'MIS pending card includes "Resolve Ticket" action button');
  assert(misPendingHtml.includes('btn-view-full-report'),
    'MIS pending card retains "View Full Report" button');

  const misResolvedReport = { ...resolvedReport, Status: 'Resolved' };
  const misResolvedHtml = renderSingleCard(misResolvedReport);
  assert(!misResolvedHtml.includes('Resolve Ticket'),
    'Resolved card in reports list does NOT show "Resolve Ticket" button');

  // Test 7: Modal Date & Linked Reports Year
  console.log('\n--- 7. Details Modal Date Formatting & Linked Reports Year ---');
  let appendedModal = null;
  sandbox.document.createElement = (tag) => {
    return {
      tagName: tag.toUpperCase(),
      style: {},
      setAttribute: () => {},
      getAttribute: () => null,
      querySelector: () => null,
      appendChild: function(c) { this.children = this.children || []; this.children.push(c); },
      remove: () => {}
    };
  };
  sandbox.document.body.appendChild = (el) => {
    appendedModal = el;
  };
  sandbox.document.getElementById = (id) => null;

  const modalCode = fs.readFileSync(path.join(__dirname, '../js/reports/report.modal.js'), 'utf8');
  vm.runInNewContext(modalCode, sandbox);

  // Trigger viewTicketModal
  sandbox.reportModal.viewTicketModal(101, [pendingReport]);
  assert(appendedModal && appendedModal.innerHTML.includes('2026'),
    'Ticket Details Modal header subtitle includes the 4-digit year (2026)');

  // Multiple linked reports
  const multiReport = {
    Report_ID: 102,
    Room_Number: '333',
    PC_Number: 2,
    Student_Name: 'Mae Luga',
    Status: 'Pending',
    Date_Reported: '2026-09-01T19:49:00Z',
    reports: [
      {
        Student_Name: 'Student 1',
        Date_Reported: '2025-10-12T10:00:00Z',
        Issue_Description: '[Program & Section: BSIT] Remarks: Broken mouse'
      },
      {
        Student_Name: 'Student 2',
        Date_Reported: '2026-09-01T19:49:00Z',
        Issue_Description: '[Program & Section: BSCS] Remarks: Also keyboard'
      }
    ]
  };
  sandbox.reportModal.viewTicketModal(102, [multiReport]);
  assert(appendedModal && appendedModal.innerHTML.includes('2025'),
    'Linked reports include historical year (2025)');
  assert(appendedModal && appendedModal.innerHTML.includes('2026'),
    'Linked reports include current year (2026)');

  console.log('\n================================================================');
  console.log(`Summary: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runConsistencyTests();
