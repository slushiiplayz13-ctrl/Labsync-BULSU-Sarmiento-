'use strict';

const iotService = require('../services/iotService');

async function logOccupancy(req, res, next) {
    try {
        const result = await iotService.logOccupancy(req.body);
        if (result.error) {
            return res.status(result.status).json({
                error: result.error,
                lcdLine1: result.lcdLine1,
                lcdLine2: result.lcdLine2
            });
        }
        return res.status(result.status).json(result.data);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    logOccupancy
};
