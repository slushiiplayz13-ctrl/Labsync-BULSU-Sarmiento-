'use strict';

/**
 * services/restoreService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17: Database Sandbox Restoration Service.
 *
 * Implements:
 * 1. Permanent fail-closed production lockout (restoration disabled on production).
 * 2. Dedicated local sandbox destination strictly hardcoded to `labsync_test`.
 * 3. Dedicated restricted database account `labsync_restore_test@localhost`.
 * 4. Native XAMPP MySQL client execution (C:\xampp\mysql\bin\mysql.exe) via spawn(shell: false).
 * 5. Ephemeral option file with restrictive Windows ACL permissions.
 * 6. Bounded archive validation (50MB compressed / 250MB decompressed bomb guard).
 * 7. Prohibited administrative SQL statement & cross-engine collation detection.
 * 8. Non-atomic failure handling and comprehensive audit logging.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');
const auditService = require('./auditService');

// Windows XAMPP default binary location
const WIN_XAMPP_BIN = 'C:\\xampp\\mysql\\bin';
const FIXED_TARGET_DATABASE = 'labsync_test';
const FIXED_TARGET_HOST = '127.0.0.1';
const FIXED_TARGET_PORT = 3306;

const MAX_COMPRESSED_BYTES = 50 * 1024 * 1024;    // 50 MB
const MAX_DECOMPRESSED_BYTES = 250 * 1024 * 1024; // 250 MB
const RESTORE_TIMEOUT_MS = 120 * 1000;            // 2 minutes

/**
 * Determines whether the current runtime environment is considered Production.
 * Evaluates Railway platform variables, NODE_ENV, and host identifiers.
 * @returns {boolean}
 */
function isProductionEnvironment() {
    if (process.env.NODE_ENV === 'production') return true;
    if (process.env.RAILWAY_ENVIRONMENT_NAME ||
        process.env.RAILWAY_ENVIRONMENT ||
        process.env.RAILWAY_PROJECT_ID ||
        process.env.RAILWAY_SERVICE_ID ||
        process.env.RAILWAY_DEPLOYMENT_ID) {
        return true;
    }
    const host = String(process.env.DB_HOST || '').toLowerCase();
    if (host.includes('railway') || host.includes('rlwy') || host.includes('.internal')) {
        return true;
    }
    return false;
}

/**
 * Resolves the native mysql.exe CLI binary path.
 * @returns {string}
 */
function resolveClientBinary() {
    if (process.platform === 'win32') {
        const xamppPath = path.join(WIN_XAMPP_BIN, 'mysql.exe');
        if (fs.existsSync(xamppPath)) {
            return xamppPath;
        }
    }
    return 'mysql';
}

/**
 * Validates and retrieves safe restoration parameters.
 * Enforces production lockout, local sandbox destination, and dedicated account.
 * @returns {object}
 */
