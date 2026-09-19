# LabSync Capstone Manuscript — Change Log (Chapters 1–3)

> **Target Document:** `docs/Chapter-1-3-UPDATED-DRAFT.docx`  
> **Original Approved Baseline:** `docs/Chapter-1-3-APPROVED-BASELINE.docx` (Read-Only, 100% Preserved)  
> **Audit Status:** Rigorously audited and verified against active LabSync source code, SQL migrations, and ESP32 firmware.  
> **Highlight Standard:** All additions, modifications, and replacements in the updated draft are visually highlighted using Word-native yellow text highlighting (`w:highlight="yellow"`).

---

## Summary of Audit Findings

| Classification | Count | Description |
| :--- | :---: | :--- |
| **MUST UPDATE** | 9 | Factually inaccurate, conflicting, or obsolete technical descriptions requiring mandatory correction (e.g., PHP references, obsolete reed switch/LED pin mapping, analog ADC sensing mode). |
| **SHOULD UPDATE** | 26 | Verified current system capabilities added or modified since baseline approval (e.g., Maintenance Issue Deduplication behavior, Resolver Attribution, MIS OJT Intern Management, Hallway Key Transfer Protocol, Audit Logging, Activity Log Retention). |
| **OPTIONAL** | 0 | Purely stylistic alterations were strictly avoided to preserve adviser-approved academic integrity. |
| **TOTAL CHANGES** | **35** | Fully documented below. |

---

## Verification Constraints and Implementation Realities

1. **Maintenance Deduplication (Behavioral Implementation):**
   - The system prevents duplicate active maintenance issues through transactional repository logic in `repositories/maintenance.repository.js` (`findActiveIssueByPCAndType`).
   - The active query checks: `WHERE PC_ID = ? AND Issue_Type = ? AND Status != 'Resolved'`.
   - When a matching unresolved issue exists, incoming student reports are associated with that issue (`Maintenance_Issue_ID`), and priority is escalated if needed.
   - Manuscript descriptions reflect this verified runtime behavior rather than inventing an application-level database column.

2. **Chapter 2 Literature & Systems Audit:**
   - **Verification Finding:** *No Chapter 2 changes were identified as necessary from the current-system implementation audit.*
   - All citations (Ye et al., Arunkumar et al., Mallari et al., Taruc & De La Cruz, Jadhav et al., Rabiah et al., Sağıt et al., Teves, El-Haggar et al., Kunjiapu et al.), Related Systems, and Table 1 comparison remain intact and untouched.

3. **Key Transfer & Scanning Protocol:**
   - Physical laboratory keys feature acrylic keychain tags with QR codes linking to `/key-transfer.html?key=KEY_CODE`.
   - `key-found.html` is an alias that immediately redirects to `key-transfer.html`.
   - **QR-Based Key Transfer & Custody Workflow Requiring Authenticated Authorized Personnel:** When a physical key QR code is scanned, the page calls `GET /api/keys/transfer-info/:keyCode`. An unauthenticated request receives a `401 Unauthorized` response, prompting the UI to display an authentication requirement notice and redirect the user to login. Only authenticated, authorized personnel (Faculty or IT Department Head via `KEY_TRANSFER_ROLES`) can proceed with the key custody transfer.
   - An earlier draft proposal for a standalone unauthenticated "lost key reporting form with location details" (proposed as FR-10) was **removed** because it was not supported by the codebase. Key custody handoffs are governed strictly by the authenticated unified transfer workflow.

4. **OJT Permissions & Authorization Boundaries:**
   - **Allowed Actions:**
     - Access MIS Staff Dashboard (`mis-staff-dashboard.html`)
     - View and search workstation maintenance issues (`mis-maintenance.html`)
     - Update maintenance issue status (`Pending`, `In Progress`, `Resolved`) via `PUT /api/maintenance/:reportId/status` (`TICKET_UPDATE_ROLES = [...ADMIN_ROLES, 'OJT']`), recording resolver attribution.
   - **Forbidden / Restricted Actions:**
     - Cannot delete maintenance reports (`DELETE /api/maintenance/:reportId` is restricted to `ADMIN_ROLES`).
     - Cannot register keys, edit keys, or generate key tags (`routes/keys.routes.js` is restricted to `MIS_STAFF_ROLES`).
     - Cannot claim or transfer laboratory keys (`routes/keys.routes.js: /transfer` is restricted to `KEY_TRANSFER_ROLES = ['Faculty', ...IT_HEAD_ROLES]`).
     - Cannot add/delete PCs or batch generate PC QR codes (`routes/labs.routes.js` and `routes/pcs.routes.js` are restricted to `MIS_STAFF_ROLES`).
     - Cannot provision OJT accounts, toggle account statuses, or reset passwords (`routes/ojt.routes.js` is restricted to `MIS_STAFF_ROLES`).
     - Cannot edit academic timetables (`routes/schedules.routes.js` is restricted to `IT_HEAD_ROLES`).
   - **Lifecycle Enforcement:** In `middleware/auth.js`, active sessions are terminated immediately with 401 `OJT_EXPIRED` if current date exceeds `OJT_End_Date`, or `ACCOUNT_DEACTIVATED` if `Status === 'DEACTIVATED'`.

5. **Resolver Attribution (Database Schema):**
   - The database schema in `database/migrations/017_add_maintenance_issue_resolver.sql` stores:
     - `Resolved_By_User_ID` (INT NULL in `maintenance_issues`, foreign key to `users(User_ID)`)
     - `Resolved_At` (DATETIME NULL in `maintenance_issues`)
   - Resolver Name and Role are retrieved by joining `maintenance_issues` with `users` (`u.Name as Resolver_Name`, `u.Role as Resolver_Role`).
   - No separate `Resolution_Remarks` database column exists in `maintenance_issues`.

6. **Retention Policy Scope:**
   - The retention coordinator in `services/activityRetentionService.js` strictly manages `occupancy_log` (Room Status Activity Logs).
   - Records older than one calendar year are deleted using indexed `Access_Time`.
   - The service runs asynchronously on server startup and daily via a 24-hour recurring timer.
   - It does **not** delete records from `audit_logs`, which remain persistent.

7. **Password Security & Authentication:**
   - Password encryption uses `bcrypt` with 12 salt rounds for account creation, profile updates, and password resets (`services/authService.js`).
   - The login function preserves an on-the-fly legacy migration path: existing accounts with plaintext passwords from earlier prototypes are verified and immediately upgraded to a cost-12 bcrypt hash upon successful authentication.
   - Session inactivity is enforced at 15 minutes (`INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000`) in `middleware/auth.js`.

8. **Hardware Firmware & Pin Configuration:**
   - Active pin assignments and peripheral interfaces are defined directly in `LabSync_ESP32.ino`:
     - Key Sensing: `KEY_PIN_203 32`, `KEY_PIN_204 33` (ADC analog resistor-divider inputs)
     - Barcode/QR Scanner: `GM65_RX_PIN 17`, `GM65_TX_PIN 16` (Hardware Serial2)
     - Character LCD: `I2C_SDA_PIN 21`, `I2C_SCL_PIN 22` with `LiquidCrystal_I2C lcd(0x27, 16, 2);` (**16×2 I2C LCD**)
     - Audio Alarm: `BUZZER_PIN 25` (Active-low buzzer output)

