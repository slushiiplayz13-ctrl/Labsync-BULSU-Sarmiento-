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
const settingsController = require('../controllers/settings.controller');

// Authorization Middlewares
const { requireAuth, requireRole, ADMIN_ROLES, IT_HEAD_ROLES } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

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
const keysRoutes = require('./keys.routes');

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
router.use('/keys', keysRoutes);


// ─── 2. PRESERVED LEGACY / TOP-LEVEL ROUTE BRIDGES ───────────────────────────
// POST /api/login -> authController.login (active caller: js/pages/login.js)
router.post('/login', loginLimiter, authController.login);

// POST /api/logout -> authController.logout (active caller: js/services/user.service.js)
router.post('/logout', requireAuth, authController.logout);

// POST /api/touch-session -> authController.touchSession (active session refresh)
router.post('/touch-session', requireAuth, authController.touchSession);

// GET /api/notifications -> maintenanceController.getNotifications (active callers: notification & dashboard services)
router.get('/notifications', requireAuth, maintenanceController.getNotifications);

// GET /api/dashboard/it-head-summary -> schedulesController.getITHeadSummary (active caller: js/pages/it-head-dashboard.js)
router.get('/dashboard/it-head-summary', requireRole(IT_HEAD_ROLES), schedulesController.getITHeadSummary);

// POST /api/qrcode/scan -> usersController.scanQRCode (compatibility bridge)
router.post('/qrcode/scan', usersController.scanQRCode);

// GET /api/health -> Lightweight unauthenticated liveness endpoint (Recommended Railway Healthcheck Path)
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// GET /api/health/db -> Database readiness endpoint
router.get('/health/db', async (req, res) => {
    try {
        const pool = require('../database/connection');
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok', database: 'connected' });
    } catch (err) {
        res.status(503).json({ status: 'error', database: 'disconnected' });
    }
});

// GET /api/test -> Database & Server Health Check (backward compatibility alias)
router.get('/test', settingsController.healthCheck);

// Fallback 404 JSON handler for unmatched /api routes
router.use((req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

module.exports = router;
