# SECURE SOFTWARE DEVELOPMENT LIFE CYCLE (SSDLC)
## PLANNING PHASE DOCUMENT

**Capstone Project Title:** LabSync – Automated Computer Laboratory Monitoring & PC/Key Maintenance Management System with IoT Integration  
**Institution:** Bulacan State University – Sarmiento Campus (BulSU-SC)  
**Course / Subject:** Secure Software Development / Capstone Project  
**Submission Date:** August 15, 2026 11:59 PM  
**Target Submission Format:** `Group#_CapstoneTitle_SSDLC-Planning.docx`  

---

## 1. Project Overview

### • Describe the Proposed System
**LabSync** is an automated, web-based Computer Laboratory Monitoring & PC/Key Maintenance Management System integrated with Internet of Things (IoT) hardware endpoints, specifically engineered for Bulacan State University – Sarmiento Campus (BulSU-SC). The system seamlessly unifies laboratory room scheduling, physical room key occupancy monitoring, student PC hardware fault reporting, and Kanban-style maintenance tracking for the IT Department and MIS Office into a single cohesive platform. Powered by a Node.js and Express v5 backend, a MariaDB database, and responsive web dashboards, LabSync interfaces with physical ESP32 microcontrollers deployed at computer laboratory doors equipped with GM65 QR code scanners, 6.35mm jack mechanical key-slot sensors, and 16x2 LCD status screens.

### • Problem to Solve
Traditional computer laboratory management at BulSU-SC suffers from five critical operational and security deficiencies:
1. **Paper-Based PC Defect Logs:** Students manually write PC hardware fault reports on physical paper logs, resulting in misplaced tickets, untracked hardware components, and a lack of accountability.
2. **Unmonitored Physical Key Management:** Laboratory room keys are checked out manually without digital identity verification, creating physical security vulnerabilities, unmonitored room access, and risk of loss or theft.
3. **Room Occupancy Blind Spots:** Administrators and faculty lack real-time visibility into whether a computer lab room is currently `Available`, `Claimed`, or `In Use`, leading to scheduling conflicts and unauthorized entry.
4. **Fragmented & Error-Prone Scheduling:** Managing room allocations manually or through static spreadsheets causes class overlaps, double-bookings, and confusion between faculty members.
5. **Opaque Maintenance Pipelines:** MIS staff and technicians lack a centralized, role-restricted dashboard to track hardware repair lifecycles from initial report submission to final resolution (`Pending` $\rightarrow$ `In Progress` $\rightarrow$ `Resolved`).

### • Target Users
* **Students / General Lab Users:** Submit digital PC fault reports (hardware/software issues) by scanning QR codes on lab workstations.
* **Faculty Members:** View assigned teaching schedules, request/claim laboratory rooms, secure rooms by inserting physical keys, and report room or PC issues.
* **IT Department Head:** Oversees university-wide lab room allocations, approves master schedules, monitors overall lab utilization, and reviews high-level PC report summaries.
* **MIS Staff / Technicians:** Manages user accounts, configures room hardware parameters, generates QR codes, and updates PC repair tickets on a Kanban board (`Pending` $\rightarrow$ `In Progress` $\rightarrow$ `Resolved`).
* **System Administrators:** Oversees backend infrastructure, database integrity, user role assignments, and system security controls.
* **ESP32 IoT Device (Automated Non-Human Actor):** Deployed hardware endpoint that transmits HTTP REST payloads to record QR verification events and key sensor status changes.

### • Major Features
1. **Real-Time Room Occupancy & Key Tracking:** Automatically updates room availability status (`Available`, `Claimed`, `In Use`) based on ESP32 physical key sensor readings and master schedule integration.
2. **QR Code Key & Room Access Verification:** Faculty scan user-specific QR tokens on the GM65 hardware scanner to claim lab rooms, with instant feedback displayed on the 16x2 LCD screen.
3. **Student PC Fault Reporting via QR:** QR code labels attached to individual lab PCs allow students to instantly open digital fault report forms for immediate logging.
4. **Kanban-Style Maintenance Pipeline:** MIS staff manage hardware defect tickets across structured status lanes (`Pending`, `In Progress`, `Resolved`) with priority filtering and activity logging.
5. **Interactive Master Schedule Studio:** Drag-and-drop room schedule editor for administrators with automatic time-slot conflict detection and batch printing capabilities.
6. **Dynamic Notification & Activity Feed:** Real-time activity timeline displaying room state changes, key insertions/removals, and PC report submissions without requiring manual page refreshes.

