'use strict';

/**
 * routes/backup.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routing for Database Backup & Recovery Operations.
 * Mounted at: /api/admin/backups
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backup.controller');
const restoreService = require('../services/restoreService');
const { requireAuth, requireRole, IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');
const { backupCreateLimiter, backupRestoreLimiter } = require('../middleware/rateLimiter');

// All backup routes require authenticated session
router.use(requireAuth);

/**
 * Strict fail-closed environment guard that rejects restoration on production
 * BEFORE any request body parsing, stream reading, or file processing occurs.
 */
function productionLockoutGuard(req, res, next) {
    if (restoreService.isProductionEnvironment()) {
        return res.status(403).json({
            error: 'Database restoration is permanently disabled on the production deployment.',
            code: 'RESTORE_BLOCKED_ON_PRODUCTION'
        });
    }
    next();
}

// Scoped body parser for restoration binary stream (supports up to 50MB archive)
const restoreRawParser = express.raw({
    type: ['application/gzip', 'application/octet-stream', 'application/x-gzip', 'application/sql', 'multipart/form-data'],
    limit: '50mb'
});
const restoreJsonParser = express.json({ limit: '50mb' });

// GET /api/admin/backups/status — Administrative backup status metadata (Exclusively IT Dept Head)
router.get('/status', requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES), backupController.getStatus);

// POST /api/admin/backups/create — Generate and stream verified .sql.gz archive (Exclusively IT Dept Head)
router.post('/create', requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES), backupCreateLimiter, backupController.createBackup);

// POST /api/admin/backups/restore — Isolated sandbox restoration (Strictly IT Dept Head & Local Environment)
router.post(
    '/restore',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    productionLockoutGuard,
    backupRestoreLimiter,
    restoreRawParser,
    restoreJsonParser,
    backupController.restoreTestSandbox
);

// ─── Online Recovery Sandbox Endpoints (Exclusively IT Dept Head) ─────────────

// GET /api/admin/backups/recovery/status — Recovery sandbox reachability & latest summary
router.get(
    '/recovery/status',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.getRecoveryStatus
);

// POST /api/admin/backups/recovery/restore — Dedicated Online Recovery Sandbox restoration
router.post(
    '/recovery/restore',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupRestoreLimiter,
    restoreRawParser,
    restoreJsonParser,
    backupController.restoreOnlineRecoverySandbox
);

// GET & POST /api/admin/backups/recovery/compare — Demonstration room comparison between production & sandbox
router.get(
    '/recovery/compare',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.compareDemonstrationRecord
);

router.post(
    '/recovery/compare',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.compareDemonstrationRecord
);

// ─── Blue-Green Database Recovery & Promotion Controls (Exclusively IT Dept Head) ──

// GET /api/admin/backups/recovery/promotion-status — Candidate database promotion readiness
router.get(
    '/recovery/promotion-status',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.getPromotionStatus
);

// POST /api/admin/backups/recovery/record-promotion — Record completed promotion cutover
router.post(
    '/recovery/record-promotion',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.recordPromotion
);

// GET /api/admin/backups/maintenance-mode — Inspect current cutover maintenance mode status
router.get(
    '/maintenance-mode',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.getMaintenanceMode
);

// POST /api/admin/backups/maintenance-mode — Toggle cutover maintenance mode (enable/disable writes)
router.post(
    '/maintenance-mode',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupController.toggleMaintenanceMode
);

module.exports = router;
