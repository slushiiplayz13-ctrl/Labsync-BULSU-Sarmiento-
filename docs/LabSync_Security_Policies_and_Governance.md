# BULACAN STATE UNIVERSITY — SARMIENTO CAMPUS
## IT 403P: Information Assurance and Security
### Capstone Security Policy Writing Activity
**LabSync: An IoT-Based IT Laboratory Availability and Equipment Monitoring System**  
**Author:** Andrei A. Gabito | **Section & Group:** Group 3 (G03), BSIT 4E2  
**Document Version:** Version 1.7 — Final Corrected Draft for Review | **Proposed Effectivity Date:** November 1, 2026 (Subject to institutional approval)

---

## OVERALL PURPOSE, SCOPE, AND SYSTEM CONTEXT

### 1. Institutional Purpose and Capstone Context
LabSync is an IoT-based information system engineered for the College of Information and Communications Technology (CICT) at Bulacan State University — Sarmiento Campus. The platform provides real-time visibility into computer laboratory room availability, automates physical laboratory key custody tracking, streamlines public computer workstation maintenance defect reporting, and maintains verifiable administrative audit trails.

The primary objective of this comprehensive Security Policies and Governance document is to propose an Information Assurance and Security (IAS) baseline for institutional review and approval by Bulacan State University. It articulates proposed technical controls, operational safeguards, and administrative responsibilities designed to protect institutional data confidentiality, system availability, physical laboratory assets, and student privacy once formally adopted.

### 2. Major System Components
The LabSync architecture encompasses six interdependent functional subsystems:
1. **Web Application & Account Management:** A Node.js and Express server delivering role-based web portals for administrators, coordinators, faculty, and student assistants, governed by session security, salted bcrypt password hashing, and active account verification.
2. **Faculty Timetable Scheduling & Room Status Management:** Collaborative scheduling interfaces supporting draft schedule coordination, professor cross-room conflict validation, and strict term timetable finalization.
3. **Student ID QR Verification & Public PC Maintenance Reporting:** A privacy-preserving defect reporting portal utilizing optical QR scanning, server-side HMAC-SHA256 verification tokens, database nonces, and client-IP rate limiting to accept student workstation maintenance tickets without manual typing friction.
4. **Physical Key Custody & ESP32 Key Dock Monitoring:** An IoT key monitoring dock utilizing analog resistor-divider circuitry, local 30-second audible buzzer alarms, and NVS flash event buffering to monitor physical key presence for calibrated computer laboratories.
5. **IoT Communications & Telemetry Pipeline:** Decoupled dual-core microcontroller firmware communicating with backend REST endpoints via HTTPS, transmitting periodic telemetry heartbeats and spooled security alerts.
6. **Data Protection, Recovery, External Notifications, & Audit Retention:** Relational database storage (MySQL/MariaDB), manual compressed database exports (`.sql.gz`) with SHA-256 integrity verification, isolated test database restoration, Google Apps Script Web App HTTPS email dispatches, and automated calendar-year log pruning.

### 3. Governed User Groups and Information Types
* **Governed User Roles:** IT Department Head, Program Coordinators, MIS Staff, Faculty Members, Enrolled Students / Workstation Users, Student On-the-Job Trainees (OJTs), Designated Technical Administrators, and Designated Network Administrators.
* **Governed Information Types:** Authentication credentials (bcrypt password hashes, session cookies), student personally identifiable information (student ID numbers, full names), academic timetables, physical key custody logs, room occupancy telemetry, workstation maintenance defect tickets, administrative security audit trails, and database backup archives.

### 4. Operational Boundaries, Exclusions, and Core Assumptions
* **Formally Excluded Systems:** University-wide registrar enrollment systems, student academic class attendance accounting, physical university ID card printing and manufacturing, campus-wide core network routing and firewall switches, and physical building life-safety or evacuation mechanisms.
* **Core Technical Assumptions:** The web application operates behind an edge reverse proxy terminating secure HTTPS; laboratory workstations access the system via modern standards-compliant web browsers; and the physical key dock is situated inside the MIS Office, though continuous physical access controls and staff supervision remain subject to operational verification.

### 5. Whole-Project Security Coverage Matrix

The matrix below illustrates how the five security policies collectively govern all core functional modules, user roles, data assets, and operational workflows of the LabSync system:

| Functional Module & Operational Scope | Primary Governed Assets & Activities | Applicable User Roles | Governing Policy & Key Clauses | Current Implementation Posture |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Account Lifecycle** | User passwords, web sessions, OJT access validity, administrative roles, user deactivation. | IT Department Head, Program Coordinator, MIS Staff, Faculty, Student OJTs | **Policy 1:** Clauses 1.4.1 – 1.4.6 | Salted bcrypt (cost 12), live DB status checks, and OJT expiration are active. Welcome email passwords and Remember Me require remediation. |
| **Faculty Schedules & Timetable Locks** | Class schedules, room availability displays, timetable edit locks, schedule finalization. | IT Department Head, Program Coordinator, Faculty Members | **Policy 1:** Clause 1.4.2<br>**Policy 3:** Clause 3.4.3 | Schedule conflict validation, collaborative draft editing, and timetable finalization are active under `IT_HEAD_ROLES` (shared by Department Head and Program Coordinators) with room lock enforcement. |
| **Student ID Capture & PC Reporting** | Student identification numbers, student names, PC maintenance tickets, kiosk displays. | Enrolled Students, Laboratory Technicians, MIS Staff, Student OJTs | **Policy 2:** Clauses 2.4.1 – 2.4.6 | HMAC-SHA256 tokens ($\le 10\text{ min}$), DB nonces, rate limits, and room/PC binding are active. Kiosks mask IDs; backend logs require PII sanitization. |
| **Physical Laboratory Key Custody** | Centralized physical keys, key dock slots, room occupancy tracking, audit logbooks. | Faculty Members, MIS Staff, IT Department Head, Campus Security | **Policy 3:** Clauses 3.4.1 – 3.4.6 | Analog resistor-divider sensing and buzzer alarms are active for Rooms 203 & 204. Uncalibrated rooms (201, 202, 205, 206, 303, 304) require manual logbooks. |
| **IoT Hardware, Firmware & Network** | ESP32 microcontrollers, ADC sensors, Wi-Fi credentials, TLS transport, offline telemetry buffer. | Designated IoT Maintainer, Designated Network Admin, MIS Staff | **Policy 4:** Clauses 4.4.1 – 4.4.6 | Bearer token auth, 16-alert NVS spooling, and in-place heartbeat updates are active. Firmware `client.setInsecure()` and committed Wi-Fi secrets require remediation. |
| **Data Protection, Recovery & Logs** | Relational database archives, audit trails, runtime environment secrets, email relays. | Designated Technical Admin, MIS Staff, Hosting Manager, IT Dept Head | **Policy 5:** Clauses 5.4.1 – 5.4.7 | Manual on-demand export (`.sql.gz`) with SHA-256 digest, calendar-year log pruning, and test DB restore are active. Automated cron and offsite storage are proposed. |

