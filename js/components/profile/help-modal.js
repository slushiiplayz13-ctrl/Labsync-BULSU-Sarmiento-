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
      if (user) userRole = user.role || 'Faculty';
    } catch (error) {
      console.error('[HelpModal] Error fetching user role:', error);
    }

    const isMis = userRole === 'MIS Staff' || page.startsWith('mis-');
    const isItHead = (userRole && userRole.toLowerCase().includes('head')) || page.startsWith('it-head-') || page === 'master-schedule.html' || page === 'faculty-management.html' || page === 'room-schedule-editor.html';

    const existing = document.getElementById('help-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.className = 'help-modal-overlay';

    let quickStartHTML = '';
    let featuresHTML = '';

    if (isMis) {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-teal">
              <i data-lucide="layout-dashboard"></i>
            </div>
            <div class="help-qs-title">Dashboard</div>
          </div>
          <p class="help-qs-text">Monitor active work orders, total registered PC counts, and recent student report submissions at a glance.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-red">
              <i data-lucide="wrench"></i>
            </div>
            <div class="help-qs-title">Maintenance Tracker</div>
          </div>
          <p class="help-qs-text">Filter tickets by status (All, Pending, Resolved), view issue details, and mark broken PCs as resolved with 1 click.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-purple">
              <i data-lucide="key-round"></i>
            </div>
            <div class="help-qs-title">Key Management & Tracking</div>
          </div>
          <p class="help-qs-text">Automatically creates lab keys upon room setup. Print 2-sided QR keychain inserts and manage Active, Missing, or Found status.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-blue">
              <i data-lucide="qr-code"></i>
            </div>
            <div class="help-qs-title">PC & QR Management</div>
          </div>
          <p class="help-qs-text">Add or delete workstation units, inspect room-by-room lab health, and generate printable QR code stickers.</p>
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
          <div class="help-qs-header">
            <div class="help-qs-icon theme-teal">
              <i data-lucide="layout-dashboard"></i>
            </div>
            <div class="help-qs-title">IT Head Dashboard</div>
          </div>
          <p class="help-qs-text">Overview of overall lab usage, schedule publishing, and department activity.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-green">
              <i data-lucide="calendar-range"></i>
            </div>
            <div class="help-qs-title">Master Schedule</div>
          </div>
          <p class="help-qs-text">View and manage the complete laboratory schedule for all faculty members and classes.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-indigo">
              <i data-lucide="users"></i>
            </div>
            <div class="help-qs-title">Faculty Management</div>
          </div>
          <p class="help-qs-text">Add new faculty members, manage accounts, and send automated credentials.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-purple">
              <i data-lucide="calendar-plus"></i>
            </div>
            <div class="help-qs-title">Schedule Editor</div>
          </div>
          <p class="help-qs-text">Create and customize room schedule blocks with imported subject catalogs.</p>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="file-spreadsheet"></i>
            Curriculum Import
          </div>
          <p class="help-feat-desc">Bulk upload subject catalogs using Excel or CSV templates.</p>
        </div>
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="printer"></i>
            Schedule Export
          </div>
          <p class="help-feat-desc">Print and export laboratory schedules for department display.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Secure Access
          </div>
          <p class="help-feat-desc">High-level administrative control over department scheduling.</p>
        </div>`;
    } else {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-teal">
              <i data-lucide="calendar"></i>
            </div>
            <div class="help-qs-title">View Schedule</div>
          </div>
          <p class="help-qs-text">Check your weekly class schedules and room assignments anytime.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-blue">
              <i data-lucide="file-text"></i>
            </div>
            <div class="help-qs-title">Submit Reports</div>
          </div>
          <p class="help-qs-text">Report PC issues or lab concerns quickly through the reporting system.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-purple">
              <i data-lucide="qr-code"></i>
            </div>
            <div class="help-qs-title">QR Code Access</div>
          </div>
          <p class="help-qs-text">Use your unique QR code for lab access and attendance tracking.</p>
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
          <div style="margin-bottom:32px;">
            <h3 class="help-modal-section-title">
              <i data-lucide="zap"></i>
              Quick Start Guide
            </h3>
            <div class="help-qs-list">
              ${quickStartHTML}
            </div>
          </div>
          
          <!-- Features -->
          <div style="margin-bottom:32px;">
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
            <p class="help-support-desc">If you encounter any issues or have questions, please contact:</p>
            <div class="help-support-list">
              <div class="help-support-item">
                <i data-lucide="mail"></i>
                <strong>Email:</strong> <span class="highlight">mis.sarmiento@bulsu.edu.ph</span>
              </div>
              <div class="help-support-item">
                <i data-lucide="phone"></i>
                <strong>Phone:</strong> <span class="highlight">+63 (044) 931-8600</span>
              </div>
              <div class="help-support-item">
                <i data-lucide="map-pin"></i>
                <strong>Office:</strong> <span>IT & MIS Office, BulSU Sarmiento Campus</span>
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

    const closeHelpFn = () => {
      if (global.setModalOpenState) global.setModalOpenState(false);
      modal.remove();
    };

    const closeHelpModalBtn = document.getElementById('close-help-modal');
    const closeHelpBtn = document.getElementById('close-help-btn');
    if (closeHelpModalBtn) closeHelpModalBtn.addEventListener('click', closeHelpFn);
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', closeHelpFn);
    modal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    modal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
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
