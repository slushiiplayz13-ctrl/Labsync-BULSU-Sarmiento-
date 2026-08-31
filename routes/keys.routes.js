'use strict';

/**
 * routes/keys.routes.js
 * Domain router for laboratory physical key management and public lost/found key reporting.
 */

const express = require('express');
const router = express.Router();
const keysController = require('../controllers/keys.controller');
const { requireAuth, requireRole, MIS_STAFF_ROLES } = require('../middleware/auth');
const { publicReportLimiter } = require('../middleware/rateLimiter');

// ─── 1. PUBLIC UNAUTHENTICATED ENDPOINTS ──────────────────────────────────────
// GET /api/keys/public/info/:keyCode — Lookup minimal room location for QR scan
router.get('/public/info/:keyCode', keysController.getPublicInfo);

// POST /api/keys/public/report — Submit found key report from QR scan
router.post('/public/report', publicReportLimiter, keysController.submitPublicReport);


// ─── 2. MIS STAFF OPERATIONAL ENDPOINTS ───────────────────────────────────────
// GET /api/keys — List all registered laboratory keys and summary statistics
router.get('/', requireRole(MIS_STAFF_ROLES), keysController.getAllKeys);

// POST /api/keys — Register a new key for a room
router.post('/', requireRole(MIS_STAFF_ROLES), keysController.registerKey);

// GET /api/keys/reports — View found key report histories
router.get('/reports', requireRole(MIS_STAFF_ROLES), keysController.getFoundReports);

// GET /api/keys/:keyId/tag — Generate QR code tag data and printable insert metadata
router.get('/:keyId/tag', requireRole(MIS_STAFF_ROLES), keysController.getKeyTag);

// PUT /api/keys/:keyId/missing — Mark key status as MISSING
router.put('/:keyId/missing', requireRole(MIS_STAFF_ROLES), keysController.markMissing);

// PUT /api/keys/:keyId/active — Recover key status to ACTIVE
router.put('/:keyId/active', requireRole(MIS_STAFF_ROLES), keysController.markActive);

module.exports = router;
