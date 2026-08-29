# LabSync — Full System Documentation

> **Version:** 1.0.0 (Baseline Architecture)  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Environment:** Node.js + Express v5 + MySQL / MariaDB  
> **Last Updated:** August 2026

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
   - [5.5 Print & Export Layouts](#55-print--export-layouts)
   - [5.6 Authentication & Account Utilities](#56-authentication--account-utilities)
6. [CSS Architecture & Design System](#6-css-architecture--design-system)
7. [Frontend JavaScript Architecture](#7-frontend-javascript-architecture)
8. [Backend Architecture & Data Flow](#8-backend-architecture--data-flow)
9. [Database Schema & Migrations](#9-database-schema--migrations)
10. [REST API Specifications](#10-rest-api-specifications)
11. [IoT Hardware Integration](#11-iot-hardware-integration)
12. [Transactional Email System](#12-transactional-email-system)
13. [Environment Configuration](#13-environment-configuration)
14. [Installation & Setup](#14-installation--setup)

---

## 1. Project Overview

**LabSync** is a web-based IT Laboratory Availability and Equipment Monitoring System developed for **Bulacan State University – Sarmiento Campus**. It centralizes physical laboratory room status tracking, drag-and-drop timetable management, workstation hardware fault reporting via QR codes, faculty access administration, and hardware-level IoT key dock monitoring into a single unified platform.

### Core Problems Solved

| Problem | LabSync Solution |
|---|---|
| **Manual paper-based PC fault reports** | Students scan a physical QR code label on the workstation to submit structured digital repair tickets (`submit-pc-report.html`). |
| **Unknown room availability at a glance** | Real-time room status engine computes room states (*Available* / *In Session* / *Borrowed*) using schedule slots and IoT key dock state. |
| **Scheduling clashes & double-booking** | Drag-and-drop Schedule Studio (`room-schedule-editor.html`) with real-time overlap and cross-room professor conflict validation. |
| **Maintenance pipeline blind spots** | Dedicated maintenance queue (`mis-maintenance.html`) tracking tickets through *Pending* → *In Progress* → *Resolved*. |
| **Physical key management uncertainty** | ESP32 IoT device with switch sensors monitors room key presence and logs status changes to the backend in real time. |

---

## 2. Technology Stack

### Backend
| Technology | Version / Specification | Purpose |
|---|---|---|
| **Node.js** | v18.0.0+ | Server runtime environment |
| **Express** | ^5.2.1 | Web application framework and REST API routing |
| **MySQL2** | ^3.22.3 | MySQL / MariaDB driver supporting async/await connection pooling |
| **express-session** | ^1.19.0 | Server-side cookie session management |
| **Nodemailer** | ^8.0.7 | Transactional email delivery (Welcome, Password Reset, Email Verification) |
| **QRCode** | ^1.5.4 | Server-side cryptographic QR code data URL generation |
| **dotenv** | ^17.4.2 | Environment variable configuration loader |
| **cors** | ^2.8.6 | Configurable Cross-Origin Resource Sharing middleware |
| **crypto** | Built-in | Cryptographic token generation for password resets |

### Frontend
| Technology | Specification | Purpose |
|---|---|---|
| **Vanilla HTML5** | Semantic standard | Page layouts and templates across 19 dedicated HTML files |
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
| **GM65 Barcode Scanner** | UART (9600 baud) | QR code badge scanner for faculty authentication |
| **6.35mm Switch Jack Sockets** | `INPUT_PULLUP` sensors | Physical laboratory key dock detection (Rooms 203, 204) |
| **16x2 I2C LCD** | Address `0x27` (SDA 21 / SCL 22) | Real-time visual user feedback and scan status |
| **Piezoelectric Buzzer** | Active Low (GPIO 25) | Audio feedback for successful scans and key events |
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
│   ├── labs.controller.js          # Room CRUD, PC units, batch QR generation
│   ├── maintenance.controller.js   # Maintenance tickets, status transitions, notifications
│   ├── schedules.controller.js     # Timetable CRUD, conflict validation, summaries
│   ├── settings.controller.js      # Signatories and health check
│   └── users.controller.js         # User profile, avatars, QR access, tutorials
│
├── database/                       # Database persistence & migrations
│   ├── connection.js               # mysql2 connection pool
│   ├── migrate.js                  # Automated SQL migration runner
│   └── migrations/                 # Incremental SQL migration scripts (001–009)
│
├── middleware/                     # Express request pipeline middlewares
│   ├── auth.js                     # Authentication (requireAuth) & role guards (requireRole)
│   └── errorHandler.js             # Centralized JSON error serialization
│
├── repositories/                   # Parameterized SQL data access layer
│   ├── curriculum.repository.js
│   ├── faculty.repository.js
│   ├── iot.repository.js
│   ├── laboratory.repository.js
│   ├── maintenance.repository.js
│   ├── schedule.repository.js
│   ├── settings.repository.js
│   └── user.repository.js
│
├── routes/                         # Centralized & domain REST route definitions
│   ├── index.js                    # Router aggregator & legacy compatibility bridges
│   ├── auth.routes.js              # /api/auth/*
│   ├── users.routes.js             # /api/user/*
│   ├── faculty.routes.js           # /api/faculty/*
│   ├── labs.routes.js              # /api/laboratories/*
│   ├── pcs.routes.js               # /api/pcs/*
│   ├── schedules.routes.js         # /api/schedules/*
│   ├── maintenance.routes.js       # /api/reports/*
│   ├── settings.routes.js          # /api/settings/*
│   ├── curriculum.routes.js        # /api/curriculum/*
│   └── iot.routes.js               # /api/occupancy/*
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
│   ├── email/                      # Transactional email templates (welcome, reset, verify)
│   └── iot/                        # IoT claim, heartbeat, and occupancy handlers
│
├── css/                            # Modular CSS design system
│   ├── variables.css               # Design tokens, color palettes, and themes
│   ├── reset.css                   # Box-sizing, margin/padding resets
│   ├── layouts.css                 # Layout wrappers, headers, sidebars
│   ├── responsive.css              # Responsive viewport breakpoints & bottom nav
│   ├── auth.css                    # Login and recovery page styling
│   ├── tutorial.css                # Spotlight tutorial overlay styles
│   ├── schedule-studio.css         # Timetable grid & wallpaper studio styles
│   └── components/                 # Component-specific stylesheets
│
├── js/                             # Modular frontend JavaScript
│   ├── auth-check.js               # Client-side session and role guard
│   ├── core/                       # App lifecycle, clock, accessibility, tutorials
│   ├── components/                 # Reusable UI modals, dropdowns, toasts, cards
│   │   └── profile/                # Account, help, password, and signature modals
│   ├── services/                   # Client-side API request abstraction services
│   ├── pages/                      # Page-specific coordinators
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
| **IT Department Head** | `it-head-dashboard.html` | Full administrative access: master schedule viewing/editing, Schedule Studio, faculty CRUD, role modifications, room configurations, curriculum catalog, and signatory settings. |
| **MIS Staff** | `mis-staff-dashboard.html` | Technical and hardware maintenance access: maintenance ticket tracker, ticket status progression (*Pending* → *In Progress* → *Resolved*), workstation QR generation, and master schedule viewing. |
| **Faculty / Professor** | `index.html` | Instructional access: real-time room availability, personal weekly teaching timetable, laboratory PC fault reports viewer, and account settings. |
| **Student / Public** *(No Login)* | `submit-pc-report.html` | Public workstation access: students scan physical QR codes affixed to lab PCs to submit hardware/software fault reports. No student account or dashboard exists. |

### Authentication & Session Lifecycle
1. **Credentials Submission**: The user submits email and password on `login.html`.
2. **Authentication Handler**: Handled by `POST /api/auth/login` (or legacy `POST /api/login`), verifying credentials against the `users` table.
3. **Session Cookie**: On success, `req.session.user` is populated with `User_ID`, `Name`, `Email`, and `Role`, returning HTTP 200 with session cookies.
4. **Client-Side Guard (`js/auth-check.js`)**: Runs synchronously in the `<head>` of all protected pages:
   - Queries `GET /api/user/current` (or `/api/session`).
   - Verifies the active user role against the required page role.
   - Redirects to `login.html` if unauthenticated or unauthorized.
   - Suppresses page flash (`display: none !important`) until authentication is confirmed.
5. **Server-Side Guard (`middleware/auth.js`)**: All mutating API routes enforce `requireAuth` and `requireRole(ADMIN_ROLES)`.

---

## 5. Pages & Features

### 5.1 Public / Student Workstation Interaction

#### `submit-pc-report.html` — PC Fault Reporting Form
- **Access**: Public (no login required).
- **Trigger**: Scanned by student mobile devices from QR labels affixed to lab computers.
- **Query Parameter**: Accepts `?pc=PC_QR_String` (or `?pc=PC_ID`) to automatically pre-select the workstation.
- **Form Fields**:
  - Hardware/Software categories: Mouse, Keyboard, Monitor, System Unit, Internet Connection, OS/Software, Others.
  - Student Name, Student Program & Section.
  - Free-text Issue Remarks.
- **Submission**: Issues `POST /api/reports/submit` (or `/api/maintenance/report`).
- **Accessibility**: Automatically respects high contrast theme preferences.

---

### 5.2 Faculty / Professor Features

#### `index.html` — Faculty Dashboard
- Summary stat cards: Active Lab Rooms, Pending PC Reports, Classes Today.
- Role-specific Quick Start Guide.
- Live room status card grid with 3-second real-time polling.

#### `room-status.html` — Laboratory Room Status
- Visual cards for all laboratory rooms displaying dynamically calculated availability:
  - **Available** (Green) — Key present in dock.
  - **In Session** (Red) — Key absent; holder is the scheduled faculty for an active class slot.
  - **Borrowed** (Orange) — Key absent; holder is another faculty or taken during an unscheduled slot.
- Real-time occupancy activity log showing recent key removals, returns, and QR scans.

#### `my-schedule.html` — Personal Faculty Schedule
- Interactive weekly timetable grid (Monday–Saturday).
- Filterable by **Academic Year** and **Semester**.
- Displays only classes assigned to the logged-in faculty member.
- Includes Wallpaper / Schedule Studio export preview via `html2canvas`.

#### `faculty-pc-reports.html` — PC Fault Reports Viewer
- Faculty view of student-reported hardware issues for lab rooms.
- Real-time query search and date filtering.

---

### 5.3 IT Department Head Features

#### `it-head-dashboard.html` — Administrative Dashboard
- Real-time digital clock, department statistics, and management quick-action tiles.

#### `master-schedule.html` — Master Timetable Grid
- View and switch schedules across all laboratory rooms.
- Filter by Academic Year, Semester, and Laboratory Room.
- **Add Room Modal (`js/master-schedule/rooms/room.modal.js`)**: Create, update, or remove laboratory rooms.
- **Curriculum Import Modal (`js/master-schedule/curriculum/curriculum-import.modal.js`)**: Upload and parse Excel/CSV subject catalogs.
- **Download Schedule Modal (`js/master-schedule/modals/download-schedule.modal.js`)**: Bulk schedule PDF printing trigger.
- **Signature Settings Modal (`js/master-schedule/modals/signature-settings.modal.js`)**: Configures Program Chair and Campus Dean signatories stored in `system_settings`.

#### `room-schedule-editor.html` — Schedule Studio (Drag & Drop)
- **Course Block Creation**: Define Subject, Faculty, Section, and Block Color Theme.
- **Drag-and-Drop Scheduling**: Drag blocks from tray onto weekly timetable slots.
- **Collision Validation**: Client-side and server-side overlap prevention (`schedule.validator.js`).
- **Cross-Room Conflict Check**: Queries `GET /api/schedules/check-professor-conflict` to prevent double-booking faculty across rooms.
- **Ghost Schedule Overlays**: Visualizes transparent placeholder blocks for professor commitments in other labs.
- **Mobile Touch Polyfill**: Custom touch drag-and-drop engine (`touch-drag.js`).
- **Dirty State Guard**: Tracks unsaved changes and prompts confirmation before navigation.

#### `faculty-management.html` — Faculty & Staff Administration
- Full CRUD interface for Faculty and MIS Staff accounts.
- **Add Faculty**: Automatically generates secure random credentials and sends a branded welcome email via Nodemailer.
- **Role Modification & Leadership Transfer**: Change staff roles or transfer IT Head administrative leadership with confirmation dialogs.
- **Profile Photos**: Upload Base64-encoded profile photos with initials fallback.

#### Parallel IT Head Views
- `it-head-room-status.html`: Administrative room availability and activity feed.
- `it-head-my-schedule.html`: IT Head personal teaching timetable.
- `it-head-pc-reports.html`: Administrative PC fault reports viewer with resolution actions.

---

### 5.4 MIS Staff Features

#### `mis-staff-dashboard.html` — Technical Dashboard
- Visual stat indicators: Open Tickets, In Progress Repairs, Resolved Tickets, and Lab Connectivity.
- Quick navigation tiles to maintenance tools and master schedules.

#### `mis-maintenance.html` — Maintenance Ticket Tracker
- Kanban status workflow:
  - **Pending**: Student-submitted fault reports awaiting technician review.
  - **In Progress**: Ticket accepted and undergoing evaluation/repair.
  - **Resolved**: Repair verified and ticket closed.
- Real-time search by ticket ID, room, PC number, and issue type.
- **Completed Tickets History Modal**: Filterable archive of resolved maintenance tickets (All, 7 Days, 30 Days).

#### `mis-qr-generator.html` — PC & QR Code Label Generator
- Select Room and Building, set workstation count.
- Batch generates unique cryptographic QR tokens (`LABSYNC-PC-XXXXX-XXXXXXXX`).
- Generates high-resolution printable QR label cards with direct download and print capabilities.

---

### 5.5 Print & Export Layouts

#### `print-schedule.html` — Individual Room Timetable Print
- Formatted A4/Legal print-ready layout for a single room schedule.
- Includes official headers, university branding, and dynamic signatories (Program Chair & Campus Dean).

#### `print-all-schedules.html` — Bulk Room Timetable Print
- Batch renders all registered laboratory schedules in paginated, print-ready format.

---

### 5.6 Authentication & Account Utilities

| Page / Component | Responsibility |
|---|---|
| `login.html` | Email + password authentication with "Forgot Password" recovery modal. |
| `reset-password.html` | Token-validated password reset form with live password strength checks. |
| `#account-settings-modal` | Reusable modal across all authenticated pages for profile details, email verification, and QR tokens. |
| `#change-password-modal` | In-app modal for updating account passwords with credential verification. |
| `#faculty-signature-modal` | In-app HTML5 canvas digital signature capture pad. |
| `#help-modal` | Role-tailored user manual and keyboard shortcut guide. |

---

## 6. CSS Architecture & Design System

The styling layer is organized into a modular, token-based stylesheet structure in `/css/`:

```
css/
├── variables.css           # Design tokens, color scales, radius, shadows, typography
├── reset.css               # Box-sizing, margin/padding resets, scrollbars
├── layouts.css             # Page wrappers, fixed header, sidebar, grid containers
├── responsive.css          # Responsive breakpoints (320px–1024px) & bottom navigation
├── auth.css                # Login, reset, and split-screen authentication styles
├── tutorial.css            # Spotlight tutorial overlay styles
├── schedule-studio.css     # Timetable grid & wallpaper studio styles
└── components/             # Domain modular component stylesheets
    ├── activity-timeline.css
    ├── alerts.css
    ├── badges.css
    ├── buttons.css
    ├── cards.css
    ├── dropdowns.css
    ├── empty-states.css
    ├── faculty-cards.css
    ├── forms.css
    ├── header.css
    ├── help-cards.css
    ├── lab-cards.css
    ├── modals.css
    ├── notifications.css
    ├── qr-cards.css
    ├── report-cards.css
    ├── schedule-cards.css
    ├── settings-tabs.css
    ├── sidebar.css
    ├── stat-cards.css
    └── tables.css
```

### Design Tokens (`variables.css`)
- **Colors**: Primary Teal (`--primary-teal: #0d9488`), dark accents (`#115e59`), semantic statuses (success `#10b981`, warning `#f59e0b`, danger `#ef4444`, info `#3b82f6`).
- **Typography**: Poppins for headings, Plus Jakarta Sans for UI text and data grids.
- **Theme Modes**: High Contrast mode (`html.high-contrast`) provides pure black surfaces and elevated border contrast.

---

## 7. Frontend JavaScript Architecture

The frontend follows a decoupled modular structure separating domain logic, API requests, rendering, and lifecycle management:

```
js/
├── auth-check.js                   # Client-side session and role guard
├── core/                           # Application runtime
│   ├── accessibility.js            # Contrast and font scaling persistence
│   ├── app.js                      # Core lifecycle and initialization
│   ├── clock.js                    # Synchronized digital clock
│   └── tutorial-launcher.js        # Onboarding coordinator
├── services/                       # Centralized API abstraction services
│   ├── curriculum.service.js
│   ├── faculty.service.js
│   ├── laboratory.service.js
│   ├── notification.service.js
│   ├── report.service.js
│   ├── schedule.service.js
│   ├── settings.service.js
│   └── user.service.js
├── scheduling/                     # Timetable editor subsystem
│   ├── controller/                 # schedule-editor.controller.js
│   ├── interactions/               # autoscroll.js, card-resize.js, mouse-drag.js, touch-drag.js
│   ├── persistence/                # schedule.persistence.js
│   ├── rendering/                  # ghost-schedule.renderer.js, schedule-card.renderer.js, tray-block.renderer.js
│   ├── state/                      # schedule.state.js
│   ├── utils/                      # slot-math.js
│   └── validation/                 # schedule.validator.js
├── reports/                        # PC fault reports subsystem
│   ├── report.actions.js
│   ├── report.controller.js
│   ├── report.filters.js
│   ├── report.modal.js
│   ├── report.parser.js
│   └── report.renderer.js
├── faculty-schedule/               # Faculty personal schedule subsystem
├── master-schedule/                # Master schedule rooms and curriculum subsystem
├── faculty/                        # Faculty management modals
└── utils/                          # Core DOM, time, and string utility helpers
```

---

## 8. Backend Architecture & Data Flow

The backend utilizes a structured Controller-Service-Repository pattern:

```
HTTP Request
    │
    ▼
[Middleware Layer] ──► auth.js (requireAuth, requireRole) / errorHandler.js
    │
    ▼
[Router Layer] ──────► routes/index.js ──► Domain Routers (routes/*.routes.js)
    │
    ▼
[Controller Layer] ──► controllers/*.controller.js (Input validation & status codes)
    │
    ▼
[Service Layer] ─────► services/*.service.js (Business logic, IoT state, email)
    │
    ▼
[Repository Layer] ──► repositories/*.repository.js (Parameterized SQL queries)
    │
    ▼
[Database Layer] ────► database/connection.js (mysql2 connection pool)
```

---

## 9. Database Schema & Migrations

Database Name: **`labsync`** | Engine: **InnoDB** | Charset: **`utf8mb4`**

### Tables Summary

1. **`users`**: System user accounts (Faculty, IT Head, MIS Staff) with roles, hashed passwords, avatars, and recovery tokens.
2. **`laboratories`**: Computer lab rooms with building details and IoT `Key_Status` (*Present* / *Absent*).
3. **`lab_units`**: Workstation PCs mapped to rooms with unique `PC_QR_String` identifiers.
4. **`maintenance`**: PC fault tickets submitted by students/staff with category, remarks, priority, and status (*Pending*, *In Progress*, *Resolved*).
5. **`schedules`**: Timetable class blocks mapped to faculty, room, day, time range, academic year, semester, and color theme.
6. **`occupancy_log`**: Audit log recording room entry events (*QR Code*, *Key Taken*, *Key Returned*).
7. **`system_settings`**: Key-value pairs for institution signatories (*Program Chair*, *Campus Dean*).
8. **`curriculum`**: Master catalog of official academic subjects for timetable scheduling.

### Automated Schema Migrations (`database/migrate.js`)
On server startup, `initializeDatabase()` automatically applies any pending incremental SQL scripts from `database/migrations/`:
- `001_add_user_fields.sql`
- `002_add_laboratory_key_status.sql`
- `003_add_schedule_fields.sql`
- `004_create_system_settings.sql`
- `005_seed_system_settings.sql`
- `006_create_curriculum.sql`
- `007_add_laboratory_current_user.sql`
- `008_add_laboratory_last_seen.sql`
- `009_expand_subject_name.sql`

---

## 10. REST API Specifications

All endpoints are prefixed with `/api/`.

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Authenticates credentials and initializes session. |
| `POST` | `/api/auth/logout` | Auth | Destroys active session. |
| `GET` | `/api/auth/check` | Any | Returns authentication status. |
| `POST` | `/api/auth/recover-password` | Public | Dispatches password reset token via email. |
| `GET` | `/api/auth/validate-reset-token` | Public | Validates reset token parameter. |
| `POST` | `/api/auth/reset-password` | Public | Updates user password using valid reset token. |

### Users & Profile (`/api/user`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/user/current` | Auth | Returns current logged-in user session data. |
| `PUT` | `/api/user/update` | Auth | Updates user profile information. |
| `PUT` | `/api/user/password` | Auth | Updates account password. |
| `GET` | `/api/user/verify-email` | Public | Verifies email update token. |
| `GET` | `/api/user/qrcode` | Auth | Returns user badge QR code image. |
| `PUT` | `/api/user/tutorial-status` | Auth | Updates user onboarding tutorial completion state. |

### Faculty Management (`/api/faculty`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/faculty` | Auth | Returns all faculty and staff accounts. |
| `POST` | `/api/faculty/add` | IT Head | Creates new staff account and sends welcome email. |
| `PUT` | `/api/faculty/:userId/role` | IT Head | Updates user role or transfers leadership. |
| `DELETE` | `/api/faculty/:userId` | IT Head | Removes a staff account. |

### Laboratories & Workstations (`/api/laboratories`, `/api/pcs`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/laboratories` | Auth | Returns all labs with computed real-time statuses. |
| `POST` | `/api/laboratories/add` | IT Head | Adds a new laboratory room. |
| `PUT` | `/api/laboratories/:roomId` | IT Head | Updates laboratory room details. |
| `DELETE` | `/api/laboratories/:roomId` | IT Head | Deletes a laboratory room. |
| `GET` | `/api/laboratories/:roomId/pcs` | Auth | Returns all PC units in a room. |
| `POST` | `/api/laboratories/:roomId/pcs/add` | IT Head | Adds a single PC unit to a room. |
| `POST` | `/api/laboratories/:roomId/pcs/add-bulk`| IT Head | Batch creates PC units for a room. |
| `GET` | `/api/laboratories/:roomId/pcs/qrcodes` | IT Head / MIS | Generates batch QR label tokens for a room. |
| `DELETE` | `/api/pcs/:pcId` | IT Head | Removes a PC unit. |

### Schedules (`/api/schedules`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/schedules/save` | IT Head | Batch saves/updates timetable grid cards for a room. |
| `GET` | `/api/schedules/check-professor-conflict` | Auth | Checks if a faculty member has overlapping commitments. |
| `GET` | `/api/schedules/professor` | Auth | Returns schedules for the active faculty user. |
| `GET` | `/api/schedules/room/:roomNumber` | Auth | Returns all schedule entries for a specific room. |

### Maintenance & PC Reports (`/api/reports`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/reports/submit` | Public | Student submits a PC fault report via QR scan. |
| `GET` | `/api/reports` | Auth | Returns all maintenance tickets with filtering. |
| `PUT` | `/api/reports/:reportId/status` | IT Head / MIS | Updates ticket status (*Pending* → *In Progress* → *Resolved*). |
| `DELETE` | `/api/reports/:reportId` | IT Head / MIS | Deletes a maintenance ticket. |

### IoT & Occupancy (`/api/occupancy`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/occupancy/log` | Public (IoT) | Logs key removal/return or QR badge scan from ESP32. |
| `POST` | `/api/occupancy/heartbeat` | Public (IoT) | Device connectivity ping. |

### System Settings & Curriculum (`/api/settings`, `/api/curriculum`)
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings` | IT Head / MIS | Returns institution signatories. |
| `POST` | `/api/settings` | IT Head | Updates institution signatories. |
| `GET` | `/api/curriculum` | Auth | Returns official curriculum subject catalog. |
| `POST` | `/api/curriculum/import` | IT Head | Batch imports curriculum subjects from CSV/Excel. |
| `DELETE` | `/api/curriculum` | IT Head | Clears curriculum catalog. |

---

## 11. IoT Hardware Integration

### Pinout Mapping (ESP32)
- **Key Slot Room 203**: `GPIO 32` (`INPUT_PULLUP` to GND).
- **Key Slot Room 204**: `GPIO 33` (`INPUT_PULLUP` to GND).
- **GM65 QR Scanner**: `GPIO 17` (RX2) / `GPIO 16` (TX2) at 9600 baud.
- **I2C 16x2 LCD**: `GPIO 21` (SDA) / `GPIO 22` (SCL), I2C Address `0x27`.
- **Buzzer**: `GPIO 25` (Active Low trigger).

### Dynamic Room Availability Calculation
```
Key Present (Docked) ───────────────────► Status = "Available" (Green)
Key Absent (Taken) + Matching Faculty ──► Status = "In Session" (Red)
Key Absent (Taken) + Unscheduled Slot ──► Status = "Borrowed" (Orange)
```

---

## 12. Transactional Email System

Powered by **Nodemailer** with modular HTML email templates (`services/email/templates/`):
- **Welcome Email (`welcome.js`)**: Dispatched when a new faculty or MIS staff member is added, providing temporary login credentials and an action button.
- **Password Reset (`reset-password.js`)**: Dispatched on forgot password requests containing a secure tokenized link.
- **Email Verification (`verification.js`)**: Dispatched when a user updates their email address in Account Settings.

---

## 13. Environment Configuration

Configure the application by creating a `.env` file in the project root:

```env
# Database Configuration
DB_HOST=your_database_host
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
DB_PORT=your_database_port

# Server Configuration
PORT=your_server_port
APP_URL=your_application_url
SESSION_SECRET=your_session_secret

# Transactional Email Configuration (SMTP)
EMAIL_HOST=your_smtp_host
EMAIL_PORT=your_smtp_port
EMAIL_USER=your_smtp_username
EMAIL_PASS=your_smtp_password
```

---

## 14. Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Import Initial Database**:
   ```bash
   mysql -u root -p labsync < labsync.sql
   ```
3. **Run Application**:
   ```bash
   # Production
   npm start

   # Development with auto-restart
   npm run dev
   ```
4. **Access Web Application**:
   Navigate to `http://localhost:3000/login.html`.

---

*Documentation maintained for Bulacan State University – Sarmiento Campus.*
