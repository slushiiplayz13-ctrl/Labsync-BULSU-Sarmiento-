/**
 * Automated test for Key QR Print functionality and mis-keys.js modal logic.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 1. Verify backend generateKeyTag service
const keysService = require('../services/keysService');

async function runTests() {
  console.log('--- Testing Backend generateKeyTag Service ---');
  const tagResult = await keysService.generateKeyTag(1);
  assert.strictEqual(tagResult.status, 200, 'Expected status 200 from generateKeyTag');
  assert.ok(tagResult.data, 'Expected data object in tagResult');
  assert.strictEqual(tagResult.data.keyId, 1, 'Expected keyId to be 1');
  assert.ok(tagResult.data.qrCode, 'Expected qrCode data URL to exist');
  assert.ok(tagResult.data.qrCode.startsWith('data:image/png;base64,'), 'Expected valid base64 PNG QR code');
  assert.ok(tagResult.data.transferUrl.includes('/key-transfer.html?key='), 'Expected valid transferUrl');
  console.log('✓ Backend generateKeyTag returned valid QR code data URL (length: ' + tagResult.data.qrCode.length + ')');

  console.log('\n--- Testing Frontend mis-keys.js in DOM-like Environment ---');
  const misKeysScript = fs.readFileSync(path.join(__dirname, '../js/pages/mis-keys.js'), 'utf8');

  // Create mock DOM environment
  const elements = {};
  function createMockElement(id, tag = 'div') {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c, force) {
          if (force !== undefined) {
            if (force) this.classes.add(c);
            else this.classes.delete(c);
          } else {
            if (this.classes.has(c)) this.classes.delete(c);
            else this.classes.add(c);
          }
        }
      },
      innerHTML: '',
      textContent: '',
      disabled: false,
      removeAttribute(attr) {},
      setAttribute(attr, val) {},
      listeners: {},
      addEventListener(event, fn) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(fn);
      },
      dispatchEvent(event) {
        const fns = this.listeners[event.type] || [];
        fns.forEach(fn => fn(event));
      },
      click() {
        this.dispatchEvent({ type: 'click', target: this, stopPropagation: () => {} });
      }
    };
    elements[id] = el;
    return el;
  }

  // Setup required elements for mis-keys.js
  const printKeyModalOverlay = createMockElement('printKeyModalOverlay');
  const keyTagPreviewContainer = createMockElement('keyTagPreviewContainer');
  const printModalTitle = createMockElement('printModalTitle');
  const printModalSubtitle = createMockElement('printModalSubtitle');
  const btnExecutePrintText = createMockElement('btnExecutePrintText');
  const btnExecutePrintKeyTag = createMockElement('btnExecutePrintKeyTag', 'button');
  const btnClosePrintModal = createMockElement('btnClosePrintModal', 'button');
  const btnCancelPrintModal = createMockElement('btnCancelPrintModal', 'button');
  const btnZoom100 = createMockElement('btnZoom100', 'button');
  const btnZoom140 = createMockElement('btnZoom140', 'button');
  const printArea = createMockElement('printArea');
  const keysTableBody = createMockElement('keysTableBody');
  const selectAllKeysCheckbox = createMockElement('selectAllKeysCheckbox', 'input');
  selectAllKeysCheckbox.value = '';
  const keySearchInput = createMockElement('keySearchInput', 'input');
  keySearchInput.value = '';
  const btnBatchPrintSelected = createMockElement('btnBatchPrintSelected', 'button');
  const btnBatchPrintSelectedText = createMockElement('btnBatchPrintSelectedText');
  const btnBatchPrintSelectedBadge = createMockElement('btnBatchPrintSelectedBadge');
  const btnBatchPrintAll = createMockElement('btnBatchPrintAll', 'button');
  const btnBatchPrintAllText = createMockElement('btnBatchPrintAllText');
  const statTotalKeys = createMockElement('statTotalKeys');
  const statInDockKeys = createMockElement('statInDockKeys');
  const statInUseKeys = createMockElement('statInUseKeys');

  const documentListeners = {};
  const mockDocument = {
    getElementById(id) {
      return elements[id] || null;
    },
    querySelectorAll(selector) {
      return [];
    },
    addEventListener(event, fn) {
      if (!documentListeners[event]) documentListeners[event] = [];
      documentListeners[event].push(fn);
    }
  };

  let modalOpenStateReported = null;
  let printCalled = false;

  const windowListeners = {};
  const mockWindow = {
    document: mockDocument,
    setModalOpenState: (state) => {
      modalOpenStateReported = state;
    },
    print: () => {
      printCalled = true;
    },
    addEventListener(event, fn) {
      if (!windowListeners[event]) windowListeners[event] = [];
      windowListeners[event].push(fn);
    },
    removeEventListener(event, fn) {
      if (windowListeners[event]) {
        windowListeners[event] = windowListeners[event].filter(f => f !== fn);
      }
    },
    lucide: {
      createIcons: () => {}
    },
    keysService: {
      fetchKeys: async () => ({
        keys: [
          { Key_ID: 1, Key_Code: 'KEY-101', Room_Number: 'Lab 101', Building: 'IT Building', Room_Key_Status: 'Present' }
        ],
        summary: { total: 1, inDock: 1, inUse: 0 }
      }),
      fetchKeyTag: async (id) => {
        return (await keysService.generateKeyTag(id)).data;
      }
    }
  };

  // Execute mis-keys.js in mock environment
  const runScript = new Function('window', 'document', misKeysScript);
  assert.doesNotThrow(() => {
    runScript(mockWindow, mockDocument);
  }, 'mis-keys.js should execute without throwing errors');
  console.log('✓ mis-keys.js loaded successfully without ReferenceError');

  // Trigger DOMContentLoaded
  const domLoadedFns = documentListeners['DOMContentLoaded'] || [];
  for (const fn of domLoadedFns) {
    await fn();
  }
  console.log('✓ DOMContentLoaded initialized');

  // Verify modal elements are wired
  assert.strictEqual(typeof btnClosePrintModal.listeners['click'], 'object', 'Close button should have click listener');
  assert.strictEqual(typeof btnCancelPrintModal.listeners['click'], 'object', 'Cancel button should have click listener');
  assert.strictEqual(typeof btnExecutePrintKeyTag.listeners['click'], 'object', 'Execute print button should have click listener');

  // Test Print Tag single action
  const fakeEvent = {
    target: {
      closest: (sel) => {
        if (sel === '.key-action-btn') {
          return {
            dataset: {
              action: 'print-tag',
              id: '1'
            }
          };
        }
        return null;
      }
    }
  };

  const tableBodyClickListeners = keysTableBody.listeners['click'] || [];
  assert.ok(tableBodyClickListeners.length > 0, 'Table body should have click listener for action buttons');

  // Click print tag
  console.log('\n--- Simulating Print QR Tag Click ---');
  await tableBodyClickListeners[0](fakeEvent);

  // Check that modal opened
  assert.strictEqual(printKeyModalOverlay.style.display, 'flex', 'Modal overlay display should be flex');
  assert.strictEqual(modalOpenStateReported, true, 'setModalOpenState should have been called with true');
  assert.strictEqual(printModalTitle.textContent, 'Two-Sided Keychain Insert', 'Title should be Two-Sided Keychain Insert');
  assert.ok(keyTagPreviewContainer.innerHTML.includes('data:image/png;base64,'), 'Preview container should contain generated QR code');
  assert.ok(keyTagPreviewContainer.innerHTML.includes('SIDE 1 — FRONT'), 'Preview container should contain Side 1 Front');
  assert.ok(keyTagPreviewContainer.innerHTML.includes('SIDE 2 — BACK'), 'Preview container should contain Side 2 Back');
  assert.strictEqual(keyTagPreviewContainer.innerHTML.includes('keychain-pair-header'), false, 'Pair header should not be rendered');
  assert.strictEqual(btnExecutePrintKeyTag.disabled, false, 'Print button should be enabled after tag generation');
  console.log('✓ Print modal rendered 2-sided keychain insert with QR code successfully');

  // Test executing print
  console.log('\n--- Simulating Execute Print Button Click ---');
  btnExecutePrintKeyTag.click();
  assert.ok(printArea.innerHTML.includes('key-tag-print-container'), 'printArea should contain printable tags');

  // Wait for print timeout
  await new Promise(r => setTimeout(r, 200));
  assert.strictEqual(printCalled, true, 'window.print() should have been called');
  console.log('✓ window.print() called with printArea populated');

  // Simulate afterprint
  const afterprintFns = windowListeners['afterprint'] || [];
  if (afterprintFns.length > 0) {
    afterprintFns[0]();
    assert.strictEqual(printArea.innerHTML, '', 'printArea should be cleaned up after printing');
    console.log('✓ printArea cleaned up cleanly after print');
  }

  // Test Close Modal
  console.log('\n--- Simulating Close Modal Click ---');
  btnClosePrintModal.click();
  assert.strictEqual(printKeyModalOverlay.style.display, 'none', 'Modal should be hidden');
  assert.strictEqual(modalOpenStateReported, false, 'setModalOpenState should be called with false');
  console.log('✓ Modal closed successfully');

  console.log('\nALL TESTS PASSED SUCCESSFULLY! 🎉');
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
