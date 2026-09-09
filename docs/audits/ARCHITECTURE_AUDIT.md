# LabSync — Full System Architecture Audit & Dependency Analysis

**Project**: LabSync (Bulacan State University – Sarmiento Campus)  
**Date**: August 2026  
**Branch**: `main` (Baseline Production Architecture)  
**Status**: Baseline Complete — Verified  

---

## 1. Executive Summary

This document establishes the architectural baseline of the **LabSync** system. It details the existing module boundaries, hotspots, code duplications, global state sprawl, HTML script dependencies, and the target architecture designed to transform the codebase into a modular, maintainable, decoupled system with zero visual or behavioral regressions.

---

## 2. Codebase Inventory & Metrics

### 2.1 File Size & Line Count Rankings (JavaScript)

| Rank | File Path | Lines | Size (KB) | Primary Responsibility & Current Issues |
|:---:|---|:---:|:---:|---|
| 1 | `js/components/profile-menu.js` | 1,168 | 60.5 | **God Module**: Injects header dropdown, account settings modal, profile photo upload & crop preview, signature pad HTML5 canvas, change password modal, help center modal, and notification preference sync. |
| 2 | `js/scheduling/dragdrop.js` | 762 | 36.9 | **God Module**: Contains 4 separate drag/drop engines (mouse card drag, mouse tray block drag, card resizing, and a 250-line touch polyfill) that each repeat drop calculation, overlap checking, conflict querying, and DOM card creation. |
| 3 | `js/scheduling/editor.js` | 753 | 32.5 | **God Module**: Mixes dirty-state flags, tray block lifecycle, add/edit schedule modals, discard unsaved modal, ghost schedule rendering, API persistence, and professor dropdown filtering. |
| 4 | `js/pages/master-schedule.js` | 701 | 31.5 | **Mixed Responsibilities**: Handles room CRUD modals, numeric input restrictions, room cards grid, download modal, signature settings modal, and full CSV/Excel curriculum upload/parsing. |
| 5 | `js/components/faculty-modal.js` | 671 | 34.5 | **Monolithic Component**: Houses Add Faculty modal, Role Change modal, Leadership Transfer modal, and Delete Faculty confirmation dialog in one giant script. |
| 6 | `js/pages/mis-qr-generator.js` | 562 | 19.9 | Canvas QR generation, single & batch download, printable lab card styling, and clipboard helpers. |
| 7 | `js/reports.js` | 559 | 26.4 | **Mixed Responsibilities**: Handles raw string regex parsing, live multi-field search filtering, direct fetch calls, report card rendering, status actions, and completed tickets modal. |
| 8 | `js/tutorial.js` | 489 | 23.7 | Interactive walkthrough overlay, spotlight positioning, step animations, and sound effects. |
| 9 | `js/pages/mis-maintenance.js` | 424 | 18.9 | Maintenance issue tracker; re-implements `parseIssueDesc`, custom stat counters, and raw status update fetch calls. |
| 10 | `js/schedule-studio.js` | 408 | 18.6 | Canvas/HTML2Canvas wallpaper and schedule image generator with multiple themes. |
| 11 | `services/emailService.js` | 393 | 23.1 | Transactional email templates (Welcome, Password Reset, Verification) with dark/light mode HTML. |
| 12 | `js/pages/dashboard.js` | 395 | 20.1 | Main dashboard coordinator with fallback fetch chains. |
| 13 | `js/components/notifications.js` | 401 | 18.2 | Notification bell dropdown, unread count polling, route dispatching. |
| 14 | `js/components/toast.js` | 362 | 14.7 | Animated toast notifications, in-app modal confirmation dialogs, and discard alert helpers. |
| 15 | `js/components/sidebar-nav.js` | 310 | 12.3 | Mobile hamburger navigation, responsive sidebar drawer, quick action buttons. |
| 16 | `js/services/laboratory.service.js` | 308 | 13.5 | Laboratory room status, PC unit hardware status, and occupancy API interactions. |
| 17 | `js/schedule.js` | 257 | 11.9 | Faculty personal timetable: loads schedule data, assigns subject colors, renders columns, and handles legend click filtering. |
| 18 | `js/scheduling/import.js` | 257 | 9.9 | Excel/CSV file parsing and sample file generator. |
| 19 | `repositories/schedule.repository.js` | 249 | 12.1 | MySQL queries for schedule conflict checks, professor schedules, and room bookings. |
| 20 | `services/usersService.js` | 244 | 9.9 | User profile, password hashing, avatar storage, and role management. |

