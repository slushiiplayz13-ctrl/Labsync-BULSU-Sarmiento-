'use strict';

const crypto = require('crypto');
const iotRepository = require('../repositories/iot.repository');
const auditService = require('../services/auditService');
const { IS_PRODUCTION } = require('../config/app.config');

const ENFORCE_IOT_AUTH = process.env.ENFORCE_IOT_AUTH === 'true' || IS_PRODUCTION;

/**
 * IoT Authentication Middleware
 * Authenticates incoming device requests via Bearer token (or X-Device-Token header).
 * Verifies against SHA-256 hash in `iot_devices`.
 * Attaches verified server-side device identity (`req.device`) to the request.
 *
 * In development / local testing environments (when ENFORCE_IOT_AUTH is not explicitly true),
 * allows hardware prototypes without provisioned bearer tokens to connect gracefully
 * using fallback device identification.
 */
async function requireIoTAuth(req, res, next) {
    try {
        let rawToken = null;
        const authHeader = req.headers['authorization'] || req.headers['Authorization'];

        if (authHeader && typeof authHeader === 'string') {
            const match = authHeader.match(/^Bearer\s+(.+)$/i);
            if (match) {
                rawToken = match[1].trim();
            }
        } else if (req.headers['x-device-token'] && typeof req.headers['x-device-token'] === 'string') {
            rawToken = req.headers['x-device-token'].trim();
        }

        let device = null;

        if (rawToken) {
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            const [devices] = await iotRepository.findByTokenHash(tokenHash);

            if (devices.length > 0) {
                device = devices[0];
            } else if (!ENFORCE_IOT_AUTH) {
                // Non-production fallback if token doesn't match DB hash yet (e.g. placeholder token)
                const deviceId = (req.body && req.body.deviceId) || 'ESP32-KeyBox';
                const [fallbackDevices] = await iotRepository.findDeviceById(deviceId);
                if (fallbackDevices.length > 0) {
                    device = fallbackDevices[0];
                }
            }
        } else if (!ENFORCE_IOT_AUTH) {
            // Non-production fallback for legacy/unauthenticated hardware prototypes
            const deviceId = (req.body && req.body.deviceId) || 'ESP32-KeyBox';
            const [fallbackDevices] = await iotRepository.findDeviceById(deviceId);
            if (fallbackDevices.length > 0) {
                device = fallbackDevices[0];
            }
        }

        if (!device) {
            const failureReason = !rawToken ? 'Missing token header' : 'Unrecognized credential';
            auditService.logSecurityEvent({
                req,
                action: 'IOT_AUTH_FAILURE',
                resourceType: 'IOT_DEVICE',
                result: 'DENIED',
                details: { reason: failureReason }
            });
            return res.status(401).json({
                error: !rawToken
                    ? 'IoT device authentication required. Missing bearer token.'
                    : 'Invalid or unrecognized IoT device credential.',
                lcdLine1: 'Access Denied',
                lcdLine2: !rawToken ? 'Missing Token' : 'Invalid Device'
            });
        }

        if (!device.Is_Active || device.Is_Active === 0) {
            auditService.logSecurityEvent({
                req,
                action: 'IOT_AUTH_FAILURE',
                resourceType: 'IOT_DEVICE',
                resourceId: device.Device_ID,
                result: 'DENIED',
                details: { reason: 'Device is deactivated' }
            });
            return res.status(403).json({
                error: 'IoT device is inactive or disabled.',
                lcdLine1: 'Access Denied',
                lcdLine2: 'Device Inactive'
            });
        }

        let authorizedRooms = [];
        if (device.Authorized_Rooms) {
            try {
                const parsed = JSON.parse(device.Authorized_Rooms);
                if (Array.isArray(parsed)) {
                    authorizedRooms = parsed.map(r => String(r).trim());
                }
            } catch (e) {
                authorizedRooms = String(device.Authorized_Rooms).split(',').map(r => r.trim());
            }
        }

        // Update device last seen timestamp in DB asynchronously
        iotRepository.updateDeviceLastSeen(device.Device_ID).catch(err => {
            console.error('[IoT Auth] Failed to update device Last_Seen:', err.message);
        });

        // Attach verified server-side device identity and authorized rooms
        req.device = {
            id: device.Device_ID,
            name: device.Device_Name,
            authorizedRooms
        };

        next();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    requireIoTAuth
};
