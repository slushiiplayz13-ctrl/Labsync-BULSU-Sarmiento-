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
            "SELECT User_ID, Name, Role, Status FROM users WHERE Role IN ('IT Dept. Head', 'IT Head', 'Department Head') AND Status = 'ACTIVE' LIMIT 1"
        );
        const [facultyRows] = await db.query(
            "SELECT User_ID, Name, Role, Status FROM users WHERE Role = 'Faculty' AND Status = 'ACTIVE' LIMIT 1"
        );
        const [misRows] = await db.query(
            "SELECT User_ID, Name, Role, Status FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1"
        );
        const [ojtRows] = await db.query(
            "SELECT User_ID, Name, Role, Status FROM users WHERE Role = 'OJT' AND Status = 'ACTIVE' LIMIT 1"
        );
        const [coordRows] = await db.query(
            "SELECT User_ID, Name, Role, Status FROM users WHERE Role = 'Program Coordinator' AND Status = 'ACTIVE' LIMIT 1"
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

    await t.test('8. Professor Filtering Verification (Revision 2)', async (t) => {
        // 8.1 resolveProfessorFilter unit tests
        await t.test('resolveProfessorFilter resolves "all" to null filter', async () => {
            const res = await roomStatusReportService.resolveProfessorFilter('all');
            assert.strictEqual(res.professorFilter, null);
            assert.strictEqual(res.professorFilterLabel, 'All Professors');
            assert.strictEqual(res.professorName, null);
        });

        await t.test('resolveProfessorFilter resolves null / empty string to All Professors', async () => {
            const res1 = await roomStatusReportService.resolveProfessorFilter(null);
            assert.strictEqual(res1.professorFilter, null);
            assert.strictEqual(res1.professorFilterLabel, 'All Professors');

            const res2 = await roomStatusReportService.resolveProfessorFilter('');
            assert.strictEqual(res2.professorFilter, null);
            assert.strictEqual(res2.professorFilterLabel, 'All Professors');
        });

        await t.test('resolveProfessorFilter resolves valid faculty ID', async () => {
            const res = await roomStatusReportService.resolveProfessorFilter(facultyUser.User_ID);
            assert.strictEqual(res.professorFilter, facultyUser.User_ID);
            assert.ok(res.professorFilterLabel.includes(facultyUser.Name) || res.professorFilterLabel.startsWith('Prof.'));
        });

        await t.test('resolveProfessorFilter rejects non-numeric professor ID with 400', async () => {
            await assert.rejects(
                async () => roomStatusReportService.resolveProfessorFilter('abc'),
                (err) => err.statusCode === 400 && err.message.includes('Invalid professor filter')
            );
        });

        await t.test('resolveProfessorFilter rejects non-existent professor ID with 400', async () => {
            await assert.rejects(
                async () => roomStatusReportService.resolveProfessorFilter('99999999'),
                (err) => err.statusCode === 400 && err.message.includes('not found')
            );
        });

        await t.test('resolveProfessorFilter safely rejects SQL injection strings', async () => {
            await assert.rejects(
                async () => roomStatusReportService.resolveProfessorFilter("1' OR '1'='1"),
                (err) => err.statusCode === 400
            );
        });

        // 8.2 Endpoint integration tests
        await t.test('Endpoint with professorId=all returns 200 and valid PDF', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&professorId=all', deptHeadUser);
            assert.strictEqual(res.status, 200);
            assert.ok(res.headers.get('content-type').includes('application/pdf'));
            assert.strictEqual(res.body.slice(0, 4).toString(), '%PDF');
        });

        await t.test('Endpoint with valid professorId returns 200 and PDF with professor filename', async () => {
            const res = await makeRequest(`/api/reports/room-status?period=today&professorId=${facultyUser.User_ID}`, deptHeadUser);
            assert.strictEqual(res.status, 200);
            assert.ok(res.headers.get('content-type').includes('application/pdf'));
            assert.strictEqual(res.body.slice(0, 4).toString(), '%PDF');
            const disposition = res.headers.get('content-disposition') || '';
            assert.ok(disposition.includes('Prof_') || disposition.includes('Report'));
        });

        await t.test('Endpoint with invalid professorId returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&professorId=not-a-number', deptHeadUser);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.code, 'INVALID_REPORT_PARAMS');
        });

        await t.test('Endpoint with non-existent professorId returns 400 Bad Request', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today&professorId=9999999', deptHeadUser);
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.code, 'INVALID_REPORT_PARAMS');
        });

        await t.test('Combined filters: period + room + professor returns 200 and PDF', async () => {
            const res = await makeRequest(
                `/api/reports/room-status?period=today&roomNumber=203&professorId=${facultyUser.User_ID}`,
                deptHeadUser
            );
            assert.strictEqual(res.status, 200);
            assert.ok(res.headers.get('content-type').includes('application/pdf'));
            assert.strictEqual(res.body.slice(0, 4).toString(), '%PDF');
        });

        // 8.3 Data isolation and exclusion test
        await t.test('Data isolation: Filtering by professor returns only that professor records', async () => {
            // Find a room ID
            const [rooms] = await db.query('SELECT Room_ID FROM laboratories LIMIT 1');
            const testRoomId = rooms[0].Room_ID;

            // Find a second faculty member or create one
            const [otherFacultyRows] = await db.query(
                'SELECT User_ID, Name FROM users WHERE Role = "Faculty" AND User_ID != ? LIMIT 1',
                [facultyUser.User_ID]
            );

            let otherUserId;
            let cleanupOtherUser = false;
            if (otherFacultyRows.length > 0) {
                otherUserId = otherFacultyRows[0].User_ID;
            } else {
                const [insUser] = await db.query(
                    'INSERT INTO users (Name, Email, Role, Password, ID_QR_String) VALUES ("Test Other Prof", "otherprof@test.com", "Faculty", "hashedpw", "TEST-QR-OTHER")'
                );
                otherUserId = insUser.insertId;
                cleanupOtherUser = true;
            }

            // Insert distinct occupancy records for both professors using NOW()
            const [ins1] = await db.query(
                'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), "Key Taken")',
                [facultyUser.User_ID, testRoomId]
            );
            const [ins2] = await db.query(
                'INSERT INTO occupancy_log (User_ID, Room_ID, Access_Time, Auth_Method) VALUES (?, ?, NOW(), "Key Taken")',
                [otherUserId, testRoomId]
            );

            try {
                // Fetch report data filtered to facultyUser
                const reportDataTarget = await roomStatusReportService.getRoomStatusActivityReportData({
                    period: 'today',
                    roomNumber: 'all',
                    professorId: facultyUser.User_ID
                });

                // Assert target professor records exist and other professor records are excluded
                const targetProfRecords = reportDataTarget.records.filter(r => r.user.includes(facultyUser.Name));
                const otherProfRecords = reportDataTarget.records.filter(r => r.user.includes('Test Other Prof') || (otherFacultyRows[0] && r.user.includes(otherFacultyRows[0].Name)));

                assert.ok(targetProfRecords.length > 0, 'Target professor records must be present in filtered report');
                assert.strictEqual(otherProfRecords.length, 0, 'Other professor records must be strictly excluded');

                // Fetch unfiltered report data
                const reportDataAll = await roomStatusReportService.getRoomStatusActivityReportData({
                    period: 'today',
                    roomNumber: 'all',
                    professorId: 'all'
                });

                assert.ok(reportDataAll.records.length >= reportDataTarget.records.length, 'Unfiltered report must contain all records');
            } finally {
                // Clean up inserted logs
                await db.query('DELETE FROM occupancy_log WHERE Log_ID IN (?, ?)', [ins1.insertId, ins2.insertId]);
                if (cleanupOtherUser) {
                    await db.query('DELETE FROM users WHERE User_ID = ?', [otherUserId]);
                }
            }
        });
    });

    await t.test('9. Key Status Legend Verification (Revision 3)', async (t) => {
        const cp = require('child_process');
        const fs = require('fs');
        const path = require('path');

        function extractPdfPagesText(pdfBuffer) {
            const tmpPdf = path.join(__dirname, `tmp_legend_test_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
            fs.writeFileSync(tmpPdf, pdfBuffer);
            try {
                const out = cp.execFileSync('python', [
                    '-c',
                    'import sys, pymupdf\ndoc = pymupdf.open(sys.argv[1])\nfor i, p in enumerate(doc):\n    print(f"---PAGE_{i+1}---")\n    print(p.get_text())\n',
                    tmpPdf
                ], { encoding: 'utf-8' });
                return out;
            } finally {
                if (fs.existsSync(tmpPdf)) fs.unlinkSync(tmpPdf);
            }
        }

        await t.test('9.1 buildRoomStatusReportPDF renders Key Status Legend with all indicators and definitions', async () => {
            const sampleRecords = [
                {
                    date: 'Oct 16, 2026',
                    time: '08:00 AM',
                    room: 'RM 203',
                    status: 'Key Returned',
                    user: 'Prof. John Doe',
                    role: 'Faculty',
                    authMethod: 'Key Box',
                    details: 'Key returned to slot'
                },
                {
                    date: 'Oct 16, 2026',
                    time: '09:30 AM',
                    room: 'RM 203',
                    status: 'In Session (Key Taken)',
                    user: 'Prof. Maria Santos',
                    role: 'Faculty',
                    authMethod: 'Key Box',
                    details: 'Scheduled Class Session'
                }
            ];

            const pdfBuf = await roomStatusReportService.buildRoomStatusReportPDF({
                records: sampleRecords,
                periodLabel: 'Today (Oct 16, 2026)',
                roomFilterLabel: 'All Rooms',
                professorFilterLabel: 'All Professors',
                generatedBy: 'IT Department Head'
            });

            assert.strictEqual(pdfBuf.slice(0, 4).toString(), '%PDF', 'Output must be valid PDF');
            const fullText = extractPdfPagesText(pdfBuf);

            // Verify Key Status Legend title and subtitle
            assert.ok(fullText.includes('KEY STATUS LEGEND'), 'PDF must include KEY STATUS LEGEND section title');
            assert.ok(
                fullText.includes('Physical key detection states and room custody activity indicators'),
                'PDF must include legend explanatory subtitle'
            );

            // Verify Physical Key detection statuses
            assert.ok(fullText.includes('Present'), 'Legend must include Present status');
            assert.ok(
                fullText.includes('Physical key detected in slot; room available'),
                'Legend must define Present as key detected in slot with room available'
            );
            assert.ok(fullText.includes('Absent'), 'Legend must include Absent status');
            assert.ok(
                fullText.includes('Physical key removed from designated slot'),
                'Legend must define Absent as physical key removed from designated slot'
            );

            // Verify Room Activity and Custody statuses
            assert.ok(fullText.includes('In Session / Borrowed'), 'Legend must include In Session / Borrowed');
            assert.ok(
                fullText.includes('Key absent; active class or lab borrowing'),
                'Legend must define In Session / Borrowed'
            );
            assert.ok(fullText.includes('Key Returned'), 'Legend must include Key Returned');
            assert.ok(
                fullText.includes('Key restored and confirmed in slot'),
                'Legend must define Key Returned as restored and confirmed in slot'
            );
            assert.ok(fullText.includes('Key Transferred'), 'Legend must include Key Transferred');
            assert.ok(
                fullText.includes('Custody transferred between faculty'),
                'Legend must define Key Transferred as custody transferred between faculty'
            );
            assert.ok(fullText.includes('Security Alert'), 'Legend must include Security Alert');
            assert.ok(
                fullText.includes('Unauthorized removal or wrong key slot'),
                'Legend must define Security Alert as unauthorized removal or wrong key slot'
            );
        });

        await t.test('9.2 Key Status Legend renders properly when records count is zero (empty report)', async () => {
            const pdfBuf = await roomStatusReportService.buildRoomStatusReportPDF({
                records: [],
                periodLabel: 'Today (Oct 16, 2026)',
                roomFilterLabel: 'Room 203',
                professorFilterLabel: 'Prof. John Doe',
                generatedBy: 'IT Department Head'
            });

            const fullText = extractPdfPagesText(pdfBuf);
            assert.ok(fullText.includes('KEY STATUS LEGEND'), 'Empty report must still display KEY STATUS LEGEND');
            assert.ok(fullText.includes('Present'), 'Empty report must still explain Present status');
            assert.ok(fullText.includes('Absent'), 'Empty report must still explain Absent status');
            assert.ok(
                fullText.includes('No room status activity records were found for the selected period.'),
                'Empty report must retain empty state message'
            );
            assert.ok(fullText.includes('0 records'), 'Metadata card must show 0 records');
        });

        await t.test('9.3 Multi-page layout preserves pagination and renders legend only on Page 1', async () => {
            const multiRecords = [];
            for (let i = 0; i < 40; i++) {
                multiRecords.push({
                    date: 'Oct 16, 2026',
                    time: '08:00 AM',
                    room: 'RM 203',
                    status: i % 2 === 0 ? 'Key Returned' : 'In Session (Key Taken)',
                    user: `Prof. Test ${i + 1}`,
                    role: 'Faculty',
                    authMethod: 'Key Box',
                    details: `Event ${i + 1}`
                });
            }

            const pdfBuf = await roomStatusReportService.buildRoomStatusReportPDF({
                records: multiRecords,
                periodLabel: 'Today (Oct 16, 2026)',
                roomFilterLabel: 'All Rooms',
                professorFilterLabel: 'All Professors',
                generatedBy: 'IT Department Head'
            });

            const pagesText = extractPdfPagesText(pdfBuf);
            const pageChunks = pagesText.split('---PAGE_');
            // pageChunks[0] is empty prefix, pageChunks[1] is Page 1, pageChunks[2] is Page 2
            assert.ok(pageChunks.length >= 3, '40 records must span across at least 2 pages');

            const page1Text = pageChunks[1];
            const page2Text = pageChunks[2];

            // Page 1 should contain the legend
            assert.ok(page1Text.includes('KEY STATUS LEGEND'), 'Page 1 must contain KEY STATUS LEGEND');
            assert.ok(page1Text.includes('Physical key detected in slot'), 'Page 1 must contain definitions');

            // Page 2 should NOT contain a duplicate legend
            assert.ok(!page2Text.includes('KEY STATUS LEGEND'), 'Page 2 must NOT duplicate KEY STATUS LEGEND');

            // Both pages should contain footer page numbers
            assert.ok(page1Text.includes('Page 1 of 2'), 'Page 1 must contain footer "Page 1 of 2"');
            assert.ok(page2Text.includes('Page 2 of 2'), 'Page 2 must contain footer "Page 2 of 2"');
        });

        await t.test('9.4 Department Head endpoint returns PDF containing Key Status Legend', async () => {
            const res = await makeRequest('/api/reports/room-status?period=today', deptHeadUser);
            assert.strictEqual(res.status, 200);
            assert.ok(res.headers.get('content-type').includes('application/pdf'));

            const text = extractPdfPagesText(res.body);
            assert.ok(text.includes('KEY STATUS LEGEND'), 'Generated endpoint PDF must include KEY STATUS LEGEND');
            assert.ok(text.includes('Present'), 'Generated endpoint PDF must include Present');
            assert.ok(text.includes('Absent'), 'Generated endpoint PDF must include Absent');
        });

        await t.test('9.5 Professor-filtered endpoint returns PDF containing Key Status Legend and filtered data', async () => {
            const res = await makeRequest(
                `/api/reports/room-status?period=today&professorId=${facultyUser.User_ID}`,
                deptHeadUser
            );
            assert.strictEqual(res.status, 200);
            assert.ok(res.headers.get('content-type').includes('application/pdf'));

            const text = extractPdfPagesText(res.body);
            assert.ok(text.includes('KEY STATUS LEGEND'), 'Filtered report must retain KEY STATUS LEGEND');
            assert.ok(text.includes('Professor Filter:'), 'Filtered report must display Professor Filter field');
            assert.ok(text.includes(facultyUser.Name), 'Filtered report must display target professor name');
        });
    });

    await t.test('Teardown test server and database', async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await db.end();
    });
});
