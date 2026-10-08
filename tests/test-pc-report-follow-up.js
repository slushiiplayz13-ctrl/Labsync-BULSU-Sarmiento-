'use strict';

/**
 * tests/test-pc-report-follow-up.js
 * Comprehensive automated verification test suite for PC Report Follow-Up capability:
 * 1. IT Dept Head can follow up a Pending report.
 * 2. IT Dept Head can follow up an In Progress report.
 * 3. Program Coordinator receives 403.
 * 4. Faculty receives 403.
 * 5. MIS Staff receives 403.
 * 6. OJT receives 403.
 * 7. Unauthenticated access is rejected (401).
 * 8. Resolved report cannot be followed up (400).
 * 9. Existing Status remains unchanged after Follow-Up.
 * 10. Follow_Up_Count increments correctly.
 * 11. Followed_Up_At is updated correctly.
 * 12. Followed_Up_By_User_ID identifies the IT Dept. Head correctly.
 * 13. Audit log is created.
 * 14. Repeated follow-ups create separate audit events.
 * 15. Program Coordinator does not see the Follow Up button.
 * 16. IT Dept. Head sees the Follow Up button for unresolved reports.
 * 17. Existing Faculty read-only report behavior remains unchanged.
 * 18. Existing student submission workflow still works.
 * 19. Existing MIS/OJT resolution workflow still works.
 * 20. Existing report deduplication behavior still works.
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
const auditService = require('../services/auditService');

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-followup-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));

    // Inject session for tests
    app.use((req, res, next) => {
        if (req.headers['x-test-user-id']) {
            req.session.userId = parseInt(req.headers['x-test-user-id'], 10);
            req.session.userRole = req.headers['x-test-user-role'];
            req.session.userEmail = req.headers['x-test-user-email'] || 'test@bulsu.edu.ph';
            req.session.lastActivity = Date.now();
        }
        next();
    });

    app.use('/api/reports', reportsRoutes);
    return app;
}

test('PC Report Follow-Up Feature Verification Suite', async (t) => {
    let server;
    let baseUrl;
    let deptHeadUser, progCoordUser, facultyUser, misUser, ojtUser;
    let testPcId, testPendingIssueId, testInProgressIssueId, testResolvedIssueId;

    await t.test('Setup test users, workstations, and server', async () => {
        // Find or create test users
        const [deptRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'IT Dept. Head' AND Status = 'ACTIVE' LIMIT 1");
        deptHeadUser = deptRows[0];

        // Ensure Program Coordinator test user exists
        const [pcRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'Program Coordinator' AND Status = 'ACTIVE' LIMIT 1");
        if (pcRows.length > 0) {
            progCoordUser = pcRows[0];
        } else {
            const [ins] = await db.query(
                "INSERT INTO users (Name, Email, Password, Role, Status) VALUES ('Test Coordinator', 'coord_test_fu@bulsu.edu.ph', 'hash', 'Program Coordinator', 'ACTIVE')"
            );
            progCoordUser = { User_ID: ins.insertId, Role: 'Program Coordinator', Status: 'ACTIVE' };
        }

        const [facRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'Faculty' AND Status = 'ACTIVE' LIMIT 1");
        facultyUser = facRows[0];

        const [misRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'MIS Staff' AND Status = 'ACTIVE' LIMIT 1");
        misUser = misRows[0];

        const [ojtRows] = await db.query("SELECT User_ID, Role, Status FROM users WHERE Role = 'OJT' AND Status = 'ACTIVE' LIMIT 1");
        ojtUser = ojtRows[0];

        assert.ok(deptHeadUser, 'IT Dept. Head user must exist');
        assert.ok(progCoordUser, 'Program Coordinator user must exist');
        assert.ok(facultyUser, 'Faculty user must exist');
        assert.ok(misUser, 'MIS Staff user must exist');
        assert.ok(ojtUser, 'OJT user must exist');

        // Setup test PC
        const [pcList] = await db.query("SELECT PC_ID FROM lab_units LIMIT 1");
        testPcId = pcList[0].PC_ID;

        // Clean up any existing test issues on this PC with type 'Mouse', 'Keyboard', 'Monitor'
        await db.query("DELETE FROM maintenance WHERE PC_ID = ?", [testPcId]);
        await db.query("DELETE FROM maintenance_issues WHERE PC_ID = ?", [testPcId]);

        // Insert test Pending issue
        const [pIssue] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Mouse', 'Pending', 'Low', NOW())",
            [testPcId]
        );
        testPendingIssueId = pIssue.insertId;

        // Insert test In Progress issue (different type to avoid active key collision)
        const [ipIssue] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Keyboard', 'In Progress', 'Medium', NOW())",
            [testPcId]
        );
        testInProgressIssueId = ipIssue.insertId;

        // Insert test Resolved issue
        const [rIssue] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At, Resolved_At, Resolved_By_User_ID) VALUES (?, 'Monitor', 'Resolved', 'High', NOW(), NOW(), ?)",
            [testPcId, misUser.User_ID]
        );
        testResolvedIssueId = rIssue.insertId;

        const app = createTestApp();
        server = http.createServer(app);
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
    });

    async function makePostRequest(path, user = null, body = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (user) {
            headers['x-test-user-id'] = String(user.User_ID);
            headers['x-test-user-role'] = user.Role;
            headers['x-test-user-email'] = user.Email || 'test@bulsu.edu.ph';
        }
        const res = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        let data = null;
        try {
            data = await res.json();
        } catch (e) { }
        return { status: res.status, data };
    }

    // ─── 1. IT Dept Head can follow up Pending report ─────────────────────────
    await t.test('1. IT Dept Head can follow up a Pending report', async () => {
        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 200, 'Must return 200 OK');
        assert.strictEqual(res.data.status, 'Pending', 'Status must remain Pending');
        assert.strictEqual(res.data.followUpCount, 1, 'Follow-up count must be 1');

        const [rows] = await db.query("SELECT Status, Follow_Up_Count, Followed_Up_By_User_ID, Followed_Up_At FROM maintenance_issues WHERE Issue_ID = ?", [testPendingIssueId]);
        assert.strictEqual(rows[0].Status, 'Pending', 'Database Status must remain Pending');
        assert.strictEqual(rows[0].Follow_Up_Count, 1, 'Database Follow_Up_Count must be 1');
        assert.strictEqual(rows[0].Followed_Up_By_User_ID, deptHeadUser.User_ID, 'Followed_Up_By_User_ID must match IT Dept Head');
        assert.ok(rows[0].Followed_Up_At, 'Followed_Up_At must be populated');
    });

    // ─── 2. IT Dept Head cannot follow up twice on the same calendar day (Cooldown) ─
    await t.test('2. IT Dept Head cannot follow up the same unresolved report twice on the same calendar day', async () => {
        const [beforeRows] = await db.query("SELECT Follow_Up_Count, Followed_Up_At FROM maintenance_issues WHERE Issue_ID = ?", [testPendingIssueId]);
        const initialCount = beforeRows[0].Follow_Up_Count;
        const initialTimestamp = beforeRows[0].Followed_Up_At;

        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 409, 'Same-day second attempt must return 409 Conflict');
        assert.strictEqual(
            res.data.error,
            'Follow-up already made today. You can follow up this report again tomorrow.',
            'Must return exact cooldown conflict error message'
        );

        // 5. Same-day second attempt does not increment Follow_Up_Count
        // 6. Same-day second attempt does not modify Followed_Up_At
        const [afterRows] = await db.query("SELECT Follow_Up_Count, Followed_Up_At FROM maintenance_issues WHERE Issue_ID = ?", [testPendingIssueId]);
        assert.strictEqual(afterRows[0].Follow_Up_Count, initialCount, 'Same-day attempt must NOT increment Follow_Up_Count');
        assert.strictEqual(
            new Date(afterRows[0].Followed_Up_At).getTime(),
            new Date(initialTimestamp).getTime(),
            'Same-day attempt must NOT modify Followed_Up_At'
        );
    });

    // ─── 3 & 4. Follow-up from previous day allows new follow-up today and increments count ─
    await t.test('3-4. A follow-up from yesterday allows a new follow-up today and increments count', async () => {
        // Simulate previous day follow-up by setting Followed_Up_At to 1 day ago
        await db.query(
            "UPDATE maintenance_issues SET Followed_Up_At = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE Issue_ID = ?",
            [testPendingIssueId]
        );

        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 200, 'Must return 200 OK for follow-up on next calendar day');
        assert.strictEqual(res.data.status, 'Pending', 'Status must remain Pending');
        assert.strictEqual(res.data.followUpCount, 2, 'Follow-up count must increment from 1 to 2');

        const [rows] = await db.query("SELECT Status, Follow_Up_Count, Followed_Up_By_User_ID, Followed_Up_At FROM maintenance_issues WHERE Issue_ID = ?", [testPendingIssueId]);
        assert.strictEqual(rows[0].Status, 'Pending', 'Database Status must remain Pending');
        assert.strictEqual(rows[0].Follow_Up_Count, 2, 'Database Follow_Up_Count must be 2');
        assert.strictEqual(rows[0].Followed_Up_By_User_ID, deptHeadUser.User_ID);
    });

    // ─── 3. In Progress report can also be followed up once ────────────────────
    await t.test('3b. IT Dept Head can follow up an In Progress report', async () => {
        const res = await makePostRequest(`/api/reports/${testInProgressIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 200, 'Must return 200 OK');
        assert.strictEqual(res.data.status, 'In Progress', 'Status must remain In Progress');
        assert.strictEqual(res.data.followUpCount, 1, 'Follow-up count must be 1');

        const [rows] = await db.query("SELECT Status, Follow_Up_Count FROM maintenance_issues WHERE Issue_ID = ?", [testInProgressIssueId]);
        assert.strictEqual(rows[0].Status, 'In Progress', 'Database Status must remain In Progress');
        assert.strictEqual(rows[0].Follow_Up_Count, 1, 'Database Follow_Up_Count must be 1');
    });

    // ─── 8. Program Coordinator receives 403 ──────────────────────────────────
    await t.test('8. Program Coordinator receives 403 Forbidden', async () => {
        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, progCoordUser);
        assert.strictEqual(res.status, 403, 'Program Coordinator must receive 403 Forbidden');
        assert.ok(res.data.error.includes('Forbidden') || res.data.error.includes('privileges'), 'Must contain forbidden error');
    });

    // ─── 9. Faculty receives 403 ──────────────────────────────────────────────
    await t.test('9. Faculty receives 403 Forbidden', async () => {
        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, facultyUser);
        assert.strictEqual(res.status, 403, 'Faculty must receive 403 Forbidden');
    });

    // ─── 10. MIS Staff receives 403 ───────────────────────────────────────────
    await t.test('10. MIS Staff receives 403 Forbidden', async () => {
        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, misUser);
        assert.strictEqual(res.status, 403, 'MIS Staff must receive 403 Forbidden');
    });

    // ─── 11. OJT receives 403 ─────────────────────────────────────────────────
    await t.test('11. OJT receives 403 Forbidden', async () => {
        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, ojtUser);
        assert.strictEqual(res.status, 403, 'OJT must receive 403 Forbidden');
    });

    // ─── 12. Unauthenticated access is rejected (401) ─────────────────────────
    await t.test('12. Unauthenticated access is rejected with 401', async () => {
        const res = await makePostRequest(`/api/reports/${testPendingIssueId}/follow-up`, null);
        assert.strictEqual(res.status, 401, 'Unauthenticated access must receive 401');
    });

    // ─── 7. Resolved report cannot be followed up (400) ───────────────────────
    await t.test('7. Resolved report cannot be followed up (400 Bad Request)', async () => {
        const res = await makePostRequest(`/api/reports/${testResolvedIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 400, 'Resolved report must be rejected with 400');
        assert.ok(res.data.error.includes('resolved'), 'Error message must note ticket is resolved');
    });

    // ─── 14. Audit logging occurs ONLY when follow-up is successfully recorded
    await t.test('14. Audit logging occurs only when a follow-up is successfully recorded', async () => {
        const [logs] = await db.query(
            "SELECT * FROM audit_logs WHERE Action = 'TICKET_FOLLOW_UP' AND Resource_ID = ? ORDER BY Log_ID DESC",
            [String(testPendingIssueId)]
        );
        // Only 2 successful follow-ups occurred on testPendingIssueId (1st on day 1, 2nd on simulated day 2)
        // The rejected attempt on day 1 did not add an audit log.
        assert.strictEqual(logs.length, 2, 'Must have exactly 2 audit entries for the 2 successful follow-ups');
        assert.strictEqual(logs[0].Action, 'TICKET_FOLLOW_UP');
        assert.strictEqual(logs[0].Resource_Type, 'MAINTENANCE');
        assert.strictEqual(logs[0].User_ID, deptHeadUser.User_ID);
        assert.strictEqual(logs[0].Result, 'SUCCESS');

        const details = typeof logs[0].Details === 'string' ? JSON.parse(logs[0].Details) : logs[0].Details;
        assert.strictEqual(details.status, 'Pending');
        assert.strictEqual(details.followUpCount, 2);
    });

    // ─── 15 & 16. UI Role Checks in report.modal.js & report.renderer.js ─────
    await t.test('15-16. Frontend role guard ensures Follow Up button appears only for IT Dept. Head in modal and on card', () => {
        const modalJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.modal.js'), 'utf8');
        const rendererJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.renderer.js'), 'utf8');
        const reportCardsCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'components', 'report-cards.css'), 'utf8');

        // Check isITDeptHeadUser logic in modal and renderer
        assert.ok(modalJs.includes("const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];"), 'Modal must define strict IT Dept Head aliases');
        assert.ok(!modalJs.includes("itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head', 'Program Coordinator']"), 'Modal must NOT include Program Coordinator in follow-up aliases');
        assert.ok(modalJs.includes('btn-followup-ticket'), 'Must render btn-followup-ticket in modal');
        assert.ok(modalJs.includes('Follow Up Report'), 'Must have button text Follow Up Report in modal');
        assert.ok(modalJs.includes('[data-action="followup-ticket"]'), 'Modal delegation must intercept card followup-ticket');

        // Check card quick button logic in renderer
        assert.ok(rendererJs.includes("const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];"), 'Renderer must define strict IT Dept Head aliases');
        assert.ok(rendererJs.includes('btn-card-followup'), 'Renderer must render btn-card-followup');
        assert.ok(rendererJs.includes('data-action="followup-ticket"'), 'Card button must have data-action="followup-ticket"');

        // Check CSS styling
        assert.ok(reportCardsCss.includes('.btn-card-followup {'), 'CSS must define .btn-card-followup');
        assert.ok(reportCardsCss.includes('.rc-action-block .btn-card-followup {'), 'CSS must define mobile responsive .btn-card-followup');

        // Evaluate renderer sandbox
        const vm = require('vm');
        const parserCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'reports', 'report.parser.js'), 'utf8');
        const sandbox = {
            console,
            Date,
            String,
            Boolean,
            Number,
            Array,
            Object,
            document: { body: { dataset: { page: 'pc-reports' } } },
            sessionStorage: {
                getItem: (k) => k === 'labsync_user' ? JSON.stringify({ role: 'IT Dept. Head' }) : null
            },
            localStorage: { getItem: () => null },
            escapeHtml: (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '')
        };
        sandbox.window = sandbox;
        sandbox.global = sandbox;

        vm.runInNewContext(parserCode, sandbox);
        vm.runInNewContext(rendererJs, sandbox);
        const renderSingleCard = sandbox.reportRenderer.renderSingleCard;

        const testReport = {
            Report_ID: 999,
            Room_Number: '203',
            PC_Number: 1,
            Status: 'Pending',
            Issue_Description: 'PC/Laptop',
            Follow_Up_Count: 0
        };

        // IT Dept. Head sees button on unresolved card
        const itHeadCardHtml = renderSingleCard(testReport);
        assert.ok(itHeadCardHtml.includes('btn-card-followup'), 'IT Dept Head card must include btn-card-followup');
        assert.ok(itHeadCardHtml.includes('data-action="followup-ticket"'), 'IT Dept Head card must include data-action="followup-ticket"');
        assert.ok(itHeadCardHtml.includes('Follow Up'), 'IT Dept Head card must include Follow Up text');

        // Resolved card does NOT have follow up button
        const resolvedCardHtml = renderSingleCard({ ...testReport, Status: 'Resolved' });
        assert.ok(!resolvedCardHtml.includes('btn-card-followup'), 'Resolved card must NOT include btn-card-followup');

        // Program Coordinator does NOT see button on card
        sandbox.sessionStorage.getItem = (k) => k === 'labsync_user' ? JSON.stringify({ role: 'Program Coordinator' }) : null;
        const pcCardHtml = renderSingleCard(testReport);
        assert.ok(!pcCardHtml.includes('btn-card-followup'), 'Program Coordinator must NOT see btn-card-followup');

        // Faculty does NOT see button on card
        sandbox.sessionStorage.getItem = (k) => k === 'labsync_user' ? JSON.stringify({ role: 'Faculty' }) : null;
        const facCardHtml = renderSingleCard(testReport);
        assert.ok(!facCardHtml.includes('btn-card-followup'), 'Faculty must NOT see btn-card-followup');

        // Multi-issue card consolidated badge test: Consolidated Multiple Issues (N) badge on card, no hover tooltip
        const multiIssueReport = {
            Report_ID: 1001,
            Room_Number: '203',
            PC_Number: 1,
            Status: 'Pending',
            Issue_Description: '[Issues: PC/Laptop, Monitor, System Unit, Keyboard, Mouse] Remarks: Multi issue test',
            Follow_Up_Count: 0
        };
        sandbox.sessionStorage.getItem = (k) => k === 'labsync_user' ? JSON.stringify({ role: 'IT Dept. Head' }) : null;
        const multiCardHtml = renderSingleCard(multiIssueReport);
        assert.ok(multiCardHtml.includes('Multiple Issues (5)'), 'Card must show Multiple Issues (5) consolidated badge');
        assert.ok(multiCardHtml.includes('data-action="view-ticket-details"'), 'Multiple Issues badge must be interactive to open details');
        assert.ok(!multiCardHtml.includes('issue-badge-more'), 'Card must NOT show deprecated issue-badge-more');
        assert.ok(!multiCardHtml.includes('+4 more'), 'Card must NOT show deprecated +4 more text');
        assert.ok(!multiCardHtml.includes('>Monitor<'), 'Card must NOT show secondary badges on card directly');
        assert.ok(!multiCardHtml.includes('>Keyboard<'), 'Card must NOT show secondary badges on card directly');

        // Modal shows all badges broken down without consolidation
        const modalTicketHtml = sandbox.reportRenderer.renderModalTicketCard(multiIssueReport);
        assert.ok(modalTicketHtml.includes('PC/Laptop'), 'Modal must show PC/Laptop');
        assert.ok(modalTicketHtml.includes('Monitor'), 'Modal must show Monitor');
        assert.ok(modalTicketHtml.includes('System Unit'), 'Modal must show System Unit');
        assert.ok(modalTicketHtml.includes('Keyboard'), 'Modal must show Keyboard');
        assert.ok(modalTicketHtml.includes('Mouse'), 'Modal must show Mouse');
        assert.ok(!modalTicketHtml.includes('Multiple Issues'), 'Modal must not consolidate badges');

        // Clean follow-up representation: Header badge only on card, no duplicate banner strip
        const followedUpReport = {
            Report_ID: 1002,
            Room_Number: '203',
            PC_Number: 1,
            Status: 'Pending',
            Issue_Description: 'Mouse',
            Follow_Up_Count: 1,
            Followed_Up_By_Name: 'Andrei Gabito',
            Followed_Up_At: new Date().toISOString(),
            Followed_Up_Today: true
        };
        const fuCardHtml = renderSingleCard(followedUpReport);
        assert.ok(fuCardHtml.includes('FOLLOW-UP: 1X'), 'Card header must show FOLLOW-UP: 1X');
        assert.ok(fuCardHtml.includes('Andrei Gabito'), 'Card header badge tooltip must identify who followed up');
        assert.ok(!fuCardHtml.includes('rc-card-followup'), 'Card must NOT render duplicate banner strip');
        assert.ok(fuCardHtml.includes('Followed Up Today'), 'Card must show Followed Up Today on button');
        assert.ok(fuCardHtml.includes('disabled'), 'Card button must be disabled when followed up today');
        assert.ok(!modalJs.includes('class="follow-up-badge"'), 'Modal header must NOT render duplicate badge');
        assert.ok(modalJs.includes('ticket-modal-followup-row'), 'Modal must render dedicated summary card');
        assert.ok(modalJs.includes('Next follow-up available tomorrow.'), 'Modal must inform next follow-up available tomorrow');

        // Followed up on a previous day allows follow-up action again on card
        const pastDate = new Date();
        pastDate.setDate(pastDate.getDate() - 1);
        const prevDayReport = {
            Report_ID: 1003,
            Room_Number: '203',
            PC_Number: 2,
            Status: 'Pending',
            Issue_Description: 'Keyboard',
            Follow_Up_Count: 1,
            Followed_Up_By_Name: 'Andrei Gabito',
            Followed_Up_At: pastDate.toISOString(),
            Followed_Up_Today: false
        };
        const prevCardHtml = renderSingleCard(prevDayReport);
        assert.ok(prevCardHtml.includes('data-action="followup-ticket"'), 'Previous day report has active follow-up action');
        assert.ok(prevCardHtml.includes('Follow Up'), 'Previous day report button text is Follow Up');
        assert.ok(!prevCardHtml.includes('disabled'), 'Previous day report button is not disabled');
    });

    // ─── 17. Faculty read-only report page unchanged ──────────────────────────
    await t.test('17. Faculty read-only report page has no follow-up controls', () => {
        const facultyHtml = fs.readFileSync(path.join(__dirname, '..', 'faculty-pc-reports.html'), 'utf8');
        assert.ok(!facultyHtml.includes('btn-followup-ticket'), 'Faculty HTML must not contain follow up button');
    });

    // ─── 18. Report Data Endpoint returns follow-up fields ────────────────────
    await t.test('18. GET /api/reports returns Follow_Up_Count, Followed_Up_Today, and resolver/follow-up names', async () => {
        const headers = {
            'x-test-user-id': String(deptHeadUser.User_ID),
            'x-test-user-role': deptHeadUser.Role
        };
        const res = await fetch(`${baseUrl}/api/reports`, { headers });
        assert.strictEqual(res.status, 200);
        const reports = await res.json();
        const pendingTkt = reports.find(r => r.Issue_ID === testPendingIssueId);
        assert.ok(pendingTkt, 'Pending ticket must be present in report list');
        assert.strictEqual(pendingTkt.Follow_Up_Count, 2);
        assert.ok(pendingTkt.Followed_Up_At);
        assert.strictEqual(pendingTkt.Followed_Up_Today, true, 'Pending ticket just followed up today must have Followed_Up_Today: true');
        assert.ok(pendingTkt.Followed_Up_By_Name);
    });

    // ─── 19. Existing MIS resolution workflow still works ─────────────────────
    await t.test('19. Existing MIS/OJT resolution workflow resolves followed-up ticket normally', async () => {
        const res = await fetch(`${baseUrl}/api/reports/${testPendingIssueId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-test-user-id': String(misUser.User_ID),
                'x-test-user-role': misUser.Role
            },
            body: JSON.stringify({ status: 'Resolved' })
        });
        assert.strictEqual(res.status, 200, 'MIS Staff can resolve ticket');

        const [rows] = await db.query("SELECT Status, Resolved_By_User_ID, Follow_Up_Count FROM maintenance_issues WHERE Issue_ID = ?", [testPendingIssueId]);
        assert.strictEqual(rows[0].Status, 'Resolved');
        assert.strictEqual(rows[0].Resolved_By_User_ID, misUser.User_ID);
        assert.strictEqual(rows[0].Follow_Up_Count, 2, 'Follow_Up_Count preserved after resolution');
    });

    // ─── NOTIFICATION INTEGRATION VERIFICATION ──────────────────────────────
    let notifTestIssueId;

    await t.test('20. New student report creates single notification with detail "Student Report"', async () => {
        const [issue] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Network Cable', 'Pending', 'Medium', NOW())",
            [testPcId]
        );
        notifTestIssueId = issue.insertId;

        const [notifs] = await maintenanceRepo.findReportNotifications();
        const matching = notifs.filter(n => n.id === notifTestIssueId);
        assert.strictEqual(matching.length, 1, 'Exactly one notification row for the report');
        assert.strictEqual(matching[0].detail, 'Student Report');
        assert.strictEqual(matching[0].follow_up_count, 0);
        assert.strictEqual(matching[0].status, 'Pending');
    });

    await t.test('21. IT Dept. Head follow-up updates report notification (new timestamp, follow-up detail, count = 1)', async () => {
        const res = await makePostRequest(`/api/reports/${notifTestIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 200);

        const [notifs] = await maintenanceRepo.findReportNotifications();
        const matching = notifs.filter(n => n.id === notifTestIssueId);
        assert.strictEqual(matching.length, 1, 'Must NOT create duplicate notification rows (exactly 1 row)');
        assert.strictEqual(matching[0].detail, 'IT Dept. Head Follow-Up');
        assert.strictEqual(matching[0].follow_up_count, 1);
        assert.ok(matching[0].description.includes('has been followed up by the IT Dept. Head.'));
    });

    await t.test('22. MIS Staff receives the Follow-Up notification via maintenanceService.getNotifications()', async () => {
        const notifRes = await maintenanceService.getNotifications(misUser.User_ID, 'MIS Staff');
        assert.strictEqual(notifRes.status, 200);
        const matching = notifRes.data.filter(n => n.id === notifTestIssueId);
        assert.strictEqual(matching.length, 1, 'MIS receives single notification for followed up report');
        assert.strictEqual(matching[0].detail, 'IT Dept. Head Follow-Up');
        assert.strictEqual(matching[0].follow_up_count, 1);
    });

    await t.test('23. Follow-up toast deduplication key contains -fu1 and allows toast generation', () => {
        const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
        const ctx = { console };
        vm.createContext(ctx);
        vm.runInContext(notifCode, ctx);

        const mockNotif = {
            type: 'report',
            id: notifTestIssueId,
            status: 'Pending',
            pc_number: 4,
            room_number: '203',
            description: 'PC 04 – Room 203 has been followed up by the IT Dept. Head.',
            detail: 'IT Dept. Head Follow-Up',
            follow_up_count: 1
        };

        const key = ctx.computeNotificationToastKey(mockNotif);
        assert.strictEqual(key, `report-${notifTestIssueId}-Pending-fu1`);

        const details = ctx.getNotificationDetails(mockNotif);
        assert.strictEqual(details.title, 'PC Report Follow-Up');
        assert.strictEqual(details.text, 'PC 04 – Room 203 has been followed up by the IT Dept. Head.');
        assert.strictEqual(details.iconName, 'bell-ring');
    });

    await t.test('24. Same-day cooldown rejection produces NO notification event or toast update', async () => {
        const res = await makePostRequest(`/api/reports/${notifTestIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 409, 'Cooldown rejection');

        const [notifs] = await maintenanceRepo.findReportNotifications();
        const matching = notifs.filter(n => n.id === notifTestIssueId);
        assert.strictEqual(matching.length, 1);
        assert.strictEqual(matching[0].follow_up_count, 1, 'Follow-up count must NOT increment');
    });

    await t.test('25. Resolved report rejection produces NO notification event', async () => {
        const res = await makePostRequest(`/api/reports/${testResolvedIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 400);

        const [notifs] = await maintenanceRepo.findReportNotifications();
        const matching = notifs.filter(n => n.id === testResolvedIssueId);
        if (matching.length > 0) {
            assert.notStrictEqual(matching[0].detail, 'IT Dept. Head Follow-Up');
        }
    });

    await t.test('26. Unauthorized users cannot trigger follow-up and create NO notification event', async () => {
        const progRes = await makePostRequest(`/api/reports/${notifTestIssueId}/follow-up`, progCoordUser);
        assert.strictEqual(progRes.status, 403);

        const facRes = await makePostRequest(`/api/reports/${notifTestIssueId}/follow-up`, facultyUser);
        assert.strictEqual(facRes.status, 403);

        const misRes = await makePostRequest(`/api/reports/${notifTestIssueId}/follow-up`, misUser);
        assert.strictEqual(misRes.status, 403);

        const [notifs] = await maintenanceRepo.findReportNotifications();
        const matching = notifs.filter(n => n.id === notifTestIssueId);
        assert.strictEqual(matching[0].follow_up_count, 1, 'Follow-up count remains 1');
    });

    await t.test('27. Next-day follow-up updates notification time and increments follow_up_count to 2', async () => {
        await db.query("UPDATE maintenance_issues SET Followed_Up_At = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE Issue_ID = ?", [notifTestIssueId]);

        const res = await makePostRequest(`/api/reports/${notifTestIssueId}/follow-up`, deptHeadUser);
        assert.strictEqual(res.status, 200);

        const [notifs] = await maintenanceRepo.findReportNotifications();
        const matching = notifs.filter(n => n.id === notifTestIssueId);
        assert.strictEqual(matching.length, 1, 'Still single notification item');
        assert.strictEqual(matching[0].detail, 'IT Dept. Head Follow-Up');
        assert.strictEqual(matching[0].follow_up_count, 2, 'Follow-up count incremented to 2');

        const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
        const ctx = { console };
        vm.createContext(ctx);
        vm.runInContext(notifCode, ctx);
        const key = ctx.computeNotificationToastKey(matching[0]);
        assert.strictEqual(key, `report-${notifTestIssueId}-Pending-fu2`);
    });

    await t.test('28. Notification click navigates MIS Staff and OJT to mis-maintenance.html?ticket=<id>', () => {
        const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
        function testRoleClick(role, notif) {
            const ctx = {
                console,
                document: { querySelector: () => ({ textContent: role }) },
                window: { location: {} }
            };
            vm.createContext(ctx);
            vm.runInContext(notifCode, ctx);
            return ctx.window.handleNotificationClick(notif);
        }

        const reportNotif = { type: 'report', id: notifTestIssueId };
        const misDest = testRoleClick('MIS Staff', reportNotif);
        assert.strictEqual(misDest, `mis-maintenance.html?ticket=${notifTestIssueId}`);

        const ojtDest = testRoleClick('OJT', reportNotif);
        assert.strictEqual(ojtDest, `mis-maintenance.html?ticket=${notifTestIssueId}`);

        const headDest = testRoleClick('IT Dept. Head', reportNotif);
        assert.strictEqual(headDest, 'it-head-pc-reports.html');

        const coordDest = testRoleClick('Program Coordinator', reportNotif);
        assert.strictEqual(coordDest, 'it-head-pc-reports.html');
    });

    await t.test('29. Existing student report notifications without follow-up remain completely unchanged', async () => {
        const [unfollowed] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'RAM Defect', 'Pending', 'High', NOW())",
            [testPcId]
        );
        const [notifs] = await maintenanceRepo.findReportNotifications();
        const found = notifs.find(n => n.id === unfollowed.insertId);
        assert.ok(found);
        assert.strictEqual(found.detail, 'Student Report');
        assert.strictEqual(found.follow_up_count, 0);
        assert.strictEqual(found.description, '[Issues: RAM Defect]');

        const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');
        const ctx = { console };
        vm.createContext(ctx);
        vm.runInContext(notifCode, ctx);
        const details = ctx.getNotificationDetails(found);
        assert.strictEqual(details.title, 'New PC Report');
    });

    // ─── 30. Clean up test records and close server ───────────────────────────
    await t.test('30. Clean up test records and shutdown test server', async () => {
        await db.query("DELETE FROM maintenance WHERE PC_ID = ?", [testPcId]);
        await db.query("DELETE FROM maintenance_issues WHERE PC_ID = ?", [testPcId]);
        if (progCoordUser && progCoordUser.Email === 'coord_test_fu@bulsu.edu.ph') {
            await db.query("DELETE FROM users WHERE User_ID = ?", [progCoordUser.User_ID]);
        }
        if (typeof server.closeAllConnections === 'function') {
            server.closeAllConnections();
        }
        await new Promise((resolve) => server.close(resolve));
        await db.end();
    });
});
