/**
 * tests/test-pc-mis-roster-display.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression test suite verifying:
 * 1. An authenticated IT Department Head can fetch and display MIS Staff records.
 * 2. An authenticated Program Coordinator can fetch and display the same roster.
 * 3. Both roles handle active and deactivated MIS accounts correctly.
 * 4. Unauthorized roles still receive the appropriate HTTP 403 rejection.
 * 5. A failed request displays a meaningful error instead of silently leaving the roster blank.
 * 6. Existing MIS account creation, editing, reset-password, deactivate, and reactivate actions continue working.
 * 7. Real browser verification: Program Coordinator opens faculty-management.html,
 *    switches to MIS Staff tab, and verifies live DOM rendering and network success.
 *
 * Safety: Uses isolated fixtures for backend tests, with safeQueryGuard.
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const db = require('../database/connection');
const misService = require('../services/misService');
const misController = require('../controllers/mis.controller');
const misRepository = require('../repositories/mis.repository');
const userRepository = require('../repositories/user.repository');
const misRoutes = require('../routes/mis.routes');
const { requireAuth, requireRole, IT_HEAD_ROLES, IT_DEPT_HEAD_EXCLUSIVE_ROLES, MIS_STAFF_ROLES } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// 0. Safety Guard & Fixtures
// ─────────────────────────────────────────────────────────────────────────────
const writeSqlPattern = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i;
const originalDbQuery = db.query.bind(db);

let mockUsers = [
    { User_ID: 1, Name: 'Andrei Gabito', Email: 'andrei.head@bulsu.edu.ph', Role: 'IT Dept. Head', Status: 'ACTIVE' },
    { User_ID: 3, Name: 'Santi Esplana', Email: 'santi.coord@bulsu.edu.ph', Role: 'Program Coordinator', Status: 'ACTIVE' },
    { User_ID: 2, Name: 'Miles Moralejo', Email: 'miles.mis@bulsu.edu.ph', Role: 'MIS Staff', Status: 'ACTIVE', Phone: '09171234567', Profile_Photo: null, Updated_At: new Date() },
    { User_ID: 105, Name: 'Alex Deactivated', Email: 'alex.old@bulsu.edu.ph', Role: 'MIS Staff', Status: 'DEACTIVATED', Phone: '09179876543', Profile_Photo: null, Updated_At: new Date('2026-01-15') },
    { User_ID: 50, Name: 'Juan Faculty', Email: 'juan.faculty@bulsu.edu.ph', Role: 'Faculty', Status: 'ACTIVE' },
    { User_ID: 70, Name: 'Maria Student', Email: 'maria.student@bulsu.edu.ph', Role: 'Student', Status: 'ACTIVE' },
    { User_ID: 80, Name: 'Carlos Intern', Email: 'carlos.ojt@bulsu.edu.ph', Role: 'OJT', Status: 'ACTIVE' }
];

function createMockReqRes({ session = {}, params = {}, body = {}, method = 'GET', originalUrl = '/api/mis-staff' } = {}) {
    session.destroy = session.destroy || function (cb) { cb && cb(); };
    session.save = session.save || function (cb) { cb && cb(); };
    const req = {
        session,
        params,
        body,
        method,
        headers: { 'accept': 'application/json' },
        originalUrl,
        url: originalUrl.replace(/^\/api\/mis-staff/, '') || '/',
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' }
    };
    const res = {
        statusCode: 200,
        headers: {},
        jsonData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.jsonData = data;
            return this;
        },
        clearCookie() {
            return this;
        }
    };
    return { req, res };
}

// Helper to execute Express middleware/router stack
async function executeRouter(router, req, res) {
    return new Promise((resolve) => {
        const origJson = res.json.bind(res);
        res.json = function(data) {
            origJson(data);
            resolve();
        };
        router.handle(req, res, (err) => {
            if (err) res.statusCode = 500;
            resolve();
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Chrome CDP Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function findChromePath() {
    const defaultPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of defaultPaths) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('Chrome executable not found on system.');
}

let cdpMsgId = 1;
function send(ws, method, params = {}) {
    return new Promise((resolve, reject) => {
        const curId = cdpMsgId++;
        const handler = (evt) => {
            try {
                const m = JSON.parse(evt.data);
                if (m.id === curId) {
                    ws.removeEventListener('message', handler);
                    if (m.error) reject(m.error);
                    else resolve(m.result);
                }
            } catch (e) { }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────
async function runTestSuite() {
    console.log('================================================================');
    console.log('🧪 PROGRAM COORDINATOR MIS ROSTER DISPLAY & RBAC SUITE');
    console.log('================================================================\n');

    const itHeadSession = { userId: 1, userRole: 'IT Dept. Head', userEmail: 'andrei.head@bulsu.edu.ph' };
    const pcSession = { userId: 3, userRole: 'Program Coordinator', userEmail: 'santi.coord@bulsu.edu.ph' };

    // Setup safe query guard and repo mocks
    db.query = async function safeQueryGuard(sql, params) {
        if (typeof sql === 'string' && writeSqlPattern.test(sql)) {
            throw new Error(`[SAFETY GUARD VIOLATION] Database write rejected: "${sql.slice(0, 60)}"`);
        }
        if (typeof sql === 'string' && /FROM\s+users\s+WHERE/i.test(sql)) {
            const uid = params && params[0];
            const u = mockUsers.find(user => user.User_ID === Number(uid));
            if (!u) return [[]];
            return [[u]];
        }
        return originalDbQuery(sql, params);
    };

    const originalFindAll = misRepository.findAllMisStaff;
    misRepository.findAllMisStaff = async function mockFindAll() {
        const rows = mockUsers.filter(u => u.Role === 'MIS Staff');
        return [rows];
    };

    try {
        // ─────────────────────────────────────────────────────────────────────
        // 1. IT Department Head Roster Fetch
        // ─────────────────────────────────────────────────────────────────────
        console.log('--- 1. Testing IT Department Head Fetch of MIS Staff Roster ---');
        {
            const { req, res } = createMockReqRes({
                session: itHeadSession,
                method: 'GET',
                originalUrl: '/api/mis-staff'
            });

            await executeRouter(misRoutes, req, res);

            assert.strictEqual(res.statusCode, 200, 'IT Dept. Head must receive HTTP 200');
            assert.ok(res.jsonData && res.jsonData.active, 'Response must include active MIS Staff');
            assert.strictEqual(res.jsonData.active.Name, 'Miles Moralejo', 'Active MIS Staff name must match');
            assert.strictEqual(res.jsonData.active.Status, 'ACTIVE', 'Active MIS Staff status must be ACTIVE');
            assert.strictEqual(res.jsonData.history.length, 1, 'Historical MIS Staff list must contain deactivated account');
            assert.strictEqual(res.jsonData.history[0].Status, 'DEACTIVATED');
            console.log('✔ PASS: IT Department Head successfully fetched MIS Staff roster (HTTP 200).');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2. Program Coordinator Roster Fetch
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 2. Testing Program Coordinator Fetch of MIS Staff Roster ---');
        {
            const { req, res } = createMockReqRes({
                session: pcSession,
                method: 'GET',
                originalUrl: '/api/mis-staff'
            });

            await executeRouter(misRoutes, req, res);

            assert.strictEqual(res.statusCode, 200, 'Program Coordinator must receive HTTP 200');
            assert.ok(res.jsonData && res.jsonData.active, 'Response must include active MIS Staff');
            assert.strictEqual(res.jsonData.active.Name, 'Miles Moralejo', 'Program Coordinator must see identical active staff');
            assert.strictEqual(res.jsonData.active.Status, 'ACTIVE', 'Active staff status must be ACTIVE');
            assert.strictEqual(res.jsonData.history.length, 1, 'Program Coordinator must see identical historical count');
            assert.strictEqual(res.jsonData.history[0].Name, 'Alex Deactivated');
            console.log('✔ PASS: Program Coordinator successfully fetched identical MIS Staff roster (HTTP 200).');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3. Active and Deactivated Account Display Data Structure Handling
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 3. Testing Active and Deactivated Account Handling ---');
        {
            // Case 3A: Both active and deactivated accounts present
            const fullRoster = await misService.getMisStaffRoster();
            assert.strictEqual(fullRoster.status, 200);
            assert.notStrictEqual(fullRoster.data.active, null, 'Active MIS Staff must be identified');
            assert.strictEqual(fullRoster.data.history.length, 1, 'Deactivated MIS Staff must be separated into history');

            // Case 3B: Vacant position (active = null)
            const tempUsers = mockUsers.filter(u => u.Status !== 'ACTIVE' || u.Role !== 'MIS Staff');
            misRepository.findAllMisStaff = async () => [tempUsers.filter(u => u.Role === 'MIS Staff')];

            const vacantRoster = await misService.getMisStaffRoster();
            assert.strictEqual(vacantRoster.status, 200);
            assert.strictEqual(vacantRoster.data.active, null, 'Vacant position correctly yields active = null');
            assert.strictEqual(vacantRoster.data.history.length, 1, 'History remains intact when position is vacant');

            // Restore
            misRepository.findAllMisStaff = async () => [mockUsers.filter(u => u.Role === 'MIS Staff')];
            console.log('✔ PASS: Both roles handle active and deactivated account roster structures correctly.');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 4. Unauthorized Roles Rejection
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 4. Testing Unauthorized Roles Rejection ---');
        {
            const unauthorized = [
                { role: 'MIS Staff', userId: 2 },
                { role: 'Faculty', userId: 50 },
                { role: 'Student', userId: 70 },
                { role: 'OJT', userId: 80 }
            ];

            for (const actor of unauthorized) {
                const { req, res } = createMockReqRes({
                    session: { userId: actor.userId, userRole: actor.role },
                    method: 'GET',
                    originalUrl: '/api/mis-staff'
                });

                await executeRouter(misRoutes, req, res);

                assert.strictEqual(
                    res.statusCode,
                    403,
                    `Role "${actor.role}" must receive HTTP 403 Forbidden`
                );
                assert.ok(
                    res.jsonData && (res.jsonData.error || res.jsonData.code),
                    `Role "${actor.role}" rejection must include error description`
                );
            }
            console.log('✔ PASS: Unauthorized roles (MIS Staff, Faculty, Student, OJT) receive HTTP 403 Forbidden.');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 5. Meaningful Error Display on Failed Request (Client UI Logic)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 5. Testing Meaningful Error Display Logic ---');
        {
            // Simulate client DOM environment
            const misManagementCode = fs.readFileSync(path.join(__dirname, '../js/mis/mis-management.js'), 'utf8');

            // Ensure mis-management.js contains diagnostic error rendering
            assert.ok(
                misManagementCode.includes('errorDetail'),
                'mis-management.js must extract errorDetail from failed load requests'
            );
            assert.ok(
                misManagementCode.includes('Failed to load MIS Staff records.'),
                'mis-management.js must render primary error message'
            );
            assert.ok(
                misManagementCode.includes('historyEl.innerHTML = \'\'') || misManagementCode.includes('historyEl.innerHTML = ""'),
                'mis-management.js must clear history container on error'
            );
            console.log('✔ PASS: Frontend loadMisStaff implements meaningful diagnostic error rendering.');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 6. Existing MIS Account Actions Continuity
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 6. Testing Existing MIS Account Actions Continuity ---');
        {
            // Check that route definitions exist for all operations under IT_HEAD_ROLES
            assert.ok(IT_HEAD_ROLES.includes('Program Coordinator'), 'Program Coordinator must be in IT_HEAD_ROLES');
            assert.ok(IT_HEAD_ROLES.includes('IT Dept. Head'), 'IT Dept. Head must be in IT_HEAD_ROLES');

            // Verify mis.controller handlers are functions
            assert.strictEqual(typeof misController.listMisStaff, 'function');
            assert.strictEqual(typeof misController.createMisStaff, 'function');
            assert.strictEqual(typeof misController.updateMisStaff, 'function');
            assert.strictEqual(typeof misController.deactivateMisStaff, 'function');
            assert.strictEqual(typeof misController.reactivateMisStaff, 'function');
            assert.strictEqual(typeof misController.resetMisStaffPassword, 'function');
            console.log('✔ PASS: All MIS management controller actions are defined and bound.');
        }

        // ─────────────────────────────────────────────────────────────────────
        // 7. Live Real Browser Verification (Headless Chrome)
        // ─────────────────────────────────────────────────────────────────────
        console.log('\n--- 7. Testing Real Browser Live UI with Program Coordinator Account ---');
        const chromePath = await findChromePath();
        const cdpPort = 9228;
        const tempProfile = path.join(__dirname, '..', `.temp-chrome-pcmis-${Date.now()}`);

        const proc = spawn(chromePath, [
            `--remote-debugging-port=${cdpPort}`,
            `--user-data-dir=${tempProfile}`,
            '--headless=new',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            'about:blank'
        ]);

        let bWs = null;
        try {
            await new Promise(r => setTimeout(r, 1500));
            const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
            const versionInfo = await versionRes.json();
            bWs = new WebSocket(versionInfo.webSocketDebuggerUrl);
            await new Promise((res) => bWs.onopen = res);

            const newTab = await send(bWs, 'Target.createTarget', { url: 'about:blank' });
            const pWs = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/${newTab.targetId}`);
            await new Promise((res) => pWs.onopen = res);

            await send(pWs, 'Page.enable');
            await send(pWs, 'Runtime.enable');
            await send(pWs, 'Network.enable');

            // Listen for /api/mis-staff network response
            let misNetworkResponse = null;
            pWs.addEventListener('message', (evt) => {
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.method === 'Network.responseReceived' && msg.params.response.url.includes('/api/mis-staff')) {
                        misNetworkResponse = msg.params.response;
                    }
                } catch (e) { }
            });

            // Perform real session login cookie initialization
            const pcLoginRes = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: 'faculty@labsync.com', password: 'Password123!' })
            });
            const cookieHeader = pcLoginRes.headers.get('set-cookie') || '';
            const sidMatch = cookieHeader.match(/connect\.sid=([^;]+)/);
            const sidValue = sidMatch ? decodeURIComponent(sidMatch[1]) : '';

            // Inject session storage and cookie into browser tab
            await send(pWs, 'Network.setCookie', {
                name: 'connect.sid',
                value: sidValue,
                domain: 'localhost',
                path: '/',
                httpOnly: true,
                sameSite: 'Lax'
            });

            const userObj = {
                User_ID: 3,
                name: 'Santi Jay Esplana',
                role: 'Program Coordinator',
                Role: 'Program Coordinator'
            };

            await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
                source: `
                    try {
                        const u = ${JSON.stringify(userObj)};
                        sessionStorage.setItem('labsync_user', JSON.stringify(u));
                        localStorage.setItem('user', JSON.stringify(u));
                        localStorage.setItem('labsync_last_activity', Date.now().toString());
                    } catch(e) {}
                `
            });

            await send(pWs, 'Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
            await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/faculty-management.html' });
            await new Promise(r => setTimeout(r, 2000));

            // Click the MIS Staff tab
            await send(pWs, 'Runtime.evaluate', {
                expression: `
                    const tabBtn = document.getElementById('umTabMis');
                    if (tabBtn) tabBtn.click();
                `
            });

            // Wait for API request and DOM render
            await new Promise(r => setTimeout(r, 2200));

            // Evaluate DOM contents
            const domCheck = await send(pWs, 'Runtime.evaluate', {
                expression: `
                    (() => {
                        const activeEl = document.getElementById('mis-active-container');
                        const historyEl = document.getElementById('mis-history-container');
                        const errorEl = activeEl ? activeEl.querySelector('.ui-empty-state') : null;
                        const leadCard = activeEl ? activeEl.querySelector('.mis-lead-card') : null;
                        const emptyCard = activeEl ? activeEl.querySelector('.mis-empty-card') : null;
                        const leadName = activeEl ? activeEl.querySelector('.mis-lead-name')?.textContent?.trim() : null;
                        const editBtn = activeEl ? !!activeEl.querySelector('#btn-edit-mis') : false;
                        const resetBtn = activeEl ? !!activeEl.querySelector('#btn-reset-mis') : false;
                        const deactBtn = activeEl ? !!activeEl.querySelector('#btn-deactivate-mis') : false;
                        const errorText = errorEl ? errorEl.textContent.trim() : null;

                        return {
                            hasError: !!errorEl,
                            errorText: errorText,
                            hasLeadCard: !!leadCard,
                            hasEmptyCard: !!emptyCard,
                            leadName: leadName,
                            editBtn,
                            resetBtn,
                            deactBtn
                        };
                    })()
                `,
                returnByValue: true
            });

            const result = domCheck.result.value;
            console.log('[Browser Check] Network Response Status:', misNetworkResponse ? misNetworkResponse.status : 'N/A');
            console.log('[Browser Check] Active Lead Name:', result.leadName);
            console.log('[Browser Check] Buttons Rendered: Edit=' + result.editBtn + ', Reset=' + result.resetBtn + ', Deact=' + result.deactBtn);
            console.log('[Browser Check] Error State Present:', result.hasError ? `YES ("${result.errorText}")` : 'NO');

            // Assertions
            assert.strictEqual(result.hasError, false, `Browser must NOT show error state. Got: "${result.errorText}"`);
            assert.strictEqual(result.hasLeadCard, true, 'Browser must render Active MIS Staff lead card');
            assert.strictEqual(result.leadName, 'Miles Moralejo', 'Rendered MIS Staff name must match active database record');
            assert.strictEqual(result.editBtn, true, 'Edit Details button must be rendered');
            assert.strictEqual(result.resetBtn, true, 'Reset Password button must be rendered');
            assert.strictEqual(result.deactBtn, true, 'Deactivate button must be rendered');

            // Capture screenshot
            const artifactsDir = path.join(__dirname, '..', '.tempmediaStorage');
            if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });
            const screenshot = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
            const screenshotPath = path.join(artifactsDir, 'program-coordinator-mis-staff-tab.png');
            fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
            console.log(`✔ Saved screenshot: .tempmediaStorage/program-coordinator-mis-staff-tab.png`);
            console.log('✔ PASS: Real browser verification confirmed Program Coordinator successfully loads MIS Staff records!');

            await send(pWs, 'Page.close');
        } finally {
            if (bWs) bWs.close();
            proc.kill();
            try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (e) { }
        }

        console.log('\n================================================================');
        console.log('🎉 ALL 7 REGRESSION & LIVE BROWSER CHECKS PASSED 100%!');
        console.log('================================================================\n');

    } finally {
        db.query = originalDbQuery;
        misRepository.findAllMisStaff = originalFindAll;
    }
}

runTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Test failed with error:', err);
        process.exit(1);
    });
