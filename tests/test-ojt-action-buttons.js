const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('Testing OJT Table Action Buttons Styling (Light & Dark Mode)...');

const htmlPath = path.join(__dirname, '..', 'mis-ojt.html');
const rawHtml = fs.readFileSync(htmlPath, 'utf8');
const normHtml = rawHtml.replace(/\r\n/g, '\n');

// 1. Check base .btn-tbl-action styling
assert(normHtml.includes('.btn-tbl-action {'), 'Must include .btn-tbl-action definition');
assert(normHtml.includes('height: 32px;'), 'Must include height: 32px');
assert(normHtml.includes('border-radius: 8px;'), 'Must include border-radius: 8px');
assert(normHtml.includes('font-weight: 700;'), 'Must use bold 700 font-weight');
assert(normHtml.includes('border: 1.5px solid'), 'Must use crisp 1.5px border');
assert(normHtml.includes('box-shadow: 0 1px 2px'), 'Must include subtle box-shadow');

// 2. Check icon stroke and sizing
assert(normHtml.includes('.btn-tbl-action i,\n    .btn-tbl-action svg {'), 'Must target both i and svg icons');
assert(normHtml.includes('stroke-width: 2.2 !important;'), 'Icon must have crisp 2.2 stroke-width');
assert(normHtml.includes('width: 14px !important;'), 'Icon must have 14px width');

// 3. Check Light Mode Danger (Deactivate)
assert(normHtml.includes('.btn-tbl-action.danger {'), 'Must define .btn-tbl-action.danger');
assert(normHtml.includes('color: #991B1B !important;'), 'Must have deep, bold red-800 text (zero washed out)');
assert(normHtml.includes('border: 1.5px solid #F87171 !important;'), 'Must have crisp red-400 border');
assert(normHtml.includes('background: #FEF2F2 !important;'), 'Must have light rose-50 background');

// 4. Check Dark Mode Danger
assert(normHtml.includes('color: #FFFFFF !important;'), 'Dark mode danger must have pure white text for maximum readability');
assert(normHtml.includes('border: 1.5px solid #EF4444 !important;'), 'Dark mode danger must have crisp glowing crimson border');
assert(normHtml.includes('background: rgba(220, 38, 38, 0.25) !important;'), 'Dark mode danger must have rich ruby glass background');

// 5. Ensure NO prefers-color-scheme override pollutes light mode
assert(!normHtml.includes('@media (prefers-color-scheme: dark) {\n      :root:not(.light-mode)'), 'Must NOT have prefers-color-scheme rule polluting light mode');

// 6. Check Hover and Micro-interaction states
assert(normHtml.includes('transform: translateY(-1px);'), 'Must have elevation transform on hover');
assert(normHtml.includes('background: #DC2626 !important;'), 'Hover fills solid crimson button');

// 7. Check mis-ojt.js icon markup
const jsPath = path.join(__dirname, '..', 'js', 'pages', 'mis-ojt.js');
const jsCode = fs.readFileSync(jsPath, 'utf8');
assert(jsCode.includes('data-action="deactivate"'), 'mis-ojt.js must render deactivate button');
assert(jsCode.includes('user-x'), 'mis-ojt.js must render user-x icon');

console.log('✔ All OJT Table Action Button tests passed successfully!');
