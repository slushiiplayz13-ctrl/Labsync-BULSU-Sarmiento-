# LabSync Chapter 1–3 Academic Manuscript Update Summary

**Date:** October 8, 2026  
**Project:** LabSync – An IoT-Based IT Laboratory Availability and Equipment Monitoring System Using QR Codes  
**Institution:** Bulacan State University – Sarmiento Campus  

---

## 1. Original PDF

* **Filename:** `CHAPTER 1-3  (10-8-26).pdf`
* **Status:** **Preserved 100% untouched and pristine**
* **File Size:** 2,320,912 bytes
* **Total Pages:** 77 pages
* **SHA-256 Hash:** `bf02b2d7e418bb90be68d1ea00e62a1c62f22b821422bca4ff96700c25a7d656`

---

## 2. Updated PDF

* **Filename:** `CHAPTER 1-3  (10-8-26) - UPDATED.pdf`
* **Status:** Successfully generated as an independent, updated academic document
* **File Size:** 1,769,941 bytes
* **Total Pages:** 77 pages (identical pagination and academic formatting preserved)
* **Visual Style:** Exact match to original Google Docs / Arial typography, margins (1.5" left binding, 1.0" right/top/bottom), headers, and footers.

---

## 3. Sections Updated

The following specific manuscript sections were updated to reflect the current LabSync implementation:

### Chapter 1: The Problem and Its Background
1. **Summary Overview (Page 5):**
   * Incorporated the **Program Coordinator** role as the academic administrative collaborator.
   * Documented collaborative schedule drafting with working draft isolation.
   * Clarified that the IT Department Head holds sole authority over official master schedule finalization.
