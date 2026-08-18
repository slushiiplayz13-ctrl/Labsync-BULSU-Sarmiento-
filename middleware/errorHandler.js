'use strict';

/**
 * middleware/errorHandler.js
 * Centralized Express error handling middleware.
 */

function errorHandler(err, req, res, next) {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
