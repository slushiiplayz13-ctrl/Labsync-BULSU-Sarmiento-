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
        processDeepLinkTicket();
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
   * Safely checks for ?ticket=, ?id=, or ?room= in URL.
   * - ?ticket= or ?id=: highlights row and opens matching ticket
   * - ?room=: validates room param, sets search bar to the room, and applies filter
   */
  function processDeepLinkTicket() {
    try {
      if (typeof window === 'undefined' || !window.location || !window.location.search) return;

      const urlParams = new URLSearchParams(window.location.search);
      const ticketParam = urlParams.get('ticket') || urlParams.get('id');
      const roomParam = urlParams.get('room');

      // 1. Room deep-link handling
      if (roomParam) {
        const cleanRoom = decodeURIComponent(roomParam).trim();
        // Validate room: alphanumeric + spaces/hyphens, reasonable length
        if (cleanRoom && cleanRoom.length <= 30 && /^[\w\s-]+$/i.test(cleanRoom)) {
          const searchInput = document.getElementById('maintenanceSearchInput');
          if (searchInput) {
            // Set filter to 'all' so active reports in that room are shown
            filterStatus('all');
            searchInput.value = cleanRoom.toLowerCase().startsWith('room') ? cleanRoom : `Room ${cleanRoom}`;
            applyFiltersAndRender();
          }
        }
        // Clean query parameter from URL
        if (window.history && typeof window.history.replaceState === 'function') {
          const cleanUrl = window.location.pathname + (window.location.hash || '');
          window.history.replaceState({}, document.title, cleanUrl);
        }
        return;
      }

      // 2. Ticket deep-link handling
      if (!ticketParam) return;

      // Extract numeric ID from patterns like "LS-TKT-18", "TKT-18", "18"
      const match = ticketParam.match(/(\d+)/);
      if (!match) return;

      const reportId = Number(match[1]);
      if (isNaN(reportId) || reportId <= 0) return;

      const matchingReport = maintenanceReports.find(r => Number(r.Report_ID) === reportId);
      if (matchingReport) {
        // Ensure the report is visible in the table regardless of active status filter
        const isResolved = (matchingReport.Status || '').toLowerCase() === 'resolved';
        if (activeFilter === 'pending' && isResolved) {
          filterStatus('all');
        } else if (activeFilter === 'resolved' && !isResolved) {
          filterStatus('all');
        }

        // Highlight matching row in the maintenance table and scroll it smoothly into view
        setTimeout(() => {
          const targetRow = document.querySelector(`tr.maintenance-row[data-report-id="${matchingReport.Report_ID}"]`);
          if (targetRow) {
            document.querySelectorAll('tr.maintenance-row.highlighted-ticket').forEach(el => el.classList.remove('highlighted-ticket'));
            targetRow.classList.add('highlighted-ticket');
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);

        // Clean query parameter from URL to prevent re-triggering upon refresh
        if (window.history && typeof window.history.replaceState === 'function') {
          const cleanUrl = window.location.pathname + (window.location.hash || '');
          window.history.replaceState({}, document.title, cleanUrl);
        }
      }
    } catch (e) {
      // Safe fallback - do not crash page or expose internal errors
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

    // Delegated click listener for table actions, modals, and filters (CSP compliant)
    document.addEventListener('click', (e) => {
      // View Ticket Details / "+ N others" reporter button
      const viewBtn = e.target.closest('[data-action="view-ticket-details"], .ticket-chip, .btn-others-count');
      if (viewBtn) {
        e.preventDefault();
        e.stopPropagation();
        const reportId = viewBtn.getAttribute('data-report-id') || viewBtn.closest('[data-report-id]')?.getAttribute('data-report-id');
        if (reportId) {
          handleViewTicketModal(reportId);
        }
        return;
      }

      // Resolve button in table row
      const resolveBtn = e.target.closest('.btn-resolve-ticket[data-action="resolve-ticket"]');
      if (resolveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const reportId = resolveBtn.getAttribute('data-report-id');
        if (reportId && global.maintenanceActions && typeof global.maintenanceActions.updateReportStatus === 'function') {
          global.maintenanceActions.updateReportStatus(reportId, 'Resolved');
        } else if (reportId && typeof global.updateReportStatus === 'function') {
          global.updateReportStatus(reportId, 'Resolved');
        }
        return;
      }

      // Resolve button inside modal
      const resolveModalBtn = e.target.closest('.btn-resolve-ticket[data-action="resolve-ticket-modal"]');
      if (resolveModalBtn) {
        e.preventDefault();
        e.stopPropagation();
        const reportId = resolveModalBtn.getAttribute('data-report-id');
        if (global.maintenanceModal && typeof global.maintenanceModal.closeTicketModal === 'function') {
          global.maintenanceModal.closeTicketModal();
        } else {
          const modal = document.getElementById('ticket-details-modal');
          if (modal) modal.remove();
        }
        if (reportId && global.maintenanceActions && typeof global.maintenanceActions.updateReportStatus === 'function') {
          global.maintenanceActions.updateReportStatus(reportId, 'Resolved');
        } else if (reportId && typeof global.updateReportStatus === 'function') {
          global.updateReportStatus(reportId, 'Resolved');
        }
        return;
      }

      // Modal close button or clicking outside the card on the backdrop
      const closeBtn = e.target.closest('[data-action="close-modal"], .btn-modal-close');
      const isBackdropClick = e.target.id === 'ticket-details-modal';
      if (closeBtn || isBackdropClick) {
        e.preventDefault();
        e.stopPropagation();
        if (global.maintenanceModal && typeof global.maintenanceModal.closeTicketModal === 'function') {
          global.maintenanceModal.closeTicketModal();
        } else {
          const modal = document.getElementById('ticket-details-modal');
          if (modal) modal.remove();
        }
        return;
      }


      // Filter pills
      const filterPill = e.target.closest('.filter-pill');
      if (filterPill) {
        e.preventDefault();
        const id = filterPill.id || '';
        const status = id.replace('filter-', '') || 'all';
        filterStatus(status);
        return;
      }
    });

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
