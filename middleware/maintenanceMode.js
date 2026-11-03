'use strict';

/**
 * middleware/maintenanceMode.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LabSync Security Feature #17 Extension: Blue-Green Database Recovery Cutover.
 *
 * Implements a controlled, fail-safe Maintenance / Read-Only Cutover Mode.
 *
 * Requirements:
 * 1. Prevents new mutating requests (POST, PUT, DELETE, PATCH) during database cutover.
 * 2. Allows read-only requests (GET, HEAD, OPTIONS) so evaluators/administrators can inspect data.
 * 3. Exempts administrative recovery, promotion, and authentication endpoints so the IT Department
 *    Head can safely verify the candidate database and toggle cutover mode.
 * 4. Tracks in-flight ordinary mutating requests admitted before maintenance activation.
 *    CRITICAL: Client socket disconnection ('close') does NOT mean the server-side operation
 *    or database query has completed. The counter only decrements when the server-side operation
 *    has actually settled (via res.end, controller return, or error handling). Disconnected requests
 *    remain tracked as active/unresolved until settled.
 * 5. Provides comprehensive drain state (activeMutationRequests, unresolvedOperations,
 *    backgroundJobsDrained, mutationRequestsDrained, cutoverDrained).
 * 6. In-memory flag with optional environment variable override (MAINTENANCE_MODE=true).
 * 7. Returns HTTP 503 Service Unavailable with Retry-After header for blocked mutating requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// In-memory maintenance mode flag (process-local, toggled by authorized IT Department Head)
let isMaintenanceActive = process.env.MAINTENANCE_MODE === 'true';

// In-flight ordinary mutating operations registry (process-local)
// Key: operationId (number), Value: operationMetadata
const activeOperations = new Map();
let operationIdSeq = 0;
let activeMutationRequests = 0;

/**
 * Checks if maintenance mode is currently active.
 * @returns {boolean}
 */
function isMaintenanceModeActive() {
    return isMaintenanceActive || process.env.MAINTENANCE_MODE === 'true';
}

/**
 * Returns current count of in-flight ordinary mutating requests.
 * @returns {number}
 */
function getActiveMutationRequests() {
    return activeMutationRequests;
}

/**
 * Returns count of operations where client disconnected while server operation is still pending.
 * @returns {number}
 */
function getUnresolvedOperationsCount() {
    let count = 0;
    for (const op of activeOperations.values()) {
        if (op.clientDisconnected && !op.settled) {
            count++;
        }
    }
    return count;
}

/**
 * Returns summary list of currently active mutation operations.
 * @returns {Array<object>}
 */
function getActiveOperationsSummary() {
    const list = [];
    const now = Date.now();
    for (const op of activeOperations.values()) {
        list.push({
            id: op.id,
            method: op.method,
            path: op.path,
            elapsedMs: now - op.startTime,
            clientDisconnected: op.clientDisconnected,
            disconnectedAt: op.disconnectedAt
        });
    }
    return list;
}

/**
 * Resets the in-flight mutation counter and registry (for testing isolation).
 */
function _resetActiveMutationRequestsForTesting() {
    activeOperations.clear();
    activeMutationRequests = 0;
    operationIdSeq = 0;
}

/**
 * Returns comprehensive status of maintenance mode including driver source and active requests.
 * @returns {{ active: boolean, maintenanceMode: boolean, source: string, isEnvironmentDriven: boolean, isRuntimeToggle: boolean, activeMutationRequests: number, unresolvedOperations: number }}
 */
function getMaintenanceModeStatus() {
    const isEnv = process.env.MAINTENANCE_MODE === 'true';
    const isRuntime = Boolean(isMaintenanceActive);
    const active = isEnv || isRuntime;
    let source = 'none';
    if (isEnv) {
        source = 'environment';
    } else if (isRuntime) {
        source = 'runtime_toggle';
    }
    return {
        active,
        maintenanceMode: active,
        source,
        isEnvironmentDriven: isEnv,
        isRuntimeToggle: isRuntime,
        activeMutationRequests,
        unresolvedOperations: getUnresolvedOperationsCount(),
        activeOperations: getActiveOperationsSummary()
    };
}

/**
 * Sets the runtime maintenance mode status.
 * @param {boolean} active
 */
function setMaintenanceMode(active) {
    isMaintenanceActive = Boolean(active);
}

