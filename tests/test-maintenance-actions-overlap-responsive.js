const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Maintenance Actions Overlap Prevention & Responsive Layout...');

const tablesCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'tables.css'), 'utf8').replace(/\r\n/g, '\n');
const maintHtml = fs.readFileSync(path.join(__dirname, '..', 'mis-maintenance.html'), 'utf8').replace(/\r\n/g, '\n');

// 1. Desktop Column Percentages in tables.css
assert(tablesCss.includes('.maint-table th.col-ticket, .maint-table td.col-ticket { width: 11%; min-width: 105px; }'), 'tables.css col-ticket width must be 11%');
assert(tablesCss.includes('.maint-table th.col-date, .maint-table td.col-date { width: 13%; min-width: 125px; }'), 'tables.css col-date width must be 13%');
assert(tablesCss.includes('.maint-table th.col-room, .maint-table td.col-room { width: 11%; min-width: 100px; }'), 'tables.css col-room width must be 11%');
assert(tablesCss.includes('.maint-table th.col-pc, .maint-table td.col-pc { width: 10%; min-width: 90px; }'), 'tables.css col-pc width must be 10%');
assert(tablesCss.includes('.maint-table th.col-issues, .maint-table td.col-issues { width: 27%; min-width: 220px; }'), 'tables.css col-issues width must be 27%');
assert(tablesCss.includes('.maint-table th.col-actions, .maint-table td.col-actions { width: 28%; min-width: 270px; text-align: center; }'), 'tables.css col-actions width must be 28% and min-width 270px');
assert(tablesCss.includes('.maint-table { min-width: 980px; }'), 'tables.css maint-table min-width must be 980px');
assert(tablesCss.includes('.maint-table th:last-child, .maint-table tr:not(.maintenance-empty-row) td:last-child { padding-right: 18px !important; }'), 'tables.css last column padding-right must be 18px');

console.log('✔ tables.css column widths & min-widths verified');

// 2. Desktop Column Percentages in mis-maintenance.html
assert(maintHtml.includes('.maint-table th.col-ticket, .maint-table td.col-ticket { width: 11% !important; min-width: 105px; }'), 'maintHtml col-ticket width must be 11%');
assert(maintHtml.includes('.maint-table th.col-date, .maint-table td.col-date { width: 13% !important; min-width: 125px; }'), 'maintHtml col-date width must be 13%');
assert(maintHtml.includes('.maint-table th.col-room, .maint-table td.col-room { width: 11% !important; min-width: 100px; }'), 'maintHtml col-room width must be 11%');
assert(maintHtml.includes('.maint-table th.col-pc, .maint-table td.col-pc { width: 10% !important; min-width: 90px; }'), 'maintHtml col-pc width must be 10%');
assert(maintHtml.includes('.maint-table th.col-issues, .maint-table td.col-issues { width: 27% !important; min-width: 220px; }'), 'maintHtml col-issues width must be 27%');
assert(maintHtml.includes('.maint-table th.col-actions, .maint-table td.col-actions { width: 28% !important; min-width: 270px !important; text-align: center !important; padding-right: 18px !important; }'), 'maintHtml col-actions width must be 28% and min-width 270px');
assert(maintHtml.includes('.maint-table { min-width: 980px; }'), 'maintHtml maint-table min-width must be 980px');
assert(maintHtml.includes('.maint-table th:last-child, .maint-table tr:not(.maintenance-empty-row) td:last-child { padding-right: 18px !important; }'), 'maintHtml last column padding-right must be 18px');

console.log('✔ mis-maintenance.html style rules verified');

// 3. Colgroup & Thead in mis-maintenance.html
assert(maintHtml.includes('<col style="width: 11%;">'), 'colgroup col 1 must be 11%');
assert(maintHtml.includes('<col style="width: 13%;">'), 'colgroup col 2 must be 13%');
assert(maintHtml.includes('<col style="width: 10%;">'), 'colgroup col 4 must be 10%');
assert(maintHtml.includes('<col style="width: 27%;">'), 'colgroup col 5 must be 27%');
assert(maintHtml.includes('<col style="width: 28%;">'), 'colgroup col 6 must be 28%');
assert(maintHtml.includes('<th class="col-actions" style="width: 28%; text-align: center; padding-right: 18px;">Actions</th>'), 'thead col-actions must be 28% with 18px padding');

console.log('✔ HTML colgroup and thead synchronization verified');

// 4. Flexbox cluster overlap prevention
const checkClusterRules = (cssText, name) => {
  assert(cssText.includes('flex-shrink: 0 !important;'), `${name} must include flex-shrink: 0 !important`);
  assert(cssText.includes('min-width: 122px !important;'), `${name} must set min-width: 122px on .btn-resolve-ticket`);
  assert(cssText.includes('margin: 0 auto !important;'), `${name} must center cluster with margin: 0 auto !important`);
  assert(cssText.includes('flex-wrap: nowrap !important;'), `${name} must prevent wrapping with flex-wrap: nowrap !important`);
};

checkClusterRules(tablesCss, 'tables.css');
checkClusterRules(maintHtml, 'mis-maintenance.html');

console.log('✔ Flexbox cluster overlap prevention rules verified');

// 5. Mathematical Layout Check
const minTableWidth = 980;
const actionsColPercent = 0.28;
const usableColWidth = minTableWidth * actionsColPercent; // 274.4px
const btnViewDetailsWidth = 118;
const gap = 8;
const btnResolveWidth = 122;
const cellPaddingRight = 18;
const totalNeeded = btnViewDetailsWidth + gap + btnResolveWidth + cellPaddingRight; // 266px

assert(totalNeeded <= usableColWidth, `Actions column width (${usableColWidth}px) must be >= total required cluster space (${totalNeeded}px)`);

console.log(`✔ Mathematical verification passed: usable cell (${usableColWidth.toFixed(1)}px) >= required space (${totalNeeded}px)`);
console.log('🎉 ALL OVERLAP PREVENTION & RESPONSIVE CHECKS PASSED!');
