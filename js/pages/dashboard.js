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
  }
  await loadDashboardSchedule();
}

/**
 * Loads laboratory status and updates top dashboard stats.
 */
async function loadDashboardStatsAndLabs() {
  const labsGrid = document.querySelector('.labs-grid') || document.getElementById('ithead-labs-grid');

  if (labsGrid) {
    labsGrid.innerHTML = `
      <div class="ui-empty-state">
        <div class="ui-empty-icon">
          <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
        </div>
        <p>Loading laboratory status...</p>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: labsGrid });
    }
  }

  // 1. Fetch & Render Laboratories
  try {
    const fetchFn = typeof window.fetchLaboratories === 'function'
      ? window.fetchLaboratories
      : fetchLaboratories;

    const labs = await fetchFn();

    // Update Stats Card 1: Total Lab Rooms
    const totalLabsVal = document.querySelector('.stat-card:nth-child(1) .stat-value') || document.getElementById('ithead-stat-rooms');
    const totalLabsMeta = document.querySelector('.stat-card:nth-child(1) .stat-meta') || document.getElementById('ithead-stat-pcs-meta');
    if (totalLabsVal) totalLabsVal.textContent = labs.length;
    if (totalLabsMeta) totalLabsMeta.textContent = `${labs.length} room(s) registered`;

    // Update Stats Card 2: Available Labs
    const availLabsVal = document.querySelector('.stat-card:nth-child(2) .stat-value') || document.getElementById('ithead-stat-available');
    const availLabsMeta = document.querySelector('.stat-card:nth-child(2) .stat-meta') || document.getElementById('ithead-stat-avail-meta');
    const availableCount = labs.filter(r => String(r.Current_Status || '').toLowerCase() === 'available').length;
    if (availLabsVal) availLabsVal.textContent = availableCount;
    if (availLabsMeta) availLabsMeta.textContent = `${availableCount} available now`;

    // Render Laboratory Cards into grid
    if (labsGrid) {
      const renderFn = typeof window.renderLabCards === 'function'
        ? window.renderLabCards
        : renderLabCards;
      renderFn(labs, labsGrid);
    }
  } catch (err) {
    console.error('Dashboard laboratory loading failed:', err);
    if (labsGrid) {
      const renderErrFn = typeof window.renderLabCardsError === 'function'
        ? window.renderLabCardsError
        : renderLabCardsError;
      renderErrFn(labsGrid);
    }
  }

  // 2. Fetch PC Reports independently for Stats Card 3 (Pending PC Reports)
  try {
    const reportsRes = await fetch('/api/reports', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
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
    } else {
      console.error('Dashboard reports fetch failed:', {
        status: reportsRes.status,
        statusText: reportsRes.statusText
      });
    }
  } catch (err) {
    console.error('Error loading dashboard PC reports:', err);
  }
}

/**
 * Loads today's user schedule and populates timeline.
 * Authoritative single schedule loader used by both Faculty and IT Dept. Head dashboards.
 */
async function loadDashboardSchedule() {
  const timelineList = document.querySelector('.timeline-list') || document.getElementById('ithead-schedule-list');
  if (!timelineList) return;

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
      <div class="ui-empty-icon">
        <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
      </div>
      <p>Loading today's classes...</p>
    </div>
  `;
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: timelineList });
  }

  try {
    const currentYear = new Date().getFullYear();
    const ay = `${currentYear}-${currentYear + 1}`;
    const sem = '1st Semester';

    const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    const contentType = res.headers.get('content-type') || '';
    let payload = null;

    if (contentType.includes('application/json')) {
      payload = await res.json();
    } else {
      payload = await res.text();
    }

    if (!res.ok) {
      console.error('Dashboard schedule loading failed:', {
        status: res.status,
        statusText: res.statusText,
        payload
      });

      let errorMsg = 'Failed to load schedule.';
      if (res.status === 401) {
        errorMsg = 'Authentication required. Please log in.';
      } else if (res.status === 403) {
        errorMsg = 'Access forbidden.';
      } else if (res.status >= 500) {
        errorMsg = 'Server error loading schedule.';
      } else if (payload && typeof payload === 'object' && payload.error) {
        errorMsg = payload.error;
      }

      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
          <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
            <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
          </div>
          <p>${escapeHtml(errorMsg)}</p>
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: timelineList });
      }
      return;
    }

    if (!Array.isArray(payload)) {
      console.error('Unexpected schedule API response:', payload);
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
          <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
            <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
          </div>
          <p>Unexpected response format received for schedule.</p>
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: timelineList });
      }
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
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: timelineList });
      }
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

    // Determine current time to mark items as active, future, or completed
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

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
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: timelineList });
    }

  } catch (err) {
    console.error('Error loading dashboard schedule:', err);
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
        <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
          <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
        </div>
        <p>Failed to load schedule.</p>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: timelineList });
    }
  }
}

// Expose globally for compatibility
window.initDashboard = initDashboard;
window.loadDashboardStatsAndLabs = loadDashboardStatsAndLabs;
window.loadDashboardSchedule = loadDashboardSchedule;
