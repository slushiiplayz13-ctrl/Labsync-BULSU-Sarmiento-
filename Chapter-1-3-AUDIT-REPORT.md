# LABSYNC — CHAPTER 1–3 TECHNICAL DOCUMENTATION AUDIT REPORT

**Project:** LabSync (An IoT-Based IT Laboratory Availability and Equipment Monitoring System Using QR Codes)  
**Institution:** Bulacan State University – Sarmiento Campus (BulSU-SC)  
**Document Audited:** `LabSync - upd 9.30.26.pdf` (Baseline Original)  
**Updated Duplicate:** `Chapter-1-3-UPDATED-LabSync.pdf` (All Changes Highlighted in Yellow)  
**Audit Date:** October 2026  

---

## 1. DOCUMENT STATUS

- **Original Baseline Document Pages:** 93 Pages
- **Updated Duplicate Document Pages:** 105 Pages (expanded to cleanly accommodate new flowcharts, ERD diagram, data dictionary tables, and security subsections without layout distortion)
- **Baseline Original PDF File:** `C:\Users\andre\Downloads\LabSync - upd 9.30.26.pdf`
- **Original PDF SHA-256 Hash:** `f4e3ddaee745dabc864a612aa41a429b6bba607b8bd8b8847072698f1021154a` (**100% UNTOUCHED and PRESERVED**)
- **Chapters Detected:**
  - **Chapter 1: The Problem and Its Background** (Pages 1–16)
  - **Chapter 2: Review of Related Literature and Systems** (Pages 16–27)
  - **Chapter 3: Design and Methodology** (Pages 27–88)
  - *Chapter 4: Results and Discussion* (Pages 88–89, placeholder outline)
  - *Chapter 5: Conclusions and Recommendations* (Pages 89–90, placeholder outline)
  - *References* (Pages 91–93)
- **Major Sections Detected & Audited:**
  - Introduction, Problem Background, Objectives (General & Specific), Significance of the Study, Scope and Delimitations, Definition of Terms.
  - Review of Literature, Review of Systems, Comparison Matrix (Table 1), Comparative Synthesis.
  - Functional Requirements (Table 2), Non-Functional Requirements (Table 3), Hardware Requirements (Table 4), Conceptual Framework (IPOF), Development Methodology (RAD), System Design, Context Diagram, Data Flow Diagram (DFD), Use Case Diagram, Circuit & Pictorial Diagrams, Pin Mapping Table (Table 5), System Architecture Diagram, Workflow Flowcharts, UI Mockups, Tools & Environment (Table 6), Development Costs (Tables 7–11), Evaluation Methodology (ISO/IEC 25010 & TAM).

---

## 2. SYSTEM-DOCUMENTATION MISMATCHES

### Mismatch 1: Automatic Key Return / Transfer Reminder Service
- **Section:** Chapter 1 (Background & Objectives), Chapter 3 (Functional Requirements, DFD, Architecture)
- **Current Documentation:** Completely omitted. No mention of automatic reminders, grace periods, or post-class overdue alerts.
- **Actual System:** Implements a robust server-side cron service (`services/keyReminderService.js`) that runs every minute, enforcing the rule: `Class End Time + 15 Minutes = Reminder Deadline`. It cross-references daily schedules and dock telemetry, and automatically emails the actual key holder (`Current_User_ID`) via Nodemailer SMTP.
- **Required Change:** Add comprehensive explanations across Chapter 1, add FR-09, add DFD Process 5.0, add dedicated Flowchart (Figure 14), and document persistent table `schedule_key_reminders`.
- **Priority:** **MUST**

### Mismatch 2: Key Custody Single Source of Truth (`Current_User_ID`)
- **Section:** Chapter 1 (Background, Problem Statement), Chapter 3 (System Design, Database Design)
- **Current Documentation:** Ambiguously implies that key removal during a scheduled class slot automatically attributes custody to the scheduled faculty member.
- **Actual System:** The system uses `laboratories.Current_User_ID` as the sole authoritative reference for custody. If Prof. A is scheduled but Prof. B retrieves the key or accepts it via mobile QR transfer, Prof. B is the custodian. If a key is pulled without authentication, `Current_User_ID = NULL` and `Key_Status = 'Absent'`; the system never falsely blames the scheduled professor.
- **Required Change:** Clarify in Chapter 1 and Chapter 3 that custody is strictly bound to `Current_User_ID` and never blindly assumed from timetables.
- **Priority:** **MUST**

