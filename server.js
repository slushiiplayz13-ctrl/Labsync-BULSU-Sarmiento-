'use strict';

/**
 * server.js
 * LabSync Express Server Entry Point.
 */

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

// Initialize database migrations asynchronously
initializeDatabase().catch(err => {
    console.error('[Startup Error] Fatal database initialization failure:', err.message);
    if (IS_PRODUCTION) {
        process.exit(1);
    }
});

// Trust proxy for secure cookies behind reverse proxies (Railway, Render, Nginx, Ngrok)
app.set('trust proxy', 1);

// Middleware configuration
app.use(cors({
    origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin));
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Serve static frontend assets
app.use(express.static('./'));

// Mount centralized API router (all domain routes and legacy compatibility aliases)
app.use('/api', apiRoutes);

// Centralized error handling middleware
app.use(errorHandler);

// Global process safety handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
    if (IS_PRODUCTION) {
        process.exit(1);
    }
});

// Start HTTP server
const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[Server Error] Port ${PORT} is already in use. Please close the other process and restart.`);
    } else {
        console.error('[Server Error]', err);
    }
});

// Graceful shutdown handling for Railway / container lifecycle (SIGTERM, SIGINT)
let isShuttingDown = false;

async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`);

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

    // Fallback safety timeout if connections do not close within 10s
    setTimeout(() => {
        console.error('[Server Error] Forced shutdown after timeout.');
        process.exit(1);
    }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
