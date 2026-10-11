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
    try {
        const result = await iotService.recordHeartbeat(req.body, req.device);
        if (result.error) {
            return res.status(result.status || 400).json({
                error: result.error
            });
        }
        return res.status(result.status || 200).json(result.data || { ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    logOccupancy,
    heartbeat
};
