/**
 * tests/test-mis-authorization-gaps.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test suite covering the three authorization and lifecycle gaps
 * identified in the read-only audit:
 *
 * 1. Password-Reset Target Validation:
 *    - Rejects attempts to reset passwords for non-MIS accounts:
 *      IT Dept Head, Program Coordinator, Faculty, OJT, Student, invalid IDs.
 *    - Verifies requests from both IT Dept Head and Program Coordinator.
 *    - Verifies password hash remains unchanged, no email sent, no success audit log.
 *
 * 2. Password-Reset Behavior for Deactivated MIS Staff:
 *    - Verifies existing lifecycle policy: reset generates new temporary password.
 *    - Verifies account Status strictly remains 'DEACTIVATED' (no implicit reactivation).
 *    - Verifies login with new password is strictly rejected with 401 ACCOUNT_DEACTIVATED.
 *    - Verifies route access with deactivated session is strictly rejected with 401.
 *
 * 3. Denied-Access Security Audit Logging:
 *    - Verifies direct requests by unauthorized roles (MIS Staff, Faculty, OJT, Student)
 *      are rejected with HTTP 403 Forbidden.
 *    - Verifies generation of MIS_ACCESS_DENIED security audit log entries.
 *    - Verifies audit payload fields (acting role, user ID, attempted path, result DENIED).
 *    - Verifies zero side-effects on user data.
 *
 * Safety & Isolation:
 * - Uses in-memory mock fixtures and safety guards.
 * - Enforces zero writes to the development/production database.
 */

'use strict';

const assert = require('assert');
const bcrypt = require('bcrypt');
const db = require('../database/connection');
const capturedAuditLogs = [];
const capturedEmails = [];

// Intercept emailService in require.cache before misService is loaded
const emailServicePath = require.resolve('../services/emailService');
const originalEmailServiceExports = require('../services/emailService');
require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: {
        ...originalEmailServiceExports,
        sendWelcomeEmail: async function mockSendWelcomeEmail(email, name, password, role) {
            capturedEmails.push({ email, name, password, role });
            return true;
        }
    }
};

const misService = require('../services/misService');
const misController = require('../controllers/mis.controller');
const misRepository = require('../repositories/mis.repository');
const userRepository = require('../repositories/user.repository');
const auditService = require('../services/auditService');
const auditRepository = require('../repositories/audit.repository');
const authService = require('../services/authService');
const misRoutes = require('../routes/mis.routes');
const { requireRole, IT_HEAD_ROLES } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// 0. Safety Guard & In-Memory Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

// Safety check: Fail safely if any write query targets real database
const originalDbQuery = db.query.bind(db);
const writeSqlPattern = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i;

db.query = async function safeQueryGuard(sql, params) {
    if (typeof sql === 'string' && writeSqlPattern.test(sql)) {
        throw new Error(`[SAFETY GUARD VIOLATION] Database write rejected against real database: "${sql.slice(0, 60)}"`);
    }
    if (typeof sql === 'string' && /FROM\s+users\s+WHERE/i.test(sql)) {
        const uid = params && params[0];
        const u = mockUsers.find(user => user.User_ID === Number(uid));
        if (!u) return [[]];
        if (sql.includes("Role = 'MIS Staff'") && u.Role !== 'MIS Staff') return [[]];
        return [[u]];
    }
    return originalDbQuery(sql, params);
};

// Isolated in-memory fixture accounts
const INITIAL_HASH = '$2b$12$e80MvX9/QoF8OomzQ2X21OPkL5o74c3yqP1P65z5J0w1hQvFqK0e2'; // bcrypt mock

let mockUsers = [
    { User_ID: 1, Name: 'Andrei Gabito (Head)', Email: 'andrei.head@bulsu.edu.ph', Role: 'IT Dept. Head', Status: 'ACTIVE', Password: INITIAL_HASH },
    { User_ID: 3, Name: 'Santi Esplana (Coord)', Email: 'santi.coord@bulsu.edu.ph', Role: 'Program Coordinator', Status: 'ACTIVE', Password: INITIAL_HASH },
    { User_ID: 50, Name: 'Prof. Juan Faculty', Email: 'juan.faculty@bulsu.edu.ph', Role: 'Faculty', Status: 'ACTIVE', Password: INITIAL_HASH },
    { User_ID: 70, Name: 'Maria Student', Email: 'maria.student@bulsu.edu.ph', Role: 'Student', Status: 'ACTIVE', Password: INITIAL_HASH },
    { User_ID: 80, Name: 'Alex OJT Intern', Email: 'alex.ojt@bulsu.edu.ph', Role: 'OJT', Status: 'ACTIVE', Password: INITIAL_HASH, OJT_End_Date: '2026-12-31' },
    { User_ID: 100, Name: 'Miles Active MIS', Email: 'miles.mis@bulsu.edu.ph', Role: 'MIS Staff', Status: 'ACTIVE', Password: INITIAL_HASH, Phone: '09171112233' },
    { User_ID: 101, Name: 'Old Deactivated MIS', Email: 'old.mis@bulsu.edu.ph', Role: 'MIS Staff', Status: 'DEACTIVATED', Password: INITIAL_HASH, Phone: '09174445566' }
];

