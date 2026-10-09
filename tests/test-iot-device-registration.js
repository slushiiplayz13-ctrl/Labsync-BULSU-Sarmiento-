'use strict';

/**
 * tests/test-iot-device-registration.js
 * Comprehensive verification of ESP32 IoT Key Box registration,
 * secure token authentication under strict production enforcement,
 * and online status synchronization.
 */

// Enable strict IoT authentication for this test suite
process.env.ENFORCE_IOT_AUTH = 'true';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../database/connection');
const iotRepository = require('../repositories/iot.repository');
const iotService = require('../services/iotService');
const { requireIoTAuth } = require('../middleware/iotAuth');

async function runTests() {
    console.log('================================================================');
    console.log('🧪 Testing IoT Key Box Device Registration & Auth Enforcement');
    console.log('================================================================\n');

    // 1. Read migration 026 and apply to local database
    console.log('--- 1. Applying Migration 026 (Idempotent Device Registration) ---');
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '026_register_esp32_iot_device.sql');
    assert.ok(fs.existsSync(migrationPath), 'Migration 026 file must exist');

    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    await db.query(migrationSql);
    console.log('✔ Successfully executed Migration 026 on local database.');

    // 2. Verify database record
    console.log('\n--- 2. Verifying iot_devices Table Record ---');
    const [devices] = await iotRepository.findDeviceById('ESP32-KeyBox');
    assert.strictEqual(devices.length, 1, 'Device ESP32-KeyBox must exist in iot_devices');

    const registered = devices[0];
    assert.strictEqual(registered.Device_ID, 'ESP32-KeyBox');
    assert.strictEqual(registered.Is_Active, 1, 'Device must be active');
    assert.ok(registered.Token_Hash && registered.Token_Hash.length === 64, 'Token_Hash must be 64-char hex SHA-256');

    const authorizedRooms = JSON.parse(registered.Authorized_Rooms);
    assert.deepStrictEqual(authorizedRooms, ['203', '204'], 'Authorized rooms must match 203 and 204');
    console.log('✔ Verified registered device: ID="ESP32-KeyBox", Active=1, Rooms=["203","204"].');

    // 3. Read token from secrets.h (without logging or printing value)
    console.log('\n--- 3. Verifying Local Firmware Secrets Header ---');
    const secretsPath = path.join(__dirname, '..', 'LabSync_ESP32', 'secrets.h');
    assert.ok(fs.existsSync(secretsPath), 'LabSync_ESP32/secrets.h must exist');

    const secretsContent = fs.readFileSync(secretsPath, 'utf8');
    const tokenMatch = secretsContent.match(/#define\s+IOT_DEVICE_TOKEN\s+"([^"]+)"/);
    assert.ok(tokenMatch && tokenMatch[1], 'secrets.h must define IOT_DEVICE_TOKEN');
    const validToken = tokenMatch[1];

    // Verify hash of token in secrets.h matches the hash in database
    const computedHash = crypto.createHash('sha256').update(validToken).digest('hex');
    assert.strictEqual(computedHash, registered.Token_Hash, 'SHA-256 hash of secrets.h token must match database Token_Hash');
    console.log('✔ Verified token in secrets.h matches database SHA-256 hash.');

    // 4. Test strict authentication with valid token (production mode)
    console.log('\n--- 4. Testing Strict Production Authentication with Valid Token ---');
    const reqValid = {
        headers: {
            authorization: `Bearer ${validToken}`
        },
        body: { deviceId: 'ESP32-KeyBox' },
        ip: '192.168.1.100'
    };

    let nextCalled = false;
    const resValid = {
        status: (code) => { throw new Error(`Unexpected HTTP status ${code}`); },
        json: (data) => { throw new Error(`Unexpected response: ${JSON.stringify(data)}`); }
    };

    await requireIoTAuth(reqValid, resValid, () => {
        nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Middleware next() must be called for valid credentials');
    assert.ok(reqValid.device, 'req.device must be attached');
    assert.strictEqual(reqValid.device.id, 'ESP32-KeyBox');
    assert.deepStrictEqual(reqValid.device.authorizedRooms, ['203', '204']);
    console.log('✔ Valid Bearer token authenticated successfully under ENFORCE_IOT_AUTH=true.');

    // 5. Test strict rejection of invalid / tampered token
    console.log('\n--- 5. Testing Strict Rejection of Invalid Token ---');
    let rejectedStatus = null;
    let rejectedBody = null;

    const reqInvalid = {
        headers: {
            authorization: 'Bearer completely-invalid-device-token-12345'
        },
        body: { deviceId: 'ESP32-KeyBox' },
        ip: '192.168.1.100'
    };

    const resInvalid = {
        status: (code) => {
            rejectedStatus = code;
            return {
                json: (payload) => { rejectedBody = payload; }
            };
        }
    };

    await requireIoTAuth(reqInvalid, resInvalid, () => {
        throw new Error('next() must NOT be called for invalid token');
    });

    assert.strictEqual(rejectedStatus, 401, 'Invalid token must return HTTP 401');
    assert.strictEqual(rejectedBody.error, 'Invalid or unrecognized IoT device credential.');
    console.log('✔ Invalid token correctly rejected with HTTP 401 under ENFORCE_IOT_AUTH=true.');

    // 6. Test strict rejection of missing token
    console.log('\n--- 6. Testing Strict Rejection of Missing Token ---');
    let missingStatus = null;

    const reqMissing = {
        headers: {},
        body: { deviceId: 'ESP32-KeyBox' },
        ip: '192.168.1.100'
    };

    const resMissing = {
        status: (code) => {
            missingStatus = code;
            return { json: () => {} };
        }
    };

    await requireIoTAuth(reqMissing, resMissing, () => {
        throw new Error('next() must NOT be called when token is missing in strict mode');
    });

    assert.strictEqual(missingStatus, 401, 'Missing token must return HTTP 401 under strict mode');
    console.log('✔ Missing token correctly rejected with HTTP 401 under ENFORCE_IOT_AUTH=true.');

    // 7. Test end-to-end heartbeat with authenticated device
    console.log('\n--- 7. Testing Heartbeat & Online State with Authenticated Device ---');
    const hbResult = await iotService.recordHeartbeat({
        deviceId: 'ESP32-KeyBox',
        rooms: ['203', '204'],
        slots: { '203': true, '204': true }
    }, reqValid.device);

    assert.strictEqual(hbResult.status, 200, 'Heartbeat must return 200');
    assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 must be online');
    assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 must be online');
    console.log('✔ Heartbeat processed successfully. Rooms 203 & 204 are confirmed Online.');

    console.log('\n================================================================');
    console.log('🎉 ALL IOT REGISTRATION & AUTH ENFORCEMENT TESTS PASSED!');
    console.log('================================================================');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
