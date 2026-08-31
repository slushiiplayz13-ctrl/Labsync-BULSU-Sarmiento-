'use strict';

/**
 * middleware/errorHandler.js
 * Centralized Express error handling middleware.
 * Guarantees that internal stack traces, database credentials, and SQL syntax
 * are never exposed in production HTTP responses.
 */

const { IS_PRODUCTION } = require('../config/app.config');

function errorHandler(err, req, res, next) {
    console.error('[Unhandled Server Error]', err);

    // If headers already sent, delegate to default Express handler
    if (res.headersSent) {
        return next(err);
    }

    const isProd = process.env.NODE_ENV === 'production';
    const statusCode = (err.status && typeof err.status === 'number' && err.status >= 400 && err.status < 600)
        ? err.status
        : (err.statusCode && typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600)
            ? err.statusCode
            : 500;

    // Production mode returns safe generic error messages for 5xx server errors
    const errorMessage = (isProd && statusCode >= 500)
        ? 'Internal server error'
        : (err.message || 'Internal server error');

    res.status(statusCode).json({
        error: errorMessage,
        ...(isProd ? {} : { stack: err.stack })
    });
}

module.exports = errorHandler;