---

## 3. Dependency & Script Loading Graph

### 3.1 HTML Pages and Script Loading Matrix

Every protected HTML page in LabSync loads scripts in a defined order to support globals. Below is the mapping:

| Page | Script Loading Sequence |
|---|---|
| `master-schedule.html` | `lucide` → `xlsx` → `auth-check.js` → `core-utils.js` → `dom-utils.js` → `accessibility.js` → `clock.js` → `tutorial-launcher.js` → `user.service.js` → `notification.service.js` → `laboratory.service.js` → `settings.service.js` → `curriculum.service.js` → `toast.js` → `profile-menu.js` → `notifications.js` → `custom-select.js` → `sidebar-nav.js` → `scheduling/import.js` → `core/app.js` → `pages/master-schedule.js` → `tutorial.js` |
| `room-schedule-editor.html` | `lucide` → `auth-check.js` → `core-utils.js` → `dom-utils.js` → `accessibility.js` → `clock.js` → `tutorial-launcher.js` → `user.service.js` → `notification.service.js` → `schedule.service.js` → `curriculum.service.js` → `toast.js` → `profile-menu.js` → `notifications.js` → `custom-select.js` → `sidebar-nav.js` → `time-utils.js` → `colors.js` → `conflicts.js` → `grid.js` → `dragdrop.js` → `editor.js` → `core/app.js` → `room-schedule-editor.js` → `tutorial.js` |
| `my-schedule.html` / `it-head-my-schedule.html` | `lucide` → `html2canvas` → `auth-check.js` → `core-utils.js` → `dom-utils.js` → `accessibility.js` → `clock.js` → `tutorial-launcher.js` → `user.service.js` → `notification.service.js` → `schedule.service.js` → `toast.js` → `profile-menu.js` → `notifications.js` → `custom-select.js` → `sidebar-nav.js` → `scheduling/time-utils.js` → `scheduling/colors.js` → `core/app.js` → `schedule.js` → `schedule-studio.js` → `tutorial.js` |
| `it-head-pc-reports.html` / `faculty-pc-reports.html` | `lucide` → `auth-check.js` → `core-utils.js` → `dom-utils.js` → `accessibility.js` → `clock.js` → `tutorial-launcher.js` → `user.service.js` → `notification.service.js` → `toast.js` → `profile-menu.js` → `notifications.js` → `sidebar-nav.js` → `core/app.js` → `report.store.js` → `reports.js` → `tutorial.js` |
| `mis-maintenance.html` | `lucide` → `auth-check.js` → `core-utils.js` → `dom-utils.js` → `accessibility.js` → `clock.js` → `tutorial-launcher.js` → `user.service.js` → `notification.service.js` → `toast.js` → `profile-menu.js` → `notifications.js` → `custom-select.js` → `sidebar-nav.js` → `core/app.js` → `pages/mis-maintenance.js` → `tutorial.js` |
| `submit-pc-report.html` | `lucide` → `tutorial.js` → `pages/submit-pc-report.js` |

---

## 4. Code Duplication Hotspots

### 4.1 `escapeHtml` Duplication
`escapeHtml` is declared in **11 separate locations**:
1. `js/utils/core-utils.js` (line 14) — Canonical
2. `js/schedule.js` (line 10)
3. `js/schedule-studio.js` (line 398)
4. `js/reports.js` (line 237)
5. `js/pages/mis-staff-dashboard.js` (line 40)
6. `js/pages/master-schedule.js` (line 575 as `escapeHtmlString`)
7. `js/pages/it-head-dashboard.js` (line 16)
8. `js/pages/dashboard.js` (line 37)
9. `js/components/faculty-schedule-modal.js` (line 12)
10. `js/components/faculty-modal.js` (line 12)
11. `js/components/faculty-card.js` (line 14)

