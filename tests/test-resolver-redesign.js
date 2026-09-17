/**
 * Comprehensive Validation Test Suite: Resolver UI Redesign across 4 Surfaces
 * (Integrated Modal Header + Interactive Completed Badge & Floating Popover)
 * 1. MIS Maintenance Ticket Details Modal (js/pages/mis-maintenance/maintenance.modal.js)
 * 2. PC Report Details Modal (js/reports/report.modal.js)
 * 3. MIS Maintenance Table (js/pages/mis-maintenance/maintenance.renderer.js)
 * 4. PC Report Cards (js/reports/report.renderer.js)
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 Starting Resolver UI Redesign Verification (Compact & Interactive)');
console.log('================================================================\n');

// ─── 1. Verify CSS in css/components/modals.css ─────────────────────────────
console.log('--- 1. Checking modals.css for Integrated Resolution Language ---');
const modalsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'modals.css'), 'utf8');

const requiredClasses = [
  '.ticket-modal-resolution-row',
  '.tm-res-label',
  '.tm-res-who',
  '.tm-res-icon',
  '.tm-res-name',
  '.tm-res-role',
  '.tm-res-dot',
  '.tm-res-when',
  '.tm-res-time-icon',
  '.table-resolved-wrap',
  '.completed-chip.interactive',
  '.table-resolver-popover',
  '.popover-arrow',
  '.popover-header',
  '.popover-tag',
  '.popover-time',
  '.popover-user-row',
  '.popover-avatar',
  '.popover-user-info',
  '.popover-name',
  '.popover-role',
  '.popover-footer',
  '.rc-card-resolution',
  '.rc-card-res-who',
  '.rc-card-res-icon',
  '.rc-card-res-name',
  '.rc-card-res-role',
  '.rc-card-res-dot',
  '.rc-card-res-when',
  '.rc-card-res-time-icon'
];

requiredClasses.forEach(cls => {
  assert(modalsCss.includes(cls), `modals.css must include ${cls}`);
});
console.log('  ✔ PASS: All required compact resolution CSS classes present');

// Verify Dark Mode rules
assert(modalsCss.includes('html.dark-mode .ticket-modal-resolution-row'), 'Dark mode modal resolution row override missing');
assert(modalsCss.includes('[data-theme="dark"] .ticket-modal-resolution-row'), 'Data-theme dark modal override missing');
assert(modalsCss.includes('html.dark-mode .completed-chip.interactive'), 'Dark mode completed-chip override missing');
assert(modalsCss.includes('html.dark-mode .table-resolver-popover'), 'Dark mode table popover override missing');
assert(modalsCss.includes('html.dark-mode .rc-card-res-name'), 'Dark mode rc-card-res-name override missing');
console.log('  ✔ PASS: Dark mode styles present for all surfaces');

// Verify High Contrast rules
assert(modalsCss.includes('html.high-contrast .ticket-modal-resolution-row'), 'High contrast modal override missing');
assert(modalsCss.includes('html.high-contrast .completed-chip.interactive'), 'High contrast completed-chip override missing');
assert(modalsCss.includes('html.high-contrast .table-resolver-popover'), 'High contrast table popover override missing');
assert(modalsCss.includes('html.high-contrast .rc-card-res-name'), 'High contrast rc-card override missing');
console.log('  ✔ PASS: High contrast styles present for all surfaces');

// Verify Responsive rule for mobile (hide popover on touch screens <=768px)
assert(modalsCss.includes('@media (max-width: 768px)'), 'Mobile media query missing');
console.log('  ✔ PASS: Mobile popover suppression rule present');


// ─── 2. Test Surface 1: MIS Maintenance Ticket Details Modal ────────────────
console.log('\n--- 2. Checking Surface 1: MIS Maintenance Ticket Details Modal ---');
const modalJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.modal.js'), 'utf8');

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
      parseIssueDescription: () => ({ section: 'BSIT-3A', issues: 'System Unit', remarks: 'Won\'t turn on' })
    },
    maintenanceRenderer: {
      formatIssueBadges: () => '<span class="badge">System Unit</span>'
    },
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.runInNewContext(modalJsCode, sandbox);
  return {
    getModal: () => modalCreated,
    viewTicketModal: sandbox.viewTicketModal || (sandbox.maintenanceModal && sandbox.maintenanceModal.viewTicketModal)
  };
}

// Test 2A: Resolved ticket with known resolver
{
  const { getModal, viewTicketModal } = createMaintenanceModalSandbox();
  const resolvedTicket = {
    Report_ID: 101,
    Status: 'Resolved',
    Room_Number: '301',
    PC_Number: '15',
    Student_Name: 'Juan Dela Cruz',
    Resolved_By_Name: 'Andrei Meow',
    Resolved_By_Role: 'MIS Staff',
    Resolved_At: '2026-09-17T14:42:00.000Z',
    Date_Reported: '2026-09-17T10:00:00.000Z',
    Issue_Description: '[Program & Section: BSIT-3A] [Issues: System Unit] Remarks: Won\'t turn on'
  };

  viewTicketModal(101, [resolvedTicket]);
  const modal = getModal();
  assert(modal, 'Modal should be injected into DOM');
  const html = modal.innerHTML;

  assert(html.includes('class="ticket-modal-resolution-row"'), 'Modal must contain ticket-modal-resolution-row');
  assert(!html.includes('ticket-resolution-banner'), 'Modal must NOT contain bulky standalone banner');
  assert(html.includes('Andrei Meow'), 'Modal must display resolver name Andrei Meow');
  assert(html.includes('MIS Staff'), 'Modal must display resolver role MIS Staff');
  assert(html.includes('RESOLVED'), 'Modal must display RESOLVED status pill');

  // Check integration: resolution row must be inside ticket-modal-header before ticket-modal-body
  const headerIdx = html.indexOf('class="ticket-modal-header"');
  const resRowIdx = html.indexOf('class="ticket-modal-resolution-row"');
  const bodyIdx = html.indexOf('class="ticket-modal-body"');
  assert(headerIdx !== -1 && resRowIdx !== -1 && bodyIdx !== -1, 'Header, resolution row, and body must all exist');
  assert(headerIdx < resRowIdx && resRowIdx < bodyIdx, 'Resolution row must be integrated inside header before body');
  console.log('  ✔ PASS: Known resolver integrated seamlessly into modal header directly below status');
}

// Test 2B: Historical resolved ticket (NULL resolver)
{
  const { getModal, viewTicketModal } = createMaintenanceModalSandbox();
  const historicalTicket = {
    Report_ID: 102,
    Status: 'Resolved',
    Room_Number: '302',
    PC_Number: '8',
    Student_Name: 'Maria Santos',
    Resolved_By_Name: null,
    Resolved_By_Role: null,
    Resolved_At: '2025-11-20T10:30:00.000Z',
    Date_Reported: '2025-11-20T08:00:00.000Z',
    Issue_Description: '[Program & Section: BSIT-2B] [Issues: Mouse] Remarks: Broken cable'
  };

  viewTicketModal(102, [historicalTicket]);
  const modal = getModal();
  const html = modal.innerHTML;

  assert(html.includes('class="ticket-modal-resolution-row"'), 'Historical ticket still renders resolution row');
  assert(html.includes('Work Order Completed'), 'Historical ticket displays fallback Work Order Completed');
  assert(!html.includes('Andrei Meow'), 'Historical ticket does NOT invent a user identity');
  console.log('  ✔ PASS: Historical resolved ticket falls back safely to "Work Order Completed"');
}

// Test 2C: Pending ticket
{
  const { getModal, viewTicketModal } = createMaintenanceModalSandbox();
  const pendingTicket = {
    Report_ID: 103,
    Status: 'Pending',
    Room_Number: '303',
    PC_Number: '5',
    Student_Name: 'Pedro Cruz',
    Resolved_By_Name: null,
    Resolved_By_Role: null,
    Resolved_At: null,
    Date_Reported: '2026-09-17T11:00:00.000Z',
    Issue_Description: '[Program & Section: BSIT-1A] [Issues: Keyboard] Remarks: Keys stuck'
  };

  viewTicketModal(103, [pendingTicket]);
  const modal = getModal();
  const html = modal.innerHTML;

  assert(!html.includes('ticket-modal-resolution-row'), 'Pending ticket must NOT display resolution row');
  assert(!html.includes('Resolved by'), 'Pending ticket must NOT display Resolved by');
  console.log('  ✔ PASS: Pending ticket does NOT show resolution row');
}


// ─── 3. Test Surface 2: PC Report Details Modal ─────────────────────────────
console.log('\n--- 3. Checking Surface 2: PC Report Details Modal ---');
const reportModalJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.modal.js'), 'utf8');

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
        dataset: { page: 'mis-pc-reports' }
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    lucide: { createIcons: () => {} },
    reportParser: {
      parseIssueDescription: () => ({ section: 'BSIT-4A', issues: 'Monitor', remarks: 'Display flickering' })
    },
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.runInNewContext(reportModalJsCode, sandbox);
  return {
    getModal: () => modalCreated,
    viewTicketModal: sandbox.viewTicketModal || (sandbox.reportModal && sandbox.reportModal.viewTicketModal)
  };
}

// Test 3A: Resolved report details modal with known resolver
{
  const { getModal, viewTicketModal } = createReportModalSandbox();
  const resolvedReport = {
    Report_ID: 201,
    Status: 'Resolved',
    Room_Number: '304',
    PC_Number: '12',
    Student_Name: 'Ana Reyes',
    Resolved_By_Name: 'Andrei Meow',
    Resolved_By_Role: 'OJT Staff',
    Resolved_At: '2026-09-17T14:42:00.000Z',
    Date_Reported: '2026-09-17T10:00:00.000Z',
    Issue_Description: '[Program & Section: BSIT-4A] [Issues: Monitor] Remarks: Display flickering'
  };

  viewTicketModal(201, [resolvedReport]);
  const modal = getModal();
  assert(modal, 'PC Report Details Modal should be created');
  const html = modal.innerHTML;

  assert(html.includes('class="ticket-modal-resolution-row"'), 'PC Report modal must contain ticket-modal-resolution-row');
  assert(!html.includes('ticket-resolution-banner'), 'PC Report modal must NOT contain banner');
  assert(html.includes('Andrei Meow'), 'PC Report modal must display resolver name');
  assert(html.includes('OJT Staff'), 'PC Report modal must display resolver role');

  // Hierarchy check: resolution row sits inside header before Laboratory 2x2 grid
  const resRowIndex = html.indexOf('class="ticket-modal-resolution-row"');
  const labIndex = html.indexOf('Laboratory');
  assert(resRowIndex !== -1 && labIndex !== -1, 'Resolution row and Laboratory must be present');
  assert(resRowIndex < labIndex, 'Resolution row must appear BEFORE Laboratory 2x2 grid in PC Report modal');
  console.log('  ✔ PASS: Integrated Resolution Row placed cleanly inside modal header before body grid');
}

// Test 3B: Historical report in PC Report Details Modal
{
  const { getModal, viewTicketModal } = createReportModalSandbox();
  const historicalReport = {
    Report_ID: 202,
    Status: 'Resolved',
    Room_Number: '305',
    PC_Number: '3',
    Student_Name: 'Carlos Tan',
    Resolved_By_Name: null,
    Resolved_By_Role: null,
    Resolved_At: '2025-10-15T09:15:00.000Z',
    Date_Reported: '2025-10-15T08:00:00.000Z',
    Issue_Description: '[Program & Section: BSCS-2A] [Issues: Mouse] Remarks: None'
  };

  viewTicketModal(202, [historicalReport]);
  const modal = getModal();
  const html = modal.innerHTML;

  assert(html.includes('class="ticket-modal-resolution-row"'), 'Historical ticket renders resolution row');
  assert(html.includes('Work Order Completed'), 'Historical ticket displays Work Order Completed');
  console.log('  ✔ PASS: Historical PC Report modal falls back cleanly to "Work Order Completed"');
}


// ─── 4. Test Surface 3: MIS Maintenance Table ───────────────────────────────
console.log('\n--- 4. Checking Surface 3: MIS Maintenance Table Actions ---');
const tableRendererJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.renderer.js'), 'utf8');

function createTableSandbox() {
  const tbody = {
    innerHTML: '',
    _lastRenderSignature: ''
  };
  const bodyChildren = [];
  const body = {
    appendChild: (el) => bodyChildren.push(el)
  };
  const elementsById = {
    dynamicMaintenanceRows: tbody
  };
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    Math,
    setTimeout,
    clearTimeout,
    document: {
      body,
      getElementById: (id) => elementsById[id] || bodyChildren.find(c => c.id === id) || null,
      createElement: (tag) => {
        const el = {
          tagName: tag,
          _id: '',
          get id() { return el._id; },
          set id(v) { el._id = v; elementsById[v] = el; },
          className: '',
          innerHTML: '',
          style: {
            setProperty: (k, v) => { el.style[k] = v; }
          },
          classList: {
            add: (cls) => { el.className += ' ' + cls; },
            remove: (cls) => { el.className = el.className.replace(cls, '').trim(); },
            toggle: (cls, cond) => {
              if (cond) el.className += ' ' + cls;
              else el.className = el.className.replace(cls, '').trim();
            }
          },
          setAttribute: (k, v) => {
            el[k] = v;
            if (k === 'id') { el.id = v; }
          },
          getAttribute: (k) => el[k] || '',
          addEventListener: () => {},
          offsetWidth: 230,
          offsetHeight: 95
        };
        return el;
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    lucide: { createIcons: () => {} },
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.window.innerWidth = 1200;

  vm.runInNewContext(tableRendererJsCode, sandbox);
  return {
    tbody,
    maintenanceRenderer: sandbox.maintenanceRenderer || sandbox.window.maintenanceRenderer
  };
}

{
  const { tbody, maintenanceRenderer } = createTableSandbox();
  const reports = [
    {
      Report_ID: 301,
      Status: 'Resolved',
      Room_Number: '201',
      PC_Number: '1',
      Date_Reported: '2026-09-17T08:00:00.000Z',
      Resolved_By_Name: 'Andrei Meow',
      Resolved_By_Role: 'MIS Staff',
      Resolved_At: '2026-09-17T14:42:00.000Z',
      Issue_Description: '[Program & Section: BSIT-1B] [Issues: Audio] Remarks: No sound'
    },
    {
      Report_ID: 302,
      Status: 'Resolved',
      Room_Number: '201',
      PC_Number: '2',
      Date_Reported: '2026-09-17T08:30:00.000Z',
      Resolved_By_Name: null,
      Resolved_By_Role: null,
      Resolved_At: '2026-09-17T14:50:00.000Z',
      Issue_Description: '[Program & Section: BSIT-1B] [Issues: Audio] Remarks: No sound'
    },
    {
      Report_ID: 303,
      Status: 'Pending',
      Room_Number: '201',
      PC_Number: '3',
      Date_Reported: '2026-09-17T09:00:00.000Z',
      Resolved_By_Name: null,
      Resolved_By_Role: null,
      Issue_Description: '[Program & Section: BSIT-1B] [Issues: Audio] Remarks: No sound'
    }
  ];

  maintenanceRenderer.renderTableRows(reports);
  const rowsHtml = tbody.innerHTML;

  // Report 301: Resolved with known resolver
  assert(rowsHtml.includes('class="table-resolved-wrap"'), 'Table row must include table-resolved-wrap container');
  assert(rowsHtml.includes('completed-chip interactive'), 'Table row must include interactive completed-chip button');
  assert(rowsHtml.includes('Completed'), 'Table row must display Completed chip text');
  assert(rowsHtml.includes('data-action="view-ticket-details"'), 'Completed chip must have data-action="view-ticket-details"');
  assert(rowsHtml.includes('data-report-id="301"'), 'Completed chip must include report ID');
  assert(rowsHtml.includes('data-resolver-name="Andrei Meow"'), 'Chip must include resolver name');
  assert(rowsHtml.includes('data-resolver-role="MIS Staff"'), 'Chip must include resolver role');
  assert(rowsHtml.includes('2026'), 'Chip data-resolved-at must include the 4-digit year');

  // Report 302: Historical NULL resolver
  assert(rowsHtml.includes('data-report-id="302"'), 'Historical ticket renders completed button');

  // Report 303: Pending Mark Resolved button
  assert(rowsHtml.includes('btn-resolve-ticket'), 'Pending report must render Mark Resolved button');

  // Test dynamic singleton popover positioning & content
  const mockChip301 = {
    getAttribute: (attr) => {
      const map = {
        'data-resolver-name': 'Andrei Meow',
        'data-resolver-role': 'MIS Staff',
        'data-resolved-at': 'Sep 17, 2026 • 2:42 PM',
        'data-report-id': '301'
      };
      return map[attr] || '';
    },
    getBoundingClientRect: () => ({ top: 300, bottom: 332, left: 800, right: 900, width: 100, height: 32 })
  };

  maintenanceRenderer.positionResolverPopover(mockChip301);
  const tooltip = maintenanceRenderer.getSingletonTooltip();
  assert(tooltip, 'Singleton tooltip must exist');
  assert(tooltip.innerHTML.includes('RESOLVED BY'), 'Tooltip header contains RESOLVED BY');
  assert(tooltip.innerHTML.includes('Andrei Meow'), 'Tooltip contains Andrei Meow');
  assert(tooltip.innerHTML.includes('MIS Staff'), 'Tooltip contains MIS Staff');
  assert(!tooltip.innerHTML.includes('View ticket details'), 'Tooltip must omit redundant view ticket details link');

  // Test historical fallback in popover
  const mockChip302 = {
    getAttribute: (attr) => {
      const map = {
        'data-resolver-name': '',
        'data-resolver-role': '',
        'data-resolved-at': 'Sep 17, 2026 • 2:50 PM',
        'data-report-id': '302'
      };
      return map[attr] || '';
    },
    getBoundingClientRect: () => ({ top: 100, bottom: 132, left: 800, right: 900, width: 100, height: 32 })
  };
  maintenanceRenderer.positionResolverPopover(mockChip302);
  assert(tooltip.innerHTML.includes('WORK ORDER COMPLETED'), 'Historical ticket popover displays WORK ORDER COMPLETED');

  console.log('  ✔ PASS: MIS Maintenance table features interactive Completed chip with floating popover preview');
}


// ─── 5. Test Surface 4: PC Report Cards ─────────────────────────────────────
console.log('\n--- 5. Checking Surface 4: PC Report Cards ---');
const cardRendererJsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.renderer.js'), 'utf8');

function createCardSandbox() {
  const sandbox = {
    console,
    Date,
    String,
    Boolean,
    Number,
    Array,
    Object,
    document: {
      body: { dataset: { page: 'reports' } }
    },
    lucide: { createIcons: () => {} },
    formatTicketDate: () => 'Sep 17, 2026',
    escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.runInNewContext(cardRendererJsCode, sandbox);
  return sandbox.reportRenderer;
}

{
  const reportRenderer = createCardSandbox();

  // Test 5A: Resolved Card with known resolver
  const resolvedCardReport = {
    Report_ID: 401,
    Status: 'Resolved',
    Room_Number: '105',
    PC_Number: '7',
    Date_Reported: '2026-09-17T09:00:00.000Z',
    Resolved_By_Name: 'Andrei Meow',
    Resolved_By_Role: 'MIS Staff',
    Resolved_At: '2026-09-17T14:42:00.000Z',
    Issue_Type: 'Network',
    Issue_Description: 'No internet connection'
  };

  const cardHtml = reportRenderer.renderSingleCard(resolvedCardReport);

  assert(cardHtml.includes('class="rc-card-resolution"'), 'Card must render rc-card-resolution sub-strip');
  assert(!cardHtml.includes('rc-resolution-bar'), 'Card must NOT render old bulky rc-resolution-bar');
  assert(cardHtml.includes('class="rc-card-res-name"'), 'Card must render rc-card-res-name element');
  assert(cardHtml.includes('Andrei Meow'), 'Card must display resolver name Andrei Meow');
  assert(cardHtml.includes('class="rc-card-res-role"'), 'Card must render rc-card-res-role element');
  assert(cardHtml.includes('MIS Staff'), 'Card must display role MIS Staff');
  assert(cardHtml.includes('rc-card-res-when'), 'Card must render resolution time');

  // Ensure resolution sub-strip is placed between header and middle row (no collision)
  const headerIdx = cardHtml.indexOf('report-card-header');
  const stripIdx = cardHtml.indexOf('rc-card-resolution');
  const middleIdx = cardHtml.indexOf('report-card-middle-row');
  assert(headerIdx < stripIdx && stripIdx < middleIdx, 'rc-card-resolution must sit cleanly between header and middle row');

  // Ensure header status badge is clean and uncrowded
  assert(cardHtml.includes('<span class="status-badge resolved">RESOLVED</span>'), 'Header right displays clean RESOLVED badge');

  console.log('  ✔ PASS: PC Report card renders unboxed, compact .rc-card-resolution strip');

  // Test 5B: Historical Card (NULL resolver)
  const historicalCardReport = {
    Report_ID: 402,
    Status: 'Resolved',
    Room_Number: '105',
    PC_Number: '8',
    Date_Reported: '2025-08-10T09:00:00.000Z',
    Resolved_By_Name: null,
    Resolved_By_Role: null,
    Resolved_At: '2025-08-10T11:00:00.000Z',
    Issue_Type: 'Hardware',
    Issue_Description: 'Power issue'
  };

  const histCardHtml = reportRenderer.renderSingleCard(historicalCardReport);
  assert(histCardHtml.includes('rc-card-resolution'), 'Historical card renders rc-card-resolution');
  assert(histCardHtml.includes('Work Order Completed'), 'Historical card displays Work Order Completed fallback');

  // Test 5C: Pending Card
  const pendingCardReport = {
    Report_ID: 403,
    Status: 'Pending',
    Room_Number: '105',
    PC_Number: '9',
    Date_Reported: '2026-09-17T09:00:00.000Z',
    Resolved_By_Name: null,
    Resolved_By_Role: null,
    Resolved_At: null,
    Issue_Type: 'Software',
    Issue_Description: 'App crash'
  };

  const pendCardHtml = reportRenderer.renderSingleCard(pendingCardReport);
  assert(!pendCardHtml.includes('rc-card-resolution'), 'Pending card must NOT render rc-card-resolution');
  assert(pendCardHtml.includes('<span class="status-badge pending">PENDING</span>'), 'Pending card displays PENDING status');
  console.log('  ✔ PASS: Pending and historical cards render correct respective states');
}

console.log('\n================================================================');
console.log('🎉 ALL 4 SURFACES AND SPECIFICATIONS VERIFIED SUCCESSFULLY!');
console.log('================================================================\n');
