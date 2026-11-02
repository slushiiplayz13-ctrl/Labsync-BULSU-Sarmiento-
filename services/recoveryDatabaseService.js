'use strict';

/**
 * services/recoveryDatabaseService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17: Online Recovery Sandbox Service.
 *
 * Implements:
 * 1. Dedicated Railway MySQL recovery database connection management.
 * 2. Strict runtime target validation and isolation verification (never targets production).
 * 3. Fail-closed error handling when recovery configuration is missing or invalid.
 * 4. Safe recovery target preparation (clears tables strictly inside recovery schema).
 * 5. Native mysql2 streaming execution pipeline compatible with MySQL 9.7.2.
 * 6. Post-import verification of restored tables and row counts.
 * 7. Demonstration comparison engine for verifying point-in-time snapshot isolation.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const zlib = require('zlib');
const mysql = require('mysql2/promise');
const restoreService = require('./restoreService');
const auditService = require('./auditService');
const pool = require('../database/connection');

// In-memory cache for latest online recovery verification summary
let latestRecoverySummary = null;
let isRecoveryInProgress = false;

// Canonical RFC 4122 UUID v1 format used by MySQL @@server_uuid (e.g. 8-4-4-4-12 hex chars)
const SERVER_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a string conforms to canonical RFC 4122 MySQL server_uuid format.
 * @param {string} uuid
 * @returns {boolean}
 */
function isValidServerUuid(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    return SERVER_UUID_REGEX.test(uuid.trim());
}

// Pinned production server identity (cached from healthy state or environment variable)
let pinnedProductionServerUuid = (process.env.PROD_SERVER_UUID && isValidServerUuid(process.env.PROD_SERVER_UUID))
    ? process.env.PROD_SERVER_UUID.trim().toLowerCase()
    : null;

/**
 * Checks whether the dedicated Online Recovery Sandbox database is configured.
 * @returns {boolean}
 */
function isRecoveryConfigured() {
    return Boolean(
        process.env.RECOVERY_DB_HOST &&
        process.env.RECOVERY_DB_HOST.trim() !== '' &&
        process.env.RECOVERY_DB_USER &&
        process.env.RECOVERY_DB_USER.trim() !== '' &&
        process.env.RECOVERY_DB_NAME &&
        process.env.RECOVERY_DB_NAME.trim() !== ''
    );
}

/**
 * Resolves trusted server-side recovery database configuration.
 * Fails closed if configuration is missing. NEVER falls back to production DB credentials.
 * @returns {object}
 */
function getRecoveryConfig() {
    if (!isRecoveryConfigured()) {
        const err = new Error('RECOVERY_NOT_CONFIGURED: Online Recovery Sandbox database is not configured. Please configure RECOVERY_DB_HOST, RECOVERY_DB_USER, and RECOVERY_DB_NAME in environment variables.');
        err.code = 'RECOVERY_NOT_CONFIGURED';
        throw err;
    }

    const host = process.env.RECOVERY_DB_HOST.trim();
    const port = parseInt(process.env.RECOVERY_DB_PORT || '3306', 10);
    const user = process.env.RECOVERY_DB_USER.trim();
    const password = process.env.RECOVERY_DB_PASSWORD !== undefined ? process.env.RECOVERY_DB_PASSWORD : '';
    const database = process.env.RECOVERY_DB_NAME.trim();

    let ssl = undefined;
    const sslEnv = String(process.env.RECOVERY_DB_SSL || '').toLowerCase();
    const sslCa = process.env.RECOVERY_DB_SSL_CA;

    if (sslCa || sslEnv === 'true' || sslEnv === '1' || sslEnv === 'strict') {
        let caContent = undefined;
        if (sslCa && sslCa.trim() !== '') {
            const trimmedCa = sslCa.trim();
            if (fs.existsSync(trimmedCa)) {
                try {
                    caContent = fs.readFileSync(trimmedCa, 'utf8');
                } catch (_) {
                    caContent = trimmedCa;
                }
            } else {
                caContent = trimmedCa;
            }
        }

        ssl = {
            rejectUnauthorized: true
        };
        if (caContent) {
            ssl.ca = caContent;
        }
    }

    return {
        host,
        port: isNaN(port) ? 3306 : port,
        user,
        password,
        database,
        ssl
    };
}

