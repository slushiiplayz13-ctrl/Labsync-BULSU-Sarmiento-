const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing Ticket Details Modal (Close button, X button removal, Layout)...');

const modalJsPath = path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.modal.js');
const modalJsContent = fs.readFileSync(modalJsPath, 'utf8').replace(/\r\n/g, '\n');

const maintHtmlPath = path.join(__dirname, '..', 'mis-maintenance.html');
const maintHtmlContent = fs.readFileSync(maintHtmlPath, 'utf8').replace(/\r\n/g, '\n');

const modalsCssPath = path.join(__dirname, '..', 'css', 'components', 'modals.css');
const modalsCssContent = fs.readFileSync(modalsCssPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Verify X button is REMOVED from the modal header
assert(
  !modalJsContent.includes('<i data-lucide="x" style="width:20px;height:20px;"></i>'),
  'X button with lucide x icon should be removed from the modal header'
);
assert(
  !modalJsContent.includes('<button type="button" data-action="close-modal" style="background:none; border:none;'),
  'Old header close button should not exist'
);
console.log('✔ Verified: X button removed from modal header');

// 2. Verify Close button exists in footer
assert(
  modalJsContent.includes('<button type="button" class="btn-ticket-modal-close" data-action="close-modal">Close</button>'),
  'Footer must have the Close button with data-action="close-modal"'
);
console.log('✔ Verified: Close button is present in modal footer');

// 3. Verify direct modal click listener handles close-modal, backdrop, and resolve
assert(
  modalJsContent.includes('const closeBtn = e.target.closest(\'[data-action="close-modal"], .btn-ticket-modal-close\');'),
  'Modal must have direct click handler for close-modal button'
);
assert(
  modalJsContent.includes('if (e.target === modal) {'),
  'Modal must close on backdrop click'
);
assert(
  modalJsContent.includes('e.key === \'Escape\''),
  'Escape key must close modal'
);
console.log('✔ Verified: Modal handles Close button, backdrop click, and Escape key');

// 4. Verify PC number wrapping fix (nowrap)
assert(
  modalJsContent.includes('<span style="white-space:nowrap;">PC #${escapeText(String(report.PC_Number || \'N/A\'))}</span>'),
  'PC number must have white-space:nowrap to prevent #1 from wrapping to new line'
);
console.log('✔ Verified: PC number has white-space: nowrap applied');

// 5. Verify Student remarks icon alignment (flex-start)
assert(
  modalJsContent.includes('.ticket-modal-remarks-box') || modalJsContent.includes('class="ticket-modal-remarks-box"'),
  'Remarks box uses dedicated class'
);
assert(
  maintHtmlContent.includes('.ticket-modal-remarks-box {\n      display: flex;\n      align-items: flex-start;'),
  'Remarks box must have align-items: flex-start'
);
console.log('✔ Verified: Remarks box aligns icon to top-left');

// 6. Verify dark mode / high contrast rules in HTML and CSS
assert(
  maintHtmlContent.includes('html.high-contrast .ticket-modal-meta-card') &&
  maintHtmlContent.includes('html.high-contrast .btn-ticket-modal-close'),
  'mis-maintenance.html must contain dark/high-contrast styling for ticket modal'
);
assert(
  modalsCssContent.includes('html.high-contrast .ticket-modal-meta-card') &&
  modalsCssContent.includes('html.high-contrast .btn-ticket-modal-close'),
  'modals.css must contain dark/high-contrast styling for ticket modal'
);
console.log('✔ Verified: Dark mode & High contrast styles synchronized in HTML and modals.css');

console.log('All Ticket Details Modal tests passed! 🎉');
