'use strict';

/**
 * services/auditService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralized audit logging service for security accountability.
 * Enforces non-blocking execution and sensitive-data exclusion.
 */

const auditRepository = require('../repositories/audit.repository');

const FORBIDDEN_SENSITIVE_KEYS = new Set([
    'password',
    'currentpassword',
    'newpassword',
    'passwordhash',
    'reset_token',
    'email_verify_token',
    'session_secret',
    'db_password',
    'email_pass',
    'authorization',
    'bearer',
    'token',
    'devicetoken',
    'token_hash'
]);

/**
 * Recursively sanitizes an object to remove any forbidden sensitive fields.
 *
 * @param {any} data
 * @returns {any}
 */
function sanitizeDetails(data) {
    if (!data || typeof data !== 'object') {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(sanitizeDetails);
    }

    const clean = {};
    for (const [key, value] of Object.entries(data)) {
        if (FORBIDDEN_SENSITIVE_KEYS.has(key.toLowerCase())) {
            continue;
        }
        if (value && typeof value === 'object') {
            clean[key] = sanitizeDetails(value);
        } else {
            clean[key] = value;
        }
    }
    return clean;
}

/**
 * Logs a high-value security or administrative audit event.
 * Executes asynchronously and non-blockingly (failures log to console.error, never crashing business flow).
 *
 * @param {object} params
 * @param {object} [params.req] - Express request object for deriving IP and session actor
 * @param {number|null} [params.userId] - Explicit user ID if known
 * @param {string|null} [params.actorEmail] - Explicit actor email if known
 * @param {string|null} [params.actorRole] - Explicit actor role if known
 * @param {string} params.action - High-level action category (e.g. 'LOGIN', 'FACULTY_ROLE_UPDATE')
 * @param {string} params.resourceType - Target resource type (e.g. 'USER', 'FACULTY', 'SCHEDULE')
 * @param {string|number|null} [params.resourceId] - Specific resource identifier
 * @param {object|string|null} [params.details] - Safe structured details
 * @param {string} [params.result] - 'SUCCESS', 'FAILURE', or 'DENIED'
 * @returns {Promise<boolean>}
 */
async function logSecurityEvent({
    req = null,
    userId = null,
    actorEmail = null,
    actorRole = null,
    action,
    resourceType,
    resourceId = null,
    details = null,
    result = 'SUCCESS'
}) {
    try {
        // Derive actor from trusted server-side session if available
        let resolvedUserId = userId;
        let resolvedRole = actorRole;
        let resolvedEmail = actorEmail;

        if (req && req.session) {
            if (resolvedUserId === null && req.session.userId) {
                resolvedUserId = req.session.userId;
            }
            if (resolvedRole === null && req.session.userRole) {
                resolvedRole = req.session.userRole;
            }
            if (resolvedEmail === null && req.session.userEmail) {
                resolvedEmail = req.session.userEmail;
            }
        }

        // Derive IP address safely from Express request
        let ipAddress = null;
        if (req) {
            ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || null;
            if (typeof ipAddress === 'string' && ipAddress.startsWith('::ffff:')) {
                ipAddress = ipAddress.replace('::ffff:', '');
            }
        }

        // Sanitize details to guarantee zero secrets are recorded
        const sanitized = details ? sanitizeDetails(details) : null;

        await auditRepository.insertAuditLog({
            userId: resolvedUserId,
            actorEmail: resolvedEmail,
            actorRole: resolvedRole,
            action,
            resourceType,
            resourceId,
            details: sanitized,
            result,
            ipAddress
        });

        return true;
    } catch (err) {
        console.error('[Audit Error] Failed to write audit log:', err.message);
        return false;
    }
}

module.exports = {
    logSecurityEvent,
    sanitizeDetails
};