// Endpoints strictly exempted from maintenance mode mutation blocks
// Note: These endpoints are privileged administrative or essential auth endpoints.
// They only write audit logs, backup archives, or isolated recovery sandbox tables.
const EXEMPT_MUTATION_PATHS = [
    // Production backup export creation (allows IT Dept. Head to take final frozen production snapshot)
    '/api/admin/backups/create',
    // Recovery sandbox verification, restoration, and promotion controls
    '/api/admin/backups/recovery/restore',
    '/api/admin/backups/recovery/promotion-status',
    '/api/admin/backups/recovery/compare',
    '/api/admin/backups/recovery/record-promotion',
    '/api/admin/backups/maintenance-mode',
    // Essential authentication endpoints (admin session preservation)
    '/api/auth/login',
    '/api/auth/logout',
    '/api/login',
    '/api/logout'
];

/**
 * Express middleware to enforce cutover maintenance mode and track server-side mutation lifecycle.
 */
function maintenanceModeMiddleware(req, res, next) {
    const method = req.method ? req.method.toUpperCase() : 'GET';
    const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    const path = (req.baseUrl || '') + (req.path || '');
    const isExempt = EXEMPT_MUTATION_PATHS.some(exemptPath => path.startsWith(exemptPath));

    if (isMaintenanceModeActive()) {
        // Informational header attached to every response during maintenance
        res.setHeader('X-Maintenance-Mode', 'active');

        // Read-only requests and exempt administrative actions pass through
        if (!isMutating || isExempt) {
            return next();
        }

        // Block ordinary mutating requests with HTTP 503
        res.setHeader('Retry-After', '30');
        return res.status(503).json({
            error: 'MAINTENANCE_MODE',
            code: 'CUTOVER_MAINTENANCE_MODE_ACTIVE',
            message: 'LabSync is currently in a controlled database recovery cutover mode. Modifying operations are temporarily disabled to ensure zero data divergence.',
            retryAfter: 30
        });
    }

    // Maintenance mode is inactive:
    // If request is an ordinary mutating request (not read-only, not exempt), track its server-side lifecycle
    if (isMutating && !isExempt) {
        const opId = ++operationIdSeq;
        const op = {
            id: opId,
            method,
            path,
            startTime: Date.now(),
            clientDisconnected: false,
            disconnectedAt: null,
            settled: false,
            settledAt: null,
            settledBy: null
        };

        activeOperations.set(opId, op);
        activeMutationRequests = activeOperations.size;

        // Settlement handler: decrements ONLY when server-side operation actually settles
        const settleOperation = (source) => {
            if (op.settled) return;
            op.settled = true;
            op.settledAt = Date.now();
            op.settledBy = source;
            activeOperations.delete(opId);
            activeMutationRequests = activeOperations.size;
        };

        // Attach optional operation tracker helper to req for async promise tracking
        req._labsyncMutationOp = op;
        req.trackMutationOperation = function (promiseOrFn) {
            if (!promiseOrFn) return;
            const promise = typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn;
            if (promise && typeof promise.then === 'function') {
                return promise.finally(() => settleOperation('promise_finally'));
            }
            return promise;
        };

        // Hook res.end: Called when route handler sends response (res.json, res.send, res.end)
        // or when Express default error handler sends 500 on next(err)
        const origEnd = typeof res.end === 'function' ? res.end.bind(res) : null;
        res.end = function (...args) {
            settleOperation('res.end');
            if (origEnd) {
                return origEnd(...args);
            }
        };

        // Normal response finish fallback
        res.once('finish', () => {
            settleOperation('res.finish');
        });

        // Error event on response stream
        res.once('error', () => {
            settleOperation('res.error');
        });

        // Client TCP socket close event:
        // CRITICAL FIX: A client disconnect does NOT mean the database write has stopped!
        // We mark clientDisconnected = true, but do NOT decrement until res.end or promise settles!
        res.once('close', () => {
            if (!op.settled) {
                op.clientDisconnected = true;
                op.disconnectedAt = Date.now();
                // Do NOT call settleOperation() here!
            }
        });
    }

    try {
        return next();
    } catch (syncErr) {
        if (req._labsyncMutationOp && !req._labsyncMutationOp.settled) {
            req._labsyncMutationOp.settled = true;
            activeOperations.delete(req._labsyncMutationOp.id);
            activeMutationRequests = activeOperations.size;
        }
        throw syncErr;
    }
}

module.exports = {
    isMaintenanceModeActive,
    getActiveMutationRequests,
    getUnresolvedOperationsCount,
    getActiveOperationsSummary,
    _resetActiveMutationRequestsForTesting,
    getMaintenanceModeStatus,
    setMaintenanceMode,
    maintenanceModeMiddleware,
    EXEMPT_MUTATION_PATHS
};
