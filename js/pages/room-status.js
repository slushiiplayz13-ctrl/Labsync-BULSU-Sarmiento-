/* ================================================================
   LabSync – Room Status Page Coordinator  |  js/pages/room-status.js
   Coordinating laboratory status cards, SWR caching, and modular timeline:
     - js/pages/room-status/room-status.timeline.js
   ================================================================ */

'use strict';

(function (global) {
  /**
   * Loads and renders all laboratory room status cards with instant SWR pre-rendering.
   */
  async function loadAllRoomStatusLabs() {
    const labsGrid = document.querySelector('.labs-grid');
    if (!labsGrid) return;

    // Instant SWR pre-render from session cache (0ms delay!)
    try {
      const cached = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
      const renderFn = (global.laboratoryService && typeof global.laboratoryService.renderLabCards === 'function')
        ? global.laboratoryService.renderLabCards
        : (typeof global.renderLabCards === 'function' ? global.renderLabCards : null);

      if (Array.isArray(cached) && cached.length > 0 && typeof renderFn === 'function') {
        renderFn(cached, labsGrid);
      }
    } catch (e) {}

    try {
      const fetchFn = (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function')
        ? global.laboratoryService.fetchLaboratories
        : (typeof global.fetchLaboratories === 'function' ? global.fetchLaboratories : null);

      if (typeof fetchFn !== 'function') {
        throw new Error('laboratoryService is unavailable');
      }

      const allLabs = await fetchFn();
      const renderFn = (global.laboratoryService && typeof global.laboratoryService.renderLabCards === 'function')
        ? global.laboratoryService.renderLabCards
        : (typeof global.renderLabCards === 'function' ? global.renderLabCards : null);

      if (typeof renderFn === 'function') {
        renderFn(allLabs, labsGrid);
      }
    } catch (err) {
      console.error('[RoomStatus] Error loading all room status labs:', err);
      const renderErrFn = (global.laboratoryService && typeof global.laboratoryService.renderLabCardsError === 'function')
        ? global.laboratoryService.renderLabCardsError
        : (typeof global.renderLabCardsError === 'function' ? global.renderLabCardsError : null);

      if (typeof renderErrFn === 'function') {
        renderErrFn(labsGrid);
      } else {
        labsGrid.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
              <i data-lucide="alert-circle"></i>
            </div>
            <p>Failed to load laboratories.</p>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: labsGrid });
        }
      }
    }
  }

  /**
   * Compatibility wrapper for loading room status occupancy activities.
   */
  function handleLoadRoomStatusActivityLog() {
    if (global.roomStatusTimeline && typeof global.roomStatusTimeline.loadRoomStatusActivityLog === 'function') {
      return global.roomStatusTimeline.loadRoomStatusActivityLog();
    }
  }

  // Preserve global contracts for legacy scripts, notifications.js, and app.js callers
  global.loadAllRoomStatusLabs = loadAllRoomStatusLabs;
  global.loadRoomStatusActivityLog = handleLoadRoomStatusActivityLog;

})(typeof window !== 'undefined' ? window : this);
