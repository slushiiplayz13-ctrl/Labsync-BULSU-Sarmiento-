/**
 * test-key-take-latency-fixes.js
 * 
 * Comprehensive test suite validating:
 * 1. Firmware timeout alignment (4,000ms connect / 5,000ms socket across all HTTP methods)
 * 2. Key-event retryability & deduplication without duplicate occupancy records
 * 3. Frontend room-status refresh running independently when /api/notifications returns []
 * 4. Existing notification and role-specific dashboard behavior preservation
 * 5. Independent updating for Room 203 and Room 204
 * 6. Explicit no-cache behavior on laboratory status endpoints
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('================================================================');
console.log('🧪 Testing LabSync Key-Take Latency & Room-Status Polling Fixes');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
const asyncTasks = [];

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✔ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`✖ FAIL: ${name}`);
    console.error(`  ${err.message}`);
    process.exitCode = 1;
  }
}

function runAsyncTest(name, fn) {
  totalTests++;
  const task = (async () => {
    try {
      await fn();
      console.log(`✔ PASS: ${name}`);
      passedTests++;
    } catch (err) {
      console.error(`✖ FAIL: ${name}`);
      console.error(`  ${err.message}`);
      process.exitCode = 1;
    }
  })();
  asyncTasks.push(task);
}

// -----------------------------------------------------------------------------
// SECTION 1: Firmware Timeout Alignment & Error Logging Verification
// -----------------------------------------------------------------------------
console.log('--- 1. Firmware HTTP Timeout & Serial Diagnostics Verification ---');

const inoPath = path.resolve(__dirname, '../LabSync_ESP32/LabSync_ESP32.ino');
const inoContent = fs.readFileSync(inoPath, 'utf8');

runTest('sendKeyStatusHttp uses 4,000ms connect and 5,000ms socket timeouts', () => {
  const fnMatch = inoContent.match(/bool\s+sendKeyStatusHttp\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'sendKeyStatusHttp function definition not found in ino');
  const body = fnMatch[1];
  assert(body.includes('http.setConnectTimeout(4000);'), 'sendKeyStatusHttp must use 4000ms connect timeout');
  assert(body.includes('http.setTimeout(5000);'), 'sendKeyStatusHttp must use 5000ms socket timeout');
  assert(!body.includes('setConnectTimeout(1500)'), 'sendKeyStatusHttp must not use 1500ms timeout');
  assert(!body.includes('setTimeout(2000)'), 'sendKeyStatusHttp must not use 2000ms timeout');
  assert(body.includes('http.errorToString(code)'), 'sendKeyStatusHttp must log error string on failure');
});

runTest('sendSecurityAlertHttp uses 4,000ms connect and 5,000ms socket timeouts', () => {
  const fnMatch = inoContent.match(/bool\s+sendSecurityAlertHttp\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'sendSecurityAlertHttp function definition not found in ino');
  const body = fnMatch[1];
  assert(body.includes('http.setConnectTimeout(4000);'), 'sendSecurityAlertHttp must use 4000ms connect timeout');
  assert(body.includes('http.setTimeout(5000);'), 'sendSecurityAlertHttp must use 5000ms socket timeout');
  assert(!body.includes('setConnectTimeout(1500)'), 'sendSecurityAlertHttp must not use 1500ms timeout');
  assert(!body.includes('setTimeout(2000)'), 'sendSecurityAlertHttp must not use 2000ms timeout');
  assert(body.includes('http.errorToString(code)'), 'sendSecurityAlertHttp must log error string on failure');
});

runTest('processQrScanHttp uses 4,000ms connect and 5,000ms socket timeouts', () => {
  const fnMatch = inoContent.match(/void\s+processQrScanHttp\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'processQrScanHttp function definition not found in ino');
  const body = fnMatch[1];
  assert(body.includes('http.setConnectTimeout(4000);'), 'processQrScanHttp must use 4000ms connect timeout');
  assert(body.includes('http.setTimeout(5000);'), 'processQrScanHttp must use 5000ms socket timeout');
  assert(!body.includes('setConnectTimeout(1500)'), 'processQrScanHttp must not use 1500ms timeout');
});

runTest('sendHeartbeatHttp maintains proven 4,000ms / 5,000ms timeout baseline', () => {
  const fnMatch = inoContent.match(/void\s+sendHeartbeatHttp\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
  assert(fnMatch, 'sendHeartbeatHttp function definition not found in ino');
  const body = fnMatch[1];
  assert(body.includes('http.setConnectTimeout(4000);'), 'sendHeartbeatHttp must use 4000ms connect timeout');
  assert(body.includes('http.setTimeout(5000);'), 'sendHeartbeatHttp must use 5000ms socket timeout');
});

runTest('All direct HTTP dispatch methods properly end HTTP and stop client socket', () => {
  const methods = ['sendKeyStatusHttp', 'sendSecurityAlertHttp', 'sendHeartbeatHttp', 'processQrScanHttp'];
  methods.forEach(methodName => {
    const regex = new RegExp(`(?:bool|void)\\s+${methodName}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`);
    const match = inoContent.match(regex);
    assert(match, `${methodName} definition not found`);
    const body = match[1];
    assert(body.includes('http.end();'), `${methodName} must call http.end()`);
    assert(body.includes('client.stop();'), `${methodName} must call client.stop()`);
  });
});

// -----------------------------------------------------------------------------
// SECTION 2: Key-Event Deduplication & Custody Safety
// -----------------------------------------------------------------------------
console.log('\n--- 2. Key-Event Deduplication & Idempotent Retry Safety ---');

runTest('occupancy.service.js deduplicates repeated key events without duplicate DB logs', () => {
  const occPath = path.resolve(__dirname, '../services/iot/occupancy.service.js');
  const occCode = fs.readFileSync(occPath, 'utf8');

  // Verify duplicate state detection
  assert(occCode.includes('let isDuplicateState = (room.Key_Status === status);'),
    'occupancy.service.js must check isDuplicateState based on current Key_Status');

  // Verify duplicate events do not re-insert duplicate logs
  assert(occCode.includes('if (!isDuplicateState) {') && occCode.includes('insertOccupancyLog(logUserId, room.Room_ID, keyEvent'),
    'occupancy.service.js must gate insertOccupancyLog on !isDuplicateState');

  // Verify existing user custody is protected on duplicate key taken
  assert(occCode.includes('claimUserId = room.Current_User_ID || null;'),
    'Duplicate Key Taken must preserve room.Current_User_ID');
});

runTest('heartbeat.service.js protects borrower custody during slot state reconciliation', () => {
  const hbPath = path.resolve(__dirname, '../services/iot/heartbeat.service.js');
  const hbCode = fs.readFileSync(hbPath, 'utf8');

  assert(hbCode.includes("const userId = (expectedStatus === 'Present') ? null : currentRoom.Current_User_ID;"),
    'Heartbeat slot reconciliation must not wipe Current_User_ID to null when key is Absent');
});

// -----------------------------------------------------------------------------
// SECTION 3: Frontend Polling Independence from Empty Notifications
// -----------------------------------------------------------------------------
console.log('\n--- 3. Frontend Room-Status Polling Independence from Notifications Count ---');

const notifJsPath = path.resolve(__dirname, '../js/components/notifications.js');
const notifJsCode = fs.readFileSync(notifJsPath, 'utf8');

runTest('notifications.js does NOT return early when notifications.length === 0', () => {
  const ifZeroBlock = notifJsCode.match(/if\s*\(\s*notifications\.length\s*===\s*0\s*\)\s*\{([\s\S]*?)\}\s*else/);
  assert(ifZeroBlock, 'if (notifications.length === 0) { ... } else block not found');
  assert(!ifZeroBlock[1].includes('return'),
    'if (notifications.length === 0) block must NOT contain return');
});

runTest('notifications.js includes concurrency overlap guard (isFetchingNotifs)', () => {
  assert(notifJsCode.includes('let isFetchingNotifs = false;'),
    'notifications.js must declare isFetchingNotifs');
  assert(notifJsCode.includes('if (isFetchingNotifs) return;'),
    'notifications.js must guard against overlapping fetch execution');
  assert(notifJsCode.includes('isFetchingNotifs = false;'),
    'notifications.js must reset isFetchingNotifs in finally block');
});

runTest('notifications.js manages interval lifecycle and cleans up on beforeunload', () => {
  assert(notifJsCode.includes('global._notifPollInterval'),
    'notifications.js must store poll interval on global._notifPollInterval');
  assert(notifJsCode.includes('clearInterval(global._notifPollInterval);'),
    'notifications.js must clear any prior interval');
  assert(notifJsCode.includes("window.addEventListener('beforeunload'"),
    'notifications.js must register beforeunload lifecycle cleanup');
});

function createMockEnvironment(pageName, fetchResult) {
  const domElements = {
    headerRight: { appendChild: () => {} },
    notifBtn: { dataset: {}, addEventListener: () => {}, getBoundingClientRect: () => ({ left: 100, width: 30, top: 20, height: 30 }) },
    notifList: { innerHTML: '', appendChild: () => {} },
    notifDot: { style: { display: 'none' } }
  };

  const env = {
    document: {
      body: { dataset: { page: pageName } },
      addEventListener: () => {},
      querySelector: (sel) => {
        if (sel === '.header-right') return domElements.headerRight;
        if (sel === '.notif-btn') return domElements.notifBtn;
        if (sel === '.notif-dot') return domElements.notifDot;
        return null;
      },
      getElementById: (id) => {
        if (id === 'notif-list') return domElements.notifList;
        if (id === 'clear-notif-btn') return { addEventListener: () => {} };
        return null;
      },
      createElement: () => ({
        id: '',
        className: '',
        style: {},
        innerHTML: '',
        appendChild: () => {},
        addEventListener: () => {},
        querySelector: () => null,
        getBoundingClientRect: () => ({ left: 100, width: 30, top: 20, height: 30 })
      })
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    sessionStorage: {
      setItem: () => {}
    },
    innerWidth: 1024,
    addEventListener: () => {},
    location: { pathname: '/faculty/room-status.html' },
    fetchNotifications: async () => fetchResult,
    domElements
  };

  env.window = env;
  return env;
}

runAsyncTest('Simulated DOM: Faculty room-status refreshes continuously with empty notifications', async () => {
  let roomStatusRefreshedCount = 0;
  const env = createMockEnvironment('room-status', []);

  env.loadAllRoomStatusLabs = () => { roomStatusRefreshedCount++; };
  env.loadRoomStatusActivityLog = () => {};
  let pollFn = null;
  env.setInterval = (fn) => {
    pollFn = fn;
    return 12345;
  };
  env.clearInterval = () => {};

  const runCode = new Function('global', 'window', 'document', 'localStorage', 'sessionStorage', 'setInterval', 'clearInterval', notifJsCode);
  runCode(env, env.window, env.document, env.localStorage, env.sessionStorage, env.setInterval, env.clearInterval);

  assert(typeof env.initNotifications === 'function', 'initNotifications should be defined');
  env.initNotifications();

  // Allow initial async load to finish
  await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(roomStatusRefreshedCount, 1, 'Initial load should trigger room status refresh');

  // Sequential tick 1
  if (pollFn) await pollFn();
  assert.strictEqual(roomStatusRefreshedCount, 2, 'Tick 1 should refresh room status with empty notifications');

  // Sequential tick 2
  if (pollFn) await pollFn();
  assert.strictEqual(roomStatusRefreshedCount, 3, 'Tick 2 should refresh room status with empty notifications');

  assert(env.domElements.notifList.innerHTML.includes('No notifications yet'),
    'Empty state markup should be properly rendered in notification dropdown');
  assert.strictEqual(env.domElements.notifDot.style.display, 'none',
    'Unread indicator dot must remain hidden when notification array is empty');
});

runAsyncTest('Simulated DOM: IT Head room status and Dashboard refresh on empty notifications', async () => {
  let itHeadRefreshed = 0;
  let dashboardRefreshed = 0;

  const envIT = createMockEnvironment('it-head-room-status', []);
  envIT.loadITHeadRoomStatus = () => { itHeadRefreshed++; };
  envIT.setInterval = (fn) => { fn(); return 999; };
  envIT.clearInterval = () => {};

  const runCode = new Function('global', 'window', 'document', 'localStorage', 'sessionStorage', 'setInterval', 'clearInterval', notifJsCode);
  runCode(envIT, envIT.window, envIT.document, envIT.localStorage, envIT.sessionStorage, envIT.setInterval, envIT.clearInterval);
  envIT.initNotifications();
  await new Promise(r => setTimeout(r, 30));

  assert(itHeadRefreshed >= 1, `IT Head room status should refresh. Count: ${itHeadRefreshed}`);

  const envDash = createMockEnvironment('dashboard', []);
  envDash.loadDashboardStatsAndLabs = () => { dashboardRefreshed++; };
  envDash.setInterval = (fn) => { fn(); return 999; };
  envDash.clearInterval = () => {};

  runCode(envDash, envDash.window, envDash.document, envDash.localStorage, envDash.sessionStorage, envDash.setInterval, envDash.clearInterval);
  envDash.initNotifications();
  await new Promise(r => setTimeout(r, 30));

  assert(dashboardRefreshed >= 1, `Dashboard stats and labs should refresh. Count: ${dashboardRefreshed}`);
});

// -----------------------------------------------------------------------------
// SECTION 4: Existing Notification Filtering & Toasting Behavior
// -----------------------------------------------------------------------------
console.log('\n--- 4. Existing Notification & Role Filtering Behavior Verification ---');

runAsyncTest('Simulated DOM: Non-empty notifications display unread dot, render items, and filter QR', async () => {
  let renderedCount = 0;
  const mockNotifs = [
    { id: 101, type: 'key_transfer', status: 'Pending', description: 'Room 203 transfer', time: new Date().toISOString() },
    { id: 102, type: 'iot_event', status: 'QR Verified', description: 'Intermediate scan', time: new Date().toISOString() }, // Should be filtered out!
    { id: 103, type: 'report', status: 'In Review', description: 'PC-04 broken mouse', time: new Date().toISOString() }
  ];

  const env = createMockEnvironment('room-status', mockNotifs);
  env.domElements.notifList.appendChild = () => { renderedCount++; };
  env.loadAllRoomStatusLabs = () => {};
  env.loadRoomStatusActivityLog = () => {};
  env.setInterval = () => 1;
  env.clearInterval = () => {};

  const runCode = new Function('global', 'window', 'document', 'localStorage', 'sessionStorage', 'setInterval', 'clearInterval', notifJsCode);
  runCode(env, env.window, env.document, env.localStorage, env.sessionStorage, env.setInterval, env.clearInterval);

  env.initNotifications();
  await new Promise(r => setTimeout(r, 40));

  assert.strictEqual(renderedCount, 2, 'Exactly 2 notifications should render (QR event filtered out)');
  assert.strictEqual(env.domElements.notifDot.style.display, 'block', 'Unread dot must be visible when notifications exist');
});

// -----------------------------------------------------------------------------
// SECTION 5: Independent Updating of Room 203 and Room 204
// -----------------------------------------------------------------------------
console.log('\n--- 5. Independent Multi-Room Support (Room 203 & Room 204) ---');

runTest('Firmware heartbeat JSON formats slots 203 and 204 independently', () => {
  assert(inoContent.includes('\\"deviceId\\":\\"ESP32-KeyBox\\"'), 'Heartbeat must contain deviceId');
  assert(inoContent.includes('\\"rooms\\":[\\"203\\",\\"204\\"]'), 'Heartbeat must register rooms 203 and 204');
  assert(inoContent.includes('\\"slots\\":{\\"203\\":') && inoContent.includes('\\"204\\":'),
    'Heartbeat must contain slots dictionary with independent 203 and 204 entries');
});

runTest('Firmware network worker tracks slotNeedsSync203 and slotNeedsSync204 independently', () => {
  assert(inoContent.includes('volatile bool slotNeedsSync203'), 'Firmware must declare slotNeedsSync203');
  assert(inoContent.includes('volatile bool slotNeedsSync204'), 'Firmware must declare slotNeedsSync204');
  assert(inoContent.includes('volatile bool slotTargetState203'), 'Firmware must declare slotTargetState203');
  assert(inoContent.includes('volatile bool slotTargetState204'), 'Firmware must declare slotTargetState204');

  assert(inoContent.includes('sendKeyStatusHttp("203", target203)'), 'Firmware reconciles Room 203 independently');
  assert(inoContent.includes('sendKeyStatusHttp("204", target204)'), 'Firmware reconciles Room 204 independently');
});

// -----------------------------------------------------------------------------
// SECTION 6: Explicit No-Cache Behavior
// -----------------------------------------------------------------------------
console.log('\n--- 6. No-Cache Headers & Cache Busting Verification ---');

runTest('js/services/laboratory.service.js adds cache-busting timestamp and cache: no-store', () => {
  const labSvcPath = path.resolve(__dirname, '../js/services/laboratory.service.js');
  const labSvcCode = fs.readFileSync(labSvcPath, 'utf8');

  assert(labSvcCode.includes('/api/laboratories?_=${Date.now()}'),
    'fetchLaboratories must include timestamp query parameter to bust browser cache');
  assert(labSvcCode.includes("cache: 'no-store'"),
    'fetchLaboratories must specify cache: "no-store"');
  assert(labSvcCode.includes("'Cache-Control': 'no-cache'"),
    'fetchLaboratories must send Cache-Control request header');
});

runTest('controllers/labs.controller.js sets Cache-Control: no-cache, no-store, must-revalidate', () => {
  const ctrlPath = path.resolve(__dirname, '../controllers/labs.controller.js');
  const ctrlCode = fs.readFileSync(ctrlPath, 'utf8');

  assert(ctrlCode.includes("res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');"),
    'getAllLaboratories controller must set Cache-Control response header');
});

runTest('js/pages/room-status.js guards against overlapping fetchLaboratories requests', () => {
  const rsPath = path.resolve(__dirname, '../js/pages/room-status.js');
  const rsCode = fs.readFileSync(rsPath, 'utf8');

  assert(rsCode.includes('let _isLoadingRoomStatusLabs = false;'),
    'room-status.js must declare _isLoadingRoomStatusLabs guard');
  assert(rsCode.includes('if (_isLoadingRoomStatusLabs) return;'),
    'loadAllRoomStatusLabs must early return if already loading');
  assert(rsCode.includes('_isLoadingRoomStatusLabs = false;'),
    'loadAllRoomStatusLabs must reset guard in finally block');
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
Promise.all(asyncTasks).then(() => {
  console.log('\n================================================================');
  console.log(`Results: ${passedTests} / ${totalTests} tests passed`);
  if (passedTests === totalTests) {
    console.log('🎉 ALL KEY-TAKE LATENCY & POLLING FIX TESTS PASSED SUCCESSFULLY!');
  } else {
    console.log('✖ SOME TESTS FAILED');
  }
  console.log('================================================================\n');
});
