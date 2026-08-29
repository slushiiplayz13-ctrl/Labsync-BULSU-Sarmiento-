/* ================================================================
   LabSync – MIS Maintenance Tracker Coordinator  |  js/pages/mis-maintenance.js
   Coordinating lifecycle, filter/search state, stats, and modular subcomponents:
     - js/pages/mis-maintenance/maintenance.renderer.js
     - js/pages/mis-maintenance/maintenance.modal.js
     - js/pages/mis-maintenance/maintenance.actions.js
   ================================================================ */

'use strict';

(function (global) {
  // Page-local state
  let maintenanceReports = [];
  let activeFilter = 'all';

  // Initialize in-memory reports from session cache if available
  try {
    const cached = JSON.parse(sessionStorage.getItem('labsync_cached_reports') || 'null');
    if (Array.isArray(cached) && cached.length > 0) {
      maintenanceReports = cached;
      calculateStats(maintenanceReports);
    }
  } catch (e) { }

  /**
   * Calculates total, pending, and resolved metrics and updates top stat cards.
   * @param {Array} reports - Array of report objects
   */
  function calculateStats(reports) {
    const list = Array.isArray(reports) ? reports : [];
    const total = list.length;
    const pending = list.filter(r => r.Status !== 'Resolved').length;
    const resolved = list.filter(r => r.Status === 'Resolved').length;

    const totalEl = document.getElementById('stat-total');
    const pendingEl = document.getElementById('stat-pending');
    const resolvedEl = document.getElementById('stat-resolved');

    if (totalEl) totalEl.textContent = total;
    if (pendingEl) pendingEl.textContent = pending;
    if (resolvedEl) resolvedEl.textContent = resolved;
  }

  /**
   * Updates active filter pill UI and triggers table re-render.
   * @param {string} status - Filter name ('all', 'pending', 'resolved')
   */
  function filterStatus(status) {
    activeFilter = status;
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`filter-${status}`);
    if (activeBtn) activeBtn.classList.add('active');
    applyFiltersAndRender();
  }

  /**
   * Filters reports according to activeFilter and maintenanceSearchInput value, then delegates rendering.
   */
  function applyFiltersAndRender() {
    const searchInput = document.getElementById('maintenanceSearchInput');
    const searchVal = (searchInput?.value || '').toLowerCase().trim();

    const parserFn = (global.reportParser && typeof global.reportParser.parseIssueDescription === 'function')
      ? global.reportParser.parseIssueDescription
      : ((global.maintenanceRenderer && typeof global.maintenanceRenderer.parseIssueDesc === 'function')
        ? global.maintenanceRenderer.parseIssueDesc
        : (desc) => ({ section: 'N/A', issues: 'Hardware Issue', remarks: desc || '' }));

    const filtered = maintenanceReports.filter(report => {
      // Status filter
      const status = (report.Status || '').toLowerCase();
      if (activeFilter === 'pending' && status === 'resolved') return false;
      if (activeFilter === 'resolved' && status !== 'resolved') return false;

      // Search filter
      if (searchVal) {
        const parsed = parserFn(report.Issue_Description);

        const idStr = report.Report_ID != null ? String(report.Report_ID) : '';
        const formattedId = idStr ? `ls-tkt-${idStr}` : '';
        const shortTktId = idStr ? `tkt-${idStr}` : '';

        const studentName = (report.Student_Name || '').toLowerCase();
        const roomNum = report.Room_Number != null ? String(report.Room_Number).toLowerCase() : '';
        const roomFormatted = roomNum ? `room ${roomNum}` : '';
        const pcNum = report.PC_Number != null ? String(report.PC_Number).toLowerCase() : '';
        const pcFormatted = pcNum ? `pc ${pcNum}` : '';
        const pcHashFormatted = pcNum ? `pc #${pcNum}` : '';
        const issueDesc = (report.Issue_Description || '').toLowerCase();
        const section = (parsed.section || '').toLowerCase();
        const issues = (parsed.issues || '').toLowerCase();
        const remarks = (parsed.remarks || '').toLowerCase();
        const priority = (report.Priority_Level || '').toLowerCase();

        const match =
          idStr.includes(searchVal) ||
          formattedId.includes(searchVal) ||
          shortTktId.includes(searchVal) ||
          studentName.includes(searchVal) ||
          roomNum.includes(searchVal) ||
          roomFormatted.includes(searchVal) ||
          pcNum.includes(searchVal) ||
          pcFormatted.includes(searchVal) ||
          pcHashFormatted.includes(searchVal) ||
          issueDesc.includes(searchVal) ||
          section.includes(searchVal) ||
          issues.includes(searchVal) ||
          remarks.includes(searchVal) ||
          priority.includes(searchVal) ||
          status.includes(searchVal);

        if (!match) return false;
      }

      return true;
    });

    if (global.maintenanceRenderer && typeof global.maintenanceRenderer.renderTableRows === 'function') {
      global.maintenanceRenderer.renderTableRows(filtered);
    }
  }

  /**
   * Primary loader function fetching reports via actions module and rendering stats & table.
   */
  async function loadMaintenanceData() {
    try {
      const fetchFn = (global.maintenanceActions && typeof global.maintenanceActions.fetchMaintenanceReports === 'function')
        ? global.maintenanceActions.fetchMaintenanceReports
        : ((global.reportService && typeof global.reportService.fetchReports === 'function')
          ? global.reportService.fetchReports
          : null);

      if (typeof fetchFn === 'function') {
        maintenanceReports = await fetchFn();
      } else {
        const response = await fetch('/api/reports', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to fetch reports');
        maintenanceReports = await response.json();
      }

      if (Array.isArray(maintenanceReports)) {
        calculateStats(maintenanceReports);
        applyFiltersAndRender();
      }
    } catch (error) {
      console.error('[MISMaintenance] Error loading maintenance data:', error);
      if ((!Array.isArray(maintenanceReports) || maintenanceReports.length === 0) &&
          global.maintenanceRenderer && typeof global.maintenanceRenderer.renderTableError === 'function') {
        global.maintenanceRenderer.renderTableError();
      }
    }
  }

  /**
   * Presents ticket details modal with current reports list.
   * @param {number} reportId
   */
  function handleViewTicketModal(reportId) {
    if (global.maintenanceModal && typeof global.maintenanceModal.viewTicketModal === 'function') {
      global.maintenanceModal.viewTicketModal(reportId, maintenanceReports);
    }
  }

  /**
   * Initializes sidebar scroll clue, search input listener, and triggers initial load.
   */
  function initMISMaintenancePage() {
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');

    if (sidebar && scrollClue) {
      if (sidebar.scrollHeight <= sidebar.clientHeight) {
        scrollClue.style.display = 'none';
      }
      sidebar.addEventListener('scroll', () => {
        if (sidebar.scrollTop > 10) {
          scrollClue.style.opacity = '0';
        } else {
          scrollClue.style.opacity = '1';
        }
      });
    }

    const searchInput = document.getElementById('maintenanceSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', applyFiltersAndRender);
    }

    loadMaintenanceData();
  }

  // Auto-initialize on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMISMaintenancePage);
  } else {
    initMISMaintenancePage();
  }

  // Global compatibility bridges
  global.loadMaintenanceData = loadMaintenanceData;
  global.filterStatus = filterStatus;
  global.viewTicketModal = handleViewTicketModal;
  global.applyFiltersAndRender = applyFiltersAndRender;
  global.calculateStats = calculateStats;

})(typeof window !== 'undefined' ? window : this);
