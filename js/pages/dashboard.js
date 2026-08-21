/* ================================================================
   LabSync – Dashboard Page Controller  |  js/pages/dashboard.js
   ================================================================ */

'use strict';

/**
 * Initializes dashboard page features.
 */
async function initDashboard() {
  if (typeof window.loadDashboardStatsAndLabs === 'function') {
    await window.loadDashboardStatsAndLabs();
  } else if (typeof loadDashboardStatsAndLabs === 'function') {
    await loadDashboardStatsAndLabs();
  }
  await loadDashboardSchedule();
}

/**
 * Loads today's user schedule and populates timeline.
 */
async function loadDashboardSchedule() {
  const timelineList = document.querySelector('.timeline-list');
  if (!timelineList) return;

  timelineList.innerHTML = `
    <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
      <div class="ui-empty-icon">
        <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
      </div>
      <p>Loading today's classes...</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: timelineList });

  try {
    const currentYear = new Date().getFullYear();
    // Default current term params
    const ay = `${currentYear}-${currentYear + 1}`;
    const sem = '1st Semester';

    const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`);
    if (!res.ok) throw new Error('Failed to load schedules');
    const schedules = await res.json();

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[new Date().getDay()];

    // Filter for today
    const todaySchedules = schedules.filter(s => s.Day_of_Week === todayName);

    // Sort chronologically
    todaySchedules.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

    // Update stats grid card for Classes Today
    const classesTodayVal = document.querySelector('.stat-card:nth-child(4) .stat-value');
    const classesTodayMeta = document.querySelector('.stat-card:nth-child(4) .stat-meta');
    if (classesTodayVal) {
      classesTodayVal.textContent = todaySchedules.length;
    }
    if (classesTodayMeta) {
      classesTodayMeta.textContent = todaySchedules.length > 0
        ? `${todaySchedules.length} session(s) scheduled`
        : 'No classes today';
    }

    if (todaySchedules.length === 0) {
      timelineList.style.paddingLeft = '0';
      timelineList.style.paddingRight = '0';
      timelineList.style.display = 'flex';
      timelineList.style.flexDirection = 'column';
      timelineList.style.justifyContent = 'center';
      timelineList.style.alignItems = 'center';
      timelineList.style.flex = '1';
      timelineList.style.height = '100%';
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column: unset; width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; margin: auto 0;">
          <div class="ui-empty-icon">
            <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
          </div>
          <p>No classes scheduled for today.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: timelineList });
      return;
    } else {
      timelineList.style.paddingLeft = '';
      timelineList.style.paddingRight = '';
      timelineList.style.display = '';
      timelineList.style.flexDirection = '';
      timelineList.style.justifyContent = '';
      timelineList.style.alignItems = '';
      timelineList.style.flex = '';
      timelineList.style.height = '';
    }

    // Determine current time to mark items as active or future
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let html = '';
    todaySchedules.forEach((s) => {
      // Parse start and end times to see if active
      let isActive = false;
      let isFuture = false;
      if (s.Start_Time && s.End_Time) {
        const startParts = s.Start_Time.split(':');
        const endParts = s.End_Time.split(':');
        const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

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

    if (window.lucide) lucide.createIcons({ root: timelineList });

  } catch (err) {
    console.error('Error loading dashboard schedule:', err);
    timelineList.innerHTML = `
      <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
        <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
          <i data-lucide="alert-circle"></i>
        </div>
        <p>Failed to load schedule.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: timelineList });
  }
}

// Expose globally for compatibility
window.initDashboard = initDashboard;
window.loadDashboardSchedule = loadDashboardSchedule;
