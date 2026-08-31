'use strict';

const helmet = require('helmet');
const { isProduction } = require('../config/app.config');

/**
 * LabSync Centralized HTTP Security Headers Middleware
 *
 * Configured using Helmet (^8.3.0) with an environment-aware policy:
 * - Content-Security-Policy: Tailored strictly to verified internal & CDN assets.
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: SAMEORIGIN
 * - Referrer-Policy: strict-origin-when-cross-origin
 * - Permissions-Policy: Disables unused hardware/browser APIs (camera, microphone, etc.)
 * - Cross-Origin-Opener-Policy: same-origin
 * - Cross-Origin-Resource-Policy: same-origin
 * - Strict-Transport-Security: Enabled with 180-day max-age in production only (disabled in dev to preserve HTTP).
 */

const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://unpkg.com',
                'https://cdnjs.cloudflare.com',
                'https://cdn.jsdelivr.net'
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                'https://fonts.googleapis.com'
            ],
            fontSrc: [
                "'self'",
                'https://fonts.gstatic.com',
                'data:'
            ],
            imgSrc: [
                "'self'",
                'data:',
                'blob:',
                'https:'
            ],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false, // Disabled to ensure cross-origin CDN assets (Lucide, Google Fonts, xlsx) are not blocked by the browser
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'sameorigin' },
    hidePoweredBy: true,
    hsts: isProduction ? {
        maxAge: 15552000, // 180 days
        includeSubDomains: false,
        preload: false
    } : false,
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
});

function securityHeaders(req, res, next) {
    // Apply Helmet security headers
    helmetMiddleware(req, res, (err) => {
        if (err) return next(err);

        // Apply Permissions-Policy (Feature Policy) to restrict sensitive browser APIs
        res.setHeader(
            'Permissions-Policy',
            'camera=(), microphone=(), geolocation=(), payment=(), usb=(), vr=()'
        );

        next();
    });
}

module.exports = securityHeaders;
