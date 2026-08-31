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
   * Renders the Laboratory Issue Overview summarizing active PC issues by laboratory room.
   * Active Issues = Pending + In Progress (Resolved are excluded).
   * @param {Array} rooms - List of laboratory objects
   * @param {Array} reports - List of PC maintenance report objects
   */
  function renderLabIssueOverview(rooms, reports) {
    const container = document.getElementById('misLabIssueOverviewContainer');
    if (!container) return;

    if (!Array.isArray(rooms) || rooms.length === 0) {
      container.innerHTML = `
        <div class="lab-issue-empty">
          <span>No laboratories registered.</span>
        </div>
      `;
      return;
    }

    const reportList = Array.isArray(reports) ? reports : [];

    // Group active reports by normalized room number
    const roomIssueMap = new Map();
    rooms.forEach(r => {
      const roomNum = String(r.Room_Number || '').trim();
      const normKey = roomNum.replace(/^RM\s*/i, '').toLowerCase();
      roomIssueMap.set(normKey, {
        room: r,
        roomNumber: roomNum,
        normKey: normKey,
        pending: 0,
        inProgress: 0,
        activeTotal: 0
      });
    });

    reportList.forEach(rep => {
      const status = (rep.Status || '').toLowerCase();
      // Only count active issues: Pending or In Progress (exclude Resolved)
      if (status === 'resolved') return;

      const repRoom = String(rep.Room_Number || '').trim();
      const normKey = repRoom.replace(/^RM\s*/i, '').toLowerCase();

      let entry = roomIssueMap.get(normKey);
      if (!entry) {
        entry = {
          room: { Room_Number: repRoom },
          roomNumber: repRoom,
          normKey: normKey,
          pending: 0,
          inProgress: 0,
          activeTotal: 0
        };
        roomIssueMap.set(normKey, entry);
      }

      if (status === 'in progress') {
        entry.inProgress += 1;
      } else {
        entry.pending += 1;
      }
      entry.activeTotal += 1;
    });

    // Sort rooms: rooms with active issues first (descending), then room number ascending
    const sortedEntries = Array.from(roomIssueMap.values()).sort((a, b) => {
      if (b.activeTotal !== a.activeTotal) {
        return b.activeTotal - a.activeTotal;
      }
      return String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, { numeric: true });
    });

    container.innerHTML = sortedEntries.map(entry => {
      const activeCount = entry.activeTotal;
      const hasIssues = activeCount > 0;
      
      // Determine attention level and status badge
      let statusClass = 'is-clear';
      let badgeClass = 'badge-clear';
      let badgeIcon = 'check-circle-2';
      let badgeText = 'Clear';
      let subtext = 'All PCs operational';

      if (activeCount >= 3) {
        statusClass = 'has-issues status-urgent';
        badgeClass = 'badge-urgent';
        badgeIcon = 'alert-octagon';
        badgeText = `${activeCount} Active Issue${activeCount !== 1 ? 's' : ''}`;
        const parts = [];
        if (entry.pending > 0) parts.push(`${entry.pending} Pending`);
        if (entry.inProgress > 0) parts.push(`${entry.inProgress} In Progress`);
        subtext = parts.join(' • ') || 'Urgent attention required';
      } else if (activeCount > 0) {
        statusClass = 'has-issues status-attention';
        badgeClass = 'badge-attention';
        badgeIcon = 'alert-triangle';
        badgeText = `${activeCount} Active Issue${activeCount !== 1 ? 's' : ''}`;
        const parts = [];
        if (entry.pending > 0) parts.push(`${entry.pending} Pending`);
        if (entry.inProgress > 0) parts.push(`${entry.inProgress} In Progress`);
        subtext = parts.join(' • ') || 'Needs attention';
      }

      const roomDisplay = entry.roomNumber.toLowerCase().startsWith('room')
        ? entry.roomNumber
        : `Room ${entry.roomNumber}`;

      const encodedRoom = encodeURIComponent(entry.roomNumber);

      return `
        <div class="lab-issue-item ${statusClass}"
             data-room="${encodedRoom}"
             tabindex="${hasIssues ? '0' : '-1'}"
             role="${hasIssues ? 'button' : 'region'}"
             aria-label="${escapeStr(roomDisplay)}: ${badgeText}. ${escapeStr(subtext)}">
          <div class="lab-issue-item-left">
            <div class="lab-issue-icon-wrap">
              <i data-lucide="${hasIssues ? 'monitor-x' : 'monitor-check'}" style="width: 18px; height: 18px;"></i>
            </div>
            <div class="lab-issue-details">
              <div class="lab-issue-room-name">${escapeStr(roomDisplay)}</div>
              <div class="lab-issue-subtext">${escapeStr(subtext)}</div>
            </div>
          </div>
          <div class="lab-issue-status-badge ${badgeClass}">
            <i data-lucide="${badgeIcon}" style="width: 13px; height: 13px;"></i>
            <span>${badgeText}</span>
          </div>
        </div>
      `;
    }).join('');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: container });
    }
  }

  function escapeStr(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let _currentReports = [];
  let _currentRooms = [];

  // Initialize in-memory reports and rooms from session cache if available
  try {
    const cachedReports = JSON.parse(sessionStorage.getItem('labsync_cached_reports') || 'null');
    if (Array.isArray(cachedReports)) {
      _currentReports = cachedReports;
    }
    const cachedLabs = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
    if (Array.isArray(cachedLabs)) {
      _currentRooms = cachedLabs;
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

      // Render Recent Reports Table & Laboratory Issue Overview
      if (global.staffDashboardReports && typeof global.staffDashboardReports.renderDashboardTable === 'function') {
        global.staffDashboardReports.renderDashboardTable(_currentReports);
      }
      renderLabIssueOverview(rooms, reports);
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

    // Initial render from in-memory session cache if present (zero layout shift)
    if (_currentRooms.length > 0) {
      renderLabIssueOverview(_currentRooms, _currentReports);
    }

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

    // Delegated click & keyboard listener for Laboratory Issue Overview deep-linking (CSP compliant)
    const issueContainer = document.getElementById('misLabIssueOverviewContainer');
    if (issueContainer) {
      issueContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.lab-issue-item.has-issues');
        if (!item) return;
        const encodedRoom = item.getAttribute('data-room');
        if (encodedRoom) {
          window.location.href = `mis-maintenance.html?room=${encodedRoom}`;
        }
      });

      issueContainer.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const item = e.target.closest('.lab-issue-item.has-issues');
          if (item && document.activeElement === item) {
            e.preventDefault();
            const encodedRoom = item.getAttribute('data-room');
            if (encodedRoom) {
              window.location.href = `mis-maintenance.html?room=${encodedRoom}`;
            }
          }
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

  // Global exports for coordinator
  global.loadDashboardData = loadDashboardData;
  global.renderLabIssueOverview = renderLabIssueOverview;

})(typeof window !== 'undefined' ? window : this);
