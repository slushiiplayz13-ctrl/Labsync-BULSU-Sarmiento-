# LabSync — Live Security Verification & Testing Guide
## Group Demonstration & Examination Testing Script for Live Deployed Application
**Live Railway URL:** `https://labsync-bulsu-sarmiento-production.up.railway.app`  

---

### Overview for Groupmates
This guide provides step-by-step instructions for demonstrating and verifying all 18 security features plus your 2 additions directly on the live Railway deployment and physical hardware dock. Use this testing manual to rehearse before your defense!

---

## Category A: Login and Account Security

### #1 Account Provisioning, Session Checks & Public Kiosk Access (RETAIN)
* **Target URLs:** `/api/schedules/save` & `/public/report.html`
* **How to Test:**
  1. Open an Incognito / Private browsing window.
  2. Paste `https://labsync-bulsu-sarmiento-production.up.railway.app/api/schedules/save` in the address bar.
  3. Next, open `https://labsync-bulsu-sarmiento-production.up.railway.app/public/report.html` in the same window.
* **Expected Result:**
  * Protected API returns `HTTP 401 Unauthorized` (access blocked without login).
  * The public student report page loads freely without requiring any credentials.
* **What to say:** *"Our server requires sessions on staff routes, but public student fault reporting is intentionally accessible so students at kiosks aren't blocked by login."*

---

### #2 Credential Recovery: 32-Byte Cryptographic Tokens & 1-Hour Expiry (RETAIN)
* **Target URL:** `/recover-password.html`
* **How to Test:**
  1. Open `/recover-password.html` and submit a test email.
  2. Inspect the Railway MySQL database `users` table.
* **Expected Result:**
  * Screen shows a generic message: *"If an account exists with this email, a reset link has been sent"* (prevents email enumeration).
  * In MySQL, `Reset_Token` contains a 64-character SHA-256 hash (never raw token), and `Reset_Token_Expiry` is set to exactly 1 hour. Upon single use, it resets to `NULL`.
* **What to say:** *"We generate 32 random bytes, store only the SHA-256 hash in MySQL with a 1-hour expiration, and reset it to NULL upon single use."*

---

### #3 Secure Password Handling: bcrypt with 12 Salt Rounds (RETAIN)
* **Verification:** Railway MySQL Query Console / DBeaver / phpMyAdmin
* **How to Test:**
  1. Run query: `SELECT Email, Password FROM users LIMIT 3;`
  2. Inspect the `Password` column format.
* **Expected Result:**
  * Every password hash begins with `$2b$12$...`.
  * Proves Modular Crypt Format using bcrypt with salt work factor 12. Plaintext passwords are never stored or logged.
* **What to say:** *"We use bcrypt (^6.0.0) with BCRYPT_SALT_ROUNDS = 12. Plaintext passwords are never saved, and hashes are omitted from all API outputs."*

---

## Category B: Session Security

### #4 Session Fixation Defense: ID Regeneration & Logout Destruction (RETAIN)
* **Target URL:** `/login.html` | Browser DevTools (`F12`) -> Application -> Cookies
* **How to Test:**
  1. Press `F12` -> **Application** -> **Cookies** -> note the value of `connect.sid`.
  2. Log in with your MIS or Faculty credentials.
  3. Inspect `connect.sid` again. Then click **Logout**.
* **Expected Result:**
  * The `connect.sid` value changes to a brand new token upon login (defends against fixation).
  * Clicking logout deletes the cookie from the browser and destroys the session on Express.
* **What to say:** *"Our auth controller runs req.session.regenerate() upon successful authentication and req.session.destroy() upon logout."*

---

### #5 Cookie Protection: HttpOnly, Secure & SameSite Flags (RETAIN)
* **Verification:** Browser DevTools Console & Cookies Tab
* **How to Test:**
  1. In DevTools Cookies tab, inspect `connect.sid` flags.
  2. Switch to the **Console** tab and execute: `console.log(document.cookie);`
