'use strict';

/**
 * tests/test-backup-online-recovery.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Test Suite for Online Recovery Sandbox & Recovery Verification
 * (Feature #17 Extension).
 *
 * Verifies:
 * 1. Isolation & fail-closed behavior when recovery configuration is missing.
 * 2. Target validation rejecting configurations pointing to production.
 * 3. Prevention of production credential reuse.
 * 4. Role exclusivity (Unauthenticated 401, Program Coord / MIS / Faculty 403).
 * 5. Administrator password re-authentication (missing/invalid 401).
 * 6. Checksum header validation and tamper protection (400).
 * 7. Real restoration into isolated sandbox via dedicated recovery connection.
 * 8. Post-restoration verification of tables and row counts.
 * 9. Demonstration room comparison: new room exists in production, absent in snapshot.
 * 10. Source database cleanliness (production remains unpolluted).
 * 11. Rate limiter enforcement (3 attempts per 1-hour window -> 429).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const pool = require('../database/connection');
const backupService = require('../services/backupService');
const restoreService = require('../services/restoreService');
const recoveryDatabaseService = require('../services/recoveryDatabaseService');
const { backupRestoreLimiter } = require('../middleware/rateLimiter');
const routes = require('../routes');

console.log('================================================================');
console.log('🧪 LABSYNC SECURITY FEATURE #17: ONLINE RECOVERY SANDBOX SUITE');
console.log('================================================================');

const TEST_FIXTURE_PASSWORD = 'TestOnlineRecoveryPassword#2026!';
const TEST_FIXTURE_HASH = bcrypt.hashSync(TEST_FIXTURE_PASSWORD, 10);

async function runOnlineRecoveryTests() {
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

    function resetRestoreRateLimit() {
        if (backupRestoreLimiter && typeof backupRestoreLimiter.resetKey === 'function') {
            backupRestoreLimiter.resetKey('127.0.0.1');
            backupRestoreLimiter.resetKey('::1');
            backupRestoreLimiter.resetKey('::ffff:127.0.0.1');
        }
    }

    // Set up test Express server
    const app = express();
    app.use(session({
        secret: 'test-labsync-online-recovery-secret',
        resave: false,
        saveUninitialized: false
    }));

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

    // Helper to log in as specific role
    async function loginAs(userId, userRole, userEmail) {
        const res = await fetch(`${baseUrl}/test/auth/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userRole, userEmail })
        });
        return res.headers.get('set-cookie').split(';')[0];
    }

    const itHeadCookie = await loginAs(1, 'IT Dept. Head', 'head@labsync.com');

    const DEMO_ROOM_NUMBER = '999';
    const DEMO_BUILDING = 'DEMO-BLDG';

    // Save and prepare environment
    const savedEnv = { ...process.env };

    // Mock IT Head password in database pool
    const originalQuery = pool.query.bind(pool);
    pool.query = async function (sql, params) {
        if (typeof sql === 'string' && sql.includes('SELECT Password FROM users WHERE User_ID = ?')) {
            if (params && params[0] === 1) {
                return [[{ Password: TEST_FIXTURE_HASH }]];
            }
        }
        return originalQuery(sql, params);
    };

    try {
        // ─── TEST 1: Missing Recovery Configuration Fails Closed ─────────────
        console.log('\n--- 1. Testing Missing Recovery Configuration (Fail Closed) ---');
        try {
            delete process.env.RECOVERY_DB_HOST;
            delete process.env.RECOVERY_DB_USER;
            delete process.env.RECOVERY_DB_NAME;

            assert.strictEqual(recoveryDatabaseService.isRecoveryConfigured(), false, 'isRecoveryConfigured must be false');

            let threw = false;
            try {
                recoveryDatabaseService.getRecoveryConfig();
            } catch (err) {
                if (err.code === 'RECOVERY_NOT_CONFIGURED') threw = true;
            }
            assert.strictEqual(threw, true, 'getRecoveryConfig must throw RECOVERY_NOT_CONFIGURED');

            const statusRes = await fetch(`${baseUrl}/api/admin/backups/recovery/status`, {
                headers: { Cookie: itHeadCookie }
            });
            const statusJson = await statusRes.json();
            assert.strictEqual(statusJson.configured, false, 'status.configured must be false when unconfigured');

            recordPass('Missing recovery configuration fails closed without fallback to production');
        } catch (err) {
            recordFail('Missing recovery configuration fails closed without fallback to production', err);
        }

        // ─── TEST 2: Target Validation Rejects Production Database ────────────
        console.log('\n--- 2. Testing Target Isolation: Rejection of Production Target ---');
        try {
            const prodHost = process.env.DB_HOST || '127.0.0.1';
            const prodName = process.env.DB_NAME || 'labsync';

            let isolationThrew = false;
            try {
                await recoveryDatabaseService.verifyRecoveryIsolation({
                    host: prodHost,
                    port: 3306,
                    user: 'recovery_user',
                    password: 'password',
                    database: prodName
                });
            } catch (err) {
                if (err.code === 'RECOVERY_TARGETS_PRODUCTION') isolationThrew = true;
            }
            assert.strictEqual(isolationThrew, true, 'verifyRecoveryIsolation must reject target matching production DB');

            recordPass('Runtime isolation validation strictly rejects configurations targeting production database');

            // Subtest: Same MySQL Server UUID Rejection (even with different database name)
            let uuidThrew = false;
            const origCreateRecovery = recoveryDatabaseService.createRecoveryConnection;
            recoveryDatabaseService.createRecoveryConnection = async function () {
                return {
                    query: async function (sql) {
                        if (sql.includes('SELECT DATABASE()')) {
                            return [[{ current_db: 'labsync_separate_schema', server_host: 'remote-host', server_id: 1, db_ver: 'MySQL 9.7.2' }]];
                        }
                        if (sql.includes('SELECT @@server_uuid')) {
                            return [[{ server_uuid: 'c30d972c-29b3-11ef-9cb4-0242ac110002' }]];
                        }
                        return [[]];
                    },
                    end: async function () {}
                };
            };

            const origPoolQuery = pool.query;
            pool.query = async function (sql, params) {
                if (typeof sql === 'string' && sql.includes('SELECT @@server_uuid')) {
                    return [[{ server_uuid: 'c30d972c-29b3-11ef-9cb4-0242ac110002' }]];
                }
                return origPoolQuery.call(pool, sql, params);
            };

            try {
                await recoveryDatabaseService.verifyRecoveryIsolation({
                    host: 'separate-host.rlwy.net',
                    port: 3306,
                    user: 'recovery_user',
                    password: 'password',
                    database: 'labsync_separate_schema'
                });
            } catch (err) {
                if (err.code === 'RECOVERY_TARGETS_PRODUCTION' && err.message.includes('server_uuid')) {
                    uuidThrew = true;
                }
            } finally {
                recoveryDatabaseService.createRecoveryConnection = origCreateRecovery;
                pool.query = origPoolQuery;
            }

            assert.strictEqual(uuidThrew, true, 'verifyRecoveryIsolation must reject recovery when server_uuid matches production');
            recordPass('Server identity validation strictly rejects recovery sharing @@server_uuid with production');
        } catch (err) {
            recordFail('Runtime isolation validation strictly rejects configurations targeting production database', err);
        }

        // ─── TEST 3: Prevention of Production Database User Reuse ─────────────
        console.log('\n--- 3. Testing Target Isolation: Prevention of Production User Reuse ---');
        try {
            const prodHost = process.env.DB_HOST || '127.0.0.1';
            const prodUser = process.env.DB_USER || 'root';

            let userThrew = false;
            try {
                await recoveryDatabaseService.verifyRecoveryIsolation({
                    host: prodHost,
                    port: 3306,
                    user: prodUser,
                    password: 'password',
                    database: 'labsync_recovery_test'
                });
            } catch (err) {
                if (err.code === 'RECOVERY_USES_PRODUCTION_USER') userThrew = true;
            }
            assert.strictEqual(userThrew, true, 'verifyRecoveryIsolation must reject reuse of production user');

            recordPass('Runtime isolation validation strictly rejects reusing production database user');
        } catch (err) {
            recordFail('Runtime isolation validation strictly rejects reusing production database user', err);
        }

        // ─── TEST 4: Role Exclusivity (Non-IT Head Roles Receive HTTP 403) ────
        console.log('\n--- 4. Testing Role Authorization Exclusivity ---');
        const rolesToTest = [
            { userId: 3, role: 'Program Coordinator', email: 'coordinator@labsync.com' },
            { userId: 2, role: 'MIS Staff', email: 'mis@labsync.com' },
            { userId: 743, role: 'Faculty', email: 'faculty@labsync.com' },
            { userId: 379, role: 'Student', email: 'student@bulsu.edu.ph' },
            { userId: 256, role: 'OJT', email: 'ojt@labsync.com' }
        ];

        for (const r of rolesToTest) {
            try {
                const cookie = await loginAs(r.userId, r.role, r.email);
                const res = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                    method: 'POST',
                    headers: { Cookie: cookie }
                });
                assert.strictEqual(res.status, 403, `${r.role} must receive HTTP 403 on recovery restore`);

                const compareRes = await fetch(`${baseUrl}/api/admin/backups/recovery/compare?room=999`, {
                    headers: { Cookie: cookie }
                });
                assert.strictEqual(compareRes.status, 403, `${r.role} must receive HTTP 403 on recovery compare`);

                recordPass(`${r.role} strictly excluded from recovery operations (HTTP 403)`);
            } catch (err) {
                recordFail(`${r.role} strictly excluded from recovery operations (HTTP 403)`, err);
            }
        }

        // ─── TEST 5: Password Re-Authentication Enforcement ───────────────────
        console.log('\n--- 5. Testing Password Re-Authentication ---');
        try {
            // Configure temporary valid recovery target pointing to labsync_test
            process.env.RECOVERY_DB_HOST = '127.0.0.1';
            process.env.RECOVERY_DB_PORT = '3306';
            process.env.RECOVERY_DB_USER = 'labsync_restore_test';
            process.env.RECOVERY_DB_PASSWORD = process.env.DB_RESTORE_PASSWORD || '';
            process.env.RECOVERY_DB_NAME = 'labsync_test';

            // Missing password
            const missingPassRes = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: { Cookie: itHeadCookie }
            });
            assert.strictEqual(missingPassRes.status, 401, 'Missing password must return HTTP 401');

            // Incorrect password
            const wrongPassRes = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'X-Confirm-Password': encodeURIComponent('WrongPassword123!')
                }
            });
            assert.strictEqual(wrongPassRes.status, 401, 'Incorrect password must return HTTP 401');

            recordPass('Missing and incorrect administrator passwords return HTTP 401');
        } catch (err) {
            recordFail('Missing and incorrect administrator passwords return HTTP 401', err);
        }

        // ─── TEST 6: Checksum Validation & Integrity ──────────────────────────
        console.log('\n--- 6. Testing SHA-256 Checksum Validation ---');
        resetRestoreRateLimit();
        try {
            // Missing checksum
            const missingShaRes = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD)
                },
                body: Buffer.from('FAKE')
            });
            assert.strictEqual(missingShaRes.status, 400, 'Missing checksum must return HTTP 400');

            // Tampered / Mismatched checksum
            const tamperedShaRes = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': '0000000000000000000000000000000000000000000000000000000000000000'
                },
                body: Buffer.from('FAKE_PAYLOAD')
            });
            assert.strictEqual(tamperedShaRes.status, 400, 'Mismatched checksum must return HTTP 400');

            recordPass('Missing and mismatched SHA-256 checksums safely rejected (HTTP 400)');
        } catch (err) {
            recordFail('Missing and mismatched SHA-256 checksums safely rejected (HTTP 400)', err);
        }

        // ─── TEST 7: Complete Multi-Cycle Repeat Restoration Lifecycle (10 Steps) ─
        console.log('\n--- 7. Testing Complete Multi-Cycle Repeat Restoration Lifecycle (10 Steps) ---');
        resetRestoreRateLimit();
        let backupArchive = null;
        try {
            // Step 1: Begin with an empty recovery database
            const initConn = await recoveryDatabaseService.createRecoveryConnection();
            await recoveryDatabaseService.resetRecoveryDatabase(initConn, 'labsync_test');
            await initConn.end();

            // Step 2: Restore a valid backup
            backupArchive = await backupService.generateVerifiedSqlBackup();
            const archiveBytes = fs.readFileSync(backupArchive.filePath);

            const restore1Res = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': backupArchive.checksumSha256,
                    'X-Backup-Filename': encodeURIComponent(backupArchive.filename)
                },
                body: archiveBytes
            });

            assert.strictEqual(restore1Res.status, 200, 'Step 2: First recovery restore must return HTTP 200');
            const restore1Json = await restore1Res.json();
            assert.strictEqual(restore1Json.code, 'RECOVERY_SUCCESS', 'Step 2: Code must be RECOVERY_SUCCESS');
            assert.strictEqual(restore1Json.summary.status, 'SUCCESS', 'Step 2: Summary status must be SUCCESS');
            assert.ok(restore1Json.summary.tableCount >= 20, 'Step 2: Restored table count >= 20');

            // Step 3: Verify recovery status
            const status1Res = await fetch(`${baseUrl}/api/admin/backups/recovery/status`, {
                headers: { Cookie: itHeadCookie }
            });
            assert.strictEqual(status1Res.status, 200, 'Step 3: Status must return HTTP 200');
            const status1Json = await status1Res.json();
            assert.strictEqual(status1Json.latestRecovery.status, 'SUCCESS', 'Step 3: Latest recovery must be SUCCESS');
            assert.strictEqual(status1Json.latestRecovery.tableCount, restore1Json.summary.tableCount, 'Step 3: Table counts match');

            // Step 4: Run the demonstration room comparison
            await pool.query(
                "INSERT INTO laboratories (Room_Number, Building, Current_Status, Key_Status) VALUES (?, ?, 'Available', 'Returned')",
                [DEMO_ROOM_NUMBER, DEMO_BUILDING]
            );

            const compRes = await fetch(`${baseUrl}/api/admin/backups/recovery/compare?room=${DEMO_ROOM_NUMBER}`, {
                headers: { Cookie: itHeadCookie }
            });
            assert.strictEqual(compRes.status, 200, 'Step 4: Comparison endpoint must return HTTP 200');
            const comp = await compRes.json();
            assert.strictEqual(comp.production.exists, true, 'Step 4: Demo room exists in live production');
            assert.strictEqual(comp.recoverySandbox.exists, false, 'Step 4: Demo room absent in recovery snapshot');
            assert.strictEqual(comp.demonstrationStatus, 'DEMONSTRATION_PROVEN', 'Step 4: Status is DEMONSTRATION_PROVEN');

            await pool.query("DELETE FROM laboratories WHERE Room_Number = ? AND Building = ?", [DEMO_ROOM_NUMBER, DEMO_BUILDING]);

            // Step 5: Restore the same backup again (Second Restoration)
            resetRestoreRateLimit();
            const restore2Res = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': backupArchive.checksumSha256,
                    'X-Backup-Filename': encodeURIComponent(backupArchive.filename)
                },
                body: archiveBytes
            });

            // Step 6: Confirm the second restoration succeeds
            assert.strictEqual(restore2Res.status, 200, 'Step 6: Second restoration must return HTTP 200 (No false-positive from existing users table)');
            const restore2Json = await restore2Res.json();
            assert.strictEqual(restore2Json.code, 'RECOVERY_SUCCESS', 'Step 6: Code must be RECOVERY_SUCCESS');
            assert.strictEqual(restore2Json.summary.status, 'SUCCESS', 'Step 6: Summary status must be SUCCESS');

            // Step 7: Confirm recovery verification remains accurate
            assert.strictEqual(restore2Json.summary.tableCount, restore1Json.summary.tableCount, 'Step 7: Restored table count unchanged');
            assert.ok(restore2Json.summary.recordCounts.laboratories >= 1, 'Step 7: Laboratories record count intact');

            // Step 8: Attempt a corrupted backup (fails during execution)
            resetRestoreRateLimit();
            let badImportThrew = false;
            try {
                const tempBadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-restore-'));
                const badSqlFile = path.join(tempBadDir, 'bad_schema.sql.gz');
                // Archive with syntax error during SQL statement execution
                const badSqlText = 'CREATE TABLE `corrupted_dummy` (`id` int);\nMALFORMED_SQL_STATEMENT_CORRUPTED;\n-- Dump completed on 2026-11-02 12:00:00\n';
                const badGzip = zlib.gzipSync(Buffer.from(badSqlText, 'utf8'));
                fs.writeFileSync(badSqlFile, badGzip);
                const badChecksum = crypto.createHash('sha256').update(badGzip).digest('hex');

                await recoveryDatabaseService.executeOnlineRecovery(badSqlFile, badChecksum, {
                    actorEmail: 'admin@labsync.local'
                });
            } catch (err) {
                badImportThrew = true;
            }
            assert.strictEqual(badImportThrew, true, 'Step 8: Corrupted / incomplete backup rejected with error');

            // Step 9: Confirm the failed attempt is reported as failed
            const statusFail = await recoveryDatabaseService.getRecoveryStatus();
            assert.strictEqual(statusFail.latestRecovery.status, 'FAILED', 'Step 9: Recovery status marked as FAILED');
            assert.ok(statusFail.latestRecovery.error, 'Step 9: Error reason preserved in summary');

            // Step 10: Confirm a failed import cannot be reported as the previous successful restoration
            assert.notStrictEqual(statusFail.latestRecovery.status, 'SUCCESS', 'Step 10: Failed import does not report previous SUCCESS');

            recordPass('Complete 10-step repeated restoration and failure handling lifecycle verified cleanly');
            recordPass('Demonstration room comparison verifies: record exists in production, absent in recovery sandbox');
        } catch (err) {
            recordFail('Complete 10-step repeated restoration and failure handling lifecycle verified cleanly', err);
        } finally {
            if (backupArchive && backupArchive.tempDir) {
                try { fs.rmSync(backupArchive.tempDir, { recursive: true, force: true }); } catch (_) {}
            }
            try {
                const cleanupConn = await recoveryDatabaseService.createRecoveryConnection();
                await cleanupConn.query('DROP TABLE IF EXISTS `corrupted_dummy`');
                await cleanupConn.end();
            } catch (_) {}
        }

        // ─── TEST 9: Production Cleanliness & Integrity ───────────────────────
        console.log('\n--- 9. Verifying Production Database Cleanliness ---');
        try {
            const [checkRows] = await pool.query(
                "SELECT COUNT(*) AS c FROM laboratories WHERE Room_Number = ?",
                [DEMO_ROOM_NUMBER]
            );
            assert.strictEqual(Number(checkRows[0].c), 0, 'Cleaned demonstration record must be completely gone');

            const [tableRows] = await pool.query(
                "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
                [process.env.DB_NAME || 'labsync']
            );
            assert.ok(Number(tableRows[0].total) >= 20, 'Production base tables must remain completely intact');

            recordPass('Live production database remains clean, untouched, and unpolluted');
        } catch (err) {
            recordFail('Live production database remains clean, untouched, and unpolluted', err);
        }

        // ─── TEST 10: Rate Limiter Strictly Enforces 3 Attempts per Hour ──────
        console.log('\n--- 10. Testing Recovery Rate Limiter (3 Attempts / 1 Hour) ---');
        resetRestoreRateLimit();
        try {
            // Send 3 requests to exhaust quota
            for (let i = 1; i <= 3; i++) {
                await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                    method: 'POST',
                    headers: {
                        Cookie: itHeadCookie,
                        'X-Confirm-Password': 'WrongPasswordToConsumeQuota!'
                    }
                });
            }

            // 4th request must receive HTTP 429
            const rateLimitedRes = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD)
                }
            });

            assert.strictEqual(rateLimitedRes.status, 429, '4th request within 1 hour must receive HTTP 429');
            const data = await rateLimitedRes.json();
            assert.ok(data.error.includes('Too many restoration attempts'), 'Rate limit message must be returned');

            recordPass('Recovery restoration endpoint strictly enforces 3 attempts per 1-hour window (HTTP 429)');
        } catch (err) {
            recordFail('Recovery restoration endpoint strictly enforces 3 attempts per 1-hour window (HTTP 429)', err);
        }

        // ─── TEST 11: SQL Parser Robustness (Tokenizer State Machine) ─────────
        console.log('\n--- 11. Testing SQL Parser & Statement Splitter ---');
        try {
            const sampleSql = [
                '-- LabSync test dump',
                '/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;',
                'CREATE TABLE `test_table` (`id` int, `msg;name` text);',
                "INSERT INTO `test_table` VALUES (1, 'Hello; World; \\'quoted\\' -- not a comment');",
                "INSERT INTO `test_table` VALUES (2, 'Another; test ''escaped'' here');",
                '/* Normal block comment with ; semicolon */',
                'SELECT * FROM `test_table`;',
                '/*!40000 ALTER TABLE `test_table` ENABLE KEYS */'
            ].join('\n');

            const statements = recoveryDatabaseService.splitSqlStatements(sampleSql);

            assert.strictEqual(statements.length, 6, `Expected 6 statements, got ${statements.length}`);
            assert.ok(statements[0].includes('SET @OLD_CHARACTER_SET_CLIENT'), 'MySQL conditional comment preserved');
            assert.ok(statements[2].includes("'Hello; World; \\'quoted\\' -- not a comment'"), 'Semicolons inside quotes preserved intact');
            assert.ok(statements[3].includes("''escaped''"), 'Escaped quotes preserved intact');
            assert.ok(statements[4].includes('SELECT * FROM `test_table`'), 'Statement after block comment parsed cleanly');
            assert.ok(statements[5].includes('ENABLE KEYS'), 'Final conditional comment parsed cleanly');

            recordPass('SQL tokenizer state machine accurately handles quotes, escaped quotes, backticks, comments, and conditional comments');
        } catch (err) {
            recordFail('SQL tokenizer state machine accurately handles quotes, escaped quotes, backticks, comments, and conditional comments', err);
        }

        // ─── TEST 12: Mutual Exclusion & Concurrency Lockout Guard (HTTP 409) ─
        console.log('\n--- 12. Testing Concurrent Recovery Lockout Guard (HTTP 409) ---');
        resetRestoreRateLimit();
        try {
            const origExecute = recoveryDatabaseService.executeOnlineRecovery;
            recoveryDatabaseService.executeOnlineRecovery = async function () {
                const err = new Error('CONCURRENT_RECOVERY_IN_PROGRESS: Another recovery operation is currently in progress.');
                err.code = 'CONCURRENT_RECOVERY_IN_PROGRESS';
                throw err;
            };

            const concurrentRes = await fetch(`${baseUrl}/api/admin/backups/recovery/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent(TEST_FIXTURE_PASSWORD),
                    'X-Backup-Checksum': '1111111111111111111111111111111111111111111111111111111111111111',
                    'X-Backup-Filename': 'concurrent_test.sql.gz'
                },
                body: Buffer.from('FAKE')
            });

            recoveryDatabaseService.executeOnlineRecovery = origExecute;

            assert.strictEqual(concurrentRes.status, 409, 'Concurrent recovery must return HTTP 409 Conflict');
            const data = await concurrentRes.json();
            assert.strictEqual(data.code, 'CONCURRENT_RECOVERY_IN_PROGRESS', 'Code must be CONCURRENT_RECOVERY_IN_PROGRESS');

            recordPass('Concurrent recovery operations rejected with HTTP 409 Conflict');
        } catch (err) {
            recordFail('Concurrent recovery operations rejected with HTTP 409 Conflict', err);
        }

        // ─── TEST 13: Recovery When Production Database is Unavailable ────────
        console.log('\n--- 13. Testing Recovery When Production Database is Offline (Identity Pinning) ---');
        try {
            const PINNED_PROD_UUID = 'c30d972c-29b3-11ef-9cb4-0242ac110001';
            recoveryDatabaseService.setPinnedProductionServerUuid(PINNED_PROD_UUID);

            const origPoolQuery = pool.query;
            pool.query = async function () {
                const connErr = new Error('ECONNREFUSED: Production database connection lost.');
                connErr.code = 'ECONNREFUSED';
                throw connErr;
            };

            const origCreateRecovery = recoveryDatabaseService.createRecoveryConnection;

            // Scenario A: Independent recovery host with distinct server UUID succeeds even with prod DB down
            recoveryDatabaseService.createRecoveryConnection = async function () {
                return {
                    query: async function (sql) {
                        if (sql.includes('SELECT DATABASE()')) {
                            return [[{ current_db: 'railway', server_host: 'recovery-host.railway.internal', server_id: 2, db_ver: 'MySQL 9.7.2' }]];
                        }
                        if (sql.includes('SELECT @@server_uuid')) {
                            return [[{ server_uuid: 'd4e5f6a1-b2c3-11ef-9cb4-0242ac110002' }]];
                        }
                        return [[]];
                    },
                    end: async function () {}
                };
            };

            const isoResult = await recoveryDatabaseService.verifyRecoveryIsolation({
                host: 'recovery-host.railway.internal',
                port: 3306,
                user: 'labsync_recovery',
                password: 'password',
                database: 'railway'
            });

            assert.strictEqual(isoResult.isolated, true, 'Isolation verified even when production DB pool is completely offline');

            // Scenario B: Recovery configuration targeting the offline production server instance (matching pinned UUID)
            recoveryDatabaseService.createRecoveryConnection = async function () {
                return {
                    query: async function (sql) {
                        if (sql.includes('SELECT DATABASE()')) {
                            return [[{ current_db: 'railway_dr', server_host: 'rebooted-host', server_id: 1, db_ver: 'MySQL 9.7.2' }]];
                        }
                        if (sql.includes('SELECT @@server_uuid')) {
                            return [[{ server_uuid: PINNED_PROD_UUID }]];
                        }
                        return [[]];
                    },
                    end: async function () {}
                };
            };

            let pinnedRejectThrew = false;
            try {
                await recoveryDatabaseService.verifyRecoveryIsolation({
                    host: 'rebooted-host',
                    port: 3306,
                    user: 'recovery_user',
                    password: 'password',
                    database: 'railway_dr'
                });
            } catch (err) {
                if (err.code === 'RECOVERY_TARGETS_PRODUCTION' && err.message.includes('server_uuid')) {
                    pinnedRejectThrew = true;
                }
            }

            pool.query = origPoolQuery;
            recoveryDatabaseService.createRecoveryConnection = origCreateRecovery;
            recoveryDatabaseService.setPinnedProductionServerUuid(null);

            assert.strictEqual(pinnedRejectThrew, true, 'Pinned server identity rejects recovery targeting production even when production is down');
            recordPass('Recovery functions independently when production is offline, guarded by server identity pinning');
        } catch (err) {
            recordFail('Recovery functions independently when production is offline, guarded by server identity pinning', err);
        }

        // ─── TEST 14: Cross-Host Identical Database Name Acceptance ───────────
        console.log('\n--- 14. Testing Identical Database Names on Separate Hosts (railway vs railway) ---');
        try {
            const origCreateRecovery = recoveryDatabaseService.createRecoveryConnection;
            recoveryDatabaseService.createRecoveryConnection = async function () {
                return {
                    query: async function (sql) {
                        if (sql.includes('SELECT DATABASE()')) {
                            return [[{ current_db: 'railway', server_host: 'remote-recovery-host.railway.internal', server_id: 99, db_ver: 'MySQL 9.7.2' }]];
                        }
                        if (sql.includes('SELECT @@server_uuid')) {
                            return [[{ server_uuid: 'f1e2d3c4-b5a6-11ef-9cb4-0242ac110003' }]];
                        }
                        return [[]];
                    },
                    end: async function () {}
                };
            };

            const savedDbName = process.env.DB_NAME;
            process.env.DB_NAME = 'railway';

            const result = await recoveryDatabaseService.verifyRecoveryIsolation({
                host: 'remote-recovery-host.railway.internal',
                port: 3306,
                user: 'labsync_recovery',
                password: 'password',
                database: 'railway'
            });

            process.env.DB_NAME = savedDbName;
            recoveryDatabaseService.createRecoveryConnection = origCreateRecovery;

            assert.strictEqual(result.isolated, true, 'Identical database name (railway) allowed when host and server_uuid differ');
            recordPass('Identical database names on separate hosts (railway vs railway) verified safe without false-positive rejection');
        } catch (err) {
            recordFail('Identical database names on separate hosts (railway vs railway) verified safe without false-positive rejection', err);
        }

        // ─── TEST 15: Server UUID Format Validation ───────────────────────────
        console.log('\n--- 15. Testing Server UUID Format Validation (RFC 4122) ---');
        try {
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid('c30d972c-29b3-11ef-9cb4-0242ac110002'), true, 'Valid RFC 4122 v1 UUID must pass');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid('C30D972C-29B3-11EF-9CB4-0242AC110002'), true, 'Uppercase UUID must pass');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid('invalid-uuid-format'), false, 'Arbitrary text must be rejected');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid("c30d972c-29b3-11ef-9cb4-0242ac110002' OR 1=1--"), false, 'SQL injection must be rejected');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid(''), false, 'Empty string must be rejected');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid(null), false, 'Null must be rejected');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid(undefined), false, 'Undefined must be rejected');
            assert.strictEqual(recoveryDatabaseService.isValidServerUuid(12345), false, 'Number must be rejected');

            recordPass('Server UUID format validation strictly enforces RFC 4122 regex');
        } catch (err) {
            recordFail('Server UUID format validation strictly enforces RFC 4122 regex', err);
        }

        // ─── TEST 16: Production Outage HTTP Behavior (Fail-Closed Auth) ──────
        console.log('\n--- 16. Testing Production Outage Fail-Closed Auth Behavior ---');
        try {
            const origPoolQuery = pool.query;
            pool.query = async function () {
                const connErr = new Error('ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:3306');
                connErr.code = 'ECONNREFUSED';
                throw connErr;
            };

            const outageRes = await fetch(`${baseUrl}/api/admin/backups/recovery/status`, {
                headers: { Cookie: itHeadCookie }
            });

            pool.query = origPoolQuery;

            // When production DB is down, auth middleware cannot verify user role in users table and safely fails closed
            assert.strictEqual(outageRes.status, 500, 'HTTP requests when production DB is offline must fail closed with HTTP 500');

            recordPass('Production DB outage safely fails closed at HTTP auth middleware without privilege leakage');
        } catch (err) {
            recordFail('Production DB outage safely fails closed at HTTP auth middleware without privilege leakage', err);
        }

        // ─── TEST 17: Least-Privilege Recovery Account Boundary ───────────────
        console.log('\n--- 17. Testing Least-Privilege Recovery Account Privilege Boundary ---');
        try {
            // Verify that recovery config accepts a non-root dedicated user
            const recoveryCfg = recoveryDatabaseService.getRecoveryConfig();
            assert.strictEqual(typeof recoveryCfg.user, 'string', 'Recovery user must be defined');
            assert.notStrictEqual(recoveryCfg.user, process.env.DB_USER, 'Recovery user must be separate from production DB_USER');

            // Verify that isolation verification forbids using the production user
            let reuseThrew = false;
            try {
                await recoveryDatabaseService.verifyRecoveryIsolation({
                    host: process.env.DB_HOST || '127.0.0.1',
                    port: 3306,
                    user: process.env.DB_USER || 'root',
                    password: 'password',
                    database: 'labsync_test'
                });
            } catch (e) {
                if (e.code === 'RECOVERY_USES_PRODUCTION_USER') reuseThrew = true;
            }
            assert.strictEqual(reuseThrew, true, 'Isolation check strictly forbids reusing production DB_USER');

            recordPass('Least-privilege recovery account boundary enforced with dedicated non-root credentials');
        } catch (err) {
            recordFail('Least-privilege recovery account boundary enforced with dedicated non-root credentials', err);
        }

        // ─── TEST 18: Recovery SSL / TLS Certificate Configuration ───────────
        console.log('\n--- 18. Testing Recovery SSL / TLS Configuration ---');
        try {
            const savedSsl = process.env.RECOVERY_DB_SSL;
            const savedCa = process.env.RECOVERY_DB_SSL_CA;

            // Scenario A: Strict CA certificate verification
            process.env.RECOVERY_DB_SSL = 'true';
            process.env.RECOVERY_DB_SSL_CA = '-----BEGIN CERTIFICATE-----\nFAKECA\n-----END CERTIFICATE-----';
            const caConfig = recoveryDatabaseService.getRecoveryConfig();
            assert.strictEqual(caConfig.ssl.rejectUnauthorized, true, 'Custom CA cert must enforce rejectUnauthorized: true');
            assert.strictEqual(caConfig.ssl.ca, process.env.RECOVERY_DB_SSL_CA, 'CA cert must be passed to mysql config');

            // Scenario B: Strict mode without CA
            delete process.env.RECOVERY_DB_SSL_CA;
            process.env.RECOVERY_DB_SSL = 'strict';
            const strictConfig = recoveryDatabaseService.getRecoveryConfig();
            assert.strictEqual(strictConfig.ssl.rejectUnauthorized, true, 'RECOVERY_DB_SSL=strict must enforce rejectUnauthorized: true');

            // Scenario C: Standard TLS enforces strict certificate verification
            process.env.RECOVERY_DB_SSL = 'true';
            const standardConfig = recoveryDatabaseService.getRecoveryConfig();
            assert.strictEqual(standardConfig.ssl.rejectUnauthorized, true, 'RECOVERY_DB_SSL=true must strictly enforce rejectUnauthorized: true without bypassing certificate errors');

            if (savedSsl !== undefined) process.env.RECOVERY_DB_SSL = savedSsl; else delete process.env.RECOVERY_DB_SSL;
            if (savedCa !== undefined) process.env.RECOVERY_DB_SSL_CA = savedCa; else delete process.env.RECOVERY_DB_SSL_CA;

            recordPass('Recovery SSL/TLS configuration correctly handles CA certificates and strict verification modes');
        } catch (err) {
            recordFail('Recovery SSL/TLS configuration correctly handles CA certificates and strict verification modes', err);
        }

    } finally {
        process.env = savedEnv;
        pool.query = originalQuery;
        server.close();
        console.log('\n================================================================');
        console.log(`Online Recovery Test Summary: ${testPassed} Passed, ${testFailed} Failed`);
        console.log('================================================================');
        if (testFailed > 0) {
            process.exit(1);
        }
    }
}

runOnlineRecoveryTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal online recovery test suite error:', err);
    process.exit(1);
});