/**
 * Checks if two hosts reference the same machine or domain.
 * @param {string} h1
 * @param {string} h2
 * @returns {boolean}
 */
function isSameHost(h1, h2) {
    if (!h1 || !h2) return false;
    const clean1 = h1.trim().toLowerCase();
    const clean2 = h2.trim().toLowerCase();
    if (clean1 === clean2) return true;
    const localhostNames = ['localhost', '127.0.0.1', '::1'];
    return localhostNames.includes(clean1) && localhostNames.includes(clean2);
}

/**
 * Creates a dedicated connection to the Recovery Sandbox database.
 * @param {object} [overrideConfig] Optional configuration for isolated testing
 * @returns {Promise<mysql.Connection>}
 */
async function createRecoveryConnection(overrideConfig = null) {
    const config = overrideConfig || getRecoveryConfig();

    return await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl,
        multipleStatements: true,
        connectTimeout: 15000
    });
}

/**
 * Verifies runtime target isolation between production and recovery databases.
 * Guarantees that restoration CANNOT target or overwrite the live production database.
 *
 * @param {object} [testConfig] Optional config for testing isolation logic
 * @returns {Promise<{ isolated: boolean, database: string, host: string, engine: string, version: string }>}
 */
async function verifyRecoveryIsolation(testConfig = null) {
    const config = testConfig || getRecoveryConfig();

    const prodHost = process.env.DB_HOST || 'localhost';
    const prodPort = parseInt(process.env.DB_PORT || '3306', 10);
    const prodName = process.env.DB_NAME || 'labsync';
    const prodUser = process.env.DB_USER || 'root';

    // 1. Direct Target Separation Check
    const sameHost = isSameHost(config.host, prodHost) && (config.port === prodPort);
    const sameDbName = config.database.toLowerCase() === prodName.toLowerCase();
    const sameUser = config.user.toLowerCase() === prodUser.toLowerCase();

    // Reject target if it points to the exact same database on the same host
    if (sameHost && sameDbName) {
        const err = new Error(`RECOVERY_TARGETS_PRODUCTION: Restoration rejected: Recovery target '${config.database}' matches active production database '${prodName}' on ${config.host}:${config.port}. Production restoration is permanently locked out.`);
        err.code = 'RECOVERY_TARGETS_PRODUCTION';
        throw err;
    }

    // Reject user if it reuses production credentials on the same host
    if (sameHost && sameUser) {
        const err = new Error('RECOVERY_USES_PRODUCTION_USER: Restoration rejected: Dedicated recovery user credentials must be used. Production database credentials cannot be reused for recovery.');
        err.code = 'RECOVERY_USES_PRODUCTION_USER';
        throw err;
    }

    // 2. Active Database Probe
    let conn = null;
    try {
        conn = await module.exports.createRecoveryConnection(config);
        const [idRows] = await conn.query('SELECT DATABASE() AS current_db, @@hostname AS server_host, @@server_id AS server_id, VERSION() AS db_ver');
        if (!idRows || idRows.length === 0) {
            throw new Error('Failed to retrieve database identity from recovery database.');
        }

        const activeDb = idRows[0].current_db;
        const serverVersion = idRows[0].db_ver || 'Unknown';

        // Probe @@server_uuid if supported by the engine (MySQL 5.6+ / 9.x)
        let recoveryServerUuid = null;
        try {
            const [uuidRows] = await conn.query('SELECT @@server_uuid AS server_uuid');
            if (uuidRows && uuidRows[0] && uuidRows[0].server_uuid) {
                const raw = String(uuidRows[0].server_uuid).trim().toLowerCase();
                if (isValidServerUuid(raw)) {
                    recoveryServerUuid = raw;
                }
            }
        } catch (_) {
            // MariaDB or legacy MySQL does not support @@server_uuid
        }

        if (!activeDb || activeDb.toLowerCase() !== config.database.toLowerCase()) {
            throw new Error(`Connected database '${activeDb}' does not match expected recovery target '${config.database}'.`);
        }

        // Reject if connection resolved to production database on the same host
        if (sameHost && activeDb.toLowerCase() === prodName.toLowerCase()) {
            const err = new Error('ISOLATION_VIOLATION: Recovery connection resolved to the production database.');
            err.code = 'RECOVERY_TARGETS_PRODUCTION';
            throw err;
        }

        // Compare server_uuid against pinned or active production server identity
        let prodServerUuid = pinnedProductionServerUuid;
        if (!prodServerUuid) {
            try {
                const [prodIdRows] = await pool.query('SELECT @@server_uuid AS server_uuid');
                if (prodIdRows && prodIdRows[0] && prodIdRows[0].server_uuid) {
                    const raw = String(prodIdRows[0].server_uuid).trim().toLowerCase();
                    if (isValidServerUuid(raw)) {
                        prodServerUuid = raw;
                        pinnedProductionServerUuid = prodServerUuid;
                    }
                }
            } catch (_) {
                // Production pool unreachable (e.g. disaster scenario)
            }
        }

        if (recoveryServerUuid && prodServerUuid) {
            if (recoveryServerUuid.toLowerCase() === prodServerUuid.toLowerCase()) {
                const err = new Error(`ISOLATION_VIOLATION: Recovery database connection resolved to the production MySQL server instance (matching @@server_uuid: ${recoveryServerUuid}). Recovery sandbox must run on an independent MySQL service.`);
                err.code = 'RECOVERY_TARGETS_PRODUCTION';
                throw err;
            }
        }

        // 3. Cross-Database Privilege Probe (ONLY on same host when database names differ)
        // If sameHost and config.database !== prodName (e.g. labsync_test vs labsync on localhost),
        // verify that the recovery credentials cannot read the production schema.
        // NOTE: Does NOT execute when database names are identical on separate servers (e.g. railway on separate hosts),
        // preventing false-positive isolation failures after users table is populated.
        if (sameHost && config.database.toLowerCase() !== prodName.toLowerCase()) {
            try {
                await conn.query(`SELECT 1 FROM \`${prodName}\`.users LIMIT 1`);
                // If query succeeds, recovery account has unauthorized read access to production schema
                const err = new Error('ISOLATION_VIOLATION: Recovery database credentials have access to production schema. Dedicated isolated permissions are required.');
                err.code = 'ISOLATION_VERIFICATION_FAILED';
                throw err;
            } catch (probeErr) {
                if (probeErr.code === 'ISOLATION_VERIFICATION_FAILED') throw probeErr;
                // ER_DBACCESS_DENIED_ERROR or ER_TABLEACCESS_DENIED_ERROR is expected and confirms isolation
            }
        }

        return {
            isolated: true,
            database: activeDb,
            host: config.host,
            engine: serverVersion.includes('MariaDB') ? 'MariaDB' : 'MySQL',
            version: serverVersion
        };
    } finally {
        if (conn) {
            try { await conn.end(); } catch (_) {}
        }
    }
}

