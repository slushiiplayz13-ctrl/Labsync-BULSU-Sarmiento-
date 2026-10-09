'use strict';

/**
 * tests/test-room-status-report.js
 * Comprehensive automated tests for Room Status Activity Log PDF Report:
 * 1. Role-based authorization (Department Head only, 403 for Faculty/MIS/OJT, 401 unauth)
 * 2. Period filters (today, yesterday, both, custom range)
 * 3. Validation (missing dates, end before start, malformed dates, invalid room)
 * 4. Room filtering (All Rooms, Room 203, Room 204)
 * 5. PDF generation, headers, filenames, and empty-state handling
 * 6. Audit trail logging in audit_logs
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const express = require('express');
const session = require('express-session');

const db = require('../database/connection');
const reportsRoutes = require('../routes/maintenance.routes');
const roomStatusReportService = require('../services/roomStatusReportService');

// Create test server app with mockable session
function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-report-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    // Test hook to inject session
    app.use((req, res, next) => {
        if (req.headers['x-test-user-id']) {
            req.session.userId = parseInt(req.headers['x-test-user-id'], 10);
            req.session.userRole = req.headers['x-test-user-role'];
            req.session.lastActivity = Date.now();
        }
        next();
    });

    app.use('/api/reports', reportsRoutes);
    return app;
}

test('Room Status Activity Log Report Suite', async (t) => {
    let server;
    let baseUrl;
    let deptHeadUser, facultyUser, misUser, ojtUser, programCoordinatorUser;

    await t.test('Setup test users and server', async () => {
        // Query real users from database
        const [deptHeadRows] = await db.query(
            "SELECT User_ID, Role, Status FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'Department Head') AND Status = 'ACTIVE' LIMIT 1"
        );
        const [facultyRows] = await db.query(
            "SELECT User_ID, Role, Status FROM users WHERE Role = 'Faculty' AND Status = 'ACTIVE' LIMIT 1"
        );
        const [misRows] = await db.query(
            "SELECT User_ID, Role, Status FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1"
        );
        const [ojtRows] = await db.query(
            "SELECT User_ID, Role, Status FROM users WHERE Role = 'OJT' AND Status = 'ACTIVE' LIMIT 1"
        );
        const [coordRows] = await db.query(
            "SELECT User_ID, Role, Status FROM users WHERE Role = 'Program Coordinator' AND Status = 'ACTIVE' LIMIT 1"
        );

        deptHeadUser = deptHeadRows[0];
        facultyUser = facultyRows[0];
        misUser = misRows[0];
        ojtUser = ojtRows[0];
        programCoordinatorUser = coordRows[0];

        assert.ok(deptHeadUser, 'A Department Head test user must exist in the database');
        assert.ok(facultyUser, 'A Faculty test user must exist in the database');
        assert.ok(misUser, 'A MIS Staff test user must exist in the database');
        assert.ok(programCoordinatorUser, 'A Program Coordinator test user must exist in the database');

        const app = createTestApp();
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    // Helper request function
    async function makeRequest(path, user = null) {
        const headers = {};
        if (user) {
            headers['x-test-user-id'] = String(user.User_ID);
            headers['x-test-user-role'] = user.Role;
        }
        const res = await fetch(`${baseUrl}${path}`, { headers });
        let body;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/pdf')) {
            const arrayBuf = await res.arrayBuffer();
            body = Buffer.from(arrayBuf);
        } else {
            try {
                body = await res.json();
            } catch (e) {
                body = await res.text();
            }
        }
        return {
            status: res.status,
            headers: res.headers,
            body
        };
    }

    await t.test('1. Role-Based Authorization Enforcement', async (t) => {
        await t.test('Unauthenticated request is rejected with 401', async () => {
            const res = await makeRequest('/api/reports/room-status');
            assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
        });

        await t.test('Faculty request is rejected with 403', async () => {
            const res = await makeRequest('/api/reports/room-status', facultyUser);
            assert.strictEqual(res.status, 403, 'Faculty request must return 403');
            assert.strictEqual(res.body.code, 'ROLE_REVOKED');
        });

        await t.test('MIS Staff request is rejected with 403', async () => {
            const res = await makeRequest('/api/reports/room-status', misUser);
            assert.strictEqual(res.status, 403, 'MIS Staff request must return 403');
            assert.strictEqual(res.body.code, 'ROLE_REVOKED');
        });

        if (ojtUser) {
            await t.test('OJT request is rejected with 403', async () => {
                const res = await makeRequest('/api/reports/room-status', ojtUser);
                assert.strictEqual(res.status, 403, 'OJT request must return 403');
                assert.strictEqual(res.body.code, 'ROLE_REVOKED');
            });
        }

        await t.test('Program Coordinator request is rejected with 403', async () => {
            const res = await makeRequest('/api/reports/room-status', programCoordinatorUser);
            assert.strictEqual(res.status, 403, 'Program Coordinator request must return 403 Forbidden');
            assert.strictEqual(res.body.code, 'ROLE_REVOKED');
        });

        await t.test('Department Head request is authorized with 200 and PDF', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today', deptHeadUser);
            assert.strictEqual(res.status, 200, 'Department Head must be permitted (200 OK)');
            assert.ok(res.headers.get('content-type').includes('application/pdf'), 'Must return application/pdf');
            assert.ok(Buffer.isBuffer(res.body), 'Response body must be a binary buffer');
            assert.strictEqual(res.body.slice(0, 4).toString(), '%PDF', 'PDF buffer must start with %PDF');
        });
    });

    await t.test('2. Preset Period Options', async (t) => {
        await t.test('period=today generates valid PDF', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today', deptHeadUser);
            assert.strictEqual(res.status, 200);
            const disposition = res.headers.get('content-disposition');
            assert.ok(disposition.includes('LabSync_Room_Status_Report_'), 'Filename must contain report prefix');
            assert.ok(disposition.includes('.pdf'), 'Filename must end in .pdf');
        });

        await t.test('period=yesterday generates valid PDF', async () => {
            const res = await makeRequest('/api/reports/room-status?period=yesterday', deptHeadUser);
            assert.strictEqual(res.status, 200);
            assert.ok(res.headers.get('content-type').includes('application/pdf'));
        });

        await t.test('period=both (Today + Yesterday) generates valid PDF', async () => {
            const res = await makeRequest('/api/reports/room-status?period=both', deptHeadUser);
            assert.strictEqual(res.status, 200);
            const disposition = res.headers.get('content-disposition');
            assert.ok(disposition.includes('_to_'), 'Range filename must include _to_');
        });
    });

    await t.test('3. Custom Date Range and Validation', async (t) => {
        await t.test('Valid custom date range returns 200 and PDF', async () => {
            const res = await makeRequest('/api/reports/room-status?period=custom&startDate=2026-10-01&endDate=2026-10-04', deptHeadUser);
            assert.strictEqual(res.status, 200);
            const disposition = res.headers.get('content-disposition');
            assert.ok(disposition.includes('2026-10-01_to_2026-10-04.pdf'));
        });

        await t.test('End date earlier than start date returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=custom&startDate=2026-10-04&endDate=2026-10-01', deptHeadUser);
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('earlier than start date'));
        });

        await t.test('Missing end date returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=custom&startDate=2026-10-01', deptHeadUser);
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('Both start date and end date are required'));
        });

        await t.test('Malformed date string returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=custom&startDate=2026-13-45&endDate=2026-10-04', deptHeadUser);
            assert.strictEqual(res.status, 400);
        });

        await t.test('Unsupported period string returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=next_month', deptHeadUser);
            assert.strictEqual(res.status, 400);
        });
    });

    await t.test('4. Room Filters (All Rooms, Room 203, Room 204)', async (t) => {
        await t.test('roomNumber=all returns all rooms report', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&roomNumber=all', deptHeadUser);
            assert.strictEqual(res.status, 200);
        });

        await t.test('roomNumber=203 returns Room 203 report', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&roomNumber=203', deptHeadUser);
            assert.strictEqual(res.status, 200);
            const disposition = res.headers.get('content-disposition');
            assert.ok(disposition.includes('Room_203'));
        });

        await t.test('roomNumber=204 returns Room 204 report', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&roomNumber=204', deptHeadUser);
            assert.strictEqual(res.status, 200);
            const disposition = res.headers.get('content-disposition');
            assert.ok(disposition.includes('Room_204'));
        });

        await t.test('Invalid roomNumber returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&roomNumber=999999', deptHeadUser);
            assert.strictEqual(res.status, 400);
            assert.ok(res.body.error.includes('Invalid room filter'));
        });

        await t.test('SQL injection attempt in roomNumber is safely rejected', async () => {
            const res = await makeRequest("/api/reports/room-status?period=today&roomNumber=204' OR '1'='1", deptHeadUser);
            assert.strictEqual(res.status, 400);
        });
    });

    await t.test('5. Empty Results Handling', async (t) => {
        // Query a distant date range with zero occupancy records
        const res = await makeRequest('/api/reports/room-status?period=custom&startDate=2020-01-01&endDate=2020-01-02', deptHeadUser);
        assert.strictEqual(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('application/pdf'));
        assert.strictEqual(res.body.slice(0, 4).toString(), '%PDF', 'Must generate a valid PDF document even when empty');
    });

    await t.test('6. Security Audit Trail Logging', async (t) => {
        // Verify that report generation inserted an audit_logs entry
        const [auditRows] = await db.query(
            "SELECT * FROM audit_logs WHERE Action = 'GENERATE_ROOM_STATUS_REPORT' ORDER BY Log_ID DESC LIMIT 1"
        );
        assert.ok(auditRows.length > 0, 'Audit log entry must be created on report generation');
        const latestAudit = auditRows[0];
        assert.strictEqual(latestAudit.Action, 'GENERATE_ROOM_STATUS_REPORT');
        assert.strictEqual(latestAudit.Resource_Type, 'REPORT');
        assert.strictEqual(latestAudit.User_ID, deptHeadUser.User_ID);
        assert.strictEqual(latestAudit.Result, 'SUCCESS');
    });

    await t.test('7. Report Content, Logos & Auth Method Verification', async (t) => {
        const reportData = await roomStatusReportService.getRoomStatusActivityReportData({
            period: 'today',
            roomNumber: 'all'
        });

        // Ensure records never contain "RFID" under authMethod
        for (const rec of reportData.records) {
            assert.ok(!rec.authMethod.includes('RFID'), `authMethod "${rec.authMethod}" must not contain "RFID"`);
            assert.ok(!rec.rawAuthMethod.toLowerCase().includes('rfid'), 'rawAuthMethod should not contain rfid');
        }

        // Verify logo assets exist
        const fs = require('fs');
        const path = require('path');
        const sarmientoLogo = path.join(__dirname, '../assets/bsu-sarmiento-logo.png');
        const labsyncLogoOnly = path.join(__dirname, '../assets/LabSync (Logo Only).png');
        assert.ok(fs.existsSync(sarmientoLogo), 'bsu-sarmiento-logo.png must exist in assets');
        assert.ok(fs.existsSync(labsyncLogoOnly), 'LabSync (Logo Only).png must exist in assets');
    });

    await t.test('Teardown test server and database', async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await db.end();
    });
});
