const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Key Management Toolbar Layout & Spacing...');

const keysHtmlPath = path.join(__dirname, '..', 'mis-keys.html');
const keysHtml = fs.readFileSync(keysHtmlPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Verify flex: none and height: auto on .search-box-header in mobile media queries
assert(
  keysHtml.includes('.search-box-header {\n        width: 100% !important;\n        max-width: 100% !important;\n        flex: none !important;\n        height: auto !important;'),
  '.search-box-header must have flex: none !important and height: auto !important on mobile'
);
console.log('✔ Verified: No 200px vertical flex-basis expanding search-box-header on mobile');

// 2. Verify batch print buttons container exists
assert(
  keysHtml.includes('<div class="keys-batch-actions">'),
  'mis-keys.html must contain .keys-batch-actions container wrapping both batch print buttons'
);
console.log('✔ Verified: .keys-batch-actions container present');

// 3. Verify side-by-side equal width distribution on mobile
assert(
  keysHtml.includes('.keys-batch-actions .btn-batch-print {\n        flex: 1 1 0 !important;\n        min-width: 0 !important;\n        width: 50% !important;'),
  'Batch print buttons must share the row equally (width: 50%, flex: 1 1 0) on mobile'
);
console.log('✔ Verified: Print Selected and Print All sit side-by-side on mobile');

// 4. Verify search is above batch actions (order: 1 for search, order: 2 for batch actions)
assert(
  keysHtml.includes('order: 1;') && keysHtml.includes('order: 2;'),
  'Search box should have order: 1 and batch actions order: 2 on mobile'
);
console.log('✔ Verified: Responsive order properly structured');

// 5. Verify 3-column grid for filter tabs
assert(
  keysHtml.includes('.keys-filter-group {\n        display: grid;\n        grid-template-columns: repeat(3, 1fr);'),
  '.keys-filter-group must use 3-column grid on mobile'
);
console.log('✔ Verified: Filter tabs use 3-column grid on mobile');

console.log('ALL KEY MANAGEMENT TOOLBAR LAYOUT TESTS PASSED! 🎉');