* **Expected Result:**
  * `HttpOnly = ✓`, `Secure = ✓`, `SameSite = Lax`.
  * The console prints an empty string `""` or omits `connect.sid` (preventing XSS theft).
* **What to say:** *"Our session cookies have HttpOnly and Secure flags enabled, meaning malicious JavaScript cannot steal user session tokens."*

---

### #6 Session Lifecycle: 10-Minute Rolling Inactivity Timeout & HSTS (RETAIN)
* **Verification:** DevTools Network Tab & Inactivity Test
* **How to Test:**
  1. In DevTools Network tab, inspect any response header for `Strict-Transport-Security`.
  2. Log in, leave the browser completely idle for >10 minutes, then click any action.
* **Expected Result:**
  * Response header contains `Strict-Transport-Security: max-age=15552000; includeSubDomains`.
  * After 10 minutes of inactivity, API calls return `HTTP 401 SESSION_EXPIRED` and redirect to login.
* **What to say:** *"We enforce 180-day HSTS for transport security and a 10-minute idle inactivity timeout in auth middleware to prevent unattended station takeovers."*

---

## Category C: Access Control

### #7 Role-Based Access Control (RBAC): Faculty, IT Head, MIS & OJT (RETAIN)
* **Verification:** Browser DevTools Console (Logged in as Faculty)
* **How to Test:**
  1. Log in with a **Faculty** account.
  2. In DevTools Console, execute an administrative call:
     ```javascript
     fetch('/api/mis-staff', { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' }).then(r => alert('Status: ' + r.status));
     ```
* **Expected Result:**
  * Alert shows `Status: 403` Forbidden.
  * Server checks the live database role on every request and blocks unauthorized privilege escalation.
* **What to say:** *"Our requireRole middleware queries live MySQL data on every single API request, rejecting unauthorized roles with HTTP 403."*

---

### #8 Privileged Actions vs. Public Reporting Separation (RETAIN)
* **Target URL:** `/public/report.html` vs `/api/faculty`
* **How to Test:**
  1. Submit a fault report on `/public/report.html` without logging in (succeeds).
  2. In the same unauthenticated browser, execute:
     ```javascript
     fetch('/api/faculty/add', { method: 'POST' }).then(r => alert('Status: ' + r.status));
     ```
* **Expected Result:**
  * Public fault report succeeds.
  * Administrative call returns `Status: 401 Unauthorized`.
* **What to say:** *"We keep student kiosks public to eliminate reporting friction, while all administrative management routes strictly enforce sessions and roles."*

---

## Category D: Input and Query Security

### #9 Input Validation & ACID Database Transactions (RETAIN)
* **Verification:** Fault Report Form & Automated Test Script
* **How to Test:**
  1. In terminal, run: `node tests/test-submit-pc-report-validation.js`
  2. Or on `/public/report.html`, try submitting with an empty description or invalid room numbers.
* **Expected Result:**
  * Test script passes all validation checks. Backend returns `HTTP 400 Bad Request`.
  * Operations use `withTransaction` so multi-step submissions roll back completely if any single query fails.
* **What to say:** *"We validate all inputs on the backend with regex and enums, and wrap multi-step operations in database transactions to maintain ACID consistency."*

---

### #10 SQL Injection Defense: 100% Parameterized Queries (RETAIN)
* **Target URL:** `/login.html`
* **How to Test:**
  1. On login page, enter email: `' OR '1'='1' --` and any password.
  2. Click **Sign In**.
* **Expected Result:**
  * Rejects safely with *"Invalid email or password"* (HTTP 401). No database crashes, syntax errors, or bypasses.
  * mysql2 treats input strictly as literal string values using `?` placeholders.
* **What to say:** *"Every query across all repositories uses parameterized queries with question-mark placeholders, eliminating SQL injection by design."*

---

## Category E: Data Protection and Privacy

