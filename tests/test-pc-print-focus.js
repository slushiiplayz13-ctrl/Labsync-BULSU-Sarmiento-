/**
 * Automated test for MIS QR Generator PC Card Print Focus & Hover State.
 * Validates:
 * 1. CSS rules: No :focus-within on pc-qr-card; uses :focus-visible and :has(:focus-visible)
 * 2. Dark mode and high-contrast modes do not use generic :focus on buttons
 * 3. qr-generator.print.js clearCardFocus & scheduleClearCardFocus functionality
 * 4. qr-generator.renderer.js pointerleave/mouseleave focus cleaning
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function runTests() {
  console.log('=== 1. Validating qr-cards.css Focus & Hover Styles ===');
  const qrCardsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'qr-cards.css'), 'utf8');

  // Must not have :focus-within on .pc-qr-card
  assert.ok(!qrCardsCss.includes('.pc-qr-card:focus-within'), 'Must not have .pc-qr-card:focus-within in qr-cards.css');

  // Must use :focus-visible and :has(:focus-visible)
  assert.ok(qrCardsCss.includes('.pc-qr-card:focus-visible'), 'Must use .pc-qr-card:focus-visible');
  assert.ok(qrCardsCss.includes('.pc-qr-card:has(:focus-visible)'), 'Must use .pc-qr-card:has(:focus-visible)');
  assert.ok(qrCardsCss.includes('.pc-qr-card:hover .pc-qr-btn'), 'Must have hover reveal for .pc-qr-btn');
  assert.ok(qrCardsCss.includes('.pc-qr-card:focus-visible .pc-qr-btn'), 'Must have focus-visible reveal for .pc-qr-btn');
  assert.ok(qrCardsCss.includes('.pc-qr-card:has(:focus-visible) .pc-qr-btn'), 'Must have :has(:focus-visible) reveal for .pc-qr-btn');

  // Dark & high-contrast modes must use :focus-visible
  assert.ok(qrCardsCss.includes('html.dark-mode .pc-qr-btn:focus-visible'), 'Dark mode button must use :focus-visible');
  assert.ok(qrCardsCss.includes('html.high-contrast .pc-qr-btn:focus-visible'), 'High contrast button must use :focus-visible');
  assert.ok(!qrCardsCss.includes('html.dark-mode .pc-qr-btn:focus,'), 'Dark mode button must not use generic :focus,');
  assert.ok(!qrCardsCss.includes('html.high-contrast .pc-qr-btn:focus {'), 'High contrast button must not use generic :focus');
  console.log('✓ qr-cards.css focus and hover rules verified!');

  console.log('\n=== 2. Validating buttons.css Delete PC Button Focus Styles ===');
  const buttonsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'buttons.css'), 'utf8');

  // Must not have :focus-within for .pc-qr-card .delete-pc-btn
  assert.ok(!buttonsCss.includes('.pc-qr-card:focus-within'), 'Must not have .pc-qr-card:focus-within in buttons.css');
  assert.ok(buttonsCss.includes('.pc-qr-card:focus-visible .delete-pc-btn'), 'Must use .pc-qr-card:focus-visible for delete button');
  assert.ok(buttonsCss.includes('.pc-qr-card:has(:focus-visible) .delete-pc-btn'), 'Must use :has(:focus-visible) for delete button');

  // High contrast delete button must be hidden by default
  assert.ok(buttonsCss.includes('html.high-contrast .delete-pc-btn') && buttonsCss.includes('opacity: 0'), 'High contrast delete button must have opacity: 0 by default');
  console.log('✓ buttons.css delete button focus and visibility rules verified!');

  console.log('\n=== 3. Validating qr-generator.print.js Focus Clearing ===');
  const printJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-qr-generator', 'qr-generator.print.js'), 'utf8');

  // Mock DOM elements
  let blurredCount = 0;
  const mockBtn = { blur: () => { blurredCount++; } };
  const mockCard = { blur: () => { blurredCount++; } };

  const mockWindow = {
    addEventListener: () => {},
    setTimeout: (fn) => fn(),
    requestAnimationFrame: (fn) => fn()
  };
  const mockDoc = {
    activeElement: mockBtn,
    querySelectorAll: (sel) => [mockCard, mockBtn]
  };

  const sandbox = {
    window: mockWindow,
    document: mockDoc,
    this: mockWindow,
    alert: () => {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ roomNumber: '204', pcNumber: '1', qrCode: 'data:image/png;base64,...' }) })
  };

  vm.runInNewContext(printJs, sandbox);
  const printModule = sandbox.window.qrGeneratorPrint || sandbox.qrGeneratorPrint;
  assert.ok(printModule, 'qrGeneratorPrint must be defined');
  assert.strictEqual(typeof printModule.clearCardFocus, 'function', 'clearCardFocus must be a function');
  assert.strictEqual(typeof printModule.scheduleClearCardFocus, 'function', 'scheduleClearCardFocus must be a function');

  // Test clearCardFocus
  blurredCount = 0;
  printModule.clearCardFocus();
  assert.ok(blurredCount >= 3, `Expected at least 3 blur calls, got ${blurredCount}`);
  console.log(`✓ clearCardFocus correctly blurred all active and matching elements (${blurredCount} calls)`);

  console.log('\n=== 4. Validating qr-generator.renderer.js Pointer Leave Handlers ===');
  const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-qr-generator', 'qr-generator.renderer.js'), 'utf8');
  assert.ok(rendererJs.includes('pointerleave'), 'Must register pointerleave handler to clear lingering card focus');
  assert.ok(rendererJs.includes('mouseleave'), 'Must register mouseleave handler to clear lingering card focus');
  assert.ok(rendererJs.includes('qrGeneratorPrint.clearCardFocus'), 'Must invoke clearCardFocus on generate QR click');
  console.log('✓ qr-generator.renderer.js includes pointerleave and click blur triggers!');

  console.log('\n========================================');
  console.log('ALL PC PRINT FOCUS TESTS PASSED! (4/4)');
  console.log('========================================');
}

runTests();