9. **Backend Database Connection Architecture:**
   - The Node.js / Express backend connects to MariaDB/MySQL via the centralized connection pool module `database/connection.js` (`server.js` imports `pool = require('./database/connection')`).

---

## Detailed Itemized Change Log

### CHAPTER 1 — INTRODUCTION

#### 1. Introduction / System Overview
- **Chapter:** Chapter 1
- **Section / Topic:** Introduction — System Overview & Tailored Dashboards
- **Table / Figure:** Paragraph 42 (P42)
- **Original Content:**
  > "Through web dashboards tailored for the IT Department Head, Faculty, and MIS Staff, the system provides real-time room availability, a drag-and-drop schedule builder that prevents booking conflicts, and a centralized maintenance tracker. By bringing together IoT key tracking, mobile QR transfers, and digital fault reporting into one platform, LabSync removes paper logbooks, speeds up computer repairs, and makes lab management much more organized for the IT Department of Bulacan State University – Sarmiento Campus."
- **Updated Content:**
  > "Through web dashboards tailored for the IT Department Head, Faculty, and MIS Staff **(assisted by supervised On-the-Job Training interns)**, the system provides real-time room availability, a drag-and-drop schedule builder that prevents booking conflicts, **a deduplicated maintenance tracker with resolver accountability, and centralized physical key management**. By bringing together IoT key tracking, mobile QR transfers, and digital fault reporting into one platform, LabSync removes paper logbooks, speeds up computer repairs, and makes lab management much more organized for the IT Department of Bulacan State University – Sarmiento Campus."
- **Reason for Change:** The active system incorporates On-the-Job Training (OJT) interns working under MIS Staff supervision, implements maintenance issue deduplication to prevent duplicate work orders, and features dedicated physical key lifecycle management.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE` & `MISSING DOCUMENTATION`
- **Evidence from Current System:** `middleware/auth.js` (`OJT_ROLES`, `TICKET_UPDATE_ROLES`), `database/migrations/013_create_maintenance_issues.sql`, `database/migrations/017_add_maintenance_issue_resolver.sql`.
- **Repository File Path:** `middleware/auth.js`, `services/maintenanceService.js`
- **Relevant Reference:** `OJT_ROLES = ['OJT']`, `TICKET_UPDATE_ROLES = [...ADMIN_ROLES, 'OJT']`.

---

#### 2. Background of the Study — Maintenance Ticketing Pipeline
- **Chapter:** Chapter 1
- **Section / Topic:** Background of the Study — Workstation Reporting Pipeline
- **Table / Figure:** Paragraph 53 (P53)
- **Original Content:**
  > "...affixed to each desktop computer, enabling students to submit individual fault reports directly from their mobile devices without account registration, providing MIS technicians with a clear, direct log of distinct issues."
- **Updated Content:**
  > "...affixed to each desktop computer, enabling students to submit individual fault reports directly from their mobile devices without account registration. **The system prevents duplicate active maintenance issues by checking whether an unresolved issue already exists for the same computer and issue type. Additional reports may be associated with the existing active issue, providing MIS technicians and student interns with an organized queue of distinct, actionable issues with attributed resolver tracking upon repair.**"
- **Reason for Change:** Accurately describes runtime deduplication behavior: checking whether an unresolved issue already exists for that computer and issue type before creating a new ticket.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `repositories/maintenance.repository.js` (`findActiveIssueByPCAndType`), `services/maintenanceService.js` (`submitReport`).
- **Repository File Path:** `services/maintenanceService.js`, `repositories/maintenance.repository.js`
- **Relevant Reference:** `SELECT Issue_ID, Priority_Level, Status FROM maintenance_issues WHERE PC_ID = ? AND Issue_Type = ? AND Status != 'Resolved'`.

---

#### 3. Objectives of the Study — General Objective
- **Chapter:** Chapter 1
- **Section / Topic:** Objectives of the Study — General Objective
- **Table / Figure:** Paragraph 68 (P68)
- **Original Content:**
  > "To design, develop, and evaluate LabSync: An IoT-Based IT Laboratory Availability and Equipment Monitoring System Using QR Codes for Bulacan State University – Sarmiento Campus that integrates physical key tracking, mobile QR key custody transfers, individual workstation fault ticketing, MIS maintenance tracking, conflict-free academic scheduling, and enterprise security auditing."
- **Updated Content:**
  > "To design, develop, and evaluate LabSync: An IoT-Based IT Laboratory Availability and Equipment Monitoring System Using QR Codes for Bulacan State University – Sarmiento Campus that integrates physical key tracking, mobile QR key custody transfers, **deduplicated workstation fault ticketing with resolver attribution, MIS maintenance and OJT intern management**, conflict-free academic scheduling, and **administrative security auditing**."
- **Reason for Change:** Aligns research objectives with implemented features: deduplication, resolver attribution, OJT intern management, and administrative auditing.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `services/maintenanceService.js`, `services/ojtService.js`, `services/auditService.js`.
- **Repository File Path:** `services/maintenanceService.js`, `services/ojtService.js`
- **Relevant Reference:** `updateMaintenanceIssueStatus`, `createOjt`, `logSecurityEvent`.

---

#### 4. Objectives of the Study — Specific Objective 2
- **Chapter:** Chapter 1
- **Section / Topic:** Objectives of the Study — Specific Objective 2
- **Table / Figure:** Paragraph 74 (P74)
- **Original Content:**
  > "...mobile QR key custody handoffs for faculty, provides zero-login computer fault reporting with individual ticketing for MIS staff, and incorporates a drag-and-drop schedule management studio with real-time visual collision detection."
- **Updated Content:**
  > "...mobile QR key custody handoffs for faculty, provides zero-login computer fault reporting with **automated issue deduplication and resolver attribution for MIS staff and supervised OJT interns**, and incorporates a drag-and-drop schedule management studio with real-time visual collision detection."
- **Reason for Change:** Accurately reflects maintenance ticket aggregation and intern resolution permissions under MIS supervision.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `middleware/auth.js` (`TICKET_UPDATE_ROLES`), `services/maintenanceService.js` (`updateReportStatus`).
- **Repository File Path:** `services/maintenanceService.js`, `middleware/auth.js`
- **Relevant Reference:** `TICKET_UPDATE_ROLES = [...ADMIN_ROLES, 'OJT']`.

---

#### 5. Significance of the Study — MIS Staff & Technical Custodians
- **Chapter:** Chapter 1
- **Section / Topic:** Significance of the Study — Beneficiaries: MIS Staff / Technical Custodians
- **Table / Figure:** Paragraph 89 (P89)
- **Original Content:**
  > "MIS Staff / Technical Custodians. Centralizing maintenance tickets into a single online queue eliminates delays caused by handwritten notes and manual spreadsheet encoding. The system registers individual fault tickets for each student report, allowing technicians to inspect detailed remarks, track unique diagnostic histories, repair defects faster, and monitor physical laboratory key custody."
- **Updated Content:**
  > "MIS Staff / Technical Custodians. Centralizing maintenance tickets into a single online queue eliminates delays caused by handwritten notes and manual spreadsheet encoding. **The system automatically associates concurrent student fault reports with existing active issues, provides a dedicated interface to manage and supervise On-the-Job Training (OJT) interns, tracks technician resolver attribution upon issue resolution**, repairs defects faster, and monitors physical laboratory key custody."
- **Reason for Change:** Articulates the institutional benefits of the OJT management module and resolver accountability for laboratory custodians.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `mis-ojt.html`, `services/ojtService.js`, `database/migrations/016_add_user_lifecycle_fields.sql`, `database/migrations/017_add_maintenance_issue_resolver.sql`.
- **Repository File Path:** `services/ojtService.js`, `services/maintenanceService.js`
- **Relevant Reference:** `listOjts`, `createOjt`, `Resolved_By_User_ID`.

---

#### 6. Scope and Delimitations — Equipment Maintenance
- **Chapter:** Chapter 1
- **Section / Topic:** Scope and Delimitations — Scope: Hardware Fault Ticketing
- **Table / Figure:** Paragraph 102 (P102)
- **Original Content:**
  > "reports across monitors, keyboards, mice, and system units without requiring account registration or login credentials. Each submission is logged as an independent, individual ticket within the centralized maintenance module, enabling MIS technicians to review specific user remarks, inspect precise timestamps, trace recurring equipment fault patterns per computer unit, and update diagnostic statuses accurately."
- **Updated Content:**
  > "reports across monitors, keyboards, mice, and system units without requiring account registration or login credentials. **The system prevents duplicate active maintenance issues by verifying whether an unresolved issue already exists for the same computer and issue type before creating a new ticket. Additional reports are associated with the existing active issue, enabling MIS technicians and supervised OJT interns to review user remarks, inspect timestamps, update diagnostic statuses, and record authenticated resolver attribution upon resolution.**"
- **Reason for Change:** Accurately documents the behavioral mechanism of maintenance issue deduplication and resolver accountability.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `repositories/maintenance.repository.js`, `services/maintenanceService.js`, `database/migrations/017_add_maintenance_issue_resolver.sql`.
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `findActiveIssueByPCAndType`, `insertStudentReport`.

---

#### 7. Scope and Delimitations — Portal Roles & Subsystems
- **Chapter:** Chapter 1
- **Section / Topic:** Scope and Delimitations — Scope: Web Portal User Roles
- **Table / Figure:** Paragraph 103 (P103)
- **Original Content:**
  > "...Faculty Members view live laboratory availability, monitor reported equipment defects in their assigned teaching rooms, and execute peer-to-peer key handoffs; and MIS Staff track incoming individual repair tickets, log diagnostic resolutions, and maintain an audit log of physical key custody."
- **Updated Content:**
  > "...Faculty Members view live laboratory availability, monitor reported equipment defects in their assigned teaching rooms, and execute peer-to-peer key handoffs; **MIS Staff manage laboratory keys, generate workstation QR codes, supervise student interns, track deduplicated repair tickets, and audit key custody; and supervised OJT Interns access filtered maintenance queues to inspect hardware defects, update repair progress, and record resolutions under their authenticated identity.**"
- **Reason for Change:** Adds the supervised OJT Intern role to the system scope and distinguishes permanent MIS administrative functions from intern repair duties.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE` & `MODIFIED FEATURE`
- **Evidence from Current System:** `middleware/auth.js`, `routes/ojt.routes.js`, `routes/keys.routes.js`.
- **Repository File Path:** `middleware/auth.js`, `js/pages/mis-ojt.js`
- **Relevant Reference:** `MIS_STAFF_ROLES`, `OJT_ROLES`, `TICKET_UPDATE_ROLES`.

