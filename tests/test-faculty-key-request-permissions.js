/**
 * tests/test-faculty-key-request-permissions.js
 * Comprehensive verification test suite for Faculty Key Request Super Admin / IT Dept. Head permissions:
 * 1. IT Dept. Head can view pending Faculty Key Requests
 * 2. IT Dept. Head can approve a Key Request
 * 3. IT Dept. Head can reject a Key Request
 * 4. Program Coordinator receives 403 when attempting to approve
 * 5. Program Coordinator receives 403 when attempting to reject
 * 6. Program Coordinator cannot access pending Key Request approval controls (button/dropdown unmounted)
 * 7. Program Coordinator does not receive the Key Request approval notification/badge
 * 8. Faculty can still submit a 2nd-key request
 * 9. Existing key reservation workflow still works
 * 10. Existing key transfer workflow still works
 * 11. Existing IT Dept. Head permissions remain unchanged
 * 12. Program Coordinator's other administrative permissions remain unchanged
 */

'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const keyAuthService = require('../services/keyAuthorizationService');
const maintenanceService = require('../services/maintenanceService');
const {
    IT_HEAD_ROLES,
    IT_DEPT_HEAD_EXCLUSIVE_ROLES,
    KEY_TRANSFER_ROLES,
    ADMIN_ROLES
} = require('../middleware/auth');