---

## RISK ASSESSMENT METHOD

Likelihood and impact are evaluated on a standardized three-point qualitative scale to determine realistic security priorities for the LabSync system:

* **Likelihood:** 1 = Unlikely (requires specialized access, complex timing, or rare circumstances), 2 = Possible (can occur during routine laboratory operations or via readily accessible interfaces), 3 = Likely (expected to occur frequently due to missing technical safeguards or standard operational turnover).
* **Impact:** 1 = Minor (localized operational inconvenience, no data loss or privacy exposure), 2 = Significant (partial service disruption, recoverable data loss, or privacy risk affecting individual records), 3 = Severe (system-wide compromise, unrecoverable data loss, physical security bypass, or statutory privacy violation).
* **Priority Score:** Priority is calculated as $\text{Score} = \text{Likelihood} \times \text{Impact}$.
* **Priority Levels:** 1–2 = **LOW**, 3–4 = **MEDIUM**, 6 = **HIGH**, 9 = **CRITICAL**.

All risk ratings represent qualitative assessments derived from active repository architecture audits, verified hardware circuit boundaries, and realistic operational threat models for an academic computing facility. They do not claim that unverified campus-wide physical security, network infrastructure, or institutional procedures have been independently validated.

**Framework Alignment:** These policies use the NIST Cybersecurity Framework (CSF) 2.0 to organize LabSync security responsibilities across core functions: *Govern* (GV) establishes policy ownership, approval workflows, and review procedures; *Identify* (ID) supports asset categorization and threat modeling; *Protect* (PR) governs identity authentication, role boundaries, data privacy, physical key docking, and credential hygiene; *Detect* (DE) and *Respond* (RS) govern real-time tamper alarms, offline telemetry spooling, and incident reviews; and *Recover* (RC) guides database backups and disaster recovery simulations. This represents an academic alignment to industry best practices, not a claim of formal certification or institutional accreditation.

---

## POLICY 1 — ACCOUNT LIFECYCLE, AUTHENTICATION, AND ROLE-BASED ACCESS CONTROL

### 1.1 Policy Identity and Purpose
* **Owner:** MIS Staff (Operational Lead) / System Administrator
* **Approving Authority:** IT Department Head
* **Version and Proposed Effectivity:** Version 1.7 | November 1, 2026 (Subject to institutional approval)
* **Security Objective:** Establish strict controls over credential protection, administrative privilege segregation, session persistence, and account termination to prevent unauthorized privilege escalation and audit trail degradation. This policy aligns with NIST CSF 2.0 functions *PROTECT (PR.AA-01, PR.AA-05)* and *GOVERN (GV.PO-01)*.

### 1.2 Scope and Context
This policy governs administrative and faculty web application access, user onboarding, password storage, session lifetimes, role-based authorization, and account deactivation across the LabSync web portal. It applies to the IT Department Head, Program Coordinators, MIS Staff, Faculty Members, and Student On-the-Job Trainees (OJTs). It excludes unauthenticated public student workstation reporting (governed by Policy 2) and microcontroller hardware tokens (governed by Policy 4). It assumes the web application operates behind an edge reverse proxy terminating secure HTTPS traffic.

### 1.3 Risk Basis

1. **Risk A (R3) — Administrative Session Hijacking on Unattended Workstations:**
   * *Asset:* Authenticated administrative and faculty web sessions.
   * *Threat and weakness:* Opportunistic session hijacking on shared laboratory computers caused by persistent "Remember Me" session settings that extend session cookie validity to 30 days and exempt users from standard inactivity timeouts.
   * *Consequence:* An unauthorized person using an unattended terminal can perform administrative actions, alter schedules, access student records, or modify room statuses without re-authenticating.
   * *Current safeguards:* Standard authenticated sessions enforce a 10-minute inactivity timeout, background polling is exempted from resetting the idle timer, and user account status is verified upon each privileged request.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 3, Priority = **HIGH** (Score: 6).
   * *Brief rating rationale:* Laboratory workstations are shared by hundreds of students daily; persistent session tokens on unattended browsers present an active takeover risk.
   * *Related clauses:* Clauses 1.4.3 and 1.4.6.

2. **Risk B (R5) — Historical Audit Trail Truncation via Faculty Account Deletion:**
   * *Asset:* Historical key custody transactions, room occupancy logs, and laboratory maintenance records.
   * *Threat and weakness:* Permanent deletion of former faculty accounts via cascade deletion routines, which severs foreign-key relationships and nullifies user attribution across historical maintenance and occupancy logs.
   * *Consequence:* Historical key checkouts and equipment repair records lose instructor attribution, degrading institutional auditability and accountability.
   * *Current safeguards:* Account deletion is blocked for MIS Staff and OJT accounts; active administrative leadership accounts are protected against removal.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* Faculty turnover occurs each semester; hard deletion of user accounts destroys essential historical custody records.
   * *Related clauses:* Clause 1.4.5.

3. **Risk C (R11) — Administrative Role Boundary Blur and Unauthorized Privilege Elevation:**
   * *Asset:* Administrative configuration settings, account provisioning, backup operations, and key approval workflows.
   * *Threat and weakness:* Misaligned administrative permissions or inadequate role segregation between academic coordination and department executive leadership.
   * *Consequence:* Non-executive personnel could authorize out-of-schedule key releases, initiate database restorations, or modify core administrative accounts without executive oversight.
   * *Current safeguards:* The application middleware enforces distinct permission tiers separating general academic management (`IT_HEAD_ROLES`) from exclusive executive approvals (`IT_DEPT_HEAD_EXCLUSIVE_ROLES`).
   * *Likelihood, impact, and priority:* Likelihood = 1, Impact = 3, Priority = **MEDIUM** (Score: 3).
   * *Brief rating rationale:* Technical permission tiers exist in code, but explicit policy governance is necessary to prevent operational boundary blur between academic coordinators and department heads.
   * *Related clauses:* Clause 1.4.2.

