# LabSync — Full System Documentation

> **Version:** 1.2.0 (Modular Architecture with Key Transfer & Deduplicated Maintenance Pipeline)  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Environment:** Node.js + Express v5 + MySQL / MariaDB  
> **Last Updated:** September 2026  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [File & Folder Structure](#3-file--folder-structure)
4. [User Roles & Access Control](#4-user-roles--access-control)
5. [Pages & Features](#5-pages--features)
   - [5.1 Public / Student Workstation Interaction](#51-public--student-workstation-interaction)
   - [5.2 Faculty / Professor Features](#52-faculty--professor-features)
   - [5.3 IT Department Head Features](#53-it-department-head-features)
   - [5.4 MIS Staff Features](#54-mis-staff-features)
   - [5.5 Physical Key Management & Keychain Tag Studio](#55-physical-key-management--keychain-tag-studio)
   - [5.6 Mobile Key Transfer & Room Claim Protocol](#56-mobile-key-transfer--room-claim-protocol)
   - [5.7 Print & Export Layouts](#57-print--export-layouts)
   - [5.8 Authentication & Account Utilities](#58-authentication--account-utilities)
6. [CSS Architecture & Design System](#6-css-architecture--design-system)
7. [Frontend JavaScript Architecture](#7-frontend-javascript-architecture)
8. [Backend Architecture & Data Flow](#8-backend-architecture--data-flow)
9. [Database Schema & Migrations](#9-database-schema--migrations)
10. [REST API Specifications](#10-rest-api-specifications)
11. [Security, Cryptography & Rate Limiting](#11-security-cryptography--rate-limiting)
12. [Security Audit Logging System](#12-security-audit-logging-system)
13. [IoT Hardware Integration](#13-iot-hardware-integration)
14. [Transactional Email System](#14-transactional-email-system)
15. [Environment Configuration](#15-environment-configuration)
16. [Installation & Setup](#16-installation--setup)

---

## 1. Project Overview

**LabSync** is a full-stack, IoT-integrated web platform developed for the IT laboratory facilities of **Bulacan State University – Sarmiento Campus**. It unifies real-time laboratory room availability, drag-and-drop course schedule management, workstation hardware fault reporting via QR codes, faculty access administration, physical key inventory management, peer-to-peer mobile key handoffs, and hardware-level IoT key dock monitoring into a single synchronized system.

### Core Problems Solved

| Problem | LabSync Solution |
|---|---|
| **Manual paper-based PC fault reports** | Students scan a physical QR code label on the workstation to submit structured digital repair tickets (`submit-pc-report.html`) without account friction. |
| **Duplicate fault submissions & queue bloat** | Relational deduplication via `maintenance_issues` table with stored generated hash `Active_Issue_Key` groups incoming reports under single tickets with `👤 Name [+N]` badges. |
| **Unknown room availability at a glance** | Real-time room status engine computes room states (*Available* / *In Session* / *Borrowed*) using schedule slots and IoT key dock state. |
| **Hallway key handoff uncertainty** | Mobile Key Transfer & Room Claim (`key-transfer.html`) allows instructors to legally scan key QR fobs and claim custody directly without visiting the dock. |
| **Physical key loss and tracking blindness** | MIS Key Inventory Studio (`mis-keys.html`) catalogs physical keys, tracks status (*ACTIVE* / *MISSING*), and generates printable two-sided keychain inserts (1.14" x 1.84"). |
| **Scheduling clashes & double-booking** | Drag-and-drop Schedule Studio (`room-schedule-editor.html`) with real-time overlap and cross-room professor conflict validation. |
| **Maintenance pipeline blind spots** | Centralized maintenance queue (`mis-maintenance.html`) tracking tickets through *Pending* → *Resolved* with auto-restoration of PC health. |
| **Lack of security auditability** | Centralized non-blocking audit logging (`audit_logs`) tracking authentication, password updates, key transfers, and admin events. |

---

## 2. Technology Stack

### Backend
| Technology | Version / Specification | Purpose |
|---|---|---|
| **Node.js** | v18.0.0+ | Server runtime environment |
| **Express** | ^5.2.1 | Web application framework and REST API routing |
| **MySQL2** | ^3.22.3 | MySQL / MariaDB driver supporting async/await connection pooling and transactions |
| **bcrypt** | ^5.1.1 | Cryptographic password hashing (12 salt rounds) |
| **express-session** | ^1.19.0 | Server-side cookie session management (24h expiry) |
| **express-rate-limit**| ^7.5.0 | Multi-tier brute-force and DoS defense middleware |
| **Nodemailer** | ^8.0.7 | Transactional email delivery (Welcome, Password Reset, Email Verification) |
| **QRCode** | ^1.5.4 | Server-side cryptographic QR code data URL generation |
| **dotenv** | ^17.4.2 | Environment variable configuration loader |
| **cors** | ^2.8.6 | Configurable Cross-Origin Resource Sharing middleware |
| **crypto** | Built-in | Cryptographic token generation for password resets and badges |

### Frontend
| Technology | Specification | Purpose |
|---|---|---|
| **Vanilla HTML5** | Semantic standard | Page layouts and templates across 21 dedicated HTML files |
| **Vanilla CSS3** | Modular design tokens | CSS variables, responsive breakpoints, dark mode, high contrast |
| **Vanilla JavaScript** | Modular ES6+ (CommonJS backend) | Services, controllers, renderers, validators, and component facades |
| **Lucide Icons** | CDN Distribution | Iconography across navigation, actions, and status chips |
| **Google Fonts** | Poppins & Plus Jakarta Sans | University display and UI body typography |
| **html2canvas** | CDN Distribution | Client-side wallpaper and timetable image export |
| **SheetJS (xlsx)** | CDN Distribution | Client-side Excel/CSV curriculum parsing |

### IoT / Hardware
| Component | Specification | Purpose |
|---|---|---|
| **ESP32 Dev Module** | 30-pin Dual Core | IoT device controller and Wi-Fi HTTP client |
| **GM65 Barcode Scanner** | UART (9600 baud) | Optical QR code badge reader for faculty authentication |
| **ADC Key Divider Slots** | D32 (10kΩ) / D33 (0Ω) | Resistor-divider sensing for key presence and wrong-slot alarm |
| **16x2 I2C LCD** | Address `0x27` (SDA 21 / SCL 22) | Real-time visual user feedback and scan status |
| **Piezoelectric Buzzer** | Active Low (GPIO 25) | Audio feedback for successful scans, key events, and wrong-slot alarms |
| **Arduino Framework** | `LabSync_ESP32.ino` | ESP32 firmware sketch using `HTTPClient` and `ArduinoJson` |

---

## 3. File & Folder Structure

```
LabSync/
├── server.js                       # Express bootstrap & HTTP server entry point
├── package.json                    # Dependencies and npm lifecycle scripts
├── labsync.sql                     # Baseline MySQL schema initialization dump
├── LabSync_ESP32.ino               # ESP32 firmware sketch
│
├── config/                         # Environment & application configuration
│   └── app.config.js               # Port, CORS origins, and session settings
│
├── controllers/                    # Domain request controllers
│   ├── auth.controller.js          # Login, logout, session check, password reset
│   ├── curriculum.controller.js    # Subject catalog management
│   ├── faculty.controller.js       # Faculty CRUD and role management
│   ├── iot.controller.js           # Occupancy logs, heartbeats, device pings
│   ├── keys.controller.js          # Key inventory, QR tags, peer-to-peer transfer
│   ├── labs.controller.js          # Room CRUD, PC units, batch QR generation
│   ├── maintenance.controller.js   # Maintenance tickets, status transitions, notifications
│   ├── schedules.controller.js     # Timetable CRUD, conflict validation, summaries
│   ├── settings.controller.js      # Signatories and health check
│   └── users.controller.js         # User profile, avatars, QR access, bcrypt password updates
│
├── database/                       # Database persistence & migrations
│   ├── connection.js               # mysql2 connection pool with transaction helper
│   ├── migrate.js                  # Automated SQL migration runner
│   └── migrations/                 # Incremental SQL migration scripts (001–014)
│       ├── 010_create_iot_devices.sql
│       ├── 011_create_audit_logs.sql
│       ├── 012_create_key_management_tables.sql
│       ├── 013_create_maintenance_issues.sql
│       └── 014_add_user_updated_at.sql
│
├── middleware/                     # Express request pipeline middlewares
│   ├── auth.js                     # Authentication (requireAuth) & role guards (requireRole)
│   ├── errorHandler.js             # Centralized JSON error serialization
│   └── rateLimiter.js              # Multi-tier RFC-compliant rate limiters
│
├── repositories/                   # Parameterized SQL data access layer
│   ├── audit.repository.js         # Immutable security audit logging
│   ├── curriculum.repository.js
│   ├── faculty.repository.js
│   ├── iot.repository.js
│   ├── keys.repository.js          # Key inventory & custody queries
│   ├── laboratory.repository.js
│   ├── maintenance.repository.js   # Deduplicated issue queries
│   ├── schedule.repository.js
│   ├── settings.repository.js
│   └── user.repository.js
│
├── routes/                         # Centralized & domain REST route definitions
│   ├── index.js                    # Router aggregator & legacy compatibility bridges
│   ├── auth.routes.js              # /api/auth/*
│   ├── curriculum.routes.js        # /api/curriculum/*
│   ├── faculty.routes.js           # /api/faculty/*
│   ├── iot.routes.js               # /api/occupancy/*
│   ├── keys.routes.js              # /api/keys/*
│   ├── labs.routes.js              # /api/laboratories/*
│   ├── maintenance.routes.js       # /api/reports/*
│   ├── pcs.routes.js               # /api/pcs/*
│   ├── schedules.routes.js         # /api/schedules/*
│   ├── settings.routes.js          # /api/settings/*
│   └── users.routes.js             # /api/user/*
│
├── services/                       # Business logic services
│   ├── auditService.js             # Centralized security audit logging
│   ├── authService.js
│   ├── curriculumService.js
│   ├── dbInit.js
│   ├── emailService.js
│   ├── facultyService.js
│   ├── iotService.js
│   ├── keysService.js              # Key registration, QR tags & atomic transfers
│   ├── laboratoryService.js
│   ├── maintenanceService.js       # Concurrency locking & issue deduplication
│   ├── scheduleService.js
│   ├── settingsService.js
│   ├── usersService.js             # Bcrypt hashing & password validation
│   ├── email/                      # Transactional email templates (welcome, reset, verify)
│   └── iot/                        # IoT claim, heartbeat, and occupancy handlers
│
├── css/                            # Modular CSS design system
│   ├── variables.css               # Design tokens, color palettes, and themes
│   ├── reset.css                   # Box-sizing, margin/padding resets
│   ├── layouts.css                 # Layout wrappers, headers, sidebars
│   ├── responsive.css              # Responsive breakpoints (320px–1024px) & bottom nav
│   ├── auth.css                    # Login, reset, and split-screen authentication styles
│   ├── tutorial.css                # Spotlight tutorial overlay styles
│   ├── schedule-studio.css         # Timetable grid & wallpaper studio styles
│   └── components/                 # Component-specific stylesheets
│
├── js/                             # Modular frontend JavaScript
│   ├── auth-check.js               # Client-side anti-flash session & role guard
│   ├── core/                       # App lifecycle, clock, accessibility, tutorials
│   ├── components/                 # Reusable UI modals, dropdowns, toasts, cards
│   │   └── profile/                # Account, help, and password modals
│   ├── services/                   # Client-side API request abstraction services
│   │   └── keys.service.js         # Key inventory & transfer API service
│   ├── pages/                      # Page-specific coordinators
│   │   ├── key-transfer.js         # Mobile Key Transfer & Room Claim coordinator
│   │   ├── mis-keys.js             # Key inventory & 2-sided keychain print coordinator
│   │   ├── mis-maintenance.js      # Maintenance queue coordinator
│   │   ├── mis-qr-generator.js     # PC QR generator coordinator
│   │   └── submit-pc-report.js     # Public fault reporting controller
│   ├── scheduling/                 # Timetable editor, collision math, drag/drop
│   ├── reports/                    # Ticket parser, filters, renderers, actions
│   ├── faculty/                    # Faculty management modals
│   ├── faculty-schedule/           # Faculty personal schedule renderer
│   ├── master-schedule/            # Master schedule rooms and curriculum modals
│   └── utils/                      # DOM, time, and string utility helpers
│
├── assets/                         # Static images, university logos, icons
└── docs/                           # Project documentation hierarchy
    ├── SYSTEM_DOCUMENTATION.md     # Full technical manual
    ├── hardware/                   # IoT wiring diagrams and sketch guide
    └── releases/                   # Version release summaries
```

---

## 4. User Roles & Access Control

LabSync enforces strict access control across **3 authenticated roles** and **1 public student interaction path**:

| Role | Default Dashboard | Description & Capabilities |
|---|---|---|
| **IT Department Head** | `it-head-dashboard.html` | Full administrative access: master schedule viewing/editing, Schedule Studio, faculty CRUD, role modifications, leadership delegation, curriculum catalog, signatory settings, and mobile room key claims. |
| **MIS Staff** | `mis-staff-dashboard.html` | Technical & custodial access: maintenance ticket tracker, ticket status resolution, workstation QR generation, physical key inventory management (`mis-keys.html`), and keychain insert printing. |
| **Faculty / Professor** | `index.html` | Instructional access: real-time room availability, personal weekly timetable, laboratory PC fault viewer, mobile key transfer & room claim (`key-transfer.html`), and account profile settings. |
| **Student / Public** *(No Login)* | `submit-pc-report.html` | Public workstation access: students scan physical QR codes affixed to lab PCs to submit hardware/software fault reports. No student account or dashboard exists. |

---

## 5. Pages & Features

### 5.1 Public / Student Workstation Interaction

#### `submit-pc-report.html` — PC Fault Reporting Form
- **Access**: Public (no login required).
- **Trigger**: Scanned by student mobile devices from QR labels affixed to lab computers.
- **Query Parameter**: Accepts `?room=203&pc=01` to pre-select the room and workstation.
- **Form Fields**:
  - Hardware/Software categories: Monitor, Keyboard, Mouse, System Unit, PC/Laptop, Other.
  - Student Name, Student Program & Section (normalized to uppercase).
  - Issue Remarks (hard-capped at 200 characters).
- **Submission**: Issues `POST /api/reports/submit`.
- **Deduplication**: Automatically links to an active `Maintenance_Issue_ID` if an issue is already open for that component on that PC, preventing duplicate ticket spamming.

---

### 5.2 Faculty / Professor Features

#### `index.html` — Faculty Dashboard
- Summary stat cards: Active Lab Rooms, Pending PC Reports, Classes Today.
- Role-specific Quick Start Guide.
- Live room status card grid with 3-second real-time polling.

#### `room-status.html` — Laboratory Room Status
- Visual cards for all laboratory rooms displaying dynamically calculated availability:
  - **Available** (Green) — Key present in dock.
  - **In Session** (Indigo / Red) — Key absent; holder is the scheduled faculty for an active class slot.
  - **Borrowed** (Orange) — Key absent; holder is another faculty or taken during an unscheduled slot.
- Real-time occupancy activity log showing recent key removals, returns, QR scans, and peer-to-peer transfers.

#### `my-schedule.html` — Personal Faculty Schedule
- Interactive weekly timetable grid (Monday–Saturday).
- Filterable by **Academic Year** and **Semester**.
- Displays only classes assigned to the logged-in faculty member.
- Includes Wallpaper / Schedule Studio export preview via `html2canvas`.

#### `faculty-pc-reports.html` — PC Fault Reports Viewer
- Faculty view of student-reported hardware issues for assigned laboratory rooms.

---

### 5.3 IT Department Head Features

#### `it-head-dashboard.html` — Administrative Dashboard
- Real-time digital clock, department statistics, and management quick-action tiles.

#### `master-schedule.html` — Master Timetable Grid
- Global schedule matrix across all laboratory rooms with Academic Year and Semester selectors.
- Room management modals, curriculum CSV/Excel import, bulk schedule PDF download, and signatory settings.

#### `room-schedule-editor.html` — Schedule Studio (Drag & Drop)
- Drag-and-drop course scheduler with automatic collision validation ($\max(S_1, S_2) < \min(E_1, E_2)$).
- Cross-room professor ghost schedule overlays.
- Touch drag-and-drop polyfill for mobile devices.
- Dirty-state navigation guard against accidental data loss.

#### `faculty-management.html` — Faculty & Staff Administration
- Staff directory CRUD with role assignments and leadership delegation.
- Automated generation of temporary credentials with transactional welcome email dispatch.

---

### 5.4 MIS Staff Features

#### `mis-staff-dashboard.html` — Technical Dashboard
- Visual stat indicators: Open Tickets, Resolved Tickets, Connectivity, and Active Labs.

#### `mis-maintenance.html` — Maintenance Ticket Tracker
- **Columns**: `Ticket ID` │ `Date & Time` │ `Lab Room` │ `PC Unit` │ `Reported By` │ `Issue Details & Remarks` │ `Actions`.
- **Reporter Chip (`.reporter-chip`)**: Displays single reporter or multi-reporter pill with `[+N]` count badge (`👤 John [+2] ›`). Clicking opens the Ticket Details Modal with individual student timestamps and remarks.
- **Two-State Lifecycle**: `Pending` → `Resolved`.
- **Automatic Health Restoration**: Restores `lab_units.Condition_Status` to `Functional` once all active component issues on that workstation are resolved.

#### `mis-qr-generator.html` — PC & QR Code Label Generator
- Automated batch generation and printing of unique workstation QR label cards.

---

### 5.5 Physical Key Management & Keychain Tag Studio

#### `mis-keys.html` — Physical Key Inventory Dashboard
- **Key Catalog**: Manages physical room keys (`KEY-IT-203-A`) mapped to laboratory rooms.
- **Status Lifecycle**: Toggle keys between `ACTIVE` and `MISSING`.
- **Two-Sided Keychain Insert Generator**:
  - Calibrated print engine formatting front-and-back pairs to exact commercial acrylic keychain dimensions (**1.14 in x 1.84 in**).
  - **Front**: BulSU IT branding, Room Number, Key Code, Status Badge.
  - **Back**: High-contrast cyan QR code (`#0EA5C9`) pointing to `key-transfer.html?key=KEY_CODE`, scan instructions, and emergency contact details.

---

### 5.6 Mobile Key Transfer & Room Claim Protocol

#### `key-transfer.html` & `js/pages/key-transfer.js`
- **Purpose**: Enables seamless hallway handoffs of physical keys between consecutive instructors without returning to the central office dock.
- **Workflow**:
  1. Incoming instructor scans the physical key fob QR code with their mobile phone.
  2. System checks authentication and role eligibility (`KEY_TRANSFER_ROLES`: Faculty & IT Head).
  3. Displays Current Key Holder vs. Receiving Instructor cards.
  4. Incoming instructor taps **Confirm Key Transfer**.
  5. System executes atomic transaction updating `laboratories.Current_User_ID`, logging occupancy entry, and recording a security audit event (`KEY_TRANSFERRED`).

---

### 5.7 Print & Export Layouts

#### `print-schedule.html` — Individual Room Timetable Print
- Formatted print-ready layout for a single room timetable with official BulSU header and configurable Program Chair / Campus Dean signatories.

#### `print-all-schedules.html` — Bulk Room Timetable Print
- Batch renders all registered laboratory timetables in paginated print-ready format.

---

### 5.8 Authentication & Account Utilities

| Page / Component | Responsibility |
|---|---|
| `login.html` | Email + password authentication with brute-force rate limiting (10 attempts / 15 mins). |
| `reset-password.html` | Token-validated password reset form with strength validation. |
| `#account-settings-modal` | In-app modal for updating profile details, avatar upload, and email modification verification. |
| `#change-password-modal` | In-app modal for updating account password with Bcrypt credential verification. |
| `#help-modal` | Role-tailored user manual and keyboard shortcut guide. |

---

## 6. CSS Architecture & Design System

Organized into modular, token-based stylesheets in `/css/`:
- **Tokens (`variables.css`)**: Primary Teal (`#0d9488`), Primary Cyan (`#1EBBD7`), Slate Dark (`#0F172A`), Status Emerald (`#10B981`), Status Indigo (`#6366F1`), Status Amber (`#F59E0B`), Status Red (`#EF4444`).
- **Typography**: Poppins for headings, Plus Jakarta Sans for UI text and data tables.
- **Accessibility**: Persistent Dark Mode and High Contrast Theme (`html.high-contrast`) stored in `localStorage`.

---

## 7. Frontend JavaScript Architecture

Decoupled modular architecture separating API communication, domain controllers, and UI renderers:
- **API Services (`js/services/`)**: `keys.service.js`, `laboratory.service.js`, `report.service.js`, `schedule.service.js`, `user.service.js`, `faculty.service.js`, `curriculum.service.js`, `settings.service.js`.
- **Scheduling Subsystem (`js/scheduling/`)**: Decomposed engine handling slot mathematics, collision validation, mouse/touch drag interactions, and ghost rendering.
- **Reports Subsystem (`js/reports/`)**: Regex description parser, multi-field search matcher, renderer, and history modal.
- **Key Management (`js/pages/mis-keys.js`, `js/pages/key-transfer.js`)**: Keychain insert generator and mobile handoff coordinator.

---

## 8. Backend Architecture & Data Flow

```
HTTP Request ➔ [Rate Limiter] ➔ [Auth Guard] ➔ [Router] ➔ [Controller] ➔ [Service] ➔ [Repository] ➔ [MariaDB Pool]
```

- **Layered MVC**: Controllers handle input validation and JSON serialization; Services encapsulate all business logic, deduplication, collision detection, and audit dispatch; Repositories execute parameterized SQL queries.

---

## 9. Database Schema & Migrations

Database Name: **`labsync`** | Engine: **InnoDB** | Charset: **`utf8mb4`**

### Active Database Entities (11 Tables)
1. **`users`**: System user accounts (Faculty, IT Head, MIS Staff) with roles, Bcrypt password hashes, avatars, recovery tokens, and `Updated_At` timestamp.
2. **`laboratories`**: Computer lab rooms with building info, `Current_User_ID` foreign key, `Key_Status` (*Present* / *Absent*), and `Last_Seen`.
3. **`laboratory_keys`**: Physical key inventory (`Key_ID`, `Room_ID`, `Key_Code`, `Status`: *ACTIVE* / *MISSING*).
4. **`lab_units`**: Workstation PCs with `PC_QR_String` identifiers and condition status (*Functional* / *Under Maintenance*).
5. **`maintenance_issues`**: Physical hardware/software fault entity with stored generated unique column `Active_Issue_Key = IF(Status != 'Resolved', CONCAT(PC_ID, ':', Issue_Type), NULL)`.
6. **`maintenance`**: Individual student ticket submissions linked via `Maintenance_Issue_ID` to `maintenance_issues`.
7. **`schedules`**: Timetable class blocks mapped to faculty, room, day, time range, academic year, semester, and color theme.
8. **`occupancy_log`**: Audit log recording room entry events (*QR Code*, *Key Taken*, *Key Returned*, *KEY_TRANSFER*). **Data Retention Policy:** Room Status activity logs are retained for one year. Logs older than one year are automatically cleaned up to control database growth and maintain system performance.
9. **`audit_logs`**: Immutable security audit trail tracking high-value administrative and auth events.
10. **`iot_devices`**: Registry of authorized ESP32 hardware docks and device credentials.
11. **`system_settings`** & **`curriculum`**: Key-value signatories and master curriculum subject catalog.

### Incremental Migrations (`database/migrations/`)
- `001_add_user_fields.sql` through `009_expand_subject_name.sql`: Baseline schema enhancements.
- `010_create_iot_devices.sql`: Registered hardware devices table.
- `011_create_audit_logs.sql`: Security audit logging table.
- `012_create_key_management_tables.sql`: Physical keys and found reports tables.
- `013_create_maintenance_issues.sql`: Deduplication entity and backfill linking.
- `014_add_user_updated_at.sql`: User profile update timestamp.
- `015_add_occupancy_log_access_time_index.sql`: Adds index on `occupancy_log(Access_Time)` for fast 1-year retention pruning and timeline ordering.

---

## 10. REST API Specifications

All endpoints are prefixed with `/api/`.

### Authentication (`/api/auth`)
- `POST /api/auth/login`: Authenticates credentials (rate limited: 10 req / 15 min).
- `POST /api/auth/logout`: Destroys active session.
- `GET /api/auth/check`: Returns session authentication state.
- `POST /api/auth/recover-password`: Dispatches password reset email (rate limited: 5 req / 15 min).
- `GET /api/auth/validate-reset-token`: Validates token parameter (rate limited: 20 req / 15 min).
- `POST /api/auth/reset-password`: Resets user password (rate limited: 10 req / 15 min).

### Physical Key Management & Transfer (`/api/keys`)
- `GET /api/keys/transfer-info/:keyCode`: Look up key, room, and current holder for confirmation.
- `POST /api/keys/transfer`: Execute physical key handoff (Faculty & IT Head only).
- `GET /api/keys`: List all registered keys and summary statistics (MIS Staff only).
- `POST /api/keys`: Register a new physical key for a laboratory room (MIS Staff only).
- `GET /api/keys/:keyId/tag`: Generate QR code tag data and printable keychain insert (MIS Staff only).
- `PUT /api/keys/:keyId/missing`: Mark physical key status as `MISSING` (MIS Staff only).
- `PUT /api/keys/:keyId/active`: Recover physical key status to `ACTIVE` (MIS Staff only).

### Workstation Fault Reporting & Maintenance (`/api/reports`)
- `POST /api/reports/submit`: Public student fault report submission with transaction locking and deduplication.
- `GET /api/reports`: Aggregated active and historical issues with reporter counts.
- `PUT /api/reports/:reportId/status`: Updates issue status (*Pending* → *Resolved*) with automatic PC health restoration.
- `DELETE /api/reports/:reportId`: Removes a resolved maintenance ticket.

### User Account & Profile (`/api/user`)
- `GET /api/user/current`: Current authenticated user profile.
- `PUT /api/user/update`: Updates user profile name, phone, or photo.
- `POST /api/user/change-password`: Updates password with current credential verification and Bcrypt hashing.
- `GET /api/user/verify-email`: Verifies token for email address modifications.

---

## 11. Security, Cryptography & Rate Limiting

- **Bcrypt Password Storage**: All passwords encrypted using `bcrypt` with **12 salt rounds** (`BCRYPT_SALT_ROUNDS = 12`).
- **Session Security**: Cookie sessions with `httpOnly: true`, `sameSite: 'lax'`, and 24-hour cookie longevity.
- **Client Anti-Flash Guard (`auth-check.js`)**: Runs synchronously in `<head>` hiding `<html>` until session validity and role permissions are confirmed.
- **Multi-Tier Rate Limiting (`middleware/rateLimiter.js`)**: Protects against brute-force login attacks, password recovery flood, and public ticket spamming.
- **SQL Injection Defense**: 100% of SQL queries executed via parameterized prepared statements (`?` placeholders).

---

## 12. Security Audit Logging System

Powered by [`services/auditService.js`](file:///c:/Users/andre/Downloads/LabSync/services/auditService.js) and the `audit_logs` table:
- **Monitored Events**: `LOGIN`, `LOGIN_FAILED`, `PASSWORD_CHANGE`, `KEY_CREATED`, `KEY_MARKED_MISSING`, `KEY_REACTIVATED`, `KEY_TRANSFERRED`, `FACULTY_ROLE_UPDATE`, `TICKET_RESOLVED`.
- **Sensitive Data Masking**: Automatically strips all passwords, reset tokens, email verification tokens, and session secrets before persisting to the database.

---

## 13. IoT Hardware Integration

- **Key Identification**: Resistor-divider sensing on pins `D32` (Room 203, 10kΩ) and `D33` (Room 204, 0Ω).
- **Wrong-Slot Alarm**: Hardware buzzer sounds an 80ms pulsing alert if Key 204 is placed in Slot 203.
- **GM65 Optical Reader**: Scans faculty ID QR tokens (`LABSYNC-USER-...`) via UART at 9600 baud.
- **5-Second Telemetry Heartbeat**: Dispatched to `/api/occupancy/heartbeat`. Dashboard displays an **Offline** badge if no ping is received for >15 seconds.

---

## 14. Transactional Email System

Powered by **Nodemailer** with modular HTML email templates (`services/email/templates/`):
- **Welcome Email (`welcome.js`)**: Dispatched on new staff onboarding with login instructions.
- **Password Reset (`reset-password.js`)**: Dispatched with secure tokenized link.
- **Email Verification (`verification.js`)**: Dispatched when changing account email.

---

## 15. Environment Configuration

Create a `.env` file in the project root:

```env
# Database Configuration
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_database_password
DB_NAME=labsync
DB_PORT=3306

# Server Configuration
PORT=3000
APP_URL=http://localhost:3000
SESSION_SECRET=your_secure_session_secret

# Transactional Email (SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_app_password
```

---

## 16. Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Initialize Database**:
   ```bash
   mysql -u root -p labsync < labsync.sql
   ```
3. **Run Application**:
   ```bash
   # Production
   npm start

   # Development
   npm run dev
   ```
4. **Access Web Application**:
   Open browser at `http://localhost:3000/login.html`.

---
*Documentation maintained for Bulacan State University – Sarmiento Campus.*
