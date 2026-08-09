# LabSync — Full System Documentation

> **Version:** 1.0.0  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Environment:** Node.js + Express + MySQL (MariaDB)  
> **Last Updated:** August 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [File & Folder Structure](#3-file--folder-structure)
4. [User Roles & Access Control](#4-user-roles--access-control)
5. [Pages & Features](#5-pages--features)
   - [Public / Student](#51-public--student)
   - [Faculty](#52-faculty)
   - [IT Department Head](#53-it-department-head)
   - [MIS Staff](#54-mis-staff)
   - [Shared / Utility Pages](#55-shared--utility-pages)
6. [CSS Architecture](#6-css-architecture)
7. [JavaScript Modules](#7-javascript-modules)
8. [Database Schema](#8-database-schema)
9. [API Endpoints](#9-api-endpoints)
10. [IoT Hardware Integration](#10-iot-hardware-integration)
11. [Email System](#11-email-system)
12. [Environment Configuration](#12-environment-configuration)
13. [Running the Project](#13-running-the-project)

---

## 1. Project Overview

**LabSync** is a web-based Computer Laboratory Monitoring & Management System built for Bulacan State University's Sarmiento Campus. It centralizes lab room scheduling, PC health reporting, maintenance ticket tracking, faculty management, and real-time room occupancy — all in a single cohesive platform.

### Core Problem Solved

| Problem | LabSync Solution |
|---|---|
| Manual, paper-based PC fault reports | Students scan a QR code per PC to submit structured digital tickets |
| Unknown room availability at a glance | Real-time room status dashboard (Available / Claimed / In Use) |
| Fragmented schedule management | Drag-and-drop schedule studio with conflict detection |
| No maintenance pipeline visibility | Kanban-style maintenance tracker (Pending → In Progress → Resolved) |
| Physical key management uncertainty | IoT ESP32 device detects key presence and reports state in real time |

---

## 2. Technology Stack

### Backend

| Technology | Purpose |
|---|---|
| **Node.js** | Server runtime |
| **Express v5** | Web framework & REST API |
| **MySQL2** | Database driver (async/await support) |
| **express-session** | Cookie-based session authentication |
| **express-mysql-session** | Persists sessions in the MySQL database |
| **Nodemailer** | Sends welcome emails and password reset emails |
| **QRCode** | Generates QR code PNG data URLs for PC labels |
| **dotenv** | Loads environment variables from `.env` |
| **CORS** | Cross-origin resource sharing middleware |
| **crypto** (built-in) | Generates secure random tokens for password reset |

### Frontend

| Technology | Purpose |
|---|---|
| **Vanilla HTML5** | All page structure |
| **Custom CSS3** (modular) | Design system via CSS variables |
| **Vanilla JavaScript** | All client-side logic |
| **Lucide Icons** | Icon library (CDN) |
| **Google Fonts** | Typography (Plus Jakarta Sans) |

### IoT / Hardware

| Component | Details |
|---|---|
| **ESP32 Dev Module** | Main microcontroller |
| **GM65 QR Scanner** | Reads user QR tokens on room entry |
| **I2C LCD 16x2** | Displays feedback messages to user |
| **6.35mm Jack Socket** | Key detection sensor (INPUT_PULLUP) |
| **Arduino Framework** | Sketch language for ESP32 |
| **ArduinoJson** | Parses JSON responses from server |

---

## 3. File & Folder Structure

```
LabSync/
|
|-- server.js                   # Main Express server (API + static file serving)
|-- db.js                       # MySQL connection pool
|-- auth-check.js               # Client-side auth guard (redirects on role mismatch)
|-- script.js                   # Primary client-side JS for main dashboards
|-- schedule.js                 # Faculty "My Schedule" page logic
|-- reports.js                  # PC reporting form logic
|-- room-schedule-editor.js     # Schedule Studio drag-and-drop logic
|
|-- index.html                  # Faculty Dashboard
|-- login.html                  # Login / Auth page
|-- reset-password.html         # Password reset via token link
|
|-- room-status.html            # Faculty: Real-time lab room status
|-- my-schedule.html            # Faculty: Personal weekly schedule
|-- pc-reports.html             # Faculty: PC fault report viewer
|
|-- it-head-dashboard.html      # IT Head: Main dashboard
|-- it-head-room-status.html    # IT Head: Room status view
|-- it-head-my-schedule.html    # IT Head: Schedule view
|-- it-head-pc-reports.html     # IT Head: PC reports view
|
|-- mis-staff-dashboard.html    # MIS Staff: Main dashboard
|-- mis-maintenance.html        # MIS Staff: Maintenance ticket tracker
|-- mis-pc-reports.html         # MIS Staff: PC reports summary
|-- mis-qr-generator.html       # MIS Staff: QR code label generator
|
|-- master-schedule.html        # IT Head / MIS: Full master schedule viewer
|-- room-schedule-editor.html   # IT Head: Drag-and-drop schedule editor
|-- faculty-management.html     # IT Head: Faculty CRUD management
|
|-- pc-report.html              # Student: Public PC issue reporting form
|-- print-schedule.html         # Print individual room schedule (A4/Legal)
|-- print-all-schedules.html    # Print all room schedules (bulk)
|
|-- labsync.sql                 # Initial database schema dump (MariaDB)
|-- package.json                # Node.js project manifest
|-- .env                        # Environment variables (not committed)
|-- .gitignore                  # Git exclusion rules
|
|-- css/
|   |-- reset.css               # CSS reset / base normalization
|   |-- variables.css           # Design tokens (colors, spacing, shadows, etc.)
|   |-- components.css          # Reusable UI components (cards, buttons, modals)
|   |-- layouts.css             # Page-level layout grids and containers
|   |-- responsive.css          # All media queries and mobile breakpoints
|   |-- auth.css                # Login and reset-password specific styles
|   `-- schedule-studio.css     # Drag-and-drop schedule editor specific styles
|
|-- js/
|   `-- schedule-studio.js      # Schedule Studio drag-and-drop helper logic
|
|-- assets/                     # Static assets (images, logos, etc.)
|
|-- IOT_HANDOVER_SUMMARY.md     # ESP32 wiring, sketch, and debugging notes
|-- v1_0_0_feature_summary.md   # V1.0.0 feature and DB schema summary
`-- SYSTEM_DOCUMENTATION.md     # This file
```

---

## 4. User Roles & Access Control

LabSync has **4 distinct roles**, each with a dedicated set of pages and permissions.

| Role | Dashboard Entry | Description |
|---|---|---|
| `Faculty` | `index.html` | Professors / teaching staff |
| `IT Head` | `it-head-dashboard.html` | Department head with full admin access |
| `MIS Staff` | `mis-staff-dashboard.html` | Technical/maintenance staff |
| *(Public)* | `pc-report.html` | Students — no login required |

### Authentication Flow

1. User submits email + password on `login.html`.
2. Server validates credentials against the `users` table.
3. On success, `req.session.user` is populated with `User_ID`, `Name`, `Email`, `Role`.
4. Client-side `auth-check.js` runs on every protected page's `<head>`:
   - Fetches `/api/session` to verify active session.
   - Checks that `role` matches the expected role for that page.
   - Redirects to `login.html` if not authenticated or wrong role.
   - Hides `<body>` contents until auth passes (anti-flash guard).
5. All mutating API routes are protected server-side by `requireAuth` middleware.

### Password Recovery

1. User clicks "Forgot Password" on the login page.
2. Enters their registered email in the modal.
3. Server generates a `crypto.randomBytes(32)` token, stores it with expiry in `users.Reset_Token`.
4. Nodemailer sends a reset link to the email containing the token.
5. `reset-password.html` validates the token and allows setting a new password.

---

## 5. Pages & Features

### 5.1 Public / Student

#### `pc-report.html` — PC Issue Reporting Form
- Publicly accessible — **no login required**.
- Loaded when a student scans a QR code label affixed to a PC.
- URL contains the `PC_QR_String` parameter to identify the specific machine.
- Student selects from hardware/software fault checkboxes:
  - Mouse, Keyboard, Monitor, System Unit, Internet Connection, OS/Software, Others
- Free-text remark and program/section input.
- Submits to `POST /api/maintenance/report`.
- Inherits user's **Text Scaling** and **High Contrast** accessibility preferences from `localStorage`.

---

### 5.2 Faculty

#### `index.html` — Faculty Dashboard
- Stats cards: Active Labs, Pending PC Reports, Classes Today.
- Quick-start guide tiles tailored to the Faculty role.
- Real-time room status feed from `/api/laboratories`.

#### `room-status.html` — Lab Room Status
- Displays all registered laboratory rooms with color-coded status badges:
  - **Available** (Green) — Key present, no active class.
  - **Claimed** (Orange) — Key absent (taken), no class.
  - **In Use** (Red) — A class is currently scheduled.
- Status is computed **dynamically** server-side using schedule + key data.

#### `pc-reports.html` — PC Reports Viewer
- Faculty can view student-submitted PC fault tickets for their rooms.
- Shows: PC number, fault type, student remarks, date reported.

#### `my-schedule.html` — Personal Schedule
- Interactive weekly timetable (Mon–Sat grid).
- Filterable by **Academic Year** (e.g., `2025-2026`) and **Semester** (`1st`, `2nd`, `Summer`).
- Only displays schedules assigned to the currently logged-in faculty member.

#### Accessibility Controls (Profile Dropdown — all Faculty pages)

| Feature | Detail |
|---|---|
| **Text Scaling** | Options: 90%, 100%, 110%, 120%. Applied as `document.body.style.zoom`. Persisted in `localStorage`. |
| **High Contrast** | Toggles an alternate `<link>` stylesheet for dark/high-contrast mode. Persisted in `localStorage`. |

---

### 5.3 IT Department Head

#### `it-head-dashboard.html` — IT Head Dashboard
- Overview stats: total labs, active reports, staff count, etc.
- Quick-access nav tiles to all management tools.

#### `master-schedule.html` — Master Schedule Viewer
- View all laboratory schedules across all rooms.
- Filter by room, semester, and academic year.
- Print button links to `print-all-schedules.html`.

#### `room-schedule-editor.html` — Schedule Studio (Drag & Drop)
- **Core feature**: Fully interactive drag-and-drop schedule builder.
- Create schedule **blocks** with: Subject Name, Professor, Section, Color Theme.
- Drag blocks onto the weekly timetable grid for a selected room.
- Server-side and client-side **clash detection** (no overlapping times allowed).
- Add/remove custom time rows dynamically.
- Save schedules to the database via API.

#### `faculty-management.html` — Faculty Directory (CRUD)
- **Create**: Add new faculty/MIS staff accounts. Server auto-generates a secure random temporary password and sends a **Welcome Email** via Nodemailer.
- **Read**: View all staff in a searchable, role-filterable card grid.
- **Update**: Edit name, email, role; upload a profile photo (stored as Base64 in DB).
- **Delete**: Remove faculty accounts (cascades to associated schedules/logs).
- Profile photo fallback: displays name initials if no photo uploaded.

#### `print-schedule.html` — Single Room Print Layout
- Formats a single room's schedule as a clean A4/Legal PDF-ready page.
- Includes room number, building, program chair, and campus dean (from `system_settings` table).

#### `print-all-schedules.html` — Bulk Print Layout
- Renders all rooms' schedules in bulk, paginated, print-ready.

#### IT Head Parallel Views
- `it-head-room-status.html` — IT Head version of the room status view.
- `it-head-my-schedule.html` — IT Head personal schedule view.
- `it-head-pc-reports.html` — IT Head PC reports view with elevated data access.

---

### 5.4 MIS Staff

#### `mis-staff-dashboard.html` — MIS Dashboard
- Visual stat cards: open tickets, in-progress repairs, resolved count, lab connectivity.

#### `mis-maintenance.html` — Maintenance Ticket Tracker
- Full Kanban-style queue:
  - **Pending** — Student-reported, awaiting attention.
  - **In Progress** — MIS staff accepted and working on it.
  - **Resolved** — Ticket closed.
- Filter by room, status, priority.
- Ticket cards show: PC number, issue description, student name, date reported, priority badge.

#### `mis-pc-reports.html` — PC Reports Summary
- Consolidated view of all reported faults across all labs.
- Shows student program, section, specific hardware indicators, and remarks.

#### `mis-qr-generator.html` — QR Code Label Generator
- Select a **Room** and **Building**, input **PC count**.
- Server calls `GET /api/qr/generate` to create individual QR strings per PC.
- Displays downloadable/printable QR label cards per PC.
- QR codes encode unique `PC_QR_String` identifiers that route to `pc-report.html?pc=<string>`.

---

### 5.5 Shared / Utility Pages

| Page | Purpose |
|---|---|
| `login.html` | Email + password login; includes "Forgot Password" modal |
| `reset-password.html` | Token-based password reset |

---

## 6. CSS Architecture

All stylesheets live in the `/css/` directory and are imported in this order on every page:

```html
<link rel="stylesheet" href="css/reset.css">
<link rel="stylesheet" href="css/variables.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/layouts.css">
<link rel="stylesheet" href="css/responsive.css">
```

| File | Role |
|---|---|
| `reset.css` | Normalizes browser defaults; box-sizing, margin/padding reset |
| `variables.css` | All CSS custom properties — colors, typography scale, spacing tokens, shadow layers, border radii, transition durations |
| `components.css` | Reusable components: stat cards, nav sidebar, modals, tables, badges, buttons, dropdowns, form inputs, toast notifications |
| `layouts.css` | Page-level wrappers: sidebar + main layout, grid containers, header bars |
| `responsive.css` | All `@media` breakpoints for tablet and mobile viewports |
| `auth.css` | Login and reset page-specific styles (split-screen card layout) |
| `schedule-studio.css` | Drag-and-drop grid styles, block colors, time slot rows |

### Design Tokens (from `variables.css`)

- **Color Palette**: Primary brand cyan (`--color-primary`), semantic status colors (success, warning, danger, info), neutral grays.
- **Typography**: Font scale from `--text-xs` to `--text-5xl`, using **Plus Jakarta Sans**.
- **Spacing**: `--space-1` through `--space-16` (4px base unit).
- **Shadows**: Layered shadow tokens from `--shadow-sm` to `--shadow-xl`.
- **Border Radius**: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`.
- **Transitions**: `--transition-fast`, `--transition-base`, `--transition-slow`.

---

## 7. JavaScript Modules

| File | Scope | Responsibility |
|---|---|---|
| `auth-check.js` | All protected pages (in `<head>`) | Session validation, role enforcement, redirect on failure |
| `script.js` | Main dashboards | Dashboard stats, room status rendering, notification polling (3s interval), occupancy log/activity feed |
| `schedule.js` | `my-schedule.html` | Fetches and renders faculty's personal weekly timetable; filter UI |
| `reports.js` | `pc-report.html` | PC fault form submission, QR string parsing from URL |
| `room-schedule-editor.js` | `room-schedule-editor.html` | Full drag-and-drop schedule studio: block creation, grid rendering, clash detection, save/load |
| `js/schedule-studio.js` | Schedule Studio (helper) | Supporting utilities for schedule studio interactions |

---

## 8. Database Schema

Database name: **`labsync`**  
Engine: **InnoDB**, Charset: **utf8mb4**

### Entity Relationships

```
users ──────────┬──── schedules ──── laboratories ──── lab_units ──── maintenance
                │                           |
                └──── occupancy_log ────────┘
```

---

### Table: `users`

Stores all system accounts (Faculty, IT Head, MIS Staff).

| Column | Type | Description |
|---|---|---|
| `User_ID` | INT AUTO_INCREMENT PK | Unique user identifier |
| `Name` | VARCHAR(100) | Full name |
| `Email` | VARCHAR(50) | Login email |
| `Role` | VARCHAR(20) | `Faculty`, `IT Head`, `MIS Staff` |
| `Password` | VARCHAR(255) | Password |
| `ID_QR_String` | VARCHAR(255) | Unique QR token (e.g., `LABSYNC-USER-XXXXX-XXXXXXXX`) |
| `Profile_Photo` | LONGTEXT | Base64-encoded profile image |
| `Reset_Token` | VARCHAR(255) | Secure token for password reset |
| `Reset_Token_Expiry` | DATETIME | Expiry timestamp for reset token |
| `New_Email` | VARCHAR(255) | Pending new email address |
| `Email_Verify_Token` | VARCHAR(255) | Token to verify new email address |
| `Email_Verify_Token_Expiry` | DATETIME | Expiry for email verification token |
| `Phone` | VARCHAR(20) | Optional phone number |

---

### Table: `laboratories`

Each registered computer lab room.

| Column | Type | Description |
|---|---|---|
| `Room_ID` | INT AUTO_INCREMENT PK | Unique room identifier |
| `Room_Number` | VARCHAR(10) | Room code (e.g., `204`) |
| `Building` | VARCHAR(50) | Building name |
| `Current_Status` | VARCHAR(255) | Legacy static status field |
| `Key_Status` | VARCHAR(20) DEFAULT `'Present'` | IoT key state: `Present` or `Absent` |

**Dynamic Status Logic** (computed server-side in `GET /api/laboratories`):
- If a class is **currently scheduled** → status = **`In Use`**
- Else if `Key_Status = 'Absent'` → status = **`Claimed`**
- Else → status = **`Available`**

---

### Table: `lab_units`

Individual PCs within each lab room.

| Column | Type | Description |
|---|---|---|
| `PC_ID` | INT AUTO_INCREMENT PK | Unique PC identifier |
| `Room_ID` | INT FK → `laboratories` | Parent room (CASCADE DELETE) |
| `PC_Number` | VARCHAR(10) | Human-readable PC label (e.g., `PC-01`) |
| `Condition_Status` | TEXT | Current condition notes |
| `PC_QR_String` | VARCHAR(255) | Unique QR identifier for the PC label |

---

### Table: `maintenance`

PC fault/maintenance tickets submitted by students or staff.

| Column | Type | Description |
|---|---|---|
| `Report_ID` | INT AUTO_INCREMENT PK | Unique report identifier |
| `PC_ID` | INT FK → `lab_units` | The affected PC (CASCADE DELETE) |
| `User_ID` | INT FK → `users` | Staff who accepted the ticket (SET NULL on delete) |
| `Student_Name` | VARCHAR(100) | Name of the reporting student |
| `Issue_Description` | TEXT | Fault details and student remarks |
| `Date_Reported` | DATETIME | Timestamp of submission |
| `Status` | VARCHAR(20) | `Pending`, `In Progress`, `Resolved` |
| `Priority_Level` | VARCHAR(20) | `Low`, `Medium`, `High` |

---

### Table: `schedules`

Class schedule slots assigned to faculty per room.

| Column | Type | Description |
|---|---|---|
| `Schedule_ID` | INT AUTO_INCREMENT PK | Unique schedule entry |
| `User_ID` | INT FK → `users` | Assigned faculty member (CASCADE DELETE) |
| `Room_ID` | INT FK → `laboratories` | Assigned room (CASCADE DELETE) |
| `Subject_Name` | VARCHAR(15) | Subject code/name |
| `Section` | VARCHAR(10) | Class section (e.g., `IT-3A`) |
| `Day_of_Week` | VARCHAR(20) | `Monday`, `Tuesday`, … `Saturday` |
| `Start_Time` | TIME | Schedule start (24h format) |
| `End_Time` | TIME | Schedule end (24h format) |
| `Academic_Year` | VARCHAR(15) DEFAULT `'2025-2026'` | Academic year string |
| `Semester` | VARCHAR(20) DEFAULT `'1st Semester'` | `1st Semester`, `2nd Semester`, `Summer` |
| `Color_Theme` | VARCHAR(50) | UI block color assigned in Schedule Studio |

---

### Table: `occupancy_log`

Log of every room entry event (QR scan or key event).

| Column | Type | Description |
|---|---|---|
| `Log_ID` | INT AUTO_INCREMENT PK | Unique log entry |
| `User_ID` | INT FK → `users` (nullable) | User who scanned (NULL for key-only events) |
| `Room_ID` | INT FK → `laboratories` | The accessed room |
| `Access_Time` | DATETIME | Timestamp of the event |
| `Auth_Method` | VARCHAR(20) | `QR Code`, `Key Taken`, `Key Returned` |

---

### Table: `system_settings`

Global configurable system values (used in print layouts).

| Column | Type | Description |
|---|---|---|
| `Setting_Key` | VARCHAR(50) PK | Setting name |
| `Setting_Value` | VARCHAR(255) | Setting value |

Default seeded values:
- `program_chair` → `ELENITA T. CAPARIÑO`
- `campus_dean` → `DR. MARICEL BALIGOD`

---

### Table: `curriculum`

Master list of available subjects for the Schedule Studio.

| Column | Type | Description |
|---|---|---|
| `Curriculum_ID` | INT AUTO_INCREMENT PK | Unique ID |
| `Subject_Code` | VARCHAR(50) | Subject code (e.g., `IT 321`) |
| `Subject_Name` | VARCHAR(255) | Full subject name |
| `Created_At` | DATETIME DEFAULT `CURRENT_TIMESTAMP` | Entry date |

---

## 9. API Endpoints

All API routes are prefixed with `/api/`. The server listens on **port 3000** by default.

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/login` | Public | Log in with email + password. Sets session. |
| `POST` | `/api/logout` | Any | Destroys session. |
| `GET` | `/api/session` | Any | Returns current session user object. |
| `POST` | `/api/forgot-password` | Public | Sends password reset email. |
| `POST` | `/api/reset-password` | Public | Validates token and updates password. |

### Users / Faculty Management

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | Auth | Get all users (for faculty management). |
| `POST` | `/api/users` | IT Head | Create new user; sends welcome email. |
| `PUT` | `/api/users/:id` | IT Head | Update user details. |
| `DELETE` | `/api/users/:id` | IT Head | Delete a user. |
| `PUT` | `/api/users/:id/photo` | Auth | Upload/update profile photo (Base64). |

### Laboratories

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/laboratories` | Auth | Get all labs with dynamically computed statuses. |
| `POST` | `/api/laboratories` | IT Head | Create a new lab room. |
| `PUT` | `/api/laboratories/:id` | IT Head | Update room details. |
| `DELETE` | `/api/laboratories/:id` | IT Head | Delete a lab room (cascades). |

### Schedules

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/schedules` | Auth | Get all schedules (filterable by room, user, semester, year). |
| `POST` | `/api/schedules` | IT Head | Create a new schedule block. |
| `PUT` | `/api/schedules/:id` | IT Head | Update a schedule block. |
| `DELETE` | `/api/schedules/:id` | IT Head | Delete a schedule block. |

### Maintenance / PC Reports

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/maintenance` | Auth | Get all maintenance tickets. |
| `POST` | `/api/maintenance/report` | Public | Student submits a PC fault report. |
| `PUT` | `/api/maintenance/:id/status` | MIS Staff | Update ticket status (Pending → In Progress → Resolved). |
| `DELETE` | `/api/maintenance/:id` | Auth | Delete a ticket. |

### Lab Units (PCs)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/lab-units` | Auth | Get all PCs (filterable by room). |
| `POST` | `/api/lab-units` | IT Head | Add a PC to a room. |
| `DELETE` | `/api/lab-units/:id` | IT Head | Remove a PC. |

### QR Code

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/qr/generate` | MIS Staff | Generate QR codes for PCs in a room. |

### Occupancy / IoT

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/occupancy/log` | Public (IoT Device) | Logs QR scan or key event from ESP32 device. |
| `GET` | `/api/notifications` | Auth | Returns recent activity log (LEFT JOIN to include key events). |

### System Settings / Curriculum

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/system-settings` | Auth | Get system settings (program chair, dean). |
| `PUT` | `/api/system-settings` | IT Head | Update system settings. |
| `GET` | `/api/curriculum` | Auth | Get all curriculum subjects. |
| `POST` | `/api/curriculum` | IT Head | Add a subject to curriculum. |
| `DELETE` | `/api/curriculum/:id` | IT Head | Remove a subject. |

---

## 10. IoT Hardware Integration

### Hardware Setup

| Component | ESP32 Pin | Connection Notes |
|---|---|---|
| **I2C LCD (16x2)** | `GPIO 21` (SDA) / `GPIO 22` (SCL) | Standard I2C; auto-scanned on boot. Address typically `0x27`. |
| **GM65 QR Scanner** | `GPIO 27` (RX2) / `GPIO 26` (TX2) | RX→27, TX→26. Baud Rate: **9600**. |
| **6.35mm Key Jack Socket** | `GPIO 14` (D14) / `GND` | Configured as `INPUT_PULLUP`. LOW = key present (circuit closed). |

### Device Behavior Flow

```
Boot → Connect Wi-Fi → Show "Ready to Scan!" on LCD
        |
        |-- QR Scanner detects code
        |     └── POST /api/occupancy/log { qrString, roomNumber, authMethod: "QR Code" }
        |         |-- HTTP 200 → "Scan Confirmed! You May Take Key" (LCD)
        |         └── HTTP error → "Access Denied! Invalid QR Code" (LCD)
        |
        └── Key slot state changes (D14 debounced 100ms)
              |-- Key Removed → POST { keyEvent: "Key Taken", roomNumber }
              └── Key Returned → POST { keyEvent: "Key Returned", roomNumber }
```

### API Payload Formats

**QR Scan Event:**
```json
{
  "qrString": "LABSYNC-USER-1778994645214-SE2SCZO3W",
  "roomNumber": "204",
  "authMethod": "QR Code"
}
```

**Key Event:**
```json
{
  "keyEvent": "Key Taken",
  "roomNumber": "204"
}
```

**Server LCD Response:**
```json
{
  "lcdLine1": "Scan Confirmed!",
  "lcdLine2": "You May Take Key"
}
```

### Real-Time Dashboard Integration

- The dashboard polls `GET /api/notifications` every **3 seconds**.
- On each poll cycle, it also refreshes room status cards and the activity timeline log.
- No manual page refresh needed — the dashboard updates live.

### Key Detection Debugging Notes

> See [IOT_HANDOVER_SUMMARY.md](./IOT_HANDOVER_SUMMARY.md) for full wiring details and the complete Arduino sketch.

- **Working**: D14 grounding directly to GND changes pin state correctly.
- **Issue**: Fully-metal 6.35mm plug may bridge both socket contacts, keeping the circuit permanently closed.
- **Test**: Use a non-conductive plastic stick to push the spring leaf away from the contact tab to confirm mechanical vs. electrical issue.

---

## 11. Email System

LabSync uses **Nodemailer** for transactional email.

### Configured Events

| Trigger | Email Type | Content |
|---|---|---|
| New faculty account created | **Welcome Email** | Includes temporary credentials, login CTA button, branded HTML template |
| Forgot password request | **Password Reset** | Contains reset link with secure token (`/reset-password.html?token=XXX`) |
| Email change request | **Email Verification** | Sends verification link to new email address before confirming the change |

### Configuration

Email is configured via `.env` variables:
```env
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=<mailtrap_user>
EMAIL_PASS=<mailtrap_pass>
```

> **Production Note:** Replace Mailtrap credentials with your real SMTP provider (e.g., Gmail SMTP, SendGrid, Resend, etc.).

---

## 12. Environment Configuration

File: `.env` (not committed to version control — see `.gitignore`)

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=labsync
DB_PORT=3306

# Server
PORT=3000

# Email (Mailtrap for development)
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=<your_mailtrap_user>
EMAIL_PASS=<your_mailtrap_pass>

# Application URL (used in email links)
APP_URL=http://localhost:3000
```

---

## 13. Running the Project

### Prerequisites

- **Node.js** v18+ installed
- **MySQL / MariaDB** running locally
- Database `labsync` created and schema imported from `labsync.sql`

### Setup Steps

```bash
# 1. Install dependencies
npm install

# 2. Create and populate .env file (see Section 12 above)

# 3. Import database schema (in phpMyAdmin or MySQL CLI)
mysql -u root -p labsync < labsync.sql

# 4. Start the server (production mode)
npm start

# 5. Start the server (development mode with auto-reload)
npm run dev

# 6. Open in browser
# http://localhost:3000/login.html
```

### Creating the First Admin Account

No default accounts are seeded. Insert an IT Head account directly via SQL:

```sql
INSERT INTO users (Name, Email, Role, Password)
VALUES ('Admin', 'admin@labsync.edu.ph', 'IT Head', 'yourpassword');
```

Then use **Faculty Management** (`faculty-management.html`) to add additional staff via the UI.

---

*This document reflects the state of LabSync as of Version 1.0.0, August 2026.*  
*For IoT-specific debugging, refer to [IOT_HANDOVER_SUMMARY.md](./IOT_HANDOVER_SUMMARY.md).*  
*For the feature changelog, refer to [v1_0_0_feature_summary.md](./v1_0_0_feature_summary.md).*
