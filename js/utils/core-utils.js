/**
 * LabSync Core Utilities
 * Extracted in Phase 6A-02 (Pure Core Utilities Extraction)
 */

(function (global) {
  'use strict';

  /**
   * Format a 24-hour time string ("13:45") into a 12-hour AM/PM string ("1:45 PM")
   * @param {string} timeStr - Time string in HH:MM format
   * @returns {string} Formatted 12-hour time string
   */
  function formatTime12(timeStr) {
    if (typeof global.timeUtils !== 'undefined' && typeof global.timeUtils.formatTime12 === 'function') {
      return global.timeUtils.formatTime12(timeStr);
    }
    if (!timeStr) return '';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    if (isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${hour}:${minute} ${ampm}`;
  }

  /**
   * Format an ISO timestamp or date into a human-readable relative time string
   * @param {string|Date} timestampStr - Timestamp or ISO date string
   * @returns {string} Relative time string (e.g. "Just now", "5 minutes ago", "Aug 20, 2026")
   */
  function formatLastUpdatedTime(timestampStr) {
    if (!timestampStr) return 'Never';
    try {
      const d = new Date(timestampStr);
      if (isNaN(d.getTime())) return 'Never';

      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins === 1) return '1 minute ago';
      if (diffMins < 60) return `${diffMins} minutes ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;

      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return 'Never';
    }
  }

  let activeModalCount = 0;

  /**
   * Helper to verify if a modal element is actually visible and not closing/hidden.
   * @param {HTMLElement} el
   * @returns {boolean}
   */
  function isModalElementVisible(el) {
    if (!el || !document.contains(el)) return false;
    if (el.classList.contains('closing') || el.getAttribute('data-closing') === 'true') return false;
    if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return false;

    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      try {
        const comp = window.getComputedStyle(el);
        if (comp.display === 'none' || comp.visibility === 'hidden') return false;
      } catch (e) {}
    }

    return true;
  }

  /**
   * Safely tracks open modal instances and controls document.body.classList.toggle('modal-open').
   * Correctly handles nested/multiple modals, backdrop clicks, and dynamically removed elements.
   * @param {boolean|null} isOpen - true when a modal opens, false when it closes, or null to sync
   */
  function setModalOpenState(isOpen) {
    if (typeof document === 'undefined' || !document.body) return;

    if (isOpen === true) {
      activeModalCount = Math.max(1, activeModalCount + 1);
    } else if (isOpen === false) {
      activeModalCount = Math.max(0, activeModalCount - 1);
    }

    // Verify against actual visible modal elements currently in DOM
    const visibleModalSelectors = [
      '.modal-backdrop.active',
      '.modal-backdrop[style*="display: flex"]',
      '.modal-backdrop[style*="display: block"]',
      '.modal-overlay.active',
      '.help-modal-overlay.active',
      '.confirm-modal-overlay.active',
      '.key-modal-overlay[style*="display: flex"]',
      '.pc-modal-overlay[style*="display: flex"]',
      '.studio-modal-overlay.active',
      '#account-settings-modal',
      '#help-modal',
      '#change-password-modal',
      '#email-confirm-modal',
      '#add-faculty-modal',
      '#role-edit-modal',
      '#delete-confirm-modal',
      '#transfer-confirm-modal',
      '#success-greeting-modal',
      '#schedule-view-modal',
      '#addRoomModal[style*="display: flex"]',
      '#addRoomModal[style*="display: block"]',
      '#editRoomModal[style*="display: flex"]',
      '#editRoomModal[style*="display: block"]',
      '#downloadModal[style*="display: flex"]',
      '#downloadModal[style*="display: block"]',
      '#signatureSettingsModal[style*="display: flex"]',
      '#signatureSettingsModal[style*="display: block"]',
      '#importCurriculumModal[style*="display: flex"]',
      '#importCurriculumModal[style*="display: block"]',
      '#card-detail-modal.active',
      '#ticket-details-modal',
      '#accessibility-modal',
      '#accessibility-settings-modal'
    ];

    let actualVisibleCount = 0;
    try {
      const found = document.querySelectorAll(visibleModalSelectors.join(','));
      found.forEach(el => {
        if (isModalElementVisible(el)) {
          actualVisibleCount++;
        }
      });
    } catch (e) { }

    // Multi-modal synchronization:
    // If no modal is visible in the DOM, force activeModalCount to 0 to prevent stranded counters
    if (actualVisibleCount === 0) {
      activeModalCount = 0;
    } else {
      activeModalCount = Math.max(activeModalCount, actualVisibleCount);
    }

    const shouldBeOpen = (actualVisibleCount > 0);
    if (!shouldBeOpen) {
      activeModalCount = 0;
      document.body.classList.remove('modal-open');
    } else {
      document.body.classList.add('modal-open');
    }
  }

  // Auto-sync observer: ensure removing modal DOM nodes or changing display never leaves body.modal-open stranded
  if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
    const initObserver = () => {
      if (!document.body) return;
      let syncScheduled = false;
      const observer = new MutationObserver((mutations) => {
        if (!document.body.classList.contains('modal-open')) return;

        const hasRelevantMutation = mutations.some(m => m.type === 'childList' || m.target !== document.body);
        if (!hasRelevantMutation) return;

        if (!syncScheduled) {
          syncScheduled = true;
          const scheduleFn = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame
            : (fn) => setTimeout(fn, 16);
          scheduleFn(() => {
            syncScheduled = false;
            if (document.body.classList.contains('modal-open')) {
              setModalOpenState(null);
            }
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initObserver);
    } else {
      initObserver();
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.formatTime12 = formatTime12;
  global.formatLastUpdatedTime = formatLastUpdatedTime;
  global.setModalOpenState = setModalOpenState;
  global.getActiveModalCount = () => activeModalCount;

})(typeof window !== 'undefined' ? window : this);
