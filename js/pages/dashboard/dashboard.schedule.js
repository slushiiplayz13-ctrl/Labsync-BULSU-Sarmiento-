/**
 * LabSync – Dashboard Teaching Schedule & Timeline Module  |  js/pages/dashboard/dashboard.schedule.js
 * Encapsulates teaching schedule fetching, today-filtering, active/upcoming/completed status, 5-minute signature diffing, and timeline rendering.
 */

(function (global) {
  'use strict';

  let _isFetchingSchedule = false;
  let _scheduleFirstLoad = true;
  let _lastScheduleSignature = '';

  /**
   * Safe HTML string escaper.
   * @param {string} str
   * @returns {string}
   */
  function escapeText(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Safe time formatter.
   * @param {string} timeStr
   * @returns {string}
   */
  function formatTime(timeStr) {
    if (typeof global.formatTime12 === 'function') return global.formatTime12(timeStr);
    if (global.timeUtils && typeof global.timeUtils.formatTime12 === 'function') return global.timeUtils.formatTime12(timeStr);
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  /**
   * Renders the schedule items into the timeline list DOM element.
   * @param {Array} todaySchedules
   * @param {HTMLElement} timelineList
   * @param {number} nowMinutes
   */
  function renderScheduleDOM(todaySchedules, timelineList, nowMinutes) {
    if (!timelineList) return;

    if (!todaySchedules || todaySchedules.length === 0) {
      if (timelineList._lastScheduleSignature === '__EMPTY__' && timelineList.querySelector('.ui-empty-state')) {
        return;
      }
      timelineList._lastScheduleSignature = '__EMPTY__';

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
      return;
    }

    const currentSignature = todaySchedules.map(s => `${s.Schedule_ID || s.Subject_Name}-${s.Start_Time}-${s.End_Time}-${s.Room_Number}-${s.Section}`).join('|') + `_${Math.floor(nowMinutes / 5)}`;

    if (timelineList._lastScheduleSignature === currentSignature && timelineList.querySelector('.timeline-item') !== null) {
      return; // Already rendered with identical signature, skip DOM rewrite
    }
    timelineList._lastScheduleSignature = currentSignature;

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
                <span>${formatTime(s.Start_Time)} – ${formatTime(s.End_Time)}</span>
              </div>
              ${isActive ? '<span class="tc-status-pill ongoing"><span class="dot"></span> ONGOING</span>' : (isFuture ? '<span class="tc-status-pill upcoming">UPCOMING</span>' : '<span class="tc-status-pill completed">COMPLETED</span>')}
            </div>
            <div class="tc-title">${escapeText(s.Subject_Name || 'Class Session')}</div>
            <div class="tc-bottom-row">
              <span class="tc-room-badge">
                <i data-lucide="map-pin" style="width:12px;height:12px;"></i> RM ${escapeText(s.Room_Number || 'TBA')}
              </span>
              ${s.Section ? `<span class="tc-section-badge">${escapeText(s.Section)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    timelineList.innerHTML = html;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: timelineList });
    }
  }

  /**
   * Loads today's user schedule and populates the timeline.
   * Flicker-free background updates via signature diffing and instant SWR caching.
   */
  async function loadDashboardSchedule() {
    if (_isFetchingSchedule) return;
    _isFetchingSchedule = true;

    const timelineList = document.querySelector('.timeline-list') || document.getElementById('ithead-schedule-list');
    if (!timelineList) {
      _isFetchingSchedule = false;
      return;
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[new Date().getDay()];
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // 1. Instant SWR pre-render from sessionStorage cache (0ms delay!)
    try {
      const cachedSchedule = JSON.parse(sessionStorage.getItem('labsync_cached_user_schedule') || 'null');
      if (Array.isArray(cachedSchedule) && cachedSchedule.length > 0) {
        const todaySchedules = cachedSchedule.filter(s =>
          String(s.Day_of_Week || '').trim().toLowerCase() === todayName.toLowerCase()
        );
        todaySchedules.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

        // Pre-hydrate Stats Card 4: Classes Today
        const classesTodayVal = document.querySelector('.stat-card:nth-child(4) .stat-value') || document.getElementById('ithead-stat-classes');
        const classesTodayMeta = document.querySelector('.stat-card:nth-child(4) .stat-meta') || document.getElementById('ithead-stat-classes-meta');
        if (classesTodayVal) classesTodayVal.textContent = todaySchedules.length;
        if (classesTodayMeta) {
          classesTodayMeta.textContent = todaySchedules.length > 0
            ? `${todaySchedules.length} session(s) scheduled today`
            : 'No classes today';
        }

        const currentSignature = todaySchedules.map(s => `${s.Schedule_ID || s.Subject_Name}-${s.Start_Time}-${s.End_Time}-${s.Room_Number}-${s.Section}`).join('|') + `_${Math.floor(nowMinutes / 5)}`;
        _lastScheduleSignature = currentSignature;

        if (timelineList._lastScheduleSignature !== currentSignature || timelineList.querySelector('.timeline-item') === null) {
          timelineList._lastScheduleSignature = currentSignature;
          renderScheduleDOM(todaySchedules, timelineList, nowMinutes);
        }
      }
    } catch (e) {
      // Ignore cache read errors
    }

    // ONLY show loading spinner on initial load IF the timeline has NO items and NO cache
    const hasItems = timelineList.querySelector('.timeline-item') !== null;
    if (_scheduleFirstLoad && !hasItems && !timelineList.querySelector('.ui-empty-state')) {
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
      const termInfo = (global.AcademicTerm && typeof global.AcademicTerm.getActiveTerm === 'function')
        ? global.AcademicTerm.getActiveTerm()
        : { academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, semester: '1st Semester' };
      const ay = termInfo.academicYear;
      const sem = termInfo.semester;

      const getUserSchedFn = (global.scheduleService && typeof global.scheduleService.getUserSchedule === 'function')
        ? global.scheduleService.getUserSchedule
        : (typeof global.getUserSchedule === 'function' ? global.getUserSchedule : null);

      let payload = null;
      if (typeof getUserSchedFn === 'function') {
        payload = await getUserSchedFn(ay, sem);
      }

      if (!payload) {
        console.error('[DashboardSchedule] Schedule loading failed: empty payload');

        if (_scheduleFirstLoad && !timelineList.querySelector('.timeline-item')) {
          const errorMsg = 'Failed to load schedule.';
          timelineList.innerHTML = `
            <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
              <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
                <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
              </div>
              <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">${escapeText(errorMsg)}</p>
              <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:10px;">Please check your connection and try again.</p>
              <button type="button" class="ui-empty-btn" onclick="window.initDashboard()"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Retry Connection</button>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: timelineList });
          }
        }
        return;
      }

      if (!Array.isArray(payload)) {
        console.error('[DashboardSchedule] Unexpected schedule API response:', payload);
        return;
      }

      const schedules = payload;

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
          ? `${todaySchedules.length} session(s) scheduled today`
          : 'No classes today';
      }

      // Signature diffing with 5-minute bucket to avoid destroying DOM if unchanged
      const currentSignature = todaySchedules.map(s => `${s.Schedule_ID || s.Subject_Name}-${s.Start_Time}-${s.End_Time}-${s.Room_Number}-${s.Section}`).join('|') + `_${Math.floor(nowMinutes / 5)}`;

      const effectiveSig = _lastScheduleSignature || timelineList._lastScheduleSignature;
      if (currentSignature === effectiveSig && timelineList.querySelector('.timeline-item') !== null) {
        _lastScheduleSignature = currentSignature;
        timelineList._lastScheduleSignature = currentSignature;
        _scheduleFirstLoad = false;
        return; // Content unchanged, skip DOM write
      }
      _lastScheduleSignature = currentSignature;
      timelineList._lastScheduleSignature = currentSignature;

      renderScheduleDOM(todaySchedules, timelineList, nowMinutes);

      _scheduleFirstLoad = false;

    } catch (err) {
      console.error('[DashboardSchedule] Error loading dashboard schedule:', err);
    } finally {
      _isFetchingSchedule = false;
    }
  }

  const dashboardSchedule = {
    loadDashboardSchedule,
    renderScheduleDOM
  };

  global.dashboardSchedule = dashboardSchedule;

})(typeof window !== 'undefined' ? window : this);
