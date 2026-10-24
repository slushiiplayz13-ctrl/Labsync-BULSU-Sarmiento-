'use strict';

/**
 * controllers/backup.controller.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Controller for Database Backup & Disaster Recovery Operations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../database/connection');
const backupService = require('../services/backupService');
const auditService = require('../services/auditService');

/**
 * Handles backup creation and direct HTTP streaming to the administrator.
 * GET/POST /api/admin/backups/create
 */
async function createBackup(req, res, next) {
    try {
        await backupService.streamBackupToResponse(req, res);
    } catch (err) {
        next(err);
    }
}

/**
 * Returns administrative status metadata for the Backup & Recovery interface.
 * GET /api/admin/backups/status
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
 */
async function restoreTestSandbox(req, res, next) {
    // 1. Hard Production Guard check
    if (backupService.isProductionEnvironment()) {
        return res.status(403).json({
            error: 'Database restoration is permanently disabled on the production deployment.',
            code: 'RESTORE_BLOCKED_ON_PRODUCTION'
        });
    }

    const userId = req.session ? req.session.userId : null;
    const actorEmail = req.session ? (req.session.userEmail || req.session.email) : null;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // 2. Extract password from custom header (URI-decoded) or request body
    const headerPassword = req.headers['x-confirm-password'];
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

    // 3. Verify administrator password against database hash
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

    // 4. Stream incoming request body into an ephemeral scratch file
    const tempScratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'labsync-restore-upload-'));
    const tempUploadedArchive = path.join(tempScratchDir, 'uploaded_restore.sql.gz');

    try {
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(tempUploadedArchive, { mode: 0o600 });
            writeStream.on('error', reject);
            writeStream.on('finish', resolve);

            // Handle Buffer if raw middleware handled body, or stream directly from req
            if (Buffer.isBuffer(req.body)) {
                writeStream.end(req.body);
            } else if (req.body && typeof req.body === 'object' && typeof req.body.sqlContent === 'string') {
                writeStream.end(Buffer.from(req.body.sqlContent, 'utf8'));
            } else {
                req.pipe(writeStream);
            }
        });

        const stats = fs.statSync(tempUploadedArchive);
        if (stats.size === 0) {
            return res.status(400).json({
                error: 'Uploaded backup archive is empty (0 bytes).',
                code: 'EMPTY_ARCHIVE'
            });
        }

        // 5. Compute SHA-256 checksum across the complete uploaded archive for integrity verification
        const archiveChecksum = await new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(tempUploadedArchive);
            stream.on('error', reject);
            stream.on('data', chunk => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
        });

        // 6. Optional header checksum validation if provided by client (verifies integrity against corruption)
        const expectedChecksum = req.headers['x-backup-checksum'] || (req.body && req.body.checksum);
        if (expectedChecksum && String(expectedChecksum).toLowerCase() !== archiveChecksum.toLowerCase()) {
            return res.status(400).json({
                error: 'Uploaded archive SHA-256 integrity check failed. The archive digest did not match the provided checksum.',
                expectedChecksum,
                actualChecksum: archiveChecksum,
                code: 'CHECKSUM_MISMATCH'
            });
        }

        // 7. Execute verified restoration into labsync_test
        const result = await backupService.restoreToTestDatabase(tempUploadedArchive, {
            actorEmail,
            isGzip: true,
            archiveChecksum
        });

        return res.status(200).json({
            message: 'Database restoration into isolated test sandbox completed successfully.',
            targetDatabase: result.targetDatabase,
            restoredAt: result.restoredAt,
            checksumSha256: archiveChecksum,
            code: 'RESTORE_SUCCESS'
        });
    } catch (err) {
        if (err.code === 'RESTORE_BLOCKED_ON_PRODUCTION') {
            return res.status(403).json({ error: err.message, code: err.code });
        }
        if (err.code === 'RESTORE_NOT_AUTHORIZED' || err.code === 'INVALID_RESTORE_TARGET' || err.code === 'RESTORE_CREDENTIALS_MISSING') {
            return res.status(400).json({ error: err.message, code: err.code });
        }
        return next(err);
    } finally {
        try {
            fs.rmSync(tempScratchDir, { recursive: true, force: true });
        } catch (_) { }
    }
}

module.exports = {
    createBackup,
    getStatus,
    restoreTestSandbox
};