### #11 Sensitive Secret Protection: Git Exclusions & Cloud Environment (RETAIN)
* **Verification:** Git Terminal & Railway Environment Variables
* **How to Test:**
  1. In terminal, run: `git ls-files .env LabSync_ESP32/secrets.h`
  2. Open Railway Dashboard -> **Variables** tab.
* **Expected Result:**
  * Git command returns nothing (proves secrets are not tracked in Git).
  * Railway Variables tab shows production credentials injected securely at runtime.
* **What to say:** *"Credentials and IoT secrets are excluded from version control via .gitignore and injected strictly through environment variables."*

---

### #12 Data Minimization & 1-Year Log Retention Purge (RETAIN)
* **Verification:** Automated Test Script `node tests/test-retention.js`
* **How to Test:**
  1. Run retention test in terminal.
  2. In browser, navigate to a non-existent API route: `/api/invalid-test`.
* **Expected Result:**
  * Automated retention test passes, calculating the 1-calendar-year cutoff date and pruning old rows.
  * Production error handler returns generic JSON without exposing database schemas or stack traces.
* **What to say:** *"Our activityRetentionService automatically purges occupancy records older than 1 calendar year, and our production error handler suppresses database schemas."*

---

## Category F: Device and Message Security

### #13 ESP32 Device Token Authentication & Authorized Rooms (RETAIN)
* **Verification:** cURL / Postman Terminal Test
* **How to Test:**
  ```bash
  curl -X POST https://labsync-bulsu-sarmiento-production.up.railway.app/api/occupancy/log -H "Content-Type: application/json" -d "{\"test\":true}"
  ```
* **Expected Result:**
  * Returns `HTTP 401 Unauthorized` (or 403 for unauthorized room).
  * Only the physical ESP32 sending the registered Bearer token is allowed to submit hardware events.
* **What to say:** *"The ESP32 uses Bearer tokens verified against iot_devices, and authorizedRooms ensures devices can only report for their assigned rooms."*

---

### #14 Hardware Resilience: 40-ms Sensor Debounce & 15-s Heartbeat (RETAIN)
* **Verification:** Arduino Serial Monitor (115200 baud) or `node tests/test-firmware-heartbeat-starvation.js`
* **How to Test:**
  1. Open Arduino Serial Monitor connected to ESP32 dock.
  2. Observe output logs.
* **Expected Result:**
  * Firmware logs `[NetWorker Heartbeat] ✔ Success: HTTP 200 ... FreeHeap: ...` every 15 seconds.
  * Pulling a key triggers 40ms debounce with 16-sample ADC averaging to filter contact chatter.
* **What to say:** *"Our firmware uses 40ms debouncing with 16-sample ADC averaging to filter contact noise on physical keys, and transmits telemetry every 15s."*

---

## Category G: Audit Logging and Safe Errors

### #15 Dual Security Audit Trail: occupancy_log + audit_logs (RETAIN)
* **Target URL:** `/mis-logs.html` & Physical ESP32 Dock
* **How to Test:**
  1. Pull a physical key from slot 203 or 204 on the ESP32 dock without scanning a faculty QR.
  2. Open `/mis-logs.html` in the MIS dashboard and refresh.
* **Expected Result:**
  * An immediate entry appears showing `UNAUTHORIZED_REMOVAL` with exact timestamp, room number, and device ID.
  * Tables are append-only with zero deletion endpoints.
* **What to say:** *"We maintain forensic accountability via occupancy_log for hardware key actions and audit_logs for administrative/login events."*

---

## Category H: Availability, Backup and Recovery

### #16 Service Continuity: MySQL Connection Pooling & Health Probes (RETAIN)
* **Target URLs:** `/api/health` & `/api/health/db`
* **How to Test:**
  1. Open `https://labsync-bulsu-sarmiento-production.up.railway.app/api/health` in browser.
  2. Next open `/api/health/db`.
* **Expected Result:**
  * Both return `HTTP 200 {"status":"ok","database":"connected"}` with live uptime.
  * Proves MySQL connection pool is actively responding and healthy.