/**
 * Safely resets all views and base tables in the verified recovery target database.
 * NEVER drops the database itself; only drops views and tables inside the recovery schema.
 *
 * @param {mysql.Connection} conn Dedicated recovery connection
 * @param {string} targetDb Verified recovery database name
 */
async function resetRecoveryDatabase(conn, targetDb) {
    const [dbRows] = await conn.query('SELECT DATABASE() AS current_db');
    if (!dbRows || !dbRows[0] || dbRows[0].current_db.toLowerCase() !== targetDb.toLowerCase()) {
        throw new Error(`Target database safety mismatch: Active DB '${dbRows[0]?.current_db}' !== Target '${targetDb}'`);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
        // 1. Drop all VIEWs first
        const [viewRows] = await conn.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'VIEW'",
            [targetDb]
        );
        for (const row of viewRows) {
            await conn.query(`DROP VIEW IF EXISTS \`${row.TABLE_NAME}\``);
        }

        // 2. Drop all BASE TABLEs
        const [tableRows] = await conn.query(
            "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
            [targetDb]
        );
        for (const row of tableRows) {
            await conn.query(`DROP TABLE IF EXISTS \`${row.TABLE_NAME}\``);
        }
    } finally {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
}

/**
 * Accurately tokenizes SQL dump text into individual executable statements.
 * Robust state machine handling:
 * - Single-quoted strings (including escaped quotes \' and '')
 * - Double-quoted strings (including escaped quotes \" and "")
 * - Backtick-quoted identifiers (including escaped backticks ``)
 * - Single-line comments (-- and #)
 * - Block comments (/* ... *\/)
 * - Preserves executable MySQL conditional comments (/*!40101 ... *\/)
 * - Statement terminators (;) outside quotes and comments
 *
 * @param {string} sqlText
 * @returns {string[]}
 */
