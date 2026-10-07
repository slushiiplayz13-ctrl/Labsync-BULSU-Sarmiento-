/**
 * tests/test-program-coordinator-faculty-permissions.js
 * 
 * Comprehensive verification suite for Program Coordinator Faculty Management:
 * 1. Program Coordinator can create Faculty immediately (status ACTIVE).
 * 2. Program Coordinator can edit Faculty.
 * 3. Program Coordinator can remove normal Faculty.
 * 4. Program Coordinator can assign normal allowed roles (Faculty, Program Coordinator).
 * 5. Program Coordinator CANNOT assign 'IT Dept. Head' -> 403 Forbidden.
 * 6. Program Coordinator CANNOT delete the active IT Dept. Head -> 403 Forbidden.
 * 7. IT Dept. Head can still transfer leadership normally.
 * 8. Existing IT Dept. Head remains unchanged when Program Coordinator manages Faculty.
 * 9. Faculty remains blocked from Faculty Management.
 * 10. Audit logs correctly identify Program Coordinator actions & denials.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const facultyService = require('../services/facultyService');
const facultyController = require('../controllers/faculty.controller');
const facultyRepo = require('../repositories/faculty.repository');
const { IT_HEAD_ROLES, IT_DEPT_HEAD_EXCLUSIVE_ROLES, requireRole } = require('../middleware/auth');

function createMockReqRes({ session = {}, params = {}, body = {}, ip = '127.0.0.1' } = {}) {
    const req = {
        session,
        params,
        body,
        headers: {},
        originalUrl: '',
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

async function runFacultyPermissionTests() {
    console.log('================================================================');
    console.log('🧪 PROGRAM COORDINATOR FACULTY MANAGEMENT PERMISSIONS SUITE');
    console.log('================================================================\n');

    let createdFacultyId = null;
    let originalHead = null;
    let pcUser = null;

    try {
        // Find existing IT Dept. Head
        const [heads] = await db.query(
            "SELECT User_ID, Name, Email, Role FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head') LIMIT 1"
        );
        assert.ok(heads.length > 0, 'Must have at least one active IT Dept. Head in database');
        originalHead = heads[0];
        console.log(`ℹ Found active IT Dept. Head: ${originalHead.Name} (ID: ${originalHead.User_ID})`);

        // Find or create PC user
        const [pcUsers] = await db.query(
            "SELECT User_ID, Name, Email, Role FROM users WHERE Role = 'Program Coordinator' LIMIT 1"
        );
        pcUser = pcUsers[0];
        if (!pcUser) {
            const [insPc] = await db.query(
                "INSERT INTO users (Name, Email, Role, Status, Password) VALUES ('Test PC User', 'test.pc@bulsu.edu.ph', 'Program Coordinator', 'ACTIVE', 'hashed')"
            );
            pcUser = { User_ID: insPc.insertId, Name: 'Test PC User', Email: 'test.pc@bulsu.edu.ph', Role: 'Program Coordinator' };
        }

        // Find or create Faculty user
        const [facUsers] = await db.query(
            "SELECT User_ID, Name, Email, Role FROM users WHERE Role = 'Faculty' LIMIT 1"
        );
        let facUser = facUsers[0];
        if (!facUser) {
            const [insFac] = await db.query(
                "INSERT INTO users (Name, Email, Role, Status, Password) VALUES ('Test Faculty User', 'test.fac@bulsu.edu.ph', 'Faculty', 'ACTIVE', 'hashed')"
            );
            facUser = { User_ID: insFac.insertId, Name: 'Test Faculty User', Email: 'test.fac@bulsu.edu.ph', Role: 'Faculty' };
        }

        // Mock sessions
        const pcSession = {
            userId: pcUser.User_ID,
            userEmail: pcUser.Email,
            userRole: 'Program Coordinator',
            save(cb) { cb && cb(null); }
        };

        const headSession = {
            userId: originalHead.User_ID,
            userEmail: originalHead.Email,
            userRole: 'IT Dept. Head',
            save(cb) { cb && cb(null); }
        };

        const facultySession = {
            userId: facUser.User_ID,
            userEmail: facUser.Email,
            userRole: 'Faculty',
            save(cb) { cb && cb(null); }
        };

        // ─── TEST 1: ROUTE LEVEL AUTHORIZATION (Faculty Blocked, PC Allowed) ─────────
        console.log('--- 1. Testing Route Middleware Authorization ---');
        const itHeadGuard = requireRole(IT_HEAD_ROLES);

        const { req: facultyReq, res: facultyRes } = createMockReqRes({ session: facultySession });
        await itHeadGuard(facultyReq, facultyRes, () => {});
        assert.strictEqual(facultyRes.statusCode, 403, 'Regular faculty must receive 403 when accessing Faculty Management endpoints');
        console.log('✔ PASS: Regular Faculty is blocked from Faculty Management endpoints (403 Forbidden).');

        let middlewareAllowedPC = false;
        const { req: pcAuthReq, res: pcAuthRes } = createMockReqRes({ session: pcSession });
        await itHeadGuard(pcAuthReq, pcAuthRes, () => { middlewareAllowedPC = true; });
        assert.ok(middlewareAllowedPC, 'Program Coordinator must pass requireRole(IT_HEAD_ROLES) guard');
        console.log('✔ PASS: Program Coordinator passes route guard for Faculty Management.');

        // ─── TEST 2: PROGRAM COORDINATOR CREATES FACULTY IMMEDIATELY (ACTIVE) ──────
        console.log('\n--- 2. Testing Faculty Account Creation by Program Coordinator ---');
        const testFacultyEmail = `test.fac.${Date.now()}@bulsu.edu.ph`;
        const testFacultyName = `Prof Auto Test ${String.fromCharCode(65 + Math.floor(Math.random() * 26))} Dela Cruz`;

        const { req: addReq, res: addRes } = createMockReqRes({
            session: pcSession,
            body: {
                name: testFacultyName,
                email: testFacultyEmail,
                role: 'Faculty'
            }
        });

        await facultyController.addFaculty(addReq, addRes, (err) => { if (err) throw err; });
        assert.strictEqual(addRes.statusCode, 200, 'Program Coordinator must successfully create Faculty account');
        assert.ok(addRes.jsonData && addRes.jsonData.userId, 'Created response must return userId');
        createdFacultyId = addRes.jsonData.userId;

        // Verify account is immediately active in database
        const [createdUserRows] = await db.query(
            "SELECT User_ID, Name, Email, Role, Status FROM users WHERE User_ID = ?",
            [createdFacultyId]
        );
        assert.strictEqual(createdUserRows.length, 1, 'Newly created faculty record must exist');
        assert.strictEqual(createdUserRows[0].Role, 'Faculty', 'Newly created faculty role must be Faculty');
        assert.strictEqual(createdUserRows[0].Status, 'ACTIVE', 'Newly created faculty status must be immediately ACTIVE');
        console.log('✔ PASS: Program Coordinator created faculty account immediately with Status = ACTIVE (no pending/approval queue).');

        // ─── TEST 3: PROGRAM COORDINATOR CAN ASSIGN NORMAL ROLES (Program Coordinator) ─
        console.log('\n--- 3. Testing Program Coordinator Assigning Normal Role (PC) ---');
        const { req: editReqPC, res: editResPC } = createMockReqRes({
            session: pcSession,
            params: { userId: createdFacultyId },
            body: { role: 'Program Coordinator' }
        });

        await facultyController.updateFacultyRole(editReqPC, editResPC, (err) => { if (err) throw err; });
        assert.strictEqual(editResPC.statusCode, 200, 'Program Coordinator should be able to assign Program Coordinator role');

        const [userAfterPC] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [createdFacultyId]);
        assert.strictEqual(userAfterPC[0].Role, 'Program Coordinator', 'Role must update to Program Coordinator');

        // Verify IT Dept Head was NOT demoted
        const [headAfterPCAssign] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [originalHead.User_ID]);
        assert.strictEqual(headAfterPCAssign[0].Role, originalHead.Role, 'Original IT Dept Head must NOT be demoted when assigning Program Coordinator');

        // Verify previous Program Coordinator was demoted to Faculty
        const [prevPCAfter] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [pcUser.User_ID]);
        assert.strictEqual(prevPCAfter[0].Role, 'Faculty', 'Previous Program Coordinator must be demoted to Faculty when new Program Coordinator is assigned');
        console.log('✔ PASS: Assigning Program Coordinator demotes previous Program Coordinator to Faculty while IT Dept Head remains intact.');

        // ─── TEST 4: RESTORE PCUSER AS PROGRAM COORDINATOR ─────────────────────────
        console.log('\n--- 4. Testing Reassigning Program Coordinator Role Back to Original Coordinator ---');
        const activePCSession = {
            userId: createdFacultyId,
            userEmail: testFacultyEmail,
            userRole: 'Program Coordinator',
            save(cb) { cb && cb(null); }
        };

        const { req: editReqPC2, res: editResPC2 } = createMockReqRes({
            session: activePCSession,
            params: { userId: pcUser.User_ID },
            body: { role: 'Program Coordinator' }
        });

        await facultyController.updateFacultyRole(editReqPC2, editResPC2, (err) => { if (err) throw err; });
        assert.strictEqual(editResPC2.statusCode, 200, 'Active Program Coordinator should be able to reassign Program Coordinator role');

        const [pcUserRestored] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [pcUser.User_ID]);
        assert.strictEqual(pcUserRestored[0].Role, 'Program Coordinator', 'Original PC must be restored to Program Coordinator');

        const [createdUserDemoted] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [createdFacultyId]);
        assert.strictEqual(createdUserDemoted[0].Role, 'Faculty', 'Target user must be demoted back to Faculty');

        // Restore pcSession to pcUser with Program Coordinator role
        pcSession.userId = pcUser.User_ID;
        pcSession.userRole = 'Program Coordinator';
        console.log('✔ PASS: Program Coordinator successfully reassigned role back; target reverted to Faculty.');

        // ─── TEST 5: PROGRAM COORDINATOR CANNOT ASSIGN "IT Dept. Head" (403) ───────
        console.log('\n--- 5. Testing Backend Protection: Program Coordinator Assigning IT Dept. Head ---');
        const { req: illegalPromoReq, res: illegalPromoRes } = createMockReqRes({
            session: pcSession,
            params: { userId: createdFacultyId },
            body: { role: 'IT Dept. Head' }
        });

        await facultyController.updateFacultyRole(illegalPromoReq, illegalPromoRes, (err) => { if (err) throw err; });
        assert.strictEqual(illegalPromoRes.statusCode, 403, 'Program Coordinator attempting to assign IT Dept. Head must receive 403 Forbidden');
        assert.ok(
            illegalPromoRes.jsonData.error.includes('Only the IT Department Head can assign'),
            'Error message must indicate exclusive Dept. Head privilege'
        );

        // Verify target role was NOT changed
        const [userAfterFailedPromo] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [createdFacultyId]);
        assert.strictEqual(userAfterFailedPromo[0].Role, 'Faculty', 'User role must remain unchanged after rejected promotion');

        // Verify IT Dept Head was NOT demoted
        const [headAfterBlockedPromo] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [originalHead.User_ID]);
        assert.strictEqual(headAfterBlockedPromo[0].Role, originalHead.Role, 'Original IT Dept Head must NOT be demoted');
        console.log('✔ PASS: Program Coordinator is REJECTED with 403 Forbidden when attempting to assign "IT Dept. Head".');

        // ─── TEST 6: PROGRAM COORDINATOR CANNOT DEMOTE ACTIVE IT DEPT HEAD (403) ───
        console.log('\n--- 6. Testing Backend Protection: Program Coordinator Demoting Active IT Dept. Head ---');
        const { req: illegalDemoteReq, res: illegalDemoteRes } = createMockReqRes({
            session: pcSession,
            params: { userId: originalHead.User_ID },
            body: { role: 'Faculty' }
        });

        await facultyController.updateFacultyRole(illegalDemoteReq, illegalDemoteRes, (err) => { if (err) throw err; });
        assert.strictEqual(illegalDemoteRes.statusCode, 403, 'Program Coordinator attempting to modify IT Dept. Head account must receive 403 Forbidden');
        assert.ok(
            illegalDemoteRes.jsonData.error.includes('Only the IT Department Head can modify'),
            'Error message must indicate exclusive Dept. Head modification privilege'
        );

        const [headAfterBlockedDemote] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [originalHead.User_ID]);
        assert.strictEqual(headAfterBlockedDemote[0].Role, originalHead.Role, 'IT Dept Head role must remain untouched');
        console.log('✔ PASS: Program Coordinator is REJECTED with 403 Forbidden when attempting to demote IT Dept Head.');

        // ─── TEST 7: PROGRAM COORDINATOR CANNOT DELETE ACTIVE IT DEPT HEAD (403) ───
        console.log('\n--- 7. Testing Backend Protection: Deletion of Active IT Dept. Head ---');
        const { req: deleteHeadReq, res: deleteHeadRes } = createMockReqRes({
            session: pcSession,
            params: { userId: originalHead.User_ID }
        });

        await facultyController.deleteFaculty(deleteHeadReq, deleteHeadRes, (err) => { if (err) throw err; });
        assert.strictEqual(deleteHeadRes.statusCode, 403, 'Attempting to delete the active IT Dept. Head must receive 403 Forbidden');
        assert.ok(
            deleteHeadRes.jsonData.error.includes('active IT Department Head account cannot be deleted'),
            'Error message must indicate IT Dept Head deletion is forbidden'
        );

        const [headStillExists] = await db.query("SELECT User_ID FROM users WHERE User_ID = ?", [originalHead.User_ID]);
        assert.strictEqual(headStillExists.length, 1, 'IT Dept Head account must still exist');
        console.log('✔ PASS: Deletion of active IT Dept. Head account is REJECTED with 403 Forbidden.');

        // ─── TEST 8: PROGRAM COORDINATOR CAN REMOVE NORMAL FACULTY ─────────────────
        console.log('\n--- 8. Testing Program Coordinator Removing Normal Faculty ---');
        const { req: deleteNormalReq, res: deleteNormalRes } = createMockReqRes({
            session: pcSession,
            params: { userId: createdFacultyId }
        });

        await facultyController.deleteFaculty(deleteNormalReq, deleteNormalRes, (err) => { if (err) throw err; });
        assert.strictEqual(deleteNormalRes.statusCode, 200, 'Program Coordinator must be able to remove normal faculty accounts');

        const [deletedCheck] = await db.query("SELECT User_ID FROM users WHERE User_ID = ?", [createdFacultyId]);
        assert.strictEqual(deletedCheck.length, 0, 'Normal faculty record must be removed');
        createdFacultyId = null; // Cleaned up!
        console.log('✔ PASS: Program Coordinator successfully removed normal faculty account.');

        // ─── TEST 9: IT DEPT HEAD CAN TRANSFER LEADERSHIP NORMALLY ─────────────────
        console.log('\n--- 9. Testing IT Dept. Head Leadership Transfer Workflow ---');
        // Create a temporary candidate to test head transfer
        const tempEmail = `head.cand.${Date.now()}@bulsu.edu.ph`;
        const [candRes] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status, Password) VALUES ('Leadership Successor', ?, 'Faculty', 'ACTIVE', 'hashed')",
            [tempEmail]
        );
        const candId = candRes.insertId;

        try {
            const { req: transferReq, res: transferRes } = createMockReqRes({
                session: headSession,
                params: { userId: candId },
                body: { role: 'IT Dept. Head' }
            });

            await facultyController.updateFacultyRole(transferReq, transferRes, (err) => { if (err) throw err; });
            assert.strictEqual(transferRes.statusCode, 200, 'IT Dept. Head must be allowed to transfer leadership');

            const [candAfterTransfer] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [candId]);
            assert.strictEqual(candAfterTransfer[0].Role, 'IT Dept. Head', 'Candidate must now be IT Dept. Head');

            const [oldHeadAfterTransfer] = await db.query("SELECT Role FROM users WHERE User_ID = ?", [originalHead.User_ID]);
            assert.strictEqual(oldHeadAfterTransfer[0].Role, 'Faculty', 'Former head must be demoted to Faculty');
            console.log('✔ PASS: IT Dept. Head can transfer leadership, properly triggering demoteAllHeadsToFaculty.');
        } finally {
            // Restore original head and remove temp candidate
            await db.query("UPDATE users SET Role = 'IT Dept. Head' WHERE User_ID = ?", [originalHead.User_ID]);
            await db.query("DELETE FROM users WHERE User_ID = ?", [candId]);
            console.log('✔ Restored original IT Dept. Head and deleted temp successor.');
        }

        // ─── TEST 10: AUDIT LOGS CORRECTLY ATTRIBUTE ACTIONS & DENIALS ─────────────
        console.log('\n--- 10. Testing Audit Logs for Program Coordinator Actions & Denials ---');
        const [recentLogs] = await db.query(
            "SELECT Action, Actor_Role, Result, Details FROM audit_logs WHERE Actor_Role = 'Program Coordinator' ORDER BY Log_ID DESC LIMIT 10"
        );
        assert.ok(recentLogs.length > 0, 'Audit logs must contain events for Program Coordinator');

        const hasCreateSuccess = recentLogs.some(l => l.Action === 'FACULTY_CREATE' && l.Result === 'SUCCESS');
        const hasRoleUpdateSuccess = recentLogs.some(l => l.Action === 'FACULTY_ROLE_UPDATE' && l.Result === 'SUCCESS');
        const hasRoleDenied = recentLogs.some(l => l.Action === 'FACULTY_ROLE_UPDATE_DENIED' && l.Result === 'DENIED');
        const hasDeleteDenied = recentLogs.some(l => l.Action === 'FACULTY_DELETE_DENIED' && l.Result === 'DENIED');
        const hasDeleteSuccess = recentLogs.some(l => l.Action === 'FACULTY_DELETE' && l.Result === 'SUCCESS');

        assert.ok(hasCreateSuccess, 'Audit logs must capture FACULTY_CREATE SUCCESS by Program Coordinator');
        assert.ok(hasRoleUpdateSuccess, 'Audit logs must capture FACULTY_ROLE_UPDATE SUCCESS by Program Coordinator');
        assert.ok(hasRoleDenied, 'Audit logs must capture FACULTY_ROLE_UPDATE_DENIED by Program Coordinator');
        assert.ok(hasDeleteDenied, 'Audit logs must capture FACULTY_DELETE_DENIED by Program Coordinator');
        assert.ok(hasDeleteSuccess, 'Audit logs must capture FACULTY_DELETE SUCCESS by Program Coordinator');
        console.log('✔ PASS: Audit logging accurately attributes all actions and denials to Program Coordinator.');

        // ─── TEST 11: FRONTEND CODE GUARDS VERIFICATION ───────────────────────────
        console.log('\n--- 11. Testing Frontend Modal Script Restrictions ---');
        const editModalContent = fs.readFileSync(path.join(__dirname, '../js/faculty/modals/edit-role.modal.js'), 'utf-8');
        assert.ok(editModalContent.includes('isActorDeptHead'), 'edit-role.modal.js must inspect actor role');
        assert.ok(editModalContent.includes('deptHeadOption'), 'edit-role.modal.js must conditionally build IT Dept Head option');
        assert.ok(editModalContent.includes('Only the IT Department Head can transfer'), 'edit-role.modal.js must block client submission');

        const deleteModalContent = fs.readFileSync(path.join(__dirname, '../js/faculty/modals/delete-faculty.modal.js'), 'utf-8');
        assert.ok(deleteModalContent.includes('The active IT Department Head account cannot be removed'), 'delete-faculty.modal.js must guard against deleting IT Dept Head');
        console.log('✔ PASS: Frontend modal files correctly hide IT Dept Head options and block invalid submissions.');

        console.log('\n================================================================');
        console.log('🎉 ALL 11 PROGRAM COORDINATOR FACULTY PERMISSION TESTS PASSED 100%!');
        console.log('================================================================');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    } finally {
        if (createdFacultyId) {
            await db.query("DELETE FROM users WHERE User_ID = ?", [createdFacultyId]).catch(() => {});
        }
        if (pcUser) {
            await db.query("UPDATE users SET Role = 'Program Coordinator' WHERE User_ID = ?", [pcUser.User_ID]).catch(() => {});
        }
        if (originalHead) {
            await db.query("UPDATE users SET Role = 'IT Dept. Head' WHERE User_ID = ?", [originalHead.User_ID]).catch(() => {});
        }
    }
}

runFacultyPermissionTests()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
