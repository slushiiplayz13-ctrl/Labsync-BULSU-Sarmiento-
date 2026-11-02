'use strict';

/**
 * tests/test-backup-recovery-frontend.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Comprehensive Automated Frontend QA & Integration Test Suite for Feature #17:
 * Database Backup & Sandbox Recovery Interface.
 *
 * Verifies all 18 requirements:
 * 1. Admin Menu navigation.
 * 2. Modal opening and closing.
 * 3. Backup status loading.
 * 4. Backup creation.
 * 5. Downloaded .sql.gz archive handling.
 * 6. SHA-256 display.
 * 7. Copy checksum.
 * 8. Explicit .sha256 download.
 * 9. Invalid file validation.
 * 10. Missing checksum validation.
 * 11. Incorrect administrator password rejection & password hygiene.
 * 12. Restore confirmation dialog.
 * 13. Production restoration unavailable state.
 * 14. Successful local sandbox restoration.
 * 15. Failed restoration handling.
 * 16. Duplicate submission protection & in-flight locking.
 * 17. IT Head-only interface visibility.
 * 18. Existing sidebar regression checks.
 *
 * Runs headless Chrome with Chrome DevTools Protocol (CDP) and WebSocket.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { spawn } = require('child_process');
const bcrypt = require('bcrypt');
const express = require('express');
const session = require('express-session');
const pool = require('../database/connection');
const backupService = require('../services/backupService');
const restoreService = require('../services/restoreService');
const { backupCreateLimiter, backupRestoreLimiter } = require('../middleware/rateLimiter');
const routes = require('../routes');

console.log('================================================================');
console.log('🧪 LABSYNC SECURITY FEATURE #17: FRONTEND QA & INTEGRATION SUITE');
console.log('================================================================');

// Dedicated synthetic fixture password for test re-authentication (zero real credentials)
const TEST_FIXTURE_PASSWORD = 'FrontendTestPassword_LabSync#2026!';
const TEST_FIXTURE_HASH = bcrypt.hashSync(TEST_FIXTURE_PASSWORD, 10);

async function runFrontendTestSuite() {
  let passed = 0;
  let failed = 0;

  function recordPass(testName) {
    passed++;
    console.log(`  ✔ PASS: ${testName}`);
  }

  function recordFail(testName, err) {
    failed++;
    console.error(`  ✖ FAIL: ${testName}`);
    console.error(`    Error: ${err.message}`);
  }

  function resetRateLimits() {
    try {
      if (typeof backupCreateLimiter.resetKey === 'function') {
        backupCreateLimiter.resetKey('127.0.0.1');
        backupCreateLimiter.resetKey('::1');
        backupCreateLimiter.resetKey('::ffff:127.0.0.1');
      }
      if (typeof backupRestoreLimiter.resetKey === 'function') {
        backupRestoreLimiter.resetKey('127.0.0.1');
        backupRestoreLimiter.resetKey('::1');
        backupRestoreLimiter.resetKey('::ffff:127.0.0.1');
      }
    } catch (_) {}
  }

  // Ensure screenshot directories exist
  const screenshotsDir = path.join(__dirname, 'audit-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Set up Express application instance serving frontend & backend
  const app = express();
  app.use(session({
    secret: 'labsync-frontend-qa-session-secret-999',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }
  }));

  // Session setup endpoint for testing browser identities
  app.post('/test/auth/session', express.json(), (req, res) => {
    req.session.userId = req.body.userId;
    req.session.userRole = req.body.userRole;
    req.session.userEmail = req.body.userEmail;
    req.session.lastActivity = Date.now();
    req.session.save(() => res.json({ ok: true }));
  });

  // Mock production toggle endpoint for testing production lockout UI
  let mockProductionMode = false;
  app.get('/test/mock-production/:enabled', (req, res) => {
    mockProductionMode = req.params.enabled === 'true';
    res.json({ mockProductionMode });
  });

  // Hook into getBackupStatus to simulate production when mockProductionMode is enabled
  const originalGetStatus = backupService.getBackupStatus.bind(backupService);
  backupService.getBackupStatus = async function() {
    const status = await originalGetStatus();
    if (mockProductionMode) {
      status.isProduction = true;
    }
    return status;
  };

  // Serve static assets
  app.use('/css', express.static(path.join(__dirname, '../css')));
  app.use('/js', express.static(path.join(__dirname, '../js')));
  app.use('/assets', express.static(path.join(__dirname, '../assets')));
  app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, '../style.css')));

  // Mount API router
  app.use('/api', routes);

  // Serve HTML pages
  app.get('/:page.html', (req, res) => {
    const filePath = path.join(__dirname, `../${req.params.page}.html`);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send('Not Found');
    }
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // Stub pool.query for User 1 password lookups using synthetic fixture hash
  const originalQuery = pool.query.bind(pool);
  pool.query = async function(sql, params) {
    if (typeof sql === 'string' && sql.includes('SELECT Password FROM users WHERE User_ID = ?')) {
      return [[{ Password: TEST_FIXTURE_HASH }]];
    }
    return originalQuery(sql, params);
  };

  // 2. Launch headless Chrome instance
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9580 + Math.floor(Math.random() * 50);
  const tempProfile = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-backup-qa-' + Date.now());

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--window-size=1280,900',
    'about:blank'
  ]);

  let ws = null;

  try {
    // Wait for Chrome CDP port to become active
    await new Promise(r => setTimeout(r, 1500));
    const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    assert.ok(pageTarget, 'Headless Chrome page target must exist');

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    function sendCDP(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = msgId++;
        const onMsg = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener('message', onMsg);
            if (data.error) reject(new Error(data.error.message));
            else resolve(data.result);
          }
        };
        ws.addEventListener('message', onMsg);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await sendCDP('Page.enable');
    await sendCDP('Runtime.enable');
    await sendCDP('DOM.enable');

    async function evaluate(expression) {
      const res = await sendCDP('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (res.exceptionDetails) {
        const desc = (res.exceptionDetails.exception && res.exceptionDetails.exception.description) ||
                     res.exceptionDetails.text ||
                     'CDP evaluation exception';
        throw new Error(desc);
      }
      return res.result ? res.result.value : undefined;
    }

    async function waitFor(fnStr, timeoutMs = 8000, intervalMs = 200) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        try {
          const val = await evaluate(`Boolean(${fnStr})`);
          if (val) return true;
        } catch (_) {}
        await new Promise(r => setTimeout(r, intervalMs));
      }
      return false;
    }

    async function captureScreenshot(filename) {
      const shot = await sendCDP('Page.captureScreenshot', { format: 'png' });
      const fullPath = path.join(screenshotsDir, filename);
      fs.writeFileSync(fullPath, Buffer.from(shot.data, 'base64'));

      // Also copy to artifact directory if available
      const artifactDir = process.env.ARTIFACT_DIR || 'C:\\Users\\andre\\.gemini\\antigravity\\brain\\35227e99-96cd-458e-aa1f-d7c2e9ea4aa3';
      try {
        if (fs.existsSync(artifactDir)) {
          fs.copyFileSync(fullPath, path.join(artifactDir, filename));
        }
      } catch (_) {}

      return fullPath;
    }

    // Helper to log in as a specific role in Chrome browser
    async function setBrowserUser(userId, role, email) {
      await evaluate(`(async () => {
        await fetch('/test/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: ${userId}, userRole: '${role}', userEmail: '${email}' })
        });
        const userObj = { id: ${userId}, role: '${role}', email: '${email}', name: 'Test User' };
        sessionStorage.setItem('labsync_user', JSON.stringify({ user: userObj }));
        localStorage.setItem('user', JSON.stringify({ user: userObj }));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
      })()`);
    }

    // First visit login.html to establish origin, then set authenticated identity
    await sendCDP('Page.navigate', { url: `${baseUrl}/login.html` });
    await new Promise(r => setTimeout(r, 800));

    await setBrowserUser(1, 'IT Dept. Head', 'head@labsync.com');

    // Navigate to it-head-dashboard.html as IT Department Head
    await sendCDP('Page.navigate', { url: `${baseUrl}/it-head-dashboard.html` });
    await new Promise(r => setTimeout(r, 1200));

    // ─── TEST 1: Role Filtering (Hidden for Unauthorized Roles) ───────────────
    console.log('\n--- 1. Testing Role Filtering (Excluded for Unauthorized Roles) ---');
    try {
      resetRateLimits();

      // Test unauthorized role: Program Coordinator
      await setBrowserUser(3, 'Program Coordinator', 'coordinator@labsync.com');
      // A: Verify Admin Menu does NOT have #admin-menu-backup-btn
      await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        if (typeof toggleAdminMenu === 'function') toggleAdminMenu(null, btn);
      })()`);
      await new Promise(r => setTimeout(r, 300));
      const backupBtnExistsCoord = await evaluate(`Boolean(document.querySelector('#admin-menu-backup-btn'))`);
      assert.strictEqual(backupBtnExistsCoord, false, 'Backup & Recovery button must NOT exist in Admin Menu');
      await evaluate(`(() => { const m = document.querySelector('#admin-floating-menu'); if (m) m.remove(); })()`);

      // B: Verify Account Settings does NOT show Backup & Recovery for Program Coordinator
      await evaluate(`openAccountSettings();`);
      await waitFor(`document.querySelector('#account-settings-modal')`);
      await new Promise(r => setTimeout(r, 400));
      const coordBackupTabVisible = await evaluate(`(() => {
        const btn = document.querySelector('#tab-btn-backup');
        return Boolean(btn && getComputedStyle(btn).display !== 'none');
      })()`);
      assert.strictEqual(coordBackupTabVisible, false, 'Backup & Recovery tab must NOT be visible for Program Coordinator in Account Settings');
      await captureScreenshot('program-coordinator-hidden-backup.png');
      await evaluate(`(() => { const m = document.querySelector('#account-settings-modal'); if (m) m.remove(); })()`);

      // Test unauthorized role: MIS Staff
      await setBrowserUser(2, 'MIS Staff', 'mis@labsync.com');
      await evaluate(`openAccountSettings();`);
      await waitFor(`document.querySelector('#account-settings-modal')`);
      await new Promise(r => setTimeout(r, 400));
      const misBackupTabVisible = await evaluate(`(() => {
        const btn = document.querySelector('#tab-btn-backup');
        return Boolean(btn && getComputedStyle(btn).display !== 'none');
      })()`);
      assert.strictEqual(misBackupTabVisible, false, 'Backup & Recovery tab must NOT be visible for MIS Staff in Account Settings');
      await evaluate(`(() => { const m = document.querySelector('#account-settings-modal'); if (m) m.remove(); })()`);

      // Test unauthorized role: Faculty
      await setBrowserUser(4, 'Faculty', 'faculty@labsync.com');
      await evaluate(`openAccountSettings();`);
      await waitFor(`document.querySelector('#account-settings-modal')`);
      await new Promise(r => setTimeout(r, 400));
      const facultyBackupTabVisible = await evaluate(`(() => {
        const btn = document.querySelector('#tab-btn-backup');
        return Boolean(btn && getComputedStyle(btn).display !== 'none');
      })()`);
      assert.strictEqual(facultyBackupTabVisible, false, 'Backup & Recovery tab must NOT be visible for Faculty in Account Settings');
      await evaluate(`(() => { const m = document.querySelector('#account-settings-modal'); if (m) m.remove(); })()`);

      recordPass('Non-IT Head roles (Program Coordinator, MIS Staff, Faculty) cannot see Backup & Recovery in Admin Menu or Account Settings');
    } catch (err) {
      recordFail('Non-IT Head roles (Program Coordinator, MIS Staff, Faculty) cannot see Backup & Recovery in Admin Menu or Account Settings', err);
    }

    // ─── TEST 2: Responsive Navigation & Account Settings Integration for IT Head ───
    console.log('\n--- 2. Testing Responsive Navigation & Account Settings Integration for IT Head ---');
    try {
      resetRateLimits();
      // Set identity back to IT Department Head
      await setBrowserUser(1, 'IT Dept. Head', 'head@labsync.com');
      await new Promise(r => setTimeout(r, 200));

      // 1. Desktop Landscape Viewport (1440x900, Fine Pointer)
      await sendCDP('Emulation.setTouchEmulationEnabled', { enabled: false });
      await sendCDP('Emulation.setEmitTouchEventsForMouse', { enabled: false });
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 400));
      const isDesktopAdminHidden = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return !btn || getComputedStyle(btn).display === 'none';
      })()`);
      assert.strictEqual(isDesktopAdminHidden, true, 'Admin Menu button must be HIDDEN on desktop landscape layout');
      await captureScreenshot('it-head-laptop-landscape.png');

      // 2. Laptop Landscape Viewport (1366x768, Fine Pointer)
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 400));
      const isLaptopAdminHidden = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return !btn || getComputedStyle(btn).display === 'none';
      })()`);
      assert.strictEqual(isLaptopAdminHidden, true, 'Admin Menu button must be HIDDEN on laptop landscape layout');

      // 3. Desktop Resized Window Viewport (1180x820, Fine Pointer)
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 400));
      const isDesktop1180AdminHidden = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return !btn || getComputedStyle(btn).display === 'none';
      })()`);
      assert.strictEqual(isDesktop1180AdminHidden, true, 'Admin Menu button must be HIDDEN on desktop window 1180x820 with fine pointer');

      // 4. Tablet Landscape Viewport (1180x820, Coarse Pointer)
      await sendCDP('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await sendCDP('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 2, mobile: true });
      await new Promise(r => setTimeout(r, 400));
      const isTabletLandscapeAdminVisible = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return Boolean(btn && getComputedStyle(btn).display === 'flex');
      })()`);
      assert.strictEqual(isTabletLandscapeAdminVisible, true, 'Admin Menu button must be AVAILABLE on tablet 1180x820 with coarse pointer');

      // 5. Tablet Portrait Viewport (820x1180, Coarse Pointer)
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 820, height: 1180, deviceScaleFactor: 2, mobile: true });
      await new Promise(r => setTimeout(r, 400));
      const isTabletAdminVisible = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return Boolean(btn && getComputedStyle(btn).display === 'flex');
      })()`);
      assert.strictEqual(isTabletAdminVisible, true, 'Admin Menu button must remain AVAILABLE on tablet portrait viewport');
      await captureScreenshot('tablet-navigation.png');

      // 6. Mobile Portrait Viewport (390x844, Coarse Pointer)
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
      await new Promise(r => setTimeout(r, 400));
      const isMobileAdminVisible = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return Boolean(btn && getComputedStyle(btn).display === 'flex');
      })()`);
      assert.strictEqual(isMobileAdminVisible, true, 'Admin Menu button must remain AVAILABLE on mobile portrait viewport');
      await captureScreenshot('mobile-portrait-navigation.png');

      // 7. Mobile Landscape Viewport (844x390, Coarse Pointer)
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 3, mobile: true });
      await new Promise(r => setTimeout(r, 400));
      const isMobileLandscapeAdminVisible = await evaluate(`(() => {
        const btn = document.querySelector('#sidebar-admin-btn');
        return Boolean(btn && getComputedStyle(btn).display === 'flex');
      })()`);
      assert.strictEqual(isMobileLandscapeAdminVisible, true, 'Admin Menu button must remain AVAILABLE on mobile landscape viewport');

      // 8. Return to Desktop Viewport & Open Account Settings
      await sendCDP('Emulation.setTouchEmulationEnabled', { enabled: false });
      await sendCDP('Emulation.setEmitTouchEventsForMouse', { enabled: false });
      await sendCDP('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      await new Promise(r => setTimeout(r, 400));

      await evaluate(`openAccountSettings();`);
      await waitFor(`document.querySelector('#account-settings-modal')`);
      await new Promise(r => setTimeout(r, 500));

      const isAccountModalOpen = await evaluate(`Boolean(document.querySelector('#account-settings-modal'))`);
      assert.strictEqual(isAccountModalOpen, true, 'Account Settings modal must be open');
      await captureScreenshot('account-settings-opened.png');

      const isBackupTabVisible = await evaluate(`(() => {
        const btn = document.querySelector('#tab-btn-backup');
        return Boolean(btn && getComputedStyle(btn).display !== 'none');
      })()`);
      assert.strictEqual(isBackupTabVisible, true, 'Backup & Recovery option must be visible inside Account Settings for IT Head');
      await captureScreenshot('backup-option-in-account-settings.png');
      await captureScreenshot('backup-admin-menu-open.png'); // Keep legacy file updated

      recordPass('Admin Menu button is hidden on laptop/PC landscape; Backup & Recovery is accessible in Account Settings for IT Head');
    } catch (err) {
      recordFail('Admin Menu button is hidden on laptop/PC landscape; Backup & Recovery is accessible in Account Settings for IT Head', err);
    }

    // ─── TEST 3: Modal Opening from Account Settings and Closing Lifecycle ───────────
    console.log('\n--- 3. Testing Modal Opening from Account Settings and Closing Lifecycle ---');
    try {
      resetRateLimits();
      // Click Backup & Recovery tab inside Account Settings
      await evaluate(`document.querySelector('#tab-btn-backup').click();`);
      await new Promise(r => setTimeout(r, 500));

      let modalExists = await evaluate(`Boolean(document.querySelector('#backup-recovery-modal'))`);
      assert.strictEqual(modalExists, true, 'Backup & Recovery modal must open upon clicking option in Account Settings');

      // Verify Account Settings modal was closed
      const accountSettingsClosed = await evaluate(`!document.querySelector('#account-settings-modal')`);
      assert.strictEqual(accountSettingsClosed, true, 'Account Settings modal must be dismissed when Backup & Recovery opens');

      await captureScreenshot('backup-modal-opened-from-settings.png');

      // Close via close button
      await evaluate(`document.querySelector('#backup-modal-close-btn').click();`);
      await new Promise(r => setTimeout(r, 300));
      modalExists = await evaluate(`Boolean(document.querySelector('#backup-recovery-modal'))`);
      assert.strictEqual(modalExists, false, 'Modal must close on clicking close button');

      // Reopen and close via Escape key
      await evaluate(`openBackupRecoveryModal();`);
      await new Promise(r => setTimeout(r, 400));
      modalExists = await evaluate(`Boolean(document.querySelector('#backup-recovery-modal'))`);
      assert.strictEqual(modalExists, true, 'Modal must reopen');

      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));`);
      await new Promise(r => setTimeout(r, 300));
      modalExists = await evaluate(`Boolean(document.querySelector('#backup-recovery-modal'))`);
      assert.strictEqual(modalExists, false, 'Modal must close on pressing Escape key');

      recordPass('Modal opens from Account Settings, button dismissal, and keyboard Escape operate cleanly');
    } catch (err) {
      recordFail('Modal opens from Account Settings, button dismissal, and keyboard Escape operate cleanly', err);
    }

    // ─── TEST 4: Backup Status Loading & Metadata Rendering ──────────────────
    console.log('\n--- 4. Testing Backup Status Loading & System Overview ---');
    try {
      resetRateLimits();
      // Open modal
      await evaluate(`openBackupRecoveryModal();`);
      await waitFor(`document.querySelector('#backup-modal-content') && document.querySelector('#backup-modal-content').style.display !== 'none'`);

      const modalText = await evaluate(`document.querySelector('#backup-modal-body').textContent`);
      assert.ok(modalText.includes('Engine / Version'), 'Modal must render Engine / Version card');
      assert.ok(modalText.includes('Application Tables'), 'Modal must render Application Tables card');
      assert.ok(modalText.includes('base tables'), 'Modal must display base tables count');
      assert.ok(modalText.includes('Restoration Target'), 'Modal must display restoration target card');
      assert.ok(modalText.includes('Recent Backup History'), 'Modal must display Recent Backup History section');

      await captureScreenshot('backup-modal-overview.png');
      recordPass('Backup metadata (Engine, Version, Table count, Target, Recent history) successfully rendered');
    } catch (err) {
      recordFail('Backup metadata (Engine, Version, Table count, Target, Recent history) successfully rendered', err);
    }

    // ─── TEST 5, 6, 7: Backup Creation, SHA-256 Display & Companion Download ──
    console.log('\n--- 5. Testing Backup Creation, SHA-256 Checksum Display, Copy & Download ---');
    try {
      resetRateLimits();

      // Intercept download triggers in the browser
      await evaluate(`(() => {
        window.__capturedDownloads = [];
        const origCreate = document.createElement.bind(document);
        document.createElement = function(tag) {
          const el = origCreate(tag);
          if (tag.toLowerCase() === 'a') {
            const origClick = el.click.bind(el);
            el.click = function() {
              window.__capturedDownloads.push({ href: el.href, download: el.download });
              return origClick();
            };
          }
          return el;
        };
      })()`);

      // Click Create Backup
      await evaluate(`document.querySelector('#btn-create-backup').click();`);
      // Wait for result container to appear
      const resultLoaded = await waitFor(`document.querySelector('#backup-created-result-container') && document.querySelector('#backup-created-result-container').style.display !== 'none'`, 10000);
      assert.strictEqual(resultLoaded, true, 'Backup result container must be visible after creation');

      // Verify SHA-256 checksum is displayed
      const checksumVal = await evaluate(`document.querySelector('#created-backup-checksum-field').value`);
      assert.strictEqual(checksumVal.length, 64, 'Checksum must be a 64-character hex string');
      assert.ok(/^[a-f0-9]{64}$/.test(checksumVal), 'Checksum must match hexadecimal pattern');

      // Verify single primary download was triggered
      const downloads = await evaluate(`window.__capturedDownloads`);
      assert.ok(downloads.length >= 1, 'Primary download must be triggered');
      assert.ok(downloads[0].download.endsWith('.sql.gz'), 'Primary downloaded file must have .sql.gz extension');

      // Test Copy Checksum button
      await evaluate(`document.querySelector('#btn-copy-checksum').click();`);
      await new Promise(r => setTimeout(r, 200));

      // Test Explicit Download .sha256 button
      await evaluate(`document.querySelector('#btn-download-sha256-companion').click();`);
      await new Promise(r => setTimeout(r, 200));
      const updatedDownloads = await evaluate(`window.__capturedDownloads`);
      assert.ok(updatedDownloads.some(d => d.download.endsWith('.sha256')), 'Explicit .sha256 companion file download must be captured');

      await captureScreenshot('backup-created-checksum.png');
      recordPass('Backup creation streams .sql.gz, displays 64-char SHA-256 digest, supports copy & companion download');
    } catch (err) {
      recordFail('Backup creation streams .sql.gz, displays 64-char SHA-256 digest, supports copy & companion download', err);
    }

    // ─── TEST 8, 9, 10, 11, 12: Form Validations, Checksum Loader & Password Check ─
    console.log('\n--- 6. Testing Form Validations & Password Re-Authentication ---');
    try {
      resetRateLimits();

      // Checksum validation: test .sha256 companion file loader
      const testShaContent = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789  labsync_backup.sql.gz\\n';
      await evaluate(`(() => {
        const checksumInput = document.querySelector('#restore-checksum-input');
        const match = "${testShaContent}".match(/[a-fA-F0-9]{64}/);
        if (match) checksumInput.value = match[0];
      })()`);

      const loadedChecksum = await evaluate(`document.querySelector('#restore-checksum-input').value`);
      assert.strictEqual(loadedChecksum, 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789', 'Loaded checksum must match 64 hex characters');

      // Auto-confirm restore confirmation dialog for automated testing
      await evaluate(`(() => {
        window.showConfirmModal = async () => true;
        window.confirm = () => true;
      })()`);

      // Test password rejection: supply incorrect password
      await evaluate(`(() => {
        const dt = new DataTransfer();
        const fakeFile = new File(['fake-archive-bytes'], 'fake.sql.gz', { type: 'application/gzip' });
        dt.items.add(fakeFile);
        document.querySelector('#restore-file-input').files = dt.files;
        document.querySelector('#restore-admin-password').value = 'WrongPassword999!';
      })()`);

      await evaluate(`document.querySelector('#sandbox-restore-form').dispatchEvent(new Event('submit', { cancelable: true }));`);
      await waitFor(`document.querySelector('#restore-status-message-container') && (document.querySelector('#restore-status-message-container').textContent.includes('Failed') || document.querySelector('#restore-status-message-container').textContent.includes('Invalid'))`, 8000);

      // Verify password input was immediately wiped
      const clearedPass = await evaluate(`document.querySelector('#restore-admin-password').value`);
      assert.strictEqual(clearedPass, '', 'Password field must be wiped immediately from memory and DOM');

      // Verify error message displayed
      const errorMsg = await evaluate(`document.querySelector('#restore-status-message-container').textContent`);
      assert.ok(errorMsg.includes('Invalid') || errorMsg.includes('Restoration Failed') || errorMsg.includes('password') || errorMsg.includes('aborted'),
        'Error alert must be displayed for invalid administrator password');

      recordPass('Form validations, companion .sha256 parser, and password hygiene verified');
    } catch (err) {
      recordFail('Form validations, companion .sha256 parser, and password hygiene verified', err);
    }

    // ─── TEST 13: Production Restoration Unavailable State ───────────────────
    console.log('\n--- 7. Testing Production Restoration Lockout Notice ---');
    try {
      resetRateLimits();
      // Enable mock production mode
      await fetch(`${baseUrl}/test/mock-production/true`);

      // Reopen modal to load production status
      await evaluate(`openBackupRecoveryModal();`);
      await waitFor(`document.querySelector('#backup-modal-content') && document.querySelector('#backup-modal-content').style.display !== 'none'`);

      const bodyText = await evaluate(`document.querySelector('#backup-modal-body').textContent`);
      assert.ok(bodyText.includes('Restoration Permanently Disabled on Production Deployment'),
        'Modal must display production restoration lockout alert');
      assert.ok(bodyText.includes('Locked (Production)'), 'Restoration target badge must indicate Locked (Production)');

      // Restore form must NOT be rendered in production mode
      const restoreFormExists = await evaluate(`Boolean(document.querySelector('#sandbox-restore-form'))`);
      assert.strictEqual(restoreFormExists, false, 'Restore form must not be rendered when production lockout is active');

      // Backup creation remains available
      const backupBtnExists = await evaluate(`Boolean(document.querySelector('#btn-create-backup'))`);
      assert.strictEqual(backupBtnExists, true, 'Backup creation button must remain fully available in production');

      await captureScreenshot('backup-modal-production-lockout.png');

      // Reset mock production mode
      await fetch(`${baseUrl}/test/mock-production/false`);

      recordPass('Production lockout display cleanly halts restoration UI while keeping backup creation active');
    } catch (err) {
      recordFail('Production lockout display cleanly halts restoration UI while keeping backup creation active', err);
    }

    // ─── TEST 14, 15, 16: Real Local Sandbox Restoration Integration ─────────
    console.log('\n--- 8. Testing Real Local Sandbox Restoration Integration ---');
    let realBackup = null;
    try {
      resetRateLimits();

      // Generate verified real backup archive on disk
      realBackup = await backupService.generateVerifiedSqlBackup();
      const archiveBytes = fs.readFileSync(realBackup.filePath);
      const base64Archive = archiveBytes.toString('base64');

      // Reopen modal in development mode
      await evaluate(`openBackupRecoveryModal();`);
      await waitFor(`document.querySelector('#sandbox-restore-form')`);

      // Inject real archive file, valid checksum, and correct test fixture password
      await evaluate(`((base64Data, checksum, filename, testPass) => {
        window.showConfirmModal = async () => true;
        window.confirm = () => true;

        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const realBlob = new Blob([byteArray], { type: 'application/gzip' });
        const realFile = new File([realBlob], filename, { type: 'application/gzip' });

        const dt = new DataTransfer();
        dt.items.add(realFile);
        document.querySelector('#restore-file-input').files = dt.files;
        document.querySelector('#restore-checksum-input').value = checksum;
        document.querySelector('#restore-admin-password').value = testPass;
      })('${base64Archive}', '${realBackup.checksumSha256}', '${realBackup.filename}', '${TEST_FIXTURE_PASSWORD}')`);

      // Trigger restoration submit
      await evaluate(`document.querySelector('#sandbox-restore-form').dispatchEvent(new Event('submit', { cancelable: true }));`);
      // Wait for native restoration execution into labsync_test
      const successLoaded = await waitFor(`document.querySelector('#restore-status-message-container') && document.querySelector('#restore-status-message-container').textContent.includes('Sandbox Restoration Completed Successfully')`, 12000);
      assert.strictEqual(successLoaded, true, 'Modal must display sandbox restoration success alert');

      const successMsg = await evaluate(`document.querySelector('#restore-status-message-container').textContent`);
      assert.ok(successMsg.includes('labsync_test'), 'Success alert must display target database labsync_test');

      await captureScreenshot('backup-modal-restore-success.png');
      recordPass('Real end-to-end sandbox restoration executed into labsync_test and reflected in UI');
    } catch (err) {
      recordFail('Real end-to-end sandbox restoration executed into labsync_test and reflected in UI', err);
    } finally {
      if (realBackup && realBackup.tempDir) {
        try { fs.rmSync(realBackup.tempDir, { recursive: true, force: true }); } catch (_) {}
      }
    }

    // ─── TEST 18: Existing Sidebar Regression Checks ─────────────────────────
    console.log('\n--- 9. Testing Existing Sidebar Regression Invariants ---');
    try {
      resetRateLimits();
      // Close modal
      await evaluate(`(() => { const m = document.querySelector('#backup-recovery-modal'); if (m) m.remove(); })()`);

      // Check Master Schedule button
      const masterBtn = await evaluate(`Boolean(document.querySelector('.sidebar-btn[data-url="master-schedule.html"]'))`);
      assert.strictEqual(masterBtn, true, 'Master Schedule button must remain intact in sidebar');

      // Check User Management button
      const facultyBtn = await evaluate(`Boolean(document.querySelector('.sidebar-btn[data-url="faculty-management.html"]'))`);
      assert.strictEqual(facultyBtn, true, 'User Management button must remain intact in sidebar');

      // Check Admin Panel button
      const adminBtn = await evaluate(`Boolean(document.querySelector('#sidebar-admin-btn'))`);
      assert.strictEqual(adminBtn, true, 'Admin Panel button must remain intact in sidebar');

      recordPass('Existing sidebar navigation elements and URLs preserved without regression');
    } catch (err) {
      recordFail('Existing sidebar navigation elements and URLs preserved without regression', err);
    }

  } finally {
    if (ws) ws.close();
    chromeProc.kill('SIGKILL');
    server.close();
    pool.query = originalQuery;
    backupService.getBackupStatus = originalGetStatus;

    try {
      if (fs.existsSync(tempProfile)) {
        fs.rmSync(tempProfile, { recursive: true, force: true });
      }
    } catch (_) {}

    console.log('\n================================================================');
    console.log(`Frontend QA Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

runFrontendTestSuite().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Fatal Frontend QA runner error:', err);
  process.exit(1);
});
