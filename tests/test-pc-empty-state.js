/**
 * Automated test for MIS QR Generator PC Grid Empty State.
 * Validates centered empty state rendering, icon, messaging, room label,
 * Add PC button callback, and dark/high-contrast mode styling.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function runTests() {
  console.log('=== 1. Validating qr-cards.css Empty State Styles ===');
  const cssPath = path.join(__dirname, '..', 'css', 'components', 'qr-cards.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  assert.ok(cssContent.includes('.pc-grid-empty-state'), 'Must define .pc-grid-empty-state');
  assert.ok(cssContent.includes('.pc-grid-container.is-empty'), 'Must define .pc-grid-container.is-empty');
  assert.ok(cssContent.includes('.pc-empty-icon-wrap'), 'Must define .pc-empty-icon-wrap');
  assert.ok(cssContent.includes('.pc-empty-title'), 'Must define .pc-empty-title');
  assert.ok(cssContent.includes('.pc-empty-desc'), 'Must define .pc-empty-desc');
  assert.ok(cssContent.includes('.pc-empty-add-btn'), 'Must define .pc-empty-add-btn');

  // Dark mode & High contrast overrides
  assert.ok(cssContent.includes('html.dark-mode .pc-empty-icon-wrap'), 'Must define dark mode icon wrap');
  assert.ok(cssContent.includes('html.dark-mode .pc-empty-title'), 'Must define dark mode title');
  assert.ok(cssContent.includes('html.dark-mode .pc-empty-desc'), 'Must define dark mode desc');
  assert.ok(cssContent.includes('html.dark-mode .pc-empty-add-btn'), 'Must define dark mode add button');
  assert.ok(cssContent.includes('html.high-contrast .pc-empty-icon-wrap'), 'Must define high contrast icon wrap');
  assert.ok(cssContent.includes('html.high-contrast .pc-empty-title'), 'Must define high contrast title');

  console.log('✓ qr-cards.css contains all required empty state and accessibility rules!');

  console.log('\n=== 2. Validating qr-generator.renderer.js renderPCGrid ===');
  const rendererPath = path.join(__dirname, '..', 'js', 'pages', 'mis-qr-generator', 'qr-generator.renderer.js');
  const rendererContent = fs.readFileSync(rendererPath, 'utf8');

  // Set up mock DOM environment
  const mockDOM = {};
  function createMockElement(id = '', tag = 'div') {
    const listeners = {};
    const classes = new Set();
    const attrs = {};
    return {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      getAttribute(k) { return attrs[k] || null; },
      setAttribute(k, v) { attrs[k] = String(v); },
      removeAttribute(k) { delete attrs[k]; },
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c)
      },
      addEventListener: (evt, handler) => {
        if (!listeners[evt]) listeners[evt] = [];
        listeners[evt].push(handler);
      },
      dispatchEvent: function(evt) {
        const handlers = listeners[evt.type] || [];
        handlers.forEach(h => h(evt));
      },
      _listeners: listeners,
      _children: [],
      appendChild: function(child) {
        child.parentElement = this;
        this._children.push(child);
      },
      querySelector: function(sel) {
        if (sel === '.pc-grid-empty-state' || sel === '.pc-empty-icon-wrap' || sel === '.pc-empty-title' || sel === '.pc-empty-desc' || sel === '.pc-empty-add-btn' || sel === '.pc-qr-card') {
          function search(node) {
            if (node.classList && node.classList.contains(sel.replace('.', ''))) return node;
            for (const ch of (node._children || [])) {
              const res = search(ch);
              if (res) return res;
            }
            return null;
          }
          return search(this);
        }
        return null;
      },
      querySelectorAll: function(sel) {
        const results = [];
        function search(node) {
          if (node.classList && node.classList.contains(sel.replace('.', ''))) results.push(node);
          for (const ch of (node._children || [])) {
            search(ch);
          }
        }
        search(this);
        return results;
      },
      closest: function(sel) {
        let cur = this;
        while (cur) {
          if (sel.startsWith('.') && cur.classList && cur.classList.contains(sel.replace('.', ''))) return cur;
          if (sel.includes('[data-action="header-add-pc"]') && cur.getAttribute('data-action') === 'header-add-pc') return cur;
          if (sel.includes('.pc-empty-add-btn') && cur.classList && cur.classList.contains('pc-empty-add-btn')) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      get className() { return Array.from(classes).join(' '); },
      set className(val) {
        classes.clear();
        (val || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
      },
      _html: '',
      get innerHTML() {
        if (this._children.length > 0) {
          return this._children.map(c => `<div class="${c.className}">${c.innerHTML}</div>`).join('');
        }
        return this._html;
      },
      set innerHTML(val) {
        this._html = val;
        this._children = [];
      },
      textContent: ''
    };
  }

  const gridElement = createMockElement('dynamicPCGrid', 'div');
  const unitBadgeElement = createMockElement('roomUnitCountBadge', 'span');
  const titleElement = createMockElement('selectedRoomTitle', 'h2');
  titleElement.textContent = 'Room 204';

  const sandbox = {
    document: {
      getElementById: (id) => {
        if (id === 'dynamicPCGrid') return gridElement;
        if (id === 'roomUnitCountBadge') return unitBadgeElement;
        if (id === 'selectedRoomTitle') return titleElement;
        return null;
      },
      createElement: (tag) => createMockElement('', tag)
    },
    lucide: {
      createIcons: () => {}
    },
    console: console
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;

  vm.runInNewContext(rendererContent, sandbox);
  const renderer = sandbox.qrGeneratorRenderer;
  assert.ok(renderer, 'qrGeneratorRenderer must be exported');
  assert.ok(typeof renderer.renderPCGrid === 'function', 'renderPCGrid function must exist');

  // Test 2a: Render PC Grid with 0 PCs
  renderer.renderPCGrid([], gridElement, {
    roomId: 5,
    roomNumber: '204'
  });

  assert.ok(gridElement.classList.contains('is-empty'), 'Grid element must have .is-empty class');
  assert.strictEqual(unitBadgeElement.textContent, '0 Units', 'Badge must show "0 Units"');
  assert.ok(gridElement.innerHTML.includes('pc-grid-empty-state'), 'HTML must contain pc-grid-empty-state');
  assert.ok(gridElement.innerHTML.includes('data-lucide="monitor-off"'), 'Empty state must use monitor-off icon');
  assert.ok(gridElement.innerHTML.includes('No PCs Registered'), 'Title must say "No PCs Registered"');
  assert.ok(gridElement.innerHTML.includes('Room 204'), 'Desc must reference "Room 204"');
  assert.ok(!gridElement.innerHTML.includes('pc-empty-add-btn'), 'Must NOT have Add PCs button below text');

  console.log('✓ Empty state rendered correctly with centered monitor-off icon, title, desc, and button removed!');
  // Test 2b: Render PC Grid with registered PCs (room populated)
  renderer.renderPCGrid([
    { PC_ID: 101, PC_Number: '1' },
    { PC_ID: 102, PC_Number: '2' }
  ], gridElement, {
    roomId: 5,
    roomNumber: '204'
  });

  assert.ok(!gridElement.classList.contains('is-empty'), 'Grid element must NOT have .is-empty class when PCs exist');
  assert.strictEqual(unitBadgeElement.textContent, '2 Units', 'Badge must show "2 Units"');
  assert.strictEqual(gridElement._children.length, 2, 'Must render 2 PC cards');
  assert.ok(!gridElement.innerHTML.includes('pc-grid-empty-state'), 'Must not render empty state when PCs exist');
  console.log('✓ Populated PC grid renders unit cards and clears is-empty class!');

  console.log('\n========================================');
  console.log('ALL PC EMPTY STATE TESTS PASSED SUCCESSFULLY! (2/2)');
  console.log('========================================\n');
}

runTests();
