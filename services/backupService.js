'use strict';

/**
 * services/backupService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17: Backup and Recovery Service.
 *
 * Provides:
 * 1. CLI binary detection (mariadb-dump / mysqldump & mariadb / mysql).
 * 2. Secure credential ingestion via ephemeral 0600 option files.
 * 3. Pre-stream verification of compressed archives (size, digest, SQL trailer).
 * 4. Production guard enforcing fail-closed isolation (restoration disabled on prod).
 * 5. Isolated sandbox restoration strictly targeting labsync_test.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const bcrypt = require('bcrypt');
const pool = require('../database/connection');
const auditService = require('./auditService');

// Windows XAMPP default binary location fallback
const WIN_XAMPP_BIN = 'C:\\xampp\\mysql\\bin';

/**
 * Checks whether a given binary exists in PATH or common Windows fallback directories.
 * @param {string} binaryName
 * @returns {string|null} Resolved executable path or command name, or null if missing.
 */
function resolveCliBinary(binaryName) {
    if (process.platform === 'win32') {
        const exeName = binaryName.endsWith('.exe') ? binaryName : `${binaryName}.exe`;
        const xamppPath = path.join(WIN_XAMPP_BIN, exeName);
        if (fs.existsSync(xamppPath)) {
            return xamppPath;
        }
    }
    return binaryName;
}

/**
 * Discovers and verifies the active database CLI dump utility.
 * @returns {Promise<{ available: boolean, dumpCmd: string|null, restoreCmd: string|null, version: string|null, error: string|null }>}
 */
async function verifyDatabaseTooling() {
    const candidateDumps = ['mariadb-dump', 'mysqldump'];
    const candidateRestores = ['mariadb', 'mysql'];

    let resolvedDump = null;
    let dumpVersion = null;

    for (const cmd of candidateDumps) {
        const resolved = resolveCliBinary(cmd);
        try {
            const version = await new Promise((resolve, reject) => {
                execFile(resolved, ['--version'], (err, stdout) => {
                    if (err) return reject(err);
                    resolve(stdout.trim());
                });
            });
            resolvedDump = resolved;
            dumpVersion = version;
            break;
        } catch (_) {
            // Try next candidate
        }
    }

    let resolvedRestore = null;
    for (const cmd of candidateRestores) {
        const resolved = resolveCliBinary(cmd);
        try {
            await new Promise((resolve, reject) => {
                execFile(resolved, ['--version'], (err) => {
                    if (err) return reject(err);
                    resolve(true);
                });
            });
            resolvedRestore = resolved;
            break;
        } catch (_) {
            // Try next candidate
        }
    }

    if (!resolvedDump) {
        return {
            available: false,
            dumpCmd: null,
            restoreCmd: null,
            version: null,
            error: 'Database dump CLI utility (mariadb-dump / mysqldump) was not found in PATH or standard runtime paths.'
        };
    }

    return {
        available: true,
        dumpCmd: resolvedDump,
        restoreCmd: resolvedRestore,
        version: dumpVersion,
        error: null
    };
}

/**
 * Checks whether the current runtime environment is considered Production.
 * Evaluates Railway platform variables, NODE_ENV, and database name identifiers.
 * @returns {boolean}
 */
function isProductionEnvironment() {
    if (process.env.NODE_ENV === 'production') return true;
    if (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_DEPLOYMENT_ID) return true;
    const dbName = String(process.env.DB_NAME || '').toLowerCase();
    if (dbName === 'labsync' || dbName === 'railway') return true;
    return false;
}

/**
 * Sanitizes error strings to remove credentials, passwords, and sensitive tokens
 * before recording to database history, console logs, or client responses.
 * @param {string} msg
 * @returns {string}
 */
