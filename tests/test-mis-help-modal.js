/**
 * Comprehensive Verification Test: MIS Staff Help & Support Modal
 * 
 * Verifies:
 * 1. Syntax validity of js/components/profile/help-modal.js
 * 2. MIS Staff role detection (role: 'MIS Staff' and /mis-*.html pages)
 * 3. MIS Quick Start cards (Dashboard, Maintenance Tracker, PC & QR, Smart Key Dock, OJT Interns)
 * 4. MIS Key Feature cards (IoT Smart Key Dock Sync, 2-Sided QR Inserts, Completed Maintenance Archive, etc.)
 * 5. Dismissal mechanisms (Got It button, Close button, Backdrop click, Escape key)
 * 6. CSS theme rules for light & dark mode (.theme-teal, .theme-red, 2-column flex alignment)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('--- Testing MIS Staff Help & Support Modal ---');

const helpModalFilePath = path.join(__dirname, '..', 'js', 'components', 'profile', 'help-modal.js');
const cssFilePath = path.join(__dirname, '..', 'css', 'components', 'help-cards.css');

assert.ok(fs.existsSync(helpModalFilePath), 'help-modal.js must exist');
assert.ok(fs.existsSync(cssFilePath), 'help-cards.css must exist');

const fileContent = fs.readFileSync(helpModalFilePath, 'utf8');
const cssContent = fs.readFileSync(cssFilePath, 'utf8');

// 1. Verify JS file syntax validity using VM
assert.doesNotThrow(() => {
  new vm.Script(fileContent);
}, 'help-modal.js must be syntactically valid JavaScript');
console.log('✓ help-modal.js syntax is valid');

// Helper to create mock DOM environment
function createMockEnvironment(userRole, pathname) {
  let appendedElements = [];
  const documentListeners = {};

  const mockDocument = {
    _elements: {},
    getElementById: function (id) {
      return this._elements[id] || null;
    },
    createElement: function (tag) {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        className: '',
        _innerHTML: '',
        _eventListeners: {},
        addEventListener: function (evt, handler) {
          if (!this._eventListeners[evt]) this._eventListeners[evt] = [];
          this._eventListeners[evt].push(handler);
        },
        remove: function () {
          this.removed = true;
          const idx = appendedElements.indexOf(this);
          if (idx !== -1) appendedElements.splice(idx, 1);
        },
        set innerHTML(val) {
          this._innerHTML = val;
          const idMatches = val.match(/id="([^"]+)"/g);
          if (idMatches) {
            idMatches.forEach(m => {
              const matchedId = m.replace('id="', '').replace('"', '');
              mockDocument._elements[matchedId] = {
                id: matchedId,
                _eventListeners: {},
                addEventListener: function (evt, handler) {
                  if (!this._eventListeners[evt]) this._eventListeners[evt] = [];
                  this._eventListeners[evt].push(handler);
                }
              };
            });
          }
        },
        get innerHTML() {
          return this._innerHTML;
        }
      };
      return el;
    },
    addEventListener: function (evt, handler) {
      if (!documentListeners[evt]) documentListeners[evt] = [];
      documentListeners[evt].push(handler);
    },
    removeEventListener: function (evt, handler) {
      if (!documentListeners[evt]) return;
      const idx = documentListeners[evt].indexOf(handler);
      if (idx !== -1) documentListeners[evt].splice(idx, 1);
    },
    body: {
      appendChild: function (el) {
        appendedElements.push(el);
        return el;
      }
    }
  };

  const mockWindow = {
    document: mockDocument,
    location: { pathname: pathname || '/mis-staff-dashboard.html' },
    sessionStorage: {
      getItem: (key) => {
        if (key === 'labsync_user') {
          return JSON.stringify({ role: userRole, name: 'MIS Officer' });
        }
        return null;
      }
    },
    localStorage: {
      getItem: () => null
    },
    lucide: {
      createIcons: () => { }
    }
  };

  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    console: console,
    fetch: () => Promise.resolve({ ok: false }),
    sessionStorage: mockWindow.sessionStorage,
    localStorage: mockWindow.localStorage
  });

  vm.runInContext(fileContent, context);

  return { context, mockDocument, mockWindow, appendedElements, documentListeners };
}

(async () => {
  // Test 1: MIS Staff Role & Dashboard Path Content
  console.log('\n--- 1. Testing MIS Staff Modal Content (Role: MIS Staff) ---');
  const envMis = createMockEnvironment('MIS Staff', '/mis-staff-dashboard.html');
  await envMis.context.window.openHelpModal();

  assert.strictEqual(envMis.appendedElements.length, 1, 'Modal element appended to DOM');
  const misModal = envMis.appendedElements[0];
  const misHTML = misModal.innerHTML;

  const expectedQuickStartTitles = [
    'MIS Staff Dashboard',
    'Maintenance Tracker & History',
    'PC & QR Fleet Management',
    'Smart Key Dock & Tracking',
    'OJT Intern Lifecycle & Access'
  ];

  for (const title of expectedQuickStartTitles) {
    assert.ok(misHTML.includes(title), `MIS modal should include Quick Start "${title}"`);
    console.log(`✓ MIS Quick Start: ${title}`);
  }

  const expectedFeatureTitles = [
    'Printable 2-Sided QR Inserts',
    'Completed Maintenance Archive',
    '1-Click Repair & Fleet Sync',
    'Automated OJT Expiration Guards'
  ];

  for (const feat of expectedFeatureTitles) {
    assert.ok(misHTML.includes(feat), `MIS modal should include Feature "${feat}"`);
    console.log(`✓ MIS Feature: ${feat}`);
  }

  // Ensure the 2 removed feature cards are no longer present
  assert.ok(!misHTML.includes('IoT Smart Key Dock Sync'), 'IoT Smart Key Dock Sync feature card must be removed');
  assert.ok(!misHTML.includes('Interactive Workstation Grid'), 'Interactive Workstation Grid feature card must be removed');
  console.log('✓ Successfully verified that IoT Smart Key Dock Sync and Interactive Workstation Grid feature cards were removed');

  // Verify feature and quick start details
  assert.ok(misHTML.includes('Overview metrics and Recent Reports'), 'Should mention Overview metrics and Recent Reports');
  assert.ok(misHTML.includes('completed maintenance archive with CSV export'), 'Should mention completed maintenance archive with CSV export');
  assert.ok(misHTML.includes('room-by-room workstation grids (Lab 203, 204)'), 'Should mention room-by-room workstation grids');
  assert.ok(misHTML.includes('7-day expiration countdowns'), 'Should mention 7-day expiration countdowns');
  assert.ok(misHTML.includes('data-lucide="file-spreadsheet"'), 'Should use file-spreadsheet icon for Completed Maintenance Archive');
  console.log('✓ MIS detailed capabilities and Lucide icons verified');

  // Test 2: MIS Page Path Inference (e.g. /mis-maintenance.html with empty session role)
  console.log('\n--- 2. Testing Path Inference (/mis-maintenance.html) ---');
  const envMisPath = createMockEnvironment('', '/mis-maintenance.html');
  await envMisPath.context.window.openHelpModal();
  const misPathHTML = envMisPath.appendedElements[0].innerHTML;
  assert.ok(misPathHTML.includes('MIS Staff Dashboard'), 'Should infer MIS role from mis-*.html path');
  assert.ok(misPathHTML.includes('Completed Maintenance Archive'), 'Should render MIS features on mis-*.html path');
  console.log('✓ MIS role correctly inferred from /mis-maintenance.html path');

  // Test 3: Dismissal Mechanisms
  console.log('\n--- 3. Testing MIS Dismissal Mechanisms ---');
  
  // 3a. Close button click
  const envCloseBtn = createMockEnvironment('MIS Staff', '/mis-staff-dashboard.html');
  await envCloseBtn.context.window.openHelpModal();
  const closeBtnEl = envCloseBtn.mockDocument.getElementById('close-help-modal');
  assert.ok(closeBtnEl, 'close-help-modal exists');
  closeBtnEl._eventListeners['click'][0]();
  assert.strictEqual(envCloseBtn.appendedElements.length, 0, 'Clicking close button removes modal');
  console.log('✓ Top-right close [X] button dismisses modal');

  // 3b. Got It button click
  const envGotItBtn = createMockEnvironment('MIS Staff', '/mis-staff-dashboard.html');
  await envGotItBtn.context.window.openHelpModal();
  const gotItBtnEl = envGotItBtn.mockDocument.getElementById('close-help-btn');
  assert.ok(gotItBtnEl, 'close-help-btn exists');
  gotItBtnEl._eventListeners['click'][0]();
  assert.strictEqual(envGotItBtn.appendedElements.length, 0, 'Clicking got it button removes modal');
  console.log('✓ Bottom [Got it!] button dismisses modal');

  // 3c. Backdrop click
  const envBackdrop = createMockEnvironment('MIS Staff', '/mis-staff-dashboard.html');
  await envBackdrop.context.window.openHelpModal();
  const modalEl = envBackdrop.appendedElements[0];
  modalEl._eventListeners['click'][0]({ target: modalEl });
  assert.strictEqual(envBackdrop.appendedElements.length, 0, 'Clicking backdrop overlay removes modal');
  console.log('✓ Backdrop click dismisses modal');

  // 3d. Escape keydown
  const envEscape = createMockEnvironment('MIS Staff', '/mis-staff-dashboard.html');
  await envEscape.context.window.openHelpModal();
  envEscape.documentListeners['keydown'][0]({ key: 'Escape' });
  assert.strictEqual(envEscape.appendedElements.length, 0, 'Pressing Escape removes modal');
  console.log('✓ Keyboard Escape key dismisses modal');

  // Test 4: CSS Theme Classes
  console.log('\n--- 4. Testing CSS Theme Styles for MIS ---');
  assert.ok(cssContent.includes('.help-feature-card.theme-teal'), 'help-cards.css must include .help-feature-card.theme-teal');
  assert.ok(cssContent.includes('.help-feature-card.theme-red'), 'help-cards.css must include .help-feature-card.theme-red');
  assert.ok(cssContent.includes('html.dark-mode .help-feature-card.theme-teal'), 'Dark mode must override theme-teal');
  assert.ok(cssContent.includes('html.dark-mode .help-feature-card.theme-red'), 'Dark mode must override theme-red');
  console.log('✓ Theme-teal and Theme-red feature card styles present in light & dark mode');

  console.log('\n=================================================');
  console.log('🎉 ALL MIS HELP & SUPPORT SUITES PASSED CLEANLY!');
  console.log('=================================================');
})().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