### Mismatch 3: Erroneous Hardware Pin Mapping (Table 5) & Reed Switch References
- **Section:** Chapter 3 (Circuit Diagram & Pin Mapping Table 5, Conceptual Framework, System Architecture)
- **Current Documentation:** Lists Red LED on GPIO 5, Green LED on GPIO 2, and Magnetic Reed Switch on GPIO 4. Conceptual framework mentions reed switches and 10mm LEDs. Architecture states "Update MySQL via HTTP".
- **Actual System:** ESP32 firmware (`LabSync_ESP32.ino`) uses **6.35mm jack sockets with resistor-divider analog sensing** on GPIO 32 (Room 203, 10kΩ divider) and GPIO 33 (Room 204, 0Ω direct sense); GM65 scanner on GPIO 17 (RX2) and GPIO 16 (TX2); I2C LCD on GPIO 21 (SDA) and GPIO 22 (SCL); Piezo Buzzer on GPIO 25. No magnetic switches or breadboard LEDs exist on the physical enclosure. ESP32 communicates with the Node.js REST API, not direct MySQL.
- **Required Change:** Completely replace Table 5 with the verified pinout, eliminate all reed switch and discrete LED mentions, and correct architecture text to describe the REST API intermediary.
- **Priority:** **MUST**

### Mismatch 4: Technology Stack Contradiction (PHP / XAMPP vs. Node.js / Express.js)
- **Section:** Chapter 3 (Conceptual Framework IPOF, RAD Methodology)
- **Current Documentation:** Mentions "PHP", "Local Server (XAMPP/MySQL)", and "Developing the PHP backend" (even though Table 6 on page 75 correctly listed Node.js).
- **Actual System:** The entire backend is implemented in **Node.js with Express.js** (`server.js`, `package.json`). PHP and XAMPP are completely unused.
- **Required Change:** Remove "(NOTE: No PHP)" heading note. Replace all occurrences of PHP and XAMPP with Node.js, Express.js, and MySQL/MariaDB.
- **Priority:** **MUST**

### Mismatch 5: Complete Absence of Database Design & Entity-Relationship Diagram (ERD)
- **Section:** Chapter 3 (System Design, Database Design)
- **Current Documentation:** Page 39 promises: "the Entity-Relationship Diagram (ERD) defines the database tables...", but no ERD diagram or database schema existed anywhere in Chapter 3.
- **Actual System:** A 12-table relational schema exists (`users`, `laboratories`, `schedules`, `schedule_key_reminders`, `key_authorization_requests`, `laboratory_keys`, `key_found_reports`, `lab_units`, `maintenance_issues`, `maintenance`, `occupancy_log`, `audit_logs`).
- **Required Change:** Insert Figure 17 (Relational Database ERD), add complete data dictionary tables (specifically Table 5b for `schedule_key_reminders`), and explain table relationships.
- **Priority:** **MUST**

### Mismatch 6: OJT Intern Role and Lifecycle Delegation
- **Section:** Chapter 1 (Significance, Scope & Delimitations), Chapter 3 (Use Case Diagram, Functional Requirements)
- **Current Documentation:** Completely omitted. Only Department Head, Faculty, MIS Staff, and Student are mentioned.
- **Actual System:** MIS Staff can provision temporary OJT accounts with defined start and end dates. OJTs can inspect defect reports and update maintenance tickets (`Pending` ➔ `In Progress` ➔ `Resolved`), but are strictly barred from IoT key box access and schedule editing. Derived expiration (`isOjtExpired`) automatically terminates access when the internship ends without hard deleting audit records.
- **Required Change:** Add FR-10, document OJT in Scope and Delimitations, add Flowchart (Figure 16), and describe role boundaries in Use Case narrative.
- **Priority:** **MUST**

### Mismatch 7: Missing Workflows for Key Transfer and Return Reminders
- **Section:** Chapter 3 (Flowcharts)
- **Current Documentation:** Only contains Figures 9–13 (Login, Dept Head, Faculty, MIS, Student).
- **Actual System:** Core workflows for peer-to-peer QR key transfers and automated email reminder processing are fundamental operational pillars.
- **Required Change:** Add Figure 14 (Automatic Key Return Reminder Flowchart) and Figure 15 (Mobile QR Key Custody Transfer Flowchart) with detailed step-by-step logic narratives.
- **Priority:** **MUST**

### Mismatch 8: Missing Technology Dependencies (Table 6)
- **Section:** Chapter 3 (Table 6 Tools, Technologies & Environment)
- **Current Documentation:** Omits email notification engine, QR code generator, and cryptographic libraries.
- **Actual System:** Uses Nodemailer (v9.0.6), Node.js `qrcode` (v1.5.4), Bcrypt (v6.0.0, 12 salt rounds), and C++ (Arduino Framework / ESP32 Core).
- **Required Change:** Add these critical packages and tools to Table 6.
- **Priority:** **MUST**

---

## 3. MISSING INFORMATION CATALOG

1. **Descriptions:**
   - Single source of truth for key custody (`laboratories.Current_User_ID`).
   - 15-minute grace period business rule (`Class End Time + 15m`).
   - Dynamic Academic Term intelligence (`academic-term.js`).
   - Resistor-divider ADC key discrimination (Key 203 = 10kΩ, Key 204 = 0Ω wire).
   - OJT account lifecycle (start/end dates, derived expiration, no hard deletion).
