'use strict';

/**
 * routes/ojt.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * OJT (Intern) Management Routes.
 * 
 * Access is strictly restricted server-side to MIS Staff accounts.
 * Hard account deletion is intentionally disallowed (no DELETE endpoint exists)
 * to preserve historical accountability and audit trail attribution.
 */

const express = require('express');
const router = express.Router();
const ojtController = require('../controllers/ojt.controller');
const { requireRole, MIS_STAFF_ROLES } = require('../middleware/auth');

// Apply authoritative server-side role check across all OJT management routes
router.use(requireRole(MIS_STAFF_ROLES));

// OJT Account Operations
router.get('/', ojtController.listOjts);
router.post('/', ojtController.createOjt);
router.get('/:userId', ojtController.getOjt);
router.put('/:userId', ojtController.updateOjt);
router.put('/:userId/status', ojtController.updateStatus);
router.post('/:userId/reset-password', ojtController.resetPassword);

module.exports = router;
