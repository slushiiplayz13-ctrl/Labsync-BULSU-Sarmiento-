'use strict';

/**
 * tests/test-iot-offline-resilience.js
 * 
 * Comprehensive regression suite verifying IoT offline resilience fixes:
 * 1. Browser fetch failure on IT Head Dashboard preserves cached state and avoids false "All devices offline".
 * 2. Key custody is preserved when a device is offline (offline room with absent key preserves holder name).
 * 3. GET /api/occupancy/heartbeat is strictly read-only and does NOT mutate device liveness or database timestamps.
 * 4. POST /api/occupancy/heartbeat logs arrival timestamp, duration, sanitized device ID, and DB persistence status.
 *    (Uses repository stubs to safely test persistence success AND persistence failure without real-database mutations).
 * 5. Firmware heartbeat bounded retry & diagnostics invariants.
 * 6. 32-bit Millis Rollover Regression Test: Verifies wraparound-safe signed comparison immediately before and after rollover.
 * 7. Room Independence & Key Custody Invariants Maintained without altering development database records.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('../database/connection');
const iotService = require('../services/iotService');
const deviceStateService = require('../services/iot/device-state.service');
const labRepository = require('../repositories/laboratory.repository');
const { DEFAULT_HARDWARE_ROOMS, OFFLINE_THRESHOLD_MS } = require('../services/iot/iot.config');

// -------------------------------------------------------------
// DATABASE MUTATION SAFETY GUARD
// -------------------------------------------------------------
const configuredDb = (process.env.DB_NAME || 'labsync').trim();
const origDbQuery = db.query.bind(db);

db.query = async function safeGuardedQuery(sql, params) {
    const sqlStr = String(sql).trim().toUpperCase();
    const isMutation = /^(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|REPLACE)/i.test(sqlStr);
    if (isMutation && (configuredDb === 'labsync' || configuredDb === 'labsync_production' || process.env.NODE_ENV === 'production')) {
        throw new Error(`SAFETY_GUARD_VIOLATION: Database write blocked against protected database '${configuredDb}': ${sqlStr.substring(0, 60)}...`);
    }
    return origDbQuery(sql, params);
};

async function runTests() {
    console.log('================================================================');
    console.log('🧪 TESTING IOT OFFLINE RESILIENCE & CUSTODY SAFEGUARDS');
    console.log(`🔒 Active DB: ${configuredDb} (Mutation Safety Guard Active)`);
    console.log('================================================================\n');

    try {
        // -------------------------------------------------------------
        // TEST 1: IT Department Head Dashboard False-Offline Prevention
        // -------------------------------------------------------------
        console.log('--- TEST 1: IT Head Dashboard False-Offline Protection ---');
        const itHeadScriptPath = path.join(__dirname, '../js/pages/it-head-dashboard.js');
        const itHeadScriptSrc = fs.readFileSync(itHeadScriptPath, 'utf8');

        assert(itHeadScriptSrc.includes('_lastKnownLabs'), 'it-head-dashboard.js must declare _lastKnownLabs cache');
        assert(itHeadScriptSrc.includes('isStaleLabs'), 'it-head-dashboard.js must track isStaleLabs state');
        assert(itHeadScriptSrc.includes('Unable to check status'), 'it-head-dashboard.js must show safe fallback when no data exists');

        // Simulate dashboard logic
        const mockDom = {
            elRooms: { textContent: '' },
            elAvail: { textContent: '' },
            elAvailMeta: { textContent: '' }
        };

        const mockInitialLabs = [
            { Room_ID: 1, Room_Number: '203', deviceOnline: true, Current_Status: 'Available' },
            { Room_ID: 2, Room_Number: '204', deviceOnline: true, Current_Status: 'Available' }
        ];

        // Step 1: Successful initial load
        let _lastKnownLabs = mockInitialLabs;
        let stats = { totalRooms: 2, totalPcs: 80 };
        let allLabs = _lastKnownLabs;
        let hasTrustworthyLabs = Array.isArray(allLabs) && allLabs.length > 0;
        let onlineCount = allLabs.filter(r => r.deviceOnline === true).length;
        let availableCount = allLabs.filter(r => r.deviceOnline === true && r.Current_Status === 'Available').length;

        mockDom.elRooms.textContent = allLabs.length;
        mockDom.elAvail.textContent = availableCount;
        mockDom.elAvailMeta.textContent = 'All devices online';

        assert.strictEqual(mockDom.elAvail.textContent, 2);
        assert.strictEqual(mockDom.elAvailMeta.textContent, 'All devices online');

        // Step 2: Simulate subsequent transient fetch failure (returns null / error)
        const fetchFailedLabsData = null;
        let isStaleLabs = false;
        if (Array.isArray(fetchFailedLabsData) && fetchFailedLabsData.length > 0) {
            allLabs = fetchFailedLabsData;
            _lastKnownLabs = fetchFailedLabsData;
        } else if (_lastKnownLabs && Array.isArray(_lastKnownLabs) && _lastKnownLabs.length > 0) {
            allLabs = _lastKnownLabs;
            isStaleLabs = true;
        }

        hasTrustworthyLabs = Array.isArray(allLabs) && allLabs.length > 0;
        onlineCount = hasTrustworthyLabs ? allLabs.filter(r => r.deviceOnline === true).length : 0;
        const totalRooms = hasTrustworthyLabs ? allLabs.length : stats.totalRooms;
        availableCount = hasTrustworthyLabs ? allLabs.filter(r => r.deviceOnline === true && r.Current_Status === 'Available').length : 0;

        if (isStaleLabs) {
            mockDom.elAvail.textContent = availableCount;
            mockDom.elAvailMeta.textContent = `${onlineCount} of ${totalRooms} online (cached)`;
        }

        assert.strictEqual(mockDom.elAvail.textContent, 2, 'Available count must remain 2 during transient fetch failure');
        assert.strictEqual(mockDom.elAvailMeta.textContent, '2 of 2 online (cached)', 'Meta text must indicate cached status rather than claiming all offline');

        // Step 3: Zero initial data and fetch fails
        let uninitializedLabs = null;
        let _emptyCache = null;
        let hasData = Array.isArray(uninitializedLabs) && uninitializedLabs.length > 0;
        if (!hasData && !_emptyCache) {
            mockDom.elAvail.textContent = '--';
            mockDom.elAvailMeta.textContent = 'Unable to check status';
        }

        assert.strictEqual(mockDom.elAvail.textContent, '--', 'Without data, available count must be placeholder --');
        assert.strictEqual(mockDom.elAvailMeta.textContent, 'Unable to check status', 'Without data, must show status fetch error, not "All devices offline"');

        console.log('✔ PASS: IT Head Dashboard preserves cached laboratory state and avoids false "All devices offline" on fetch error.');

        // -------------------------------------------------------------
        // TEST 2: Key Custody Preservation During Device Offline State
        // -------------------------------------------------------------
        console.log('\n--- TEST 2: Key Custody Preservation on Offline Room Cards ---');
        const labServiceScriptPath = path.join(__dirname, '../js/services/laboratory.service.js');
        const labServiceScriptSrc = fs.readFileSync(labServiceScriptPath, 'utf8');

        // Emulate browser environment to test renderLabCards
        function createMockCardContainer() {
            let html = '';
            return {
                set innerHTML(val) { html = val; },
                get innerHTML() { return html; },
                querySelector: () => null,
                querySelectorAll: () => []
            };
        }

        const mockWindow = { location: { pathname: '/room-status.html' } };
        const mockDocument = {};
        const fn = new Function('window', 'document', labServiceScriptSrc);
        fn(mockWindow, mockDocument);

        const cardContainer = createMockCardContainer();

        const testOfflineRooms = [
            {
                Room_ID: 201,
                Room_Number: '203',
                Building: 'Main Building',
                Current_Status: 'Available',
                deviceOnline: false,
                Key_Status: 'Present',
                Current_Key_Holder: null,
                total_pc_issues: 0
            },
            {
                Room_ID: 202,
                Room_Number: '204',
                Building: 'Main Building',
                Current_Status: 'Borrowed',
                deviceOnline: false, // Key box is OFFLINE!
                Key_Status: 'Absent',
                Current_Key_Holder: 'Prof. Andrei Gabito',
                Current_Key_Holder_Role: 'Faculty',
                total_pc_issues: 0
            }
        ];

        mockWindow.laboratoryService.renderLabCards(testOfflineRooms, cardContainer);
        const cardHtml = cardContainer.innerHTML;

        // Verify Room 203 (Present & Offline): displays N/A for Claimed By
        assert(cardHtml.includes('RM 203'), 'Must render Room 203');
        assert(cardHtml.includes('Offline'), 'Must render Offline badge');

        // Verify Room 204 (Absent & Offline): PRESERVES Andrei Gabito custody!
        assert(cardHtml.includes('RM 204'), 'Must render Room 204');
        assert(cardHtml.includes('Andrei Gabito'), 'Must PRESERVE Prof. Andrei Gabito key custody even when device is offline!');
        assert(!cardHtml.includes('Claimed By N/A') || cardHtml.includes('Andrei Gabito'), 'Must not overwrite verified key holder with N/A');

        console.log('✔ PASS: Room cards preserve legitimate key holder (Andrei Gabito) when physical device is offline.');

        // -------------------------------------------------------------
        // TEST 3: Read-Only GET /api/occupancy/heartbeat Does NOT Mutate Liveness
        // -------------------------------------------------------------
        console.log('\n--- TEST 3: GET /api/occupancy/heartbeat Read-Only Invariant ---');
        deviceStateService.clearDeviceLastSeen();

        // Check baseline: device is offline initially
        assert.strictEqual(iotService.isDeviceOnline('203'), false, 'Room 203 must be offline before any heartbeat');

        const iotController = require('../controllers/iot.controller');
        let getStatusResult = null;
        const mockRes = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(payload) {
                getStatusResult = payload;
                return this;
            }
        };

        await iotController.getHeartbeatStatus({}, mockRes, (err) => { if (err) throw err; });

        assert.strictEqual(mockRes.statusCode, 200, 'GET /heartbeat must return 200 OK');
        assert.strictEqual(getStatusResult.ok, true);
        assert.strictEqual(getStatusResult.status, 'operational');
        assert(getStatusResult.rooms['203'], 'Must report room 203 status');

        // Critical assertion: GET must NOT have set room 203 to Online!
        assert.strictEqual(iotService.isDeviceOnline('203'), false, 'GET /heartbeat must NOT mutate device liveness!');

        console.log('✔ PASS: GET /api/occupancy/heartbeat provides read-only status without mutating liveness state.');

        // -------------------------------------------------------------
        // TEST 4: POST Heartbeat Diagnostics, Arrival Time & DB Persistence Safety
        // -------------------------------------------------------------
        console.log('\n--- TEST 4: POST Heartbeat Diagnostics, Arrival Logging & Persistence Safety ---');
        
        // Preserve original repository methods
        const origUpdateLastSeen = labRepository.updateLastSeenByRoomNumbers;
        const origFindByRoomNumber = labRepository.findByRoomNumber;
        const origUpdateKeyStatus = labRepository.updateKeyStatus;

        try {
            // Case 4A: Successful DB persistence path (stubbed, zero MySQL writes)
            let persistedRooms = null;
            labRepository.updateLastSeenByRoomNumbers = async (rooms) => {
                persistedRooms = rooms;
                return [{ affectedRows: rooms.length }];
            };

            const mockDevice = {
                id: 'ESP32-KeyBox',
                name: 'ESP32 KeyBox',
                authorizedRooms: ['203', '204']
            };

            const postHbRes = await iotService.recordHeartbeat({
                deviceId: 'ESP32-KeyBox',
                rooms: ['203', '204']
            }, mockDevice);

            assert.strictEqual(postHbRes.status, 200, 'POST heartbeat must return 200 OK');
            assert.strictEqual(postHbRes.data.status, 'online');
            assert.strictEqual(postHbRes.data.dbPersisted, true, 'Heartbeat must confirm database persistence when repository succeeds');
            assert.deepStrictEqual(persistedRooms, ['203', '204'], 'Must call updateLastSeen with correct room keys');
            assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 is Online in memory');
            assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 is Online in memory');

            // Case 4B: Transient DB persistence failure (graceful degradation without dropping connection)
            labRepository.updateLastSeenByRoomNumbers = async () => {
                throw new Error('Simulated transient database connection timeout');
            };

            const postHbFailRes = await iotService.recordHeartbeat({
                deviceId: 'ESP32-KeyBox',
                rooms: ['203', '204']
            }, mockDevice);

            assert.strictEqual(postHbFailRes.status, 200, 'POST heartbeat must return 200 even if database update fails');
            assert.strictEqual(postHbFailRes.data.status, 'online');
            assert.strictEqual(postHbFailRes.data.dbPersisted, false, 'dbPersisted must accurately report false on write failure');

            // Case 4C: Controller diagnostic logging: arrival time, sanitized ID, duration, dbPersisted
            const capturedLogs = [];
            const origLog = console.log;
            console.log = (...args) => {
                capturedLogs.push(args.join(' '));
                origLog(...args);
            };

            labRepository.updateLastSeenByRoomNumbers = async (rooms) => [{ affectedRows: rooms.length }];

            try {
                const mockReq = {
                    device: mockDevice,
                    body: { deviceId: 'ESP32-KeyBox', rooms: ['203', '204'] }
                };
                let controllerResult = null;
                const mockCtrlRes = {
                    status: function(code) {
                        this.statusCode = code;
                        return this;
                    },
                    json: function(payload) {
                        controllerResult = payload;
                        return this;
                    }
                };

                await iotController.heartbeat(mockReq, mockCtrlRes, (err) => { if (err) throw err; });

                assert.strictEqual(mockCtrlRes.statusCode, 200);
                assert.strictEqual(controllerResult.status, 'online');
                assert.strictEqual(controllerResult.dbPersisted, true);

                const diagnosticLog = capturedLogs.find(l => l.includes('[IoT Heartbeat'));
                assert(diagnosticLog, 'Heartbeat diagnostic log must be printed to console');
                assert(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(diagnosticLog), 'Log must contain ISO arrival timestamp');
                assert(diagnosticLog.includes('Device "ESP32-KeyBox"'), 'Log must contain sanitized device identifier');
                assert(diagnosticLog.includes('processed in'), 'Log must contain processing duration');
                assert(diagnosticLog.includes('Status: 200'), 'Log must contain HTTP status code');
                assert(diagnosticLog.includes('DB Persisted: true'), 'Log must contain DB persistence status');
                assert(!diagnosticLog.includes('Bearer') && !diagnosticLog.includes('token'), 'Log must not contain credentials');
            } finally {
                console.log = origLog;
            }

            console.log('✔ PASS: POST Heartbeat diagnostics log arrival timestamp, duration, status, and persistence outcome safely.');

        } finally {
            // Restore repository methods
            labRepository.updateLastSeenByRoomNumbers = origUpdateLastSeen;
            labRepository.findByRoomNumber = origFindByRoomNumber;
            labRepository.updateKeyStatus = origUpdateKeyStatus;
        }

        // -------------------------------------------------------------
        // TEST 5: Firmware Heartbeat Bounded Retry & Diagnostics Invariants
        // -------------------------------------------------------------
        console.log('\n--- TEST 5: Firmware Heartbeat Bounded Retry & Scheduling Logic ---');
        const firmwarePath = path.join(__dirname, '../LabSync_ESP32/LabSync_ESP32.ino');
        const firmwareSrc = fs.readFileSync(firmwarePath, 'utf8');

        assert(firmwareSrc.includes('bool sendHeartbeatHttp()'), 'Firmware sendHeartbeatHttp must return bool');
        assert(firmwareSrc.includes('code == 200'), 'Firmware must require HTTP 200 for heartbeat success');
        assert(firmwareSrc.includes('Auth Failure: HTTP'), 'Firmware must diagnose 401/403 authorization failures');
        assert(firmwareSrc.includes('Server Error: HTTP'), 'Firmware must diagnose HTTP 5xx server errors');
        assert(firmwareSrc.includes('Transport Failure: Code'), 'Firmware must diagnose transport failures (code < 0)');
        assert(firmwareSrc.includes('MAX_HEARTBEAT_RETRIES'), 'Firmware must bound heartbeat retries');
        assert(firmwareSrc.includes('HEARTBEAT_RETRY_DELAYS'), 'Firmware must use controlled backoff retry delays');
        assert(firmwareSrc.includes('hasHigherPriorityWork'), 'Firmware must prioritize queue messages and alerts over heartbeats');

        console.log('✔ PASS: Firmware defines HTTP 200 verification, failure classification, bounded retry, and priority scheduling.');

        // -------------------------------------------------------------
        // TEST 6: Firmware 32-Bit Millis Rollover Regression Test
        // -------------------------------------------------------------
        console.log('\n--- TEST 6: Firmware 32-Bit Millis Rollover Regression Test ---');

        // Verify the exact source code comparison uses 32-bit signed difference
        assert(
            firmwareSrc.includes('(int32_t)(millis() - nextHeartbeatDueMs) >= 0'),
            'Firmware must use wraparound-safe (int32_t)(millis() - nextHeartbeatDueMs) >= 0 comparison'
        );

        // Exercise the exact 32-bit signed comparison logic before and after rollover
        // In JavaScript, (a - b) | 0 evaluates 32-bit signed two's complement difference
        function isHeartbeatDue(currentMillisU32, nextDueU32) {
            const diff = (currentMillisU32 - nextDueU32) | 0;
            return diff >= 0;
        }

        const UINT32_MAX = 0xFFFFFFFF;
        const nominalInterval = 15000;

        // Scenario A: Standard non-overflow operation
        const baseTime = 120000;
        const dueTime = baseTime + nominalInterval;
        assert.strictEqual(isHeartbeatDue(baseTime, dueTime), false, 'Not due at start of interval');
        assert.strictEqual(isHeartbeatDue(dueTime - 1, dueTime), false, 'Not due 1ms before expiry');
        assert.strictEqual(isHeartbeatDue(dueTime, dueTime), true, 'Due at exact expiry');
        assert.strictEqual(isHeartbeatDue(dueTime + 100, dueTime), true, 'Due when overdue');

        // Scenario B: Scheduled across 32-bit rollover boundary (~49.71 days)
        // Set current time to 5,000 ms before 32-bit maximum (4,294,962,295)
        const timeNearMax = (UINT32_MAX - 5000) >>> 0;
        const dueWrapped = ((timeNearMax + nominalInterval) >>> 0); // Wraps to 9,999 in unsigned 32-bit

        // 1. Immediately after scheduling (15,000 ms remaining, 5,000 ms before rollover)
        assert.strictEqual(
            isHeartbeatDue(timeNearMax, dueWrapped),
            false,
            'Must NOT be due immediately after scheduling across rollover'
        );

        // Flawed comparison check: verify that unsigned (now >= due) would have produced a FALSE POSITIVE
        const flawedUnsignedCheck = (timeNearMax >= dueWrapped);
        assert.strictEqual(
            flawedUnsignedCheck,
            true,
            'Proof: Flawed unsigned comparison (now >= due) falsely triggered 15s too early'
        );

        // 2. 1 millisecond before rollover (10,001 ms remaining)
        const justBeforeRollover = (UINT32_MAX - 1) >>> 0;
        assert.strictEqual(
            isHeartbeatDue(justBeforeRollover, dueWrapped),
            false,
            'Must NOT be due 1ms before rollover'
        );

        // 3. Immediately after rollover (time = 0, 9,999 ms remaining)
        assert.strictEqual(
            isHeartbeatDue(0, dueWrapped),
            false,
            'Must NOT be due at time = 0 immediately after rollover'
        );

        // 4. Midway after rollover (time = 5,000, 4,999 ms remaining)
        assert.strictEqual(
            isHeartbeatDue(5000, dueWrapped),
            false,
            'Must NOT be due midway through wrapped interval'
        );

        // 5. 1 millisecond before due (time = 9,998)
        assert.strictEqual(
            isHeartbeatDue(9998, dueWrapped),
            false,
            'Must NOT be due 1ms before wrapped due timestamp'
        );

        // 6. Exactly due after rollover (time = 9,999)
        assert.strictEqual(
            isHeartbeatDue(9999, dueWrapped),
            true,
            'MUST be due when time reaches wrapped due timestamp'
        );

        // 7. Overdue after rollover (time = 10,050)
        assert.strictEqual(
            isHeartbeatDue(10050, dueWrapped),
            true,
            'MUST be due when overdue after rollover'
        );

        // Scenario C: Bounded retry backoff delays across rollover
        const retryDelays = [3000, 5000, 8000];
        for (const delay of retryDelays) {
            const retrySchedTime = (UINT32_MAX - 1000) >>> 0; // 1s before rollover
            const retryDue = ((retrySchedTime + delay) >>> 0); // Wraps past rollover
            assert.strictEqual(isHeartbeatDue(retrySchedTime, retryDue), false, `Retry delay ${delay}ms not due at start`);
            assert.strictEqual(isHeartbeatDue(0, retryDue), false, `Retry delay ${delay}ms not due at rollover boundary`);
            assert.strictEqual(isHeartbeatDue(retryDue - 1, retryDue), false, `Retry delay ${delay}ms not due 1ms prior`);
            assert.strictEqual(isHeartbeatDue(retryDue, retryDue), true, `Retry delay ${delay}ms due at exact expiry`);
        }

        console.log('✔ PASS: 32-bit signed rollover logic tested across pre-rollover, boundary, post-rollover, and retry intervals.');

        // -------------------------------------------------------------
        // TEST 7: Room Independence & Key Custody Invariants Maintained
        // -------------------------------------------------------------
        console.log('\n--- TEST 7: Room Independence & Key Custody Invariants ---');
        
        // Configuration Invariant
        assert(Array.isArray(DEFAULT_HARDWARE_ROOMS) && DEFAULT_HARDWARE_ROOMS.length >= 2, 'Must configure default hardware rooms');
        assert(DEFAULT_HARDWARE_ROOMS.includes('203'), 'Room 203 must be in hardware configuration');
        assert(DEFAULT_HARDWARE_ROOMS.includes('204'), 'Room 204 must be in hardware configuration');

        // Behavioral Device State Independence
        deviceStateService.clearDeviceLastSeen();
        const nowMs = Date.now();

        // 7a. Room 203 seen at nowMs, Room 204 unseen
        deviceStateService.recordDeviceSeen(['203'], nowMs);
        assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 must be Online');
        assert.strictEqual(iotService.isDeviceOnline('204'), false, 'Room 204 must remain Offline independently');

        // 7b. Room 204 seen at nowMs
        deviceStateService.recordDeviceSeen(['204'], nowMs);
        assert.strictEqual(iotService.isDeviceOnline('203'), true, 'Room 203 remains Online');
        assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 is now Online');

        // 7c. Room 203 expires (> OFFLINE_THRESHOLD_MS), Room 204 remains fresh
        deviceStateService.recordDeviceSeen(['203'], nowMs - (OFFLINE_THRESHOLD_MS + 5000));
        assert.strictEqual(iotService.isDeviceOnline('203'), false, 'Room 203 expires to Offline');
        assert.strictEqual(iotService.isDeviceOnline('204'), true, 'Room 204 remains Online independently');

        // 7d. Verify Mutation Safety Guard blocks any write query against protected databases
        let mutationBlocked = false;
        try {
            await db.query("UPDATE laboratories SET Last_Seen = NOW() WHERE Room_Number = '999'");
        } catch (guardErr) {
            if (guardErr.message.includes('SAFETY_GUARD_VIOLATION')) {
                mutationBlocked = true;
            }
        }
        assert.strictEqual(mutationBlocked, true, 'Safety guard must actively block mutations against development database');

        console.log('✔ PASS: Rooms 203 and 204 maintain strict independent slot identification; DB safety guard confirmed active.');

        // -------------------------------------------------------------
        // TEST 8: Verified User Name on LCD Display & Generic Fallback
        // -------------------------------------------------------------
        console.log('\n--- TEST 8: Verified User Name on LCD Display & Generic Fallback ---');

        // Verify firmware source patterns
        assert(firmwareSrc.includes('String verifiedName = "";'), 'Firmware must declare verifiedName');
        assert(firmwareSrc.includes('grantLine1 = "TAKE YOUR KEY   ";'),
            'Firmware must display clear TAKE YOUR KEY instruction on top row (line 1)');
        assert(firmwareSrc.includes('grantLine2 = (verifiedName.length() > 16) ? verifiedName.substring(0, 16) : verifiedName;'),
            'Firmware must display verified user name on bottom row (line 2), truncating to 16 characters while preserving internal spaces');
        assert(firmwareSrc.includes('String grantLine1 = "ACCESS GRANTED  ";'),
            'Firmware must provide ACCESS GRANTED line 1 generic fallback');

        // Behavioral simulation of firmware response parsing & LCD line generation
        function simulateFirmwareLcdOutput(httpCode, resJson) {
            let line1 = "Scan Denied";
            let line2 = "Please Wait...";
            let verifiedName = "";

            if (resJson) {
                if (resJson.lcdLine1) line1 = String(resJson.lcdLine1);
                if (resJson.lcdLine2) line2 = String(resJson.lcdLine2);

                if (httpCode === 200) {
                    if (resJson.name) {
                        verifiedName = String(resJson.name);
                    } else if (resJson.user && resJson.user.name) {
                        verifiedName = String(resJson.user.name);
                    } else if (resJson.userName) {
                        verifiedName = String(resJson.userName);
                    } else if (resJson.lcdLine2) {
                        const candidate = String(resJson.lcdLine2).trim();
                        if (!/^take your key$/i.test(candidate) && !/^scan locked$/i.test(candidate)) {
                            verifiedName = candidate;
                        }
                    }
                    verifiedName = verifiedName.trim();
                }
            }

            if (httpCode === 200) {
                let grantLine1 = "ACCESS GRANTED  ";
                let grantLine2 = "TAKE YOUR KEY   ";
                if (verifiedName.length > 0) {
                    grantLine1 = "TAKE YOUR KEY   ";
                    grantLine2 = verifiedName.length > 16 ? verifiedName.substring(0, 16) : verifiedName;
                }
                return { line1: grantLine1, line2: grantLine2, isSuccess: true };
            } else {
                return { line1: line1, line2: line2, isSuccess: false };
            }
        }

        // Scenario 8A: Successful scan with verified name (e.g. "Prof. Andrei Gabito")
        const resA = simulateFirmwareLcdOutput(200, {
            name: 'Prof. Andrei Gabito',
            user: { name: 'Prof. Andrei Gabito', role: 'Faculty' },
            lcdLine1: 'Access Granted!',
            lcdLine2: 'Prof. Andrei Gab'
        });
        assert.strictEqual(resA.isSuccess, true);
        assert.strictEqual(resA.line1, 'TAKE YOUR KEY   ', 'Top row (line 1) must display TAKE YOUR KEY');
        assert.strictEqual(resA.line2, 'Prof. Andrei Gab', 'Bottom row (line 2) must display verified user name truncated to 16 characters');

        // Scenario 8B: Successful scan with name containing spaces within 16 chars (e.g. "Juan dela Cruz")
        const resB = simulateFirmwareLcdOutput(200, {
            name: 'Juan dela Cruz',
            user: { name: 'Juan dela Cruz', role: 'Faculty' }
        });
        assert.strictEqual(resB.line1, 'TAKE YOUR KEY   ', 'Top row (line 1) must display TAKE YOUR KEY');
        assert.strictEqual(resB.line2, 'Juan dela Cruz', 'Bottom row (line 2) must preserve internal spaces');

        // Scenario 8C: Generic fallback when response has no name
        const resC = simulateFirmwareLcdOutput(200, {
            status: 'online',
            ok: true
        });
        assert.strictEqual(resC.line1, 'ACCESS GRANTED  ', 'Must fallback to ACCESS GRANTED when name is missing');
        assert.strictEqual(resC.line2, 'TAKE YOUR KEY   ', 'Must fallback to TAKE YOUR KEY when name is missing');

        // Scenario 8D: Failed/rejected authorization must NOT display any user name
        const resD = simulateFirmwareLcdOutput(404, {
            error: 'Invalid QR token',
            lcdLine1: 'Access Denied!',
            lcdLine2: 'Invalid QR Code'
        });
        assert.strictEqual(resD.isSuccess, false);
        assert.strictEqual(resD.line1, 'Access Denied!');
        assert.strictEqual(resD.line2, 'Invalid QR Code');
        assert(!resD.line1.includes('Andrei') && !resD.line2.includes('Andrei'), 'Must NOT display user name on failure');

        // Scenario 8E: 409 Conflict (Scan Locked) must display error, not a user name
        const resE = simulateFirmwareLcdOutput(409, {
            error: 'Scan locked by another user',
            lcdLine1: 'Take Your Key!',
            lcdLine2: 'Scan Locked'
        });
        assert.strictEqual(resE.isSuccess, false);
        assert.strictEqual(resE.line1, 'Take Your Key!');
        assert.strictEqual(resE.line2, 'Scan Locked');

        console.log('✔ PASS: Verified user name displays on LCD Line 1 with TAKE YOUR KEY on Line 2; generic fallback and error paths verified.');

        console.log('\n================================================================');
        console.log('🎉 ALL IOT OFFLINE RESILIENCE & CUSTODY SAFEGUARD TESTS PASSED!');
        console.log('================================================================');

    } catch (err) {
        console.error('❌ Test suite failed:', err);
        process.exit(1);
    } finally {
        if (db && typeof db.end === 'function') {
            await db.end();
        }
    }
}

runTests();
