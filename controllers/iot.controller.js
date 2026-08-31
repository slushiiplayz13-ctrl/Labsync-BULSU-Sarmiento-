'use strict';

const iotService = require('../services/iotService');

async function logOccupancy(req, res, next) {
    try {
        const result = await iotService.logOccupancy(req.body, req.device);
        if (result.error) {
            return res.status(result.status || 400).json({
                error: result.error,
                lcdLine1: result.lcdLine1,
                lcdLine2: result.lcdLine2
            });
        }
        return res.status(result.status || 200).json(result.data);
    } catch (err) {
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
