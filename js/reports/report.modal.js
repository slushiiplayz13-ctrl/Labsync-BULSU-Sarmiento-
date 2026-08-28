/**
 * LabSync Completed Tickets Modal Coordinator | js/reports/report.modal.js
 * Manages the resolved tickets history modal, time range chips, modal search filter, and backdrop dismissal.
 */

(function (global) {
  'use strict';

  let _modalInitialized = false;
  let _modalTimeFilter = 'all';

  function getEscapeFn() {
    return global.escapeHtml || window.escapeHtml || ((s) => s || '');
  }

  /**
   * Filters and renders resolved completed tickets in the modal.
   */
  function filterCompletedTickets() {
    const modal = document.getElementById('completedTicketsModal');
    const modalBody = document.getElementById('modalCompletedList');
    const countBadge = document.getElementById('modalResolvedCountBadge');
    if (!modal || !modalBody) return;

    const modalSearch = document.getElementById('modalTicketSearch');
    const query = modalSearch ? modalSearch.value.trim() : '';

    const allReports = (global.reportStore && typeof global.reportStore.getReports === 'function')
      ? global.reportStore.getReports()
      : (global.allReports || []);

    let resolved = allReports.filter(r => (r.Status || '').toLowerCase() === 'resolved');

    const filters = global.reportFilters;
    if (filters && typeof filters.filterByTimeRange === 'function') {
      resolved = filters.filterByTimeRange(resolved, _modalTimeFilter);
    }

    if (query) {
      const matchFn = (filters && typeof filters.matchesReportQuery === 'function')
        ? filters.matchesReportQuery
        : (global.matchesReportQuery || (() => true));
      resolved = resolved.filter(r => matchFn(r, query));
    }

    if (countBadge) {
      countBadge.textContent = `${resolved.length} Resolved`;
    }

    const escapeFn = getEscapeFn();

    if (resolved.length === 0) {
      modalBody.innerHTML = `
        <div class="ui-empty-state" style="padding: 48px 0;">
          <div class="ui-empty-icon" style="width: 48px; height: 48px; border-radius: 50%; background: #F1F5F9; color: #64748B; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            <i data-lucide="check-circle-2" style="width: 24px; height: 24px;"></i>
          </div>
          <p style="font-size: 14px; font-weight: 600; color: var(--text-dark, #0F172A); margin: 0 0 4px 0;">No completed tickets found</p>
          <p style="font-size: 12.5px; color: var(--text-muted, #94A3B8); margin: 0;">${query ? `No resolved logs match "${escapeFn(query)}".` : 'There are no completed tickets in this time range.'}</p>
        </div>
      `;
    } else {
      const renderModalCard = (global.reportRenderer && global.reportRenderer.renderModalTicketCard) || global.renderModalTicketCard;
      modalBody.innerHTML = `
        <div class="modal-tickets-grid">
          ${resolved.map(r => renderModalCard(r)).join('')}
        </div>
      `;
    }

    if (global.lucide) global.lucide.createIcons();
  }

  /**
   * Opens completed tickets modal and pre-fills search from page search if present.
   */
  function openCompletedModal() {
    const modal = document.getElementById('completedTicketsModal');
    if (!modal) return;

    if (!_modalInitialized) {
      _modalInitialized = true;

      const modalSearch = document.getElementById('modalTicketSearch');
      if (modalSearch) {
        modalSearch.addEventListener('input', () => {
          filterCompletedTickets();
        });
      }

      const timeChips = modal.querySelectorAll('[data-time-filter]');
      timeChips.forEach(chip => {
        chip.addEventListener('click', () => {
          timeChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          _modalTimeFilter = chip.dataset.timeFilter;
          filterCompletedTickets();
        });
      });
    }

    const pageSearch = document.getElementById('reportSearchInput');
    const modalSearch = document.getElementById('modalTicketSearch');
    if (pageSearch && modalSearch && !modalSearch.value) {
      modalSearch.value = pageSearch.value.trim();
    }

    filterCompletedTickets();
    modal.style.display = 'flex';
    if (global.lucide) global.lucide.createIcons();
  }

  /**
   * Closes completed tickets modal.
   */
  function closeCompletedModal() {
    const modal = document.getElementById('completedTicketsModal');
    if (modal) modal.style.display = 'none';
  }

  const reportModal = {
    openCompletedModal,
    closeCompletedModal,
    filterCompletedTickets
  };

  global.reportModal = reportModal;
  global.openCompletedModal = openCompletedModal;
  global.closeCompletedModal = closeCompletedModal;
  global.filterCompletedTickets = filterCompletedTickets;

})(typeof window !== 'undefined' ? window : this);