---

#### 8. Definition of Terms — Audit Logging
- **Chapter:** Chapter 1
- **Section / Topic:** Definition of Terms — Audit Logging (New Entry)
- **Table / Figure:** Inserted after Paragraph 120 (P120)
- **Original Content:** *Not present in approved baseline.*
- **Updated Content:**
  > "**Audit Logging.** An administrative accountability mechanism that persistently records user authentication, administrative modifications, key status updates, and security events in the database with sensitive-data sanitization."
- **Reason for Change:** Defines the administrative audit trail subsystem established in migration 011 and active across controllers.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE`
- **Evidence from Current System:** `database/migrations/011_create_audit_logs.sql`, `services/auditService.js`.
- **Repository File Path:** `services/auditService.js`, `repositories/audit.repository.js`
- **Relevant Reference:** `logSecurityEvent()`, `audit_logs` table.

---

#### 9. Definition of Terms — Maintenance Issue Deduplication
- **Chapter:** Chapter 1
- **Section / Topic:** Definition of Terms — Maintenance Issue Deduplication (New Entry)
- **Table / Figure:** Inserted after Key Custody Transfer (P132) to maintain strict alphabetical sequence (K -> M -> O -> P)
- **Original Content:** *Not present in approved baseline.*
- **Updated Content:**
  > "**Maintenance Issue Deduplication.** An algorithmic database process wherein the system checks whether an unresolved issue already exists for the same computer and issue type before creating a new record, associating additional student reports with the active issue to prevent duplicate work orders."
- **Reason for Change:** Accurately defines the behavioral deduplication check based on `PC_ID`, `Issue_Type`, and unresolved status.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE`
- **Evidence from Current System:** `repositories/maintenance.repository.js` (`findActiveIssueByPCAndType`), `services/maintenanceService.js`.
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `findActiveIssueByPCAndType`.

---

#### 10. Definition of Terms — On-the-Job Training (OJT) Intern
- **Chapter:** Chapter 1
- **Section / Topic:** Definition of Terms — On-the-Job Training (OJT) Intern (New Entry)
- **Table / Figure:** Inserted after Maintenance Issue Deduplication (P133) and before Perceived Ease of Use (PEOU) (P135)
- **Original Content:** *Not present in approved baseline.*
- **Updated Content:**
  > "**On-the-Job Training (OJT) Intern.** A student trainee account operating under the supervision of permanent MIS Staff, authorized to inspect reported hardware defects, update ticket diagnostic statuses, and record resolutions during a time-bounded internship period."
- **Reason for Change:** Operationally defines the new authenticated intern user role within the research study.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE`
- **Evidence from Current System:** `database/migrations/016_add_user_lifecycle_fields.sql`, `middleware/auth.js`.
- **Repository File Path:** `middleware/auth.js`, `services/ojtService.js`
- **Relevant Reference:** `Role = 'OJT'`, `OJT_Start_Date`, `OJT_End_Date`.

---

#### 11. Definition of Terms — Resolver Attribution
- **Chapter:** Chapter 1
- **Section / Topic:** Definition of Terms — Resolver Attribution (New Entry)
- **Table / Figure:** Inserted before Room State (P139) (after Quick Response (QR) Code) to maintain strict alphabetical sequence (Q -> Res -> Roo -> S)
- **Original Content:** *Not present in approved baseline.*
- **Updated Content:**
  > "**Resolver Attribution.** An accountability mechanism that records the authenticated user identity (Resolved_By_User_ID), role, and timestamp (Resolved_At) of the specific technician or OJT intern who marked a maintenance issue as resolved."
- **Reason for Change:** Defines the diagnostic accountability mechanism linking technician user records to closed repair orders without claiming unverified remarks fields.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE`
- **Evidence from Current System:** `database/migrations/017_add_maintenance_issue_resolver.sql`, `services/maintenanceService.js`.
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `Resolved_By_User_ID`, `Resolved_At`.

---

### CHAPTER 3 — DESIGN AND METHODOLOGY

#### 12. Functional Requirements — FR-01 User Authentication & Role Management
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Functional Requirements
- **Table / Figure:** Table 2, Row FR-01 (`doc.tables[2]`, Row 1)
- **Original Content:**
  > "The system shall allow authorized users to log in and provide access based on their assigned role."