### • Why Security is Important
Security is critical to LabSync because the system bridges digital administrative workflows with physical campus security infrastructure. Without robust security controls:
* **Physical Room Security Risks:** Unauthorized API calls or spoofed hardware requests could falsely mark rooms as secured or claimed, exposing high-value university hardware (computers, projectors, network devices) to theft or physical sabotage.
* **Data Privacy Compliance:** The system stores Personally Identifiable Information (PII) of students and faculty (names, institutional emails, faculty IDs, activity logs), which is subject to legal mandates under the **Philippine Data Privacy Act of 2012 (RA 10173)**.
* **Data Integrity & System Availability:** Vulnerabilities such as SQL Injection (SQLi) or Cross-Site Scripting (XSS) could allow malicious actors to wipe master schedules, tamper with PC defect tickets, hijack staff session credentials, or cause denial-of-service disruptions during academic hours.
* **Accountability & Forensic Auditability:** Enforcing strict Authentication, Authorization (RBAC), and immutable audit logs (`occupancy_log`) guarantees that every key transaction and administrative action is traceable to an authenticated user.

---

## 2. System Scope

The scope of the LabSync system includes all web components, REST APIs, database repositories, authentication modules, email channels, and IoT hardware endpoints that transmit or process university data.

### 2.1 In-Scope System Components

| Component Layer | Technologies / Modules | Security & System Scope Boundary |
| :--- | :--- | :--- |
| **Web Frontend** | HTML5, Modular CSS3, Vanilla JS, Lucide Icons | Dashboards for Login, Faculty Schedule Studio, Student PC Report Submission, MIS Maintenance Board, IT Head Dashboards, and Room Status monitors. |
| **Backend REST API** | Node.js, Express v5 framework, CORS, dotenv | Route controllers, REST endpoints, input parsing, middleware access control, rate limiting, and business logic execution. |
| **Authentication & Sessions** | `express-session`, `express-mysql-session`, `crypto`, `bcrypt` | Cookie-based session state, secure password reset token generation, session persistence in MariaDB, and salted password hashing. |
| **Database Layer** | MySQL2 driver, MariaDB relational SQL schema (`labsync.sql`) | Structured storage for user accounts, master schedules, PC defect reports, occupancy timeline logs, and key hardware state. |
| **Notification & Mail System** | Nodemailer, SMTP Integration | Automated transmission of user onboarding welcome emails and single-use password reset tokens with strict expiration timeouts. |
| **IoT Hardware Subsystem** | ESP32 Dev Module, GM65 QR Scanner, I2C LCD 16x2, 6.35mm Jack Socket sensor | Physical door controller scanning user QR tokens, displaying feedback, detecting physical key insertion/removal, and posting REST events. |

### 2.2 Out-of-Scope Components

* **University ERP / Registrar Mainframe:** Integration with university-wide grading or tuition databases is outside the current release scope.
* **Automated Electronic Door Locks:** The system monitors key insertion/removal in physical holders, but does not actuate magnetic door locks directly.
* **Workstation OS Maintenance:** Operating system updates, BIOS passwords, and patch management for individual desktop PCs remain the manual responsibility of MIS staff.

---

## 3. Stakeholders & Access Roles

Establishing clear stakeholder roles ensures strict adherence to the **Principle of Least Privilege** and **Role-Based Access Control (RBAC)** across all application interfaces and APIs.

| Stakeholder Role | User Category | System Access & Functionality | Security Responsibilities |
| :--- | :--- | :--- | :--- |
| **System Administrator / MIS Staff** | Internal Administrative User | Full access to user management, PC maintenance board (`Pending` $\rightarrow$ `Resolved`), QR code generation, room hardware configuration. | Maintains database credentials, monitors error logs, executes backups, revokes compromised user accounts. |
| **IT Department Head** | Internal Executive User | Executive access to master laboratory utilization dashboards, PC fault reports summary, schedule approvals. | Verifies institutional security policy compliance, approves master room schedules. |
| **Faculty Members** | Internal Operational User | Operational access to room scheduling requests, personal teaching schedule view, room claim/security via QR code/keys, filing PC issues. | Protects login credentials, ensures physical room keys are returned to sensors after classes, reports suspicious room activities. |
| **Students / Lab Users** | Public / General User | Restricted access to public QR reporting forms to log faulty lab hardware (monitors, peripherals, software). | Submits accurate defect reports; refrains from submitting malicious payloads or tampering with QR labels. |
| **ESP32 IoT Endpoint** | Non-Human Actor / Hardware | Automated API client making REST requests (`POST /api/occupancy/log`) for QR verification and key state changes. | Operates over secure campus Wi-Fi; transmits authenticated JSON payloads with device security tokens. |
| **Capstone Group / Developers** | Development Team | Source code maintainers and system architects. | Enforces SSDLC standards, conducts code reviews, patches vulnerabilities, ensures secure deployment. |

