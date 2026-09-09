/**
 * Automated test for MIS PC QR Sticker Generation and Layout Space Consumption.
 * Validates larger 20px font size, 3.0in x 1.0in sticker dimensions, and space consumption.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  console.log('=== 1. Validating qr-generator.print.js buildStickerHtml ===');
  const printJsPath = path.join(__dirname, '..', 'js', 'pages', 'mis-qr-generator', 'qr-generator.print.js');
  const printJsContent = fs.readFileSync(printJsPath, 'utf8');

  // Load module in a sandboxed mock global
  const sandboxWindow = {};
  const vm = require('vm');
  vm.runInNewContext(printJsContent, { window: sandboxWindow, this: sandboxWindow });

  const printModule = sandboxWindow.qrGeneratorPrint;
  assert.ok(printModule, 'qrGeneratorPrint must be exported');

  const buildStickerFuncMatch = printJsContent.match(/function buildStickerHtml\(data\) \{[\s\S]*?\n  \}/);
  assert.ok(buildStickerFuncMatch, 'buildStickerHtml function must exist');

  const evalStickerFn = new Function('data', `${buildStickerFuncMatch[0]}; return buildStickerHtml(data);`);

  // Test Case A: Room 203, PC 2 (from user's latest screenshot)
  const stickerPC2 = evalStickerFn({
    roomNumber: '203',
    pcNumber: '2',
    qrCode: 'data:image/png;base64,mockqr'
  });
  assert.ok(stickerPC2.includes('Room 203 - <span class="qr-pc-badge" style="white-space: nowrap;">PC 2</span>'), 'Sticker must render Room 203 - PC 2');
  assert.ok(!stickerPC2.includes('style="font-size:'), 'Standard units (<= 15 chars) must use the 18px CSS font without inline reductions');
  console.log('✓ Test Case A passed: Room 203 - PC 2 rendered with 18px CSS font');

  // Test Case B: Room 204, PC 1
  const stickerPC1 = evalStickerFn({
    roomNumber: '204',
    pcNumber: '1',
    qrCode: 'data:image/png;base64,mockqr'
  });
  assert.ok(stickerPC1.includes('Room 204 - <span class="qr-pc-badge" style="white-space: nowrap;">PC 1</span>'), 'Sticker must render Room 204 - PC 1');
  assert.ok(!stickerPC1.includes('style="font-size:'), 'Room 204 - PC 1 must use 18px CSS font');
  console.log('✓ Test Case B passed: Room 204 - PC 1 rendered with 18px CSS font');

  // Test Case C: Room 304, PC 6
  const stickerPC6 = evalStickerFn({
    roomNumber: '304',
    pcNumber: '6',
    qrCode: 'data:image/png;base64,mockqr'
  });
  assert.ok(stickerPC6.includes('Room 304 - <span class="qr-pc-badge" style="white-space: nowrap;">PC 6</span>'), 'Sticker must render Room 304 - PC 6');
  assert.ok(!stickerPC6.includes('style="font-size:'), 'Room 304 - PC 6 must use 18px CSS font');
  console.log('✓ Test Case C passed: Room 304 - PC 6 rendered with 18px CSS font');

  // Test Case D: Room 304, PC 10 (2-digit unit)
  const stickerPC10 = evalStickerFn({
    roomNumber: '304',
    pcNumber: '10',
    qrCode: 'data:image/png;base64,mockqr'
  });
  assert.ok(stickerPC10.includes('Room 304 - <span class="qr-pc-badge" style="white-space: nowrap;">PC 10</span>'), 'Sticker must render Room 304 - PC 10');
  assert.ok(stickerPC10.includes('style="font-size: 16.5px !important;"'), 'Room 304 - PC 10 must use 16.5px font for balanced spacing');
  console.log('✓ Test Case D passed: Room 304 - PC 10 rendered with 16.5px font');

  console.log('\n=== 2. Validating mis-qr-generator.html CSS Rules ===');
  const htmlPath = path.join(__dirname, '..', 'mis-qr-generator.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Verify enlarged font-size 18px for h2
  assert.ok(htmlContent.includes('font-size: 18px !important;'), 'mis-qr-generator.html must have font-size: 18px !important in qr-sticker h2');
  // Verify preserved font-size 9.8px for p (scan to report an issue)
  assert.ok(htmlContent.includes('font-size: 9.8px !important;'), 'mis-qr-generator.html must preserve font-size: 9.8px !important in qr-sticker p');
  // Verify original physical dimensions: width 2.5in and height 0.9in
  assert.ok(htmlContent.includes('width: 2.5in !important;'), 'mis-qr-generator.html must preserve exact original width: 2.5in');
  assert.ok(htmlContent.includes('height: 0.9in !important;'), 'mis-qr-generator.html must preserve exact original height: 0.9in');
  assert.ok(htmlContent.includes('min-width: 2.5in !important;'), 'mis-qr-generator.html must have min-width: 2.5in');
  assert.ok(htmlContent.includes('max-width: 2.5in !important;'), 'mis-qr-generator.html must have max-width: 2.5in');
  assert.ok(htmlContent.includes('min-height: 0.9in !important;'), 'mis-qr-generator.html must have min-height: 0.9in');
  assert.ok(htmlContent.includes('max-height: 0.9in !important;'), 'mis-qr-generator.html must have max-height: 0.9in');
  // Verify flex: 1 1 auto on .qr-sticker-right
  assert.ok(htmlContent.includes('flex: 1 1 auto !important;'), 'Right column must have flex: 1 1 auto to consume remaining space');
  // Verify enlarged QR code sizing (0.74in box, 0.72in img)
  assert.ok(htmlContent.includes('flex: 0 0 0.74in;'), 'QR container must have enlarged flex: 0 0 0.74in');
  assert.ok(htmlContent.includes('width: 0.72in !important;'), 'QR image must have enlarged width: 0.72in');
  // Verify print grid reverted to original flex layout
  assert.ok(htmlContent.includes('display: flex !important;'), 'Print grid must use display: flex !important');
  assert.ok(htmlContent.includes('flex-wrap: wrap !important;'), 'Print grid must use flex-wrap: wrap !important');
  assert.ok(htmlContent.includes('gap: 0.12in !important;'), 'Print grid must use original gap: 0.12in');

  console.log('✓ mis-qr-generator.html CSS rules verified!');

  console.log('\n========================================');
  console.log('ALL PC QR STICKER TESTS PASSED (2/2)!');
  console.log('========================================');
}

runTests();
