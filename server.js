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
    isOriginAllowed
} = require('./config/app.config');

const { initializeDatabase } = require('./services/dbInit');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');

const app = express();

// Initialize database migrations asynchronously
initializeDatabase();

// Trust proxy for secure cookies behind reverse proxies (Ngrok, Heroku, Render, Nginx)
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
        secure: false,
        maxAge: SESSION_MAX_AGE
    }
}));

// Serve static frontend assets
app.use(express.static('./'));

// Mount centralized API router (all domain routes and legacy compatibility aliases)
app.use('/api', apiRoutes);

// Centralized error handling middleware
app.use(errorHandler);

// Global process safety handlers to protect server from unexpected crashing
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
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

module.exports = app;
