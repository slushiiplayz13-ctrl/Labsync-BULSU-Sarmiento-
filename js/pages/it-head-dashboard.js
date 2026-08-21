/* ================================================================
   LabSync – IT Dept Head Dashboard Controller  |  js/pages/it-head-dashboard.js
   ================================================================ */

'use strict';

/**
 * Escapes HTML string content for safe DOM injection.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function') {
    return window.escapeHtml(str);
  }
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Formats 24h time string (HH:MM:SS or HH:MM) to 12h AM/PM format.
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime12(timeStr) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  hour = hour ? hour : 12;
  return `${hour}:${minute} ${ampm}`;
}

/**
 * Renders the IT Head teaching schedule timeline list.
 * @param {Array} myClasses - List of teaching class objects
 */
function renderMyTeachingSchedule(myClasses) {
  const container = document.getElementById('ithead-schedule-list');
  if (!container) return;

  if (!myClasses || myClasses.length === 0) {
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
        <div class="ui-empty-icon"><i data-lucide="calendar-days" style="width:24px;height:24px;"></i></div>
        <p>No classes scheduled for today.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: container });
    return;
  } else {
    container.style.paddingLeft = '';
    container.style.paddingRight = '';
    container.style.display = '';
    container.style.flexDirection = '';
    container.style.justifyContent = '';
    container.style.alignItems = '';
    container.style.flex = '';
    container.style.height = '';
  }

  // Sort chronologically
  myClasses.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

  // Determine current time to mark items as active or future
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let html = '';
  myClasses.forEach((s) => {
    // Parse start and end times to see if active
    let isActive = false;
    let isFuture = false;
    if (s.Start_Time && s.End_Time) {
      const startParts = s.Start_Time.split(':');
      const endParts = s.End_Time.split(':');
      const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
      const endMin = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);

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
  if (window.lucide) lucide.createIcons({ root: container });
}

/**
 * Renders laboratory room status cards in the IT Head grid.
 * @param {Array} rooms - List of laboratory room objects
 */
function renderMyLaboratoriesGrid(rooms) {
  const grid = document.getElementById('ithead-labs-grid');
  if (!grid) return;

  if (!rooms || rooms.length === 0) {
    grid.innerHTML = `
      <div class="ui-empty-state">
        <div class="ui-empty-icon"><i data-lucide="monitor-dot"></i></div>
        <p>No laboratory rooms found.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = rooms.map(r => {
    const statusClass = (r.Current_Status || 'Available').toLowerCase().replace(/\s+/g, '-');
    const badgeColor = statusClass === 'in-use' ? '#EF4444' : (statusClass === 'claimed' ? '#F59E0B' : '#10B981');
    const badgeBg = statusClass === 'in-use' ? '#FEE2E2' : (statusClass === 'claimed' ? '#FEF3C7' : '#D1FAE5');

    return `
      <div class="lab-card" style="background: var(--bg-white); border: 1px solid var(--border-light); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 800; font-size: 16px; color: var(--text-dark);">Room ${r.Room_Number}</div>
          <span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; background: ${badgeBg}; color: ${badgeColor}; text-transform: uppercase;">
            ${r.Current_Status}
          </span>
        </div>
        <div style="font-size: 12.5px; color: var(--text-mid);">${r.Building || 'IT Building'}</div>
        <div style="font-size: 12px; color: var(--text-dark); font-weight: 600; background: var(--bg-body); padding: 8px 10px; border-radius: 8px;">
          ${r.Current_Class !== 'None' ? r.Current_Class : 'No Active Class'}
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * Dynamic loader for Department Head Dashboard metrics, room grid, and schedule.
 */
async function loadITHeadDashboardData() {
  try {
    const [summaryRes, roomsRes] = await Promise.all([
      fetch('/api/dashboard/it-head-summary'),
      fetch('/api/laboratories')
    ]);

    if (summaryRes.ok) {
      const stats = await summaryRes.json();

      document.getElementById('ithead-stat-rooms').textContent = stats.totalRooms;
      document.getElementById('ithead-stat-pcs-meta').textContent = `${stats.totalPcs} Registered PCs`;

      document.getElementById('ithead-stat-available').textContent = stats.availableRooms;
      document.getElementById('ithead-stat-avail-meta').textContent = `${stats.inUseRooms} In Use • ${stats.claimedRooms} Claimed`;

      document.getElementById('ithead-stat-pending').textContent = stats.pendingReports;
      document.getElementById('ithead-stat-pending-meta').textContent = stats.pendingReports > 0 ? 'Action Recommended' : 'All Systems Clear';

      document.getElementById('ithead-stat-classes').textContent = stats.classesToday;
      document.getElementById('ithead-stat-classes-meta').textContent = `${stats.myClassesToday.length} Teaching Classes Today`;

      renderMyTeachingSchedule(stats.myClassesToday);
    }

    if (roomsRes.ok) {
      const rooms = await roomsRes.json();
      renderMyLaboratoriesGrid(rooms);
    }
  } catch (err) {
    console.error('Error loading IT Head dashboard:', err);
  }
}

/**
 * Initializes sidebar scroll clue and triggers dashboard load.
 */
function initITHeadDashboardPage() {
  const sidebar = document.querySelector('.sidebar');
  const scrollClue = document.getElementById('sidebarScrollClue');

  if (sidebar && scrollClue) {
    if (sidebar.scrollHeight <= sidebar.clientHeight) {
      scrollClue.style.display = 'none';
    }
    sidebar.addEventListener('scroll', () => {
      if (sidebar.scrollTop > 10) {
        scrollClue.style.opacity = '0';
      } else {
        scrollClue.style.opacity = '1';
      }
    });
  }

  loadITHeadDashboardData();
}

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initITHeadDashboardPage);
} else {
  initITHeadDashboardPage();
}