function getVerifiedRestoreConfig() {
    // 1. Permanent Fail-Closed Production Lockout
    if (isProductionEnvironment()) {
        const err = new Error('RESTORE_BLOCKED_ON_PRODUCTION: Database restoration is permanently disabled on the production deployment.');
        err.code = 'RESTORE_BLOCKED_ON_PRODUCTION';
        throw err;
    }

    // 2. Explicit Demonstration Flag Check
    if (process.env.ALLOW_RESTORE_FOR_LOCAL_DEMO !== 'true') {
        const err = new Error('RESTORE_NOT_AUTHORIZED: Restoration rejected: ALLOW_RESTORE_FOR_LOCAL_DEMO is not enabled.');
        err.code = 'RESTORE_NOT_AUTHORIZED';
        throw err;
    }

    // 3. Strict Target Database Check (Must not target labsync or external database)
    const configuredTarget = process.env.RESTORE_TARGET_DATABASE || FIXED_TARGET_DATABASE;
    if (configuredTarget !== FIXED_TARGET_DATABASE) {
        const err = new Error(`INVALID_RESTORE_TARGET: Restoration rejected: Restoration is permitted exclusively on '${FIXED_TARGET_DATABASE}'. Configured: '${configuredTarget}'.`);
        err.code = 'INVALID_RESTORE_TARGET';
        throw err;
    }

    // 4. Dedicated Restricted Account Credentials Check
    const restoreUser = process.env.DB_RESTORE_USER || 'labsync_restore_test';
    const restorePassword = process.env.DB_RESTORE_PASSWORD !== undefined ? process.env.DB_RESTORE_PASSWORD : '';

    if (!restoreUser || restoreUser.toLowerCase() === 'root') {
        const err = new Error('RESTORE_CREDENTIALS_MISSING: Restoration rejected: Dedicated non-root restoration account restricted strictly to labsync_test must be configured.');
        err.code = 'RESTORE_CREDENTIALS_MISSING';
        throw err;
    }

    // 5. Native Client Discovery Check
    const clientBin = resolveClientBinary();
    if (process.platform === 'win32' && !fs.existsSync(clientBin)) {
        const err = new Error(`CLIENT_BINARY_NOT_FOUND: Native MySQL client executable not found at: ${clientBin}`);
        err.code = 'CLIENT_BINARY_NOT_FOUND';
        throw err;
    }

    return {
        clientBin,
        host: FIXED_TARGET_HOST,
        port: FIXED_TARGET_PORT,
        user: restoreUser,
        password: restorePassword,
        database: FIXED_TARGET_DATABASE
    };
}

/**
 * Sanitizes command output and error messages to prevent credential leakage.
 * @param {string} msg
 * @returns {string}
 */
function sanitizeErrorMessage(msg) {
    if (!msg || typeof msg !== 'string') return '';
    return msg
        .replace(/password\s*=\s*["'][^"']*["']/gi, 'password="[REDACTED]"')
        .replace(/identified\s+by\s+["'][^"']*["']/gi, 'identified by "[REDACTED]"')
        .replace(/--password=[^\s]*/gi, '--password=[REDACTED]')
        .replace(/-p[^\s]*/gi, '-p[REDACTED]')
        .replace(/defaults-extra-file=[^\s]*/gi, 'defaults-extra-file=[REDACTED]');
}

/**
 * Creates an ephemeral MySQL client option file protected by restrictive Windows ACL permissions.
 *
 * @param {object} creds
 * @returns {{ tempDir: string, configPath: string }}
 */
function createSecureClientConfigFile(creds) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labsync-restore-cnf-'));
    const configPath = path.join(tempDir, 'restore_client.cnf');

    const escapedPassword = String(creds.password || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const content = `[client]
host = ${FIXED_TARGET_HOST}
port = ${FIXED_TARGET_PORT}
user = "${creds.user}"
password = "${escapedPassword}"
`;

    fs.writeFileSync(configPath, content, { mode: 0o600 });

    // Enforce restrictive Windows ACLs: strip inherited permissions and grant only to current user
    if (process.platform === 'win32' && process.env.USERNAME) {
        try {
            execFileSync('icacls.exe', [
                configPath,
                '/inheritance:r',
                '/grant:r',
                `${process.env.USERNAME}:(R,W)`
            ], { stdio: 'pipe' });
        } catch (aclErr) {
            console.warn('[RestoreService] Warning: Failed to apply explicit Windows ACL to option file:', aclErr.message);
        }
    }

    // Verify current process readability
    try {
        fs.accessSync(configPath, fs.constants.R_OK);
    } catch (readErr) {
        throw new Error(`Secure client option file is unreadable by current process: ${readErr.message}`);
    }

    return { tempDir, configPath };
}

/**
 * Safely removes ephemeral option file directory.
 * @param {string} tempDir
 */
