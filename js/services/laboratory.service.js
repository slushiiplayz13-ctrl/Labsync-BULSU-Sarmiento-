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
    container.innerHTML = `
      <div class="ui-empty-state">
        <div class="ui-empty-icon">
          <i data-lucide="monitor-dot" style="width:24px;height:24px;"></i>
        </div>
        <p>No laboratories registered.</p>
      </div>
    `;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: container });
    }
    return;
  }

  container.innerHTML = labs.map(room => {
    let statusTheme = 'green-theme';
    if (room.Current_Status.toLowerCase() === 'claimed') statusTheme = 'orange-theme';
    else if (room.Current_Status.toLowerCase() === 'in use') statusTheme = 'red-theme';

    return `
      <div class="lab-card ${statusTheme}">
        <div class="lab-header lc-header">
          <span class="room-num">RM ${room.Room_Number}</span>
          <span class="badge ${room.Current_Status.toLowerCase() === 'in use' ? 'red' : (room.Current_Status.toLowerCase() === 'claimed' ? 'orange' : 'green')}">${room.Current_Status}</span>
        </div>
        <div class="lab-details lc-details">
          <div class="ld-row">
            <span>Building:</span>
            <strong>${room.Building || 'Main'}</strong>
          </div>
          <div class="ld-row">
            <span>Active Class:</span>
            <strong class="teal-text">${room.Current_Class || 'None'}</strong>
          </div>
          <div class="ld-row">
            <span>Key Status:</span>
            <strong style="color: ${room.Key_Status === 'Absent' ? '#ef4444' : '#10b981'};">${room.Key_Status || 'Present'}</strong>
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
      <p>Failed to load laboratories.</p>
    </div>
  `;
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: container });
  }
}

// Global exports for compatibility
window.fetchLaboratories = fetchLaboratories;
window.renderLabCards = renderLabCards;
window.renderLabCardsError = renderLabCardsError;
