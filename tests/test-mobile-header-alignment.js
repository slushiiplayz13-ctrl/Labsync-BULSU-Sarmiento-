/**
 * Tests mobile layout alignment for Recent PC Reports card header.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTest() {
  console.log('--- Testing Mobile Layout Header Alignment ---');

  const html = fs.readFileSync(path.join(__dirname, '../mis-staff-dashboard.html'), 'utf8');
  const cardsCss = fs.readFileSync(path.join(__dirname, '../css/components/cards.css'), 'utf8');
  const responsiveCss = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

  // 1. Verify mis-staff-dashboard.html does not have inline centering
  assert.ok(!html.includes('class="section-header" style="margin-bottom: 14px; align-items: center;"'),
    'mis-staff-dashboard.html should not have inline align-items: center on section-header');
  assert.ok(html.includes('<h3 class="card-section-title">Recent PC Reports</h3>'),
    'mis-staff-dashboard.html must contain Recent PC Reports title');
  console.log('✓ mis-staff-dashboard.html does not have inline centering on section-header');

  // 2. Verify cards.css mobile rules
  assert.ok(cardsCss.includes('.section-header>.sh-left'), 'cards.css must style .sh-left in responsive block');
  assert.ok(cardsCss.includes('align-items: flex-start !important'), 'cards.css must align items to flex-start on mobile');
  assert.ok(cardsCss.includes('text-align: left !important'), 'cards.css must align text to left on mobile');
  console.log('✓ cards.css properly defines mobile left alignment');

  // 3. Verify responsive.css rules
  assert.ok(responsiveCss.includes('.card-section-title'), 'responsive.css must target .card-section-title');
  assert.ok(responsiveCss.includes('align-self: flex-start !important'), 'responsive.css must align self to flex-start on mobile');
  console.log('✓ responsive.css reinforces mobile left-edge alignment');

  console.log('ALL MOBILE HEADER ALIGNMENT TESTS PASSED! 🎉');
}

runTest();
