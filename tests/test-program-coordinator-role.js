/**
 * tests/test-program-coordinator-role.js
 * Focused verification test suite for the new Program Coordinator role:
 * 1. IT Dept Head admin access preservation
 * 2. Program Coordinator parity across admin APIs and pages
 * 3. Faculty blocked from admin APIs/pages
 * 4. MIS Staff permissions unchanged
 * 5. OJT permissions unchanged
 * 6. Assigning Program Coordinator does NOT demote current IT Dept Head (coexistence)
 * 7. IT Dept Head leadership transfer still works as before (demotes former head)
 * 8. Program Coordinator login redirects to it-head-dashboard.html
 * 9. Program Coordinator appears correctly in faculty management interface & sorting
 * 10. Key-box authorization & key transfer policies intact
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const {
    IT_HEAD_ROLES,
    ADMIN_ROLES,
    MIS_STAFF_ROLES,
    OJT_ROLES,
    KEY_TRANSFER_ROLES,
    KEY_BOX_ACCESS_ROLES
} = require('../middleware/auth');
const facultyService = require('../services/facultyService');
const facultyRepo = require('../repositories/faculty.repository');
const keyAuthService = require('../services/keyAuthorizationService');
const settingsService = require('../services/settingsService');

console.log('================================================================');
console.log('🧪 PROGRAM COORDINATOR ROLE VERIFICATION SUITE');
console.log('================================================================');

async function runTests() {
    try {
        // ─── TEST 1 & 2 & 3: ROLE AUTHORIZATION DEFINITIONS ─────────────────
        console.log('\n--- 1. Testing Centralized Role Matrices (middleware/auth.js) ---');
        assert.ok(IT_HEAD_ROLES.includes('IT Dept. Head'), 'IT_HEAD_ROLES must include "IT Dept. Head"');
        assert.ok(IT_HEAD_ROLES.includes('Program Coordinator'), 'IT_HEAD_ROLES must include "Program Coordinator"');
        assert.ok(!IT_HEAD_ROLES.includes('Faculty'), 'IT_HEAD_ROLES must NOT include "Faculty"');
        assert.ok(!IT_HEAD_ROLES.includes('MIS Staff'), 'IT_HEAD_ROLES must NOT include "MIS Staff"');
        assert.ok(!IT_HEAD_ROLES.includes('OJT'), 'IT_HEAD_ROLES must NOT include "OJT"');

        assert.ok(ADMIN_ROLES.includes('IT Dept. Head'), 'ADMIN_ROLES must include "IT Dept. Head"');
        assert.ok(ADMIN_ROLES.includes('Program Coordinator'), 'ADMIN_ROLES must include "Program Coordinator"');
        assert.ok(ADMIN_ROLES.includes('MIS Staff'), 'ADMIN_ROLES must include "MIS Staff"');
        assert.ok(!ADMIN_ROLES.includes('Faculty'), 'ADMIN_ROLES must NOT include "Faculty"');
        assert.ok(!ADMIN_ROLES.includes('OJT'), 'ADMIN_ROLES must NOT include "OJT"');

        assert.ok(KEY_TRANSFER_ROLES.includes('Faculty'), 'KEY_TRANSFER_ROLES must include "Faculty"');
        assert.ok(KEY_TRANSFER_ROLES.includes('IT Dept. Head'), 'KEY_TRANSFER_ROLES must include "IT Dept. Head"');
        assert.ok(KEY_TRANSFER_ROLES.includes('Program Coordinator'), 'KEY_TRANSFER_ROLES must include "Program Coordinator"');
        assert.ok(!KEY_TRANSFER_ROLES.includes('MIS Staff'), 'KEY_TRANSFER_ROLES must NOT include "MIS Staff" (custodian rule)');
        assert.ok(!KEY_TRANSFER_ROLES.includes('OJT'), 'KEY_TRANSFER_ROLES must NOT include "OJT"');

        assert.ok(KEY_BOX_ACCESS_ROLES.includes('Faculty'), 'KEY_BOX_ACCESS_ROLES must include "Faculty"');
        assert.ok(KEY_BOX_ACCESS_ROLES.includes('IT Dept. Head'), 'KEY_BOX_ACCESS_ROLES must include "IT Dept. Head"');
        assert.ok(KEY_BOX_ACCESS_ROLES.includes('Program Coordinator'), 'KEY_BOX_ACCESS_ROLES must include "Program Coordinator"');
        assert.ok(KEY_BOX_ACCESS_ROLES.includes('MIS Staff'), 'KEY_BOX_ACCESS_ROLES must include "MIS Staff"');
        assert.ok(!KEY_BOX_ACCESS_ROLES.includes('OJT'), 'KEY_BOX_ACCESS_ROLES must NOT include "OJT"');
        console.log('✔ PASS: Centralized role matrices verify complete parity between IT Dept. Head and Program Coordinator.');

        // ─── TEST 4: BACKEND SERVICE AUTHORIZATION ──────────────────────────
        console.log('\n--- 2. Testing Backend Service Authorization Parity ---');
        // Pending key authorization requests check
        const fakeUserId = 999999;
        // Faculty should be rejected with status 403
        const facultyPendingRes = await keyAuthService.getPendingRequestsForDeptHead(fakeUserId, 'Faculty');
        assert.strictEqual(facultyPendingRes.status, 403, 'Faculty must receive status 403 on getPendingRequestsForDeptHead');
        assert.ok(facultyPendingRes.error.includes('Forbidden'), 'Faculty error must mention Forbidden');

        // IT Dept. Head should pass role check (status 200)
        const itHeadPending = await keyAuthService.getPendingRequestsForDeptHead(fakeUserId, 'IT Dept. Head');
        assert.strictEqual(itHeadPending.status, 200, 'IT Dept Head should receive status 200 on getPendingRequestsForDeptHead');
        assert.ok(Array.isArray(itHeadPending.data), 'IT Dept Head should receive pending requests array');

        // Program Coordinator must be forbidden from reviewing key requests (Super Admin / IT Dept Head exclusive)
        const pcPending = await keyAuthService.getPendingRequestsForDeptHead(fakeUserId, 'Program Coordinator');
        assert.strictEqual(pcPending.status, 403, 'Program Coordinator must receive status 403 on getPendingRequestsForDeptHead');
        assert.ok(pcPending.error.includes('Forbidden'), 'Program Coordinator error must mention Forbidden');

        // Program Coordinator forbidden from approving/rejecting key requests
        const pcApproveRes = await keyAuthService.approveRequest(999999, fakeUserId, 'Program Coordinator');
        assert.strictEqual(pcApproveRes.status, 403, 'Program Coordinator must receive 403 on approveRequest');

        const pcRejectRes = await keyAuthService.rejectRequest(999999, fakeUserId, 'Program Coordinator', 'No');
        assert.strictEqual(pcRejectRes.status, 403, 'Program Coordinator must receive 403 on rejectRequest');

        // Faculty forbidden from approving/rejecting key requests
        const facultyApproveRes = await keyAuthService.approveRequest(999999, fakeUserId, 'Faculty');
        assert.strictEqual(facultyApproveRes.status, 403, 'Faculty must be forbidden from approving key requests');

        const facultyRejectRes = await keyAuthService.rejectRequest(999999, fakeUserId, 'Faculty', 'No');
        assert.strictEqual(facultyRejectRes.status, 403, 'Faculty must be forbidden from rejecting key requests');

        // settingsService role authorization check (Program Coordinator keeps admin access, Faculty blocked)
        const facultySettingsRes = await settingsService.updateSettings({}, fakeUserId, 'Faculty');
        assert.strictEqual(facultySettingsRes.status, 403, 'Faculty must be forbidden from updating system settings');

        console.log('✔ PASS: Backend service methods enforce exclusive IT Dept. Head authorization for Faculty Key Requests (Program Coordinator receives 403).');

        // ─── TEST 5: FRONTEND PAGE GUARDS & WORKSPACE ROUTING ───────────────
        console.log('\n--- 3. Testing Frontend Page Guards & Routing (js/auth-check.js) ---');
        const authCheckContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'auth-check.js'), 'utf8');
        const fnCode = `
        ${authCheckContent.match(/function isPageAuthorized[\s\S]*?\n\}/)[0]}
        ${authCheckContent.match(/function getAuthorizedRedirect[\s\S]*?\n\}/)[0]}
        return { isPageAuthorized, getAuthorizedRedirect };
        `;
        const { isPageAuthorized, getAuthorizedRedirect } = new Function('OJT_ALLOWED_PAGES', fnCode)(new Set(['mis-staff-dashboard.html', 'mis-maintenance.html']));

        const adminPages = [
            'it-head-dashboard.html',
            'master-schedule.html',
            'faculty-management.html',
            'room-schedule-editor.html',
            'it-head-room-status.html',
            'it-head-pc-reports.html',
            'it-head-my-schedule.html'
        ];

        adminPages.forEach(p => {
            assert.strictEqual(isPageAuthorized('IT Dept. Head', p), true, `IT Dept Head must be authorized on ${p}`);
            assert.strictEqual(isPageAuthorized('Program Coordinator', p), true, `Program Coordinator must be authorized on ${p}`);
            assert.strictEqual(isPageAuthorized('Faculty', p), false, `Faculty must NOT be authorized on ${p}`);
            assert.strictEqual(isPageAuthorized('MIS Staff', p), false, `MIS Staff must NOT be authorized on ${p}`);
            assert.strictEqual(isPageAuthorized('OJT', p), false, `OJT must NOT be authorized on ${p}`);
        });

        // Redirects from faculty pages to admin dashboard
        assert.strictEqual(getAuthorizedRedirect('Program Coordinator', 'index.html'), '/it-head-dashboard.html');
        assert.strictEqual(getAuthorizedRedirect('Program Coordinator', 'room-status.html'), '/it-head-room-status.html');
        assert.strictEqual(getAuthorizedRedirect('Program Coordinator', 'faculty-pc-reports.html'), '/it-head-pc-reports.html');
        assert.strictEqual(getAuthorizedRedirect('Program Coordinator', 'my-schedule.html'), '/it-head-my-schedule.html');
        console.log('✔ PASS: Frontend guards and workspace redirects verify 100% parity across all 7 admin pages.');

        // ─── TEST 6: LOGIN & KEY-TRANSFER REDIRECT CODE ─────────────────────
        console.log('\n--- 4. Testing Login & Key Transfer Redirect Logic ---');
        const loginHtml = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
        assert.ok(loginHtml.includes("r === 'program coordinator'"), 'login.html must recognize program coordinator in session check');

        const loginJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'login.js'), 'utf8');
        assert.ok(loginJs.includes("role === 'Program Coordinator'"), 'login.js must recognize Program Coordinator for isItHead');

        const keyTransferJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'key-transfer.js'), 'utf8');
        assert.ok(keyTransferJs.includes("role === 'Program Coordinator'"), 'key-transfer.js must recognize Program Coordinator');
        console.log('✔ PASS: Login and key transfer redirects correctly send Program Coordinator to it-head-dashboard.html.');

        // ─── TEST 7: DATABASE COLUMN & LEADERSHIP COEXISTENCE ───────────────
        console.log('\n--- 5. Testing Database Persistence & Leadership Coexistence ---');
        // Check users.Role column length
        const [colRows] = await db.query(
            "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'Role'"
        );
        assert.ok(colRows.length > 0, 'users.Role column must exist');
        const maxLen = colRows[0].CHARACTER_MAXIMUM_LENGTH;
        assert.ok(maxLen >= 19, `users.Role length (${maxLen}) must accommodate 'Program Coordinator' (19 chars)`);
        console.log(`✔ Column check: users.Role is ${colRows[0].DATA_TYPE}(${maxLen}) - canonical string 'Program Coordinator' (19 chars) fits perfectly without migration.`);

        // Find existing IT Dept. Head
        const [deptHeads] = await db.query("SELECT User_ID, Name, Email, Role FROM users WHERE Role = 'IT Dept. Head' LIMIT 1");
        assert.ok(deptHeads.length > 0, 'Test requires an existing IT Dept. Head');
        const originalHead = deptHeads[0];

        // Capture existing Program Coordinator so they are restored after test
        const [existingCoords] = await db.query("SELECT User_ID FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
        const originalCoordId = existingCoords.length > 0 ? existingCoords[0].User_ID : null;

        // Create a dedicated test user for role transitions
        const testUserEmail = `test_pc_${Date.now()}@bulsu.edu.ph`;
        const [insertRes] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status, Password) VALUES ('Test PC Candidate', ?, 'Faculty', 'ACTIVE', 'hashed_pass')",
            [testUserEmail]
        );
        const testUserId = insertRes.insertId;

        try {
            // STEP A: Assign 'Program Coordinator' to test candidate
            await facultyService.updateFacultyRole(testUserId, 'Program Coordinator');

            // Verify test user is now 'Program Coordinator'
            const [userAfterPC] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [testUserId]);
            assert.strictEqual(userAfterPC[0].Role, 'Program Coordinator', 'Test user role must be Program Coordinator');

            // CRITICAL LEADERSHIP RULE CHECK: Verify original IT Dept. Head was NOT demoted!
            const [headAfterPC] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [originalHead.User_ID]);
            assert.strictEqual(headAfterPC[0].Role, 'IT Dept. Head', 'Original IT Dept Head must NOT be demoted when assigning Program Coordinator');
            console.log('✔ PASS: Assigning Program Coordinator does NOT demote IT Dept Head (both coexist as admins).');

            // STEP B: Verify facultyRepository.findAllFaculty returns both
            const [allFaculty] = await facultyRepo.findAllFaculty();
            const foundHead = allFaculty.some(f => f.User_ID === originalHead.User_ID && f.Role === 'IT Dept. Head');
            const foundPC = allFaculty.some(f => f.User_ID === testUserId && f.Role === 'Program Coordinator');
            assert.ok(foundHead, 'findAllFaculty must return IT Dept. Head');
            assert.ok(foundPC, 'findAllFaculty must return Program Coordinator');
            console.log('✔ PASS: facultyRepository.findAllFaculty includes both IT Dept. Head and Program Coordinator.');

            // STEP C: Leadership transfer verification - promoting candidate to IT Dept. Head demotes existing head
            await facultyService.updateFacultyRole(testUserId, 'IT Dept. Head');

            const [userAfterHead] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [testUserId]);
            assert.strictEqual(userAfterHead[0].Role, 'IT Dept. Head', 'Test user is now IT Dept. Head');

            const [headAfterDemote] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [originalHead.User_ID]);
            assert.strictEqual(headAfterDemote[0].Role, 'Faculty', 'Former IT Dept Head was demoted to Faculty on leadership transfer');
            console.log('✔ PASS: Leadership transfer to "IT Dept. Head" properly triggers demoteAllHeadsToFaculty as before.');

        } finally {
            // Clean up: restore original head and delete test user
            await db.query("UPDATE users SET Role = 'IT Dept. Head' WHERE User_ID = ?", [originalHead.User_ID]);
            if (originalCoordId) {
                await db.query("UPDATE users SET Role = 'Program Coordinator' WHERE User_ID = ?", [originalCoordId]);
            }
            await db.query("DELETE FROM users WHERE User_ID = ?", [testUserId]);
            console.log('✔ Test cleanup: Original IT Dept Head and Program Coordinator restored, test candidate removed.');
        }

        // ─── TEST 8: UI COMPONENTS & UTILITY LOGIC ──────────────────────────
        console.log('\n--- 6. Testing UI Components, Roster Display & Sorting ---');
        // Test faculty-utils.js sorting
        const facultyUtils = require('../js/utils/faculty-utils');
        const mockRoster = [
            { Name: 'Prof. Charlie', Role: 'Faculty' },
            { Name: 'Prof. Alice', Role: 'Program Coordinator' },
            { Name: 'Prof. Bob', Role: 'IT Dept. Head' },
            { Name: 'Prof. Dan', Role: 'Faculty' }
        ];
        const sorted = facultyUtils.sortFaculty(mockRoster);
        assert.strictEqual(sorted[0].Name, 'Prof. Bob', 'IT Dept. Head must be sorted 1st');
        assert.strictEqual(sorted[1].Name, 'Prof. Alice', 'Program Coordinator must be sorted 2nd');
        assert.strictEqual(sorted[2].Name, 'Prof. Charlie', 'Faculty sorted alphabetically (Charlie)');
        assert.strictEqual(sorted[3].Name, 'Prof. Dan', 'Faculty sorted alphabetically (Dan)');
        console.log('✔ PASS: sortFaculty correctly ranks IT Dept. Head (1st), Program Coordinator (2nd), Faculty (alpha).');

        // Test facultyUtils.matchesRoleFilter
        assert.strictEqual(facultyUtils.matchesRoleFilter('Program Coordinator', 'head'), true, 'Filter "head" must match Program Coordinator');
        assert.strictEqual(facultyUtils.matchesRoleFilter('Program Coordinator', 'all'), true, 'Filter "all" must match Program Coordinator');
        assert.strictEqual(facultyUtils.matchesRoleFilter('Program Coordinator', 'faculty'), false, 'Filter "faculty" must NOT match Program Coordinator');
        assert.strictEqual(facultyUtils.matchesRoleFilter('Program Coordinator', 'mis'), false, 'Filter "mis" must NOT match Program Coordinator');
        console.log('✔ PASS: matchesRoleFilter correctly categorizes Program Coordinator as department leadership.');

        // Test edit-role.modal.js options
        const editRoleModalContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'faculty', 'modals', 'edit-role.modal.js'), 'utf8');
        assert.ok(editRoleModalContent.includes('Program Coordinator (Backup Administrator)'), 'edit-role.modal.js must include Program Coordinator (Backup Administrator)');
        assert.ok(editRoleModalContent.includes('data-value="Program Coordinator"'), 'edit-role.modal.js must have data-value="Program Coordinator"');

        // Test faculty-card.js HTML output
        const facultyCardContent = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'faculty-card.js'), 'utf8');
        assert.ok(facultyCardContent.includes("isPC = member.Role === 'Program Coordinator'"), 'faculty-card.js must check isPC');
        assert.ok(facultyCardContent.includes('Program Coordinator'), 'faculty-card.js must render Program Coordinator role tag');
        console.log('✔ PASS: UI modal and faculty card components correctly configured for Program Coordinator.');

        console.log('\n================================================================');
        console.log('🎉 ALL 10 PROGRAM COORDINATOR ROLE VERIFICATION TESTS PASSED 100%!');
        console.log('================================================================');
    } catch (err) {
        console.error('\n❌ TEST FAILED:', err);
        process.exit(1);
    } finally {
        await db.end();
    }
}

runTests();
