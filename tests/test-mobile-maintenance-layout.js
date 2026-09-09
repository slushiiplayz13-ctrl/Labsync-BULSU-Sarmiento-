const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Mobile Maintenance Tracker Layout & Responsiveness...');

const maintHtml = fs.readFileSync(path.join(__dirname, '..', 'mis-maintenance.html'), 'utf8');
const tablesCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'tables.css'), 'utf8');

const normMaint = maintHtml.replace(/\r\n/g, '\n');
const normTables = tablesCss.replace(/\r\n/g, '\n');

// 1. Check desktop fixed column percentages are wrapped in @media (min-width: 769px) in mis-maintenance.html
assert(
  normMaint.includes('@media (min-width: 769px)'),
  'mis-maintenance.html should contain @media (min-width: 769px) wrapping desktop column widths'
);

// 2. Check colgroup and thead are hidden on mobile in mis-maintenance.html
assert(
  normMaint.includes('.maint-table colgroup') && normMaint.includes('display: none !important;'),
  'mis-maintenance.html must hide colgroup on mobile'
);

// 3. Check CSS grid layout on tr.maintenance-row in mis-maintenance.html
assert(
  normMaint.includes('grid-template-columns: 1fr 1fr !important;'),
  'tr.maintenance-row must use 2-column grid on mobile'
);

// 4. Check Room (col 1) and PC (col 2) side-by-side positioning
assert(
  normMaint.includes('td.col-room {\n        grid-column: 1 / 2 !important;'),
  'td.col-room must be assigned to grid-column: 1 / 2'
);
assert(
  normMaint.includes('td.col-pc {\n        grid-column: 2 / 3 !important;'),
  'td.col-pc must be assigned to grid-column: 2 / 3'
);

// 5. Check Row 1 placement: date on the left (col 1/2, row 1) and ticket on the right (col 2/3, row 1)
assert(
  normMaint.includes('td.col-date {\n        grid-column: 1 / 2 !important;\n        grid-row: 1 !important;') &&
  normMaint.includes('justify-content: flex-start !important;'),
  'td.col-date must be on the left (col 1 / 2, row 1)'
);
assert(
  normMaint.includes('td.col-ticket {\n        grid-column: 2 / 3 !important;\n        grid-row: 1 !important;') &&
  normMaint.includes('justify-content: flex-end !important;'),
  'td.col-ticket must be on the right (col 2 / 3, row 1)'
);
assert(
  normTables.includes('td.col-date {\n    grid-column: 1 / 2 !important;\n    grid-row: 1 !important;') &&
  normTables.includes('justify-content: flex-start !important;'),
  'tables.css td.col-date must be on the left (col 1 / 2, row 1)'
);
assert(
  normTables.includes('td.col-ticket {\n    grid-column: 2 / 3 !important;\n    grid-row: 1 !important;') &&
  normTables.includes('justify-content: flex-end !important;'),
  'tables.css td.col-ticket must be on the right (col 2 / 3, row 1)'
);
assert(
  normMaint.includes('td.col-actions {\n        grid-column: 1 / -1 !important;'),
  'td.col-actions must span full grid width (1 / -1)'
);
assert(
  normMaint.includes('td.col-reporter {\n        grid-column: 1 / -1 !important;'),
  'td.col-reporter must span full grid width (1 / -1)'
);

// 6. Check .btn-resolve-ticket has 100% width and min-height in col-actions
assert(
  normMaint.includes('btn-resolve-ticket') && normMaint.includes('min-height: 42px !important;'),
  'btn-resolve-ticket must have min-height and full width'
);

// 7. Verify synchronized changes in tables.css
assert(
  normTables.includes('@media (min-width: 769px) {\n  .maint-table th.col-ticket'),
  'tables.css must wrap desktop columns in min-width media query'
);
assert(
  normTables.includes('grid-template-columns: 1fr 1fr !important;'),
  'tables.css must define mobile CSS Grid for maintenance rows'
);

// 8. Verify dark mode / high-contrast styling for Room and PC
assert(
  normMaint.includes('html.high-contrast .maint-table tr.maintenance-row td.col-room .cell-icon-wrap') &&
  normMaint.includes('background: rgba(15, 23, 42, 0.6) !important;'),
  'mis-maintenance.html must style col-room .cell-icon-wrap in high-contrast/dark mode'
);
assert(
  normTables.includes('html.high-contrast .maint-table td.col-room .cell-icon-wrap') &&
  normTables.includes('background: rgba(15, 23, 42, 0.6) !important;'),
  'tables.css must style col-room .cell-icon-wrap in high-contrast/dark mode'
);

console.log('✔ All mobile maintenance tracker layout tests passed successfully!');
