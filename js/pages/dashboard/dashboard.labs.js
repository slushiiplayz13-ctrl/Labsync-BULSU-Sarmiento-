/**
 * LabSync – Dashboard Laboratory Status & Stats Module  |  js/pages/dashboard/dashboard.labs.js
 * Encapsulates real-time laboratory room polling, assigned-room filtering, stat cards 1-3, and zero-flicker background updates.
 */

(function (global) {
  'use strict';

  let _isFetchingLabs = false;
  let _labsFirstLoad = true;

  /**
   * Loads laboratory status and updates top dashboard stats (Cards 1, 2, 3).
   * Seamless background polling without flickering.
   */
  async function loadDashboardStatsAndLabs() {
    if (_isFetchingLabs) return;
    _isFetchingLabs = true;

    const labsGrid = document.querySelector('.labs-grid') || document.getElementById('ithead-labs-grid');

    // 1. Instant SWR pre-render from sessionStorage cache (0ms delay!)
    try {
      const cachedLabs = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
      const cachedAssigned = JSON.parse(sessionStorage.getItem('labsync_cached_assigned_rooms') || 'null');
      const cachedReports = JSON.parse(sessionStorage.getItem('labsync_cached_reports') || 'null');

      if (Array.isArray(cachedLabs) && cachedLabs.length > 0) {
        const assignedSet = Array.isArray(cachedAssigned) ? new Set(cachedAssigned) : new Set();
        const myLabs = cachedLabs.filter(room => {
          const roomNum = String(room.Room_Number || '').trim().replace(/^RM\s*/i, '').toLowerCase();
          return assignedSet.has(roomNum);
        });

        // Pre-hydrate Stats Card 1: Total Campus Rooms
        const totalLabsVal = document.querySelector('.stat-card:nth-child(1) .stat-value') || document.getElementById('ithead-stat-rooms');
        const totalLabsMeta = document.querySelector('.stat-card:nth-child(1) .stat-meta') || document.getElementById('ithead-stat-pcs-meta');
        if (totalLabsVal) totalLabsVal.textContent = cachedLabs.length;
        if (totalLabsMeta) {
          totalLabsMeta.textContent = myLabs.length > 0
            ? `${myLabs.length} assigned to you (${cachedLabs.length} total)`
            : `${cachedLabs.length} registered campus lab(s)`;
        }

        // Pre-hydrate Stats Card 2: Campus Available Labs
        const availLabsVal = document.querySelector('.stat-card:nth-child(2) .stat-value') || document.getElementById('ithead-stat-available');
        const availLabsMeta = document.querySelector('.stat-card:nth-child(2) .stat-meta') || document.getElementById('ithead-stat-avail-meta');
        const availableTotalCount = cachedLabs.filter(r => r.deviceOnline !== false && String(r.Current_Status || '').toLowerCase() === 'available').length;
        if (availLabsVal) availLabsVal.textContent = availableTotalCount;
        if (availLabsMeta) availLabsMeta.textContent = `${availableTotalCount} available now campus-wide`;

        // Pre-render Lab Cards instantly
        if (labsGrid) {
          const renderFn = (global.laboratoryService && typeof global.laboratoryService.renderLabCards === 'function')
            ? global.laboratoryService.renderLabCards
            : (typeof global.renderLabCards === 'function' ? global.renderLabCards : null);
          if (typeof renderFn === 'function') {
            renderFn(myLabs, labsGrid);
          }
        }
      }

      if (Array.isArray(cachedReports)) {
        const pendingCount = cachedReports.filter(r => String(r.Status || '').toLowerCase() === 'pending').length;
        const pendingReportsVal = document.querySelector('.stat-card:nth-child(3) .stat-value') || document.getElementById('ithead-stat-pending');
        const pendingReportsMeta = document.querySelector('.stat-card:nth-child(3) .stat-meta') || document.getElementById('ithead-stat-pending-meta');
        if (pendingReportsVal) pendingReportsVal.textContent = pendingCount;
        if (pendingReportsMeta) pendingReportsMeta.textContent = `${pendingCount} active ticket(s)`;
      }
    } catch (e) {
      // Ignore cache read errors
    }

    // ONLY show loading spinner on initial load IF the grid has NO cards yet
    const hasCards = labsGrid && labsGrid.querySelector('.lab-card') !== null;
    if (_labsFirstLoad && labsGrid && !hasCards && !labsGrid.querySelector('.ui-empty-state')) {
      labsGrid.innerHTML = `
        <div class="ui-empty-state" style="grid-column: 1 / -1; padding: 28px 16px; width: 100%; flex: 1; height: 100%; min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; box-sizing: border-box;">
          <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
            <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
          </div>
          <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">Loading laboratory status...</p>
          <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin:0;">Fetching real-time room and hardware metrics</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: labsGrid });
      }
    }

    try {
      // 1. Fetch & Render Laboratories filtered by User's assigned schedule
      let allLabs = [];
      const fetchLabsFn = (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function')
        ? global.laboratoryService.fetchLaboratories
        : (typeof global.fetchLaboratories === 'function' ? global.fetchLaboratories : null);

      if (typeof fetchLabsFn === 'function') {
        allLabs = await fetchLabsFn();
      } else {
        console.warn('[DashboardLabs] laboratoryService unavailable');
        allLabs = [];
      }

      if (!Array.isArray(allLabs)) {
        console.warn('[DashboardLabs] Laboratories API returned non-array payload:', allLabs);
        allLabs = [];
      }

      // Fetch user assigned rooms
      let assignedRooms = new Set();
      try {
        const getAssignedFn = (global.laboratoryService && typeof global.laboratoryService.getUserAssignedRooms === 'function')
          ? global.laboratoryService.getUserAssignedRooms
          : (typeof global.getUserAssignedRooms === 'function' ? global.getUserAssignedRooms : null);

        if (typeof getAssignedFn === 'function') {
          assignedRooms = await getAssignedFn();
        }
      } catch (assignErr) {
        console.error('[DashboardLabs] Error resolving user assigned rooms:', assignErr);
      }

      // Filter laboratories to show only those assigned to the faculty user
      const myLabs = allLabs.filter(room => {
        const roomNum = String(room.Room_Number || '').trim().replace(/^RM\s*/i, '').toLowerCase();
        return assignedRooms.has(roomNum);
      });

      // Update Stats Card 1: Total Campus Rooms
      const totalLabsVal = document.querySelector('.stat-card:nth-child(1) .stat-value') || document.getElementById('ithead-stat-rooms');
      const totalLabsMeta = document.querySelector('.stat-card:nth-child(1) .stat-meta') || document.getElementById('ithead-stat-pcs-meta');
      if (totalLabsVal) totalLabsVal.textContent = allLabs.length;
      if (totalLabsMeta) {
        totalLabsMeta.textContent = myLabs.length > 0
          ? `${myLabs.length} assigned to you (${allLabs.length} total)`
          : `${allLabs.length} registered campus lab(s)`;
      }

      // Update Stats Card 2: Campus Available Labs
      const availLabsVal = document.querySelector('.stat-card:nth-child(2) .stat-value') || document.getElementById('ithead-stat-available');
      const availLabsMeta = document.querySelector('.stat-card:nth-child(2) .stat-meta') || document.getElementById('ithead-stat-avail-meta');
      const availableTotalCount = allLabs.filter(r => r.deviceOnline !== false && String(r.Current_Status || '').toLowerCase() === 'available').length;
      if (availLabsVal) availLabsVal.textContent = availableTotalCount;
      if (availLabsMeta) availLabsMeta.textContent = `${availableTotalCount} available now campus-wide`;

      // Render Laboratory Cards into grid (flicker-free signature diffing)
      if (labsGrid) {
        const renderFn = (global.laboratoryService && typeof global.laboratoryService.renderLabCards === 'function')
          ? global.laboratoryService.renderLabCards
          : (typeof global.renderLabCards === 'function' ? global.renderLabCards : null);

        if (typeof renderFn === 'function') {
          renderFn(myLabs, labsGrid);
        } else {
          console.error('[DashboardLabs] renderLabCards renderer not found');
        }
      }

      _labsFirstLoad = false;

    } catch (err) {
      console.error('[DashboardLabs] Laboratory loading failed:', err);
      if (_labsFirstLoad && labsGrid && !labsGrid.querySelector('.lab-card')) {
        const renderErrFn = (global.laboratoryService && typeof global.laboratoryService.renderLabCardsError === 'function')
          ? global.laboratoryService.renderLabCardsError
          : (typeof global.renderLabCardsError === 'function' ? global.renderLabCardsError : null);

        if (typeof renderErrFn === 'function') {
          renderErrFn(labsGrid);
        } else {
          labsGrid.innerHTML = `
            <div class="ui-empty-state" style="grid-column: 1 / -1; padding: 28px 16px; width: 100%; flex: 1; height: 100%; min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; box-sizing: border-box;">
              <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
                <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
              </div>
              <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">Unable to retrieve room status</p>
              <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:14px;">Please check your connection or reload the page.</p>
              <button type="button" onclick="window.loadDashboardStatsAndLabs()" style="padding:9px 20px; border:none; background:var(--primary-teal); color:#fff; border-radius:18px; font-weight:600; font-size:12.5px; cursor:pointer; font-family:var(--font-body); box-shadow: 0 4px 12px var(--primary-teal-glow);">Retry</button>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: labsGrid });
          }
        }
      }
    } finally {
      _isFetchingLabs = false;
    }

    // 2. Fetch PC Reports independently for Stats Card 3 (Pending PC Reports)
    try {
      const fetchReportsFn = (global.reportService && typeof global.reportService.fetchReports === 'function')
        ? global.reportService.fetchReports
        : (typeof global.fetchReports === 'function' ? global.fetchReports : null);

      let reports = [];
      if (typeof fetchReportsFn === 'function') {
        reports = await fetchReportsFn();
      }

      if (Array.isArray(reports)) {
        const pendingCount = reports.filter(r => String(r.Status || '').toLowerCase() === 'pending').length;
        const pendingReportsVal = document.querySelector('.stat-card:nth-child(3) .stat-value') || document.getElementById('ithead-stat-pending');
        const pendingReportsMeta = document.querySelector('.stat-card:nth-child(3) .stat-meta') || document.getElementById('ithead-stat-pending-meta');
        if (pendingReportsVal) pendingReportsVal.textContent = pendingCount;
        if (pendingReportsMeta) pendingReportsMeta.textContent = `${pendingCount} active ticket(s)`;
      }
    } catch (err) {
      console.error('[DashboardLabs] Error loading PC reports stats:', err);
    }
  }

  const dashboardLabs = {
    loadDashboardStatsAndLabs
  };

  global.dashboardLabs = dashboardLabs;

})(typeof window !== 'undefined' ? window : this);
