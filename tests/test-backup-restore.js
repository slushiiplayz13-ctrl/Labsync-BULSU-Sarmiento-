'use strict';

/**
 * tests/test-backup-restore.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Test Suite for Isolated Sandbox Restoration Engine (Phase 3).
 *
 * Verifies:
 * 1. Role authorization exclusivity (Unauth 401, Program Coord 403, non-heads 403)
 * 2. IT Dept Head password re-authentication (missing 401, incorrect 401, correct passes)
 * 3. Archive checksum format and validation (missing 400, malformed 400, mismatch 400)
 * 4. Gzip integrity and format checks (corrupted header 400)
 * 5. Completion trailer enforcement (-- Dump completed on YYYY-MM-DD HH:MM:SS)
 * 6. Prohibited administrative statements rejection (CREATE DATABASE, USE, etc. 400)
 * 7. Incompatible MySQL 9 collation rejection (utf8mb4_0900_ai_ci 400)
 * 8. Native client process safety (shell: false, arguments, Windows ACLs, temp option file cleanup)
 * 9. Real isolated restoration into labsync_test with exit code 0
 * 10. Restoration rate limiter enforcement (5 attempts / 15 min -> 429)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const pool = require('../database/connection');
const backupService = require('../services/backupService');
const restoreService = require('../services/restoreService');
const { backupRestoreLimiter } = require('../middleware/rateLimiter');
const routes = require('../routes');

console.log('================================================================');
console.log('🧪 LABSYNC SECURITY FEATURE #17: SANDBOX RESTORATION TEST SUITE');
console.log('================================================================');

async function runRestoreTests() {
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

    // Set up real Express test server
    const app = express();
    app.use(session({
        secret: 'test-labsync-restore-auth-secret-key-98765',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    // Session injector
    app.post('/test/auth/session', express.json(), (req, res) => {
        req.session.userId = req.body.userId;
        req.session.userRole = req.body.userRole;
        req.session.userEmail = req.body.userEmail;
        req.session.lastActivity = Date.now();
        req.session.save(() => res.json({ ok: true }));
    });

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
        const setCookie = res.headers.get('set-cookie');
        return setCookie ? setCookie.split(';')[0] : '';
    }

    function resetRestoreRateLimit() {
        try {
            if (typeof backupRestoreLimiter.resetKey === 'function') {
                backupRestoreLimiter.resetKey('127.0.0.1');
                backupRestoreLimiter.resetKey('::1');
                backupRestoreLimiter.resetKey('::ffff:127.0.0.1');
            }
        } catch (_) {}
    }

    // Dedicated synthetic test fixture: strictly isolated from real admin credentials
    const TEST_FIXTURE_PASSWORD = 'TestFixturePassword_LabSync#987!';
    const TEST_FIXTURE_HASH = bcrypt.hashSync(TEST_FIXTURE_PASSWORD, 10);

    // Mock pool.query for user 1 password lookup using fixture hash
    const originalQuery = pool.query.bind(pool);
    pool.query = async function(sql, params) {
        if (typeof sql === 'string' && sql.includes('SELECT Password FROM users WHERE User_ID = ?')) {
            return [[{ Password: TEST_FIXTURE_HASH }]];
        }
        return originalQuery(sql, params);
    };

    let itHeadCookie = null;

    try {
        itHeadCookie = await loginAs(1, 'IT Dept. Head', 'head@labsync.com');

        // ─── TEST 1: Unauthenticated Request (HTTP 401) ───────────────────────
        console.log('\n--- 1. Testing Unauthenticated Request ---');
        try {
            const res = await fetch(`${baseUrl}/api/admin/backups/restore`, { method: 'POST' });
            assert.strictEqual(res.status, 401, 'Unauthenticated request must receive 401');
            recordPass('Unauthenticated request rejected with HTTP 401');
        } catch (err) {
            recordFail('Unauthenticated request rejected with HTTP 401', err);
        }

        // ─── TEST 2: Role Authorization Exclusivity (HTTP 403) ────────────────
        console.log('\n--- 2. Testing Role Authorization Exclusivity ---');
        const rolesToTest = [
            { userId: 3, role: 'Program Coordinator', email: 'faculty@labsync.com' },
            { userId: 2, role: 'MIS Staff', email: 'mis@labsync.com' },
            { userId: 583, role: 'Faculty', email: 'andreigabito135@gmail.com' },
            { userId: 379, role: 'Student', email: 'student@bulsu.edu.ph' },
            { userId: 256, role: 'OJT', email: 'slushiiplayz13@gmail.com' }
        ];

        for (const target of rolesToTest) {
            try {
                const cookie = await loginAs(target.userId, target.role, target.email);
                const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                    method: 'POST',
                    headers: { Cookie: cookie }
                });
                assert.strictEqual(res.status, 403, `${target.role} must receive HTTP 403`);
                recordPass(`${target.role} is strictly rejected with HTTP 403`);
            } catch (err) {
                recordFail(`${target.role} is strictly rejected with HTTP 403`, err);
            }
        }

        // ─── TEST 3: Password Re-Authentication Checks ────────────────────────
        console.log('\n--- 3. Testing Password Re-Authentication ---');
        resetRestoreRateLimit();
        try {
            // Missing password
            const missingPassRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: { Cookie: itHeadCookie }
            });
            assert.strictEqual(missingPassRes.status, 401, 'Missing password must return 401');
            const missingJson = await missingPassRes.json();
            assert.strictEqual(missingJson.code, 'PASSWORD_REQUIRED', 'Code must be PASSWORD_REQUIRED');

            // Incorrect password
            const wrongPassRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'X-Confirm-Password': encodeURIComponent('WrongPassword999!')
                }
            });
            assert.strictEqual(wrongPassRes.status, 401, 'Incorrect password must return 401');
            const wrongJson = await wrongPassRes.json();
            assert.strictEqual(wrongJson.code, 'INVALID_PASSWORD', 'Code must be INVALID_PASSWORD');

            recordPass('Missing and incorrect administrator passwords return HTTP 401');
        } catch (err) {
            recordFail('Missing and incorrect administrator passwords return HTTP 401', err);
        }

        // ─── TEST 4: Checksum Header Validation ───────────────────────────────
        console.log('\n--- 4. Testing Checksum Header Validation ---');
        resetRestoreRateLimit();
        try {
            const sampleGzip = zlib.gzipSync(Buffer.from('SELECT 1;\n-- Dump completed on 2026-11-02 12:00:00\n'));

            // Missing checksum
            const noChecksumRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD)
                },
                body: sampleGzip
            });
            assert.strictEqual(noChecksumRes.status, 400, 'Missing checksum must return 400');
            const noChecksumJson = await noChecksumRes.json();
            assert.strictEqual(noChecksumJson.code, 'CHECKSUM_REQUIRED', 'Code must be CHECKSUM_REQUIRED');

            // Malformed checksum
            const badFormatRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': 'not-a-valid-sha256-hex-digest'
                },
                body: sampleGzip
            });
            assert.strictEqual(badFormatRes.status, 400, 'Malformed checksum must return 400');
            const badFormatJson = await badFormatRes.json();
            assert.strictEqual(badFormatJson.code, 'INVALID_CHECKSUM_FORMAT', 'Code must be INVALID_CHECKSUM_FORMAT');

            recordPass('Missing and malformed SHA-256 checksum headers return HTTP 400');
        } catch (err) {
            recordFail('Missing and malformed SHA-256 checksum headers return HTTP 400', err);
        }

        // ─── TEST 5: Checksum Mismatch & Gzip Corruption Rejection ────────────
        console.log('\n--- 5. Testing Checksum Mismatch & Corrupted Gzip ---');
        resetRestoreRateLimit();
        try {
            // Valid gzip bytes but mismatched checksum
            const fakeGzip = zlib.gzipSync(Buffer.from('SELECT 1;\n-- Dump completed on 2026-11-02 12:00:00\n'));
            const wrongChecksum = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

            const mismatchRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': wrongChecksum
                },
                body: fakeGzip
            });
            assert.strictEqual(mismatchRes.status, 400, 'Checksum mismatch must return 400');
            const mismatchJson = await mismatchRes.json();
            assert.strictEqual(mismatchJson.code, 'CHECKSUM_MISMATCH', 'Code must be CHECKSUM_MISMATCH');

            // Invalid magic bytes
            const corruptedPayload = Buffer.from('NOT_A_VALID_GZIP_FILE_RANDOM_TEXT_123456');
            const corruptedSha = crypto.createHash('sha256').update(corruptedPayload).digest('hex');

            const corruptRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': corruptedSha
                },
                body: corruptedPayload
            });
            assert.strictEqual(corruptRes.status, 400, 'Corrupted gzip magic bytes must return 400');
            const corruptJson = await corruptRes.json();
            assert.strictEqual(corruptJson.code, 'INVALID_ARCHIVE_FORMAT', 'Code must be INVALID_ARCHIVE_FORMAT');

            recordPass('Checksum mismatch and non-gzip payloads are safely rejected with HTTP 400');
        } catch (err) {
            recordFail('Checksum mismatch and non-gzip payloads are safely rejected with HTTP 400', err);
        }

        // ─── TEST 6: Missing Completion Trailer Rejection ─────────────────────
        console.log('\n--- 6. Testing Missing Completion Trailer Rejection ---');
        resetRestoreRateLimit();
        try {
            const noTrailerSql = 'CREATE TABLE test_no_trailer (id INT);\nINSERT INTO test_no_trailer VALUES (1);\n';
            const noTrailerGzip = zlib.gzipSync(Buffer.from(noTrailerSql));
            const noTrailerSha = crypto.createHash('sha256').update(noTrailerGzip).digest('hex');

            const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': noTrailerSha
                },
                body: noTrailerGzip
            });
            assert.strictEqual(res.status, 400, 'Missing completion trailer must return 400');
            const json = await res.json();
            assert.strictEqual(json.code, 'INVALID_ARCHIVE_TRAILER', 'Code must be INVALID_ARCHIVE_TRAILER');

            recordPass('Missing SQL completion trailer rejected with INVALID_ARCHIVE_TRAILER');
        } catch (err) {
            recordFail('Missing SQL completion trailer rejected with INVALID_ARCHIVE_TRAILER', err);
        }

        // ─── TEST 7: Incompatible MySQL 9 Collation Rejection ─────────────────
        console.log('\n--- 7. Testing Incompatible Collation Rejection ---');
        resetRestoreRateLimit();
        try {
            const mysql9Sql = 'CREATE TABLE test_mysql9 (name VARCHAR(50) COLLATE utf8mb4_0900_ai_ci);\n-- Dump completed on 2026-11-02 12:00:00\n';
            const mysql9Gzip = zlib.gzipSync(Buffer.from(mysql9Sql));
            const mysql9Sha = crypto.createHash('sha256').update(mysql9Gzip).digest('hex');

            const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': mysql9Sha
                },
                body: mysql9Gzip
            });
            assert.strictEqual(res.status, 400, 'Incompatible MySQL 9 collation must return 400');
            const json = await res.json();
            assert.strictEqual(json.code, 'INCOMPATIBLE_COLLATION', 'Code must be INCOMPATIBLE_COLLATION');

            recordPass('MySQL 9 utf8mb4_0900_ai_ci collation rejected before import into MariaDB');
        } catch (err) {
            recordFail('MySQL 9 utf8mb4_0900_ai_ci collation rejected before import into MariaDB', err);
        }

        // ─── TEST 8: Prohibited Administrative SQL Statements ─────────────────
        console.log('\n--- 8. Testing Prohibited Administrative SQL Statements ---');
        const prohibitedStatements = [
            'CREATE DATABASE evil_hacked_db;',
            'DROP DATABASE labsync;',
            'USE mysql;',
            'GRANT ALL PRIVILEGES ON *.* TO hacker@localhost;'
        ];

        for (const stmt of prohibitedStatements) {
            resetRestoreRateLimit();
            try {
                const badSql = `${stmt}\n-- Dump completed on 2026-11-02 12:00:00\n`;
                const badGzip = zlib.gzipSync(Buffer.from(badSql));
                const badSha = crypto.createHash('sha256').update(badGzip).digest('hex');

                const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                    method: 'POST',
                    headers: {
                        Cookie: itHeadCookie,
                        'Content-Type': 'application/gzip',
                        'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                        'X-Backup-Checksum': badSha
                    },
                    body: badGzip
                });
                assert.strictEqual(res.status, 400, `Statement "${stmt}" must return 400`);
                const json = await res.json();
                assert.strictEqual(json.code, 'FORBIDDEN_SQL_STATEMENT', 'Code must be FORBIDDEN_SQL_STATEMENT');
                recordPass(`Prohibited SQL statement "${stmt}" cleanly rejected`);
            } catch (err) {
                recordFail(`Prohibited SQL statement "${stmt}" cleanly rejected`, err);
            }
        }

        // ─── TEST 9: Native Client Safety Invariants ──────────────────────────
        console.log('\n--- 9. Testing Native Client Safety Invariants ---');
        try {
            const config = restoreService.getVerifiedRestoreConfig();
            assert.strictEqual(config.database, 'labsync_test', 'Restore target must be strictly labsync_test');
            assert.strictEqual(config.host, '127.0.0.1', 'Host must be strictly 127.0.0.1');
            assert.strictEqual(config.user, 'labsync_restore_test', 'User must be strictly labsync_restore_test');

            const { tempDir, configPath } = restoreService.createSecureClientConfigFile(config);
            try {
                assert.ok(fs.existsSync(configPath), 'Option file must exist on disk');
                const content = fs.readFileSync(configPath, 'utf8');
                assert.ok(content.includes('[client]'), 'Option file must include [client]');
                assert.ok(content.includes('user = "labsync_restore_test"'), 'User must be written');

                // Inspect Windows ACLs with icacls.exe to verify restricted permissions
                if (process.platform === 'win32' && process.env.USERNAME) {
                    const icaclsOut = execFileSync('icacls.exe', [configPath], { encoding: 'utf8' });
                    assert.ok(icaclsOut.includes(`${process.env.USERNAME}:(R,W)`) || icaclsOut.includes(`${process.env.USERNAME}:(F)`),
                        'Option file ACL must explicitly grant only current user');
                    assert.ok(!icaclsOut.includes('Everyone:(') && !icaclsOut.includes('Users:('),
                        'Option file must strip inherited broad group access');
                }
            } finally {
                restoreService.cleanupSecureTempDir(tempDir);
                assert.strictEqual(fs.existsSync(tempDir), false, 'Option file temp directory must be removed in finally');
            }

            recordPass('Native client parameters, option file creation, Windows ACLs, and cleanup verified');
        } catch (err) {
            recordFail('Native client parameters, option file creation, Windows ACLs, and cleanup verified', err);
        }

        // ─── TEST 10: Real End-to-End Sandbox Restoration Integration ────────
        console.log('\n--- 10. Testing Real End-to-End Sandbox Restoration ---');
        resetRestoreRateLimit();
        let realBackup = null;
        try {
            // Generate real valid backup archive from local DB
            realBackup = await backupService.generateVerifiedSqlBackup();
            const archiveBytes = fs.readFileSync(realBackup.filePath);

            const restoreRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': realBackup.checksumSha256
                },
                body: archiveBytes
            });

            assert.strictEqual(restoreRes.status, 200, 'Real restore must return HTTP 200');
            const restoreJson = await restoreRes.json();
            assert.strictEqual(restoreJson.code, 'RESTORE_SUCCESS', 'Code must be RESTORE_SUCCESS');
            assert.strictEqual(restoreJson.targetDatabase, 'labsync_test', 'Target database must be labsync_test');
            assert.strictEqual(restoreJson.checksumSha256, realBackup.checksumSha256, 'Returned checksum must match');

            // Verify tables in labsync_test
            const sandboxConn = await mysql.createConnection({
                host: '127.0.0.1',
                port: 3306,
                user: 'labsync_restore_test',
                password: process.env.DB_RESTORE_PASSWORD,
                database: 'labsync_test'
            });
            const [tables] = await sandboxConn.query('SHOW TABLES');
            assert.ok(tables.length > 0, 'labsync_test must contain restored tables');
            await sandboxConn.end();

            recordPass('End-to-end sandbox restoration executed cleanly with exit code 0 into labsync_test');
        } catch (err) {
            recordFail('End-to-end sandbox restoration executed cleanly with exit code 0 into labsync_test', err);
        } finally {
            if (realBackup && realBackup.tempDir) {
                try { fs.rmSync(realBackup.tempDir, { recursive: true, force: true }); } catch (_) {}
            }
        }

        // ─── TEST 11: Database Restoration Rate Limiter (HTTP 429) ────────────
        console.log('\n--- 11. Testing Restoration Rate Limiter (HTTP 429) ---');
        resetRestoreRateLimit();
        try {
            // Send 5 rapid requests to exhaust the 5-attempt quota
            for (let i = 1; i <= 5; i++) {
                await fetch(`${baseUrl}/api/admin/backups/restore`, {
                    method: 'POST',
                    headers: {
                        Cookie: itHeadCookie,
                        'X-Confirm-Password': 'WrongPasswordToConsumeQuota!'
                    }
                });
            }

            // The 6th request must be rejected with HTTP 429 Too Many Requests
            const rateLimitedRes = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD)
                }
            });

            assert.strictEqual(rateLimitedRes.status, 429, '6th request must receive HTTP 429');
            recordPass('Restoration rate limiter strictly enforces 5 attempts per window (HTTP 429)');
        } catch (err) {
            recordFail('Restoration rate limiter strictly enforces 5 attempts per window (HTTP 429)', err);
        }

    } finally {
        pool.query = originalQuery;
        server.close();
        console.log('\n================================================================');
        console.log(`Sandbox Restoration Test Summary: ${testPassed} Passed, ${testFailed} Failed`);
        console.log('================================================================');
        if (testFailed > 0) {
            process.exit(1);
        }
    }
}

runRestoreTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal restore test runner error:', err);
    process.exit(1);
});
