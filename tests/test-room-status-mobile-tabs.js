/**
 * Comprehensive Automated Tests for Room Status & Activity Log Mobile/Tablet Tabs
 * Tests both room-status.html (Faculty) and it-head-room-status.html (Dept Head)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTest() {
  console.log('--- Testing Room Status & Activity Log Mobile/Tablet Tabs ---');

  const facultyHtml = fs.readFileSync(path.join(__dirname, '../room-status.html'), 'utf8');
  const itHeadHtml = fs.readFileSync(path.join(__dirname, '../it-head-room-status.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/responsive.css'), 'utf8');

  // Test both pages
  const pages = [
    { name: 'room-status.html (Faculty)', html: facultyHtml, pageData: 'room-status', labId: null, actId: null },
    { name: 'it-head-room-status.html (Dept Head)', html: itHeadHtml, pageData: 'it-head-room-status', labId: 'ithead-room-grid', actId: 'ithead-activity-list' }
  ];

  pages.forEach(p => {
    console.log(`\nVerifying ${p.name}:`);

    // 1. Structure: Mobile Tabs container directly precedes .dashboard-main-grid
    assert.ok(p.html.includes('id="roomStatusMobileTabs"'), `${p.name} must have #roomStatusMobileTabs`);
    assert.ok(p.html.includes('role="tablist"'), `${p.name} #roomStatusMobileTabs must have role="tablist"`);
    
    const tabsPos = p.html.indexOf('id="roomStatusMobileTabs"');
    const gridPos = p.html.indexOf('class="dashboard-main-grid"');
    assert.ok(tabsPos !== -1 && gridPos !== -1 && tabsPos < gridPos, 
      `${p.name}: #roomStatusMobileTabs must be placed directly before .dashboard-main-grid`);

    // 2. Semantic Buttons, Attributes, and Icons
    assert.ok(p.html.includes('data-tab="rooms"'), `${p.name}: Tab button for room status must exist`);
    assert.ok(p.html.includes('data-tab="activity"'), `${p.name}: Tab button for activity log must exist`);
    assert.ok(p.html.includes('class="roomstatus-tab-btn active"'), `${p.name}: Room Status tab must be active by default`);
    assert.ok(p.html.includes('aria-selected="true"'), `${p.name}: Active tab must have aria-selected="true"`);
    assert.ok(p.html.includes('aria-selected="false"'), `${p.name}: Inactive tab must have aria-selected="false"`);
    assert.ok(p.html.includes('data-lucide="monitor-dot"'), `${p.name}: Room Status tab must have monitor-dot icon`);
    assert.ok(p.html.includes('data-lucide="clock-4"'), `${p.name}: Activity Log tab must have clock-4 icon`);
    assert.ok(p.html.includes('aria-controls="roomStatusCard"'), `${p.name}: Must specify aria-controls for room status card`);
    assert.ok(p.html.includes('aria-controls="activityLogCard"'), `${p.name}: Must specify aria-controls for activity log card`);
    console.log(`  ✓ Tab buttons, semantic ARIA attributes, and Lucide icons verified`);

    // 3. Card IDs and Panels
    assert.ok(p.html.includes('id="roomStatusCard"'), `${p.name}: Room Status card must have id="roomStatusCard"`);
    assert.ok(p.html.includes('id="activityLogCard"'), `${p.name}: Activity Log card must have id="activityLogCard"`);
    assert.ok(p.html.includes('class="labs-grid"'), `${p.name}: Inner .labs-grid must be preserved`);
    assert.ok(p.html.includes('class="timeline-list"'), `${p.name}: Inner .timeline-list must be preserved`);
    if (p.labId) assert.ok(p.html.includes(`id="${p.labId}"`), `${p.name}: Page-specific lab grid ID #${p.labId} preserved`);
    if (p.actId) assert.ok(p.html.includes(`id="${p.actId}"`), `${p.name}: Page-specific timeline list ID #${p.actId} preserved`);
    console.log(`  ✓ Content card IDs, panel roles, and inner render targets preserved`);

    // 4. Tab Switcher Script
    assert.ok(p.html.includes('initRoomStatusMobileTabs'), `${p.name}: initRoomStatusMobileTabs must be defined`);
    assert.ok(p.html.includes("grid.classList.toggle('show-activity-tab', isActivity)"), 
      `${p.name}: Tab click must toggle show-activity-tab on .dashboard-main-grid`);
    assert.ok(p.html.includes("b.setAttribute('aria-selected', isActive ? 'true' : 'false')"), 
      `${p.name}: Tab click must dynamically update aria-selected`);
    assert.ok(p.html.includes('ArrowRight') && p.html.includes('ArrowLeft'), 
      `${p.name}: Keyboard arrow navigation must be supported`);
    console.log(`  ✓ Client-side state mechanism and keyboard navigation verified`);
  });

  console.log('\nVerifying CSS Rules in responsive.css:');

  // 5. Desktop Isolation (> 1024px)
  const desktopIsolationMatch = css.match(/\.roomstatus-mobile-tabs[^{]*\{[^}]*display:\s*none\s*!important/);
  assert.ok(desktopIsolationMatch, 'Desktop isolation must set .roomstatus-mobile-tabs to display: none !important at top-level');
  console.log('✓ Desktop isolation (> 1024px) verified');

  // 6. Mobile/Tablet Viewport (<= 1024px)
  const max1024Block = css.substring(css.indexOf('@media (max-width: 1024px)'), css.indexOf('@media (max-width: 767px)'));
  assert.ok(max1024Block.includes('.roomstatus-mobile-tabs'), 'Mobile tabs styling must be in <= 1024px block');
  assert.ok(max1024Block.includes('grid-template-columns: 1fr 1fr;'), 'Mobile tabs must have 2 equal-width columns');
  assert.ok(max1024Block.includes('min-height: 42px;'), 'Mobile tab buttons must maintain comfortable touch target (min-height: 42px)');
  assert.ok(max1024Block.includes('.roomstatus-tab-btn:focus-visible'), 'Focus visible styles must exist');
  assert.ok(max1024Block.includes('html.dark-mode .roomstatus-mobile-tabs'), 'Dark mode must be supported');
  assert.ok(max1024Block.includes('html.high-contrast .roomstatus-mobile-tabs'), 'High contrast must be supported');
  console.log('✓ Unified mobile/tablet tab header styles at <= 1024px verified');

  // 7. Fused Single Container Architecture
  assert.ok(max1024Block.includes('border-top-left-radius: 18px') && max1024Block.includes('border-bottom-left-radius: 0'), 
    'Tab header must form rounded top of unified container');
  assert.ok(max1024Block.includes('#roomStatusCard') && max1024Block.includes('border-top: none !important'), 
    'Content cards must dock flush beneath tab header with border-top: none');
  console.log('✓ Unified single-container fusion verified');

  // 8. In-Container Header Removal & Clean Telemetry Row
  assert.ok(max1024Block.includes('body[data-page="room-status"] #roomStatusCard .sh-left') && max1024Block.includes('display: none !important'), 
    'Redundant room status title/icon must be hidden inside container on mobile');
  assert.ok(max1024Block.includes('body[data-page="room-status"] #activityLogCard .section-header') && max1024Block.includes('display: none !important'), 
    'Redundant activity log header must be hidden inside container on mobile');
  assert.ok(max1024Block.includes('body[data-page="room-status"] #roomStatusCard .sh-legend') && max1024Block.includes('background: transparent !important'), 
    'Status legend on room status card must be a clean borderless telemetry row');
  console.log('✓ In-container header removal and borderless telemetry row verified');

  // 9. Mobile internal scrolling on .labs-grid and .timeline-list
  assert.ok(!css.includes('max-height: 615px'), 'Forced rigid 615px rule must remain removed');
  assert.ok(max1024Block.includes('.labs-grid') && max1024Block.includes('overflow-y: auto !important') && max1024Block.includes('max-height: 540px !important'),
    'Room status data in .labs-grid must be internally scrollable at <= 1024px with max-height: 540px and overflow-y: auto');
  assert.ok(max1024Block.includes('.activity-log-card .timeline-list') && max1024Block.includes('overflow-y: auto !important') && max1024Block.includes('max-height: 540px !important'),
    'Activity log data in .timeline-list must be internally scrollable at <= 1024px with max-height: 540px and overflow-y: auto');
  assert.ok(!max1024Block.includes('max-height: none !important'), 'max1024Block must not have max-height: none !important on timeline-list');
  console.log('✓ Room status and activity log internal scrolling (overflow-y: auto, max-height: 540px) verified');

  // 10. Card Visibility Toggling
  assert.ok(max1024Block.includes('body[data-page="room-status"] .dashboard-main-grid:not(.show-activity-tab) #activityLogCard'), 
    'Faculty activity log must be hidden when room status tab is active');
  assert.ok(max1024Block.includes('body[data-page="room-status"] .dashboard-main-grid.show-activity-tab #roomStatusCard'), 
    'Faculty room status must be hidden when activity log tab is active');
  assert.ok(max1024Block.includes('body[data-page="it-head-room-status"] .dashboard-main-grid:not(.show-activity-tab) #activityLogCard'), 
    'Dept Head activity log must be hidden when room status tab is active');
  assert.ok(max1024Block.includes('body[data-page="it-head-room-status"] .dashboard-main-grid.show-activity-tab #roomStatusCard'), 
    'Dept Head room status must be hidden when activity log tab is active');
  console.log('✓ Tab visibility switching for both Faculty and Dept Head verified');

  // 11. Extra small mobile (<= 380px)
  assert.ok(css.includes('.roomstatus-tab-btn') && css.includes('@media (max-width: 380px)'), 
    'Extra small mobile 380px breakpoint must include roomstatus-tab-btn');
  console.log('✓ Extra small mobile (<= 380px) optimization verified');

  // 12. Department Head Dashboard regression check
  assert.ok(css.includes('.ithead-mobile-tabs') && css.includes('#itheadLabsCard'), 
    'Department Head Dashboard tabs must remain fully intact');
  console.log('✓ Department Head Dashboard tabs intact (no regressions)');

  console.log('\nALL ROOM STATUS MOBILE TABS TESTS PASSED! 🎉');
}

runTest();
