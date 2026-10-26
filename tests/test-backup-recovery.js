'use strict';

/**
 * tests/test-backup-recovery.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete verification suite for LabSync Security Feature #17:
 * 1. CLI binary detection and MariaDB/MySQL compatibility flags verification.
 * 2. Fail-closed production protection guards (blocking restore on production).
 * 3. Dynamic disposable canary fixture creation with collision-resistant values.
 * 4. Staged backup generation with SHA-256 digest calculation and trailer verification.
 * 5. Deletion of disposable canary schedule record.
 * 6. Isolated sandbox restoration into labsync_test using dedicated credentials.
 * 7. Verification that the deleted record returns with foreign key relationships intact.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const backupService = require('../services/backupService');

console.log('================================================================');
console.log('🧪 LABSYNC SECURITY FEATURE #17: BACKUP & RECOVERY TEST SUITE');
console.log('================================================================');

async function runBackupRecoveryTests() {
    let testDbConnection = null;

    try {
        // ─── 1. TOOLING DETECTION & COMPATIBILITY VERIFICATION ───────────────
        console.log('\n--- 1. Testing Database Client Tooling Discovery & Flags ---');
        const tooling = await backupService.verifyDatabaseTooling();
        console.log('Tooling check result:', tooling);
        assert.strictEqual(tooling.available, true, 'Database dump utility must be available on the system');
        assert.ok(tooling.dumpCmd, 'Dump command path must be resolved');
        assert.ok(tooling.version, 'Client version string must be returned');
        console.log('✔ PASS: Database CLI dump utility verified successfully:', tooling.version);

        // ─── 1B. SECURE OPTION FILE & SANITIZED ERROR DIAGNOSTICS ────────────
        console.log('\n--- 1B. Testing Secure Option File Creation & Error Sanitization ---');
        const testCreds = {
            host: '127.0.0.1',
            port: 3306,
            user: 'testuser',
            password: 'Super"Secret#123;pass\\word'
        };
        const { tempDir: testTempDir, configPath: testConfigPath } = backupService.createSecureClientConfigFile(testCreds);
        try {
            assert.ok(fs.existsSync(testConfigPath), 'Config file must exist on disk');
            const cnfContent = fs.readFileSync(testConfigPath, 'utf8');
            assert.ok(cnfContent.includes('[client]'), 'Option file must include [client]');
            assert.ok(cnfContent.includes('[mariadb-dump]'), 'Option file must include [mariadb-dump]');
            assert.ok(cnfContent.includes('[mysqldump]'), 'Option file must include [mysqldump]');
            assert.ok(cnfContent.includes('[mariadb]'), 'Option file must include [mariadb]');
            assert.ok(cnfContent.includes('[mysql]'), 'Option file must include [mysql]');
            assert.ok(cnfContent.includes('user = "testuser"'), 'User must be written');
            assert.ok(!cnfContent.includes('Super"Secret#123;pass\\word\n'), 'Raw unescaped quotes must not corrupt file');
        } finally {
            backupService.cleanupSecureTempDir(testTempDir);
            assert.strictEqual(fs.existsSync(testTempDir), false, 'Temp dir must be cleaned up');
        }
        console.log('✔ PASS: Secure option file creation and multi-client group compatibility verified.');

        // Verify sanitizeErrorMessage
        const rawErrorMsg = 'mysqldump: Access denied for user "root" identified by "secret_pass_123" with password="secret_pass_123"';
        const sanitized = backupService.sanitizeErrorMessage(rawErrorMsg);
        assert.ok(!sanitized.includes('secret_pass_123'), 'Sanitized error must not contain password');
        assert.ok(sanitized.includes('[REDACTED]'), 'Sanitized error must show [REDACTED]');
        console.log('✔ PASS: Sensitive credential sanitization in error messages verified:', sanitized);

        // ─── 1C. ARCHIVE INTEGRITY & SQL COMPLETION MARKER VERIFICATION ─────
        console.log('\n--- 1C. Testing Archive Integrity & SQL Completion Marker Verification ---');
        const osTmp = require('os').tmpdir();

        // 1C.1: Valid archive with standard trailer marker
        const validSql = '-- MariaDB dump 10.19\nCREATE TABLE test_tab (id INT);\n-- Dump completed on 2026-10-26 12:00:00\n';
        const validArchive = path.join(osTmp, `valid_test_${Date.now()}.sql.gz`);
        fs.writeFileSync(validArchive, zlib.gzipSync(Buffer.from(validSql, 'utf8')));

        try {
            const validResult = await backupService.verifyBackupArchiveIntegrity(validArchive);
            assert.ok(validResult.fileSizeBytes > 0, 'Valid archive must report file size');
            assert.strictEqual(typeof validResult.checksumSha256, 'string', 'Valid archive must calculate SHA-256');
            assert.strictEqual(validResult.checksumSha256.length, 64, 'SHA-256 must be 64-char hex string');
            console.log('✔ PASS: Valid archive containing standard completion marker passes verification.');
        } finally {
            try { fs.unlinkSync(validArchive); } catch (_) { }
        }

        // 1C.2: Truncated archive missing completion marker must be strictly rejected
        const truncatedSql = '-- MariaDB dump 10.19\nCREATE TABLE test_tab (id INT);\nINSERT INTO test_tab VALUES (1);\n';
        const truncatedArchive = path.join(osTmp, `truncated_test_${Date.now()}.sql.gz`);
        fs.writeFileSync(truncatedArchive, zlib.gzipSync(Buffer.from(truncatedSql, 'utf8')));

        try {
            let truncatedRejected = false;
            try {
                await backupService.verifyBackupArchiveIntegrity(truncatedArchive);
            } catch (err) {
                truncatedRejected = true;
                assert.ok(
                    err.message.includes('missing SQL completion marker (-- Dump completed)'),
                    `Expected completion marker error, got: ${err.message}`
                );
            }
            assert.strictEqual(truncatedRejected, true, 'Truncated archive lacking completion marker must be rejected');
            console.log('✔ PASS: Truncated archive lacking completion marker rejected with error.');
        } finally {
            try { fs.unlinkSync(truncatedArchive); } catch (_) { }
        }

        // 1C.3: Archive with deceptive string "mariadb-dump" but missing "-- Dump completed" must be rejected
        const deceptiveSql = '-- Header from mariadb-dump\nCREATE TABLE test (name VARCHAR(50));\n-- Truncated before completion\n';
        const deceptiveArchive = path.join(osTmp, `deceptive_test_${Date.now()}.sql.gz`);
        fs.writeFileSync(deceptiveArchive, zlib.gzipSync(Buffer.from(deceptiveSql, 'utf8')));

        try {
            let deceptiveRejected = false;
            try {
                await backupService.verifyBackupArchiveIntegrity(deceptiveArchive);
            } catch (err) {
                deceptiveRejected = true;
                assert.ok(
                    err.message.includes('missing SQL completion marker (-- Dump completed)'),
                    `Expected completion marker error, got: ${err.message}`
                );
            }
            assert.strictEqual(deceptiveRejected, true, 'Archive containing "mariadb-dump" without completion marker must be rejected');
            console.log('✔ PASS: Deceptive archive containing tool name without completion marker strictly rejected.');
        } finally {
            try { fs.unlinkSync(deceptiveArchive); } catch (_) { }
        }

        // 1C.4: Empty (0-byte) archive must be rejected
        const emptyArchive = path.join(osTmp, `empty_test_${Date.now()}.sql.gz`);
        fs.writeFileSync(emptyArchive, Buffer.alloc(0));

        try {
            let emptyRejected = false;
            try {
                await backupService.verifyBackupArchiveIntegrity(emptyArchive);
            } catch (err) {
                emptyRejected = true;
                assert.ok(err.message.includes('empty (0 bytes)'), `Expected empty file error, got: ${err.message}`);
            }
            assert.strictEqual(emptyRejected, true, 'Empty (0 bytes) archive must be rejected');
            console.log('✔ PASS: Empty archive strictly rejected.');
        } finally {
            try { fs.unlinkSync(emptyArchive); } catch (_) { }
        }

        // ─── 1D. RESTORATION ARCHIVE FORMAT & SHA-256 INTEGRITY GUARDS ──────
        console.log('\n--- 1D. Testing Restoration Archive Format & SHA-256 Integrity Guards ---');
        const pre1dEnv = {
            NODE_ENV: process.env.NODE_ENV,
            DB_NAME: process.env.DB_NAME,
            ALLOW_RESTORE_FOR_LOCAL_DEMO: process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO,
            RESTORE_TARGET_DATABASE: process.env.RESTORE_TARGET_DATABASE,
            DB_RESTORE_USER: process.env.DB_RESTORE_USER,
            DB_RESTORE_PASSWORD: process.env.DB_RESTORE_PASSWORD
        };
        process.env.NODE_ENV = 'development';
        process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO = 'true';
        process.env.RESTORE_TARGET_DATABASE = 'labsync_test';
        process.env.DB_NAME = 'labsync_test';
        process.env.DB_RESTORE_USER = 'labsync_restore_test';
        process.env.DB_RESTORE_PASSWORD = 'TestRestorePass_123!';

        try {
            // 1D.1: Raw .sql uncompressed file must be rejected with INVALID_ARCHIVE_FORMAT
            const rawSqlFile = path.join(osTmp, `raw_format_test_${Date.now()}.sql`);
            fs.writeFileSync(rawSqlFile, 'CREATE TABLE test (id INT);', 'utf8');
            try {
                let formatRejected = false;
                try {
                    await backupService.restoreToTestDatabase(rawSqlFile, {
                        actorEmail: 'admin@test.local',
                        isGzip: true
                    });
                } catch (err) {
                    formatRejected = true;
                    assert.ok(
                        err.message.includes('INVALID_ARCHIVE_FORMAT') || err.code === 'INVALID_ARCHIVE_FORMAT',
                        `Expected INVALID_ARCHIVE_FORMAT, got: ${err.message}`
                    );
                }
                assert.strictEqual(formatRejected, true, 'Raw uncompressed SQL file must be rejected by restoreToTestDatabase');
                console.log('✔ PASS: Non-gzip (.sql) archive format strictly rejected with INVALID_ARCHIVE_FORMAT.');
            } finally {
                try { fs.unlinkSync(rawSqlFile); } catch (_) { }
            }

            // 1D.2: Checksum mismatch must abort restoration before executing SQL
            const fakeArchive = path.join(osTmp, `checksum_mismatch_test_${Date.now()}.sql.gz`);
            fs.writeFileSync(fakeArchive, zlib.gzipSync(Buffer.from('-- Dump completed\n', 'utf8')));
            try {
                let checksumRejected = false;
                try {
                    await backupService.restoreToTestDatabase(fakeArchive, {
                        actorEmail: 'admin@test.local',
                        isGzip: true,
                        expectedChecksum: '0000000000000000000000000000000000000000000000000000000000000000'
                    });
                } catch (err) {
                    checksumRejected = true;
                    assert.ok(
                        err.message.includes('CHECKSUM_MISMATCH') || err.code === 'CHECKSUM_MISMATCH',
                        `Expected CHECKSUM_MISMATCH error, got: ${err.message}`
                    );
                }
                assert.strictEqual(checksumRejected, true, 'Archive with checksum mismatch must abort before restore');
                console.log('✔ PASS: SHA-256 checksum mismatch strictly aborted before restore execution.');
            } finally {
                try { fs.unlinkSync(fakeArchive); } catch (_) { }
            }

            // 1D.3: Missing expected checksum must be strictly rejected with CHECKSUM_REQUIRED
            const missingChecksumArchive = path.join(osTmp, `missing_chk_${Date.now()}.sql.gz`);
            fs.writeFileSync(missingChecksumArchive, zlib.gzipSync(Buffer.from('-- Dump completed\n', 'utf8')));
            try {
                let missingRejected = false;
                try {
                    await backupService.restoreToTestDatabase(missingChecksumArchive, {
                        actorEmail: 'admin@test.local',
                        isGzip: true
                    });
                } catch (err) {
                    missingRejected = true;
                    assert.ok(
                        err.message.includes('CHECKSUM_REQUIRED') || err.code === 'CHECKSUM_REQUIRED',
                        `Expected CHECKSUM_REQUIRED error, got: ${err.message}`
                    );
                }
                assert.strictEqual(missingRejected, true, 'Restoration without expected checksum must be rejected');
                console.log('✔ PASS: Missing expected checksum strictly rejected with CHECKSUM_REQUIRED.');
            } finally {
                try { fs.unlinkSync(missingChecksumArchive); } catch (_) { }
            }
        } finally {
            Object.keys(pre1dEnv).forEach(k => {
                if (pre1dEnv[k] === undefined) delete process.env[k];
                else process.env[k] = pre1dEnv[k];
            });
        }

        // ─── 2. PRODUCTION GUARD & FAIL-CLOSED SAFETY TESTS ──────────────────
        console.log('\n--- 2. Testing Production Safety Invariants (Fail-Closed) ---');
        const originalNodeEnv = process.env.NODE_ENV;
        const originalDbName = process.env.DB_NAME;
        const originalDemoFlag = process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO;
        const originalTargetDb = process.env.RESTORE_TARGET_DATABASE;

        try {
            // Test 2A: Blocked when NODE_ENV is production
            process.env.NODE_ENV = 'production';
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_BLOCKED_ON_PRODUCTION/, 'Restoration must fail closed in production environment');
            console.log('✔ PASS: Production NODE_ENV lockout verified.');

            // Test 2B: Blocked when Railway platform variables are present
            delete process.env.NODE_ENV;
            process.env.RAILWAY_ENVIRONMENT_NAME = 'production';
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_BLOCKED_ON_PRODUCTION/, 'Restoration must fail closed when RAILWAY_ENVIRONMENT_NAME is set');
            delete process.env.RAILWAY_ENVIRONMENT_NAME;

            process.env.RAILWAY_PROJECT_ID = 'railway-prj-123';
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_BLOCKED_ON_PRODUCTION/, 'Restoration must fail closed when RAILWAY_PROJECT_ID is set');
            delete process.env.RAILWAY_PROJECT_ID;
            console.log('✔ PASS: Railway platform deployment lockouts verified.');

            // Test 2C: Blocked when target is production database name even with demo flag
            process.env.NODE_ENV = 'development';
            process.env.DB_NAME = 'labsync';
            process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO = 'true';
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_BLOCKED_ON_PRODUCTION/, 'Restoration must fail closed if targeting labsync production DB');
            console.log('✔ PASS: Production database name lockout verified.');

            // Test 2D: Blocked when ALLOW_RESTORE_FOR_LOCAL_DEMO is not true
            process.env.DB_NAME = 'labsync_test';
            delete process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO;
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_NOT_AUTHORIZED/, 'Restoration must fail closed without explicit demonstration authorization');
            console.log('✔ PASS: Missing demo authorization flag lockout verified.');

            // Test 2E: Blocked if target is not explicitly labsync_test
            process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO = 'true';
            process.env.RESTORE_TARGET_DATABASE = 'other_database';
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /INVALID_RESTORE_TARGET/, 'Restoration must fail closed if target does not match labsync_test');
            console.log('✔ PASS: Invalid target database name lockout verified.');

            // Test 2F: Blocked if DB_RESTORE_USER is missing or root
            process.env.RESTORE_TARGET_DATABASE = 'labsync_test';
            process.env.DB_RESTORE_USER = 'root';
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_CREDENTIALS_MISSING/, 'Restoration must fail closed if DB_RESTORE_USER is root');

            delete process.env.DB_RESTORE_USER;
            assert.throws(() => {
                backupService.getVerifiedRestoreConfig();
            }, /RESTORE_CREDENTIALS_MISSING/, 'Restoration must fail closed if DB_RESTORE_USER is missing');
            console.log('✔ PASS: Dedicated non-root restoration user requirement verified.');
        } finally {
            process.env.NODE_ENV = originalNodeEnv;
            process.env.DB_NAME = originalDbName;
            delete process.env.RAILWAY_ENVIRONMENT_NAME;
            delete process.env.RAILWAY_PROJECT_ID;
            if (originalDemoFlag !== undefined) process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO = originalDemoFlag;
            else delete process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO;
            if (originalTargetDb !== undefined) process.env.RESTORE_TARGET_DATABASE = originalTargetDb;
            else delete process.env.RESTORE_TARGET_DATABASE;
        }

        // ─── 3. ESTABLISH ISOLATED TEST SANDBOX CONNECTION ───────────────────
        console.log('\n--- 3. Connecting to Isolated Test Sandbox (labsync_test) ---');
        testDbConnection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
            database: 'labsync_test'
        });
        console.log('✔ PASS: Connected to isolated test sandbox database: labsync_test');

        // ─── 4. DYNAMIC DISPOSABLE CANARY FIXTURE CREATION ───────────────────
        console.log('\n--- 4. Creating Dynamic Disposable Canary Fixtures ---');
        const nonce = Date.now().toString().slice(-6);
        const roomNumber = `T${nonce}`;
        const email = `canary_${nonce}@labsync.test`;
        const subjectName = `CANARY-TEST-${nonce}`;

        // 4A: Insert Canary Laboratory (Auto-increment Room_ID)
        const [roomRes] = await testDbConnection.query(
            `INSERT INTO laboratories (Room_Number, Building, Current_Status, Key_Status)
             VALUES (?, 'Sandbox Test Bldg', 'Available', 'Present')`,
            [roomNumber]
        );
        const canaryRoomId = roomRes.insertId;
        assert.ok(canaryRoomId > 0, 'Canary Room_ID must be positive integer');

        // 4B: Insert Canary Faculty User with real bcrypt hash (Auto-increment User_ID)
        const canaryPasswordHash = await bcrypt.hash('CanarySecret123!', 12);
        const [userRes] = await testDbConnection.query(
            `INSERT INTO users (Name, Email, Role, Status, Password, Has_Completed_Tutorial)
             VALUES ('Canary Faculty', ?, 'Faculty', 'ACTIVE', ?, 1)`,
            [email, canaryPasswordHash]
        );
        const canaryUserId = userRes.insertId;
        assert.ok(canaryUserId > 0, 'Canary User_ID must be positive integer');

        // 4C: Insert Target Disposable Schedule Record (Auto-increment Schedule_ID)
        const [schedRes] = await testDbConnection.query(
            `INSERT INTO schedules (
                User_ID, Room_ID, Subject_Name, Section, 
                Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme
             ) VALUES (?, ?, ?, 'TEST-4A', 'Monday', '08:00:00', '11:00:00', '2025-2026', '1st Semester', 'teal')`,
            [canaryUserId, canaryRoomId, subjectName]
        );
        const canaryScheduleId = schedRes.insertId;
        assert.ok(canaryScheduleId > 0, 'Canary Schedule_ID must be positive integer');

        console.log(`✔ PASS: Disposable Canary Fixtures created successfully:`);
        console.log(`   - Laboratory ID: ${canaryRoomId} (${roomNumber})`);
        console.log(`   - User ID: ${canaryUserId} (${email})`);
        console.log(`   - Schedule ID: ${canaryScheduleId} (${subjectName})`);

        // ─── 5. VERIFIED BACKUP GENERATION OF TEST SANDBOX ───────────────────
        console.log('\n--- 5. Generating Genuine Backup of labsync_test ---');
        const backupResult = await backupService.generateVerifiedBackupFile({
            dbName: 'labsync_test'
        });

        assert.ok(backupResult.tempFilePath, 'Temp file path must exist');
        assert.ok(fs.existsSync(backupResult.tempFilePath), 'Backup file must exist on disk');
        assert.ok(backupResult.fileSizeBytes > 0, 'Backup file size must be greater than 0');
        assert.strictEqual(typeof backupResult.checksumSha256, 'string', 'SHA-256 digest must be string');
        assert.strictEqual(backupResult.checksumSha256.length, 64, 'SHA-256 digest must be 64-char hex');

        console.log('✔ PASS: Backup generated and verified:');
        console.log(`   - File: ${backupResult.filename}`);
        console.log(`   - Size: ${backupResult.fileSizeBytes} bytes`);
        console.log(`   - SHA-256 Digest: ${backupResult.checksumSha256}`);

        // ─── 6. DISPOSABLE RECORD DELETION ───────────────────────────────────
        console.log('\n--- 6. Deleting Target Disposable Schedule Record ---');
        const [delResult] = await testDbConnection.query(
            'DELETE FROM schedules WHERE Schedule_ID = ?',
            [canaryScheduleId]
        );
        assert.strictEqual(delResult.affectedRows, 1, 'Exactly 1 schedule record must be deleted');

        const [verifyDeleted] = await testDbConnection.query(
            'SELECT COUNT(*) as count FROM schedules WHERE Schedule_ID = ?',
            [canaryScheduleId]
        );
        assert.strictEqual(verifyDeleted[0].count, 0, 'Canary schedule must be absent from database');
        console.log(`✔ PASS: Schedule ${canaryScheduleId} (${subjectName}) verified deleted (Count = 0).`);

        // ─── 7. RESTORATION INTO ISOLATED TEST SANDBOX ───────────────────────
        console.log('\n--- 7. Restoring Backup Archive into labsync_test Sandbox ---');
        process.env.NODE_ENV = 'development';
        process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO = 'true';
        process.env.RESTORE_TARGET_DATABASE = 'labsync_test';
        process.env.DB_NAME = 'labsync_test';
        // Use dedicated restricted user with privileges strictly on labsync_test.*
        process.env.DB_RESTORE_USER = 'labsync_restore_test';
        process.env.DB_RESTORE_PASSWORD = 'TestRestorePass_123!';

        const restoreResult = await backupService.restoreToTestDatabase(backupResult.tempFilePath, {
            actorEmail: 'admin.tester@labsync.test',
            isGzip: true,
            expectedChecksum: backupResult.checksumSha256
        });

        assert.strictEqual(restoreResult.success, true, 'Restoration must report success');
        assert.strictEqual(restoreResult.targetDatabase, 'labsync_test', 'Restoration target must be labsync_test');
        console.log('✔ PASS: Restoration completed into isolated sandbox using dedicated restricted credentials:', restoreResult);

        // ─── 8. CANARY RECORD PRESENCE & RELATIONSHIP INTEGRITY ───────────────
        console.log('\n--- 8. Verifying Deleted Record Return and Relationship Integrity ---');
        const [restoredScheds] = await testDbConnection.query(
            'SELECT * FROM schedules WHERE Schedule_ID = ?',
            [canaryScheduleId]
        );

        assert.strictEqual(restoredScheds.length, 1, 'Deleted canary schedule must be restored (Count = 1)');
        const restored = restoredScheds[0];
        assert.strictEqual(restored.Schedule_ID, canaryScheduleId, 'Schedule ID must match original');
        assert.strictEqual(restored.Subject_Name, subjectName, 'Subject Name must match original');
        assert.strictEqual(restored.User_ID, canaryUserId, 'Foreign Key User_ID must match original');
        assert.strictEqual(restored.Room_ID, canaryRoomId, 'Foreign Key Room_ID must match original');
        assert.strictEqual(restored.Section, 'TEST-4A', 'Section must match original');

        // Verify parent relationships exist and are valid
        const [parentRooms] = await testDbConnection.query(
            'SELECT * FROM laboratories WHERE Room_ID = ?',
            [canaryRoomId]
        );
        assert.strictEqual(parentRooms.length, 1, 'Parent Laboratory must exist');

        const [parentUsers] = await testDbConnection.query(
            'SELECT * FROM users WHERE User_ID = ?',
            [canaryUserId]
        );
        assert.strictEqual(parentUsers.length, 1, 'Parent Faculty User must exist');

        console.log('✔ PASS: Restored schedule record verified intact with all parent relationships:');
        console.log(`   - Schedule ID: ${restored.Schedule_ID}`);
        console.log(`   - Subject Name: ${restored.Subject_Name}`);
        console.log(`   - Linked User ID: ${restored.User_ID} (Faculty: ${parentUsers[0].Name})`);
        console.log(`   - Linked Room ID: ${restored.Room_ID} (Room: ${parentRooms[0].Room_Number})`);

        // ─── 8B. RESTORING OLDER BACKUP AFTER NEWER BACKUP CREATED ───────────
        console.log('\n--- 8B. Restoring Older Backup After Newer Backup Created ---');
        // Insert a second Canary schedule to create a distinct newer state
        const [sched2Res] = await testDbConnection.query(
            `INSERT INTO schedules (
                User_ID, Room_ID, Subject_Name, Section,
                Day_of_Week, Start_Time, End_Time, Academic_Year, Semester, Color_Theme
             ) VALUES (?, ?, 'CANARY-NEWER-BACKUP', 'TEST-NEW', 'Tuesday', '13:00:00', '16:00:00', '2025-2026', '1st Semester', 'indigo')`,
            [canaryUserId, canaryRoomId]
        );
        const canarySchedule2Id = sched2Res.insertId;

        // Generate second (newer) backup
        const newerBackupResult = await backupService.generateVerifiedBackupFile({
            dbName: 'labsync_test'
        });
        assert.notStrictEqual(newerBackupResult.checksumSha256, backupResult.checksumSha256, 'Newer backup must have unique checksum');

        try {
            // Delete the older canary schedule record
            await testDbConnection.query('DELETE FROM schedules WHERE Schedule_ID = ?', [canaryScheduleId]);

            // Attempt 1: Attempt to restore older backup using the NEWER backup's checksum -> must be rejected!
            let mismatchRejected = false;
            try {
                await backupService.restoreToTestDatabase(backupResult.tempFilePath, {
                    actorEmail: 'admin.tester@labsync.test',
                    isGzip: true,
                    expectedChecksum: newerBackupResult.checksumSha256
                });
            } catch (err) {
                mismatchRejected = true;
                assert.ok(
                    err.message.includes('CHECKSUM_MISMATCH') || err.code === 'CHECKSUM_MISMATCH',
                    `Expected CHECKSUM_MISMATCH when pairing older backup with newer checksum, got: ${err.message}`
                );
            }
            assert.strictEqual(mismatchRejected, true, 'Using newer checksum on older archive must be rejected');
            console.log('✔ PASS: Restoring older archive with newer checksum strictly rejected with CHECKSUM_MISMATCH.');

            // Attempt 2: Restore older backup using its OWN exact preserved checksum -> must succeed!
            const olderRestoreResult = await backupService.restoreToTestDatabase(backupResult.tempFilePath, {
                actorEmail: 'admin.tester@labsync.test',
                isGzip: true,
                expectedChecksum: backupResult.checksumSha256
            });
            assert.strictEqual(olderRestoreResult.success, true, 'Older backup restoration must succeed with exact checksum');

            // Verify older canary schedule was restored
            const [reRestored] = await testDbConnection.query(
                'SELECT * FROM schedules WHERE Schedule_ID = ?',
                [canaryScheduleId]
            );
            assert.strictEqual(reRestored.length, 1, 'Older canary schedule must be restored');
            console.log('✔ PASS: Older backup successfully restored using its own exact preserved checksum.');
        } finally {
            if (newerBackupResult.cleanup) newerBackupResult.cleanup();
            await testDbConnection.query('DELETE FROM schedules WHERE Schedule_ID = ?', [canarySchedule2Id]);
        }

        // ─── 9. SANDBOX ESCAPE PREVENTION & SENTINEL ISOLATION TEST ──────────
        console.log('\n--- 9. Testing Privilege Boundary Isolation with Disposable Sentinel DB ---');
        const disposableDbName = `labsync_sentinel_${Date.now().toString().slice(-6)}`;
        const devPool = require('../database/connection');
        
        // Setup isolated disposable database with sentinel record
        await testDbConnection.query(`CREATE DATABASE IF NOT EXISTS \`${disposableDbName}\``);
        await testDbConnection.query(`
            CREATE TABLE \`${disposableDbName}\`.sentinel_records (
                id INT PRIMARY KEY,
                canary_value VARCHAR(100) NOT NULL
            )
        `);
        const sentinelInitialVal = 'IMMUTABLE_CANARY_SENTINEL_OK';
        await testDbConnection.query(
            `INSERT INTO \`${disposableDbName}\`.sentinel_records (id, canary_value) VALUES (1, ?)`,
            [sentinelInitialVal]
        );

        // Helper to execute an independent restore attempt and verify failure audit
        async function runUnauthorizedRestoreAttempt({ sql, actorEmail, expectedErrorSubstring }) {
            const gz = zlib.gzipSync(Buffer.from(sql, 'utf8'));
            const tempFile = path.join(require('os').tmpdir(), `unauth_${Date.now()}_${Math.random().toString(36).substring(7)}.sql.gz`);
            fs.writeFileSync(tempFile, gz);

            let rejected = false;
            let caughtError = null;
            const tempChecksum = crypto.createHash('sha256').update(gz).digest('hex');
            try {
                await backupService.restoreToTestDatabase(tempFile, {
                    actorEmail,
                    isGzip: true,
                    expectedChecksum: tempChecksum
                });
            } catch (err) {
                rejected = true;
                caughtError = err;
            } finally {
                try { fs.unlinkSync(tempFile); } catch (_) { }
            }

            assert.strictEqual(rejected, true, `Restore attempt for ${actorEmail} must be rejected`);
            assert.ok(
                caughtError && caughtError.message.includes(expectedErrorSubstring),
                `Error must include "${expectedErrorSubstring}", got: ${caughtError ? caughtError.message : 'none'}`
            );

            // Verify audit record: DATABASE_RESTORE_FAILED logged and NEVER DATABASE_RESTORE_COMPLETED
            const [failedLogs] = await devPool.query(
                'SELECT Action, Result FROM audit_logs WHERE Actor_Email = ? ORDER BY Log_ID DESC LIMIT 1',
                [actorEmail]
            );
            assert.strictEqual(failedLogs.length, 1, `Audit entry must exist for ${actorEmail}`);
            assert.strictEqual(failedLogs[0].Action, 'DATABASE_RESTORE_FAILED', `Action must be DATABASE_RESTORE_FAILED for ${actorEmail}`);
            assert.strictEqual(failedLogs[0].Result, 'FAILED', `Result must be FAILED for ${actorEmail}`);

            const [completedLogs] = await devPool.query(
                "SELECT COUNT(*) as cnt FROM audit_logs WHERE Actor_Email = ? AND Action = 'DATABASE_RESTORE_COMPLETED'",
                [actorEmail]
            );
            assert.strictEqual(completedLogs[0].cnt, 0, `Must never record DATABASE_RESTORE_COMPLETED for ${actorEmail}`);

            return caughtError;
        }

        try {
            const attackNonce = Date.now().toString().slice(-6);

            // Case 9A: Unauthorized Database Switch (`USE disposableDbName;`)
            const actorA = `attacker_use_${attackNonce}@labsync.test`;
            const errA = await runUnauthorizedRestoreAttempt({
                sql: `USE \`${disposableDbName}\`;\nSELECT 1;\n`,
                actorEmail: actorA,
                expectedErrorSubstring: 'Access denied'
            });
            console.log('✔ PASS: 9A (USE unauthorized database) failed with expected error & recorded DATABASE_RESTORE_FAILED:', errA.message);

            // Case 9B: Independent Fully Qualified CREATE Statement
            const actorB = `attacker_create_${attackNonce}@labsync.test`;
            const errB = await runUnauthorizedRestoreAttempt({
                sql: `CREATE TABLE \`${disposableDbName}\`.breach_create (id INT);\n`,
                actorEmail: actorB,
                expectedErrorSubstring: 'CREATE command denied'
            });
            console.log('✔ PASS: 9B (Qualified CREATE statement) failed with expected error & recorded DATABASE_RESTORE_FAILED:', errB.message);
            // Verify breach_create table does NOT exist in disposable database
            const [tablesB] = await testDbConnection.query(
                `SHOW TABLES FROM \`${disposableDbName}\` LIKE 'breach_create'`
            );
            assert.strictEqual(tablesB.length, 0, 'Table breach_create must not exist in disposable DB');
            console.log('✔ PASS: 9B Database state verified: breach_create table was not created.');

            // Case 9C: Independent Fully Qualified UPDATE Statement
            const actorC = `attacker_update_${attackNonce}@labsync.test`;
            const errC = await runUnauthorizedRestoreAttempt({
                sql: `UPDATE \`${disposableDbName}\`.sentinel_records SET canary_value = 'TAMPERED_BY_UPDATE' WHERE id = 1;\n`,
                actorEmail: actorC,
                expectedErrorSubstring: 'UPDATE command denied'
            });
            console.log('✔ PASS: 9C (Qualified UPDATE statement) failed with expected error & recorded DATABASE_RESTORE_FAILED:', errC.message);
            // Verify sentinel record canary_value was NOT modified
            const [rowsC] = await testDbConnection.query(
                `SELECT canary_value FROM \`${disposableDbName}\`.sentinel_records WHERE id = 1`
            );
            assert.strictEqual(rowsC.length, 1, 'Sentinel record must exist');
            assert.strictEqual(rowsC[0].canary_value, sentinelInitialVal, 'Sentinel canary value must be unchanged');
            console.log('✔ PASS: 9C Database state verified: sentinel record canary_value remains unchanged.');

            // Case 9D: Independent Fully Qualified DELETE Statement
            const actorD = `attacker_delete_${attackNonce}@labsync.test`;
            const errD = await runUnauthorizedRestoreAttempt({
                sql: `DELETE FROM \`${disposableDbName}\`.sentinel_records WHERE id = 1;\n`,
                actorEmail: actorD,
                expectedErrorSubstring: 'DELETE command denied'
            });
            console.log('✔ PASS: 9D (Qualified DELETE statement) failed with expected error & recorded DATABASE_RESTORE_FAILED:', errD.message);
            // Verify sentinel record was NOT deleted
            const [rowsD] = await testDbConnection.query(
                `SELECT COUNT(*) as cnt FROM \`${disposableDbName}\`.sentinel_records WHERE id = 1`
            );
            assert.strictEqual(rowsD[0].cnt, 1, 'Sentinel record must not be deleted');
            console.log('✔ PASS: 9D Database state verified: sentinel record was not deleted (count = 1).');

            // Verify production database labsync is completely untouched
            const [prodBreachCheck] = await devPool.query(
                "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'labsync' AND table_name LIKE '%breach%'"
            );
            assert.strictEqual(prodBreachCheck[0].cnt, 0, 'Production DB labsync must have 0 breach tables');
            console.log('✔ PASS: Verified production database labsync has 0 breach objects.');
        } finally {
            // Clean up the isolated disposable database
            await testDbConnection.query(`DROP DATABASE IF EXISTS \`${disposableDbName}\``);
            console.log(`✔ PASS: Dropped isolated disposable sentinel database: ${disposableDbName}`);
        }

        // ─── 10. MALFORMED / CORRUPTED ARCHIVE TEST ───────────────────────────
        console.log('\n--- 10. Testing Corrupted Upload Handling & Cleanup ---');
        const corruptedFile = path.join(require('os').tmpdir(), 'corrupted_test.sql.gz');
        fs.writeFileSync(corruptedFile, Buffer.from('NOT_A_VALID_GZIP_STREAM_RANDOM_BYTES_1234567890'));

        let corruptedFailedAsExpected = false;
        try {
            await backupService.restoreToTestDatabase(corruptedFile, {
                actorEmail: 'tester@labsync.test',
                isGzip: true,
                expectedChecksum: '0000000000000000000000000000000000000000000000000000000000000000'
            });
        } catch (corruptErr) {
            corruptedFailedAsExpected = true;
            console.log('✔ PASS: Corrupted archive cleanly rejected:', corruptErr.message);
        } finally {
            try { fs.unlinkSync(corruptedFile); } catch (_) { }
        }
        assert.strictEqual(corruptedFailedAsExpected, true, 'Corrupted archive must be rejected with an error');

        // ─── 11. CLEANUP OF TEMPORARY SCRATCH ARCHIVE & TEST CANARY ───────────
        console.log('\n--- 11. Cleaning up Test Artifacts ---');
        if (backupResult.cleanup) backupResult.cleanup();

        await testDbConnection.query('DELETE FROM schedules WHERE Schedule_ID = ?', [canaryScheduleId]);
        await testDbConnection.query('DELETE FROM users WHERE User_ID = ?', [canaryUserId]);
        await testDbConnection.query('DELETE FROM laboratories WHERE Room_ID = ?', [canaryRoomId]);
        console.log('✔ PASS: Cleaned up disposable canary records from labsync_test.');

        console.log('\n================================================================');
        console.log('🎉 ALL 11 BACKUP & RECOVERY SUITE INVARIANTS PASSED 100%!');
        console.log('================================================================\n');
    } finally {
        if (testDbConnection) {
            await testDbConnection.end();
        }
    }
}

runBackupRecoveryTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('\n❌ BACKUP & RECOVERY TEST FAILURE:', err);
    process.exit(1);
});