// Repository spies and stubs
const originalMisFindById = misRepository.findById;
const originalUserUpdatePasswordOnly = userRepository.updatePasswordOnly;
const originalUserFindByEmail = userRepository.findByEmail;
const originalAuditInsert = auditRepository.insertAuditLog;

misRepository.findById = async function mockMisFindById(userId) {
    const user = mockUsers.find(u => u.User_ID === Number(userId) && u.Role === 'MIS Staff');
    return [user ? [user] : []];
};

userRepository.updatePasswordOnly = async function mockUpdatePasswordOnly(userId, passwordHash) {
    const user = mockUsers.find(u => u.User_ID === Number(userId));
    if (user) {
        user.Password = passwordHash;
        user.Updated_At = new Date();
    }
    return [{ affectedRows: user ? 1 : 0 }];
};

userRepository.findByEmail = async function mockFindByEmail(email) {
    const user = mockUsers.find(u => u.Email.toLowerCase() === String(email).trim().toLowerCase());
    return [user ? [user] : []];
};

auditRepository.insertAuditLog = async function mockInsertAuditLog(entry) {
    capturedAuditLogs.push({ ...entry, timestamp: new Date() });
    return [{ insertId: capturedAuditLogs.length }];
};

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

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────

async function runTestSuite() {
    console.log('================================================================');
    console.log('🧪 MIS STAFF MANAGEMENT AUTHORIZATION GAPS REGRESSION SUITE');
    console.log('================================================================\n');

    const itHeadSession = { userId: 1, userRole: 'IT Dept. Head', userEmail: 'andrei.head@bulsu.edu.ph' };
    const pcSession = { userId: 3, userRole: 'Program Coordinator', userEmail: 'santi.coord@bulsu.edu.ph' };

    try {
        // ─────────────────────────────────────────────────────────────────────
        // GAP 1: Password-Reset Target Validation
        // ─────────────────────────────────────────────────────────────────────
        console.log('--- 1. Testing Password-Reset Target Validation (Non-MIS Accounts) ---');

        const nonMisTargets = [
            { id: 1, label: 'IT Department Head', initialHash: mockUsers.find(u => u.User_ID === 1).Password },
            { id: 3, label: 'Program Coordinator', initialHash: mockUsers.find(u => u.User_ID === 3).Password },
            { id: 50, label: 'Faculty', initialHash: mockUsers.find(u => u.User_ID === 50).Password },
            { id: 70, label: 'Student', initialHash: mockUsers.find(u => u.User_ID === 70).Password },
            { id: 80, label: 'OJT Intern', initialHash: mockUsers.find(u => u.User_ID === 80).Password }
        ];

        // 1A. Test Program Coordinator and IT Dept Head attempting to reset non-MIS accounts
        for (const actor of [{ name: 'Program Coordinator', session: pcSession }, { name: 'IT Dept. Head', session: itHeadSession }]) {
            for (const target of nonMisTargets) {
                const logsBefore = capturedAuditLogs.length;
                const emailsBefore = capturedEmails.length;

                const { req, res } = createMockReqRes({
                    session: actor.session,
                    params: { userId: target.id },
                    originalUrl: `/api/mis-staff/${target.id}/reset-password`
                });

                await misController.resetMisStaffPassword(req, res, () => {});

                // Assert rejected with HTTP 404
                assert.strictEqual(
                    res.statusCode,
                    404,
                    `${actor.name} resetting password for ${target.label} (ID: ${target.id}) must return HTTP 404`
                );
                assert.ok(
                    res.jsonData && res.jsonData.error.includes('MIS Staff account not found'),
                    `Response error must explain target is not an MIS Staff account (received: "${res.jsonData && res.jsonData.error}")`
                );

                // Assert target account password hash was NOT modified
                const currentTarget = mockUsers.find(u => u.User_ID === target.id);
                assert.strictEqual(
                    currentTarget.Password,
                    target.initialHash,
                    `Password hash for ${target.label} must remain unaltered`
                );

                // Assert zero emails dispatched
                assert.strictEqual(
                    capturedEmails.length,
                    emailsBefore,
                    `Zero reset emails must be dispatched when resetting non-MIS target ${target.label}`
                );

                // Assert zero MIS_PASSWORD_RESET audit events logged
                const successAudit = capturedAuditLogs.slice(logsBefore).find(l => l.action === 'MIS_PASSWORD_RESET');
                assert.strictEqual(
                    successAudit,
                    undefined,
                    `Zero MIS_PASSWORD_RESET audit events must be logged for rejected target ${target.label}`
                );
            }
        }
        console.log('✔ PASS: All attempts to reset non-MIS accounts (IT Head, Coordinator, Faculty, OJT, Student) rejected with HTTP 404.');

        // 1B. Test non-existent and invalid user IDs
        const invalidIdCases = [
            { id: 999999, expectedStatus: 404, expectedError: 'MIS Staff account not found' },
            { id: 'abc', expectedStatus: 400, expectedError: 'Invalid user ID' },
            { id: '-5', expectedStatus: 400, expectedError: 'Invalid user ID' },
            { id: '0', expectedStatus: 400, expectedError: 'Invalid user ID' }
        ];

        for (const testCase of invalidIdCases) {
            const { req, res } = createMockReqRes({
                session: pcSession,
                params: { userId: testCase.id },
                originalUrl: `/api/mis-staff/${testCase.id}/reset-password`
            });

            await misController.resetMisStaffPassword(req, res, () => {});

            assert.strictEqual(
                res.statusCode,
                testCase.expectedStatus,
                `User ID "${testCase.id}" must return HTTP ${testCase.expectedStatus}`
            );
            assert.ok(
                res.jsonData && res.jsonData.error.includes(testCase.expectedError),
                `User ID "${testCase.id}" error must mention "${testCase.expectedError}"`
            );
        }
        console.log('✔ PASS: Non-existent and malformed user IDs properly rejected with 404 and 400.');

        // 1C. Positive control: Valid active MIS Staff target
        {
            const emailsBefore = capturedEmails.length;
            const logsBefore = capturedAuditLogs.length;

            const { req, res } = createMockReqRes({
                session: pcSession,
                params: { userId: 100 },
                originalUrl: '/api/mis-staff/100/reset-password'
            });

            await misController.resetMisStaffPassword(req, res, () => {});

            assert.strictEqual(res.statusCode, 200, 'Valid MIS Staff password reset must return HTTP 200');
            assert.ok(res.jsonData.temporaryPassword, 'Response must include generated temporaryPassword');
            assert.ok(res.jsonData.temporaryPassword.length >= 12, 'Password must have high entropy (>= 12 chars)');

            // Verify password hash updated
            const activeMis = mockUsers.find(u => u.User_ID === 100);
            assert.notStrictEqual(activeMis.Password, INITIAL_HASH, 'Active MIS password hash must be updated in database/store');

            // Verify email dispatched and audit event logged
            assert.strictEqual(capturedEmails.length, emailsBefore + 1, 'Welcome/reset email must be dispatched for valid MIS target');
            const auditEntry = capturedAuditLogs.slice(logsBefore).find(l => l.action === 'MIS_PASSWORD_RESET');
            assert.ok(auditEntry, 'MIS_PASSWORD_RESET audit event must be logged');
            assert.strictEqual(auditEntry.result, 'SUCCESS', 'Audit result must be SUCCESS');
            assert.strictEqual(Number(auditEntry.resourceId), 100, 'Audit resourceId must be target user ID');
            console.log('✔ PASS: Positive control verified: Program Coordinator can reset valid MIS Staff account.');
        }

        // ─────────────────────────────────────────────────────────────────────
        // GAP 2: Password-Reset Behavior for Deactivated MIS Staff
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing Password-Reset Behavior for Deactivated MIS Staff ---');

        const deactTarget = mockUsers.find(u => u.User_ID === 101);
        assert.strictEqual(deactTarget.Status, 'DEACTIVATED', 'Target account must initially be DEACTIVATED');

        // 2A. Trigger reset on deactivated MIS Staff account
        const { req: resetDeactReq, res: resetDeactRes } = createMockReqRes({
            session: pcSession,
            params: { userId: 101 },
            originalUrl: '/api/mis-staff/101/reset-password'
        });

        await misController.resetMisStaffPassword(resetDeactReq, resetDeactRes, () => {});

        assert.strictEqual(resetDeactRes.statusCode, 200, 'Resetting deactivated MIS account must succeed (HTTP 200)');
        assert.ok(resetDeactRes.jsonData.temporaryPassword, 'Must return temporary password');
        const newDeactPassword = resetDeactRes.jsonData.temporaryPassword;

        // 2B. Status Invariance: Must strictly remain DEACTIVATED
        assert.strictEqual(deactTarget.Status, 'DEACTIVATED', 'Resetting password must NOT reactivate the account');
        assert.notStrictEqual(deactTarget.Password, INITIAL_HASH, 'Password hash must be updated');
        console.log('✔ PASS: Resetting password on deactivated MIS account updates credentials while preserving Status = DEACTIVATED.');

        // 2C. Login Prohibition: Deactivated user CANNOT log in even with new temporary password
        const loginAttempt = await authService.loginUser(deactTarget.Email, newDeactPassword);
        assert.strictEqual(loginAttempt.status, 401, 'Login for deactivated account must be rejected with HTTP 401');
        assert.strictEqual(loginAttempt.code, 'ACCOUNT_DEACTIVATED', 'Error code must strictly be ACCOUNT_DEACTIVATED');
        console.log('✔ PASS: Deactivated account login with newly reset password is strictly rejected with 401 ACCOUNT_DEACTIVATED.');

        // 2D. Session & Route Enforcement: Attempting protected route access with deactivated session
        const deactUserSession = { userId: 101, userRole: 'MIS Staff', userEmail: deactTarget.Email };
        let sessionDestroyed = false;
        let cookieCleared = false;
        deactUserSession.destroy = function(cb) { sessionDestroyed = true; cb && cb(); };

        const { req: deactRouteReq, res: deactRouteRes } = createMockReqRes({
            session: deactUserSession,
            originalUrl: '/api/mis-staff'
        });
        deactRouteRes.clearCookie = function() { cookieCleared = true; return this; };

        const itHeadGuard = requireRole(IT_HEAD_ROLES);
        let routePassed = false;
        await itHeadGuard(deactRouteReq, deactRouteRes, (err) => { if (!err) routePassed = true; });

        assert.strictEqual(routePassed, false, 'Deactivated account must not pass route guard');
        assert.strictEqual(deactRouteRes.statusCode, 401, 'Deactivated session must receive HTTP 401');
        assert.strictEqual(deactRouteRes.jsonData.code, 'ACCOUNT_DEACTIVATED', 'Route code must be ACCOUNT_DEACTIVATED');
        assert.strictEqual(sessionDestroyed, true, 'Deactivated session must be destroyed');
        assert.strictEqual(cookieCleared, true, 'Session cookie must be cleared');
        console.log('✔ PASS: Route guard destroys session and rejects deactivated MIS account with 401 ACCOUNT_DEACTIVATED.');

        // ─────────────────────────────────────────────────────────────────────
        // GAP 3: Denied-Access Security Audit Logging
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 3. Testing Denied-Access Security Audit Logging for Unauthorized Roles ---');

        const unauthorizedRoles = [
            { role: 'MIS Staff', userId: 100, email: 'miles.mis@bulsu.edu.ph' },
            { role: 'Faculty', userId: 50, email: 'juan.faculty@bulsu.edu.ph' },
            { role: 'OJT', userId: 80, email: 'alex.ojt@bulsu.edu.ph' },
            { role: 'Student', userId: 70, email: 'maria.student@bulsu.edu.ph' }
        ];

        const testEndpoints = [
            { method: 'GET', path: '/api/mis-staff/' },
            { method: 'POST', path: '/api/mis-staff/' },
            { method: 'PUT', path: '/api/mis-staff/100' },
            { method: 'PUT', path: '/api/mis-staff/100/deactivate' },
            { method: 'PUT', path: '/api/mis-staff/101/reactivate' },
            { method: 'POST', path: '/api/mis-staff/100/reset-password' }
        ];

        // Retrieve audit logs before testing unauthorized hits
        for (const unauthorized of unauthorizedRoles) {
            for (const ep of testEndpoints) {
                const logsBefore = capturedAuditLogs.length;

                const unauthorizedSession = {
                    userId: unauthorized.userId,
                    userRole: unauthorized.role,
                    userEmail: unauthorized.email
                };

                const { req, res } = createMockReqRes({
                    session: unauthorizedSession,
                    originalUrl: ep.path
                });

                req.method = ep.method;
                req.url = ep.path.replace(/^\/api\/mis-staff/, '') || '/';

                // Execute the router stack of mis.routes.js (requireAuth -> auditUnauthorizedMisAccess -> requireRole)
                let nextCalled = false;
                await new Promise((resolve) => {
                    misRoutes.handle(req, res, (err) => {
                        if (err) console.error('misRoutes.handle error:', err);
                        nextCalled = true;
                        resolve();
                    });
                    // If res.json was called, resolve
                    const origJson = res.json.bind(res);
                    res.json = function(data) {
                        origJson(data);
                        resolve();
                    };
                });

                // 1. Assert HTTP Status is 403 Forbidden
                assert.strictEqual(
                    res.statusCode,
                    403,
                    `Role ${unauthorized.role} requesting ${ep.method} ${ep.path} must receive HTTP 403 Forbidden (got ${res.statusCode})`
                );
                assert.strictEqual(nextCalled, false, `Downstream handlers must NOT be called for unauthorized role ${unauthorized.role}`);

                // 2. Assert MIS_ACCESS_DENIED audit log was recorded
                const accessDeniedLogs = capturedAuditLogs.slice(logsBefore).filter(l => l.action === 'MIS_ACCESS_DENIED');
                assert.strictEqual(
                    accessDeniedLogs.length,
                    1,
                    `Exactly one MIS_ACCESS_DENIED audit event must be generated for ${unauthorized.role} on ${ep.path}`
                );

                const auditEvent = accessDeniedLogs[0];
                assert.strictEqual(auditEvent.action, 'MIS_ACCESS_DENIED', 'Action must be MIS_ACCESS_DENIED');
                assert.strictEqual(auditEvent.actorRole, unauthorized.role, `Actor_Role must match unauthorized role "${unauthorized.role}"`);
                assert.strictEqual(auditEvent.userId, unauthorized.userId, `User_ID must match acting user ID ${unauthorized.userId}`);
                assert.strictEqual(auditEvent.result, 'DENIED', 'Audit result must be DENIED');
                assert.strictEqual(auditEvent.resourceType, 'USER', 'Resource_Type must be USER');
                assert.strictEqual(auditEvent.details.attemptedPath, ep.path, `Attempted path must match "${ep.path}"`);
                assert.ok(
                    auditEvent.details.reason && auditEvent.details.reason.includes('Insufficient privileges'),
                    'Audit details must cite insufficient privileges'
                );
            }
        }
        console.log('✔ PASS: Direct requests from MIS Staff, Faculty, OJT, and Student are rejected with 403 and logged under MIS_ACCESS_DENIED.');

        // 3B. Verify Zero Side-Effects on Application State
        assert.strictEqual(mockUsers.length, 7, 'User count must remain exactly 7 (zero unauthorized accounts created)');
        const finalActiveMis = mockUsers.find(u => u.User_ID === 100);
        assert.strictEqual(finalActiveMis.Status, 'ACTIVE', 'Active MIS must not be modified by unauthorized attempts');
        const finalDeactMis = mockUsers.find(u => u.User_ID === 101);
        assert.strictEqual(finalDeactMis.Status, 'DEACTIVATED', 'Deactivated MIS must not be modified by unauthorized attempts');
        console.log('✔ PASS: Zero side-effects: no unauthorized accounts created, updated, status-altered, or reset.');

        console.log('\n================================================================');
        console.log('🎉 ALL 3 AUTHORIZATION GAP REGRESSION TEST SUITES PASSED 100%!');
        console.log('================================================================\n');

    } finally {
        // Restore repository stubs & query guards
        db.query = originalDbQuery;
        misRepository.findById = originalMisFindById;
        userRepository.updatePasswordOnly = originalUserUpdatePasswordOnly;
        auditRepository.insertAuditLog = originalAuditInsert;
        require.cache[emailServicePath] = {
            id: emailServicePath,
            filename: emailServicePath,
            loaded: true,
            exports: originalEmailServiceExports
        };
    }
}

runTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    });