---

## 4. Assets to Protect

System assets are categorized and evaluated against the **CIA Triad** (Confidentiality, Integrity, Availability) to determine required security controls.

| Asset Name & Category | Asset Description | Impact Level (C-I-A) | Justification & Protection Objective |
| :--- | :--- | :--- | :--- |
| **User Credentials & Password Hashes** | User login emails, bcrypt password hashes, salt parameters, active session tokens. | **C: High**<br>**I: High**<br>**A: High** | Credential compromise allows unauthorized system access and administrative takeover. Must be hashed with bcrypt and protected via `HttpOnly` cookies. |
| **Faculty & Student PII** | Full names, institutional email addresses, faculty IDs, role designations. | **C: High**<br>**I: Moderate**<br>**A: Moderate** | Protected under the **Philippine Data Privacy Act of 2012 (RA 10173)**. Confidentiality must be enforced against unauthorized viewing or leakage. |
| **Master Laboratory Schedules** | Class room assignments, recurring time slots, room booking logs. | **C: Low**<br>**I: High**<br>**A: High** | Tampering leads to class disruptions, room booking conflicts, and academic delays. High Integrity and Availability are critical. |
| **PC Fault & Maintenance Logs** | Student defect tickets, hardware breakdown logs, technician resolution notes. | **C: Moderate**<br>**I: High**<br>**A: Moderate** | Ticket manipulation could conceal theft of lab components (RAM, GPUs) or sabotage IT maintenance operations. |
| **Real-time Occupancy & Key Status** | Physical key state (`Present`/`Absent`), room state (`Available`/`Claimed`/`In Use`), QR scan logs. | **C: Low**<br>**I: High**<br>**A: High** | Serves as the audit log for physical room access. Tampering corrupts security records during physical security investigations. |
| **IoT REST API & Hardware Secrets** | API pre-shared tokens, Wi-Fi credentials, server endpoint URLs. | **C: High**<br>**I: High**<br>**A: High** | Token exposure enables attackers to spoof room access or key returns, invalidating hardware security controls. |
| **Database & Server Infrastructure** | MariaDB engine, SQL schemas, connection pools, environment `.env` keys. | **C: Critical**<br>**I: Critical**<br>**A: Critical** | The primary data repository. Compromise via SQLi or unauthorized access leads to full system compromise. |

---

## 5. Security Requirements

Security requirements specify technical standards across key domain areas to ensure resilient software engineering.

### 5.1 Authentication (SR-01)
* **SR-01.1 (Cryptographic Password Hashing):** All user passwords must be hashed using bcrypt with a minimum work factor of 10 prior to storage in the database. Plaintext passwords must never be logged or stored.
* **SR-01.2 (Session Security & Cookie Attributes):** Web session IDs must be generated using cryptographically secure random number generators (PRNG) and stored via `express-mysql-session`. Cookies must be configured with `HttpOnly`, `SameSite=Strict`, and `Secure` (in HTTPS environments) flags.
* **SR-01.3 (Password Reset Security):** Password reset links generated by Nodemailer must utilize single-use, high-entropy random hex tokens (`crypto.randomBytes(32)`) stored with a maximum expiration window of 15 minutes.

### 5.2 Authorization & Access Control (SR-02)
* **SR-02.1 (Server-Side Role Enforcement):** Every REST API endpoint must independently validate user session roles (`Student`, `Faculty`, `IT_Head`, `MIS_Staff`) using Express middleware (`auth-check`). Client-side UI restriction is non-authoritative.
* **SR-02.2 (Principle of Least Privilege):** Database connections (`db.js`) must run under a dedicated MySQL user account restricted exclusively to required schema CRUD operations, disabling administrative shell privileges (`FILE`, `SUPER`, `GRANT`).

