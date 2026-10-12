'use strict';

/**
 * routes/mis.routes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * MIS Staff Account Lifecycle Management Routes.
 * 
 * Access is authorized server-side for the IT Department Head and
 * Program Coordinator (IT_HEAD_ROLES). MIS Staff, Faculty, and OJT are strictly
 * forbidden from accessing these endpoints.
 * 
 * Hard account deletion is intentionally disallowed (no DELETE endpoint exists)
 * to preserve historical accountability, audit logs, and maintenance attribution.
 */

const express = require('express');
const router = express.Router();
const misController = require('../controllers/mis.controller');
const { requireAuth, requireRole, IT_HEAD_ROLES } = require('../middleware/auth');
const auditService = require('../services/auditService');

// Security middleware to audit log any unauthorized role attempts to access MIS management
async function auditUnauthorizedMisAccess(req, res, next) {
    const actingRole = (req.session && (req.session.userRole || req.session.role)) || null;
    if (actingRole && !IT_HEAD_ROLES.includes(actingRole)) {
        try {
            await auditService.logSecurityEvent({
                req,
                actorRole: actingRole,
                action: 'MIS_ACCESS_DENIED',
                resourceType: 'USER',
                details: {
                    reason: 'Insufficient privileges: Only IT Dept Head or Program Coordinator can manage MIS Staff accounts',
                    attemptedPath: req.originalUrl
                },
                result: 'DENIED'
            });
        } catch (e) {
            console.error('[audit] Failed to log MIS_ACCESS_DENIED:', e);
        }
    }
    next();
}

router.use(requireAuth);
router.use(auditUnauthorizedMisAccess);
router.use(requireRole(IT_HEAD_ROLES));

// MIS Staff Account Operations
router.get('/', misController.listMisStaff);
router.post('/', misController.createMisStaff);
router.put('/:userId', misController.updateMisStaff);
router.put('/:userId/deactivate', misController.deactivateMisStaff);
router.put('/:userId/reactivate', misController.reactivateMisStaff);
router.post('/:userId/reset-password', misController.resetMisStaffPassword);

module.exports = router;
