/**
 * LabSync Help & Support Modal | js/components/profile/help-modal.js
 * Role-aware help and quick-start guide modal with features and contact info.
 */

(function (global) {
  'use strict';

  /**
   * Opens the Help & Support modal tailored to user role.
   */
  async function openHelpModal() {
    let userRole = 'Faculty';
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

    try {
      const userService = global.userService;
      let user = null;
      if (userService && typeof userService.getCurrentUser === 'function') {
        user = await userService.getCurrentUser();
      } else {
        const response = await fetch('/api/user/current', { credentials: 'include' });
        if (response.ok) user = await response.json();
      }
      if (user) userRole = user.role || user.Role || 'Faculty';
    } catch (error) {
      console.error('[HelpModal] Error fetching user role:', error);
    }

    if (userRole === 'Faculty') {
      try {
        const cached = JSON.parse(sessionStorage.getItem('labsync_user') || localStorage.getItem('user') || 'null');
        const u = cached && (cached.user || cached);
        if (u && (u.role || u.Role)) userRole = u.role || u.Role;
      } catch (e) { }
    }

    const normRole = (userRole || '').trim().toLowerCase();
    const isOjt = normRole === 'ojt' || normRole.includes('ojt');
    const isItHead = !isOjt && (normRole.includes('head') || page.startsWith('it-head-') || page === 'master-schedule.html' || page === 'faculty-management.html' || page === 'room-schedule-editor.html');
    const isMis = !isOjt && (userRole === 'MIS Staff' || normRole.includes('mis') || page.startsWith('mis-'));

    const existing = document.getElementById('help-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.className = 'help-modal-overlay';

    let quickStartHTML = '';
    let featuresHTML = '';

    if (isOjt) {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-icon theme-teal">
            <i data-lucide="layout-dashboard"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Dashboard</div>
            <p class="help-qs-text">Monitor overall computer lab status, view active work orders, and review recent maintenance activities across assigned labs.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-red">
            <i data-lucide="wrench"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Maintenance Tracker</div>
            <p class="help-qs-text">Review assigned PC issue tickets, update diagnostic progress (In Progress, Resolved), and log hardware or software repairs.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-blue">
            <i data-lucide="clipboard-list"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Issue Monitoring</div>
            <p class="help-qs-text">Track reported computer issues, verify hardware faults, and inspect activity logs for laboratory workstations.</p>
          </div>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="wrench"></i>
            Ticket Diagnostic Tracking
          </div>
          <p class="help-feat-desc">Record diagnostic findings and update ticket progress in real time as you inspect laboratory workstations.</p>
        </div>
        <div class="help-feature-card theme-green">
          <div class="help-feat-title">
            <i data-lucide="check-circle-2"></i>
            1-Click Ticket Resolution
          </div>
          <p class="help-feat-desc">Resolving a ticket updates the work order and restores the PC unit to Functional condition in the laboratory.</p>
        </div>
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="bell"></i>
            Live Issue Notifications
          </div>
          <p class="help-feat-desc">Receive immediate alerts when faculty or students submit new laboratory computer issue reports.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="file-text"></i>
            Technical & Safety Guidance
          </div>
          <p class="help-feat-desc">Access standard operating procedures and laboratory safety guidelines for all hardware servicing tasks.</p>
        </div>`;
    } else if (isMis) {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-icon theme-teal">
            <i data-lucide="layout-dashboard"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Dashboard</div>
            <p class="help-qs-text">Monitor active work orders, total registered PC counts, and recent student report submissions at a glance.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-red">
            <i data-lucide="wrench"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Maintenance Tracker</div>
            <p class="help-qs-text">Filter tickets by status (All, Pending, Resolved), view issue details, and mark broken PCs as resolved with 1 click.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-blue">
            <i data-lucide="qr-code"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">PC & QR Management</div>
            <p class="help-qs-text">Add or delete workstation units, inspect room-by-room lab health, and generate printable QR code stickers.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-purple">
            <i data-lucide="key-round"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Key Management & Tracking</div>
            <p class="help-qs-text">Automatically creates lab keys upon room setup. Print 2-sided QR keychain inserts and manage Active, Missing, or Found status.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-green">
            <i data-lucide="user-cog"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">OJT Intern Management</div>
            <p class="help-qs-text">Register student interns, track active and expiring internship periods, generate temporary login credentials, and handle password resets.</p>
          </div>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-purple">
          <div class="help-feat-title">
            <i data-lucide="key-round"></i>
            Auto Keys & 2-Sided QR Inserts
          </div>
          <p class="help-feat-desc">New rooms auto-receive default keys. Generate printable 2-sided QR keychain inserts with Key Transfer and Room Claim scanning.</p>
        </div>
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="bell"></i>
            Instant Ticket Alerts
          </div>
          <p class="help-feat-desc">Receive live notifications whenever students or faculty submit new hardware issue reports.</p>
        </div>
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="check-circle-2"></i>
            1-Click Ticket Repair
          </div>
          <p class="help-feat-desc">Resolving a ticket updates the work order and restores the PC unit to Functional condition in the database.</p>
        </div>
        <div class="help-feature-card theme-green">
          <div class="help-feat-title">
            <i data-lucide="user-cog"></i>
            OJT Lifecycle & Credentials
          </div>
          <p class="help-feat-desc">Automatic expiration tracking with 7-day warning alerts, secure temporary password generation, 1-click password resets, and account deactivation.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Shared Account Control
          </div>
          <p class="help-feat-desc">Securely manage shared department access credentials and profile security settings.</p>
        </div>`;
    } else if (isItHead) {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-icon theme-teal">
            <i data-lucide="layout-dashboard"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Executive Dashboard</div>
            <p class="help-qs-text">Monitor overall laboratory occupancy, active key loans, weekly publishing stats, and jump quickly to scheduling and oversight tools.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-blue">
            <i data-lucide="monitor-dot"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Live Room Status & Activity</div>
            <p class="help-qs-text">Track real-time room availability (Available, Borrowed, In Session), physical key custody status, and laboratory check-in activity logs.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-green">
            <i data-lucide="calendar-range"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Master Schedule Overview</div>
            <p class="help-qs-text">Select laboratory rooms, configure official Dean and Program Chair signatories, and batch download all room timetables.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-purple">
            <i data-lucide="calendar-plus"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Room Schedule Studio</div>
            <p class="help-qs-text">Build weekly room timetables with drag-and-drop editing, clash prevention, 50/50 split ghost schedule overlays, and unsaved changes safety.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-red">
            <i data-lucide="file-bar-chart-2"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">PC Issue Reports</div>
            <p class="help-qs-text">Supervise workstation maintenance across all computer labs, track diagnosis status, and review resolved tickets handled by MIS Staff and OJTs.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-indigo">
            <i data-lucide="calendar-days"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">My Teaching Schedule</div>
            <p class="help-qs-text">Access your personal weekly teaching assignments, filter timetable blocks by subject, and print high-resolution copies for reference.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-amber">
            <i data-lucide="users"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Faculty Management & Delegation</div>
            <p class="help-qs-text">Add faculty members, generate credentials, inspect individual teaching schedules, and securely delegate Department Head leadership.</p>
          </div>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="calendar-range"></i>
            Clash Prevention & Ghost Overlays
          </div>
          <p class="help-feat-desc">Detect multi-room conflicts with side-by-side ghost schedule overlays.</p>
        </div>
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="printer"></i>
            Institutional Timetable Exports
          </div>
          <p class="help-feat-desc">Export printable schedules with university headers and signatory blocks.</p>
        </div>
        <div class="help-feature-card theme-green">
          <div class="help-feat-title">
            <i data-lucide="file-spreadsheet"></i>
            Curriculum Catalog Sync
          </div>
          <p class="help-feat-desc">Bulk import subject catalogs and course sections from Excel or CSV.</p>
        </div>
        <div class="help-feature-card theme-purple">
          <div class="help-feat-title">
            <i data-lucide="key-round"></i>
            Physical Key & Room Presence Tracking
          </div>
          <p class="help-feat-desc">Track real-time lab key custody and scheduled class presence.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Leadership Role Delegation
          </div>
          <p class="help-feat-desc">Transfer administrative and scheduling authority securely to successors.</p>
        </div>
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="file-bar-chart-2"></i>
            Lab Hardware Health Oversight
          </div>
          <p class="help-feat-desc">Monitor workstation issue reports from diagnosis to repair completion.</p>
        </div>`;
    } else {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-icon theme-teal">
            <i data-lucide="calendar"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">View Schedule</div>
            <p class="help-qs-text">Check your weekly class schedules and room assignments anytime.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-blue">
            <i data-lucide="file-text"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">Submit Reports</div>
            <p class="help-qs-text">Report PC issues or lab concerns quickly through the reporting system.</p>
          </div>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-icon theme-purple">
            <i data-lucide="qr-code"></i>
          </div>
          <div class="help-qs-body">
            <div class="help-qs-title">QR Code Access</div>
            <p class="help-qs-text">Use your unique QR code for lab access and attendance tracking.</p>
          </div>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="bell"></i>
            Real-time Updates
          </div>
          <p class="help-feat-desc">Get instant notifications about lab status changes and reports.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Secure Access
          </div>
          <p class="help-feat-desc">Your account is protected with secure authentication.</p>
        </div>
        <div class="help-feature-card theme-green">
          <div class="help-feat-title">
            <i data-lucide="user-cog"></i>
            Account Settings
          </div>
          <p class="help-feat-desc">Manage your profile, password, and QR code from your account.</p>
        </div>`;
    }

    modal.innerHTML = `
      <div class="help-modal-dialog">
        <!-- Header -->
        <div class="help-modal-header">
          <div class="help-modal-header-left">
            <div class="help-modal-icon-box">
              <i data-lucide="circle-help"></i>
            </div>
            <div class="help-modal-title-wrap">
              <h2 class="help-modal-title">Help & Support</h2>
              <p class="help-modal-subtitle">Quick guide to using LabSync</p>
            </div>
          </div>
          <button id="close-help-modal" class="help-modal-close-btn">
            <i data-lucide="x"></i>
          </button>
        </div>
        
        <!-- Content -->
        <div class="help-modal-body">
          <!-- Quick Start -->
          <div style="margin-bottom:24px;">
            <h3 class="help-modal-section-title">
              <i data-lucide="zap"></i>
              Quick Start Guide
            </h3>
            <div class="help-qs-list">
              ${quickStartHTML}
            </div>
          </div>
          
          <!-- Features -->
          <div style="margin-bottom:24px;">
            <h3 class="help-modal-section-title">
              <i data-lucide="sparkles"></i>
              Key Features
            </h3>
            <div class="help-features-grid">
              ${featuresHTML}
            </div>
          </div>
          
          <!-- Need Help -->
          <div class="help-support-box">
            <h3 class="help-support-title">
              <i data-lucide="headphones"></i>
              Need More Help?
            </h3>
            <p class="help-support-desc">Direct contact channels are currently not available. LabSync is an academic capstone project prototype developed for BulSU Sarmiento Campus.</p>
            <div class="help-support-list">
              <div class="help-support-item">
                <i data-lucide="mail"></i>
                <strong>Email:</strong> <span style="color:var(--text-muted); font-weight:500;">Not Available</span>
              </div>
              <div class="help-support-item">
                <i data-lucide="phone"></i>
                <strong>Phone:</strong> <span style="color:var(--text-muted); font-weight:500;">Not Available</span>
              </div>
              <div class="help-support-item">
                <i data-lucide="map-pin"></i>
                <strong>Office:</strong> <span style="color:var(--text-muted); font-weight:500;">Not Available (Academic Capstone Project)</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Footer -->
        <div class="help-modal-footer">
          <p>LabSync v1.0 - BSU Sarmiento Campus</p>
          <button id="close-help-btn" class="help-modal-got-it-btn">
            Got it!
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.setModalOpenState) global.setModalOpenState(true);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const handleKeydown = (e) => {
      if (e.key === 'Escape') {
        closeHelpFn();
      }
    };
    document.addEventListener('keydown', handleKeydown);

    const closeHelpFn = () => {
      document.removeEventListener('keydown', handleKeydown);
      if (global.setModalOpenState) global.setModalOpenState(false);
      modal.remove();
    };

    const closeHelpModalBtn = document.getElementById('close-help-modal');
    const closeHelpBtn = document.getElementById('close-help-btn');
    if (closeHelpModalBtn) closeHelpModalBtn.addEventListener('click', closeHelpFn);
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelpFn);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeHelpFn();
      }
    });
  }

  /**
   * Bind click events dynamically to Help buttons in sidebars.
   */
  function initHelpButtons() {
    const helpButtons = document.querySelectorAll('.sidebar-btn[title="Help"]');
    helpButtons.forEach(btn => {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openHelpModal();
      });
    });
  }

  const helpModal = {
    openHelpModal,
    initHelpButtons
  };

  global.helpModal = helpModal;
  global.openHelpModal = openHelpModal;
  global.initHelpButtons = initHelpButtons;

})(typeof window !== 'undefined' ? window : this);
