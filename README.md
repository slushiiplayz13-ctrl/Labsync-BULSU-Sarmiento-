# LabSync — Smart Laboratory & Schedule Management System

LabSync is a full-stack laboratory room status, faculty schedule management, and IoT-integrated access monitoring platform built for **Bulacan State University – Sarmiento Campus**.


## 🏛️ Project Architecture

```
LabSync/
├── server.js                   # Application bootstrap entrypoint
├── package.json                # Dependencies and npm scripts
├── labsync.sql                 # Baseline MySQL cold-start database schema dump
├── LabSync_ESP32.ino           # ESP32 firmware sketch
│
├── config/                     # Application & environment configuration
├── controllers/                # Domain route controllers
├── database/                   # Database connection, migration engine & migrations
├── middleware/                 # Auth, role check, and request middleware
├── repositories/               # Data access layer
├── routes/                     # Domain router aggregation & legacy bridges
├── services/                   # Business logic, IoT services, notifications
│
├── css/                        # Modular CSS architecture
│   ├── variables.css           # Design tokens, themes & contrast modes
│   ├── reset.css               # Base resets & scrollbars
│   ├── layouts.css             # Header, sidebar & page layout
│   ├── components/             # Domain modular component stylesheets
│   └── responsive.css          # Responsive breakpoints
│
├── js/                         # Modular Frontend architecture
│   ├── core/                   # State, session, clock, accessibility
│   ├── components/             # Reusable UI components & modals
│   ├── services/               # Frontend API client services
│   ├── pages/                  # Page-specific business logic controllers
│   ├── scheduling/             # Scheduling engine & time utils
│   `-- utils/                  # UI helpers & formatters
│
├── assets/                     # Static assets (images, logos, dev photos)
└── docs/                       # Project documentation hierarchy
    ├── SYSTEM_DOCUMENTATION.md # Comprehensive system manual
    ├── hardware/               # ESP32 wiring, sketch, and debugging notes
    └── releases/               # V1.0.0 feature and release changelogs
```

---


