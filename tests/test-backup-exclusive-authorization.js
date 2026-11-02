'use strict';

/**
 * tests/test-backup-exclusive-authorization.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification Test Suite for Exclusive IT Department Head Role Authorization
 * on Database Backup and Disaster Recovery endpoints.
 *
 * Requirements:
 * - Unauthenticated request: HTTP 401
 * - Program Coordinator: HTTP 403 (Forbidden: Insufficient privileges)
 * - MIS Staff: HTTP 403
 * - Faculty: HTTP 403
 * - Student: HTTP 403
 * - OJT: HTTP 403
 * - IT Department Head: HTTP 200 (Authorized)
 * - Backup creation rate limiter: Enforces 5 requests per 1-hour window (HTTP 429)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const session = require('express-session');
const pool = require('../database/connection');
const routes = require('../routes');
const { IT_DEPT_HEAD_EXCLUSIVE_ROLES, IT_HEAD_ROLES } = require('../middleware/auth');

console.log('================================================================');
console.log('🧪 LABSYNC SECURITY FEATURE #17: BACKUP AUTHORIZATION TEST SUITE');
console.log('================================================================');

async function runAuthorizationTests() {
    let testPassed = 0;
    let testFailed = 0;

    function recordPass(testName) {
        testPassed++;
        console.log(`  ✔ PASS: ${testName}`);
    }

    function recordFail(testName, err) {
        testFailed++;
        console.error(`  ✖ FAIL: ${testName}`);
        console.error(`    Error: ${err.message}`);
    }

    // Set up real Express test server mounting canonical API routers
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-labsync-backup-auth-secret-key-12345',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    // Helper endpoint to attach session identity
    app.post('/test/auth/session', (req, res) => {
        req.session.userId = req.body.userId;
        req.session.userRole = req.body.userRole;
        req.session.userEmail = req.body.userEmail;
        req.session.lastActivity = Date.now();
        req.session.save(err => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, session: { userId: req.session.userId, role: req.session.userRole } });
        });
    });

    // Mount canonical centralized router under /api
    app.use('/api', routes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    async function loginAs(userId, userRole, userEmail) {
        const res = await fetch(`${baseUrl}/test/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userRole, userEmail })
        });
        assert.strictEqual(res.status, 200, 'Session creation must succeed');
        const setCookie = res.headers.get('set-cookie');
        return setCookie ? setCookie.split(';')[0] : '';
    }

    try {
        // ─── TEST 1: Role Matrix Configuration Invariants ─────────────────────
        console.log('\n--- 1. Role Matrix Configuration Invariants ---');
        try {
            assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Program Coordinator'),
                'IT_DEPT_HEAD_EXCLUSIVE_ROLES must strictly exclude "Program Coordinator"');
            assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('MIS Staff'),
                'IT_DEPT_HEAD_EXCLUSIVE_ROLES must strictly exclude "MIS Staff"');
            assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Faculty'),
                'IT_DEPT_HEAD_EXCLUSIVE_ROLES must strictly exclude "Faculty"');
            assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('Student'),
                'IT_DEPT_HEAD_EXCLUSIVE_ROLES must strictly exclude "Student"');
            assert.ok(!IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('OJT'),
                'IT_DEPT_HEAD_EXCLUSIVE_ROLES must strictly exclude "OJT"');
            assert.ok(IT_DEPT_HEAD_EXCLUSIVE_ROLES.includes('IT Dept. Head'),
                'IT_DEPT_HEAD_EXCLUSIVE_ROLES must include "IT Dept. Head"');

            recordPass('IT_DEPT_HEAD_EXCLUSIVE_ROLES correctly excludes Program Coordinator and non-head roles');
        } catch (err) {
            recordFail('IT_DEPT_HEAD_EXCLUSIVE_ROLES correctly excludes Program Coordinator and non-head roles', err);
        }

        // ─── TEST 2: Unauthenticated Requests (HTTP 401) ──────────────────────
        console.log('\n--- 2. Unauthenticated Requests (HTTP 401) ---');
        try {
            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`);
            assert.strictEqual(statusRes.status, 401, 'Unauthenticated GET /api/admin/backups/status must return 401');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, { method: 'POST' });
            assert.strictEqual(createRes.status, 401, 'Unauthenticated POST /api/admin/backups/create must return 401');

            recordPass('Unauthenticated requests are rejected with HTTP 401');
        } catch (err) {
            recordFail('Unauthenticated requests are rejected with HTTP 401', err);
        }

        // ─── TEST 3: Program Coordinator Role Blocked (HTTP 403) ──────────────
        console.log('\n--- 3. Program Coordinator Excluded (HTTP 403) ---');
        try {
            // User 3 is Program Coordinator in users table
            const pcCookie = await loginAs(3, 'Program Coordinator', 'faculty@labsync.com');

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`, {
                headers: { Cookie: pcCookie }
            });
            assert.strictEqual(statusRes.status, 403, 'Program Coordinator must receive 403 on status');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: pcCookie }
            });
            assert.strictEqual(createRes.status, 403, 'Program Coordinator must receive 403 on backup create');

            recordPass('Program Coordinator is strictly rejected with HTTP 403');
        } catch (err) {
            recordFail('Program Coordinator is strictly rejected with HTTP 403', err);
        }

        // ─── TEST 4: MIS Staff Role Blocked (HTTP 403) ────────────────────────
        console.log('\n--- 4. MIS Staff Excluded (HTTP 403) ---');
        try {
            // User 2 is MIS Staff
            const misCookie = await loginAs(2, 'MIS Staff', 'mis@labsync.com');

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`, {
                headers: { Cookie: misCookie }
            });
            assert.strictEqual(statusRes.status, 403, 'MIS Staff must receive 403 on status');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: misCookie }
            });
            assert.strictEqual(createRes.status, 403, 'MIS Staff must receive 403 on backup create');

            recordPass('MIS Staff is strictly rejected with HTTP 403');
        } catch (err) {
            recordFail('MIS Staff is strictly rejected with HTTP 403', err);
        }

        // ─── TEST 5: Faculty Role Blocked (HTTP 403) ──────────────────────────
        console.log('\n--- 5. Faculty Excluded (HTTP 403) ---');
        try {
            const [facRows] = await pool.query("SELECT User_ID, Email FROM users WHERE Role = 'Faculty' AND Status != 'DEACTIVATED' LIMIT 1");
            const facultyId = facRows[0] ? facRows[0].User_ID : 743;
            const facultyEmail = facRows[0] ? facRows[0].Email : 'charljayesplana@gmail.com';
            const facultyCookie = await loginAs(facultyId, 'Faculty', facultyEmail);

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`, {
                headers: { Cookie: facultyCookie }
            });
            assert.strictEqual(statusRes.status, 403, 'Faculty must receive 403 on status');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: facultyCookie }
            });
            assert.strictEqual(createRes.status, 403, 'Faculty must receive 403 on backup create');

            recordPass('Faculty is strictly rejected with HTTP 403');
        } catch (err) {
            recordFail('Faculty is strictly rejected with HTTP 403', err);
        }

        // ─── TEST 6: Student Role Blocked (HTTP 403) ──────────────────────────
        console.log('\n--- 6. Student Excluded (HTTP 403) ---');
        try {
            // User 379 is Student
            const studentCookie = await loginAs(379, 'Student', 'student@bulsu.edu.ph');

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`, {
                headers: { Cookie: studentCookie }
            });
            assert.strictEqual(statusRes.status, 403, 'Student must receive 403 on status');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: studentCookie }
            });
            assert.strictEqual(createRes.status, 403, 'Student must receive 403 on backup create');

            recordPass('Student is strictly rejected with HTTP 403');
        } catch (err) {
            recordFail('Student is strictly rejected with HTTP 403', err);
        }

        // ─── TEST 7: OJT Role Blocked (HTTP 403) ──────────────────────────────
        console.log('\n--- 7. OJT Excluded (HTTP 403) ---');
        try {
            // User 256 is OJT
            const ojtCookie = await loginAs(256, 'OJT', 'slushiiplayz13@gmail.com');

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`, {
                headers: { Cookie: ojtCookie }
            });
            assert.strictEqual(statusRes.status, 403, 'OJT must receive 403 on status');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: ojtCookie }
            });
            assert.strictEqual(createRes.status, 403, 'OJT must receive 403 on backup create');

            recordPass('OJT is strictly rejected with HTTP 403');
        } catch (err) {
            recordFail('OJT is strictly rejected with HTTP 403', err);
        }

        // ─── TEST 8: IT Department Head Authorized (HTTP 200) ──────────────────
        console.log('\n--- 8. IT Department Head Authorized (HTTP 200) ---');
        let itHeadCookie = null;
        try {
            // User 1 is IT Dept. Head
            itHeadCookie = await loginAs(1, 'IT Dept. Head', 'head@labsync.com');

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/status`, {
                headers: { Cookie: itHeadCookie }
            });
            assert.strictEqual(statusRes.status, 200, 'IT Dept. Head must receive 200 on status');
            const statusData = await statusRes.json();
            assert.strictEqual(statusData.available, true, 'Status available must be true');
            assert.ok(statusData.baseTableCount > 0, 'Table count must be positive');
            assert.ok(statusData.databaseEngine, 'Database engine must be reported');

            recordPass('IT Department Head is granted full access to GET /api/admin/backups/status');
        } catch (err) {
            recordFail('IT Department Head is granted full access to GET /api/admin/backups/status', err);
        }

        // ─── TEST 9: IT Department Head Backup Creation Stream ─────────────────
        console.log('\n--- 9. IT Department Head Backup Creation Stream ---');
        try {
            assert.ok(itHeadCookie, 'IT Dept Head session must exist');

            const createRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: itHeadCookie }
            });

            assert.strictEqual(createRes.status, 200, 'Backup creation must return HTTP 200');
            assert.strictEqual(createRes.headers.get('content-type'), 'application/gzip', 'Content-Type must be application/gzip');
            assert.ok(createRes.headers.get('content-disposition').includes('attachment'), 'Content-Disposition must be attachment');
            const checksumHeader = createRes.headers.get('x-backup-checksum');
            assert.ok(checksumHeader, 'X-Backup-Checksum header must be present');
            assert.strictEqual(checksumHeader.length, 64, 'Checksum header must be a 64-character SHA-256 hex string');

            const arrayBuf = await createRes.arrayBuffer();
            const archiveBytes = Buffer.from(arrayBuf);
            assert.ok(archiveBytes.length > 0, 'Streamed archive must contain bytes');

            // Verify SHA-256 of streamed bytes
            const streamSha = crypto.createHash('sha256').update(archiveBytes).digest('hex');
            assert.strictEqual(streamSha.toLowerCase(), checksumHeader.toLowerCase(),
                'Streamed archive bytes SHA-256 digest must match X-Backup-Checksum header');

            // Verify gzip header
            assert.strictEqual(archiveBytes[0], 0x1f, 'First byte must be 0x1F');
            assert.strictEqual(archiveBytes[1], 0x8b, 'Second byte must be 0x8B');

            recordPass('POST /api/admin/backups/create successfully streams verified archive with SHA-256 header');
        } catch (err) {
            recordFail('POST /api/admin/backups/create successfully streams verified archive with SHA-256 header', err);
        }

        // ─── TEST 10: Backup Creation Rate Limiter (HTTP 429) ─────────────────
        console.log('\n--- 10. Backup Creation Rate Limiter (HTTP 429) ---');
        try {
            assert.ok(itHeadCookie, 'IT Dept Head session must exist');

            // We already made 1 request in Test 9.
            // Let's send 4 more requests to consume the 5-request quota.
            for (let i = 2; i <= 5; i++) {
                const res = await fetch(`${baseUrl}/api/admin/backups/create`, {
                    method: 'POST',
                    headers: { Cookie: itHeadCookie }
                });
                assert.strictEqual(res.status, 200, `Request ${i} of 5 should succeed within limit`);
                // Consume body to free socket
                await res.arrayBuffer();
            }

            // The 6th request must trigger rate limit 429
            const limitedRes = await fetch(`${baseUrl}/api/admin/backups/create`, {
                method: 'POST',
                headers: { Cookie: itHeadCookie }
            });

            assert.strictEqual(limitedRes.status, 429, '6th request within 1 hour must receive HTTP 429');
            const limitedJson = await limitedRes.json();
            assert.ok(limitedJson.error.includes('Too many backup requests'), 'Error message must reflect rate limit');

            recordPass('Backup creation endpoint enforces 5 requests / 1 hour limit (HTTP 429)');
        } catch (err) {
            recordFail('Backup creation endpoint enforces 5 requests / 1 hour limit (HTTP 429)', err);
        }

    } finally {
        server.close();
        console.log('\n================================================================');
        console.log(`Authorization Test Execution Summary: ${testPassed} Passed, ${testFailed} Failed`);
        console.log('================================================================');
        if (testFailed > 0) {
            process.exit(1);
        }
    }
}

runAuthorizationTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal authorization test runner error:', err);
    process.exit(1);
});