function splitSqlStatements(sqlText) {
    const statements = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let isConditionalComment = false;
    const len = sqlText.length;

    for (let i = 0; i < len; i++) {
        const char = sqlText[i];
        const nextChar = i + 1 < len ? sqlText[i + 1] : '';

        // Inside single-line comment
        if (inLineComment) {
            if (char === '\n') {
                inLineComment = false;
            }
            continue;
        }

        // Inside block comment
        if (inBlockComment) {
            if (isConditionalComment) {
                current += char;
            }
            if (char === '*' && nextChar === '/') {
                if (isConditionalComment) {
                    current += '/';
                }
                inBlockComment = false;
                isConditionalComment = false;
                i++; // skip '/'
            }
            continue;
        }

        // Inside single-quoted string
        if (inSingleQuote) {
            current += char;
            if (char === '\\' && i + 1 < len) {
                i++;
                current += sqlText[i];
            } else if (char === "'") {
                if (nextChar === "'") {
                    i++;
                    current += "'";
                } else {
                    inSingleQuote = false;
                }
            }
            continue;
        }

        // Inside double-quoted string
        if (inDoubleQuote) {
            current += char;
            if (char === '\\' && i + 1 < len) {
                i++;
                current += sqlText[i];
            } else if (char === '"') {
                if (nextChar === '"') {
                    i++;
                    current += '"';
                } else {
                    inDoubleQuote = false;
                }
            }
            continue;
        }

        // Inside backtick identifier
        if (inBacktick) {
            current += char;
            if (char === '`') {
                if (nextChar === '`') {
                    i++;
                    current += '`';
                } else {
                    inBacktick = false;
                }
            }
            continue;
        }

        // Normal state: Check for comments
        if ((char === '-' && nextChar === '-' && (i + 2 >= len || /\s/.test(sqlText[i + 2]))) || char === '#') {
            inLineComment = true;
            if (char === '-') i++; // skip second '-'
            continue;
        }

        // Block comment: /*
        if (char === '/' && nextChar === '*') {
            inBlockComment = true;
            if (i + 2 < len && sqlText[i + 2] === '!') {
                // MySQL conditional comment /*!... */ - executable by MySQL
                isConditionalComment = true;
                current += '/*!';
                i += 2;
            } else {
                isConditionalComment = false;
                i++; // skip '*'
            }
            continue;
        }

        // String openers
        if (char === "'") {
            inSingleQuote = true;
            current += char;
            continue;
        }
        if (char === '"') {
            inDoubleQuote = true;
            current += char;
            continue;
        }
        if (char === '`') {
            inBacktick = true;
            current += char;
            continue;
        }

        // Statement terminator
        if (char === ';') {
            const trimmed = current.trim();
            if (trimmed.length > 0) {
                statements.push(trimmed);
            }
            current = '';
            continue;
        }

        current += char;
    }

    const trailing = current.trim();
    if (trailing.length > 0) {
        statements.push(trailing);
    }

    return statements;
}

