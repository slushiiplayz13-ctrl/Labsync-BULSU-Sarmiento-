'use strict';

/**
 * controllers/backup.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17: Backup & Disaster Recovery Controller.
 * Handles backup generation, HTTP streaming, status metadata, and isolated
 * sandbox restoration with permanent production lockout.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const bcrypt = require('bcrypt');
const pool = require('../database/connection');
const backupService = require('../services/backupService');
const restoreService = require('../services/restoreService');
const auditService = require('../services/auditService');

/**
 * Formats client IP address safely.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function getClientIp(req) {
    let ip = req.ip || (req.connection && req.connection.remoteAddress) || null;
    if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }
    return ip;
}

/**
 * Generates and streams a verified .sql.gz database backup archive.
 * POST /api/admin/backups/create
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function createBackup(req, res, next) {
    const executedByEmail = req.session ? (req.session.userEmail || req.session.email || null) : null;
    const ipAddress = getClientIp(req);

    let backupResult = null;
    let historyId = null;

    try {
        backupResult = await backupService.generateVerifiedSqlBackup();

        historyId = await backupService.recordBackupHistoryEntry({
            filename: backupResult.filename,
            triggerType: 'MANUAL',
            status: 'PENDING_DOWNLOAD',
            fileSizeBytes: backupResult.fileSizeBytes,
            tableCount: backupResult.tableCount,
            checksumSha256: backupResult.checksumSha256,
            executedByEmail,
            ipAddress
        });
    } catch (genErr) {
        console.error('[BackupController] Backup generation error:', genErr.message);

        try {
            await backupService.recordBackupHistoryEntry({
                filename: backupResult ? backupResult.filename : 'failed-backup.sql.gz',
                triggerType: 'MANUAL',
                status: 'FAILED',
                fileSizeBytes: 0,
                tableCount: 0,
                checksumSha256: null,
                errorMessage: genErr.message,
                executedByEmail,
                ipAddress
            });
        } catch (_) {}

        await auditService.logSecurityEvent({
            req,
            action: 'DATABASE_BACKUP_GENERATION_FAILED',
            resourceType: 'DATABASE',
            details: { error: genErr.message },
            result: 'FAILURE'
        });

        return res.status(500).json({
            error: 'Failed to generate database backup.',
            code: 'BACKUP_GENERATION_FAILED'
        });
    }

    // Set streaming headers
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${backupResult.filename}"`);
    res.setHeader('X-Backup-Checksum', backupResult.checksumSha256);
    res.setHeader('Content-Length', backupResult.fileSizeBytes);

    let transferSucceeded = false;
    const fileStream = fs.createReadStream(backupResult.filePath);

    try {
        await pipeline(fileStream, res);
        transferSucceeded = true;
    } catch (streamErr) {
        console.error('[BackupController] Download stream failed or aborted by client:', streamErr.message);
    } finally {
        // Always clean up ephemeral backup directory
        try {
            fs.rmSync(backupResult.tempDir, { recursive: true, force: true });
        } catch (rmErr) {
            console.warn('[BackupController] Error cleaning temp directory:', rmErr.message);
        }

        if (transferSucceeded) {
            if (historyId) {
                try {
                    await backupService.updateBackupHistoryStatus(historyId, { status: 'SUCCESS' });
                } catch (_) {}
            }

            await auditService.logSecurityEvent({
                req,
                action: 'DATABASE_BACKUP_DOWNLOAD_COMPLETED',
                resourceType: 'DATABASE',
                resourceId: backupResult.filename,
                details: {
                    filename: backupResult.filename,
                    fileSizeBytes: backupResult.fileSizeBytes,
                    tableCount: backupResult.tableCount,
                    checksumSha256: backupResult.checksumSha256
                },
                result: 'SUCCESS'
            });
        } else {
            if (historyId) {
                try {
                    await backupService.updateBackupHistoryStatus(historyId, {
                        status: 'INTERRUPTED',
                        errorMessage: 'Client disconnected or transfer stream interrupted'
                    });
                } catch (_) {}
            }

            await auditService.logSecurityEvent({
                req,
                action: 'DATABASE_BACKUP_DOWNLOAD_FAILED',
                resourceType: 'DATABASE',
                resourceId: backupResult.filename,
                details: {
                    filename: backupResult.filename,
                    error: 'Client disconnected or transfer stream interrupted'
                },
                result: 'FAILURE'
            });
        }
    }
}

/**
 * Returns administrative status metadata for the Backup & Recovery interface.
 * GET /api/admin/backups/status
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getStatus(req, res, next) {
    try {
        const status = await backupService.getBackupStatus();
        res.status(200).json(status);
    } catch (err) {
        next(err);
    }
}

/**
 * Restores a backup archive into the isolated test sandbox (labsync_test).
 * Strictly gated by IT Department Head role, password re-authentication,
 * and fail-closed production safety invariants.
 * POST /api/admin/backups/restore
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function restoreTestSandbox(req, res, next) {
    // 1. Hard Production Guard: Block immediately if in production
    if (restoreService.isProductionEnvironment()) {
        return res.status(403).json({
            error: 'Database restoration is permanently disabled on the production deployment.',
            code: 'RESTORE_BLOCKED_ON_PRODUCTION'
        });
    }

    const userId = req.session ? req.session.userId : null;
    const actorEmail = req.session ? (req.session.userEmail || req.session.email || 'admin@labsync.local') : null;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // 2. Extract and verify administrator confirmation password
    const headerPassword = req.headers['x-confirm-password'] || req.headers['x-admin-password'];
    let confirmPassword = headerPassword ? decodeURIComponent(headerPassword) : null;

    if (!confirmPassword && req.body && typeof req.body === 'object' && req.body.confirmPassword) {
        confirmPassword = req.body.confirmPassword;
    }

    if (!confirmPassword) {
        return res.status(401).json({
            error: 'Administrator password confirmation is required for restoration.',
            code: 'PASSWORD_REQUIRED'
        });
    }

    try {
        const [users] = await pool.query('SELECT Password FROM users WHERE User_ID = ?', [userId]);
        if (!users || users.length === 0 || !users[0].Password) {
            return res.status(401).json({ error: 'User account not found or invalid' });
        }

        const isMatch = await bcrypt.compare(confirmPassword, users[0].Password);
        if (!isMatch) {
            await auditService.logSecurityEvent({
                req,
                action: 'DATABASE_RESTORE_ATTEMPT_FAILED',
                resourceType: 'DATABASE',
                details: { reason: 'Incorrect administrator password' },
                result: 'DENIED'
            });

            return res.status(401).json({
                error: 'Invalid administrator password. Restoration aborted.',
                code: 'INVALID_PASSWORD'
            });
        }
    } catch (authErr) {
        return next(authErr);
    }

    // 3. Stream incoming request body into an ephemeral scratch file
    const tempScratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labsync-restore-upload-'));
    const tempUploadedArchive = path.join(tempScratchDir, 'uploaded_restore.sql.gz');

    try {
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(tempUploadedArchive, { mode: 0o600 });
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);

            if (Buffer.isBuffer(req.body)) {
                writeStream.end(req.body);
            } else if (req.body && typeof req.body === 'object' && typeof req.body.sqlContent === 'string') {
                writeStream.end(Buffer.from(req.body.sqlContent, 'utf8'));
            } else {
                req.pipe(writeStream);
            }
        });

        // 4. Verify SHA-256 Checksum header requirement
        const expectedChecksum = req.headers['x-backup-checksum'] || (req.body && req.body.checksum);
        if (!expectedChecksum) {
            return res.status(400).json({
                error: 'Archive integrity verification failed: Original SHA-256 checksum is required (X-Backup-Checksum header).',
                code: 'CHECKSUM_REQUIRED'
            });
        }

        // 5. Pre-import archive validation (integrity, magic bytes, SQL safety, collation)
        try {
            await restoreService.validateRestoreArchive(tempUploadedArchive, expectedChecksum);
        } catch (valErr) {
            await auditService.logSecurityEvent({
                req,
                action: 'DATABASE_RESTORE_ATTEMPT_FAILED',
                resourceType: 'DATABASE',
                details: {
                    reason: valErr.message,
                    code: valErr.code || 'VALIDATION_FAILED'
                },
                result: 'DENIED'
            });

            return res.status(400).json({
                error: valErr.message,
                code: valErr.code || 'VALIDATION_FAILED'
            });
        }

        // 6. Execute verified restoration into labsync_test
        const result = await restoreService.executeSandboxRestore(tempUploadedArchive, {
            actorEmail
        });

        return res.status(200).json({
            message: 'Database restoration into isolated test sandbox completed successfully.',
            targetDatabase: result.targetDatabase,
            restoredAt: result.restoredAt,
            checksumSha256: expectedChecksum,
            code: 'RESTORE_SUCCESS'
        });
    } catch (err) {
        if (err.code === 'RESTORE_BLOCKED_ON_PRODUCTION') {
            return res.status(403).json({ error: err.message, code: err.code });
        }
        if (err.code === 'RESTORE_NOT_AUTHORIZED' ||
            err.code === 'INVALID_RESTORE_TARGET' ||
            err.code === 'RESTORE_CREDENTIALS_MISSING' ||
            err.code === 'CHECKSUM_MISMATCH' ||
            err.code === 'INVALID_ARCHIVE_FORMAT' ||
            err.code === 'CHECKSUM_REQUIRED' ||
            err.code === 'FORBIDDEN_SQL_STATEMENT' ||
            err.code === 'INCOMPATIBLE_COLLATION') {
            return res.status(400).json({ error: err.message, code: err.code });
        }
        return next(err);
    } finally {
        try {
            fs.rmSync(tempScratchDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

module.exports = {
    createBackup,
    getStatus,
    restoreTestSandbox
};
