'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware for LabSync Authentication & Credential Recovery
 *
 * Configured per security specifications:
 * - loginLimiter: 10 requests / 15 minutes per IP
 * - passwordRecoveryLimiter: 5 requests / 15 minutes per IP
 * - passwordResetLimiter: 10 requests / 15 minutes per IP
 * - validateResetTokenLimiter: 20 requests / 15 minutes per IP
 *
 * Uses standard RFC Draft-6/Draft-7 RateLimit-* headers.
 * Does not expose internal implementation details or create account enumeration.
 */

// 1. Login Rate Limiter (Brute-force protection for login attempts)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        error: 'Too many login attempts. Please try again after 15 minutes.'
    }
});

// 2. Password Recovery Rate Limiter (Protection against email flood & SMTP exhaustion)
const passwordRecoveryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        error: 'Too many password recovery attempts. Please try again after 15 minutes.'
    }
});

// 3. Password Reset Rate Limiter (Protection against reset token guessing / reset spam)
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        error: 'Too many password reset attempts. Please try again after 15 minutes.'
    }
});

// 4. Reset Token Validation Rate Limiter (Protection against automated token enumeration)
const validateResetTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        valid: false,
        error: 'Too many validation attempts. Please try again later.'
    }
});

// 5. Public Found Key Report Rate Limiter (Spam protection for public found key reports)
const publicReportLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        error: 'Too many key report submissions from this IP. Please try again after 15 minutes.'
    }
});

// 6. Public PC Report Rate Limiter (General spam protection: 5 reports / 10 minutes per IP)
const publicPCReportLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // 5 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        error: 'Too many reports submitted. Please try again in a moment.'
    }
});

// 7. Public PC Duplicate Rate Limiter (Cooldown for same PC: 1 report / 1 minute per IP + PC)
const pcDuplicateReportLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1, // 1 report per PC per window
    skipFailedRequests: true,
    validate: { keyGeneratorIpFallback: false, ipv6SubnetOrKeyGenerator: false, default: true },
    keyGenerator: (req) => {
        const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
        const room = req.body && req.body.roomNumber ? String(req.body.roomNumber).trim() : '0';
        const pc = req.body && req.body.pcNumber ? String(req.body.pcNumber).trim() : '0';
        return `${ip}__${room}__${pc}`;
    },
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
        error: 'A report was recently submitted for this PC. Please wait a moment before submitting another.'
    }
});

module.exports = {
    loginLimiter,
    passwordRecoveryLimiter,
    passwordResetLimiter,
    validateResetTokenLimiter,
    publicReportLimiter,
    publicPCReportLimiter,
    pcDuplicateReportLimiter
};

