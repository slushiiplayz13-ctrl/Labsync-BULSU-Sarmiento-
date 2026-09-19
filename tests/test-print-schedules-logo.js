/**
 * Automated test for Print All Schedules & Print Schedule LabSync Logo.
 * Validates that:
 * 1. Both print templates strictly use 'assets/labsync-logo.png' (with black "Lab" and cyan "Sync").
 * 2. High-contrast / dark-mode styles in variables.css & auth.css do NOT override the logo on print pages.
 * 3. Both print templates enforce 'content: normal !important' on the logo and document images.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  console.log('=== 1. Validating js/pages/print-all-schedules.js ===');
  const printAllJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'print-all-schedules.js'), 'utf8');
  assert.ok(printAllJs.includes('src="assets/labsync-logo.png"'), 'Must use assets/labsync-logo.png in print-all-schedules.js');
  assert.ok(!printAllJs.includes('labsync-logo - dark mode.png'), 'Must not use dark mode logo in print-all-schedules.js');
  assert.ok(printAllJs.includes('class="labsync-print-brand-logo"'), 'Must add labsync-print-brand-logo class');
  assert.ok(printAllJs.includes('content: normal !important;'), 'Must have inline content: normal !important');
  console.log('✓ js/pages/print-all-schedules.js logo configuration verified!');

  console.log('\n=== 2. Validating print-all-schedules.html ===');
  const printAllHtml = fs.readFileSync(path.join(__dirname, '..', 'print-all-schedules.html'), 'utf8');
  assert.ok(printAllHtml.includes('.labsync-print-brand-logo'), 'Must define .labsync-print-brand-logo style');
  assert.ok(printAllHtml.includes('content: normal !important;'), 'Must enforce content: normal !important for logo and document images');
  console.log('✓ print-all-schedules.html CSS rules verified!');

  console.log('\n=== 3. Validating print-schedule.html ===');
  const printSchedHtml = fs.readFileSync(path.join(__dirname, '..', 'print-schedule.html'), 'utf8');
  assert.ok(printSchedHtml.includes('src="assets/labsync-logo.png"'), 'Must use assets/labsync-logo.png in print-schedule.html');
  assert.ok(printSchedHtml.includes('.labsync-print-brand-logo'), 'Must define .labsync-print-brand-logo style in print-schedule.html');
  assert.ok(printSchedHtml.includes('content: normal !important;'), 'Must enforce content: normal !important in print-schedule.html');
  console.log('✓ print-schedule.html logo configuration verified!');

  console.log('\n=== 4. Validating css/variables.css & css/auth.css Exclusions ===');
  const variablesCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'variables.css'), 'utf8');
  const authCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'auth.css'), 'utf8');

  assert.ok(variablesCss.includes(':not(.document-page img)'), 'variables.css must exempt document-page images from dark mode replacement');
  assert.ok(variablesCss.includes(':not(.labsync-print-brand-logo)'), 'variables.css must exempt labsync-print-brand-logo from dark mode replacement');
  assert.ok(authCss.includes(':not(.document-page img)'), 'auth.css must exempt document-page images from dark mode replacement');
  assert.ok(authCss.includes(':not(.labsync-print-brand-logo)'), 'auth.css must exempt labsync-print-brand-logo from dark mode replacement');
  console.log('✓ variables.css and auth.css exclusions verified!');

  console.log('\n=== 5. Verifying Assets Existence ===');
  const logoPath = path.join(__dirname, '..', 'assets', 'labsync-logo.png');
  assert.ok(fs.existsSync(logoPath), 'assets/labsync-logo.png must exist');
  const logoStats = fs.statSync(logoPath);
  assert.ok(logoStats.size > 50000, `assets/labsync-logo.png size should be ~102KB, got ${logoStats.size} bytes`);
  console.log(`✓ assets/labsync-logo.png verified (${logoStats.size} bytes)!`);

  console.log('\n========================================');
  console.log('ALL PRINT SCHEDULE LOGO TESTS PASSED! (5/5)');
  console.log('========================================');
}

runTests();