function sanitizeErrorMessage(msg) {
    if (!msg || typeof msg !== 'string') return 'Unknown error';
    let clean = msg;

    // Redact active configured passwords if present
    const passwordsToRedact = [
        process.env.DB_PASSWORD,
        process.env.MYSQLPASSWORD,
        process.env.DB_RESTORE_PASSWORD
    ].filter(p => typeof p === 'string' && p.trim().length > 1);

    for (const secret of passwordsToRedact) {
        clean = clean.split(secret).join('[REDACTED]');
    }

    // Redact common CLI and SQL password patterns
    clean = clean.replace(/password\s*=\s*["'][^"']*["']/gi, 'password="[REDACTED]"');
    clean = clean.replace(/password\s*=\s*\S+/gi, 'password=[REDACTED]');
    clean = clean.replace(/identified\s+by\s+['"][^'"]*['"]/gi, 'IDENTIFIED BY "[REDACTED]"');
    clean = clean.replace(/-(?:p|password=)\S+/gi, '-p[REDACTED]');
    clean = clean.replace(/using password:\s*(?:YES|NO)/gi, 'using password: [PROTECTED]');

    return clean.slice(0, 1000).trim();
}

/**
 * Creates an ephemeral MySQL client option file (.cnf) with strict 0600 permissions.
 * Never exposes passwords via process arguments or unencrypted global environments.
 * @param {object} creds
 * @returns {{ tempDir: string, configPath: string }}
 */
