/* ================================================================
   LabSync – Dashboard Page Coordinator  |  js/pages/dashboard.js
   Coordinating lifecycle, concurrent initialization, and modular subcomponents:
     - js/pages/dashboard/dashboard.labs.js
     - js/pages/dashboard/dashboard.schedule.js
   ================================================================ */

'use strict';

(function (global) {
  let _dashboardInitialized = false;

  /**
   * Initializes dashboard page features concurrently with zero-flicker live sync.
   */
  async function initDashboard() {
    if (_dashboardInitialized) return;
    _dashboardInitialized = true;

    try {
      const labsTask = (global.dashboardLabs && typeof global.dashboardLabs.loadDashboardStatsAndLabs === 'function')
        ? global.dashboardLabs.loadDashboardStatsAndLabs()
        : Promise.resolve();

      const scheduleTask = (global.dashboardSchedule && typeof global.dashboardSchedule.loadDashboardSchedule === 'function')
        ? global.dashboardSchedule.loadDashboardSchedule()
        : Promise.resolve();

      await Promise.allSettled([labsTask, scheduleTask]);
    } catch (err) {
      console.error('[Dashboard] Error during dashboard initialization:', err);
    }
  }

  /**
   * Compatibility wrapper for loading laboratory stats and room cards.
   * Invoked by SSE real-time notifications in js/components/notifications.js.
   */
  function handleLoadStatsAndLabs() {
    if (global.dashboardLabs && typeof global.dashboardLabs.loadDashboardStatsAndLabs === 'function') {
      return global.dashboardLabs.loadDashboardStatsAndLabs();
    }
  }

  /**
   * Compatibility wrapper for loading teaching schedule timeline.
   */
  function handleLoadSchedule() {
    if (global.dashboardSchedule && typeof global.dashboardSchedule.loadDashboardSchedule === 'function') {
      return global.dashboardSchedule.loadDashboardSchedule();
    }
  }

  // Expose globally for compatibility (used by app.js, notifications.js, and inline retry buttons)
  global.initDashboard = initDashboard;
  global.loadDashboardStatsAndLabs = handleLoadStatsAndLabs;
  global.loadDashboardSchedule = handleLoadSchedule;

  // Auto-initialize if running on dashboard page
  if (typeof document !== 'undefined' && document.body && document.body.dataset.page === 'dashboard') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
      initDashboard();
    }
  }

})(typeof window !== 'undefined' ? window : this);
