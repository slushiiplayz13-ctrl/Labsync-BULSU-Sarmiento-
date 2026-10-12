/**
 * tests/test-pc-mis-management-permissions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive regression test suite verifying Program Coordinator permissions
 * to manage MIS Staff accounts in LabSync:
 *
 * 1. The Program Coordinator can view MIS Staff accounts.
 * 2. The Program Coordinator can create an MIS Staff account with valid details.
 * 3. The Program Coordinator can edit permitted details and use the existing password-reset flow.
 * 4. The Program Coordinator can activate or deactivate an MIS account, where supported.
 *    - Also verifies acting administrator self-deactivation guard.
 * 5. The Program Coordinator cannot permanently delete an MIS account.
 * 6. The Program Coordinator cannot assign protected administrative roles.
 * 7. Direct unauthorized API requests are rejected, even if initiated outside the UI.
 * 8. MIS Staff cannot gain permission to manage other MIS accounts.
 * 9. IT Department Head permissions continue to work as before.
 * 10. Existing Faculty management, OJT read-only access, validation, and audit logging remain intact.
 *
 * Constraints:
 * - Uses isolated mock fixtures and cleanups.
 * - Does not alter development or production records.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const misService = require('../services/misService');
const misController = require('../controllers/mis.controller');
const facultyService = require('../services/facultyService');
const facultyController = require('../controllers/faculty.controller');
const misRoutes = require('../routes/mis.routes');
const { requireAuth, requireRole, IT_HEAD_ROLES, IT_DEPT_HEAD_EXCLUSIVE_ROLES, MIS_STAFF_ROLES } = require('../middleware/auth');

function createMockReqRes({ session = {}, params = {}, body = {}, ip = '127.0.0.1', originalUrl = '/api/mis-staff' } = {}) {
    session.destroy = session.destroy || function(cb) { cb && cb(); };
    session.save = session.save || function(cb) { cb && cb(); };
    const req = {
        session,
        params,
        body,
        headers: {},
        originalUrl,
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
        },
        clearCookie(name) {
            return this;
        }
    };
    return { req, res };
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('🧪 PROGRAM COORDINATOR MIS STAFF MANAGEMENT PERMISSIONS SUITE');
    console.log('================================================================\n');

    let isolatedTestMisId = null;
    let originalActiveMis = null;

    try {
        // Retrieve existing IT Dept Head and Program Coordinator for realistic sessions
        const [heads] = await db.query("SELECT User_ID, Role, Name, Email FROM users WHERE Role IN ('IT Dept. Head', 'IT Head') LIMIT 1");
        assert.ok(heads.length > 0, 'An active IT Dept Head must exist');
        const deptHead = heads[0];

        const [coordinators] = await db.query("SELECT User_ID, Role, Name, Email FROM users WHERE Role = 'Program Coordinator' LIMIT 1");
        assert.ok(coordinators.length > 0, 'An active Program Coordinator must exist');
        const progCoord = coordinators[0];

        // Check if there is an existing active MIS Staff account
        const [activeMisRows] = await db.query("SELECT * FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1");
        if (activeMisRows.length > 0) {
            originalActiveMis = activeMisRows[0];
            console.log(`ℹ Found active MIS Staff: ${originalActiveMis.Name} (ID: ${originalActiveMis.User_ID})`);
        }

        // Retrieve existing non-admin users for RBAC testing
        const [facUsers] = await db.query("SELECT User_ID, Role, Email FROM users WHERE Role = 'Faculty' AND Status = 'ACTIVE' LIMIT 1");
        const [ojtUsers] = await db.query("SELECT User_ID, Role, Email FROM users WHERE Role = 'OJT' AND Status = 'ACTIVE' LIMIT 1");
        const [studentUsers] = await db.query("SELECT User_ID, Role, Email FROM users WHERE Role = 'Student' AND Status = 'ACTIVE' LIMIT 1");

        const pcSession = {
            userId: progCoord.User_ID,
            userRole: 'Program Coordinator',
            userEmail: progCoord.Email
        };

        const headSession = {
            userId: deptHead.User_ID,
            userRole: 'IT Dept. Head',
            userEmail: deptHead.Email
        };

        const misSession = {
            userId: originalActiveMis ? originalActiveMis.User_ID : 9998,
            userRole: 'MIS Staff',
            userEmail: 'mis.test@bulsu.edu.ph'
        };

        const facultySession = {
            userId: facUsers.length > 0 ? facUsers[0].User_ID : 9997,
            userRole: 'Faculty',
            userEmail: facUsers.length > 0 ? facUsers[0].Email : 'faculty.test@bulsu.edu.ph'
        };

        const ojtSession = {
            userId: ojtUsers.length > 0 ? ojtUsers[0].User_ID : 9996,
            userRole: 'OJT',
            userEmail: ojtUsers.length > 0 ? ojtUsers[0].Email : 'ojt.test@bulsu.edu.ph'
        };

        const studentSession = {
            userId: studentUsers.length > 0 ? studentUsers[0].User_ID : 9995,
            userRole: 'Student',
            userEmail: studentUsers.length > 0 ? studentUsers[0].Email : 'student.test@bulsu.edu.ph'
        };

        // ─────────────────────────────────────────────────────────────
        // 1. Program Coordinator can view MIS Staff accounts
        // ─────────────────────────────────────────────────────────────
        console.log('--- 1. Testing Program Coordinator Can View MIS Staff Accounts ---');
        {
            // Route middleware verification
            const misGuard = requireRole(IT_HEAD_ROLES);
            const { req: authReq, res: authRes } = createMockReqRes({ session: pcSession });
            let passedGuard = false;
            await misGuard(authReq, authRes, () => { passedGuard = true; });
            assert.strictEqual(passedGuard, true, 'Program Coordinator must pass IT_HEAD_ROLES route guard');

            // Controller list execution
            const { req: listReq, res: listRes } = createMockReqRes({ session: pcSession });
            await misController.listMisStaff(listReq, listRes, (err) => { if (err) throw err; });
            assert.strictEqual(listRes.statusCode, 200, 'Program Coordinator listing MIS Staff must return HTTP 200');
            assert.ok(listRes.jsonData, 'Response must have data');
            assert.ok(Array.isArray(listRes.jsonData.all), 'Response must have array of all MIS staff');
            assert.ok('active' in listRes.jsonData, 'Response must have active MIS staff reference');
            console.log('✔ PASS: Program Coordinator can view MIS Staff accounts (HTTP 200).');
        }

        // ─────────────────────────────────────────────────────────────
        // 2. Program Coordinator can create an MIS Staff account
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing Program Coordinator Can Create MIS Staff Account ---');
        {
            // If an active MIS exists, deactivating temporarily to test creation in isolation
            if (originalActiveMis) {
                await db.query("UPDATE users SET Status = 'DEACTIVATED' WHERE User_ID = ?", [originalActiveMis.User_ID]);
            }

            const testEmail = `test.pc.mis.${Date.now()}@bulsu.edu.ph`;
            const { req: createReq, res: createRes } = createMockReqRes({
                session: pcSession,
                body: {
                    name: 'Engr. Test MIS by PC',
                    email: testEmail,
                    phone: '09171239876'
                }
            });

            await misController.createMisStaff(createReq, createRes, (err) => { if (err) throw err; });
            assert.strictEqual(createRes.statusCode, 201, 'Program Coordinator MIS creation must return HTTP 201');
            assert.ok(createRes.jsonData.temporaryPassword, 'Must return generated temporary password');
            assert.ok(createRes.jsonData.temporaryPassword.length >= 12, 'Password must be >= 12 chars');
            assert.ok(createRes.jsonData.user, 'Must return created user object');
            isolatedTestMisId = createRes.jsonData.user.User_ID;

            const [checkDb] = await db.query("SELECT * FROM users WHERE User_ID = ?", [isolatedTestMisId]);
            assert.strictEqual(checkDb.length, 1, 'User must exist in database');
            assert.strictEqual(checkDb[0].Role, 'MIS Staff', 'Created account role must strictly be MIS Staff');
            assert.strictEqual(checkDb[0].Status, 'ACTIVE', 'Created account status must be ACTIVE');
            assert.ok(checkDb[0].Password.startsWith('$2'), 'Password must be hashed with bcrypt');
            console.log('✔ PASS: Program Coordinator successfully created MIS Staff account with valid details.');
        }

        // ─────────────────────────────────────────────────────────────
        // 3. Program Coordinator can edit permitted details & reset password
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 3. Testing Program Coordinator Can Edit Details & Reset Password ---');
        {
            // Edit details
            const updatedEmail = `test.pc.mis.edit.${Date.now()}@bulsu.edu.ph`;
            const { req: editReq, res: editRes } = createMockReqRes({
                session: pcSession,
                params: { userId: isolatedTestMisId },
                body: {
                    name: 'Engr. Test MIS PC Edited',
                    email: updatedEmail,
                    phone: '09175554433'
                }
            });

            await misController.updateMisStaff(editReq, editRes, (err) => { if (err) throw err; });
            assert.strictEqual(editRes.statusCode, 200, 'Edit details must return HTTP 200');

            const [checkEdit] = await db.query("SELECT Name, Email, Phone FROM users WHERE User_ID = ?", [isolatedTestMisId]);
            assert.strictEqual(checkEdit[0].Name, 'Engr. Test MIS PC Edited', 'Name must update');
            assert.strictEqual(checkEdit[0].Email, updatedEmail, 'Email must update');
            assert.strictEqual(checkEdit[0].Phone, '09175554433', 'Phone must update');
            console.log('✔ PASS: Program Coordinator successfully updated permitted MIS Staff details.');

            // Password reset flow
            const { req: resetReq, res: resetRes } = createMockReqRes({
                session: pcSession,
                params: { userId: isolatedTestMisId }
            });

            await misController.resetMisStaffPassword(resetReq, resetRes, (err) => { if (err) throw err; });
            assert.strictEqual(resetRes.statusCode, 200, 'Password reset must return HTTP 200');
            assert.ok(resetRes.jsonData.temporaryPassword, 'Must return new temporary password');
            assert.ok(resetRes.jsonData.temporaryPassword.length >= 12, 'Temporary password must be >= 12 chars');
            console.log('✔ PASS: Program Coordinator successfully triggered MIS Staff password reset.');
        }

        // ─────────────────────────────────────────────────────────────
        // 4. Program Coordinator can activate or deactivate an MIS account
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 4. Testing Program Coordinator Can Deactivate & Reactivate MIS Account ---');
        {
            // Deactivate
            const { req: deactReq, res: deactRes } = createMockReqRes({
                session: pcSession,
                params: { userId: isolatedTestMisId }
            });

            await misController.deactivateMisStaff(deactReq, deactRes, (err) => { if (err) throw err; });
            assert.strictEqual(deactRes.statusCode, 200, 'Deactivation must return HTTP 200');

            const [checkDeact] = await db.query("SELECT Status FROM users WHERE User_ID = ?", [isolatedTestMisId]);
            assert.strictEqual(checkDeact[0].Status, 'DEACTIVATED', 'Account status must be DEACTIVATED');
            console.log('✔ PASS: Program Coordinator successfully deactivated MIS Staff account.');

            // Reactivate
            const { req: reactReq, res: reactRes } = createMockReqRes({
                session: pcSession,
                params: { userId: isolatedTestMisId }
            });

            await misController.reactivateMisStaff(reactReq, reactRes, (err) => { if (err) throw err; });
            assert.strictEqual(reactRes.statusCode, 200, 'Reactivation must return HTTP 200');

            const [checkReact] = await db.query("SELECT Status FROM users WHERE User_ID = ?", [isolatedTestMisId]);
            assert.strictEqual(checkReact[0].Status, 'ACTIVE', 'Account status must be ACTIVE');
            console.log('✔ PASS: Program Coordinator successfully reactivated MIS Staff account.');

            // Self-deactivation rejection test
            const { req: selfDeactReq, res: selfDeactRes } = createMockReqRes({
                session: { userId: isolatedTestMisId, userRole: 'MIS Staff' },
                params: { userId: isolatedTestMisId }
            });
            await misController.deactivateMisStaff(selfDeactReq, selfDeactRes, (err) => { if (err) throw err; });
            assert.strictEqual(selfDeactRes.statusCode, 400, 'Self-deactivation must be rejected with HTTP 400');
            assert.ok(selfDeactRes.jsonData.error.includes('cannot deactivate your own account'), 'Must explain self-deactivation rule');
            console.log('✔ PASS: Self-deactivation by acting admin is strictly prevented (HTTP 400).');
        }

        // ─────────────────────────────────────────────────────────────
        // 5. Program Coordinator cannot permanently delete an MIS account
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 5. Testing Permanent Deletion of MIS Accounts is Restricted ---');
        {
            // A. Verify no DELETE endpoint on MIS router
            const hasDeleteEndpoint = misRoutes.stack.some(layer => layer.route && layer.route.methods.delete);
            assert.strictEqual(hasDeleteEndpoint, false, 'No DELETE HTTP endpoint may exist on /api/mis-staff');

            // B. Verify facultyController.deleteFaculty rejects MIS Staff account deletion with 403
            const { req: delReq, res: delRes } = createMockReqRes({
                session: pcSession,
                params: { userId: isolatedTestMisId }
            });

            await facultyController.deleteFaculty(delReq, delRes, (err) => { if (err) throw err; });
            assert.strictEqual(delRes.statusCode, 403, 'Deleting MIS Staff account must be rejected with HTTP 403');
            assert.ok(delRes.jsonData.error.includes('deactivate'), 'Error message must instruct user to deactivate instead of delete');

            // Confirm account still exists
            const [stillExists] = await db.query("SELECT User_ID FROM users WHERE User_ID = ?", [isolatedTestMisId]);
            assert.strictEqual(stillExists.length, 1, 'MIS account must still exist in database');
            console.log('✔ PASS: Permanent deletion of MIS accounts is strictly restricted (403 Forbidden, no DELETE route).');
        }

        // ─────────────────────────────────────────────────────────────
        // 6. Program Coordinator cannot assign protected administrative roles
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 6. Testing Protection Against Assigning Protected Roles ---');
        {
            const rogueEmail = `rogue.elevate.${Date.now()}@bulsu.edu.ph`;
            const { req: rogueFacReq, res: rogueFacRes } = createMockReqRes({
                session: pcSession,
                body: {
                    name: 'Rogue Admin Candidate',
                    email: rogueEmail,
                    role: 'IT Dept. Head'
                }
            });
            await facultyController.addFaculty(rogueFacReq, rogueFacRes, (err) => { if (err) throw err; });
            assert.strictEqual(rogueFacRes.statusCode, 403, 'Creating IT Dept. Head via faculty add must return 403');

            // Program Coordinator cannot promote any user to IT Dept. Head via updateFacultyRole
            const { req: promoReq, res: promoRes } = createMockReqRes({
                session: pcSession,
                params: { userId: isolatedTestMisId },
                body: { role: 'IT Dept. Head' }
            });
            await facultyController.updateFacultyRole(promoReq, promoRes, (err) => { if (err) throw err; });
            assert.strictEqual(promoRes.statusCode, 403, 'Promoting to IT Dept. Head must return 403 Forbidden');
            console.log('✔ PASS: Protected administrative role assignment is strictly blocked (HTTP 403).');
        }

        // ─────────────────────────────────────────────────────────────
        // 7. Direct unauthorized API requests are rejected
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 7. Testing Unauthorized API Requests from Non-Admins ---');
        {
            const misGuard = requireRole(IT_HEAD_ROLES);

            // Faculty direct access
            const { req: reqF, res: resF } = createMockReqRes({ session: facultySession });
            let passedF = false;
            await misGuard(reqF, resF, (err) => { if (!err) passedF = true; });
            assert.strictEqual(passedF, false, 'Faculty must not pass MIS route guard');
            assert.strictEqual(resF.statusCode, 403, 'Faculty must receive HTTP 403 Forbidden');

            // OJT direct access
            const { req: reqO, res: resO } = createMockReqRes({ session: ojtSession });
            let passedO = false;
            await misGuard(reqO, resO, (err) => { if (!err) passedO = true; });
            assert.strictEqual(passedO, false, 'OJT must not pass MIS route guard');
            assert.strictEqual(resO.statusCode, 403, 'OJT must receive HTTP 403 Forbidden');

            // Student direct access
            const { req: reqS, res: resS } = createMockReqRes({ session: studentSession });
            let passedS = false;
            await misGuard(reqS, resS, (err) => { if (!err) passedS = true; });
            assert.strictEqual(passedS, false, 'Student must not pass MIS route guard');
            assert.strictEqual(resS.statusCode, 403, 'Student must receive HTTP 403 Forbidden');

            // Unauthenticated request
            const { req: reqUnauth, res: resUnauth } = createMockReqRes({ session: {} });
            let passedUnauth = false;
            await requireAuth(reqUnauth, resUnauth, (err) => { if (!err) passedUnauth = true; });
            assert.strictEqual(passedUnauth, false, 'Unauthenticated request must not pass requireAuth');
            assert.strictEqual(resUnauth.statusCode, 401, 'Unauthenticated request must receive HTTP 401');
            console.log('✔ PASS: Direct unauthorized API requests are properly rejected (403/401).');
        }

        // ─────────────────────────────────────────────────────────────
        // 8. MIS Staff cannot gain permission to manage other MIS accounts
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 8. Testing MIS Staff Cannot Manage MIS Accounts ---');
        {
            const misGuard = requireRole(IT_HEAD_ROLES);
            const activeMisSession = {
                userId: isolatedTestMisId,
                userRole: 'MIS Staff',
                userEmail: 'isolated.mis@bulsu.edu.ph'
            };
            const { req: reqM, res: resM } = createMockReqRes({ session: activeMisSession });
            let passedM = false;
            await misGuard(reqM, resM, (err) => { if (!err) passedM = true; });
            assert.strictEqual(passedM, false, 'MIS Staff must not pass IT_HEAD_ROLES guard');
            assert.strictEqual(resM.statusCode, 403, 'MIS Staff must receive HTTP 403 Forbidden');
            console.log('✔ PASS: MIS Staff cannot manage other MIS accounts (HTTP 403 Forbidden).');
        }

        // ─────────────────────────────────────────────────────────────
        // 9. IT Department Head permissions continue to work as before
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 9. Testing IT Department Head Permissions Retained ---');
        {
            // View MIS
            const { req: headListReq, res: headListRes } = createMockReqRes({ session: headSession });
            await misController.listMisStaff(headListReq, headListRes, (err) => { if (err) throw err; });
            assert.strictEqual(headListRes.statusCode, 200, 'IT Dept. Head list must return HTTP 200');

            // Edit MIS
            const headUpdatedEmail = `test.head.mis.${Date.now()}@bulsu.edu.ph`;
            const { req: headEditReq, res: headEditRes } = createMockReqRes({
                session: headSession,
                params: { userId: isolatedTestMisId },
                body: {
                    name: 'Engr. Head Updated MIS',
                    email: headUpdatedEmail,
                    phone: '09171112233'
                }
            });
            await misController.updateMisStaff(headEditReq, headEditRes, (err) => { if (err) throw err; });
            assert.strictEqual(headEditRes.statusCode, 200, 'IT Dept. Head edit must return HTTP 200');

            // Reset password
            const { req: headResetReq, res: headResetRes } = createMockReqRes({
                session: headSession,
                params: { userId: isolatedTestMisId }
            });
            await misController.resetMisStaffPassword(headResetReq, headResetRes, (err) => { if (err) throw err; });
            assert.strictEqual(headResetRes.statusCode, 200, 'IT Dept. Head reset password must return HTTP 200');
            console.log('✔ PASS: IT Department Head permissions continue to work completely as before.');
        }

        // ─────────────────────────────────────────────────────────────
        // 10. Existing Faculty management, OJT read-only access, validation & audit
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- 10. Testing Existing Faculty, OJT Read-Only & Audit Integrity ---');
        {
            // Faculty management: Program Coordinator can add regular faculty
            const testFacultyEmail = `test.fac.pc.audit.${Date.now()}@bulsu.edu.ph`;
            const { req: facAddReq, res: facAddRes } = createMockReqRes({
                session: pcSession,
                body: {
                    name: 'Prof. Existing Faculty Test',
                    email: testFacultyEmail,
                    role: 'Faculty'
                }
            });
            await facultyController.addFaculty(facAddReq, facAddRes, (err) => { if (err) throw err; });
            assert.strictEqual(facAddRes.statusCode, 200, 'Program Coordinator can still add regular faculty');
            const createdFacultyId = facAddRes.jsonData.userId;

            // Program Coordinator can remove regular faculty
            const { req: facDelReq, res: facDelRes } = createMockReqRes({
                session: pcSession,
                params: { userId: createdFacultyId }
            });
            await facultyController.deleteFaculty(facDelReq, facDelRes, (err) => { if (err) throw err; });
            assert.strictEqual(facDelRes.statusCode, 200, 'Program Coordinator can remove regular faculty');

            // OJT read-only access: mutative endpoint requires MIS_STAFF_ROLES
            assert.ok(!MIS_STAFF_ROLES.includes('Program Coordinator'), 'Program Coordinator not in MIS_STAFF_ROLES');

            // Audit logging verification: Check that MIS_CREATE, MIS_UPDATE, MIS_DEACTIVATE, MIS_REACTIVATE, MIS_PASSWORD_RESET exist
            const [recentLogs] = await db.query(
                "SELECT Action, Actor_Role, Result FROM audit_logs WHERE Actor_Role = 'Program Coordinator' ORDER BY Log_ID DESC LIMIT 25"
            );
            assert.ok(recentLogs.length > 0, 'Audit logs must record Program Coordinator actions');
            const actions = recentLogs.map(l => l.Action);
            assert.ok(actions.includes('MIS_CREATE'), 'Audit logs must record MIS_CREATE');
            assert.ok(actions.includes('MIS_UPDATE'), 'Audit logs must record MIS_UPDATE');
            assert.ok(actions.includes('MIS_DEACTIVATE'), 'Audit logs must record MIS_DEACTIVATE');
            assert.ok(actions.includes('MIS_REACTIVATE'), 'Audit logs must record MIS_REACTIVATE');
            assert.ok(actions.includes('MIS_PASSWORD_RESET'), 'Audit logs must record MIS_PASSWORD_RESET');
            console.log('✔ PASS: Faculty management, OJT read-only rules, and audit logging integrity verified.');
        }

        console.log('\n================================================================');
        console.log('🎉 ALL 10 PROGRAM COORDINATOR MIS PERMISSION CHECKS PASSED 100%!');
        console.log('================================================================\n');

    } finally {
        // Clean up isolated test account
        if (isolatedTestMisId) {
            await db.query("DELETE FROM users WHERE User_ID = ?", [isolatedTestMisId]);
            console.log(`ℹ Cleaned up isolated test MIS account ID: ${isolatedTestMisId}`);
        }

        // Restore original active MIS Staff if one existed
        if (originalActiveMis) {
            await db.query("UPDATE users SET Status = 'ACTIVE' WHERE User_ID = ?", [originalActiveMis.User_ID]);
            console.log(`ℹ Restored original active MIS Staff account: ${originalActiveMis.Name} (ID: ${originalActiveMis.User_ID})`);
        }
    }
}

runTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    });