### 4.2 Time Formatting Duplication
Time conversion and 12-hour/24-hour formatting is implemented in:
1. `js/utils/core-utils.js` (`formatTime12`, `formatLastUpdatedTime`)
2. `js/scheduling/time-utils.js` (`formatTimeLabel`, `formatTime24to12`, `formatTimeRange`, `slotsToTime`, `timeToSlots`)
3. `js/schedule.js` (`formatTime12`)
4. `js/schedule-studio.js` (`formatTime12`, `formatTimeRange`)
5. `js/pages/print-schedule.js` (`formatTime24to12`)
6. `js/pages/print-all-schedules.js` (`formatTime24to12`)
7. `js/pages/it-head-dashboard.js` (`formatTime12`)
8. `js/pages/dashboard.js` (`formatTime12`)

### 4.3 Report Issue Description Parsing
Regex parsing of `[Program & Section: ...] [Issues: ...] Remarks: ...` is duplicated identically in:
1. `js/reports.js` (`parseIssueDescription`)
2. `js/pages/mis-maintenance.js` (`parseIssueDesc`)

### 4.4 Scheduling Drop & Conflict Logic
The sequence:
1. Calculate slot index from coordinates (`Math.floor(y / slotHeight)`).
2. Constrain slot range (`slotIndex + durationSlots <= 27`).
3. Check grid overlap (`checkOverlap(day, start, end, excludeId)`).
4. Query professor conflict API (`checkProfessorConflict(...)`).
5. Render warning toast or inject/move card element.
6. Update tray count and mark `isDirty = true`.

This exact sequence is written 4 times across `dragdrop.js` (mouse column drop, mouse tray drop, card resize, and touch drop polyfill).

---

## 5. Global State & `window.*` Exposure Map

The system currently relies on the following global bridges on `window` / `global`:

```text
window.isDirty                     <-- Checked on beforeunload and navigation
window.pendingAction               <-- Modal discard action callback
window.revertSelectCallback        <-- Revert select dropdown callback
window.showToast                   <-- Toast notification generator
window.showConfirmModal            <-- Confirmation modal generator
window.reportStore                 <-- Reactive reports store
window.allReports                  <-- Getter/setter bridge to reportStore
window.parseIssueDescription       <-- Issue string parser
window.matchesReportQuery          <-- Search filter evaluator
window.loadReports                 <-- Loads reports from API
window.renderReports               <-- Dynamic report list renderer
window.openCompletedModal          <-- Completed tickets modal
window.scheduleService             <-- Schedule domain service
window.curriculumService           <-- Curriculum domain service
window.laboratoryService           <-- Laboratory domain service
window.userService                 <-- User profile domain service
window.notificationService         <-- Notification domain service
window.settingsService             <-- Settings domain service
window.scheduleDragDrop            <-- Drag & drop engine interface
window.scheduleEditor              <-- Editor coordinator interface
window.checkOverlap                <-- Overlap check function
window.checkProfessorConflict      <-- Professor clash check function
window.formatTimeLabel             <-- Time label converter
window.formatTime12                <-- 12-hour converter
window.escapeHtml                  <-- HTML string escaper
```

**Rule for Refactoring**: All new modular implementations will export pure, cohesive modules and bind thin, backward-compatible facades to `window.*` to guarantee zero breakage of existing inline event handlers (`onclick="..."`) or legacy scripts.

---

## 6. Target Architecture & Module Decomposition