### 1.4 Mandatory Policy Clauses
1. **Clause 1.4.1 — Cryptographic Password Protection and Onboarding Transmission:** All user passwords must be hashed using salted bcrypt with a verified work factor of 12 rounds prior to database storage. Plaintext passwords shall never be stored in the database or written to system logs. Because initial account provisioning currently transmits generated temporary passwords in plaintext via email bodies, the system must transition to short-lived, single-use credential setup links. (*Partially implemented; bcrypt work factor 12 is active at rest, but welcome email transmission requires transition to single-use setup links*)
2. **Clause 1.4.2 — Administrative Privilege Boundaries and Role Separation:** User permissions must strictly observe assigned administrative tiers. Program Coordinators possess shared academic leadership rights under `IT_HEAD_ROLES` (such as collaborative schedule editing, timetable finalization and reopening, viewing room statuses, and faculty directory oversight), but are strictly excluded from actions restricted to `IT_DEPT_HEAD_EXCLUSIVE_ROLES`—specifically Department Head-exclusive out-of-schedule key request approvals/rejections, administrative user lifecycle management, and application database backup and recovery operations. MIS Staff manage operational key custody, and Student OJTs are limited to viewing schedules, logging maintenance reports, and updating ticket statuses under supervision. Application-level database backup creation and test restoration routes remain restricted exclusively to the IT Department Head. (*Implemented*)
3. **Clause 1.4.3 — Session Inactivity Timeout and Persistent Session Restriction:** Standard authenticated web sessions must terminate automatically after exactly 10 minutes of inactivity. Because persistent "Remember Me" sessions currently bypass this idle timeout and remain valid for up to 30 days, persistent session exemptions must be strictly restricted or disabled on shared laboratory workstations. (*Partially implemented; standard 10-minute timeout is active, but persistent session exemption requires removal on shared campus computers*)
4. **Clause 1.4.4 — Mandatory OJT Account Expiration:** Every Student OJT account must be provisioned with a mandatory end date matching their official training period. The system must verify this date on every privileged request and immediately invalidate access upon reaching the expiration date. (*Implemented*)
5. **Clause 1.4.5 — Prohibition of Permanent Account Deletion:** Permanent database deletion of user records is strictly prohibited across all user tiers. Former personnel and graduating student assistants must be offboarded exclusively by updating their account status to deactivated, preserving historical key checkout and maintenance logs. Existing cascade deletion routines for faculty accounts must be refactored to status deactivation. (*Partially implemented; deactivation is enforced for administrative and OJT tiers, but faculty cascade deletion requires refactoring*)
6. **Clause 1.4.6 — Live Session Status and Role Verification:** The system must actively verify account status and assigned roles against the live database on every privileged request. If an account is deactivated or suspended, or if its role has changed, active sessions must be terminated or adjusted immediately. (*Implemented*)

### 1.5 Implementation, Verification, Roles and Enforcement
* **Responsible Roles & Implementation:** MIS Staff implement password hashing standards, configure session timeouts, and manage user provisioning. The IT Department Head reviews role assignments and authorizes privilege extensions.
* **Compliance Verification & Evidence:** Compliance is checked by reviewing authentication configurations, verifying password hash formats in database exports, testing session inactivity timeouts on laboratory workstations, and executing automated authorization tests. Evidence includes test logs, access review summaries, and timeout records.
* **Evidence to Retain:** Authentication and authorization test results, session-timeout test results, and account-review records.
* **Policy Communication and Review:** The policy owner communicates the approved policy to affected personnel through authorized university or system channels, maintains applicable acknowledgment records, provides the policy during relevant onboarding or material revisions, and reviews it annually and after significant system changes or incidents. Revisions must be approved by the designated authority.
* **Monitoring & Violation Review:** MIS Staff shall inspect the active user directory monthly to confirm that expired OJT accounts and offboarded faculty are deactivated. Suspected credential sharing, unauthorized access attempts, or session tampering must be documented and referred to the IT Department Head for administrative review under applicable university policies and procedures.
* **Exception Handling:** Temporary privilege extensions or role adjustments must be requested in writing and approved exclusively by the IT Department Head.

---

## POLICY 2 — STUDENT ID QR VERIFICATION, PRIVACY PROTECTION, AND PUBLIC PC MAINTENANCE REPORTING

### 2.1 Policy Identity and Purpose
* **Owner:** MIS Staff / Student Laboratory Assistant Supervisor (Designated)
* **Approving Authority:** IT Department Head
* **Version and Proposed Effectivity:** Version 1.7 | November 1, 2026 (Subject to institutional approval)
* **Security Objective:** Protect student personally identifiable information (PII) during identity capture, prevent ticket queue tampering, establish verifiable verification token lifecycles, and clarify the technical limits of barcode/QR ID validation. This policy aligns with Republic Act 10173 (Data Privacy Act of 2012) and NIST CSF 2.0 *PROTECT (PR.DS-01, PR.DS-02, PR.AA-01)*.

### 2.2 Scope and Context
This policy governs student identity verification associated with public PC maintenance reporting, temporary verification token generation, public workstation maintenance defect reporting, and technician ticket resolution across all BulSU IT laboratories. It applies to enrolled students submitting defect reports, laboratory technicians, MIS staff, and student assistants. It excludes university-wide registrar databases, student class attendance tracking, and physical ID card printing. It assumes that barcode/QR scanners in laboratories operate over secure local workstation connections.

### 2.3 Risk Basis

1. **Risk A (R4) — Student Personal Data Exposure via Insecure Identity Capture:**
   * *Asset:* Student personally identifiable information (student ID numbers, full names).
   * *Threat and weakness:* Interception, unmasked public display, or unauthorized logging of student personal data during laboratory workstation maintenance reporting on shared kiosk terminals.
   * *Consequence:* Privacy risk affecting individual student records, localized identity harvesting, profiling of individual students, or privacy non-compliance during public reporting.
   * *Current safeguards:* Masked student ID displays (`****-5678`) on public kiosk interfaces, cryptographically signed server-issued HMAC tokens with persistent database session nonces, and single-use consumption upon report submission.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* Reporting occurs on shared laboratory terminals where exposure of individual student records or identity harvesting poses a significant privacy risk to affected students, mitigated on kiosk displays by client-side masking and short-lived tokens.
   * *Related clauses:* Clauses 2.4.1 and 2.4.2.

