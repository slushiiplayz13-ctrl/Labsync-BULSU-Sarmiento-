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
  if (typeof window.escapeHtml === 'function' && window.escapeHtml !== escapeHtml) {
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
  if (typeof window.formatTime12 === 'function' && window.formatTime12 !== formatTime12) {
    return window.formatTime12(timeStr);
  }
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  let hour = parseInt(parts[0], 10);
  const minute = parts[1] || '00';
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
        <div class="ui-empty-icon"><i data-lucide="calendar-days" style="width:24px;height:24px;"></i></div>
        <p>No classes scheduled for today.</p>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: container });
    }
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
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: container });
  }
}

/**
 * Dynamic loader for Department Head Dashboard metrics, room grid, and schedule.
 * Loads laboratories and IT Head summary stats independently so failures in one do not block the other.
 */
async function loadITHeadDashboardData() {
  const labsContainer = document.getElementById('ithead-labs-grid') || '.labs-grid';
  const scheduleContainer = document.getElementById('ithead-schedule-list');

  // Show immediate loading state in schedule container if present
  if (scheduleContainer) {
    scheduleContainer.style.paddingLeft = '0';
    scheduleContainer.style.paddingRight = '0';
    scheduleContainer.style.display = 'flex';
    scheduleContainer.style.flexDirection = 'column';
    scheduleContainer.style.justifyContent = 'center';
    scheduleContainer.style.alignItems = 'center';
    scheduleContainer.style.flex = '1';
    scheduleContainer.style.height = '100%';
    scheduleContainer.innerHTML = `
      <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
        <div class="ui-empty-icon">
          <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
        </div>
        <p>Loading today's classes...</p>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: scheduleContainer });
    }
  }

  // 1. Fetch & Render IT Head Summary Stat Cards
  try {
    const summaryRes = await fetch('/api/dashboard/it-head-summary', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (summaryRes.ok) {
      const stats = await summaryRes.json();

      const elRooms = document.getElementById('ithead-stat-rooms');
      if (elRooms) elRooms.textContent = stats.totalRooms;

      const elPcsMeta = document.getElementById('ithead-stat-pcs-meta');
      if (elPcsMeta) elPcsMeta.textContent = `${stats.totalRooms} room(s) registered`;

      const elAvail = document.getElementById('ithead-stat-available');
      if (elAvail) elAvail.textContent = stats.availableRooms;

      const elAvailMeta = document.getElementById('ithead-stat-avail-meta');
      if (elAvailMeta) elAvailMeta.textContent = `${stats.availableRooms} available now`;

      const elPending = document.getElementById('ithead-stat-pending');
      if (elPending) elPending.textContent = stats.pendingReports;

      const elPendingMeta = document.getElementById('ithead-stat-pending-meta');
      if (elPendingMeta) elPendingMeta.textContent = `${stats.pendingReports} active ticket(s)`;
    }
  } catch (err) {
    console.error('Error loading IT Head summary metrics:', err);
  }

  // 2. Delegate Schedule Loading to shared loadDashboardSchedule (exact same implementation as Faculty)
  if (typeof window.loadDashboardSchedule === 'function') {
    await window.loadDashboardSchedule();
  } else if (typeof loadDashboardSchedule === 'function') {
    await loadDashboardSchedule();
  }

  // 3. Fetch & Render Laboratories Grid filtered by user assigned schedule
  try {
    const fetchFn = typeof window.fetchLaboratories === 'function'
      ? window.fetchLaboratories
      : async () => {
          const res = await fetch('/api/laboratories', { credentials: 'include' });
          if (!res.ok) throw new Error('Failed to load laboratories');
          return await res.json();
        };

    const allLabs = await fetchFn();
    const assignedRooms = typeof window.getUserAssignedRooms === 'function'
      ? await window.getUserAssignedRooms()
      : new Set();

    const myLabs = allLabs.filter(room => {
      const roomNum = String(room.Room_Number || '').trim().replace(/^RM\s*/i, '').toLowerCase();
      return assignedRooms.has(roomNum);
    });

    const elRooms = document.getElementById('ithead-stat-rooms');
    if (elRooms) elRooms.textContent = allLabs.length;

    const elPcsMeta = document.getElementById('ithead-stat-pcs-meta');
    if (elPcsMeta) {
      elPcsMeta.textContent = myLabs.length > 0 
        ? `${myLabs.length} assigned to you (${allLabs.length} total)`
        : `${allLabs.length} registered campus lab(s)`;
    }

    const elAvail = document.getElementById('ithead-stat-available');
    const availableTotalCount = allLabs.filter(r => r.deviceOnline !== false && String(r.Current_Status || '').toLowerCase() === 'available').length;
    if (elAvail) elAvail.textContent = availableTotalCount;

    const elAvailMeta = document.getElementById('ithead-stat-avail-meta');
    if (elAvailMeta) elAvailMeta.textContent = `${availableTotalCount} available now campus-wide`;

    const renderFn = typeof window.renderLabCards === 'function'
      ? window.renderLabCards
      : null;

    if (renderFn) {
      renderFn(myLabs, labsContainer);
    } else {
      renderMyLaboratoriesGridFallback(myLabs, labsContainer);
    }
  } catch (err) {
    console.error('IT Head laboratory loading failed:', err);
    const renderErrFn = typeof window.renderLabCardsError === 'function'
      ? window.renderLabCardsError
      : null;

    if (renderErrFn) {
      renderErrFn(labsContainer);
    } else {
      const grid = typeof labsContainer === 'string' ? document.querySelector(labsContainer) : labsContainer;
      if (grid) {
        grid.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;"><i data-lucide="alert-circle"></i></div>
            <p>Failed to load laboratory status.</p>
          </div>
        `;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: grid });
        }
      }
    }
  }
}

/**
 * Fallback renderer for laboratory room status cards in the IT Head grid.
 * @param {Array} rooms - List of laboratory room objects
 * @param {HTMLElement|string} targetContainer
 */
function renderMyLaboratoriesGridFallback(rooms, targetContainer) {
  const grid = typeof targetContainer === 'string'
    ? document.querySelector(targetContainer)
    : targetContainer;

  if (!grid) return;

  if (typeof window.renderLabCards === 'function') {
    window.renderLabCards(rooms, grid);
  } else if (typeof renderLabCards === 'function') {
    renderLabCards(rooms, grid);
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

// Expose globally
window.loadITHeadDashboardData = loadITHeadDashboardData;
window.initITHeadDashboardPage = initITHeadDashboardPage;

// Auto-initialize on DOMContentLoaded or immediately if DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initITHeadDashboardPage);
} else {
  initITHeadDashboardPage();
}

