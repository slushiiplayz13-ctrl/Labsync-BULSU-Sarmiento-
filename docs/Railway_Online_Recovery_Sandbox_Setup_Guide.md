# LABSYNC SECURITY FEATURE #17: RAILWAY ONLINE RECOVERY SANDBOX SETUP & DEMONSTRATION GUIDE

## 1. Architectural Overview & Security Governance

LabSync implements enterprise-grade disaster recovery and business continuity controls designed to protect production laboratory records while enabling safe, auditable recovery demonstrations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Deployed LabSync Web Application                      │
│                  (https://*.up.railway.app / Node.js Express)               │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │                               │
          Standard App Operations        Isolated Disaster Recovery
                       │                               │
                       ▼                               ▼
       ┌───────────────────────────────┐ ┌────────────────────────────────────┐
       │   Production MySQL Database   │ │  Online Recovery Sandbox Database  │
       │     (MySQL 9.7.2 Service)     │ │        (MySQL 9.7.2 Service)       │
       │                               │ │                                    │
       │ • Live laboratory schedules   │ │ • Ephemeral recovery destination   │
       │ • Real user accounts & auth   │ │ • Populated strictly on-demand     │
       │ • Permanent restore lockout   │ │ • Dedicated recovery credentials   │
       │   (HTTP 403 Fail-Closed)      │ │ • Zero write access to production  │
       └───────────────────────────────┘ └────────────────────────────────────┘
```

### Essential Terminology: Backup vs. Sandbox Recovery vs. Rollback
| Operation | Definition | Destination | Production Impact |
| :--- | :--- | :--- | :--- |
| **Production Backup Export** | Generates a compressed, topologically ordered `.sql.gz` logical export with SHA-256 verification. | Client Download | Zero (Read-only transactional export) |
| **Online Sandbox Recovery** | Restores a verified `.sql.gz` archive into a separate, dedicated database instance. | `RECOVERY_DB_*` (Sandbox) | **Zero (Production untouched)** |
| **Production Database Rollback** | Overwriting the live production database with older data. | Live Production DB | **PERMANENTLY BLOCKED (`HTTP 403`)** |

> [!IMPORTANT]
> **Why Production Restoration is Permanently Blocked:**
> In accordance with LabSync security policy, no administrative interface is permitted to overwrite or truncate the live production database. A compromised administrator session or accidental restore could wipe out active student reservations, occupancy logs, and equipment tracking. Instead, restoration is permitted exclusively into an isolated recovery sandbox to verify backup integrity without risk to production.

---

## 2. Railway Infrastructure & Cost Estimation

### Railway Plan, Credit & Pricing Structure
Railway operates on a resource-metered cloud execution model. Understanding the exact billing terms is critical for cost control:
1. **One-Time Trial Credit**: Railway provides a one-time trial credit (historically $5.00) for new accounts that expires after 30 days or once consumed; it does not recur monthly.
2. **Hobby Subscription ($5.00 / month Platform Fee)**: The standard Hobby plan incurs a flat $5.00/month platform fee, which includes **$5.00 of resource usage per month**. Total resource consumption across all services in the account is deducted from this $5.00 credit; any usage exceeding $5.00 is billed as pay-as-you-go overage.
3. **Published Railway Resource Pricing**:
   - **RAM**: **$10.00 / GB / month** ($0.0137 / GB / day or ~$0.00057 / GB / hour).
   - **vCPU**: **$20.00 / vCPU / month** ($0.0274 / vCPU / day or ~$0.00114 / vCPU / hour at 100% load).
   - **Persistent Storage (Volume)**: **$0.15 / GB / month** ($0.005 / GB / day).
   - **Network Egress**: **$0.05 / GB** (First 100 GB included on Hobby). Internal private networking traffic between services (`*.railway.internal`) carries **$0.00 egress cost**.

### Realistic Resource & Cost Breakdown for MySQL 9.7.2 Recovery Service
- **Resource Footprint**:
  - Baseline Idle RAM: ~180 MB – 220 MB (~0.20 GB).
  - Peak Active Import RAM: ~250 MB – 320 MB (~0.28 GB).
  - Baseline Idle CPU: <0.02 vCPU average.
  - Active Import CPU: Brief spike to ~0.35 vCPU for 5–10 seconds during statement execution.
  - Persistent Volume: 1 GB default allocation.
- **Scenario A: Running 24/7 for a Full 30-Day Month**:
  - RAM (average ~0.22 GB): 0.22 GB * $10.00 = **$2.20 / month**.
  - CPU (average ~0.02 vCPU): 0.02 vCPU * $20.00 = **$0.40 / month**.
  - Persistent Storage Volume: 1 GB * $0.15 = **$0.15 / month**.
  - Private Internal Egress: **$0.00**.
  - **Total 24/7 Continuous Cost**: **~$2.75 / month**.
  - *Overage Consideration*: If the primary LabSync Node.js web app and production MySQL already utilize near $4.00–$5.00 of the monthly credit, keeping a second database running 24/7 continuously could incur a modest billable overage (~$1.00–$2.75).
- **Scenario B: Running Exclusively for a 2-Hour Demonstration (Recommended)**:
  - Active Execution (2 hours): 2 hours * (~$0.004 / hour) ≈ **~$0.01 (one cent)**.
  - Volume Allocation (prorated for 2 hours): <$0.001.
  - **Total Demonstration Cost**: **~$0.01**.
  - Leaves entire $5.00 monthly usage credit virtually untouched.

### Critical Distinction: Pausing Compute vs. Deleting Volume
To eliminate ongoing charges after completing the evaluation:
1. **Pausing the Service (Halts Compute Only)**: In the Railway dashboard → `LabSync-Recovery-Sandbox` → **Settings** → **Pause Service**.
   - *Impact*: Halts RAM ($0) and CPU ($0) charges completely.
   - *Important Note*: **Persistent volume storage remains allocated** and will continue to incur **$0.15 / GB / month** (e.g. $0.15/month for a 1 GB volume). Pausing does NOT achieve zero ongoing cost.
2. **Deleting the Service (True $0 Ongoing Cost)**: In Railway dashboard → `LabSync-Recovery-Sandbox` → **Settings** → **Delete Service**.
   - *Impact*: Deletes both the compute container and the persistent volume. Resource consumption drops to **strictly $0.00 / month**.
   - LabSync fails closed safely if the recovery database is removed.

---

## 3. Step-by-Step Manual Railway Provisioning Instructions

> [!NOTE]
> Per security governance, the assistant does NOT automatically provision Railway resources or touch billing. Follow these simple steps in the Railway web dashboard:

### Step 1: Add a New MySQL Service in Your Railway Project
1. Log in to [Railway](https://railway.com) and open your **LabSync project**.
2. Click the **+ New** button (top right of the project canvas).
3. Select **Database** → **Add MySQL**.
4. Railway will spin up a fresh, separate MySQL database service alongside your existing services.

### Step 2: Verify MySQL Engine Version Compatibility
1. Click on the newly created MySQL service card → **Settings**.
2. Under **Service Name**, rename it to: `LabSync-Recovery-Sandbox`.
3. Under **Deploy** → inspect the **Image** tag:
   - Ensure the image matches production (e.g., `mysql:9` or `mysql:9.7.2` matching the production Community Server).
4. Open the **Data** tab (or query console) and verify the version and distinct server identity:
   ```sql
   SELECT VERSION();
   SELECT @@server_uuid;
   ```
   - Confirm that `VERSION()` is MySQL 9.x (or compatible with production).
   - Confirm that `@@server_uuid` is a valid 36-character UUID distinct from production.

### Step 3: Create a Dedicated Least-Privilege Recovery Account
> [!IMPORTANT]
> **Least-Privilege Security Policy**: Do NOT configure the application with the root `MYSQLUSER` credentials for recovery. The recovery account must have zero global administrative privileges, no access to the production database, and strictly the minimum required privileges to recreate tables and insert records.

1. Open the **Data** tab on `LabSync-Recovery-Sandbox` (or connect via MySQL CLI).
2. Execute the following SQL to provision the restricted recovery user:
   ```sql
   -- Create dedicated non-root recovery user
   CREATE USER IF NOT EXISTS 'labsync_recovery'@'%' IDENTIFIED BY 'StrongRecoveryPassword#2026!';

   -- Grant permissions strictly confined to the recovery database
   -- Note: Empirically verified that INDEX, UPDATE, and DELETE are NOT required for restoration
   GRANT SELECT, INSERT, CREATE, DROP, ALTER, REFERENCES, LOCK TABLES 
   ON `railway`.* TO 'labsync_recovery'@'%';

   FLUSH PRIVILEGES;
   ```
3. **Why `INDEX` is Safely Omitted**:
   - In MySQL, the `CREATE` privilege grants full authority to define primary keys, composite indexes, and foreign keys directly within `CREATE TABLE` DDL.
   - The LabSync backup exporter does not generate standalone `CREATE INDEX` or `ALTER TABLE ADD INDEX` statements.
   - Local empirical testing verified that all 22 base tables, all 69 distinct indexes, and all 88 index column definitions are restored with 100% exact parity under `CREATE` without granting the `INDEX` privilege.
   - Omission of `UPDATE` and `DELETE` further guarantees that restoration operates strictly via fresh schema recreation (`DROP TABLE IF EXISTS` → `CREATE TABLE` → `INSERT INTO`).

### Step 4: Configure Recovery Variables on the LabSync Node.js Service
1. In the Railway canvas, click on your main **LabSync application service** (the web service).
2. Go to the **Variables** tab.
3. Add the following environment variables using Railway's dynamic reference variable syntax:
   ```env
   RECOVERY_DB_HOST=${{LabSync-Recovery-Sandbox.MYSQLHOST}}
   RECOVERY_DB_PORT=${{LabSync-Recovery-Sandbox.MYSQLPORT}}
   RECOVERY_DB_USER=labsync_recovery
   RECOVERY_DB_PASSWORD=<unique-generated-password>
   RECOVERY_DB_NAME=${{LabSync-Recovery-Sandbox.MYSQLDATABASE}}
   RECOVERY_DB_SSL=true
   PROD_SERVER_UUID=<verified-production-server-uuid>
   ```
4. Click **Deploy** to apply the updated environment variables.

### Key Configuration & Security Requirements:

1. **Railway Service Name Reference Namespace**:
   - The syntax `${{LabSync-Recovery-Sandbox.MYSQLHOST}}` dynamically pulls connection parameters directly from the recovery database service.
   - The service name before the period must match the exact service name configured in Step 2 (`LabSync-Recovery-Sandbox`). If you choose a different service name, adjust the reference prefix accordingly.

2. **Dedicated Recovery Account Created Separately**:
   - Railway auto-generates root credentials (`MYSQLUSER=root` and `MYSQLPASSWORD`) for the MySQL service card.
   - **Do NOT** copy or reference `${{LabSync-Recovery-Sandbox.MYSQLUSER}}` or `${{LabSync-Recovery-Sandbox.MYSQLPASSWORD}}`. The root user possesses `ALL PRIVILEGES` across the MySQL instance.
   - Configure `RECOVERY_DB_USER=labsync_recovery` and set `RECOVERY_DB_PASSWORD` to the unique strong password created via SQL in Step 3.

3. **Private Networking Enforcement**:
   - `${{LabSync-Recovery-Sandbox.MYSQLHOST}}` automatically resolves to the private internal domain (e.g., `LabSync-Recovery-Sandbox.railway.internal`).
   - All database communication between the LabSync web app and the recovery database travels strictly across Railway's private encrypted WireGuard mesh network, with **$0.00 network egress cost**.

4. **Public Database Networking Kept Disabled**:
   - Under `LabSync-Recovery-Sandbox` → **Settings** → **Networking**, ensure "Public Networking" (TCP Proxy) remains **DISABLED**.
   - Public TCP proxies expose database port 3306 to the public internet, which violates LabSync security governance and incurs unnecessary egress exposure.

5. **Production Server UUID Pinning**:
   - Open the **Data** tab on your live **production MySQL service** and execute:
     ```sql
     SELECT @@server_uuid;
     ```
   - Copy the 36-character UUID string and set `PROD_SERVER_UUID=<uuid>` in the web service environment variables.
   - LabSync validates this value against RFC 4122 format (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) and permanently pins the production server identity, allowing offline disaster recovery verification without risking production.

6. **Fail-Closed Missing / Inconsistent Configuration Guard**:
   - If any recovery variable is omitted or invalid, LabSync immediately fails closed, returns `MISSING_RECOVERY_CONFIG`, and displays a clear notice in the UI.
   - If the recovery configuration inadvertently resolves to the production database host and name, or matches the production server UUID, LabSync immediately aborts execution with `RECOVERY_TARGETS_PRODUCTION`.

7. **SSL/TLS Setup & Certificate Verification Requirements**:
   - Setting `RECOVERY_DB_SSL=true` ensures application-layer TLS connection negotiation between Node.js and MySQL.
   - On Railway's internal private network (`*.railway.internal`), the WireGuard overlay network provides kernel-level encryption across containers.
   - Railway MySQL initializes container-internal TLS certificates. When strict certificate verification is required without disabling verification, provide the Certificate Authority (CA) certificate in the `RECOVERY_DB_SSL_CA` environment variable or specify `RECOVERY_DB_SSL=strict`. If `RECOVERY_DB_SSL_CA` is provided, `services/recoveryDatabaseService.js` strictly enforces `rejectUnauthorized: true` with that CA.
   - Public database networking must remain disabled so unverified public traffic is completely barred.

---

## 4. How the Two Recovery Modes Operate

### Mode A: Local Development Sandbox (`labsync_test`)
- When running locally (`NODE_ENV !== 'production'`) and `RECOVERY_DB_*` is not configured:
- Target Database: strictly hardcoded to `127.0.0.1:3306/labsync_test`.
- Uses native client (`mysql.exe`) via `services/restoreService.js`.
- Option file protected with Windows ACLs (`icacls.exe`).
- Ideal for local testing and automated CI regression test suites.

### Mode B: Cloud Online Recovery Sandbox (`RECOVERY_DB_*`)
- When running on Railway (`NODE_ENV === 'production'` or `RAILWAY_ENVIRONMENT` active):
- Target Database: strictly configured via `RECOVERY_DB_*`.
- Uses pure Node.js `mysql2` streaming statement pipeline (`services/recoveryDatabaseService.js`).
- Zero external binary requirements (works seamlessly on standard Linux containers).
- Executes runtime target isolation checks before dropping tables or importing.
- Ideal for live professor evaluations directly on the deployed website.

---

## 5. Blue-Green Production Database Recovery & Promotion Architecture

LabSync implements **Blue-Green Database Recovery and Promotion** to allow administrators to safely promote a successfully restored recovery database so that the live deployed application uses the recovered snapshot as its active production database—**without overwriting or modifying the original production MySQL database.**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Deployed LabSync Web Application                      │
│                  (https://*.up.railway.app / Node.js Express)               │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │                               │
       Standard Traffic (Before Promotion)   Disaster Recovery Sandbox
                       │                               │
                       ▼                               ▼
       ┌───────────────────────────────┐ ┌────────────────────────────────────┐
       │   BLUE: Original Production   │ │   GREEN: Recovered Candidate       │
       │    MySQL 9.7.4 (Live Data)    │ │       MySQL 8.4.13 (Restored)      │
       │                               │ │                                    │
       │ • UUID: fb252566-c303-11f1... │ │ • UUID: df694bff-d6ae-11f1...      │
       │ • Becomes read-only rollback  │ │ • Promoted to active production    │
       │   copy after promotion        │ │ • Used by deployed application     │
       │ • NEVER OVERWRITTEN           │ │ • Account: labsync_app             │
       └───────────────────────────────┘ └────────────────────────────────────┘
                       ▲                               │
                       │     (After Cutover Switch)    │
                       └───────────────────────────────┘
```

### The Two Database Roles:
1. **Blue (Original Production — MySQL 9.7.4)**:
   - Server UUID: `fb252566-c303-11f1-9553-a2aa08ba6a31`
   - Contains the live application database (`railway`).
   - Remains completely untouched as an immutable previous-state copy.
2. **Green (Recovered Database — MySQL 8.4.13)**:
   - Railway Service: `LabSync-Recovery-Sandbox`
   - Server UUID: `df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c`
   - Receives the restored logical backup archive.
   - When promoted, becomes the active database serving the deployed application.

---

## 6. Runtime Application Account (`labsync_app`) Configuration

Per LabSync security governance, the restoration account (`labsync_recovery`) is strictly restricted to DDL and insertion (`SELECT, INSERT, CREATE, DROP, ALTER, REFERENCES, LOCK TABLES`) and lacks `UPDATE` and `DELETE`.

The normal deployed application requires a separate, non-root runtime account: **`labsync_app`**.

### Database-Scoped Privileges for `labsync_app`:
Execute the following SQL in the **Data** tab or query console of `LabSync-Recovery-Sandbox`:

```sql
-- 1. Create dedicated application runtime user (isolated to recovery database)
CREATE USER IF NOT EXISTS 'labsync_app'@'%' IDENTIFIED BY '<STRONG_RUNTIME_PASSWORD>';

-- 2. Grant exact least-privilege runtime DDL & DML permissions required for normal LabSync operations
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON `railway`.* TO 'labsync_app'@'%';

-- 3. Apply privileges
FLUSH PRIVILEGES;

-- 4. Verify restricted privileges (must show strictly railway.* grants, zero global privileges)
SHOW GRANTS FOR 'labsync_app'@'%';
```

> [!IMPORTANT]
> **Strict Least-Privilege Rules for `labsync_app`:**
> - Grant privileges strictly on `railway.*` (database-scoped).
> - **8 Minimum Required Privileges**: `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES`.
> - **`DROP` is strictly excluded**: Zero application queries or migrations execute `DROP`. Omitting `DROP` prevents accidental schema destruction.
> - **`LOCK TABLES` is strictly excluded**: Application locking uses connection-level `GET_LOCK()` / `RELEASE_LOCK()`, which do not require `LOCK TABLES`.
> - Never grant global permissions (`ON *.*`).
> - Never grant `SUPER`, `FILE`, `GRANT OPTION`, `SHUTDOWN`, or `REPLICATION` privileges.
> - Never use `labsync_recovery` as the active application user.

---

## 7. Step-by-Step Blue-Green Recovery & Promotion Demonstration Script

Follow this 12-step sequence for the complete professor evaluation:

```
Step 1: Create Backup
   │
   ▼
Step 2: Download Archive (.sql.gz & .sha256)
   │
   ▼
Step 3: Delete Demonstration Room in Live Production
   │
   ▼
Step 4: Restore Earlier Archive into Online Recovery Sandbox
   │
   ▼
Step 5: Verify Recovery (Deleted Room Exists in Recovered Snapshot!)
   │
   ▼
Step 6: Provision `labsync_app` Account on Recovery Database
   │
   ▼
Step 7: Enable Maintenance Mode in LabSync UI (Freezes Writes)
   │
   ▼
Step 8: Update Railway Production Variables (DB_HOST, DB_USER, etc.)
   │
   ▼
Step 9: Application Redeploys with Connection to Green
   │
   ▼
Step 10: Verify Promoted Database is Active (UUID: df694bff...)
   │
   ▼
Step 11: Disable Maintenance Mode (or Maintain Read-Only Demo)
   │
   ▼
Step 12: Open Normal Room Management &rarr; Deleted Room Appears Again!
```

### Detailed Execution Steps:

#### Step 1: Create a Production Backup
1. Log in to the deployed LabSync website with your **IT Department Head** credentials.
2. Click your profile avatar (top-right) → **Account Settings** → **Backup & Recovery**.
3. Under **Database Backup Export**, click **Create Backup**.

#### Step 2: Download Archive & Integrity Companion
1. The browser downloads the compressed archive (e.g., `labsync_backup_2026-11-03_....sql.gz`).
2. Click **Download .sha256** to save the companion verification checksum.

#### Step 3: Delete a Demonstration Room in Live Production
1. In the sidebar, navigate to **Laboratories** (Room Management).
2. Note a target room (or create a dedicated room, e.g., `Room 301` or `Demo Lab`).
3. Click **Delete Room** and confirm the deletion.
4. Verify that the room is **no longer visible** in the normal Laboratory list.

#### Step 4: Restore Earlier Archive into Online Recovery Sandbox
1. Return to **Account Settings** → **Backup & Recovery**.
2. Scroll to the **Online Recovery Sandbox** section.
3. Select the `.sql.gz` archive and the companion `.sha256` file from Step 2.
4. Enter your IT Department Head administrator password.
5. Click **Restore into Online Sandbox** and confirm.
6. The system restores all tables into `LabSync-Recovery-Sandbox`.

#### Step 5: Verify Recovered Records & Compare
1. Review the **Recovery Verification & Snapshot Audit** panel:
   - Restored tables: Verified.
   - Record counts: Verified.
2. In the **Demonstration Proof: Verify Snapshot Isolation** tool, search for the room deleted in Step 3.
3. Notice that the room is **Present in the Recovery Sandbox** (because the backup was taken before it was deleted)!

#### Step 6: Verify Runtime Application Account
Ensure the `labsync_app` account has been created on `LabSync-Recovery-Sandbox` with the 8 least-privilege database privileges (`SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES`) as described in Section 6.

#### Step 7: Phase 1 — Pre-Arm Runtime Maintenance Mode & Deploy Environment Variable

> [!IMPORTANT]
> **Railway Deployment Overlap, Single Replica Assumption & Process-Local Toggle Rationale:**
> 1. **Process-Local State:** The runtime maintenance toggle (`isMaintenanceActive`) and the in-flight mutation counter (`activeMutationRequests`) are stored in-memory within the specific running Node.js process.
> 2. **Single Replica Requirement:** The pre-arming procedure assumes **strictly one Railway application replica**. Before initiating cutover, the administrator MUST navigate to **Railway Settings → Scale** on `Labsync-BULSU-Sarmiento-` and verify that `Replicas` is set to **1**. If multiple replicas are configured, do NOT proceed using only the process-local runtime toggle, as requests may land on unshielded instances; a shared state mechanism (such as Redis or centralized database flag) or another verified all-replica procedure would be required.
> 3. **Configurable Deployment Overlap:** Railway utilizes rolling container restarts. When an environment variable change is deployed, Railway keeps the **previous deployment active** and serving live traffic while the **new deployment builds, initializes, and enters service**. Overlap duration and request draining behavior depend on Railway plan settings, container build times, restart policies, and healthcheck configurations—it must NEVER be assumed to have a fixed duration (such as 30 or 90 seconds).
> 4. **Do Not Assume Healthchecks:** Do not assume a deployment healthcheck is pre-configured; the administrator must inspect actual service settings under Railway **Deployments → Healthcheck**.
> 5. **Overlap Elimination via Pre-Arming:** Pre-arming runtime maintenance on the single running instance freezes all ordinary mutating requests (`HTTP 503`) and pauses background jobs *before* the Railway environment deployment is launched, ensuring zero data divergence regardless of how long the container overlap lasts.

##### The 10-Step Definitive Blue-Green Cutover Sequence:
1. **Activate Runtime Maintenance Mode**: Log in as IT Department Head and enable maintenance mode via the Backup modal toggle (or `POST /api/admin/backups/maintenance-mode` with `{"enabled": true}`). Ordinary mutating requests return `HTTP 503`.
2. **Verify Cutover Drained State**: Query `GET /api/admin/backups/maintenance-mode` and verify `cutoverDrained === true`:
   - `mutationRequestsDrained === true` (`activeMutationRequests === 0`: all in-flight ordinary mutating requests admitted before maintenance have completely settled on the server).
   - `backgroundJobsDrained === true` (`retentionJobRunning === false` and `keyReminderJobRunning === false`: both background workers are confirmed idle).
   *(CRITICAL: A client socket disconnect (`close`) does NOT automatically decrement or clear an operation while an underlying database write is still executing. The operation remains tracked as in-flight until server-side completion (`res.end`). `cutoverDrained` strictly remains `false` until all server-side operations settle).*
   *(Permitted exempt administrative writes during maintenance: `POST /api/admin/backups/create` for point-in-time snapshot, `POST /api/admin/backups/recovery/restore` targeting only the isolated recovery database, cutover audit logs, and admin auth session endpoints).*
3. **Create Final Production Backup**: Trigger `POST /api/admin/backups/create` to capture an untainted point-in-time snapshot of the frozen Blue database while ordinary mutations remain locked.
4. **Verify Archive & SHA-256 Checksum**: Verify archive integrity against the companion `.sha256` checksum digest.
5. **Restore Only into GREEN**: Upload and restore the verified backup strictly into the isolated Online Recovery Sandbox (`LabSync-Recovery-Sandbox`). Production restore remains permanently blocked.
6. **Verify Recovered Database**: Verify restored table count, record counts, and schema elements via `GET /api/admin/backups/recovery/status` and `promotion-status`.
7. **Deploy GREEN Connection with Environment-Driven Maintenance Active**: In Railway Variables for `Labsync-BULSU-Sarmiento-`, update database references to Green while maintaining `MAINTENANCE_MODE=true`:
   ```env
   DB_HOST=${{LabSync-Recovery-Sandbox.MYSQLHOST}}
   DB_PORT=${{LabSync-Recovery-Sandbox.MYSQLPORT}}
   DB_USER=labsync_app
   DB_PASSWORD=<YOUR_LABSYNC_APP_PASSWORD>
   DB_NAME=${{LabSync-Recovery-Sandbox.MYSQLDATABASE}}
   PROD_SERVER_UUID=df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c
   MAINTENANCE_MODE=true
   ```
   Click **Deploy**. The new container initializes directly into environment-enforced maintenance mode.
8. **Verify Active Database UUID**: After deployment is active and the previous container is removed, query `GET /api/admin/backups/recovery/promotion-status` or `/api/health/db` to verify that the active database UUID is `df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c` (Green).
9. **Verify Normal Application Functions**: Inspect Room Management, PC inventory, and schedules to confirm restored records appear cleanly in normal views.
10. **Resume Ordinary Operations Only After Verification**: In Railway Variables, set `MAINTENANCE_MODE=false` (or remove the variable) and deploy to resume normal read-write operations.

> [!NOTE]
> **Session State Lifecycle Across Container Redeployment:**
> LabSync uses Express in-memory session storage (`MemoryStore`). While user sessions remain active within the same running process during runtime maintenance mode, redeploying a container resets the in-memory session map. Users will be required to log in again after a Railway deployment. User accounts, bcrypt password hashes, and permissions stored in the MySQL database remain 100% intact and available independently of browser sessions.

> [!CRITICAL]
> **Two-Phase Deployment Requirement:**
> Do NOT change database variables and enable maintenance mode in the same deployment. Enforce and verify maintenance mode first (Phase 1) before altering database connection strings (Phase 2).

#### Step 8: Phase 2 — Update Railway Database Variables to Green & Redeploy
1. With Maintenance Mode confirmed active, return to **Variables** in **`Labsync-BULSU-Sarmiento-`**.
2. Update the production database variables and server identity pinning to reference Green:
   ```env
   DB_HOST=${{LabSync-Recovery-Sandbox.MYSQLHOST}}
   DB_PORT=${{LabSync-Recovery-Sandbox.MYSQLPORT}}
   DB_USER=labsync_app
   DB_PASSWORD=<YOUR_LABSYNC_APP_PASSWORD>
   DB_NAME=${{LabSync-Recovery-Sandbox.MYSQLDATABASE}}
   PROD_SERVER_UUID=df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c
   MAINTENANCE_MODE=true
   ```
   *(Note: `MAINTENANCE_MODE=true` remains configured so the new container starts in shielded cutover mode).*
3. Review staged changes and click **Deploy**.

#### Step 9: Application Rolling Redeployment
Railway starts a new application container connected to `LabSync-Recovery-Sandbox`. The original production database (Blue) remains 100% untouched.

#### Step 10: Verify the Recovered Database is Active
1. Once deployed, open `/api/health/db`: returns `{"status":"ok","database":"connected"}`.
2. In **Account Settings** → **Backup & Recovery**, click **Verify Promotion Readiness**:
   - Active Database UUID now displays: `df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c` (Green).
   - Confirms that the deployed application is running from the recovered database!

#### Step 11: Phase 3 — Manage Cutover Mode & Resuming Normal Operations
- For a **Read-Only Defense Demonstration**, maintain Maintenance Mode active so no accidental writes occur while presenting.
- **To Safely Resume Normal Operations After Evaluation**:
  1. In Railway &rarr; `Labsync-BULSU-Sarmiento-` &rarr; **Variables**, set `MAINTENANCE_MODE=false` (or remove the variable).
  2. Click **Deploy** to restart the container in normal read-write mode.
  3. Confirm via `GET /api/admin/backups/maintenance-mode` that `maintenanceMode: false` and `source: 'none'`.
  > [!NOTE]
  > When maintenance mode is driven by the Railway environment variable (`MAINTENANCE_MODE=true`), the UI modal toggle cannot override it. Disabling maintenance mode requires setting `MAINTENANCE_MODE=false` in Railway and redeploying.

#### Step 12: Confirm the Deleted Room Appears in Normal Room Management!
1. Navigate to **Laboratories** (Room Management) in the normal deployed application.
2. **Show the Professor**:
   - The previously deleted room (e.g., `Room 301`) is **now visible again** in normal room views!
   - All schedules, user accounts, and inventory items from that point in time are restored.
   - The original production database (Blue) was never overwritten or rolled back.

---

## 8. Rollback Limitations and Safe Procedures

Understanding the rollback window and data persistence model is essential for operational safety:

> [!WARNING]
> **Rollback Limitations: Blue is an Untouched Previous-State Database, Not an Auto-Synchronized Replica.**
> - Blue does **not** receive writes made to Green after promotion.
> - Once Green is promoted and accepts new records, switching back to Blue is **lossy** with respect to post-promotion data.
> - Blue is **not** an immutable replica; it is an untouched point-in-time snapshot that remains safe only because no processes are writing to it.

### Scenario 1: Rollback Before New Writes (100% Lossless)
- If the administrator promotes Green and discovers an issue **before new data is written to Green** (e.g. during a read-only evaluation period with Maintenance Mode active):
- **Procedure**: Change Railway variables back to Blue:
  ```env
  DB_HOST=${{MySQL.MYSQLHOST}}
  DB_PORT=${{MySQL.MYSQLPORT}}
  DB_USER=${{MySQL.MYSQLUSER}}
  DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
  DB_NAME=${{MySQL.MYSQLDATABASE}}
  PROD_SERVER_UUID=fb252566-c303-11f1-9553-a2aa08ba6a31
  ```
- **Outcome**: 100% lossless rollback. Blue was never modified.

### Scenario 2: Rollback After New Writes (Lossy / Stale State)
- Once Green is active and users create new attendance logs, student reports, or schedule updates on Green, those new writes exist **only in Green**.
- Blue does **not** automatically synchronize with Green (they are physically independent MySQL containers).
- Switching back to Blue after new writes will discard any data created on Green between promotion and rollback.
- **Precaution**: Before attempting any subsequent rollback, generate an export of Green first so that all post-promotion records are preserved.

### State Persistence Note (Audit 3)
Railway web application containers have ephemeral filesystems with no persistent volume attached. Local files like `data/recovery_state.json` reset across container restarts. All authoritative state—including database identity (`@@server_uuid`), table schemas, record counts, and audit logs—is derived dynamically from live database queries and persisted in MySQL's `audit_logs` table.

### Cross-Version Verification Note (Audit 5)
While standard InnoDB data types and utf8mb4 collations between MySQL 9.7.4 and MySQL 8.4.13 are compatible, cross-version restoration must be empirically validated on the live `LabSync-Recovery-Sandbox` instance before executing live production promotion.

---

## 9. Data Privacy, Retention, and Cleanup

1. **Restricted Access**: The Online Recovery Sandbox is not exposed to the public; only the backend communicates with it using dedicated server-side environment variables.
2. **Audit Logging**: Every recovery attempt (success or failure) is permanently recorded in `audit_logs` with the actor's email, timestamp, and target database.
3. **Data Retention**: Restored demonstration data remains in the recovery sandbox until overwritten by a subsequent recovery or cleared.
4. **Safe Administrative Cleanup**:
   To completely clear data in the recovery sandbox after a demonstration, administrators can either:
   - Run a recovery with an empty test fixture schema.
   - Or drop tables inside the recovery sandbox via Railway CLI / dashboard without affecting production.
5. **Temporary File Hygiene**: Ephemeral uploaded archives under `/tmp/labsync-online-recovery-*` are unlinked and destroyed synchronously in a `finally` block immediately after import.