2. **Risk B (R9) — Defamatory or Spam PC Maintenance Ticket Flooding:**
   * *Asset:* Laboratory workstation maintenance ticket queue and technician dispatch workflows.
   * *Threat and weakness:* Abuse of public maintenance reporting endpoints, including distributed submissions across multiple IP addresses or repeated inappropriate submissions within allowed windows.
   * *Consequence:* Queue flooding, false hardware defect claims, technician dispatch exhaustion, or injection of inappropriate remarks targeting laboratory personnel.
   * *Current safeguards:* Application middleware rate limiting (maximum 5 submissions per 10 minutes per client IP), duplicate cooldowns (1 minute per IP + Room + PC), and HTML/JavaScript input sanitization.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* Public availability enables prank or automated spam submissions, potentially disrupting technician response times despite existing IP-based rate limiting.
   * *Related clauses:* Clauses 2.4.5 and 2.4.6.

3. **Risk C (R12) — Student Verification Token Replay and Limits of Physical ID QR Codes:**
   * *Asset:* Temporary student verification tokens and workstation identity binding.
   * *Threat and weakness:* Intercepted verification tokens replayed from unverified computers; standard printed barcodes and QR codes lack cryptographic proof of physical card authenticity.
   * *Consequence:* A user may capture an HMAC token or photograph an ID barcode to falsely submit maintenance tickets under another student's identity.
   * *Current safeguards:* Cryptographically signed server-issued HMAC tokens with persistent single-use database nonce tracking, a strict 10-minute lifespan, and originating room/PC binding checks.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* Signing server-issued tokens and tracking nonces prevents payload tampering and replay in transit, but it does not prove that a scanned physical card is genuine or presented by its rightful owner.
   * *Related clauses:* Clauses 2.4.2, 2.4.3, and 2.4.4.

### 2.4 Mandatory Policy Clauses
1. **Clause 2.4.1 — Student Data Masking, Privacy Minimization, and Transport Encryption:** Student identification numbers and student names must be protected across all user interfaces and logs. On public laboratory kiosk screens and public maintenance submission confirmations, student names must be masked (e.g., displaying initials or masked formats such as `J*** D**`), and student ID numbers must display only the last four digits (e.g., `****-****-1234`). Administrative and technician maintenance review portals must minimize student PII and implement data masking in display and logs. Transport encryption (HTTPS/TLS) protects data in transit between browser and server, while backend application logs must transition to storing only masked or hashed student personal details. (*Partially implemented; kiosk frontend scripts format masked student displays, but backend endpoints and audit logs record unmasked student names and numbers, requiring server-side masking, log sanitization, and administrative UI minimization*)
2. **Clause 2.4.2 — Cryptographic Verification Token Lifespan and Persistence:** Student verification tokens must be cryptographically signed using server-side HMAC-SHA256 signatures with persistent database session nonce tracking, room and PC identifier binding, single-use consumption upon ticket submission, and an expiration window of no later than 10 minutes after issuance (TTL $\le 600{,}000\text{ ms}$). Default or placeholder signing secrets must cause the production server to halt startup. (*Implemented*)
3. **Clause 2.4.3 — Limits of Physical Student ID QR Verification:** Laboratory personnel must recognize that scanning a printed student ID QR code does not independently prove the identity of the person presenting it. Where impersonation is suspected or stronger identity assurance is required, the responsible laboratory personnel must perform an appropriate physical identity check. This is an operational verification requirement and does not imply cryptographic authentication of the physical card. (*Proposed policy control*)
4. **Clause 2.4.4 — Workstation Context Binding:** Scanned student verification tokens must be cryptographically bound to the physical laboratory room and PC number selected during identity verification. Verification tokens submitted for mismatched laboratory rooms or computer terminals must be rejected. (*Implemented*)
5. **Clause 2.4.5 — Server-Side Input Validation, Output Encoding, and Rate Limiting:** All workstation maintenance reports submitted through public interfaces must undergo strict server-side input validation (including data type checks, length constraints, and character normalization) prior to database insertion, and all user-supplied text displayed across administrative or technician review dashboards must employ context-aware output encoding to prevent cross-site scripting (XSS). Public submission endpoints must enforce IP-based rate limiting (maximum 5 submissions per client IP per 10 minutes) and duplicate report cooldowns (1 minute per IP + Room + PC) to mitigate ticket flooding. (*Partially implemented; server-side type and length validation, IP rate limits, and duplicate cooldowns are implemented in code, while comprehensive context-aware output encoding across all review dashboards remains an operational target*)
6. **Clause 2.4.6 — Technician Ticket Accountability and Deletion Restrictions:** All maintenance ticket status updates must record the authenticated technician's user identity, resolution summary, and timestamp. Regular maintenance staff and OJTs are strictly prohibited from deleting tickets; ticket deletion is restricted exclusively to the IT Department Head and MIS Staff, with mandatory audit logging of every deletion event. (*Implemented*)

### 2.5 Implementation, Verification, Roles and Enforcement
* **Responsible Roles & Implementation:** MIS Staff configure input sanitization, token lifespans, and data masking. Laboratory Technicians verify reported defects and record resolution details.
* **Compliance Verification & Evidence:** Compliance is checked by inspecting public kiosk interfaces for proper masking, verifying token expiration through automated testing, and reviewing maintenance ticket audit trails. Evidence includes redacted kiosk screenshots, ticket logs, and token test reports.
* **Evidence to Retain:** Masked report-response samples, token-validation and rate-limit test results, and ticket audit records.
* **Policy Communication and Review:** The policy owner communicates the approved policy to affected personnel through authorized university or system channels, maintains applicable acknowledgment records, provides the policy during relevant onboarding or material revisions, and reviews it annually and after significant system changes or incidents. Revisions must be approved by the designated authority.
* **Monitoring & Violation Review:** Technicians and MIS Staff must review maintenance tickets daily. Malicious ticket flooding, submission of false reports, or intentional scanning of unauthorized student IDs shall be escalated to the IT Department Head and investigated under applicable university student disciplinary rules.
* **Exception Handling:** In the event of system or scanner outages, temporary paper-based workstation maintenance report forms countersigned by the laboratory technician may be used.

---

## POLICY 3 — PHYSICAL LABORATORY KEY ACCOUNTABILITY, CUSTODY TRANSFER, AND ANTI-TAMPER MONITORING

### 3.1 Policy Identity and Purpose
* **Owner:** MIS Staff (Key Custodian Lead)
* **Approving Authority:** IT Department Head
* **Version and Proposed Effectivity:** Version 1.7 | November 1, 2026 (Subject to institutional approval)
* **Security Objective:** Establish strict custody, transfer, and automated tracking procedures for physical laboratory keys, enforce audit logging for key extraction, clearly disclose hardware dock limitations, and mandate dual authorization for out-of-schedule access. This policy aligns with NIST CSF 2.0 *PROTECT (PR.AA-06)* and *DETECT (DE.CM-02)*.

