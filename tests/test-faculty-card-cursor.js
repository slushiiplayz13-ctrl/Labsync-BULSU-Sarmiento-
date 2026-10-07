const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('🧪 GLOBAL & COMPONENT CURSOR BEHAVIOR TEST SUITE');
console.log('================================================================\n');

// 1. Verify CSS styles in css/components/faculty-cards.css
console.log('--- 1. Testing Faculty Cards CSS Rules (css/components/faculty-cards.css) ---');
const cssPath = path.join(__dirname, '..', 'css', 'components', 'faculty-cards.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

assert.ok(cssContent.includes('.faculty-card {') && cssContent.includes('cursor: default;'), 
  '.faculty-card must define cursor: default');

assert.ok(cssContent.includes('.faculty-card,') && cssContent.includes('cursor: default !important;'),
  'Static elements inside .faculty-card must enforce cursor: default !important');

assert.ok(cssContent.includes('.faculty-card button,') && cssContent.includes('cursor: pointer !important;'),
  'Buttons and interactive controls inside .faculty-card must retain cursor: pointer !important');

console.log('✔ PASS: css/components/faculty-cards.css defines default cursor on static elements and pointer cursor on interactive elements.');

// 2. Verify Global Reset CSS rules (css/reset.css)
console.log('--- 2. Testing Global Reset CSS Rules (css/reset.css) ---');
const resetPath = path.join(__dirname, '..', 'css', 'reset.css');
const resetContent = fs.readFileSync(resetPath, 'utf8');

assert.ok(resetContent.includes('html,') && resetContent.includes('body {') && resetContent.includes('cursor: default;'),
  'reset.css must declare cursor: default on html, body');

assert.ok(resetContent.includes('button,') && resetContent.includes('cursor: pointer;'),
  'reset.css must declare cursor: pointer on buttons and interactive elements');

assert.ok(resetContent.includes('textarea,') && resetContent.includes('cursor: text;'),
  'reset.css must preserve cursor: text on editable inputs and textareas');

assert.ok(resetContent.includes('cursor: not-allowed;'),
  'reset.css must declare cursor: not-allowed on disabled controls');

console.log('✔ PASS: css/reset.css enforces global default arrow cursor for static text across the entire application.');

// 3. Verify Auth CSS rules (css/auth.css)
console.log('--- 3. Testing Auth CSS Rules (css/auth.css) ---');
const authPath = path.join(__dirname, '..', 'css', 'auth.css');
const authContent = fs.readFileSync(authPath, 'utf8');

assert.ok(authContent.includes('cursor: default;'),
  'auth.css must declare cursor: default on html, body');

assert.ok(authContent.includes('button,') && authContent.includes('cursor: pointer;'),
  'auth.css must declare cursor: pointer on interactive controls');

console.log('✔ PASS: css/auth.css enforces default arrow cursor on auth pages.');

// 4. Verify faculty-card.js markup
console.log('--- 4. Testing faculty-card.js Markup ---');
require('../js/components/faculty-card.js');
const fc = global.facultyCard;

const testCardHtml = fc.createCardHtml({
  Name: 'Dr. Jane Smith',
  Role: 'IT Dept. Head',
  Email: 'head@labsync.com',
  Phone: '54354354354'
});

assert.ok(testCardHtml.includes('head@labsync.com'), 'Card must render email');
assert.ok(testCardHtml.includes('54354354354'), 'Card must render phone');
assert.ok(testCardHtml.includes('cursor:default'), 'Contact container must specify cursor:default');
assert.ok(testCardHtml.includes('faculty-menu-btn'), 'Menu button must be present');

console.log('✔ PASS: faculty-card.js properly includes cursor:default for static contact details.');

// 5. Verify faculty-management.html pre-rendering markup
console.log('--- 5. Testing faculty-management.html Pre-rendering Markup ---');
const fmHtml = fs.readFileSync(path.join(__dirname, '..', 'faculty-management.html'), 'utf8');
assert.ok(fmHtml.includes('cursor:default'), 'Pre-rendering loop in faculty-management.html must include cursor:default');

console.log('✔ PASS: faculty-management.html includes cursor:default in pre-rendering loop.');

console.log('\n================================================================');
console.log('🎉 ALL GLOBAL & COMPONENT CURSOR TESTS PASSED 100%!');
console.log('================================================================');
