const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing View Details button, accessibility attributes, and CSS rules...');

// 1. Check maintenance.renderer.js
const rendererPath = path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.renderer.js');
const rendererCode = fs.readFileSync(rendererPath, 'utf8');

assert(rendererCode.includes('<span>View Details</span>'), 'Must contain <span>View Details</span>');
assert(!rendererCode.includes('<span>View Info</span>'), 'Must NOT contain <span>View Info</span>');
assert(rendererCode.includes('title="View full ticket details"'), 'Must contain updated tooltip title');
assert(rendererCode.includes('aria-label="View full ticket details for ticket LS-TKT-${report.Report_ID}"'), 'Must contain updated aria-label');
assert(rendererCode.includes('data-lucide="eye"'), 'Must retain Lucide eye icon');
assert(rendererCode.includes('class="btn-view-ticket-info"'), 'Must retain CSS class .btn-view-ticket-info');
assert(rendererCode.includes('data-action="view-ticket-details"'), 'Must retain data-action="view-ticket-details"');

console.log('✔ Verified maintenance.renderer.js button markup & attributes');

// 2. Check CSS in tables.css
const rawTables = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'tables.css'), 'utf8');
const tablesCss = rawTables.replace(/\r\n/g, '\n');

assert(tablesCss.includes('.table-actions-cluster .btn-view-ticket-info {\n    width: 118px !important;'), 'tables.css desktop cluster must set .btn-view-ticket-info width to 118px');
assert(tablesCss.includes('.table-actions-cluster .completed-chip {\n    width: 104px !important;'), 'tables.css desktop cluster must preserve .completed-chip width at 104px');
assert(tablesCss.includes('width: 118px;\n  min-width: 118px;\n  max-width: 118px;'), 'tables.css base .btn-view-ticket-info must have 118px width');

// Check mobile table rules
const mobileSection = tablesCss.substring(tablesCss.indexOf('@media (max-width: 768px)'));
assert(mobileSection.includes('width: 100% !important;'), 'tables.css mobile must set width: 100% !important');
assert(mobileSection.includes('min-width: 0 !important;'), 'tables.css mobile must set min-width: 0 !important');
assert(mobileSection.includes('max-width: 100% !important;'), 'tables.css mobile must set max-width: 100% !important');

console.log('✔ Verified tables.css desktop & mobile responsive rules');

// 3. Check CSS in mis-maintenance.html
const rawMaint = fs.readFileSync(path.join(__dirname, '..', 'mis-maintenance.html'), 'utf8');
const maintHtml = rawMaint.replace(/\r\n/g, '\n');

assert(maintHtml.includes('.table-actions-cluster .btn-view-ticket-info {\n        width: 118px !important;'), 'mis-maintenance.html desktop cluster must set .btn-view-ticket-info width to 118px');
assert(maintHtml.includes('.table-actions-cluster .completed-chip {\n        width: 104px !important;'), 'mis-maintenance.html desktop cluster must preserve .completed-chip width at 104px');
assert(maintHtml.includes('width: 118px;\n      min-width: 118px;\n      max-width: 118px;'), 'mis-maintenance.html base .btn-view-ticket-info must have 118px width');

// Check mobile HTML rules
const mobileMaint = maintHtml.substring(maintHtml.indexOf('@media (max-width: 768px)'));
assert(mobileMaint.includes('min-width: 0 !important;'), 'mis-maintenance.html mobile must set min-width: 0 !important');
assert(mobileMaint.includes('max-width: 100% !important;'), 'mis-maintenance.html mobile must set max-width: 100% !important');

console.log('✔ Verified mis-maintenance.html desktop & mobile responsive rules');

// 4. Check Documentation
const rawSysDoc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'SYSTEM_DOCUMENTATION.md'), 'utf8');
const sysDoc = rawSysDoc.replace(/\r\n/g, '\n');
const rawChapDoc = fs.readFileSync(path.join(__dirname, '..', 'CHAPTER-1-5-SYSTEM-DOCUMENTATION.md'), 'utf8');
const chapDoc = rawChapDoc.replace(/\r\n/g, '\n');

assert(sysDoc.includes('[ 👁️ View Details ]'), 'SYSTEM_DOCUMENTATION.md must reference [ 👁️ View Details ]');
assert(!sysDoc.includes('[ 👁️ View Info ]'), 'SYSTEM_DOCUMENTATION.md must NOT reference [ 👁️ View Info ]');

assert(chapDoc.includes('[ 👁️ View Details ]'), 'CHAPTER-1-5-SYSTEM-DOCUMENTATION.md must reference [ 👁️ View Details ]');
assert(!chapDoc.includes('[ 👁️ View Info ]'), 'CHAPTER-1-5-SYSTEM-DOCUMENTATION.md must NOT reference [ 👁️ View Info ]');

console.log('✔ Verified documentation references synchronized');

// 5. Check Render Output (Mocking minimal DOM for maintenanceRenderer)
const jsdomContext = {
  document: {
    getElementById: () => ({ innerHTML: '', _lastRenderSignature: '' }),
    createElement: () => ({
      style: {},
      classList: { add: () => {}, remove: () => {} },
      addEventListener: () => {}
    }),
    addEventListener: () => {}
  },
  lucide: { createIcons: () => {} }
};

const fn = new Function('global', 'window', 'document', rendererCode + '; return global.maintenanceRenderer;');
const maintenanceRenderer = fn(jsdomContext, jsdomContext, jsdomContext.document);

const dummyTbody = { innerHTML: '', _lastRenderSignature: null };
const sampleReports = [
  {
    Report_ID: 101,
    Status: 'Pending',
    Room_Number: '301',
    PC_Number: '05',
    Date_Reported: new Date().toISOString(),
    Issue_Description: '[Program & Section: BSIT-3A] [Issues: Keyboard] Remarks: Missing keys'
  },
  {
    Report_ID: 102,
    Status: 'Resolved',
    Room_Number: '302',
    PC_Number: '12',
    Date_Reported: new Date().toISOString(),
    Resolved_At: new Date().toISOString(),
    Resolved_By_Name: 'Juan Dela Cruz',
    Resolved_By_Role: 'MIS Technician',
    Issue_Description: '[Program & Section: BSIT-3B] [Issues: Mouse] Remarks: Cleaned lens'
  }
];

maintenanceRenderer.renderTableRows(sampleReports, dummyTbody);
const renderedHtml = dummyTbody.innerHTML;

// Check Pending row
assert(renderedHtml.includes('View Details'), 'Rendered table rows must contain "View Details"');
assert(!renderedHtml.includes('View Info'), 'Rendered table rows must NOT contain "View Info"');
assert(renderedHtml.includes('title="View full ticket details"'), 'Rendered table rows must contain updated title tooltip');
assert(renderedHtml.includes('aria-label="View full ticket details for ticket LS-TKT-101"'), 'Rendered pending row has correct aria-label');
assert(renderedHtml.includes('aria-label="View full ticket details for ticket LS-TKT-102"'), 'Rendered resolved row has correct aria-label');
assert(renderedHtml.includes('Mark Resolved'), 'Pending row must contain "Mark Resolved"');

// Check Resolved row
assert(renderedHtml.includes('completed-chip interactive'), 'Resolved row must contain interactive completed-chip');
assert(renderedHtml.includes('Completed'), 'Resolved row must contain "Completed" text');
assert(renderedHtml.includes('Juan Dela Cruz'), 'Resolved row must attribute resolver');

console.log('✔ Verified runtime rendered output for Pending & Resolved rows');
console.log('🎉 ALL VERIFICATION CHECKS PASSED!');
