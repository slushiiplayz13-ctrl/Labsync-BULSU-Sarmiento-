/* ================================================================
   LabSync – Laboratory Service  |  js/services/laboratory.service.js
   ================================================================ */

'use strict';

/**
 * Fetches all registered laboratory rooms from backend.
 * @returns {Promise<Array>} Array of laboratory room objects.
 */
async function fetchLaboratories() {
  const res = await fetch('/api/laboratories', { credentials: 'include' });
  if (!res.ok) {
    throw new Error('Failed to load laboratories');
  }
  return await res.json();
}

/**
 * Fetches user's assigned schedule and returns a Set of normalized assigned room numbers.
 * @returns {Promise<Set<string>>} Set of room number strings normalized without "RM" prefix.
 */
async function getUserAssignedRooms() {
  try {
    const res = await fetch('/api/schedules/user', { credentials: 'include' });
    if (!res.ok) return new Set();
    const schedules = await res.json();
    if (!Array.isArray(schedules)) return new Set();
    
    const assignedRooms = new Set();
    schedules.forEach(s => {
      const raw = String(s.Room_Number || s.room_number || s.Room || '').trim();
      if (raw) {
        const clean = raw.replace(/^RM\s*/i, '').toLowerCase();
        if (clean) assignedRooms.add(clean);
      }
    });
    return assignedRooms;
  } catch (err) {
    console.error('Error fetching user assigned rooms:', err);
    return new Set();
  }
}

/**
 * Renders laboratory cards into the specified DOM container.
 * Also handles empty state when labs list is empty.
 * @param {Array} labs - List of laboratory room objects.
 * @param {HTMLElement|string} targetContainer - Container element or selector.
 */
function renderLabCards(labs, targetContainer) {
  const container = typeof targetContainer === 'string'
    ? document.querySelector(targetContainer)
    : targetContainer;

  if (!container) return;

  if (!Array.isArray(labs) || labs.length === 0) {
    const isDashboard = window.location.pathname.includes('index.html') || window.location.pathname.includes('dashboard') || window.location.pathname === '/';
    const roomStatusLink = window.location.pathname.includes('it-head') ? 'it-head-room-status.html' : 'room-status.html';

    container.innerHTML = `
      <div class="ui-empty-state" style="grid-column: 1 / -1; padding: 28px 16px; width: 100%; flex: 1; height: 100%; min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; box-sizing: border-box;">
        <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
          <i data-lucide="calendar-off" style="width:24px;height:24px;"></i>
        </div>
        <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">No rooms assigned to your schedule yet</p>
        <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:14px;">Rooms will appear here when classes are added to your schedule.</p>
        ${isDashboard ? `<button onclick="window.location.href='${roomStatusLink}'" style="padding:9px 20px; border:none; background:var(--primary-teal); color:#fff; border-radius:18px; font-weight:600; font-size:12.5px; cursor:pointer; font-family:var(--font-body); box-shadow: 0 4px 12px var(--primary-teal-glow); transition:all 0.2s;">View All Campus Rooms</button>` : ''}
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: container });
    }
    return;
  }

  container.innerHTML = labs.map(room => {
    const isOnline = room.deviceOnline === true || room.deviceOnline === 1 || room.deviceOnline === 'true';

    let statusTheme = 'green-theme';
    let badgeClass = 'green';
    let displayStatus = room.Current_Status || 'Available';

    if (!isOnline) {
      statusTheme = 'offline-theme';
      badgeClass = 'offline';
      displayStatus = 'Offline';
    } else {
      const statusLower = (room.Current_Status || '').toLowerCase();
      if (statusLower === 'claimed') {
        statusTheme = 'orange-theme';
        badgeClass = 'orange';
      } else if (statusLower === 'in use') {
        statusTheme = 'red-theme';
        badgeClass = 'red';
      }
    }

    const scheduledProf = room.Scheduled_Class ? `${room.Scheduled_Class.professor || 'Faculty'} (${room.Scheduled_Class.subject || ''})` : null;

    let activityText = room.Current_Class || 'None';
    if (!isOnline) {
      activityText = 'Offline';
    }

    let keyStatusText = room.Key_Status || 'Present';
    let keyStatusColor = room.Key_Status === 'Absent' ? '#ef4444' : '#10b981';
    if (!isOnline) {
      keyStatusText = 'Offline';
      keyStatusColor = '#94a3b8';
    }

    return `
      <div class="lab-card ${statusTheme}">
        <div class="lab-header lc-header">
          <span class="room-num">RM ${room.Room_Number}</span>
          <span class="badge ${badgeClass}">${displayStatus}</span>
        </div>
        <div class="lab-details lc-details">
          <div class="ld-row">
            <span>Building:</span>
            <strong>${room.Building || 'Main'}</strong>
          </div>
          <div class="ld-row">
            <span>Status / Activity:</span>
            <strong class="${isOnline ? 'teal-text' : 'muted-text'}" style="font-size: 12px; word-break: break-word;">${activityText}</strong>
          </div>
          ${scheduledProf ? `
          <div class="ld-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed rgba(0,0,0,0.06);">
            <span>Scheduled Prof:</span>
            <strong style="color: #475569; font-size: 11.5px;">${scheduledProf}</strong>
          </div>
          ` : ''}
          <div class="ld-row">
            <span>Key Status:</span>
            <strong style="color: ${keyStatusColor};">${keyStatusText}</strong>
          </div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: container });
  }
}

/**
 * Renders error state UI into the laboratory container.
 * @param {HTMLElement|string} targetContainer - Container element or selector.
 */
function renderLabCardsError(targetContainer) {
  const container = typeof targetContainer === 'string'
    ? document.querySelector(targetContainer)
    : targetContainer;

  if (!container) return;

  container.innerHTML = `
    <div class="ui-empty-state">
      <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
        <i data-lucide="alert-circle"></i>
      </div>
      <p>Unable to retrieve room status</p>
    </div>
  `;
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: container });
  }
}

// Global exports for compatibility
window.fetchLaboratories = fetchLaboratories;
window.getUserAssignedRooms = getUserAssignedRooms;
window.renderLabCards = renderLabCards;
window.renderLabCardsError = renderLabCardsError;