### 3.2 Scope and Context
This policy governs physical key checkouts, custody transfers, return verification, and automated dock monitoring across all eight BulSU IT laboratories (Rooms 201–206, 303, and 304). Automated key sensing using analog resistor-divider circuits and real-time extraction detection are currently supported and calibrated for **Rooms 203 and 204 only**. The remaining six rooms (Rooms 201, 202, 205, 206, 303, and 304) remain pending hardware calibration and require manual logbook tracking. The key box has **no electromechanical locks or solenoids** and cannot physically prevent manual key removal. It assumes the key dock is physically installed within the MIS Office.

### 3.3 Risk Basis

1. **Risk A (R6) — Unauthorized Key Removal on Calibrated Dock Slots:**
   * *Asset:* Calibrated physical laboratory keys (Rooms 203 and 204).
   * *Threat and weakness:* Physical extraction of keys by unauthorized personnel without an approved teaching schedule or administrative approval.
   * *Consequence:* Unsupervised laboratory access, potential hardware equipment theft, or unrecorded room occupancy.
   * *Current safeguards:* Analog resistor-divider sensor edge detection, local audible buzzer alarms (up to 30 seconds), security event queue buffering, and server transmission.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 3, Priority = **HIGH** (Score: 6).
   * *Brief rating rationale:* Although physical removal cannot be mechanically blocked, automated detection on calibrated slots immediately sounds a local alarm and logs unapproved access.
   * *Related clauses:* Clauses 3.4.1 and 3.4.5.

2. **Risk B (R7) — Key Status De-synchronization on Uncalibrated Dock Slots:**
   * *Asset:* Laboratory rooms without completed hardware sensor calibration (Rooms 201, 202, 205, 206, 303, 304).
   * *Threat and weakness:* Operating uncalibrated sensor slots under the assumption that automated tracking is active, leading to false or missing occupancy signals.
   * *Consequence:* Inaccurate dashboard room occupancy displays, missed unauthorized key removals, or tracking blind spots across multiple rooms.
   * *Current safeguards:* Uncalibrated slots are designated as pending hardware calibration, and physical paper-based sign-out logbooks are prescribed as the interim operational safeguard, though consistent daily execution and systematic reconciliation require operational verification.
   * *Likelihood, impact, and priority:* Likelihood = 3, Impact = 2, Priority = **HIGH** (Score: 6).
   * *Brief rating rationale:* Automated sensing is active only for Rooms 203 and 204. Relying on uncalibrated slots without an operationally verified manual custody routine creates tracking blind spots across the remaining six laboratory rooms.
   * *Related clauses:* Clauses 3.4.1 and 3.4.2.

3. **Risk C (R8) — Physical Key Extraction on Lockless Dock:**
   * *Asset:* All centralized laboratory physical keys.
   * *Threat and weakness:* The centralized key box is an open monitoring dock with no mechanical locks, latches, or solenoids to physically prevent key extraction.
   * *Consequence:* An unauthorized individual could forcefully take keys from the dock before staff can intervene.
   * *Current safeguards:* The key dock is physically situated inside the MIS Office. The local audible buzzer provides detection for calibrated slots in Rooms 203 and 204 only. Continuous staff supervision and physical perimeter controls remain unverified proposed safeguards.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 3, Priority = **HIGH** (Score: 6).
   * *Brief rating rationale:* Reassessed from Medium to High priority because the key dock lacks mechanical locking solenoids and continuous staff supervision or locked-door perimeters remain unverified operational assumptions; during routine laboratory operations, unauthorized physical key removal is possible, presenting a severe risk to laboratory physical security.
   * *Related clauses:* Clauses 3.4.4 and 3.4.6.

### 3.4 Mandatory Policy Clauses
1. **Clause 3.4.1 — Calibrated Automated Monitoring Scope:** Automated analog resistor-divider sensor detection, real-time status synchronization, and local alarm sounding shall apply exclusively to the currently calibrated and supported slots (Rooms 203 and 204). Automated tracking claims must not be made for uncalibrated rooms. (*Implemented*)
2. **Clause 3.4.2 — Mandatory Manual Custody for Uncalibrated Rooms:** For laboratory Rooms 201, 202, 205, 206, 303, and 304, MIS Staff and faculty members must conduct physical key issuance and return using an official paper-based key logbook as the prescribed interim safeguard until hardware sensor calibration is completed and verified. Because consistent day-to-day logbook maintenance and reconciliation have not been independently verified, this manual custody workflow is designated as an operational requirement subject to institutional enforcement and verification. (*Proposed policy control / Requires operational verification*)
3. **Clause 3.4.3 — Schedule-Based Key Authorization:** Instructors presenting a valid faculty credential or schedule authorization during their scheduled laboratory class period are automatically authorized to extract the corresponding room key. The system records the transaction with user authentication attribution. (*Implemented*)
4. **Clause 3.4.4 — Dual Authorization for Out-of-Schedule Access:** Any key withdrawal requested outside an instructor's published schedule requires secondary approval issued exclusively by the IT Department Head (`IT_DEPT_HEAD_EXCLUSIVE_ROLES`). Program Coordinators, MIS Staff, and Student OJTs are strictly prohibited from granting secondary approvals. (*Implemented*)
5. **Clause 3.4.5 — Unauthorized Removal, Alarm Activation, and Incident Logging:** For calibrated slots in Rooms 203 and 204, unauthorized key removal must immediately trigger the local audible buzzer alarm and queue an unauthorized extraction event in the microcontroller's event buffer for server transmission and audit logging. MIS Staff must review logged incidents and initiate appropriate operational follow-up. (*Partially implemented; hardware buzzer alarm and telemetry event queuing are active, while administrative incident review requires operational verification*)
6. **Clause 3.4.6 — Physical Key Box Location and Proposed Access Controls:** Because the key dock contains no mechanical locking mechanism, the unit must remain installed within the MIS Office. While the hardware is confirmed to be physically situated inside the MIS Office, continuous staff supervision and formal physical access controls—such as keeping the office locked whenever unattended, enforcing visitor escort rules, and maintaining perimeter oversight—are proposed institutional controls that require formal administrative review and approval, and must not be treated as already established or continuously maintained. Keys must never be left unattended in laboratory door locks. (*Proposed policy control / Requires operational verification and institutional approval*)

