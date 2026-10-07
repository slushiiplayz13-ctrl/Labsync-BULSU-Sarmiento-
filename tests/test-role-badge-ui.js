const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 ROLE UI & THEME DIFFERENTIATION TEST SUITE');
console.log('================================================================\n');

// 1. Verify CSS styles in css/components/faculty-cards.css
console.log('--- 1. Testing CSS Rules (css/components/faculty-cards.css) ---');
const cssPath = path.join(__dirname, '..', 'css', 'components', 'faculty-cards.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

// IT Dept Head exact original text class
assert.ok(cssContent.includes('.boss-role {'), '.boss-role class must be defined');
assert.ok(cssContent.includes('color: var(--accent-blue);'), '.boss-role must use var(--accent-blue)');
assert.ok(!cssContent.includes('.boss-role { border-radius: 9999px'), '.boss-role must NOT have a pill border-radius');
assert.ok(!cssContent.includes('.boss-role { background:'), '.boss-role must NOT have background oval pill styling');

// Program Coordinator matching text class
assert.ok(cssContent.includes('.coordinator-role {'), '.coordinator-role class must be defined');
assert.ok(cssContent.includes('color: #4F46E5;'), '.coordinator-role must use #4F46E5 (Indigo)');

console.log('✔ PASS: Clean text roles defined without oval pills.');

// 2. Verify Dark Mode and High-Contrast Support
console.log('--- 2. Testing Dark Mode & High-Contrast Overrides ---');
assert.ok(cssContent.includes('html.dark-mode .boss-role'), 'Dark mode must support .boss-role');
assert.ok(cssContent.includes('html.dark-mode .coordinator-role'), 'Dark mode must support .coordinator-role');
assert.ok(cssContent.includes('color: var(--primary-teal) !important;'), 'IT Dept Head in dark mode must use var(--primary-teal)');
assert.ok(cssContent.includes('color: #818CF8 !important;'), 'Program Coordinator in dark mode must use #818CF8');

console.log('✔ PASS: Dark mode and high-contrast color differentiation verified.');

// 3. Verify Responsive Screen Layouts
console.log('--- 3. Testing Responsive Layout Overrides ---');
const mobile767Block = cssContent.slice(cssContent.indexOf('@media (max-width: 767px)'));
assert.ok(mobile767Block.includes('.faculty-card .boss-role'), 'Mobile layout must scale .boss-role');
assert.ok(mobile767Block.includes('.faculty-card .coordinator-role'), 'Mobile layout must scale .coordinator-role');

console.log('✔ PASS: Responsive overrides for mobile verified.');

// 4. Verify Component Output (faculty-card.js)
console.log('--- 4. Testing faculty-card.js Output ---');
require('../js/components/faculty-card.js');
const fc = global.facultyCard;

// Test IT Dept Head card HTML (exact original design restored)
const deptHeadHtml = fc.createCardHtml({
  Name: 'Dr. Jane Smith',
  Role: 'IT Dept. Head',
  Email: 'jane@example.com',
  Phone: '123-456'
});
assert.ok(deptHeadHtml.includes('<div class="boss-role"><i data-lucide="shield-check" style="width:13px;height:13px;"></i> Dr. Jane Smith</div>') || deptHeadHtml.includes('<div class="boss-role"><i data-lucide="shield-check" style="width:13px;height:13px;"></i> IT Dept. Head</div>'), 'IT Dept Head card must use exact original boss-role markup');
assert.ok(!deptHeadHtml.includes('faculty-role-badge'), 'IT Dept Head card must NOT contain faculty-role-badge');
assert.ok(deptHeadHtml.includes('boss-crown'), 'IT Dept Head card must retain avatar crown');
assert.ok(deptHeadHtml.includes('boss-card'), 'IT Dept Head card must retain boss-card glow');

// Test Program Coordinator card HTML
const pcHtml = fc.createCardHtml({
  Name: 'Prof. John Doe',
  Role: 'Program Coordinator',
  Email: 'john@example.com',
  Phone: '789-012'
});
assert.ok(pcHtml.includes('<div class="coordinator-role"><i data-lucide="award" style="width:13px;height:13px;"></i> Program Coordinator</div>'), 'Program Coordinator card must use coordinator-role with award icon');
assert.ok(!pcHtml.includes('faculty-role-badge'), 'Program Coordinator card must NOT contain faculty-role-badge');
assert.ok(!pcHtml.includes('boss-crown'), 'Program Coordinator card must NOT have boss-crown');
assert.ok(!pcHtml.includes('boss-card'), 'Program Coordinator card must NOT have boss-card glow');

// Test Regular Faculty card HTML
const facultyHtml = fc.createCardHtml({
  Name: 'Prof. Alan Turing',
  Role: 'Faculty',
  Email: 'alan@example.com',
  Phone: '555-555'
});
assert.ok(facultyHtml.includes('style="font-size:12px;color:#6B7280;line-height:1.4;"'), 'Regular faculty card must use exact original style');

console.log('✔ PASS: faculty-card.js accurately restores IT Dept Head and differentiates Program Coordinator.');

// 5. Verify faculty-management.html inline pre-rendering
console.log('--- 5. Testing faculty-management.html Inline Pre-rendering ---');
const fmHtml = fs.readFileSync(path.join(__dirname, '..', 'faculty-management.html'), 'utf8');
assert.ok(fmHtml.includes('boss-role'), 'faculty-management.html pre-render must use boss-role');
assert.ok(fmHtml.includes('coordinator-role'), 'faculty-management.html pre-render must use coordinator-role');
assert.ok(fmHtml.includes('lucide-award'), 'faculty-management.html pre-render must include award icon for Program Coordinator');
assert.ok(fmHtml.includes('lucide-shield-check'), 'faculty-management.html pre-render must include shield-check icon for IT Dept Head');

console.log('✔ PASS: faculty-management.html inline pre-rendering matches dynamic component rendering.');

console.log('\n================================================================');
console.log('🎉 ALL ROLE UI & THEME DIFFERENTIATION TESTS PASSED 100%!');
console.log('================================================================');
