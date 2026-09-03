# LabSync — Full Code Architecture Refactor Report

**Project:** LabSync (Bulacan State University – Sarmiento Campus)  
**Branch:** `main` (Merged & Validated Baseline)  
**Date:** September 2026  
**Status:** Completed, Refactored & Validated (Version 1.2.0)  

---

## 1. Executive Summary

A comprehensive, strangler-pattern architectural refactor was performed across the entire LabSync codebase. The primary objective was to eliminate "god files", eliminate duplicated logic (such as conflict detection, time formatting, report parsing, and modal state management), decouple global state into structured module stores/services, and establish an enterprise-grade modular architecture while preserving **100% of existing visual styling, UI interactions, and public JavaScript APIs**.

Following the initial frontend and scheduling engine decomposition, **Phase 2 Refactoring** successfully integrated:
1. **Physical Key Management & Keychain Tag Studio (`mis-keys.html`)**: Custodial key tracking with status toggles (`ACTIVE` / `MISSING`) and calibrated 1.14" x 1.84" two-sided printable keychain inserts.
2. **Mobile Key Transfer & Room Claim Protocol (`key-transfer.html`)**: Mobile peer-to-peer room handoff allowing faculty to scan physical key QR fobs and claim custody directly in hallways.
3. **Relational Issue Deduplication Engine (`maintenance_issues`)**: High-concurrency transaction locking with virtual stored unique column `Active_Issue_Key = CONCAT(PC_ID, ':', Issue_Type)`, grouping multiple student reports under single maintenance tickets with `👤 Name [+N]` chips.
4. **Enterprise Cryptography & Security Auditing**: Bcrypt password hashing (12 salt rounds), immutable audit trail (`audit_logs` & `auditService.js`) with sensitive data redaction, and multi-tier RFC-compliant rate limiters.
5. **E-Signature Deprecation & UI Streamlining**: Clean removal of legacy e-signature modal canvas in favor of direct digital administration.

---

## 2. Final Architecture Tree