function createSecureClientConfigFile({ host, port, user, password }) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labsync-sec-'));
    const configPath = path.join(tempDir, 'client.cnf');
    const escapedPassword = String(password || '').replace(/(["\\])/g, '\\$1');

    const configContent = [
        '[client]',
        `host = "${host}"`,
        `port = ${port || 3306}`,
        `user = "${user || 'root'}"`,
        `password = "${escapedPassword}"`,
        '',
        '[mariadb-dump]',
        `host = "${host}"`,
        `port = ${port || 3306}`,
        `user = "${user || 'root'}"`,
        `password = "${escapedPassword}"`,
        '',
        '[mysqldump]',
        `host = "${host}"`,
        `port = ${port || 3306}`,
        `user = "${user || 'root'}"`,
        `password = "${escapedPassword}"`,
        '',
        '[mariadb]',
        `host = "${host}"`,
        `port = ${port || 3306}`,
        `user = "${user || 'root'}"`,
        `password = "${escapedPassword}"`,
        '',
        '[mysql]',
        `host = "${host}"`,
        `port = ${port || 3306}`,
        `user = "${user || 'root'}"`,
        `password = "${escapedPassword}"`
    ].join('\n') + '\n';

    fs.writeFileSync(configPath, configContent, { mode: 0o600, encoding: 'utf8' });
    return { tempDir, configPath };
}

/**
 * Deletes a temporary configuration directory and its contents synchronously.
 * @param {string} tempDir
 */
function cleanupSecureTempDir(tempDir) {
    if (!tempDir) return;
    try {
        fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {
        // Suppress cleanup warning on already-removed dirs
    }
}

/**
 * Verifies that a generated backup archive is non-empty, computes its cryptographic
 * SHA-256 checksum, and strictly verifies that the decompressed SQL stream ends with
 * a standard MySQL/MariaDB completion marker (`-- Dump completed`).
 *
 * @param {string} archiveFilePath
 * @returns {Promise<{ fileSizeBytes: number, checksumSha256: string }>}
 */
async function verifyBackupArchiveIntegrity(archiveFilePath) {
    const stats = fs.statSync(archiveFilePath);
    if (stats.size === 0) {
        throw new Error('Generated backup archive is empty (0 bytes).');
    }

    // 1. Calculate SHA-256 checksum on the intact archive
    const checksumSha256 = await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(archiveFilePath);
        stream.on('error', reject);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });

    // 2. Decompress and verify standard SQL completion signature in trailer
    await new Promise((resolve, reject) => {
        const verifyStream = fs.createReadStream(archiveFilePath).pipe(zlib.createGunzip());
        let tailBuffer = '';
        verifyStream.on('data', (chunk) => {
            const text = chunk.toString('utf8');
            tailBuffer = (tailBuffer + text).slice(-4096); // Retain last 4KB
        });
        verifyStream.on('error', (err) => {
            reject(new Error(`Archive integrity verification failed (corrupt gzip): ${err.message}`));
        });
        verifyStream.on('end', () => {
            // Strictly match standard MySQL and MariaDB dump completion trailer:
            // e.g. "-- Dump completed on 2026-10-26 16:58:57" or "-- Dump completed"
            const hasCompletionMarker = /--\s+Dump completed/i.test(tailBuffer);
            if (!hasCompletionMarker) {
                return reject(new Error('Archive verification failed: missing SQL completion marker (-- Dump completed). The dump may be truncated or incomplete.'));
            }
            resolve();
        });
    });

    return {
        fileSizeBytes: stats.size,
        checksumSha256
    };
}

/**
 * Generates a verified compressed backup (.sql.gz) in a private staging location.
 * Does NOT stream to the client until the dump process completes with exit code 0
 * and archive integrity (size, SHA-256 digest, and trailer) is verified.
 *
 * @param {object} [options={}]
 * @param {string} [options.dbName] - Database to dump (defaults to active DB_NAME)
 * @returns {Promise<{ tempFilePath: string, filename: string, fileSizeBytes: number, checksumSha256: string, tableCount: number, cleanup: Function }>}
 */
async function generateVerifiedBackupFile(options = {}) {
    const tooling = await verifyDatabaseTooling();
    if (!tooling.available || !tooling.dumpCmd) {
        throw new Error(tooling.error || 'Database dump utility is unavailable.');
    }

    const host = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost';
    const port = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : (process.env.MYSQLPORT ? parseInt(process.env.MYSQLPORT, 10) : 3306);
    const user = process.env.DB_USER || process.env.MYSQLUSER || 'root';
    const password = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQLPASSWORD !== undefined ? process.env.MYSQLPASSWORD : '');
    const dbName = options.dbName || process.env.DB_NAME || process.env.MYSQLDATABASE || 'labsync';

    // Count tables in the database before dumping for metadata logging
    let tableCount = 0;
    try {
        const [tables] = await pool.query('SHOW TABLES');
        tableCount = tables.length;
    } catch (_) {
        // Fallback gracefully if counting fails
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestampStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `labsync_backup_${timestampStr}.sql.gz`;

    const { tempDir, configPath } = createSecureClientConfigFile({ host, port, user, password });
    const tempArchiveFile = path.join(tempDir, filename);

    // Cross-compatible CLI flags:
    // Omit --routines (fails on MySQL 8.0 because mysql.proc does not exist)
    // Omit --events (fails on cloud databases lacking global EVENT privilege)
    // Add --no-tablespaces (prevents PROCESS privilege errors on MySQL 5.7.31+ / 8.0+)
    // Include --triggers explicitly to preserve database triggers
    const dumpArgs = [
        `--defaults-extra-file=${configPath}`,
        '--single-transaction',
        '--quick',
        '--skip-lock-tables',
        '--no-tablespaces',
        '--triggers',
        '--hex-blob',
        '--max-allowed-packet=64M',
        '--default-character-set=utf8mb4',
        '--add-drop-table',
        dbName
    ];

    try {
        await new Promise((resolve, reject) => {
            const dumpProc = spawn(tooling.dumpCmd, dumpArgs, {
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });

            const gzip = zlib.createGzip({ level: 6 });
            const outStream = fs.createWriteStream(tempArchiveFile, { mode: 0o600 });

            let stdErrOutput = '';
            let dumpExitCode = null;
            let streamFinished = false;
            let settled = false;

            // Configurable timeout bounded between 5s and 300s (default 60s)
            const configuredDumpTimeout = parseInt(process.env.DB_DUMP_TIMEOUT_MS, 10);
            const DUMP_TIMEOUT_MS = (!isNaN(configuredDumpTimeout) && configuredDumpTimeout >= 5000)
                ? Math.min(configuredDumpTimeout, 300000)
                : 60000;
            const timeoutTimer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    try { dumpProc.kill('SIGKILL'); } catch (_) { }
                    gzip.destroy();
                    outStream.destroy();
                    reject(new Error(`Database dump process timed out after ${DUMP_TIMEOUT_MS}ms`));
                }
            }, DUMP_TIMEOUT_MS);

            function checkDone() {
                if (settled) return;
                if (dumpExitCode !== null && streamFinished) {
                    settled = true;
                    clearTimeout(timeoutTimer);
                    if (dumpExitCode !== 0) {
                        const sanitizedStderr = sanitizeErrorMessage(stdErrOutput);
                        console.error(`[BackupService] Database dump process failed: exitCode=${dumpExitCode} stderr="${sanitizedStderr}"`);
                        return reject(new Error(`Dump process exited with code ${dumpExitCode}: ${sanitizedStderr || 'Unknown error'}`));
                    }
                    resolve();
                }
            }

            dumpProc.stderr.on('data', (d) => {
                stdErrOutput += d.toString();
            });

            dumpProc.on('error', (err) => {
                if (settled) return;
                settled = true;
                gzip.destroy();
                outStream.destroy();
                const sanitizedSpawnErr = sanitizeErrorMessage(err.message);
                console.error(`[BackupService] Database dump spawn error: ${sanitizedSpawnErr}`);
                reject(new Error(`Dump process spawn error: ${sanitizedSpawnErr}`));
            });

            dumpProc.on('close', (code) => {
                dumpExitCode = code;
                checkDone();
            });

            gzip.on('error', (err) => {
                if (settled) return;
                settled = true;
                outStream.destroy();
                reject(new Error(`Compression error: ${err.message}`));
            });

            outStream.on('error', (err) => {
                if (settled) return;
                settled = true;
                reject(new Error(`Temporary archive write error: ${err.message}`));
            });

            outStream.on('finish', () => {
                streamFinished = true;
                checkDone();
            });

            dumpProc.stdout.pipe(gzip).pipe(outStream);
        });

        // Verify archive integrity (size, SHA-256 digest, and strict SQL completion marker)
        const { fileSizeBytes, checksumSha256 } = await verifyBackupArchiveIntegrity(tempArchiveFile);

        return {
            tempFilePath: tempArchiveFile,
            filename,
            fileSizeBytes,
            checksumSha256,
            tableCount,
            cleanup: () => cleanupSecureTempDir(tempDir)
        };
    } catch (err) {
        cleanupSecureTempDir(tempDir);
        throw err;
    }
}

