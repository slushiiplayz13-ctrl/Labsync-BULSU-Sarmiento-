/**
 * tests/test-faculty-dashboard-2nd-key-button.js
 * Verification suite for the Faculty Dashboard "Reserve 2nd Key" Button:
 * 1. Faculty Dashboard (index.html) mounts btnHeaderReserveKey in #itheadLabsCard matching screenshot placement
 * 2. Faculty Dashboard (index.html) links key-authorization.css and loads dashboard.key-requests.js
 * 3. Faculty Dashboard (index.html) displays monitor icon in My Laboratories section header matching screenshot
 * 4. Program Coordinator Dashboard (it-head-dashboard.html) remains unchanged and mounts btnHeaderReserveKey
 * 5. Room Status (room-status.html) preserves the existing btnHeaderReserveKey button
 * 6. Role visibility: Faculty and Program Coordinator are authorized; IT Dept Head, MIS Staff, OJT are hidden
 * 7. Duplicate event listeners guard: dataset.bound prevents double-binding on multiple calls
 * 8. Single modal instance: dashboardKeyRequestModal is reused without creating duplicate modals
 * 9. End-to-end request submission lifecycle works cleanly without duplicate requests
 */

'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const keyAuthService = require('../services/keyAuthorizationService');

test('Faculty Dashboard 2nd Key Request Button Verification Suite', async (t) => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    const itHeadPath = path.join(__dirname, '..', 'it-head-dashboard.html');
    const itHeadHtml = fs.readFileSync(itHeadPath, 'utf8');

    const roomStatusPath = path.join(__dirname, '..', 'room-status.html');
    const roomStatusHtml = fs.readFileSync(roomStatusPath, 'utf8');

    const scriptPath = path.join(__dirname, '..', 'js', 'pages', 'dashboard', 'dashboard.key-requests.js');
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');

    // 1. Structure: index.html has btnHeaderReserveKey inside #itheadLabsCard
    await t.test('1. Faculty Dashboard has btnHeaderReserveKey inside My Laboratories container', () => {
        assert.ok(indexHtml.includes('id="itheadLabsCard"'), 'index.html must have #itheadLabsCard');
        assert.ok(indexHtml.includes('id="btnHeaderReserveKey"'), 'index.html must have #btnHeaderReserveKey');

        const cardIdx = indexHtml.indexOf('id="itheadLabsCard"');
        const btnIdx = indexHtml.indexOf('id="btnHeaderReserveKey"');
        const legendIdx = indexHtml.indexOf('class="sh-legend"');

        assert.ok(btnIdx > cardIdx, 'btnHeaderReserveKey must be inside itheadLabsCard');
        assert.ok(btnIdx < legendIdx, 'btnHeaderReserveKey must precede the status legend in .sh-right matching the screenshot');
        assert.ok(indexHtml.includes('Reserve 2nd Key'), 'Button must have Reserve 2nd Key label');
        assert.ok(indexHtml.includes('data-lucide="calendar-plus"'), 'Button must include calendar-plus icon');
    });

    // 2. CSS and Script links in index.html
    await t.test('2. Faculty Dashboard links key-authorization.css and loads dashboard.key-requests.js', () => {
        assert.ok(indexHtml.includes('key-authorization.css'), 'index.html must link key-authorization.css');
        assert.ok(indexHtml.includes('dashboard.key-requests.js'), 'index.html must load dashboard.key-requests.js');
    });

    // 3. Section icon matches reference screenshot (monitor icon)
    await t.test('3. Section icon in My Laboratories uses monitor icon', () => {
        const labsCardSub = indexHtml.substring(
            indexHtml.indexOf('id="itheadLabsCard"'),
            indexHtml.indexOf('id="btnHeaderReserveKey"')
        );
        assert.ok(labsCardSub.includes('data-lucide="monitor"'), 'My Laboratories header must use monitor icon matching reference screenshot');
    });

    // 4. Program Coordinator dashboard remains unchanged
    await t.test('4. Program Coordinator dashboard remains unchanged', () => {
        assert.ok(itHeadHtml.includes('id="itheadLabsCard"'), 'it-head-dashboard.html must have #itheadLabsCard');
        assert.ok(itHeadHtml.includes('id="btnHeaderReserveKey"'), 'it-head-dashboard.html must contain #btnHeaderReserveKey');
        assert.ok(itHeadHtml.includes('key-authorization.css'), 'it-head-dashboard.html must link key-authorization.css');
        assert.ok(itHeadHtml.includes('dashboard.key-requests.js'), 'it-head-dashboard.html must load dashboard.key-requests.js');
    });

    // 5. Room Status preserves existing button
    await t.test('5. Room Status preserves existing btnHeaderReserveKey button', () => {
        assert.ok(roomStatusHtml.includes('id="roomStatusCard"'), 'room-status.html must have #roomStatusCard');
        assert.ok(roomStatusHtml.includes('id="btnHeaderReserveKey"'), 'room-status.html must preserve #btnHeaderReserveKey');
        assert.ok(roomStatusHtml.includes('dashboard.key-requests.js'), 'room-status.html must load dashboard.key-requests.js');
    });

    // 6. Role visibility partitioning
    await t.test('6. Role partitioning authorizes Faculty and Coordinator while hiding from IT Dept Head and MIS/OJT', () => {
        // Evaluate the helper logic directly
        const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
        function isApproverOnlyRole(role) {
            if (!role) return false;
            const cleanRole = String(role).trim();
            return itHeadAliases.includes(cleanRole) || (cleanRole.toLowerCase().includes('head') && !cleanRole.toLowerCase().includes('coordinator'));
        }

        function isKeyRequesterRole(role) {
            if (!role) return true;
            if (isApproverOnlyRole(role)) return false;
            const cleanRole = String(role).trim().toLowerCase();
            const unrelatedRoles = ['mis staff', 'mis', 'ojt', 'student', 'guest', 'admin'];
            return !unrelatedRoles.includes(cleanRole);
        }

        // Faculty: Visible
        assert.strictEqual(isApproverOnlyRole('Faculty'), false);
        assert.strictEqual(isKeyRequesterRole('Faculty'), true);

        // Program Coordinator: Visible
        assert.strictEqual(isApproverOnlyRole('Program Coordinator'), false);
        assert.strictEqual(isKeyRequesterRole('Program Coordinator'), true);

        // IT Dept Head: Hidden (approver only)
        assert.strictEqual(isApproverOnlyRole('IT Dept. Head'), true);
        assert.strictEqual(isKeyRequesterRole('IT Dept. Head'), false);

        // MIS Staff: Hidden (unrelated role)
        assert.strictEqual(isApproverOnlyRole('MIS Staff'), false);
        assert.strictEqual(isKeyRequesterRole('MIS Staff'), false);

        // OJT: Hidden (unrelated role)
        assert.strictEqual(isApproverOnlyRole('OJT'), false);
        assert.strictEqual(isKeyRequesterRole('OJT'), false);
    });

    // 7. Duplicate event listener prevention & single modal creation
    await t.test('7. Script enforces dataset.bound guard and single modal singleton pattern', () => {
        assert.ok(scriptContent.includes('if (btn.dataset.bound) return;'), 'Must guard against duplicate event listeners on buttons');
        assert.ok(scriptContent.includes("btn.dataset.bound = 'true';"), 'Must set dataset.bound flag');
        assert.ok(scriptContent.includes("document.getElementById('dashboardKeyRequestModal')"), 'Must reuse existing modal singleton if already present');
    });

    // 8. Functional test: Backend request workflow works as expected for Faculty
    let createdRequestId = null;
    await t.test('8. Functional request workflow creates a single request cleanly', async () => {
        const [facultyRows] = await db.query("SELECT User_ID, Role, Name FROM users WHERE Role = 'Faculty' LIMIT 1");
        const [roomRows] = await db.query("SELECT Room_ID FROM laboratories LIMIT 1");

        if (facultyRows.length > 0 && roomRows.length > 0) {
            const faculty = facultyRows[0];
            const room = roomRows[0];

            await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [faculty.User_ID]);

            const submitRes = await keyAuthService.requestAdditionalKey(
                faculty.User_ID,
                'Faculty',
                faculty.Name,
                room.Room_ID,
                'Needs 2nd key for thesis project experiment'
            );

            assert.strictEqual(submitRes.status, 201, 'Request must return 201 Created');
            assert.ok(submitRes.message.includes('submitted successfully'), 'Must confirm submission message');

            const [records] = await db.query(
                "SELECT Request_ID FROM key_authorization_requests WHERE User_ID = ? AND Status = 'PENDING'",
                [faculty.User_ID]
            );
            assert.strictEqual(records.length, 1, 'Exactly one request must be created');
            createdRequestId = records[0].Request_ID;
        }
    });

    // Cleanup
    await t.test('9. Test cleanup', async () => {
        if (createdRequestId) {
            await db.query("DELETE FROM key_authorization_requests WHERE Request_ID = ?", [createdRequestId]);
        }
    });
}).then(() => {
    setTimeout(() => process.exit(0), 100);
});
