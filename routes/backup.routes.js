'use strict';

/**
 * routes/backup.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Routing for Database Backup & Disaster Recovery Operations.
 * Mounted at: /api/admin/backups
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backup.controller');
const { requireAuth, requireRole, IT_DEPT_HEAD_EXCLUSIVE_ROLES } = require('../middleware/auth');
const { backupCreateLimiter, backupRestoreLimiter } = require('../middleware/rateLimiter');

// Apply session authentication to all backup routes
router.use(requireAuth);

// Status route: View backup history and sandbox readiness (Exclusively IT Dept Head)
router.get('/status', requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES), backupController.getStatus);

// Backup Generation: Download verified compressed database archive (.sql.gz) (Exclusively IT Dept Head)
router.post('/create', requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES), backupCreateLimiter, backupController.createBackup);
router.get('/create', requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES), backupCreateLimiter, backupController.createBackup);

// Scoped body parser for restoration binary stream (supports up to 50MB gzip archive)
// Placed behind requireAuth and requireRole to prevent unauthenticated RAM exhaustion
const restoreRawParser = express.raw({
    type: ['application/gzip', 'application/octet-stream', 'application/x-gzip', 'application/sql'],
    limit: '50mb'
});
const restoreJsonParser = express.json({ limit: '50mb' });

// Restoration: Restricted strictly to IT Dept Head, with sandbox safety invariants and rate limiting
router.post(
    '/restore',
    requireRole(IT_DEPT_HEAD_EXCLUSIVE_ROLES),
    backupRestoreLimiter,
    restoreRawParser,
    restoreJsonParser,
    backupController.restoreTestSandbox
);

module.exports = router;
