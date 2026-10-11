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
      const fetchFn = global.fetchReports || (global.reportService && global.reportService.fetchReports);
      if (typeof fetchFn === 'function') {
        reports = await fetchFn();
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

      populateFilterOptions();
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
   * Generates a stable signature for reports, query, and active filters to prevent redundant DOM rewrites.
   * @param {Array} reports
   * @param {string} query
   * @param {Object} [filters]
   * @returns {string}
   */
  function createReportSignature(reports, query, filters) {
    if (!Array.isArray(reports)) return '__EMPTY__';
    const q = (query || '').trim().toLowerCase();
    const fStr = filters ? JSON.stringify(filters) : '';
    const rows = reports.map(r => `${r.Report_ID || ''}_${r.Status || ''}_${r.Follow_Up_Count || 0}_${r.Room_Number || ''}_${r.PC_Number || ''}_${r.Student_Name || ''}_${r.Priority_Level || ''}_${r.Date_Reported || ''}`);
    return `sig_${rows.join('|')}__q_${q}__f_${fStr}`;
  }

  /**
   * Renders the dynamic reports list based on active search input, advanced filters, and report status.
   * @param {Array} [customReports] Optional custom reports list (e.g. from cache)
   * @param {HTMLElement|string} [targetContainer] Optional target container element
   */
  function renderReports(customReports, targetContainer) {
    const container = typeof targetContainer === 'string'
      ? document.querySelector(targetContainer)
      : (targetContainer || document.getElementById('dynamicReportsList'));
    if (!container) return;

    const searchInput = document.getElementById('reportSearchInput');
    const query = searchInput ? searchInput.value.trim() : '';

    const filters = global.reportFilters;
    const activeFilters = (filters && typeof filters.getActiveFilters === 'function')
      ? filters.getActiveFilters()
      : {};
    const activeFiltersCount = (filters && typeof filters.countActiveFilters === 'function')
      ? filters.countActiveFilters(activeFilters)
      : 0;

    const rawReports = customReports || ((global.reportStore && typeof global.reportStore.getReports === 'function')
      ? global.reportStore.getReports()
      : (global.allReports || []));

    const reports = Array.isArray(rawReports) ? [...rawReports].sort((a, b) => {
      const timeA = new Date(a.Date_Reported || a.Created_At || 0).getTime();
      const timeB = new Date(b.Date_Reported || b.Created_At || 0).getTime();
      if (timeB !== timeA) return timeB - timeA;
      const idA = Number(String(a.Report_ID || a.Issue_ID || 0).replace(/\D/g, '')) || 0;
      const idB = Number(String(b.Report_ID || b.Issue_ID || 0).replace(/\D/g, '')) || 0;
      return idB - idA;
    }) : [];

    const matchQueryFn = (filters && typeof filters.matchesReportQuery === 'function')
      ? filters.matchesReportQuery
      : (global.matchesReportQuery || (() => true));
    const matchFiltersFn = (filters && typeof filters.matchesReportFilters === 'function')
      ? filters.matchesReportFilters
      : (() => true);

    const totalResolvedReports = reports.filter(r => (r.Status || r.status || '').toLowerCase() === 'resolved');

    // Filter reports by both search query AND active filters (AND logic)
    const filteredReports = reports.filter(r => matchQueryFn(r, query) && matchFiltersFn(r, activeFilters));

    const isResolvedStatusFilter = (activeFilters.status || '').toLowerCase() === 'resolved';

    let activeReports;
    let resolvedReports;

    if (isResolvedStatusFilter) {
      activeReports = [];
      resolvedReports = filteredReports;
    } else if (activeFilters.status) {
      activeReports = filteredReports.filter(r => (r.Status || r.status || '').toLowerCase() !== 'resolved');
      resolvedReports = [];
    } else {
      activeReports = filteredReports.filter(r => (r.Status || r.status || '').toLowerCase() !== 'resolved');
      resolvedReports = filteredReports.filter(r => (r.Status || r.status || '').toLowerCase() === 'resolved');
    }

    const signature = createReportSignature(filteredReports, query, activeFilters);
    if (container._lastRenderSignature === signature && container.querySelector('.report-card, .ui-empty-state') !== null) {
      // Data unchanged, sync UI controls and skip DOM replacement to prevent flicker
      syncFilterUI(activeFiltersCount, filteredReports.length);
      return;
    }
    container._lastRenderSignature = signature;

    // Update view completed button in header
    const toggleContainer = document.getElementById('completedToggleContainer');
    if (toggleContainer) {
      if (totalResolvedReports.length > 0) {
        toggleContainer.innerHTML = `
          <button type="button" class="toggle-completed-btn" id="btn-view-completed-tickets" data-action="open-completed-modal" title="View Completed Tickets" aria-label="View Completed Tickets">
            <i data-lucide="history" style="width:16px;height:16px;flex-shrink:0;"></i>
            <span class="btn-text-full">View Completed Tickets</span>
            <span class="btn-text-short">Completed Ticket</span>
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
          <div class="report-section-header" style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid var(--border-light); flex-shrink:0;">
            <div style="width:10px; height:10px; border-radius:50%; background:#F59E0B; box-shadow:0 0 8px rgba(245,158,11,0.5);"></div>
            <h4 style="font-size:14px; font-weight:700; color:var(--text-dark); text-transform:uppercase; letter-spacing:0.5px;">Active Tickets (${activeReports.length})</h4>
          </div>
          <div class="reports-list">
            ${activeReports.map(r => renderSingleCardFn(r)).join('')}
          </div>
        </div>
      `;
    } else if (isResolvedStatusFilter && resolvedReports.length > 0) {
      htmlContent += `
        <div class="report-section resolved-section">
          <div class="report-section-header" style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid var(--border-light); flex-shrink:0;">
            <div style="width:10px; height:10px; border-radius:50%; background:#10B981; box-shadow:0 0 8px rgba(16,185,129,0.5);"></div>
            <h4 style="font-size:14px; font-weight:700; color:var(--text-dark); text-transform:uppercase; letter-spacing:0.5px;">Resolved Tickets (${resolvedReports.length})</h4>
          </div>
          <div class="reports-list">
            ${resolvedReports.map(r => renderSingleCardFn(r)).join('')}
          </div>
        </div>
      `;
    }

    const escapeFn = getEscapeFn();

    if (!htmlContent) {
      if (activeFiltersCount > 0 || query) {
        if (resolvedReports.length > 0 && !isResolvedStatusFilter) {
          container.innerHTML = `
            <div class="ui-empty-state">
              <div class="ui-empty-icon">
                <i data-lucide="search" style="width:24px;height:24px;"></i>
              </div>
              <p>No active PC issue reports match ${activeFiltersCount > 0 ? 'the selected filters' : `\"<strong>${escapeFn(query)}</strong>\"`}.</p>
              <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">Found ${resolvedReports.length} matching completed ticket(s). <a href="javascript:void(0)" class="open-completed-link" data-action="open-completed-modal" style="color:var(--primary-teal); font-weight:600; text-decoration:underline; cursor:pointer;">Click here to view completed history</a>.</p>
              ${activeFiltersCount > 0 ? '<button type="button" class="btn-clear-empty-filters" onclick="if(window.reportController)window.reportController.resetAllFilters()">Clear Filters</button>' : ''}
            </div>
          `;
        } else {
          container.innerHTML = `
            <div class="ui-empty-state">
              <div class="ui-empty-icon">
                <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
              </div>
              <p>No PC issue reports match ${activeFiltersCount > 0 && query ? `\"<strong>${escapeFn(query)}</strong>\" with the selected filters` : activeFiltersCount > 0 ? 'the selected filters' : `\"<strong>${escapeFn(query)}</strong>\"`}.</p>
              ${activeFiltersCount > 0 ? '<button type="button" class="btn-clear-empty-filters" onclick="if(window.reportController)window.reportController.resetAllFilters()">Clear Filters</button>' : ''}
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

    syncFilterUI(activeFiltersCount, filteredReports.length);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: container });
      if (toggleContainer) global.lucide.createIcons({ root: toggleContainer });
    }
  }

  /**
   * Synchronizes Filter button active state, badge counter, and active filter tags bar.
   * @param {number} [activeCount]
   * @param {number} [matchCount]
   */
  function syncFilterUI(activeCount, matchCount) {
    const filters = global.reportFilters;
    const activeFilters = (filters && typeof filters.getActiveFilters === 'function')
      ? filters.getActiveFilters()
      : {};
    const count = typeof activeCount === 'number'
      ? activeCount
      : (filters && typeof filters.countActiveFilters === 'function' ? filters.countActiveFilters(activeFilters) : 0);

    const filterBtn = document.getElementById('btnReportsFilter');
    const badge = document.getElementById('reportsFilterBadge');
    if (filterBtn && badge) {
      if (count > 0) {
        badge.textContent = String(count);
        badge.style.display = 'inline-flex';
        filterBtn.classList.add('active');
        filterBtn.setAttribute('title', `${count} active filter(s) applied`);
      } else {
        badge.style.display = 'none';
        filterBtn.classList.remove('active');
        filterBtn.setAttribute('title', 'Filter reports');
      }
    }

    const filterBar = document.getElementById('reportsActiveFilterBar');
    const chipsContainer = document.getElementById('reportsActiveFilterChips');
    const escapeFn = getEscapeFn();

    if (filterBar && chipsContainer) {
      if (count > 0) {
        filterBar.style.display = 'flex';
        let chipsHtml = '';
        if (activeFilters.issueType) {
          chipsHtml += `<span class="active-filter-chip">Issue: ${escapeFn(activeFilters.issueType)} <button type="button" class="chip-remove" data-clear-prop="issueType" aria-label="Remove issue type filter">×</button></span>`;
        }
        if (activeFilters.roomNumber) {
          chipsHtml += `<span class="active-filter-chip">Room: ${escapeFn(activeFilters.roomNumber)} <button type="button" class="chip-remove" data-clear-prop="roomNumber" aria-label="Remove room filter">×</button></span>`;
        }
        if (activeFilters.pcNumber) {
          chipsHtml += `<span class="active-filter-chip">PC: ${escapeFn(activeFilters.pcNumber)} <button type="button" class="chip-remove" data-clear-prop="pcNumber" aria-label="Remove PC number filter">×</button></span>`;
        }
        if (activeFilters.status) {
          chipsHtml += `<span class="active-filter-chip">Status: ${escapeFn(activeFilters.status)} <button type="button" class="chip-remove" data-clear-prop="status" aria-label="Remove status filter">×</button></span>`;
        }
        if (activeFilters.dateFrom || activeFilters.dateTo) {
          const dateLabel = activeFilters.dateFrom && activeFilters.dateTo
            ? `${activeFilters.dateFrom} to ${activeFilters.dateTo}`
            : activeFilters.dateFrom ? `From ${activeFilters.dateFrom}` : `Up to ${activeFilters.dateTo}`;
          chipsHtml += `<span class="active-filter-chip">Date: ${escapeFn(dateLabel)} <button type="button" class="chip-remove" data-clear-prop="dates" aria-label="Remove date range filter">×</button></span>`;
        }
        if (activeFilters.section) {
          chipsHtml += `<span class="active-filter-chip">Section: ${escapeFn(activeFilters.section)} <button type="button" class="chip-remove" data-clear-prop="section" aria-label="Remove section filter">×</button></span>`;
        }
        chipsContainer.innerHTML = chipsHtml;
      } else {
        filterBar.style.display = 'none';
        chipsContainer.innerHTML = '';
      }
    }
  }

  const FILTER_SELECT_MAP = [
    { selectId: 'filterIssueType', wrapperId: 'customSelectIssueType', defaultLabel: 'All Issue Types' },
    { selectId: 'filterRoomNumber', wrapperId: 'customSelectRoomNumber', defaultLabel: 'All Rooms' },
    { selectId: 'filterPCNumber', wrapperId: 'customSelectPCNumber', defaultLabel: 'All PCs' },
    { selectId: 'filterStatus', wrapperId: 'customSelectStatus', defaultLabel: 'All Statuses' },
    { selectId: 'filterStudentSection', wrapperId: 'customSelectStudentSection', defaultLabel: 'All Sections' }
  ];

  /**
   * Synchronizes options and selected state of a filter custom select dropdown
   * from its corresponding native <select> element.
   */
  function syncFilterCustomSelectUI(selectId, wrapperId, defaultLabel) {
    const select = document.getElementById(selectId);
    const wrapper = document.getElementById(wrapperId);
    if (!select || !wrapper) return;

    const triggerSpan = wrapper.querySelector('.custom-select-value');
    const dropdown = wrapper.querySelector('.custom-select-dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    Array.from(select.options).forEach(opt => {
      const optDiv = document.createElement('div');
      const isSelected = opt.value === select.value;
      optDiv.className = 'custom-select-option' + (isSelected ? ' selected' : '');
      optDiv.dataset.value = opt.value;
      optDiv.textContent = opt.textContent;
      optDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        wrapper.classList.remove('open');
        wrapper.classList.remove('open-upward');
        const trigger = wrapper.querySelector('.custom-select-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        syncFilterCustomSelectUI(selectId, wrapperId, defaultLabel);
      });
      dropdown.appendChild(optDiv);
    });

    const selectedOpt = select.options[select.selectedIndex];
    if (triggerSpan) {
      triggerSpan.textContent = selectedOpt ? selectedOpt.textContent : defaultLabel;
    }
  }

  function syncAllFilterCustomSelects() {
    FILTER_SELECT_MAP.forEach(({ selectId, wrapperId, defaultLabel }) => {
      syncFilterCustomSelectUI(selectId, wrapperId, defaultLabel);
    });
  }

  function setupFilterCustomSelectEvents() {
    FILTER_SELECT_MAP.forEach(({ selectId, wrapperId, defaultLabel }) => {
      const wrapper = document.getElementById(wrapperId);
      const select = document.getElementById(selectId);
      if (!wrapper) return;

      const trigger = wrapper.querySelector('.custom-select-trigger');
      if (trigger && !trigger.dataset.bound) {
        trigger.dataset.bound = 'true';
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = wrapper.classList.contains('open');

          document.querySelectorAll('.filter-custom-select').forEach(w => {
            if (w !== wrapper) {
              w.classList.remove('open');
              w.classList.remove('open-upward');
              const t = w.querySelector('.custom-select-trigger');
              if (t) t.setAttribute('aria-expanded', 'false');
            }
          });

          if (!isOpen) {
            const rect = wrapper.getBoundingClientRect();
            const filterBody = document.querySelector('.filter-dropdown-body');
            const bodyRect = filterBody ? filterBody.getBoundingClientRect() : null;
            if (bodyRect && rect.bottom + 180 > bodyRect.bottom && rect.top - 180 > bodyRect.top) {
              wrapper.classList.add('open-upward');
            } else {
              wrapper.classList.remove('open-upward');
            }
            wrapper.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
          } else {
            wrapper.classList.remove('open');
            wrapper.classList.remove('open-upward');
            trigger.setAttribute('aria-expanded', 'false');
          }
        });
      }

      if (select && !select.dataset.bound) {
        select.dataset.bound = 'true';
        select.addEventListener('change', () => {
          syncFilterCustomSelectUI(selectId, wrapperId, defaultLabel);
        });
      }
    });

    if (!global._filterCustomSelectDismissBound) {
      global._filterCustomSelectDismissBound = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.filter-custom-select')) {
          document.querySelectorAll('.filter-custom-select').forEach(w => {
            w.classList.remove('open');
            w.classList.remove('open-upward');
            const t = w.querySelector('.custom-select-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
          });
        }
      });
    }
  }

  /**
   * Dynamically populates dropdown select options from loaded report data.
   */
  function populateFilterOptions() {
    const filters = global.reportFilters;
    if (!filters || typeof filters.extractFilterOptions !== 'function') return;

    const rawReports = (global.reportStore && typeof global.reportStore.getReports === 'function')
      ? global.reportStore.getReports()
      : (global.allReports || []);

    const options = filters.extractFilterOptions(rawReports);
    const activeFilters = filters.getActiveFilters ? filters.getActiveFilters() : {};
    const escapeFn = getEscapeFn();

    // 1. Issue Types
    const issueTypeSelect = document.getElementById('filterIssueType');
    if (issueTypeSelect) {
      const currentVal = activeFilters.issueType || issueTypeSelect.value;
      issueTypeSelect.innerHTML = '<option value="">All Issue Types</option>' +
        options.issueTypes.map(t => `<option value="${escapeFn(t)}">${escapeFn(t)}</option>`).join('');
      if (currentVal) issueTypeSelect.value = currentVal;
    }

    // 2. Room Numbers
    const roomSelect = document.getElementById('filterRoomNumber');
    if (roomSelect) {
      const currentVal = activeFilters.roomNumber || roomSelect.value;
      roomSelect.innerHTML = '<option value="">All Rooms</option>' +
        options.rooms.map(r => `<option value="${escapeFn(r)}">Room ${escapeFn(r)}</option>`).join('');
      if (currentVal) roomSelect.value = currentVal;
    }

    // 3. PC Numbers
    updatePCNumberOptions(options, activeFilters.roomNumber || (roomSelect ? roomSelect.value : ''));

    // 4. Student Sections
    const sectionSelect = document.getElementById('filterStudentSection');
    if (sectionSelect) {
      const currentVal = activeFilters.section || sectionSelect.value;
      sectionSelect.innerHTML = '<option value="">All Sections</option>' +
        options.sections.map(s => `<option value="${escapeFn(s)}">${escapeFn(s)}</option>`).join('');
      if (currentVal) sectionSelect.value = currentVal;
    }

    // 5. Status
    const statusSelect = document.getElementById('filterStatus');
    if (statusSelect && activeFilters.status) {
      statusSelect.value = activeFilters.status;
    }

    setupFilterCustomSelectEvents();
    syncAllFilterCustomSelects();

    if (global.LabSyncDatePicker && typeof global.LabSyncDatePicker.init === 'function') {
      global.LabSyncDatePicker.init();
    }
  }

  /**
   * Updates PC number dropdown options, filtering by selected room when specified.
   * @param {Object} [options]
   * @param {string} [selectedRoom]
   */
  function updatePCNumberOptions(options, selectedRoom) {
    const pcSelect = document.getElementById('filterPCNumber');
    if (!pcSelect) return;
    const filters = global.reportFilters;
    const activeFilters = filters && typeof filters.getActiveFilters === 'function' ? filters.getActiveFilters() : {};
    const currentVal = activeFilters.pcNumber || pcSelect.value;
    const escapeFn = getEscapeFn();

    let pcList = options ? options.pcs : [];
    if (selectedRoom && options && options.pcsByRoom && options.pcsByRoom[selectedRoom]) {
      pcList = options.pcsByRoom[selectedRoom];
    }

    pcSelect.innerHTML = '<option value="">All PCs</option>' +
      pcList.map(p => {
        const pNum = String(p).replace(/\D/g, '') || p;
        const label = p.toLowerCase().startsWith('pc') ? p : `PC-${pNum.padStart(2, '0')} (PC ${pNum})`;
        return `<option value="${escapeFn(pNum)}">${escapeFn(label)}</option>`;
      }).join('');
    if (currentVal) pcSelect.value = currentVal;

    syncFilterCustomSelectUI('filterPCNumber', 'customSelectPCNumber', 'All PCs');
  }

  /**
   * Opens the filter popover panel and populates its form fields with active filters.
   */
  function openFilterDropdown() {
    const dropdown = document.getElementById('reportsFilterDropdown');
    const filterBtn = document.getElementById('btnReportsFilter');
    if (!dropdown || !filterBtn) return;

    const filters = global.reportFilters;
    const active = filters && typeof filters.getActiveFilters === 'function' ? filters.getActiveFilters() : {};

    const issueType = document.getElementById('filterIssueType');
    const room = document.getElementById('filterRoomNumber');
    const pc = document.getElementById('filterPCNumber');
    const status = document.getElementById('filterStatus');
    const dateFrom = document.getElementById('filterDateFrom');
    const dateTo = document.getElementById('filterDateTo');
    const section = document.getElementById('filterStudentSection');
    const dateErr = document.getElementById('filterDateError');

    if (issueType) issueType.value = active.issueType || '';
    if (room) room.value = active.roomNumber || '';
    if (pc) pc.value = active.pcNumber || '';
    if (status) status.value = active.status || '';
    if (dateFrom) dateFrom.value = active.dateFrom || '';
    if (dateTo) dateTo.value = active.dateTo || '';
    if (section) section.value = active.section || '';
    if (dateErr) { dateErr.style.display = 'none'; dateErr.textContent = ''; }

    setupFilterCustomSelectEvents();
    syncAllFilterCustomSelects();

    dropdown.style.display = 'flex';
    filterBtn.setAttribute('aria-expanded', 'true');
    adjustFilterDropdownPosition();
    if (global.lucide) global.lucide.createIcons({ root: dropdown });

    if (global.LabSyncDatePicker && typeof global.LabSyncDatePicker.init === 'function') {
      global.LabSyncDatePicker.init();
    }
  }

  /**
   * Dynamically positions and clamps the filter dropdown popover so it remains
   * completely within the visible viewport on all mobile, tablet, and desktop screens.
   */
  function adjustFilterDropdownPosition() {
    const dropdown = document.getElementById('reportsFilterDropdown');
    const filterContainer = document.getElementById('reportsFilterContainer');
    if (!dropdown || !filterContainer || dropdown.style.display === 'none') return;

    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const margin = 12;
    const maxW = Math.min(395, Math.max(260, vw - margin * 2));
    dropdown.style.maxWidth = `${maxW}px`;
    dropdown.style.width = `${maxW}px`;

    // Reset initial positioning relative to filter container
    dropdown.style.left = '0px';
    dropdown.style.right = 'auto';

    const contRect = filterContainer.getBoundingClientRect();
    const dropRect = dropdown.getBoundingClientRect();

    // If dropdown right edge overflows viewport
    if (dropRect.right > vw - margin) {
      dropdown.style.left = 'auto';
      dropdown.style.right = '0px';
    }

    // Check if right-aligned dropdown now overflows left viewport edge
    const updatedRect = dropdown.getBoundingClientRect();
    if (updatedRect.left < margin) {
      const targetLeft = margin;
      const offsetFromContainer = targetLeft - contRect.left;
      dropdown.style.left = `${offsetFromContainer}px`;
      dropdown.style.right = 'auto';
    } else if (updatedRect.right > vw - margin) {
      const targetRight = vw - margin;
      const offsetFromContainerRight = contRect.right - targetRight;
      dropdown.style.left = 'auto';
      dropdown.style.right = `${offsetFromContainerRight}px`;
    }
  }

  /**
   * Closes the filter popover panel.
   */
  function closeFilterDropdown() {
    const dropdown = document.getElementById('reportsFilterDropdown');
    const filterBtn = document.getElementById('btnReportsFilter');
    if (dropdown) dropdown.style.display = 'none';
    if (filterBtn) filterBtn.setAttribute('aria-expanded', 'false');

    document.querySelectorAll('.filter-custom-select').forEach(w => {
      w.classList.remove('open');
      w.classList.remove('open-upward');
      const t = w.querySelector('.custom-select-trigger');
      if (t) t.setAttribute('aria-expanded', 'false');
    });

    if (global.LabSyncDatePicker && typeof global.LabSyncDatePicker.close === 'function') {
      global.LabSyncDatePicker.close();
    }
  }

  /**
   * Applies the filters currently entered in the filter panel.
   */
  function applyFiltersFromUI() {
    const issueType = document.getElementById('filterIssueType');
    const room = document.getElementById('filterRoomNumber');
    const pc = document.getElementById('filterPCNumber');
    const status = document.getElementById('filterStatus');
    const dateFrom = document.getElementById('filterDateFrom');
    const dateTo = document.getElementById('filterDateTo');
    const section = document.getElementById('filterStudentSection');
    const dateErr = document.getElementById('filterDateError');

    const fromVal = dateFrom ? dateFrom.value.trim() : '';
    const toVal = dateTo ? dateTo.value.trim() : '';

    const filters = global.reportFilters;
    if (filters && typeof filters.validateDateRange === 'function') {
      const validation = filters.validateDateRange(fromVal, toVal);
      if (!validation.valid) {
        if (dateErr) {
          dateErr.textContent = validation.error;
          dateErr.style.display = 'block';
        }
        return;
      }
    }
    if (dateErr) {
      dateErr.style.display = 'none';
      dateErr.textContent = '';
    }

    if (filters && typeof filters.setActiveFilters === 'function') {
      filters.setActiveFilters({
        issueType: issueType ? issueType.value : '',
        roomNumber: room ? room.value : '',
        pcNumber: pc ? pc.value : '',
        status: status ? status.value : '',
        dateFrom: fromVal,
        dateTo: toVal,
        section: section ? section.value : ''
      });
    }

    closeFilterDropdown();
    renderReports();

    const modal = document.getElementById('completedTicketsModal');
    if (modal && modal.style.display !== 'none') {
      const filterCompletedFn = (global.reportModal && global.reportModal.filterCompletedTickets) || global.filterCompletedTickets;
      if (filterCompletedFn) filterCompletedFn();
    }
  }

  /**
   * Resets all filter settings and form inputs to default cleared state.
   */
  function resetAllFilters() {
    if (global.reportFilters && typeof global.reportFilters.resetFilters === 'function') {
      global.reportFilters.resetFilters();
    }

    const issueType = document.getElementById('filterIssueType');
    const room = document.getElementById('filterRoomNumber');
    const pc = document.getElementById('filterPCNumber');
    const status = document.getElementById('filterStatus');
    const dateFrom = document.getElementById('filterDateFrom');
    const dateTo = document.getElementById('filterDateTo');
    const section = document.getElementById('filterStudentSection');
    const dateErr = document.getElementById('filterDateError');

    if (issueType) issueType.value = '';
    if (room) room.value = '';
    if (pc) pc.value = '';
    if (status) status.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (section) section.value = '';
    if (dateErr) { dateErr.style.display = 'none'; dateErr.textContent = ''; }

    syncAllFilterCustomSelects();

    closeFilterDropdown();
    renderReports();

    const modal = document.getElementById('completedTicketsModal');
    if (modal && modal.style.display !== 'none') {
      const filterCompletedFn = (global.reportModal && global.reportModal.filterCompletedTickets) || global.filterCompletedTickets;
      if (filterCompletedFn) filterCompletedFn();
    }
  }

  /**
   * Binds click and change events for the filter button and panel.
   */
  function initFilterControls() {
    const filterBtn = document.getElementById('btnReportsFilter');
    const closeBtn = document.getElementById('btnCloseReportsFilter');
    const applyBtn = document.getElementById('btnApplyReportsFilter');
    const resetBtn = document.getElementById('btnClearReportsFilter');
    const quickClearBtn = document.getElementById('btnQuickClearFilters');
    const roomSelect = document.getElementById('filterRoomNumber');
    const dropdown = document.getElementById('reportsFilterDropdown');
    const chipsContainer = document.getElementById('reportsActiveFilterChips');

    setupFilterCustomSelectEvents();

    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (dropdown && dropdown.style.display !== 'none') {
          closeFilterDropdown();
        } else {
          populateFilterOptions();
          openFilterDropdown();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeFilterDropdown();
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyFiltersFromUI();
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetAllFilters();
      });
    }

    if (quickClearBtn) {
      quickClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetAllFilters();
      });
    }

    if (roomSelect) {
      roomSelect.addEventListener('change', () => {
        const filters = global.reportFilters;
        if (filters && typeof filters.extractFilterOptions === 'function') {
          const rawReports = (global.reportStore && typeof global.reportStore.getReports === 'function')
            ? global.reportStore.getReports()
            : (global.allReports || []);
          const options = filters.extractFilterOptions(rawReports);
          updatePCNumberOptions(options, roomSelect.value);
        }
      });
    }

    if (chipsContainer) {
      chipsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-clear-prop]');
        if (!btn) return;
        e.stopPropagation();
        const prop = btn.dataset.clearProp;
        const filters = global.reportFilters;
        if (filters && typeof filters.getActiveFilters === 'function') {
          const cur = filters.getActiveFilters();
          if (prop === 'dates') {
            cur.dateFrom = '';
            cur.dateTo = '';
          } else if (prop) {
            cur[prop] = '';
          }
          filters.setActiveFilters(cur);
          syncAllFilterCustomSelects();
          renderReports();
          const modal = document.getElementById('completedTicketsModal');
          if (modal && modal.style.display !== 'none') {
            const filterCompletedFn = (global.reportModal && global.reportModal.filterCompletedTickets) || global.filterCompletedTickets;
            if (filterCompletedFn) filterCompletedFn();
          }
        }
      });
    }

    document.addEventListener('click', (e) => {
      const container = document.getElementById('reportsFilterContainer');
      const dropdownEl = document.getElementById('reportsFilterDropdown');
      if (container && dropdownEl && dropdownEl.style.display !== 'none') {
        if (!container.contains(e.target)) {
          // If clicked inside custom datepicker popover, do not dismiss filter dropdown
          if (e.target.closest && e.target.closest('.labsync-datepicker-popover')) {
            return;
          }
          closeFilterDropdown();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (global.LabSyncDatePicker && typeof global.LabSyncDatePicker.isOpen === 'function' && global.LabSyncDatePicker.isOpen()) {
          global.LabSyncDatePicker.close();
          return;
        }
        const openCustomSelect = document.querySelector('.filter-custom-select.open');
        if (openCustomSelect) {
          openCustomSelect.classList.remove('open');
          openCustomSelect.classList.remove('open-upward');
          const t = openCustomSelect.querySelector('.custom-select-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
          return;
        }
        closeFilterDropdown();
      }
    });

    window.addEventListener('resize', () => {
      const dropdownEl = document.getElementById('reportsFilterDropdown');
      if (dropdownEl && dropdownEl.style.display !== 'none') {
        adjustFilterDropdownPosition();
      }
    });
  }

  /**
   * Initializes page event listeners and initial report loading.
   */
  function initReportPage() {
    const searchInput = document.getElementById('reportSearchInput');

    function updateSearchPlaceholder() {
      if (!searchInput) return;
      if (window.innerWidth <= 640) {
        searchInput.placeholder = 'Search reports...';
      } else {
        searchInput.placeholder = 'Search by room, PC number, issue details, or student name...';
      }
    }
    updateSearchPlaceholder();
    window.addEventListener('resize', updateSearchPlaceholder);

    initFilterControls();
    populateFilterOptions();

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
        e.stopPropagation();
      }
    });

    updateRoleGreetingDescription();
    loadReports().then(() => {
      const ticketParam = urlParams.get('ticket') || urlParams.get('id');
      if (ticketParam) {
        const cleanTicketId = String(ticketParam).replace(/\D/g, '') || ticketParam;
        const openModalFn = (global.reportModal && global.reportModal.viewTicketModal) || global.viewTicketModal;
        if (typeof openModalFn === 'function') {
          openModalFn(cleanTicketId);
        }
      }
    });
  }

  /**
   * Updates page greeting description based on authenticated role permissions.
   * - Department Head: Review reported computer issues and follow up on unresolved maintenance concerns across IT labs.
   * - Program Coordinator / Faculty: View and monitor reported computer issues and maintenance requests across IT labs.
   */
  function updateRoleGreetingDescription() {
    const subEl = document.getElementById('greetingSub');
    if (!subEl) return;
    try {
      const rawUser = (typeof global !== 'undefined' && global.currentUser) ||
        JSON.parse(
          (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('labsync_user')) ||
          (typeof localStorage !== 'undefined' && localStorage.getItem('user')) ||
          'null'
        );
      const user = (rawUser && (rawUser.user || rawUser)) || null;
      const role = String((user && (user.role || user.Role)) || '').trim().toLowerCase();
      const isDeptHead = (role.includes('head') && !role.includes('coordinator'));

      if (isDeptHead) {
        subEl.textContent = 'Review reported computer issues and follow up on unresolved maintenance concerns across IT labs.';
      } else {
        subEl.textContent = 'View and monitor reported computer issues and maintenance requests across IT labs.';
      }
    } catch (e) { }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReportPage);
  } else {
    initReportPage();
  }

  const reportController = {
    loadReports,
    renderReports,
    initReportPage,
    updateRoleGreetingDescription,
    populateFilterOptions,
    updatePCNumberOptions,
    openFilterDropdown,
    closeFilterDropdown,
    applyFiltersFromUI,
    resetAllFilters,
    syncFilterUI
  };

  global.reportController = reportController;
  global.loadReports = loadReports;
  global.renderReports = renderReports;
  global.resetAllFilters = resetAllFilters;

})(typeof window !== 'undefined' ? window : this);
