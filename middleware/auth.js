'use strict';

/**
 * middleware/auth.js
 * Session authentication & role authorization middleware.
 */

const IT_HEAD_ROLES = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
const ADMIN_ROLES = [...IT_HEAD_ROLES, 'MIS Staff'];
const MIS_STAFF_ROLES = ['MIS Staff'];
const KEY_TRANSFER_ROLES = ['Faculty', ...IT_HEAD_ROLES];

const { INACTIVITY_TIMEOUT_MS } = require('../config/app.config');

function checkSessionInactivity(req, res) {
    const now = Date.now();
    const lastActivity = req.session.lastActivity || now;

    if (now - lastActivity > INACTIVITY_TIMEOUT_MS) {
        req.session.destroy(() => { });
        res.clearCookie('connect.sid');
        res.status(401).json({
            error: 'Your session has expired due to inactivity. Please log in again.',
            code: 'SESSION_EXPIRED'
        });
        return false;
    }

    // Exempt background polling from resetting the inactivity timer
    const isBackgroundPoll = req.headers['x-background-poll'] === 'true' ||
        (req.originalUrl && req.originalUrl.includes('/notifications') && req.headers['x-user-activity'] !== 'true');

    if (!isBackgroundPoll) {
        req.session.lastActivity = now;
    }

    return true;
}

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (!checkSessionInactivity(req, res)) {
        return;
    }

    next();
}

const db = require('../database/connection');

function requireRole(allowedRoles) {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return async function (req, res, next) {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!checkSessionInactivity(req, res)) {
            return;
        }

        try {
            // Authoritative database role verification for protected operations
            const [rows] = await db.query('SELECT Role FROM users WHERE User_ID = ?', [req.session.userId]);
            if (!rows || rows.length === 0) {
                req.session.destroy(() => {});
                res.clearCookie('connect.sid');
                return res.status(401).json({ error: 'User account not found' });
            }

            const currentRole = rows[0].Role;
            const roleChanged = req.session.userRole !== currentRole;
            if (roleChanged) {
                req.session.userRole = currentRole;
            }

            if (!rolesArray.includes(currentRole)) {
                if (roleChanged && req.session) {
                    req.session.save(() => {});
                }
                return res.status(403).json({
                    error: 'Forbidden: Insufficient privileges',
                    code: 'ROLE_REVOKED',
                    currentRole: currentRole
                });
            }

            if (roleChanged && req.session) {
                req.session.save(() => {});
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = {
    requireAuth,
    requireRole,
    ADMIN_ROLES,
    IT_HEAD_ROLES,
    MIS_STAFF_ROLES,
    KEY_TRANSFER_ROLES
};