/**
 * Streams a verified backup directly to an Express HTTP response.
 * Records metadata in backup_history upon verified transfer completion.
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @returns {Promise<void>}
 */
async function streamBackupToResponse(req, res) {
    const actorEmail = req.session ? (req.session.userEmail || req.session.email) : 'system';
    const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || null;

    let backupFile = null;

    try {
        backupFile = await generateVerifiedBackupFile();

        res.writeHead(200, {
            'Content-Type': 'application/gzip',
            'Content-Disposition': `attachment; filename="${backupFile.filename}"`,
            'Content-Length': backupFile.fileSizeBytes,
            'Cache-Control': 'no-store, no-cache, must-revalidate, private',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Content-Type-Options': 'nosniff',
            'X-Backup-Checksum': backupFile.checksumSha256,
            'Access-Control-Expose-Headers': 'Content-Disposition, X-Backup-Checksum'
        });

        const fileStream = fs.createReadStream(backupFile.tempFilePath);
        let transferCompleted = false;

        res.on('finish', async () => {
            transferCompleted = true;
            try {
                await pool.query(
                    `INSERT INTO backup_history (
                        Filename, Trigger_Type, Status, File_Size_Bytes, Table_Count, 
                        Checksum_SHA256, Executed_By_Email, IP_Address
                     ) VALUES (?, 'MANUAL', 'SUCCESS', ?, ?, ?, ?, ?)`,
                    [
                        backupFile.filename,
                        backupFile.fileSizeBytes,
                        backupFile.tableCount,
                        backupFile.checksumSha256,
                        actorEmail,
                        ipAddress
                    ]
                );

                await auditService.logSecurityEvent({
                    req,
                    action: 'DATABASE_BACKUP_CREATED',
                    resourceType: 'DATABASE',
                    details: {
                        filename: backupFile.filename,
                        sizeBytes: backupFile.fileSizeBytes,
                        checksumSha256: backupFile.checksumSha256,
                        tableCount: backupFile.tableCount
                    },
                    result: 'SUCCESS'
                });
            } catch (dbErr) {
                console.error('[BackupService] Failed to record successful backup history:', dbErr.message);
            } finally {
                if (backupFile && backupFile.cleanup) backupFile.cleanup();
            }
        });

        req.on('close', async () => {
            if (!transferCompleted) {
                fileStream.destroy();
                try {
                    await pool.query(
                        `INSERT INTO backup_history (
                            Filename, Trigger_Type, Status, File_Size_Bytes, Table_Count, 
                            Checksum_SHA256, Error_Message, Executed_By_Email, IP_Address
                         ) VALUES (?, 'MANUAL', 'FAILED', ?, ?, ?, 'Client transfer interrupted or connection aborted', ?, ?)`,
                        [
                            backupFile.filename,
                            backupFile.fileSizeBytes,
                            backupFile.tableCount,
                            backupFile.checksumSha256,
                            actorEmail,
                            ipAddress
                        ]
                    );
                } catch (_) { }
                if (backupFile && backupFile.cleanup) backupFile.cleanup();
            }
        });

        fileStream.pipe(res);
    } catch (err) {
        if (backupFile && backupFile.cleanup) backupFile.cleanup();

        const sanitizedErr = sanitizeErrorMessage(err.message);
        console.error(`[BackupService] Backup generation failed: operation=streamBackupToResponse error="${sanitizedErr}" actor=${actorEmail} ip=${ipAddress}`);

        try {
            await pool.query(
                `INSERT INTO backup_history (
                    Filename, Trigger_Type, Status, Error_Message, Executed_By_Email, IP_Address
                 ) VALUES ('failed_backup', 'MANUAL', 'FAILED', ?, ?, ?)`,
                [sanitizedErr.slice(0, 1000), actorEmail, ipAddress]
            );
        } catch (dbErr) {
            console.error('[BackupService] Failed to record backup failure to backup_history:', dbErr.message);
        }

        if (!res.headersSent) {
            res.status(500).json({
                error: sanitizedErr || 'Backup generation failed',
                details: sanitizedErr || 'Backup generation failed',
                code: 'BACKUP_FAILED'
            });
        }
    }
}

