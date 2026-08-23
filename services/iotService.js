'use strict';

/**
 * LabSync IoT Service - Compatibility Facade
 *
 * This module re-exports domain methods from the modular services/iot/ subsystem:
 * - services/iot/occupancy.service.js
 * - services/iot/heartbeat.service.js
 * - services/iot/device-state.service.js
 * - services/iot/claim.service.js
 * - services/iot/iot-response.service.js
 * - services/iot/iot.config.js
 *
 * Ensures 100% backward compatibility for all controllers and services.
 */

const occupancyService = require('./iot/occupancy.service');
const heartbeatService = require('./iot/heartbeat.service');
const deviceStateService = require('./iot/device-state.service');
const claimService = require('./iot/claim.service');
const iotResponseService = require('./iot/iot-response.service');
const iotConfig = require('./iot/iot.config');

module.exports = {
    // Primary API operations
    logOccupancy: occupancyService.logOccupancy,
    recordHeartbeat: heartbeatService.recordHeartbeat,

    // Real-time device state operations
    isDeviceOnline: deviceStateService.isDeviceOnline,
    getLastSeen: deviceStateService.getLastSeen,

    // Domain sub-services for direct modular consumption
    occupancyService,
    heartbeatService,
    deviceStateService,
    claimService,
    iotResponseService,
    iotConfig
};
