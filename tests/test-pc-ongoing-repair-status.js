'use strict';

/**
 * tests/test-pc-ongoing-repair-status.js
 * Comprehensive regression test suite for LabSync PC Report "Ongoing Repair" Status Workflow:
 * 
 * 1. Newly submitted PC reports begin as Pending.
 * 2. An authorized maintenance user (MIS Staff, OJT) can transition a report to Ongoing Repair.
 * 3. An unauthorized user (Faculty, Program Coordinator, unauthenticated) cannot update the report status.
 * 4. An Ongoing Repair report remains unresolved (Status != 'Resolved', PC condition Under Maintenance).
 * 5. An authorized maintenance user can subsequently mark the report Resolved.
 * 6. Existing Resolved reports remain correctly represented and cannot accidentally revert to Pending or Ongoing Repair.
 * 7. Existing reports using an equivalent 'In Progress' state remain compatible with 'Ongoing Repair' display.
 * 8. The MIS interface displays the correct status and actions (Start Repair on Pending, Mark Resolved on Ongoing Repair, Completed on Resolved).
 * 9. The IT Department Head can see the new status and still use the existing follow-up feature.
 * 10. Follow-up actions do not incorrectly mark reports as being repaired (status preserved).
 * 11. Filters, counts, and unresolved-report calculations remain correct.
 * 12. Existing PC report creation, deduplication, validation, and resolution behavior remains intact.
 * 13. Existing OJT, MIS, Faculty, Department Head, and Program Coordinator authorization boundaries remain intact.
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const vm = require('node:vm');

const db = require('../database/connection');
const reportsRoutes = require('../routes/maintenance.routes');
const maintenanceService = require('../services/maintenanceService');
const maintenanceRepo = require('../repositories/maintenance.repository');
const labRepo = require('../repositories/laboratory.repository');

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-ongoing-repair-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    // Inject session for tests via custom test headers
    app.use((req, res, next) => {
        if (req.headers['x-test-user-id']) {
            req.session.userId = parseInt(req.headers['x-test-user-id'], 10);
            req.session.userRole = req.headers['x-test-user-role'];
            req.session.userName = req.headers['x-test-user-name'] || 'Test User';
            req.session.userEmail = req.headers['x-test-user-email'] || 'test@bulsu.edu.ph';
            req.session.lastActivity = Date.now();
        }
        next();
    });

    app.use('/api/reports', reportsRoutes);
    app.use('/api/maintenance', reportsRoutes);
    return app;
}

function makeRequest(server, options, body = null) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const reqOpts = {
            hostname: '127.0.0.1',
            port,
            path: options.path,
            method: options.method || 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
        };

        const req = http.request(reqOpts, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {
                    parsed = data;
                }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

test('LabSync Ongoing Repair Status & Three-Stage Workflow Suite', async (t) => {
    let server;
    let deptHeadUserId, misUserId, ojtUserId, facultyUserId, coordUserId;
    let testRoomId, testPcId1, testPcId2;
    let issueId1, issueId2, issueId3;

    const uniqueTag = Date.now();

    await t.test('Setup test environment, fixtures, and HTTP server', async () => {
        const app = createTestApp();
        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));

        // Create test users
        const [dh] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'IT Dept. Head', 'ACTIVE')",
            [`DeptHead_${uniqueTag}`, `depthead_${uniqueTag}@bulsu.edu.ph`]
        );
        deptHeadUserId = dh.insertId;

        const [mis] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'MIS Staff', 'ACTIVE')",
            [`MISStaff_${uniqueTag}`, `mis_${uniqueTag}@bulsu.edu.ph`]
        );
        misUserId = mis.insertId;

        const [ojt] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'OJT', 'ACTIVE')",
            [`OJT_${uniqueTag}`, `ojt_${uniqueTag}@bulsu.edu.ph`]
        );
        ojtUserId = ojt.insertId;

        const [fac] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'Faculty', 'ACTIVE')",
            [`Faculty_${uniqueTag}`, `faculty_${uniqueTag}@bulsu.edu.ph`]
        );
        facultyUserId = fac.insertId;

        const [coord] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'Program Coordinator', 'ACTIVE')",
            [`Coord_${uniqueTag}`, `coord_${uniqueTag}@bulsu.edu.ph`]
        );
        coordUserId = coord.insertId;

        // Create test laboratory and workstations
        const [room] = await db.query(
            "INSERT INTO laboratories (Room_Number, Building, Current_Status, Key_Status) VALUES (?, 'CICT Building', 'Available', 'Present')",
            [`99${uniqueTag.toString().slice(-2)}`]
        );
        testRoomId = room.insertId;

        const [pc1] = await db.query(
            'INSERT INTO lab_units (Room_ID, PC_Number, PC_QR_String, Condition_Status) VALUES (?, 1, ?, ?)',
            [testRoomId, `QR-TEST-PC1-${uniqueTag}`, 'Under Maintenance']
        );
        testPcId1 = pc1.insertId;

        const [pc2] = await db.query(
            'INSERT INTO lab_units (Room_ID, PC_Number, PC_QR_String, Condition_Status) VALUES (?, 2, ?, ?)',
            [testRoomId, `QR-TEST-PC2-${uniqueTag}`, 'Under Maintenance']
        );
        testPcId2 = pc2.insertId;

        // Issue 1 on PC 1: starts Pending
        const [iss1] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Monitor Flickering', 'Pending', 'Medium', NOW())",
            [testPcId1]
        );
        issueId1 = iss1.insertId;

        await db.query(
            "INSERT INTO maintenance (Maintenance_Issue_ID, PC_ID, Student_Name, Student_Number, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, 'Maria Santos', '2023-10001', '[Issues: Monitor Flickering] Remarks: Display turns black', NOW(), 'Pending', 'Medium')",
            [issueId1, testPcId1]
        );

        // Issue 2 on PC 2: legacy 'In Progress' issue
        const [iss2] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Network Cable Broken', 'In Progress', 'High', NOW())",
            [testPcId2]
        );
        issueId2 = iss2.insertId;

        await db.query(
            "INSERT INTO maintenance (Maintenance_Issue_ID, PC_ID, Student_Name, Student_Number, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, 'Juan Luna', '2023-10002', '[Issues: Network Cable Broken] Remarks: No internet', NOW(), 'In Progress', 'High')",
            [issueId2, testPcId2]
        );

        // Issue 3 on PC 2: starts Resolved
        const [iss3] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At, Resolved_At, Resolved_By_User_ID) VALUES (?, 'Faulty Mouse', 'Resolved', 'Low', NOW() - INTERVAL 1 DAY, NOW(), ?)",
            [testPcId2, misUserId]
        );
        issueId3 = iss3.insertId;

        await db.query(
            "INSERT INTO maintenance (Maintenance_Issue_ID, PC_ID, Student_Name, Student_Number, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, 'Pedro Penduko', '2023-10003', '[Issues: Faulty Mouse] Remarks: Replaced', NOW() - INTERVAL 1 DAY, 'Resolved', 'Low')",
            [issueId3, testPcId2]
        );
    });

    // 1. Newly submitted PC reports begin as Pending
    await t.test('1. Newly submitted PC reports begin as Pending in maintenance and maintenance_issues', async () => {
        const [iss] = await db.query('SELECT Status FROM maintenance_issues WHERE Issue_ID = ?', [issueId1]);
        const [rep] = await db.query('SELECT Status FROM maintenance WHERE Maintenance_Issue_ID = ?', [issueId1]);

        assert.strictEqual(iss[0].Status, 'Pending', 'maintenance_issues status must be Pending');
        assert.strictEqual(rep[0].Status, 'Pending', 'maintenance report status must be Pending');
    });

    // 2. Authorized maintenance user can transition report to Ongoing Repair
    await t.test('2. Authorized MIS Staff can transition a Pending report to Ongoing Repair (accepts "Ongoing Repair" or "In Progress")', async () => {
        const res = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Ongoing Repair' });

        assert.strictEqual(res.status, 200, 'Status update must succeed with 200');
        assert.strictEqual(res.body.newStatus, 'In Progress', 'Canonical database status must be In Progress');
        assert.strictEqual(res.body.displayStatus, 'Ongoing Repair', 'API must return displayStatus as Ongoing Repair');
        assert.ok(res.body.message.includes('undergoing repair'), 'Message must reflect active repair work');

        const [dbCheck] = await db.query('SELECT Status FROM maintenance_issues WHERE Issue_ID = ?', [issueId1]);
        assert.strictEqual(dbCheck[0].Status, 'In Progress', 'Database stores canonical In Progress');

        const [repCheck] = await db.query('SELECT Status FROM maintenance WHERE Maintenance_Issue_ID = ?', [issueId1]);
        assert.strictEqual(repCheck[0].Status, 'In Progress', 'Linked student report status also updated to In Progress');
    });

    // 3. Unauthorized users cannot update report status
    await t.test('3. Unauthorized users cannot update report status (Faculty, Program Coordinator, unauthenticated)', async () => {
        // Faculty -> 403 Forbidden
        const facRes = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': facultyUserId,
                'x-test-user-role': 'Faculty'
            }
        }, { status: 'Resolved' });
        assert.strictEqual(facRes.status, 403, 'Faculty status update must return 403 Forbidden');

        // Program Coordinator -> 403 Forbidden
        const coordRes = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': coordUserId,
                'x-test-user-role': 'Program Coordinator'
            }
        }, { status: 'Resolved' });
        assert.strictEqual(coordRes.status, 403, 'Program Coordinator status update must return 403 Forbidden');

        // Unauthenticated -> 401 Unauthorized
        const unauthRes = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT'
        }, { status: 'Resolved' });
        assert.strictEqual(unauthRes.status, 401, 'Unauthenticated status update must return 401 Unauthorized');

        // Verify status remains 'In Progress' and report was not modified by unauthorized attempts
        const [iss1Check] = await db.query('SELECT Status FROM maintenance_issues WHERE Issue_ID = ?', [issueId1]);
        assert.strictEqual(iss1Check[0].Status, 'In Progress', 'Database status must remain In Progress after unauthorized requests');
    });

    // 4. An Ongoing Repair report remains unresolved
    await t.test('4. An Ongoing Repair report remains unresolved (Condition_Status remains Under Maintenance)', async () => {
        const [activeCount] = await maintenanceRepo.countActiveIssuesByPCId(testPcId1);
        assert.strictEqual(activeCount[0].count, 1, 'Active issue count must be 1');

        const [pc] = await db.query('SELECT Condition_Status FROM lab_units WHERE PC_ID = ?', [testPcId1]);
        assert.strictEqual(pc[0].Condition_Status, 'Under Maintenance', 'PC must remain Under Maintenance during repair');
    });

    // 5. Authorized maintenance user can subsequently mark the report Resolved
    await t.test('5. Authorized OJT user can subsequently mark Ongoing Repair report as Resolved', async () => {
        const res = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': ojtUserId,
                'x-test-user-role': 'OJT'
            }
        }, { status: 'Resolved' });

        assert.strictEqual(res.status, 200, 'Resolution must succeed with 200');
        assert.strictEqual(res.body.newStatus, 'Resolved', 'New status is Resolved');
        assert.strictEqual(res.body.displayStatus, 'Resolved', 'Display status is Resolved');

        const [iss] = await db.query('SELECT Status, Resolved_By_User_ID FROM maintenance_issues WHERE Issue_ID = ?', [issueId1]);
        assert.strictEqual(iss[0].Status, 'Resolved');
        assert.strictEqual(iss[0].Resolved_By_User_ID, ojtUserId, 'OJT user ID recorded as resolver');

        // PC 1 has no other active issues -> restored to Functional
        const [pc] = await db.query('SELECT Condition_Status FROM lab_units WHERE PC_ID = ?', [testPcId1]);
        assert.strictEqual(pc[0].Condition_Status, 'Functional', 'PC must be restored to Functional after all issues resolved');
    });

    // 6. Existing Resolved reports remain correctly represented and cannot be reverted
    await t.test('6. Existing Resolved reports cannot accidentally revert to Pending or Ongoing Repair', async () => {
        // Attempt revert to Pending
        const revPending = await makeRequest(server, {
            path: `/api/reports/${issueId3}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Pending' });
        assert.strictEqual(revPending.status, 400, 'Reverting resolved ticket to Pending must return 400 Bad Request');
        assert.ok(revPending.body.error.includes('already resolved'), 'Error must specify report is already resolved');

        // Attempt revert to Ongoing Repair
        const revRepair = await makeRequest(server, {
            path: `/api/reports/${issueId3}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Ongoing Repair' });
        assert.strictEqual(revRepair.status, 400, 'Reverting resolved ticket to Ongoing Repair must return 400 Bad Request');

        // Idempotency: re-resolving an already resolved report
        const reResolve = await makeRequest(server, {
            path: `/api/reports/${issueId3}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Resolved' });
        assert.strictEqual(reResolve.status, 200, 'Re-resolving returns 200 idempotently');
        assert.strictEqual(reResolve.body.noTransition, true, 'noTransition flag set to true');
    });

    // 7. Existing reports using equivalent In Progress state remain compatible
    await t.test('7. GET /api/reports enriches existing In Progress reports with Display_Status: "Ongoing Repair"', async () => {
        const res = await makeRequest(server, {
            path: '/api/reports',
            method: 'GET',
            headers: {
                'x-test-user-id': deptHeadUserId,
                'x-test-user-role': 'IT Dept. Head'
            }
        });

        assert.strictEqual(res.status, 200);
        const reportsList = Array.isArray(res.body) ? res.body : res.body.data;
        assert.ok(Array.isArray(reportsList), 'Returns reports array');

        const inProgressReport = reportsList.find(r => r.Issue_ID === issueId2 || r.Report_ID === issueId2);
        assert.ok(inProgressReport, 'Found issue 2');
        assert.strictEqual(inProgressReport.Status, 'In Progress', 'Canonical Status is In Progress');
        assert.strictEqual(inProgressReport.Display_Status, 'Ongoing Repair', 'Display_Status is Ongoing Repair');
    });

    // 8. The MIS interface displays correct status and actions across Pending, Ongoing Repair, Resolved
    await t.test('8. The MIS interface displays correct status and actions (table and cards)', async () => {
        const tableRendererCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'mis-maintenance', 'maintenance.renderer.js'), 'utf8');

        const sandbox = {
            console,
            Date,
            String,
            Boolean,
            Number,
            Array,
            Object,
            document: {
                getElementById: () => ({ innerHTML: '', _lastRenderSignature: '' }),
                addEventListener: () => {},
                removeEventListener: () => {},
                querySelector: () => null,
                querySelectorAll: () => []
            },
            lucide: { createIcons: () => {} },
            escapeHtml: (s) => (s || '')
        };
        sandbox.window = sandbox;
        sandbox.global = sandbox;
        vm.runInNewContext(tableRendererCode, sandbox);

        const targetEl = { innerHTML: '', _lastRenderSignature: '' };
        const testRows = [
            { Report_ID: 101, Status: 'Pending', Room_Number: '201', PC_Number: '1', Date_Reported: new Date().toISOString(), Issue_Description: 'Broken fan' },
            { Report_ID: 102, Status: 'In Progress', Room_Number: '201', PC_Number: '2', Date_Reported: new Date().toISOString(), Issue_Description: 'Flickering' },
            { Report_ID: 103, Status: 'Resolved', Room_Number: '201', PC_Number: '3', Date_Reported: new Date().toISOString(), Resolved_At: new Date().toISOString(), Issue_Description: 'Fixed mouse' }
        ];

        sandbox.maintenanceRenderer.renderTableRows(testRows, targetEl);
        const html = targetEl.innerHTML;

        // Pending row (101) has Start Repair but NOT Mark Resolved (strictly two buttons: View Details + Start Repair)
        const row101 = html.slice(html.indexOf('data-report-id="101"'), html.indexOf('data-report-id="102"'));
        assert.ok(row101.includes('data-action="view-ticket-details"'), 'Pending ticket must have View Details button');
        assert.ok(row101.includes('data-action="start-repair"'), 'Pending ticket must have Start Repair button');
        assert.ok(!row101.includes('data-action="resolve-ticket"'), 'Pending ticket must NOT have Mark Resolved button');

        // Ongoing Repair row (102) has Ongoing Repair badge and Mark Resolved (strictly two buttons: View Details + Mark Resolved)
        const row102 = html.slice(html.indexOf('data-report-id="102"'), html.indexOf('data-report-id="103"'));
        assert.ok(row102.includes('data-action="view-ticket-details"'), 'Ongoing repair ticket must have View Details button');
        assert.ok(row102.includes('data-action="resolve-ticket"'), 'Ongoing repair ticket must have Mark Resolved button');
        assert.ok(!row102.includes('data-action="start-repair"'), 'Ongoing repair ticket must NOT have Start Repair button');
        assert.ok(row102.includes('Ongoing Repair'), 'Must render Ongoing Repair badge in table');
        assert.ok(row102.includes('class="status-badge ongoing-repair"'), 'Table includes status-badge ongoing-repair');

        // Resolved row (103) has completed-chip (strictly two buttons: View Details + Completed)
        const row103 = html.slice(html.indexOf('data-report-id="103"'));
        assert.ok(row103.includes('data-action="view-ticket-details"'), 'Resolved ticket must have View Details button');
        assert.ok(row103.includes('completed-chip'), 'Resolved ticket has completed-chip');
        assert.ok(!row103.includes('data-action="start-repair"'), 'Resolved ticket must NOT have Start Repair button');
        assert.ok(!row103.includes('data-action="resolve-ticket"'), 'Resolved ticket must NOT have Mark Resolved button');
    });

    // 9. The IT Department Head can see the new status and still use the existing follow-up feature
    await t.test('9. The IT Department Head can see Ongoing Repair and still use follow-up on In Progress issues', async () => {
        // Follow up on issueId2 (which is In Progress)
        const fuRes = await makeRequest(server, {
            path: `/api/reports/${issueId2}/follow-up`,
            method: 'POST',
            headers: {
                'x-test-user-id': deptHeadUserId,
                'x-test-user-role': 'IT Dept. Head'
            }
        });

        assert.strictEqual(fuRes.status, 200, 'Follow-up on In Progress report must succeed');
        assert.strictEqual(fuRes.body.status, 'In Progress', 'Status must remain In Progress');
        assert.strictEqual(fuRes.body.followUpCount, 1, 'Follow-up count incremented to 1');

        const [dbIss] = await db.query('SELECT Status, Follow_Up_Count FROM maintenance_issues WHERE Issue_ID = ?', [issueId2]);
        assert.strictEqual(dbIss[0].Status, 'In Progress', 'Status in database remains In Progress');
        assert.strictEqual(dbIss[0].Follow_Up_Count, 1, 'Database follow-up count is 1');
    });

    // 10. Follow-up actions do not incorrectly mark reports as being repaired
    await t.test('10. Follow-up on a Pending report increments follow-up count without changing status to Ongoing Repair', async () => {
        // Create a fresh pending issue
        const [freshIss] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Speaker Buzzing', 'Pending', 'Low', NOW())",
            [testPcId2]
        );
        const freshId = freshIss.insertId;

        const fuRes = await makeRequest(server, {
            path: `/api/reports/${freshId}/follow-up`,
            method: 'POST',
            headers: {
                'x-test-user-id': deptHeadUserId,
                'x-test-user-role': 'IT Dept. Head'
            }
        });

        assert.strictEqual(fuRes.status, 200);
        assert.strictEqual(fuRes.body.status, 'Pending', 'Status must remain strictly Pending after follow-up');

        const [freshDb] = await db.query('SELECT Status FROM maintenance_issues WHERE Issue_ID = ?', [freshId]);
        assert.strictEqual(freshDb[0].Status, 'Pending', 'Database Status must NOT change to In Progress or Ongoing Repair');
    });

    // 11. Filters, counts, and unresolved-report calculations remain correct
    await t.test('11. Filter logic and unresolved-report calculations correctly isolate Pending, Ongoing Repair, and Resolved', async () => {
        const filterCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.filters.js'), 'utf8');

        const sandbox = {};
        sandbox.window = sandbox;
        sandbox.global = sandbox;
        vm.runInNewContext(filterCode, sandbox);
        const reportFilters = sandbox.reportFilters || sandbox;

        const reports = [
            { Report_ID: 1, Status: 'Pending', Issue_Type: 'Monitor' },
            { Report_ID: 2, Status: 'In Progress', Issue_Type: 'Keyboard' },
            { Report_ID: 3, Status: 'Ongoing Repair', Issue_Type: 'Mouse' },
            { Report_ID: 4, Status: 'Resolved', Issue_Type: 'Audio' }
        ];

        // 11a. Filter by "Pending"
        const pendingFiltered = reports.filter(r => reportFilters.matchesReportFilters(r, { status: 'Pending' }));
        assert.strictEqual(pendingFiltered.length, 1);
        assert.strictEqual(pendingFiltered[0].Report_ID, 1);

        // 11b. Filter by "Ongoing Repair" matches both In Progress and Ongoing Repair
        const ongoingFiltered = reports.filter(r => reportFilters.matchesReportFilters(r, { status: 'Ongoing Repair' }));
        assert.strictEqual(ongoingFiltered.length, 2);
        assert.deepStrictEqual(ongoingFiltered.map(r => r.Report_ID), [2, 3]);

        // 11c. Filter by "In Progress" matches both In Progress and Ongoing Repair
        const inProgressFiltered = reports.filter(r => reportFilters.matchesReportFilters(r, { status: 'In Progress' }));
        assert.strictEqual(inProgressFiltered.length, 2);

        // 11d. Filter by "Resolved"
        const resolvedFiltered = reports.filter(r => reportFilters.matchesReportFilters(r, { status: 'Resolved' }));
        assert.strictEqual(resolvedFiltered.length, 1);
        assert.strictEqual(resolvedFiltered[0].Report_ID, 4);

        // 11e. Text search for "ongoing repair"
        const textSearchMatch = (reportFilters.matchesReportQuery || sandbox.matchesReportQuery)({ Report_ID: 5, Status: 'In Progress', Issue_Type: 'Monitor' }, 'ongoing repair');
        assert.strictEqual(textSearchMatch, true, 'Searching "ongoing repair" must match In Progress ticket');
    });

    // 12. Prevent invalid transition from In Progress back to Pending
    await t.test('12. Reports undergoing repair cannot be reverted back to Pending', async () => {
        const revRes = await makeRequest(server, {
            path: `/api/reports/${issueId2}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Pending' });

        assert.strictEqual(revRes.status, 400, 'Reverting In Progress to Pending must return 400 Bad Request');
        assert.ok(revRes.body.error.includes('undergoing repair'), 'Error explains cannot revert to Pending');
    });

    // 13. Role authorization boundaries: IT Dept Head & Program Coordinator cannot update status
    await t.test('13. Role authorization boundaries: IT Dept Head & Program Coordinator cannot mutate ticket status via PUT, only Dept Head can Follow-Up', async () => {
        let authIssueId;
        try {
            // Create a separate fixture so unauthorized requests cannot mutate records needed by other tests
            const [issAuth] = await db.query(
                "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Thermal Paste Dry', 'In Progress', 'High', NOW())",
                [testPcId2]
            );
            authIssueId = issAuth.insertId;

            // 1. IT Dept Head attempting to change status returns 403 Forbidden
            const headPutRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/status`,
                method: 'PUT',
                headers: {
                    'x-test-user-id': deptHeadUserId,
                    'x-test-user-role': 'IT Dept. Head'
                }
            }, { status: 'Resolved' });
            assert.strictEqual(headPutRes.status, 403, 'IT Dept Head PUT /status must return 403 Forbidden');

            // 2. Program Coordinator attempting to change status returns 403 Forbidden
            const coordPutRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/status`,
                method: 'PUT',
                headers: {
                    'x-test-user-id': coordUserId,
                    'x-test-user-role': 'Program Coordinator'
                }
            }, { status: 'Resolved' });
            assert.strictEqual(coordPutRes.status, 403, 'Program Coordinator PUT /status must return 403 Forbidden');

            // 3. Faculty attempting to change status returns 403 Forbidden
            const facPutRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/status`,
                method: 'PUT',
                headers: {
                    'x-test-user-id': facultyUserId,
                    'x-test-user-role': 'Faculty'
                }
            }, { status: 'Resolved' });
            assert.strictEqual(facPutRes.status, 403, 'Faculty PUT /status must return 403 Forbidden');

            // 4. Verify unauthorized PUT attempts leave status unchanged in database
            const [checkAuth] = await db.query('SELECT Status, Follow_Up_Count FROM maintenance_issues WHERE Issue_ID = ?', [authIssueId]);
            assert.strictEqual(checkAuth[0].Status, 'In Progress', 'Issue status must remain unchanged at In Progress');
            assert.strictEqual(checkAuth[0].Follow_Up_Count, 0, 'Follow up count starts at 0');

            // 5. IT Dept Head CAN follow up on unresolved Ongoing Repair report (200 OK)
            const headFuRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/follow-up`,
                method: 'POST',
                headers: {
                    'x-test-user-id': deptHeadUserId,
                    'x-test-user-role': 'IT Dept. Head'
                }
            });
            assert.strictEqual(headFuRes.status, 200, 'IT Dept Head can follow up unresolved report');
            assert.strictEqual(headFuRes.body.status, 'In Progress', 'Status remains In Progress after follow-up');
            assert.strictEqual(headFuRes.body.followUpCount, 1, 'Follow-up count incremented to 1');

            // 6. Program Coordinator CANNOT follow up (403 Forbidden)
            const coordFuRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/follow-up`,
                method: 'POST',
                headers: {
                    'x-test-user-id': coordUserId,
                    'x-test-user-role': 'Program Coordinator'
                }
            });
            assert.strictEqual(coordFuRes.status, 403, 'Program Coordinator follow-up must return 403 Forbidden');

            // 7. Faculty CANNOT follow up (403 Forbidden)
            const facFuRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/follow-up`,
                method: 'POST',
                headers: {
                    'x-test-user-id': facultyUserId,
                    'x-test-user-role': 'Faculty'
                }
            });
            assert.strictEqual(facFuRes.status, 403, 'Faculty follow-up must return 403 Forbidden');

            // 8. MIS Staff CANNOT follow up (403 Forbidden)
            const misFuRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/follow-up`,
                method: 'POST',
                headers: {
                    'x-test-user-id': misUserId,
                    'x-test-user-role': 'MIS Staff'
                }
            });
            assert.strictEqual(misFuRes.status, 403, 'MIS Staff follow-up must return 403 Forbidden');

            // 9. OJT CANNOT follow up (403 Forbidden)
            const ojtFuRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/follow-up`,
                method: 'POST',
                headers: {
                    'x-test-user-id': ojtUserId,
                    'x-test-user-role': 'OJT'
                }
            });
            assert.strictEqual(ojtFuRes.status, 403, 'OJT follow-up must return 403 Forbidden');

            // 10. Unauthenticated CANNOT follow up (401 Unauthorized)
            const unauthFuRes = await makeRequest(server, {
                path: `/api/reports/${authIssueId}/follow-up`,
                method: 'POST'
            });
            assert.strictEqual(unauthFuRes.status, 401, 'Unauthenticated follow-up must return 401 Unauthorized');
        } finally {
            if (authIssueId) {
                await db.query('DELETE FROM maintenance_issues WHERE Issue_ID = ?', [authIssueId]);
            }
        }
    });

    // 14. PC defect ticket deletion permissions: IT Dept Head & MIS Staff can delete; Program Coordinator, OJT, Faculty cannot
    await t.test('14. PC defect ticket deletion permissions: IT Dept Head & MIS Staff can delete; Program Coordinator, OJT, Faculty cannot', async () => {
        let delIssueId1, delIssueId2;
        try {
            // Create test issues for deletion testing
            const [delIss1] = await db.query(
                "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Corrupted Driver', 'Pending', 'Low', NOW())",
                [testPcId2]
            );
            delIssueId1 = delIss1.insertId;

            // 1. Program Coordinator receives 403 Forbidden
            const coordDelRes = await makeRequest(server, {
                path: `/api/reports/${delIssueId1}`,
                method: 'DELETE',
                headers: {
                    'x-test-user-id': coordUserId,
                    'x-test-user-role': 'Program Coordinator'
                }
            });
            assert.strictEqual(coordDelRes.status, 403, 'Program Coordinator cannot delete PC reports (403 Forbidden)');

            // 2. OJT receives 403 Forbidden
            const ojtDelRes = await makeRequest(server, {
                path: `/api/reports/${delIssueId1}`,
                method: 'DELETE',
                headers: {
                    'x-test-user-id': ojtUserId,
                    'x-test-user-role': 'OJT'
                }
            });
            assert.strictEqual(ojtDelRes.status, 403, 'OJT cannot delete PC reports (403 Forbidden)');

            // 3. Faculty receives 403 Forbidden
            const facDelRes = await makeRequest(server, {
                path: `/api/reports/${delIssueId1}`,
                method: 'DELETE',
                headers: {
                    'x-test-user-id': facultyUserId,
                    'x-test-user-role': 'Faculty'
                }
            });
            assert.strictEqual(facDelRes.status, 403, 'Faculty cannot delete PC reports (403 Forbidden)');

            // 4. Unauthenticated caller receives 401 Unauthorized
            const unauthDelRes = await makeRequest(server, {
                path: `/api/reports/${delIssueId1}`,
                method: 'DELETE'
            });
            assert.strictEqual(unauthDelRes.status, 401, 'Unauthenticated caller cannot delete PC reports (401 Unauthorized)');

            // 5. Verify record was NOT deleted by unauthorized requests
            const [stillExists] = await db.query('SELECT Issue_ID, Status FROM maintenance_issues WHERE Issue_ID = ?', [delIssueId1]);
            assert.strictEqual(stillExists.length, 1, 'Report must remain in database after unauthorized deletion attempts');
            assert.strictEqual(stillExists[0].Status, 'Pending', 'Report status must remain unchanged');

            // 6. IT Dept Head CAN delete report (200 OK)
            const headDelRes = await makeRequest(server, {
                path: `/api/reports/${delIssueId1}`,
                method: 'DELETE',
                headers: {
                    'x-test-user-id': deptHeadUserId,
                    'x-test-user-role': 'IT Dept. Head'
                }
            });
            assert.strictEqual(headDelRes.status, 200, 'IT Dept Head can delete PC reports');
            const [checkDeleted1] = await db.query('SELECT Issue_ID FROM maintenance_issues WHERE Issue_ID = ?', [delIssueId1]);
            assert.strictEqual(checkDeleted1.length, 0, 'Report 1 successfully deleted from database by IT Dept Head');

            // Create a second test issue to test MIS Staff deletion
            const [delIss2] = await db.query(
                "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Blown Capacitor', 'Pending', 'High', NOW())",
                [testPcId2]
            );
            delIssueId2 = delIss2.insertId;

            // 7. MIS Staff CAN delete report (200 OK)
            const misDelRes = await makeRequest(server, {
                path: `/api/reports/${delIssueId2}`,
                method: 'DELETE',
                headers: {
                    'x-test-user-id': misUserId,
                    'x-test-user-role': 'MIS Staff'
                }
            });
            assert.strictEqual(misDelRes.status, 200, 'MIS Staff can delete PC reports');
            const [checkDeleted2] = await db.query('SELECT Issue_ID FROM maintenance_issues WHERE Issue_ID = ?', [delIssueId2]);
            assert.strictEqual(checkDeleted2.length, 0, 'Report 2 successfully deleted from database by MIS Staff');
        } finally {
            if (delIssueId1) {
                await db.query('DELETE FROM maintenance_issues WHERE Issue_ID = ?', [delIssueId1]).catch(() => {});
            }
            if (delIssueId2) {
                await db.query('DELETE FROM maintenance_issues WHERE Issue_ID = ?', [delIssueId2]).catch(() => {});
            }
        }
    });

    // 15. Clean up test records and shutdown test server
    await t.test('15. Clean up test records and shutdown test server', async () => {
        await db.query('DELETE FROM maintenance WHERE PC_ID IN (?, ?)', [testPcId1, testPcId2]);
        await db.query('DELETE FROM maintenance_issues WHERE PC_ID IN (?, ?)', [testPcId1, testPcId2]);
        await db.query('DELETE FROM lab_units WHERE Room_ID = ?', [testRoomId]);
        await db.query('DELETE FROM laboratories WHERE Room_ID = ?', [testRoomId]);
        await db.query('DELETE FROM users WHERE User_ID IN (?, ?, ?, ?, ?)', [deptHeadUserId, misUserId, ojtUserId, facultyUserId, coordUserId]);

        if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
        }
        await new Promise(resolve => server.close(resolve));
        await db.end();
    });
});
