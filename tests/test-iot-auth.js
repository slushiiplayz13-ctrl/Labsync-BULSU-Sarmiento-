'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { requireIoTAuth } = require('../middleware/iotAuth');
const iotRepository = require('../repositories/iot.repository');

async function runTests() {
    console.log('🧪 Testing IoT Authentication Middleware...');

    // Test 1: Unauthenticated request in development mode (fallback)
    {
        const req = {
            headers: {},
            body: { deviceId: 'ESP32-KeyBox' },
            ip: '192.168.100.238'
        };
        let nextCalled = false;
        const res = {
            status: (code) => {
                throw new Error(`Unexpected status ${code}`);
            },
            json: (payload) => {
                throw new Error(`Unexpected json ${JSON.stringify(payload)}`);
            }
        };

        await requireIoTAuth(req, res, () => {
            nextCalled = true;
        });

        assert.strictEqual(nextCalled, true, 'next() should be called for dev fallback');
        assert.ok(req.device, 'req.device should be attached');
        assert.strictEqual(req.device.id, 'ESP32-KeyBox');
        assert.deepStrictEqual(req.device.authorizedRooms, ['203', '204']);
        console.log('✓ PASS: Development fallback allows unauthenticated request from physical hardware');
    }

    // Test 2: Valid Bearer token
    {
        const validToken = 'labsync-esp32-keybox-token-2026';
        const req = {
            headers: {
                authorization: `Bearer ${validToken}`
            },
            body: { deviceId: 'ESP32-KeyBox' },
            ip: '192.168.100.238'
        };
        let nextCalled = false;
        const res = {
            status: (code) => { throw new Error(`Unexpected status ${code}`); },
            json: () => {}
        };

        await requireIoTAuth(req, res, () => {
            nextCalled = true;
        });

        assert.strictEqual(nextCalled, true, 'next() should be called with valid bearer token');
        assert.ok(req.device, 'req.device should be attached');
        assert.strictEqual(req.device.id, 'ESP32-KeyBox');
        console.log('✓ PASS: Valid Bearer token successfully authenticates');
    }

    // Test 3: Valid x-device-token header
    {
        const validToken = 'labsync-esp32-keybox-token-2026';
        const req = {
            headers: {
                'x-device-token': validToken
            },
            body: {},
            ip: '192.168.100.238'
        };
        let nextCalled = false;
        const res = {
            status: (code) => { throw new Error(`Unexpected status ${code}`); },
            json: () => {}
        };

        await requireIoTAuth(req, res, () => {
            nextCalled = true;
        });

        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.device.id, 'ESP32-KeyBox');
        console.log('✓ PASS: Valid x-device-token header successfully authenticates');
    }

    // Test 4: End-to-end heartbeat and device online status
    {
        const iotService = require('../services/iotService');
        const req = {
            headers: {},
            body: { deviceId: 'ESP32-KeyBox', rooms: ['203', '204'] }
        };
        await new Promise((resolve, reject) => {
            requireIoTAuth(req, {}, async (err) => {
                if (err) return reject(err);
                try {
                    const result = await iotService.recordHeartbeat(req.body, req.device);
                    assert.strictEqual(result.status, 200);
                    assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 should be online');
                    assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 should be online');
                    console.log('✓ PASS: Heartbeat correctly transitions Room 203 and 204 to Online');
                    resolve();
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    console.log('🎉 All IoT Auth tests passed!');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
