# LabSync — Smart Laboratory & Schedule Management System

LabSync is a full-stack laboratory room status, faculty schedule management, and IoT-integrated access monitoring platform built for **Bulacan State University – Sarmiento Campus**.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **MySQL / MariaDB** (v10.4 or higher, e.g. XAMPP)

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=labsync
SESSION_SECRET=your-secure-session-secret-here
```

### 3. Database Initialization
1. Create the MySQL database `labsync`.
2. Import the baseline snapshot schema from [`labsync.sql`](file:///c:/Users/andre/Downloads/LabSync/labsync.sql):
   ```bash
   mysql -u root -p labsync < labsync.sql
   ```
3. When the Node.js server starts, it will automatically execute any incremental schema migrations in [`database/migrations/`](file:///c:/Users/andre/Downloads/LabSync/database/migrations/) idempotently.

### 4. Install & Run
```bash
# Install dependencies
npm install

# Start the application server
npm start
```
Open your browser and navigate to: **`http://localhost:3000`**

---

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
│   ├── variables.css           # Design tokens, themes & text scaling
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

## 📖 Documentation

Detailed documentation is available in the [`docs/`](file:///c:/Users/andre/Downloads/LabSync/docs/) directory:

- 📘 [**System Documentation & API Specifications**](file:///c:/Users/andre/Downloads/LabSync/docs/SYSTEM_DOCUMENTATION.md)
- 🔌 [**Hardware & IoT Handover Notes**](file:///c:/Users/andre/Downloads/LabSync/docs/hardware/IOT_HANDOVER_SUMMARY.md)
- 📝 [**V1.0.0 Release Changelog**](file:///c:/Users/andre/Downloads/LabSync/docs/releases/v1_0_0_feature_summary.md)
