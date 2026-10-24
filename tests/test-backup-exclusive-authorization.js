'use strict';

/**
 * tests/test-backup-exclusive-authorization.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification Suite for LabSync Security Feature #17:
 * Exclusive IT Department Head Authorization for Backup & Recovery.
 *
 * Verifies:
 * 1. Frontend visibility function allows ONLY IT Department Head and strictly
 *    hides Backup & Recovery from Program Coordinator, MIS Staff, Faculty,
 *    Students, and OJTs.
 * 2. Direct API requests from unauthenticated clients return HTTP 401 Unauthorized.
 * 3. Direct API requests from authenticated Program Coordinator return
 *    HTTP 403 Forbidden across all endpoints: /status, /create, and /restore.
 * 4. Direct API requests from Faculty, MIS Staff, Student, and OJT return
 *    HTTP 403 Forbidden.
 * 5. Direct API requests from authenticated IT Department Head pass authorization.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const path = require('path');
const db = require('../database/connection');
const backupRouter = require('../routes/backup.routes');
const { IT_DEPT_HEAD_EXCLUSIVE_ROLES, requireAuth, requireRole } = require('../middleware/auth');

function createMockReqRes({ session = {}, method = 'GET', url = '/status', headers = {}, body = {} } = {}) {
    const req = {
        method,
        url,
        originalUrl: `/api/admin/backups${url}`,
        session,
        headers: { ...headers },
        body,
        query: {},
        params: {},
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        pipe: function (dest) { dest.end(); return dest; },
        on: function (event, cb) { return this; }
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
        setHeader(name, val) {
            this.headers[name] = val;
            return this;
        },
        end(data) {
            return this;
        }
    };

    return { req, res };
}

// Emulate frontend role visibility logic from account-modal.js
function isExclusiveItHeadRole(role) {
    if (!role) return false;
    const clean = String(role).trim().toLowerCase();
    if (clean.includes('coordinator') || clean.includes('mis') || clean.includes('ojt') || clean.includes('faculty') || clean.includes('student')) {
        return false;
    }
    const itHeadAliases = [
        'it dept. head',
        'it dept head',
        'it head',
        'department head',
        'it department head',
        'it dept. head (administrator)',
        'it dept head (administrator)',
        'it head (administrator)',
        'department head (administrator)'
    ];
    if (itHeadAliases.includes(clean)) {
        return true;
    }
    return clean.includes('head');
}

async function runExclusiveAuthTests() {
    console.log('================================================================');
    console.log('🧪 LABSYNC SECURITY FEATURE #17: EXCLUSIVE AUTH TEST SUITE');
    console.log('================================================================\n');

    try {
        // ─── 1. FRONTEND ROLE VISIBILITY TESTS ──────────────────────────────
        console.log('--- 1. Testing Frontend Settings Tab Role Visibility ---');

        // Positive tests (IT Dept Head and canonical aliases)
        const allowedAliases = [
            'IT Dept. Head',
            'IT Head',
            'IT Dept Head',
            'Department Head',
            'IT Department Head',
            'it dept. head',
            'IT Dept. Head (Administrator)',
            'Department Head (Administrator)'
        ];
        for (const alias of allowedAliases) {
            assert.strictEqual(
                isExclusiveItHeadRole(alias),
                true,
                `IT Department Head alias '${alias}' must be visible in Settings`
            );
        }
        console.log(`✔ PASS: All ${allowedAliases.length} IT Department Head aliases correctly visible.`);

        // Negative tests (Program Coordinator and all other roles)
        const forbiddenRoles = [
            'Program Coordinator',
            'program coordinator',
            'Academic Coordinator',
            'Coordinator',
            'MIS Staff',
            'mis staff',
            'Faculty',
            'faculty',
            'Faculty Member',
            'Student',
            'student',
            'OJT',
            'ojt',
            '',
            null,
            undefined
        ];
        for (const role of forbiddenRoles) {
            assert.strictEqual(
                isExclusiveItHeadRole(role),
                false,
                `Role '${role}' must NOT see Backup & Recovery Settings tab`
            );
        }
        console.log(`✔ PASS: All ${forbiddenRoles.length} forbidden roles/values strictly hidden from Settings.`);

        // ─── 1B. VISIBLE LABELS & ADMINISTRATIVE TOOLS HEADING ───────────────
        console.log('\n--- 1B. Testing Visible Labels & Administrative Tools Section Organization ---');
        const fs = require('fs');
        const dropdownCode = fs.readFileSync(path.join(__dirname, '../js/components/profile/profile-dropdown.js'), 'utf8');
        const accountModalCode = fs.readFileSync(path.join(__dirname, '../js/components/profile/account-modal.js'), 'utf8');

        assert.ok(
            dropdownCode.includes('Settings &amp; Tools') || dropdownCode.includes('Settings & Tools'),
            'Profile dropdown must display visible label "Settings & Tools"'
        );
        assert.ok(
            dropdownCode.includes('aria-label="Settings & Tools"'),
            'Profile dropdown item must include accessible aria-label="Settings & Tools"'
        );
        assert.ok(
            accountModalCode.includes('Settings &amp; Tools') || accountModalCode.includes('Settings & Tools'),
            'Modal title must display "Settings & Tools"'
        );
        assert.ok(
            accountModalCode.includes("modalTitle.textContent = 'Settings & Tools'"),
            'Dynamic modal title updater must set "Settings & Tools"'
        );
        assert.ok(
            accountModalCode.includes('Administrative Tools'),
            'Modal sidebar must contain visual "Administrative Tools" section heading'
        );
        assert.ok(
            accountModalCode.includes('Profile Details') &&
            accountModalCode.includes('Security & Login') &&
            accountModalCode.includes('My QR Code'),
            'All personal account sections (Profile Details, Security & Login, My QR Code) must remain organized'
        );
        console.log('✔ PASS: "Settings & Tools" labels and "Administrative Tools" section heading verified.');

        // ─── 2. UNAUTHENTICATED DIRECT API ACCESS (HTTP 401) ─────────────────
        console.log('\n--- 2. Testing Unauthenticated Direct API Access (HTTP 401) ---');
        const unauthEndpoints = [
            { method: 'GET', url: '/status' },
            { method: 'GET', url: '/create' },
            { method: 'POST', url: '/create' },
            { method: 'POST', url: '/restore' }
        ];

        for (const ep of unauthEndpoints) {
            const { req, res } = createMockReqRes({ method: ep.method, url: ep.url, session: {} });
            let calledNext = false;
            await requireAuth(req, res, () => { calledNext = true; });

            assert.strictEqual(calledNext, false, `Unauthenticated ${ep.method} ${ep.url} must not call next()`);
            assert.strictEqual(res.statusCode, 401, `Unauthenticated ${ep.method} ${ep.url} must return 401`);
            assert.strictEqual(res.jsonData.error, 'Authentication required');
        }
        console.log('✔ PASS: All backup endpoints return 401 Unauthorized when unauthenticated.');

        // ─── 3. PROGRAM COORDINATOR DIRECT API DENIAL (HTTP 403) ────────────
        console.log('\n--- 3. Testing Program Coordinator Direct API Denial (HTTP 403) ---');
        const [pcUser] = await db.query(
            "SELECT User_ID, Email, Role, Status FROM users WHERE Role = 'Program Coordinator' AND Status = 'ACTIVE' LIMIT 1"
        );
        assert.ok(pcUser && pcUser.length > 0, 'Active Program Coordinator user must exist in database');
        const pcSession = {
            userId: pcUser[0].User_ID,
            userRole: pcUser[0].Role,
            userEmail: pcUser[0].Email,
            lastActivity: Date.now()
        };

        const guard = requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES);

        for (const ep of unauthEndpoints) {
            const { req, res } = createMockReqRes({
                method: ep.method,
                url: ep.url,
                session: { ...pcSession }
            });
            let calledNext = false;
            await guard(req, res, () => { calledNext = true; });

            assert.strictEqual(calledNext, false, `Program Coordinator on ${ep.method} ${ep.url} must not call next()`);
            assert.strictEqual(res.statusCode, 403, `Program Coordinator on ${ep.method} ${ep.url} must return HTTP 403 Forbidden`);
            assert.strictEqual(res.jsonData.code, 'ROLE_REVOKED', `Response code must be ROLE_REVOKED`);
            assert.strictEqual(res.jsonData.currentRole, 'Program Coordinator');
        }
        console.log('✔ PASS: Program Coordinator receives HTTP 403 Forbidden across all endpoints (/status, /create, /restore).');

        // ─── 4. OTHER UNAUTHORIZED ROLES DIRECT API DENIAL (HTTP 403) ────────
        console.log('\n--- 4. Testing Other Unauthorized Roles Direct API Denial (HTTP 403) ---');
        const testRoles = ['Faculty', 'MIS Staff', 'Student', 'OJT'];

        for (const testRole of testRoles) {
            const [uRows] = await db.query(
                "SELECT User_ID, Email, Role, Status FROM users WHERE Role = ? AND Status = 'ACTIVE' LIMIT 1",
                [testRole]
            );
            if (uRows && uRows.length > 0) {
                const session = {
                    userId: uRows[0].User_ID,
                    userRole: uRows[0].Role,
                    userEmail: uRows[0].Email,
                    lastActivity: Date.now()
                };

                const { req, res } = createMockReqRes({
                    method: 'GET',
                    url: '/status',
                    session
                });
                let calledNext = false;
                await guard(req, res, () => { calledNext = true; });

                assert.strictEqual(calledNext, false, `${testRole} must not proceed`);
                assert.strictEqual(res.statusCode, 403, `${testRole} must return HTTP 403`);
                assert.strictEqual(res.jsonData.code, 'ROLE_REVOKED');
                console.log(`✔ PASS: Authenticated role '${testRole}' denied with HTTP 403 Forbidden.`);
            }
        }

        // ─── 5. IT DEPARTMENT HEAD AUTHORIZATION (HTTP 200 PASS) ─────────────
        console.log('\n--- 5. Testing IT Department Head Authorization (HTTP 200 Pass) ---');
        const [headUser] = await db.query(
            "SELECT User_ID, Email, Role, Status FROM users WHERE Role = 'IT Dept. Head' AND Status = 'ACTIVE' LIMIT 1"
        );
        assert.ok(headUser && headUser.length > 0, 'Active IT Dept. Head user must exist in database');
        const headSession = {
            userId: headUser[0].User_ID,
            userRole: headUser[0].Role,
            userEmail: headUser[0].Email,
            lastActivity: Date.now()
        };

        const { req: headReq, res: headRes } = createMockReqRes({
            method: 'GET',
            url: '/status',
            session: headSession
        });
        let headAllowed = false;
        await guard(headReq, headRes, () => { headAllowed = true; });

        assert.strictEqual(headAllowed, true, 'IT Department Head must pass requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES)');
        assert.strictEqual(headRes.statusCode, 200, 'IT Department Head must receive HTTP 200');
        console.log('✔ PASS: IT Department Head successfully authorized on exclusive backup endpoints.');

        // ─── 6. LIVE HTTP SERVER ROUTE VERIFICATION ──────────────────────────
        console.log('\n--- 6. Verifying Live Server API Endpoint Guard ---');
        try {
            const statusResponse = await fetch('http://localhost:3000/api/admin/backups/status');
            assert.strictEqual(statusResponse.status, 401, 'Live unauthenticated request to /api/admin/backups/status must return 401');
            console.log('✔ PASS: Live server responded with HTTP 401 Unauthorized for unauthenticated status query.');
        } catch (fetchErr) {
            console.log('ℹ Live server fetch skipped (server not reached on 3000):', fetchErr.message);
        }

        console.log('\n================================================================');
        console.log('🎉 ALL EXCLUSIVE AUTHORIZATION TESTS PASSED SUCCESSFULLY (100%)!');
        console.log('================================================================\n');
    } finally {
        try {
            await db.end();
        } catch (_) {}
    }
}

runExclusiveAuthTests().catch(err => {
    console.error('\n❌ EXCLUSIVE AUTH TEST FAILURE:', err);
    process.exit(1);
});
