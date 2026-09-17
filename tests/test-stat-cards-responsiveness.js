'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 Starting Stat Cards Responsiveness Verification');
console.log('================================================================\n');

// 1. Check css/components/stat-cards.css
console.log('--- 1. Checking css/components/stat-cards.css ---');
const statCardsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'stat-cards.css'), 'utf8');

assert(statCardsCss.includes('.stats-grid,\n.ojt-stats-grid') || statCardsCss.includes('.stats-grid,\r\n.ojt-stats-grid'), 'Must include both stats-grid and ojt-stats-grid in base rule');
assert(statCardsCss.includes('padding-top: 8px;'), 'Base grid must have padding-top: 8px for hover headroom');
assert(statCardsCss.includes('transform: translateY(-3px);'), 'Base hover lift must be restrained to translateY(-3px)');
assert(statCardsCss.includes('z-index: 2;'), 'Hovered card must elevate z-index: 2');

// Media query checks
assert(/@media\s*\(max-width:\s*1024px\)[\s\S]*?transform:\s*translateY\(-2px\)\s*!important/i.test(statCardsCss), 'Tablet media query must constrain hover to translateY(-2px)');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?transform:\s*translateY\(-2px\)\s*!important/i.test(statCardsCss), 'Mobile media query must constrain hover to translateY(-2px)');
assert(/@media\s*\(max-width:\s*1024px\)[\s\S]*?padding-top:\s*8px\s*!important/i.test(statCardsCss), 'Tablet media query must include padding-top: 8px !important');
assert(/@media\s*\(max-width:\s*600px\)[\s\S]*?padding-top:\s*8px\s*!important/i.test(statCardsCss), 'Mobile media query must include padding-top: 8px !important');
console.log('  ✔ PASS: css/components/stat-cards.css provides top headroom and constrained hover displacement');

// 2. Check css/layouts.css
console.log('\n--- 2. Checking css/layouts.css ---');
const layoutsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'layouts.css'), 'utf8');
assert(layoutsCss.includes('padding: 14px 12px 10px 12px !important;'), 'Compact laptop layout must provide 14px top padding on dashboard-card');
console.log('  ✔ PASS: css/layouts.css compact layout has 14px top padding');

// 3. Check css/responsive.css
console.log('\n--- 3. Checking css/responsive.css ---');
const responsiveCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'responsive.css'), 'utf8');
assert(responsiveCss.includes('padding: 16px 12px 14px 12px !important;'), 'Mobile responsive layout must provide 16px top padding on dashboard-card');
console.log('  ✔ PASS: css/responsive.css mobile layout has 16px top padding');

// 4. Check mis-ojt.html
console.log('\n--- 4. Checking mis-ojt.html ---');
const misOjtHtml = fs.readFileSync(path.join(__dirname, '..', 'mis-ojt.html'), 'utf8');
assert(misOjtHtml.includes('padding-top: 8px;'), 'mis-ojt.html ojt-stats-grid must have padding-top: 8px');
console.log('  ✔ PASS: mis-ojt.html ojt-stats-grid has padding-top: 8px');

// 5. Check cache busters
console.log('\n--- 5. Checking style.css and HTML cache busters ---');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
assert(styleCss.includes("stat-cards.css?v=1.1.3"), 'style.css must reference stat-cards.css?v=1.1.3');
assert(styleCss.includes("responsive.css?v=1.1.3"), 'style.css must reference responsive.css?v=1.1.3');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(indexHtml.includes("style.css?v=1.1.3"), 'index.html must reference style.css?v=1.1.3');

const itHeadHtml = fs.readFileSync(path.join(__dirname, '..', 'it-head-dashboard.html'), 'utf8');
assert(itHeadHtml.includes("style.css?v=1.1.3"), 'it-head-dashboard.html must reference style.css?v=1.1.3');

const misStaffHtml = fs.readFileSync(path.join(__dirname, '..', 'mis-staff-dashboard.html'), 'utf8');
assert(misStaffHtml.includes("style.css?v=1.1.3"), 'mis-staff-dashboard.html must reference style.css?v=1.1.3');
console.log('  ✔ PASS: All cache busters correctly synchronized');

console.log('\n================================================================');
console.log('🎉 ALL STAT CARDS RESPONSIVENESS CHECKS PASSED!');
console.log('================================================================');
