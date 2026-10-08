# LabSync — Full System Documentation

> **Version:** 1.3.0 (Enterprise IoT Key Custody, Multi-Key Advance Reservations, Automated Return Reminders & PDF Audit Reporting)  
> **Institution:** Bulacan State University — Sarmiento Campus  
> **Environment:** Node.js v18+ + Express v5 + MySQL / MariaDB  
> **Last Updated:** October 2026  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [File & Folder Structure](#3-file--folder-structure)
4. [User Roles & Access Control](#4-user-roles--access-control)
5. [Pages & Application Architecture](#5-pages--application-architecture)
   - [5.1 Public & Student Workstation Interaction](#51-public--student-workstation-interaction)
   - [5.2 Faculty / Professor Features](#52-faculty--professor-features)
   - [5.3 IT Department Head Features](#53-it-department-head-features)
   - [5.4 MIS Staff Features](#54-mis-staff-features)
   - [5.5 Physical Key Management & Keychain Tag Studio](#55-physical-key-management--keychain-tag-studio)
   - [5.6 Mobile Key Transfer & Room Claim Protocol](#56-mobile-key-transfer--room-claim-protocol)
   - [5.7 Multi-Key Authorization & Advance Reservation Workflow](#57-multi-key-authorization--advance-reservation-workflow)
   - [5.8 Automatic Key Return & Transfer Reminder System](#58-automatic-key-return--transfer-reminder-system)
   - [5.9 Room Status Activity Log PDF Reporting Engine](#59-room-status-activity-log-pdf-reporting-engine)
   - [5.10 Print & Export Layouts](#510-print--export-layouts)
   - [5.11 Institutional Policies & Legal Compliance](#511-institutional-policies--legal-compliance)
   - [5.12 Authentication, Session Management & Account Utilities](#512-authentication-session-management--account-utilities)
6. [CSS Architecture & Design System](#6-css-architecture--design-system)
7. [Frontend JavaScript Architecture](#7-frontend-javascript-architecture)
8. [Backend Architecture & Data Flow](#8-backend-architecture--data-flow)
9. [Database Schema & Migrations](#9-database-schema--migrations)
10. [REST API Specifications](#10-rest-api-specifications)
11. [Security, Cryptography & Rate Limiting](#11-security-cryptography--rate-limiting)
12. [Security Audit Logging System](#12-security-audit-logging-system)
13. [IoT Hardware & Telemetry Integration](#13-iot-hardware--telemetry-integration)
14. [Activity Log Data Retention Policy](#14-activity-log-data-retention-policy)
15. [Transactional Email System](#15-transactional-email-system)
16. [Automated Testing & Quality Assurance](#16-automated-testing--quality-assurance)
17. [Environment Configuration](#17-environment-configuration)
18. [Installation & Deployment](#18-installation--deployment)

---

## 1. Project Overview

**LabSync** is an institutional full-stack, IoT-integrated web platform engineered specifically for the Information Technology laboratory facilities of **Bulacan State University – Sarmiento Campus**. It synchronizes physical room keys, faculty teaching schedules, workstation maintenance lifecycle, mobile peer-to-peer key custody transfers, and microcontroller-based key dock hardware into a unified, tamper-evident digital workflow.

### Core Problems Solved

| Institutional Problem | LabSync Architectural Solution |
|---|---|
| **Manual paper-based PC fault tickets** | Students scan workstation-mounted QR labels to launch [submit-pc-report.html](file:///c:/Users/andre/Downloads/LabSync/submit-pc-report.html) without requiring login, submitting structured repair requests directly to the queue. |
| **Duplicate fault reports & queue spam** | Relational deduplication via `maintenance_issues` using a generated hash `Active_Issue_Key = CONCAT(PC_ID, ':', Issue_Type)`. Incoming duplicate reports group under single master tickets displaying aggregated reporter counts (`👤 Name [+N]`). |
| **Room availability blind spots** | Dynamic availability engine calculates real-time room states (*Available*, *In Session*, *Borrowed*) by reconciling timetable slots against physical IoT key dock state and custody assignments. |
| **Hallway key handoff uncertainty** | Mobile Key Transfer & Room Claim ([key-transfer.html](file:///c:/Users/andre/Downloads/LabSync/key-transfer.html)) enables consecutive professors to legally scan key QR fobs and transfer custody in hallways without walking back to the central office. |
| **Physical key loss & tracking voids** | MIS Key Inventory Studio ([mis-keys.html](file:///c:/Users/andre/Downloads/LabSync/mis-keys.html)) tracks key lifecycles (*ACTIVE* / *MISSING*), with calibrated dual-sided keychain insert printing (1.14" x 1.84") embedding cryptographic lookup QR codes. |
| **Single-key hoarding & multi-room conflicts** | Strict single-key borrowing ceiling enforced system-wide. Instructors requiring a second room or advance booking must submit formal requests via the Multi-Key Authorization & Reservation Workflow ([services/keyAuthorizationService.js](file:///c:/Users/andre/Downloads/LabSync/services/keyAuthorizationService.js)), approved directly by the IT Department Head. |
| **Overdue keys & unreturned locks** | Automated Key Return Reminder Service ([services/keyReminderService.js](file:///c:/Users/andre/Downloads/LabSync/services/keyReminderService.js)) checks every minute in `Asia/Manila` time. If a class slot ends and 15 minutes elapse without key dock insertion, an urgent return reminder email is automatically dispatched to the active key holder. |
| **Administrative audit report generation** | Built-in PDF Report Generator ([services/roomStatusReportService.js](file:///c:/Users/andre/Downloads/LabSync/services/roomStatusReportService.js)) enables Department Heads to export publication-grade, official BulSU-branded activity audit logs filtered by date presets or custom ranges. |
| **OJT Accountability** | Dedicated OJT role with bounded lifecycle dates ([mis-ojt.html](file:///c:/Users/andre/Downloads/LabSync/mis-ojt.html)). Interns can resolve tickets, but accounts soft-deactivate upon contract conclusion without deleting records, preserving repair attribution (`Resolved_By_User_ID`). |
| **Database bloating from sensor logs** | Automated 1-Year Retention Pruner ([services/activityRetentionService.js](file:///c:/Users/andre/Downloads/LabSync/services/activityRetentionService.js)) cleans up historical `occupancy_log` entries older than 365 days using an indexed access time column. |

---

## 2. Technology Stack

### Backend Infrastructure
| Technology | Version / Specification | Architectural Purpose |
|---|---|---|
| **Node.js** | v18.0.0+ (Tested through v24) | High-performance asynchronous JavaScript runtime |
| **Express** | ^5.2.1 | Modern web routing framework and REST API foundation |
| **MySQL2** | ^3.22.3 | Connection pooling, prepared statements, and transactional commit/rollback helpers |
| **Bcrypt** | ^6.0.0 | Cryptographic password hashing utilizing 12 salt rounds (`BCRYPT_SALT_ROUNDS = 12`) |
| **express-session** | ^1.19.0 | Server-side cookie sessions with 24-hour lifetime and strict inactivity timeout controls |
| **Helmet** | ^8.3.0 | Comprehensive HTTP security header protection (CSP, X-Frame-Options, HSTS, Permissions-Policy) |
| **express-rate-limit** | ^8.7.0 | Multi-tier brute-force mitigation for authentication, recovery, and public ticket endpoints |
| **PDFKit** | ^0.20.2 | Server-side vector PDF generation for official institutional Room Status audit logs |
| **QRCode** | ^1.5.4 | Server-side cryptographic QR code data URL generation for workstation labels and keychain tags |
| **Nodemailer** | ^9.0.6 | Transactional email delivery (Welcome, Password Reset, Email Verification, Key Authorizations, Return Reminders) |
| **dotenv** | ^17.4.2 | Environment variable injection from local `.env` configuration |
| **CORS** | ^2.8.6 | Origin allowlist validation and cross-origin resource access control |

### Frontend Architecture
| Technology | Specification | Architectural Purpose |
|---|---|---|
| **Vanilla HTML5** | Semantic standard | 24 approved HTML page templates with strict default-deny server allowlisting |
| **Vanilla CSS3** | Custom token system | Modular CSS variables (`variables.css`), CSS grid/flexbox, container queries, dark mode, high contrast |
| **Vanilla JavaScript** | Modular ES6+ / CommonJS | Service-oriented architecture, page coordinators, reactive UI components, collision mathematics |
| **Lucide Icons** | CDN distribution | Consistent SVG vector iconography across dashboards, navigation bars, and buttons |
| **Google Fonts** | Poppins & Plus Jakarta Sans | University typography pairing (Poppins for headings; Plus Jakarta Sans for UI and tables) |
| **html2canvas** | CDN distribution | Client-side visual wallpaper and schedule grid rasterization |
| **SheetJS (xlsx)** | CDN distribution | Client-side Excel/CSV curriculum syllabus parsing |

### IoT & Physical Hardware
| Component | Specification | Hardware Responsibility |
|---|---|---|
| **ESP32 Dev Module** | 30-pin Dual Core | Microcontroller controller, Wi-Fi HTTP client, and sensor interface |
| **GM65 Barcode Scanner** | UART (9600 baud) | Optical CMOS QR reader for faculty badge scans (`LABSYNC-USER-*`) |
| **ADC Key Divider Slots** | D32 (10kΩ) / D33 (0Ω) | Resistor-divider analog sensing identifying physical key presence per slot |
| **16x2 I2C LCD** | Address `0x27` (SDA 21 / SCL 22) | Real-time visual feedback on badge scans, slot unlocks, and key presence |
| **Piezoelectric Buzzer** | Active Low (GPIO 25) | Audible alerts for successful badge scans, wrong-slot insertions, and unauthorized removals |
| **Firmware Sketch** | [LabSync_ESP32.ino](file:///c:/Users/andre/Downloads/LabSync/LabSync_ESP32.ino) | C++ firmware using `HTTPClient`, `ArduinoJson`, and Bearer token security |

---

## 3. File & Folder Structure

```
LabSync/
├── server.js                                   # Express bootstrap & HTTP server entry point
├── package.json                                # Project dependencies, metadata & npm scripts
├── labsync.sql                                 # Baseline MySQL schema initialization dump
├── LabSync_ESP32.ino                           # ESP32 microcontroller C++ firmware sketch
├── style.css                                   # Global theme stylesheet & backwards-compatible imports
│
├── config/                                     # System-wide configuration
│   └── app.config.js                           # Environment validation, session cookies, CORS policies
│
├── controllers/                                # Request handling & JSON serialization
│   ├── auth.controller.js                      # Login, logout, session check, recovery, reset
│   ├── curriculum.controller.js                # Master curriculum subject catalog
│   ├── faculty.controller.js                   # Faculty CRUD, leadership delegation, role updates
│   ├── iot.controller.js                       # IoT telemetry, heartbeats, QR badge scan validation
│   ├── key-authorization.controller.js         # Multi-key requests, Dept Head approvals, reservations
│   ├── keys.controller.js                      # Physical key inventory, QR tag issuance, mobile transfers
│   ├── labs.controller.js                      # Room CRUD, workstation units, batch PC QR generator
│   ├── maintenance.controller.js               # Maintenance tickets, status transitions, notifications
│   ├── ojt.controller.js                       # OJT intern account lifecycle & credentials
│   ├── reports.controller.js                   # Room Status Activity Log PDF report generation
│   ├── schedules.controller.js                 # Course scheduling, conflict detection, summaries
│   ├── settings.controller.js                  # Institutional signatories & server health check
│   └── users.controller.js                     # User profile, avatars, Bcrypt password updates
│
├── database/                                   # Data persistence & database migrations
│   ├── connection.js                           # mysql2 connection pool with transaction helper
│   ├── migrate.js                              # Automated SQL migration runner
│   └── migrations/                             # Version-controlled incremental migrations (001–020)
│       ├── 001_add_user_fields.sql             # User profile additions
│       ├── 002_add_laboratory_key_status.sql   # Key presence tracking
│       ├── 003_add_schedule_fields.sql         # Timetable metadata
│       ├── 004_create_system_settings.sql      # Signatory settings table
│       ├── 005_seed_system_settings.sql        # Baseline university signatories
│       ├── 006_create_curriculum.sql           # Curriculum catalog table
│       ├── 007_add_laboratory_current_user.sql # Custody tracking column
│       ├── 008_add_laboratory_last_seen.sql    # IoT telemetry heartbeat timestamp
│       ├── 009_expand_subject_name.sql         # Subject string length expansion
│       ├── 010_create_iot_devices.sql          # Authorized ESP32 registry table
│       ├── 011_create_audit_logs.sql           # Immutable security audit trail
│       ├── 012_create_key_management_tables.sql# Physical keys and found reports
│       ├── 013_create_maintenance_issues.sql   # Relational deduplication table
│       ├── 014_add_user_updated_at.sql         # User timestamp tracking
│       ├── 014_create_key_authorization_requests.sql # Multi-key approval workflow
│       ├── 015_add_occupancy_log_access_time_index.sql # 1-year retention pruning index
│       ├── 016_add_user_lifecycle_fields.sql   # OJT duration & account status
│       ├── 017_add_maintenance_issue_resolver.sql # Authenticated ticket resolver ID
│       ├── 018_add_reservation_fields_to_key_authorization.sql # Advance booking dates
│       ├── 019_create_schedule_key_reminders.sql # Automated key reminder ledger
│       └── 020_add_retry_fields_to_schedule_key_reminders.sql # Resilient retry tracking
│
├── middleware/                                 # Express pipeline request interceptors
│   ├── auth.js                                 # Session validation, live role sync, inactivity guard
│   ├── errorHandler.js                         # Centralized JSON error response formatter
│   ├── iotAuth.js                              # Cryptographic Bearer token verification for IoT docks
│   ├── rateLimiter.js                          # Multi-tier RFC-compliant brute-force rate limiters
│   └── securityHeaders.js                      # Helmet security headers & Content-Security-Policy
│
├── repositories/                               # Parameterized SQL data access layer
│   ├── audit.repository.js                     # Immutable security audit trail queries
│   ├── curriculum.repository.js                # Curriculum subject queries
│   ├── faculty.repository.js                   # Faculty accounts and leadership queries
│   ├── iot.repository.js                       # IoT device token and heartbeat queries
│   ├── key-authorization.repository.js         # Multi-key and reservation queries
│   ├── key-reminder.repository.js              # Key return reminder ledger queries
│   ├── keys.repository.js                      # Physical key and custody queries
│   ├── laboratory.repository.js                # Laboratory rooms and PC unit queries
│   ├── maintenance.repository.js               # Deduplicated maintenance issue queries
│   ├── occupancy.repository.js                 # Activity log timeline and report data queries
│   ├── ojt.repository.js                       # OJT intern account queries
│   ├── schedule.repository.js                  # Timetable, room, and professor conflict queries
│   ├── settings.repository.js                  # Institutional signatory settings queries
│   └── user.repository.js                      # User profile, password, and session queries
│
├── routes/                                     # REST API route definitions
│   ├── index.js                                # Master aggregator, health checks & legacy bridges
│   ├── auth.routes.js                          # /api/auth/*
│   ├── curriculum.routes.js                    # /api/curriculum/*
│   ├── faculty.routes.js                       # /api/faculty/*
│   ├── iot.routes.js                           # /api/occupancy/*
│   ├── keys.routes.js                          # /api/keys/*
│   ├── labs.routes.js                          # /api/laboratories/*
│   ├── maintenance.routes.js                   # /api/reports/*
│   ├── ojt.routes.js                           # /api/ojt/*
│   ├── pcs.routes.js                           # /api/pcs/*
│   ├── schedules.routes.js                     # /api/schedules/*
│   ├── settings.routes.js                      # /api/settings/*
│   └── users.routes.js                         # /api/user/*
│
├── services/                                   # Domain business logic & external integrations
│   ├── activityRetentionService.js             # Automated 1-year occupancy log cleanup
│   ├── auditService.js                         # Sensitive data masking & audit trail persistence
│   ├── authService.js                          # Authentication, password rules, token generation
│   ├── curriculumService.js                    # Curriculum catalog import & parsing
│   ├── dbInit.js                               # Database bootstrap & auto-migration trigger
│   ├── emailService.js                         # Legacy email export adapter
│   ├── facultyService.js                       # Faculty CRUD & leadership transfers
│   ├── iotService.js                           # IoT telemetry and occupancy coordination
│   ├── keyAuthorizationService.js              # Multi-key authorization, conflict math & booking
│   ├── keyReminderService.js                   # Automated 15-minute post-class return reminder
│   ├── keysService.js                          # Key registration, QR tags & atomic transfers
│   ├── laboratoryService.js                    # Room management, PC units & QR generation
│   ├── maintenanceService.js                   # Concurrency locking & ticket deduplication
│   ├── ojtService.js                           # OJT intern lifecycle, credentials & dates
│   ├── roomStatusReportService.js              # Publication-grade PDF report engine via PDFKit
│   ├── scheduleService.js                      # Timetable CRUD & cross-room collision math
│   ├── settingsService.js                      # University signatories and system health
│   ├── usersService.js                         # Profile updates, Bcrypt hashing & avatar parsing
│   ├── email/                                  # Transactional email subsystem
│   │   ├── email.service.js                    # Nodemailer transport abstraction
│   │   └── templates/                          # HTML email templates
│   │       ├── key-authorization.js            # Approval/rejection email template
│   │       ├── key-return-reminder.js          # Overdue key return reminder template
│   │       ├── reset-password.js               # Password recovery email template
│   │       ├── verification.js                 # Email modification verification template
│   │       └── welcome.js                      # New faculty/staff credential template
│   └── iot/                                    # Specialized IoT handlers
│       └── occupancy.service.js                # Key withdrawal, return, and unauthorized removal
│
├── css/                                        # Modular CSS Design System
│   ├── variables.css                           # Design tokens, color palettes, and themes
│   ├── reset.css                               # Box-sizing, margin, padding, typography resets
│   ├── layouts.css                             # Layout wrappers, headers, sidebars
│   ├── responsive.css                          # Breakpoints (320px–1024px) & mobile navigation
│   ├── auth.css                                # Split-screen authentication & password styles
│   ├── tutorial.css                            # Spotlight tutorial walkthrough overlay
│   ├── schedule-studio.css                     # Timetable grid & wallpaper studio styles
│   └── components/                             # Granular UI component stylesheets
│       ├── activity-timeline.css               # Streamlined audit trail timeline & chips
│       ├── alerts.css                          # Status alert boxes & warnings
│       ├── badges.css                          # Status pills & condition chips
│       ├── buttons.css                         # Primary, secondary, icon, and action buttons
│       ├── cards.css                           # Generic card containers & headers
│       ├── datepicker.css                      # Custom calendar dropdown picker
│       ├── dropdowns.css                       # Context menus, select wrappers, filters
│       ├── empty-states.css                    # Zero-data visual placeholders & icons
│       ├── faculty-cards.css                   # Faculty directory cards & modals
│       ├── forms.css                           # Inputs, labels, textareas, validations
│       ├── header.css                          # Top navigation header & user profile chip
│       ├── help-cards.css                      # Contextual help modals & hotkey guides
│       ├── key-authorization.css               # Key request queue & approval badges
│       ├── key-transfer.css                    # Mobile transfer cards & step indicator
│       ├── lab-cards.css                       # Room status availability cards & indicators
│       ├── modals.css                          # Dialog overlays, backdrops, transitions
│       ├── notifications.css                   # Notification bell panel & badges
│       ├── qr-cards.css                        # Workstation & key QR label cards
│       ├── report-cards.css                    # Maintenance ticket cards & remarks pills
│       ├── schedule-cards.css                  # Timetable blocks & day column headers
│       ├── settings-tabs.css                   # Signatory and configuration tabs
│       ├── sidebar.css                         # Collapsible desktop sidebar navigation
│       ├── stat-cards.css                      # Dashboard numerical metric cards
│       └── tables.css                          # Data tables, headers, rows, zebra stripes
│
├── js/                                         # Modular Frontend JavaScript
│   ├── auth-check.js                           # Anti-flash session & role guard in <head>
│   ├── core/                                   # Core lifecycle modules
│   │   ├── accessibility.js                    # Contrast toggles & font scaling
│   │   ├── app.js                              # Global frontend bootstrap
│   │   ├── clock.js                            # Header digital clock synchronization
│   │   └── tutorial-launcher.js                # Role-specific introductory tours
│   ├── components/                             # Reusable UI component modules
│   │   ├── custom-select.js                    # Custom dropdown replacement
│   │   ├── datepicker.js                       # Institutional datepicker component
│   │   ├── dept-head-key-authorizations.js     # Department Head key request queue component
│   │   ├── notifications.js                    # Real-time notification drawer handler
│   │   ├── section-combobox.js                 # Searchable academic section selector
│   │   ├── toast.js                            # Floating feedback notification banners
│   │   └── profile/                            # User profile and account modals
│   │       ├── account-modal.js                # Profile edit & avatar modal
│   │       ├── help-modal.js                   # Role-specific guide & hotkeys
│   │       ├── password-modal.js               # Password change modal
│   │       └── profile-dropdown.js             # User chip menu & theme switcher
│   ├── pages/                                  # Page-level coordinators
│   │   ├── faculty-management.js               # Faculty directory CRUD coordinator
│   │   ├── it-head-dashboard.js                # IT Head administrative dashboard coordinator
│   │   ├── it-head-room-status.js              # IT Head live room status & PDF report coordinator
│   │   ├── key-transfer.js                     # Mobile Key Transfer & Room Claim coordinator
│   │   ├── login.js                            # Login authentication coordinator
│   │   ├── master-schedule.js                  # Master timetable coordinator
│   │   ├── mis-keys.js                         # Key inventory & 2-sided keychain print coordinator
│   │   ├── mis-maintenance.js                  # Deduplicated maintenance queue coordinator
│   │   ├── mis-ojt.js                          # OJT intern management coordinator
│   │   ├── mis-qr-generator.js                 # Workstation QR generator coordinator
│   │   ├── mis-staff-dashboard.js              # MIS Staff technical dashboard coordinator
│   │   ├── print-all-schedules.js              # Bulk print layout coordinator
│   │   ├── print-schedule.js                   # Single room print layout coordinator
│   │   ├── reset-password.js                   # Password reset coordinator
│   │   ├── room-status.js                      # Faculty room availability coordinator
│   │   └── submit-pc-report.js                 # Public student fault reporting controller
│   ├── scheduling/                             # Timetable & scheduling subsystem
│   │   ├── colors.js                           # Subject color palette assignment
│   │   ├── conflicts.js                        # Collision detection math engine
│   │   ├── dragdrop.js                         # Desktop drag-and-drop coordinator
│   │   ├── mobile-editor.js                    # Mobile-optimized timetable editor coordinator
│   │   ├── interactions/tap-to-place.js        # Mobile touch tap-to-place scheduler
│   │   ├── interactions/touch-drag.js          # Touch drag-and-drop polyfill
│   │   ├── rendering/ghost-schedule.renderer.js# Cross-room professor overlay renderer
│   │   └── rendering/schedule-card.renderer.js # Timetable block renderer
│   ├── reports/                                # Maintenance reporting subsystem
│   │   ├── report.controller.js                # Ticket filtering and search coordinator
│   │   ├── report.modal.js                     # Full ticket details modal coordinator
│   │   └── report.renderer.js                  # Deduplicated ticket table renderer
│   ├── services/                               # Client-side API abstraction services
│   │   ├── curriculum.service.js               # /api/curriculum HTTP client
│   │   ├── faculty.service.js                  # /api/faculty HTTP client
│   │   ├── keys.service.js                     # /api/keys HTTP client
│   │   ├── laboratory.service.js               # /api/laboratories HTTP client
│   │   ├── notification.service.js             # /api/notifications HTTP client
│   │   ├── report.service.js                   # /api/reports HTTP client
│   │   ├── schedule.service.js                 # /api/schedules HTTP client
│   │   ├── session.service.js                  # Session heartbeat & activity client
│   │   ├── settings.service.js                 # /api/settings HTTP client
│   │   └── user.service.js                     # /api/user HTTP client
│   └── utils/                                  # Shared frontend utilities
│       ├── academic-term.js                    # Academic year and semester calculator
│       ├── core-utils.js                       # String, number, and debounce helpers
│       ├── dom-utils.js                        # Safe DOM creation and escaping
│       └── time-utils.js                       # 12h/24h time formatting and parsing
│
├── assets/                                     # Static images, official logos, brand icons
└── docs/                                       # Project documentation
    ├── SYSTEM_DOCUMENTATION.md                 # Full technical system manual (this document)
    ├── hardware/                               # IoT schematics and wiring guides
    └── releases/                               # Release changelogs
```

---

## 4. User Roles & Access Control

LabSync enforces strict server-side role-based access control (RBAC) across **4 authenticated roles** and **1 public path**:

| Role Identity | Primary Landing Page | Key Capabilities & Authorization Bounds |
|---|---|---|
| **IT Department Head** | [it-head-dashboard.html](file:///c:/Users/andre/Downloads/LabSync/it-head-dashboard.html) | **Supreme Administrative Authority**: Master schedule management, Schedule Studio, faculty CRUD, role modifications, leadership delegation, curriculum imports, institutional signatory settings, Multi-Key Request approval queue, and publication-grade Room Status PDF report generation. |
| **MIS Staff** | [mis-staff-dashboard.html](file:///c:/Users/andre/Downloads/LabSync/mis-staff-dashboard.html) | **Technical & Custodial Administration**: Maintenance ticket tracker, ticket status resolution, PC workstation QR generation, physical key cataloging ([mis-keys.html](file:///c:/Users/andre/Downloads/LabSync/mis-keys.html)), dual-sided keychain insert printing, and OJT Intern account lifecycle management ([mis-ojt.html](file:///c:/Users/andre/Downloads/LabSync/mis-ojt.html)). |
| **OJT Intern** | [mis-maintenance.html](file:///c:/Users/andre/Downloads/LabSync/mis-maintenance.html) | **Restricted Technical Support**: Can inspect maintenance queue, participate in hardware repairs, and mark tickets *Resolved* (attributing their user ID via `Resolved_By_User_ID`). Strictly prevented from modifying faculty, keys, OJT accounts, schedules, or system settings. Accounts auto-deactivate after `OJT_End_Date`. |
| **Faculty / Professor** | [index.html](file:///c:/Users/andre/Downloads/LabSync/index.html) | **Instructional Access**: Live room availability monitor ([room-status.html](file:///c:/Users/andre/Downloads/LabSync/room-status.html)), personal weekly timetable ([my-schedule.html](file:///c:/Users/andre/Downloads/LabSync/my-schedule.html)), PC fault reporting status, mobile Key Transfer & Room Claim ([key-transfer.html](file:///c:/Users/andre/Downloads/LabSync/key-transfer.html)), and Multi-Key / Room Advance Reservation submissions. |
| **Student / Public** *(No Auth)* | [submit-pc-report.html](file:///c:/Users/andre/Downloads/LabSync/submit-pc-report.html) | **Unauthenticated Workstation Access**: Students scan physical QR stickers affixed to laboratory workstations to submit hardware/software fault reports directly into the deduplicated queue. Can also view terms ([terms.html](file:///c:/Users/andre/Downloads/LabSync/terms.html)) and report found keys ([key-found.html](file:///c:/Users/andre/Downloads/LabSync/key-found.html)). |

### Live Role Synchronization & Revocation Guard
Unlike typical session models that read stale roles from cookies, LabSync's [`requireRole`](file:///c:/Users/andre/Downloads/LabSync/middleware/auth.js#L65) middleware queries the authoritative `users` table on **every single protected request**:
1. Checks `user.Status`: If set to `DEACTIVATED`, immediately destroys the session cookie and returns HTTP `401 Unauthorized` (`ACCOUNT_DEACTIVATED`).
2. Checks `user.Role === 'OJT'`: If current date exceeds `user.OJT_End_Date`, destroys the session and returns HTTP `401 Unauthorized` (`OJT_EXPIRED`).
3. Checks Role Alignment: If the user's role was changed in the database by an administrator (e.g. demoted from IT Head to Faculty), the session role is instantly synchronized. If the user attempts an operation forbidden under the new role, the request is blocked immediately with HTTP `403 Forbidden` (`ROLE_REVOKED`).

---

## 5. Pages & Application Architecture

The web application is structured across **24 approved HTML pages** allowlisted in [server.js](file:///c:/Users/andre/Downloads/LabSync/server.js#L83).

### 5.1 Public & Student Workstation Interaction

#### `submit-pc-report.html` — Public PC Fault Reporting Form
- **Authentication:** Public (No login required).
- **Trigger:** Students scan a physical QR code label on a computer casing using a mobile camera.
- **Parameters:** Parses `?room=203&pc=01` from the URL, automatically locking the target room and PC unit.
- **Deduplication:** Submissions hit `POST /api/reports/submit`. If a defect for that component (e.g. Mouse) on that workstation is already open in `maintenance_issues`, the student's submission is appended as an additional corroborating report without creating a duplicate ticket.
- **Validation:** Enforces 60-character maximum on student name, strict section format, and 200-character cap on issue remarks.

#### `key-found.html` — Key Found Redirection
- **Authentication:** Public.
- **Function:** Scanned by finders who discover a lost room key. Automatically bridges to `key-transfer.html?key=...` for custody recovery.

---

### 5.2 Faculty / Professor Features

#### `index.html` — Faculty Dashboard
- Summary stat metrics: Active Laboratory Rooms, Pending PC Reports, and Classes Scheduled Today.
- Live room availability card grid with dynamic state badges.
- **Multi-Key Authorization Status Banner:** Shows real-time status of pending, approved, or rejected key borrow requests.

#### `room-status.html` — Laboratory Room Availability
- Displays color-coded real-time availability cards:
  - **Available** (Green) — Physical key is resting in the IoT dock slot.
  - **In Session** (Red / Indigo) — Key withdrawn by the instructor assigned to the active schedule slot.
  - **Borrowed** (Orange) — Key withdrawn by another authorized professor or during an unscheduled slot.
- **Activity Log Timeline:** Shows live stream of badge scans, key withdrawals, key returns, and mobile transfers.

#### `my-schedule.html` — Personal Faculty Timetable
- Responsive 6-day timetable grid (Monday–Saturday) rendered in [js/faculty-schedule/faculty-schedule.renderer.js](file:///c:/Users/andre/Downloads/LabSync/js/faculty-schedule/faculty-schedule.renderer.js).
- Filterable by Academic Year and Semester via [js/utils/academic-term.js](file:///c:/Users/andre/Downloads/LabSync/js/utils/academic-term.js).
- **Subject Filter Dropdown:** Dedicated compact filter with single-subject isolation and dimming.
- **Wallpaper Export:** High-resolution image export via `html2canvas`.

#### `faculty-pc-reports.html` — Workstation Defect Tracker
- Allows faculty members to review hardware issues submitted by students for computers in their assigned classrooms.

---

### 5.3 IT Department Head Features

#### `it-head-dashboard.html` — Administrative Command Center
- Live digital clock, department-wide statistics, and administrative shortcut tiles.
- **Pending Key Authorization Requests Card:** Embedded interface ([js/components/dept-head-key-authorizations.js](file:///c:/Users/andre/Downloads/LabSync/js/components/dept-head-key-authorizations.js)) displaying pending multi-key requests with single-click **Approve** and **Reject** controls.

#### `it-head-room-status.html` — Room Status & Audit Trail Studio
- Mirrors real-time room availability while providing Department Head exclusive management features.
- **PDF Report Generator Modal:** Integrated datepicker ([js/components/datepicker.js](file:///c:/Users/andre/Downloads/LabSync/js/components/datepicker.js)) supporting preset periods (*Today*, *Yesterday*, *Today + Yesterday*) and arbitrary custom date ranges. Streams official audit PDFs directly from `/api/reports/room-status`.

#### `it-head-my-schedule.html` & `it-head-pc-reports.html`
- Context-tailored versions of the personal schedule and PC defect viewers providing consistent Department Head sidebar navigation.

#### `master-schedule.html` — Global Timetable Grid
- Matrix grid rendering all laboratory rooms side-by-side across all days and timeslots.
- Features: Add/Delete Laboratory Room modals, Excel/CSV Curriculum import, Bulk Schedule PDF Export, and University Signatory Configuration.

#### `room-schedule-editor.html` — Schedule Studio
- Interactive drag-and-drop course scheduler with automatic mathematical overlap collision detection ($\max(S_1, S_2) < \min(E_1, E_2)$).
- **Tap-to-Place Mobile Editor:** Mobile-optimized interaction mode ([js/scheduling/interactions/tap-to-place.js](file:///c:/Users/andre/Downloads/LabSync/js/scheduling/interactions/tap-to-place.js)) enabling seamless schedule editing on smartphones and tablets.
- **Ghost Overlays:** Renders translucent ghost blocks indicating when a professor is already teaching in another laboratory room.
- **Dirty State Guard:** Prompts user confirmation if navigating away with uncommitted schedule modifications.

#### `faculty-management.html` — Faculty & Staff Directory
- Comprehensive staff CRUD interface: Add instructor, assign roles (*Faculty*, *IT Dept. Head*, *MIS Staff*), generate temporary credentials, and transfer leadership.

---

### 5.4 MIS Staff Features

#### `mis-staff-dashboard.html` — Technical Support Center
- Key operational metrics: Open Tickets, Resolved Tickets, IoT Dock Connectivity, and Active Laboratories.
- Live room cards and quick links to maintenance queues and key inventory.

#### `mis-maintenance.html` — Deduplicated Maintenance Queue
- **Relational Issue Tracking:** Displays master tickets from `maintenance_issues` with aggregated reporter badges (`👤 Andrei [+2]`).
- **Ticket Details Modal (`[ 👁️ View Details ]`):** Reveals full history of all corroborating student submissions with exact timestamps, academic sections, and student remarks.
- **Resolver Attribution:** Records the authenticated user who resolved each ticket via `Resolved_By_User_ID`.
- **Automatic Health Restoration:** Automatically restores `lab_units.Condition_Status` to `Functional` once all active component defects on that workstation are resolved.

#### `mis-keys.html` — Physical Key Inventory Studio
- Catalogs physical keys (`KEY-IT-203-A`) mapped to laboratories.
- Lifecycle status toggling: `ACTIVE` vs. `MISSING`.
- **Dual-Sided Keychain Insert Generator:** Renders calibrated 1.14" x 1.84" acrylic keychain cards with QR codes and BulSU branding.

#### `mis-ojt.html` — OJT Intern Lifecycle Management
- Dedicated administration suite for OJT Interns ([js/pages/mis-ojt.js](file:///c:/Users/andre/Downloads/LabSync/js/pages/mis-ojt.js)).
- Manages internship start and end dates (`OJT_Start_Date`, `OJT_End_Date`).
- Creates temporary credentials dispatched via welcome email.
- **Soft Deactivation:** Enables/disables accounts (`ACTIVE` / `INACTIVE` / `DEACTIVATED`) without deleting database records, preserving historical repair audit trails.

#### `mis-qr-generator.html` — Workstation QR Code Generator
- Batch generation and formatted printing of unique workstation QR cards for lab computers.

---

### 5.5 Physical Key Management & Keychain Tag Studio

The MIS Key Studio ([mis-keys.html](file:///c:/Users/andre/Downloads/LabSync/mis-keys.html)) standardizes physical key tracking:
- **Format:** Front-and-back pairs calibrated to commercial acrylic keychain inserts (**1.14 inches wide × 1.84 inches high**).
- **Front Face:** Official BulSU IT logo, Room Number, Unique Key Code (`KEY-IT-203-A`), and status chip.
- **Back Face:** High-contrast cyan QR code encoding `key-transfer.html?key=KEY_CODE`, scan instructions, and emergency contact details.

---

### 5.6 Mobile Key Transfer & Room Claim Protocol

The peer-to-peer mobile handoff workflow ([key-transfer.html](file:///c:/Users/andre/Downloads/LabSync/key-transfer.html) & [services/keysService.js](file:///c:/Users/andre/Downloads/LabSync/services/keysService.js)) allows instructors to transfer physical keys in hallways:
1. Incoming instructor scans the QR code on the physical key fob with a smartphone.
2. System validates authentication and ensures caller belongs to `KEY_TRANSFER_ROLES` (*Faculty* or *IT Dept. Head*).
3. Evaluates single-key limit: If receiving instructor already holds another physical key, transfer is blocked unless an active, approved Multi-Key Authorization exists.
4. Screen displays **Current Key Holder** vs. **Receiving Instructor** identity cards.
5. Incoming instructor taps **Confirm Key Transfer**.
6. An atomic database transaction updates `laboratories.Current_User_ID`, writes an `occupancy_log` entry (`KEY_TRANSFER`), marks any active authorization as `CLAIMED`, and records an immutable security audit event (`KEY_TRANSFERRED`).

---

### 5.7 Multi-Key Authorization & Advance Reservation Workflow

Governed by [services/keyAuthorizationService.js](file:///c:/Users/andre/Downloads/LabSync/services/keyAuthorizationService.js), this workflow eliminates unauthorized key hoarding while supporting legitimate multi-room teaching requirements:

```
[Faculty Submits Request] ➔ Status: PENDING ➔ [IT Head Queue] ➔ [Approved / Rejected]
                                                    │
                                                    ▼ (If Approved)
[Room Claim / Withdrawal] ➔ Status: CLAIMED ➔ [Key Returned to Dock] ➔ Status: COMPLETED
```

- **Single-Key Borrowing Rule:** Users may hold at most 1 room key at any time by default.
- **Advance Reservation Horizon:** Instructors can request room keys for dates up to Saturday of the following week (Monday through Saturday).
- **Time Collision Engine:** Reconciles requested reservation windows against established course schedules and existing approved reservations.
- **Absolute Ceiling:** Enforces an unbendable ceiling of **maximum 2 keys simultaneously** per instructor under all circumstances.
- **Transactional Notifications:** Automated email notifications inform faculty immediately when requests are approved or rejected.

---

### 5.8 Automatic Key Return & Transfer Reminder System

Governed by [services/keyReminderService.js](file:///c:/Users/andre/Downloads/LabSync/services/keyReminderService.js):
- **Core Business Rule:** **Scheduled End Time + 15 Minutes Grace Period = Reminder Deadline**.
- **Tick Interval:** Background cron runs every **60 seconds**, strictly evaluated in the `Asia/Manila` timezone.
- **Dynamic Recipient Resolution:** Queries `laboratories.Current_User_ID`. If Prof A transferred the key to Prof B, Prof B receives the reminder.
- **Dock Reconciliation:** If the key is placed back into the IoT dock at or before the 15-minute deadline (`Key_Status === 'Present'`), reminder dispatch is completely suppressed.
- **Duplicate Prevention & Idempotency:** Recorded in `schedule_key_reminders` with a `UNIQUE KEY (Schedule_ID, Occurrence_Date)`. Survives server restarts without duplicate spam.
- **Resilient Retry Architecture:** Supports exponential backoff and retry tracking (`Retry_Count`, `Last_Attempt_At`) in case of transient SMTP transport failures.

---

### 5.9 Room Status Activity Log PDF Reporting Engine

Governed by [services/roomStatusReportService.js](file:///c:/Users/andre/Downloads/LabSync/services/roomStatusReportService.js) and [controllers/reports.controller.js](file:///c:/Users/andre/Downloads/LabSync/controllers/reports.controller.js):
- **Access Authorization:** Exclusively restricted to the IT Department Head (`requireRole(IT_HEAD_ROLES)`).
- **Endpoint:** `GET /api/reports/room-status`.
- **Query Filters:**
  - `period`: `'today'`, `'yesterday'`, `'both'` (Today + Yesterday), or `'custom'`.
  - `startDate` & `endDate`: `YYYY-MM-DD` (required when `period=custom`).
  - `roomNumber` or `room`: `'all'`, `'203'`, `'204'`.
- **PDF Layout & Styling:**
  - Standard Letter page layout with dynamic pagination (`Page X of Y`).
  - Official BulSU Institutional letterhead and campus seal.
  - Metric summary chips: Total Events, Key Withdrawals, Returns, and Security Alerts.
  - Parameterized table layout with alternating zebra striping and event categorization.
  - Formal Signatory Block for Department Head signature.

---

### 5.10 Print & Export Layouts

- [print-schedule.html](file:///c:/Users/andre/Downloads/LabSync/print-schedule.html): Single room printable weekly schedule with official university header and dynamic signatory placeholders.
- [print-all-schedules.html](file:///c:/Users/andre/Downloads/LabSync/print-all-schedules.html): Batch paginated print engine rendering all laboratory schedules in a single document.

---

### 5.11 Institutional Policies & Legal Compliance

#### `terms.html` — Terms of Service & Privacy Policy
- Dedicated institutional policy page featuring dark/light mode toggle and dedicated print stylesheet.
- Sections: Acceptable Use Policy, Laboratory Safety Guidelines, Physical Key Custody Regulations, Account Privacy, and Data Retention Policies.
- Accessible directly from the login portal modal, navigation drawers, and footer links.

---

### 5.12 Authentication, Session Management & Account Utilities

- **Anti-Flash Auth Check ([js/auth-check.js](file:///c:/Users/andre/Downloads/LabSync/js/auth-check.js)):** Executes synchronously in the `<head>` of all protected pages, hiding `document.documentElement` until session and role verification succeeds, eliminating visual UI flashing.
- **Inactivity Timeout:** Sessions automatically invalidate after **15 minutes of inactivity** (`INACTIVITY_TIMEOUT_MS`). Users with "Remember Me" enabled are granted persistent 30-day session cookies.
- **Background Poll Exemption:** Background polling (e.g. notifications drawer) carries `x-background-poll: true`, preventing polling from keeping an inactive user logged in indefinitely.
- **Modals:**
  - `#account-settings-modal`: Updates display name, phone, and profile photo (up to 10MB base64).
  - `#change-password-modal`: Bcrypt password update with current credential verification.
  - `#help-modal`: Dynamic hotkey guide and role-tailored operating manual.
  - `#logout-modal`: Centralized confirmation modal preventing accidental session termination.

---

## 6. CSS Architecture & Design System

The styling layer follows a tokenized, modular design system in [`css/`](file:///c:/Users/andre/Downloads/LabSync/css/):

```
css/
├── variables.css           # Color tokens, typography scales, z-indexes, radii, transitions
├── reset.css               # Box-sizing, margin/padding resets
├── layouts.css             # Page grids, sidebars, headers, responsive containers
├── responsive.css          # Mobile media queries (320px, 480px, 768px, 1024px) & bottom nav
├── auth.css                # Split-screen auth layout, card containers, recovery inputs
├── tutorial.css            # Spotlight overlay and guided tour tooltips
├── schedule-studio.css     # Timetable grid layout, tray cards, canvas previews
└── components/             # 25 component stylesheets (cards, modals, badges, tables, etc.)
```

### Color Palette Tokens
| Variable | Hex Code | Purpose |
|---|---|---|
| `--primary-teal` | `#0d9488` / `#1EBBD7` | Primary institutional brand and action elements |
| `--primary-teal-dark`| `#0f766e` / `#0EA5C9` | Hover states and high-contrast accents |
| `--text-dark` | `#0F172A` | Standard body typography |
| `--status-available` | `#10B981` (Emerald) | Available rooms and active keys |
| `--status-insession` | `#6366F1` (Indigo) / Red | In-session rooms and scheduled classes |
| `--status-borrowed` | `#F59E0B` (Amber) | Borrowed rooms and hallway handoffs |
| `--status-danger` | `#EF4444` (Red) | Hardware faults, missing keys, and unauthorized removals |

---

## 7. Frontend JavaScript Architecture

Frontend code is structured into decoupled modules adhering to separation of concerns:

- **API Services Layer (`js/services/`):** Clean abstraction over browser `fetch` handling JSON serialization, CSRF, and error normalization (`keys.service.js`, `laboratory.service.js`, `report.service.js`, `schedule.service.js`, etc.).
- **Scheduling Engine (`js/scheduling/`):** Decomposed into state management (`schedule.state.js`), mathematical conflict validation (`conflicts.js`), collision math (`slot-math.js`), and interactions (`mouse-drag.js`, `touch-drag.js`, `tap-to-place.js`).
- **Reports Engine (`js/reports/`):** Modular report parsing (`report.parser.js`), search filtering (`report.filters.js`), and table rendering (`report.renderer.js`).
- **UI Components (`js/components/`):** Self-contained widgets such as `datepicker.js`, `custom-select.js`, `notifications.js`, `section-combobox.js`, and `toast.js`.

---

## 8. Backend Architecture & Data Flow

```
HTTP Client / ESP32 
       │
       ▼
[Helmet Security Headers] ➔ [Rate Limiter] ➔ [Session / Inactivity Guard] ➔ [Live Role Sync]
       │
       ▼
 [Express Route Matcher]
       │
       ▼
 [Domain Controller] (Input parsing & parameter validation)
       │
       ▼
 [Business Logic Service] (Deduplication, collision detection, audit triggers, email dispatch)
       │
       ▼
 [Data Repository Layer] (Parameterized SQL queries)
       │
       ▼
 [MySQL / MariaDB Connection Pool]
```

- **Controllers:** Parse request bodies, enforce schema bounds, and return standardized JSON responses.
- **Services:** Encapsulate all institutional rules, cross-table integrity, transaction boundaries, and audit logging.
- **Repositories:** Strictly encapsulate SQL execution using prepared statements (`?` parameters).

---

## 9. Database Schema & Migrations

Database Name: **`labsync`** | Storage Engine: **InnoDB** | Character Set: **`utf8mb4`**

### Active Database Entities (14 Tables)

1. **`users`**: System accounts (*Faculty*, *IT Dept. Head*, *MIS Staff*, *OJT*) with Bcrypt hashes, avatar strings, `Status`, `OJT_Start_Date`, `OJT_End_Date`, and `Updated_At`.
2. **`laboratories`**: Computer lab rooms with `Room_Number`, `Building`, `Key_Status` (*Present* / *Absent*), `Current_User_ID`, and `Last_Seen`.
3. **`laboratory_keys`**: Physical room keys (`Key_ID`, `Room_ID`, `Key_Code`, `Status`: *ACTIVE* / *MISSING*).
4. **`key_found_reports`**: Found key submissions logged by discoverers (`Key_ID`, `Found_Location`, `Found_At`, `Finder_Contact`, `Status`).
5. **`key_authorization_requests`**: Multi-key and advance room reservation ledger (`User_ID`, `Room_ID`, `Reservation_Date`, `Start_Time`, `End_Time`, `Reason`, `Status`: *PENDING*, *APPROVED*, *REJECTED*, *CLAIMED*, *EXPIRED*, *COMPLETED*).
6. **`schedule_key_reminders`**: Automated return reminder dispatch tracker (`Schedule_ID`, `Occurrence_Date`, `Recipient_User_ID`, `Status`: *CLAIMED*, *SENT*, *FAILED*, *SKIPPED*, `Retry_Count`, `Last_Attempt_At`). Enforces atomic duplicate prevention via `UNIQUE KEY (Schedule_ID, Occurrence_Date)`.
7. **`lab_units`**: Workstation computers with `PC_Number`, `PC_QR_String`, and `Condition_Status` (*Functional* / *Under Maintenance*).
8. **`maintenance_issues`**: Master defect deduplication entity with stored generated column `Active_Issue_Key = IF(Status != 'Resolved', CONCAT(PC_ID, ':', Issue_Type), NULL)`, `Resolved_At`, and `Resolved_By_User_ID`.
9. **`maintenance`**: Individual student defect submissions linked via `Maintenance_Issue_ID`.
10. **`schedules`**: Timetable class blocks mapped to faculty, room, day, time range, academic year, semester, and color theme.
11. **`occupancy_log`**: Room entry and sensor audit trail (*QR Code*, *Key Taken*, *Key Returned*, *KEY_TRANSFER*, *UNAUTHORIZED_REMOVAL*). Indexed on `Access_Time` for fast 1-year retention pruning.
12. **`audit_logs`**: Immutable security audit trail tracking authentication, password updates, key transfers, and admin actions.
13. **`iot_devices`**: Authorized ESP32 hardware docks with SHA-256 token hashes.
14. **`system_settings` & `curriculum`**: Key-value university signatories and curriculum catalog.

### Migration Scripts (`database/migrations/`)
- `001`–`009`: Baseline schema setup and subject length expansion.
- `010_create_iot_devices.sql`: Registered hardware device table.
- `011_create_audit_logs.sql`: Security audit logging table.
- `012_create_key_management_tables.sql`: Physical keys and found reports tables.
- `013_create_maintenance_issues.sql`: Deduplication entity and backfill linking.
- `014_add_user_updated_at.sql`: User profile update timestamp.
- `014_create_key_authorization_requests.sql`: Multi-key approval workflow table.
- `015_add_occupancy_log_access_time_index.sql`: Index on `occupancy_log(Access_Time)`.
- `016_add_user_lifecycle_fields.sql`: User status and OJT internship duration.
- `017_add_maintenance_issue_resolver.sql`: Foreign key attributing authenticated ticket resolver.
- `018_add_reservation_fields_to_key_authorization.sql`: Reservation date and time window columns.
- `019_create_schedule_key_reminders.sql`: Automated key reminder ledger.
- `020_add_retry_fields_to_schedule_key_reminders.sql`: Resilient retry tracking fields.

---

## 10. REST API Specifications

All endpoints are mounted under `/api`.

### Authentication (`/api/auth`)
- `POST /api/auth/login`: Authenticates credentials and starts session (Rate limited: 10 req / 15 min).
- `POST /api/auth/logout`: Destroys session and clears cookie.
- `GET /api/auth/check`: Returns authenticated user state and role.
- `POST /api/auth/recover-password`: Sends password recovery link (Rate limited: 5 req / 15 min).
- `GET /api/auth/validate-reset-token`: Verifies password reset token.
- `POST /api/auth/reset-password`: Sets new password with Bcrypt hashing.

### Key Management & Authorization (`/api/keys`)
- `GET /api/keys/transfer-info/:keyCode`: Looks up key, room, and holder for mobile transfer.
- `POST /api/keys/transfer`: Executes physical key handoff (Faculty & IT Head only).
- `POST /api/keys/request-additional`: Submits multi-key borrow / advance reservation request.
- `GET /api/keys/my-request-status`: Checks status of user's active key requests.
- `GET /api/keys/pending-requests`: Returns pending requests queue (IT Dept Head only).
- `POST /api/keys/requests/:requestId/approve`: Approves multi-key request (IT Dept Head only).
- `POST /api/keys/requests/:requestId/reject`: Rejects multi-key request (IT Dept Head only).
- `POST /api/keys/requests/:requestId/cancel`: Cancels pending key reservation.
- `GET /api/keys/room-availability`: Checks room reservation availability for date/time window.
- `GET /api/keys`: Lists all physical keys in inventory (MIS Staff only).
- `POST /api/keys`: Registers a new physical room key (MIS Staff only).
- `GET /api/keys/:keyId/tag`: Generates printable 2-sided keychain insert (MIS Staff only).
- `PUT /api/keys/:keyId/missing`: Flags key status as `MISSING` (MIS Staff only).
- `PUT /api/keys/:keyId/active`: Restores key status to `ACTIVE` (MIS Staff only).

### Workstation Fault Reporting & Maintenance (`/api/reports`)
- `GET /api/reports/room-status`: Generates official Room Status PDF Report (IT Dept Head only).
- `POST /api/reports/submit`: Public student fault submission with automatic deduplication.
- `GET /api/reports/pc-info`: Looks up workstation details for pre-filling reports.
- `GET /api/reports`: Lists deduplicated active and resolved issues.
- `PUT /api/reports/:reportId/status`: Updates issue status (*Pending* → *Resolved*) with resolver attribution.
- `DELETE /api/reports/:reportId`: Deletes a resolved maintenance ticket (Admin only).

### OJT Intern Management (`/api/ojt`)
- `GET /api/ojt`: Lists all OJT accounts filterable by status (MIS Staff only).
- `POST /api/ojt`: Creates new OJT account with temporary credentials (MIS Staff only).
- `GET /api/ojt/:userId`: Fetches single OJT intern details (MIS Staff only).
- `PUT /api/ojt/:userId`: Updates OJT name, email, or internship dates (MIS Staff only).
- `PUT /api/ojt/:userId/status`: Toggles OJT status (`ACTIVE` / `INACTIVE` / `DEACTIVATED`) (MIS Staff only).
- `POST /api/ojt/:userId/reset-password`: Resets OJT password with temporary credentials (MIS Staff only).

### User Profile (`/api/user`)
- `GET /api/user/current`: Returns authenticated user profile.
- `PUT /api/user/update`: Updates name, phone, or avatar photo (supports 10MB base64).
- `POST /api/user/change-password`: Updates password with current credential validation.
- `GET /api/user/verify-email`: Verifies token for email address updates.

### Laboratory & Workstations (`/api/laboratories`, `/api/pcs`)
- `GET /api/laboratories`: Lists all lab rooms with availability and key status.
- `POST /api/laboratories/add`: Adds a new laboratory room (IT Head only).
- `PUT /api/laboratories/:roomId`: Modifies laboratory metadata (IT Head only).
- `DELETE /api/laboratories/:roomId`: Deletes a laboratory room (IT Head only).
- `GET /api/laboratories/:roomId/pcs`: Lists all workstation PCs in a room.
- `POST /api/laboratories/:roomId/pcs/add`: Adds a single PC unit (MIS Staff only).
- `POST /api/laboratories/:roomId/pcs/add-bulk`: Adds multiple PC units in batch (MIS Staff only).
- `DELETE /api/laboratories/:roomId/pcs/bulk`: Batch deletes PC units (MIS Staff only).
- `GET /api/laboratories/:roomId/pcs/qrcodes`: Generates printable workstation QR cards (MIS Staff only).
- `DELETE /api/pcs/:pcId`: Deletes a single PC unit (MIS Staff only).
- `GET /api/pcs/:pcId/qrcode`: Generates single PC QR sticker (MIS Staff only).

### Course Schedules (`/api/schedules`)
- `POST /api/schedules/save`: Saves schedule grid with collision validation (IT Head only).
- `GET /api/schedules/check-professor-conflict`: Checks cross-room instructor overlap.
- `GET /api/schedules/professor`: Returns classes for authenticated professor.
- `GET /api/schedules/room/:roomNumber`: Returns schedule for a specific lab room.

### IoT Hardware Endpoints (`/api/occupancy`)
- `POST /api/occupancy/log`: Records hardware badge scans and key presence events.
- `POST /api/occupancy/heartbeat`: 5-second device telemetry ping.
- `GET /api/occupancy/heartbeat`: Lightweight ping liveness check.

### System Health & Monitoring
- `GET /api/health`: Unauthenticated server liveness probe (Railway / Docker healthcheck).
- `GET /api/health/db`: Database connection readiness check.

---

## 11. Security, Cryptography & Rate Limiting

- **Password Cryptography:** Passwords hashed using `bcrypt` with **12 salt rounds**.
- **HTTP Security Headers ([middleware/securityHeaders.js](file:///c:/Users/andre/Downloads/LabSync/middleware/securityHeaders.js)):**
  - Content-Security-Policy (CSP) locked strictly to local assets and trusted CDNs (Lucide, Google Fonts, SheetJS, html2canvas).
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - Strict-Transport-Security (HSTS) with 180-day max-age in production.
- **Session Security:** Cookie sessions configured with `httpOnly: true`, `sameSite: 'lax'`, and dynamic `secure: true` in production behind reverse proxies (`trust proxy: 1`).
- **IoT Authentication ([middleware/iotAuth.js](file:///c:/Users/andre/Downloads/LabSync/middleware/iotAuth.js)):** Microcontrollers authenticate via Bearer token or `X-Device-Token` header, validated against SHA-256 hashes in `iot_devices`.
- **Brute-Force Rate Limiting ([middleware/rateLimiter.js](file:///c:/Users/andre/Downloads/LabSync/middleware/rateLimiter.js)):**
  - Login attempts: Capped at 10 requests per 15 minutes.
  - Password recovery: Capped at 5 requests per 15 minutes.
  - Public fault reports: Capped at 15 submissions per 15 minutes per IP.
- **SQL Injection Defense:** 100% of database queries utilize parameterized prepared statements.

---

## 12. Security Audit Logging System

Powered by [services/auditService.js](file:///c:/Users/andre/Downloads/LabSync/services/auditService.js) and the `audit_logs` table:
- **Logged Events:** `LOGIN`, `LOGIN_FAILED`, `PASSWORD_CHANGE`, `KEY_CREATED`, `KEY_MARKED_MISSING`, `KEY_REACTIVATED`, `KEY_TRANSFERRED`, `KEY_AUTH_REQUESTED`, `KEY_AUTH_APPROVED`, `KEY_AUTH_REJECTED`, `KEY_REMINDER_SENT`, `UNAUTHORIZED_KEY_REMOVAL`, `OJT_CREATED`, `OJT_STATUS_UPDATED`, `TICKET_RESOLVED`, `GENERATE_ROOM_STATUS_REPORT`.
- **Sensitive Data Masking:** Automatically purges all plaintext passwords, password hashes, reset tokens, and session secrets before writing to the database.

---

## 13. IoT Hardware & Telemetry Integration

- **Microcontroller:** ESP32 Dev Module running firmware [LabSync_ESP32.ino](file:///c:/Users/andre/Downloads/LabSync/LabSync_ESP32.ino).
- **Key Detection:** Resistor-divider sensing on analog pins `D32` (Room 203, 10kΩ) and `D33` (Room 204, 0Ω).
- **Wrong-Slot & Unauthorized Removal Alarm:** Hardware buzzer sounds an urgent pulsed alert if a key is placed in the incorrect dock slot or removed without optical badge authorization.
- **Heartbeat & Telemetry:** 5-second HTTP heartbeat ping dispatched to `/api/occupancy/heartbeat`. Web UI displays an **Offline** badge if no heartbeat is received for >15 seconds.
- **Socket Optimization:** Server sends `Connection: close` on all `/api/occupancy/*` responses to ensure the ESP32 lwIP stack closes TCP sockets cleanly without socket table exhaustion.

---

## 14. Activity Log Data Retention Policy

Governed by [services/activityRetentionService.js](file:///c:/Users/andre/Downloads/LabSync/services/activityRetentionService.js):
- **Policy:** Room Status activity logs in `occupancy_log` are retained for exactly **one calendar year (365 days)**.
- **Execution:** Automated daily cleanup schedule deletes records older than 365 days.
- **Indexing:** Fast, low-overhead deletion powered by an index on `occupancy_log(Access_Time)` (Migration `015`).
- **Data Isolation:** Pruning affects only `occupancy_log`. System security audit logs in `audit_logs` are preserved indefinitely.

---

## 15. Transactional Email System

Powered by **Nodemailer** with modular HTML email templates in [`services/email/templates/`](file:///c:/Users/andre/Downloads/LabSync/services/email/templates/):
- **Welcome Email (`welcome.js`):** Dispatched upon faculty/OJT onboarding with temporary login credentials.
- **Password Reset (`reset-password.js`):** Dispatched with a secure cryptographic reset token link.
- **Email Verification (`verification.js`):** Dispatched when modifying an account email address.
- **Key Authorization Notification (`key-authorization.js`):** Informs faculty immediately when their multi-key reservation request has been approved or rejected by the Department Head.
- **Key Return Reminder (`key-return-reminder.js`):** Urgently reminds the active key holder to return or transfer the room key after the 15-minute grace period has elapsed.

---

## 16. Automated Testing & Quality Assurance

The codebase includes an extensive automated test suite run via Node.js native test runner:

```bash
npm test
```

### Key Automated Test Suites (`tests/`)
- `test-room-status-report.js`: Full verification of PDF report generation, RBAC authorization, custom date ranges, and SQL injection safety.
- `test-multi-key-approval-workflow.js`: Verifies multi-key request submissions, Department Head queue, approval windows, 2-key limits, and status transitions.
- `test-key-return-reminder.js`: 18 test scenarios verifying the 15-minute grace period, Asia/Manila timezone calculations, dock return suppression, and SMTP retry resilience.
- `test-retention.js`: Verifies 1-year cutoff calculations and isolated purging of `occupancy_log`.
- `test-iot-security-events.js` & `test-iot-auth.js`: Verifies unauthorized key removal detection, wrong-slot buzzer triggers, and SHA-256 Bearer token authentication.
- `test-live-role-sync.js`: Verifies immediate database-level role revocation on protected operations.
- `test-ojt-action-buttons.js` & `test-ojt-mobile-view.js`: Verifies OJT intern CRUD operations, date validity, and UI action styling.

---

## 17. Environment Configuration

Create a `.env` file in the project root:

```env
# Database Credentials
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_database_password
DB_NAME=labsync
DB_PORT=3306

# Server & Session Settings
PORT=3000
APP_URL=http://localhost:3000
SESSION_SECRET=your_cryptographically_random_session_secret
ENFORCE_IOT_AUTH=false

# Transactional SMTP Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_institution_email@gmail.com
EMAIL_PASS=your_gmail_app_password
```

---

## 18. Installation & Deployment

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/slushiiplayz13-ctrl/Labsync-BULSU-Sarmiento-.git
cd Labsync
npm install
```

### 2. Initialize Database & Run Migrations
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS labsync CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p labsync < labsync.sql
node database/migrate.js
```

### 3. Launch the Application
```bash
# Production Mode
npm start

# Development Mode with Live Watch
npm run dev
```

### 4. Access the Web Application
Open your browser and navigate to:
```
http://localhost:3000/login.html
```

---
*Maintained for the Faculty of Information Technology, Bulacan State University – Sarmiento Campus.*
