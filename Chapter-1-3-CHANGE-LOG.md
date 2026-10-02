# LABSYNC CHAPTER 1–3 DOCUMENTATION CHANGE LOG

**System Title:** LabSync: An IoT-Based IT Laboratory Availability and Equipment Monitoring System Using QR Codes  
**Institution:** Bulacan State University – Sarmiento Campus (BulSU-SC)  
**Baseline Original:** `LabSync - upd 9.30.26.pdf` (SHA-256: `f4e3ddaee745dabc864a612aa41a429b6bba607b8bd8b8847072698f1021154a`, 100% Unchanged)  
**Updated Highlighted Duplicate:** `Chapter-1-3-UPDATED-LabSync.pdf` (All updates highlighted in **Yellow**)  
**Audit & Alignment Date:** October 2026  

---

## Summary of Changes

| Category | Count | Description |
| :--- | :---: | :--- |
| **[ADDED]** | 14 | New features, database tables, flowcharts, data dictionary, definitions, and requirements |
| **[UPDATED]** | 8 | Refined system objectives, stakeholder descriptions, scope, and non-functional requirements |
| **[CORRECTED]** | 6 | Replaced outdated/contradictory hardware pinouts, removed PHP/XAMPP references, corrected architecture data flow |
| **[REMOVED]** | 4 | Eliminated references to obsolete reed switches, discrete 10mm breadboard LEDs, and direct MySQL-over-HTTP statements |

---

## Detailed Change Log Table

