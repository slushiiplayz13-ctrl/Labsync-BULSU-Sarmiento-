'use strict';

/**
 * services/dbInit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Delegates schema initialization to database/migrate.js.
 */

const { runMigrations } = require('../database/migrate');

async function initializeDatabase() {
    try {
        await runMigrations();
        console.log('[dbInit] Database initialisation complete.');
    } catch (err) {
        console.error('[dbInit] Database initialisation failed:', err.message);
        if (process.env.NODE_ENV === 'production') {
            throw err;
        }
    }
}

module.exports = { initializeDatabase };
