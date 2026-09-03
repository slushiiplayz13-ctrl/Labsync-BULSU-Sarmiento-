# LabSync — Smart Laboratory & Schedule Management System

> **An IoT-Based IT Laboratory Availability and Equipment Monitoring System Using QR Codes**  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Environment:** Node.js, Express, MySQL / MariaDB  
> **Current Version:** 1.0.0 (Baseline Release)

---

## 📋 Table of Contents

1. [Project Overview](#-project-overview)
2. [Problem Statement & Solution](#-problem-statement--solution)
3. [Key Features](#-key-features)
4. [User Roles & Access Levels](#-user-roles--access-levels)
5. [System Architecture](#-system-architecture)
   - [Frontend Architecture](#frontend-architecture)
   - [Backend Architecture](#backend-architecture)
   - [Database Architecture](#database-architecture)
6. [IoT Hardware & Real-Time Key Monitoring](#-iot-hardware--real-time-key-monitoring)
7. [QR Code Workflows](#-qr-code-workflows)
8. [Responsive & Accessible Design](#-responsive--accessible-design)
9. [Security & Authentication](#-security--authentication)
10. [Repository Directory Structure](#-repository-directory-structure)
11. [Local Development & Execution](#-local-development--execution)
12. [Testing & Quality Assurance](#-testing--quality-assurance)
13. [Deployment Considerations](#-deployment-considerations)
14. [Current Project Status](#-current-project-status)

---

## 🌟 Project Overview

**LabSync** is a full-stack, IoT-integrated web platform developed for the IT laboratory facilities of **Bulacan State University – Sarmiento Campus**. It unifies real-time laboratory room availability, drag-and-drop course schedule management, PC hardware issue tracking via QR codes, faculty access administration, and hardware-level key dock monitoring into a single synchronized system.

---

## 🎯 Problem Statement & Solution

| Traditional Laboratory Challenge | LabSync Digital Solution |
| :--- | :--- |
| **Physical Key Uncertainty**: Administrators cannot verify if a room key is in the dock or who currently holds it. | **IoT Key Sensor Dock**: ESP32 microcontroller with reed/switch sensors detects physical key presence in real time. |
| **Unknown Room Occupancy**: Students and faculty walk to distant labs only to discover they are occupied or locked. | **Live Room Status Engine**: Computes real-time room states (*Available*, *In Session*, *Borrowed*) combining schedule data and key status. |
| **Manual Paper PC Fault Reporting**: Broken peripherals and computer issues go unreported or lost in logbooks. | **Workstation QR Tickets**: Students scan a unique QR code on the PC to instantly submit structured hardware/software repair tickets. |
| **Scheduling Clashes**: Overlapping time slots, room double-bookings, and faculty scheduling conflicts during enrollment. | **Schedule Studio**: Drag-and-drop timetable builder with automatic client-side and server-side collision validation. |
| **Maintenance Pipeline Blind Spots**: Technicians lack visibility into pending vs. completed lab repairs. | **Maintenance Tracker**: Kanban-style status workflow (*Pending* → *In Progress* → *Resolved*) with history and filters. |

---

## 🚀 Key Features

- **Real-Time Lab Room Status**: Dynamic availability calculation displayed across color-coded room cards with live 3-second activity polling.
- **Physical Key Inventory Management (`mis-keys.html`)**: MIS custodian catalog for physical room keys (`KEY-IT-203-A`), status tracking (`ACTIVE` / `MISSING`), and keychain insert generator.
- **Calibrated Keychain Insert Studio**: Generates calibrated 1.14" x 1.84" two-sided acrylic insert prints containing room branding and high-contrast transfer QR code.
- **Mobile Key Transfer & Room Claim (`key-transfer.html`)**: Mobile peer-to-peer key handoff protocol allowing faculty to scan a key fob QR code and immediately assume classroom custody.
- **Workstation Fault Deduplication Pipeline**: Relational deduplication via `maintenance_issues` table with stored hash `Active_Issue_Key`, grouping multi-reporter submissions (`👤 Name [+N]`).
- **Interactive Schedule Studio (`room-schedule-editor.html`)**: Drag-and-drop schedule builder with custom subject blocks, color themes, resize handles, and touch polyfills.
- **Conflict & Clash Prevention**: Real-time same-room overlap detection and cross-room professor ghost schedule overlays.
- **QR PC Fault Reporting (`submit-pc-report.html`)**: Mobile-optimized, public fault submission form with hardware/software category checkboxes.
- **PC & QR Code Generator (`mis-qr-generator.html`)**: Automated batch generation and printing of unique workstation QR label cards.
- **Maintenance Task Management (`mis-maintenance.html`)**: Comprehensive ticket queue with priority badges, status updates, and resolved history archive.
- **Faculty Directory Management (`faculty-management.html`)**: Staff CRUD, role assignment, leadership transfer dialogs, and automated onboarding welcome emails.
- **Academic Year & Semester Filters**: Term-based schedule filtering across personal faculty timetables and master views.
- **Signatory PDF / Print Layouts**: Single room (`print-schedule.html`) and bulk (`print-all-schedules.html`) print templates with configurable Dean and Chair signatories.
- **Security Audit Logging & Rate Limiting**: Centralized non-blocking audit trail (`audit_logs`) and multi-tier RFC-compliant brute-force protection.
- **Interactive System Tutorial (`js/tutorial.js`)**: Guided spotlight onboarding tour for faculty and administrators.
- **Accessibility & Theme System**: Dark mode and High Contrast accessibility themes persisted in `localStorage`.

---

## 👥 User Roles & Access Levels

LabSync implements strict role-based access control across **3 authenticated roles** and **1 public student interaction path**:

| Role | Primary Entry Page | Access Scope & Responsibilities |
| :--- | :--- | :--- |
| **IT Department Head** | `it-head-dashboard.html` | **Full Administrative Access**: Manage master schedules, drag-and-drop Schedule Studio, faculty CRUD, role modifications, room configurations, curriculum master list, and signatory settings. |
| **MIS Staff** | `mis-staff-dashboard.html` | **Technical & Maintenance Access**: Maintenance tracker (`mis-maintenance.html`), ticket status transitions (*Pending* → *In Progress* → *Resolved*), workstation QR generation (`mis-qr-generator.html`), and master schedule viewing. |
| **Faculty / Professor** | `index.html` | **Instructional Access**: Faculty dashboard, real-time room availability (`room-status.html`), personal weekly timetable (`my-schedule.html`), lab PC fault viewer (`faculty-pc-reports.html`), and account profile settings. |
| **Student / Public** *(No Login)* | `submit-pc-report.html` | **Workstation QR Access**: Students interact with the system strictly by scanning physical QR code labels affixed to lab computers to submit fault reports. No student account or dashboard exists. |

---

## 🏛️ System Architecture

LabSync follows a decoupled multi-tier architecture separating presentation, business logic, data persistence, and IoT hardware integration.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER                            │
│  Vanilla HTML5 Pages + Modular CSS (Design Tokens / Themes / Media)    │
│  Page Controllers (js/pages/) + Reusable Components (js/components/)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │  HTTP / REST / Session Cookies
┌──────────────────────────────────▼─────────────────────────────────────┐
│                          APPLICATION LAYER                             │
│  Express.js Server (server.js) + Centralized Router (routes/index.js)  │
│  Domain Controllers (controllers/) + Business Logic (services/)        │
│  Auth Middleware (middleware/auth.js) + Error Handler                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │  mysql2 / Connection Pool
┌──────────────────────────────────▼─────────────────────────────────────┐
│                          PERSISTENCE LAYER                             │
│  Repositories (repositories/) + Database Schema & Migrations           │
│  MySQL / MariaDB Relational Database (`labsync`)                       │
└──────────────────────────────────▲─────────────────────────────────────┘
                                   │  POST /api/occupancy/log
┌──────────────────────────────────┴─────────────────────────────────────┐
│                             IoT LAYER                                  │
│  ESP32 Microcontroller + 6.35mm Key Jack Sensors + GM65 QR Scanner    │
│  LiquidCrystal I2C LCD (16x2) + Buzzer Feedback                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Frontend Architecture
- **Structure**: Vanilla HTML5 templates with clean semantic layouts and zero heavy framework overhead.
- **Styling**: Pure CSS3 modular design system (`css/variables.css`, `css/reset.css`, `css/layouts.css`, `css/components/*.css`, `css/responsive.css`).
- **Client Services (`js/services/`)**: Centralized API abstraction modules (`laboratory.service.js`, `schedule.service.js`, `report.service.js`, `user.service.js`, `faculty.service.js`, `curriculum.service.js`, `settings.service.js`, `notification.service.js`).
- **Page Controllers (`js/pages/`)**: Isolated domain controllers managing UI state and data binding.
- **Scheduling Subsystem (`js/scheduling/`)**: Decomposed engine handling slot mathematics, collision validation, mouse/touch drag interactions, and ghost rendering.
- **Reports Subsystem (`js/reports/`)**: Dedicated parser, filter, renderer, modal, and action dispatchers for maintenance tickets.

### Backend Architecture
- **Framework**: Node.js with Express v5.
- **Routing (`routes/`)**: Centralized router (`routes/index.js`) mounting domain routers (`auth.routes.js`, `users.routes.js`, `faculty.routes.js`, `labs.routes.js`, `pcs.routes.js`, `schedules.routes.js`, `maintenance.routes.js`, `settings.routes.js`, `curriculum.routes.js`, `iot.routes.js`) and legacy route compatibility bridges.
- **Controllers (`controllers/`)**: Request validation, HTTP status handling, and response serialization.
- **Services (`services/`)**: Domain business logic, email generation (`services/email/`), and IoT state processing (`services/iot/`).
- **Repositories (`repositories/`)**: Parameterized SQL queries using direct MySQL connection pools.

### Database Architecture
The relational database utilizes MySQL / MariaDB (InnoDB engine, `utf8mb4` charset) with foreign key cascading and automated migration execution on startup:

```
┌──────────────┐       ┌───────────────┐       ┌────────────────┐
│    users     ├───┬───┤   schedules   ├───┬───┤  laboratories  │
└──────┬───────┘   │   └───────────────┘   │   └───┬────────┬───┘
       │           │                       │       │        │
       │           │   ┌───────────────┐   │   ┌───▼────┐ ┌─▼──────────────┐
       ├───────────┼───┤ occupancy_log ├───┴───┤lab_units│ │laboratory_keys│
       │           │   └───────────────┘       └───┬────┘ └──────────────┘
       │           │                               │
       │           │                       ┌───────▼──────────┐
       │           │                       │maintenance_issues│
       │           │                       └───────┬──────────┘
       │           │                               │
       │           │                       ┌───────▼──────────┐
       │           │                       │   maintenance    │
       │           │                       └──────────────────┘
       │           │
┌──────▼───────┐   │   ┌───────────────┐       ┌────────────────┐
│  audit_logs  │   └───┤  iot_devices  │       │system_settings │
└──────────────┘       └───────────────┘       └────────────────┘
```

Additional relational tables:
- **`laboratory_keys`**: Physical key catalog, unique key codes (`KEY-IT-203-A`), status (`ACTIVE`, `MISSING`).
- **`maintenance_issues`**: Component-level fault deduplication entity with stored generated hash `Active_Issue_Key`.
- **`audit_logs`**: Immutable security audit trail tracking logins, password changes, key transfers, and admin actions.
- **`iot_devices`**: Authorized ESP32 hardware docks and device credentials.
- **`system_settings`**: Key-value pairs for institution signatories (*Program Chair*, *Campus Dean*).
- **`curriculum`**: Master subject catalog for the Schedule Studio.

---

## 📡 IoT Hardware & Real-Time Key Monitoring

The LabSync IoT module links physical laboratory key management with real-time web dashboard state:

### Hardware Specifications
- **Microcontroller**: ESP32 Dev Module (30-pin).
- **Key Detection**: 6.35mm switch jack sockets / magnetic contact sensors configured with `INPUT_PULLUP` on pins `GPIO 32` (Room 203) and `GPIO 33` (Room 204).
- **QR Scanner**: GM65 1D/2D Barcode Scanner via UART (`GPIO 17` RX2 / `GPIO 16` TX2 at 9600 baud).
- **Display**: 16x2 I2C LiquidCrystal Display (`GPIO 21` SDA / `GPIO 22` SCL).
- **Audio Feedback**: Active low-level trigger piezoelectric buzzer (`GPIO 25`).

### Operational Workflow
1. **Key Status Event**: When a faculty member removes or returns a key, the pin state transition triggers a debounced HTTP `POST /api/occupancy/log` payload containing `{ keyEvent: "Key Taken" | "Key Returned", roomNumber }`.
2. **QR Badge Event**: Scanning a faculty ID QR code sends `{ qrString, roomNumber, authMethod: "QR Code" }` to verify authorization.
3. **Availability Inference**:
   - `Key_Status = 'Present'` → **Available** (Green).
   - `Key_Status = 'Absent'` + active scheduled slot + matching faculty → **In Session** (Red).
   - `Key_Status = 'Absent'` + unscheduled or non-matching faculty → **Borrowed** (Orange).
4. **Hardware Limitations**: Room occupancy is inferred from the physical key dock state. It does not measure human presence or count room occupants directly.

---

## 🏷️ QR Code Workflows

### 1. Workstation PC Fault Reporting
```
Physical PC in Lab
  └── Scanned by Student Mobile Device
        └── Opens: submit-pc-report.html?pc=LABSYNC-PC-XXXXX
              └── Submits Category & Remarks
                    └── Stored in `maintenance` table (Status: "Pending")
                          └── Appears on MIS Maintenance Tracker & Faculty Reports
```

### 2. Batch PC Label Generation (`mis-qr-generator.html`)
- MIS staff selects a laboratory room and sets the PC unit count.
- Server generates unique cryptographic tokens (`LABSYNC-PC-XXXXX-XXXXXXXX`).
- Generates high-resolution QR PNG labels formatted with room codes and PC numbers, ready for single download or bulk printing.

---

## 📱 Responsive & Accessible Design

- **Mobile Viewport Optimization (320px–767px)**: Dedicated mobile navigation drawer, bottom navigation bars, 100dvh modal sheet panels, and stable single-brand mobile headers.
- **Faculty Management Mobile Grid**: Adaptive 2-column card layout and inline search/action toolbar.
- **Accessibility & Contrast Modes**:
  - **High Contrast Theme**: Pure dark background with high-contrast borders and elevated legibility tokens.
  - State persisted in browser `localStorage` and applied synchronously in `<head>` to prevent page-load flash.
- **Touch-Optimized Scheduling**: Custom touch polyfill (`js/scheduling/interactions/touch-drag.js`) enabling drag-and-drop schedule editing on touchscreen devices.

---

## 🔒 Security & Authentication

- **Session Authentication**: Server-side cookie sessions managed via `express-session` with 24-hour expiration (`SESSION_MAX_AGE`).
- **Route Authorization Middleware (`middleware/auth.js`)**:
  - `requireAuth`: Ensures user possesses an active authenticated session.
  - `requireRole(roles)`: Restricts endpoints to authorized roles (e.g., IT Head administrative routes).
- **Client-Side Anti-Flash Auth Guard (`js/auth-check.js`)**: Hides `<body>` content before document evaluation until `/api/session` confirms authorization, redirecting unauthorized users.
- **Password Recovery Security**: Cryptographically random 32-byte hexadecimal tokens (`crypto.randomBytes(32)`) with expiration timestamps stored in the database.
- **SQL Injection Prevention**: All database queries in `repositories/` use parameterized prepared statements (`pool.execute(sql, params)`).

---

## 📁 Repository Directory Structure

```
LabSync/
├── server.js                       # Express application bootstrap entry point
├── package.json                    # Project dependencies and npm scripts
├── labsync.sql                     # Baseline MySQL schema initialization dump
├── LabSync_ESP32.ino               # ESP32 Arduino firmware sketch
│
├── config/                         # Application and environment configuration
│   └── app.config.js               # Port, CORS, and session settings
│
├── controllers/                    # Domain HTTP request controllers
│   ├── auth.controller.js
│   ├── curriculum.controller.js
│   ├── faculty.controller.js
│   ├── iot.controller.js
│   ├── labs.controller.js
│   ├── maintenance.controller.js
│   ├── schedules.controller.js
│   ├── settings.controller.js
│   └── users.controller.js
│
├── database/                       # Database connection and migration engine
│   ├── connection.js               # mysql2/promise connection pool
│   ├── migrate.js                  # Automated SQL migration runner
│   └── migrations/                 # SQL migration scripts
│
├── middleware/                     # Express middlewares
│   ├── auth.js                     # Authentication & role authorization guards
│   └── errorHandler.js             # Centralized JSON error handler
│
├── repositories/                   # Data access layer (parameterized SQL)
│   ├── curriculum.repository.js
│   ├── faculty.repository.js
│   ├── iot.repository.js
│   ├── laboratory.repository.js
│   ├── maintenance.repository.js
│   ├── schedule.repository.js
│   ├── settings.repository.js
│   └── user.repository.js
│
├── routes/                         # Centralized and domain API routes
│   ├── index.js                    # Router aggregator & legacy compatibility layer
│   ├── auth.routes.js
│   ├── curriculum.routes.js
│   ├── faculty.routes.js
│   ├── iot.routes.js
│   ├── labs.routes.js
│   ├── maintenance.routes.js
│   ├── pcs.routes.js
│   ├── schedules.routes.js
│   ├── settings.routes.js
│   └── users.routes.js
│
├── services/                       # Business logic services
│   ├── authService.js
│   ├── curriculumService.js
│   ├── dbInit.js
│   ├── emailService.js
│   ├── facultyService.js
│   ├── iotService.js
│   ├── laboratoryService.js
│   ├── maintenanceService.js
│   ├── scheduleService.js
│   ├── settingsService.js
│   ├── usersService.js
│   ├── email/                      # Modular transactional email templates
│   └── iot/                        # IoT claim, heartbeat, and occupancy services
│
├── css/                            # Modular CSS design system
│   ├── variables.css               # Design tokens, color palettes, and themes
│   ├── reset.css                   # Box-sizing, margin/padding resets
│   ├── layouts.css                 # Layout wrappers, headers, sidebars
│   ├── responsive.css              # Responsive viewport breakpoints
│   ├── auth.css                    # Login and recovery page styling
│   ├── tutorial.css                # Spotlight tutorial overlay styles
│   ├── schedule-studio.css         # Timetable grid & wallpaper studio styles
│   └── components/                 # Component-specific stylesheets
│
├── js/                             # Modular frontend JavaScript
│   ├── auth-check.js               # Client-side session and role guard
│   ├── core/                       # App lifecycle, clock, accessibility
│   ├── components/                 # Reusable UI modals, dropdowns, toasts
│   ├── services/                   # Client-side API request services
│   ├── pages/                      # Page-specific coordinators
│   ├── scheduling/                 # Timetable editor, collision math, drag/drop
│   ├── reports/                    # Ticket parser, filters, renderers, actions
│   ├── faculty/                    # Faculty management modals
│   ├── faculty-schedule/           # Faculty personal schedule renderer
│   ├── master-schedule/            # Master schedule rooms and curriculum modals
│   └── utils/                      # DOM, time, and string utility helpers
│
├── assets/                         # Static images, university logos, icons
└── docs/                           # Project documentation
    ├── SYSTEM_DOCUMENTATION.md     # Full technical manual
    ├── hardware/                   # IoT wiring diagrams and sketch guide
    └── releases/                   # Version release summaries
```



## 🧪 Testing & Quality Assurance

### Verification Workflows
- **JavaScript Syntax Validation**: Checked using Node.js syntax compilation (`node -c <file>`).
- **HTTP Endpoint Verification**: Validated status codes across all 19 HTML routes, API domain routers, and static stylesheets.
- **Cross-Browser & Responsive QA**: Verified across mobile viewports (320px, 360px, 375px, 390px, 412px, 430px, 767px), tablet viewports (768px, 1024px), and desktop viewports (1280px–1920px).
- **Manual Role Scenarios**: Verified authentication guards, role redirects, schedule collision prevention, QR generation, and ticket status progression.

---

## 🚀 Deployment Considerations

- **Reverse Proxy**: When running behind Nginx, Cloudflare, or reverse proxy tunnels (e.g., Ngrok), ensure `trust proxy` is enabled (configured in `server.js`) so secure session cookies and client IPs are resolved properly.
- **SMTP Credentials**: Configure an authenticated institutional SMTP provider with valid credentials for transactional email delivery.
- **IoT Network Address**: Set the `serverUrl` in `LabSync_ESP32.ino` to the static IP or domain name of the hosted LabSync backend accessible by the ESP32 Wi-Fi network.

---

## 📌 Current Project Status

- **Status**: V1.0.0 Stable Baseline
- **Architecture**: Modular Services, Repositories, Domain Controllers, and Responsive CSS Design System.
- **Maintainer**: Bulacan State University — Sarmiento Campus IT Department

---

*For detailed system manuals, refer to [docs/SYSTEM_DOCUMENTATION.md](docs/SYSTEM_DOCUMENTATION.md).*  
*For IoT hardware pinouts and Arduino sketch details, refer to [docs/hardware/IOT_HANDOVER_SUMMARY.md](docs/hardware/IOT_HANDOVER_SUMMARY.md).*
