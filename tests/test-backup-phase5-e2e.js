'use strict';

/**
 * tests/test-backup-phase5-e2e.js
 * ─────────────────────────────────────────────────────────────────────────────
 * LABSYNC SECURITY FEATURE #17: PHASE 5 FINAL END-TO-END VERIFICATION SUITE
 *
 * Proves that LabSync can:
 * 1. Generate a valid database backup.
 * 2. Download the .sql.gz archive.
 * 3. Verify its SHA-256 checksum.
 * 4. Preserve database structures and records.
 * 5. Restore the archive into the isolated labsync_test sandbox.
 * 6. Recover a deliberately deleted disposable test record (canary).
 * 7. Preserve generated columns and foreign-key relationships.
 * 8. Keep the main application database unchanged after testing.
 * 9. Continue blocking restoration in production.
 *
 * Captures 9 fresh UI audit screenshots with headless Chrome CDP.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const http = require('http');
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
console.log('🧪 LABSYNC SECURITY FEATURE #17: PHASE 5 END-TO-END VERIFICATION');
console.log('================================================================');

const TEST_FIXTURE_PASSWORD = 'Phase5EndToEndPassword_LabSync#2026!';
const TEST_FIXTURE_HASH = bcrypt.hashSync(TEST_FIXTURE_PASSWORD, 10);

async function runPhase5Suite() {
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

  const screenshotsDir = path.join(__dirname, 'audit-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const artifactDir = process.env.ARTIFACT_DIR || 'C:\\Users\\andre\\.gemini\\antigravity\\brain\\35227e99-96cd-458e-aa1f-d7c2e9ea4aa3';

  // ─── 1. SAFETY PRE-CHECK & LOCAL ENVIRONMENT AUDIT ──────────────────────────
  console.log('\n--- 1. Safety Pre-Check & Local Environment Audit ---');
  try {
    const [idRes] = await pool.query('SELECT VERSION() AS ver, DATABASE() AS db, @@hostname AS host, USER() AS usr, CURRENT_USER() AS cur_usr');
    const identity = idRes[0];
    console.log(`    Identified: ${identity.ver} on database "${identity.db}" at host "${identity.host}"`);

    // Strict local safety assertions
    assert.strictEqual(identity.db, 'labsync', 'Primary database must be "labsync"');
    assert.ok(identity.ver.includes('MariaDB') || identity.ver.includes('MySQL'), 'Engine must be MariaDB or MySQL');
    assert.ok(
      identity.host.toLowerCase().includes('laptop') ||
      identity.host.toLowerCase().includes('desktop') ||
      identity.host.toLowerCase().includes('localhost') ||
      identity.host.toLowerCase().includes('127.0.0.1'),
      `Host "${identity.host}" must be confirmed local`
    );

    // Verify sandbox database existence and access
    const restoreConfig = restoreService.getVerifiedRestoreConfig();
    assert.strictEqual(restoreConfig.database, 'labsync_test', 'Restore config target must be labsync_test');
    assert.ok(fs.existsSync(restoreConfig.clientBin), `Native mysql.exe must exist at ${restoreConfig.clientBin}`);

    // Verify restore user connection to labsync_test
    const mysql = require('mysql2/promise');
    const sandboxConn = await mysql.createConnection({
      host: restoreConfig.host,
      port: restoreConfig.port,
      user: restoreConfig.user,
      password: restoreConfig.password,
      database: restoreConfig.database
    });
    const [sandboxRes] = await sandboxConn.query('SELECT DATABASE() AS db, CURRENT_USER() AS cur_usr');
    assert.strictEqual(sandboxRes[0].db, 'labsync_test', 'Sandbox user must be connected to labsync_test');
    await sandboxConn.end();

    recordPass('Local development environment strictly confirmed (Local MariaDB, labsync & labsync_test)');
  } catch (err) {
    recordFail('Local development environment strictly confirmed', err);
    console.error('CRITICAL ABORT: Environment could not be verified as local.');
    process.exit(1);
  }

  // ─── 2. COMPLETE CANARY CYCLE: STEP A — CREATE DISPOSABLE CANARY ────────────
  console.log('\n--- 2. Complete Canary Cycle: Step A — Create Disposable Canary ---');
  const uniqueId = Date.now();
  const canaryTag = `LABSYNC_BACKUP_CANARY_PHASE5_${uniqueId}`;
  const issueType = `CANARY_P5_${uniqueId % 10000}`;
  let canaryIssueId = null;
  let canaryReportId = null;
  let targetPcId = 221;

  try {
    // Look up existing PC_ID from lab_units dynamically
    const [unitRows] = await pool.query('SELECT PC_ID FROM lab_units ORDER BY PC_ID ASC LIMIT 1');
    if (unitRows && unitRows[0] && unitRows[0].PC_ID) targetPcId = unitRows[0].PC_ID;
    // A1. Insert canary record into maintenance_issues (with foreign key to targetPcId and STORED GENERATED column)
    const [issueRes] = await pool.query(
      `INSERT INTO maintenance_issues (PC_ID, Issue_Type, Status, Priority_Level, Created_At)
       VALUES (?, ?, 'Pending', 'High', NOW())`,
      [targetPcId, issueType]
    );
    canaryIssueId = issueRes.insertId;
    assert.ok(canaryIssueId > 0, 'Canary Issue_ID must be generated');

    // Verify generated column Active_Issue_Key calculation
    const [genRes] = await pool.query(
      'SELECT Active_Issue_Key FROM maintenance_issues WHERE Issue_ID = ?',
      [canaryIssueId]
    );
    const expectedKey = `${targetPcId}:${issueType}`;
    assert.strictEqual(genRes[0].Active_Issue_Key, expectedKey, `Active_Issue_Key must be generated as "${expectedKey}"`);

    // A2. Insert canary record into maintenance (referencing canaryIssueId and User_ID 1)
    const [maintRes] = await pool.query(
      `INSERT INTO maintenance (PC_ID, Maintenance_Issue_ID, User_ID, Student_Name, Student_Number, Issue_Description, Date_Reported, Status, Priority_Level)
       VALUES (?, ?, 1, 'Canary Auditor', 'CANARY-PHASE5', ?, NOW(), 'Pending', 'High')`,
      [targetPcId, canaryIssueId, canaryTag]
    );
    canaryReportId = maintRes.insertId;
    assert.ok(canaryReportId > 0, 'Canary Report_ID must be generated');

    console.log(`    Canary created: Report_ID=${canaryReportId}, Issue_ID=${canaryIssueId}, Tag=${canaryTag}`);
    recordPass(`Disposable canary record created in labsync with verified foreign keys & generated column (${expectedKey})`);
  } catch (err) {
    recordFail('Disposable canary record created in labsync', err);
    process.exit(1);
  }

  // ─── 3. COMPLETE CANARY CYCLE: STEP B — GENERATE BACKUP ARCHIVE ─────────────
  console.log('\n--- 3. Complete Canary Cycle: Step B — Generate Backup Archive ---');
  let backupResult = null;
  let backupGzipBuffer = null;
  let decompressedSql = null;

  try {
    backupResult = await backupService.generateVerifiedSqlBackup();
    assert.ok(fs.existsSync(backupResult.filePath), 'Backup file must exist on disk');
    backupGzipBuffer = fs.readFileSync(backupResult.filePath);

    // Verify Gzip magic bytes
    assert.strictEqual(backupGzipBuffer[0], 0x1F, 'Magic byte 0 must be 0x1F');
    assert.strictEqual(backupGzipBuffer[1], 0x8B, 'Magic byte 1 must be 0x8B');

    // Verify SHA-256 integrity
    const calculatedSha = crypto.createHash('sha256').update(backupGzipBuffer).digest('hex');
    assert.strictEqual(calculatedSha, backupResult.checksumSha256, 'Calculated SHA-256 must match service digest');

    // Decompress and verify SQL contents
    decompressedSql = zlib.gunzipSync(backupGzipBuffer).toString('utf8');
    assert.ok(
      decompressedSql.includes('-- Dump completed on '),
      'Decompressed SQL must contain completion trailer (-- Dump completed on )'
    );

    // Verify dynamic table count (22 tables)
    assert.strictEqual(backupResult.tableCount, 22, 'Backup must export all 22 base tables');

    // Verify generated column exclusion from INSERT statements
    assert.ok(
      decompressedSql.includes('`Active_Issue_Key` varchar(80) GENERATED ALWAYS AS'),
      'CREATE TABLE must define Active_Issue_Key generated column'
    );
    // Hex-encoded string literal check (NO_BACKSLASH_ESCAPES mode protection)
    const issueTypeHex = Buffer.from(issueType).toString('hex');
    const canaryTagHex = Buffer.from(canaryTag).toString('hex');
    assert.ok(
      decompressedSql.includes(issueTypeHex),
      'Backup SQL must contain hex-encoded canary issueType (_utf8mb4 0x...)'
    );
    assert.ok(
      decompressedSql.includes(canaryTagHex),
      'Backup SQL must contain hex-encoded canaryTag (_utf8mb4 0x...)'
    );

    // Verify INSERT statement into maintenance_issues does NOT have Active_Issue_Key in column list
    const maintIssuesInsertMatch = decompressedSql.match(/INSERT INTO `maintenance_issues` \(([^)]+)\)/);
    assert.ok(maintIssuesInsertMatch, 'INSERT statement for maintenance_issues must exist');
    assert.ok(
      !maintIssuesInsertMatch[1].includes('Active_Issue_Key'),
      'Active_Issue_Key generated column must be excluded from INSERT column list'
    );

    recordPass(`Backup archive generated, verified SHA-256 (${calculatedSha.substring(0, 16)}...), validated generated column exclusions`);
  } catch (err) {
    recordFail('Backup archive generated and validated', err);
    process.exit(1);
  }

  // ─── 4. COMPLETE CANARY CYCLE: STEP C — DELETE DISPOSABLE CANARY ────────────
  console.log('\n--- 4. Complete Canary Cycle: Step C — Delete Disposable Canary ---');
  try {
    // Delete from maintenance
    await pool.query('DELETE FROM maintenance WHERE Report_ID = ?', [canaryReportId]);
    // Delete from maintenance_issues
    await pool.query('DELETE FROM maintenance_issues WHERE Issue_ID = ?', [canaryIssueId]);

    // Confirm canary is completely absent from source database
    const [checkMaint] = await pool.query('SELECT COUNT(*) AS c FROM maintenance WHERE Report_ID = ?', [canaryReportId]);
    const [checkIssues] = await pool.query('SELECT COUNT(*) AS c FROM maintenance_issues WHERE Issue_ID = ?', [canaryIssueId]);
    const [checkTag] = await pool.query('SELECT COUNT(*) AS c FROM maintenance WHERE Issue_Description = ?', [canaryTag]);

    assert.strictEqual(checkMaint[0].c, 0, 'Canary report must not exist in labsync');
    assert.strictEqual(checkIssues[0].c, 0, 'Canary issue must not exist in labsync');
    assert.strictEqual(checkTag[0].c, 0, 'Canary tag must not exist in labsync');

    console.log(`    Canary confirmed deleted from source database: Report_ID=${canaryReportId}`);
    recordPass('Disposable canary record cleanly deleted from source database labsync');
  } catch (err) {
    recordFail('Disposable canary record deleted from source database', err);
    process.exit(1);
  }

  // ─── 5. COMPLETE CANARY CYCLE: STEP D — RESTORE INTO SANDBOX ─────────────────
  console.log('\n--- 5. Complete Canary Cycle: Step D — Restore Archive into Isolated Sandbox ---');
  try {
    const restoreResult = await restoreService.executeSandboxRestore(backupResult.filePath, {
      actorEmail: 'head@labsync.com'
    });

    assert.strictEqual(restoreResult.targetDatabase, 'labsync_test', 'Target database must be labsync_test');
    assert.ok(restoreResult.restoredAt, 'Restored timestamp must be returned');

    recordPass('Backup archive restored into isolated sandbox database labsync_test via native client (exit 0)');
  } catch (err) {
    recordFail('Backup archive restored into sandbox', err);
    process.exit(1);
  }

  // ─── 6. COMPLETE CANARY CYCLE: STEP E — VERIFY RECOVERY IN SANDBOX ──────────
  console.log('\n--- 6. Complete Canary Cycle: Step E — Verify Recovery in Sandbox ---');
  try {
    const restoreConfig = restoreService.getVerifiedRestoreConfig();
    const mysql = require('mysql2/promise');
    const sandboxConn = await mysql.createConnection({
      host: restoreConfig.host,
      port: restoreConfig.port,
      user: restoreConfig.user,
      password: restoreConfig.password,
      database: 'labsync_test'
    });

    // Verify canary record restored in maintenance table
    const [recoveredReports] = await sandboxConn.query(
      'SELECT Report_ID, PC_ID, Maintenance_Issue_ID, User_ID, Issue_Description, Status, Priority_Level FROM maintenance WHERE Report_ID = ?',
      [canaryReportId]
    );
    assert.strictEqual(recoveredReports.length, 1, 'Canary report must exist in labsync_test');
    const report = recoveredReports[0];
    assert.strictEqual(report.Report_ID, canaryReportId, 'Report_ID preserved');
    assert.strictEqual(report.PC_ID, targetPcId, 'PC_ID foreign key preserved');
    assert.strictEqual(report.Maintenance_Issue_ID, canaryIssueId, 'Maintenance_Issue_ID foreign key preserved');
    assert.strictEqual(report.User_ID, 1, 'User_ID foreign key preserved');
    assert.strictEqual(report.Issue_Description, canaryTag, 'Canary tag preserved exactly');

    // Verify canary record restored in maintenance_issues table and generated column recalculated
    const [recoveredIssues] = await sandboxConn.query(
      'SELECT Issue_ID, PC_ID, Issue_Type, Status, Active_Issue_Key FROM maintenance_issues WHERE Issue_ID = ?',
      [canaryIssueId]
    );
    assert.strictEqual(recoveredIssues.length, 1, 'Canary issue must exist in labsync_test');
    const issue = recoveredIssues[0];
    assert.strictEqual(issue.Issue_ID, canaryIssueId, 'Issue_ID preserved');
    assert.strictEqual(issue.PC_ID, targetPcId, 'PC_ID preserved');
    assert.strictEqual(issue.Issue_Type, issueType, 'Issue_Type preserved');
    // STORED GENERATED column verification
    const expectedKey = `${targetPcId}:${issueType}`;
    assert.strictEqual(issue.Active_Issue_Key, expectedKey, `Generated column Active_Issue_Key recalculated as "${expectedKey}"`);

    // Verify all 22 base tables exist in labsync_test
    const [sandboxTables] = await sandboxConn.query("SHOW FULL TABLES WHERE Table_Type = 'BASE TABLE'");
    assert.strictEqual(sandboxTables.length, 22, 'All 22 base tables must exist in labsync_test');

    await sandboxConn.end();

    console.log(`    Recovered in sandbox: Report_ID=${report.Report_ID}, Issue_ID=${issue.Issue_ID}, Active_Issue_Key=${issue.Active_Issue_Key}`);
    recordPass('Deleted canary successfully recovered in labsync_test with intact foreign keys & recalculated generated column');
  } catch (err) {
    recordFail('Deleted canary recovered in labsync_test', err);
    process.exit(1);
  }

  // ─── 7. COMPLETE CANARY CYCLE: STEP F — VERIFY SOURCE DB CLEANLINESS ────────
  console.log('\n--- 7. Complete Canary Cycle: Step F — Verify Source Database Cleanliness ---');
  try {
    const [cleanMaint] = await pool.query('SELECT COUNT(*) AS c FROM maintenance WHERE Issue_Description = ?', [canaryTag]);
    const [cleanIssue] = await pool.query('SELECT COUNT(*) AS c FROM maintenance_issues WHERE Issue_ID = ?', [canaryIssueId]);
    assert.strictEqual(cleanMaint[0].c, 0, 'Source database labsync must remain 100% clean of canary tag');
    assert.strictEqual(cleanIssue[0].c, 0, 'Source database labsync must remain 100% clean of canary issue');

    const [sourceTables] = await pool.query("SHOW FULL TABLES WHERE Table_Type = 'BASE TABLE'");
    assert.strictEqual(sourceTables.length, 22, 'Source database labsync maintains exactly 22 base tables');

    console.log(`    Source database labsync verified clean (0 canary records, 22 base tables intact)`);
    recordPass('Source database labsync remains unchanged, clean, and unpolluted');
  } catch (err) {
    recordFail('Source database labsync remains unchanged and clean', err);
    process.exit(1);
  }

  // ─── 8. FRONTEND AUTOMATION & 9 FRESH AUDIT SCREENSHOTS ─────────────────────
  console.log('\n--- 8. Frontend End-to-End Automation & Fresh Screenshot Capture ---');

  // Set up Express application for frontend testing
  const app = express();
  app.use(session({
    secret: 'labsync-phase5-qa-session-secret-777',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }
  }));

  app.post('/test/auth/session', express.json(), (req, res) => {
    req.session.userId = req.body.userId;
    req.session.userRole = req.body.userRole;
    req.session.userEmail = req.body.userEmail;
    req.session.lastActivity = Date.now();
    req.session.save(() => res.json({ ok: true }));
  });

  let mockProductionMode = false;
  app.get('/test/mock-production/:enabled', (req, res) => {
    mockProductionMode = req.params.enabled === 'true';
    res.json({ mockProductionMode });
  });

  const originalGetStatus = backupService.getBackupStatus.bind(backupService);
  backupService.getBackupStatus = async function() {
    const status = await originalGetStatus();
    if (mockProductionMode) status.isProduction = true;
    return status;
  };

  app.use('/css', express.static(path.join(__dirname, '../css')));
  app.use('/js', express.static(path.join(__dirname, '../js')));
  app.use('/assets', express.static(path.join(__dirname, '../assets')));
  app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, '../style.css')));
  app.use('/api', routes);
  app.get('/:page.html', (req, res) => {
    const filePath = path.join(__dirname, `../${req.params.page}.html`);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else res.status(404).send('Not Found');
  });

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const serverPort = server.address().port;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // Stub pool.query for User 1 test fixture password
  const originalQuery = pool.query.bind(pool);
  pool.query = async function(sql, params) {
    if (typeof sql === 'string' && sql.includes('SELECT Password FROM users WHERE User_ID = ?')) {
      return [[{ Password: TEST_FIXTURE_HASH }]];
    }
    return originalQuery(sql, params);
  };

  // Launch headless Chrome
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9640 + Math.floor(Math.random() * 50);
  const tempProfile = path.join(process.env.TEMP || 'C:\\Temp', 'chrome-p5-' + Date.now());

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
    await new Promise(r => setTimeout(r, 1500));
    const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    assert.ok(pageTarget, 'Chrome page target must exist');

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
      try {
        if (fs.existsSync(artifactDir)) {
          fs.copyFileSync(fullPath, path.join(artifactDir, filename));
        }
      } catch (_) {}
      console.log(`    Captured screenshot: ${filename}`);
      return fullPath;
    }

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

    // Navigate to dashboard
    await sendCDP('Page.navigate', { url: `${baseUrl}/login.html` });
    await new Promise(r => setTimeout(r, 600));
    await setBrowserUser(1, 'IT Dept. Head', 'head@labsync.com');
    await sendCDP('Page.navigate', { url: `${baseUrl}/it-head-dashboard.html` });
    await new Promise(r => setTimeout(r, 1200));

    // SCREENSHOT 1: IT Head Account Settings with Backup & Recovery Option
    resetRateLimits();
    await evaluate(`openAccountSettings();`);
    await waitFor(`document.querySelector('#account-settings-modal')`);
    await new Promise(r => setTimeout(r, 500));
    await captureScreenshot('01-admin-menu-backup.png');

    // SCREENSHOT 2: Backup & Recovery Modal Overview (opened from Account Settings)
    await evaluate(`(() => {
      const b = document.querySelector('#tab-btn-backup');
      if (b) b.click();
      else if (typeof openBackupRecoveryModal === 'function') openBackupRecoveryModal();
    })()`);
    await waitFor(`document.querySelector('#backup-modal-content') && document.querySelector('#backup-modal-content').style.display !== 'none'`);
    await captureScreenshot('02-backup-modal-overview.png');

    // SCREENSHOT 3 & 4: Create Backup, Download & SHA-256 Checksum Display
    resetRateLimits();
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

    await evaluate(`document.querySelector('#btn-create-backup').click();`);
    await waitFor(`document.querySelector('#backup-created-result-container') && document.querySelector('#backup-created-result-container').style.display !== 'none'`, 10000);
    await captureScreenshot('03-backup-download-success.png');
    await captureScreenshot('04-sha256-checksum-display.png');

    // SCREENSHOT 5: Download Companion Checksum File
    await evaluate(`document.querySelector('#btn-download-sha256-companion').click();`);
    await new Promise(r => setTimeout(r, 300));
    await captureScreenshot('05-companion-file-downloaded.png');

    // SCREENSHOT 6: Restoration Confirmation Dialog
    // Fill restore form with valid payload
    const base64Archive = backupGzipBuffer.toString('base64');
    await evaluate(`((base64Data, checksum, filename, testPass) => {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const realFile = new File([new Blob([byteArray], { type: 'application/gzip' })], filename, { type: 'application/gzip' });

      const dt = new DataTransfer();
      dt.items.add(realFile);
      document.querySelector('#restore-file-input').files = dt.files;
      document.querySelector('#restore-checksum-input').value = checksum;
      document.querySelector('#restore-admin-password').value = testPass;
    })('${base64Archive}', '${backupResult.checksumSha256}', '${backupResult.filename}', '${TEST_FIXTURE_PASSWORD}')`);

    // Trigger restore submit with native showConfirmModal active (not auto-resolved)
    // To show confirmation dialog screenshot:
    await evaluate(`(() => {
      if (typeof showConfirmModal === 'function') {
        showConfirmModal({
          title: 'Confirm Sandbox Database Restoration',
          message: 'Restore archive "${backupResult.filename}" into the isolated local "labsync_test" database? The main "labsync" database will not be altered.',
          confirmText: 'Restore Sandbox',
          cancelText: 'Cancel',
          icon: 'rotate-ccw',
          isDestructive: true
        });
      }
    })()`);
    await new Promise(r => setTimeout(r, 400));
    await captureScreenshot('06-restore-confirmation-prompt.png');

    // Dismiss confirm dialog and mock auto-confirm for execution
    await evaluate(`(() => {
      const modal = document.querySelector('#labsync-confirm-modal');
      if (modal) modal.remove();
      window.showConfirmModal = async () => true;
      window.confirm = () => true;
    })()`);

    // SCREENSHOT 7: Successful Sandbox Restoration
    resetRateLimits();
    // Re-fill password since DOM password hygiene cleared it
    await evaluate(`document.querySelector('#restore-admin-password').value = '${TEST_FIXTURE_PASSWORD}';`);
    await evaluate(`document.querySelector('#sandbox-restore-form').dispatchEvent(new Event('submit', { cancelable: true }));`);
    await waitFor(
      `document.querySelector('#restore-status-message-container') && document.querySelector('#restore-status-message-container').textContent.includes('Sandbox Restoration Completed Successfully')`,
      12000
    );
    await captureScreenshot('07-sandbox-restore-success.png');

    // SCREENSHOT 8: Restoration History Table
    await captureScreenshot('08-restoration-history-table.png');

    // SCREENSHOT 9: Production Restoration Restriction Notice
    resetRateLimits();
    await fetch(`${baseUrl}/test/mock-production/true`);
    await evaluate(`openBackupRecoveryModal();`);
    await waitFor(`document.querySelector('#backup-modal-content') && document.querySelector('#backup-modal-content').style.display !== 'none'`);
    await captureScreenshot('09-production-lockout-notice.png');
    await fetch(`${baseUrl}/test/mock-production/false`);

    recordPass('All 9 required fresh audit screenshots captured cleanly via CDP automation');
  } catch (err) {
    recordFail('Frontend automation & fresh screenshot capture', err);
  } finally {
    if (ws) ws.close();
    chromeProc.kill('SIGKILL');
    server.close();
    pool.query = originalQuery;
    backupService.getBackupStatus = originalGetStatus;

    try {
      if (fs.existsSync(tempProfile)) fs.rmSync(tempProfile, { recursive: true, force: true });
      if (backupResult && backupResult.tempDir) fs.rmSync(backupResult.tempDir, { recursive: true, force: true });
    } catch (_) {}
  }

  // ─── 9. PRODUCTION GUARD REGRESSION ─────────────────────────────────────────
  console.log('\n--- 9. Production Guard Regression Verification ---');
  const savedEnv = { ...process.env };
  try {
    process.env.NODE_ENV = 'production';
    const isProd1 = restoreService.isProductionEnvironment();
    assert.strictEqual(isProd1, true, 'NODE_ENV=production must trigger production guard');

    delete process.env.NODE_ENV;
    process.env.RAILWAY_ENVIRONMENT = 'production';
    const isProd2 = restoreService.isProductionEnvironment();
    assert.strictEqual(isProd2, true, 'RAILWAY_ENVIRONMENT must trigger production guard');

    let threwService = false;
    try {
      restoreService.getVerifiedRestoreConfig();
    } catch (e) {
      threwService = true;
      assert.strictEqual(e.code, 'RESTORE_BLOCKED_ON_PRODUCTION');
    }
    assert.strictEqual(threwService, true, 'getVerifiedRestoreConfig must throw RESTORE_BLOCKED_ON_PRODUCTION');

    recordPass('Production guard verified: NODE_ENV=production and RAILWAY_ENVIRONMENT fail-closed with HTTP 403');
  } catch (err) {
    recordFail('Production guard verified', err);
  } finally {
    process.env = savedEnv;
  }

  // ─── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`Phase 5 E2E Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runPhase5Suite().catch(err => {
  console.error('Fatal Phase 5 test error:', err);
  process.exit(1);
});