### 5.3 Data Protection & Confidentiality (SR-03)
* **SR-03.1 (Encryption in Transit):** All HTTP communications between web browsers, ESP32 IoT endpoints, and the Express backend must be encrypted using Transport Layer Security (TLS 1.2/1.3 / HTTPS).
* **SR-03.2 (Secret Management):** Sensitive configuration keys (`DB_PASS`, `SESSION_SECRET`, `EMAIL_PASS`, `IOT_API_TOKEN`) must reside exclusively in environment variables (`.env`) and must be strictly excluded from git version control via `.gitignore`.

### 5.4 Input Validation & Sanitization (SR-04)
* **SR-04.1 (SQL Injection Prevention):** 100% of database queries executed via `mysql2` must use parameterized prepared statements (`?` placeholders). Dynamic SQL string concatenation is strictly prohibited.
* **SR-04.2 (Cross-Site Scripting Mitigation):** All user-submitted text inputs (such as PC report descriptions) must be sanitized server-side and HTML-entity-encoded prior to rendering in the DOM.

### 5.5 IoT Endpoint Security (SR-05)
* **SR-05.1 (API Token Authentication):** Requests from ESP32 microcontrollers to `/api/occupancy/log` must include a custom HTTP header (`X-Device-Token`) validated by server middleware.
* **SR-05.2 (Hardware Debouncing & Rate Limiting):** The ESP32 sketch must implement hardware debouncing (minimum 100ms) on physical key pins to prevent rapid switch flickering and buffer overflow DoS attacks.

### 5.6 Auditability & Logging (SR-06)
* **SR-06.1 (Immutable Occupancy Logging):** All key state transitions and QR authorization events must be recorded in `occupancy_log` with ISO 8601 timestamps, room numbers, and actor user IDs.
* **SR-06.2 (Security Event Monitoring):** Failed login attempts, unauthorized API calls (HTTP 401/403), and password reset requests must be logged in server access logs for forensic auditability.

---

## 6. Risk Assessment

A threat risk assessment was performed using standard Likelihood and Impact metrics (**Low**, **Medium**, **High**) to establish a prioritized Risk Matrix and corresponding mitigations.

| Threat Category | Threat Scenario & Vulnerability | Likelihood | Impact | Risk Level | Mitigation Strategy |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **SQL Injection (SQLi)** | Attacker inputs malicious SQL payloads into login or search forms to bypass auth or dump database. | Medium | High | **HIGH** | Use parameterized SQL queries (`mysql2` prepared statements) across all database operations. |
| **Broken Access Control** | Privilege escalation where a student accesses `/mis-maintenance` or modifies master schedules. | Medium | High | **HIGH** | Enforce server-side role validation middleware (`checkRole`) on all administrative API endpoints. |
| **IoT Endpoint Spoofing** | Attacker sends forged HTTP POST requests to `/api/occupancy/log` to fake key status or room entry. | Medium | High | **HIGH** | Require pre-shared API header tokens (`X-Device-Token`) and validate ESP32 network origins. |
| **Brute-Force Auth Attacks** | Automated password guessing targeting user and staff login endpoints. | High | Medium | **HIGH** | Implement `express-rate-limit` middleware (max 5 failed attempts per 15 minutes per IP). |
| **Cross-Site Scripting (XSS)** | Malicious JavaScript injected via PC defect report fields executed on staff dashboards. | Medium | Medium | **MEDIUM** | Sanitize all user text inputs server-side and escape HTML special characters during client DOM rendering. |
| **Session Hijacking / Fixation** | Session cookies intercepted over unencrypted Wi-Fi or stolen via XSS. | Low | High | **MEDIUM** | Enforce HTTPS, set `HttpOnly` and `SameSite=Strict` cookie flags, and regenerate session IDs on login. |
| **Secret Exposure in Version Control** | Hardcoded database credentials or API secrets published to public code repositories. | Low | High | **MEDIUM** | Store all credentials in `.env`; enforce `.gitignore` rules and automated git pre-commit scanning. |

---

## 7. Initial Security Controls

To mitigate identified risks, baseline security controls are structured into **Preventive**, **Detective**, and **Corrective** layers.

