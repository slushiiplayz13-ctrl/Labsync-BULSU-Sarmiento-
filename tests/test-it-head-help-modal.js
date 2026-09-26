/**
 * Comprehensive Verification Test: Help & Support Modal
 * 
 * Verifies:
 * 1. Syntax validity of js/components/profile/help-modal.js
 * 2. IT Head role content (Executive Dashboard, Ghost Overlays, etc.)
 * 3. Faculty role content (Schedule, Reports, QR Code Access)
 * 4. Dismissal mechanisms (Got It button, Close button, Backdrop click, Escape key)
 * 5. Compact CSS styling (580px width, streamlined header, footer, body padding)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log('--- Testing Help & Support Modal (Content, Dismissals & Proportions) ---');

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
  const eventListeners = {};
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
          // Simple parser to populate mock child elements by id
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
    location: { pathname: pathname || '/it-head-dashboard.html' },
    sessionStorage: {
      getItem: (key) => {
        if (key === 'labsync_user') {
          return JSON.stringify({ role: userRole, name: 'Test User' });
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
  // Test 1: IT Department Head Content
  console.log('\n--- 1. Testing IT Department Head Modal Content ---');
  const envItHead = createMockEnvironment('IT Department Head', '/it-head-dashboard.html');
  await envItHead.context.window.openHelpModal();

  assert.strictEqual(envItHead.appendedElements.length, 1, 'Modal element appended to DOM');
  const itHeadModal = envItHead.appendedElements[0];
  const itHeadHTML = itHeadModal.innerHTML;

  const expectedQuickStartTitles = [
    'Executive Dashboard',
    'Live Room Status & Activity',
    'Master Schedule Overview',
    'Room Schedule Studio',
    'PC Issue Reports',
    'My Teaching Schedule',
    'Faculty Management & Delegation'
  ];

  for (const title of expectedQuickStartTitles) {
    assert.ok(itHeadHTML.includes(title), `IT Head modal should include Quick Start "${title}"`);
    console.log(`✓ IT Head Quick Start: ${title}`);
  }

  const expectedFeatureTitles = [
    'Clash Prevention & Ghost Overlays',
    'Institutional Timetable Exports',
    'Curriculum Catalog Sync',
    'Physical Key & Room Presence Tracking',
    'Leadership Role Delegation',
    'Lab Hardware Health Oversight'
  ];

  for (const feat of expectedFeatureTitles) {
    assert.ok(itHeadHTML.includes(feat), `IT Head modal should include Feature "${feat}"`);
    console.log(`✓ IT Head Feature: ${feat}`);
  }

  assert.ok(itHeadHTML.includes('50/50 split ghost schedule overlays'), 'Should mention 50/50 split ghost schedule overlays');
  assert.ok(itHeadHTML.includes('unsaved changes safety'), 'Should mention unsaved changes protection');
  assert.ok(itHeadHTML.includes('Dean and Program Chair signatories'), 'Should mention official signatories');
  assert.ok(itHeadHTML.includes('Detect multi-room conflicts with side-by-side ghost schedule overlays.'), 'Feature card descriptions should be normal concise length');
  console.log('✓ Normal concise feature card descriptions verified');

  // Test 2: Faculty Content
  console.log('\n--- 2. Testing Faculty Modal Content ---');
  const envFaculty = createMockEnvironment('Faculty', '/faculty-dashboard.html');
  await envFaculty.context.window.openHelpModal();

  const facultyModal = envFaculty.appendedElements[0];
  const facultyHTML = facultyModal.innerHTML;

  const expectedFacultyQuickStart = [
    'View Schedule',
    'Submit Reports',
    'QR Code Access'
  ];

  for (const title of expectedFacultyQuickStart) {
    assert.ok(facultyHTML.includes(title), `Faculty modal should include Quick Start "${title}"`);
    console.log(`✓ Faculty Quick Start: ${title}`);
  }

  // Test 3: Dismissal Mechanisms
  console.log('\n--- 3. Testing Dismissal Mechanisms ---');
  
  // 3a. Close button click
  const envCloseBtn = createMockEnvironment('IT Department Head', '/it-head-dashboard.html');
  await envCloseBtn.context.window.openHelpModal();
  const closeBtnEl = envCloseBtn.mockDocument.getElementById('close-help-modal');
  assert.ok(closeBtnEl, 'close-help-modal button exists');
  assert.ok(closeBtnEl._eventListeners['click']?.length > 0, 'close-help-modal has click handler');
  closeBtnEl._eventListeners['click'][0]();
  assert.strictEqual(envCloseBtn.appendedElements.length, 0, 'Clicking close button removes modal');
  console.log('✓ Top-right close [X] button dismisses modal');

  // 3b. Got It button click
  const envGotItBtn = createMockEnvironment('IT Department Head', '/it-head-dashboard.html');
  await envGotItBtn.context.window.openHelpModal();
  const gotItBtnEl = envGotItBtn.mockDocument.getElementById('close-help-btn');
  assert.ok(gotItBtnEl, 'close-help-btn exists');
  assert.ok(gotItBtnEl._eventListeners['click']?.length > 0, 'close-help-btn has click handler');
  gotItBtnEl._eventListeners['click'][0]();
  assert.strictEqual(envGotItBtn.appendedElements.length, 0, 'Clicking got it button removes modal');
  console.log('✓ Bottom [Got it!] button dismisses modal');

  // 3c. Backdrop click
  const envBackdrop = createMockEnvironment('IT Department Head', '/it-head-dashboard.html');
  await envBackdrop.context.window.openHelpModal();
  const modalEl = envBackdrop.appendedElements[0];
  assert.ok(modalEl._eventListeners['click']?.length > 0, 'Modal overlay has click listener');
  // Trigger click with target as the overlay itself (backdrop)
  modalEl._eventListeners['click'][0]({ target: modalEl });
  assert.strictEqual(envBackdrop.appendedElements.length, 0, 'Clicking backdrop overlay removes modal');
  console.log('✓ Backdrop click dismisses modal');

  // 3d. Escape keydown
  const envEscape = createMockEnvironment('IT Department Head', '/it-head-dashboard.html');
  await envEscape.context.window.openHelpModal();
  assert.ok(envEscape.documentListeners['keydown']?.length > 0, 'Document has keydown listener for Escape');
  envEscape.documentListeners['keydown'][0]({ key: 'Escape' });
  assert.strictEqual(envEscape.appendedElements.length, 0, 'Pressing Escape removes modal');
  console.log('✓ Keyboard Escape key dismisses modal');

  // Test 4: CSS Proportions & Gentle Sizing
  console.log('\n--- 4. Testing CSS Gentle Proportions & 2-Column Alignment ---');
  assert.ok(itHeadHTML.includes('class="help-qs-body"'), 'Cards should use 2-column flex layout container (.help-qs-body)');
  assert.ok(cssContent.includes('max-width: 580px;'), 'Dialog should have compact max-width: 580px');
  assert.ok(cssContent.includes('padding: 22px 28px;'), 'Header should have gently reduced padding (22px 28px)');
  assert.ok(cssContent.includes('padding: 16px 28px;'), 'Footer should have gently reduced padding (16px 28px)');
  assert.ok(cssContent.includes('padding: 24px 28px;'), 'Body should have comfortable padding (24px 28px)');
  assert.ok(cssContent.includes('display: flex;') && cssContent.includes('flex-direction: row;'), 'Cards should use flex-direction: row for 2-column icon and text alignment');
  console.log('✓ Modal CSS enforces compact frame, gently smaller header/footer, and balanced central area');
  console.log('✓ Cards enforce bulletproof 2-column alignment (icon on left, title & description stacked on right)');

  console.log('\n=================================================');
  console.log('🎉 ALL SUITES (CONTENT, DISMISSAL & COMPACT SIZING) PASSED CLEANLY!');
  console.log('=================================================');
})().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