```
LabSync/
├── config/                          # Database connection and environment config
│   └── app.config.js
├── controllers/                     # Express route request handlers
│   ├── auth.controller.js
│   ├── curriculum.controller.js
│   ├── faculty.controller.js
│   ├── iot.controller.js
│   ├── keys.controller.js           # [NEW] Physical key inventory & transfer controller
│   ├── labs.controller.js
│   ├── maintenance.controller.js
│   ├── schedules.controller.js
│   ├── settings.controller.js
│   └── users.controller.js          # Updated with bcrypt password hashing & change-password
├── database/                        # Database connection & migration runner
│   ├── connection.js
│   ├── migrate.js
│   └── migrations/                  # Incremental SQL migration scripts (001–014)
│       ├── 010_create_iot_devices.sql
│       ├── 011_create_audit_logs.sql
│       ├── 012_create_key_management_tables.sql
│       ├── 013_create_maintenance_issues.sql
│       └── 014_add_user_updated_at.sql
├── middleware/                      # Authentication, rate limiting & error guards
│   ├── auth.js                      # requireAuth, requireRole, KEY_TRANSFER_ROLES
│   ├── errorHandler.js
│   └── rateLimiter.js               # [NEW] Multi-tier RFC-compliant brute force limiters
├── repositories/                    # Parameterized SQL data access layer
│   ├── audit.repository.js          # [NEW] Immutable security audit log persistence
│   ├── curriculum.repository.js
│   ├── faculty.repository.js
│   ├── iot.repository.js
│   ├── keys.repository.js           # [NEW] Key inventory & custody queries
│   ├── laboratory.repository.js
│   ├── maintenance.repository.js
│   ├── schedule.repository.js
│   ├── settings.repository.js
│   └── user.repository.js
├── routes/                          # API endpoint routing definitions
│   ├── index.js                     # Central aggregator router
│   ├── auth.routes.js
│   ├── curriculum.routes.js
│   ├── faculty.routes.js
│   ├── iot.routes.js
│   ├── keys.routes.js               # [NEW] /api/keys/* domain router
│   ├── labs.routes.js
│   ├── maintenance.routes.js
│   ├── pcs.routes.js
│   ├── schedules.routes.js
│   ├── settings.routes.js
│   └── users.routes.js
├── services/                        # Backend business logic services
│   ├── auditService.js              # [NEW] Centralized non-blocking security audit logger
│   ├── authService.js
│   ├── curriculumService.js
│   ├── emailService.js
│   ├── facultyService.js
│   ├── iotService.js
│   ├── keysService.js               # [NEW] Key registration, QR tags & atomic transfers
│   ├── laboratoryService.js
│   ├── maintenanceService.js        # Deduplication & condition synchronization
│   ├── scheduleService.js
│   ├── settingsService.js
│   ├── usersService.js              # Bcrypt hashing & password validation
│   └── email/                       # Modular transactional email templates
├── js/                              # Frontend Architecture
│   ├── components/                  # Reusable UI component controllers
│   │   ├── profile/                 # Decomposed profile modal submodules
│   │   │   ├── account-modal.js
│   │   │   ├── help-modal.js
│   │   │   ├── password-modal.js
│   │   │   └── profile-dropdown.js
│   │   ├── custom-select.js
│   │   ├── faculty-card.js
│   │   ├── faculty-menu.js
│   │   ├── faculty-modal.js         # [FACADE] Delegates to js/faculty/modals/
│   │   ├── faculty-schedule-modal.js
│   │   ├── notifications.js
│   │   ├── profile-menu.js          # [FACADE] Delegates to js/components/profile/
│   │   ├── sidebar-nav.js
│   │   └── toast.js
│   ├── core/                        # Core runtime lifecycle
│   │   ├── accessibility.js
│   │   ├── app.js
│   │   ├── clock.js
│   │   └── tutorial-launcher.js
│   ├── faculty/                     # Decomposed faculty management dialogs
│   │   └── modals/
│   │       ├── add-faculty.modal.js
│   │       ├── delete-faculty.modal.js
│   │       ├── edit-role.modal.js
│   │       └── transfer-leadership.modal.js
│   ├── faculty-schedule/            # Decomposed faculty weekly timetable engine
│   │   ├── faculty-schedule.colors.js
│   │   ├── faculty-schedule.controller.js
│   │   ├── faculty-schedule.filters.js
│   │   └── faculty-schedule.renderer.js
│   ├── master-schedule/             # Decomposed master schedule subsystems
│   │   ├── curriculum/
│   │   │   └── curriculum-import.modal.js
│   │   ├── modals/
│   │   │   ├── download-schedule.modal.js
│   │   │   └── signature-settings.modal.js
│   │   ├── rooms/
│   │   │   ├── room.controller.js
│   │   │   ├── room.modal.js
│   │   │   └── room.renderer.js
│   │   └── master-schedule.controller.js
│   ├── pages/                       # Page entry point coordinators
│   │   ├── faculty-management.js
│   │   ├── key-transfer.js          # [NEW] Mobile Key Transfer & Room Claim coordinator
│   │   ├── master-schedule.js       # [FACADE] Delegates to js/master-schedule/
│   │   ├── mis-keys.js              # [NEW] Key inventory & 2-sided keychain print coordinator
│   │   ├── mis-maintenance.js       # Refactored to reuse canonical parser & service
│   │   ├── mis-maintenance/         # [NEW] Modal and renderer submodules for maintenance
│   │   │   ├── maintenance.modal.js
│   │   │   └── maintenance.renderer.js
│   │   ├── mis-pc-management.js
│   │   ├── mis-qr-generator.js
│   │   └── submit-pc-report.js
│   ├── reports/                     # Decomposed PC issue reports engine
│   │   ├── report.actions.js
│   │   ├── report.controller.js
│   │   ├── report.filters.js
│   │   ├── report.modal.js
│   │   ├── report.parser.js
│   │   └── report.renderer.js
│   ├── scheduling/                  # Decomposed timetable editor engine
│   │   ├── controller/
│   │   │   └── schedule-editor.controller.js
│   │   ├── interactions/
│   │   │   ├── autoscroll.js
│   │   │   ├── card-resize.js
│   │   │   ├── mouse-drag.js
│   │   │   └── touch-drag.js
│   │   ├── persistence/
│   │   │   └── schedule.persistence.js
│   │   ├── rendering/
│   │   │   ├── ghost-schedule.renderer.js
│   │   │   ├── schedule-card.renderer.js
│   │   │   └── tray-block.renderer.js
│   │   ├── state/
│   │   │   └── schedule.state.js
│   │   ├── utils/
│   │   │   └── slot-math.js
│   │   ├── validation/
│   │   │   └── schedule.validator.js
│   │   ├── colors.js
│   │   ├── conflicts.js             # [ADAPTER] Delegates to schedule.validator.js
│   │   ├── dragdrop.js              # [FACADE] Delegates to interactions/
│   │   ├── editor.js                # [FACADE] Delegates to controller/persistence/rendering
│   │   ├── grid.js                  # [ADAPTER] Delegates to rendering/
│   │   ├── import.js
│   │   └── time-utils.js            # [ADAPTER] Delegates to js/utils/time-utils.js
│   ├── services/                    # Reusable API communication services
│   │   ├── curriculum.service.js
│   │   ├── faculty.service.js
│   │   ├── keys.service.js          # [NEW] Key inventory & transfer API service
│   │   ├── laboratory.service.js
│   │   ├── notification.service.js
│   │   ├── report.service.js        # Canonical reports & maintenance API service
│   │   ├── schedule.service.js
│   │   ├── settings.service.js
│   │   └── user.service.js
│   ├── state/                       # Reactive client state stores
│   │   └── report.store.js
│   └── utils/                       # Shared utility functions
│       ├── core-utils.js
│       ├── dom-utils.js             # Canonical escapeHtml and renderIcons
│       ├── faculty-utils.js
│       └── time-utils.js            # Canonical time formatting & slot arithmetic
```

