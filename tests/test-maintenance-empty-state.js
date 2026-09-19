/**
 * Automated test for MIS Maintenance Table Empty State.
 * Validates centered empty state rendering, icon, messaging, colspan,
 * Lucide icon instantiation, and dark/high-contrast mode styling.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function runTests() {
  console.log('=== 1. Validating tables.css Empty State Styles ===');
  const cssPath = path.join(__dirname, '..', 'css', 'components', 'tables.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(cssContent.includes('.maint-table-wrapper:has(.maintenance-empty-row)'), 'Must define .maint-table-wrapper:has(.maintenance-empty-row)');
  assert.ok(cssContent.includes('.maint-table:has(.maintenance-empty-row)'), 'Must define .maint-table:has(.maintenance-empty-row)');
  assert.ok(cssContent.includes('.maint-table tr.maintenance-empty-row td'), 'Must define .maint-table tr.maintenance-empty-row td');
  assert.ok(cssContent.includes('.maint-table td.maintenance-empty-cell'), 'Must define .maint-table td.maintenance-empty-cell');
  assert.ok(cssContent.includes('.maintenance-empty-state'), 'Must define .maintenance-empty-state');
  assert.ok(cssContent.includes('.maintenance-empty-icon-wrap'), 'Must define .maintenance-empty-icon-wrap');
  assert.ok(cssContent.includes('.maintenance-empty-text'), 'Must define .maintenance-empty-text');
  assert.ok(cssContent.includes('margin: auto !important;'), 'Must define margin auto on .maintenance-empty-state');

  // Dark mode & High contrast overrides
  assert.ok(cssContent.includes('html.dark-mode .maintenance-empty-icon-wrap'), 'Must define dark mode icon wrap');
  assert.ok(cssContent.includes('html.dark-mode .maintenance-empty-text'), 'Must define dark mode text');
  assert.ok(cssContent.includes('html.high-contrast .maintenance-empty-icon-wrap'), 'Must define high contrast icon wrap');
  assert.ok(cssContent.includes('html.high-contrast .maintenance-empty-text'), 'Must define high contrast text');

  console.log('✔ tables.css contains all required empty state and accessibility rules!');

  console.log('\n=== 2. Validating maintenance.renderer.js renderTableRows (Empty State) ===');
  const rendererPath = path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.renderer.js');
  const rendererContent = fs.readFileSync(rendererPath, 'utf8');

  let lucideCreatedRoot = null;
  const mockLucide = {
    createIcons: function(opts) {
      lucideCreatedRoot = opts && opts.root;
    }
  };
  const mockDOM = {
    lucide: mockLucide,
    document: {
      getElementById: function(id) {
        return null;
      },
      addEventListener: function() {},
      removeEventListener: function() {}
    },
    window: {
      lucide: mockLucide
    }
  };

  const sandbox = {
    ...mockDOM,
    console: console,
    Date: Date,
    Array: Array,
    String: String
  };
  vm.createContext(sandbox);
  vm.runInContext(rendererContent, sandbox);

  const maintenanceRenderer = sandbox.window.maintenanceRenderer || sandbox.maintenanceRenderer;
  assert.ok(maintenanceRenderer, 'maintenanceRenderer must be exported');
  assert.strictEqual(typeof maintenanceRenderer.renderTableRows, 'function', 'renderTableRows must be a function');

  // Test empty array and is-empty toggling
  const mockWrapperClasses = new Set();
  const mockTableClasses = new Set();
  const dummyWrapper = {
    classList: {
      add: (c) => mockWrapperClasses.add(c),
      remove: (c) => mockWrapperClasses.delete(c),
      contains: (c) => mockWrapperClasses.has(c)
    }
  };
  const dummyTable = {
    classList: {
      add: (c) => mockTableClasses.add(c),
      remove: (c) => mockTableClasses.delete(c),
      contains: (c) => mockTableClasses.has(c)
    }
  };

  const dummyTbody = {
    id: 'dynamicMaintenanceRows',
    innerHTML: '',
    _lastRenderSignature: null,
    closest: function(sel) {
      if (sel === '.maint-table-wrapper') return dummyWrapper;
      if (sel === '.maint-table') return dummyTable;
      return null;
    }
  };

  maintenanceRenderer.renderTableRows([], dummyTbody);

  assert.ok(mockWrapperClasses.has('is-empty'), 'Wrapper must have is-empty class');
  assert.ok(mockTableClasses.has('is-empty'), 'Table must have is-empty class');

  const html = dummyTbody.innerHTML;
  assert.ok(html.includes('class="maintenance-empty-row"'), 'Empty state must have maintenance-empty-row');
  assert.ok(html.includes('colspan="6"'), 'Empty state must span all 6 table columns');
  assert.ok(!html.includes('colspan="7"'), 'Must not have obsolete colspan="7"');
  assert.ok(html.includes('class="maintenance-empty-state"'), 'Must contain maintenance-empty-state container');
  assert.ok(html.includes('class="maintenance-empty-icon-wrap"'), 'Must contain maintenance-empty-icon-wrap');
  assert.ok(html.includes('data-lucide="clipboard-list"'), 'Must render clipboard-list icon');
  assert.ok(html.includes('class="maintenance-empty-text"'), 'Must contain maintenance-empty-text');
  assert.ok(html.includes('No maintenance tickets match the selected filter.'), 'Must display empty filter message');
  assert.strictEqual(lucideCreatedRoot, dummyTbody, 'lucide.createIcons must be called with tbody as root');

  // Verify that populated reports list removes is-empty class
  maintenanceRenderer.renderTableRows([{
    Report_ID: 999,
    Date_Reported: new Date().toISOString(),
    Room_Number: '301',
    PC_Number: '01',
    Issue_Description: '[Program & Section: BSIT-3A] [Issues: Hardware] Remarks: Test',
    Status: 'Pending'
  }], dummyTbody);

  assert.ok(!mockWrapperClasses.has('is-empty'), 'Populated list removes is-empty from wrapper');
  assert.ok(!mockTableClasses.has('is-empty'), 'Populated list removes is-empty from table');

  console.log('✔ Empty state rendered correctly with centered clipboard-list icon, 6-column span, and is-empty class toggling!');

  console.log('\n=== 3. Validating maintenance.renderer.js renderTableError ===');
  lucideCreatedRoot = null;
  dummyTbody.innerHTML = '';
  dummyTbody._lastRenderSignature = null;

  maintenanceRenderer.renderTableError('Custom error message', dummyTbody);
  const errorHtml = dummyTbody.innerHTML;
  assert.ok(errorHtml.includes('class="maintenance-empty-row maintenance-error-row"'), 'Error state has correct row class');
  assert.ok(errorHtml.includes('colspan="6"'), 'Error state spans all 6 columns');
  assert.ok(errorHtml.includes('data-lucide="alert-circle"'), 'Error state renders alert-circle icon');
  assert.ok(errorHtml.includes('Custom error message'), 'Error state shows custom message');
  assert.strictEqual(lucideCreatedRoot, dummyTbody, 'lucide.createIcons called on error state');

  console.log('✔ Error state rendered correctly with centered alert-circle icon!');

  console.log('\n======================================================');
  console.log('🎉 ALL MAINTENANCE EMPTY STATE TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================');
}

runTests();
