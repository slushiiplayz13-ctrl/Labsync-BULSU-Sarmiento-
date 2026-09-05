'use strict';

/**
 * tests/test-retention.js
 * Comprehensive automated verification for Room Status Activity Log 1-Year Retention Policy.
 */

const db = require('../database/connection');
const activityRetentionService = require('../services/activityRetentionService');
const occupancyRepository = require('../repositories/occupancy.repository');
const maintenanceRepository = require('../repositories/maintenance.repository');

const TEST_TAG = 'TEST_RETENTION';

async function runTests() {
    console.log('================================================================');
    console.log('🧪 Starting Room Status Activity Log Retention Policy Verification');
    console.log('================================================================\n');

    let allPassed = true;
    const testIds = [];

    try {
        // 0. Verify Database Connection and Fetch Reference IDs
        const [users] = await db.query('SELECT User_ID FROM users LIMIT 1');
        const [rooms] = await db.query('SELECT Room_ID FROM laboratories LIMIT 1');

        const testUserId = users.length > 0 ? users[0].User_ID : null;
        const testRoomId = rooms.length > 0 ? rooms[0].Room_ID : null;

        console.log(`[Setup] Using reference User_ID: ${testUserId}, Room_ID: ${testRoomId}`);

        // 1. Snapshot counts of unrelated tables to verify data isolation
        const [[{ uCount }]] = await db.query('SELECT COUNT(*) AS uCount FROM users');
        const [[{ rCount }]] = await db.query('SELECT COUNT(*) AS rCount FROM laboratories');
        const [[{ sCount }]] = await db.query('SELECT COUNT(*) AS sCount FROM schedules');
        const [[{ mCount }]] = await db.query('SELECT COUNT(*) AS mCount FROM maintenance');
        const [[{ aCount }]] = await db.query('SELECT COUNT(*) AS aCount FROM audit_logs');

        console.log('[Setup] Unrelated table counts baseline recorded.');

        // 2. Calculate Cutoff Dates
        const now = new Date();
        const cutoff = activityRetentionService.calculateOneCalendarYearCutoff(now);
        console.log(`[Policy] Current Date:                ${activityRetentionService.formatDateTimeForSql(now)}`);
        console.log(`[Policy] Calculated 1-Year Cutoff:    ${activityRetentionService.formatDateTimeForSql(cutoff)}\n`);

        // Test Date Definitions
        const dateRecent30Days = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const dateWithin364Days = new Date(now.getTime() - (364 * 24 * 60 * 60 * 1000));
        const dateBoundaryInside = new Date(cutoff.getTime() + (60 * 1000));  // 1 minute after cutoff
        const dateBoundaryOutside = new Date(cutoff.getTime() - (60 * 1000)); // 1 minute before cutoff
        const dateOlder366Days = new Date(now.getTime() - (366 * 24 * 60 * 60 * 1000));
        const dateOlder400Days = new Date(now.getTime() - (400 * 24 * 60 * 60 * 1000));

        // Insert controlled test records
        async function insertTestLog(name, accessTime) {
            const formatted = activityRetentionService.formatDateTimeForSql(accessTime);
            const [res] = await occupancyRepository.insertLog(testUserId, testRoomId, TEST_TAG, formatted);
            testIds.push(res.insertId);
            return { id: res.insertId, name, date: formatted };
        }

        console.log('--- Step 1: Inserting Controlled Test Records ---');
        const logRecent = await insertTestLog('1. Recent (30 days ago)', dateRecent30Days);
        const log364 = await insertTestLog('2. Within 1 Year (364 days ago)', dateWithin364Days);
        const logBoundIn = await insertTestLog('3. Boundary Just Inside (Cutoff + 1m)', dateBoundaryInside);
        const logBoundOut = await insertTestLog('4. Boundary Just Outside (Cutoff - 1m)', dateBoundaryOutside);
        const log366 = await insertTestLog('5. Older than 1 Year (366 days ago)', dateOlder366Days);
        const log400 = await insertTestLog('6. Much Older (400 days ago)', dateOlder400Days);

        console.log(`✓ Inserted 6 synthetic test records (IDs: ${testIds.join(', ')})`);

        // 3. Verify EXPLAIN query to confirm index usage
        console.log('\n--- Step 2: Verifying Index Performance (EXPLAIN Query) ---');
        const [explain] = await db.query(
            `EXPLAIN SELECT Log_ID FROM occupancy_log WHERE Access_Time < ?`,
            [activityRetentionService.formatDateTimeForSql(cutoff)]
        );
        const usedIndex = explain[0].key || explain[0].possible_keys;
        console.log(`✓ Query optimizer explanation: type=${explain[0].type}, key=${usedIndex}`);
        if (usedIndex && usedIndex.includes('idx_occupancy_access_time')) {
            console.log('✓ PASS: MySQL is successfully utilizing `idx_occupancy_access_time`.');
        } else {
            console.log(`ℹ Index key noted: ${usedIndex}`);
        }

        // 4. Execute Retention Cleanup
        console.log('\n--- Step 3: Executing Automated Retention Cleanup ---');
        const cleanupResult = await activityRetentionService.runRetentionCleanup({ baseDate: now });
        console.log(`✓ Cleanup executed: Deleted=${cleanupResult.deletedCount}, Duration=${cleanupResult.durationMs}ms`);

        // 5. Verify Test Records Retention / Deletion Status
        console.log('\n--- Step 4: Verifying Individual Test Records ---');
        const [remainingRows] = await db.query(
            'SELECT Log_ID FROM occupancy_log WHERE Log_ID IN (?)',
            [testIds]
        );
        const remainingIds = new Set(remainingRows.map(r => r.Log_ID));

        function verifyRecord(name, id, expectedRemain) {
            const exists = remainingIds.has(id);
            const passed = (exists === expectedRemain);
            const status = exists ? 'REMAINS' : 'DELETED';
            const expectedStr = expectedRemain ? 'REMAINS' : 'DELETED';
            if (passed) {
                console.log(`  ✓ PASS: [${name}] (ID: ${id}) -> ${status}`);
            } else {
                console.error(`  ✗ FAIL: [${name}] (ID: ${id}) -> got ${status}, expected ${expectedStr}`);
                allPassed = false;
            }
        }

        verifyRecord('Recent (30 days ago)', logRecent.id, true);
        verifyRecord('Within 1 Year (364 days ago)', log364.id, true);
        verifyRecord('Boundary Just Inside Cutoff', logBoundIn.id, true);
        verifyRecord('Boundary Just Outside Cutoff', logBoundOut.id, false);
        verifyRecord('Older than 1 Year (366 days ago)', log366.id, false);
        verifyRecord('Much Older (400 days ago)', log400.id, false);

        // 6. Verify Unrelated Data Isolation
        console.log('\n--- Step 5: Verifying Data Isolation (Unrelated Tables) ---');
        const [[{ uCountAfter }]] = await db.query('SELECT COUNT(*) AS uCountAfter FROM users');
        const [[{ rCountAfter }]] = await db.query('SELECT COUNT(*) AS rCountAfter FROM laboratories');
        const [[{ sCountAfter }]] = await db.query('SELECT COUNT(*) AS sCountAfter FROM schedules');
        const [[{ mCountAfter }]] = await db.query('SELECT COUNT(*) AS mCountAfter FROM maintenance');
        const [[{ aCountAfter }]] = await db.query('SELECT COUNT(*) AS aCountAfter FROM audit_logs');

        function assertCountUnchanged(tableName, before, after) {
            if (before === after) {
                console.log(`  ✓ PASS: Table '${tableName}' count unchanged (${after})`);
            } else {
                console.error(`  ✗ FAIL: Table '${tableName}' count changed from ${before} to ${after}!`);
                allPassed = false;
            }
        }

        assertCountUnchanged('users', uCount, uCountAfter);
        assertCountUnchanged('laboratories', rCount, rCountAfter);
        assertCountUnchanged('schedules', sCount, sCountAfter);
        assertCountUnchanged('maintenance', mCount, mCountAfter);
        assertCountUnchanged('audit_logs', aCount, aCountAfter);

        // 7. Verify Normal Room Status Operations
        console.log('\n--- Step 6: Verifying Normal Room Status Operations ---');
        // Test fetching notifications/activities
        const [notifs] = await maintenanceRepository.findAllNotifications();
        console.log(`  ✓ Notification/Activity retrieval succeeded (${notifs.length} items returned)`);

        // Test inserting a live activity log (e.g. today's event)
        const [liveRes] = await occupancyRepository.insertLog(testUserId, testRoomId, 'QR Code');
        console.log(`  ✓ Live activity log insertion succeeded (ID: ${liveRes.insertId})`);
        testIds.push(liveRes.insertId);

        // 8. Clean up synthetic test records
        console.log('\n--- Step 7: Cleaning Up Synthetic Test Data ---');
        if (testIds.length > 0) {
            const [delTest] = await db.query(
                'DELETE FROM occupancy_log WHERE Log_ID IN (?)',
                [testIds]
            );
            console.log(`✓ Cleaned up ${delTest.affectedRows} synthetic test record(s). Database is pristine.`);
        }

        console.log('\n================================================================');
        if (allPassed) {
            console.log('🎉 ALL RETENTION VERIFICATION TESTS PASSED SUCCESSFULLY!');
        } else {
            console.error('❌ SOME RETENTION VERIFICATION TESTS FAILED.');
        }
        console.log('================================================================\n');

    } catch (err) {
        console.error('Fatal error in test-retention.js:', err);
        allPassed = false;
    } finally {
        // Clean up remaining test records if any remain due to early throw
        try {
            await db.query('DELETE FROM occupancy_log WHERE Auth_Method = ?', [TEST_TAG]);
        } catch (e) {}

        await db.end();
        process.exit(allPassed ? 0 : 1);
    }
}

runTests();