### 3.5 Implementation, Verification, Roles and Enforcement
* **Responsible Roles & Implementation:** MIS Staff manage the key dock hardware and oversee daily key custody. The IT Department Head holds exclusive authority for secondary key approvals.
* **Compliance Verification & Evidence:** Compliance is checked by conducting physical extraction tests on calibrated slots (Rooms 203 and 204), inspecting electronic security audit logs for unauthorized removal alerts, and auditing manual sign-out logbooks for uncalibrated rooms. Evidence includes security log exports and physical sign-out sheets.
* **Evidence to Retain:** Key-box test results for Rooms 203 and 204, manual custody logs for uncalibrated rooms, and reconciliation records.
* **Policy Communication and Review:** The policy owner communicates the approved policy to affected personnel through authorized university or system channels, maintains applicable acknowledgment records, provides the policy during relevant onboarding or material revisions, and reviews it annually and after significant system changes or incidents. Revisions must be approved by the designated authority.
* **Monitoring & Violation Review:** MIS Staff shall inspect physical key slots daily at closing (5:00 PM). Unreturned keys or unacknowledged unauthorized extraction events must be escalated immediately to the IT Department Head. Unaccounted key losses shall be investigated under university property accountability guidelines.
* **Exception Handling:** Emergency access during life-safety incidents shall be handled using emergency master keys held by Campus Security, with an incident report submitted within 24 hours. This operational emergency arrangement is proposed subject to formal institutional approval and confirmation by Campus Security.

---

## POLICY 4 — IOT DEVICE SECURITY, FIRMWARE HYGIENE, AND NETWORK PROTECTION

### 4.1 Policy Identity and Purpose
* **Owner:** Designated Technical Lead / IoT System Maintainer
* **Approving Authority:** IT Department Head
* **Version and Proposed Effectivity:** Version 1.7 | November 1, 2026 (Subject to institutional approval)
* **Security Objective:** Secure microcontroller communications, mandate cryptographic endpoint authentication, govern firmware credential management, ensure reliable telemetry delivery, and address transport security weaknesses. This policy aligns with NIST CSF 2.0 *PROTECT (PR.AA-03, PR.DS-02)* and *DETECT (DE.CM-01)*.

### 4.2 Scope and Context
This policy governs ESP32 microcontroller firmware, sensor communications, Wi-Fi connectivity, TLS encryption, telemetry heartbeats, and offline event spooling. It addresses the technical finding that firmware currently disables TLS certificate validation and addresses hardcoded Wi-Fi credentials in the repository. It applies to firmware developers, network administrators, and MIS technical staff. Dedicated IoT network isolation is a proposed target that requires confirmation with campus network administrators.

### 4.3 Risk Basis

1. **Risk A (R1) — Man-in-the-Middle Spoofing via Disabled TLS Certificate Validation:**
   * *Asset:* In-transit laboratory occupancy telemetry, key status updates, and device authentication tokens.
   * *Threat and weakness:* Microcontroller firmware disables TLS X.509 certificate validation via `client.setInsecure()`, allowing connections to proceed without verifying server authenticity.
   * *Consequence:* An attacker on the local network can intercept transmissions, capture device tokens, or inject forged room status messages.
   * *Current safeguards:* Device authentication requires a bearer token in request headers (`Authorization: Bearer <token>`), and traffic is transmitted over HTTPS.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 3, Priority = **HIGH** (Score: 6).
   * *Brief rating rationale:* Disabling certificate validation neutralizes TLS authentication guarantees on shared campus networks.
   * *Related clauses:* Clauses 4.4.1 and 4.4.2.

2. **Risk B (R13) — Repository Credential Exposure via Hardcoded Wi-Fi Passwords:**
   * *Asset:* Campus Wi-Fi network credentials and IoT endpoint secrets.
   * *Threat and weakness:* Wi-Fi credentials committed directly into version-controlled firmware source code in the repository.
   * *Consequence:* Unauthorized campus network access or lateral reconnaissance if the repository is shared or accessed by unauthorized individuals.
   * *Current safeguards:* Device authentication tokens are segregated into local headers (`secrets.h`), but network credentials remain in committed source files.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* Committing plaintext credentials to source control creates persistent exposure across the project development lifecycle.
   * *Related clauses:* Clauses 4.4.3 and 4.4.6.

3. **Risk C (R14) — Key Telemetry Loss via Offline Alert Queue Exhaustion:**
   * *Asset:* Offline security event alert queue stored in microcontroller flash memory.
   * *Threat and weakness:* Prolonged campus network outages that exceed the fixed capacity of the microcontroller's non-volatile flash storage queue (12 persistent slots plus 4 overflow buffer slots; 16 total alerts).
   * *Consequence:* Rejection and permanent loss of key extraction security alerts during extended network disruptions.
   * *Current safeguards:* Events are spooled to persistent non-volatile storage (`labsync_sec` NVS namespace) using thread-safe mutex operations, and the device performs automatic reconnection retries.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* Extended network disruptions risk overflowing microcontroller storage, leading to dropped incident notifications.
   * *Related clauses:* Clauses 4.4.4 and 4.4.5.

### 4.4 Mandatory Policy Clauses
1. **Clause 4.4.1 — Cryptographic Device Authentication:** All inbound requests from IoT microcontrollers must supply an authorized cryptographic device bearer token in request headers. Requests lacking valid credentials must be rejected immediately. (*Implemented*)
2. **Clause 4.4.2 — Remediation of TLS Certificate Validation:** To eliminate vulnerability to network spoofing, production firmware updates must incorporate institutional root CA certificates or public key pinning to restore genuine server certificate validation. Until deployed, this control is designated as partially implemented. (*Partially implemented; encrypted HTTPS is active, but certificate validation is currently disabled via `client.setInsecure()`*)
3. **Clause 4.4.3 — Wi-Fi Credential Rotation and Secret Hygiene:** Wi-Fi credentials previously committed to the repository must be rotated immediately on the physical network. Future firmware builds must load network credentials dynamically via non-committed local headers (`secrets.h`) or captive-portal provisioning, and plaintext credentials must never be committed to source control. (*Partially implemented; active finding requiring network credential rotation and secret decoupling*)
4. **Clause 4.4.4 — Persistent Offline Telemetry Spooling:** When network connectivity is interrupted, the microcontroller firmware must spool key security events to local non-volatile flash storage up to its fixed queue capacity (12 persistent alerts plus 4 overflow alerts, maximum 16 items). Upon reconnection, spooled events must be transmitted sequentially with original hardware timestamps. Telemetry events occurring after queue capacity is exhausted must log an overflow warning. (*Implemented*)
5. **Clause 4.4.5 — Efficient Heartbeat Telemetry Processing:** Routine microcontroller heartbeat signals (dispatched at 15-second intervals) must update laboratory availability records in place without expanding historical log tables, preventing database storage bloat. Backend monitoring considers the device offline after 60 seconds without a valid heartbeat. (*Implemented*)
6. **Clause 4.4.6 — Dedicated IoT Network Segregation:** All LabSync IoT microcontrollers must operate on a segregated laboratory Wi-Fi network with client isolation enabled, preventing direct communication between student computers and monitoring devices. This control is a proposed target that requires confirmation with campus network administrators regarding network infrastructure capabilities. (*Proposed policy control / Requires infrastructure verification*)

