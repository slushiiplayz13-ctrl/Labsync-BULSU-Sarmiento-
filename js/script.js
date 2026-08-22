/**
 * LabSync – Application Master Bootstrap & Legacy Bridge | js/script.js
 * Refactored in Phase 1 (Frontend Architectural Refactor)
 * 
 * Modular Responsibilities have been extracted to:
 * - js/core/accessibility.js        (Scale, Contrast, Theme setup)
 * - js/core/clock.js                (Live clock, Greetings, Calendar date)
 * - js/core/tutorial-launcher.js    (Tutorial dynamic loader & bridge)
 * - js/core/app.js                  (Common app bootstrap & dispatch)
 * - js/services/user.service.js     (Authentication, User profile, Logout)
 * - js/components/profile-menu.js   (Profile menu, Settings, Help modals)
 * - js/components/notifications.js  (Dropdown, Toasts, Polling, Routing)
 * - js/components/custom-select.js  (Custom dropdown UI component)
 * - js/components/sidebar-nav.js    (Admin floating menu & tooltips)
 * - js/components/activity-feed.js  (Audit stream & event transformer)
 * - js/pages/room-status.js         (Room status grid & occupancy logs)
 */

(function (global) {
  'use strict';

  // Master LabSync App Namespace
  global.LabSync = global.LabSync || {
    version: '1.1.0',
    phase: 'Phase 1 Architecture Complete'
  };

  /**
   * Application Bootstrap Coordinator
   */
  function bootstrap() {
    if (typeof global.initCommon === 'function') {
      global.initCommon();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})(typeof window !== 'undefined' ? window : this);