- **Updated Content:**
  > "The system shall allow authorized users to log in with individual accounts, **enforce role-based access control across four distinct roles (Department Head, Faculty, MIS Staff, and OJT Intern), and implement session inactivity timeouts.**"
- **Reason for Change:** Reflects the 4 active roles, individual accounts, and the 15-minute inactivity session expiration middleware.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `middleware/auth.js` (`requireRole`, `checkSessionInactivity`), `config/app.config.js`.
- **Repository File Path:** `middleware/auth.js`
- **Relevant Reference:** `checkSessionInactivity`, `INACTIVITY_TIMEOUT_MS`.

---

#### 13. Functional Requirements — FR-04 PC Fault Reporting and Maintenance
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Functional Requirements
- **Table / Figure:** Table 2, Row FR-04 (`doc.tables[2]`, Row 4)
- **Original Content:**
  > "The system shall allow students to report PC problems through QR codes and allow MIS staff to manage and resolve the reported issues."
- **Updated Content:**
  > "The system shall allow students to report PC problems through QR codes without login, **prevent duplicate active maintenance issues by checking if an unresolved issue already exists for that computer and issue type, and allow MIS staff and supervised OJT interns to manage, diagnose, and resolve reported issues with authenticated resolver attribution.**"
- **Reason for Change:** Incorporates behavioral issue deduplication, OJT participation, and resolver attribution.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `repositories/maintenance.repository.js`, `services/maintenanceService.js`, `database/migrations/017_add_maintenance_issue_resolver.sql`.
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `findActiveIssueByPCAndType`, `Resolved_By_User_ID`.

---

#### 14. Functional Requirements — FR-05 Physical Key Management
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Functional Requirements
- **Table / Figure:** Table 2, Row FR-05 (`doc.tables[3]`, Row 0)
- **Original Content:**
  > "The system shall allow MIS staff to register, monitor, and update the status of laboratory keys."
- **Updated Content:**
  > "The system shall allow MIS staff to register **unique key codes, monitor physical dock status, flag keys as Active or Missing, and generate printable QR keychain tags.**"
- **Reason for Change:** Accurately reflects key management features: registered key codes (`KEY-IT-203-A`), active/missing status toggles, and tag generation.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `database/migrations/012_create_key_management_tables.sql`, `services/keysService.js`.
- **Repository File Path:** `services/keysService.js`, `routes/keys.routes.js`
- **Relevant Reference:** `registerKey`, `generateKeyTag`, `markKeyMissing`.

---

#### 15. Functional Requirements — FR-08 System Records and Audit Logging
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Functional Requirements
- **Table / Figure:** Table 2, Row FR-08 (`doc.tables[3]`, Row 3)
- **Original Content:**
  > "The system shall record important activities and maintain records of user actions, key transactions, maintenance activities, and system events."
- **Updated Content:**
  > "The system shall **persistently record administrative and security audit logs with sensitive-field sanitization, and execute automated one-year retention cleanup on room occupancy activity logs.**"
- **Reason for Change:** Clarifies that the 1-year automated retention cleanup applies strictly to `occupancy_log`, while administrative audit logs are maintained persistently.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `database/migrations/011_create_audit_logs.sql`, `services/activityRetentionService.js`.
- **Repository File Path:** `services/activityRetentionService.js`, `services/auditService.js`
- **Relevant Reference:** `calculateOneCalendarYearCutoff`, `logSecurityEvent`.

---

#### 16. Functional Requirements — FR-09 OJT Intern Lifecycle Management (New Row)
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Functional Requirements
- **Table / Figure:** Table 2, Row FR-09 (`doc.tables[3]`, Row 4)
- **Original Content:** *Not present in approved baseline.*
- **Updated Content:**
  > "FR-09 \| OJT Intern Lifecycle Management \| **The system shall allow MIS staff to provision, supervise, and time-bound student intern accounts with automatic session expiration upon completion of their internship dates.**"
