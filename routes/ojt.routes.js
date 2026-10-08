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
const { requireRole, MIS_STAFF_ROLES, IT_HEAD_ROLES } = require('../middleware/auth');

// Read permissions: MIS Staff and IT Head roles (view-only directory for Department Head)
const OJT_READ_ROLES = [...MIS_STAFF_ROLES, ...IT_HEAD_ROLES];

// OJT Account Read Operations
router.get('/', requireRole(OJT_READ_ROLES), ojtController.listOjts);
router.get('/:userId', requireRole(OJT_READ_ROLES), ojtController.getOjt);

// OJT Account Management Operations (strictly restricted server-side to MIS Staff)
router.post('/', requireRole(MIS_STAFF_ROLES), ojtController.createOjt);
router.put('/:userId', requireRole(MIS_STAFF_ROLES), ojtController.updateOjt);
router.put('/:userId/status', requireRole(MIS_STAFF_ROLES), ojtController.updateStatus);
router.post('/:userId/reset-password', requireRole(MIS_STAFF_ROLES), ojtController.resetPassword);

module.exports = router;
