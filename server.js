'use strict';

/**
 * server.js
 * LabSync Express Server Entry Point.
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const session = require('express-session');

const {
    PORT,
    SESSION_SECRET,
    SESSION_MAX_AGE,
    COOKIE_SECURE,
    IS_PRODUCTION,
    isOriginAllowed,
    validateProductionConfig
} = require('./config/app.config');

const { initializeDatabase } = require('./services/dbInit');
const { initActivityLogRetention, stopRetentionSchedule } = require('./services/activityRetentionService');
const errorHandler = require('./middleware/errorHandler');
const securityHeaders = require('./middleware/securityHeaders');
const apiRoutes = require('./routes');

// Fail-fast in production if mandatory secrets or DB variables are missing
validateProductionConfig();

const app = express();

// Disable Express fingerprinting header
app.disable('x-powered-by');

// Apply centralized HTTP security headers (Helmet, CSP, Permissions-Policy)
app.use(securityHeaders);

// Trust proxy for secure cookies behind reverse proxies (Railway, Render, Nginx, Ngrok)
app.set('trust proxy', 1);

// Middleware configuration
app.use(cors({
    origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin));
    },
    credentials: true
}));
// Scoped body parser for user profile updates (supports base64 profile photos up to 10mb)
app.put(['/api/user/update', '/api/user/profile', '/api/users/update', '/api/users/profile'], express.json({ limit: '10mb' }));

// Conservative global body limits for all other endpoints (prevents large-body DoS attacks)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Session configuration
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE
    }
}));

// Scoped public static asset mounts (isolated to dedicated public directories)
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'ignore', index: false }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'ignore', index: false }));
app.use('/assets', express.static(path.join(__dirname, 'assets'), { dotfiles: 'ignore', index: false }));
app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'style.css'));
});

// Mount centralized API router (all domain routes and legacy compatibility aliases)
app.use('/api', apiRoutes);

// Approved frontend page routes (default-deny allowlist)
const APPROVED_HTML_PAGES = new Set([
    'faculty-management.html',
    'faculty-pc-reports.html',
    'index.html',
    'it-head-dashboard.html',
    'it-head-my-schedule.html',
    'it-head-pc-reports.html',
    'it-head-room-status.html',
    'key-found.html',
    'key-transfer.html',
    'login.html',
    'master-schedule.html',
    'mis-keys.html',
    'mis-maintenance.html',
    'mis-ojt.html',
    'mis-qr-generator.html',
    'mis-staff-dashboard.html',
    'my-schedule.html',
    'print-all-schedules.html',
    'print-schedule.html',
    'reset-password.html',
    'room-schedule-editor.html',
    'room-status.html',
    'submit-pc-report.html'
]);

// Root landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Legacy key-transfer redirect for faculty
app.get('/faculty-dashboard.html', (req, res) => {
    res.redirect('/index.html');
});

// Approved HTML pages
app.get('/:page.html', (req, res, next) => {
    const page = `${req.params.page.toLowerCase()}.html`;
    if (APPROVED_HTML_PAGES.has(page)) {
        return res.sendFile(path.join(__dirname, page));
    }
    next();
});

// Fallback 404 handler for unmatched requests
app.use((req, res) => {
    res.status(404).send('Not Found');
});

// Centralized error handling middleware
app.use(errorHandler);

// Global process safety handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

let handlingUncaughtException = false;

process.on('uncaughtException', (err) => {
    if (handlingUncaughtException) {
        process.exit(1);
    }

    handlingUncaughtException = true;

    try {
        console.error('[Process] Uncaught Exception:', err);
    } catch (_) {
        // Ignore logging failures, such as a closed stdout/stderr pipe.
    }

    if (IS_PRODUCTION) {
        process.exit(1);
    }

    handlingUncaughtException = false;
});

// Graceful shutdown handling for Railway / container lifecycle (SIGTERM, SIGINT)
let server = null;
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

    // Stop background timers
    stopRetentionSchedule();

    if (server) {
        // Stop accepting new connections
        server.close(async () => {
            console.log('[Server] HTTP server closed.');
            try {
                const pool = require('./database/connection');
                await pool.end();
                console.log('[Server] Database pool closed.');
            } catch (dbErr) {
                console.error('[Server Error] Error closing database pool:', dbErr.message);
            }
            console.log('[Server] Graceful shutdown completed.');
            process.exit(0);
        });
    } else {
        try {
            const pool = require('./database/connection');
            await pool.end();
            console.log('[Server] Database pool closed.');
        } catch (dbErr) {
            console.error('[Server Error] Error closing database pool:', dbErr.message);
        }
        process.exit(0);
    }

    // Fallback safety timeout if connections do not close within 10s
    setTimeout(() => {
        console.error('[Server Error] Forced shutdown after timeout.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Application startup sequencing: await database readiness and migrations before listening
async function startServer() {
    try {
        // 1. Await database initialization and migrations
        await initializeDatabase();

        // 2. Initialize background services only after database is ready
        initActivityLogRetention();

        // 3. Start HTTP server only after database initialization succeeds
        server = app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[Server Error] Port ${PORT} is already in use. Please close the other process and restart.`);
                process.exit(1);
            }

            console.error('[Server Error]', err);
        });
    } catch (err) {
        console.error('[Startup Error] Fatal database initialization failure:', err.message);
        try {
            const pool = require('./database/connection');
            await pool.end();
        } catch (dbErr) {
            // Ignore connection pool close errors on fatal abort
        }
        process.exit(1);
    }
}

startServer();

module.exports = app;
