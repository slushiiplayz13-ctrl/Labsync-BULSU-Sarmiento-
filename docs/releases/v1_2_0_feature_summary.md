# LabSync Version 1.2.0 – Feature & Function Summary

> **Release Version:** 1.2.0  
> **Release Date:** September 2026  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Target Environment:** Department of Information Technology Computer Laboratories  

---

## 🌟 Executive Release Summary

LabSync Version 1.2.0 introduces major architectural enhancements focused on physical key lifecycle auditing, hallway peer-to-peer room handoffs, relational maintenance fault deduplication, enterprise cryptographic hardening, and immutable security audit trails.

---

## 🚀 Key Feature Additions & Upgrades in Version 1.2.0

### 1. Physical Key Inventory Management (`mis-keys.html`)
- **Key Code Registry**: First-class tracking of room keys (`KEY-IT-203-A`) in the `laboratory_keys` database table.
- **Key Status Lifecycle**: MIS staff can toggle physical keys between `ACTIVE` and `MISSING`, locking missing keys from checkout or transfer.
- **Calibrated Keychain Tag Studio**: Formats printable front-and-back pairs to exact acrylic photo keychain insert dimensions (**1.14 in x 1.84 in**) with high-contrast cyan QR codes (`#0EA5C9`) and room identification badges.

### 2. Mobile Key Transfer & Room Claim Protocol (`key-transfer.html`)
- **Hallway Handoff**: Incoming professors scan physical key fob QR tags with their smartphones, claiming immediate room custody without returning keys to the department dock.
- **Atomic Custody Transfer**: Updates `laboratories.Current_User_ID`, appends an entry to `occupancy_log` (`KEY_TRANSFER`), and emits a security audit record.
- **Strict Role Boundaries**: Enforces `KEY_TRANSFER_ROLES` (Faculty and IT Head); MIS custodians and public users are strictly blocked from claiming teaching keys.

### 3. Relational Fault Deduplication Pipeline (`maintenance_issues`)
- **Concurrency-Safe Locking**: `POST /api/reports/submit` acquires row locks (`SELECT FOR UPDATE`) within transactions, routing subsequent student reports for the same failing component into an existing open `Maintenance_Issue_ID`.
- **Unique Virtual Stored Hash**: `Active_Issue_Key = IF(Status != 'Resolved', CONCAT(PC_ID, ':', Issue_Type), NULL)` guarantees zero duplicate ticket bloat.
- **Multi-Reporter UI Chips**: Renders `.reporter-chip` with person badge and `[+N]` count indicator (e.g. `👤 John [+2] ›`), linking to a modal detailing every student submission.
- **Automatic PC Condition Synchronization**: Auto-restores `lab_units.Condition_Status` to `Functional` once all active component issues for that workstation are resolved.

### 4. Enterprise Cryptography & Rate Limiting Defense
- **Bcrypt Password Storage**: Upgraded to `bcrypt` with **12 salt rounds** (`BCRYPT_SALT_ROUNDS = 12`) across user authentication and password change flows.
- **Multi-Tier Rate Limiting Suite (`middleware/rateLimiter.js`)**:
  - `loginLimiter`: 10 attempts / 15 minutes per IP.
  - `passwordRecoveryLimiter`: 5 attempts / 15 minutes per IP.
  - `passwordResetLimiter`: 10 attempts / 15 minutes per IP.
  - `validateResetTokenLimiter`: 20 attempts / 15 minutes per IP.
  - `publicPCReportLimiter`: 5 reports / 10 minutes per IP.
  - `pcDuplicateReportLimiter`: 1 report / 1 minute per IP + PC.

### 5. Centralized Security Audit Logging (`services/auditService.js`)
- Non-blocking audit logger recording all high-value authentication, credential, key transfer, and administrative mutations into the `audit_logs` table.
- Recursive parameter sanitization stripping 16+ forbidden credential keys (`password`, `token`, `reset_token`, etc.).

---

## 🗄️ Database Schema Updates (Migrations 010–014)

- **`010_create_iot_devices.sql`**: Registered ESP32 hardware docks and device credentials.
- **`011_create_audit_logs.sql`**: Security audit logging entity.
- **`012_create_key_management_tables.sql`**: `laboratory_keys` and `key_found_reports` tables.
- **`013_create_maintenance_issues.sql`**: `maintenance_issues` table with stored virtual deduplication index and historical backfill.
- **`014_add_user_updated_at.sql`**: Profile update timestamp column on `users`.

---
*Release notes maintained for Bulacan State University – Sarmiento Campus.*
