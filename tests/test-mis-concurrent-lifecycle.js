'use strict';

/**
 * tests/test-mis-concurrent-lifecycle.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates MariaDB advisory locking (labsync_active_mis_lifecycle_lock)
 * under high-concurrency race conditions.
 * 
 * Verifies:
 * 1. Concurrent creations under zero active MIS:
 *    - Exactly ONE request succeeds (HTTP 201 Created)
 *    - Competing request is rejected cleanly (HTTP 409 Conflict)
 *    - Zero deadlocks (ER_LOCK_DEADLOCK) and zero HTTP 500 errors
 *    - Database has exactly ONE active MIS Staff account
 * 
 * 2. Concurrent creation vs. reactivation under zero active MIS:
 *    - Exactly ONE request succeeds
 *    - Competing request is rejected with HTTP 409 Conflict
 *    - Database has exactly ONE active MIS Staff account
 */

const assert = require('assert');
const pool = require('../database/connection');
const misService = require('../services/misService');

async function runConcurrentLifecycleTests() {
    console.log('================================================================');
    console.log('🧪 CONCURRENT MIS ACTIVE-ACCOUNT LIFECYCLE VERIFICATION SUITE');
    console.log('================================================================\n');

    // 1. Identify original active MIS Staff
    const [originalActiveRows] = await pool.query(
        "SELECT * FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1"
    );
    const originalActive = originalActiveRows.length > 0 ? originalActiveRows[0] : null;
    console.log(`ℹ Baseline active MIS Staff: ${originalActive ? originalActive.Name + ' (ID: ' + originalActive.User_ID + ')' : 'None'}`);

    let createdId1 = null;
    let createdId2 = null;

    try {
        // ─────────────────────────────────────────────────────────────
        // SCENARIO 1: Two simultaneous creation attempts with 0 active MIS
        // ─────────────────────────────────────────────────────────────
        console.log('--- SCENARIO 1: Concurrent Creation (Zero Active MIS Accounts) ---');

        if (originalActive) {
            await pool.query("UPDATE users SET Status = 'DEACTIVATED' WHERE User_ID = ?", [originalActive.User_ID]);
        }

        // Verify active count is 0
        const [zeroCheck] = await pool.query("SELECT User_ID FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE'");
        assert.strictEqual(zeroCheck.length, 0, 'Active MIS count must be 0 before starting race');

        // Clean up test emails if lingering
        await pool.query("DELETE FROM users WHERE Email IN ('race.one@bulsu.edu.ph', 'race.two@bulsu.edu.ph')");

        console.log('Dispatching Request A and Request B concurrently via Promise.all...');
        const [resA, resB] = await Promise.all([
            misService.createMisStaff({
                name: 'Race Tech Alpha',
                email: 'race.one@bulsu.edu.ph',
                phone: '09171111111'
            }),
            misService.createMisStaff({
                name: 'Race Tech Beta',
                email: 'race.two@bulsu.edu.ph',
                phone: '09172222222'
            })
        ]);

        console.log(`Request A: HTTP ${resA.status} - ${resA.error || (resA.data && resA.data.message)}`);
        console.log(`Request B: HTTP ${resB.status} - ${resB.error || (resB.data && resB.data.message)}`);

        // Assert exactly one 201 and exactly one 409
        const statuses = [resA.status, resB.status].sort();
        assert.deepStrictEqual(statuses, [201, 409], 'Must have exactly one HTTP 201 and one HTTP 409');

        const successRes = resA.status === 201 ? resA : resB;
        const conflictRes = resA.status === 409 ? resA : resB;

        assert.ok(conflictRes.error.includes('An active MIS Staff account already exists'), '409 response must explain active account conflict');
        assert.ok(successRes.data && successRes.data.user && successRes.data.user.User_ID, 'Successful request must return created user');

        createdId1 = successRes.data.user.User_ID;

        // Query database: exactly ONE active MIS Staff record
        const [activeCountRows] = await pool.query("SELECT User_ID, Name, Email FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE'");
        assert.strictEqual(activeCountRows.length, 1, 'Database must contain strictly ONE active MIS Staff');
        console.log(`✔ PASS: Exactly one created (ID: ${activeCountRows[0].User_ID}, ${activeCountRows[0].Name}); competing request received HTTP 409.`);

        // ─────────────────────────────────────────────────────────────
        // SCENARIO 2: Concurrent Creation vs. Reactivation (Zero Active MIS)
        // ─────────────────────────────────────────────────────────────
        console.log('\n--- SCENARIO 2: Concurrent Creation vs Reactivation ---');

        // Deactivate the newly created user so active count is 0 again
        await pool.query("UPDATE users SET Status = 'DEACTIVATED' WHERE User_ID = ?", [createdId1]);

        const [zeroCheck2] = await pool.query("SELECT User_ID FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE'");
        assert.strictEqual(zeroCheck2.length, 0, 'Active MIS count must be 0');

        await pool.query("DELETE FROM users WHERE Email = 'race.gamma@bulsu.edu.ph'");

        console.log('Dispatching Create (Gamma) and Reactivate (Alpha) concurrently...');
        const [createRes, reactivateRes] = await Promise.all([
            misService.createMisStaff({
                name: 'Race Tech Gamma',
                email: 'race.gamma@bulsu.edu.ph',
                phone: '09173333333'
            }),
            misService.reactivateMisStaff(createdId1)
        ]);

        console.log(`Create Result: HTTP ${createRes.status} - ${createRes.error || (createRes.data && createRes.data.message)}`);
        console.log(`Reactivate Result: HTTP ${reactivateRes.status} - ${reactivateRes.error || (reactivateRes.data && reactivateRes.data.message)}`);

        const isCreateSuccess = createRes.status === 201;
        const isReactivateSuccess = reactivateRes.status === 200;

        assert.ok(
            (isCreateSuccess && reactivateRes.status === 409) || (isReactivateSuccess && createRes.status === 409),
            'Exactly one operation must succeed (200/201) and the competing operation must receive 409'
        );

        if (isCreateSuccess) {
            createdId2 = createRes.data.user.User_ID;
        }

        const [finalActiveRows] = await pool.query("SELECT User_ID, Name FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE'");
        assert.strictEqual(finalActiveRows.length, 1, 'Database must have exactly 1 active MIS Staff after creation vs reactivation race');
        console.log(`✔ PASS: Exactly one winner (ID: ${finalActiveRows[0].User_ID}, ${finalActiveRows[0].Name}); loser cleanly rejected with HTTP 409.`);

        console.log('\n================================================================');
        console.log('🎉 ALL CONCURRENT MIS LIFECYCLE TESTS PASSED 100%!');
        console.log('================================================================');

    } finally {
        // Cleanup created test records
        await pool.query("DELETE FROM users WHERE Email IN ('race.one@bulsu.edu.ph', 'race.two@bulsu.edu.ph', 'race.gamma@bulsu.edu.ph')");

        // Restore original active MIS Staff
        if (originalActive) {
            await pool.query("UPDATE users SET Status = 'ACTIVE' WHERE User_ID = ?", [originalActive.User_ID]);
            console.log(`ℹ Restored original active MIS Staff: ${originalActive.Name} (ID: ${originalActive.User_ID})`);
        }
    }
}

runConcurrentLifecycleTests()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Test failure:', err);
        process.exit(1);
    });
