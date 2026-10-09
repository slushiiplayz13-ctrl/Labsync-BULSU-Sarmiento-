'use strict';

/**
 * tests/test-iot-heartbeat-inactivity.js
 * Verification of IoT Key-Box Online/Offline status lifecycle during inactivity.
 *
 * Validates:
 * 1. Initial heartbeat transitions rooms 203 & 204 to Online via isDeviceOnline().
 * 2. Device remains Online at 30 seconds of inactivity (tolerating transient network jitter).
 * 3. Subsequent heartbeat refreshes the status timestamp appropriately.
 * 4. Device transitions to Offline once elapsed silence strictly exceeds the 60,000ms threshold.
 * 5. Both rooms 203 & 204 use the unified online/offline logic synchronously.
 * 6. Existing slot synchronization behavior remains compatible across heartbeats.
 * 7. dbLastSeen fallback calculation operates consistently under the 60s threshold.
 */

const assert = require('assert');
const test = require('node:test');
const db = require('../database/connection');
const iotService = require('../services/iotService');
const deviceStateService = require('../services/iot/device-state.service');
const { OFFLINE_THRESHOLD_MS } = require('../services/iot/iot.config');

test('IoT Heartbeat Inactivity & Resilience Lifecycle', async (t) => {
    // Ensure threshold is 60s
    assert.strictEqual(OFFLINE_THRESHOLD_MS, 60000, 'OFFLINE_THRESHOLD_MS must be 60,000ms');

    const originalDateNow = Date.now;
    let mockCurrentTime = 1700000000000; // Baseline epoch (ms)

    // Controlled clock setup
    Date.now = () => mockCurrentTime;

    const mockDevice = {
        id: 'ESP32-KeyBox',
        name: 'ESP32 KeyBox',
        authorizedRooms: ['203', '204']
    };

    try {
        // Reset any leftover in-memory device state
        deviceStateService.clearDeviceLastSeen();

        await t.test('1. Device starts Offline when no heartbeats have been recorded', () => {
            assert.strictEqual(iotService.isDeviceOnline('203'), false, 'Room 203 should be offline initially');
            assert.strictEqual(iotService.isDeviceOnline('204'), false, 'Room 204 should be offline initially');
            assert.strictEqual(iotService.isDeviceOnline('RM 203'), false, 'Room 203 with RM prefix should be offline');
        });

        await t.test('2. Heartbeat marks rooms 203 and 204 Online', async () => {
            const hbRes = await iotService.recordHeartbeat({
                deviceId: 'ESP32-KeyBox',
                rooms: ['203', '204'],
                slots: { '203': true, '204': true }
            }, mockDevice);

            assert.strictEqual(hbRes.status, 200, 'Heartbeat must return HTTP 200');
            // Exercise actual isDeviceOnline() implementation
            assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 must be Online');
            assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 must be Online');
            assert.strictEqual(iotService.isDeviceOnline('RM 203'), true, 'Room 203 (RM prefix) must be Online');
            assert.strictEqual(iotService.isDeviceOnline('RM 204'), true, 'Room 204 (RM prefix) must be Online');
        });

        await t.test('3. Device stays Online during 30 seconds of inactivity', () => {
            // Advance clock by 30 seconds (2 missed 15s heartbeats)
            mockCurrentTime += 30 * 1000;

            assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 must remain Online after 30s silence');
            assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 must remain Online after 30s silence');
            assert.strictEqual(deviceStateService.isDeviceOnline('203'), true, 'deviceStateService directly reports Online');
            assert.strictEqual(deviceStateService.isDeviceOnline('204'), true, 'deviceStateService directly reports Online');
        });

        await t.test('4. Device stays Online at 59 seconds of silence', () => {
            // Advance to 59s since original heartbeat
            mockCurrentTime += 29 * 1000; // Total 59s elapsed since t0

            assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 still Online at 59s');
            assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 still Online at 59s');
        });

        await t.test('5. New heartbeat refreshes the status timestamp and resets inactivity window', async () => {
            // Send heartbeat at t = 59s
            const hbRes = await iotService.recordHeartbeat({
                deviceId: 'ESP32-KeyBox',
                rooms: ['203', '204'],
                slots: { '203': true, '204': true }
            }, mockDevice);

            assert.strictEqual(hbRes.status, 200, 'Refreshed heartbeat must return HTTP 200');

            // Advance clock by another 30 seconds (now 89s since t0, but only 30s since refreshed heartbeat)
            mockCurrentTime += 30 * 1000;

            assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 remains Online 30s after refreshed heartbeat');
            assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 remains Online 30s after refreshed heartbeat');
        });

        await t.test('6. Device becomes Offline when more than 60 seconds pass without a heartbeat', () => {
            // Advance clock by 31 seconds (now 61s since last heartbeat)
            mockCurrentTime += 31 * 1000;

            assert.strictEqual(iotService.isDeviceOnline('203'), false, 'Room 203 must be Offline after > 60s silence');
            assert.strictEqual(iotService.isDeviceOnline('204'), false, 'Room 204 must be Offline after > 60s silence');
            assert.strictEqual(iotService.isDeviceOnline('RM 203'), false, 'Room 203 (RM prefix) must also be Offline');
            assert.strictEqual(iotService.isDeviceOnline('RM 204'), false, 'Room 204 (RM prefix) must also be Offline');
        });

        await t.test('7. Both rooms use the same intended online/offline logic synchronously', async () => {
            // Single heartbeat brings both rooms online together
            await iotService.recordHeartbeat({
                deviceId: 'ESP32-KeyBox',
                rooms: ['203', '204'],
                slots: { '203': true, '204': true }
            }, mockDevice);

            assert.strictEqual(iotService.isDeviceOnline('203'), iotService.isDeviceOnline('204'), 'Rooms must have identical status (true)');
            assert.strictEqual(iotService.isDeviceOnline('203'), true);

            // Exceed threshold together
            mockCurrentTime += 60001;
            assert.strictEqual(iotService.isDeviceOnline('203'), iotService.isDeviceOnline('204'), 'Rooms must have identical status (false)');
            assert.strictEqual(iotService.isDeviceOnline('203'), false);
        });

        await t.test('8. Database Last_Seen timestamp fallback calculation honors 60s threshold', () => {
            // Clear in-memory cache to force evaluation against dbLastSeen
            deviceStateService.clearDeviceLastSeen();

            const recentDbTime = new Date(mockCurrentTime - 45000); // 45 seconds ago
            const staleDbTime = new Date(mockCurrentTime - 65000);  // 65 seconds ago

            assert.strictEqual(iotService.isDeviceOnline('203', recentDbTime), true, 'DB timestamp within 45s must be Online');
            assert.strictEqual(iotService.isDeviceOnline('203', staleDbTime), false, 'DB timestamp older than 60s must be Offline');
            assert.strictEqual(iotService.isDeviceOnline('204', recentDbTime), true, 'Room 204 with 45s DB timestamp must be Online');
            assert.strictEqual(iotService.isDeviceOnline('204', staleDbTime), false, 'Room 204 with 65s DB timestamp must be Offline');
        });

        await t.test('9. Slot synchronization compatibility remains intact', async () => {
            // Heartbeat with slot absent
            const hbSlot = await iotService.recordHeartbeat({
                deviceId: 'ESP32-KeyBox',
                rooms: ['203', '204'],
                slots: { '203': false, '204': true }
            }, mockDevice);

            assert.strictEqual(hbSlot.status, 200);
            assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 still Online despite key absent');
            assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 Online');
        });

    } finally {
        // Guaranteed clock and state restoration
        Date.now = originalDateNow;
        deviceStateService.clearDeviceLastSeen();
        await db.end();
    }
});