### 4.5 Implementation, Verification, Roles and Enforcement
* **Responsible Roles & Implementation:** The Designated Technical Lead / IoT System Maintainer manages firmware code, certificate configurations, and credential sanitization. The Designated Network Administrator oversees Wi-Fi network isolation and credential rotation.
* **Compliance Verification & Evidence:** Compliance is checked by reviewing firmware configuration code, auditing git commit histories for exposed secrets, testing TLS connections, and conducting offline network disconnection tests to verify event spooling. Evidence includes compilation logs, sanitized git diffs, and offline recovery logs.
* **Evidence to Retain:** TLS validation test results, credential-rotation records, and offline-event recovery test results.
* **Policy Communication and Review:** The policy owner communicates the approved policy to affected personnel through authorized university or system channels, maintains applicable acknowledgment records, provides the policy during relevant onboarding or material revisions, and reviews it annually and after significant system changes or incidents. Revisions must be approved by the designated authority.
* **Monitoring & Violation Review:** The administrative dashboard must actively display device online/offline status based on expected heartbeat intervals. Devices remaining offline for over 15 minutes must trigger a technical review. Deliberate network interference or hardware tampering shall be investigated under applicable university IT security policies.
* **Exception Handling:** Temporary offline operation during scheduled electrical maintenance is permitted, provided manual key custody procedures are observed.

---

## POLICY 5 — BACKUP, RECOVERY, EXTERNAL NOTIFICATIONS, AND AUDIT-LOG RETENTION

### 5.1 Policy Identity and Purpose
* **Owner:** Designated Technical Administrator / MIS System Administrator
* **Approving Authority:** IT Department Head
* **Version and Proposed Effectivity:** Version 1.7 | November 1, 2026 (Subject to institutional approval)
* **Security Objective:** Establish operational baselines governing runtime secret isolation, safe error handling, scheduled database backups, verifiable disaster recovery simulations, and long-term audit trail retention. This policy aligns with NIST CSF 2.0 *PROTECT (PR.DS-11)*, *RECOVER (RC.RP-01)*, and *GOVERN (GV.PO-01)*.

### 5.2 Scope and Context
This policy governs database schemas, runtime configuration secrets, automated historical log pruning, external email notification relays, production error handling, and disaster recovery procedures. It explicitly acknowledges that while manual on-demand database backup and sandbox restoration exist in the application, automated scheduled backups, cloud volume snapshots, offsite replication, and verified recipient inbox delivery remain unverified. It applies to database administrators, MIS staff, and hosting managers.

### 5.3 Risk Basis

1. **Risk A (R2) — Catastrophic Data Loss Due to Inadequate Disaster Recovery Mechanisms:**
   * *Asset:* Relational database records (user profiles, key assignments, schedules, maintenance history, custody logs).
   * *Threat and weakness:* Cloud database corruption, accidental table deletion, or hosting failure. While manual on-demand backup export and test restoration endpoints exist in the application, automated scheduled backups and verified offsite replication are not implemented.
   * *Consequence:* Permanent loss of institutional laboratory records, key custody histories, and account authentication data.
   * *Current safeguards:* Application-level manual on-demand compressed database export (`.sql.gz`), SHA-256 archive digest verification, isolated restoration to a test database (`labsync_test`), and connection pooling.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 3, Priority = **HIGH** (Score: 6).
   * *Brief rating rationale:* Operating an academic production system without automated scheduled backups and offsite disaster recovery replication represents a significant operational vulnerability.
   * *Related clauses:* Clauses 5.4.3 and 5.4.4.

2. **Risk B (R10) — Transactional Email Relay Delivery Failure or Webhook Timeout:**
   * *Asset:* Password recovery links and faculty key authorization dispatches.
   * *Threat and weakness:* External email relay failure, network delivery latency, or execution timeouts during HTTPS POST dispatches to the Google Apps Script Web App endpoint.
   * *Consequence:* Instructors and staff unable to receive password reset links or delays in receiving critical laboratory key security notifications.
   * *Current safeguards:* Configured HTTP request timeout (12 seconds) via `AbortController`, fail-fast validation of `EMAIL_WEBHOOK_URL` and `EMAIL_WEBHOOK_SECRET`, shared secret authentication headers (`X-LabSync-Webhook-Secret`), and rate limiting on password reset requests.
   * *Likelihood, impact, and priority:* Likelihood = 2, Impact = 2, Priority = **MEDIUM** (Score: 4).
   * *Brief rating rationale:* While application dispatch logic and a 12-second timeout are implemented in code, successful HTTP 200 response from the relay only indicates transport acceptance and does not confirm actual delivery to a recipient's inbox. Without verified operational inbox delivery tracking or downstream delivery telemetry, notification failures remain possible.
   * *Related clauses:* Clauses 5.4.1 and 5.4.7.

3. **Risk C (R15) — Database Storage Degradation via Unpruned Administrative Audit Logs:**
   * *Asset:* Database storage capacity and query performance.
   * *Threat and weakness:* Accumulation of administrative audit events over multi-year operational lifecycles. While physical occupancy logs are automatically pruned, administrative audit logs lack an automated pruning or archiving mechanism.
   * *Consequence:* Progressive query latency, degraded report generation times, and potential database container storage exhaustion.
   * *Current safeguards:* Telemetry heartbeats update records in place without row growth, and physical room occupancy logs are pruned using automated calendar-year calculations.
   * *Likelihood, impact, and priority:* Likelihood = 1, Impact = 2, Priority = **LOW** (Score: 2).
   * *Brief rating rationale:* Administrative events generate low daily volume, but lack of lifecycle archiving creates long-term database storage bloat.
   * *Related clauses:* Clauses 5.4.2 and 5.4.5.

