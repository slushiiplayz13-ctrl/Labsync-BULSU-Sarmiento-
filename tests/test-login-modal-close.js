const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing Login Modal Close Functionality ---');

const htmlPath = path.join(__dirname, '..', 'login.html');
const jsPath = path.join(__dirname, '..', 'js', 'pages', 'login.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// 1. Verify modal button configurations in HTML
assert.strictEqual(htmlContent.includes('id="closeContactModalBtn"'), false, 'closeContactModalBtn should be removed from login.html');
assert.strictEqual(htmlContent.includes('id="closeAboutModalBtn"'), true, 'closeAboutModalBtn must exist in login.html');
console.log('✓ Verified: Top-right x button present on About modal');

// 2. Verify Close buttons in HTML
assert.strictEqual(htmlContent.includes('id="closeContactActionBtn"'), true, 'closeContactActionBtn must exist in login.html');
assert.strictEqual(htmlContent.includes('id="closeAboutActionBtn"'), false, 'closeAboutActionBtn should be removed from login.html');
console.log('✓ Verified: Bottom Close button removed from About modal');

// 3. Verify that js/pages/login.js handles closeAboutModalBtn and no longer closeContactModalBtn
assert.strictEqual(jsContent.includes('closeContactModalBtn'), false, 'login.js should not reference closeContactModalBtn');
assert.strictEqual(jsContent.includes('closeAboutModalBtn'), true, 'login.js should reference closeAboutModalBtn');
console.log('✓ Verified: closeAboutModalBtn wired in login.js');

// 4. Verify behavioral simulation
class MockClassList {
  constructor() {
    this.classes = new Set();
  }
  add(cls) { this.classes.add(cls); }
  remove(cls) { this.classes.delete(cls); }
  contains(cls) { return this.classes.has(cls); }
}

class MockElement {
  constructor(id, tag = 'div') {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList();
    this.listeners = {};
    this.value = '';
    this.style = {};
  }
  addEventListener(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  click() {
    if (this.listeners['click']) {
      const e = {
        target: this,
        preventDefault: () => {},
        stopPropagation: () => {}
      };
      this.listeners['click'].forEach(cb => cb(e));
    }
  }
  focus() {
    this.focused = true;
  }
}

const mockDocListeners = {};
const mockElements = {
  aboutLink: new MockElement('aboutLink', 'a'),
  aboutModal: new MockElement('aboutModal', 'div'),
  closeAboutModalBtn: new MockElement('closeAboutModalBtn', 'button'),
  contactLink: new MockElement('contactLink', 'a'),
  contactModal: new MockElement('contactModal', 'div'),
  closeContactActionBtn: new MockElement('closeContactActionBtn', 'button'),
  recoverModal: new MockElement('recoverModal', 'div'),
  closeRecoverModalBtn: new MockElement('closeRecoverModalBtn', 'button'),
  sendRecoverBtn: new MockElement('sendRecoverBtn', 'button'),
  recoverEmail: new MockElement('recoverEmail', 'input'),
  email: new MockElement('email', 'input'),
  loginBtn: new MockElement('loginBtn', 'button')
};

global.document = {
  getElementById: (id) => mockElements[id] || null,
  querySelector: (sel) => {
    if (sel === '.forgot-link') return new MockElement('forgotLink', 'a');
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: (event, cb) => {
    if (!mockDocListeners[event]) mockDocListeners[event] = [];
    mockDocListeners[event].push(cb);
  },
  readyState: 'complete'
};

global.window = {
  addEventListener: () => {},
  document: global.document,
  location: { search: '', pathname: '/login.html' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
};

let modalOpenReported = null;
global.setModalOpenState = (state) => {
  modalOpenReported = state;
};
global.window.setModalOpenState = global.setModalOpenState;

// Execute script
require(jsPath);

// Test Contact Modal: Open and Close via Action Button
mockElements.contactLink.click();
assert.strictEqual(mockElements.contactModal.classList.contains('active'), true, 'contactModal should be active after contactLink click');
assert.strictEqual(modalOpenReported, true, 'setModalOpenState should be called with true');

mockElements.closeContactActionBtn.click();
assert.strictEqual(mockElements.contactModal.classList.contains('active'), false, 'contactModal should close when closeContactActionBtn clicked');
assert.strictEqual(modalOpenReported, false, 'setModalOpenState should be called with false');
console.log('✓ Verified: Contact modal opens and closes via bottom Close button');

// Test Contact Modal: Close via Backdrop Click
mockElements.contactLink.click();
assert.strictEqual(mockElements.contactModal.classList.contains('active'), true);
// Backdrop click target is contactModal overlay
const backdropEvent = { target: mockElements.contactModal, preventDefault: () => {}, stopPropagation: () => {} };
mockElements.contactModal.listeners['click'].forEach(cb => cb(backdropEvent));
assert.strictEqual(mockElements.contactModal.classList.contains('active'), false, 'contactModal should close on backdrop click');
console.log('✓ Verified: Contact modal closes on backdrop click');

// Test Contact Modal: Close via Escape key
mockElements.contactLink.click();
assert.strictEqual(mockElements.contactModal.classList.contains('active'), true);
const escapeEvent = { key: 'Escape' };
mockDocListeners['keydown'].forEach(cb => cb(escapeEvent));
assert.strictEqual(mockElements.contactModal.classList.contains('active'), false, 'contactModal should close on Escape key');
console.log('✓ Verified: Contact modal closes on Escape key');

// Test About Modal: Open and Close via x Button
mockElements.aboutLink.click();
assert.strictEqual(mockElements.aboutModal.classList.contains('active'), true, 'aboutModal should be active after aboutLink click');

mockElements.closeAboutModalBtn.click();
assert.strictEqual(mockElements.aboutModal.classList.contains('active'), false, 'aboutModal should close when closeAboutModalBtn clicked');
console.log('✓ Verified: About modal opens and closes via top-right x button');

// Test About Modal: Close via Backdrop Click
mockElements.aboutLink.click();
assert.strictEqual(mockElements.aboutModal.classList.contains('active'), true);
mockElements.aboutModal.listeners['click'].forEach(cb => cb({ target: mockElements.aboutModal }));
assert.strictEqual(mockElements.aboutModal.classList.contains('active'), false, 'aboutModal should close on backdrop click');
console.log('✓ Verified: About modal closes on backdrop click');

// Test About Modal: Close via Escape key
mockElements.aboutLink.click();
assert.strictEqual(mockElements.aboutModal.classList.contains('active'), true);
mockDocListeners['keydown'].forEach(cb => cb({ key: 'Escape' }));
assert.strictEqual(mockElements.aboutModal.classList.contains('active'), false, 'aboutModal should close on Escape key');
console.log('✓ Verified: About modal closes on Escape key');

console.log('All login modal tests passed successfully!');