- **Reason for Change:** Documents the functional requirement for OJT account provisioning, duration setting, and expiration handling.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE`
- **Evidence from Current System:** `database/migrations/016_add_user_lifecycle_fields.sql`, `services/ojtService.js`, `middleware/auth.js`.
- **Repository File Path:** `services/ojtService.js`, `routes/ojt.routes.js`
- **Relevant Reference:** `createOjt`, `isOjtExpired`, `OJT_End_Date`.

---

#### 17. Functional Requirements — Narrative under Table 2
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Narrative Synthesis
- **Table / Figure:** Paragraph 223 (P223)
- **Original Content:**
  > "The functional requirements describe the main functions of the LabSync system that support the management of laboratory rooms, schedules, PC maintenance, and physical keys. These functions allow authorized users to monitor laboratory status, manage schedules, report and resolve PC problems, transfer laboratory keys, and track important system activities. Overall, these requirements help make laboratory management more organized and easier to monitor."
- **Updated Content:**
  > "The functional requirements describe the main functions of the LabSync system that support the management of laboratory rooms, schedules, **deduplicated PC maintenance with resolver attribution, physical key lifecycle tracking, OJT intern management, and administrative audit logging**. These functions allow authorized users to monitor laboratory status, manage schedules, report and resolve PC problems, transfer laboratory keys, and track important system activities. Overall, these requirements help make laboratory management more organized and easier to monitor."
- **Reason for Change:** Aligns synthesis narrative with expanded functional requirements.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** Table 2 updates.
- **Repository File Path:** `docs/Chapter-1-3-UPDATED-DRAFT.docx`
- **Relevant Reference:** Paragraph 223.

---

#### 18. Hardware Requirements — 6.35mm Jack Socket Sensing Mode
- **Chapter:** Chapter 3
- **Section / Topic:** Requirement Analysis and Documentation — Hardware Requirements
- **Table / Figure:** Table 4, Row 6.35 mm Jack Socket (`doc.tables[7]`, Row 2)
- **Original Content:**
  > "6.35 mm (¼-inch) jack socket; configured using INPUT_PULLUP; connected to GPIO 32 for Room 203 and GPIO 33 for Room 204"
- **Updated Content:**
  > "6.35 mm (¼-inch) jack socket; configured with **resistor-divider analog sensing (ADC); connected to GPIO 32 for Room 203 (reads ~1800 ADC for 10kΩ key) and GPIO 33 for Room 204 (reads ~0 ADC for 0Ω key)**"
- **Reason for Change:** In the active firmware, the jack sockets are configured as analog ADC inputs measuring resistor-divider voltage signatures to detect key presence and identify specific keys.
- **Classification:** `MUST UPDATE`
- **Change Type:** `INCORRECT TECHNICAL DETAIL`
- **Evidence from Current System:** `LabSync_ESP32.ino` (lines 31-41, 74-88: `analogRead`, `KEY_PIN_203 32`, `KEY_PIN_204 33`, `KeyType`).
- **Repository File Path:** `LabSync_ESP32.ino`
- **Relevant Reference:** `detectKeyType(int pin)`, `analogReadResolution(12)`.

---

#### 19. Conceptual Framework — Knowledge Requirements
- **Chapter:** Chapter 3
- **Section / Topic:** Conceptual Framework — Input: Knowledge Requirements
- **Table / Figure:** Paragraph 252 (P252)
- **Original Content:**
  > "Knowledge Requirements: This includes the technical knowledge needed for the development of the system, such as web development using HTML, CSS, JavaScript, and PHP, database management using MySQL..."
- **Updated Content:**
  > "Knowledge Requirements: This includes the technical knowledge needed for the development of the system, such as web development using HTML, CSS, JavaScript, **and Node.js with Express.js**, database management using MySQL..."
- **Reason for Change:** The backend is written in Node.js and Express.js, not PHP.
- **Classification:** `MUST UPDATE`
- **Change Type:** `OUTDATED DESCRIPTION`
- **Evidence from Current System:** `package.json` (`express: ^5.0.0`), `server.js`.
- **Repository File Path:** `package.json`, `server.js`
- **Relevant Reference:** `express`, `routes/index.js`.

---

#### 20. Conceptual Framework — Tools and Equipment
- **Chapter:** Chapter 3
- **Section / Topic:** Conceptual Framework — Input: Tools and Equipment
- **Table / Figure:** Paragraph 253 (P253)
- **Original Content:**
  > "Tools and Equipment: The software and development environment consist of the Arduino IDE for programming the hardware, VS Code for developing the web application, XAMPP for running the local MySQL server, and the web application environment."
- **Updated Content:**
  > "Tools and Equipment: The software and development environment consist of the Arduino IDE for programming the hardware, VS Code for developing the web application, **Node.js runtime environment with npm package manager, MySQL/MariaDB database engine, and modern web browsers.**"
- **Reason for Change:** Removes outdated reference to XAMPP; the project runs on Node.js and standard MySQL/MariaDB.
- **Classification:** `MUST UPDATE`
- **Change Type:** `OUTDATED DESCRIPTION`
- **Evidence from Current System:** `server.js`, `package.json`.
- **Repository File Path:** `server.js`
- **Relevant Reference:** Node.js v18.0.0+, Express 5.

---

#### 21. Conceptual Framework — Materials
- **Chapter:** Chapter 3
- **Section / Topic:** Conceptual Framework — Input: Materials
- **Table / Figure:** Paragraph 254 (P254)
- **Original Content:**
  > "Materials: These include the physical components needed to build the IoT node, such as the ESP32 microcontroller, Magnetic Reed Switch, client devices such as smartphones and PCs, power supply and cables, breadboard, jumper wires, 10mm LED lights and resistors, GM65 Barcode/QR Code Reading Board Module, LCD 16x2 Display with I2C and Shell, and guitar input jack or mono jacks."
- **Updated Content:**
  > "Materials: These include the physical components needed to build the IoT node, such as the ESP32 microcontroller, **6.35mm audio jack sockets with precision resistor-divider circuits, active buzzer module**, client devices such as smartphones and PCs, power supply and cables, breadboard, jumper wires, GM65 Barcode/QR Code Reading Board Module, LCD 16x2 Display with I2C and Shell, and custom two-sided acrylic keychain tags."
- **Reason for Change:** Replaces obsolete prototype materials (reed switches, 10mm LEDs) with the verified hardware components.
- **Classification:** `MUST UPDATE`
- **Change Type:** `INCORRECT TECHNICAL DETAIL`
- **Evidence from Current System:** `LabSync_ESP32.ino`.
- **Repository File Path:** `LabSync_ESP32.ino`
- **Relevant Reference:** `KEY_PIN_203`, `KEY_PIN_204`, `BUZZER_PIN`.

---

#### 22. Conceptual Framework — Construction Phase
- **Chapter:** Chapter 3
- **Section / Topic:** Conceptual Framework — Process: Construction
- **Table / Figure:** Paragraph 264 (P264)
- **Original Content:**
  > "Construction: Developing the PHP backend, MySQL database, web application, and ESP32 firmware, including the integration of the IoT hardware."
- **Updated Content:**
  > "Construction: **Developing the Node.js/Express.js REST API backend, MySQL database schema and migrations, modular frontend interfaces, and ESP32 firmware**, including the integration of the IoT hardware."
- **Reason for Change:** Corrects outdated PHP backend statement to Node.js/Express.js REST API.
- **Classification:** `MUST UPDATE`
- **Change Type:** `OUTDATED DESCRIPTION`
- **Evidence from Current System:** `server.js`, `routes/`, `database/migrations/`.
- **Repository File Path:** `server.js`
- **Relevant Reference:** Express v5 modular router architecture.

---

#### 23. Development Methodology — Construction Phase
- **Chapter:** Chapter 3
- **Section / Topic:** Development Methodology — RAD Construction Phase
- **Table / Figure:** Paragraph 294 (P294)
- **Original Content:**
  > "In the Construction phase, the actual system was built. The web pages and database were coded using PHP, JavaScript, and MySQL, while the ESP32 code was written in C++. At the same time, the physical acrylic box was assembled with its 6.35mm key jacks, LCD screen, buzzer, and QR scanner."
- **Updated Content:**
  > "In the Construction phase, the actual system was built. The web pages, REST API backend, and database integration were coded using **JavaScript (ES6+), Node.js, Express.js, and MySQL**, while the ESP32 code was written in C++. At the same time, the physical acrylic box was assembled with its 6.35mm key jacks, LCD screen, buzzer, and QR scanner."
- **Reason for Change:** Corrects outdated PHP backend statement to Node.js/Express.js and ES6+ JavaScript.
- **Classification:** `MUST UPDATE`
- **Change Type:** `OUTDATED DESCRIPTION`
- **Evidence from Current System:** `package.json`, `server.js`, `routes/`.
- **Repository File Path:** `server.js`
- **Relevant Reference:** `package.json: "express": "^5.0.0"`.

---

#### 24. System Design — External Entities
- **Chapter:** Chapter 3
- **Section / Topic:** System Design Overview — External Entities
- **Table / Figure:** Paragraph 304 (P304)
- **Original Content:**
  > "...The Context Diagram outlines the general system boundary and shows how the platform interacts with its external entities: the IT Department Head, Faculty, Students, MIS Staff, and the ESP32 key box..."
- **Updated Content:**
  > "...The Context Diagram outlines the general system boundary and shows how the platform interacts with its external entities: the IT Department Head, Faculty, Students, **MIS Staff (including supervised OJT interns)**, and the ESP32 key box..."
- **Reason for Change:** Mentions supervised OJT interns assisting MIS Staff.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `middleware/auth.js` (`OJT_ROLES`).
- **Repository File Path:** `middleware/auth.js`
- **Relevant Reference:** `OJT_ROLES = ['OJT']`.

---

#### 25. Context Diagram Narrative — Maintenance Interactions
- **Chapter:** Chapter 3
- **Section / Topic:** Context Diagram — Equipment Maintenance Flow
- **Table / Figure:** Paragraph 317 (P317)
- **Original Content:**
  > "For equipment maintenance, the Student entity acts as an external reporter, submitting PC condition reports for defective desktop parts without needing an account, and receiving an immediate report submission acknowledgment. The MIS staff manages these records by providing login credentials, maintenance ticket updates, QR generation requests, and PC report search queries. In return, the system outputs authentication status, ticket status feedback, printable PC asset QR codes, and filtered PC issue results to guide physical computer repairs across the laboratories."
- **Updated Content:**
  > "For equipment maintenance, the Student entity acts as an external reporter, submitting PC condition reports for defective desktop parts without needing an account, and receiving an immediate report submission acknowledgment. **The system prevents duplicate active issues by checking whether an unresolved issue already exists for that computer and component, associating additional reports with the active issue.** The MIS staff **and supervised OJT interns manage** these records by providing login credentials, maintenance ticket updates, QR generation requests, and PC report search queries. In return, the system outputs authentication status, ticket status feedback **with attributed resolver tracking**, printable PC asset QR codes, and filtered PC issue results to guide physical computer repairs across the laboratories."
- **Reason for Change:** Integrates behavioral deduplication, OJT intern participation, and resolver attribution into context narrative.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `repositories/maintenance.repository.js`, `services/maintenanceService.js`.
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `findActiveIssueByPCAndType`, `updateReportStatus`.

---

#### 26. Data Flow Diagram Narrative — Process 3.0 Maintenance & Asset Management
- **Chapter:** Chapter 3
- **Section / Topic:** Data Flow Diagram (DFD Level 1) — Process 3.0
- **Table / Figure:** Paragraph 328 (P328)
- **Original Content:**
  > "Maintenance & Asset Management (3.0) processes hardware tracking and repair tickets for laboratory workstations. Students submit hardware condition reports without logging in, which logs a new fault ticket into the Maintenance Store (D7) and sends an immediate submission acknowledgment back to the student. MIS Staff submit maintenance updates and QR generation requests, verify room data via the Laboratories Store (D5), and store computer records and QR codes into the Lab Units Store (D6). This updates PC unit statuses in D6 and returns printable asset QR codes and ticket feedback to the MIS Staff."
- **Updated Content:**
  > "Maintenance & Asset Management (3.0) processes hardware tracking and repair tickets for laboratory workstations. Students submit hardware condition reports without logging in, which **the system checks against unresolved issues for that workstation and component within the Maintenance Issues Store (D7), linking matching reports to the active issue** and sending an immediate submission acknowledgment back to the student. MIS Staff **and supervised OJT interns submit status updates, record inspection progress, and attribute the authenticated resolver upon issue completion**. MIS Staff also verify room data via the Laboratories Store (D5), and store computer records and QR codes into the Lab Units Store (D6). This updates PC unit statuses in D6 and returns printable asset QR codes and ticket feedback to the technical personnel."
- **Reason for Change:** Clarifies data movement through the `maintenance_issues` store and resolver attribution.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `database/migrations/013_create_maintenance_issues.sql`, `database/migrations/017_add_maintenance_issue_resolver.sql`.
- **Repository File Path:** `database/migrations/013_create_maintenance_issues.sql`
- **Relevant Reference:** `maintenance_issues` table, `Maintenance_Issue_ID`.

---

#### 27. Use Case Diagram Narrative — MIS Staff & OJT Permissions
- **Chapter:** Chapter 3
- **Section / Topic:** Use Case Diagram — MIS Staff & OJT Intern Roles
- **Table / Figure:** Paragraph 344 (P344)
- **Original Content:**
  > "The MIS Staff is dedicated 100% to hardware maintenance and inventory with a particular emphasis on ticket tracking, tracking repair status, and printing QR code labels for Lab PCs. Sharing the resolution of tickets with MIS technicians ensures that computers are marked as fixed only after a real inspection or repair."
- **Updated Content:**
  > "The MIS Staff is dedicated 100% to hardware maintenance and inventory with a particular emphasis on ticket tracking, tracking repair status, and printing QR code labels for Lab PCs. **Assisting the staff, the OJT Intern role is authorized to inspect reported workstation defects, update ticket progress (Pending, In Progress, Resolved), and record resolutions under their authenticated identity, while administrative functions such as key management, user provisioning, and QR generation remain restricted to permanent MIS personnel.** Sharing the resolution of tickets with MIS technicians and interns ensures that computers are marked as fixed only after a real inspection or repair."
- **Reason for Change:** Accurately defines the verified RBAC permissions of OJT interns relative to permanent MIS Staff based on route and middleware logic.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE` & `MODIFIED FEATURE`
- **Evidence from Current System:** `middleware/auth.js` (`requireRole`, `TICKET_UPDATE_ROLES`), `routes/ojt.routes.js`, `routes/keys.routes.js`.
- **Repository File Path:** `middleware/auth.js`
- **Relevant Reference:** `TICKET_UPDATE_ROLES = [...ADMIN_ROLES, 'OJT']`.