---

## 3. Files Refactored & Transformed into Facades

| Original God File | Previous LOC | New LOC | Refactoring Transformation |
| :--- | :---: | :---: | :--- |
| `js/scheduling/dragdrop.js` | 900 | 48 | Transformed into a thin facade delegating to `autoscroll.js`, `card-resize.js`, `mouse-drag.js`, and `touch-drag.js`. |
| `js/scheduling/editor.js` | 866 | 68 | Transformed into a thin facade delegating to `schedule.state.js`, `schedule.persistence.js`, `tray-block.renderer.js`, and `schedule-editor.controller.js`. |
| `js/components/profile-menu.js` | 1,168 | 76 | Transformed into a thin facade delegating to `profile-dropdown.js`, `account-modal.js`, `password-modal.js`, and `help-modal.js` (legacy e-signature canvas removed). |
| `js/pages/master-schedule.js` | 798 | 32 | Transformed into a thin coordinator delegating to `room.modal.js`, `room.renderer.js`, `room.controller.js`, `curriculum-import.modal.js`, `download-schedule.modal.js`, and `signature-settings.modal.js`. |
| `js/components/faculty-modal.js` | 671 | 42 | Transformed into a thin facade delegating to `add-faculty.modal.js`, `edit-role.modal.js`, `transfer-leadership.modal.js`, and `delete-faculty.modal.js`. |
| `js/reports.js` | 631 | 75 | Transformed into a thin facade delegating to `report.parser.js`, `report.filters.js`, `report.renderer.js`, `report.actions.js`, `report.modal.js`, and `report.controller.js`. |
| `js/schedule.js` | 294 | 30 | Transformed into a thin facade delegating to `faculty-schedule.colors.js`, `faculty-schedule.renderer.js`, `faculty-schedule.filters.js`, and `faculty-schedule.controller.js`. |
| `key-found.html` | 265 | 21 | Cleanly replaced with an instant HTTP/JS redirection forward to the canonical `key-transfer.html`. |

---

## 4. Phase 2 Newly Created & Enhanced Modules

### 1. Key Management Subsystem (`routes/keys.routes.js`, `services/keysService.js`, `js/pages/mis-keys.js`)
- **`mis-keys.html` & `js/pages/mis-keys.js`**: Dedicated MIS dashboard for managing registered physical keys, setting status (`ACTIVE` / `MISSING`), and generating calibrated two-sided keychain inserts.
- **Keychain Insert Generator**: Browser print engine formatting front-and-back pairs to exact acrylic keychain dimensions (**1.14 in x 1.84 in**).
- **`key-transfer.html` & `js/pages/key-transfer.js`**: Mobile-optimized peer-to-peer room handoff view with live holder badge display, role restriction enforcement, and instant confirmation receipt.
- **`services/keysService.js`**: Atomic key custody transfer with `withTransaction` isolation, occupancy log entry, and audit log generation.

### 2. Maintenance Deduplication Engine (`maintenance_issues` & `services/maintenanceService.js`)
- **`maintenance_issues` Relational Entity**: Prevents duplicate active tickets on the same workstation for the same component type.
- **Virtual Generated Key**: `Active_Issue_Key = IF(Status != 'Resolved', CONCAT(PC_ID, ':', Issue_Type), NULL)` with unique index constraint.
- **Multi-Reporter UI**: Maintenance queue renders `.reporter-chip` with person badge and `[+N]` count indicator (e.g. `👤 John [+2] ›`), opening a ticket details modal displaying all reporting students.
- **Automated Workstation Health Synchronization**: Auto-restores `lab_units.Condition_Status` to `Functional` only when all active component issues for that PC are resolved.