### Priority 1: Scheduling (`js/scheduling/`)
- `state/schedule.state.js` — State machine for dirty flags, room, selected professor, AY, semester, active card, block counter.
- `validation/schedule.validator.js` — Overlap verification, professor conflict verification, bounds checking.
- `utils/slot-math.js` — Slot duration, responsive slot heights, coordinate-to-slot snapping.
- `rendering/schedule-card.renderer.js` — Grid card DOM element creation, span classes, badges, styling.
- `rendering/tray-block.renderer.js` — Tray block DOM creation, block counter update, empty state.
- `rendering/ghost-schedule.renderer.js` — Ghost card creation, cross-room styling, ghost block clearing.
- `interactions/autoscroll.js` — Smooth RAF edge autoscroller for container and viewport.
- `interactions/card-resize.js` — Mouse/touch card bottom handle resizing.
- `interactions/mouse-drag.js` — HTML5 desktop mouse drag-and-drop for cards and tray blocks.
- `interactions/touch-drag.js` — Mobile/tablet touch polyfill with gesture snapping.
- `persistence/schedule.persistence.js` — Schedule loading, saving, and deletion via `scheduleService`.
- `controller/schedule-editor.controller.js` — Coordinates modals (add, edit, discard), header, filters, and editor initialization.
- `dragdrop.js` — **Thin compatibility facade** delegating to `interactions/` and `validation/`.
- `editor.js` — **Thin compatibility facade** delegating to `controller/`, `rendering/`, and `persistence/`.

### Priority 2: Reports (`js/reports/`)
- `report.service.js` (or in `js/services/report.service.js`) — Unified API client for reports & maintenance.
- `report.parser.js` — Pure string parser for `[Program & Section: ...] [Issues: ...] Remarks: ...`.
- `report.filters.js` — Multi-field search query matcher and time range filters (7d, 30d, all).
- `report.renderer.js` — Report card, modal ticket card, badge, and empty state rendering.
- `report.actions.js` — Status change transitions, deletion handlers, toast confirmations.
- `report.modal.js` — Resolved tickets modal coordinator.
- `report.controller.js` — Page initialization, search input listeners, modal lifecycle.
- `js/reports.js` — **Thin compatibility facade** delegating to `js/reports/`.

### Priority 3: Master Schedule (`js/master-schedule/`)
- `rooms/room.modal.js` — Add Room and Edit Room dialog controllers + numeric input restrictors.
- `rooms/room.renderer.js` — Laboratory room card rendering.
- `rooms/room.controller.js` — Room CRUD lifecycle, delete confirmation, service queries.
- `curriculum/curriculum-import.modal.js` — File drag/drop dropzone, CSV/Excel parsing, preview table, import/clear actions.
- `modals/download-schedule.modal.js` — Bulk schedule download modal.
- `modals/signature-settings.modal.js` — Campus official signature preferences modal.
- `master-schedule.controller.js` — Master coordinator for page setup and custom select initialization.
- `js/pages/master-schedule.js` — **Thin coordinator** delegating to `js/master-schedule/`.

### Priority 4: Faculty Schedule (`js/faculty-schedule/`)
- `faculty-schedule.colors.js` — Subject color palette tokens and keyword classifier.
- `faculty-schedule.renderer.js` — Timetable day columns, time badges, class cards, empty state coffee icon.
- `faculty-schedule.filters.js` — Legend filter click handlers, card highlight/dim animations.
- `faculty-schedule.controller.js` — Academic year / semester selector syncing and timetable loader.
- `js/schedule.js` — **Thin coordinator** delegating to `js/faculty-schedule/`.

### Shared Infrastructure & Components (`js/components/profile/`)
- `profile-dropdown.js` — Header dropdown, dark mode toggle, logout handler.
- `account-modal.js` — Account settings modal, avatar upload & crop preview.
- `signature-modal.js` — HTML5 canvas signature pad, stroke drawing, clearing, saving.
- `password-modal.js` — Change password dialog and validation.
- `help-modal.js` — Help center and shortcut dialog.
- `js/components/profile-menu.js` — **Unified facade** delegating to `profile/` submodules.

---

## 7. Risk Analysis & Mitigation Strategy

