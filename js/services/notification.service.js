/**
 * LabSync Notification API Service
 * Extracted in Phase 6A-04 (Notification Service Extraction)
 */

(function (global) {
  'use strict';

  /**
   * Fetches notification payload from the REST API endpoint (/api/notifications).
   * Preserves exact cache-busting timestamp parameter, credentials option, and error contract.
   * @returns {Promise<Array|null>} Resolved array of notification objects or null on failure.
   */
  async function fetchNotifications() {
    try {
      const response = await fetch(`/api/notifications?_=${Date.now()}`, {
        credentials: 'include'
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.error('[NotificationService] Failed to fetch notifications:', err);
      return null;
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.fetchNotifications = fetchNotifications;

  // Export global service namespace for future module migration
  global.notificationService = {
    fetchNotifications
  };

})(typeof window !== 'undefined' ? window : this);