2. **Workflows & Flowcharts:**
   - Automatic Key Return Reminder Flowchart (**Added as Figure 14**).
   - Mobile QR Key Custody Transfer Flowchart (**Added as Figure 15**).
   - MIS Staff OJT Account Lifecycle & Maintenance Flowchart (**Added as Figure 16**).
3. **Database Entities:**
   - Complete Relational Entity-Relationship Diagram (ERD) (**Added as Figure 17**).
   - Data Dictionary for `schedule_key_reminders` Table (**Added as Table 5b**).
   - Multi-key approval entity (`key_authorization_requests`).
4. **Requirements:**
   - FR-09: Automated Key Return & Custody Reminders (**Added to Table 2**).
   - FR-10: OJT Lifecycle & Maintenance Delegation (**Added to Table 2**).
5. **Security Controls:**
   - Dedicated Security Architecture & Cryptographic Controls subsection (bcrypt 12 rounds, express-session inactivity timeout, anti-flash guard `auth-check.js`, parameterized queries, and audit logging).

---

## 4. OUTDATED INFORMATION CATALOG

1. **Magnetic Reed Switch References:** Replaced across Chapters 1, 2, and 3 with quarter-inch (6.35mm) jack sockets and resistor-divider sensing.
2. **10mm Discrete LED References:** Removed from Table 5 and hardware descriptions (system uses I2C 16x2 LCD and active piezo buzzer for visual and audible feedback).
3. **Direct MySQL-over-HTTP Statement:** Corrected in Chapter 3 architecture description (ESP32 interacts with Node.js REST API endpoints).
4. **Static Timetable Ownership Assumptions:** Corrected statements that implied the scheduled professor automatically owns the physical key.

---

## 5. INTERNAL CONTRADICTIONS CATALOG

1. **PHP vs. Node.js Contradiction:** Heading 172 had a note "(NOTE: No PHP)", yet paragraphs 178, 179, 187, and 204 explicitly claimed PHP was used, while Table 6 on page 75 listed Node.js. All occurrences have been standardized to Node.js and Express.js.
2. **Pin Mapping Table 5 vs. Table 4 Contradiction:** Table 4 (page 32) correctly cited 6.35mm jack sockets on GPIO 32/33, but Table 5 (page 48) listed Red LED on GPIO 5, Green LED on GPIO 2, and Magnetic Switch on GPIO 4. Table 5 has been completely replaced with the actual verified pinout.
3. **ERD Mention vs. Missing Diagram:** Page 39 stated that an ERD defines the database tables, but no ERD existed in the baseline document. Figure 17 and Table 5b now fulfill this requirement completely.

---

## 6. DIAGRAMS & FLOWCHARTS ADDED

| Figure # | Title | Content & Purpose |
| :-: | :--- | :--- |
| **Figure 14** | Automatic Key Return Reminder Flowchart | Step-by-step logic of 1-minute cron, Manila timezone normalization, active schedule filtering, 15m grace period calculation, `Current_User_ID` lookup, atomic DB claim (`CLAIMED`), Nodemailer SMTP dispatch, and audit logging. |
| **Figure 15** | Mobile QR Key Custody Transfer Flowchart | Logic of QR tag scan, session validation, 1-key limit verification, Dept Head multi-key authorization check, row-locking DB transaction (`SELECT ... FOR UPDATE`), `Current_User_ID` update, and mobile confirmation. |
| **Figure 16** | MIS Staff OJT Account Lifecycle & Maintenance Flowchart | Workflow of OJT provisioning, start/end date enforcement, temporary password generation, defect ticket inspection, repair resolution (`maintenance_issues.Resolved_By_User_ID`), and derived expiration. |
| **Figure 17** | Relational Database Entity-Relationship Diagram (ERD) | Comprehensive relational diagram covering all 12 tables (`users`, `laboratories`, `schedules`, `schedule_key_reminders`, `key_authorization_requests`, `laboratory_keys`, `key_found_reports`, `lab_units`, `maintenance_issues`, `maintenance`, `occupancy_log`, `audit_logs`). |

---

## 7. ITEMS REQUIRING HUMAN / INSTITUTIONAL REVIEW

1. **Campus Dean & IT Program Chair Institutional Signatories:** Verify if Dr. Maricel Baligod (Campus Dean) and Elenita T. Capariño (Program Chair) remain current for the 2026–2027 academic year.
2. **SMTP Relay Configuration:** Ensure university or departmental SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`) in `.env` are configured on the production Railway server to allow real-time email dispatch.
3. **OJT Program Policy:** Confirm that the standard OJT internship duration (e.g., 300 to 500 hours / 2 to 3 months) aligns with current departmental curriculum guidelines.
