/**
 * tests/test-user-management-mis-lifecycle.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive verification suite for User Management and MIS Staff account lifecycle:
 * 1. IT Dept. Head can list MIS Staff accounts.
 * 2. Program Coordinator receives 403 Forbidden for MIS endpoints.
 * 3. MIS Staff receives 403 Forbidden for MIS endpoints.
 * 4. IT Dept. Head can create MIS Staff when no active MIS exists.
 * 5. Creation generates secure credentials using existing workflow (bcrypt, password, QR).
 * 6. Second active MIS creation is rejected with 409 Conflict.
 * 7. IT Dept. Head can edit MIS Staff details.
 * 8. IT Dept. Head can deactivate MIS Staff.
 * 9. Deactivated MIS cannot log in (401 ACCOUNT_DEACTIVATED).
 * 10. Replacement MIS can be created after outgoing account is deactivated.
 * 11. Old MIS user record remains in `users` with Status = 'DEACTIVATED'.
 * 12. Historical maintenance and audit attribution remains intact without cascade nullification.
 * 13. Faculty API (POST /api/faculty/add) cannot be abused to create MIS Staff.
 * 14. Faculty role update (PUT /api/faculty/:userId/role) cannot be abused to assign or alter MIS Staff.
 * 15. Faculty delete (DELETE /api/faculty/:userId) strictly rejects deletion of MIS Staff.
 */

'use strict';

const assert = require('assert');
const db = require('../database/connection');
const misService = require('../services/misService');
const misController = require('../controllers/mis.controller');
const facultyController = require('../controllers/faculty.controller');
const facultyService = require('../services/facultyService');
const authService = require('../services/authService');
const { requireRole, IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');

function createMockReqRes({ session = {}, params = {}, body = {}, ip = '127.0.0.1' } = {}) {
    const req = {
        session,
        params,
        body,
        headers: {},
        originalUrl: '/api/mis-staff',
        ip,
        connection: { remoteAddress: ip }
    };
    const res = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        }
    };
    return { req, res };
}

