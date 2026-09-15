/**
 * Tests for Department Head Dashboard Mobile/Tablet Tabbed Workspace
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTest() {
  console.log('--- Testing IT Head Dashboard Mobile/Tablet Tabs ---');

  const html = fs.readFileSync(path.join(__dirname, '../it-head-dashboard.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

  // 1. Structure: Mobile Tabs container directly precedes .dashboard-main-grid
  assert.ok(html.includes('id="itheadMobileTabs"'), 'HTML must have #itheadMobileTabs');
  assert.ok(html.includes('role="tablist"'), '#itheadMobileTabs should have role="tablist"');
  
  const tabsPos = html.indexOf('id="itheadMobileTabs"');
  const gridPos = html.indexOf('class="dashboard-main-grid"');
  assert.ok(tabsPos !== -1 && gridPos !== -1 && tabsPos < gridPos, 
    '#itheadMobileTabs must be placed directly before .dashboard-main-grid');

  // 2. Semantic Buttons and Attributes
  assert.ok(html.includes('data-tab="labs"'), 'Tab button for laboratories must exist');
  assert.ok(html.includes('data-tab="schedule"'), 'Tab button for schedule must exist');
  assert.ok(html.includes('class="ithead-tab-btn active"'), 'My Laboratories tab must be active by default');
  assert.ok(html.includes('aria-selected="true"'), 'Active tab must have aria-selected="true"');
  assert.ok(html.includes('aria-selected="false"'), 'Inactive tab must have aria-selected="false"');
  assert.ok(html.includes('data-lucide="monitor"'), 'My Laboratories tab must have monitor icon');
  assert.ok(html.includes('data-lucide="calendar-days"'), 'My Schedule tab must have calendar-days icon');
  assert.ok(html.includes('aria-controls="itheadLabsCard"'), 'Tab must specify aria-controls for labs card');
  assert.ok(html.includes('aria-controls="itheadScheduleCard"'), 'Tab must specify aria-controls for schedule card');
  console.log('✓ Tab buttons and semantic ARIA attributes verified');

  // 3. Card IDs and Panels
  assert.ok(html.includes('id="itheadLabsCard"'), 'My Laboratories card must have id="itheadLabsCard"');
  assert.ok(html.includes('id="itheadScheduleCard"'), 'My Schedule card must have id="itheadScheduleCard"');
  assert.ok(html.includes('id="ithead-labs-grid"'), 'Inner labs grid #ithead-labs-grid must be preserved');
  assert.ok(html.includes('id="ithead-schedule-list"'), 'Inner schedule list #ithead-schedule-list must be preserved');
  console.log('✓ Content card IDs and inner render targets preserved');

  // 4. Tab Switcher Script
  assert.ok(html.includes('initITHeadMobileTabs'), 'Tab initialization function must be defined in it-head-dashboard.html');
  assert.ok(html.includes('grid.classList.toggle(\'show-schedule-tab\', isSchedule)'), 
    'Tab click must toggle show-schedule-tab class on .dashboard-main-grid');
  assert.ok(html.includes('b.setAttribute(\'aria-selected\', isActive ? \'true\' : \'false\')'), 
    'Tab click must dynamically update aria-selected attribute');
  assert.ok(html.includes('ArrowRight') && html.includes('ArrowLeft'), 
    'Keyboard arrow navigation must be supported for tabs');
  console.log('✓ Client-side state mechanism and keyboard navigation verified');

  // 5. CSS Desktop Isolation (> 1024px)
  assert.ok(css.includes('.ithead-mobile-tabs'), 'responsive.css must contain .ithead-mobile-tabs');
  const desktopIsolationMatch = css.match(/\.ithead-mobile-tabs\s*\{[^}]*display:\s*none\s*!important/);
  assert.ok(desktopIsolationMatch, 'Desktop isolation must set .ithead-mobile-tabs to display: none !important by default');
  console.log('✓ Desktop isolation (> 1024px) verified');

  // 6. CSS Mobile/Tablet Viewport (<= 1024px)
  const max1024Block = css.substring(css.indexOf('@media (max-width: 1024px)'), css.indexOf('@media (max-width: 767px)'));
  assert.ok(max1024Block.includes('grid-template-columns: 1fr 1fr;'), 
    'Mobile tabs must have 2 equal-width columns at <= 1024px');
  assert.ok(max1024Block.includes('white-space: nowrap;'), 
    'Mobile tab buttons must prevent text wrapping');
  assert.ok(max1024Block.includes('min-height: 42px;'), 
    'Mobile tab buttons must have comfortable touch target (min-height: 42px)');
  assert.ok(max1024Block.includes('.ithead-tab-btn:focus-visible'), 
    'Focus visible styles must exist for accessibility');
  assert.ok(max1024Block.includes('html.dark-mode .ithead-mobile-tabs') && max1024Block.includes('html.high-contrast .ithead-mobile-tabs'), 
    'Dark mode and high contrast must be supported');
  console.log('✓ Mobile/tablet styles at <= 1024px verified');

  // 7. Tab Visibility Toggling in CSS (Scoped to body[data-page="it-head-dashboard"])
  assert.ok(max1024Block.includes('body[data-page="it-head-dashboard"] .dashboard-main-grid:not(.show-schedule-tab) #itheadScheduleCard'), 
    'CSS must hide schedule card when schedule tab is not active');
  assert.ok(max1024Block.includes('body[data-page="it-head-dashboard"] .dashboard-main-grid.show-schedule-tab #itheadLabsCard'), 
    'CSS must hide labs card when schedule tab is active');
  console.log('✓ Tab visibility toggling CSS verified');

  // 8. Extra small mobile (<= 380px)
  assert.ok(css.includes('@media (max-width: 380px)'), 'Extra small breakpoint <= 380px must exist');
  console.log('✓ Extra small mobile (<= 380px) optimization verified');

  // 9. Protected areas validation: Desktop layout rules
  assert.ok(css.includes('@media (min-width: 1025px) and (max-width: 1320px)'), 
    'Desktop 1025-1320px layout must remain intact');
  assert.ok(html.includes('id="ithead-stat-rooms"') && html.includes('id="ithead-stat-available"'), 
    'Summary Cards IDs must remain intact');
  console.log('✓ Protected areas verified');

  // 10. Inner container header removal & visual polish on mobile (<= 1024px)
  assert.ok(max1024Block.includes('#itheadLabsCard .sh-left') && max1024Block.includes('display: none !important'),
    'Inner "My Laboratories" header .sh-left must be hidden on mobile inside container');
  assert.ok(max1024Block.includes('#itheadScheduleCard .section-header') && max1024Block.includes('display: none !important'),
    'Inner "My Schedule" header .section-header must be hidden on mobile inside container');
  assert.ok(max1024Block.includes('itheadTabFadeIn'),
    'Smooth GPU-accelerated tab transition animation must be defined');
  assert.ok(max1024Block.includes('.dot.green') && max1024Block.includes('box-shadow'),
    'Telemetry status dots in legend must have ambient glow');
  console.log('✓ Inner container header removal and visual polish verified');

  console.log('\nALL IT HEAD DASHBOARD MOBILE TABS TESTS PASSED! 🎉');
}

runTest();
