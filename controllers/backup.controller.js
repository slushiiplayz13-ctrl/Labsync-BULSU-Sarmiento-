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
const recoveryDatabaseService = require('../services/recoveryDatabaseService');
const auditService = require('../services/auditService');
const { isMaintenanceModeActive, getMaintenanceModeStatus, setMaintenanceMode } = require('../middleware/maintenanceMode');
const activityRetentionService = require('../services/activityRetentionService');
const keyReminderService = require('../services/keyReminderService');

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

        const isLockError = typeof genErr.message === 'string' && genErr.message.includes('schema backup lock');
        const userFacingError = isLockError
            ? 'Another database backup or schema migration is currently in progress. Please retry in a few moments.'
            : 'Failed to generate database backup.';
        const errorCode = isLockError ? 'BACKUP_LOCK_CONFLICT' : 'BACKUP_GENERATION_FAILED';

        return res.status(500).json({
            error: userFacingError,
            code: errorCode
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
        let recoverySandbox = null;
        try {
            recoverySandbox = await recoveryDatabaseService.getRecoveryStatus();
        } catch (_) {}
        res.status(200).json({
            ...status,
            recoverySandbox
        });
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

/**
 * Restores a backup archive into the isolated Online Recovery Sandbox database.
 * Strictly gated by IT Department Head role, password re-authentication,
 * and isolated target validation.
 * POST /api/admin/backups/recovery/restore
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function restoreOnlineRecoverySandbox(req, res, next) {
    const userId = req.session ? req.session.userId : null;
    const actorEmail = req.session ? (req.session.userEmail || req.session.email || 'admin@labsync.local') : null;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // 1. Check recovery configuration presence
    if (!recoveryDatabaseService.isRecoveryConfigured()) {
        return res.status(400).json({
            error: 'Online Recovery Sandbox database is not configured. Please configure RECOVERY_DB_HOST, RECOVERY_DB_USER, and RECOVERY_DB_NAME in environment variables.',
            code: 'RECOVERY_NOT_CONFIGURED'
        });
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
                action: 'ONLINE_RECOVERY_ATTEMPT_FAILED',
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

    // 3. Verify SHA-256 Checksum header requirement
    const expectedChecksum = req.headers['x-backup-checksum'] || (req.body && req.body.checksum);
    if (!expectedChecksum) {
        return res.status(400).json({
            error: 'Archive integrity verification failed: Original SHA-256 checksum is required (X-Backup-Checksum header).',
            code: 'CHECKSUM_REQUIRED'
        });
    }

    // 4. Stream upload into ephemeral scratch file
    const tempScratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labsync-online-recovery-'));
    const tempUploadedArchive = path.join(tempScratchDir, 'uploaded_online_restore.sql.gz');
    const filename = req.headers['x-backup-filename'] || 'recovery-archive.sql.gz';

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

        // 5. Execute verified online recovery
        const summary = await recoveryDatabaseService.executeOnlineRecovery(tempUploadedArchive, expectedChecksum, {
            actorEmail,
            filename
        });

        return res.status(200).json({
            message: 'Database restoration into Online Recovery Sandbox completed successfully.',
            code: 'RECOVERY_SUCCESS',
            summary
        });
    } catch (err) {
        if (err.code === 'CONCURRENT_RECOVERY_IN_PROGRESS') {
            return res.status(409).json({ error: err.message, code: err.code });
        }
        if (err.code === 'RECOVERY_TARGETS_PRODUCTION' ||
            err.code === 'RECOVERY_USES_PRODUCTION_USER' ||
            err.code === 'ISOLATION_VERIFICATION_FAILED') {
            return res.status(403).json({ error: err.message, code: err.code });
        }
        if (err.code === 'RECOVERY_NOT_CONFIGURED' ||
            err.code === 'CHECKSUM_MISMATCH' ||
            err.code === 'INVALID_ARCHIVE_FORMAT' ||
            err.code === 'CHECKSUM_REQUIRED' ||
            err.code === 'FORBIDDEN_SQL_STATEMENT' ||
            err.code === 'INCOMPATIBLE_COLLATION' ||
            err.code === 'RECOVERY_INCOMPLETE') {
            return res.status(400).json({ error: err.message, code: err.code });
        }
        return next(err);
    } finally {
        try {
            fs.rmSync(tempScratchDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

/**
 * Returns summary status of the Online Recovery Sandbox.
 * GET /api/admin/backups/recovery/status
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function getRecoveryStatus(req, res, next) {
    try {
        const status = await recoveryDatabaseService.getRecoveryStatus();
        res.status(200).json(status);
    } catch (err) {
        next(err);
    }
}

/**
 * Compares laboratory/room records between live Production and the Online Recovery Sandbox.
 * GET /api/admin/backups/recovery/compare?room=RESTORE-DEMO-999
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function compareDemonstrationRecord(req, res, next) {
    try {
        const roomQuery = req.query.room || (req.body && req.body.room);
        if (!roomQuery) {
            return res.status(400).json({
                error: 'Query parameter "room" is required for comparison (e.g. ?room=RESTORE-DEMO-999).',
                code: 'INVALID_QUERY'
            });
        }

        const comparison = await recoveryDatabaseService.compareDemonstrationRecord(roomQuery);
        res.status(200).json(comparison);
    } catch (err) {
        if (err.code === 'INVALID_QUERY') {
            return res.status(400).json({ error: err.message, code: err.code });
        }
        next(err);
    }
}

/**
 * Assesses the readiness of the candidate recovery database for Blue-Green promotion.
 * GET /api/admin/backups/recovery/promotion-status
 */
async function getPromotionStatus(req, res, next) {
    try {
        const report = await recoveryDatabaseService.verifyPromotionReadiness();
        res.status(200).json(report);
    } catch (err) {
        next(err);
    }
}

/**
 * Returns current cutover maintenance mode status and comprehensive drain state.
 * GET /api/admin/backups/maintenance-mode
 */
async function getMaintenanceMode(req, res) {
    const baseStatus = getMaintenanceModeStatus();
    const retentionJobRunning = Boolean(activityRetentionService.isRetentionRunning && activityRetentionService.isRetentionRunning());
    const keyReminderJobRunning = Boolean(keyReminderService.isKeyReminderChecking && keyReminderService.isKeyReminderChecking());
    const backgroundJobsDrained = !retentionJobRunning && !keyReminderJobRunning;
    const activeMutationRequests = typeof baseStatus.activeMutationRequests === 'number'
        ? baseStatus.activeMutationRequests
        : 0;
    const unresolvedOperations = typeof baseStatus.unresolvedOperations === 'number'
        ? baseStatus.unresolvedOperations
        : 0;
    const mutationRequestsDrained = activeMutationRequests === 0 && unresolvedOperations === 0;
    const cutoverDrained = backgroundJobsDrained && mutationRequestsDrained;

    res.status(200).json({
        ...baseStatus,
        maintenanceMode: baseStatus.active,
        activeMutationRequests,
        unresolvedOperations,
        retentionJobRunning,
        keyReminderJobRunning,
        backgroundJobsDrained,
        mutationRequestsDrained,
        cutoverDrained
    });
}

/**
 * Toggles cutover maintenance mode status. Strictly gated by IT Department Head role.
 * POST /api/admin/backups/maintenance-mode
 */
async function toggleMaintenanceMode(req, res, next) {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                error: 'Field "enabled" must be a boolean (true or false).',
                code: 'INVALID_MAINTENANCE_PAYLOAD'
            });
        }

        if (!enabled && process.env.MAINTENANCE_MODE === 'true') {
            return res.status(400).json({
                success: false,
                maintenanceMode: true,
                error: 'Cannot disable Maintenance Mode via UI because it is enforced by Railway environment variable (MAINTENANCE_MODE=true). To resume ordinary operations, remove or set MAINTENANCE_MODE=false in Railway Variables and redeploy.',
                code: 'ENVIRONMENT_DRIVEN_MAINTENANCE'
            });
        }

        setMaintenanceMode(enabled);

        const actorEmail = req.session ? (req.session.userEmail || req.session.email || null) : null;
        await auditService.logSecurityEvent({
            req,
            actorEmail,
            actorRole: 'IT Dept. Head',
            action: enabled ? 'MAINTENANCE_MODE_ENABLED' : 'MAINTENANCE_MODE_DISABLED',
            resourceType: 'SYSTEM_SETTINGS',
            details: { enabled },
            result: 'SUCCESS'
        });

        const baseStatus = getMaintenanceModeStatus();
        const retentionJobRunning = Boolean(activityRetentionService.isRetentionRunning && activityRetentionService.isRetentionRunning());
        const keyReminderJobRunning = Boolean(keyReminderService.isKeyReminderChecking && keyReminderService.isKeyReminderChecking());
        const backgroundJobsDrained = !retentionJobRunning && !keyReminderJobRunning;
        const activeMutationRequests = typeof baseStatus.activeMutationRequests === 'number'
            ? baseStatus.activeMutationRequests
            : 0;
        const unresolvedOperations = typeof baseStatus.unresolvedOperations === 'number'
            ? baseStatus.unresolvedOperations
            : 0;
        const mutationRequestsDrained = activeMutationRequests === 0 && unresolvedOperations === 0;
        const cutoverDrained = backgroundJobsDrained && mutationRequestsDrained;

        res.status(200).json({
            success: true,
            ...baseStatus,
            maintenanceMode: isMaintenanceModeActive(),
            activeMutationRequests,
            unresolvedOperations,
            retentionJobRunning,
            keyReminderJobRunning,
            backgroundJobsDrained,
            mutationRequestsDrained,
            cutoverDrained,
            message: enabled
                ? 'Maintenance Mode activated. New database writes are temporarily blocked.'
                : 'Maintenance Mode deactivated. Normal application operations resumed.'
        });
    } catch (err) {
        next(err);
    }
}

/**
 * Records a completed promotion cutover event.
 * POST /api/admin/backups/recovery/record-promotion
 */
async function recordPromotion(req, res, next) {
    try {
        const actorEmail = req.session ? (req.session.userEmail || req.session.email || null) : null;
        const entry = recoveryDatabaseService.recordPromotionEvent({
            ...req.body,
            actorEmail
        });

        await auditService.logSecurityEvent({
            req,
            actorEmail,
            actorRole: 'IT Dept. Head',
            action: 'DATABASE_PROMOTION_RECORDED',
            resourceType: 'DATABASE',
            details: entry,
            result: 'SUCCESS'
        });

        res.status(200).json({
            success: true,
            entry
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createBackup,
    getStatus,
    restoreTestSandbox,
    restoreOnlineRecoverySandbox,
    getRecoveryStatus,
    compareDemonstrationRecord,
    getPromotionStatus,
    getMaintenanceMode,
    toggleMaintenanceMode,
    recordPromotion
};