---

#### 28. Pin Mapping Table — Active Hardware Configuration
- **Chapter:** Chapter 3
- **Section / Topic:** Pin Mapping Table
- **Table / Figure:** Table 5 (`doc.tables[8]`, Rows 1–8; removed obsolete split `doc.tables[9]`)
- **Original Content:**
  > Table 5 listed obsolete prototype pins:
  > - Red LED (10mm) | Anode (+) | GPIO 5 | Output Signal (Alert / No Key)
  > - Resistor (220Ω–330Ω) | GPIO 5 | Current limiting
  > - Green LED (10mm) | Anode (+) | GPIO 2 | Output Signal (Normal / Key Present)
  > - Resistor (220Ω–330Ω) | GPIO 2 | Current limiting
  > - Magnetic Switch | GPIO 4 | Sensor Signal (Input)
  > - Pull-up Resistor (10kΩ) | GPIO 4 | Connected to Sensor Signal
- **Updated Content:**
  > **Table 5. Pin Mapping Table** (Rebuilt with verified active hardware connections):
  > - **6.35mm Jack Socket (Slot 203) \| Tip / Sense Line \| GPIO 32 \| ADC Analog Input (detects 10kΩ resistor key, ADC ~1800)**
  > - **6.35mm Jack Socket (Slot 204) \| Tip / Sense Line \| GPIO 33 \| ADC Analog Input (detects 0Ω direct wire key, ADC ~0)**
  > - **GM65 Barcode/QR Scanner \| TX Pin \| GPIO 17 \| Hardware Serial2 RX (Data reception from scanner)**
  > - **GM65 Barcode/QR Scanner \| RX Pin \| GPIO 16 \| Hardware Serial2 TX (Configuration / trigger output)**
  > - **16×2 Character LCD (I2C) \| SDA Line \| GPIO 21 \| I2C Serial Data line (Screen display updates)**
  > - **16×2 Character LCD (I2C) \| SCL Line \| GPIO 22 \| I2C Serial Clock line (Screen display clock)**
  > - **Active Buzzer Module \| I/O Pin \| GPIO 25 \| Digital Output (Active-low alarm trigger for wrong key / errors)**
  > - **Common Power & Ground \| VCC / GND \| 3.3V / 5V / GND \| Power distribution rails across all peripheral modules**
- **Reason for Change:** The approved baseline table contained obsolete prototype pin connections that directly contradicted the active firmware, Table 4, and the actual physical hardware. The table was rebuilt to match `LabSync_ESP32.ino` exactly.
- **Classification:** `MUST UPDATE`
- **Change Type:** `INCORRECT TECHNICAL DETAIL` & `REMOVED FEATURE`
- **Evidence from Current System:** `LabSync_ESP32.ino` (lines 31–60).
- **Repository File Path:** `LabSync_ESP32.ino`
- **Relevant Reference:** `#define KEY_PIN_203 32`, `#define KEY_PIN_204 33`, `#define GM65_RX_PIN 17`, `#define GM65_TX_PIN 16`, `#define I2C_SDA_PIN 21`, `#define I2C_SCL_PIN 22`, `#define BUZZER_PIN 25`.

---

