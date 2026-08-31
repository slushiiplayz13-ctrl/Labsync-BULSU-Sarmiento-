'use strict';

/**
 * middleware/auth.js
 * Session authentication & role authorization middleware.
 */

const IT_HEAD_ROLES = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
const ADMIN_ROLES = [...IT_HEAD_ROLES, 'MIS Staff'];
const MIS_STAFF_ROLES = ['MIS Staff'];

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

function requireRole(allowedRoles) {
    const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    return function (req, res, next) {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const userRole = req.session.userRole;
        if (!userRole || !rolesArray.includes(userRole)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }

        next();
    };
}

module.exports = {
    requireAuth,
    requireRole,
    ADMIN_ROLES,
    IT_HEAD_ROLES,
    MIS_STAFF_ROLES
};
