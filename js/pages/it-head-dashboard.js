/* ================================================================
   LabSync – IT Dept Head Dashboard Controller  |  js/pages/it-head-dashboard.js
   Refactored for High Performance, Accurate Metrics & Zero Glitching
   ================================================================ */

'use strict';

(function (global) {
  let _itHeadDashboardInitialized = false;

  /**
   * Escapes HTML string content for safe DOM injection.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Formats 24h time string (HH:MM:SS or HH:MM) to 12h AM/PM format.
   * @param {string} timeStr
   * @returns {string}
   */
  function formatTime12(timeStr) {
    if (global.formatTimeLabel) return global.formatTimeLabel(timeStr);
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${ampm}`;
  }

  /**
   * Renders the IT Head teaching schedule timeline list for today.
   * @param {Array} myClasses - List of teaching class objects for today
   */
  function renderMyTeachingSchedule(myClasses) {
    const container = document.getElementById('ithead-schedule-list');
    if (!container) return;

    if (!Array.isArray(myClasses) || myClasses.length === 0) {
      container.style.paddingLeft = '0';
      container.style.paddingRight = '0';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.flex = '1';
      container.style.height = '100%';
      container.innerHTML = `
        <div class="ui-empty-state" style="grid-column: unset; width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; margin: auto 0;">
          <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
            <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
          </div>
          <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">No classes scheduled for today.</p>
          <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:0;">Your teaching sessions will appear here when assigned.</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }
      return;
    }

    container.style.paddingLeft = '';
    container.style.paddingRight = '';
    container.style.display = '';
    container.style.flexDirection = '';
    container.style.justifyContent = '';
    container.style.alignItems = '';
    container.style.flex = '';
    container.style.height = '';

    // Sort chronologically
    const sortedClasses = [...myClasses].sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

    // Determine current time to mark items as active, future, or completed
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let html = '';
    sortedClasses.forEach((s) => {
      let isActive = false;
      let isFuture = false;
      if (s.Start_Time && s.End_Time) {
        const startParts = s.Start_Time.split(':');
        const endParts = s.End_Time.split(':');
        const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1] || '0', 10);
        const endMin = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1] || '0', 10);

        if (nowMinutes >= startMin && nowMinutes <= endMin) {
          isActive = true;
        } else if (nowMinutes < startMin) {
          isFuture = true;
        }
      }

      let timeClass = 'timeline-item';
      if (isActive) timeClass += ' active';
      else if (isFuture) timeClass += ' future';

      html += `
        <div class="${timeClass}" style="width: 100%; box-sizing: border-box;">
          <div class="time-marker"></div>
          <div class="time-content">
            <div class="tc-top-row">
              <div class="tc-time">
                <i data-lucide="clock" style="width:13px;height:13px;flex-shrink:0;"></i>
                <span>${formatTime12(s.Start_Time)} – ${formatTime12(s.End_Time)}</span>
              </div>
              ${isActive ? '<span class="tc-status-pill ongoing"><span class="dot"></span> ONGOING</span>' : (isFuture ? '<span class="tc-status-pill upcoming">UPCOMING</span>' : '<span class="tc-status-pill completed">COMPLETED</span>')}
            </div>
            <div class="tc-title">${escapeHtml(s.Subject_Name || 'Class Session')}</div>
            <div class="tc-bottom-row">
              <span class="tc-room-badge">
                <i data-lucide="map-pin" style="width:12px;height:12px;"></i> RM ${escapeHtml(s.Room_Number || 'TBA')}
              </span>
              ${s.Section ? `<span class="tc-section-badge">${escapeHtml(s.Section)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: container });
    }
  }

  /**
   * Loads all IT Head Dashboard metrics, room grid, and schedule accurately in a single flicker-free pass.
   */
  async function loadITHeadDashboardData() {
    const labsContainer = document.getElementById('ithead-labs-grid') || '.labs-grid';

    try {
      const currentYear = new Date().getFullYear();
      const ay = `${currentYear}-${currentYear + 1}`;
      const sem = '1st Semester';

      // 1. Fetch Summary Metrics and Laboratory Data in parallel
      const [summaryRes, allLabsData] = await Promise.all([
        fetch(`/api/dashboard/it-head-summary?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' }
        }).then(res => res.ok ? res.json() : null).catch(() => null),

        (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function')
          ? global.laboratoryService.fetchLaboratories().catch(() => [])
          : fetch('/api/laboratories', { credentials: 'include' }).then(res => res.ok ? res.json() : []).catch(() => [])
      ]);

      const allLabs = Array.isArray(allLabsData) ? allLabsData : [];
      const stats = summaryRes || {};

      // 2. Hardware and Laboratory Calculations
      const totalRoomsCount = allLabs.length || stats.totalRooms || 0;
      const onlineCount = allLabs.filter(r => r.deviceOnline === true || r.deviceOnline === 1 || r.deviceOnline === 'true').length;
      const offlineCount = totalRoomsCount - onlineCount;
      const onlineAndAvailableCount = allLabs.filter(r =>
        (r.deviceOnline === true || r.deviceOnline === 1 || r.deviceOnline === 'true') &&
        String(r.Current_Status || '').toLowerCase() === 'available'
      ).length;

      // 3. Update DOM Stat Cards ONCE (No intermediate flashing)
      // Stat Card 1: Total Lab Rooms
      const elRooms = document.getElementById('ithead-stat-rooms');
      if (elRooms) elRooms.textContent = totalRoomsCount;
      const elPcsMeta = document.getElementById('ithead-stat-pcs-meta');
      if (elPcsMeta) elPcsMeta.textContent = `${stats.totalPcs || 0} total PCs registered`;

      // Stat Card 2: Available Labs (Hardware-Aware)
      const elAvail = document.getElementById('ithead-stat-available');
      if (elAvail) elAvail.textContent = onlineAndAvailableCount;
      const elAvailMeta = document.getElementById('ithead-stat-avail-meta');
      if (elAvailMeta) {
        if (offlineCount === totalRoomsCount && totalRoomsCount > 0) {
          elAvailMeta.textContent = `All ${totalRoomsCount} lab hardware devices offline`;
        } else if (offlineCount > 0) {
          elAvailMeta.textContent = `${onlineAndAvailableCount} of ${totalRoomsCount} available (${offlineCount} offline)`;
        } else {
          elAvailMeta.textContent = `${onlineAndAvailableCount} of ${totalRoomsCount} online & ready`;
        }
      }

      // Stat Card 3: Pending PC Reports
      const elPending = document.getElementById('ithead-stat-pending');
      if (elPending) elPending.textContent = stats.pendingReports ?? '0';
      const elPendingMeta = document.getElementById('ithead-stat-pending-meta');
      if (elPendingMeta) elPendingMeta.textContent = `${stats.pendingReports || 0} active ticket(s)`;

      // Stat Card 4: Classes Today (Personal Schedule Count)
      const myClassesCount = Array.isArray(stats.myClassesToday) ? stats.myClassesToday.length : 0;
      const elClasses = document.getElementById('ithead-stat-classes');
      if (elClasses) elClasses.textContent = myClassesCount;
      const elClassesMeta = document.getElementById('ithead-stat-classes-meta');
      if (elClassesMeta) {
        elClassesMeta.textContent = myClassesCount > 0
          ? `${myClassesCount} session(s) scheduled today`
          : 'No classes today';
      }

      // 4. Render Today's Schedule for IT Head
      renderMyTeachingSchedule(stats.myClassesToday || []);

      // 5. Filter & Render Laboratories Grid
      let assignedRooms = new Set();
      if (global.laboratoryService && typeof global.laboratoryService.getUserAssignedRooms === 'function') {
        try {
          assignedRooms = await global.laboratoryService.getUserAssignedRooms();
        } catch (e) { }
      }

      const myLabs = allLabs.filter(room => {
        const roomNum = String(room.Room_Number || '').trim().replace(/^RM\s*/i, '').toLowerCase();
        return assignedRooms.has(roomNum);
      });

      const labsToDisplay = myLabs.length > 0 ? myLabs : allLabs;

      if (global.laboratoryService && typeof global.laboratoryService.renderLabCards === 'function') {
        global.laboratoryService.renderLabCards(labsToDisplay, labsContainer);
      } else if (typeof global.renderLabCards === 'function') {
        global.renderLabCards(labsToDisplay, labsContainer);
      }

    } catch (err) {
      console.error('[ITHeadDashboard] IT Head dashboard loading failed:', err);
      if (global.laboratoryService && typeof global.laboratoryService.renderLabCardsError === 'function') {
        global.laboratoryService.renderLabCardsError(labsContainer);
      }
    } finally {
      const containerEl = typeof labsContainer === 'string' ? document.querySelector(labsContainer) : labsContainer;
      if (containerEl && containerEl.querySelector('.animate-spin')) {
        if (typeof global.renderLabCards === 'function') {
          global.renderLabCards([], containerEl);
        }
      }
    }
  }

  /**
   * Initializes dashboard load.
   */
  function initITHeadDashboardPage() {
    if (_itHeadDashboardInitialized) return;
    _itHeadDashboardInitialized = true;

    loadITHeadDashboardData();
  }

  // Expose globally
  global.loadITHeadDashboardData = loadITHeadDashboardData;
  global.initITHeadDashboardPage = initITHeadDashboardPage;
  global.renderMyTeachingSchedule = renderMyTeachingSchedule;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initITHeadDashboardPage);
  } else {
    initITHeadDashboardPage();
  }

})(typeof window !== 'undefined' ? window : this);