2. **Significance of the Study (Pages 11–12):**
   * **Faculty Members:** Added advance second-key reservation requests (up to following week's Saturday for authorized lab sessions).
   * **IT Department Head:** Documented unified User Management (administering Faculty and MIS Staff), MIS Staff replacement lifecycle enforcing one active technician, schedule finalization/reopening authority, second-key request approval/rejection, and PC report follow-up tracking.
   * **Program Coordinator (New Subsection):** Formally introduced this administrative collaborator role, detailing draft timetable preparation, instructor assignment monitoring, PC fault condition reviews, faculty profile management, own second-key requests, and strict restrictions preventing official finalization or technical staff management.
   * **MIS Staff / Technical Custodians:** Documented that IT Department Head creates/manages MIS accounts, executes soft deactivation and replacement workflows, while MIS Staff exclusively manages OJT Intern accounts.
3. **Scope and Delimitations – Scope (Page 14):**
   * Documented the **Student ID QR Verification** dual-stage optical scanning workflow before ticket submission.
   * Documented the web portal's unified **User Management** module, collaborative Schedule Studio draft isolation, IT Department Head exclusive finalization/reopening, faculty second-key reservations, and PC report follow-up inquiries.
4. **Definition of Terms (Page 19):**
   * Added definitions for:
     * **Collaborative Master Schedule / Draft Schedule**
     * **PC Report Follow-Up**
     * **Program Coordinator**
     * **Student ID QR Verification**
     * **User Management**

### Chapter 2: Review of Related Literature and Systems
* **Status:** Evaluated and confirmed accurate. Table 1 (Page 28) compares general architectural features across enterprise platforms (Cisco, IBM, Google, Skedda, SchoolDude, LabWare, LabSync) at a high level. No artificial literature, fabricated studies, or citations were added, adhering strictly to capstone research integrity.

### Chapter 3: Design and Methodology
1. **Functional Requirements Table 2 (Pages 32–33):**
   * **FR-01 (User Authentication and Role Management):** Updated to encompass five defined roles (IT Dept Head, Program Coordinator, Faculty, MIS Staff, OJT Intern) and unified User Management.
   * **FR-03 (Laboratory Schedule Management):** Updated to specify collaborative draft editing (`schedule_drafts`), room lease locks, professor conflict detection, and IT Department Head exclusive finalization and reopening.
   * **FR-04 (PC Fault Reporting and Maintenance):** Updated to include dual QR scanning (workstation QR plus Student ID QR verification) and IT Department Head follow-up tracking on unresolved tickets.
   * **FR-06 (Key Transfer and Room Claim):** Updated to include faculty and Program Coordinator advance second-key requests subject to IT Department Head approval.
   * **Table 2 Summary (Page 33):** Updated to reflect collaborative scheduling, Student ID QR verification, 2nd-key reservations, and one-active-technician MIS lifecycle management.
2. **Context Diagram (Level 0) – Figure 3 & Text (Pages 43–44):**
   * Added **Program Coordinator**, **OJT Intern**, and **IoT Smart Key Box (ESP32)** external entities and data flows.
   * Updated descriptive text to outline specific data flows for each entity.
3. **Level 1 Data Flow Diagram (DFD) – Figure 4 & Text (Pages 45–47):**
   * Updated Process 1.0 (User & Access Management): Integrated Program Coordinator and unified User Management (IT Head managing Faculty/MIS Staff; MIS Staff managing OJT Interns).
   * Updated Process 2.0 (Scheduling & Room Monitoring): Added collaborative draft creation, `D8 Schedule Drafts`, `D9 Schedule Metadata` (OCC versioning), room editing locks, and IT Head exclusive finalization/reopening in `D2 Schedules`.
   * Updated Process 3.0 (Equipment Maintenance & Verification): Added Student ID QR Verification (`D10 Student Verification Sessions`) and IT Head PC Report Follow-up.
   * Updated Process 5.0 (Key Custody & Authorization Management): Added advance second-key reservations (`D11 Key Authorization Requests`) and IT Head approvals.
4. **Use Case Diagram – Figure 5 & Text (Pages 48–49):**
   * Added actors: **Program Coordinator** and **OJT Intern**.
   * Added use cases: Finalize / Reopen Master Schedule, Manage Unified Users (Faculty & MIS Lifecycle), Approve / Reject Second-Key Requests, Record PC Report Follow-Up, Collaborate on Schedule Drafts, Request Second Key, Scan Student ID QR Verification, Inspect Assigned PC Faults, and Submit Diagnostic Remarks.
   * Updated accompanying textual narrative for each user role.
5. **Entity Relationship Diagram (ERD) & Database Text (Pages 50–51):**
   * Documented all **18 active tables** across 26 migrations.
   * Added and explained `schedule_drafts`, `schedule_metadata`, `student_verification_sessions`, and `key_authorization_requests`.
   * Documented enhanced fields: `maintenance.Student_Number` and `maintenance_issues` follow-up fields (`Follow_Up_Count`, `Followed_Up_At`, `Followed_Up_By_User_ID`).
6. **System Architecture Diagram – Figure 8 & Text (Pages 55–57):**
   * Presentation Layer: Updated to reflect 5 distinct user roles and Student Dual QR Mobile Form.
   * System Logic & Storage: Documented Collaborative Draft Engine (room lease locking, OCC versioning), Security & Verification Services (5-role RBAC, MIS advisory lock, replay-protected student nonces), and MariaDB schema.
7. **Flowcharts (Figures 9–13 & Pages 58–63):**
   * **Figure 9 (Login Flowchart, Pages 58–59):** Added Program Coordinator (Connector PC) and OJT Intern (Connector OJ) role routing branches.
   * **Figure 10 (Department Head Flowchart, Pages 59–60):** Added User Management (Faculty & MIS Staff deactivation/replacement), Collaborative Schedule Draft Review & Finalization/Reopening, Second-Key Approvals, and PC Report Follow-Up.
   * **Figure 11 (Faculty Flowchart, Page 61):** Added Request Second Key advance reservation workflow.
   * **Figure 12 (MIS Staff Flowchart, Page 62):** Clarified OJT Intern account management and ticket resolution.
   * **Figure 13 (Student Flowchart, Page 63):** Updated to show dual-stage optical verification (Scan PC QR -> Scan Student ID QR -> Verify Nonce & Auto-fill Info -> Enter Section -> Submit Issue Report).

---

## 4. New Features Added to the Paper

1. **Program Coordinator Role:**
   * Administrative collaborator supporting schedule drafting and faculty management.
   * Strict authorization boundaries preventing schedule finalization or technical staff oversight.
2. **IT Department Head Enhancements:**
   * Sole authority to finalize or reopen official master schedules.
   * Management of unified User Management (Faculty and MIS Staff).
   * Review and approval/rejection of faculty and coordinator second-key requests.
   * Once-per-calendar-day PC report follow-up inquiries on unresolved maintenance tickets.
3. **Unified User Management & MIS Staff Lifecycle:**
   * Consolidated interface (`faculty-management.html`) managing Faculty, MIS Staff, and OJT Interns.
   * One-active-technician constraint enforced via MariaDB named advisory locks (`labsync_active_mis_lifecycle_lock`).
   * Soft deactivation, login/keybox revocation, historical audit preservation, and replacement credential generation.
4. **Collaborative Master Schedule:**
   * Two-tier schedule architecture isolating working drafts (`schedule_drafts`) from official published schedules (`schedules`).
   * Optimistic Concurrency Control (OCC) tracked via `schedule_metadata(Version)`.
   * In-memory room lease locking (30-second leases with heartbeats) preventing simultaneous same-room edits while permitting different-room concurrent drafting.
   * Draft print restrictions and watermark enforcement (`WORKING DRAFT - FOR REVIEW ONLY` vs `OFFICIAL SCHEDULE`).
5. **PC Report Follow-Up:**
   * Structured administrative mechanism for IT Head to record follow-up on unresolved tickets once per calendar day.
   * Persistence of follow-up count, timestamp, and user attribution.
6. **Faculty Second-Key Workflow:**
   * Advance key reservation for authorized laboratory sessions up to following week's Saturday.
   * Strict ceiling of two simultaneous keys per instructor.
   * Department Head approval required before hardware withdrawal authorization.
7. **Student ID QR Verification:**
   * Dual-stage QR scan: Workstation PC QR followed by physical Student ID barcode/QR.
   * Single-use, 15-minute replay-protected session nonce stored in `student_verification_sessions`.
   * Automated extraction of Student Name and Student Number with manual Section input.
8. **IoT Key-Box Role Authorization:**
   * Access permitted for Faculty, IT Head, Program Coordinator, and MIS Staff (for maintenance key withdrawal).
   * Access strictly blocked for OJT Interns and Students.

---

## 5. Diagrams Updated

All 10 system diagrams and flowcharts were updated at high resolution, featuring clean academic aesthetics and prominent yet tasteful yellow highlight callouts on newly implemented features:

| Figure / Diagram | Page in PDF | Description of Updates | Highlight Details |
| :--- | :---: | :--- | :--- |
| **Figure 3. Context Diagram** | 43 | Added Program Coordinator, OJT Intern, and IoT Key Box Node entities and bidirectional data flows. | Yellow fill (`#FEF08A`) and amber border on new entities & flows; legend added. |
| **Figure 4. Level 1 Data Flow Diagram** | 45 | Added Program Coordinator entity, `D8 Schedule Drafts`, `D9 Schedule Metadata`, `D10 Student Verification Sessions`, and `D11 Key Authorization Requests`. | Yellow fill on new data stores and collaboration flows; legend added. |
| **Figure 5. Use Case Diagram** | 48 | Added Program Coordinator and OJT Intern actors; added Finalize/Reopen, MIS Lifecycle, 2nd-Key Approvals, Follow-Up, Drafts, and Student ID QR use cases. | Yellow fill and amber borders on new actors and use cases; legend added. |
| **Entity Relationship Diagram (ERD)** | 50 | Structured all 18 active tables; prominently displayed `schedule_drafts`, `schedule_metadata`, `student_verification_sessions`, `key_authorization_requests`, and follow-up/student number attributes. | Yellow table headers and yellow attribute rows on all new database entities; legend added. |
| **Figure 8. System Architecture Diagram** | 55 | Updated Presentation Layer (5 roles + dual QR mobile form), System Logic (Draft OCC engine, room lease lock, nonce verifier, MIS lock), and 18-table database. | Yellow fill on new architectural modules; legend added. |
| **Figure 9. Login Flowchart** | 58 | Added role validation and routing branches for Program Coordinator (Connector PC) and OJT Intern (Connector OJ). | Yellow fill on new role connectors; legend added. |
| **Figure 10. Department Head Flowchart** | 59 | Added User Management branch (Faculty/MIS lifecycle), Collaborative Schedule Draft Review & Finalization, Second-Key Approvals, and PC Follow-Up. | Yellow fill on new decision blocks and operational paths; legend added. |
| **Figure 11. Faculty Flowchart** | 61 | Added Request Second Key advance reservation and approval awaiting branch. | Yellow fill on second-key workflow block; legend added. |
| **Figure 12. MIS Staff Flowchart** | 62 | Clarified OJT Intern Management branch with explicit start and end date limits and ticket supervision. | Yellow fill on OJT management actions; legend added. |
| **Figure 13. Student Flowchart** | 63 | Expanded into full 7-step sequence: Scan PC QR -> Scan Student ID QR -> Verify Nonce & Auto-fill Info -> Enter Section -> Toggle Parts -> Submit -> Reset. | Yellow fill on verification and auto-fill steps; legend added. |

---

## 6. Tables / Requirements Updated

* **Table 2. Functional Requirements (Pages 32–33):**
  * `FR-01`: Updated to five defined roles and unified User Management.
  * `FR-03`: Updated to collaborative draft editing, room locks, and IT Head finalization/reopening.
  * `FR-04`: Updated to dual QR scanning and PC report follow-up tracking.
  * `FR-06`: Updated to advance second-key requests and IT Head approval.
  * `FR-10`: Reaffirmed OJT account management with hardware restrictions.
  * Summary Paragraph (Page 33): Updated to encapsulate collaborative scheduling, Student ID verification, and technician lifecycle management.

---

## 7. Database Information Updated

The manuscript's database design and ERD now reflect the verified **18 active tables** and **26 migration files**:

1. `users` (Core accounts with 5 roles: `dept_head`, `program_coordinator`, `faculty`, `mis_staff`, `ojt`)
2. `laboratories` (Physical laboratory facilities and real-time room occupancy states)
3. `lab_units` (Workstations with serialized QR codes)
4. `laboratory_keys` (Physical room keys and hardware dock status)
5. `schedules` (Official finalized class timetables)
6. `occupancy_log` (Historical check-in and key custody logs)
7. `maintenance` (Defect reports; updated with `Student_Number` via migration `021_add_student_number_to_maintenance.sql`)
8. `maintenance_issues` (Ticket resolutions; updated with `Follow_Up_Count`, `Followed_Up_At`, `Followed_Up_By_User_ID` via migration `023_add_maintenance_issue_follow_up.sql`)
9. `key_authorization_requests` (Advance second-key reservations and IT Head approvals)
10. `student_verification_sessions` (15-minute replay-protected session nonces via migration `022_create_student_verification_sessions.sql`)
11. `schedule_metadata` (Draft status and OCC versioning via migration `024_create_schedule_metadata.sql`)
12. `schedule_drafts` (Isolated working timetable drafts via migration `025_create_schedule_drafts.sql`)
13. `schedule_key_reminders` (Overdue key return deduplication logs)
14. `audit_logs` (Security and administrative event trail)
15. `faculty_profiles` (Department and faculty metadata)
16. `ojt_profiles` (Internship start and end dates)
17. `curriculum_subjects` (Official institutional course catalog)
18. `system_settings` (Institutional signatory configurations)

---

## 8. Highlight Convention

To allow academic advisers and committee members to immediately identify all modifications:
* **Text Additions & Revisions:** Rendered with a subtle academic-friendly light yellow background fill (`RGB: 254, 240, 138` / `#FEF08A`) and registered as native PDF highlight annotations (`stroke: amber/gold`).
* **Diagram Elements:** Highlighted using light yellow fills (`#FEF08A`) with distinct amber borders (`#D97706`) and clear visual tags.
* **Diagram Legends:** Every modified diagram includes a dedicated legend badge: `[Yellow Box] = Implemented / Updated Feature`.
* **Captions:** Captions for updated diagrams are highlighted with light yellow background fills and annotations.

---

## 9. Content Not Changed

The following major sections were reviewed and intentionally retained without alteration because they remain 100% accurate:
* **Title and Preliminary Pages (Pages 1–4):** Institutional titles, problem motivation, and SDG alignments.
* **Background Context (Pages 6–10):** Historical campus context, SDG targets, general objectives, and research questions.
* **Delimitations (Pages 15–16):** Hardware scope boundaries (no magnetic door strikes, no CCTV facial scanning, fail-secure Wi-Fi behavior).
* **Chapter 2 Literature Review (Pages 20–31):** Published local and international studies, Smart Campus paradigms, and Table 1 comparative system matrix.
* **Methodology – RAD Framework & Conceptual Framework (Pages 37–42):** Figures 1 and 2 representing RAD phases (Requirements Planning, User Design, Construction, Cutover) and IPO framework.
* **Hardware Schematics & Pin Mappings (Pages 51–54):** Figures 6–7 (Circuit Diagram, Pictorial Diagram) and Table 5 (ESP32 Pin Mapping Table).
* **Cost and Benefit Analysis (Pages 65–69):** Tables 7–11 covering human resources, software licensing, hardware BOM, utilities, and total development cost.
* **Evaluation Framework (Pages 69–73):** ISO/IEC 25010 evaluation metrics (Table 12) and TAM survey instruments.
* **References (Pages 74–77):** Complete bibliography of academic literature.

---

## 10. Final Verification Checklist

- [x] **Original PDF Preserved:** `CHAPTER 1-3  (10-8-26).pdf` was never overwritten or modified (SHA-256 hash verified identical before and after).
- [x] **Updated PDF Created:** `CHAPTER 1-3  (10-8-26) - UPDATED.pdf` generated cleanly as an independent 77-page document.
- [x] **All Modifications Highlighted:** Every updated paragraph, table row, diagram element, and caption contains visible light-yellow highlighting.
- [x] **Diagrams Verified:** All 10 diagrams generated at high resolution with consistent typography and visual hierarchy.
- [x] **Database Schema Verified:** Exactly 18 active tables and verified migrations (021–025) documented without fabrication.
- [x] **Role Permissions Cross-Checked:** Program Coordinator properly bounded (no finalization, no MIS/OJT management); IT Head authority accurately depicted.
- [x] **Zero Code Changes:** No application source code, database tables, migrations, or test files were altered.
