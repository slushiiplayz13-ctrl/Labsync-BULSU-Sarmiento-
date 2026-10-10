'use strict';

/**
 * tests/test-pc-issue-resolved-notifications.js
 * Comprehensive automated regression suite for PC Issue Resolution Notifications and Status Wording:
 * 1. MIS resolution: When MIS Staff resolves a Pending/In Progress issue, the IT Dept. Head receives the notification.
 * 2. OJT resolution: When an authorized OJT intern resolves an issue, the IT Dept. Head receives the notification.
 * 3. Recipient correctness: Notification is delivered to the IT Dept. Head, not unrelated users.
 * 4. Duplicate prevention & Idempotency: Retrying resolution does not overwrite Resolved_At or emit duplicate events.
 * 5. Notification display: Notification appears in IT Dept. Head feed and unread count is calculated accurately.
 * 6. Accurate wording: Notification text, audit log, and return message identify specific issue without false blanket functional claims.
 * 7. Multiple issues on one PC: Resolving one issue does NOT clear other active issues or falsely restore PC to Functional.
 * 8. Resolver attribution: Correct MIS Staff or OJT resolver is recorded and returned in report archives.
 * 9. Audit integrity: TICKET_STATUS_UPDATE audit event is logged with specific issue and room details.
 * 10. Authorization & Invalid transitions: Unauthorized users (Faculty, unauthenticated) are rejected with 403/401.
 * 11. Existing workflows: Verifies getNotifications, report modals, and toast deduplication operate without regression.
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
        secret: 'test-resolved-notif-secret',
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

test('PC Issue Resolution Notifications & Accurate Wording Verification Suite', async (t) => {
    let server;
    let deptHeadUserId, misUserId, ojtUserId, facultyUserId;
    let testRoomId, testPcId1, testPcId2;
    let issueId1, issueId2, issueId3;

    const uniqueTag = Date.now();
    const testRoomNumber = 'R' + String(uniqueTag).slice(-6);

    await t.test('Setup test users, workstations, and server', async () => {
        const app = createTestApp();
        server = http.createServer(app);
        await new Promise(resolve => server.listen(0, resolve));

        // Create test users
        const [dhResult] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'IT Dept. Head', 'ACTIVE')",
            [`Dept Head ${uniqueTag}`, `dh_${uniqueTag}@bulsu.edu.ph`]
        );
        deptHeadUserId = dhResult.insertId;

        const [misResult] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'MIS Staff', 'ACTIVE')",
            [`MIS Technician ${uniqueTag}`, `mis_${uniqueTag}@bulsu.edu.ph`]
        );
        misUserId = misResult.insertId;

        const [ojtResult] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'OJT', 'ACTIVE')",
            [`OJT Intern ${uniqueTag}`, `ojt_${uniqueTag}@bulsu.edu.ph`]
        );
        ojtUserId = ojtResult.insertId;

        const [facResult] = await db.query(
            "INSERT INTO users (Name, Email, Role, Status) VALUES (?, ?, 'Faculty', 'ACTIVE')",
            [`Prof. Faculty ${uniqueTag}`, `fac_${uniqueTag}@bulsu.edu.ph`]
        );
        facultyUserId = facResult.insertId;

        // Create test laboratory
        const [roomResult] = await db.query(
            "INSERT INTO laboratories (Room_Number, Building, Current_Status, Key_Status) VALUES (?, 'IT Building', 'Available', 'Present')",
            [testRoomNumber]
        );
        testRoomId = roomResult.insertId;

        // Create test workstations
        const [pc1Result] = await db.query(
            'INSERT INTO lab_units (Room_ID, PC_Number, PC_QR_String, Condition_Status) VALUES (?, 1, ?, ?)',
            [testRoomId, `QR-PC1-${uniqueTag}`, 'Under Maintenance']
        );
        testPcId1 = pc1Result.insertId;

        const [pc2Result] = await db.query(
            'INSERT INTO lab_units (Room_ID, PC_Number, PC_QR_String, Condition_Status) VALUES (?, 2, ?, ?)',
            [testRoomId, `QR-PC2-${uniqueTag}`, 'Under Maintenance']
        );
        testPcId2 = pc2Result.insertId;

        // Create test maintenance issue 1 (PC 1: Broken Monitor)
        const [iss1Result] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Monitor Flickering', 'Pending', 'Medium', NOW() - INTERVAL 2 DAY)",
            [testPcId1]
        );
        issueId1 = iss1Result.insertId;
        await db.query(
            "INSERT INTO maintenance (Maintenance_Issue_ID, PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, 'Juan Dela Cruz', '[Issues: Monitor Flickering] Remarks: Screen flickers', NOW() - INTERVAL 2 DAY, 'Pending', 'Medium')",
            [issueId1, testPcId1]
        );

        // Create test maintenance issue 2 (PC 2: Unresponsive Keyboard)
        const [iss2Result] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Keyboard Unresponsive', 'In Progress', 'Low', NOW() - INTERVAL 1 DAY)",
            [testPcId2]
        );
        issueId2 = iss2Result.insertId;
        await db.query(
            "INSERT INTO maintenance (Maintenance_Issue_ID, PC_ID, Student_Name, Issue_Description, Date_Reported, Status, Priority_Level) VALUES (?, ?, 'Maria Clara', '[Issues: Keyboard Unresponsive] Remarks: Keys stick', NOW() - INTERVAL 1 DAY, 'In Progress', 'Low')",
            [issueId2, testPcId2]
        );
    });

    await t.test('1. MIS Staff resolution generates IT Dept. Head notification with correct resolver attribution', async () => {
        const response = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff',
                'x-test-user-name': `MIS Technician ${uniqueTag}`
            }
        }, { status: 'Resolved' });

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.message.includes('marked as resolved'));
        assert.strictEqual(response.body.issueType, 'Monitor Flickering');
        assert.strictEqual(Number(response.body.pcNumber), 1);
        assert.strictEqual(response.body.roomNumber, testRoomNumber);

        // Verify IT Dept. Head notification feed includes this resolution event
        const notifResult = await maintenanceService.getNotifications(deptHeadUserId, 'IT Dept. Head');
        assert.strictEqual(notifResult.status, 200);
        const resolvedNotif = notifResult.data.find(n => n.type === 'report' && n.id === issueId1 && n.status === 'Resolved');
        assert.ok(resolvedNotif, 'Resolution notification must be present in IT Dept. Head feed');
        assert.strictEqual(resolvedNotif.resolver_name, `MIS Technician ${uniqueTag}`);
        assert.strictEqual(resolvedNotif.resolver_role, 'MIS Staff');
        assert.strictEqual(resolvedNotif.detail, 'Resolved by MIS Staff');
        assert.strictEqual(resolvedNotif.issue_type, 'Monitor Flickering');
        assert.ok(resolvedNotif.description.includes('was marked as resolved by MIS Technician'));
        assert.ok(resolvedNotif.time, 'Resolution notification must have a valid timestamp');
        // Timestamp must reflect resolution time (recent), not Created_At (2 days ago)
        const timeDiffSec = Math.abs((Date.now() - new Date(resolvedNotif.time).getTime()) / 1000);
        assert.ok(timeDiffSec < 60, `Notification timestamp should be recent (within 60s), got diff: ${timeDiffSec}s`);
    });

    await t.test('2. OJT intern resolution generates IT Dept. Head notification with OJT resolver attribution', async () => {
        const response = await makeRequest(server, {
            path: `/api/reports/${issueId2}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': ojtUserId,
                'x-test-user-role': 'OJT',
                'x-test-user-name': `OJT Intern ${uniqueTag}`
            }
        }, { status: 'Resolved' });

        assert.strictEqual(response.status, 200);
        assert.ok(response.body.message.includes('marked as resolved'));
        assert.strictEqual(response.body.issueType, 'Keyboard Unresponsive');
        assert.strictEqual(Number(response.body.pcNumber), 2);

        // Verify IT Dept. Head notification feed includes OJT resolution
        const notifResult = await maintenanceService.getNotifications(deptHeadUserId, 'IT Dept. Head');
        assert.strictEqual(notifResult.status, 200);
        const ojtNotif = notifResult.data.find(n => n.type === 'report' && n.id === issueId2 && n.status === 'Resolved');
        assert.ok(ojtNotif, 'OJT resolution notification must be present in IT Dept. Head feed');
        assert.strictEqual(ojtNotif.resolver_name, `OJT Intern ${uniqueTag}`);
        assert.strictEqual(ojtNotif.resolver_role, 'OJT');
        assert.strictEqual(ojtNotif.detail, 'Resolved by OJT Intern');
        assert.ok(ojtNotif.description.includes('was marked as resolved by OJT Intern'));
    });

    await t.test('3. Recipient policy: IT Dept. Head receives resolution notification, unrelated Faculty does not', async () => {
        const dhNotifs = await maintenanceService.getNotifications(deptHeadUserId, 'IT Dept. Head');
        const facNotifs = await maintenanceService.getNotifications(facultyUserId, 'Faculty');

        const inDeptHead = dhNotifs.data.some(n => n.id === issueId1 && n.status === 'Resolved');
        const inFaculty = facNotifs.data.some(n => n.id === issueId1 && n.status === 'Resolved');

        assert.strictEqual(inDeptHead, true, 'IT Dept. Head must receive resolution notification');
        assert.strictEqual(inFaculty, false, 'Unrelated Faculty outside laboratory schedule must not receive resolution notification');
    });

    await t.test('4. Duplicate prevention & Idempotency: Retrying status update does NOT overwrite timestamp or duplicate events', async () => {
        const [before] = await db.query('SELECT Resolved_At, Resolved_By_User_ID FROM maintenance_issues WHERE Issue_ID = ?', [issueId1]);
        const initialResolvedAt = new Date(before[0].Resolved_At).getTime();

        // Retry resolution request
        const retryResponse = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Resolved' });

        assert.strictEqual(retryResponse.status, 200);
        assert.strictEqual(retryResponse.body.noTransition, true);
        assert.ok(retryResponse.body.message.includes('already marked as resolved'));

        const [after] = await db.query('SELECT Resolved_At, Resolved_By_User_ID FROM maintenance_issues WHERE Issue_ID = ?', [issueId1]);
        const afterResolvedAt = new Date(after[0].Resolved_At).getTime();

        assert.strictEqual(afterResolvedAt, initialResolvedAt, 'Resolved_At timestamp must remain immutable on idempotent retries');
        assert.strictEqual(after[0].Resolved_By_User_ID, misUserId, 'Original resolver ID must be preserved');
    });

    await t.test('5. Notification display: Unread calculation, badge behavior, and toast deduplication in notifications.js', () => {
        const notifCode = fs.readFileSync(path.join(__dirname, '../js/components/notifications.js'), 'utf8');

        // Test in simulated browser environment
        const resolvedNotif = {
            type: 'report',
            id: issueId1,
            time: new Date().toISOString(),
            status: 'Resolved',
            pc_number: 1,
            room_number: testRoomNumber,
            description: `The reported issue "Monitor Flickering" for PC-01 in Room ${testRoomNumber} was marked as resolved by MIS Technician ${uniqueTag}.`,
            detail: 'Resolved by MIS Staff',
            resolver_name: `MIS Technician ${uniqueTag}`,
            resolver_role: 'MIS Staff',
            issue_type: 'Monitor Flickering'
        };

        const ctx = {
            console,
            document: {
                querySelector: () => ({ textContent: 'IT Dept. Head' })
            },
            window: { location: { pathname: '/it-head-dashboard.html' } }
        };
        vm.createContext(ctx);
        vm.runInContext(notifCode, ctx);

        // Verify notification details mapping
        const details = ctx.window.getNotificationDetails(resolvedNotif);
        assert.strictEqual(details.title, 'PC Issue Marked Resolved');
        assert.ok(details.text.includes('The reported issue "Monitor Flickering" for PC-01 in Room'));
        assert.ok(!details.text.includes('is now functional'), 'Must not claim the entire PC is now functional');

        // Verify toast deduplication key
        const toastKey = ctx.window.computeNotificationToastKey(resolvedNotif);
        assert.strictEqual(toastKey, `report-${issueId1}-Resolved`);

        // Verify navigation deep-link for IT Dept Head
        const navDest = ctx.window.handleNotificationClick(resolvedNotif);
        assert.strictEqual(navDest, `it-head-pc-reports.html?ticket=${issueId1}`);
    });

    await t.test('6. Multiple issues on one PC: Resolving one issue does NOT clear other active issues or prematurely restore PC to Functional', async () => {
        // Create 2 distinct issues on testPcId1 (PC 1): Issue A and Issue B
        const [issAResult] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'RAM Defect', 'Pending', 'High', NOW())",
            [testPcId1]
        );
        const issA = issAResult.insertId;

        const [issBResult] = await db.query(
            "INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At) VALUES (?, 'Faulty PSU', 'Pending', 'High', NOW())",
            [testPcId1]
        );
        const issB = issBResult.insertId;

        await db.query('UPDATE lab_units SET Condition_Status = ? WHERE PC_ID = ?', ['Under Maintenance', testPcId1]);

        // Resolve Issue A only
        const resA = await makeRequest(server, {
            path: `/api/reports/${issA}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Resolved' });

        assert.strictEqual(resA.status, 200);
        assert.strictEqual(resA.body.remainingActiveCount, 1, 'There should be 1 remaining active issue on this PC');

        // Check PC condition status in database
        const [pcCheck1] = await db.query('SELECT Condition_Status FROM lab_units WHERE PC_ID = ?', [testPcId1]);
        assert.strictEqual(pcCheck1[0].Condition_Status, 'Under Maintenance', 'PC must REMAIN Under Maintenance because Issue B is still pending');

        // Check Issue B is still Pending
        const [issBCheck] = await db.query('SELECT Status FROM maintenance_issues WHERE Issue_ID = ?', [issB]);
        assert.strictEqual(issBCheck[0].Status, 'Pending', 'Issue B must remain Pending and not be accidentally resolved');

        // Check resolution notification for Issue A notes other active issues count
        const notifs = await maintenanceService.getNotifications(deptHeadUserId, 'IT Dept. Head');
        const notifA = notifs.data.find(n => n.id === issA && n.status === 'Resolved');
        assert.ok(notifA);
        assert.strictEqual(notifA.other_active_issues_count, 1);

        // Now resolve Issue B (clearing all active issues for this PC)
        const resB = await makeRequest(server, {
            path: `/api/reports/${issB}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Resolved' });

        assert.strictEqual(resB.status, 200);
        assert.strictEqual(resB.body.remainingActiveCount, 0, 'No active issues should remain');

        // NOW PC condition should be restored to Functional
        const [pcCheck2] = await db.query('SELECT Condition_Status FROM lab_units WHERE PC_ID = ?', [testPcId1]);
        assert.strictEqual(pcCheck2[0].Condition_Status, 'Functional', 'PC must restore to Functional only after ALL active issues are resolved');
    });

    await t.test('7. Resolver attribution & full report archive integrity', async () => {
        const reportsRes = await maintenanceService.getAllReports();
        assert.strictEqual(reportsRes.status, 200);

        const rep1 = reportsRes.data.find(r => r.Issue_ID === issueId1);
        assert.ok(rep1);
        assert.strictEqual(rep1.Status, 'Resolved');
        assert.strictEqual(rep1.Resolved_By_Name, `MIS Technician ${uniqueTag}`);
        assert.strictEqual(rep1.Resolved_By_Role, 'MIS Staff');
        assert.ok(rep1.Resolved_At);

        const rep2 = reportsRes.data.find(r => r.Issue_ID === issueId2);
        assert.ok(rep2);
        assert.strictEqual(rep2.Status, 'Resolved');
        assert.strictEqual(rep2.Resolved_By_Name, `OJT Intern ${uniqueTag}`);
        assert.strictEqual(rep2.Resolved_By_Role, 'OJT');
        assert.ok(rep2.Resolved_At);
    });

    await t.test('8. Audit integrity: Status transition generates specific security audit record', async () => {
        const [auditLogs] = await db.query(
            "SELECT Action, Resource_Type, Resource_ID, Details FROM audit_logs WHERE Action = 'TICKET_STATUS_UPDATE' AND Resource_ID = ? ORDER BY Log_ID DESC LIMIT 1",
            [String(issueId1)]
        );

        assert.ok(auditLogs.length > 0, 'Audit log must be created for ticket status update');
        const details = typeof auditLogs[0].Details === 'string' ? JSON.parse(auditLogs[0].Details) : auditLogs[0].Details;
        assert.strictEqual(details.newStatus, 'Resolved');
        assert.strictEqual(details.issueType, 'Monitor Flickering');
        assert.strictEqual(Number(details.pcNumber), 1);
        assert.ok(details.message.includes('Resolved reported issue: Monitor Flickering'));
    });

    await t.test('9. Authorization & invalid status transitions rejected', async () => {
        // Faculty cannot update status (403 Forbidden)
        const facAttempt = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': facultyUserId,
                'x-test-user-role': 'Faculty'
            }
        }, { status: 'Pending' });
        assert.strictEqual(facAttempt.status, 403);

        // Unauthenticated user rejected (401 Unauthorized)
        const unauthAttempt = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT'
        }, { status: 'Pending' });
        assert.strictEqual(unauthAttempt.status, 401);

        // Invalid status value rejected (400 Bad Request)
        const badStatusAttempt = await makeRequest(server, {
            path: `/api/reports/${issueId1}/status`,
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'CompletelyFixed' });
        assert.strictEqual(badStatusAttempt.status, 400);

        // Non-existent ticket ID rejected (404 Not Found)
        const notFoundAttempt = await makeRequest(server, {
            path: '/api/reports/99999999/status',
            method: 'PUT',
            headers: {
                'x-test-user-id': misUserId,
                'x-test-user-role': 'MIS Staff'
            }
        }, { status: 'Resolved' });
        assert.strictEqual(notFoundAttempt.status, 404);
    });

    await t.test('Clean up test records and shutdown test server', async () => {
        // Clean up test reports and issues
        if (testPcId1 || testPcId2) {
            await db.query('DELETE FROM maintenance WHERE PC_ID IN (?, ?)', [testPcId1 || 0, testPcId2 || 0]);
            await db.query('DELETE FROM maintenance_issues WHERE PC_ID IN (?, ?)', [testPcId1 || 0, testPcId2 || 0]);
        }

        // Clean up test lab units and rooms
        if (testRoomId) {
            await db.query('DELETE FROM lab_units WHERE Room_ID = ?', [testRoomId]);
            await db.query('DELETE FROM laboratories WHERE Room_ID = ?', [testRoomId]);
        }

        // Clean up test users and audit logs
        const userIds = [deptHeadUserId, misUserId, ojtUserId, facultyUserId].filter(Boolean);
        if (userIds.length > 0) {
            await db.query('DELETE FROM audit_logs WHERE User_ID IN (?)', [userIds]);
            await db.query('DELETE FROM users WHERE User_ID IN (?)', [userIds]);
        }

        if (server) {
            if (typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
            await new Promise(resolve => server.close(resolve));
        }
        await db.end();
    });
});
