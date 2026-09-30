const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Testing Login Policies Modal Functionality ---');

const htmlPath = path.join(__dirname, '..', 'login.html');
const jsPath = path.join(__dirname, '..', 'js', 'pages', 'login.js');

const htmlContent = fs.readFileSync(htmlPath, 'utf8');
const jsContent = fs.readFileSync(jsPath, 'utf8');

// 1. Verify HTML elements
assert.strictEqual(htmlContent.includes('id="policiesLink"'), true, 'policiesLink must exist in header of login.html');
assert.strictEqual(htmlContent.includes('id="footerPoliciesLink"'), false, 'footerPoliciesLink must not exist (single Policies button in header)');
assert.strictEqual(htmlContent.includes('id="policiesModal"'), true, 'policiesModal must exist in login.html');
assert.strictEqual(htmlContent.includes('id="closePoliciesModalBtn"'), true, 'closePoliciesModalBtn must exist in login.html');
assert.strictEqual(htmlContent.includes('id="closePoliciesActionBtn"'), false, 'closePoliciesActionBtn must be removed from login.html');
assert.strictEqual(htmlContent.includes('href="terms.html"'), true, 'login.html must reference terms.html');
console.log('✓ Verified: Single header Policies button and modal present in login.html');

// 2. Verify JS implementation
assert.strictEqual(jsContent.includes('function initPoliciesModal'), true, 'initPoliciesModal must be declared in login.js');
assert.strictEqual(jsContent.includes('initPoliciesModal();'), true, 'initPoliciesModal must be invoked in initPage');
console.log('✓ Verified: initPoliciesModal is declared and wired in login.js');

// 3. Behavioral simulation of modal interaction
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
  click(eventObj = {}) {
    if (this.listeners['click']) {
      const e = {
        target: this,
        preventDefault: () => {},
        stopPropagation: () => {},
        ...eventObj
      };
      this.listeners['click'].forEach(cb => cb(e));
    }
  }
  focus() {
    this.focused = true;
  }
  querySelector() {
    return new MockElement('inner', 'div');
  }
}

const mockDocListeners = {};
const mockElements = {
  policiesLink: new MockElement('policiesLink', 'a'),
  footerPoliciesLink: new MockElement('footerPoliciesLink', 'a'),
  policiesModal: new MockElement('policiesModal', 'div'),
  closePoliciesModalBtn: new MockElement('closePoliciesModalBtn', 'button'),
  closePoliciesActionBtn: new MockElement('closePoliciesActionBtn', 'button'),
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

let modalOpenReported = null;
global.setModalOpenState = (state) => {
  modalOpenReported = state;
};

global.document = {
  getElementById: (id) => mockElements[id] || null,
  querySelector: () => null,
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
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  setModalOpenState: global.setModalOpenState
};

global.lucide = {
  createIcons: () => {}
};

// Execute login.js in sandbox
const vm = require('vm');
const context = vm.createContext(global);
vm.runInContext(jsContent, context);

// Test 1: Click policiesLink -> opens modal
mockElements.policiesLink.click();
assert.strictEqual(mockElements.policiesModal.classList.contains('active'), true, 'policiesModal should be active after policiesLink click');
assert.strictEqual(modalOpenReported, true, 'setModalOpenState should be true');
console.log('✓ Verified: policiesLink click opens policiesModal');

// Test 2: Click closePoliciesModalBtn -> closes modal
mockElements.closePoliciesModalBtn.click();
assert.strictEqual(mockElements.policiesModal.classList.contains('active'), false, 'policiesModal should not be active after closePoliciesModalBtn click');
assert.strictEqual(modalOpenReported, false, 'setModalOpenState should be false');
console.log('✓ Verified: closePoliciesModalBtn closes policiesModal');

// Test 3: Click backdrop -> closes modal
mockElements.policiesLink.click();
assert.strictEqual(mockElements.policiesModal.classList.contains('active'), true);
// Simulate backdrop click
mockElements.policiesModal.click();
assert.strictEqual(mockElements.policiesModal.classList.contains('active'), false, 'policiesModal should close on backdrop click');
console.log('✓ Verified: Backdrop click closes policiesModal');

// Test 6: Press Escape key -> closes modal
mockElements.policiesLink.click();
assert.strictEqual(mockElements.policiesModal.classList.contains('active'), true);
if (mockDocListeners['keydown']) {
  mockDocListeners['keydown'].forEach(cb => cb({ key: 'Escape' }));
}
assert.strictEqual(mockElements.policiesModal.classList.contains('active'), false, 'Escape key should close policiesModal');
console.log('✓ Verified: Escape key closes policiesModal');

console.log('All login policies modal tests passed successfully!');