/**
 * Validates the restoration safety invariants.
 * Enforces strict fail-closed isolation.
 * @returns {object} Verified restore configuration
 */
function getVerifiedRestoreConfig() {
    // 1. Production Lockout: Restoration is permanently blocked on production
    if (isProductionEnvironment()) {
        const err = new Error('RESTORE_BLOCKED_ON_PRODUCTION: Database restoration is permanently disabled on the production deployment.');
        err.code = 'RESTORE_BLOCKED_ON_PRODUCTION';
        throw err;
    }

    // 2. Explicit Demonstration Flag: Must be explicitly enabled in local test environment
    if (process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO !== 'true') {
        const err = new Error('RESTORE_NOT_AUTHORIZED: Restoration rejected: ALLOW_RESTORE_FOR_LOCAL_DEMO is not enabled.');
        err.code = 'RESTORE_NOT_AUTHORIZED';
        throw err;
    }

    // 3. Explicit Target Database Verification
    const expectedTarget = 'labsync_test';
    const configuredTarget = process.env.RESTORE_TARGET_DATABASE || process.env.DB_NAME;

    if (configuredTarget !== expectedTarget) {
        const err = new Error(`INVALID_RESTORE_TARGET: Restoration rejected: Restoration is permitted exclusively on '${expectedTarget}'. Configured: '${configuredTarget}'.`);
        err.code = 'INVALID_RESTORE_TARGET';
        throw err;
    }

    // 4. Dedicated Restricted Account Credentials Check
    // Support either DB_RESTORE_USER or DEMO_RESTORE_DB_USER to accommodate deployment conventions
    const restoreUser = process.env.DB_RESTORE_USER || process.env.DEMO_RESTORE_DB_USER;
    const restorePassword = process.env.DB_RESTORE_PASSWORD !== undefined 
        ? process.env.DB_RESTORE_PASSWORD 
        : (process.env.DEMO_RESTORE_DB_PASSWORD !== undefined ? process.env.DEMO_RESTORE_DB_PASSWORD : '');

    if (!restoreUser || restoreUser.toLowerCase() === 'root') {
        const err = new Error('RESTORE_CREDENTIALS_MISSING: Restoration rejected: Dedicated non-root DB_RESTORE_USER (or DEMO_RESTORE_DB_USER) restricted strictly to labsync_test must be configured.');
        err.code = 'RESTORE_CREDENTIALS_MISSING';
        throw err;
    }

    return {
        host: process.env.DB_RESTORE_HOST || process.env.DEMO_RESTORE_DB_HOST || process.env.DB_HOST || 'localhost',
        port: process.env.DB_RESTORE_PORT 
            ? parseInt(process.env.DB_RESTORE_PORT, 10) 
            : (process.env.DEMO_RESTORE_DB_PORT ? parseInt(process.env.DEMO_RESTORE_DB_PORT, 10) : (process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306)),
        user: restoreUser,
        password: restorePassword,
        database: expectedTarget
    };
}