| Area | Risk Description | Severity | Mitigation Plan |
|---|---|:---:|---|
| **Scheduling Drag & Drop** | Broken card drag snapping or coordinate offsets during mouse/touch interactions | **High** | Share exact slot calculations (`slot-math.js`) between mouse and touch; preserve all DOM class names and data attributes (`data-start`, `data-end`, `data-day`). |
| **Schedule Conflict Checks** | False negatives or missed cross-room professor clashes | **High** | Keep query schema identical; route all conflict checks through `schedule.validator.js`; test both same-room overlap and cross-room professor clashes. |
| **Reports Filtering** | Ticket search failing on partial ticket ID (`ls-tkt-123`, `tkt123`, etc.) | **Medium** | Retain all query variants in `report.filters.js` with comprehensive test cases. |
| **Script Loading & Execution Order** | Missing functions if scripts load asynchronously or in wrong sequence | **High** | Maintain identical script tag order in HTML files; provide self-contained IIFE/global facades so modules resolve smoothly. |
| **Inline Event Handlers** | Buttons with `onclick="deleteBlock(event, this)"` failing | **Medium** | Retain global window bindings for all inline handlers while migrating to event listeners where appropriate. |

---

## 8. Refactor Execution Roadmap

1. **Phase 1: Baseline & Core Utilities** (`core-utils.js`, `time-utils.js`, `report.service.js`, `escapeHtml` deduplication).
2. **Phase 2: Priority 1 — Scheduling System Decomposition** (`state`, `validation`, `slot-math`, `rendering`, `interactions`, `persistence`, `controller`, thin facades).
3. **Phase 3: Priority 2 — Reports Modularization** (`parser`, `filters`, `renderer`, `actions`, `modal`, `controller`, thin facade).
4. **Phase 4: Priority 3 — Master Schedule Modularization** (`rooms`, `curriculum`, `modals`, `controller`, thin facade).
5. **Phase 5: Priority 4 — Faculty Schedule Modularization** (`colors`, `renderer`, `filters`, `controller`, thin facade).
6. **Phase 6: Large Components Modularization** (`profile-menu` submodules, `faculty-modal` submodules).
7. **Phase 7: Page Controllers & Backend Auditing** (Standardize services, verify legacy API bridges).
8. **Phase 8: Regression Validation & Refactor Report** (`REFACTOR_REPORT.md`).

---

## 9. Phase 2 Architecture Expansion (September 2026)

In September 2026, the architecture was expanded to address physical operational workflows and enterprise security:

### 9.1 Physical Key Inventory & Keychain Tag Studio
- **Backend**: Mounted `routes/keys.routes.js` with `controllers/keys.controller.js`, `services/keysService.js`, and `repositories/keys.repository.js`.
- **Database**: `laboratory_keys` table mapping keys to rooms with status (`ACTIVE`, `MISSING`).
- **Frontend Studio**: `mis-keys.html` and `js/pages/mis-keys.js` formatting calibrated two-sided acrylic keychain inserts (**1.14 in x 1.84 in**) with high-contrast QR codes (`#0EA5C9`).

### 9.2 Mobile Key Transfer & Room Claim Protocol
- **Mobile View**: `key-transfer.html` and `js/pages/key-transfer.js` enabling peer-to-peer room handoffs between faculty in hallways.
- **Atomic Custody Transfer**: Updates `laboratories.Current_User_ID`, records `occupancy_log` entry with `KEY_TRANSFER` method, and dispatches an immutable audit event.

### 9.3 Maintenance Issue Relational Deduplication
- **Schema Addition**: `maintenance_issues` table with stored generated unique key `Active_Issue_Key = IF(Status != 'Resolved', CONCAT(PC_ID, ':', Issue_Type), NULL)`.
- **Concurrency Safety**: `POST /api/reports/submit` acquires a row lock (`SELECT FOR UPDATE`) within a transaction, linking duplicate student reports to existing open issues.
- **UI Presentation**: Renders `.reporter-chip` with person badge and `[+N]` count indicator, linking to a detailed reporter inspection modal.

### 9.4 Security Hardening & Immutable Audit Trail
- **Audit Logging**: `services/auditService.js` records high-value mutations into `audit_logs`, stripping 16+ forbidden credential parameters.
- **Multi-Tier Rate Limiting**: `middleware/rateLimiter.js` guards login, password recovery, reset token validation, and public PC reports.
- **Bcrypt Password Storage**: Upgraded to Bcrypt with 12 salt rounds (`BCRYPT_SALT_ROUNDS = 12`).
- **E-Signature Decommissioning**: Legacy HTML5 signature pad (`signature-modal.js`) decommissioned in favor of direct administrative credential controls.
