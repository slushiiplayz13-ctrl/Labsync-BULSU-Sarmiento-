'use strict';

/**
 * repositories/audit.repository.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Data access layer for persistent audit logs.
 * Parameterized INSERT and SELECT operations only (No public/user UPDATE or DELETE).
 */

const db = require('../database/connection');

/**
 * Inserts a single immutable audit log record.
 *
 * @param {object} params
 * @param {number|null} [params.userId]
 * @param {string|null} [params.actorEmail]
 * @param {string|null} [params.actorRole]
 * @param {string} params.action
 * @param {string} params.resourceType
 * @param {string|number|null} [params.resourceId]
 * @param {string|null} [params.details]
 * @param {string} [params.result]
 * @param {string|null} [params.ipAddress]
 * @param {object} [executor]
 * @returns {Promise<any>}
 */
async function insertAuditLog(
    {
        userId = null,
        actorEmail = null,
        actorRole = null,
        action,
        resourceType,
        resourceId = null,
        details = null,
        result = 'SUCCESS',
        ipAddress = null
    },
    executor = db
) {
    const stringResourceId = resourceId !== null && resourceId !== undefined ? String(resourceId) : null;
    const stringDetails = (details !== null && details !== undefined)
        ? (typeof details === 'string' ? details : JSON.stringify(details))
        : null;

    return executor.query(
        `INSERT INTO audit_logs 
        (User_ID, Actor_Email, Actor_Role, Action, Resource_Type, Resource_ID, Details, Result, IP_Address) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, actorEmail, actorRole, action, resourceType, stringResourceId, stringDetails, result, ipAddress]
    );
}

/**
 * Retrieves audit logs with pagination for administrative inspection.
 *
 * @param {object} params
 * @param {number} [params.limit]
 * @param {number} [params.offset]
 * @param {string} [params.action]
 * @param {object} [executor]
 * @returns {Promise<any>}
 */
async function findAuditLogs({ limit = 50, offset = 0, action = null } = {}, executor = db) {
    const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    if (action) {
        return executor.query(
            `SELECT Log_ID, User_ID, Actor_Email, Actor_Role, Action, Resource_Type, Resource_ID, Details, Result, IP_Address, Created_At 
             FROM audit_logs 
             WHERE Action = ? 
             ORDER BY Log_ID DESC 
             LIMIT ? OFFSET ?`,
            [action, safeLimit, safeOffset]
        );
    }

    return executor.query(
        `SELECT Log_ID, User_ID, Actor_Email, Actor_Role, Action, Resource_Type, Resource_ID, Details, Result, IP_Address, Created_At 
         FROM audit_logs 
         ORDER BY Log_ID DESC 
         LIMIT ? OFFSET ?`,
        [safeLimit, safeOffset]
    );
}

module.exports = {
    insertAuditLog,
    findAuditLogs
};