/**
 * Restores a provided backup stream into the isolated test database (labsync_test).
 * Executes using a temporary restricted option file (0600) and native import client.
 *
 * @param {ReadableStream|string} sqlSource - File path or Readable stream of SQL/.sql.gz
 * @param {object} [options={}]
 * @param {string} [options.actorEmail] - Administrator email initiating restore
 * @param {boolean} [options.isGzip=true] - Whether the source is gzipped
 * @returns {Promise<{ success: boolean, targetDatabase: string, restoredAt: string }>}
 */
async function restoreToTestDatabase(sqlSource, options = {}) {
    const restoreConfig = getVerifiedRestoreConfig();
    const tooling = await verifyDatabaseTooling();

    if (!tooling.available || !tooling.restoreCmd) {
        throw new Error('Database import client (mariadb / mysql) is not available.');
    }

    const { tempDir, configPath } = createSecureClientConfigFile({
        host: restoreConfig.host,
        port: restoreConfig.port,
        user: restoreConfig.user,
        password: restoreConfig.password
    });

    const restoreArgs = [
        `--defaults-extra-file=${configPath}`,
        '--default-character-set=utf8mb4',
        restoreConfig.database
    ];

    // 1. Verify archive format (gzip magic bytes) if reading from a file path
    const isGzip = options.isGzip !== false;
    if (typeof sqlSource === 'string' && isGzip) {
        const stats = fs.statSync(sqlSource);
        if (stats.size < 2) {
            const err = new Error('INVALID_ARCHIVE_FORMAT: Uploaded backup archive is invalid or empty.');
            err.code = 'INVALID_ARCHIVE_FORMAT';
            throw err;
        }
        const magic = Buffer.alloc(2);
        const fd = fs.openSync(sqlSource, 'r');
        fs.readSync(fd, magic, 0, 2, 0);
        fs.closeSync(fd);
        if (magic[0] !== 0x1f || magic[1] !== 0x8b) {
            const err = new Error('INVALID_ARCHIVE_FORMAT: Expected a gzip-compressed backup archive (.sql.gz).');
            err.code = 'INVALID_ARCHIVE_FORMAT';
            throw err;
        }
    }

    // 2. Require and verify SHA-256 integrity against expectedChecksum
    if (!options.expectedChecksum || typeof options.expectedChecksum !== 'string' || !options.expectedChecksum.trim()) {
        const err = new Error('CHECKSUM_REQUIRED: Expected archive SHA-256 checksum is required to verify backup integrity before restoration.');
        err.code = 'CHECKSUM_REQUIRED';
        throw err;
    }

    if (typeof sqlSource === 'string') {
        const actualChecksum = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(sqlSource);
            stream.on('error', reject);
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });
        if (actualChecksum.toLowerCase() !== String(options.expectedChecksum).trim().toLowerCase()) {
            const err = new Error(`CHECKSUM_MISMATCH: Uploaded archive SHA-256 digest (${actualChecksum}) does not match expected checksum (${options.expectedChecksum}). Restoration aborted.`);
            err.code = 'CHECKSUM_MISMATCH';
            throw err;
        }
    }

    try {
        await new Promise((resolve, reject) => {
            const clientProc = spawn(tooling.restoreCmd, restoreArgs, {
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdErr = '';
            let settled = false;

            // Configurable timeout bounded between 5s and 300s (default 60s)
            const configuredRestoreTimeout = parseInt(process.env.DB_RESTORE_TIMEOUT_MS, 10);
            const RESTORE_TIMEOUT_MS = (!isNaN(configuredRestoreTimeout) && configuredRestoreTimeout >= 5000)
                ? Math.min(configuredRestoreTimeout, 300000)
                : 60000;
            const timeoutTimer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    try { clientProc.kill('SIGKILL'); } catch (_) { }
                    reject(new Error(`Database restore process timed out after ${RESTORE_TIMEOUT_MS}ms`));
                }
            }, RESTORE_TIMEOUT_MS);

            clientProc.stderr.on('data', d => { stdErr += d.toString(); });

            clientProc.on('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                reject(new Error(`Client process spawn error: ${err.message}`));
            });

            clientProc.on('close', (code) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                if (code !== 0) {
                    return reject(new Error(`Database restore process failed with code ${code}: ${stdErr || 'Unknown error'}`));
                }
                resolve();
            });

            // Write FOREIGN_KEY_CHECKS toggle into standard input stream
            clientProc.stdin.write('/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n');

            let inputStream;
            if (typeof sqlSource === 'string') {
                inputStream = fs.createReadStream(sqlSource);
            } else {
                inputStream = sqlSource;
            }

            const isGzip = options.isGzip !== false;
            let streamPipeline;

            if (isGzip) {
                const gunzip = zlib.createGunzip();
                gunzip.on('error', err => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutTimer);
                    clientProc.stdin.destroy();
                    reject(new Error(`Archive decompression error: ${err.message}`));
                });
                streamPipeline = inputStream.pipe(gunzip);
            } else {
                streamPipeline = inputStream;
            }

            // Enforce maximum decompressed limit (250MB) to prevent decompression bombs
            const MAX_DECOMPRESSED_BYTES = 250 * 1024 * 1024;
            let decompressedBytes = 0;

            streamPipeline.on('data', chunk => {
                decompressedBytes += chunk.length;
                if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeoutTimer);
                    clientProc.stdin.destroy();
                    reject(new Error('Decompressed archive exceeded safety limit of 250MB (decompression bomb protection).'));
                    return;
                }
                if (!clientProc.stdin.destroyed) {
                    clientProc.stdin.write(chunk);
                }
            });

            streamPipeline.on('end', () => {
                if (!clientProc.stdin.destroyed) {
                    clientProc.stdin.write('\n/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n');
                    clientProc.stdin.end();
                }
            });

            streamPipeline.on('error', err => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                clientProc.stdin.destroy();
                reject(err);
            });
        });

        const restoredAt = new Date().toISOString();
        const actorEmail = options.actorEmail || 'admin@labsync.local';

        // Platform stdout log for operational tracking (survives MySQL table replacement)
        console.log(`[AUDIT_EVENT] Action=DATABASE_RESTORE_COMPLETED TargetDB=${restoreConfig.database} Actor=${actorEmail} RestoredAt=${restoredAt}`);

        // Insert audit log into the freshly restored database
        try {
            const [tables] = await pool.query('SHOW TABLES');
            await pool.query(
                `INSERT INTO audit_logs (Actor_Email, Actor_Role, Action, Resource_Type, Resource_ID, Details, Result)
                 VALUES (?, 'IT Dept. Head', 'DATABASE_RESTORE_COMPLETED', 'DATABASE', ?, ?, 'SUCCESS')`,
                [
                    actorEmail,
                    restoreConfig.database,
                    JSON.stringify({ restoredAt, tableCount: tables.length, targetDatabase: restoreConfig.database })
                ]
            );
        } catch (auditErr) {
            console.error('[BackupService] Could not insert post-restore audit log:', auditErr.message);
        }

        return {
            success: true,
            targetDatabase: restoreConfig.database,
            restoredAt
        };
    } catch (err) {
        console.error(`[AUDIT_EVENT] Action=DATABASE_RESTORE_FAILED TargetDB=${restoreConfig.database} Actor=${options.actorEmail || 'unknown'} Error=${err.message}`);
        try {
            await pool.query(
                `INSERT INTO audit_logs (Actor_Email, Actor_Role, Action, Resource_Type, Resource_ID, Details, Result)
                 VALUES (?, 'IT Dept. Head', 'DATABASE_RESTORE_FAILED', 'DATABASE', ?, ?, 'FAILED')`,
                [
                    options.actorEmail || 'unknown',
                    restoreConfig.database,
                    JSON.stringify({ error: err.message, targetDatabase: restoreConfig.database })
                ]
            );
        } catch (_) { }
        throw err;
    } finally {
        cleanupSecureTempDir(tempDir);
    }
}

