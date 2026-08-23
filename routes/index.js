'use strict';

/**
 * routes/index.js
 * Centralized API Router Aggregator & Compatibility Layer.
 *
 * Mounts all domain-specific routers and exposes legacy top-level endpoints
 * by delegating directly to the canonical controller handlers.
 */

const express = require('express');
const router = express.Router();

// Canonical Controllers
const authController = require('../controllers/auth.controller');
const usersController = require('../controllers/users.controller');
const schedulesController = require('../controllers/schedules.controller');
const maintenanceController = require('../controllers/maintenance.controller');

// Database pool for health check
const db = require('../database/connection');

// Authorization Middlewares
const { requireAuth, requireRole, ADMIN_ROLES } = require('../middleware/auth');

// Domain Sub-Routers
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const facultyRoutes = require('./faculty.routes');
const labsRoutes = require('./labs.routes');
const pcsRoutes = require('./pcs.routes');
const schedulesRoutes = require('./schedules.routes');
const maintenanceRoutes = require('./maintenance.routes');
const settingsRoutes = require('./settings.routes');
const curriculumRoutes = require('./curriculum.routes');
const iotRoutes = require('./iot.routes');

// ─── 1. MOUNT MODULAR DOMAIN ROUTERS ──────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/user', usersRoutes);
router.use('/faculty', facultyRoutes);
router.use('/laboratories', labsRoutes);
router.use('/pcs', pcsRoutes);
router.use('/schedules', schedulesRoutes);
router.use('/reports', maintenanceRoutes);
router.use('/settings', settingsRoutes);
router.use('/curriculum', curriculumRoutes);
router.use('/occupancy', iotRoutes);

// ─── 2. PRESERVED LEGACY / TOP-LEVEL ROUTE BRIDGES ───────────────────────────
// POST /api/login -> authController.login (active caller: js/pages/login.js)
router.post('/login', authController.login);

// POST /api/logout -> authController.logout (active caller: js/services/user.service.js)
router.post('/logout', requireAuth, authController.logout);

// GET /api/notifications -> maintenanceController.getNotifications (active callers: notification & dashboard services)
router.get('/notifications', requireAuth, maintenanceController.getNotifications);

// GET /api/dashboard/it-head-summary -> schedulesController.getITHeadSummary (active caller: js/pages/it-head-dashboard.js)
router.get('/dashboard/it-head-summary', requireRole(ADMIN_ROLES), schedulesController.getITHeadSummary);

// POST /api/qrcode/scan -> usersController.scanQRCode (compatibility bridge)
router.post('/qrcode/scan', usersController.scanQRCode);

// GET /api/test -> Database & Server Health Check
router.get('/test', async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS result');
        res.json({ message: 'Database connected successfully', result: rows[0].result });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
