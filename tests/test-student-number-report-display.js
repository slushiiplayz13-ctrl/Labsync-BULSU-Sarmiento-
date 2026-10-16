'use strict';

/**
 * tests/test-student-number-report-display.js
 * Focused regression test suite for Student Number display in LabSync PC issue reports.
 *
 * Verifies all 5 required criteria without touching real development or production DB:
 * 1. A newly submitted student report displays both verified student name and student number.
 * 2. The number remains available after reloading the report list (and in multi-reporter timelines).
 * 3. Report details display the same identity and remain searchable by student number.
 * 4. Older reports with no student number remain readable without showing undefined, null, or empty ().
 * 5. Existing staff/OJT resolver attribution and follow-up functionality remain intact and unchanged.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 Starting Student Number Report Display Regression Tests');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// Helper to create sandbox for report.modal.js
function createReportModalSandbox() {
  let modalCreated = null;
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    document: {
      getElementById: (id) => (id === 'ticket-details-modal' ? modalCreated : null),
      createElement: (tag) => {
        const el = {
          tagName: tag,
          id: '',
          className: '',
          style: { cssText: '' },
          attributes: {},
          innerHTML: '',
          setAttribute: (k, v) => { el.attributes[k] = v; },
          getAttribute: (k) => el.attributes[k],
          addEventListener: () => {},
          removeEventListener: () => {},
          querySelector: () => null,
          querySelectorAll: () => [],
          remove: () => { modalCreated = null; }
        };
        return el;
      },
      body: {
        appendChild: (el) => { modalCreated = el; },
        dataset: { page: 'it-head-pc-reports' }
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    lucide: { createIcons: () => {} },
    reportParser: {
      parseIssueDescription: (desc) => {
        const secMatch = (desc || '').match(/\[Program & Section:\s*([^\]]+)\]/i);
        const remMatch = (desc || '').match(/Remarks:\s*(.*)$/is);
        return {
          section: secMatch ? secMatch[1].trim() : 'BSIT 3A',
          issues: 'Monitor',
          remarks: remMatch ? remMatch[1].trim() : (desc || 'No remarks provided.')
        };
      }
    },
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.modal.js'), 'utf8');
  vm.runInNewContext(code, sandbox);

  return {
    getModal: () => modalCreated,
    viewTicketModal: sandbox.viewTicketModal || sandbox.reportModal.viewTicketModal,
    formatReporterIdentity: sandbox.formatReporterIdentity || sandbox.reportModal.formatReporterIdentity
  };
}

// Helper to create sandbox for maintenance.modal.js
function createMaintenanceModalSandbox() {
  let modalCreated = null;
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    document: {
      getElementById: (id) => (id === 'ticket-details-modal' ? modalCreated : null),
      createElement: (tag) => {
        const el = {
          tagName: tag,
          id: '',
          className: '',
          style: { cssText: '' },
          attributes: {},
          innerHTML: '',
          setAttribute: (k, v) => { el.attributes[k] = v; },
          getAttribute: (k) => el.attributes[k],
          addEventListener: () => {},
          removeEventListener: () => {},
          querySelector: () => null,
          querySelectorAll: () => [],
          remove: () => { modalCreated = null; }
        };
        return el;
      },
      body: {
        appendChild: (el) => { modalCreated = el; },
        dataset: { page: 'mis-maintenance' }
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    lucide: { createIcons: () => {} },
    reportParser: {
      parseIssueDescription: (desc) => {
        const secMatch = (desc || '').match(/\[Program & Section:\s*([^\]]+)\]/i);
        const remMatch = (desc || '').match(/Remarks:\s*(.*)$/is);
        return {
          section: secMatch ? secMatch[1].trim() : 'BSIT 3A',
          issues: 'Monitor',
          remarks: remMatch ? remMatch[1].trim() : (desc || 'No remarks provided.')
        };
      }
    },
    maintenanceRenderer: {
      formatIssueBadges: () => '<span class="badge">Monitor</span>'
    },
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.modal.js'), 'utf8');
  vm.runInNewContext(code, sandbox);

  return {
    getModal: () => modalCreated,
    viewTicketModal: sandbox.viewTicketModal || sandbox.maintenanceModal.viewTicketModal,
    formatReporterIdentity: sandbox.formatReporterIdentity || sandbox.maintenanceModal.formatReporterIdentity
  };
}

// Helper to create sandbox for report.filters.js
function createReportFiltersSandbox() {
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    reportParser: {
      parseIssueDescription: (desc) => ({ section: 'BSIT 3A', issues: 'Monitor', remarks: desc || '' })
    }
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.filters.js'), 'utf8');
  vm.runInNewContext(code, sandbox);

  return sandbox.reportFilters;
}

// ────────────────────────────────────────────────────────────────
// Test Section 1: formatReporterIdentity Unit Logic
// ────────────────────────────────────────────────────────────────
console.log('--- 1. Testing formatReporterIdentity Formatter ---');

test('Formats student name and student number as "Name (Number)"', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity('Juan Dela Cruz', '2022-123456');
  assert.strictEqual(res, 'Juan Dela Cruz (2022-123456)');
});

test('Trims surrounding whitespace from name and student number', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity('  Maria Clara  ', '  2023-999888  ');
  assert.strictEqual(res, 'Maria Clara (2023-999888)');
});

test('Displays only name when student number is null', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity('Pedro Penduko', null);
  assert.strictEqual(res, 'Pedro Penduko');
  assert(!res.includes('null'));
  assert(!res.includes('undefined'));
  assert(!res.includes('()'));
});

test('Displays only name when student number is undefined', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity('Pedro Penduko', undefined);
  assert.strictEqual(res, 'Pedro Penduko');
  assert(!res.includes('()'));
});

test('Displays only name when student number is empty string or whitespace', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity('Pedro Penduko', '   ');
  assert.strictEqual(res, 'Pedro Penduko');
  assert(!res.includes('()'));
});

test('Falls back to default "Student" when name is missing but number is present', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity(null, '2024-112233');
  assert.strictEqual(res, 'Student (2024-112233)');
});

test('Falls back to "Student" without empty parentheses when both are null', () => {
  const env = createReportModalSandbox();
  const res = env.formatReporterIdentity(null, null);
  assert.strictEqual(res, 'Student');
});

// ────────────────────────────────────────────────────────────────
// Test Section 2: Newly Submitted Student Report Modal Display
// ────────────────────────────────────────────────────────────────
console.log('\n--- 2. Newly Submitted Report Details Modal Display ---');

const newReport = {
  Report_ID: 301,
  Issue_ID: 301,
  PC_ID: 10,
  PC_Number: 5,
  Room_Number: '204',
  Student_Name: 'Juan Dela Cruz',
  Student_Number: '2022-123456',
  Status: 'Pending',
  Priority_Level: 'Medium',
  Date_Reported: new Date().toISOString(),
  Issue_Description: '[Program & Section: BSIT 3A] [Issues: Monitor] Remarks: Monitor flickers intermittently'
};

test('IT Head / Faculty Modal: displays verified student name and number in single report view', () => {
  const env = createReportModalSandbox();
  env.viewTicketModal(301, [newReport]);
  const modal = env.getModal();
  assert(modal, 'Modal element should be created');
  const html = modal.innerHTML;

  assert(html.includes('Juan Dela Cruz (2022-123456)'), 'Modal must contain "Juan Dela Cruz (2022-123456)"');
  assert(html.includes('Reported By'), 'Modal must contain Reported By label');
  assert(!html.includes('undefined'), 'Modal must not contain "undefined"');
  assert(!html.includes('null'), 'Modal must not contain "null"');
});

test('MIS Maintenance Modal: displays verified student name and number in single report view', () => {
  const env = createMaintenanceModalSandbox();
  env.viewTicketModal(301, [newReport]);
  const modal = env.getModal();
  assert(modal, 'Modal element should be created');
  const html = modal.innerHTML;

  assert(html.includes('Juan Dela Cruz (2022-123456)'), 'MIS modal must contain "Juan Dela Cruz (2022-123456)"');
  assert(html.includes('Reported By'), 'MIS modal must contain Reported By section');
  assert(!html.includes('undefined'), 'MIS modal must not contain "undefined"');
  assert(!html.includes('null'), 'MIS modal must not contain "null"');
});

// ────────────────────────────────────────────────────────────────
// Test Section 3: Reloading / Multi-Report Timeline Persistence
// ────────────────────────────────────────────────────────────────
console.log('\n--- 3. Report List Reload & Multi-Reporter Grouping ---');

const multiReporterIssue = {
  Report_ID: 302,
  Issue_ID: 302,
  PC_ID: 12,
  PC_Number: 8,
  Room_Number: '203',
  Student_Name: 'Clara Santos',
  Student_Number: '2023-778899',
  Status: 'In Progress',
  Priority_Level: 'High',
  Date_Reported: new Date().toISOString(),
  Issue_Description: '[Program & Section: BSIT 2B] [Issues: System Unit] Remarks: PC will not boot',
  reports: [
    {
      Report_ID: 501,
      Student_Name: 'Student Alpha',
      Student_Number: '2021-111222',
      Issue_Description: '[Program & Section: BSIT 3A] Remarks: Power supply issue',
      Date_Reported: '2026-10-10T08:00:00Z'
    },
    {
      Report_ID: 502,
      Student_Name: 'Student Beta',
      Student_Number: '2022-333444',
      Issue_Description: '[Program & Section: BSCS 2A] Remarks: Also failed to turn on',
      Date_Reported: '2026-10-11T09:30:00Z'
    }
  ]
};

test('IT Head / Faculty Modal: displays student number for all reporters in multi-report timeline', () => {
  const env = createReportModalSandbox();
  env.viewTicketModal(302, [multiReporterIssue]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Student Alpha') && html.includes('(2021-111222)'), 'Multi-report view must display Student Alpha with number');
  assert(html.includes('Student Beta') && html.includes('(2022-333444)'), 'Multi-report view must display Student Beta with number');
});

test('MIS Maintenance Modal: displays student number for all reporters in multi-report timeline', () => {
  const env = createMaintenanceModalSandbox();
  env.viewTicketModal(302, [multiReporterIssue]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Student Alpha') && html.includes('(2021-111222)'), 'MIS multi-report view must display Student Alpha with number');
  assert(html.includes('Student Beta') && html.includes('(2022-333444)'), 'MIS multi-report view must display Student Beta with number');
});

const longNameMultiReportIssue = {
  Report_ID: 305,
  Issue_ID: 305,
  PC_ID: 15,
  PC_Number: 8,
  Room_Number: '301',
  Student_Name: 'RANDOLPH RALPH JOHN G HALILI',
  Student_Number: '2023500737',
  Status: 'Pending',
  Priority_Level: 'Low',
  Date_Reported: '2026-10-12T03:00:00Z',
  reports: [
    {
      Report_ID: 1,
      Student_Name: 'RANDOLPH RALPH JOHN G HALILI',
      Student_Number: '2023500737',
      Issue_Description: '[Program & Section: BSIT3A] [Issues: Keyboard] Remarks: None',
      Date_Reported: '2026-10-12T03:00:00Z'
    },
    {
      Report_ID: 2,
      Student_Name: 'Jane Smith',
      Student_Number: '2023500888',
      Issue_Description: '[Program & Section: BSIT3A] [Issues: Mouse] Remarks: None',
      Date_Reported: '2026-10-12T03:05:00Z'
    }
  ]
};

test('Long student name in MIS Maintenance Modal: places section beside student number below', () => {
  const env = createMaintenanceModalSandbox();
  env.viewTicketModal(305, [longNameMultiReportIssue]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('RANDOLPH RALPH JOHN G HALILI'), 'Student name must be rendered');
  assert(html.includes('flex-basis:100%'), 'Long student name (>20 chars) must occupy top line via flex-basis:100%');
  assert(html.includes('(2023500737)') && html.includes('BSIT3A'), 'Student number and section must be rendered');
  // Check that (2023500737) and BSIT3A are grouped together in an inline-flex element
  assert(html.includes('display:inline-flex; align-items:center; gap:6px; flex-shrink:0;'), 'Student number and section badge must be grouped together in inline-flex container');
  assert(html.includes('white-space:nowrap; flex-shrink:0;'), 'Timestamp must have white-space:nowrap and flex-shrink:0');
});

test('Long student name in IT Head / Faculty Modal: places section beside student number below', () => {
  const env = createReportModalSandbox();
  env.viewTicketModal(305, [longNameMultiReportIssue]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('RANDOLPH RALPH JOHN G HALILI'), 'Student name must be rendered');
  assert(html.includes('flex-basis:100%'), 'Long student name (>20 chars) must occupy top line via flex-basis:100%');
  assert(html.includes('(2023500737)') && html.includes('BSIT3A'), 'Student number and section must be rendered');
  assert(html.includes('display:inline-flex; align-items:center; gap:6px; flex-shrink:0;'), 'Student number and section badge must be grouped together in inline-flex container');
  assert(html.includes('white-space:nowrap; flex-shrink:0;'), 'Timestamp must have white-space:nowrap and flex-shrink:0');
});

// ────────────────────────────────────────────────────────────────
// Test Section 4: Backward Compatibility for Older Reports
// ────────────────────────────────────────────────────────────────
console.log('\n--- 4. Backward Compatibility for Older / Legacy Reports ---');

const legacyReportNullNumber = {
  Report_ID: 10,
  Issue_ID: 10,
  PC_ID: 3,
  PC_Number: 1,
  Room_Number: '204',
  Student_Name: 'Legacy Student',
  Student_Number: null,
  Status: 'Pending',
  Priority_Level: 'Low',
  Date_Reported: '2025-05-10T10:00:00Z',
  Issue_Description: '[Program & Section: BSIT 1A] [Issues: Keyboard] Remarks: Missing caps lock'
};

test('IT Head / Faculty Modal: renders legacy report with null student number cleanly', () => {
  const env = createReportModalSandbox();
  env.viewTicketModal(10, [legacyReportNullNumber]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Legacy Student'), 'Modal must contain "Legacy Student"');
  assert(!html.includes('Legacy Student ('), 'Modal must not display opening parenthesis after name');
  assert(!html.includes('null'), 'Modal must not contain "null"');
  assert(!html.includes('undefined'), 'Modal must not contain "undefined"');
  assert(!html.includes('()'), 'Modal must not contain empty parentheses');
});

test('MIS Maintenance Modal: renders legacy report with null student number cleanly', () => {
  const env = createMaintenanceModalSandbox();
  env.viewTicketModal(10, [legacyReportNullNumber]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Legacy Student'), 'MIS modal must contain "Legacy Student"');
  assert(!html.includes('Legacy Student ('), 'MIS modal must not display opening parenthesis after name');
  assert(!html.includes('null'), 'MIS modal must not contain "null"');
  assert(!html.includes('undefined'), 'MIS modal must not contain "undefined"');
  assert(!html.includes('()'), 'MIS modal must not contain empty parentheses');
});

const legacyMultiReport = {
  Report_ID: 11,
  Issue_ID: 11,
  PC_ID: 3,
  PC_Number: 1,
  Room_Number: '204',
  Student_Name: 'Legacy Student',
  Student_Number: null,
  Status: 'Pending',
  Priority_Level: 'Low',
  Date_Reported: '2025-05-10T10:00:00Z',
  reports: [
    {
      Report_ID: 1,
      Student_Name: 'Old Student A',
      Student_Number: null,
      Issue_Description: '[Program & Section: BSIT 1A] Remarks: Missing key',
      Date_Reported: '2025-05-10T10:00:00Z'
    },
    {
      Report_ID: 2,
      Student_Name: 'New Student B',
      Student_Number: '2026-990011',
      Issue_Description: '[Program & Section: BSIT 1A] Remarks: Spacebar loose',
      Date_Reported: '2026-01-15T11:00:00Z'
    }
  ]
};

test('Mixed legacy & new reporters in multi-report modal: handles null and non-null correctly', () => {
  const env = createReportModalSandbox();
  env.viewTicketModal(11, [legacyMultiReport]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Old Student A'), 'Old student name present');
  assert(!html.includes('Old Student A ('), 'Old student has no parentheses');
  assert(html.includes('New Student B') && html.includes('(2026-990011)'), 'New student has formatted number in parentheses');
});

// ────────────────────────────────────────────────────────────────
// Test Section 5: Search Query Matching on Student Number
// ────────────────────────────────────────────────────────────────
console.log('\n--- 5. Search Query Matching by Student Number ---');

const filters = createReportFiltersSandbox();

test('reportFilters matches by student number with dashes (e.g., "2022-123456")', () => {
  assert(filters.matchesReportQuery(newReport, '2022-123456'), 'Should match exact student number');
});

test('reportFilters matches by student number without dashes (e.g., "2022123456")', () => {
  assert(filters.matchesReportQuery(newReport, '2022123456'), 'Should match sanitized student number');
});

test('reportFilters matches by partial student number (e.g., "123456")', () => {
  assert(filters.matchesReportQuery(newReport, '123456'), 'Should match partial student number');
});

test('reportFilters matches by student number in linked multi-reports', () => {
  assert(filters.matchesReportQuery(multiReporterIssue, '2021-111222'), 'Should match linked reporter student number');
  assert(filters.matchesReportQuery(multiReporterIssue, '2022-333444'), 'Should match second linked reporter student number');
});

// ────────────────────────────────────────────────────────────────
// Test Section 6: Staff & OJT Attribution Non-Regression
// ────────────────────────────────────────────────────────────────
console.log('\n--- 6. Staff & OJT Resolver Attribution Non-Regression ---');

const resolvedStaffReport = {
  Report_ID: 401,
  Issue_ID: 401,
  PC_ID: 15,
  PC_Number: 9,
  Room_Number: '204',
  Student_Name: 'Juan Dela Cruz',
  Student_Number: '2022-123456',
  Status: 'Resolved',
  Priority_Level: 'Low',
  Date_Reported: '2026-10-01T10:00:00Z',
  Resolved_At: '2026-10-02T14:00:00Z',
  Resolved_By_Name: 'Engr. John Davis',
  Resolved_By_Role: 'MIS Staff',
  Follow_Up_Count: 1,
  Followed_Up_By_Name: 'Dr. Santos',
  Followed_Up_By_Role: 'IT Dept. Head',
  Issue_Description: '[Program & Section: BSIT 3A] Remarks: Fixed cables'
};

test('Resolved ticket modal displays both student number and staff resolver attribution correctly', () => {
  const env = createReportModalSandbox();
  env.viewTicketModal(401, [resolvedStaffReport]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Juan Dela Cruz (2022-123456)'), 'Reporting student displays student number');
  assert(html.includes('Engr. John Davis'), 'Resolver name preserved');
  assert(html.includes('MIS Staff'), 'Resolver role preserved');
  assert(!html.includes('Engr. John Davis (2022-123456)'), 'Staff resolver must NOT have student number attributed to them');
});

test('MIS modal displays both student number and staff resolver attribution correctly', () => {
  const env = createMaintenanceModalSandbox();
  env.viewTicketModal(401, [resolvedStaffReport]);
  const modal = env.getModal();
  const html = modal.innerHTML;

  assert(html.includes('Juan Dela Cruz (2022-123456)'), 'Reporting student displays student number');
  assert(html.includes('Engr. John Davis'), 'Resolver name preserved');
  assert(html.includes('MIS Staff'), 'Resolver role preserved');
  assert(!html.includes('Engr. John Davis (2022-123456)'), 'Staff resolver must NOT have student number attributed to them');
});

// ────────────────────────────────────────────────────────────────
// Test Section 7: Verified Student Form Banner & Card/Table Visual Coverage
// ────────────────────────────────────────────────────────────────
console.log('\n--- 7. Verified Student Form Banner & Card/Table Visual Coverage ---');

test('Submit PC Report Form: verified student banner displays Name (Student Number)', () => {
  const submitJsPath = path.join(__dirname, '..', 'js', 'pages', 'submit-pc-report.js');
  const submitJs = fs.readFileSync(submitJsPath, 'utf8');

  let bannerText = '';
  const mockSummaryEl = {
    set textContent(val) { bannerText = val; },
    get textContent() { return bannerText; }
  };
  const mockNameEl = { value: '', setAttribute: () => {} };
  const mockNumEl = { value: '', setAttribute: () => {} };

  const sandbox = {
    console,
    Date,
    String,
    Number,
    Boolean,
    Array,
    URLSearchParams,
    document: {
      getElementById: (id) => {
        if (id === 'verified-student-summary') return mockSummaryEl;
        if (id === 'student-name') return mockNameEl;
        if (id === 'student-number') return mockNumEl;
        return null;
      },
      addEventListener: () => {},
      readyState: 'complete'
    },
    sessionStorage: {
      getItem: () => JSON.stringify({
        verificationToken: 'tok-123',
        studentName: 'DELA CRUZ, JUAN M.',
        studentNumber: '2022-100234',
        roomNumber: '204',
        pcNumber: '5'
      })
    },
    location: { search: '?room=204&pc=5' },
    window: {}
  };
  sandbox.window = sandbox;

  vm.runInNewContext(submitJs, sandbox);

  // Trigger gateway check
  sandbox.checkVerificationGateway();

  assert.strictEqual(
    bannerText,
    'DELA CRUZ, JUAN M. (2022-100234)',
    'Verified Student banner must display "Name (Student Number)"'
  );
  assert.strictEqual(mockNameEl.value, 'DELA CRUZ, JUAN M.');
  assert.strictEqual(mockNumEl.value, '2022-100234');
});

test('PC Issue Report Card in report.renderer.js preserves clean asset-focused summary without raw name leak', () => {
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.renderer.js'), 'utf8');
  const sandbox = {
    console,
    Date,
    String,
    Number,
    Boolean,
    Array,
    escapeHtml: (s) => (s || ''),
    reportParser: {
      parseIssueDescription: () => ({ section: 'BSIT 3A', issues: 'Monitor', remarks: 'Flickering' })
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(rendererJs, sandbox);

  const cardHtml = sandbox.reportRenderer.renderTicketCard(newReport);
  assert(cardHtml.includes('Room 204 – PC 5'), 'Card header retains asset title');
  assert(cardHtml.includes('btn-view-full-report'), 'Card retains "View Full Report" button');
  // Card summary keeps layout clean, leaving full metadata for the modal
  assert(!cardHtml.includes('Juan Dela Cruz'), 'Card summary reserves reporter identity for View Full Report modal');
});

test('MIS Dashboard Table in staff-dashboard.reports.js preserves 6-column tabular layout', () => {
  const staffJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-staff-dashboard', 'staff-dashboard.reports.js'), 'utf8');
  let tableHtml = '';
  const mockTbody = {
    dataset: {},
    set innerHTML(val) { tableHtml = val; },
    get innerHTML() { return tableHtml; }
  };
  const sandbox = {
    console,
    Date,
    String,
    Number,
    Boolean,
    Array,
    encodeURIComponent: (s) => s,
    escapeHtml: (s) => (s || ''),
    document: {
      getElementById: (id) => (id === 'misDashboardReportRows' ? mockTbody : null)
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(staffJs, sandbox);

  sandbox.staffDashboardReports.renderDashboardTable([newReport], mockTbody);
  assert(tableHtml.includes('LS-TKT-301'), 'Table contains ticket tag');
  assert(tableHtml.includes('Room 204'), 'Table contains room number');
  assert(tableHtml.includes('PC 5'), 'Table contains PC unit');
});

console.log('\n================================================================');
console.log(`Summary: ${passed} passed, ${failed} failed`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
}