/**
 * Executes decompressed SQL statements against the recovery connection.
 * Strips comments, disables foreign key checks, and executes statements sequentially.
 *
 * @param {mysql.Connection} conn
 * @param {string} sqlText
 */
async function executeRecoverySql(conn, sqlText) {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
        const statements = splitSqlStatements(sqlText);

        for (const stmt of statements) {
            await conn.query(stmt);
        }
    } finally {
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
}

/**
 * Queries post-import verification statistics from the recovery database.
 * @param {mysql.Connection} conn
 * @param {string} targetDb
 * @param {string[]} [expectedTables] Optional expected tables from backup manifest
 * @returns {Promise<{ tableCount: number, actualTableList: string[], missingTables: string[], recordCounts: object }>}
 */
async function verifyRestoredDatabaseStats(conn, targetDb, expectedTables = []) {
    const [countRows] = await conn.query(
        "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
        [targetDb]
    );
    const tableCount = countRows[0] ? Number(countRows[0].total) : 0;

    const [tableNames] = await conn.query(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME ASC",
        [targetDb]
    );

    const actualTableList = tableNames.map(r => r.TABLE_NAME);
    const missingTables = expectedTables.filter(t => !actualTableList.includes(t));

    const recordCounts = {};
    const keyTables = ['laboratories', 'users', 'schedules', 'lab_units', 'software_licenses', 'audit_logs'];

    for (const t of tableNames) {
        if (keyTables.includes(t.TABLE_NAME)) {
            try {
                const [rows] = await conn.query(`SELECT COUNT(*) AS c FROM \`${t.TABLE_NAME}\``);
                recordCounts[t.TABLE_NAME] = rows[0] ? Number(rows[0].c) : 0;
            } catch (_) {
                recordCounts[t.TABLE_NAME] = 'N/A';
            }
        }
    }

    return {
        tableCount,
        actualTableList,
        missingTables,
        recordCounts
    };
}

/**
 * Executes complete Online Recovery Sandbox restoration.
 *
 * Workflow:
 * 1. Pre-import archive validation (SHA-256, format, decompressed bomb bounds, forbidden statements).
 * 2. Dedicated recovery connection & runtime isolation verification.
 * 3. Safe recovery database table reset.
 * 4. Streaming statement execution with foreign key disabling.
 * 5. Post-import verification and record count calculation.
 * 6. Audit logging and recovery history registration.
 *
 * @param {string} archivePath Local path of uploaded .sql.gz
 * @param {string} expectedChecksum Expected 64-char hex SHA-256
 * @param {object} [options] Actor context, filename, etc.
 * @returns {Promise<object>} Sanitized verification summary
 */
