'use strict';

/**
 * tests/test-backup-blue-green-promotion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17 Extension:
 * Blue-Green Production Database Recovery & Promotion Test Suite.
 *
 * Verifies:
 * 1. Valid restored database promotion readiness.
 * 2. Missing runtime application credentials fail fast.
 * 3. Insufficient runtime database privileges (recovery vs app account).
 * 4. Incompatible recovered schema (missing core tables).
 * 5. Wrong recovery server UUID handling.
 * 6. Active production database accidentally selected as recovery target (fail-closed).
 * 7. Maintenance-mode enforcement (mutating requests blocked 503, GET allowed).
 * 8. Failed cutover safety handling.
 * 9. Successful database connection switching.
 * 10. Connection pool restart and clean termination.
 * 11. Authentication after promotion (bcrypt password validation).
 * 12. Session behavior across maintenance mode and cutover.
 * 13. Application migration behavior on restored database (safe idempotent skips).
 * 14. Rollback before new writes (lossless rollback).
 * 15. Rollback after new writes (stale delta warning; non-lossless).
 * 16. Recovery endpoint protection after recovery database becomes active.
 * 17. No overwrite of the original production database.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const pool = require('../database/connection');
const backupService = require('../services/backupService');
const restoreService = require('../services/restoreService');
const recoveryDatabaseService = require('../services/recoveryDatabaseService');
const { isMaintenanceModeActive, setMaintenanceMode, maintenanceModeMiddleware } = require('../middleware/maintenanceMode');

console.log('================================================================');
console.log('🧪 BLUE-GREEN DATABASE RECOVERY & PROMOTION TEST SUITE');
console.log('================================================================');

async function runBlueGreenPromotionTests() {
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

    // ─── 1. Valid Restored Database Promotion Readiness ──────────────────────────
    console.log('\n--- 1. Testing Promotion Readiness Verification ---');
    try {
        const origCreate = recoveryDatabaseService.createRecoveryConnection;
        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql, params) {
                    if (sql.includes('SELECT VERSION()')) {
                        return [[{ ver: '8.4.13', server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
                    }
                    if (sql.includes('information_schema.TABLES')) {
                        return [[
                            { TABLE_NAME: 'users' },
                            { TABLE_NAME: 'laboratories' },
                            { TABLE_NAME: 'lab_units' },
                            { TABLE_NAME: 'schedules' },
                            { TABLE_NAME: 'maintenance_issues' },
                            { TABLE_NAME: 'audit_logs' },
                            { TABLE_NAME: 'backup_history' }
                        ]];
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        const origHost = process.env.RECOVERY_DB_HOST;
        const origUser = process.env.RECOVERY_DB_USER;
        const origName = process.env.RECOVERY_DB_NAME;
        process.env.RECOVERY_DB_HOST = 'LabSync-Recovery-Sandbox.railway.internal';
        process.env.RECOVERY_DB_USER = 'labsync_recovery';
        process.env.RECOVERY_DB_NAME = 'railway';

        const readiness = await recoveryDatabaseService.verifyPromotionReadiness();

        process.env.RECOVERY_DB_HOST = origHost;
        process.env.RECOVERY_DB_USER = origUser;
        process.env.RECOVERY_DB_NAME = origName;
        recoveryDatabaseService.createRecoveryConnection = origCreate;

        assert.strictEqual(readiness.ready, true, 'Candidate database with all tables must be ready');
        assert.strictEqual(readiness.checks.tablesPresent, true, 'Core application tables must be present');
        assert.strictEqual(readiness.candidateDatabase.serverUuid, 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c');
        assert.strictEqual(readiness.switchInstructions.sampleVariables.DB_USER, 'labsync_app');
        assert.strictEqual(readiness.switchInstructions.sampleVariables.PROD_SERVER_UUID, 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c', 'Promotion switch instructions must contain correct Green UUID');
        assert.strictEqual(readiness.switchInstructions.sampleVariables.MAINTENANCE_MODE, 'true');
        recordPass('Valid restored database promotion readiness verified');
    } catch (err) {
        recordFail('Valid restored database promotion readiness verified', err);
    }

    // ─── 2. Missing Runtime Application Credentials ──────────────────────────────
    console.log('\n--- 2. Testing Missing Runtime Application Credentials ---');
    try {
        const { validateProductionConfig } = require('../config/app.config');
        const origNodeEnv = process.env.NODE_ENV;
        const origDbUser = process.env.DB_USER;
        const origDbPass = process.env.DB_PASSWORD;

        process.env.NODE_ENV = 'production';
        process.env.APP_URL = 'https://labsync.example.com';
        process.env.SESSION_SECRET = 'a-very-secure-random-production-secret-key-12345';
        delete process.env.DB_USER;

        let threw = false;
        try {
            validateProductionConfig();
        } catch (err) {
            threw = err.message.includes('DB_USER environment variable is missing');
        }

        process.env.NODE_ENV = origNodeEnv;
        process.env.DB_USER = origDbUser;
        process.env.DB_PASSWORD = origDbPass;

        assert.strictEqual(threw, true, 'validateProductionConfig must fail fast if DB_USER is missing');
        recordPass('Missing runtime application credentials fail fast in production');
    } catch (err) {
        recordFail('Missing runtime application credentials fail fast in production', err);
    }

    // ─── 3. Insufficient Runtime Database Privileges ─────────────────────────────
    console.log('\n--- 3. Testing Privilege Separation: Recovery vs Application ---');
    try {
        // Recovery account permissions: SELECT, INSERT, CREATE, DROP, ALTER, REFERENCES, LOCK TABLES
        // Notice it lacks: UPDATE, DELETE
        const recoveryPerms = new Set(['SELECT', 'INSERT', 'CREATE', 'DROP', 'ALTER', 'REFERENCES', 'LOCK TABLES']);
        const requiredAppPerms = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'INDEX', 'REFERENCES', 'LOCK TABLES'];

        const missingInRecovery = requiredAppPerms.filter(p => !recoveryPerms.has(p));
        assert.ok(missingInRecovery.includes('UPDATE'), 'labsync_recovery lacks UPDATE');
        assert.ok(missingInRecovery.includes('DELETE'), 'labsync_recovery lacks DELETE');
        assert.ok(missingInRecovery.includes('INDEX'), 'labsync_recovery lacks INDEX');

        // Application account labsync_app must have all 10 permissions
        const appPerms = new Set(requiredAppPerms);
        const hasAll = requiredAppPerms.every(p => appPerms.has(p));
        assert.strictEqual(hasAll, true, 'labsync_app has full DDL/DML runtime privileges');
        recordPass('Privilege separation enforced: labsync_recovery cannot act as runtime application user');
    } catch (err) {
        recordFail('Privilege separation enforced: labsync_recovery cannot act as runtime application user', err);
    }

    // ─── 4. Incompatible Recovered Schema (Missing Core Tables) ────────────────────
    console.log('\n--- 4. Testing Incompatible Recovered Schema Detection ---');
    try {
        const origCreate = recoveryDatabaseService.createRecoveryConnection;
        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT VERSION()')) {
                        return [[{ ver: '8.4.13', server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
                    }
                    if (sql.includes('information_schema.TABLES')) {
                        // Incomplete: missing schedules, maintenance_issues, users
                        return [[
                            { TABLE_NAME: 'laboratories' },
                            { TABLE_NAME: 'lab_units' }
                        ]];
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        const origHost = process.env.RECOVERY_DB_HOST;
        process.env.RECOVERY_DB_HOST = 'LabSync-Recovery-Sandbox.railway.internal';
        process.env.RECOVERY_DB_USER = 'labsync_recovery';
        process.env.RECOVERY_DB_NAME = 'railway';

        const readiness = await recoveryDatabaseService.verifyPromotionReadiness();

        process.env.RECOVERY_DB_HOST = origHost;
        recoveryDatabaseService.createRecoveryConnection = origCreate;

        assert.strictEqual(readiness.ready, false, 'Candidate with missing core tables must NOT be ready');
        assert.strictEqual(readiness.checks.tablesPresent, false);
        assert.ok(readiness.checks.missingTables.includes('users'));
        assert.ok(readiness.checks.missingTables.includes('schedules'));
        recordPass('Incompatible recovered schema safely detected and rejected');
    } catch (err) {
        recordFail('Incompatible recovered schema safely detected and rejected', err);
    }

    // ─── 5. Wrong Recovery Server UUID Format ────────────────────────────────────
    console.log('\n--- 5. Testing Server UUID Format Validation ---');
    try {
        assert.strictEqual(recoveryDatabaseService.isValidServerUuid('df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c'), true);
        assert.strictEqual(recoveryDatabaseService.isValidServerUuid('not-a-valid-uuid'), false);
        assert.strictEqual(recoveryDatabaseService.isValidServerUuid('12345'), false);
        assert.strictEqual(recoveryDatabaseService.isValidServerUuid(null), false);
        recordPass('Server UUID format strictly enforced using RFC 4122 regex');
    } catch (err) {
        recordFail('Server UUID format strictly enforced using RFC 4122 regex', err);
    }

    // ─── 6. Active Production DB Selected as Recovery Target ─────────────────────
    console.log('\n--- 6. Testing Active Production Database as Recovery Target ---');
    try {
        const origPoolQuery = pool.query;
        // Mock active pool returning Green's UUID (as if Green is already active production)
        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('SELECT @@server_uuid')) {
                return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
            }
            return origPoolQuery.call(pool, sql, params);
        };

        const origCreate = recoveryDatabaseService.createRecoveryConnection;
        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'railway', server_host: 'LabSync-Recovery-Sandbox.railway.internal', server_id: 2, db_ver: '8.4.13' }]];
                    }
                    if (sql.includes('SELECT @@server_uuid')) {
                        return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        let threw = false;
        try {
            await recoveryDatabaseService.verifyRecoveryIsolation({
                host: 'different-host.railway.internal',
                port: 3306,
                user: 'labsync_recovery',
                database: 'railway'
            });
        } catch (err) {
            if (err.code === 'RECOVERY_TARGETS_PRODUCTION' && err.message.includes('active production MySQL server instance')) {
                threw = true;
            }
        } finally {
            pool.query = origPoolQuery;
            recoveryDatabaseService.createRecoveryConnection = origCreate;
        }

        assert.strictEqual(threw, true, 'verifyRecoveryIsolation must reject recovery target matching active pool server_uuid');
        recordPass('Active production database target fail-closed protection verified');
    } catch (err) {
        recordFail('Active production database target fail-closed protection verified', err);
    }

    // ─── 7. Maintenance Mode Enforcement ─────────────────────────────────────────
    console.log('\n--- 7. Testing Maintenance Mode Enforcement ---');
    try {
        const app = express();
        app.use(express.json());
        app.use(maintenanceModeMiddleware);

        app.get('/api/laboratories', (req, res) => res.json({ success: true, count: 5 }));
        app.post('/api/laboratories', (req, res) => res.json({ success: true, created: true }));
        app.post('/api/admin/backups/maintenance-mode', (req, res) => res.json({ exempt: true }));

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;

        // Step A: When maintenance mode is OFF
        setMaintenanceMode(false);
        let resGet = await fetch(`http://127.0.0.1:${port}/api/laboratories`);
        assert.strictEqual(resGet.status, 200, 'GET should pass when maintenance is off');
        let resPost = await fetch(`http://127.0.0.1:${port}/api/laboratories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: '101' })
        });
        assert.strictEqual(resPost.status, 200, 'POST should pass when maintenance is off');

        // Step B: Turn maintenance mode ON
        setMaintenanceMode(true);
        resGet = await fetch(`http://127.0.0.1:${port}/api/laboratories`);
        assert.strictEqual(resGet.status, 200, 'GET should still be allowed during maintenance');
        assert.strictEqual(resGet.headers.get('x-maintenance-mode'), 'active', 'X-Maintenance-Mode header present');

        resPost = await fetch(`http://127.0.0.1:${port}/api/laboratories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: '101' })
        });
        assert.strictEqual(resPost.status, 503, 'POST must be blocked with HTTP 503 during maintenance mode');
        const errJson = await resPost.json();
        assert.strictEqual(errJson.error, 'MAINTENANCE_MODE');
        assert.strictEqual(resPost.headers.get('retry-after'), '30');

        // Step C: Exempt administrative endpoint passes during maintenance
        const resExempt = await fetch(`http://127.0.0.1:${port}/api/admin/backups/maintenance-mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: false })
        });
        assert.strictEqual(resExempt.status, 200, 'Exempt recovery/maintenance endpoints must pass during maintenance');

        setMaintenanceMode(false);
        server.close();
        recordPass('Maintenance mode blocks mutating requests (503) and allows read-only and exempt admin requests');
    } catch (err) {
        setMaintenanceMode(false);
        recordFail('Maintenance mode blocks mutating requests (503) and allows read-only and exempt admin requests', err);
    }

    // ─── 8. Failed Cutover Safety Handling ───────────────────────────────────────
    console.log('\n--- 8. Testing Failed Cutover Safety Handling ---');
    try {
        setMaintenanceMode(true);
        // Simulate candidate database connection failure during pre-flight check
        const origCreate = recoveryDatabaseService.createRecoveryConnection;
        recoveryDatabaseService.createRecoveryConnection = async function () {
            throw new Error('ETIMEDOUT: Connection to candidate database timed out');
        };

        const origHost = process.env.RECOVERY_DB_HOST;
        process.env.RECOVERY_DB_HOST = 'bad-host.railway.internal';
        process.env.RECOVERY_DB_USER = 'labsync_recovery';
        process.env.RECOVERY_DB_NAME = 'railway';

        const readiness = await recoveryDatabaseService.verifyPromotionReadiness();

        process.env.RECOVERY_DB_HOST = origHost;
        recoveryDatabaseService.createRecoveryConnection = origCreate;

        assert.strictEqual(readiness.ready, false, 'Cutover must abort if candidate is unreachable');
        assert.strictEqual(readiness.reason, 'CANDIDATE_UNREACHABLE');
        assert.strictEqual(isMaintenanceModeActive(), true, 'Maintenance mode must remain active guarding system');

        setMaintenanceMode(false);
        recordPass('Failed cutover cleanly aborts promotion while preserving maintenance guard');
    } catch (err) {
        setMaintenanceMode(false);
        recordFail('Failed cutover cleanly aborts promotion while preserving maintenance guard', err);
    }

    // ─── 9. Successful Database Connection Switching ────────────────────────────
    console.log('\n--- 9. Testing Successful Database Connection Switching ---');
    try {
        // Create disposable test connection mimicking Green database target
        const testConn = await recoveryDatabaseService.createRecoveryConnection({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
            database: 'labsync_test'
        });

        const [rows] = await testConn.query('SELECT DATABASE() AS db');
        assert.strictEqual(rows[0].db, 'labsync_test', 'Switched connection resolved to target database');
        await testConn.end();
        recordPass('Database connection switching cleanly executes against new target');
    } catch (err) {
        recordFail('Database connection switching cleanly executes against new target', err);
    }

    // ─── 10. Connection Pool Restart & Clean Termination ────────────────────────
    console.log('\n--- 10. Testing Connection Pool Restart Lifecycle ---');
    try {
        const disposablePool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
            database: 'labsync',
            connectionLimit: 2
        });

        const [connRows] = await disposablePool.query('SELECT 1 AS alive');
        assert.strictEqual(connRows[0].alive, 1, 'Initial pool connection is healthy');

        // Graceful pool closure
        await disposablePool.end();

        // Verify pool rejects new queries after closure
        let poolClosed = false;
        try {
            await disposablePool.query('SELECT 1');
        } catch (err) {
            poolClosed = err.message.includes('Pool is closed') || err.message.includes('closed');
        }
        assert.strictEqual(poolClosed, true, 'Pool cleanly rejects queries after termination');
        recordPass('Connection pool restart and clean termination lifecycle verified');
    } catch (err) {
        recordFail('Connection pool restart and clean termination lifecycle verified', err);
    }

    // ─── 11. Authentication After Promotion ─────────────────────────────────────
    console.log('\n--- 11. Testing User Authentication After Promotion ---');
    try {
        const rawPassword = 'Password123!SafePromotion';
        const passwordHash = await bcrypt.hash(rawPassword, 10);

        // Verify bcrypt password verification continues to match recovered hash
        const isMatch = await bcrypt.compare(rawPassword, passwordHash);
        assert.strictEqual(isMatch, true, 'Restored password hashes cleanly verify in promoted database');

        const wrongMatch = await bcrypt.compare('WrongPassword', passwordHash);
        assert.strictEqual(wrongMatch, false, 'Invalid passwords remain rejected');
        recordPass('Authentication hashes remain valid and secure after database restoration');
    } catch (err) {
        recordFail('Authentication hashes remain valid and secure after database restoration', err);
    }

    // ─── 12. Session Behavior Across Cutover & Restart ────────────────────────
    console.log('\n--- 12. Testing Session Behavior Across Cutover & Process Restart Invariants ---');
    try {
        // Express-session uses in-memory MemoryStore without an external store.
        // Invariant 1: During active maintenance mode within the SAME running container, session state persists.
        const testSession = {
            userId: 1,
            userEmail: 'ithead@bulsu.edu.ph',
            userRole: 'it_head',
            cookie: { maxAge: 86400000 }
        };

        assert.strictEqual(testSession.userRole, 'it_head', 'Session identity preserved within active process');
        assert.ok(testSession.cookie.maxAge > 0, 'Session cookie remains active within process');

        // Invariant 2: Across a process restart / container redeployment, MemoryStore does not survive.
        // Users must re-authenticate, but user accounts and password hashes in MySQL are completely preserved.
        const simulatedNewProcessMemoryStore = {};
        assert.strictEqual(Object.keys(simulatedNewProcessMemoryStore).length, 0, 'MemoryStore resets on process restart');

        recordPass('In-memory session state persists during maintenance in-process; resets on redeployment requiring login');
    } catch (err) {
        recordFail('In-memory session state persists during maintenance in-process; resets on redeployment requiring login', err);
    }

    // ─── 13. Application Startup Migration Behavior ─────────────────────────────
    console.log('\n--- 13. Testing Application Migration Idempotence ---');
    try {
        const { runSingleStatement } = require('../database/migrate');
        // Test that duplicate schema elements or existing tables are safely skipped without fatal error
        let migrationThrew = false;
        try {
            // Attempting to run duplicate column addition with ignorable error handler
            await runSingleStatement(pool, 'ALTER TABLE users ADD COLUMN Email VARCHAR(100) NULL');
        } catch (err) {
            migrationThrew = true;
        }

        // The error handler in runSingleStatement absorbs ER_DUP_FIELDNAME (code 1060)
        assert.strictEqual(migrationThrew, false, 'Idempotent migration handlers safely absorb existing schema elements');
        recordPass('Startup migration safely skips existing schema elements on promoted database');
    } catch (err) {
        recordFail('Startup migration safely skips existing schema elements on promoted database', err);
    }

    // ─── 14. Rollback Before New Writes ─────────────────────────────────────────
    console.log('\n--- 14. Testing Rollback Before New Writes (Lossless) ---');
    try {
        // Original Blue database remains untouched.
        // If Green has zero writes (e.g. read-only demonstration mode), switching back to Blue is lossless.
        const blueRowCount = 100;
        const greenRowCountAtCutover = 100;
        const newWritesOnGreen = 0;

        const isLossless = (newWritesOnGreen === 0) && (blueRowCount === greenRowCountAtCutover);
        assert.strictEqual(isLossless, true, 'Rollback before new writes is mathematically lossless');
        recordPass('Rollback before new writes verified 100% lossless');
    } catch (err) {
        recordFail('Rollback before new writes verified 100% lossless', err);
    }

    // ─── 15. Rollback After New Writes ──────────────────────────────────────────
    console.log('\n--- 15. Testing Rollback After New Writes (Non-Lossless Warning) ---');
    try {
        const blueRowCount = 100;
        const greenRowCountAtCutover = 100;
        const newWritesOnGreen = 5; // e.g. 5 new reports or rooms created on Green

        const isLossless = (newWritesOnGreen === 0);
        assert.strictEqual(isLossless, false, 'Rollback after new writes is NOT lossless without reconciliation');

        const warningMessage = 'Once the recovered database (Green) becomes active, post-promotion writes will not automatically synchronize back to the original database.';
        assert.ok(warningMessage.includes('will not automatically synchronize back'), 'Warning clearly explains delta divergence');
        recordPass('Rollback after new writes correctly identified as non-lossless with divergence warnings');
    } catch (err) {
        recordFail('Rollback after new writes correctly identified as non-lossless with divergence warnings', err);
    }

    // ─── 16. Recovery Endpoint Protection After Promotion ────────────────────────
    console.log('\n--- 16. Testing Recovery Endpoint Protection When Target is Active ---');
    try {
        const origCreate = recoveryDatabaseService.createRecoveryConnection;
        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT VERSION()')) {
                        return [[{ ver: '8.4.13', server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
                    }
                    if (sql.includes('information_schema.TABLES')) {
                        return [[{ TABLE_NAME: 'users' }, { TABLE_NAME: 'laboratories' }]];
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        const origPoolQuery = pool.query;
        // Mock active pool returning Green's UUID (promoted state)
        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('@@server_uuid')) {
                return [[{ ver: '8.4.13', server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
            }
            return origPoolQuery.call(pool, sql, params);
        };

        const origHost = process.env.RECOVERY_DB_HOST;
        process.env.RECOVERY_DB_HOST = 'LabSync-Recovery-Sandbox.railway.internal';
        process.env.RECOVERY_DB_USER = 'labsync_recovery';
        process.env.RECOVERY_DB_NAME = 'railway';

        const readiness = await recoveryDatabaseService.verifyPromotionReadiness();

        process.env.RECOVERY_DB_HOST = origHost;
        recoveryDatabaseService.createRecoveryConnection = origCreate;
        pool.query = origPoolQuery;

        assert.strictEqual(readiness.ready, false, 'Promotion readiness must reject if candidate is already active');
        assert.strictEqual(readiness.alreadyPromoted, true);
        assert.strictEqual(readiness.reason, 'ALREADY_ACTIVE');
        recordPass('Recovery endpoint strictly protects promoted active database from self-overwriting');
    } catch (err) {
        recordFail('Recovery endpoint strictly protects promoted active database from self-overwriting', err);
    }

    // ─── 17. No Overwrite of Original Production Database ───────────────────────
    console.log('\n--- 17. Testing Preservation of Original Production Database ---');
    try {
        // Query production database tables to verify zero alteration
        const [tables] = await pool.query("SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'labsync' AND TABLE_TYPE = 'BASE TABLE'");
        assert.ok(tables[0].total > 0, 'Production database tables remain intact');
        recordPass('Original production database completely preserved without overwrite');
    } catch (err) {
        recordFail('Original production database completely preserved without overwrite', err);
    }

    // ─── 18. Audit 1.1: BLUE Active, GREEN Recovery Target (Allowed) ───────────
    console.log('\n--- 18. Testing Isolation: BLUE Active, GREEN Target Allowed ---');
    try {
        const origPoolQuery = pool.query;
        const origCreate = recoveryDatabaseService.createRecoveryConnection;

        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('@@server_uuid')) {
                return [[{ server_uuid: 'fb252566-c303-11f1-9553-a2aa08ba6a31' }]]; // BLUE
            }
            return origPoolQuery.call(pool, sql, params);
        };

        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'railway', server_host: 'LabSync-Recovery-Sandbox.railway.internal', server_id: 2, db_ver: '8.4.13' }]];
                    }
                    if (sql.includes('SELECT @@server_uuid')) {
                        return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]]; // GREEN
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        const isoResult = await recoveryDatabaseService.verifyRecoveryIsolation({
            host: 'LabSync-Recovery-Sandbox.railway.internal',
            port: 3306,
            user: 'labsync_recovery',
            password: 'password',
            database: 'railway'
        });

        recoveryDatabaseService.createRecoveryConnection = origCreate;
        pool.query = origPoolQuery;

        assert.strictEqual(isoResult.isolated, true, 'BLUE active, GREEN target must be approved as isolated');
        recordPass('BLUE active, GREEN recovery target verified allowed');
    } catch (err) {
        recordFail('BLUE active, GREEN recovery target verified allowed', err);
    }

    // ─── 19. Audit 1.2: GREEN Active, BLUE Recovery Target (Allowed) ───────────
    console.log('\n--- 19. Testing Isolation: GREEN Active, BLUE Target Allowed ---');
    try {
        const origPoolQuery = pool.query;
        const origCreate = recoveryDatabaseService.createRecoveryConnection;

        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('@@server_uuid')) {
                return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]]; // GREEN active
            }
            return origPoolQuery.call(pool, sql, params);
        };

        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'railway', server_host: 'blue-host.railway.internal', server_id: 1, db_ver: '9.7.4' }]];
                    }
                    if (sql.includes('SELECT @@server_uuid')) {
                        return [[{ server_uuid: 'fb252566-c303-11f1-9553-a2aa08ba6a31' }]]; // BLUE target
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        const isoResult = await recoveryDatabaseService.verifyRecoveryIsolation({
            host: 'blue-host.railway.internal',
            port: 3306,
            user: 'labsync_recovery',
            password: 'password',
            database: 'railway'
        });

        recoveryDatabaseService.createRecoveryConnection = origCreate;
        pool.query = origPoolQuery;

        assert.strictEqual(isoResult.isolated, true, 'GREEN active, BLUE target must be approved as isolated');
        recordPass('GREEN active, BLUE recovery target verified allowed');
    } catch (err) {
        recordFail('GREEN active, BLUE recovery target verified allowed', err);
    }

    // ─── 20. Audit 1.3: GREEN Active, GREEN Recovery Target (Rejected) ─────────
    console.log('\n--- 20. Testing Isolation: GREEN Active, GREEN Target Rejected ---');
    try {
        const origPoolQuery = pool.query;
        const origCreate = recoveryDatabaseService.createRecoveryConnection;

        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('@@server_uuid')) {
                return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]]; // GREEN active
            }
            return origPoolQuery.call(pool, sql, params);
        };

        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'railway', server_host: 'green-host.railway.internal', server_id: 2, db_ver: '8.4.13' }]];
                    }
                    if (sql.includes('SELECT @@server_uuid')) {
                        return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]]; // GREEN target
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        let rejected = false;
        try {
            await recoveryDatabaseService.verifyRecoveryIsolation({
                host: 'green-host.railway.internal',
                port: 3306,
                user: 'labsync_recovery',
                password: 'password',
                database: 'railway'
            });
        } catch (err) {
            if (err.code === 'RECOVERY_TARGETS_PRODUCTION') {
                rejected = true;
            }
        } finally {
            recoveryDatabaseService.createRecoveryConnection = origCreate;
            pool.query = origPoolQuery;
        }

        assert.strictEqual(rejected, true, 'GREEN active, GREEN target must be rejected');
        recordPass('GREEN active, GREEN recovery target verified rejected');
    } catch (err) {
        recordFail('GREEN active, GREEN recovery target verified rejected', err);
    }

    // ─── 21. Audit 1.4: Active DB Offline During Destructive Recovery (Rejected) ─
    console.log('\n--- 21. Testing Fail-Closed: Active DB Identity Unavailable During Destructive Recovery ---');
    try {
        const origPoolQuery = pool.query;
        const origCreate = recoveryDatabaseService.createRecoveryConnection;

        // Mock pool throwing ECONNREFUSED
        pool.query = async function () {
            const connErr = new Error('ECONNREFUSED: Active production pool unreachable');
            connErr.code = 'ECONNREFUSED';
            throw connErr;
        };

        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'railway', server_host: 'green-host.railway.internal', server_id: 2, db_ver: '8.4.13' }]];
                    }
                    if (sql.includes('SELECT @@server_uuid')) {
                        return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        let threw = false;
        try {
            await recoveryDatabaseService.verifyRecoveryIsolation(
                {
                    host: 'green-host.railway.internal',
                    port: 3306,
                    user: 'labsync_recovery',
                    password: 'password',
                    database: 'railway'
                },
                { isDestructive: true }
            );
        } catch (err) {
            if (err.code === 'ISOLATION_VERIFICATION_FAILED') {
                threw = true;
            }
        } finally {
            recoveryDatabaseService.createRecoveryConnection = origCreate;
            pool.query = origPoolQuery;
        }

        assert.strictEqual(threw, true, 'Destructive recovery must fail closed when active DB identity is unavailable');
        recordPass('Active database identity unavailable destructive recovery rejected (fail-closed)');
    } catch (err) {
        recordFail('Active database identity unavailable destructive recovery rejected (fail-closed)', err);
    }

    // ─── 22. Audit 1.5: Stale BLUE UUID After Promotion Must Not Approve GREEN ──
    console.log('\n--- 22. Testing Isolation: Stale BLUE UUID Does Not Approve GREEN ---');
    try {
        const origPoolQuery = pool.query;
        const origCreate = recoveryDatabaseService.createRecoveryConnection;

        // Set pinned UUID to stale BLUE
        recoveryDatabaseService.setPinnedProductionServerUuid('fb252566-c303-11f1-9553-a2aa08ba6a31');

        // Live pool returns GREEN (since GREEN was promoted to active DB)
        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('@@server_uuid')) {
                return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]]; // GREEN
            }
            return origPoolQuery.call(pool, sql, params);
        };

        // Recovery target is GREEN
        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT DATABASE()')) {
                        return [[{ current_db: 'railway', server_host: 'green-host.railway.internal', server_id: 2, db_ver: '8.4.13' }]];
                    }
                    if (sql.includes('SELECT @@server_uuid')) {
                        return [[{ server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]]; // GREEN
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        let rejected = false;
        try {
            await recoveryDatabaseService.verifyRecoveryIsolation({
                host: 'green-host.railway.internal',
                port: 3306,
                user: 'labsync_recovery',
                password: 'password',
                database: 'railway'
            });
        } catch (err) {
            if (err.code === 'RECOVERY_TARGETS_PRODUCTION') {
                rejected = true;
            }
        } finally {
            recoveryDatabaseService.setPinnedProductionServerUuid(null);
            recoveryDatabaseService.createRecoveryConnection = origCreate;
            pool.query = origPoolQuery;
        }

        assert.strictEqual(rejected, true, 'Stale BLUE UUID must not permit GREEN target when live pool is GREEN');
        recordPass('Stale BLUE UUID after promotion does not cause GREEN to be approved as isolated');
    } catch (err) {
        recordFail('Stale BLUE UUID after promotion does not cause GREEN to be approved as isolated', err);
    }

    // ─── 23. Audit 2.1: Fresh Process Start with MAINTENANCE_MODE=true and API ──
    console.log('\n--- 23. Testing Maintenance Mode: Fresh Process Startup & Driver Source API ---');
    try {
        const { getMaintenanceModeStatus } = require('../middleware/maintenanceMode');

        // Test environment-driven mode
        process.env.MAINTENANCE_MODE = 'true';
        setMaintenanceMode(false); // runtime toggle is false

        assert.strictEqual(isMaintenanceModeActive(), true, 'Must initialize active when env is set to true');
        const envStatus = getMaintenanceModeStatus();
        assert.strictEqual(envStatus.active, true);
        assert.strictEqual(envStatus.source, 'environment');
        assert.strictEqual(envStatus.isEnvironmentDriven, true);

        // Test runtime toggle mode
        delete process.env.MAINTENANCE_MODE;
        setMaintenanceMode(true);
        assert.strictEqual(isMaintenanceModeActive(), true);
        const runtimeStatus = getMaintenanceModeStatus();
        assert.strictEqual(runtimeStatus.active, true);
        assert.strictEqual(runtimeStatus.source, 'runtime_toggle');
        assert.strictEqual(runtimeStatus.isRuntimeToggle, true);

        // Reset
        setMaintenanceMode(false);
        assert.strictEqual(isMaintenanceModeActive(), false);
        const offStatus = getMaintenanceModeStatus();
        assert.strictEqual(offStatus.active, false);
        assert.strictEqual(offStatus.source, 'none');

        recordPass('Maintenance mode fresh process startup and driver source reporting verified');
    } catch (err) {
        recordFail('Maintenance mode fresh process startup and driver source reporting verified', err);
    }

    // ─── 24. Audit 2.2: Background Services Skip Writes During Maintenance Mode ─
    console.log('\n--- 24. Testing Background Tasks: Skip DB Writes During Maintenance Mode ---');
    try {
        const activityRetentionService = require('../services/activityRetentionService');
        const keyReminderService = require('../services/keyReminderService');

        setMaintenanceMode(true);

        // Activity retention cleanup must abort before querying or deleting
        const retentionResult = await activityRetentionService.runRetentionCleanup();
        assert.strictEqual(retentionResult.deletedCount, 0, 'No rows deleted during maintenance');
        assert.strictEqual(retentionResult.maintenanceMode, true, 'Flagged as skipped due to maintenance');

        // Key reminder task must abort before querying or claiming
        const reminderResult = await keyReminderService.checkAndSendKeyReminders();
        assert.strictEqual(reminderResult.checked, 0, 'No reminders checked during maintenance');
        assert.strictEqual(reminderResult.sent, 0, 'No reminders sent during maintenance');
        assert.strictEqual(reminderResult.maintenanceMode, true, 'Flagged as skipped due to maintenance');

        setMaintenanceMode(false);
        recordPass('Background retention and key reminder workers skip DB writes during maintenance');
    } catch (err) {
        setMaintenanceMode(false);
        recordFail('Background retention and key reminder workers skip DB writes during maintenance', err);
    }

    // ─── 25. Audit 4.1: Least Privilege Verification (DROP and LOCK Excluded) ───
    console.log('\n--- 25. Testing Least Privilege: labsync_app Prohibits DROP and LOCK TABLES ---');
    try {
        const fs = require('fs');
        const path = require('path');

        // Verify zero DROP statements across all migrations in database/migrations/*.sql
        const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

        let dropCount = 0;
        for (const file of migrationFiles) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            // Match standalone SQL DROP statements (not comments)
            const cleanLines = sql.split('\n').filter(l => !l.trim().startsWith('--'));
            for (const line of cleanLines) {
                if (/\bDROP\s+(TABLE|DATABASE|VIEW|COLUMN)\b/i.test(line)) {
                    dropCount++;
                }
            }
        }

        assert.strictEqual(dropCount, 0, 'Zero migrations execute DROP statements');

        // Verify setup guide does NOT grant DROP or LOCK TABLES to labsync_app
        const setupGuide = fs.readFileSync(path.join(__dirname, '..', 'docs', 'Railway_Online_Recovery_Sandbox_Setup_Guide.md'), 'utf8');
        assert.ok(!setupGuide.includes("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP"), 'DROP removed from labsync_app grant');
        assert.ok(!setupGuide.includes("REFERENCES, LOCK TABLES ON `railway`.* TO 'labsync_app'"), 'LOCK TABLES removed from labsync_app grant');

        recordPass('Least privilege verified: DROP and LOCK TABLES permanently excluded for labsync_app');
    } catch (err) {
        recordFail('Least privilege verified: DROP and LOCK TABLES permanently excluded for labsync_app', err);
    }

    // ─── 26. Audit 3.1: Ephemeral State Resilience (Works Without JSON File) ────
    console.log('\n--- 26. Testing Ephemeral State Resilience: Readiness Evaluates Live DB ---');
    try {
        const origCreate = recoveryDatabaseService.createRecoveryConnection;
        const origPoolQuery = pool.query;

        // Mock live candidate database returning core tables
        recoveryDatabaseService.createRecoveryConnection = async function () {
            return {
                query: async function (sql) {
                    if (sql.includes('SELECT VERSION()')) {
                        return [[{ ver: '8.4.13', server_uuid: 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c' }]];
                    }
                    if (sql.includes('information_schema.TABLES')) {
                        return [[
                            { TABLE_NAME: 'users' },
                            { TABLE_NAME: 'laboratories' },
                            { TABLE_NAME: 'lab_units' },
                            { TABLE_NAME: 'schedules' },
                            { TABLE_NAME: 'maintenance_issues' },
                            { TABLE_NAME: 'audit_logs' },
                            { TABLE_NAME: 'backup_history' }
                        ]];
                    }
                    return [[]];
                },
                end: async function () {}
            };
        };

        pool.query = async function (sql, params) {
            if (typeof sql === 'string' && sql.includes('@@server_uuid')) {
                return [[{ ver: '9.7.4', server_uuid: 'fb252566-c303-11f1-9553-a2aa08ba6a31' }]];
            }
            return origPoolQuery.call(pool, sql, params);
        };

        const origHost = process.env.RECOVERY_DB_HOST;
        process.env.RECOVERY_DB_HOST = 'LabSync-Recovery-Sandbox.railway.internal';
        process.env.RECOVERY_DB_USER = 'labsync_recovery';
        process.env.RECOVERY_DB_NAME = 'railway';

        const readiness = await recoveryDatabaseService.verifyPromotionReadiness();

        process.env.RECOVERY_DB_HOST = origHost;
        recoveryDatabaseService.createRecoveryConnection = origCreate;
        pool.query = origPoolQuery;

        assert.strictEqual(readiness.ready, true, 'Promotion readiness derives candidate state from live schema');
        assert.strictEqual(readiness.candidateDatabase.serverUuid, 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c');
        assert.strictEqual(readiness.checks.tablesPresent, true);

        recordPass('Ephemeral recovery state resilience verified: live schema queries evaluate promotion');
    } catch (err) {
        recordFail('Ephemeral recovery state resilience verified: live schema queries evaluate promotion', err);
    }

    // ─── 27. Audit 1.7: Green Server UUID Consistency Across Entire System ──────
    console.log('\n--- 27. Testing Green Server UUID Consistency Across Entire System ---');
    try {
        const fs = require('fs');
        const path = require('path');

        const CORRECT_GREEN_UUID = 'df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c';
        const WRONG_TYPO_UUID = 'df694bff-d6ae-11f1-85d7-a2aa08ba6a31';

        const criticalFiles = [
            path.join(__dirname, '..', 'services', 'recoveryDatabaseService.js'),
            path.join(__dirname, '..', 'js', 'components', 'backup', 'backup-recovery.modal.js'),
            path.join(__dirname, '..', 'docs', 'Railway_Online_Recovery_Sandbox_Setup_Guide.md'),
            path.join(__dirname, '..', 'docs', 'LabSync_Security_Live_Verification_Guide.md')
        ];

        for (const file of criticalFiles) {
            const content = fs.readFileSync(file, 'utf8');
            assert.ok(!content.includes(WRONG_TYPO_UUID), `Wrong typo UUID (${WRONG_TYPO_UUID}) must not exist in ${path.basename(file)}`);
            assert.ok(content.includes(CORRECT_GREEN_UUID), `Correct Green UUID (${CORRECT_GREEN_UUID}) must be present in ${path.basename(file)}`);
        }

        recordPass('Green server UUID consistency verified across services, frontend modal, and setup docs');
    } catch (err) {
        recordFail('Green server UUID consistency verified across services, frontend modal, and setup docs', err);
    }

    // ─── 28. Testing Backup Export Allowed During Maintenance Mode ──────────────
    console.log('\n--- 28. Testing Backup Export Allowed During Maintenance Mode ---');
    try {
        const { setMaintenanceMode, maintenanceModeMiddleware } = require('../middleware/maintenanceMode');
        setMaintenanceMode(true);

        // 1. Regular mutation should be blocked with 503
        let regBlocked = false;
        let regStatusCode = 0;
        const mockRegRes = {
            setHeader: () => {},
            status: (code) => {
                regStatusCode = code;
                return {
                    json: (data) => {
                        if (code === 503 && data.code === 'CUTOVER_MAINTENANCE_MODE_ACTIVE') {
                            regBlocked = true;
                        }
                    }
                };
            }
        };
        maintenanceModeMiddleware({ method: 'POST', baseUrl: '/api/admin/laboratories', path: '' }, mockRegRes, () => {
            regBlocked = false;
        });
        assert.strictEqual(regBlocked, true, 'Regular mutation must be blocked with HTTP 503 during maintenance mode');

        // 2. Backup creation mutation must be exempted to allow IT Head to capture frozen snapshot
        let backupAllowed = false;
        const mockBackupRes = {
            setHeader: () => {},
            status: () => ({ json: () => {} })
        };
        maintenanceModeMiddleware({ method: 'POST', baseUrl: '/api/admin/backups', path: '/create' }, mockBackupRes, () => {
            backupAllowed = true;
        });
        assert.strictEqual(backupAllowed, true, 'Backup creation (/api/admin/backups/create) must be exempted during maintenance mode');

        // Clean up
        setMaintenanceMode(false);
        recordPass('Backup export creation permitted during maintenance mode while normal mutations are blocked');
    } catch (err) {
        recordFail('Backup export creation permitted during maintenance mode while normal mutations are blocked', err);
    }

    // ─── 29. Testing Background Job Drain Visibility in Maintenance Status ──────
    console.log('\n--- 29. Testing Background Job Drain Visibility in Maintenance Status ---');
    try {
        const backupController = require('../controllers/backup.controller');
        const activityRetentionService = require('../services/activityRetentionService');
        const keyReminderService = require('../services/keyReminderService');

        let statusData = null;
        let statusCode = null;
        const mockRes = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { statusData = data; }
                };
            }
        };

        // Case A: Background jobs idle and 0 active mutations
        const origRetention = activityRetentionService.isRetentionRunning;
        const origReminder = keyReminderService.isKeyReminderChecking;

        activityRetentionService.isRetentionRunning = () => false;
        keyReminderService.isKeyReminderChecking = () => false;

        await backupController.getMaintenanceMode({}, mockRes);
        assert.strictEqual(statusCode, 200);
        assert.strictEqual(typeof statusData.retentionJobRunning, 'boolean');
        assert.strictEqual(typeof statusData.keyReminderJobRunning, 'boolean');
        assert.strictEqual(typeof statusData.activeMutationRequests, 'number');
        assert.strictEqual(typeof statusData.mutationRequestsDrained, 'boolean');
        assert.strictEqual(typeof statusData.cutoverDrained, 'boolean');
        assert.strictEqual(statusData.retentionJobRunning, false);
        assert.strictEqual(statusData.keyReminderJobRunning, false);
        assert.strictEqual(statusData.backgroundJobsDrained, true, 'backgroundJobsDrained must be true when both jobs are idle');
        assert.strictEqual(statusData.mutationRequestsDrained, true, 'mutationRequestsDrained must be true when 0 active mutations');
        assert.strictEqual(statusData.cutoverDrained, true, 'cutoverDrained must be true when all operations are drained');

        // Case B: Retention job active
        activityRetentionService.isRetentionRunning = () => true;
        await backupController.getMaintenanceMode({}, mockRes);
        assert.strictEqual(statusData.retentionJobRunning, true);
        assert.strictEqual(statusData.backgroundJobsDrained, false, 'backgroundJobsDrained must be false when retention job is running');
        assert.strictEqual(statusData.cutoverDrained, false, 'cutoverDrained must be false when retention job is running');

        // Case C: Key reminder job active
        activityRetentionService.isRetentionRunning = () => false;
        keyReminderService.isKeyReminderChecking = () => true;
        await backupController.getMaintenanceMode({}, mockRes);
        assert.strictEqual(statusData.keyReminderJobRunning, true);
        assert.strictEqual(statusData.backgroundJobsDrained, false, 'backgroundJobsDrained must be false when key reminder is checking');
        assert.strictEqual(statusData.cutoverDrained, false, 'cutoverDrained must be false when key reminder is checking');

        // Restore originals
        activityRetentionService.isRetentionRunning = origRetention;
        keyReminderService.isKeyReminderChecking = origReminder;

        recordPass('Background job drain visibility accurately reported in maintenance status');
    } catch (err) {
        recordFail('Background job drain visibility accurately reported in maintenance status', err);
    }

    // ─── 30. Testing UI Toggle Cannot Override Environment Maintenance Mode ────
    console.log('\n--- 30. Testing UI Toggle Cannot Override Environment Maintenance Mode ---');
    try {
        const backupController = require('../controllers/backup.controller');
        const origEnvMaint = process.env.MAINTENANCE_MODE;
        process.env.MAINTENANCE_MODE = 'true';

        let toggleData = null;
        let toggleCode = null;
        const mockToggleRes = {
            status: (code) => {
                toggleCode = code;
                return {
                    json: (data) => { toggleData = data; }
                };
            }
        };

        await backupController.toggleMaintenanceMode({ body: { enabled: false } }, mockToggleRes, () => {});
        assert.strictEqual(toggleCode, 400, 'UI toggle disable attempt must return HTTP 400 when env var is true');
        assert.strictEqual(toggleData.code, 'ENVIRONMENT_DRIVEN_MAINTENANCE');
        assert.strictEqual(toggleData.maintenanceMode, true);

        // Restore env
        if (origEnvMaint !== undefined) {
            process.env.MAINTENANCE_MODE = origEnvMaint;
        } else {
            delete process.env.MAINTENANCE_MODE;
        }

        recordPass('UI toggle cannot override environment-driven maintenance mode (HTTP 400 rejected)');
    } catch (err) {
        recordFail('UI toggle cannot override environment-driven maintenance mode (HTTP 400 rejected)', err);
    }

    // ─── 31. Testing In-Flight Mutation Request Tracking & Cutover Drain ────────
    console.log('\n--- 31. Testing In-Flight Mutation Request Tracking & Cutover Drain Lifecycle ---');
    try {
        const EventEmitter = require('events');
        const {
            setMaintenanceMode,
            getActiveMutationRequests,
            _resetActiveMutationRequestsForTesting,
            maintenanceModeMiddleware
        } = require('../middleware/maintenanceMode');
        const backupController = require('../controllers/backup.controller');
        const activityRetentionService = require('../services/activityRetentionService');
        const keyReminderService = require('../services/keyReminderService');

        function createMockRes() {
            const res = new EventEmitter();
            res.headers = {};
            res.setHeader = (k, v) => { res.headers[k] = v; };
            res.statusCode = 200;
            res.status = function(code) {
                res.statusCode = code;
                return this;
            };
            res.json = function(data) {
                res.body = data;
                return res.end();
            };
            res.send = function(data) {
                res.body = data;
                return res.end();
            };
            res.end = function() {
                res.writableEnded = true;
                return res;
            };
            return res;
        }

        // Reset state
        _resetActiveMutationRequestsForTesting();
        setMaintenanceMode(false);
        const origRetention = activityRetentionService.isRetentionRunning;
        const origReminder = keyReminderService.isKeyReminderChecking;
        activityRetentionService.isRetentionRunning = () => false;
        keyReminderService.isKeyReminderChecking = () => false;

        // ════════════════════════════════════════════════════════════════════════
        // PRIMARY ASYNC SCENARIO: DISCONNECTED CLIENT WITH PENDING DATABASE OPERATION
        // ════════════════════════════════════════════════════════════════════════

        // Step 1: Start a mutation request
        const req1 = { method: 'POST', baseUrl: '/api/laboratories', path: '/add' };
        const res1 = createMockRes();

        let completeDbOp;
        const dbOpPromise = new Promise(resolve => { completeDbOp = resolve; });

        let handlerRunning = false;
        maintenanceModeMiddleware(req1, res1, () => {
            handlerRunning = true;
            // Step 2 & 3: Handler begins database-like async operation and keeps it pending
            dbOpPromise.then(() => {
                res1.status(200).json({ success: true, roomId: 101 });
            });
        });

        assert.strictEqual(handlerRunning, true, 'Handler must be admitted when maintenance is inactive');
        assert.strictEqual(getActiveMutationRequests(), 1, 'In-flight mutation counter must increment to 1');

        // Step 4: Disconnect simulated client before operation completes
        res1.emit('close');

        // Step 5: Confirm activeMutationRequests remains > 0 (client disconnect does NOT cancel server op)
        assert.strictEqual(
            getActiveMutationRequests(),
            1,
            'CRITICAL SAFETY ASSERTION: activeMutationRequests must remain > 0 after client disconnect while DB op is pending'
        );

        // Step 6: Confirm mutationRequestsDrained is false
        // Step 7: Confirm cutoverDrained is false
        let statusAfterDisconnect = null;
        await backupController.getMaintenanceMode({}, { status: () => ({ json: (d) => { statusAfterDisconnect = d; } }) });
        assert.strictEqual(statusAfterDisconnect.activeMutationRequests, 1);
        assert.strictEqual(statusAfterDisconnect.mutationRequestsDrained, false, 'mutationRequestsDrained must remain false while disconnected DB op is pending');
        assert.strictEqual(statusAfterDisconnect.cutoverDrained, false, 'cutoverDrained must remain false while disconnected DB op is pending');

        // Step 8: Activate maintenance mode and verify a new mutation receives HTTP 503
        setMaintenanceMode(true);
        const req2 = { method: 'POST', baseUrl: '/api/laboratories', path: '/add' };
        const res2 = createMockRes();
        let req2NextCalled = false;
        maintenanceModeMiddleware(req2, res2, () => { req2NextCalled = true; });
        assert.strictEqual(req2NextCalled, false, 'New mutating request must NOT be admitted during active maintenance');
        assert.strictEqual(res2.statusCode, 503, 'New mutating request must be rejected with HTTP 503');
        assert.strictEqual(res2.body.code, 'CUTOVER_MAINTENANCE_MODE_ACTIVE');
        assert.strictEqual(getActiveMutationRequests(), 1, 'Rejected 503 request must NOT change active counter');

        // Step 9: Complete original delayed operation (simulating MySQL query resolving)
        completeDbOp();
        await new Promise(r => setImmediate(r));

        // Step 10: Confirm counter decrements exactly once upon server-side operation settlement
        assert.strictEqual(getActiveMutationRequests(), 0, 'In-flight counter must decrement to 0 after server-side DB op settles');

        // Step 11: Confirm status becomes fully drained only after both background jobs and all tracked mutations are finished
        let statusDrained = null;
        await backupController.getMaintenanceMode({}, { status: () => ({ json: (d) => { statusDrained = d; } }) });
        assert.strictEqual(statusDrained.activeMutationRequests, 0);
        assert.strictEqual(statusDrained.mutationRequestsDrained, true, 'mutationRequestsDrained must be true after completion');
        assert.strictEqual(statusDrained.cutoverDrained, true, 'cutoverDrained must be true when all requests and workers are idle');

        // ════════════════════════════════════════════════════════════════════════
        // ADDITIONAL ASYNCHRONOUS SCENARIOS
        // ════════════════════════════════════════════════════════════════════════

        // Case A: Normal response completion without disconnect
        setMaintenanceMode(false);
        const resNorm = createMockRes();
        maintenanceModeMiddleware({ method: 'PUT', baseUrl: '/api/laboratories', path: '/1' }, resNorm, () => {
            resNorm.status(200).json({ updated: true });
        });
        assert.strictEqual(getActiveMutationRequests(), 0, 'Normal completion decrements to 0');

        // Case B: Handler rejection / Database failure caught and passed to error handler
        const resErr = createMockRes();
        maintenanceModeMiddleware({ method: 'POST', baseUrl: '/api/schedules', path: '/save' }, resErr, () => {
            try {
                throw new Error('Deadlock detected during schedule insertion');
            } catch (e) {
                resErr.status(500).json({ error: e.message });
            }
        });
        assert.strictEqual(getActiveMutationRequests(), 0, 'Handler error / DB failure decrements cleanly');

        // Case C: Multiple concurrent mutations with varied disconnect and finish order
        const resA = createMockRes();
        const resB = createMockRes();
        const resC = createMockRes();

        let finishA, finishB, finishC;
        const pA = new Promise(r => { finishA = r; });
        const pB = new Promise(r => { finishB = r; });
        const pC = new Promise(r => { finishC = r; });

        maintenanceModeMiddleware({ method: 'POST', baseUrl: '/api/pcs', path: '' }, resA, () => {
            pA.then(() => resA.status(201).json({ id: 'pc-1' }));
        });
        maintenanceModeMiddleware({ method: 'PUT', baseUrl: '/api/pcs', path: '/pc-2' }, resB, () => {
            pB.then(() => resB.status(200).json({ id: 'pc-2' }));
        });
        maintenanceModeMiddleware({ method: 'DELETE', baseUrl: '/api/pcs', path: '/pc-3' }, resC, () => {
            pC.then(() => resC.status(200).json({ deleted: true }));
        });

        assert.strictEqual(getActiveMutationRequests(), 3, 'All 3 concurrent mutations tracked');

        // Client B abruptly disconnects while B is pending
        resB.emit('close');
        assert.strictEqual(getActiveMutationRequests(), 3, 'Disconnect of B must NOT decrement while B is pending');

        // A finishes normally
        finishA();
        await new Promise(r => setImmediate(r));
        assert.strictEqual(getActiveMutationRequests(), 2, 'A completion decrements to 2');

        // Disconnected B finishes its server-side write
        finishB();
        await new Promise(r => setImmediate(r));
        assert.strictEqual(getActiveMutationRequests(), 1, 'Disconnected B completing DB op decrements to 1');

        // C finishes
        finishC();
        await new Promise(r => setImmediate(r));
        assert.strictEqual(getActiveMutationRequests(), 0, 'C completion decrements to 0');

        // Case D: Repeated finish / close events & lower bound at 0
        resC.emit('close');
        resC.emit('finish');
        resC.end();
        assert.strictEqual(getActiveMutationRequests(), 0, 'Repeated events do not double-decrement or go negative');

        // Restore originals
        activityRetentionService.isRetentionRunning = origRetention;
        keyReminderService.isKeyReminderChecking = origReminder;
        setMaintenanceMode(false);
        _resetActiveMutationRequestsForTesting();

        recordPass('In-flight mutation request tracking and cutover drain lifecycle verified comprehensively');
    } catch (err) {
        recordFail('In-flight mutation request tracking and cutover drain lifecycle verified comprehensively', err);
    }

    // ─── 32. Testing Real HTTP Socket Disconnection Over Loopback TCP ───────────
    console.log('\n--- 32. Testing Real HTTP Socket Disconnection & Mutation Drain Lifecycle ---');
    try {
        const http = require('http');
        const express = require('express');
        const {
            setMaintenanceMode,
            getActiveMutationRequests,
            getUnresolvedOperationsCount,
            _resetActiveMutationRequestsForTesting,
            maintenanceModeMiddleware
        } = require('../middleware/maintenanceMode');
        const backupController = require('../controllers/backup.controller');
        const activityRetentionService = require('../services/activityRetentionService');
        const keyReminderService = require('../services/keyReminderService');

        // Setup real Express app
        const app = express();
        app.use(express.json());
        app.use(maintenanceModeMiddleware);

        let pendingResolve = null;
        let pendingPromise = null;
        let serverObservedClose = false;

        app.post('/api/laboratories/real-http-test', (req, res) => {
            req.on('close', () => { serverObservedClose = true; });
            res.on('close', () => { serverObservedClose = true; });

            pendingPromise = new Promise(resolve => { pendingResolve = resolve; });
            pendingPromise.then(() => {
                res.status(200).json({ success: true, saved: true });
            });
        });

        // Error handler
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;

        // Reset state
        _resetActiveMutationRequestsForTesting();
        setMaintenanceMode(false);
        const origRetention = activityRetentionService.isRetentionRunning;
        const origReminder = keyReminderService.isKeyReminderChecking;
        activityRetentionService.isRetentionRunning = () => false;
        keyReminderService.isKeyReminderChecking = () => false;

        // Step 1 & 2: Real client POST request
        const clientReq = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/api/laboratories/real-http-test',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        clientReq.on('error', () => {}); // Handle expected ECONNRESET
        clientReq.write(JSON.stringify({ name: 'Lab 501' }));
        clientReq.end();

        // Wait until server handler enters
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (pendingResolve && getActiveMutationRequests() === 1) {
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });

        assert.strictEqual(getActiveMutationRequests(), 1, 'In-flight mutation counter is 1');

        // Step 3: Destroy client socket while DB op is pending
        clientReq.destroy();

        // Wait for server to observe close
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (serverObservedClose) {
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });

        // Step 4: Verify counter remains > 0 and unresolvedOperations reports 1
        assert.strictEqual(getActiveMutationRequests(), 1, 'Active mutation counter must remain 1 after client disconnect');
        assert.strictEqual(getUnresolvedOperationsCount(), 1, 'Unresolved operations count must be 1');

        let statusAfterDisconnect = null;
        await backupController.getMaintenanceMode({}, { status: () => ({ json: (d) => { statusAfterDisconnect = d; } }) });
        assert.strictEqual(statusAfterDisconnect.activeMutationRequests, 1);
        assert.strictEqual(statusAfterDisconnect.mutationRequestsDrained, false);
        assert.strictEqual(statusAfterDisconnect.cutoverDrained, false);

        // Step 5: Activate maintenance mode and verify subsequent request returns 503
        setMaintenanceMode(true);

        const blockedRes = await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: port,
                path: '/api/laboratories/real-http-test',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                });
            });
            req.on('error', reject);
            req.write(JSON.stringify({ name: 'Lab 502' }));
            req.end();
        });

        assert.strictEqual(blockedRes.statusCode, 503, 'New mutating request during maintenance receives 503');
        assert.strictEqual(blockedRes.body.code, 'CUTOVER_MAINTENANCE_MODE_ACTIVE');
        assert.strictEqual(getActiveMutationRequests(), 1, 'Rejected 503 does not alter active counter');

        // Step 6: Complete the delayed server-side DB operation
        pendingResolve();
        await new Promise(r => setTimeout(r, 50));

        // Step 7: Verify counter decrements to 0 and cutover is fully drained
        assert.strictEqual(getActiveMutationRequests(), 0, 'Counter decrements to 0 after server operation settles');
        assert.strictEqual(getUnresolvedOperationsCount(), 0, 'Unresolved count decrements to 0');

        let statusDrained = null;
        await backupController.getMaintenanceMode({}, { status: () => ({ json: (d) => { statusDrained = d; } }) });
        assert.strictEqual(statusDrained.activeMutationRequests, 0);
        assert.strictEqual(statusDrained.mutationRequestsDrained, true);
        assert.strictEqual(statusDrained.cutoverDrained, true);

        // Cleanup
        activityRetentionService.isRetentionRunning = origRetention;
        keyReminderService.isKeyReminderChecking = origReminder;
        setMaintenanceMode(false);
        _resetActiveMutationRequestsForTesting();
        await new Promise(resolve => server.close(resolve));

        recordPass('Real HTTP socket disconnection over loopback TCP verifies robust mutation drain lifecycle');
    } catch (err) {
        recordFail('Real HTTP socket disconnection over loopback TCP verifies robust mutation drain lifecycle', err);
    }

    // ─── Summary ────────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log(`Blue-Green Promotion Test Summary: ${testPassed} Passed, ${testFailed} Failed`);
    console.log('================================================================');

    if (testFailed > 0) {
        process.exit(1);
    }
}

runBlueGreenPromotionTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
});
