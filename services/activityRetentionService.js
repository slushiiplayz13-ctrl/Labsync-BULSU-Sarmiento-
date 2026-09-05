'use strict';

/**
 * services/activityRetentionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dedicated retention coordinator for Room Status Activity Logs.
 *
 * Policy:
 * Room Status activity logs are retained for one year. Logs older than one year
 * are automatically cleaned up to control database growth and maintain system performance.
 *
 * Retention Rule:
 * Retain: Current date -> one calendar year ago
 * Delete: Anything older than the one-calendar-year cutoff
 *
 * Uses direct, indexed SQL deletion without loading log records into memory.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const occupancyRepository = require('../repositories/occupancy.repository');

// Default cleanup interval: Daily (24 hours in milliseconds)
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let _retentionTimer = null;

/**
 * Calculates the exact one-calendar-year cutoff date relative to baseDate.
 * Uses strict calendar-year subtraction rather than a fixed 365-day approximation.
 * e.g., September 5, 2026 -> September 5, 2025.
 * Correctly clamps leap day (Feb 29) to Feb 28 in non-leap years.
 *
 * @param {Date} [baseDate=new Date()]
 * @returns {Date}
 */
function calculateOneCalendarYearCutoff(baseDate = new Date()) {
    const d = new Date(baseDate);
    const targetYear = d.getFullYear() - 1;
    const originalMonth = d.getMonth();

    d.setFullYear(targetYear);

    // If leap day rolls into March, clamp to last day of February
    if (d.getMonth() !== originalMonth) {
        d.setDate(0);
    }

    return d;
}

/**
 * Formats a Date object as MySQL DATETIME string: 'YYYY-MM-DD HH:mm:ss'
 * @param {Date} date
 * @returns {string}
 */
function formatDateTimeForSql(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

/**
 * Executes the retention cleanup.
 * Removes records in `occupancy_log` strictly older than the calculated cutoff.
 * Does not load rows into application memory and utilizes indexed Access_Time.
 *
 * @param {object} [options={}]
 * @param {Date} [options.customCutoff] - Optional explicit cutoff for manual/test execution.
 * @param {Date} [options.baseDate] - Reference date to calculate 1-year cutoff from (defaults to now).
 * @returns {Promise<{ success: boolean, deletedCount: number, cutoffDate: string, durationMs: number, error?: string }>}
 */
async function runRetentionCleanup(options = {}) {
    const startTime = Date.now();
    const cutoffDate = options.customCutoff || calculateOneCalendarYearCutoff(options.baseDate || new Date());
    const sqlCutoff = formatDateTimeForSql(cutoffDate);

    try {
        const [result] = await occupancyRepository.deleteLogsOlderThan(sqlCutoff);
        const durationMs = Date.now() - startTime;
        const deletedCount = result && typeof result.affectedRows === 'number' ? result.affectedRows : 0;

        if (deletedCount > 0) {
            console.log(`[ActivityRetention] Pruned ${deletedCount} activity log(s) older than ${sqlCutoff} in ${durationMs}ms.`);
        } else {
            console.log(`[ActivityRetention] Verified retention policy. No records older than ${sqlCutoff} found (${durationMs}ms).`);
        }

        return {
            success: true,
            deletedCount,
            cutoffDate: sqlCutoff,
            durationMs
        };
    } catch (err) {
        const durationMs = Date.now() - startTime;
        console.error('[ActivityRetention] Error during activity log retention cleanup:', err.message);
        return {
            success: false,
            deletedCount: 0,
            cutoffDate: sqlCutoff,
            durationMs,
            error: err.message
        };
    }
}

/**
 * Initializes automatic background retention cleanup.
 * 1. Executes an initial cleanup run on startup with fail-safe error trapping.
 * 2. Schedules a recurring 24-hour interval timer (unref'd to permit graceful exit).
 *
 * @param {number} [intervalMs=CLEANUP_INTERVAL_MS]
 */
function initActivityLogRetention(intervalMs = CLEANUP_INTERVAL_MS) {
    if (_retentionTimer) {
        clearInterval(_retentionTimer);
        _retentionTimer = null;
    }

    console.log('[ActivityRetention] Initializing Room Status activity log retention service (1-year policy).');

    // Run initial startup cleanup asynchronously without blocking startup
    setImmediate(async () => {
        try {
            await runRetentionCleanup();
        } catch (err) {
            console.error('[ActivityRetention] Startup cleanup error (non-fatal):', err.message);
        }
    });

    // Schedule daily recurring background cleanup
    _retentionTimer = setInterval(async () => {
        try {
            await runRetentionCleanup();
        } catch (err) {
            console.error('[ActivityRetention] Scheduled cleanup error (non-fatal):', err.message);
        }
    }, intervalMs);

    // Prevent background timer from hanging process during shutdown or tests
    if (_retentionTimer && typeof _retentionTimer.unref === 'function') {
        _retentionTimer.unref();
    }
}

/**
 * Stops the scheduled retention timer.
 * Called during graceful server shutdown.
 */
function stopRetentionSchedule() {
    if (_retentionTimer) {
        clearInterval(_retentionTimer);
        _retentionTimer = null;
        console.log('[ActivityRetention] Activity log retention scheduler stopped.');
    }
}

module.exports = {
    calculateOneCalendarYearCutoff,
    formatDateTimeForSql,
    runRetentionCleanup,
    initActivityLogRetention,
    stopRetentionSchedule,
    CLEANUP_INTERVAL_MS
};