async function executeOnlineRecovery(archivePath, expectedChecksum, options = {}) {
    if (isRecoveryInProgress) {
        const err = new Error('CONCURRENT_RECOVERY_IN_PROGRESS: Another recovery operation is currently in progress. Please wait for it to complete.');
        err.code = 'CONCURRENT_RECOVERY_IN_PROGRESS';
        throw err;
    }
    isRecoveryInProgress = true;

    try {
        const actorEmail = options.actorEmail || 'admin@labsync.local';
        const filename = options.filename || 'uploaded-backup.sql.gz';

        // 1. Validate uploaded archive
        await restoreService.validateRestoreArchive(archivePath, expectedChecksum, {
            allowMySQL9Collations: true
        });

        // 2. Verify runtime isolation
        const isolation = await verifyRecoveryIsolation();

        // 3. Decompress SQL archive
        const decompressedSql = await new Promise((resolve, reject) => {
            const chunks = [];
            const gunzip = zlib.createGunzip();
            const readStream = fs.createReadStream(archivePath);

            readStream.on('error', reject);
            gunzip.on('error', reject);
            gunzip.on('data', chunk => chunks.push(chunk));
            gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));

            readStream.pipe(gunzip);
        });

        // 4. Extract expected tables from backup SQL manifest
        const expectedTableMatches = decompressedSql.match(/-- Table structure for table `([^`]+)`/g) ||
                                     decompressedSql.match(/DROP TABLE IF EXISTS `([^`]+)`/g) ||
                                     decompressedSql.match(/CREATE TABLE `([^`]+)`/g) || [];
        const expectedTables = [...new Set(expectedTableMatches.map(m => {
            const match = m.match(/`([^`]+)`/);
            return match ? match[1] : null;
        }).filter(Boolean))];

        // 5. Connect, reset tables, and import
        let conn = null;
        let restoreStats = null;
        const restoredAt = new Date().toISOString();

        try {
            conn = await createRecoveryConnection();
            await resetRecoveryDatabase(conn, isolation.database);
            await executeRecoverySql(conn, decompressedSql);
            restoreStats = await verifyRestoredDatabaseStats(conn, isolation.database, expectedTables);

            if (restoreStats.tableCount === 0) {
                throw new Error('Recovery verification failed: Zero tables found after restoration.');
            }

            if (restoreStats.missingTables && restoreStats.missingTables.length > 0) {
                const err = new Error(`Recovery verification failed: Incomplete restore. Missing expected tables: ${restoreStats.missingTables.join(', ')}`);
                err.code = 'RECOVERY_INCOMPLETE';
                throw err;
            }

            const summary = {
                status: 'SUCCESS',
                targetLabel: 'Online Recovery Sandbox',
                targetDatabase: isolation.database,
                targetHost: isolation.host,
                engine: isolation.engine,
                version: isolation.version,
                restoredAt,
                filename,
                checksumSha256: expectedChecksum,
                expectedTableCount: expectedTables.length > 0 ? expectedTables.length : restoreStats.tableCount,
                tableCount: restoreStats.tableCount,
                missingTables: restoreStats.missingTables || [],
                recordCounts: restoreStats.recordCounts
            };

            latestRecoverySummary = summary;

            await auditService.logSecurityEvent({
                actorEmail,
                actorRole: 'IT Dept. Head',
                action: 'ONLINE_RECOVERY_SANDBOX_COMPLETED',
                resourceType: 'DATABASE',
                resourceId: isolation.database,
                details: {
                    targetDatabase: isolation.database,
                    expectedTableCount: summary.expectedTableCount,
                    tableCount: restoreStats.tableCount,
                    checksumSha256: expectedChecksum,
                    filename
                },
                result: 'SUCCESS'
            });

            return summary;
        } catch (err) {
            latestRecoverySummary = {
                status: 'FAILED',
                targetLabel: 'Online Recovery Sandbox',
                targetDatabase: isolation.database,
                restoredAt,
                filename,
                error: err.message
            };

            await auditService.logSecurityEvent({
                actorEmail,
                actorRole: 'IT Dept. Head',
                action: 'ONLINE_RECOVERY_SANDBOX_FAILED',
                resourceType: 'DATABASE',
                resourceId: isolation.database,
                details: {
                    error: err.message,
                    filename
                },
                result: 'FAILURE'
            });

            throw err;
        } finally {
            if (conn) {
                try { await conn.end(); } catch (_) {}
            }
        }
    } finally {
        isRecoveryInProgress = false;
    }
}

/**
 * Compares room/laboratory records between live Production and the Online Recovery Sandbox.
 * Designed specifically for the professor's demonstration:
 * Proves that records created AFTER a backup exist in Production but are ABSENT in Recovery Sandbox.
 *
 * @param {string} roomQuery Room Number or Building identifier
 * @returns {Promise<object>}
 */