* **What to say:** *"We use a 10-connection pool to prevent database socket exhaustion, while cloud uptime is managed by Railway."*

---

### #17 Database Backup, Disaster Recovery & Blue-Green Promotion (RETAIN & LIVE DEMO)
* **Target Interface:** Account Settings → Administrative Tools → Backup & Recovery (IT Dept. Head Only)
* **Target Endpoints:**
  - `POST /api/admin/backups/create` (5 requests / 1 hour rate limit)
  - `POST /api/admin/backups/recovery/restore` (3 attempts / 1 hour rate limit, password re-auth required)
  - `GET /api/admin/backups/recovery/compare?room=...` (Demonstration Snapshot Isolation Proof)
  - `GET /api/admin/backups/recovery/promotion-status` (Blue-Green Promotion Readiness Assessment)
  - `POST /api/admin/backups/maintenance-mode` (Cutover Maintenance Mode Toggle: blocks mutating requests with HTTP 503)
* **How to Test for the Professor (Blue-Green Recovery & Promotion Demonstration):**
  1. **Create Backup & Download**:
     - Log in as **IT Department Head** on the deployed application.
     - Open **Account Settings** (top-right avatar) → **Backup & Recovery**.
     - Click **Create Backup**: system streams a compressed, topologically sorted `.sql.gz` archive. Download the `.sha256` companion file.
  2. **Delete Demonstration Room in Live Production**:
     - Navigate to **Laboratories** (Room Management) in the deployed website.
     - Note or create a room (e.g. `Room 301`), click **Delete Room**, and confirm. The room is now absent from live production.
  3. **Restore into Separate Online Recovery Sandbox**:
     - Return to **Account Settings → Backup & Recovery**.
     - Select the downloaded archive and companion checksum, re-authenticate with your administrator password, and click **Restore into Online Sandbox**.
  4. **Verify Recovery in Snapshot**:
     - Inspect the **Recovery Verification Screen**: confirms table count, record counts, and engine version.
     - In the demonstration comparison tool, search for the deleted room: it is verified **Present in the Recovery Sandbox**!
  5. **Prepare for Blue-Green Promotion (Phase 1: Pre-Armed Maintenance Mode Deployment)**:
     - **Verify Single Replica**: In Railway Settings → Scale, verify exactly 1 replica is active (`Replicas: 1`). The in-memory runtime toggle is process-local and assumes single-replica topology.
     - Click **Verify Promotion Readiness**: validates core application tables, candidate reachability, and isolation.
     - **Pre-Arm Runtime Maintenance Mode**: Click **Enable Maintenance** in the Backup modal (or `POST /api/admin/backups/maintenance-mode`). Ordinary mutating requests immediately return `HTTP 503`.
     - **Verify Cutover Drain State**: Check `GET /api/admin/backups/maintenance-mode` to confirm `cutoverDrained === true` (`mutationRequestsDrained: true` [0 active mutations] AND `backgroundJobsDrained: true` [retention and key reminder workers idle]). Note that client disconnects do NOT automatically decrement active mutations while server-side database writes are still executing; `cutoverDrained` strictly remains `false` until all admitted operations settle. Permitted exempt writes include point-in-time backup export, online sandbox restoration, cutover audit logging, and admin session auth.
     - *(Optional)* Click **Create Backup** to capture an untainted, frozen logical snapshot of Blue while mutations are locked.
     - **Enforce Environment Maintenance**: In Railway (`Labsync-BULSU-Sarmiento-` → **Variables**), set `MAINTENANCE_MODE=true` and **Deploy**. Pre-arming ensures the active container remains shielded during Railway's rolling restart overlap (which is configurable and must not be assumed to have a fixed duration; do not assume a healthcheck is pre-configured—inspect actual deployment settings).
     - Wait until the new deployment is Active and the previous container is removed. Verify the new deployment boots in environment-driven maintenance mode. (Note: In-memory sessions reset upon container restart; log in again as IT Department Head to proceed).
  6. **Execute Railway Connection Switch (Phase 2: Database Switch Deployment)**:
     - In Railway (`Labsync-BULSU-Sarmiento-` → **Variables**), update the production database references and server identity pinning to target the recovered database:
       ```env
       DB_HOST=${{LabSync-Recovery-Sandbox.MYSQLHOST}}
       DB_PORT=${{LabSync-Recovery-Sandbox.MYSQLPORT}}
       DB_USER=labsync_app
       DB_PASSWORD=<YOUR_LABSYNC_APP_PASSWORD>
       DB_NAME=${{LabSync-Recovery-Sandbox.MYSQLDATABASE}}
       PROD_SERVER_UUID=df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c
       MAINTENANCE_MODE=true
       ```
     - Click **Deploy**. Railway initiates a rolling restart with the recovered database as active production, initializing immediately in maintenance mode.
  7. **Inspect Normal Room Management**:
     - Navigate to **Laboratories** in normal LabSync: **The previously deleted room reappears!**
     - The original production database (Blue) was never overwritten or rolled back.