/**
 * Returns administrative status metadata for UI display.
 * @returns {Promise<object>}
 */
async function getBackupStatus() {
    const isProd = isProductionEnvironment();
    const tooling = await verifyDatabaseTooling();

    let latestBackup = null;
    let recentBackups = [];
    try {
        const [rows] = await pool.query(
            'SELECT Backup_ID, Filename, Status, File_Size_Bytes, Table_Count, Checksum_SHA256, Error_Message, Created_At FROM backup_history ORDER BY Created_At DESC LIMIT 1'
        );
        if (rows && rows.length > 0) {
            latestBackup = {
                ...rows[0],
                Error_Message: rows[0].Error_Message ? sanitizeErrorMessage(rows[0].Error_Message) : null
            };
        }
        const [recentRows] = await pool.query(
            'SELECT Filename, Checksum_SHA256 FROM backup_history WHERE Status = "SUCCESS" AND Checksum_SHA256 IS NOT NULL ORDER BY Created_At DESC LIMIT 20'
        );
        recentBackups = recentRows || [];
    } catch (err) {
        console.error('[BackupService] Failed to fetch latest backup status from backup_history:', err.message);
    }

    return {
        isProduction: isProd,
        restoreAvailable: !isProd && process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO === 'true',
        toolingAvailable: tooling.available,
        toolingVersion: tooling.version,
        activeDatabase: process.env.DB_NAME || process.env.MYSQLDATABASE || 'labsync',
        targetRestoreDatabase: process.env.RESTORE_TARGET_DATABASE || 'labsync_test',
        latestBackup,
        recentBackups
    };
}

module.exports = {
    sanitizeErrorMessage,
    verifyDatabaseTooling,
    isProductionEnvironment,
    createSecureClientConfigFile,
    cleanupSecureTempDir,
    verifyBackupArchiveIntegrity,
    generateVerifiedBackupFile,
    streamBackupToResponse,
    getVerifiedRestoreConfig,
    restoreToTestDatabase,
    getBackupStatus
};
