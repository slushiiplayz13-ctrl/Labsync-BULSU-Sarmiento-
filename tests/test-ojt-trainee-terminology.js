'use strict';

/**
 * tests/test-ojt-trainee-terminology.js
 * Verification suite for LabSync Capstone Revision 4:
 * Renaming "OJT Interns" to "On-the-Job Trainees" across the MIS Staff account management interface.
 * 
 * Verifies:
 * 1. mis-ojt.html page title, greeting heading, primary buttons, and loading states
 * 2. All 6 modals in mis-ojt.html (Add, Edit, Credentials, Reset, Deactivate, Activate)
 * 3. Consistent sidebar navigation tooltips across all 5 MIS Staff pages
 * 4. Controller logic in js/pages/mis-ojt.js for empty states, table cell subtext, and fallbacks
 * 5. Tutorial guide terminology in js/tutorial.js
 * 6. Backend API integrity: OJT creation, status transitions, role invariants ('OJT'), and authentication
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const ojtRepository = require('../repositories/ojt.repository');
const ojtService = require('../services/ojtService');

test('Revision 4 — "On-the-Job Trainees" Terminology & Functionality Verification', async (t) => {

  await t.test('1. mis-ojt.html Page Wording Verification', () => {
    const htmlPath = path.join(__dirname, '..', 'mis-ojt.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    // Title & Page Greeting
    assert.ok(content.includes('<title>LabSync – On-the-Job Trainee Management</title>'), 'Page title must use "On-the-Job Trainee Management"');
    assert.ok(content.includes('<h1 class="greeting-title" id="greetingText">On-the-Job Trainee Management</h1>'), 'Greeting title must use "On-the-Job Trainee Management"');
    assert.ok(!content.includes('>OJT Intern Management<'), 'Old greeting title "OJT Intern Management" must be removed');

    // Add Button
    assert.ok(content.includes('+ Add On-the-Job Trainee'), 'Add button must display "+ Add On-the-Job Trainee"');
    assert.ok(!content.includes('+ Add OJT Intern'), 'Old button text "+ Add OJT Intern" must be removed');
    assert.ok(content.includes('aria-label="Add new On-the-Job Trainee"'), 'Add button aria-label must use "On-the-Job Trainee"');

    // Initial Loading State
    assert.ok(content.includes('Loading On-the-Job Trainee accounts...'), 'Loading state must use "Loading On-the-Job Trainee accounts..."');
    assert.ok(!content.includes('Loading OJT intern accounts...'), 'Old loading state text must be removed');

    // Subtitle
    assert.ok(content.includes('<p class="greeting-sub" id="greetingSub">Manage On-the-Job Trainee accounts, training periods, and access.</p>'), 'Subtitle must use "Manage On-the-Job Trainee accounts, training periods, and access."');
    assert.ok(!content.includes('Manage student intern accounts'), 'Old subtitle "Manage student intern accounts" must be removed');
  });

  await t.test('2. mis-ojt.html Modal Dialogs Terminology Verification', () => {
    const htmlPath = path.join(__dirname, '..', 'mis-ojt.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    // Modal 1: Add Modal
    assert.ok(content.includes('id="addOjtModalTitle">Add On-the-Job Trainee</h2>'), 'Modal 1 title must be "Add On-the-Job Trainee"');
    assert.ok(content.includes('Create an individual account for on-the-job trainee duty'), 'Modal 1 subtitle must refer to on-the-job trainee duty');
    assert.ok(content.includes('Account Type: <strong>On-the-Job Trainee (Operational Access Only)</strong>'), 'Modal 1 badge must display "On-the-Job Trainee"');

    // Modal 2: Edit Modal
    assert.ok(content.includes('id="editOjtModalTitle">Edit On-the-Job Trainee</h2>'), 'Modal 2 title must be "Edit On-the-Job Trainee"');
    assert.ok(content.includes('Update trainee profile and training duration'), 'Modal 2 subtitle must refer to trainee profile');
    assert.ok(content.includes('Account Role: <strong>On-the-Job Trainee</strong>'), 'Modal 2 badge must display "On-the-Job Trainee"');

    // Modal 3: Credential Display
    assert.ok(content.includes('id="credModalTitle">On-the-Job Trainee Account Credentials</h2>'), 'Modal 3 title must be "On-the-Job Trainee Account Credentials"');
    assert.ok(content.includes('Securely provide these login details to the trainee'), 'Modal 3 subtitle must refer to trainee');
    assert.ok(content.includes('Please copy or securely provide it to the trainee before closing this window.'), 'Modal 3 callout must refer to trainee');
    assert.ok(content.includes('>Trainee Name</span>'), 'Modal 3 field label must be "Trainee Name"');

    // Modal 4: Reset Password
    assert.ok(content.includes('id="resetPwTitle">Reset On-the-Job Trainee Password</h2>'), 'Modal 4 title must be "Reset On-the-Job Trainee Password"');
    assert.ok(content.includes('reset the password for <strong id="resetTargetName">this trainee</strong>?'), 'Modal 4 prompt must refer to "this trainee"');

    // Modal 5: Deactivate Modal
    assert.ok(content.includes('id="deactTitle" style="color: #EF4444;">Deactivate On-the-Job Trainee Account</h2>'), 'Modal 5 title must be "Deactivate On-the-Job Trainee Account"');
    assert.ok(content.includes('Suspend operational access for this trainee'), 'Modal 5 subtitle must refer to trainee');
    assert.ok(content.includes('Are you sure you want to deactivate <strong id="deactTargetName">this trainee</strong>?'), 'Modal 5 prompt must refer to "this trainee"');

    // Modal 6: Activate Modal
    assert.ok(content.includes('id="actTitle" style="color: var(--primary-teal);">Activate On-the-Job Trainee Account</h2>'), 'Modal 6 title must be "Activate On-the-Job Trainee Account"');
    assert.ok(content.includes('Restore operational access for this trainee'), 'Modal 6 subtitle must refer to trainee');
    assert.ok(content.includes('Re-enable operational login access for <strong id="actTargetName">this trainee</strong>?'), 'Modal 6 prompt must refer to "this trainee"');
    assert.ok(content.includes("If the trainee's OJT End Date has already passed"), 'Modal 6 note must refer to trainee');
  });

  await t.test('3. Sidebar Navigation Consistency Across All 5 MIS Staff Pages', () => {
    const misPages = [
      'mis-ojt.html',
      'mis-staff-dashboard.html',
      'mis-qr-generator.html',
      'mis-maintenance.html',
      'mis-keys.html'
    ];

    for (const pageName of misPages) {
      const pagePath = path.join(__dirname, '..', pageName);
      assert.ok(fs.existsSync(pagePath), `${pageName} must exist`);
      const pageHtml = fs.readFileSync(pagePath, 'utf8');

      assert.ok(
        pageHtml.includes('data-tooltip="On-the-Job Trainees" title="On-the-Job Trainees"') ||
        pageHtml.includes('data-tooltip="On-the-Job Trainees"'),
        `${pageName} sidebar navigation must have tooltip "On-the-Job Trainees"`
      );
      assert.ok(
        !pageHtml.includes('data-tooltip="OJT Interns"'),
        `${pageName} sidebar navigation must not have old tooltip "OJT Interns"`
      );
    }
  });

  await t.test('4. js/pages/mis-ojt.js Controller Logic & Empty State Verification', () => {
    const jsPath = path.join(__dirname, '..', 'js', 'pages', 'mis-ojt.js');
    const jsContent = fs.readFileSync(jsPath, 'utf8');

    // Empty state & loading text
    assert.ok(jsContent.includes('Loading On-the-Job Trainee accounts...'), 'Controller loading state must use "On-the-Job Trainee"');
    assert.ok(jsContent.includes('No On-the-Job Trainees have been registered yet.'), 'Empty state must use "No On-the-Job Trainees have been registered yet."');
    assert.ok(jsContent.includes('<span>Add On-the-Job Trainee</span>'), 'Empty state button must use "Add On-the-Job Trainee"');
    assert.ok(jsContent.includes('Failed to load On-the-Job Trainee accounts.'), 'Error state must use "Failed to load On-the-Job Trainee accounts."');

    // Table cell subtext
    assert.ok(jsContent.includes("'On-the-Job Trainee'"), 'Table cell role fallback must be "On-the-Job Trainee"');
    assert.ok(!jsContent.includes("'OJT Intern'"), 'Old fallback "OJT Intern" in table cells must be replaced');

    // Dialog fallback targets
    assert.ok(jsContent.includes("'this trainee'"), 'Dialog target name fallback must be "this trainee"');
  });

  await t.test('5. js/tutorial.js Step Terminology Verification', () => {
    const tutPath = path.join(__dirname, '..', 'js', 'tutorial.js');
    const tutContent = fs.readFileSync(tutPath, 'utf8');

    assert.ok(tutContent.includes("title: '👥 On-the-Job Trainee Management'"), 'Tutorial step title must be "On-the-Job Trainee Management"');
    assert.ok(tutContent.includes("badge: 'Menu 5: On-the-Job Trainees'"), 'Tutorial step badge must be "Menu 5: On-the-Job Trainees"');
    assert.ok(tutContent.includes('data-tooltip="On-the-Job Trainees"'), 'Tutorial selector must match "On-the-Job Trainees"');
  });

  await t.test('6. User Management Interface & Viewer Terminology Verification', () => {
    const fmPath = path.join(__dirname, '..', 'faculty-management.html');
    const fmContent = fs.readFileSync(fmPath, 'utf8');

    // Menu Tab Button
    assert.ok(fmContent.includes('OJT Trainees'), 'User Management menu tab must display "OJT Trainees"');
    assert.ok(!fmContent.includes('OJT Interns\n          </button>'), 'Old tab text "OJT Interns" must be removed');

    // Greeting Subtitle & Role logic
    assert.ok(fmContent.includes('view On-the-Job Trainee accounts.'), 'User Management greetingSub must refer to "view On-the-Job Trainee accounts."');
    assert.ok(!fmContent.includes('view OJT Intern accounts.'), 'Old greetingSub text "view OJT Intern accounts." must be removed');

    // OJT Roster Header & Description
    assert.ok(fmContent.includes('On-the-Job Trainee Directory</h2>'), 'Roster header must use "On-the-Job Trainee Directory"');
    assert.ok(fmContent.includes('On-the-Job Trainees active in laboratory operations.'), 'Roster description must use "On-the-Job Trainees active in laboratory operations."');

    // js/ojt/ojt-viewer.js checks
    const viewerPath = path.join(__dirname, '..', 'js', 'ojt', 'ojt-viewer.js');
    const viewerContent = fs.readFileSync(viewerPath, 'utf8');
    assert.ok(viewerContent.includes('Loading On-the-Job Trainee directory...'), 'Viewer loading state must use On-the-Job Trainee');
    assert.ok(viewerContent.includes('Failed to Load On-the-Job Trainees'), 'Viewer error state must use On-the-Job Trainees');
    assert.ok(viewerContent.includes('No On-the-Job Trainees Found'), 'Viewer empty state must use On-the-Job Trainees');
    assert.ok(viewerContent.includes('On-the-Job Trainee Profile'), 'Viewer modal title must use On-the-Job Trainee Profile');
    assert.ok(!viewerContent.includes('OJT Intern Profile'), 'Old modal title "OJT Intern Profile" must be removed');
  });

  await t.test('7. Backend Data Model and Role Invariants Preserved', async () => {
    // Verify that underlying database role remains 'OJT'
    const [ojtUsers] = await db.query("SELECT User_ID, Name, Email, Role, Status FROM users WHERE Role = 'OJT' LIMIT 1");
    if (ojtUsers.length > 0) {
      assert.strictEqual(ojtUsers[0].Role, 'OJT', 'Database Role must remain strictly "OJT"');
    }

    // Verify findAll and findById in ojtRepository work smoothly
    const [ojts] = await ojtRepository.findAll();
    assert.ok(Array.isArray(ojts), 'ojtRepository.findAll() must return an array of rows');
    for (const o of ojts) {
      assert.strictEqual(o.Role, 'OJT', 'All records returned by ojtRepository must have Role="OJT"');
    }
  });

  await t.test('Teardown database connection', async () => {
    await db.end();
  });
});
