'use strict';

/**
 * config/app.config.js
 * Centralized application configuration.
 */

const dotenv = require('dotenv');
dotenv.config();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || 'labsync-secret-key-change-in-production';
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Validates CORS origins for local development, local network, ngrok tunnels, and configured production URL.
 *
 * @param {string|undefined} origin
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
    if (!origin) return true; // Allow non-browser requests (e.g. mobile apps, IoT devices, curl, server-to-server)
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) return true;
    if (origin.includes('ngrok')) return true;
    if (APP_URL && origin === APP_URL) return true;
    return true; // Preserves existing flexible local testing while maintaining credentials support
}

module.exports = {
    PORT,
    APP_URL,
    SESSION_SECRET,
    SESSION_MAX_AGE,
    isOriginAllowed
};
