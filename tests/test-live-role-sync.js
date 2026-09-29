/**
 * tests/test-live-role-sync.js
 * Verification suite for automatic live role synchronization and route switching.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 LIVE ROLE SYNCHRONIZATION & WORKSPACE ROUTING TEST SUITE');
console.log('================================================================');

// 1. Read js/auth-check.js
const authCheckCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth-check.js'), 'utf8');

// Extract isPageAuthorized and getAuthorizedRedirect
const OJT_ALLOWED_PAGES = new Set([
    'mis-staff-dashboard.html',
    'mis-maintenance.html'
]);

// Evaluate helper functions in isolated context
const evalScope = {};
const fnCode = `
${authCheckCode.match(/function isPageAuthorized[\s\S]*?\n\}/)[0]}
${authCheckCode.match(/function getAuthorizedRedirect[\s\S]*?\n\}/)[0]}
return { isPageAuthorized, getAuthorizedRedirect };
`;
const { isPageAuthorized, getAuthorizedRedirect } = new Function('OJT_ALLOWED_PAGES', fnCode)(OJT_ALLOWED_PAGES);

console.log('\n--- 1. Testing Page Authorization Matrix ---');

// IT Dept Head authorizations
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'it-head-dashboard.html'), true, 'IT Dept Head must be authorized on it-head-dashboard.html');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'master-schedule.html'), true, 'IT Dept Head must be authorized on master-schedule.html');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'faculty-management.html'), true, 'IT Dept Head must be authorized on faculty-management.html');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'room-schedule-editor.html'), true, 'IT Dept Head must be authorized on room-schedule-editor.html');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'it-head-room-status.html'), true, 'IT Dept Head must be authorized on it-head-room-status.html');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'it-head-pc-reports.html'), true, 'IT Dept Head must be authorized on it-head-pc-reports.html');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'it-head-my-schedule.html'), true, 'IT Dept Head must be authorized on it-head-my-schedule.html');

// IT Dept Head MUST NOT be authorized on standard faculty pages (because faculty pages lack admin privilege menus!)
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'index.html'), false, 'IT Dept Head must NOT be authorized on index.html (redirect required)');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'room-status.html'), false, 'IT Dept Head must NOT be authorized on room-status.html (redirect required)');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'faculty-pc-reports.html'), false, 'IT Dept Head must NOT be authorized on faculty-pc-reports.html (redirect required)');
assert.strictEqual(isPageAuthorized('IT Dept. Head', 'my-schedule.html'), false, 'IT Dept Head must NOT be authorized on my-schedule.html (redirect required)');
console.log('✔ PASS: IT Dept Head page authorization & faculty page guard verified.');

// Faculty authorizations
assert.strictEqual(isPageAuthorized('Faculty', 'index.html'), true, 'Faculty must be authorized on index.html');
assert.strictEqual(isPageAuthorized('Faculty', 'room-status.html'), true, 'Faculty must be authorized on room-status.html');
assert.strictEqual(isPageAuthorized('Faculty', 'faculty-pc-reports.html'), true, 'Faculty must be authorized on faculty-pc-reports.html');
assert.strictEqual(isPageAuthorized('Faculty', 'my-schedule.html'), true, 'Faculty must be authorized on my-schedule.html');

// Faculty MUST NOT be authorized on administrative IT Head pages
assert.strictEqual(isPageAuthorized('Faculty', 'it-head-dashboard.html'), false, 'Faculty must NOT be authorized on it-head-dashboard.html');
assert.strictEqual(isPageAuthorized('Faculty', 'master-schedule.html'), false, 'Faculty must NOT be authorized on master-schedule.html');
assert.strictEqual(isPageAuthorized('Faculty', 'faculty-management.html'), false, 'Faculty must NOT be authorized on faculty-management.html');
assert.strictEqual(isPageAuthorized('Faculty', 'room-schedule-editor.html'), false, 'Faculty must NOT be authorized on room-schedule-editor.html');
console.log('✔ PASS: Faculty page authorization & admin page block verified.');

// MIS Staff & OJT authorizations
assert.strictEqual(isPageAuthorized('MIS Staff', 'mis-staff-dashboard.html'), true, 'MIS Staff authorized on mis-staff-dashboard.html');
assert.strictEqual(isPageAuthorized('MIS Staff', 'index.html'), false, 'MIS Staff must NOT be authorized on index.html');
assert.strictEqual(isPageAuthorized('OJT', 'mis-staff-dashboard.html'), true, 'OJT authorized on mis-staff-dashboard.html');
assert.strictEqual(isPageAuthorized('OJT', 'mis-keys.html'), false, 'OJT must NOT be authorized on mis-keys.html');
console.log('✔ PASS: MIS Staff & OJT authorization constraints verified.');

console.log('\n--- 2. Testing Smart Workspace Routing (getAuthorizedRedirect) ---');

// Promotion from Faculty -> IT Dept Head redirects
assert.strictEqual(getAuthorizedRedirect('IT Dept. Head', 'index.html'), '/it-head-dashboard.html');
assert.strictEqual(getAuthorizedRedirect('IT Dept. Head', 'room-status.html'), '/it-head-room-status.html');
assert.strictEqual(getAuthorizedRedirect('IT Dept. Head', 'faculty-pc-reports.html'), '/it-head-pc-reports.html');
assert.strictEqual(getAuthorizedRedirect('IT Dept. Head', 'my-schedule.html'), '/it-head-my-schedule.html');
console.log('✔ PASS: Role promotion automatically routes to corresponding IT Head pages.');

// Demotion from IT Dept Head -> Faculty redirects
assert.strictEqual(getAuthorizedRedirect('Faculty', 'it-head-dashboard.html'), '/index.html');
assert.strictEqual(getAuthorizedRedirect('Faculty', 'it-head-room-status.html'), '/room-status.html');
assert.strictEqual(getAuthorizedRedirect('Faculty', 'it-head-pc-reports.html'), '/faculty-pc-reports.html');
assert.strictEqual(getAuthorizedRedirect('Faculty', 'it-head-my-schedule.html'), '/my-schedule.html');
assert.strictEqual(getAuthorizedRedirect('Faculty', 'master-schedule.html'), '/index.html');
assert.strictEqual(getAuthorizedRedirect('Faculty', 'faculty-management.html'), '/index.html');
console.log('✔ PASS: Role demotion automatically revokes admin access and routes to faculty pages.');

console.log('\n--- 3. Testing Real-Time Live Watcher Code Implementation ---');
assert.ok(authCheckCode.includes('startLiveRoleWatcher'), 'startLiveRoleWatcher must be present in auth-check.js');
assert.ok(authCheckCode.includes('checkLiveRoleChange'), 'checkLiveRoleChange must be present in auth-check.js');
assert.ok(authCheckCode.includes('setInterval(checkLiveRoleChange, 3000)'), 'Live watcher must poll checkLiveRoleChange every 3 seconds');
assert.ok(authCheckCode.includes("window.addEventListener('focus'"), 'Live watcher must trigger on tab focus');
assert.ok(authCheckCode.includes("visibilitychange"), 'Live watcher must trigger on tab visibility change');
assert.ok(authCheckCode.includes("window.addEventListener('storage'"), 'Live watcher must trigger on cross-tab storage broadcast');
console.log('✔ PASS: Live watcher hooks (interval, focus, visibilitychange, storage broadcast) confirmed.');

console.log('\n--- 4. Testing Backend Controllers Live Session Role Sync ---');
const authCtrlCode = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'auth.controller.js'), 'utf8');
assert.ok(authCtrlCode.includes('SELECT User_ID, Name, Email, Role, Status FROM users WHERE User_ID = ?'), 'checkAuth must query fresh role and status from database');
assert.ok(authCtrlCode.includes('req.session.userRole = user.Role'), 'checkAuth must keep req.session.userRole synced with DB');

const usersCtrlCode = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'users.controller.js'), 'utf8');
assert.ok(usersCtrlCode.includes('req.session.userRole = result.user.role'), 'getCurrentUser must keep req.session.userRole synced with DB');
console.log('✔ PASS: Backend controllers actively synchronize express session role from authoritative DB records.');

console.log('\n================================================================');
console.log('🎉 ALL LIVE ROLE SYNCHRONIZATION TESTS PASSED 100%!');
console.log('================================================================\n');
