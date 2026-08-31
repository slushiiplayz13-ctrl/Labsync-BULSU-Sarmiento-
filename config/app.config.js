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
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE_SECURE = process.env.COOKIE_SECURE !== undefined ? process.env.COOKIE_SECURE === 'true' : IS_PRODUCTION;

/**
 * Returns the Set of explicitly allowed origins for CORS.
 * Uses exact origin matching without substring or wildcard matching.
 *
 * @returns {Set<string>}
 */
function getAllowedOrigins() {
    const allowed = new Set();

    // Default local development origins based on configured PORT
    allowed.add(`http://localhost:${PORT}`);
    allowed.add(`http://127.0.0.1:${PORT}`);

    // Configured primary application URL (e.g. production domain or local dev URL)
    if (APP_URL) {
        allowed.add(APP_URL.replace(/\/+$/, ''));
    }

    // Additional allowed origins from environment (comma-separated)
    if (process.env.ALLOWED_ORIGINS) {
        process.env.ALLOWED_ORIGINS.split(',').forEach(origin => {
            const trimmed = origin.trim().replace(/\/+$/, '');
            if (trimmed) allowed.add(trimmed);
        });
    }

    if (process.env.CORS_ORIGIN) {
        process.env.CORS_ORIGIN.split(',').forEach(origin => {
            const trimmed = origin.trim().replace(/\/+$/, '');
            if (trimmed) allowed.add(trimmed);
        });
    }

    return allowed;
}

/**
 * Validates CORS origins using exact allow-list matching.
 *
 * @param {string|undefined} origin - The requesting origin (undefined for same-origin/non-browser clients)
 * @returns {boolean}
 */
function isOriginAllowed(origin) {
    // Non-browser clients (e.g. ESP32, curl, server-to-server) or same-origin requests without an Origin header
    if (!origin) {
        return true;
    }

    const normalizedOrigin = origin.trim().replace(/\/+$/, '');
    const allowedOrigins = getAllowedOrigins();

    return allowedOrigins.has(normalizedOrigin);
}

/**
 * Validates mandatory production configuration.
 * Fails fast with descriptive errors if critical secrets or database variables are missing.
 */
function validateProductionConfig() {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
        const errors = [];

        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim() === 'labsync-secret-key-change-in-production') {
            errors.push('SESSION_SECRET must be set to a secure, random secret in production.');
        }

        if (!process.env.DB_HOST) {
            errors.push('DB_HOST environment variable is missing.');
        }

        if (!process.env.DB_USER) {
            errors.push('DB_USER environment variable is missing.');
        }

        if (process.env.DB_PASSWORD === undefined) {
            errors.push('DB_PASSWORD environment variable is missing.');
        }

        if (!process.env.DB_NAME) {
            errors.push('DB_NAME environment variable is missing.');
        }

        if (!process.env.APP_URL) {
            errors.push('APP_URL environment variable is missing.');
        }

        if (errors.length > 0) {
            const errorMessage = `[Production Configuration Error]\n- ${errors.join('\n- ')}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    }
}

module.exports = {
    PORT,
    APP_URL,
    SESSION_SECRET,
    SESSION_MAX_AGE,
    IS_PRODUCTION,
    COOKIE_SECURE,
    getAllowedOrigins,
    isOriginAllowed,
    validateProductionConfig
};