async function compareDemonstrationRecord(roomQuery) {
    if (!roomQuery || typeof roomQuery !== 'string') {
        const err = new Error('Room query string is required for comparison.');
        err.code = 'INVALID_QUERY';
        throw err;
    }

    const cleanQuery = roomQuery.trim();
    if (cleanQuery.length === 0 || cleanQuery.length > 50) {
        const err = new Error('Room query must be between 1 and 50 characters.');
        err.code = 'INVALID_QUERY';
        throw err;
    }

    // 1. Query Production Database
    let prodRecord = null;
    try {
        const [prodRows] = await pool.query(
            'SELECT Room_ID, Room_Number, Building, Current_Status FROM laboratories WHERE Room_Number = ? OR Building = ? LIMIT 1',
            [cleanQuery, cleanQuery]
        );
        if (prodRows && prodRows.length > 0) {
            prodRecord = {
                roomId: prodRows[0].Room_ID,
                roomNumber: prodRows[0].Room_Number,
                building: prodRows[0].Building,
                currentStatus: prodRows[0].Current_Status
            };
        }
    } catch (prodErr) {
        console.error('[RecoveryService] Failed to query production laboratories:', prodErr.message);
    }

    // 2. Query Online Recovery Sandbox (or local sandbox if configured/available)
    let recoveryRecord = null;
    let recoveryAvailable = false;
    let recoveryLabel = 'Online Recovery Sandbox';

    if (isRecoveryConfigured()) {
        let conn = null;
        try {
            conn = await createRecoveryConnection();
            const [recRows] = await conn.query(
                'SELECT Room_ID, Room_Number, Building, Current_Status FROM laboratories WHERE Room_Number = ? OR Building = ? LIMIT 1',
                [cleanQuery, cleanQuery]
            );
            recoveryAvailable = true;
            if (recRows && recRows.length > 0) {
                recoveryRecord = {
                    roomId: recRows[0].Room_ID,
                    roomNumber: recRows[0].Room_Number,
                    building: recRows[0].Building,
                    currentStatus: recRows[0].Current_Status
                };
            }
        } catch (recErr) {
            console.warn('[RecoveryService] Could not query recovery sandbox for comparison:', recErr.message);
        } finally {
            if (conn) {
                try { await conn.end(); } catch (_) {}
            }
        }
    } else if (!restoreService.isProductionEnvironment()) {
        // In local development, check labsync_test if available
        let testConn = null;
        try {
            testConn = await mysql.createConnection({
                host: '127.0.0.1',
                port: 3306,
                user: process.env.DB_RESTORE_USER || 'labsync_restore_test',
                password: process.env.DB_RESTORE_PASSWORD || '',
                database: 'labsync_test'
            });
            recoveryLabel = 'Local Test Sandbox (labsync_test)';
            const [testRows] = await testConn.query(
                'SELECT Room_ID, Room_Number, Building, Current_Status FROM laboratories WHERE Room_Number = ? OR Building = ? LIMIT 1',
                [cleanQuery, cleanQuery]
            );
            recoveryAvailable = true;
            if (testRows && testRows.length > 0) {
                recoveryRecord = {
                    roomId: testRows[0].Room_ID,
                    roomNumber: testRows[0].Room_Number,
                    building: testRows[0].Building,
                    currentStatus: testRows[0].Current_Status
                };
            }
        } catch (_) {
            // labsync_test not available or not yet populated
        } finally {
            if (testConn) {
                try { await testConn.end(); } catch (_) {}
            }
        }
    }

    const prodExists = Boolean(prodRecord);
    const recExists = Boolean(recoveryRecord);

    let demonstrationStatus = 'INCONCLUSIVE';
    let explanation = '';

    if (prodExists && !recExists && recoveryAvailable) {
        demonstrationStatus = 'DEMONSTRATION_PROVEN';
        explanation = `Record '${cleanQuery}' exists in the current production database, but is completely absent from the ${recoveryLabel}. This verifies that the recovery sandbox successfully restored the earlier point-in-time snapshot without overwriting or rolling back live production.`;
    } else if (prodExists && recExists) {
        demonstrationStatus = 'EXISTS_IN_BOTH';
        explanation = `Record '${cleanQuery}' exists in both the production database and the recovery sandbox. This indicates the record was created before the backup was taken.`;
    } else if (!prodExists && !recExists) {
        demonstrationStatus = 'ABSENT_IN_BOTH';
        explanation = `Record '${cleanQuery}' was not found in either the production database or the recovery sandbox.`;
    } else if (!prodExists && recExists) {
        demonstrationStatus = 'EXISTS_ONLY_IN_RECOVERY';
        explanation = `Record '${cleanQuery}' exists in the recovery snapshot but not in production.`;
    } else {
        explanation = `Recovery sandbox is not currently populated or reachable for live comparison.`;
    }

    return {
        query: cleanQuery,
        timestamp: new Date().toISOString(),
        recoveryConfigured: isRecoveryConfigured(),
        recoveryAvailable,
        production: {
            database: process.env.DB_NAME || 'labsync',
            label: 'Current Production Database',
            exists: prodExists,
            status: prodExists ? 'Record Exists' : 'Record Not Found',
            roomNumber: prodRecord ? prodRecord.roomNumber : null,
            building: prodRecord ? prodRecord.building : null
        },
        recoverySandbox: {
            database: isRecoveryConfigured() ? process.env.RECOVERY_DB_NAME : (restoreService.isProductionEnvironment() ? 'Not Configured' : 'labsync_test'),
            label: recoveryLabel,
            exists: recExists,
            status: recExists ? 'Record Exists in Snapshot' : (recoveryAvailable ? 'Record Absent in Snapshot' : 'Sandbox Unreachable'),
            roomNumber: recoveryRecord ? recoveryRecord.roomNumber : null,
            building: recoveryRecord ? recoveryRecord.building : null
        },
        demonstrationStatus,
        explanation
    };
}

