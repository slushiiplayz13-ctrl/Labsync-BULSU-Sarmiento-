const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 Testing Dropdown Mutual Exclusivity & Non-Overlapping Panels');
console.log('================================================================\n');

// 1. Verify dept-head-key-authorizations.js
const keyAuthPath = path.join(__dirname, '..', 'js', 'components', 'dept-head-key-authorizations.js');
const keyAuthContent = fs.readFileSync(keyAuthPath, 'utf8');

assert.ok(
  keyAuthContent.includes("notifMenu.style.display = 'none'"),
  'dept-head-key-authorizations.js must hide notif-menu when opening'
);
assert.ok(
  keyAuthContent.includes("profileMenu.style.display = 'none'"),
  'dept-head-key-authorizations.js must hide profile-menu when opening'
);
assert.ok(
  keyAuthContent.includes("document.addEventListener('click', (e) => {") && keyAuthContent.includes('}, true);'),
  'dept-head-key-authorizations.js must use capture phase for outside clicks so other buttons cannot block closing'
);
console.log('✔ PASS: dept-head-key-authorizations.js mutual exclusivity and capture-phase listener verified');

// 2. Verify notifications.js
const notifPath = path.join(__dirname, '..', 'js', 'components', 'notifications.js');
const notifContent = fs.readFileSync(notifPath, 'utf8');

assert.ok(
  notifContent.includes("keyRequestsMenu.style.display = 'none'") || notifContent.includes("keyMenu.style.display = 'none'"),
  'notifications.js must hide key-requests-menu when notif button is clicked'
);
assert.ok(
  notifContent.includes('toggleKeyRequestsDropdown(false)'),
  'notifications.js must invoke toggleKeyRequestsDropdown(false)'
);
assert.ok(
  notifContent.includes('}, true);'),
  'notifications.js must use capture phase for outside clicks'
);
console.log('✔ PASS: notifications.js closes key-requests-menu on toggle and uses capture phase');

// 3. Verify profile-dropdown.js
const profilePath = path.join(__dirname, '..', 'js', 'components', 'profile', 'profile-dropdown.js');
const profileContent = fs.readFileSync(profilePath, 'utf8');

assert.ok(
  profileContent.includes("keyRequestsMenu.style.display = 'none'") || profileContent.includes("keyMenu.style.display = 'none'"),
  'profile-dropdown.js must hide key-requests-menu when profile button is clicked'
);
assert.ok(
  profileContent.includes("notifMenu.style.display = 'none'"),
  'profile-dropdown.js must hide notif-menu when profile button is clicked'
);
assert.ok(
  profileContent.includes('}, true);'),
  'profile-dropdown.js must use capture phase for outside clicks'
);
console.log('✔ PASS: profile-dropdown.js closes key-requests-menu & notif-menu on toggle');

console.log('\n================================================================');
console.log('🎉 ALL DROPDOWN MUTUAL EXCLUSIVITY TESTS PASSED!');
console.log('================================================================\n');