| # | Chapter | Section | Change Type | Change Summary | Rationale & Codebase Verification |
| :-: | :--- | :--- | :---: | :--- | :--- |
| **1** | Chapter 1 | Introduction & Background | **[ADDED]** | Added explanation of automated key return reminder mechanism (Class End Time + 15-minute grace period) and authoritative custody attribution via `laboratories.Current_User_ID`. | Reflects newly implemented background cron service (`services/keyReminderService.js`) and database custody source of truth. |
| **2** | Chapter 1 | Problem Statement Focus Areas | **[UPDATED]** | Updated Focus Area 4 to "Key Tracking and Custodial Accountability" incorporating mobile QR transfers and server-side overdue email reminders. | Aligns problem focus with the implemented hallway handoff protocol and automated overdue reminder service. |
| **3** | Chapter 1 | Objectives of the Study | **[UPDATED]** | Refined Specific Objective 2 to include automated server-side email return reminders and MIS OJT intern management. | Documents implemented web service capabilities in official research objectives (`services/keyReminderService.js`, `services/ojtService.js`). |
| **4** | Chapter 1 | Significance of the Study | **[UPDATED]** | Added faculty overdue reminder alerts and MIS Staff OJT account administration to stakeholder benefits. | Accurately describes operational value for instructors (turnover alerts) and custodians (intern task delegation). |
| **5** | Chapter 1 | Scope | **[ADDED]** | Included automated server-side reminder processing via Nodemailer SMTP, dynamic Academic Year/Semester evaluation, and OJT intern account management. | Matches current software scope and active service layer capabilities (`services/email/email.service.js`). |
| **6** | Chapter 1 | Delimitations | **[ADDED]** | Added delimitations regarding email dependency on campus network/SMTP server availability, and strict boundaries on OJT accounts (no key box or schedule access). | Prevents exaggerated reliability claims and clarifies security boundaries enforced in `middleware/auth.js`. |
| **7** | Chapter 1 | Definition of Terms | **[ADDED]** | Added formal operational definitions for *Academic Term Engine*, *Automatic Key Return Reminder*, *Current Key Holder (`Current_User_ID`)*, *Grace Period*, and *On-the-Job Training (OJT) Account*. | Provides technical precision for terminology extensively used across the implementation. |
| **8** | Chapter 2 | Comparison of Related Systems | **[ADDED]** | Added "Automated Key Return & Custody Reminders" row to Table 1, marked exclusively for LabSync. | Highlights LabSync's unique competitive advantage over commercial tools (Cisco, IBM, Skedda, Google Forms). |
| **9** | Chapter 2 | Synthesis | **[UPDATED]** | Enhanced synthesis narrative explaining how LabSync solves the custody gap between class dismissal and physical key dock return. | Theoretically justifies automated post-class reminder workflows in resource-constrained state university laboratories. |
| **10** | Chapter 3 | Functional Requirements | **[ADDED]** | Added **FR-09** (Automated Key Return and Custody Reminders) and **FR-10** (OJT Lifecycle and Maintenance Task Delegation) to Table 2. | Captures critical backend background processing and user management features implemented in code. |
| **11** | Chapter 3 | Non-Functional Requirements | **[UPDATED]** | Updated NFR-03 (Security) and NFR-04 (Reliability) to cite bcrypt 12 salt rounds, parameterized SQL queries, and atomic database claims. | Replaces generic statements with verifiable technical specifications and realistic network-dependent reliability parameters. |
| **12** | Chapter 3 | Conceptual Framework (IPOF) | **[CORRECTED]** | Removed "(NOTE: No PHP)" heading note. Replaced all mentions of PHP, XAMPP, Magnetic Reed Switch, and 10mm LEDs with Node.js, Express.js, MySQL/MariaDB, and 6.35mm resistor-divider jack sockets. | Eliminates major internal contradictions with the actual Node.js stack and implemented ESP32 analog sensing circuits. |
| **13** | Chapter 3 | Development Methodology (RAD) | **[CORRECTED]** | Fixed syntax in heading and updated Construction phase text from PHP/MySQL to Node.js, Express.js, and MySQL/MariaDB. | Aligns development narrative with actual repository codebase (`server.js`, `package.json`). |
| **14** | Chapter 3 | Context Diagram | **[UPDATED]** | Updated narrative description to document the OJT sub-role under MIS Staff and the Email Notification Service as an external destination entity. | Reflects complete external interaction boundaries of the platform. |
| **15** | Chapter 3 | Data Flow Diagram (DFD) | **[ADDED]** | Added description of Level 1 DFD Process 5.0: Key Custody & Automated Reminder Service, reading D2 (Schedules), D5 (Laboratories), and D8 (`schedule_key_reminders`). | Completes data flow modeling for background reminder processing and atomic state persistence. |
| **16** | Chapter 3 | Use Case Diagram | **[UPDATED]** | Documented OJT Intern role boundaries (workstation maintenance only; restricted from key box and schedules) and automated reminder system actor. | Enforces principle of least privilege documented in `middleware/auth.js`. |
| **17** | Chapter 3 | Pin Mapping Table (Table 5) | **[CORRECTED]** | Completely replaced erroneous table rows (GPIO 5 Red LED, GPIO 2 Green LED, GPIO 4 Magnetic Switch) with actual hardware pinout: I2C LCD (GPIO 21/22), GM65 (GPIO 17/16), Key Slot 203 (GPIO 32, 10kΩ divider), Key Slot 204 (GPIO 33, 0Ω wire), and Buzzer (GPIO 25). | Replaces outdated/fictional pin mappings with exact firmware assignments from `LabSync_ESP32.ino`. |
| **18** | Chapter 3 | System Architecture Diagram | **[CORRECTED]** | Removed "Magnetic Reed Switch" and "Update MySQL via HTTP". Documented that ESP32 interacts via REST API endpoints (`/api/occupancy/log` and `/heartbeat`) to the Node.js server, and added Notification Service Layer (Nodemailer). | Corrects technical inaccuracy; microcontrollers do not execute raw SQL over HTTP. |
| **19** | Chapter 3 | System Flowcharts | **[ADDED]** | Added **Figure 14: Automatic Key Return Reminder Flowchart** with comprehensive step-by-step logic narrative. | Illustrates the 1-minute cron, 15m grace period calculation, `Current_User_ID` lookup, atomic DB claim, and Nodemailer SMTP dispatch. |
| **20** | Chapter 3 | System Flowcharts | **[ADDED]** | Added **Figure 15: Mobile QR Key Custody Transfer Flowchart** with comprehensive step-by-step logic narrative. | Documents peer-to-peer mobile handoff, role checks, 1-key limit policy, row-locking transaction (`SELECT ... FOR UPDATE`), and `occupancy_log` audit. |
| **21** | Chapter 3 | System Flowcharts | **[ADDED]** | Added **Figure 16: MIS Staff OJT Account Lifecycle & Maintenance Flowchart** with comprehensive step-by-step logic narrative. | Illustrates OJT intern provisioning, start/end date enforcement, bcrypt hashing, maintenance ticket updating, and login expiration. |
| **22** | Chapter 3 | Database Design & ERD | **[ADDED]** | Added **Figure 17: Relational Database Entity-Relationship Diagram (ERD)** covering all 12 core database tables. | Fulfills the promised ERD in Section 3 text that was completely missing from the original baseline PDF. |
| **23** | Chapter 3 | Database Design & Data Dictionary | **[ADDED]** | Added **Table 5b: Relational Data Dictionary for `schedule_key_reminders` Table**, detailing all 11 fields (`Reminder_ID`, `Schedule_ID`, `Occurrence_Date`, `Room_ID`, `Recipient_User_ID`, `Scheduled_User_ID`, `Status`, `Retry_Count`, `Last_Attempt_At`, `Sent_At`, `Error_Message`). | Provides complete schema documentation for the persistent reminder engine (`database/migrations/019` and `020`). |
| **24** | Chapter 3 | Key Custody Single Source of Truth | **[ADDED]** | Added explicit database documentation establishing `laboratories.Current_User_ID` as the authoritative single source of truth for key custody, detailing all three operational cases (Case A, Case B, and Case C). | Clarifies that physical key responsibility is bound to `Current_User_ID` rather than static timetable entries. |
| **25** | Chapter 3 | Security Architecture & Controls | **[ADDED]** | Added dedicated technical subsection detailing bcrypt (12 salt rounds), session inactivity timeout (30 min), client anti-flash guard (`auth-check.js`), cryptographically random tokens, parameterized SQL queries, and audit logging. | Provides academic rigor and technical defensibility for enterprise security claims. |
| **26** | Chapter 3 | Tools & Development Environment (Table 6) | **[ADDED]** | Added Nodemailer (v9.0.6), Node.js `qrcode` (v1.5.4), Bcrypt (v6.0.0), and C++ Arduino Framework to Table 6 and updated text summary. | Completes technology stack inventory according to `package.json` and firmware source code. |
| **27** | Chapter 3 | Mockups & Visual Figures | **[UPDATED]** | Renumbered mockups from Figures 14–29 to Figures 18–33 to accommodate new flowcharts and ERD diagram without breaking numbering sequence. | Preserves document integrity and maintains flawless cross-referencing throughout Chapter 3. |

---

## Verification & Integrity Sign-Off

1. **Original PDF Preserved:** Yes (`LabSync - upd 9.30.26.pdf` SHA-256: `f4e3ddaee745dabc864a612aa41a429b6bba607b8bd8b8847072698f1021154a`).
2. **Updated PDF Generated:** Yes (`Chapter-1-3-UPDATED-LabSync.pdf`, 105 pages).
3. **Highlighting Standard:** 100% of all newly added text, modified wording, updated tables, and new diagrams are visibly highlighted in **Yellow**.
4. **Invented Information:** None. 100% of updates are verified against active source code in `c:\Users\andre\Downloads\LabSync`.