function cleanupSecureTempDir(tempDir) {
    if (tempDir && fs.existsSync(tempDir)) {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

/**
 * Comprehensive pre-import validation of the uploaded .sql.gz backup archive.
 *
 * Checks:
 * 1. File existence and compressed size bounds (<= 50MB).
 * 2. Gzip magic bytes (0x1F, 0x8B).
 * 3. SHA-256 integrity calculation against exact compressed bytes.
 * 4. Decompression bomb bounds (<= 250MB).
 * 5. Prohibited administrative statements (CREATE DATABASE, USE, GRANT, etc.).
 * 6. Incompatible cross-engine collations (MySQL 9 utf8mb4_0900_ai_ci into MariaDB 10.4).
 * 7. Authoritative SQL completion trailer (-- Dump completed on YYYY-MM-DD HH:MM:SS).
 *
 * @param {string} archivePath
 * @param {string} expectedChecksum
 * @returns {Promise<{ valid: boolean, checksum: string, decompressedBytes: number }>}
 */
async function validateRestoreArchive(archivePath, expectedChecksum) {
    // 1. Expected checksum format validation
    if (!expectedChecksum || typeof expectedChecksum !== 'string') {
        const err = new Error('Archive integrity verification failed: SHA-256 checksum is required (X-Backup-Checksum header).');
        err.code = 'CHECKSUM_REQUIRED';
        throw err;
    }

    const cleanExpectedChecksum = expectedChecksum.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(cleanExpectedChecksum)) {
        const err = new Error('Invalid SHA-256 checksum format. Checksum must be a 64-character hexadecimal digest.');
        err.code = 'INVALID_CHECKSUM_FORMAT';
        throw err;
    }

    // 2. Existence and compressed file size check
    if (!fs.existsSync(archivePath)) {
        const err = new Error('Backup archive file not found on disk.');
        err.code = 'ARCHIVE_NOT_FOUND';
        throw err;
    }

    const stats = fs.statSync(archivePath);
    if (stats.size === 0) {
        const err = new Error('Uploaded backup archive is empty (0 bytes).');
        err.code = 'EMPTY_ARCHIVE';
        throw err;
    }

    if (stats.size > MAX_COMPRESSED_BYTES) {
        const err = new Error(`Uploaded archive exceeds maximum permitted size of ${MAX_COMPRESSED_BYTES / (1024 * 1024)}MB.`);
        err.code = 'ARCHIVE_TOO_LARGE';
        throw err;
    }

    // 3. Gzip magic header bytes check
    const headerBuf = Buffer.alloc(2);
    const fd = fs.openSync(archivePath, 'r');
    fs.readSync(fd, headerBuf, 0, 2, 0);
    fs.closeSync(fd);

    if (headerBuf[0] !== 0x1f || headerBuf[1] !== 0x8b) {
        const err = new Error('Invalid archive format. Only gzip-compressed backup archives (.sql.gz) are supported for restoration.');
        err.code = 'INVALID_ARCHIVE_FORMAT';
        throw err;
    }

    // 4. Calculate SHA-256 across exact compressed archive bytes
    const calculatedChecksum = await new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(archivePath);
        stream.on('error', reject);
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
    });

    if (calculatedChecksum.toLowerCase() !== cleanExpectedChecksum) {
        const err = new Error('Uploaded archive SHA-256 integrity check failed. The archive digest did not match the supplied checksum. Restoration aborted.');
        err.code = 'CHECKSUM_MISMATCH';
        err.expectedChecksum = cleanExpectedChecksum;
        err.actualChecksum = calculatedChecksum;
        throw err;
    }

    // 5. Streaming decompression & SQL content inspection
    const FORBIDDEN_SQL_PATTERNS = [
        { pattern: /\bCREATE\s+DATABASE\b/i, name: 'CREATE DATABASE' },
        { pattern: /\bDROP\s+DATABASE\b/i, name: 'DROP DATABASE' },
        { pattern: /\bALTER\s+DATABASE\b/i, name: 'ALTER DATABASE' },
        { pattern: /\bUSE\s+[`'"]?[a-zA-Z0-9_]+/i, name: 'USE statement' },
        { pattern: /\bCREATE\s+USER\b/i, name: 'CREATE USER' },
        { pattern: /\bDROP\s+USER\b/i, name: 'DROP USER' },
        { pattern: /\bALTER\s+USER\b/i, name: 'ALTER USER' },
        { pattern: /\bGRANT\s+/i, name: 'GRANT' },
        { pattern: /\bREVOKE\s+/i, name: 'REVOKE' },
        { pattern: /\bSET\s+GLOBAL\b/i, name: 'SET GLOBAL' },
        { pattern: /\bSET\s+PERSIST\b/i, name: 'SET PERSIST' },
        { pattern: /\bLOAD\s+DATA\s+LOCAL\s+INFILE\b/i, name: 'LOAD DATA LOCAL INFILE' },
        { pattern: /\bSELECT\s+.*?\s+INTO\s+(OUTFILE|DUMPFILE)\b/i, name: 'SELECT INTO OUTFILE' }
    ];

    const INCOMPATIBLE_COLLATIONS = [
        /utf8mb4_0900_ai_ci/i,
        /utf8mb4_0900_as_cs/i,
        /utf8mb4_0900_bin/i
    ];

    let totalDecompressedBytes = 0;
    let trailingBuffer = '';

    await new Promise((resolve, reject) => {
        const gunzip = zlib.createGunzip();
        const fileStream = fs.createReadStream(archivePath);

        let settled = false;
        function fail(err) {
            if (settled) return;
            settled = true;
            try { fileStream.destroy(); } catch (_) {}
            try { gunzip.destroy(); } catch (_) {}
            reject(err);
        }

        fileStream.on('error', fail);
        gunzip.on('error', fail);

        gunzip.on('data', chunk => {
            totalDecompressedBytes += chunk.length;
            if (totalDecompressedBytes > MAX_DECOMPRESSED_BYTES) {
                const err = new Error(`Decompressed archive exceeded safety limit of ${MAX_DECOMPRESSED_BYTES / (1024 * 1024)}MB (decompression bomb protection).`);
                err.code = 'DECOMPRESSION_BOMB_LIMIT_EXCEEDED';
                return fail(err);
            }

            const text = chunk.toString('utf8');
            trailingBuffer = (trailingBuffer + text).slice(-2048);

            // Check forbidden administrative SQL statements
            for (const item of FORBIDDEN_SQL_PATTERNS) {
                if (item.pattern.test(text)) {
                    const err = new Error(`Restoration rejected: Archive contains prohibited administrative SQL statement (${item.name}).`);
                    err.code = 'FORBIDDEN_SQL_STATEMENT';
                    return fail(err);
                }
            }

            // Check incompatible MySQL 9 collations
            for (const colRegex of INCOMPATIBLE_COLLATIONS) {
                if (colRegex.test(text)) {
                    const err = new Error('Restoration rejected: Archive contains MySQL 9-specific collation (utf8mb4_0900_ai_ci) which is incompatible with local MariaDB 10.4 sandbox.');
                    err.code = 'INCOMPATIBLE_COLLATION';
                    return fail(err);
                }
            }
        });

        gunzip.on('end', () => {
            if (settled) return;
            // Verify authoritative completion trailer
            if (!trailingBuffer.includes('-- Dump completed on ')) {
                const err = new Error('Archive verification failed: Missing authoritative SQL completion marker (-- Dump completed on YYYY-MM-DD HH:MM:SS).');
                err.code = 'INVALID_ARCHIVE_TRAILER';
                return fail(err);
            }
            settled = true;
            resolve();
        });

        fileStream.pipe(gunzip);
    });

    return {
        valid: true,
        checksum: calculatedChecksum,
        decompressedBytes: totalDecompressedBytes
    };
}

/**
 * Restores a validated backup archive into the isolated test sandbox (labsync_test)
 * using the native XAMPP MySQL client executable.
 *
 * @param {string} archivePath
 * @param {object} [options]
 * @returns {Promise<{ success: boolean, targetDatabase: string, restoredAt: string }>}
 */
async function executeSandboxRestore(archivePath, options = {}) {
    const config = getVerifiedRestoreConfig();
    const { tempDir, configPath } = createSecureClientConfigFile(config);

    const actorEmail = options.actorEmail || 'admin@labsync.local';

    try {
        const clientArgs = [
            `--defaults-extra-file=${configPath}`,
            '--binary-mode',
            '--local-infile=0',
            '--batch',
            '--silent',
            FIXED_TARGET_DATABASE
        ];

        const restoreResult = await new Promise((resolve, reject) => {
            let settled = false;
            let stderrOutput = '';

            const clientProc = spawn(config.clientBin, clientArgs, {
                shell: false,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            const timeoutTimer = setTimeout(() => {
                if (settled) return;
                settled = true;
                clientProc.kill('SIGTERM');
                setTimeout(() => {
                    try { clientProc.kill('SIGKILL'); } catch (_) {}
                }, 2000);
                const err = new Error(`Database restoration timed out after ${RESTORE_TIMEOUT_MS / 1000} seconds.`);
                err.code = 'RESTORE_TIMEOUT';
                reject(err);
            }, RESTORE_TIMEOUT_MS);

            clientProc.stderr.on('data', chunk => {
                stderrOutput += chunk.toString('utf8');
            });

            clientProc.on('error', err => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                reject(new Error(`Failed to spawn native MySQL client: ${err.message}`));
            });

            clientProc.on('close', code => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);

                if (code === 0) {
                    resolve(true);
                } else {
                    const sanitizedErr = sanitizeErrorMessage(stderrOutput.trim());
                    const err = new Error(`Native MySQL client exited with code ${code}. ${sanitizedErr || 'No error output reported.'}`);
                    err.code = 'RESTORE_PROCESS_FAILED';
                    err.exitCode = code;
                    reject(err);
                }
            });

            // Stream decompressed SQL directly into client standard input
            const gunzip = zlib.createGunzip();
            const fileStream = fs.createReadStream(archivePath);

            fileStream.on('error', err => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                clientProc.kill('SIGTERM');
                reject(err);
            });

            gunzip.on('error', err => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutTimer);
                clientProc.kill('SIGTERM');
                reject(err);
            });

            // Prepend foreign key disabling and pipe decompressed stream
            clientProc.stdin.write('/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;\n');

            gunzip.on('data', chunk => {
                if (!clientProc.stdin.destroyed) {
                    clientProc.stdin.write(chunk);
                }
            });

            gunzip.on('end', () => {
                if (!clientProc.stdin.destroyed) {
                    clientProc.stdin.write('\n/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;\n');
                    clientProc.stdin.end();
                }
            });

            fileStream.pipe(gunzip);
        });

        const restoredAt = new Date().toISOString();

        await auditService.logSecurityEvent({
            actorEmail,
            actorRole: 'IT Dept. Head',
            action: 'DATABASE_RESTORE_COMPLETED',
            resourceType: 'DATABASE',
            resourceId: FIXED_TARGET_DATABASE,
            details: {
                restoredAt,
                targetDatabase: FIXED_TARGET_DATABASE
            },
            result: 'SUCCESS'
        });

        return {
            success: true,
            targetDatabase: FIXED_TARGET_DATABASE,
            restoredAt
        };
    } catch (err) {
        await auditService.logSecurityEvent({
            actorEmail,
            actorRole: 'IT Dept. Head',
            action: 'DATABASE_RESTORE_FAILED',
            resourceType: 'DATABASE',
            resourceId: FIXED_TARGET_DATABASE,
            details: {
                error: sanitizeErrorMessage(err.message),
                targetDatabase: FIXED_TARGET_DATABASE
            },
            result: 'FAILURE'
        });

        throw err;
    } finally {
        cleanupSecureTempDir(tempDir);
    }
}

module.exports = {
    WIN_XAMPP_BIN,
    FIXED_TARGET_DATABASE,
    FIXED_TARGET_HOST,
    FIXED_TARGET_PORT,
    MAX_COMPRESSED_BYTES,
    MAX_DECOMPRESSED_BYTES,
    RESTORE_TIMEOUT_MS,
    isProductionEnvironment,
    resolveClientBinary,
    getVerifiedRestoreConfig,
    sanitizeErrorMessage,
    createSecureClientConfigFile,
    cleanupSecureTempDir,
    validateRestoreArchive,
    executeSandboxRestore
};
