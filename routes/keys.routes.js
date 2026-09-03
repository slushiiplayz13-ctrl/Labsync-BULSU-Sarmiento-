'use strict';

/**
 * routes/keys.routes.js
 * Domain router for physical key management and authorized Key Transfer / Room Claim.
 */

const express = require('express');
const router = express.Router();
const keysController = require('../controllers/keys.controller');
const { requireAuth, requireRole, MIS_STAFF_ROLES, KEY_TRANSFER_ROLES } = require('../middleware/auth');

// ─── 1. KEY TRANSFER & ROOM CLAIM ENDPOINTS ──────────────────────────────────
// GET /api/keys/transfer-info/:keyCode — Lookup key, room, and current holder for confirmation
router.get('/transfer-info/:keyCode', requireAuth, keysController.getKeyTransferInfo);

// POST /api/keys/transfer — Execute physical key handoff (Faculty and IT Dept Head only)
router.post('/transfer', requireAuth, requireRole(KEY_TRANSFER_ROLES), keysController.transferKey);


// ─── 2. MIS STAFF KEY INVENTORY ENDPOINTS ─────────────────────────────────────
// GET /api/keys — List all registered laboratory keys and summary statistics
router.get('/', requireRole(MIS_STAFF_ROLES), keysController.getAllKeys);

// POST /api/keys — Register a new key for a room
router.post('/', requireRole(MIS_STAFF_ROLES), keysController.registerKey);

// GET /api/keys/:keyId/tag — Generate QR code tag data and printable keychain insert
router.get('/:keyId/tag', requireRole(MIS_STAFF_ROLES), keysController.getKeyTag);

// PUT /api/keys/:keyId/missing — Mark key status as MISSING
router.put('/:keyId/missing', requireRole(MIS_STAFF_ROLES), keysController.markMissing);

// PUT /api/keys/:keyId/active — Recover key status to ACTIVE
router.put('/:keyId/active', requireRole(MIS_STAFF_ROLES), keysController.markActive);

module.exports = router;