#### 29. Pin Mapping Table Narrative
- **Chapter:** Chapter 3
- **Section / Topic:** Pin Mapping Table — Narrative Explanation
- **Table / Figure:** Paragraph 372 (P372)
- **Original Content:**
  > "The LabSync Pin Mapping Table lists the specific wiring connections between the external hardware parts and the ESP32 microcontroller to make sure the tracking system works correctly. The hardware setup is divided into a visual indicator subsystem 43 and a sensory input loop.For the visual feedback, a Red LED is connected to GPIO 5 to show alerts or that the key is missing, while a Green LED is wired to GPIO 2 to show normal status or that the key is in its place. Both LEDs use resistors to protect the circuit and limit the electrical current. For the sensor input, a magnetic switch is connected to GPIO 4 to read whether the lab key is present. This sensor uses a 10k pull-up resistor connected to the 3V3 pin to keep the signal stable and prevent false readings when the key is moved."
- **Updated Content:**
  > "The LabSync Pin Mapping Table lists the specific wiring connections between the external hardware peripherals and the ESP32 microcontroller as implemented in the active firmware. **The hardware configuration centers on analog voltage-divider sensing and serial peripheral communication. For key detection, 6.35mm jack sockets connect to analog ADC pins GPIO 32 (Slot 203) and GPIO 33 (Slot 204), reading distinct analog voltage thresholds to reliably detect key insertion and verify key identity (10kΩ resistor key for Room 203, and 0Ω direct wire for Room 204). The GM65 optical scanner interfaces via Hardware Serial2 on GPIO 17 (RX) and GPIO 16 (TX) at 9600 baud. For visual and auditory feedback, a 16×2 character LCD communicates over the I2C bus via GPIO 21 (SDA) and GPIO 22 (SCL) at address 0x27 or 0x3F, while an active buzzer module connects to GPIO 25 with an active-low trigger to alert users of wrong-key insertions or operational errors.**"
- **Reason for Change:** Narrative was completely rewritten to match the active ADC voltage-divider, I2C, and UART circuit described in Table 5 and implemented in firmware.
- **Classification:** `MUST UPDATE`
- **Change Type:** `INCORRECT TECHNICAL DETAIL`
- **Evidence from Current System:** `LabSync_ESP32.ino`.
- **Repository File Path:** `LabSync_ESP32.ino`
- **Relevant Reference:** `detectKeyType(int pin)`, `handleKeySlot()`.

---

#### 30. System Architecture Diagram — Physical Layer Key Sensing
- **Chapter:** Chapter 3
- **Section / Topic:** System Architecture Diagram — III. Physical Layer (Lab Node)
- **Table / Figure:** Paragraph 396 (P396)
- **Original Content:**
  > "Magnetic Reed Switch: A switch that detects a physical presence of a key on the key pad, indicating if the room key is present or not."
- **Updated Content:**
  > "**6.35mm Jack Sockets with Resistor-Divider Analog Sensing:** **Electromechanical audio jack ports connected to ESP32 ADC pins (GPIO 32 and GPIO 33) that read distinct voltage signatures to reliably verify physical key presence and detect if an incorrect key is inserted into a room slot.**"
- **Reason for Change:** Corrects the physical layer sensor specification from magnetic reed switches to resistor-divider 6.35mm audio jack sockets.
- **Classification:** `MUST UPDATE`
- **Change Type:** `INCORRECT TECHNICAL DETAIL`
- **Evidence from Current System:** `LabSync_ESP32.ino` (lines 31–41).
- **Repository File Path:** `LabSync_ESP32.ino`
- **Relevant Reference:** `KEY_PIN_203`, `KEY_PIN_204`, `KeyType`.

---

#### 31. Flowcharts — MIS User Flowchart Narrative
- **Chapter:** Chapter 3
- **Section / Topic:** Flowcharts — Management Information System (MIS) User
- **Table / Figure:** Paragraph 427 (P427)
- **Original Content:**
  > "The MIS Admin flowchart describes the process for technical staff to track hardware and make repairs..."
- **Updated Content:**
  > "The MIS Admin flowchart describes the process for technical staff to track hardware and make repairs. **Under this workflow, MIS personnel oversee campus-wide equipment health, register workstation QR codes, manage physical key allocations, and supervise OJT intern accounts. When addressing defect tickets, technicians and interns investigate reported symptoms, update progress statuses (Pending, In Progress, Resolved), and record authenticated resolver attribution upon closing an issue. The system prevents ticket clutter by associating repeated student reports with the existing active issue until service is complete.**"
- **Reason for Change:** Documents intern supervision, behavioral report grouping, and resolver attribution within the MIS administrative flowchart.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `mis-maintenance.html`, `services/maintenanceService.js`, `services/ojtService.js`.
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `updateReportStatus`, `listOjts`.

---

#### 32. Flowcharts — Student User Flowchart Narrative
- **Chapter:** Chapter 3
- **Section / Topic:** Flowcharts — Student User ("Zero-Login" Reporting)
- **Table / Figure:** Paragraph 437 (P437)
- **Original Content:**
  > "The 'zero-login' reporting feature on the platform is justified by the Student flowchart. Students just scan the QR sticker on the PC, which instantly identifies the computer and room location without asking for an account or password. This direct approach makes reporting quick and effortless, encouraging students to submit broken computer parts right away while maintaining an organized, deduplicated maintenance backlog for the technical staff."
- **Updated Content:**
  > "The 'zero-login' reporting feature on the platform is justified by the Student flowchart. Students just scan the QR sticker on the PC, which instantly identifies the computer and room location without asking for an account or password. **Behind the scenes, the reporting pipeline checks whether an unresolved issue already exists for that computer and component; if an issue is active, the submission is associated with the existing issue rather than creating a duplicate ticket.** This direct approach makes reporting quick and effortless, encouraging students to submit broken computer parts right away while maintaining an organized, deduplicated maintenance backlog for the technical staff."
- **Reason for Change:** Explains how the zero-login submission checks for active unresolved issues on that workstation and component.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `submit-pc-report.html`, `services/maintenanceService.js` (`submitReport`).
- **Repository File Path:** `services/maintenanceService.js`
- **Relevant Reference:** `submitReport(reqBody)`.

---

#### 33. Mockups — MIS Key Management
- **Chapter:** Chapter 3
- **Section / Topic:** Mockups — MIS Key Management
- **Table / Figure:** Paragraph 572 (P572)
- **Original Content:**
  > "The Key Management interface gives the technical custodians an audit trail of physical laboratory keys and dock slot assignments. The central view lists each laboratory room alongside its designated hardware sensor socket, current physical dock status (docked or removed), the authorized keyholder, and the timestamp of the last recorded custody movement. Staff can also register new key slots, inspect hardware telemetry, and track keys that are currently pulled out outside regular class hours. This replaces traditional handwritten logbooks with an automated, verifiable tracking record that helps staff spot missing or unreturned keys right away."
- **Updated Content:**
  > "The Key Management interface gives the technical custodians an audit trail of physical laboratory keys and dock slot assignments. The central view lists each laboratory room alongside its designated hardware sensor socket, **registered unique key code (e.g., KEY-IT-203-A), key status (Active or Missing),** current physical dock status (docked or removed), the authorized keyholder, and the timestamp of the last recorded custody movement. Staff can also register new key slots, **generate and print durable acrylic keychain QR tags for hallway transfers, toggle missing key alerts,** inspect hardware telemetry, and track keys that are currently pulled out outside regular class hours. This replaces traditional handwritten logbooks with an automated, verifiable tracking record that helps staff spot missing or unreturned keys right away."
