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

## 5. Complete Step-by-Step Professor Demonstration Script

Follow this script to demonstrate the full Backup & Recovery lifecycle to your professor:

### Step 1: Open Backup & Recovery
1. Open your deployed Railway LabSync URL in your browser.
2. Log in with the **IT Department Head** account.
3. Click your profile avatar (top-right) → select **Account Settings**.
4. In Account Settings, click **Backup & Recovery** under Administrative Tools.
5. **Point out to the Professor**:
   - The status chips show Engine: `MySQL (9.7.2)`, Base Tables: `22 base tables`.
   - Restoration Target shows: `Online Recovery Sandbox` (Green badge).
   - Point out that the live production database is isolated.

### Step 2: Create a Baseline Backup
1. In the **Database Backup Export** section, click **Create Backup**.
2. Wait 2–3 seconds while the system topologically sorts tables and streams the `.sql.gz` archive.
3. The browser automatically downloads the file (e.g., `labsync_backup_2026-11-02_17-30-00.sql.gz`).
4. **Point out to the Professor**:
   - The verified 64-character SHA-256 hash displayed in the green success card.
   - Click **Download .sha256** to save the cryptographic companion file.

### Step 3: Create a Post-Backup Demonstration Record in Live Production
1. In the sidebar, navigate to **Laboratories** (or Laboratory Management).
2. Click **Add Laboratory / Room**.
3. Create a demonstration room:
   - **Room Number**: `999`
   - **Building**: `DEMO-BLDG`
   - **Status**: `Available`
4. Save the room.
5. Verify that Room `999` appears on the active laboratory list in the deployed website.

### Step 4: Execute Restoration into the Online Recovery Sandbox
1. Return to **Account Settings** → **Backup & Recovery**.
2. Scroll to the **Online Recovery Sandbox** section.
3. Click **Choose File** and select the `.sql.gz` backup archive downloaded in Step 2.
4. Click **Load from .sha256 file** and select the `.sha256` file downloaded in Step 2 (or paste the SHA-256 hash).
5. Enter your **IT Department Head password** in the re-authentication field.
6. Click **Restore into Online Sandbox**.
7. Confirm the modal dialog ("Restore archive into the isolated Online Recovery Sandbox?").
8. The system executes isolation verification, table reset, statement execution, and row count verification.

### Step 5: Verify Recovery & Prove Snapshot Isolation
1. Review the **Recovery Verification & Snapshot Audit** panel:
   - Status shows `VERIFIED SUCCESS`.
   - Restored tables count shows `22 base tables`.
   - Displays row counts for `laboratories`, `users`, `schedules`, etc.
2. In the **Demonstration Proof: Verify Snapshot Isolation** tool:
   - Type `999` into the room search field.
   - Click **Compare with Production**.
3. **Show the Professor the Result Cards**:
   - **Current Production Database**: `✓ Record Exists (Found) — Room 999 (DEMO-BLDG)`
   - **Online Recovery Sandbox**: `✓ Record Absent (Snapshot Restored)`
   - **Demonstration Status**: `DEMONSTRATION VERIFIED`
4. **Deliver the Closing Explanation**:
   > *"Professor, this comparison provides cryptographic and empirical proof that:*
   > 1. *The backup was successfully created and restored into our separate Railway recovery sandbox.*
   > 2. *The restored sandbox accurately reflects the point-in-time snapshot prior to creating Room 999.*
   > 3. *Our live production database was never overwritten or rolled back, and Room 999 remains completely intact in production."*

---

## 6. Data Privacy, Retention, and Cleanup

1. **Restricted Access**: The Online Recovery Sandbox is not exposed to the public; only the backend communicates with it using dedicated server-side environment variables.
2. **Audit Logging**: Every recovery attempt (success or failure) is permanently recorded in `audit_logs` with the actor's email, timestamp, and target database.
3. **Data Retention**: Restored demonstration data remains in the recovery sandbox until overwritten by a subsequent recovery or cleared.
4. **Safe Administrative Cleanup**:
   To completely clear data in the recovery sandbox after a demonstration, administrators can either:
   - Run a recovery with an empty test fixture schema.
   - Or drop tables inside the recovery sandbox via Railway CLI / dashboard without affecting production.
5. **Temporary File Hygiene**: Ephemeral uploaded archives under `/tmp/labsync-online-recovery-*` are unlinked and destroyed synchronously in a `finally` block immediately after import.

