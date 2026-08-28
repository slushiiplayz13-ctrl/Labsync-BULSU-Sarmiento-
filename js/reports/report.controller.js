/**
 * LabSync Report Page Controller | js/reports/report.controller.js
 * Coordinates report data loading, live filtering, dynamic list rendering, and page events.
 */

(function (global) {
  'use strict';

  function getEscapeFn() {
    return global.escapeHtml || window.escapeHtml || ((s) => s || '');
  }

  /**
   * Loads reports from API into reactive reportStore and renders the UI list.
   */
  async function loadReports() {
    try {
      let reports = [];
      const service = global.reportService;
      if (service && typeof service.fetchReports === 'function') {
        reports = await service.fetchReports();
      } else {
        const response = await fetch('/api/reports', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load reports');
        reports = await response.json();
      }

      if (global.reportStore && typeof global.reportStore.setReports === 'function') {
        global.reportStore.setReports(reports);
      } else {
        global.allReports = reports;
      }

      renderReports();
    } catch (error) {
      console.error('[ReportController] Error loading reports:', error);
      const container = document.getElementById('dynamicReportsList');
      if (container) {
        container.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
              <i data-lucide="alert-circle"></i>
            </div>
            <p>Failed to load reports. Please try again later.</p>
          </div>
        `;
      }
      if (global.lucide) global.lucide.createIcons();
    }
  }

  /**
   * Renders the dynamic reports list based on active search input and report status.
   */
  function renderReports() {
    const container = document.getElementById('dynamicReportsList');
    if (!container) return;

    const searchInput = document.getElementById('reportSearchInput');
    const query = searchInput ? searchInput.value.trim() : '';

    const reports = (global.reportStore && typeof global.reportStore.getReports === 'function')
      ? global.reportStore.getReports()
      : (global.allReports || []);

    const matchFn = (global.reportFilters && typeof global.reportFilters.matchesReportQuery === 'function')
      ? global.reportFilters.matchesReportQuery
      : (global.matchesReportQuery || (() => true));

    const totalResolvedReports = reports.filter(r => (r.Status || '').toLowerCase() === 'resolved');
    const filteredReports = reports.filter(r => matchFn(r, query));
    const activeReports = filteredReports.filter(r => (r.Status || '').toLowerCase() !== 'resolved');
    const resolvedReports = filteredReports.filter(r => (r.Status || '').toLowerCase() === 'resolved');

    // Update view completed button in header
    const toggleContainer = document.getElementById('completedToggleContainer');
    if (toggleContainer) {
      if (totalResolvedReports.length > 0) {
        toggleContainer.innerHTML = `
          <button class="toggle-completed-btn" onclick="window.openCompletedModal()">
            <i data-lucide="history" style="width:16px;height:16px;"></i>
            <span>View Completed Tickets</span>
          </button>
        `;
      } else {
        toggleContainer.innerHTML = '';
      }
    }

    let htmlContent = '';
    const renderSingleCardFn = (global.reportRenderer && global.reportRenderer.renderSingleCard) || global.renderSingleCard;

    if (activeReports.length > 0) {
      htmlContent += `
        <div class="report-section active-section">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid var(--border-light);">
            <div style="width:10px; height:10px; border-radius:50%; background:#F59E0B; box-shadow:0 0 8px rgba(245,158,11,0.5);"></div>
            <h4 style="font-size:14px; font-weight:700; color:var(--text-dark); text-transform:uppercase; letter-spacing:0.5px;">Active Tickets (${activeReports.length})</h4>
          </div>
          <div class="reports-list">
            ${activeReports.map(r => renderSingleCardFn(r)).join('')}
          </div>
        </div>
      `;
    }

    const escapeFn = getEscapeFn();

    if (!htmlContent) {
      if (query) {
        if (resolvedReports.length > 0) {
          container.innerHTML = `
            <div class="ui-empty-state">
              <div class="ui-empty-icon">
                <i data-lucide="search" style="width:24px;height:24px;"></i>
              </div>
              <p>No active PC issue reports match "<strong>${escapeFn(query)}</strong>".</p>
              <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">Found ${resolvedReports.length} matching completed ticket(s). <a href="javascript:void(0)" onclick="window.openCompletedModal()" style="color:var(--primary-teal); font-weight:600; text-decoration:underline;">Click here to view completed history</a>.</p>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="ui-empty-state">
              <div class="ui-empty-icon">
                <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
              </div>
              <p>No PC issue reports match "<strong>${escapeFn(query)}</strong>".</p>
            </div>
          `;
        }
      } else {
        if (totalResolvedReports.length > 0) {
          container.innerHTML = `
            <div class="ui-empty-state">
              <div class="ui-empty-icon">
                <i data-lucide="check-circle-2" style="width:24px;height:24px;color:#10B981;"></i>
              </div>
              <p>No active PC issue reports. All tickets are completed. Click "View Completed Tickets" to view history.</p>
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="ui-empty-state">
              <div class="ui-empty-icon">
                <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
              </div>
              <p>No PC issue reports yet. Submitted tickets will appear here when available.</p>
            </div>
          `;
        }
      }
    } else {
      container.innerHTML = htmlContent;
    }

    if (global.lucide) global.lucide.createIcons();
  }

  /**
   * Initializes page event listeners and initial report loading.
   */
  function initReportPage() {
    const searchInput = document.getElementById('reportSearchInput');

    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && searchInput) {
      searchInput.value = `Room ${roomParam}`;
    }

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderReports();
        const modal = document.getElementById('completedTicketsModal');
        if (modal && modal.style.display !== 'none') {
          const filterCompletedFn = (global.reportModal && global.reportModal.filterCompletedTickets) || global.filterCompletedTickets;
          if (filterCompletedFn) filterCompletedFn();
        }
      });
    }

    document.addEventListener('click', (e) => {
      const modal = document.getElementById('completedTicketsModal');
      if (modal && e.target === modal) {
        const closeModalFn = (global.reportModal && global.reportModal.closeCompletedModal) || global.closeCompletedModal;
        if (closeModalFn) closeModalFn();
      }
    });

    loadReports();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReportPage);
  } else {
    initReportPage();
  }

  const reportController = {
    loadReports,
    renderReports,
    initReportPage
  };

  global.reportController = reportController;
  global.loadReports = loadReports;
  global.renderReports = renderReports;

})(typeof window !== 'undefined' ? window : this);
