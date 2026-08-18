'use strict';

const authService = require('../services/authService');

async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        const result = await authService.loginUser(email, password);

        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }

        const user = result.rawUser;
        req.session.userId = user.User_ID;
        req.session.userEmail = user.Email;
        req.session.userName = user.Name;
        req.session.userRole = user.Role;

        return res.status(200).json(result.data);
    } catch (err) {
        next(err);
    }
}

async function logout(req, res, next) {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        return res.json({ message: 'Logged out successfully' });
    });
}

async function checkAuth(req, res) {
    if (req.session && req.session.userId) {
        return res.json({ authenticated: true, userId: req.session.userId });
    } else {
        return res.json({ authenticated: false });
    }
}

async function recoverPassword(req, res, next) {
    try {
        const { email } = req.body;
        const result = await authService.recoverPassword(email);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

async function validateResetToken(req, res, next) {
    try {
        const { token } = req.query;
        const result = await authService.validateResetToken(token);
        if (result.error) {
            return res.status(result.status).json({ valid: false, error: result.error });
        }
        return res.status(result.status).json({ valid: true });
    } catch (err) {
        next(err);
    }
}

async function resetPassword(req, res, next) {
    try {
        const { token, password } = req.body;
        const result = await authService.resetPassword(token, password);
        if (result.error) {
            return res.status(result.status).json({ error: result.error });
        }
        return res.status(result.status).json({ message: result.message });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    login,
    logout,
    checkAuth,
    recoverPassword,
    validateResetToken,
    resetPassword
};