- **Reason for Change:** Documents key codes, active/missing toggling, and keychain QR tag printing in the Key Management UI.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `mis-keys.html`, `services/keysService.js`.
- **Repository File Path:** `mis-keys.html`, `routes/keys.routes.js`
- **Relevant Reference:** `/:keyId/tag`, `/:keyId/missing`, `/:keyId/active`.

---

#### 34. Mockups — MIS Maintenance Tracker
- **Chapter:** Chapter 3
- **Section / Topic:** Mockups — MIS Maintenance Tracker
- **Table / Figure:** Paragraph 582 (P582)
- **Original Content:**
  > "The Maintenance Tracker serves as the central ticket resolution workspace where MIS technicians handle, investigate, and close student-reported hardware defects. The interface organizes incoming tickets into clear diagnostic queues—such as Open, In Progress, and Resolved—highlighting the reporting student's details, the affected components (monitor, keyboard, mouse, or system unit), submission timestamps, and specific diagnostic notes. Technicians can update a defect's status, record inspection remarks, or mark a unit back as functional once repaired. This keeps all maintenance workflows accountable in one place, preventing duplicate complaints and making sure workstation breakdowns are fixed promptly."
- **Updated Content:**
  > "The Maintenance Tracker serves as the central ticket resolution workspace where MIS technicians **and supervised OJT interns** handle, investigate, and close student-reported hardware defects. The interface organizes incoming tickets into clear diagnostic queues—such as Open, In Progress, and Resolved—**automatically grouping student reports for the same computer component into unified active issue cards. Technicians and interns can inspect specific student remarks, update diagnostic statuses, and record resolutions through a resolver confirmation modal that permanently attributes the repair to their authenticated user account.** This keeps all maintenance workflows accountable in one place, preventing duplicate complaints and making sure workstation breakdowns are fixed promptly."
- **Reason for Change:** Documents grouping of student reports and the resolver confirmation modal without claiming an unverified database remarks field.
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `MODIFIED FEATURE`
- **Evidence from Current System:** `mis-maintenance.html`, `js/pages/mis-maintenance.js`, `database/migrations/017_add_maintenance_issue_resolver.sql`.
- **Repository File Path:** `mis-maintenance.html`
- **Relevant Reference:** Resolver modal, `updateReportStatus`.

---

#### 35. Mockups — MIS OJT Management (New Subsection)
- **Chapter:** Chapter 3
- **Section / Topic:** Mockups — MIS OJT Management (New Subsection)
- **Table / Figure:** Inserted after Paragraph 582
- **Original Content:** *Not present in approved baseline.*
- **Updated Content:**
  > "**MIS OJT Management**  
  > **The MIS OJT Management screen provides technical administrators with a dedicated interface to manage student interns rendering required hours in the IT laboratories. MIS Staff can provision new intern accounts, configure official internship start and end dates, toggle account statuses between Active and Deactivated, and execute secure password resets. The system enforces time-bounded access control, automatically terminating active sessions once an intern's scheduled duration concludes, while granting interns necessary privileges to inspect hardware reports and record repair resolutions under their authenticated identity.**"
- **Reason for Change:** Documents the dedicated OJT intern management interface (`mis-ojt.html`).
- **Classification:** `SHOULD UPDATE`
- **Change Type:** `NEW FEATURE`
- **Evidence from Current System:** `mis-ojt.html`, `js/pages/mis-ojt.js`, `services/ojtService.js`, `routes/ojt.routes.js`.
- **Repository File Path:** `mis-ojt.html`, `services/ojtService.js`
- **Relevant Reference:** `createOjt`, `updateOjt`, `updateStatus`, `resetPassword`.

---

## Sections That Remain Accurate (Preserved Without Changes)

The following sections were verified and intentionally preserved without changes:
1. **Title & Preliminary Metadata**: Official title, authors (Esplana, Gabito, Guevarra, Naranjo), BulSU-SC IT Department affiliation.
2. **Institutional Background & Rationale**: Context of IT Building computer laboratories (Rooms 203 & 204), schedule overlaps, physical key accountability, and zero-login student reporting motivation.
3. **Operational Room States**: Tri-state room status calculation (`Available`, `In Session`, `Borrowed`).
4. **Core Hardware Foundation**: ESP32 microcontroller, optical GM65 barcode reader, 16×2 character LCD with I2C PCF8574 backpack, active buzzer, and 6.35mm electromechanical jack sockets (as originally stated in Table 4).
5. **Schedule Management Studio**: Drag-and-drop Schedule Studio, visual collision detection algorithm, and official timetable export with institutional signatories.
6. **Hallway Key Transfer Concept**: Mobile QR scanning of acrylic keychain tags for room custody transitions.
7. **Entire Chapter 2 (Literature Review & Related Systems)**:
   - *Audit Finding:* No Chapter 2 changes were identified as necessary from the current-system implementation audit.
   - All citations (Ye et al., Arunkumar et al., Mallari et al., Taruc & De La Cruz, Jadhav et al., Rabiah et al., Sağıt et al., Teves, El-Haggar et al., Kunjiapu et al.), Related Systems (Cisco Spaces, IBM TRIRIGA, Google Forms, Skedda, Brightly Maintenance / SchoolDude, LabWare LIMS), and Table 1 (Comparison of Related Systems) remain 100% untouched.
8. **Table 6 (Tools, Technologies, and Development Environment)**: Accurate listing of Node.js v18+, Express 5, MySQL/MariaDB 8.4.8, Vanilla HTML5/CSS3/JS, and Railway.
9. **Tables 7–11 (Development Cost & Budget)**: Human Resource Cost, Software & Licensing, Hardware Cost, Utilities Cost, and Total Development Cost templates.
10. **Research Evaluation Methodology**: ISO/IEC 25010 software quality model (Table 12), TAM constructs, Likert scale conversion tables, and statistical formulas (Arithmetic Mean, Frequency, Percentage, Weighted Mean).

---

## Unverified Claims Removed During Final Audit
During the final factual verification, the following claims were identified as unsupported by the codebase and were strictly **removed**:
1. **Standalone Lost Key Form (FR-10):** A proposed functional requirement claiming that `key-found.html` provides a standalone form for finders to submit recovery location details was **removed**. Inspection of `key-found.html` proved it is purely a redirect to `key-transfer.html`. The page initiates a QR-based key transfer and custody workflow requiring authenticated authorized personnel; unauthenticated requests receive a `401 Unauthorized` response from `/api/keys/transfer-info/:keyCode`, prompting a login redirect so that only authorized personnel can complete the custody transfer.
2. **`Active_Issue_Key` Database Field Assumption:** Previous documentation claimed that deduplication was enforced by an application-level database column named `Active_Issue_Key`. This claim was replaced with the verified runtime repository query behavior: checking whether an unresolved issue exists for `PC_ID` and `Issue_Type` with `Status != 'Resolved'`.
3. **`Resolution_Remarks` Database Field Assumption:** Previous documentation claimed that resolver remarks were stored in a dedicated database column in `maintenance_issues`. Inspection proved that only `Resolved_By_User_ID` and `Resolved_At` are stored in `maintenance_issues`. The claim of a separate database remarks column was removed.
4. **General Retention Assumption:** Wording suggesting that the 1-year retention cleanup applies to all audit logs was corrected. The cleanup strictly targets `occupancy_log` via `services/activityRetentionService.js`.
