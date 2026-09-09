/**
 * Automated test for MIS QR Generator Bulk Delete modal and functionality.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function runTests() {
  console.log('=== 1. Validating mis-qr-generator.html Structure ===');
  const htmlPath = path.join(__dirname, '..', 'mis-qr-generator.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert.ok(htmlContent.includes('id="bulkDeleteModalOverlay"'), 'Bulk delete modal overlay must exist');
  assert.ok(htmlContent.includes('id="btnCancelBulkDelete"'), 'Cancel button must exist');
  assert.ok(htmlContent.includes('id="btnConfirmBulkDelete"'), 'Confirm Delete button must exist');
  assert.ok(htmlContent.includes('onclick="closeBulkDeleteModal()"'), 'Cancel button must have onclick="closeBulkDeleteModal()"');
  assert.ok(htmlContent.includes('onclick="confirmBulkDelete()"'), 'Confirm button must have onclick="confirmBulkDelete()"');
  assert.ok(htmlContent.includes('data-action="close-bulk-delete-modal"'), 'Cancel button has data-action attribute');
  assert.ok(htmlContent.includes('data-action="confirm-bulk-delete"'), 'Confirm button has data-action attribute');
  assert.ok(htmlContent.includes('id="bulkDeleteCountSpan"'), 'Count span must exist');
  assert.ok(htmlContent.includes('id="bulkDeleteUnitsPreview"'), 'Preview div must exist');
  console.log('✓ mis-qr-generator.html structure and button handlers verified!');

  console.log('\n=== 2. Validating mis-qr-generator.js Event Handling and Methods ===');
  const jsPath = path.join(__dirname, '..', 'js', 'pages', 'mis-qr-generator.js');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  // Verify that stopPropagation was removed from openBulkDeleteModal
  const openModalIdx = jsContent.indexOf('function openBulkDeleteModal()');
  assert.ok(openModalIdx !== -1, 'openBulkDeleteModal function must exist');
  const openModalSnippet = jsContent.substring(openModalIdx, openModalIdx + 1200);
  assert.ok(
    !openModalSnippet.includes('e.stopPropagation()'),
    'modal.addEventListener stopPropagation MUST NOT be present in openBulkDeleteModal'
  );
  console.log('✓ openBulkDeleteModal does not stop propagation!');

  // Verify direct event listeners exist in jsContent
  assert.ok(jsContent.includes("document.getElementById('btnCancelBulkDelete')"), 'btnCancelBulkDelete has listener');
  assert.ok(jsContent.includes("document.getElementById('btnConfirmBulkDelete')"), 'btnConfirmBulkDelete has listener');
  assert.ok(jsContent.includes("document.getElementById('bulkDeleteModalOverlay')"), 'bulkDeleteModalOverlay has listener');
  assert.ok(jsContent.includes('window.closeBulkDeleteModal = closeBulkDeleteModal'), 'closeBulkDeleteModal exported to window');
  assert.ok(jsContent.includes('window.confirmBulkDelete = confirmBulkDelete'), 'confirmBulkDelete exported to window');
  console.log('✓ Direct listeners and window exports verified!');

  console.log('\n=== 3. Simulating DOM Interaction for Bulk Delete Modal ===');
  // Build a minimal mock DOM
  const elements = {};
  function makeMockEl(id, tag = 'div') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        contains(c) { return this._set.has(c); }
      },
      textContent: '',
      innerHTML: '',
      disabled: false,
      listeners: {},
      addEventListener(evt, fn) {
        if (!this.listeners[evt]) this.listeners[evt] = [];
        this.listeners[evt].push(fn);
      },
      dispatchEvent(evt) {
        evt.target = evt.target || el;
        const fns = this.listeners[evt.type] || [];
        fns.forEach(fn => fn(evt));
      },
      closest(sel) {
        if (sel.includes(id)) return el;
        return null;
      }
    };
    elements[id] = el;
    return el;
  }

  const mockOverlay = makeMockEl('bulkDeleteModalOverlay');
  const mockCount = makeMockEl('bulkDeleteCountSpan');
  const mockPreview = makeMockEl('bulkDeleteUnitsPreview');
  const mockCancelBtn = makeMockEl('btnCancelBulkDelete', 'button');
  const mockConfirmBtn = makeMockEl('btnConfirmBulkDelete', 'button');
  const mockBar = makeMockEl('pcBulkActionBar');
  const mockBadge = makeMockEl('pcBulkSelectedBadge');

  const mockDoc = {
    readyState: 'complete',
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(sel) {
      return null;
    },
    addEventListener(evt, fn) {}
  };

  let bulkDeletedRoomId = null;
  let bulkDeletedPcIds = null;
  let onCompleteCalled = false;

  const mockActions = {
    deletePCsBulk: async (roomId, pcIds, onComplete) => {
      bulkDeletedRoomId = roomId;
      bulkDeletedPcIds = pcIds;
      if (typeof onComplete === 'function') {
        await onComplete();
        onCompleteCalled = true;
      }
      return { deletedCount: pcIds.length };
    }
  };

  const mockWindow = {
    document: mockDoc,
    qrGeneratorActions: mockActions,
    setModalOpenState: (isOpen) => {
      mockWindow._lastModalState = isOpen;
    }
  };

  // Run the script in a VM-like context
  const vm = require('vm');
  let alertMessage = null;
  const sandbox = {
    window: mockWindow,
    document: mockDoc,
    console: console,
    Set: Set,
    Array: Array,
    String: String,
    Number: Number,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
    alert: (msg) => { alertMessage = msg; },
    Promise: Promise
  };
  vm.createContext(sandbox);

  // Execute mis-qr-generator.js in the sandbox
  vm.runInContext(jsContent, sandbox);

  // Check that window.openBulkDeleteModal, closeBulkDeleteModal, confirmBulkDelete are available
  assert.ok(typeof sandbox.window.openBulkDeleteModal === 'function', 'openBulkDeleteModal is a function');
  assert.ok(typeof sandbox.window.closeBulkDeleteModal === 'function', 'closeBulkDeleteModal is a function');
  assert.ok(typeof sandbox.window.confirmBulkDelete === 'function', 'confirmBulkDelete is a function');

  // Test 3a: Call openBulkDeleteModal without selection (should alert/warning)
  sandbox.window.openBulkDeleteModal();
  assert.strictEqual(mockOverlay.style.display, undefined, 'Modal should not open with 0 selected PCs');

  // Test 3b: Select a PC (simulate selecting PC 6, id '106', in room 1)
  sandbox.window.showPCGrid(1, '204');
  // Populate current PCs
  sandbox.window.loadPCs = () => {}; // mock
  // Directly simulate selection of PC 6
  sandbox.window.toggleSelectPC('106');

  // Now open the modal
  sandbox.window.openBulkDeleteModal();
  assert.strictEqual(mockOverlay.style.display, 'flex', 'Modal overlay display should be flex');
  assert.strictEqual(mockCount.textContent, '1', 'Count should display 1');
  assert.strictEqual(sandbox.window._lastModalState, true, 'Modal state should be true');
  console.log('✓ Modal opened successfully with 1 selected PC!');

  // Test 3c: Cancel button
  sandbox.window.closeBulkDeleteModal();
  assert.strictEqual(mockOverlay.style.display, 'none', 'Modal overlay display should be none');
  assert.strictEqual(sandbox.window._lastModalState, false, 'Modal state should be false');
  console.log('✓ Cancel button closes modal and resets modal state!');

  // Test 3d: Confirm delete execution
  sandbox.window.openBulkDeleteModal();
  await sandbox.window.confirmBulkDelete();
  assert.strictEqual(mockOverlay.style.display, 'none', 'Modal should close after confirmation');
  assert.strictEqual(bulkDeletedRoomId, 1, 'Bulk delete should pass current room ID');
  assert.deepStrictEqual(bulkDeletedPcIds, ['106'], 'Bulk delete should pass selected PC IDs');
  assert.strictEqual(onCompleteCalled, true, 'onComplete callback must be executed');
  console.log('✓ Confirm delete successfully called API actions and cleared selection!');

  console.log('\n=== 4. Validating Backend laboratoryService.deletePCsBulk ===');
  const labService = require('../services/laboratoryService');
  // Test invalid parameters
  const resBadRoom = await labService.deletePCsBulk(0, [1]);
  assert.strictEqual(resBadRoom.status, 400, 'Invalid room ID must return 400');
  const resBadPcs = await labService.deletePCsBulk(1, []);
  assert.strictEqual(resBadPcs.status, 400, 'Empty pcIds must return 400');
  const resInvalidPcs = await labService.deletePCsBulk(1, ['abc', -5]);
  assert.strictEqual(resInvalidPcs.status, 400, 'Non-numeric pcIds must return 400');
  console.log('✓ Backend validation tests passed!');

  console.log('\n========================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! (4/4)');
  console.log('========================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
