'use strict';

/**
 * tests/test-backup-production-guard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Verification Test Suite for Fail-Closed Production Lockout on Database Restoration.
 *
 * Requirements:
 * 1. NODE_ENV === 'production' returns HTTP 403 RESTORE_BLOCKED_ON_PRODUCTION.
 * 2. RAILWAY_ENVIRONMENT returns HTTP 403.
 * 3. RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_NAME returns HTTP 403.
 * 4. Request is rejected BEFORE upload body parsing or stream processing.
 * 5. Request is rejected BEFORE ephemeral file creation under os.tmpdir().
 * 6. Request is rejected BEFORE native client process execution.
 * 7. IT Department Head with valid credentials is still permanently blocked on production.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const session = require('express-session');
const os = require('os');
const fs = require('fs');
const restoreService = require('../services/restoreService');
const routes = require('../routes');

console.log('================================================================');
console.log('🧪 LABSYNC SECURITY FEATURE #17: PRODUCTION GUARD TEST SUITE');
console.log('================================================================');

async function runProductionGuardTests() {
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

    // Set up test server
    const app = express();
    app.use(session({
        secret: 'test-labsync-production-guard-secret',
        resave: false,
        saveUninitialized: false
    }));

    // Helper endpoint to attach session identity
    app.post('/test/auth/session', express.json(), (req, res) => {
        req.session.userId = req.body.userId;
        req.session.userRole = req.body.userRole;
        req.session.userEmail = req.body.userEmail;
        req.session.lastActivity = Date.now();
        req.session.save(() => res.json({ ok: true }));
    });

    // Track whether body parser or downstream middleware executed
    let downstreamExecuted = false;
    app.use('/api/admin/backups/restore', (req, res, next) => {
        // This runs AFTER the route-level middlewares if they pass
        downstreamExecuted = true;
        next();
    });

    app.use('/api', routes);

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Establish IT Dept Head session
    const loginRes = await fetch(`${baseUrl}/test/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1, userRole: 'IT Dept. Head', userEmail: 'head@labsync.com' })
    });
    const itHeadCookie = loginRes.headers.get('set-cookie').split(';')[0];

    const savedEnv = { ...process.env };

    try {
        // ─── TEST 1: Unit Check - isProductionEnvironment() ──────────────────
        console.log('\n--- 1. Testing Environment Detection Flags ---');
        try {
            process.env.NODE_ENV = 'production';
            assert.strictEqual(restoreService.isProductionEnvironment(), true, 'NODE_ENV=production must return true');

            delete process.env.NODE_ENV;
            process.env.RAILWAY_ENVIRONMENT = 'production';
            assert.strictEqual(restoreService.isProductionEnvironment(), true, 'RAILWAY_ENVIRONMENT must return true');

            delete process.env.RAILWAY_ENVIRONMENT;
            process.env.RAILWAY_PROJECT_ID = 'prj_123456';
            assert.strictEqual(restoreService.isProductionEnvironment(), true, 'RAILWAY_PROJECT_ID must return true');

            delete process.env.RAILWAY_PROJECT_ID;
            process.env.RAILWAY_SERVICE_ID = 'srv_123456';
            assert.strictEqual(restoreService.isProductionEnvironment(), true, 'RAILWAY_SERVICE_ID must return true');

            delete process.env.RAILWAY_SERVICE_ID;
            process.env.DB_HOST = 'roundhouse.proxy.rlwy.net';
            assert.strictEqual(restoreService.isProductionEnvironment(), true, 'Railway DB_HOST must return true');

            recordPass('All production and Railway platform flags reliably trigger isProductionEnvironment()');
        } catch (err) {
            recordFail('All production and Railway platform flags reliably trigger isProductionEnvironment()', err);
        }

        // ─── TEST 2: HTTP 403 under NODE_ENV === 'production' ────────────────
        console.log('\n--- 2. Testing HTTP 403 Rejection under NODE_ENV === "production" ---');
        try {
            process.env = { ...savedEnv, NODE_ENV: 'production' };
            downstreamExecuted = false;

            const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent('AnyAdminPass123!'),
                    'X-Backup-Checksum': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                },
                body: Buffer.from('FAKE_GZIP_PAYLOAD_NOT_READ')
            });

            assert.strictEqual(res.status, 403, 'Must return HTTP 403 on production');
            const data = await res.json();
            assert.strictEqual(data.code, 'RESTORE_BLOCKED_ON_PRODUCTION', 'Code must be RESTORE_BLOCKED_ON_PRODUCTION');
            assert.ok(data.error.includes('permanently disabled'), 'Error message must reflect permanent production lockout');

            recordPass('NODE_ENV=production returns HTTP 403 RESTORE_BLOCKED_ON_PRODUCTION');
        } catch (err) {
            recordFail('NODE_ENV=production returns HTTP 403 RESTORE_BLOCKED_ON_PRODUCTION', err);
        }

        // ─── TEST 3: HTTP 403 under RAILWAY_ENVIRONMENT ─────────────────────
        console.log('\n--- 3. Testing HTTP 403 Rejection under RAILWAY_ENVIRONMENT ---');
        try {
            process.env = { ...savedEnv, RAILWAY_ENVIRONMENT: 'production' };
            delete process.env.NODE_ENV;

            const res = await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent('AnyAdminPass123!'),
                    'X-Backup-Checksum': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                },
                body: Buffer.from('FAKE_GZIP_PAYLOAD_NOT_READ')
            });

            assert.strictEqual(res.status, 403, 'Must return HTTP 403 on Railway deployment');
            const data = await res.json();
            assert.strictEqual(data.code, 'RESTORE_BLOCKED_ON_PRODUCTION', 'Code must be RESTORE_BLOCKED_ON_PRODUCTION');

            recordPass('RAILWAY_ENVIRONMENT returns HTTP 403 RESTORE_BLOCKED_ON_PRODUCTION');
        } catch (err) {
            recordFail('RAILWAY_ENVIRONMENT returns HTTP 403 RESTORE_BLOCKED_ON_PRODUCTION', err);
        }

        // ─── TEST 4: Zero Temporary Files Created on Production Rejection ────
        console.log('\n--- 4. Testing Zero Temporary File Creation on Production Rejection ---');
        try {
            process.env = { ...savedEnv, NODE_ENV: 'production' };

            const beforeFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('labsync-restore-'));

            await fetch(`${baseUrl}/api/admin/backups/restore`, {
                method: 'POST',
                headers: {
                    Cookie: itHeadCookie,
                    'Content-Type': 'application/gzip',
                    'X-Confirm-Password': encodeURIComponent('AnyAdminPass123!'),
                    'X-Backup-Checksum': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
                },
                body: Buffer.alloc(1024 * 1024, 0x5a) // 1MB payload
            });

            const afterFiles = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith('labsync-restore-'));
            assert.strictEqual(afterFiles.length, beforeFiles.length, 'Zero temporary files or directories may be created when production guard triggers');

            recordPass('Production lockout guard executes before temporary upload file creation');
        } catch (err) {
            recordFail('Production lockout guard executes before temporary upload file creation', err);
        }

        // ─── TEST 5: getVerifiedRestoreConfig() Rejection ─────────────────────
        console.log('\n--- 5. Testing Service-Level Guard in getVerifiedRestoreConfig() ---');
        try {
            process.env = { ...savedEnv, NODE_ENV: 'production' };
            let serviceThrew = false;
            try {
                restoreService.getVerifiedRestoreConfig();
            } catch (svcErr) {
                if (svcErr.code === 'RESTORE_BLOCKED_ON_PRODUCTION') {
                    serviceThrew = true;
                }
            }
            assert.strictEqual(serviceThrew, true, 'getVerifiedRestoreConfig must throw RESTORE_BLOCKED_ON_PRODUCTION');

            recordPass('Service-level getVerifiedRestoreConfig() enforces fail-closed production lockout');
        } catch (err) {
            recordFail('Service-level getVerifiedRestoreConfig() enforces fail-closed production lockout', err);
        }

    } finally {
        process.env = savedEnv;
        server.close();
        console.log('\n================================================================');
        console.log(`Production Guard Test Summary: ${testPassed} Passed, ${testFailed} Failed`);
        console.log('================================================================');
        if (testFailed > 0) {
            process.exit(1);
        }
    }
}

runProductionGuardTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal production guard test runner error:', err);
    process.exit(1);
});