### 3. Security Auditing & Brute-Force Rate Limiting
- **`services/auditService.js` & `repositories/audit.repository.js`**: Non-blocking audit logger recording logins, password changes, key handoffs, and maintenance resolutions.
- **Sensitive Data Redaction**: Blacklists 16+ credential and secret parameter names to ensure zero sensitive data leakage into database logs.
- **`middleware/rateLimiter.js`**: 6 dedicated Express rate limiters protecting authentication, credential recovery, token validation, and public fault reporting.
- **Bcrypt Password Storage**: Password hashing with 12 salt rounds (`BCRYPT_SALT_ROUNDS = 12`) and updated password change service with current credential validation.

---

## 5. Public API Backward Compatibility Map

All existing global identifiers used across HTML files, inline `onclick` handlers, and legacy scripts continue to be preserved:

| Global API Identifier | Delegation Target |
| :--- | :--- |
| `window.formatTimeLabel(t)` | `js/utils/time-utils.js` (`formatTime12`) |
| `window.slotsToTime(idx)` | `js/utils/time-utils.js` (`slotsToTime`) |
| `window.timeToSlots(t)` | `js/utils/time-utils.js` (`timeToSlots`) |
| `window.escapeHtml(str)` | `js/utils/dom-utils.js` (`escapeHtml`) |
| `window.checkOverlap(...)` | `js/scheduling/validation/schedule.validator.js` |
| `window.checkProfessorScheduleConflict(...)` | `js/scheduling/validation/schedule.validator.js` |
| `window.createGridCard(...)` | `js/scheduling/rendering/schedule-card.renderer.js` |
| `window.convertToTrayBlock(...)` | `js/scheduling/rendering/tray-block.renderer.js` |
| `window.loadProfessorGhostSchedule(...)` | `js/scheduling/rendering/ghost-schedule.renderer.js` |
| `window.loadRoomSchedule()` | `js/scheduling/persistence/schedule.persistence.js` |
| `window.saveCurrentSchedule()` | `js/scheduling/persistence/schedule.persistence.js` |
| `window.openCardDetailModal(card)` | `js/scheduling/controller/schedule-editor.controller.js` |
| `window.parseIssueDescription(desc)` | `js/reports/report.parser.js` |
| `window.matchesReportQuery(report, q)` | `js/reports/report.filters.js` |
| `window.renderSingleCard(report)` | `js/reports/report.renderer.js` |
| `window.updateReportStatus(id, s)` | `js/reports/report.actions.js` |
| `window.deleteReport(id)` | `js/reports/report.actions.js` |
| `window.openCompletedModal()` | `js/reports/report.modal.js` |
| `window.loadRooms()` | `js/master-schedule/rooms/room.controller.js` |
| `window.deleteRoom(id, num)` | `js/master-schedule/rooms/room.controller.js` |
| `window.loadUserSchedule()` | `js/faculty-schedule/faculty-schedule.controller.js` |
| `window.openAccountSettings()` | `js/components/profile/account-modal.js` |
| `window.openChangePasswordModal()` | `js/components/profile/password-modal.js` |
| `window.openHelpModal()` | `js/components/profile/help-modal.js` |
| `window.showAddFacultyModal(cb)` | `js/faculty/modals/add-faculty.modal.js` |
| `window.changeFacultyRole(...)` | `js/faculty/modals/edit-role.modal.js` |
| `window.confirmDeleteFaculty(...)` | `js/faculty/modals/delete-faculty.modal.js` |

---

## 6. Verification Results

1. **Syntax Validation**:
   - `node -c` executed across 100% of `.js` files in `controllers/`, `routes/`, `services/`, `repositories/`, `middleware/`, `config/`, and `js/`.
   - **Result: 0 syntax errors**.
2. **Database Migrations (001–014)**:
   - Incremental migration scripts apply sequentially on startup without schema corruption.
3. **Runtime Integration**:
   - Node.js server starts cleanly on port 3000, connecting to MariaDB connection pool with transaction capabilities.
   - All role-based routes, rate limiters, and anti-flash authorization guards function without regressions.

---

## 7. Current Project Status & Recommendations

- **Baseline Status**: Production-ready Version 1.2.0 deployed.
- **Hardware Compatibility**: ESP32 C++ firmware (`LabSync_ESP32.ino`) tested with ADC voltage-divider key sensing and GM65 QR scanning.
- **Upcoming Enhancement**: Evaluate WebSocket or Server-Sent Events (SSE) transition to replace 3s HTTP polling when expanding beyond the initial IT laboratory facilities.

---
*Report maintained for Bulacan State University – Sarmiento Campus.*
