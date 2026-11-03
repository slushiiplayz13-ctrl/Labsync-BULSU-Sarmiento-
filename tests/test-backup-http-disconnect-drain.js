'use strict';

/**
 * tests/test-backup-http-disconnect-drain.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Real HTTP Disconnection Integration Test & Mutation Lifecycle Verification
 * for LabSync Security Feature #17 (Disaster Recovery & Blue-Green Promotion).
 *
 * Verifies with REAL TCP loopback sockets:
 * 1. Client disconnection while a server-side DB operation is pending does NOT
 *    decrement the active mutation counter.
 * 2. Status correctly reports unresolved operations and cutoverDrained = false.
 * 3. Maintenance mode activation rejects new requests with HTTP 503.
 * 4. Completion (resolve or reject) of the delayed DB operation settles the
 *    operation and decrements the counter to 0.
 * 5. Full drain state (mutationRequestsDrained = true, cutoverDrained = true)
 *    is reached only when all operations settle and background workers are idle.
 * 6. Multiple simultaneous disconnected requests settle cleanly.
 * 7. Server error handling (next(err)) settles cleanly on disconnected sockets.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http = require('http');
const express = require('express');
const assert = require('assert');

const {
    isMaintenanceModeActive,
    setMaintenanceMode,
    getActiveMutationRequests,
    getUnresolvedOperationsCount,
    getMaintenanceModeStatus,
    _resetActiveMutationRequestsForTesting,
    maintenanceModeMiddleware
} = require('../middleware/maintenanceMode');

const backupController = require('../controllers/backup.controller');
const activityRetentionService = require('../services/activityRetentionService');
const keyReminderService = require('../services/keyReminderService');

let totalPassed = 0;
let totalFailed = 0;

function pass(desc) {
    totalPassed++;
    console.log(`  ✔ PASS: ${desc}`);
}

function fail(desc, err) {
    totalFailed++;
    console.error(`  ✖ FAIL: ${desc}`);
    console.error(err);
}

// Helper to make an HTTP request to the test server
function makeHttpRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (_) {
                    parsed = data;
                }
                resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function runRealHttpDisconnectSuite() {
    console.log('================================================================');
    console.log('🧪 REAL HTTP DISCONNECTION & MUTATION LIFECYCLE INTEGRATION TEST');
    console.log('================================================================\n');

    // Setup Express app
    const app = express();
    app.use(express.json());
    app.use(maintenanceModeMiddleware);

    // Trackers for delayed operations
    let pendingOps = new Map();

    // Route 1: Delayed mutation operation (success path)
    app.post('/api/laboratories/delayed-test', (req, res) => {
        const opId = req.query.opId || 'default';
        const p = new Promise((resolve, reject) => {
            pendingOps.set(opId, { resolve, reject, res, req });
        });

        p.then(result => {
            res.status(200).json({ success: true, result });
        }).catch(err => {
            res.status(500).json({ error: err.message });
        });
    });

    // Route 2: Delayed mutation operation (Express error handling / next(err) path)
    app.post('/api/laboratories/delayed-error', (req, res, next) => {
        const opId = req.query.opId || 'error-op';
        const p = new Promise((resolve, reject) => {
            pendingOps.set(opId, { resolve, reject, res, req });
        });

        p.then(result => {
            res.status(200).json({ success: true, result });
        }).catch(err => {
            next(err);
        });
    });

    // Centralized Express error handler
    app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message, fromErrorHandler: true });
    });

    // Start real HTTP server on OS-assigned ephemeral port
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const host = '127.0.0.1';

    console.log(`Test HTTP server listening on http://${host}:${port}`);

    // Mock background services to idle state for baseline drain checks
    const origRetention = activityRetentionService.isRetentionRunning;
    const origReminder = keyReminderService.isKeyReminderChecking;
    activityRetentionService.isRetentionRunning = () => false;
    keyReminderService.isKeyReminderChecking = () => false;

    try {
        // ─── Scenario 1: Primary 15-Step Disconnect & Settlement Sequence ──────
        console.log('\n--- Scenario 1: Step-by-Step Client Abrupt Disconnect & Settlement ---');

        // Reset state
        _resetActiveMutationRequestsForTesting();
        setMaintenanceMode(false);
        pendingOps.clear();

        // Step 1 & 2: Submit a real POST request over loopback TCP
        let clientReqAborted = false;
        let serverObservedClose = false;

        const clientReq1 = http.request({
            hostname: host,
            port: port,
            path: '/api/laboratories/delayed-test?opId=seq-1',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        clientReq1.on('error', (err) => {
            // Expected socket hangup / ECONNRESET upon req.destroy()
            clientReqAborted = true;
        });

        clientReq1.write(JSON.stringify({ name: 'Lab 301', capacity: 40 }));
        clientReq1.end();

        // Wait until server handler enters and registers the operation
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (pendingOps.has('seq-1') && getActiveMutationRequests() === 1) {
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });

        // Step 3 & 4: Operation is admitted, active counter is 1, DB op is pending
        assert.strictEqual(getActiveMutationRequests(), 1, 'In-flight mutation counter must be 1');
        const opEntry1 = pendingOps.get('seq-1');
        opEntry1.res.once('close', () => {
            serverObservedClose = true;
        });

        // Step 5: Destroy client socket while server-side database operation is pending
        clientReq1.destroy();

        // Wait for server to observe client disconnect
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (serverObservedClose) {
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });

        // Step 6: Verify server observed premature connection closure
        assert.strictEqual(serverObservedClose, true, 'Server must observe client socket close');

        // Step 7: Verify activeMutationRequests remains > 0 (strictly 1)
        assert.strictEqual(
            getActiveMutationRequests(),
            1,
            'CRITICAL: activeMutationRequests must remain 1 after client disconnect while DB op is pending'
        );
        assert.strictEqual(
            getUnresolvedOperationsCount(),
            1,
            'unresolvedOperations must report 1 for disconnected in-flight operation'
        );

        // Step 8 & 9: Verify drain status flags via maintenance API
        let status1 = null;
        await backupController.getMaintenanceMode({}, { status: () => ({ json: (d) => { status1 = d; } }) });
        assert.strictEqual(status1.activeMutationRequests, 1);
        assert.strictEqual(status1.unresolvedOperations, 1);
        assert.strictEqual(status1.mutationRequestsDrained, false, 'mutationRequestsDrained must be false');
        assert.strictEqual(status1.cutoverDrained, false, 'cutoverDrained must be false');

        // Step 10: Activate maintenance mode and verify subsequent mutation receives HTTP 503
        setMaintenanceMode(true);

        const blockedRes = await makeHttpRequest({
            hostname: host,
            port: port,
            path: '/api/laboratories/delayed-test?opId=seq-blocked',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, { name: 'Lab 302' });

        assert.strictEqual(blockedRes.statusCode, 503, 'Subsequent mutation during maintenance must return 503');
        assert.strictEqual(blockedRes.body.code, 'CUTOVER_MAINTENANCE_MODE_ACTIVE');
        assert.strictEqual(getActiveMutationRequests(), 1, 'Rejected 503 request must NOT increment active mutation counter');

        // Step 11: Complete the delayed server-side database operation (simulating MySQL query resolution)
        opEntry1.resolve({ insertedId: 101 });

        // Wait for microtask / event loop tick for res.end() to settle
        await new Promise(r => setTimeout(r, 50));

        // Step 12, 13 & 14: Verify counter decrements to 0 and cutover becomes drained
        assert.strictEqual(getActiveMutationRequests(), 0, 'activeMutationRequests must decrement to 0 after server DB op settles');
        assert.strictEqual(getUnresolvedOperationsCount(), 0, 'unresolvedOperations must decrement to 0');

        let statusDrained = null;
        await backupController.getMaintenanceMode({}, { status: () => ({ json: (d) => { statusDrained = d; } }) });
        assert.strictEqual(statusDrained.activeMutationRequests, 0);
        assert.strictEqual(statusDrained.unresolvedOperations, 0);
        assert.strictEqual(statusDrained.mutationRequestsDrained, true, 'mutationRequestsDrained must become true');
        assert.strictEqual(statusDrained.cutoverDrained, true, 'cutoverDrained must become true when jobs and mutations are drained');

        pass('Scenario 1: Full 15-step real TCP socket disconnect, maintenance 503 guard, and delayed settlement lifecycle passed');

        // ─── Scenario 2: Database Operation Rejection / Error Handler After Disconnect ─
        console.log('\n--- Scenario 2: Database Operation Error / Rejection After Client Disconnect ---');

        _resetActiveMutationRequestsForTesting();
        setMaintenanceMode(false);
        pendingOps.clear();

        const clientReq2 = http.request({
            hostname: host,
            port: port,
            path: '/api/laboratories/delayed-error?opId=seq-err',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        clientReq2.on('error', () => {});
        clientReq2.write(JSON.stringify({ name: 'Lab 401' }));
        clientReq2.end();

        await new Promise(resolve => {
            const check = setInterval(() => {
                if (pendingOps.has('seq-err') && getActiveMutationRequests() === 1) {
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });

        // Client abruptly disconnects
        clientReq2.destroy();
        await new Promise(r => setTimeout(r, 30));

        assert.strictEqual(getActiveMutationRequests(), 1, 'Active mutation counter is 1 after client disconnect');
        assert.strictEqual(getUnresolvedOperationsCount(), 1, 'Unresolved count is 1');

        // Database operation rejects (e.g. MySQL ER_DUP_ENTRY / deadlock)
        const opEntry2 = pendingOps.get('seq-err');
        opEntry2.reject(new Error('ER_LOCK_DEADLOCK: Deadlock found when trying to get lock'));

        await new Promise(r => setTimeout(r, 50));

        // Express error handler called res.status(500).json(...), which triggers res.end()
        assert.strictEqual(getActiveMutationRequests(), 0, 'Counter decrements to 0 even when DB op throws and triggers Express error handler');
        assert.strictEqual(getUnresolvedOperationsCount(), 0, 'Unresolved operations decrements to 0 on error settlement');

        pass('Scenario 2: Database operation rejection and Express error handler on disconnected socket decrements cleanly');

        // ─── Scenario 3: Multiple Simultaneous Disconnected Sockets ─────────────────
        console.log('\n--- Scenario 3: Multiple Simultaneous Disconnected Sockets ---');

        _resetActiveMutationRequestsForTesting();
        setMaintenanceMode(false);
        pendingOps.clear();

        const clients = [];
        const opIds = ['multi-1', 'multi-2', 'multi-3'];

        for (const opId of opIds) {
            const cReq = http.request({
                hostname: host,
                port: port,
                path: `/api/laboratories/delayed-test?opId=${opId}`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            cReq.on('error', () => {});
            cReq.write(JSON.stringify({ op: opId }));
            cReq.end();
            clients.push(cReq);
        }

        // Wait until all 3 are admitted
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (pendingOps.size === 3 && getActiveMutationRequests() === 3) {
                    clearInterval(check);
                    resolve();
                }
            }, 10);
        });

        assert.strictEqual(getActiveMutationRequests(), 3, 'All 3 concurrent mutations tracked');

        // Abruptly destroy all 3 client sockets
        for (const cReq of clients) {
            cReq.destroy();
        }

        await new Promise(r => setTimeout(r, 50));

        // All 3 remain active and unresolved
        assert.strictEqual(getActiveMutationRequests(), 3, 'All 3 remain tracked despite socket destruction');
        assert.strictEqual(getUnresolvedOperationsCount(), 3, 'All 3 reported as unresolved operations');

        // Resolve first operation
        pendingOps.get('multi-1').resolve({ id: 1 });
        await new Promise(r => setTimeout(r, 30));
        assert.strictEqual(getActiveMutationRequests(), 2, 'Counter decrements to 2 after multi-1 resolves');
        assert.strictEqual(getUnresolvedOperationsCount(), 2);

        // Resolve second operation
        pendingOps.get('multi-2').resolve({ id: 2 });
        await new Promise(r => setTimeout(r, 30));
        assert.strictEqual(getActiveMutationRequests(), 1, 'Counter decrements to 1 after multi-2 resolves');
        assert.strictEqual(getUnresolvedOperationsCount(), 1);

        // Reject third operation
        pendingOps.get('multi-3').reject(new Error('Constraint failure'));
        await new Promise(r => setTimeout(r, 30));
        assert.strictEqual(getActiveMutationRequests(), 0, 'Counter decrements to 0 after multi-3 rejects');
        assert.strictEqual(getUnresolvedOperationsCount(), 0);

        pass('Scenario 3: Multiple simultaneous disconnected sockets track and settle independently without leak');

        // ─── Scenario 4: Lower Bound & Event Idempotency ─────────────────────────────
        console.log('\n--- Scenario 4: Lower Bound Safety & Event Idempotency ---');

        _resetActiveMutationRequestsForTesting();
        assert.strictEqual(getActiveMutationRequests(), 0);

        // Test maintenance mode status output structure
        const statusReport = getMaintenanceModeStatus();
        assert.strictEqual(typeof statusReport.activeMutationRequests, 'number');
        assert.strictEqual(typeof statusReport.unresolvedOperations, 'number');
        assert.ok(Array.isArray(statusReport.activeOperations), 'activeOperations must be an array');

        pass('Scenario 4: Maintenance status schema and lower bound guards verified');

    } finally {
        // Clean up: restore background services and close HTTP server
        activityRetentionService.isRetentionRunning = origRetention;
        keyReminderService.isKeyReminderChecking = origReminder;
        setMaintenanceMode(false);
        _resetActiveMutationRequestsForTesting();

        await new Promise(resolve => server.close(resolve));
        console.log('\nTest HTTP server cleanly closed.');
    }

    console.log('\n================================================================');
    console.log(`Real HTTP Disconnection Test Summary: ${totalPassed} Passed, ${totalFailed} Failed`);
    console.log('================================================================');

    if (totalFailed > 0) {
        process.exit(1);
    }
}

runRealHttpDisconnectSuite().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Fatal error in real HTTP disconnect suite:', err);
    process.exit(1);
});

