# LabSync Documentation Update Report
## Comprehensive Synchronization with Implemented System Architecture (v1.4.0)

> **Date:** October 8, 2026  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Project:** LabSync (Smart Laboratory Management & Equipment Monitoring System)  
> **Scope:** Full Documentation Audit & Synchronization across `docs/`  
> **Source of Truth:** Current source code, migrations (001–025), middleware (`middleware/auth.js`), services, controllers, routes, `docs/NEW-IMPLEMENTATION-UPDATES.md`, and test suites.

---

## 1. Documents Updated

| Document | Sections Updated | Reason for Update |
| :--- | :--- | :--- |
| [`docs/SYSTEM_DOCUMENTATION.md`](file:///c:/Users/andre/Downloads/LabSync/docs/SYSTEM_DOCUMENTATION.md) | • Header & Version updated to v1.4.0<br>• Table of Contents expanded<br>• Section 1 (Problems & Solutions Matrix expanded)<br>• Section 3 (File Tree: added `mis.controller.js`, migrations 021–025, `mis.repository.js`, `student-verification.repository.js`, `mis.routes.js`, `misService.js`, `roomLockService.js`, `student-id-verification.js`)<br>• Section 4 (User Roles: added **Program Coordinator**, 5-role permissions matrix, middleware constants `IT_DEPT_HEAD_EXCLUSIVE_ROLES`, `IT_HEAD_ROLES`, `KEY_BOX_ACCESS_ROLES`)<br>• Section 5 (Pages: 5.1 Student ID QR Verification, 5.3 Unified User Management & MIS lifecycle, 5.4 Program Coordinator features, 5.5 MIS Staff features, 5.8 Collaborative Master Schedule & Draft Studio, 5.10 PC Maintenance Report Follow-Up escalation)<br>• Section 9 (Database Schema: expanded to 17 entities, migrations 001–025 detailed)<br>• Section 10 (REST APIs: `/api/mis-staff/*`, `/api/schedules/*`, `/api/reports/*`)<br>• Section 12 (Audit Logging: added `MIS_CREATE`, `MIS_DEACTIVATE`, `SCHEDULE_FINALIZE`, `SCHEDULE_REOPEN`, `PC_REPORT_FOLLOW_UP`, `STUDENT_VERIFIED`)<br>• Section 16 (Automated Testing: updated to 173-test verification suite metric) | Full technical manual updated to accurately describe the entire v1.4.0 production codebase, role boundaries, database migrations, and collaborative scheduling engine. |
| [`docs/Chapter-1-3-CHANGE-LOG.md`](file:///c:/Users/andre/Downloads/LabSync/docs/Chapter-1-3-CHANGE-LOG.md) | • Summary Table (updated total changes count to 44)<br>• Verification Constraints (added Constraints 10–14: Program Coordinator boundaries, Draft vs Official schedule isolation, MIS Staff advisory concurrency lock, Student ID QR nonces, and PC Report Follow-Up cooldown)<br>• Detailed Change Log (appended Changes 36–44: Program Coordinator introduction, Unified User Management, Collaborative Scheduling, PC Report Follow-Up, Second-Key Reservations, Student ID QR verification, Key Box Access alignment, FR-17 to FR-20 additions, and Context DFD / Level 1 DFD / ERD synchronization) | Synchronizes the formal Capstone manuscript change ledger with all recent implementations for thesis defense and adviser review. |
| [`docs/MIS-OJT-FEATURE-DOCUMENTATION.md`](file:///c:/Users/andre/Downloads/LabSync/docs/MIS-OJT-FEATURE-DOCUMENTATION.md) | • Section 2 (MIS Staff Role & Account Model: added MIS Staff Lifecycle Governance, IT Dept. Head creation authority, named advisory concurrency locks, soft deactivation, vacancy handling, and replacement onboarding)<br>• Section 13 (Account Settings & Personal Profile QR Rule: corrected key dock access rule—MIS Staff has personal QR code credentials for IoT key dock, while OJT Interns are excluded)<br>• Section 14 (Role Permissions Summary Matrix: expanded to 5 roles including Program Coordinator and updated all operational permissions) | Aligns MIS operational reference with IT Dept. Head governance over MIS Staff, corrects IoT key dock QR credentials rule, and reflects Program Coordinator permissions. |
| [`docs/MIS-OJT-TECHNICAL-DOCUMENTATION.md`](file:///c:/Users/andre/Downloads/LabSync/docs/MIS-OJT-TECHNICAL-DOCUMENTATION.md) | • Section 2 (MIS Staff Role: added MIS Staff Lifecycle Governance & Department Head Authority)<br>• Section 10 (Database Changes: added `maintenance_issues` follow-up fields from Migration 023 and updated entity relationship diagram)<br>• Section 11 (Role Permissions: updated Multi-Role Access Architecture diagram, authoritatively expanded permissions table to 5 roles, corrected key dock personal QR pass notes) | Aligns technical documentation with IT Dept. Head governance over MIS Staff, Migration 023 follow-up fields, and exact 5-role security matrix. |
| [`docs/hardware/IOT_HANDOVER_SUMMARY.md`](file:///c:/Users/andre/Downloads/LabSync/docs/hardware/IOT_HANDOVER_SUMMARY.md) | • Section 3 (Web Server & Backend Integration: added production HTTPS / TLS 1.3 protocol note)<br>• Section 4 (added Key Box Access Authorization Rules table detailing allowed roles [Faculty, IT Dept. Head, Program Coordinator, MIS Staff] and rejected entities [OJT Intern, Student/Public, Deactivated Account])<br>• Sections 5–7 numbering adjusted | Documents production HTTPS transport and aligns key dock access control with backend authorization constants (`KEY_BOX_ACCESS_ROLES`). |
| [`docs/STUDENT-ID-QR-FEATURE-CONTEXT.md`](file:///c:/Users/andre/Downloads/LabSync/docs/STUDENT-ID-QR-FEATURE-CONTEXT.md) | • Appended Technical Architecture & Database Persistence section<br>• Documented Migration 022 table `student_verification_sessions`<br>• Documented 64-character cryptographic session nonces and 15-minute expiration deadline<br>• Documented endpoints `/api/reports/verify-student-id` and `/api/reports/submit` | Provides capstone researchers and documentation specialists with exact database table structure, column types, nonce expiration mechanics, and API routes for Student ID QR verification. |

---

## 2. Documents Reviewed but Unchanged

| Document | Reason Retained Unchanged |
| :--- | :--- |
| [`docs/NEW-IMPLEMENTATION-UPDATES.md`](file:///c:/Users/andre/Downloads/LabSync/docs/NEW-IMPLEMENTATION-UPDATES.md) | Authored and verified earlier in the process as the primary comprehensive technical specification of the current implementation (72,894 bytes). Served as the authoritative reference for these documentation updates. |
| `docs/Chapter-1-3-APPROVED-BASELINE.docx` | **Approved Baseline Snapshot:** Read-only reference document preserved 100% intact to satisfy institutional document control requirements. |
| `docs/Chapter-1-3-UPDATED-DRAFT-BEFORE-DIAGRAM-UPDATES.docx` | **Historical Draft Snapshot:** Preserved intact as an archival milestone. |
| `docs/Chapter-1-3-UPDATED-DRAFT.docx` | **Working Draft Binary Document:** All required changes to Chapters 1–3 are exhaustively logged, referenced, and highlighted in [`docs/Chapter-1-3-CHANGE-LOG.md`](file:///c:/Users/andre/Downloads/LabSync/docs/Chapter-1-3-CHANGE-LOG.md) (Changes 1–44). |
| `docs/audits/ARCHITECTURE_AUDIT.md` | Historical audit report from initial architecture review; preserved as a historical snapshot. |
| `docs/audits/FINAL_RUNTIME_VALIDATION.md` | Historical validation report from previous runtime milestone; preserved as a historical snapshot. |
| `docs/audits/POST_REFACTOR_VALIDATION.md` | Historical post-refactor test run log; preserved as a historical snapshot. |
| `docs/audits/REFACTOR_REPORT.md` | Historical modularization refactor report; preserved as a historical snapshot. |
| `docs/releases/v1_0_0_feature_summary.md` | Release documentation for Version 1.0.0; preserved as a historical release note. |
| `docs/releases/v1_2_0_feature_summary.md` | Release documentation for Version 1.2.0; preserved as a historical release note. |
| `docs/diagrams/mis-ojt/*.png` | Static diagram image assets for OJT workflow documentation (Diagrams 1 through 8). |

---

## 3. New Features Reflected

### A. Program Coordinator Role
- **Purpose & Rationale:** Introduced as an academic administrative role to assist the IT Department Head in class timetable scheduling, syllabus management, and instructor directory maintenance without granting full super-administrative privileges.
- **Allowed Capabilities:** Access to Schedule Studio (`room-schedule-editor.html`), collaborative draft timetable creation and editing (`schedule_drafts`), Save Draft operations, cross-room instructor collision detection, regular Faculty account management (`POST /api/faculty/add`, edit, delete non-head faculty), and personal second-key request submissions.
- **Strict Restrictions (HTTP 403 Forbidden):** Cannot finalize working drafts into official schedules (`POST /api/schedules/finalize`), cannot reopen official schedules (`POST /api/schedules/reopen`), cannot approve or reject key authorization requests (`POST /api/keys/requests/:id/approve`), cannot provision, edit, or deactivate MIS Staff accounts, cannot manage OJT Intern accounts, and cannot alter or demote the IT Department Head account.

### B. IT Department Head Enhancements
- **Exclusive Authority:** Sole authority to finalize draft timetables into live official schedules (`POST /api/schedules/finalize`) and reopen official schedules (`POST /api/schedules/reopen`).
- **User Management Governance:** Exclusive authority to provision, modify, soft-deactivate, and replace permanent MIS Staff accounts (`/api/mis-staff`).
- **Leadership Delegation:** Exclusive capability to transfer administrative leadership to another faculty member.
- **Key Authorization Approvals:** Exclusive queue to approve or reject multi-key advance reservation requests.
- **PC Report Follow-Up Escalation:** Exclusive capability to trigger formal follow-up actions on unresolved defect tickets, throttled to once per calendar day per report.

### C. Unified User Management & MIS Staff Lifecycle
- **Conceptual Structure:**
  ```text
  User Management (faculty-management.html)
  ├── Faculty Directory (Managed by IT Head & Program Coordinator)
  ├── MIS Staff (Managed Exclusively by IT Head)
  └── OJT Interns (View-only Directory; Managed Exclusively by MIS Staff)
  ```
- **Single Active Staff Concurrency Guard:** MariaDB named advisory locks (`GET_LOCK('labsync_active_mis_lifecycle_lock', 10)`) prevent race conditions and enforce a single active MIS technician.
- **Replacement Workflow:**
  ```text
  Active MIS Staff ➔ Resigns/Departs ➔ IT Head Deactivates ➔ Vacant Position ➔ IT Head Provisions Replacement ➔ New MIS Active
  ```
- **Soft Deactivation & Historical Preservation:** Former MIS accounts transition to `Status = 'DEACTIVATED'`. Active sessions are immediately destroyed (HTTP 401 `ACCOUNT_DEACTIVATED`) and key dock scans are rejected. Past repair attribution in `maintenance_issues.Resolved_By_User_ID` is permanently preserved.
- **OJT Supervision Delegation:** Permanent MIS Staff retains exclusive operational authority to create, update, and deactivate OJT Intern accounts (`/api/ojt`).

### D. Collaborative Master Schedule & Draft Studio
- **Storage Decoupling:** Working drafts reside in `schedule_drafts`, completely decoupled from live production timetables in `schedules`.
- **Optimistic Concurrency Control (OCC):** Managed in `schedule_metadata` with an integer `Version` counter and `Status` (`Draft` / `Finalized`).
- **In-Memory Room Lease Locking (`services/roomLockService.js`):** Enforces 30-second leases with client heartbeat renewals (`editSessionToken`). Editing different rooms in parallel is permitted, while simultaneous edits to the same room return HTTP `423 Locked`.
- **Print & Watermark Protection:** Print button is disabled while in `Draft` state; print layouts apply an amber `"WORKING DRAFT – FOR REVIEW ONLY"` watermark, whereas finalized timetables display a green `"OFFICIAL SCHEDULE"` banner.

### E. PC Maintenance Report Follow-Up Escalation
- **Authorization:** Restricted exclusively to the IT Department Head (`POST /api/reports/:reportId/follow-up`).
- **Once-per-Calendar-Day Guard:** Atomic SQL check enforces:
  ```sql
  UPDATE maintenance_issues
  SET Follow_Up_Count = Follow_Up_Count + 1,
      Followed_Up_At = NOW(),
      Followed_Up_By_User_ID = ?
  WHERE Issue_ID = ? AND Status != 'Resolved'
    AND (Followed_Up_At IS NULL OR DATE(Followed_Up_At) < CURDATE())
  ```
- **Audit Logging:** Logs a `PC_REPORT_FOLLOW_UP` event in `audit_logs`.

### F. Faculty Second-Key Advance Reservation Workflow
- **Rules:** Instructors and Program Coordinators can request keys for dates up to the Saturday of the following week (Monday through Saturday horizon).
- **Absolute Ceiling:** Maximum 2 keys simultaneously per instructor under all circumstances.
- **Status Lifecycle:** `PENDING` ➔ `APPROVED` ➔ `CLAIMED` (upon withdrawal) ➔ `COMPLETED` (upon dock return).
- **Approval:** Strictly restricted to the IT Department Head.

### G. Student ID QR Verification for Workstation Reports
- **Two-Step Progression:**
  ```text
  Scan Workstation PC QR ➔ Scan Student ID QR (student-id-verification.html) ➔ Detect Student Identity ➔ Pre-Fill submit-pc-report.html ➔ Enter Section ➔ Submit Report
  ```
- **Session Nonces:** 64-character cryptographic tokens in `student_verification_sessions` (Migration 022) with 15-minute expiration and single-use consumption (`Is_Used = 1`).
- **Pre-Filling:** Automatically obtains and locks **Student Name** and **Student Number**; Section is entered manually by the student.

### H. IoT Key Box Access Control Alignment
- **Authorized Badge Scan Roles (`KEY_BOX_ACCESS_ROLES`):** Faculty, IT Department Head, Program Coordinator, and MIS Staff.
- **Unauthorized / Rejected Entities:** OJT Interns (blocked from physical key dock, profile QR tab hidden), Student/Public visitors, and Deactivated accounts (`ACCOUNT_DEACTIVATED`).

---

## 4. Diagrams Updated

All conceptual and formal diagrams across `docs/SYSTEM_DOCUMENTATION.md`, `docs/NEW-IMPLEMENTATION-UPDATES.md`, and `docs/Chapter-1-3-CHANGE-LOG.md` have been updated:

### 1. Role-Based Access Control Architecture
```text
                                 USER LOGS IN
                                      │
                           SYSTEM IDENTIFIES ROLE
                                      │
    ┌────────────────┬────────────────┼────────────────┬────────────────┐
    ↓                ↓                ↓                ↓                ↓
IT DEPT. HEAD   PROGRAM COORD.    FACULTY          MIS STAFF           OJT
(Super Admin)   (Academic Lead)   (Instruction)   (Technical Admin) (Tech Support)
    │                │                │                │                │
• Full Access   • Faculty CRUD   • My Schedule   • MIS Dashboard  • OJT Dash
• MIS Lifecycle   (Regular only) • Room Status   • Maint. Tracker • Maint. Tracker
• Schedule Final• Draft Schedules• Key Transfer  • OJT Mgmt       • Profile Settings
• Key Approval  • Own 2nd Key    • Own 2nd Key   • Key Inventory  (Admin Menus
• Follow-Up     • Room Locks     • Profile QR    • PC QR Studio     Blocked)
• PDF Reports   • Profile QR                     • Profile QR
```

### 2. Context Data Flow Diagram (Level 0 DFD)
- **External Entities (6 Actors + External Services):**
  1. IT Department Head
  2. Program Coordinator
  3. Faculty Member
  4. MIS Staff
  5. OJT Intern
  6. Student / Public Visitor
  - IoT Key Box (ESP32 Key Dock Hardware)
  - Transactional Email Service (Nodemailer SMTP)
  - Central MariaDB / MySQL Database

### 3. Level 1 Data Flow Diagram (Decomposed into 8 Core Processes)
- **Process 1.0:** User Management & Succession Lifecycle (Faculty, MIS Staff, OJT)
- **Process 2.0:** Collaborative Schedule Management & Draft Isolation (`schedule_drafts`, `schedule_metadata`, room locking)
- **Process 3.0:** IoT Key Dock & Physical Key Custody (badge scanning, ADC sensing, occupancy log)
- **Process 4.0:** Mobile Peer-to-Peer Key Transfer (hallway handoffs, custody updates)
- **Process 5.0:** Multi-Key Authorization & Advance Reservations (2-key ceiling, Dept Head approval)
- **Process 6.0:** Verified PC Fault Reporting & Follow-Up (Student ID QR verification, session nonces, follow-up escalation)
- **Process 7.0:** Maintenance Work Order Servicing & Attribution (deduplication, resolver ID attribution)
- **Process 8.0:** Security Audit Logging & PDF Report Generation (immutable audit trail, publication-grade PDF)

### 4. Entity-Relationship Diagram (ERD — 18 Database Entities)
- Fully incorporates:
  - `schedule_drafts` (Working draft course entries)
  - `schedule_metadata` (OCC versioning and publication state)
  - `student_verification_sessions` (Cryptographic verification nonces)
  - `maintenance` (Workstation incident reports with student identifier)
  - `maintenance_issues` (Defect deduplication entity with follow-up escalation tracking fields: `Follow_Up_Count`, `Followed_Up_At`, `Followed_Up_By_User_ID`)
  - `schedule_key_reminders` (Automated key return reminder dispatch queue)

---

## 5. Database Documentation Updated

The database documentation now accurately accounts for all **18 active tables** and **26 migration files** (numbered 001 to 025, with two numbered 014: `014_add_user_updated_at.sql` and `014_create_key_authorization_requests.sql`):

### Affected New & Modified Database Components

| Table | Migration File | Columns Added / Modified | Purpose |
| :--- | :--- | :--- | :--- |
| `maintenance` | `021_add_student_number_to_maintenance.sql` | `Student_Number` (VARCHAR(50) DEFAULT NULL AFTER `Student_Name`) | Records BulSU student identifier on workstation incident reports for accountability. |
| `student_verification_sessions` | `022_create_student_verification_sessions.sql` | `Session_ID`, `Verification_ID`, `Nonce`, `Student_Name`, `Student_Number`, `Room_Number`, `PC_Number`, `Issued_At`, `Expires_At`, `Used_At` | Enforces ephemeral 15-minute verification nonces for physical Student ID QR reporting with replay protection. |
| `maintenance_issues` | `023_add_maintenance_issue_follow_up.sql` | `Follow_Up_Count` (INT NOT NULL DEFAULT 0), `Followed_Up_At` (DATETIME NULL), `Followed_Up_By_User_ID` (INT NULL FK to users) | Tracks IT Department Head administrative follow-up escalation on unresolved maintenance reports. |
| `schedule_metadata` | `024_create_schedule_metadata.sql` | `Metadata_ID`, `Room_ID`, `Academic_Year`, `Semester`, `Version`, `Status` (`Draft` / `Finalized`), `Finalized_By`, `Finalized_At`, `Updated_By`, `Created_At`, `Updated_At` | Manages Optimistic Concurrency Control (OCC) versioning and timetable publication status. |
| `schedule_drafts` | `025_create_schedule_drafts.sql` | `Draft_ID`, `User_ID`, `Room_ID`, `Subject_Name`, `Section`, `Day_of_Week`, `Start_Time`, `End_Time`, `Academic_Year`, `Semester`, `Color_Theme`, `Created_At`, `Updated_At` | Isolates working timetable drafts from live production schedules during collaborative drafting. |

### Features Requiring No Schema Migration (In-Memory / Behavioral)
- **Collaborative Room Lease Locking:** Handled in-memory via `services/roomLockService.js` with 30-second TTL and client heartbeats (`editSessionToken`).
- **Single Active MIS Named Advisory Lock:** Handled via database engine primitives (`GET_LOCK('labsync_active_mis_lifecycle_lock', 10)`).
- **Program Coordinator Role Logic:** Handled via role constants in `middleware/auth.js` (`IT_HEAD_ROLES`).
- **Watermark Print Guards:** Handled via frontend DOM manipulation and print layout CSS.

---

## 6. Final Consistency Check

A comprehensive verification audit was conducted against the active codebase, database schema, and test suite:

1. **Role Accuracy Confirmed:**
   - Program Coordinator is recognized as an academic administrative role (`IT_HEAD_ROLES`), distinct from Super Admin / IT Department Head (`IT_DEPT_HEAD_EXCLUSIVE_ROLES`).
   - Program Coordinator is strictly prohibited from finalizing/reopening schedules, approving key requests, managing MIS Staff, and managing OJT Interns (all return HTTP 403 Forbidden).
2. **Account Governance Confirmed:**
   - IT Department Head exclusively manages MIS Staff (`/api/mis-staff`).
   - MIS Staff exclusively manages OJT Interns (`/api/ojt`).
   - IT Department Head and Program Coordinator view OJT Interns in read-only mode (`GET /api/ojt` via `OJT_READ_ROLES`) in User Management (`faculty-management.html`) and cannot provision or modify them (HTTP 403 Forbidden).
3. **User Management Terminology Confirmed:**
   - Unified User Management (`faculty-management.html`) correctly represents the three category tabs (Faculty, MIS Staff, OJT Interns).
4. **Draft vs. Official Timetable Confirmed:**
   - Save Draft commits solely to `schedule_drafts`. Live `schedules` remain unaltered until explicit finalization by the IT Department Head.
5. **Key Dock Access Confirmed:**
   - MIS Staff possesses personal QR credentials authorized for key dock withdrawal for maintenance.
   - OJT Interns and Students are strictly blocked from key dock access.
6. **Database Schema & Migrations Confirmed:**
   - Active database schema consists of exactly **18 tables** backed by **26 migration files** (numbered 001–025, with two numbered 014).
   - All references to fabricated migration names have been removed and replaced with actual files: `021_add_student_number_to_maintenance.sql`, `022_create_student_verification_sessions.sql`, `023_add_maintenance_issue_follow_up.sql`, `024_create_schedule_metadata.sql`, and `025_create_schedule_drafts.sql`.
7. **API Endpoints Confirmed:**
   - All listed endpoints match actual Express route registrations. Non-existent endpoints (`/api/reports/verification-session/:token`) have been eliminated.
8. **Automated Test Suite Verified:**
   - Full-suite test runner execution metric: **173 passed, 0 failed, 0 cancelled, 0 skipped, Exit code 0**.

---

### Final Documentation Status: `READY FOR PAPER UPDATE`

All documentation files in `docs/` now strictly align with the current implementation, active database schema, middleware authorization rules, and test metrics.

*Report prepared and certified for the Bulacan State University – Sarmiento Campus Capstone Documentation Repository.*
