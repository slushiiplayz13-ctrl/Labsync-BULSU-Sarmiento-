'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Verify syntax of all modified files
console.log('================================================================');
console.log('🧪 VERIFYING SCHEDULE EDITOR UI & INITIALIZATION RESTORATION');
console.log('================================================================\n');

// 1. Static Syntax & Code Export Checks
console.log('--- 1. JavaScript File Parsing & Integrity ---');

async function run() {
const filesToTest = [
    'js/scheduling/persistence/schedule.persistence.js',
    'js/scheduling/controller/schedule-editor.controller.js',
    'js/services/schedule.service.js',
    'controllers/schedules.controller.js',
    'services/scheduleService.js'
];

for (const f of filesToTest) {
    const fullPath = path.resolve(__dirname, '..', f);
    assert.doesNotThrow(() => {
        require('child_process').execSync(`node -c "${fullPath}"`);
    }, `File ${f} must parse without syntax errors`);
    console.log(`✔ PASS: ${f} parses cleanly with 0 syntax errors`);
}

// 2. Schedule Persistence Layer Exports & Logic Simulation
console.log('\n--- 2. Schedule Persistence Exports & Global Attachment ---');

// Setup mock window/DOM environment
class MockClassList {
    constructor() { this.classes = new Set(); }
    add(...cls) { cls.forEach(c => this.classes.add(c)); }
    remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
    contains(cls) { return this.classes.has(cls); }
}

class MockElement {
    constructor(tag, id = '') {
        this.tagName = tag.toUpperCase();
        this.id = id;
        this.className = '';
        this.classList = new MockClassList();
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.innerHTML = '';
        this.textContent = '';
        this.value = '';
        this.attributes = {};
    }
    setAttribute(name, val) { this.attributes[name] = val; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; }
    appendChild(child) { this.children.push(child); }
    querySelector(selector) {
        if (selector === '.status-dot') return new MockElement('span');
        if (selector === '.custom-select-trigger span') return new MockElement('span');
        if (selector === '.custom-select-dropdown') return new MockElement('div');
        return null;
    }
    querySelectorAll(selector) {
        return [];
    }
}

const mockDocument = {
    body: new MockElement('body'),
    elements: {},
    getElementById(id) {
        if (!this.elements[id]) {
            this.elements[id] = new MockElement('div', id);
        }
        return this.elements[id];
    },
    querySelector(sel) {
        if (sel === '.editor-create-form-section') return new MockElement('div');
        if (sel === '.available-blocks-section') return new MockElement('div');
        return null;
    },
    querySelectorAll(sel) {
        return [];
    },
    createElement(tag) {
        return new MockElement(tag);
    }
};

const mockWindow = {
    document: mockDocument,
    sessionStorage: {
        store: {},
        getItem(k) { return this.store[k] || null; },
        setItem(k, v) { this.store[k] = String(v); },
        clear() { this.store = {}; }
    },
    localStorage: {
        store: {},
        getItem(k) { return this.store[k] || null; },
        setItem(k, v) { this.store[k] = String(v); },
        clear() { this.store = {}; }
    },
    addEventListener() {},
    innerWidth: 1200
};

// Load schedule.persistence.js in this sandbox
const persistenceCode = fs.readFileSync(path.resolve(__dirname, '../js/scheduling/persistence/schedule.persistence.js'), 'utf8');

const sandbox = {
    window: mockWindow,
    document: mockDocument,
    sessionStorage: mockWindow.sessionStorage,
    localStorage: mockWindow.localStorage,
    navigator: { sendBeacon: null },
    console: console,
    Blob: class {},
    fetch: async () => ({ ok: true, json: async () => [] }),
    setTimeout: () => 1,
    clearTimeout: () => {}
};

// Execute IIFE
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(persistenceCode, sandbox);

const schedulePersistence = mockWindow.schedulePersistence || sandbox.schedulePersistence;
assert.ok(schedulePersistence, 'schedulePersistence must be exported');
assert.strictEqual(typeof schedulePersistence.saveCurrentSchedule, 'function');
assert.strictEqual(typeof schedulePersistence.finalizeCurrentSchedule, 'function');
assert.strictEqual(typeof schedulePersistence.getCurrentScheduleData, 'function');
assert.strictEqual(typeof schedulePersistence.loadProfessors, 'function');
assert.strictEqual(typeof schedulePersistence.loadCurriculumSubjects, 'function');
assert.strictEqual(typeof schedulePersistence.updateStatusUI, 'function');
console.log('✔ PASS: schedulePersistence successfully attaches all required methods to global');

// 3. UI Update Status Tests (Finalize Button Visibility)
console.log('\n--- 3. Finalize Button Visibility & Role Authorization ---');

// 3a. IT Dept Head in Draft mode with active lock -> Finalize button visible
mockWindow.sessionStorage.setItem('labsync_user', JSON.stringify({ role: 'IT Dept. Head', name: 'IT Head User' }));
schedulePersistence.setEditSessionToken('valid_lock_token');
const finalizeBtn = mockDocument.getElementById('finalize-schedule-btn');
const reopenBtn = mockDocument.getElementById('reopen-schedule-btn');

schedulePersistence.updateStatusUI('Draft', 1);
assert.strictEqual(finalizeBtn.style.display, 'inline-flex', 'Finalize button must be inline-flex for IT Dept Head in Draft status');
assert.strictEqual(reopenBtn.style.display, 'none', 'Reopen button must be none in Draft status');
assert.strictEqual(mockDocument.body.classList.contains('view-mode'), false, 'Body must NOT have view-mode in Draft status');
console.log('✔ PASS: Finalize Official Schedule button is VISIBLE (inline-flex) for IT Dept. Head on Draft schedule');

// 3b. IT Dept Head in Finalized mode -> Reopen visible, Finalize hidden
schedulePersistence.updateStatusUI('Finalized', 1);
assert.strictEqual(finalizeBtn.style.display, 'none', 'Finalize button must be none in Finalized status');
assert.strictEqual(reopenBtn.style.display, 'inline-flex', 'Reopen button must be inline-flex for IT Dept Head in Finalized status');
assert.strictEqual(mockDocument.body.classList.contains('view-mode'), true, 'Body must have view-mode in Finalized status');
console.log('✔ PASS: Finalize button is hidden and Reopen button is visible in Finalized status');

// 3c. Program Coordinator in Draft mode -> Finalize button hidden
mockWindow.sessionStorage.setItem('labsync_user', JSON.stringify({ role: 'Program Coordinator', name: 'PC User' }));
schedulePersistence.updateStatusUI('Draft', 1);
assert.strictEqual(finalizeBtn.style.display, 'none', 'Finalize button must be none for Program Coordinator');
assert.strictEqual(reopenBtn.style.display, 'none', 'Reopen button must be none for Program Coordinator');
console.log('✔ PASS: Program Coordinator CANNOT see Finalize or Reopen buttons (display: none)');

// 4. Professor & Curriculum Subject Loading Simulation
console.log('\n--- 4. Subject and Professor Selection Fields & Option Population ---');
const profWrapper = mockDocument.getElementById('professor-wrapper');
const profDropdown = new MockElement('div');
profWrapper.querySelector = (sel) => {
    if (sel === '.custom-select-dropdown') return profDropdown;
    if (sel === '.custom-select-trigger span') return new MockElement('span');
    return null;
};

// Mock fetch to return sample professors
sandbox.fetch = async (url) => {
    if (url === '/api/faculty') {
        return {
            ok: true,
            json: async () => [
                { User_ID: 10, Name: 'Engr. John Doe' },
                { User_ID: 11, Name: 'Prof. Jane Smith' }
            ]
        };
    }
    if (url === '/api/curriculum') {
        return {
            ok: true,
            json: async () => [
                { Subject_Code: 'IT 101', Subject_Name: 'Intro to Computing' },
                { Subject_Code: 'IT 102', Subject_Name: 'Computer Programming 1' }
            ]
        };
    }
    return { ok: false, json: async () => [] };
};

// Call loadProfessors
await schedulePersistence.loadProfessors();
assert.strictEqual(profDropdown.children.length, 2, 'Professor dropdown must have 2 options');
assert.strictEqual(profDropdown.children[0].dataset.value, 'Engr. John Doe');
assert.strictEqual(profDropdown.children[1].dataset.value, 'Prof. Jane Smith');
console.log('✔ PASS: Professor selector loads options correctly from API');

// Call loadCurriculumSubjects
const subjDropdown = mockDocument.getElementById('subject-select-dropdown');
await schedulePersistence.loadCurriculumSubjects();
assert.strictEqual(subjDropdown.children.length, 2, 'Curriculum dropdown must have 2 options');
assert.strictEqual(subjDropdown.children[0].dataset.value, 'IT 101 - Intro to Computing');
assert.strictEqual(subjDropdown.children[1].dataset.value, 'IT 102 - Computer Programming 1');
console.log('✔ PASS: Subject selector loads options correctly from curriculum API');

console.log('\n================================================================');
console.log('🎉 ALL UI RESTORATION & INTEGRATION VERIFICATION CHECKS PASSED!');
console.log('================================================================\n');

process.exit(0);
}

run().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