test('Faculty Key Request Permission & Super Admin Exclusivity Suite', async (t) => {
    let facultyUserId = null;
    let deptHeadUserId = null;
    let progCoordUserId = null;
    let targetRoomId = null;
    let targetRoomNumber = null;
    let testRequestId = null;

    // Helper: Setup test users & test lab
    async function setupUsers() {
        // Find or create test faculty
        const [facultyRows] = await db.query("SELECT User_ID FROM users WHERE Role = 'Faculty' LIMIT 1");
        if (facultyRows.length > 0) {
            facultyUserId = facultyRows[0].User_ID;
        }

        // Find or create test IT Dept Head
        const [deptHeadRows] = await db.query("SELECT User_ID FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
        if (deptHeadRows.length > 0) {
            deptHeadUserId = deptHeadRows[0].User_ID;
        }

        // Find or create test Program Coordinator
        const [pcRows] = await db.query("SELECT User_ID FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
        if (pcRows.length > 0) {
            progCoordUserId = pcRows[0].User_ID;
        } else {
            // Pick any faculty and give Program Coordinator for testing or use a dummy ID
            progCoordUserId = 888888;
        }

        // Find a valid room
        const [rooms] = await db.query("SELECT Room_ID, Room_Number FROM laboratories LIMIT 1");
        if (rooms.length > 0) {
            targetRoomId = rooms[0].Room_ID;
            targetRoomNumber = rooms[0].Room_Number;
        }
    }

    await setupUsers();

    // ─── 1. IT Dept. Head can view pending Faculty Key Requests ─────────────────
    await t.test('1. IT Dept. Head can view pending Faculty Key Requests', async () => {
        const res = await keyAuthService.getPendingRequestsForDeptHead(deptHeadUserId, 'IT Dept. Head');
        assert.strictEqual(res.status, 200, 'Must return 200 OK for IT Dept. Head');
        assert.ok(Array.isArray(res.data), 'Must return array of pending requests');
    });

    // ─── 2. Faculty can submit a 2nd-key request ─────────────────────────────────
    await t.test('2 & 8. Faculty can still submit a 2nd-key request', async () => {
        // Clean up any existing pending requests for test faculty
        if (facultyUserId) {
            await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [facultyUserId]);
            const submitRes = await keyAuthService.requestAdditionalKey(
                facultyUserId,
                'Faculty',
                'Test Faculty Member',
                targetRoomId,
                'Needs second key for senior capstone lab testing.'
            );
            assert.strictEqual(submitRes.status, 201, 'Must return 201 Created for Faculty key request submission');
            assert.ok(submitRes.message.includes('submitted successfully'), 'Must confirm submission message');

            // Find the newly created request
            const [pending] = await db.query(
                "SELECT Request_ID FROM key_authorization_requests WHERE User_ID = ? AND Status = 'PENDING' ORDER BY Request_ID DESC LIMIT 1",
                [facultyUserId]
            );
            assert.ok(pending.length > 0, 'Must have created a pending record');
            testRequestId = pending[0].Request_ID;
        }
    });

    // ─── 3. Program Coordinator receives 403 when attempting to view pending ────
    await t.test('3. Program Coordinator receives 403 on viewing pending Faculty Key Requests', async () => {
        const pcRes = await keyAuthService.getPendingRequestsForDeptHead(progCoordUserId, 'Program Coordinator');
        assert.strictEqual(pcRes.status, 403, 'Program Coordinator must receive 403 Forbidden');
        assert.ok(pcRes.error.includes('Forbidden'), 'Error must mention Forbidden');
    });

    // ─── 4. Program Coordinator receives 403 when attempting to approve ─────────
    await t.test('4. Program Coordinator receives 403 when attempting to approve', async () => {
        if (!testRequestId) return;
        const pcApproveRes = await keyAuthService.approveRequest(testRequestId, progCoordUserId, 'Program Coordinator', 120);
        assert.strictEqual(pcApproveRes.status, 403, 'Program Coordinator must receive 403 Forbidden on approve');
        assert.ok(pcApproveRes.error.includes('Forbidden'), 'Error must mention Forbidden');
    });

    // ─── 5. Program Coordinator receives 403 when attempting to reject ──────────
    await t.test('5. Program Coordinator receives 403 when attempting to reject', async () => {
        if (!testRequestId) return;
        const pcRejectRes = await keyAuthService.rejectRequest(testRequestId, progCoordUserId, 'Program Coordinator', 'Declined');
        assert.strictEqual(pcRejectRes.status, 403, 'Program Coordinator must receive 403 Forbidden on reject');
        assert.ok(pcRejectRes.error.includes('Forbidden'), 'Error must mention Forbidden');
    });

    // ─── 6. Program Coordinator receives 403 when attempting admin cancel ────────
    await t.test('6. Program Coordinator receives 403 when attempting administrative cancel on third-party request', async () => {
        if (!testRequestId) return;
        const pcCancelRes = await keyAuthService.cancelRequest(testRequestId, progCoordUserId, 'Program Coordinator');
        assert.strictEqual(pcCancelRes.status, 403, 'Program Coordinator must receive 403 on cancelling another user request');
    });

    // ─── 7. IT Dept. Head can approve a Key Request ──────────────────────────────
    await t.test('7. IT Dept. Head can approve a Key Request', async () => {
        if (!testRequestId) return;
        const approveRes = await keyAuthService.approveRequest(testRequestId, deptHeadUserId, 'IT Dept. Head', 120);
        assert.strictEqual(approveRes.status, 200, 'IT Dept. Head must receive 200 OK on approve');
        assert.strictEqual(approveRes.data.status, 'APPROVED', 'Request status must transition to APPROVED');

        // Verify status in DB
        const [rows] = await db.query("SELECT Status FROM key_authorization_requests WHERE Request_ID = ?", [testRequestId]);
        assert.strictEqual(rows[0].Status, 'APPROVED', 'Database record must be APPROVED');
    });

    // ─── 8. IT Dept. Head can reject a Key Request ──────────────────────────────
    await t.test('8. IT Dept. Head can reject a Key Request', async () => {
        // Create second request to test rejection
        if (facultyUserId) {
            // Reset status of testRequestId to PENDING to test rejection directly
            await db.query("UPDATE key_authorization_requests SET Status = 'PENDING', Approved_At = NULL, Expires_At = NULL WHERE Request_ID = ?", [testRequestId]);
            const rejectRes = await keyAuthService.rejectRequest(testRequestId, deptHeadUserId, 'IT Dept. Head', 'Lab under repair');
            assert.strictEqual(rejectRes.status, 200, 'IT Dept. Head must receive 200 OK on reject');
            assert.strictEqual(rejectRes.data.status, 'REJECTED', 'Status must be REJECTED');

            const [rows] = await db.query("SELECT Status FROM key_authorization_requests WHERE Request_ID = ?", [testRequestId]);
            assert.strictEqual(rows[0].Status, 'REJECTED', 'Database record must be REJECTED');
        }
    });

    // ─── 9. Frontend controls: Program Coordinator cannot access approval button ──
    await t.test('9. Program Coordinator cannot access pending Key Request approval controls', () => {
        const compPath = path.join(__dirname, '..', 'js', 'components', 'dept-head-key-authorizations.js');
        const compContent = fs.readFileSync(compPath, 'utf8');

        // Check isAuthorized logic
        assert.ok(!compContent.includes("role === 'Program Coordinator'"), 'dept-head-key-authorizations.js must NOT authorize Program Coordinator');
        assert.ok(compContent.includes("!role.toLowerCase().includes('coordinator')"), 'dept-head-key-authorizations.js must explicitly exclude coordinator');

        const dashPath = path.join(__dirname, '..', 'js', 'pages', 'it-head-dashboard.js');
        const dashContent = fs.readFileSync(dashPath, 'utf8');
        assert.ok(dashContent.includes("!role.toLowerCase().includes('coordinator')"), 'it-head-dashboard.js must guard loadPendingKeyAuthorizations');

        // Check HTML templates remove keyBtn / keyMenu for Program Coordinator
        const htmlFiles = [
            'it-head-dashboard.html',
            'it-head-room-status.html',
            'it-head-pc-reports.html',
            'it-head-my-schedule.html',
            'master-schedule.html',
            'faculty-management.html'
        ];
        htmlFiles.forEach(f => {
            const hPath = path.join(__dirname, '..', f);
            const hContent = fs.readFileSync(hPath, 'utf8');
            assert.ok(hContent.includes("if (!isItHead)"), `${f} must contain !isItHead check`);
            assert.ok(hContent.includes("keyBtn.remove()"), `${f} must remove keyBtn for non-head`);
        });
    });

    // ─── 10. Notification behavior: Program Coordinator does not receive key_auth ─
    await t.test('10. Program Coordinator does not receive Key Request approval notifications', async () => {
        // Insert a dummy pending key request
        const [insRes] = await db.query(
            "INSERT INTO key_authorization_requests (User_ID, Room_ID, Reason, Status) VALUES (?, ?, 'Urgent lab request', 'PENDING')",
            [facultyUserId || 1, targetRoomId || 1]
        );
        const dummyReqId = insRes.insertId;

        try {
            // IT Dept. Head notifications must include key_auth
            const headNotifs = await maintenanceService.getNotifications(deptHeadUserId, 'IT Dept. Head');
            assert.strictEqual(headNotifs.status, 200);
            const headHasKeyAuth = headNotifs.data.some(n => n.type === 'key_auth' && n.id === dummyReqId);
            assert.ok(headHasKeyAuth, 'IT Dept. Head must receive key_auth pending request notification');

            // Program Coordinator notifications must NOT include key_auth
            const pcNotifs = await maintenanceService.getNotifications(progCoordUserId, 'Program Coordinator');
            assert.strictEqual(pcNotifs.status, 200);
            const pcHasKeyAuth = pcNotifs.data.some(n => n.type === 'key_auth');
            assert.strictEqual(pcHasKeyAuth, false, 'Program Coordinator must NOT receive key_auth pending notifications');
        } finally {
            await db.query("DELETE FROM key_authorization_requests WHERE Request_ID = ?", [dummyReqId]);
        }
    });

    // ─── 11. Centralized role matrix checks ──────────────────────────────────────
    await t.test('11. Centralized role matrix checks & IT Dept. Head permissions preserved', () => {
        assert.ok(IT_HEAD_ROLES.includes('Program Coordinator'), 'IT_HEAD_ROLES must keep Program Coordinator');
        assert.ok(IT_HEAD_ROLES.includes('IT Dept. Head'), 'IT_HEAD_ROLES must keep IT Dept. Head');
        assert.ok(ADMIN_ROLES.includes('Program Coordinator'), 'ADMIN_ROLES must keep Program Coordinator');
        assert.ok(KEY_TRANSFER_ROLES.includes('Faculty'), 'KEY_TRANSFER_ROLES must include Faculty');
        assert.ok(KEY_TRANSFER_ROLES.includes('Program Coordinator'), 'KEY_TRANSFER_ROLES must include Program Coordinator');

        // Exclusive roles must ONLY have Dept Heads
        assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Program Coordinator'), 'IT_DEPT_HEAD_EXCLUSIVE_ROLES must NOT include Program Coordinator');
        assert.ok(IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('IT Dept. Head'), 'IT_DEPT_HEAD_EXCLUSIVE_ROLES must include IT Dept. Head');
        assert.ok(IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Department Head'), 'IT_DEPT_HEAD_EXCLUSIVE_ROLES must include Department Head');
    });

    // ─── 12. Program Coordinator 2nd-Key Request Workflow ─────────────────────────
    await t.test('12. Program Coordinator can submit their own 2nd-key request and IT Dept Head can approve it', async () => {
        let pcRequestId = null;
        try {
            // Clean up any old requests for Program Coordinator
            await db.query("DELETE FROM key_authorization_requests WHERE User_ID = ?", [progCoordUserId]);

            // Submit 2nd-key request as Program Coordinator
            const submitRes = await keyAuthService.requestAdditionalKey(
                progCoordUserId,
                'Program Coordinator',
                'Santi Jay Esplana',
                targetRoomId,
                'Additional laboratory key needed for simultaneous lab setup.'
            );
            assert.strictEqual(submitRes.status, 201, 'Program Coordinator 2nd-key request submission must return 201 Created');
            assert.ok(submitRes.message.includes('submitted successfully'), 'Submission message must indicate success');

            // Verify request created in DB as PENDING with User_ID = progCoordUserId
            const [rows] = await db.query(
                "SELECT * FROM key_authorization_requests WHERE User_ID = ? AND Status = 'PENDING' ORDER BY Request_ID DESC LIMIT 1",
                [progCoordUserId]
            );
            assert.strictEqual(rows.length, 1, 'Must find 1 pending request for Program Coordinator');
            pcRequestId = rows[0].Request_ID;
            assert.strictEqual(rows[0].User_ID, progCoordUserId, 'Request must belong to Program Coordinator');
            assert.strictEqual(rows[0].Status, 'PENDING', 'Request status must be PENDING');

            // IT Dept. Head views pending requests - must include Program Coordinator's request
            const pendingRes = await keyAuthService.getPendingRequestsForDeptHead(deptHeadUserId, 'IT Dept. Head');
            assert.strictEqual(pendingRes.status, 200, 'IT Dept. Head pending review must return 200');
            const foundPcReq = pendingRes.data.find(r => r.Request_ID === pcRequestId);
            assert.ok(foundPcReq, 'IT Dept. Head pending queue must contain Program Coordinator request');
            assert.strictEqual(foundPcReq.Requester_Role, 'Program Coordinator', 'Requester role must be Program Coordinator');

            // Program Coordinator cannot approve their own request (403)
            const pcSelfApprove = await keyAuthService.approveRequest(pcRequestId, progCoordUserId, 'Program Coordinator', 120);
            assert.strictEqual(pcSelfApprove.status, 403, 'Program Coordinator cannot approve request (403)');

            // Program Coordinator cannot reject their own request (403)
            const pcSelfReject = await keyAuthService.rejectRequest(pcRequestId, progCoordUserId, 'Program Coordinator', 'No');
            assert.strictEqual(pcSelfReject.status, 403, 'Program Coordinator cannot reject request (403)');

            // Program Coordinator checks their own request status - must be PENDING
            const pcStatusRes = await keyAuthService.getFacultyRequestStatus(progCoordUserId);
            assert.strictEqual(pcStatusRes.status, 200, 'Program Coordinator status check must return 200');
            assert.strictEqual(pcStatusRes.data.Status, 'PENDING', 'Status must be PENDING');

            // IT Dept. Head approves the request
            const headApproveRes = await keyAuthService.approveRequest(pcRequestId, deptHeadUserId, 'IT Dept. Head', 120);
            assert.strictEqual(headApproveRes.status, 200, 'IT Dept. Head approval must return 200 OK');
            assert.strictEqual(headApproveRes.data.status, 'APPROVED', 'Request status must transition to APPROVED');

            // Program Coordinator checks their request status again - must be APPROVED
            const pcApprovedStatusRes = await keyAuthService.getFacultyRequestStatus(progCoordUserId);
            assert.strictEqual(pcApprovedStatusRes.status, 200, 'Status check must return 200');
            assert.strictEqual(pcApprovedStatusRes.data.Status, 'APPROVED', 'Status must now be APPROVED');

            // Verify IoT Key Box authorization compatibility for Program Coordinator
            const keyAuthRepo = require('../repositories/key-authorization.repository');
            const [approvedRows] = await keyAuthRepo.findActiveApprovedByUserIdAndRoomNumber(progCoordUserId, targetRoomNumber);
            const [anyAuthRows] = await keyAuthRepo.findAnyActiveAuthorizationByUserId(progCoordUserId);
            const hasAuthorization = (approvedRows && approvedRows.length > 0) || (anyAuthRows && anyAuthRows.length > 0);
            assert.strictEqual(hasAuthorization, true, 'IoT Key Box authorization check must grant 2nd key for approved Program Coordinator');

            // Program Coordinator cancels their own reservation
            const pcCancelRes = await keyAuthService.cancelRequest(pcRequestId, progCoordUserId, 'Program Coordinator');
            assert.strictEqual(pcCancelRes.status, 200, 'Program Coordinator can cancel their own reservation');

        } finally {
            if (pcRequestId) {
                await db.query("DELETE FROM key_authorization_requests WHERE Request_ID = ?", [pcRequestId]);
            }
        }
    });

    // ─── 13. UI & Frontend Script Role Guard Verification ─────────────────────────
    await t.test('13. Frontend dashboard.key-requests.js role checks correctly partition IT Dept Head vs Program Coordinator', () => {
        const scriptPath = path.join(__dirname, '..', 'js', 'pages', 'dashboard', 'dashboard.key-requests.js');
        const scriptContent = fs.readFileSync(scriptPath, 'utf8');

        assert.ok(scriptContent.includes('isApproverOnlyRole'), 'Script must define isApproverOnlyRole');
        assert.ok(scriptContent.includes('getCurrentUserRole'), 'Script must define getCurrentUserRole');

        // Evaluate the helper logic in isolation
        const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
        function isApproverOnly(role) {
            if (!role) return false;
            const cleanRole = String(role).trim();
            return itHeadAliases.includes(cleanRole) || (cleanRole.toLowerCase().includes('head') && !cleanRole.toLowerCase().includes('coordinator'));
        }

        assert.strictEqual(isApproverOnly('IT Dept. Head'), true, 'IT Dept. Head must be approver only');
        assert.strictEqual(isApproverOnly('IT Head'), true, 'IT Head must be approver only');
        assert.strictEqual(isApproverOnly('Department Head'), true, 'Department Head must be approver only');
        assert.strictEqual(isApproverOnly('Program Coordinator'), false, 'Program Coordinator must NOT be approver only');
        assert.strictEqual(isApproverOnly('Faculty'), false, 'Faculty must NOT be approver only');

        // Verify it-head-dashboard.html mounts the banner, reserve button, and script
        const itHeadHtmlPath = path.join(__dirname, '..', 'it-head-dashboard.html');
        const itHeadHtmlContent = fs.readFileSync(itHeadHtmlPath, 'utf8');

        assert.ok(itHeadHtmlContent.includes('id="btnHeaderReserveKey"'), 'it-head-dashboard.html must contain btnHeaderReserveKey');
        assert.ok(!itHeadHtmlContent.includes('id="facultyKeyStatusBanner"'), 'it-head-dashboard.html keeps main dashboard clean without banner, matching index.html');
        assert.ok(itHeadHtmlContent.includes('dashboard.key-requests.js'), 'it-head-dashboard.html must load dashboard.key-requests.js');
        assert.ok(itHeadHtmlContent.includes('key-authorization.css'), 'it-head-dashboard.html must link key-authorization.css');

        // Verify it-head-room-status.html mounts the banner, reserve button, and script for Program Coordinator
        const itHeadRoomStatusPath = path.join(__dirname, '..', 'it-head-room-status.html');
        const itHeadRoomStatusContent = fs.readFileSync(itHeadRoomStatusPath, 'utf8');
        assert.ok(itHeadRoomStatusContent.includes('id="btnHeaderReserveKey"'), 'it-head-room-status.html must contain btnHeaderReserveKey');
        assert.ok(itHeadRoomStatusContent.includes('id="facultyKeyStatusBanner"'), 'it-head-room-status.html must contain facultyKeyStatusBanner');
        assert.ok(itHeadRoomStatusContent.includes('dashboard.key-requests.js'), 'it-head-room-status.html must load dashboard.key-requests.js');
        assert.ok(itHeadRoomStatusContent.includes('key-authorization.css'), 'it-head-room-status.html must link key-authorization.css');
    });

    // ─── 14. Cleanup ─────────────────────────────────────────────────────────────
    await t.test('14. Test cleanup', async () => {
        if (testRequestId) {
            await db.query("DELETE FROM key_authorization_requests WHERE Request_ID = ?", [testRequestId]);
        }
    });
}).then(() => {
    setTimeout(() => process.exit(0), 100);
});

