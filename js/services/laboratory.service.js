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
  const data = await res.json();
  try {
    sessionStorage.setItem('labsync_cached_labs', JSON.stringify(data));
  } catch (e) { }
  return data;
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

    const hasLoadingSpinner = container.querySelector('.animate-spin') !== null;
    if (!hasLoadingSpinner && container._lastRenderSignature === '__EMPTY__') {
      return;
    }
    container._lastRenderSignature = '__EMPTY__';

    container.innerHTML = `
      <div class="ui-empty-state" style="grid-column: 1 / -1; padding: 28px 16px; width: 100%; flex: 1; height: 100%; min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; box-sizing: border-box;">
        <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
          <i data-lucide="calendar-off" style="width:24px;height:24px;"></i>
        </div>
        <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">No rooms assigned to your schedule yet</p>
        <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:14px;">Rooms will appear here when classes are added to your schedule.</p>
        ${isDashboard ? `<button type="button" onclick="window.location.href='${roomStatusLink}'" class="ui-empty-btn"><i data-lucide="layout-grid" style="width:14px;height:14px;"></i> View All Lab Rooms</button>` : ''}
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: container });
    }
    return;
  }

  // Fingerprint data to avoid destroying and recreating DOM nodes when data is unchanged
  const dataSignature = labs.map(r => `${r.Room_ID || r.Room_Number}-${r.Current_Status}-${r.deviceOnline}-${r.Key_Status}-${r.Current_Key_Holder || ''}-${r.total_pc_issues}-${r.Scheduled_Class ? (r.Scheduled_Class.professor || '') + '-' + (r.Scheduled_Class.subject || '') : ''}`).join('|');

  const hasLoadingSpinner = container.querySelector('.animate-spin') !== null;
  if (!hasLoadingSpinner && container._lastRenderSignature === dataSignature) {
    return; // Unchanged data, skip re-rendering to prevent flashing
  }
  container._lastRenderSignature = dataSignature;

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
      if (statusLower === 'borrowed' || statusLower === 'claimed') {
        statusTheme = 'orange-theme';
        badgeClass = 'orange';
        displayStatus = 'Borrowed';
      } else if (statusLower === 'in session' || statusLower === 'in use') {
        statusTheme = 'red-theme';
        badgeClass = 'red';
        displayStatus = 'In Session';
      } else {
        statusTheme = 'green-theme';
        badgeClass = 'green';
        displayStatus = 'Available';
      }
    }

    let keyHolderText = 'None';
    let keyHolderColorClass = 'muted-text';

    if (!isOnline) {
      keyHolderText = 'Offline';
      keyHolderColorClass = 'muted-text';
    } else {
      const isAbsent = room.Key_Status === 'Absent' ||
        (room.Current_Status || '').toLowerCase() === 'borrowed' ||
        (room.Current_Status || '').toLowerCase() === 'in session';
      if (isAbsent) {
        let rawHolder = room.Current_Key_Holder;
        if (!rawHolder && room.Scheduled_Class && room.Scheduled_Class.professor) {
          rawHolder = room.Scheduled_Class.professor;
        }
        if (rawHolder) {
          const cleanHolder = String(rawHolder).replace(/^Prof\.?\s*/i, '').trim();
          keyHolderText = cleanHolder;
          keyHolderColorClass = 'teal-text';
        } else {
          keyHolderText = 'Unregistered';
          keyHolderColorClass = 'amber-text';
        }
      } else {
        keyHolderText = 'None';
        keyHolderColorClass = 'muted-text';
      }
    }

    let scheduledProfText = 'None';
    if (room.Scheduled_Class && room.Scheduled_Class.professor) {
      const cleanProf = String(room.Scheduled_Class.professor).replace(/^Prof\.?\s*/i, '').trim();
      if (cleanProf) scheduledProfText = cleanProf;
    }

    const pcIssues = Array.isArray(room.pc_issues) ? room.pc_issues : [];
    const totalPcIssues = room.total_pc_issues || 0;

    const isItHead = window.location.pathname.includes('it-head') || (window.currentUser && window.currentUser.Role === 'IT Dept. Head');
    const reportsPage = isItHead ? 'it-head-pc-reports.html' : 'faculty-pc-reports.html';
    const targetUrl = `${reportsPage}?room=${encodeURIComponent(room.Room_Number)}`;

    let pcStatusHtml = '';
    if (totalPcIssues > 0) {
      pcStatusHtml = `
        <div class="ld-row pc-status-row">
          <span class="ld-label">
            <i data-lucide="alert-triangle" class="ld-icon issue-icon"></i>
            <span class="issue-label">${totalPcIssues} PC ${totalPcIssues === 1 ? 'Issue' : 'Issues'}</span>
          </span>
          <button type="button" class="btn-health-view" onclick="window.location.href='${targetUrl}'" title="View reports for RM ${room.Room_Number}">
            <span>View</span>
            <i data-lucide="arrow-right"></i>
          </button>
        </div>
      `;
    } else if (isOnline) {
      pcStatusHtml = `
        <div class="ld-row pc-status-row">
          <span class="ld-label">
            <i data-lucide="check-circle-2" class="ld-icon" style="color:#10B981;"></i>
            <span>PC Status</span>
          </span>
          <strong class="ld-value" style="color: #10B981;">All Operational</strong>
        </div>
      `;
    } else {
      pcStatusHtml = `
        <div class="ld-row pc-status-row">
          <span class="ld-label">
            <i data-lucide="radio" class="ld-icon" style="color:#94A3B8;"></i>
            <span>PC Status</span>
          </span>
          <strong class="ld-value muted-text" style="color: #94A3B8;">Offline</strong>
        </div>
      `;
    }

    return `
      <div class="lab-card ${statusTheme}">
        <div class="lab-header lc-header">
          <div class="room-title-group">
            <h3 class="room-num">RM ${room.Room_Number}</h3>
            <span class="room-subtitle">${room.Building || 'Main Building'}</span>
          </div>
          <span class="badge ${badgeClass}">${displayStatus}</span>
        </div>
        
        <div class="lab-details lc-details">
          <div class="ld-row">
            <span class="ld-label">
              <i data-lucide="key-round" class="ld-icon"></i>
              <span>Claimed By</span>
            </span>
            <strong class="${keyHolderColorClass} ld-value" title="${keyHolderText}">${keyHolderText}</strong>
          </div>
          
          <div class="ld-row scheduled-row">
            <span class="ld-label">
              <i data-lucide="user-check" class="ld-icon"></i>
              <span>Scheduled</span>
            </span>
            <strong class="${scheduledProfText !== 'None' ? 'ld-value' : 'ld-value muted-text'}" style="${scheduledProfText !== 'None' ? 'color: #64748b;' : ''}" title="${scheduledProfText}">${scheduledProfText}</strong>
          </div>
        </div>

        <div class="lab-card-footer">
          ${pcStatusHtml}
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
    <div class="ui-empty-state" style="grid-column: 1 / -1; padding: 28px 16px; width: 100%; flex: 1; height: 100%; min-height: 240px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; box-sizing: border-box;">
      <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
        <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
      </div>
      <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">Unable to retrieve room status</p>
      <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:12px;">Connection to the laboratory sync gateway timed out.</p>
      <button type="button" class="ui-empty-btn" onclick="window.location.reload()"><i data-lucide="refresh-cw" style="width:14px;height:14px;"></i> Reload Page</button>
    </div>
  `;
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: container });
  }
}

/**
 * Adds a new laboratory room.
 * @param {string} roomNumber - Room number
 * @param {string} building - Building name
 * @returns {Promise<object>}
 */
async function addLaboratory(roomNumber, building) {
  const res = await fetch('/api/laboratories/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ roomNumber, building })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add room');
  return data;
}

/**
 * Updates an existing laboratory room.
 * @param {string|number} roomId - Room ID
 * @param {string} roomNumber - Updated room number
 * @param {string} building - Updated building name
 * @returns {Promise<object>}
 */
async function updateLaboratory(roomId, roomNumber, building) {
  const res = await fetch(`/api/laboratories/${roomId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ roomNumber, building })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update room');
  return data;
}

/**
 * Deletes a laboratory room and its associated schedules.
 * @param {string|number} roomId - Room ID
 * @returns {Promise<object>}
 */
async function deleteLaboratory(roomId) {
  const res = await fetch(`/api/laboratories/${roomId}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to delete room');
  return data;
}

const laboratoryService = {
  fetchLaboratories,
  getUserAssignedRooms,
  renderLabCards,
  renderLabCardsError,
  addLaboratory,
  updateLaboratory,
  deleteLaboratory
};

// Global exports for compatibility
window.fetchLaboratories = fetchLaboratories;
window.getUserAssignedRooms = getUserAssignedRooms;
window.renderLabCards = renderLabCards;
window.renderLabCardsError = renderLabCardsError;
window.addLaboratory = addLaboratory;
window.updateLaboratory = updateLaboratory;
window.deleteLaboratory = deleteLaboratory;
window.laboratoryService = laboratoryService;

