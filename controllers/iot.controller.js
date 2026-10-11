'use strict';

const iotService = require('../services/iotService');

async function logOccupancy(req, res, next) {
    const routeStart = performance.now();
    const correlationId = (req.body && (req.body.scanId || req.body.eventId || req.body.clientRequestId))
        ? String(req.body.scanId || req.body.eventId || req.body.clientRequestId)
        : `req-${Date.now().toString(36)}`;

    try {
        // Sanitize incoming log: do not print raw QR payload or secret tokens
        const safeBodySummary = req.body ? {
            roomNumber: req.body.roomNumber,
            authMethod: req.body.authMethod,
            keyEvent: req.body.keyEvent,
            scanId: req.body.scanId,
            eventId: req.body.eventId,
            hasQrString: Boolean(req.body.qrString),
            qrLength: req.body.qrString ? req.body.qrString.length : undefined
        } : {};
        console.log(`[IoT Endpoint] /api/occupancy/log received (Scan #${correlationId}):`, JSON.stringify(safeBodySummary));

        const result = await iotService.logOccupancy(req.body, req.device);
        const durationMs = (performance.now() - routeStart).toFixed(2);
        const status = result.error ? (result.status || 400) : (result.status || 200);

        console.log(`[IoT Backend Timing] Scan #${correlationId} completed in ${durationMs}ms | Status: ${status} | Room: ${req.body ? req.body.roomNumber : 'unknown'}`);

        if (result.error) {
            return res.status(status).json({
                error: result.error,
                lcdLine1: result.lcdLine1,
                lcdLine2: result.lcdLine2,
                correlationId
            });
        }
        return res.status(status).json({
            ...result.data,
            correlationId
        });
    } catch (err) {
        const durationMs = (performance.now() - routeStart).toFixed(2);
        console.error(`[IoT Backend Timing] Scan #${correlationId} failed after ${durationMs}ms:`, err.message);
        next(err);
    }
}

async function heartbeat(req, res, next) {
    const routeStart = performance.now();
    const arrivalTime = new Date().toISOString();
    const sanitizedDeviceId = (req.device && req.device.id)
        ? req.device.id
        : ((req.body && req.body.deviceId) ? String(req.body.deviceId).trim() : 'Unknown-Device');

    try {
        const result = await iotService.recordHeartbeat(req.body, req.device);
        const durationMs = (performance.now() - routeStart).toFixed(2);
        const status = result.error ? (result.status || 400) : (result.status || 200);
        const dbPersisted = result.data ? Boolean(result.data.dbPersisted) : false;

        console.log(`[IoT Heartbeat ${arrivalTime}] Device "${sanitizedDeviceId}" processed in ${durationMs}ms | Status: ${status} | DB Persisted: ${dbPersisted}`);

        if (result.error) {
            return res.status(status).json({
                error: result.error
            });
        }
        return res.status(status).json(result.data || { ok: true });
    } catch (err) {
        const durationMs = (performance.now() - routeStart).toFixed(2);
        console.error(`[IoT Heartbeat ${arrivalTime}] Device "${sanitizedDeviceId}" failed after ${durationMs}ms:`, err.message);
        next(err);
    }
}

async function getHeartbeatStatus(req, res, next) {
    try {
        const { DEFAULT_HARDWARE_ROOMS } = require('../services/iot/iot.config');
        const rooms = DEFAULT_HARDWARE_ROOMS || ['203', '204'];
        const roomStatuses = {};
        for (const r of rooms) {
            roomStatuses[r] = {
                online: iotService.isDeviceOnline(r),
                lastSeen: iotService.getLastSeen(r)
            };
        }
        return res.status(200).json({
            ok: true,
            status: 'operational',
            rooms: roomStatuses,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    logOccupancy,
    heartbeat,
    getHeartbeatStatus
};
