'use strict';

/**
 * tests/test-room-status-offline.js
 * Verification for LabSync Room Status card:
 * 1. 'Offline' appears only once as the primary status badge for offline rooms.
 * 2. 'Claimed By' displays 'N/A' when offline.
 * 3. Footer shows 'PC Issues' (not 'PC Status') with 'monitor' icon (not 'radio'/wifi).
 * 4. Shows 'None' when there are no issues on the PC.
 * 5. Shows '${totalPcIssues} PC Issues' with View button when issues exist.
 */

const fs = require('fs');
const path = require('path');

const jsCode = fs.readFileSync(path.join(__dirname, '../js/services/laboratory.service.js'), 'utf8');

function createMockContainer() {
    let html = '';
    return {
        set innerHTML(val) { html = val; },
        get innerHTML() { return html; },
        querySelector: () => null,
        querySelectorAll: () => []
    };
}

// Emulate browser environment
const window = { location: { pathname: '/room-status.html' } };
const document = {};
eval(jsCode);

console.log('================================================================');
console.log('🧪 Testing Room Status Card Display & PC Issues Refinements');
console.log('================================================================\n');

const testRooms = [
    {
        Room_ID: 101,
        Room_Number: '203',
        Building: 'Bldg. E',
        Current_Status: 'Available',
        deviceOnline: false,
        Key_Status: 'Present',
        Current_Key_Holder: null,
        total_pc_issues: 0
    },
    {
        Room_ID: 102,
        Room_Number: '204',
        Building: 'Bldg. E',
        Current_Status: 'Available',
        deviceOnline: true,
        Key_Status: 'Present',
        Current_Key_Holder: null,
        total_pc_issues: 0
    },
    {
        Room_ID: 103,
        Room_Number: '205',
        Building: 'Bldg. E',
        Current_Status: 'Borrowed',
        deviceOnline: true,
        Key_Status: 'Absent',
        Current_Key_Holder: 'Prof. Juan Dela Cruz',
        total_pc_issues: 0
    },
    {
        Room_ID: 104,
        Room_Number: '206',
        Building: 'Bldg. E',
        Current_Status: 'Available',
        deviceOnline: false,
        Key_Status: 'Present',
        Current_Key_Holder: null,
        total_pc_issues: 2
    }
];

const container = createMockContainer();
window.laboratoryService.renderLabCards(testRooms, container);

const rendered = container.innerHTML;
const cards = rendered.split(/(?=<div class="lab-card\s)/).filter(s => s.trim().length > 0);

let allPassed = true;

// Helper to extract visible text between HTML tags
function extractVisibleText(html) {
    return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
               .replace(/<[^>]+>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
}

// Test 1: Offline Room without PC issues (RM 203)
console.log('--- Test 1: Offline Room without PC issues (RM 203) ---');
const rm203 = cards[0];
const visibleText203 = extractVisibleText(rm203);
const offlineTextMatches203 = visibleText203.match(/Offline/gi) || [];
console.log(`Visible text in RM 203 card: "${visibleText203}"`);

// 1a. Exactly 1 "Offline"
if (offlineTextMatches203.length === 1) {
    console.log('✓ PASS: "Offline" appears EXACTLY ONCE (primary status badge).');
} else {
    console.error(`✗ FAIL: Expected 1 occurrence of visible "Offline", found ${offlineTextMatches203.length}.`);
    allPassed = false;
}

// 1b. Claimed By shows N/A
if (visibleText203.includes('Claimed By N/A')) {
    console.log('✓ PASS: "Claimed By" displays "N/A" for offline room.');
} else {
    console.error('✗ FAIL: Expected "Claimed By N/A" not found.');
    allPassed = false;
}

// 1c. PC Issues label and "None" status
if (visibleText203.includes('PC Issues None')) {
    console.log('✓ PASS: "PC Issues" label used and status is "None".');
} else {
    console.error('✗ FAIL: Expected "PC Issues None" not found.');
    allPassed = false;
}

// 1d. Icon is monitor, not radio
if (rm203.includes('data-lucide="monitor"') && !rm203.includes('data-lucide="radio"')) {
    console.log('✓ PASS: Workstation icon "monitor" is used instead of wifi-like "radio".');
} else {
    console.error('✗ FAIL: Expected "monitor" icon without "radio" icon.');
    allPassed = false;
}

// Test 2: Normal Online Available Room without issues (RM 204)
console.log('\n--- Test 2: Normal Online Available Room (RM 204) ---');
const rm204 = cards[1];
const visibleText204 = extractVisibleText(rm204);
if (!visibleText204.includes('Offline') && visibleText204.includes('Available') && visibleText204.includes('PC Issues None')) {
    console.log('✓ PASS: Online room displays Available, PC Issues: None.');
} else {
    console.error('✗ FAIL: Online room display has unexpected values:', visibleText204);
    allPassed = false;
}

// Test 3: Online Borrowed Room with Key Holder (RM 205)
console.log('\n--- Test 3: Online Borrowed Room (RM 205) ---');
const rm205 = cards[2];
const visibleText205 = extractVisibleText(rm205);
if (visibleText205.includes('Borrowed') && visibleText205.includes('Juan Dela Cruz') && visibleText205.includes('PC Issues None')) {
    console.log('✓ PASS: Borrowed room displays key holder name and PC Issues: None.');
} else {
    console.error('✗ FAIL: Borrowed room display has unexpected values:', visibleText205);
    allPassed = false;
}

// Test 4: Room with Reported PC Issues (RM 206)
console.log('\n--- Test 4: Room with Pre-existing PC Issues (RM 206) ---');
const rm206 = cards[3];
const visibleText206 = extractVisibleText(rm206);
if (visibleText206.includes('2 PC Issues') && rm206.includes('btn-health-view') && rm206.includes('data-lucide="alert-triangle"')) {
    console.log('✓ PASS: Room with issues displays "2 PC Issues" and View button with alert-triangle icon.');
} else {
    console.error('✗ FAIL: Room with PC issues unexpected rendering:', visibleText206);
    allPassed = false;
}

// Test 5: Dashboard context simulation
console.log('\n--- Test 5: Dashboard Shared Rendering Context ---');
window.location.pathname = '/index.html';
const dashContainer = createMockContainer();
window.laboratoryService.renderLabCards(testRooms, dashContainer);
const dashCards = dashContainer.innerHTML.split(/(?=<div class="lab-card\s)/).filter(s => s.trim().length > 0);
const dashVisibleText = extractVisibleText(dashCards[0]);
if (dashVisibleText.includes('Offline') && (dashVisibleText.match(/Offline/gi) || []).length === 1 && dashVisibleText.includes('PC Issues None')) {
    console.log('✓ PASS: Dashboard Room Status section renders identically with "PC Issues: None" and single "Offline" badge.');
} else {
    console.error('✗ FAIL: Dashboard rendering did not match expected structure:', dashVisibleText);
    allPassed = false;
}

console.log('\n================================================================');
if (allPassed) {
    console.log('🎉 ALL ROOM STATUS CARD TESTS PASSED SUCCESSFULLY!');
} else {
    console.error('❌ SOME ROOM STATUS CARD TESTS FAILED.');
}
console.log('================================================================\n');

process.exit(allPassed ? 0 : 1);