### 5.4 Mandatory Policy Clauses
1. **Clause 5.4.1 — Strict Secret Segregation:** All database passwords, session secrets, and email relay configuration parameters (the Google Apps Script Web App endpoint URL `EMAIL_WEBHOOK_URL` and shared authentication secret `EMAIL_WEBHOOK_SECRET`) must be injected strictly through runtime environment variables. The production server must halt startup if missing or default placeholder database or session secrets are detected. Email transport credentials must be validated prior to dispatch. All configuration files containing secrets must be excluded from version control. (*Partially implemented; database and session secrets are validated at startup, while email transport endpoint URL and shared secret are validated upon dispatch*)
2. **Clause 5.4.2 — Existing Automated Log Pruning and Proposed Retention Baseline:** The application currently performs automated daily pruning of physical laboratory occupancy and key event records in `occupancy_log` using a calculated one-calendar-year cutoff date. However, formal institutional approval of this one-calendar-year retention duration remains pending; the one-year period represents a proposed operational baseline rather than an approved university mandate. The responsible System Administrator must formally review active automated pruning behavior against applicable institutional records-retention requirements before the proposed schedule is treated as an approved institutional policy. To maintain accountability while preserving database referential integrity, the system must not assume that foreign-key references to deleted rows remain intact automatically; instead, historical traceability of associated administrative security audit entries must be preserved through retained correlation identifiers, independent security audit logging, or approved archival mechanisms prior to row deletion. (*Partially implemented; daily automated pruning in application code is implemented, but the one-calendar-year retention duration is a proposed baseline awaiting institutional review and approval, and audit trail archival coordination remains proposed*)
3. **Clause 5.4.3 — Mandatory Logical Database Backup Schedule and Storage:** To expand the existing manual backup feature into an operational backup program, the Designated Technical Administrator or system maintainer—acting under written authorization from the IT Department Head and adhering to least-privilege principles—must configure automated scheduled database exports (cron or cloud volume snapshots). Backups must be encrypted and stored in institutional cloud storage with a recovery point objective (RPO) $\le 24$ hours and recovery time objective (RTO) $\le 2$ hours. Application-level on-demand backup routes within the web portal remain restricted exclusively to the IT Department Head (`IT_DEPT_HEAD_EXCLUSIVE_ROLES`). (*Partially implemented; manual on-demand export with SHA-256 integrity hashing is implemented, while automated scheduling, offsite storage, and encryption at rest are proposed*)
4. **Clause 5.4.4 — Semesterly Disaster Recovery Restoration Simulation:** The technical team must conduct a documented disaster recovery simulation once per academic semester. The test must restore the most recent backup archive to an isolated staging database and verify record counts across users, keys, and schedules. (*Partially implemented; isolated restoration logic to a test database exists in application code, but recurring operational restoration drills remain proposed*)
5. **Clause 5.4.5 — Administrative Audit Log Archiving:** Because administrative audit logs lack automated pruning in application code, the Designated Technical Administrator must execute an annual archival export of audit logs older than two years to secure offsite storage before manual truncation. Archival exports must preserve relevant record identifiers, attribution, timestamps, and relationship metadata. Where original physical records have been pruned under Clause 5.4.2, historical traceability must be maintained through retained correlation identifiers or approved archival records rather than relying on foreign-key references to deleted rows. (*Proposed policy control*)
6. **Clause 5.4.6 — Safe Production Error Suppression:** Centralized error handling in production mode must suppress raw database errors, SQL syntax strings, and server stack traces, returning generic error responses to prevent technical reconnaissance. (*Implemented*)
7. **Clause 5.4.7 — Transactional Email Verification and Operational Fallback:** Transactional email dispatches forward messages via HTTPS POST to an authorized Google Apps Script Web App endpoint (`EMAIL_WEBHOOK_URL`) authenticated by a shared secret (`EMAIL_WEBHOOK_SECRET`) passed via request headers (`X-LabSync-Webhook-Secret`). The transport enforces a strict 12-second timeout using an `AbortController`. Because a successful HTTP 200 transport response or dispatch function resolution confirms only that the relay accepted the payload—and does not guarantee confirmed delivery to the recipient's inbox—the system must log dispatch failures, and administrators must establish clear operational fallback procedures (such as manual credential issuance or direct notification by MIS Staff) when email delivery cannot be confirmed. (*Partially implemented; HTTPS relay dispatch, 12-second timeout, error categorization, and shared secret authentication are implemented in code, while verified recipient inbox delivery and operational fallback procedures remain operational requirements*)

### 5.5 Implementation, Verification, Roles and Enforcement
* **Responsible Roles & Implementation:** The Designated Technical Administrator oversees database backup procedures, monitors storage growth, and is responsible for configuring future automated backup schedules and offsite replication under written executive approval. MIS Staff manage runtime environment secrets and verify automated log pruning execution. The IT Department Head holds exclusive authorization over application backup creation and sandbox recovery endpoints.
* **Compliance Verification & Evidence:** Compliance verification distinguishes between currently implemented features and proposed operational capabilities:
  * *Currently Implemented Verification:* Checking manual on-demand database export functionality (`.sql.gz`), validating SHA-256 integrity hash verification logs, testing isolated database restoration against the sandbox database (`labsync_test`), inspecting automated daily `occupancy_log` pruning records, verifying environment secret segregation at server startup, and validating production error suppression.
  * *Proposed Verification (Post-Implementation):* Inspecting automated daily/weekly backup scheduler logs (cron or cloud snapshots), verifying encryption-at-rest configurations, auditing offsite cloud storage replication, and reviewing semesterly disaster recovery simulation reports with documented recovery point (RPO) and recovery time (RTO) measurements.
* **Evidence to Retain:**
  * *Existing Evidence (where available):* Manual on-demand database backup archive files, SHA-256 digest verification logs, sandbox database restoration test results, automated daily log-pruning execution records, email dispatch attempt logs and timeout error reports, and production error-handling test outputs.
  * *Evidence Required Following Proposed Implementation:* Automated scheduled backup execution logs, encryption-at-rest verification receipts, offsite cloud storage replication confirmations, recurring semesterly disaster recovery drill reports, and documented RPO/RTO compliance records.
* **Policy Communication and Review:** The policy owner communicates the approved policy to affected personnel through authorized university or system channels, maintains applicable acknowledgment records, provides the policy during relevant onboarding or material revisions, and reviews it annually and after significant system changes or incidents. Revisions must be approved by the designated authority.
* **Monitoring & Violation Review:** Database storage utilization and manual backup integrity logs must be reviewed periodically. Once automated backups are deployed, backup execution logs and offsite storage replication metrics must be audited weekly. Backup failures, dispatch transmission errors, or accidental exposure of sensitive environment configuration files must be reported immediately to the IT Department Head. Compromised credentials must be rotated immediately.
* **Exception Handling:** Emergency database schema adjustments during outages must be executed within transactional wrappers and documented in migration records within 24 hours.
