# LabSync MIS Staff and OJT Management Features
## Technical and Operational Reference Manual

---

> **Document Type:** Institutional System Documentation & Capstone Defense Reference  
> **Target Audience:** Documentation Specialist, Faculty Advisers, Defense Panelists, MIS Staff, Student Researchers  
> **System Name:** LabSync (Smart Laboratory Management & Equipment Monitoring System)  
> **Institution:** Bulacan State University — Sarmiento Campus (BulSU-SC)  
> **Target Environment:** Department of Information Technology Computer Laboratories  
> **Current Version:** LabSync Modular Architecture (Post-Phase 6A)  
> **Release Date:** September 2026  

---

## Table of Contents

1. [Purpose of the New Features](#1-purpose-of-the-new-features)
2. [MIS Staff Role & Account Model](#2-mis-staff-role--account-model)
3. [OJT Intern Account Model](#3-ojt-intern-account-model)
4. [OJT Intern Management System](#4-ojt-intern-management-system)
5. [OJT Account Statuses & Expiration Rules](#5-ojt-account-statuses--expiration-rules)
6. [What OJT Interns Can Do](#6-what-ojt-interns-can-do)
7. [What OJT Interns Cannot Do](#7-what-ojt-interns-cannot-do)
8. [OJT Maintenance Servicing Workflow](#8-ojt-maintenance-servicing-workflow)
9. [Maintenance Accountability & Resolver Attribution](#9-maintenance-accountability--resolver-attribution)
10. [Handling Reopened and Historical Tickets](#10-handling-reopened-and-historical-tickets)
11. [OJT Interactive System Tutorial](#11-ojt-interactive-system-tutorial)
12. [Role-Customized Help & Support](#12-role-customized-help--support)
13. [Account Settings & Personal Profile QR Rule](#13-account-settings--personal-profile-qr-rule)
14. [Role Permissions Summary Matrix](#14-role-permissions-summary-matrix)
15. [Complete End-to-End Operational Workflow](#15-complete-end-to-end-operational-workflow)
16. [Key Benefits to the Institution](#16-key-benefits-to-the-institution)
17. [Current Limitations & Delimitations](#17-current-limitations--delimitations)

---

## 1. Purpose of the New Features

In academic computer laboratories, Management Information System (MIS) personnel are responsible for keeping dozens of workstations, network peripherals, and laboratory facilities operational. During busy academic semesters, student interns (On-the-Job Trainees or **OJT interns**) assist the permanent MIS Staff with daily physical inspections, hardware troubleshooting, and software repairs.

Previously, technical staff often relied on shared office logins or generic account labels. This made it difficult to determine which specific technician resolved an equipment issue or when a student intern's official duties ended.

To solve these challenges, LabSync introduced a dedicated **MIS Staff and OJT Accountability System**:

* **Individual Accounts for Permanent Staff:** Permanent MIS personnel now operate under their own individual accounts with personalized profile credentials and secure passwords.
* **Controlled Intern Accounts:** OJT interns receive individual, temporary accounts with predefined internship start and end dates.
* **Role-Appropriate Access:** OJT interns are granted only the specific tools they need to inspect workstations and update repair tickets. High-level administrative functions remain strictly protected.
* **Work Order Accountability:** Whenever a computer problem is resolved, the system records the exact name, role, and timestamp of the person who resolved it.
* **Tailored Guidance:** Both permanent staff and interns receive custom interactive tutorials and help centers matching their specific responsibilities.

**The primary goal is to establish clear operational boundaries, protect laboratory security, simplify intern supervision, and provide transparent accountability for every laboratory repair.**

---

## 2. MIS Staff Role & Account Model

The permanent **MIS Staff** account represents an authorized institutional technical administrator. 

### Key Characteristics

* **Individual Identity:** Each staff member logs in using their official institutional email and personal password. The system identifies them by their real name (e.g., *Rene Morales*) rather than a generic terminal label.
* **Personalized Dashboard Experience:** Upon login, the top navigation banner greets the staff member personally based on the time of day (e.g., *"Good Morning, Rene!"*).
* **Profile Management:** Staff members can open Account Settings to update their full name, official contact number, profile photo, and login password at any time.
* **Full Technical Authority:** Permanent MIS Staff have full authority to oversee all computer laboratories, monitor workstation health, manage physical laboratory keys, print equipment QR labels, and supervise student interns.

### Daily MIS Staff Workflow

```text
MIS Staff logs in with personal credentials
        ↓
System greets the user and displays the MIS Dashboard
        ↓
Reviews overall laboratory health, active tickets, and key custody
        ↓
Supervises OJT interns and assigns maintenance tasks
        ↓
Performs or oversees hardware and software servicing
        ↓
System logs all administrative and repair actions under the staff member's name
```

---

## 3. OJT Intern Account Model

An **OJT Intern Account** is an individual, temporary account created for an enrolled student currently rendering required internship hours within the MIS office.

### Key Characteristics

* **Individual Accountability:** Every intern has a distinct account. Interns never share passwords or log in under a permanent staff member's credentials.
* **Defined Duty Duration:** Each intern account has an assigned **Internship Start Date** and **Internship End Date** established during registration.
* **Strict Expiration Control:** Once the internship end date passes, the account automatically expires and can no longer be used.
* **Administrative Suspension:** Permanent staff can temporarily deactivate an intern account at any moment if the student is on leave, reassigned, or under review.
* **Principle of Least Privilege:** Interns are given access only to workstation monitoring and ticket progress tools. They cannot alter department schedules, delete computer records, manage other users, or modify physical key tracking.

---

## 4. OJT Intern Management System

Permanent MIS Staff manage all student interns through a dedicated menu called **OJT Intern Management**. 

This interface allows staff to oversee all past, present, and incoming interns in one central, organized dashboard.

```text
MIS Staff opens OJT Intern Management
        ↓
Selects "Add OJT Intern"
        ↓
Enters intern's name, email, phone, and internship start/end dates
        ↓
Submits the form
        ↓
System generates a secure temporary password
        ↓
Staff copies and hands the one-time credentials to the student intern
        ↓
Intern logs in and begins assigned laboratory servicing duties
```

### Core Management Capabilities

#### 1. Add OJT Intern
MIS Staff can register a new intern by providing their Full Name, valid Institutional Email, Contact Mobile Number, Internship Start Date, and Internship End Date. 

#### 2. One-Time Secure Credential Issuance
When a new intern account is created, the system generates a secure, randomized temporary password. 
* The credentials appear inside an on-screen dialog box with an automated **Copy Credentials** button.
* Once the dialog is closed, the temporary password is permanently cleared from the screen for safety.
* The intern uses these credentials for their first login.

#### 3. Edit Intern Details & Period Extension
If an intern's contact information changes or their required internship hours are officially extended, MIS Staff can click **Edit** on the intern's record to update their name, phone number, or start and end dates.

#### 4. Temporary Password Reset
If an intern forgets their password or suspects unauthorized access, MIS Staff can click **Reset PW**. 
* The system invalidates the previous password immediately.
* A fresh temporary password is generated and displayed in a secure confirmation dialog for the staff member to provide to the intern.

#### 5. Manual Account Deactivation
If an intern is temporarily inactive or under administrative evaluation, staff can click **Deactivate**. The intern is instantly prevented from logging in. If the intern is already logged into an active session, their session is immediately revoked.

#### 6. Account Reactivation
If a deactivated intern resumes duty, staff can click **Activate** to restore their access immediately without needing to re-register the student.

#### 7. Quick Filtering & Live Search
Staff can locate specific interns quickly using the live search bar (filtering by student name or email) or by clicking one-touch status filter tabs:
* **All:** Displays all intern records.
* **Active:** Displays interns currently eligible to perform duties.
* **Expiring:** Displays interns whose service concludes within the next 7 days.
* **Inactive:** Displays deactivated or concluded accounts.

---

## 5. OJT Account Statuses & Expiration Rules

To help MIS Staff track intern turnover at a glance, the system categorizes every OJT account into one of four clear statuses:

| Status Badge | Status Name | Operational Meaning | System Behavior |
| :---: | :--- | :--- | :--- |
| 🟢 | **Active** | The intern is currently rendering service within their approved internship period. | Full access to allowed OJT features (Dashboard, Maintenance Tracker, Account Settings). |
| 🟡 | **Expiring Soon** | The intern's scheduled end date is within **7 calendar days** or is **today**. | Intern can still perform duties normally; staff receives visual alerts to prepare completion paperwork. |
| 🟠 | **Expired** | The scheduled internship end date has passed. | Login is automatically blocked. Active sessions are terminated with a clear notice that the internship has concluded. |
| ⚪ | **Deactivated** | Staff manually disabled the account. | Login is blocked immediately regardless of the calendar date. |

### Inclusive Final Day Rule
Internship dates operate on an **inclusive calendar principle**. An intern whose end date is set to *September 16, 2026* is fully authorized to log in, inspect laboratories, and resolve work orders until the very end of that day. The account expires only when the calendar advances to *September 17, 2026*.

---

## 6. What OJT Interns Can Do

OJT Interns are granted operational tools tailored specifically to hands-on equipment maintenance and laboratory inspections:

* **OJT Staff Dashboard:** Interns can view laboratory health summaries, count active computer repair tickets, review recent hardware activity logs, and check room-by-room workstation conditions.
* **Maintenance Tracker Workspace:** Interns can view all open computer problem reports submitted by students or faculty across all campus IT laboratories.
* **Diagnostic & Progress Updates:** Interns can open any active ticket, read student descriptions, and update the ticket status to **In Progress** while conducting troubleshooting.
* **Ticket Resolution:** When an intern successfully repairs hardware or solves a software fault, they can mark the ticket as **Resolved**.
* **Automatic Equipment Restoration:** Resolving a ticket automatically updates the workstation's status back to **Functional** across laboratory maps.
* **Account Self-Service:** Interns can open Account Settings to update their phone number, upload an avatar photo, or change their login password.
* **Customized Guidance:** Interns have access to a dedicated interactive tutorial and help manual covering laboratory servicing guidelines and safety protocols.

---

## 7. What OJT Interns Cannot Do

To safeguard institutional records, ensure student safety, and maintain strict data integrity, OJT accounts are restricted from administrative and policy-level operations:

* ❌ **Cannot Manage OJT Accounts:** Interns cannot create, edit, activate, deactivate, or reset passwords for other interns.
* ❌ **Cannot Manage User Accounts:** Interns cannot view, modify, or create faculty, IT Head, or MIS Staff accounts.
* ❌ **Cannot Manage Laboratory Keys:** Physical key inventory, 2-sided QR keychain inserts, missing key reports, and key custodian transfers are reserved for permanent staff and faculty.
* ❌ **Cannot Register or Delete Workstations:** Interns cannot add new computers to the database, reconfigure computer specifications, or delete computer records.
* ❌ **Cannot Generate Equipment QR Labels:** The official QR code generation tool used for printing laboratory stickers is restricted to permanent staff.
* ❌ **Cannot Manage Academic Schedules:** Class schedules, faculty room allocations, and semester master timetables are inaccessible to interns.
* ❌ **Cannot Access System Administration:** Global system configurations and administrative settings are inaccessible.
* ❌ **Cannot Delete Maintenance Records:** Interns can update ticket statuses, but they cannot permanently delete reported tickets or erase historical audit trails.

> **Security Note:** These restrictions are strictly enforced by the server. Even if a user attempts to navigate to an administrative web address directly, the system rejects the request and redirects the user back to their authorized dashboard.

---

## 8. OJT Maintenance Servicing Workflow

The step-by-step workflow below illustrates how an OJT Intern investigates, repairs, and resolves a computer issue in a laboratory:

```text
Step 1: Problem Reported
A student or faculty member reports a computer issue (e.g., "PC-04 Mouse Unresponsive in RM 203").
        ↓
Step 2: Ticket Review
The OJT Intern opens the Maintenance Tracker and reviews the issue description and priority.
        ↓
Step 3: Investigation (In Progress)
The intern goes to the laboratory room, locates the workstation, and changes the ticket to "In Progress".
        ↓
Step 4: Physical Repair
The intern troubleshoots the hardware (e.g., reconnects or replaces the faulty mouse).
        ↓
Step 5: Ticket Resolution
The intern marks the ticket as "Resolved".
        ↓
Step 6: System Synchronization
The system marks the ticket Completed, sets PC-04 back to "Functional", 
and records the intern's name, role, and exact time of repair.
```

---

## 9. Maintenance Accountability & Resolver Attribution

One of the most important improvements in LabSync is **Resolver Attribution**. Previously, resolved tickets showed generic text such as *"Resolved by MIS Staff"*, making it impossible to know which individual technician did the work.

Now, whenever an authorized user resolves a ticket, LabSync captures their authenticated identity directly from their secure login session.

### What is Recorded and Displayed

When a ticket is marked as resolved, the system records and publicly displays:
1. **Resolver Name:** The full name of the user (e.g., *Juan Dela Cruz* or *Rene Morales*).
2. **Resolver Role:** The official role of the user (e.g., **OJT** or **MIS Staff**).
3. **Date and Time of Completion:** The exact timestamp when the ticket was resolved (e.g., *Sep 16, 2026 · 9:42 PM*).

### Where Resolver Attribution Appears

* **Maintenance Tracker Table:** Below the green "Completed" status badge, a clear note displays:  
  `Resolved by Juan Dela Cruz (OJT)`
* **Ticket Inspection Details Modal:** A dedicated resolution card appears at the top of the window showing the technician's name, role badge, and completion timestamp.
* **Department PC Reports View:** Faculty and the IT Department Head can inspect historical reports and see exactly who repaired each computer.

### Server-Derived Security Rule
The system strictly determines the resolver identity from the authenticated server session. A user cannot fabricate or "spoof" who completed a repair; the server always attributes the action to the currently logged-in user.

---

## 10. Handling Reopened and Historical Tickets

LabSync handles ticket status changes cleanly without corrupting past records:

### Reopened Tickets
If a computer problem recurs after being marked resolved:
* An authorized user can change the ticket status back to **In Progress** or **Pending**.
* When reopened, the system clears the active resolver name, role, and resolution timestamp because the work is no longer considered complete.
* The previous resolution action remains safely preserved in the background security audit history for administrative auditing.

### Historical Records (Graceful Backward Compatibility)
Before this feature was added, earlier tickets did not have individual resolver names attached. 
* For older resolved tickets, the system cleanly displays:  
  **Work Order Completed** along with the original completion date.
* The system **never** displays blank placeholders, `null` text, or fabricated staff names for historical records.

---

## 11. OJT Interactive System Tutorial

When a new OJT intern logs into LabSync for the first time, the system automatically welcomes them with a **role-specific spotlight tutorial**. 

Permanent MIS Staff receive a 7-step guide covering administrative features (such as Key Management, QR generation, and Intern Management), whereas OJT interns receive a focused **4-step operational tutorial**:

```text
Step 1: OJT Staff Dashboard
Teaches how to check laboratory computer health, pending repair counts, and recent activity.
        ↓
Step 2: Maintenance Tracker
Explains how to review reported issues, open ticket details, and update repair progress.
        ↓
Step 3: Help & Support
Shows where to find laboratory standard operating procedures and technical safety rules.
        ↓
Step 4: Profile & Account Settings
Demonstrates how to update personal contact info and change account passwords safely.
```

Interns can re-watch this walkthrough at any time by clicking **"Watch System Tutorial"** in their user profile menu.

---

## 12. Role-Customized Help & Support

The **Help & Support** center adjusts its contents automatically based on the logged-in user's role:

* **For OJT Interns:** Displays practical servicing resources, including:
  * Overview of the Dashboard and Workstation Condition tracking.
  * Step-by-step instructions for diagnosing issues in the Maintenance Tracker.
  * One-click ticket resolution procedures.
  * Standard laboratory safety guidelines and hardware handling precautions.
* **Intentionally Excluded from OJT View:** To prevent confusion, administrative guides regarding Key Management, PC QR Sticker Generation, and Intern Account Administration are hidden from interns.

---

## 13. Account Settings & Personal Profile QR Rule

All authenticated users can manage their personal profiles through the **Account Settings** modal:
* **Profile Details:** Users can review and edit their Full Name, Contact Mobile Number, and upload a profile photo.
* **Email Security:** Changing an email address requires entering the current password and confirming an approval link.
* **Password Management:** Users can update their login password with real-time feedback on password strength.

### Institutional Rule: Personal Profile QR Access

LabSync features a digital **Personal Profile QR Code** used as an electronic pass for laboratory door scanners. Because academic faculty and department heads require door access, while technical staff utilize operational keys and physical maintenance workflows, the system enforces a strict role policy:

| System Role | Personal Profile QR Code Available? | Purpose & Institutional Rationale |
| :--- | :---: | :--- |
| **IT Department Head** | **YES** ✅ | Used for electronic room access, faculty oversight, and room occupancy verification. |
| **Faculty / Instructor** | **YES** ✅ | Used to scan into laboratory classrooms for scheduled teaching sessions. |
| **MIS Staff** | **NO** ❌ | Operational technical role; does not use personal classroom door access passes. |
| **OJT Intern** | **NO** ❌ | Supervised student assistant role; excluded from electronic door access passes. |

For MIS Staff and OJT Interns, the "My QR Code" tab is hidden entirely from the Account Settings window to maintain an uncluttered, relevant interface.

---

## 14. Role Permissions Summary Matrix

The table below provides a quick, authoritative comparison of what each role in the LabSync ecosystem can and cannot perform:

| System Capability / Feature | IT Department Head | Faculty Member | Permanent MIS Staff | OJT Intern |
| :--- | :---: | :---: | :---: | :---: |
| **Access Main Dashboard** | ✅ (Head Dashboard) | ✅ (Faculty View) | ✅ (MIS Dashboard) | ✅ (OJT Dashboard) |
| **View Laboratory Health & PC Status** | ✅ | ✅ | ✅ | ✅ |
| **Submit PC Issue Report** | ✅ | ✅ | ✅ | ✅ |
| **Update Maintenance Ticket Status** | ✅ | ❌ | ✅ | ✅ |
| **Resolve Maintenance Work Order** | ✅ | ❌ | ✅ | ✅ |
| **Delete Maintenance Tickets** | ✅ | ❌ | ✅ | ❌ |
| **Manage OJT Intern Accounts** | ❌ | ❌ | ✅ | ❌ |
| **Manage Physical Laboratory Keys** | ✅ | ❌ | ✅ | ❌ |
| **Transfer / Accept Key Custody** | ✅ | ✅ | ❌ | ❌ |
| **Add / Delete Workstation Units** | ✅ | ❌ | ✅ | ❌ |
| **Print Equipment QR Stickers** | ✅ | ❌ | ✅ | ❌ |
| **Manage Master Class Schedules** | ✅ | ❌ | ❌ | ❌ |
| **Manage Faculty Accounts** | ✅ | ❌ | ❌ | ❌ |
| **Personal Profile QR Code Access** | ✅ | ✅ | ❌ | ❌ |
| **Self-Service Password & Profile Edit** | ✅ | ✅ | ✅ | ✅ |

---

## 15. Complete End-to-End Operational Workflow

The diagram below illustrates the full lifecycle connecting the MIS Staff, OJT Intern, and the laboratory maintenance workflow from onboarding to completion:

```text
====================================================================================
                        PHASE 1: ONBOARDING & SETUP
====================================================================================
Permanent MIS Staff logs in
        ↓
Opens "OJT Intern Management" menu
        ↓
Registers OJT Intern (Name, Email, Phone, Start Date, End Date)
        ↓
System generates temporary credentials; staff hands them to the intern
        ↓
Intern logs in, completes the 4-step OJT tutorial, and updates their profile

====================================================================================
                     PHASE 2: DAILY LABORATORY OPERATIONS
====================================================================================
Student or Faculty reports a faulty computer (e.g., Broken Keyboard in Lab 204)
        ↓
OJT Intern sees ticket on Dashboard and opens Maintenance Tracker
        ↓
Intern inspects workstation and updates status to "In Progress"
        ↓
Intern repairs or replaces the faulty keyboard
        ↓
Intern marks the ticket as "Resolved"
        ↓
System restores PC to "Functional" and attributes resolution to:
"Resolved by: [Intern Name] · Role: OJT · [Date & Time]"

====================================================================================
                    PHASE 3: SUPERVISION & ACCOUNT CLOSURE
====================================================================================
MIS Staff reviews completed repairs and monitors intern activity
        ↓
If intern requires more time → Staff edits account and extends End Date
If intern is temporarily on leave → Staff clicks "Deactivate"
        ↓
When internship duration concludes (End Date passes):
Account automatically transitions to "EXPIRED"
        ↓
Intern is safely locked out of the system; historical repair records remain intact
====================================================================================
```

---

## 16. Key Benefits to the Institution

The introduction of dedicated MIS and OJT capabilities delivers six concrete operational advantages to Bulacan State University — Sarmiento Campus:

1. **Definite Accountability:** Every laboratory repair is tied to the specific individual who performed the work. Supervisors no longer have to guess who serviced a computer.
2. **Strict Access Control:** Interns are given only the tools required for physical hardware maintenance. Sensitive academic schedules, key custody records, and faculty accounts remain protected.
3. **Automated Lifecycle Management:** Staff do not need to manually remember when every intern finishes their contract. The system automatically expires accounts on their designated end date.
4. **Fast, Secure Credential Handling:** Temporary passwords and one-click resets allow staff to resolve intern login issues in seconds without sharing master administrator passwords.
5. **Clear Operational History:** Faculty and administrators can audit past maintenance reports and see complete resolution timelines with verified technician names.
6. **Smooth Onboarding:** Role-specific interactive tutorials and tailored help screens guide new interns immediately, minimizing the training burden on permanent staff.

---

## 17. Current Limitations & Delimitations

To maintain clear academic boundaries for capstone evaluation, the following system delimitations are explicitly documented:

* **No Self-Registration:** OJT accounts cannot be registered by students independently. Every intern account must be created directly by an authorized permanent MIS Staff member.
* **No Peer Administration:** OJT interns cannot manage, view, or reset credentials for other student interns.
* **Single Role Assignment:** An account is designated as either a permanent MIS Staff member or an OJT intern; a user cannot hold both roles simultaneously on a single login.
* **Non-Reversible Expiration without Staff Action:** Once an internship end date has elapsed, an intern cannot log in unless permanent MIS Staff explicitly edits the account and extends the scheduled end date.
* **Historical Resolver Immutability:** Pre-existing resolved tickets logged before the activation of Phase 6A do not have retroactive technician names attached and are preserved as *"Work Order Completed"* to prevent false attributions.

---

*This technical document serves as an authoritative operational guide for the LabSync capstone documentation and defense panel review.*