```
                    +-----------------------------------------+
                    |        LABSYNC SECURITY CONTROLS        |
                    +-----------------------------------------+
                                         |
     +-----------------------------------+-----------------------------------+
     |                                   |                                   |
     v                                   v                                   v
+-------------------------+   +-------------------------+   +-------------------------+
|   PREVENTIVE CONTROLS   |   |   DETECTIVE CONTROLS    |   |   CORRECTIVE CONTROLS   |
|                         |   |                         |   |                         |
| - Parameterized SQL     |   | - Real-time Timeline    |   | - Session Revocation    |
| - RBAC Middleware       |   |   Activity Monitoring   |   | - Automated Rate-Limit  |
| - bcrypt Hashing        |   | - Server Access Logs    |   |   Throttling (429)      |
| - IoT API Header Tokens |   | - Database Audit Trail  |   | - Automated Database    |
| - Helmet HTTP Headers   |   |   (`occupancy_log`)     |   |   Backup Scripts        |
+-------------------------+   +-------------------------+   +-------------------------+
```

### 7.1 Preventive Controls
* **Parameterized Prepared Statements:** Eliminates SQL injection vectors by separating code instructions from query parameters.
* **Role-Based Access Control Middleware:** Express middleware verifies user roles before allowing controller execution.
* **bcrypt Password Hashing:** Salted hashes protect user credentials against offline dictionary/rainbow table attacks.
* **IoT API Header Authentication:** Secret tokens (`X-Device-Token`) ensure only genuine hardware devices communicate with hardware REST routes.
* **Express Security Headers (Helmet):** Implements HTTP security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`).

### 7.2 Detective Controls
* **Real-Time Timeline Log Monitoring:** The `/api/notifications` route logs real-time key events, room status updates, and report submissions.
* **Server Access & Error Logging:** Express logs record repeated authentication failures, invalid API requests, and unhandled exceptions.
* **Database Audit Logs:** Foreign-key linked records in `occupancy_log` track hardware key status changes and user QR scans.

### 7.3 Corrective Controls
* **Session Termination:** Logging out or resetting a password instantly invalidates active session records in `express-mysql-session`.
* **Automated Throttling (HTTP 429):** Rate-limiting middleware blocks origin IPs exceeding threshold request limits.
* **Database Disaster Recovery:** Scheduled `mysqldump` backups enable rapid database restoration in the event of corruption or ransomware incidents.

---

## 8. SSDLC Planning Summary & Roadmap

The Planning Phase establishes the security blueprint for subsequent stages of the Secure Software Development Life Cycle.

| SSDLC Phase | Primary Activities & Deliverables | Security Focus Area | Schedule / Status |
| :--- | :--- | :--- | :--- |
| **1. Planning Phase (Current)** | System scoping, stakeholder mapping, asset identification, threat risk assessment, baseline controls document. | Security Requirements & Threat Modeling | August 2026 **(Completed)** |
| **2. Secure Design Phase** | Architecture Data Flow Diagrams (DFDs), STRIDE threat modeling, secure schema design. | Attack Surface Reduction & Design Review | September 2026 |
| **3. Secure Coding Phase** | Implementation of parameterized queries, RBAC middleware, IoT header validation, input sanitization. | Secure Coding & Static Code Analysis (SAST) | October 2026 |
| **4. Security Testing Phase** | Dynamic vulnerability scanning (DAST), SQLi/XSS penetration testing, hardware tampering tests. | Penetration Testing & Vulnerability Remediation | November 2026 |
| **5. Secure Deployment Phase** | Production HTTPS setup, server hardening, environment secret validation, final SSDLC audit report. | Operational Hardening & Deployment Acceptance | December 2026 |

---

## 9. References

1. **OWASP Foundation (2021).** *OWASP Top 10 Web Application Security Risks.* Available at: [https://owasp.org/Top10/](https://owasp.org/Top10/)
2. **National Institute of Standards and Technology (NIST) (2020).** *SP 800-53 Rev. 5: Security and Privacy Controls for Information Systems and Organizations.* U.S. Department of Commerce.
3. **National Institute of Standards and Technology (NIST) (2017).** *SP 800-63B: Digital Identity Guidelines – Authentication and Lifecycle Management.* U.S. Department of Commerce.
4. **Republic of the Philippines (2012).** *Republic Act No. 10173: Data Privacy Act of 2012.* National Privacy Commission.
5. **Express.js Documentation (2026).** *Production Best Practices: Security.* Available at: [https://expressjs.com/en/advanced/best-practice-security.html](https://expressjs.com/en/advanced/best-practice-security.html)
6. **MariaDB Foundation (2026).** *Security & Prepared Statements Documentation.* Available at: [https://mariadb.com/kb/en/prepared-statements/](https://mariadb.com/kb/en/prepared-statements/)
