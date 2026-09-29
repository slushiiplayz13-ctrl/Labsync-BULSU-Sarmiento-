'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 Starting Logout Confirmation Modal Tests');
console.log('================================================================\n');

// 1. Static Code Verification
console.log('--- 1. Static Script Verification in user.service.js ---');
const userServiceContent = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'services', 'user.service.js'),
  'utf8'
);

assert.ok(
  userServiceContent.includes('Confirm Logout'),
  'user.service.js must include Confirm Logout modal title'
);
assert.ok(
  userServiceContent.includes('Are you sure you want to log out of LabSync?'),
  'user.service.js must prompt with logout confirmation question'
);
assert.ok(
  userServiceContent.includes('showConfirmModal'),
  'user.service.js must integrate with showConfirmModal'
);
assert.ok(
  userServiceContent.includes('if (!confirmed) return;'),
  'user.service.js must guard logout execution if not confirmed'
);
console.log('✔ PASS: user.service.js contains confirmation modal integration and execution guard');

console.log('\n--- 2. Static Script Verification in profile-dropdown.js ---');
const dropdownContent = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'components', 'profile', 'profile-dropdown.js'),
  'utf8'
);
assert.ok(
  dropdownContent.includes("profileMenu.style.display = 'none'"),
  'profile-dropdown.js must close profile menu upon clicking logout'
);
console.log('✔ PASS: profile-dropdown.js closes menu before invoking handleLogout');

// 3. Behavioral Simulation of handleLogout
console.log('\n--- 3. Behavioral Simulation of handleLogout ---');

// Mock browser global environment
let modalOptionsPassed = null;
let modalCalled = false;
let userResponse = false;
let apiLogoutCalled = false;
let clearedLocalStorageKeys = [];
let redirectedTo = null;

const mockStorage = {
  removeItem(key) {
    clearedLocalStorageKeys.push(key);
  }
};

const mockWindow = {
  location: {
    pathname: '/it-head-dashboard.html',
    set href(val) {
      redirectedTo = val;
    },
    get href() {
      return redirectedTo;
    }
  },
  showConfirmModal: async (options) => {
    modalCalled = true;
    modalOptionsPassed = options;
    return userResponse;
  }
};

global.window = mockWindow;
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ src: '', async: false, setAttribute: () => {} }),
  head: { appendChild: () => {} }
};
global.localStorage = mockStorage;
global.sessionStorage = { clear: () => {} };
global.fetch = async (url) => {
  if (url === '/api/logout') {
    apiLogoutCalled = true;
  }
  return { ok: true, json: async () => ({}) };
};

// Evaluate user.service.js in simulated global context
const userServiceFn = new Function('global', userServiceContent);
userServiceFn(mockWindow);

(async () => {
  const logoutFn = mockWindow.handleLogout || global.handleLogout;

  // Scenario A: User clicks Cancel
  console.log('Scenario A: User cancels logout prompt');
  modalCalled = false;
  modalOptionsPassed = null;
  userResponse = false;
  apiLogoutCalled = false;
  clearedLocalStorageKeys = [];
  redirectedTo = null;

  await logoutFn();

  assert.strictEqual(modalCalled, true, 'Confirm modal must be opened');
  assert.strictEqual(modalOptionsPassed.title, 'Confirm Logout', 'Title must be Confirm Logout');
  assert.strictEqual(modalOptionsPassed.confirmText, 'Log Out', 'Confirm text must be Log Out');
  assert.strictEqual(modalOptionsPassed.cancelText, 'Cancel', 'Cancel text must be Cancel');
  assert.strictEqual(modalOptionsPassed.icon, 'log-out', 'Icon must be log-out');
  assert.strictEqual(apiLogoutCalled, false, 'API logout must NOT be called when cancelled');
  assert.strictEqual(clearedLocalStorageKeys.length, 0, 'LocalStorage must NOT be cleared when cancelled');
  assert.strictEqual(redirectedTo, null, 'No redirection should occur when cancelled');
  console.log('✔ PASS: Cancelling logout prompt cleanly preserves user session and aborts logout');

  // Scenario B: User clicks Confirm / Log Out
  console.log('\nScenario B: User confirms logout prompt');
  modalCalled = false;
  modalOptionsPassed = null;
  userResponse = true;
  apiLogoutCalled = false;
  clearedLocalStorageKeys = [];
  redirectedTo = null;

  await logoutFn();

  assert.strictEqual(modalCalled, true, 'Confirm modal must be opened');
  assert.strictEqual(apiLogoutCalled, true, 'API /api/logout must be called when confirmed');
  assert.ok(clearedLocalStorageKeys.includes('user'), 'User storage must be cleared');
  assert.strictEqual(redirectedTo, '/login.html', 'User must be redirected to /login.html');
  console.log('✔ PASS: Confirming logout cleans storage, invalidates session, and redirects to login');

  console.log('\n================================================================');
  console.log('🎉 ALL LOGOUT CONFIRMATION MODAL TESTS PASSED!');
  console.log('================================================================');
  process.exit(0);
})().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
