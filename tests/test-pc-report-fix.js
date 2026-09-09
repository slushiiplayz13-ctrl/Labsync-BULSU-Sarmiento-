const fs = require('fs');

// 1. Check submit-pc-report.html
const html = fs.readFileSync('submit-pc-report.html', 'utf8');
console.log('--- Checking submit-pc-report.html ---');
console.log('Has tutorial.css:', html.includes('tutorial.css'));
console.log('Has tutorial.js:', html.includes('tutorial.js'));
console.log('Has success-modal inline display none:', html.includes('id="success-modal" style="display: none; pointer-events: none;"'));
console.log('Has submit-button disabled:', html.includes('id="submit-button" disabled'));
console.log('Has custom-checkbox empty:', html.includes('<div class="checkbox-custom" id="custom-checkbox"></div>'));

// 2. Check submit-pc-report.js
const js = fs.readFileSync('js/pages/submit-pc-report.js', 'utf8');
console.log('--- Checking submit-pc-report.js ---');
const count = (js.match(/function initSubmitPcReportPage\s*\(/g) || []).length;
console.log('initSubmitPcReportPage declaration count (must be 1):', count);
console.log('Has parseWorkstationParams:', js.includes('function parseWorkstationParams'));
console.log('Has isConfirmed toggle:', js.includes('isConfirmed = forceState'));
console.log('Has stopPropagation only on success-card:', js.includes('successCard.addEventListener'));

// 3. Check modals.css
const modalsCss = fs.readFileSync('css/components/modals.css', 'utf8');
console.log('--- Checking modals.css ---');
console.log('Has success-modal default display none:', modalsCss.includes('display: none !important;'));

// 4. Simulate browser environment for submit-pc-report.js
console.log('--- Simulating DOM and query string (?room=204&pc=2) ---');
const elements = {};
const listeners = {};

function createElement(id, classes = '') {
  return {
    id,
    classList: {
      _classes: new Set(classes.split(' ').filter(Boolean)),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      toggle(c, force) { if (force !== undefined) { force ? this.add(c) : this.remove(c); } else { this._classes.has(c) ? this.remove(c) : this.add(c); } },
      contains(c) { return this._classes.has(c); }
    },
    textContent: '',
    value: '',
    style: {},
    innerHTML: '',
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = v; },
    removeAttribute(k) { delete this.attributes[k]; },
    addEventListener(evt, fn) {
      if (!listeners[id]) listeners[id] = {};
      listeners[id][evt] = fn;
    },
    querySelector(sel) {
      if (sel === '.success-card') return createElement('success-card');
      return null;
    }
  };
}

elements['room-display'] = createElement('room-display');
elements['pc-display'] = createElement('pc-display');
elements['current-date'] = createElement('current-date');
elements['student-name'] = createElement('student-name');
elements['student-section'] = createElement('student-section');
elements['remarks'] = createElement('remarks');
elements['remarks-char-counter'] = createElement('remarks-char-counter');
elements['custom-checkbox'] = createElement('custom-checkbox');
elements['submit-button'] = createElement('submit-button', 'btn-disabled');
elements['success-modal'] = createElement('success-modal');
elements['ticket-id'] = createElement('ticket-id');

global.document = {
  getElementById(id) { return elements[id] || null; },
  querySelector(sel) {
    if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
    if (sel === '.confirm-row') return createElement('confirm-row');
    return null;
  },
  querySelectorAll() { return []; },
  addEventListener(evt, fn) {
    if (!listeners['document']) listeners['document'] = {};
    listeners['document'][evt] = fn;
  },
  readyState: 'complete',
  activeElement: null
};

global.window = {
  location: { search: '?room=204&pc=2' },
  lucide: { createIcons() {} }
};

// Execute the script
eval(js);

console.log('Simulated room-display text:', elements['room-display'].textContent);
console.log('Simulated pc-display text:', elements['pc-display'].textContent);
console.log('Simulated current-date text:', elements['current-date'].textContent);
console.log('Simulated success-modal style display:', elements['success-modal'].style.display);
console.log('Simulated success-modal style pointerEvents:', elements['success-modal'].style.pointerEvents);

if (elements['room-display'].textContent === 'Room 204' && elements['pc-display'].textContent === 'PC Unit 2') {
  console.log('✓ PASS: Room and PC correctly determined!');
} else {
  console.error('✗ FAIL: Room and PC not determined correctly');
}

if (elements['success-modal'].style.display === 'none' && elements['success-modal'].style.pointerEvents === 'none') {
  console.log('✓ PASS: Success modal is safely hidden and not blocking clicks!');
} else {
  console.error('✗ FAIL: Success modal is still blocking');
}