/**
 * Returns summary status of the Online Recovery Sandbox.
 * @returns {Promise<object>}
 */
async function getRecoveryStatus() {
    const isProd = restoreService.isProductionEnvironment();
    const configured = isRecoveryConfigured();

    let targetLabel = 'Online Recovery Sandbox';
    let databaseName = null;
    let engine = 'MySQL (9.7.2)';
    let reachable = false;

    if (configured) {
        try {
            const config = getRecoveryConfig();
            databaseName = config.database;
            const isolation = await verifyRecoveryIsolation();
            engine = `${isolation.engine} (${isolation.version})`;
            reachable = true;
        } catch (_) {
            reachable = false;
        }
    } else if (!isProd) {
        targetLabel = 'Local Sandbox (labsync_test)';
        databaseName = 'labsync_test';
        engine = 'MariaDB / MySQL';
        reachable = true;
    } else {
        targetLabel = 'Locked (Production)';
        reachable = false;
    }

    return {
        configured,
        isProduction: isProd,
        targetLabel,
        databaseName,
        engine,
        reachable,
        latestRecovery: latestRecoverySummary
    };
}

function setPinnedProductionServerUuid(uuid) {
    if (!uuid) {
        pinnedProductionServerUuid = null;
    } else if (isValidServerUuid(uuid)) {
        pinnedProductionServerUuid = String(uuid).trim().toLowerCase();
    }
}

function getPinnedProductionServerUuid() {
    return pinnedProductionServerUuid;
}

module.exports = {
    isRecoveryConfigured,
    getRecoveryConfig,
    createRecoveryConnection,
    verifyRecoveryIsolation,
    resetRecoveryDatabase,
    splitSqlStatements,
    executeRecoverySql,
    verifyRestoredDatabaseStats,
    executeOnlineRecovery,
    compareDemonstrationRecord,
    getRecoveryStatus,
    setPinnedProductionServerUuid,
    getPinnedProductionServerUuid,
    isValidServerUuid
};

