/* ================================================================
   LabSync – MIS Staff Dashboard Controller  |  js/pages/mis-staff-dashboard.js
   Coordinating metrics, stat cards, greeting, activity feed, and modular reports table:
     - js/pages/mis-staff-dashboard/staff-dashboard.reports.js
   ================================================================ */

'use strict';

(function (global) {
  /**
   * Updates dynamic greeting text and subtext for MIS Staff based on local time.
   */
  function updateMISGreeting() {
    const now = new Date();
    const h = now.getHours();
    const greet = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
    const greetingEl = document.getElementById('greetingText');
    if (greetingEl) greetingEl.textContent = greet + ', MIS Staff!';
    const subEl = document.getElementById('greetingSub');
    if (subEl) {
      subEl.textContent = 'Manage system-wide hardware reports, administrative tasks, and the technical integrity of all IT laboratory spaces.';
    }
  }

  /**
   * Renders recent activity feed using shared ecosystem activity renderer.
   * @param {Array} reports - List of report objects
   */
  function renderActivityFeed(reports) {
    const feedContainer = document.getElementById('misDashboardActivityList') || document.querySelector('.activity-feed-list');
    if (!feedContainer) return;
    if (typeof global.renderEcosystemActivityFeed === 'function') {
      global.renderEcosystemActivityFeed(reports, feedContainer);
    }
  }

  let _currentReports = [];

  // Initialize in-memory reports from session cache if available
  try {
    const cachedReports = JSON.parse(sessionStorage.getItem('labsync_cached_reports') || 'null');
    if (Array.isArray(cachedReports)) {
      _currentReports = cachedReports;
    }
  } catch (e) { }

  /**
   * Fetches and binds live dashboard metrics, stat cards, report table, and activity feed.
   */
  async function loadDashboardData() {
    try {
      const fetchLabsFn = (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function')
        ? global.laboratoryService.fetchLaboratories
        : (typeof global.fetchLaboratories === 'function' ? global.fetchLaboratories : null);

      const fetchReportsFn = (global.reportService && typeof global.reportService.fetchReports === 'function')
        ? global.reportService.fetchReports
        : (typeof global.fetchReports === 'function' ? global.fetchReports : null);

      const labsPromise = typeof fetchLabsFn === 'function' ? fetchLabsFn().catch(() => []) : Promise.resolve([]);
      const reportsPromise = typeof fetchReportsFn === 'function' ? fetchReportsFn().catch(() => []) : Promise.resolve([]);

      const [reports, rooms] = await Promise.all([
        reportsPromise,
        labsPromise
      ]);

      if (Array.isArray(reports)) {
        _currentReports = reports;
      }

      // Compute metrics
      const totalTickets = Array.isArray(reports) ? reports.length : 0;
      const pendingTickets = Array.isArray(reports) ? reports.filter(r => (r.Status || '').toLowerCase() === 'pending') : [];
      const resolvedTickets = Array.isArray(reports) ? reports.filter(r => (r.Status || '').toLowerCase() === 'resolved').length : 0;
      const activeTickets = pendingTickets.length;
      const totalRooms = Array.isArray(rooms) ? rooms.length : 0;

      // Fetch PC counts using canonical laboratoryService.fetchRoomPCs
      let totalPcs = 0;
      if (Array.isArray(rooms) && rooms.length > 0) {
        const fetchPcsFn = (global.laboratoryService && typeof global.laboratoryService.fetchRoomPCs === 'function')
          ? global.laboratoryService.fetchRoomPCs
          : (typeof global.fetchRoomPCs === 'function' ? global.fetchRoomPCs : null);

        if (typeof fetchPcsFn === 'function') {
          const pcPromises = rooms.map(r => fetchPcsFn(r.Room_ID).catch(() => []));
          const pcLists = await Promise.all(pcPromises);
          totalPcs = pcLists.reduce((acc, pcs) => acc + (Array.isArray(pcs) ? pcs.length : 0), 0);
        }
      }

      // Update Stat Cards (silent background update)
      const pcsEl = document.getElementById('mis-stat-pcs');
      if (pcsEl && totalPcs > 0) pcsEl.textContent = totalPcs;
      const roomsEl = document.getElementById('mis-stat-rooms');
      if (roomsEl) roomsEl.textContent = `Across ${totalRooms} Room${totalRooms !== 1 ? 's' : ''}`;

      const pendingEl = document.getElementById('mis-stat-pending');
      if (pendingEl) pendingEl.textContent = activeTickets;
      const totalEl = document.getElementById('mis-stat-total');
      if (totalEl) totalEl.textContent = `${totalTickets} Total Tickets`;

      const resolvedEl = document.getElementById('mis-stat-resolved');
      if (resolvedEl) resolvedEl.textContent = resolvedTickets;

      // Render Recent Reports Table & Activity Feed
      if (global.staffDashboardReports && typeof global.staffDashboardReports.renderDashboardTable === 'function') {
        global.staffDashboardReports.renderDashboardTable(_currentReports);
      }
      renderActivityFeed(reports);
    } catch (err) {
      console.error('[MISDashboard] Error loading dashboard data:', err);
    }
  }

  /**
   * Initializes the MIS Staff Dashboard page listeners and elements.
   */
  function initMISDashboardPage() {
    // Sidebar scroll clue handling
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');
    if (sidebar && scrollClue) {
      if (sidebar.scrollHeight <= sidebar.clientHeight) scrollClue.style.display = 'none';
      sidebar.addEventListener('scroll', () => {
        scrollClue.style.opacity = sidebar.scrollTop > 10 ? '0' : '1';
      });
    }

    updateMISGreeting();
    loadDashboardData();

    // Fast in-memory live search filtering without refetching from server
    const searchInput = document.getElementById('dashboardSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        let reportsToFilter = _currentReports;
        if (!Array.isArray(reportsToFilter) || reportsToFilter.length === 0) {
          try {
            const cached = JSON.parse(sessionStorage.getItem('labsync_cached_reports') || 'null');
            if (Array.isArray(cached)) reportsToFilter = cached;
          } catch (e) { }
        }
        if (global.staffDashboardReports && typeof global.staffDashboardReports.renderDashboardTable === 'function') {
          global.staffDashboardReports.renderDashboardTable(reportsToFilter);
        }
      });
    }
  }

  // Auto-initialize on DOMContentLoaded
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initMISDashboardPage);
    } else {
      initMISDashboardPage();
    }
  }

  // Global exports for inline HTML handlers & coordinator
  global.loadDashboardData = loadDashboardData;
  global.resolveDashboardTicket = function (reportId) {
    if (global.staffDashboardReports && typeof global.staffDashboardReports.resolveDashboardTicket === 'function') {
      return global.staffDashboardReports.resolveDashboardTicket(reportId, loadDashboardData);
    }
  };

})(typeof window !== 'undefined' ? window : this);