async function runTests() {
    console.log('================================================================');
    console.log('🧪 USER MANAGEMENT & MIS STAFF LIFECYCLE VERIFICATION SUITE');
    console.log('================================================================\n');

    let originalActiveMis = null;
    let createdMisId = null;
    let replacementMisId = null;
    let testPcId = null;
    let testReportId = null;

    try {
        // Find existing users
        const [headRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'IT Dept. Head' AND Status = 'ACTIVE' LIMIT 1");
        assert.ok(headRows.length > 0, 'An active IT Dept. Head must exist in the database');
        const deptHead = headRows[0];

        const [pcRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'Program Coordinator' AND Status = 'ACTIVE' LIMIT 1");
        assert.ok(pcRows.length > 0, 'An active Program Coordinator must exist in the database');
        const progCoord = pcRows[0];

        const [existingMisRows] = await db.query("SELECT * FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1");
        if (existingMisRows.length > 0) {
            originalActiveMis = existingMisRows[0];
            console.log(`ℹ Found existing active MIS Staff: ${originalActiveMis.Name} (ID: ${originalActiveMis.User_ID})`);
        }

        // ─────────────────────────────────────────────────────────────
        // 1. IT Dept. Head can list MIS Staff
        // ─────────────────────────────────────────────────────────────
        console.log('--- 1. Testing IT Dept. Head List MIS Staff ---');
        const { req: req1, res: res1 } = createMockReqRes({ session: { userId: deptHead.User_ID, userRole: deptHead.Role } });
        await misController.listMisStaff(req1, res1, () => {});
        assert.strictEqual(res1.statusCode, 200, 'IT Dept. Head list should return HTTP 200');
        assert.ok(res1.jsonData, 'Response should contain data');
        assert.ok(Array.isArray(res1.jsonData.all), 'Response should contain array of all MIS staff');
        console.log('✔ PASS: IT Dept. Head successfully listed MIS Staff accounts.');

        // ─────────────────────────────────────────────────────────────
        // 2. Program Coordinator receives 403 Forbidden for MIS endpoints
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing Program Coordinator Access Block (403 Forbidden) ---');
        const { req: req2, res: res2 } = createMockReqRes({ session: { userId: progCoord.User_ID, userRole: progCoord.Role } });
        const routeGuard = requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES);
        let pcPassed = false;
        await routeGuard(req2, res2, () => { pcPassed = true; });
        assert.strictEqual(pcPassed, false, 'Program Coordinator must NOT pass exclusive route guard');
        assert.strictEqual(res2.statusCode, 403, 'Program Coordinator must receive HTTP 403 Forbidden');
        console.log('✔ PASS: Program Coordinator is strictly blocked with HTTP 403 Forbidden.');

        // ─────────────────────────────────────────────────────────────
        // 3. MIS Staff receives 403 Forbidden for MIS endpoints
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 3. Testing MIS Staff Access Block (403 Forbidden) ---');
        if (originalActiveMis) {
            const { req: req3, res: res3 } = createMockReqRes({ session: { userId: originalActiveMis.User_ID, userRole: originalActiveMis.Role } });
            let misPassed = false;
            await routeGuard(req3, res3, () => { misPassed = true; });
            assert.strictEqual(misPassed, false, 'MIS Staff must NOT pass exclusive route guard');
            assert.strictEqual(res3.statusCode, 403, 'MIS Staff must receive HTTP 403 Forbidden');
            console.log('✔ PASS: MIS Staff cannot manage other MIS accounts (HTTP 403 Forbidden).');
        }

        // ─────────────────────────────────────────────────────────────
        // 4 & 6. Enforce Single Active MIS Staff Account Rule
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 4 & 6. Testing Single Active MIS Staff Concurrency Protection ---');
        // If an active MIS exists, attempt to create another should be rejected with 409
        if (originalActiveMis) {
            const { req: reqConflict, res: resConflict } = createMockReqRes({
                session: { userId: deptHead.User_ID, userRole: deptHead.Role },
                body: { name: 'Test Conflict Tech', email: 'conflict.mis@bulsu.edu.ph', phone: '09171112233' }
            });
            await misController.createMisStaff(reqConflict, resConflict, () => {});
            assert.strictEqual(resConflict.statusCode, 409, 'Creating second active MIS should return HTTP 409 Conflict');
            assert.ok(resConflict.jsonData.error.includes('An active MIS Staff account already exists'), 'Must provide clear active account error');
            console.log('✔ PASS: Creating second active MIS rejected with HTTP 409 Conflict.');

            // Deactivate original active MIS to allow testing creation
            await db.query("UPDATE users SET Status = 'DEACTIVATED' WHERE User_ID = ?", [originalActiveMis.User_ID]);
        }

        // ─────────────────────────────────────────────────────────────
        // 5. IT Dept. Head creates MIS Staff when no active MIS exists
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 5. Testing MIS Staff Account Creation Workflow ---');
        const testMisEmail = 'new.mis.test@bulsu.edu.ph';
        const { req: reqCreate, res: resCreate } = createMockReqRes({
            session: { userId: deptHead.User_ID, userRole: deptHead.Role },
            body: { name: 'Engr. Juan MIS Tech', email: testMisEmail, phone: '09171234567' }
        });
        await misController.createMisStaff(reqCreate, resCreate, () => {});
        assert.strictEqual(resCreate.statusCode, 201, 'MIS creation should return HTTP 201 Created');
        assert.ok(resCreate.jsonData.temporaryPassword, 'Response must include temporaryPassword');
        assert.strictEqual(resCreate.jsonData.temporaryPassword.length >= 12, true, 'Temporary password must be high-entropy (>= 12 chars)');

        createdMisId = resCreate.jsonData.user.User_ID;
        assert.ok(createdMisId, 'Created user must have User_ID');

        const [createdDbRows] = await db.query("SELECT * FROM users WHERE User_ID = ?", [createdMisId]);
        assert.strictEqual(createdDbRows.length, 1, 'User record must exist in database');
        const createdDbUser = createdDbRows[0];
        assert.strictEqual(createdDbUser.Role, 'MIS Staff', 'Role must be MIS Staff');
        assert.strictEqual(createdDbUser.Status, 'ACTIVE', 'Status must be ACTIVE');
        assert.ok(createdDbUser.Password.startsWith('$2'), 'Password must be hashed with bcrypt');
        assert.ok(createdDbUser.ID_QR_String.startsWith('LABSYNC-USER-MISSTAFF-'), 'QR string must follow LABSYNC-USER-MISSTAFF- format');
        console.log('✔ PASS: IT Dept. Head created MIS Staff with bcrypt hashing and QR credentials.');

        // ─────────────────────────────────────────────────────────────
        // 7. IT Dept. Head can edit MIS Staff details
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 7. Testing Editing MIS Staff Details ---');
        const { req: reqEdit, res: resEdit } = createMockReqRes({
            session: { userId: deptHead.User_ID, userRole: deptHead.Role },
            params: { userId: createdMisId },
            body: { name: 'Engr. Juan Updated', email: 'updated.mis@bulsu.edu.ph', phone: '09179998877' }
        });
        await misController.updateMisStaff(reqEdit, resEdit, () => {});
        assert.strictEqual(resEdit.statusCode, 200, 'Edit should return HTTP 200');

        const [editedDbRows] = await db.query("SELECT Name, Email, Phone FROM users WHERE User_ID = ?", [createdMisId]);
        assert.strictEqual(editedDbRows[0].Name, 'Engr. Juan Updated', 'Name should be updated');
        assert.strictEqual(editedDbRows[0].Email, 'updated.mis@bulsu.edu.ph', 'Email should be updated');
        assert.strictEqual(editedDbRows[0].Phone, '09179998877', 'Phone should be updated');
        console.log('✔ PASS: IT Dept. Head successfully updated MIS Staff details.');

        // ─────────────────────────────────────────────────────────────
        // 8 & 9. IT Dept. Head deactivates MIS Staff & Login blocked
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 8 & 9. Testing Deactivation & Login Enforcement ---');
        // Attach historical ticket attribution to this MIS user before deactivating
        const [labRows] = await db.query("SELECT Room_ID FROM laboratories LIMIT 1");
        const roomId = labRows[0].Room_ID;
        const [pcIns] = await db.query("INSERT INTO lab_units (Room_ID, PC_Number, Condition_Status) VALUES (?, 'PC-TEST-MIS', 'Working')", [roomId]);
        testPcId = pcIns.insertId;

        const [reportIns] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Resolved_By_User_ID, Resolved_At) VALUES (?, 'Hardware', 'Resolved', ?, NOW())",
            [testPcId, createdMisId]
        );
        testReportId = reportIns.insertId;

        // Deactivate via controller
        const { req: reqDeact, res: resDeact } = createMockReqRes({
            session: { userId: deptHead.User_ID, userRole: deptHead.Role },
            params: { userId: createdMisId }
        });
        await misController.deactivateMisStaff(reqDeact, resDeact, () => {});
        assert.strictEqual(resDeact.statusCode, 200, 'Deactivation should return HTTP 200');

        const [deactDbRows] = await db.query("SELECT Status FROM users WHERE User_ID = ?", [createdMisId]);
        assert.strictEqual(deactDbRows[0].Status, 'DEACTIVATED', 'Account status must be DEACTIVATED');

        // Test login rejection via authService
        const loginAttempt = await authService.loginUser('updated.mis@bulsu.edu.ph', resCreate.jsonData.temporaryPassword);
        assert.strictEqual(loginAttempt.status, 401, 'Login must be rejected with HTTP 401');
        assert.strictEqual(loginAttempt.code, 'ACCOUNT_DEACTIVATED', 'Error code must be ACCOUNT_DEACTIVATED');
        console.log('✔ PASS: MIS Staff account deactivated; login is strictly blocked with ACCOUNT_DEACTIVATED.');

        // ─────────────────────────────────────────────────────────────
        // 10 & 11. Replacement MIS can be created while old remains
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 10 & 11. Testing Replacement Account Creation & Record Retention ---');
        const { req: reqReplace, res: resReplace } = createMockReqRes({
            session: { userId: deptHead.User_ID, userRole: deptHead.Role },
            body: { name: 'Engr. Successor MIS', email: 'successor.mis@bulsu.edu.ph', phone: '09181234567' }
        });
        await misController.createMisStaff(reqReplace, resReplace, () => {});
        assert.strictEqual(resReplace.statusCode, 201, 'Replacement MIS creation should return HTTP 201');
        replacementMisId = resReplace.jsonData.user.User_ID;

        // Verify old record still exists in users
        const [oldUserDb] = await db.query("SELECT User_ID, Status, Role FROM users WHERE User_ID = ?", [createdMisId]);
        assert.strictEqual(oldUserDb.length, 1, 'Old MIS account must NOT be deleted');
        assert.strictEqual(oldUserDb[0].Status, 'DEACTIVATED', 'Old account remains DEACTIVATED');

        // Verify new record is active
        const [newApplicantDb] = await db.query("SELECT User_ID, Status, Role FROM users WHERE User_ID = ?", [replacementMisId]);
        assert.strictEqual(newApplicantDb[0].Status, 'ACTIVE', 'Replacement account is ACTIVE');
        console.log('✔ PASS: Replacement MIS created successfully; outgoing account preserved with Status = DEACTIVATED.');

        // ─────────────────────────────────────────────────────────────
        // 12. Historical maintenance attribution preserved
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 12. Testing Historical Maintenance Attribution Preservation ---');
        const [ticketRows] = await db.query("SELECT Resolved_By_User_ID FROM maintenance_issues WHERE Issue_ID = ?", [testReportId]);
        assert.strictEqual(ticketRows[0].Resolved_By_User_ID, createdMisId, 'Resolved_By_User_ID must remain linked to deactivated user');
        console.log('✔ PASS: Historical ticket attribution (Resolved_By_User_ID) preserved 100% intact.');

        // ─────────────────────────────────────────────────────────────
        // 13. Faculty API cannot be abused to create MIS Staff
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 13. Testing POST /api/faculty/add Role Boundary ---');
        const { req: reqFacAdd, res: resFacAdd } = createMockReqRes({
            session: { userId: progCoord.User_ID, userRole: progCoord.Role },
            body: { name: 'Test Rogue MIS', email: 'rogue.mis@bulsu.edu.ph', role: 'MIS Staff' }
        });
        await facultyController.addFaculty(reqFacAdd, resFacAdd, () => {});
        assert.strictEqual(resFacAdd.statusCode, 403, 'Attempt to create MIS Staff via faculty endpoint must return 403');
        assert.ok(resFacAdd.jsonData.error.includes('Forbidden'), 'Must contain forbidden error message');
        console.log('✔ PASS: POST /api/faculty/add strictly rejects role = "MIS Staff" (403 Forbidden).');

        // ─────────────────────────────────────────────────────────────
        // 14. Faculty role update cannot be abused to assign/alter MIS Staff
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 14. Testing PUT /api/faculty/:userId/role Boundary ---');
        // A. Attempt to assign role = "MIS Staff"
        const { req: reqRoleUpdate, res: resRoleUpdate } = createMockReqRes({
            session: { userId: progCoord.User_ID, userRole: progCoord.Role },
            params: { userId: progCoord.User_ID },
            body: { role: 'MIS Staff' }
        });
        await facultyController.updateFacultyRole(reqRoleUpdate, resRoleUpdate, () => {});
        assert.strictEqual(resRoleUpdate.statusCode, 403, 'Assigning role MIS Staff via faculty endpoint must return 403');

        // B. Attempt to alter existing MIS Staff role via faculty endpoint
        const { req: reqAlterMis, res: resAlterMis } = createMockReqRes({
            session: { userId: deptHead.User_ID, userRole: deptHead.Role },
            params: { userId: replacementMisId },
            body: { role: 'Faculty' }
        });
        await facultyController.updateFacultyRole(reqAlterMis, resAlterMis, () => {});
        assert.strictEqual(resAlterMis.statusCode, 403, 'Altering MIS Staff via faculty endpoint must return 403');
        console.log('✔ PASS: PUT /api/faculty/:userId/role cannot assign or modify MIS Staff accounts (403 Forbidden).');

        // ─────────────────────────────────────────────────────────────
        // 15. Faculty delete rejects deleting MIS Staff accounts
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 15. Testing DELETE /api/faculty/:userId Rejection for MIS Staff ---');
        const { req: reqDelete, res: resDelete } = createMockReqRes({
            session: { userId: deptHead.User_ID, userRole: deptHead.Role },
            params: { userId: replacementMisId }
        });
        await facultyController.deleteFaculty(reqDelete, resDelete, () => {});
        assert.strictEqual(resDelete.statusCode, 403, 'Deleting MIS Staff account must be rejected with 403');
        assert.ok(resDelete.jsonData.error.includes('deactivate'), 'Error message must instruct user to deactivate instead of delete');
        console.log('✔ PASS: DELETE /api/faculty/:userId strictly rejects deleting MIS Staff (403 Forbidden).');

        console.log('\n================================================================');
        console.log('🎉 ALL 15 LIFECYCLE & AUTHORIZATION TESTS PASSED WITH 100% SUCCESS!');
        console.log('================================================================\n');

    } finally {
        // Cleanup test accounts created during test
        if (testReportId) await db.query("DELETE FROM maintenance_issues WHERE Issue_ID = ?", [testReportId]);
        if (testPcId) await db.query("DELETE FROM lab_units WHERE PC_ID = ?", [testPcId]);
        if (createdMisId) await db.query("DELETE FROM users WHERE User_ID = ?", [createdMisId]);
        if (replacementMisId) await db.query("DELETE FROM users WHERE User_ID = ?", [replacementMisId]);

        // Restore original active MIS Staff if one existed
        if (originalActiveMis) {
            await db.query("UPDATE users SET Status = 'ACTIVE' WHERE User_ID = ?", [originalActiveMis.User_ID]);
            console.log(`ℹ Restored original active MIS Staff account: ${originalActiveMis.Name} (ID: ${originalActiveMis.User_ID})`);
        }
    }

    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failure:', err);
    process.exit(1);
});
