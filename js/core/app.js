/**
 * LabSync – Core Application Bootstrap & Lifecycle Manager | js/core/app.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  let _commonInitialized = false;

  /**
   * Initializes common application components across all protected dashboard pages.
   */
  function initCommon() {
    if (_commonInitialized) return;
    _commonInitialized = true;

    // 1. Initialize UI Header Components
    if (typeof global.initProfileDropdown === 'function') {
      global.initProfileDropdown();
    }
    if (typeof global.initNotifications === 'function') {
      global.initNotifications();
    }
    if (typeof global.initHelpButtons === 'function') {
      global.initHelpButtons();
    }

    // 2. Initialize Lucide icons if available
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }

    // 3. Dispatch page-specific initialization based on document dataset
    const pageType = document.body ? document.body.dataset.page : '';

    if (pageType === 'dashboard') {
      if (typeof global.initDashboard === 'function') {
        global.initDashboard();
      }
    } else if (pageType === 'it-head-dashboard') {
      if (typeof global.initITHeadDashboardPage === 'function') {
        global.initITHeadDashboardPage();
      } else if (typeof global.loadITHeadDashboardData === 'function') {
        global.loadITHeadDashboardData();
      }
    } else if (pageType === 'room-status') {
      if (typeof global.loadAllRoomStatusLabs === 'function') {
        global.loadAllRoomStatusLabs();
      }
      if (typeof global.loadRoomStatusActivityLog === 'function') {
        global.loadRoomStatusActivityLog();
      }
    }
  }

  // Bind to DOMContentLoaded or execute immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommon);
  } else {
    initCommon();
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.initCommon = initCommon;

})(typeof window !== 'undefined' ? window : this);
