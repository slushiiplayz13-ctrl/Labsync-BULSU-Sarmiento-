/* ================================================================
   LabSync – Dashboard Page Controller  |  js/pages/dashboard.js
   Refactored for Zero-Flicker Background Updates & Real-time Live Sync
   ================================================================ */

'use strict';

(function (global) {
  let _dashboardInitialized = false;
  let _labsFirstLoad = true;
  let _scheduleFirstLoad = true;
  let _lastScheduleSignature = '';
  let _isFetchingLabs = false;
  let _isFetchingSchedule = false;

  /**
   * Helper to format 24-hour time string into 12-hour AM/PM format.
   * @param {string} timeStr - Time string in HH:MM:SS or HH:MM
   * @returns {string}
   */
  function formatTime12(timeStr) {
    if (typeof global.formatTimeLabel === 'function') return global.formatTimeLabel(timeStr);
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${ampm}`;
  }

  /**
   * Helper to escape HTML characters for safe DOM insertion.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function' && global.escapeHtml !== escapeHtml) {
      return global.escapeHtml(str);
    }
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Initializes dashboard page features.
   */
  async function initDashboard() {
    if (_dashboardInitialized) return;
    _dashboardInitialized = true;

    try {
      await Promise.allSettled([
        loadDashboardStatsAndLabs(),
        loadDashboardSchedule()
      ]);
    } catch (err) {
      console.error('[Dashboard] Error during dashboard initialization:', err);
    }
  }

  /**
   * Loads laboratory status and updates top dashboard stats.
   * Seamless background polling without flickering.
   */
  async function loadDashboardStatsAndLabs() {
    if (_isFetchingLabs) return;
    _isFetchingLabs = true;

    const labsGrid = document.querySelector('.labs-grid') || document.getElementById('ithead-labs-grid');

    // ONLY show loading spinner on the initial load if the grid has no content yet
    if (_labsFirstLoad && labsGrid && !labsGrid.querySelector('.lab-card') && !labsGrid.querySelector('.ui-empty-state')) {
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
      if (typeof global.fetchLaboratories === 'function') {
        allLabs = await global.fetchLaboratories();
      } else if (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function') {
        allLabs = await global.laboratoryService.fetchLaboratories();
      } else {
        const res = await fetch('/api/laboratories', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load laboratories`);
        allLabs = await res.json();
      }

      if (!Array.isArray(allLabs)) {
        console.warn('[Dashboard] Laboratories API returned non-array payload:', allLabs);
        allLabs = [];
      }

      // Fetch user assigned rooms
      let assignedRooms = new Set();
      try {
        if (typeof global.getUserAssignedRooms === 'function') {
          assignedRooms = await global.getUserAssignedRooms();
        } else if (global.laboratoryService && typeof global.laboratoryService.getUserAssignedRooms === 'function') {
          assignedRooms = await global.laboratoryService.getUserAssignedRooms();
        }
      } catch (assignErr) {
        console.error('[Dashboard] Error resolving user assigned rooms:', assignErr);
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
        const renderFn = typeof global.renderLabCards === 'function'
          ? global.renderLabCards
          : (global.laboratoryService && typeof global.laboratoryService.renderLabCards === 'function'
            ? global.laboratoryService.renderLabCards
            : null);

        if (typeof renderFn === 'function') {
          renderFn(myLabs, labsGrid);
        } else {
          console.error('[Dashboard] renderLabCards renderer not found');
        }
      }

      _labsFirstLoad = false;

    } catch (err) {
      console.error('[Dashboard] Laboratory loading failed:', err);
      if (_labsFirstLoad && labsGrid) {
        const renderErrFn = typeof global.renderLabCardsError === 'function'
          ? global.renderLabCardsError
          : (global.laboratoryService && typeof global.laboratoryService.renderLabCardsError === 'function'
            ? global.laboratoryService.renderLabCardsError
            : null);

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
              <button type="button" onclick="loadDashboardStatsAndLabs()" style="padding:9px 20px; border:none; background:var(--primary-teal); color:#fff; border-radius:18px; font-weight:600; font-size:12.5px; cursor:pointer; font-family:var(--font-body); box-shadow: 0 4px 12px var(--primary-teal-glow);">Retry</button>
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
      const reportsRes = await fetch('/api/reports', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (reportsRes.ok) {
        const contentType = reportsRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const reports = await reportsRes.json();
          if (Array.isArray(reports)) {
            const pendingCount = reports.filter(r => String(r.Status || '').toLowerCase() === 'pending').length;
            const pendingReportsVal = document.querySelector('.stat-card:nth-child(3) .stat-value') || document.getElementById('ithead-stat-pending');
            const pendingReportsMeta = document.querySelector('.stat-card:nth-child(3) .stat-meta') || document.getElementById('ithead-stat-pending-meta');
            if (pendingReportsVal) pendingReportsVal.textContent = pendingCount;
            if (pendingReportsMeta) pendingReportsMeta.textContent = `${pendingCount} active ticket(s)`;
          }
        }
      }
    } catch (err) {
      console.error('[Dashboard] Error loading PC reports stats:', err);
    }
  }

  /**
   * Loads today's user schedule and populates timeline.
   * Flicker-free background updates.
   */
  async function loadDashboardSchedule() {
    if (_isFetchingSchedule) return;
    _isFetchingSchedule = true;

    const timelineList = document.querySelector('.timeline-list') || document.getElementById('ithead-schedule-list');
    if (!timelineList) {
      _isFetchingSchedule = false;
      return;
    }

    // ONLY show loading spinner on initial load if timeline has no content
    if (_scheduleFirstLoad && !timelineList.querySelector('.timeline-item') && !timelineList.querySelector('.ui-empty-state')) {
      timelineList.style.paddingLeft = '0';
      timelineList.style.paddingRight = '0';
      timelineList.style.display = 'flex';
      timelineList.style.flexDirection = 'column';
      timelineList.style.justifyContent = 'center';
      timelineList.style.alignItems = 'center';
      timelineList.style.flex = '1';
      timelineList.style.height = '100%';
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
          <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
            <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
          </div>
          <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">Loading today's classes...</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: timelineList });
      }
    }

    try {
      const currentYear = new Date().getFullYear();
      const ay = `${currentYear}-${currentYear + 1}`;
      const sem = '1st Semester';

      const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      const contentType = res.headers.get('content-type') || '';
      let payload = null;

      if (contentType.includes('application/json')) {
        payload = await res.json();
      } else {
        payload = await res.text();
      }

      if (!res.ok) {
        console.error('[Dashboard] Schedule loading failed:', {
          status: res.status,
          statusText: res.statusText,
          payload
        });

        if (_scheduleFirstLoad) {
          let errorMsg = 'Failed to load schedule.';
          if (res.status === 401) errorMsg = 'Authentication required. Please log in.';
          else if (res.status === 403) errorMsg = 'Access forbidden.';
          else if (res.status >= 500) errorMsg = 'Server error loading schedule.';
          else if (payload && typeof payload === 'object' && payload.error) errorMsg = payload.error;

          timelineList.innerHTML = `
            <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
              <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
                <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
              </div>
              <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">${escapeHtml(errorMsg)}</p>
              <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:10px;">Please check your connection and try again.</p>
              <button type="button" class="ui-empty-btn" onclick="initDashboard()"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Retry Connection</button>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: timelineList });
          }
        }
        return;
      }

      if (!Array.isArray(payload)) {
        console.error('[Dashboard] Unexpected schedule API response:', payload);
        return;
      }

      const schedules = payload;
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = days[new Date().getDay()];

      // Filter for today with normalized string matching
      const todaySchedules = schedules.filter(s =>
        String(s.Day_of_Week || '').trim().toLowerCase() === todayName.toLowerCase()
      );

      // Sort chronologically
      todaySchedules.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

      // Update Stats Card 4: Classes Today
      const classesTodayVal = document.querySelector('.stat-card:nth-child(4) .stat-value') || document.getElementById('ithead-stat-classes');
      const classesTodayMeta = document.querySelector('.stat-card:nth-child(4) .stat-meta') || document.getElementById('ithead-stat-classes-meta');
      if (classesTodayVal) classesTodayVal.textContent = todaySchedules.length;
      if (classesTodayMeta) {
        classesTodayMeta.textContent = todaySchedules.length > 0
          ? `${todaySchedules.length} session(s) scheduled`
          : 'No classes today';
      }

      // Check current time status
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // Signature diffing to avoid destroying DOM if unchanged
      const currentSignature = todaySchedules.map(s => `${s.Schedule_ID || s.Subject_Name}-${s.Start_Time}-${s.End_Time}-${s.Room_Number}-${s.Section}`).join('|') + `_${Math.floor(nowMinutes / 5)}`;

      if (!_scheduleFirstLoad && currentSignature === _lastScheduleSignature) {
        return; // Content unchanged, skip DOM write
      }
      _lastScheduleSignature = currentSignature;

      if (todaySchedules.length === 0) {
        timelineList.style.paddingLeft = '0';
        timelineList.style.paddingRight = '0';
        timelineList.style.display = 'flex';
        timelineList.style.flexDirection = 'column';
        timelineList.style.justifyContent = 'center';
        timelineList.style.alignItems = 'center';
        timelineList.style.flex = '1';
        timelineList.style.height = '100%';
        const scheduleLink = window.location.pathname.includes('it-head') ? 'it-head-my-schedule.html' : 'my-schedule.html';
        timelineList.innerHTML = `
          <div class="ui-empty-state" style="grid-column: unset; width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; margin: auto 0;">
            <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
              <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
            </div>
            <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">No classes scheduled for today.</p>
            <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:12px;">Your teaching sessions will appear here when scheduled.</p>
            <a href="${scheduleLink}" class="ui-empty-btn"><i data-lucide="calendar" style="width:14px;height:14px;"></i> View Full Schedule</a>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: timelineList });
        }
        _scheduleFirstLoad = false;
        return;
      }

      timelineList.style.paddingLeft = '';
      timelineList.style.paddingRight = '';
      timelineList.style.display = '';
      timelineList.style.flexDirection = '';
      timelineList.style.justifyContent = '';
      timelineList.style.alignItems = '';
      timelineList.style.flex = '';
      timelineList.style.height = '';

      let html = '';
      todaySchedules.forEach((s) => {
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

      timelineList.innerHTML = html;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: timelineList });
      }

      _scheduleFirstLoad = false;

    } catch (err) {
      console.error('[Dashboard] Error loading dashboard schedule:', err);
    } finally {
      _isFetchingSchedule = false;
    }
  }

  // Expose globally for compatibility
  global.initDashboard = initDashboard;
  global.loadDashboardStatsAndLabs = loadDashboardStatsAndLabs;
  global.loadDashboardSchedule = loadDashboardSchedule;

  // Auto-initialize if running on dashboard page
  if (document.body && document.body.dataset.page === 'dashboard') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initDashboard);
    } else {
      initDashboard();
    }
  }

})(typeof window !== 'undefined' ? window : this);