* **Expected Result:**
  * Logical backup, snapshot recovery, and database promotion execute cleanly.
  * Deleted room reappears in normal Room Management after promotion.
  * Original production database (Blue) remains intact as an untouched previous-state rollback copy.
* **What to say:** *"LabSync implements enterprise Blue-Green disaster recovery. The original MySQL 9.7.4 production database (Blue) is never overwritten or rolled back. Instead, verified backups are restored into a physically separate MySQL 8.4.13 recovery service (Green). After pre-promotion verification and maintenance mode activation, the deployed application is pointed to Green, cleanly restoring earlier records in normal application views while Blue remains completely preserved as an untouched previous-state rollback copy."*

---

### #18 Dashboard Auto-Refresh: 3-Second Polling & Telemetry (RETAIN)
* **Target URL:** `/mis-keys.html` | Browser DevTools Network Tab
* **How to Test:**
  1. Open `/mis-keys.html`, press `F12` -> **Network** tab -> filter by `Fetch/XHR`.
  2. Watch network activity: requests to `/api/keys` appear every 3 seconds.
  3. Lift a key from the dock: card status updates in 3 seconds automatically without refreshing the browser!
* **Expected Result:**
  * Network tab confirms 3-second polling. Key status updates dynamically.
* **What to say:** *"3-second polling is an interface refresh loop so staff see live key movements, while hardware diagnostics are passively reported via ESP32 heartbeat telemetry."*

---

## Selected Additional Features (A1 & A2)

### #A1 Student ID QR Cryptographic Verification & Replay Prevention (ADD)
* **Target URL:** `/public/report.html`
* **How to Test:**
  1. Scan a BulSU Student ID barcode/QR to generate a verification session.
  2. Complete and submit the fault report (succeeds).
  3. Immediately attempt to submit a second report with that identical capture session.
* **Expected Result:**
  * Second submission returns `HTTP 403 Forbidden: Student ID verification session has already been used`.
  * Proves single-use nonce consumption prevents replay attacks!
* **What to say:** *"We generate ephemeral HMAC SHA-256 tokens with a 16-byte random nonce and 10-minute expiry; tokens are atomically marked Used_At = NOW() in MySQL upon submission, preventing replay."*

---

### #A2 API Rate Limiting & Anti-Spam Abuse Controls (ADD)
* **Target URL:** `/login.html`
* **How to Test:**
  1. On login page, type a wrong password.
  2. Rapidly click **Sign In** 11 times.
* **Expected Result:**
  * On the 11th click, the server returns `HTTP 429 Too Many Requests: "Too many login attempts. Please try again after 15 minutes."`
  * DevTools Network tab shows `RateLimit-Limit: 10` and `RateLimit-Remaining: 0`.
* **What to say:** *"We use express-rate-limit to enforce tiered request throttlers on login, password recovery, and student reports, blocking automated brute-force abuse."*
