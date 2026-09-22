/**
 * LabSync Notification API Service
 * Extracted in Phase 6A-04 (Notification Service Extraction)
 */

(function (global) {
  'use strict';

  /**
   * Fetches notification payload from the REST API endpoint (/api/notifications).
   * Preserves exact cache-busting timestamp parameter, credentials option, and error contract.
   * Supports optional query parameters (e.g., { scope: 'timeline' }).
   * @param {Object|string} [options={}] Optional options object or scope string
   * @returns {Promise<Array|null>} Resolved array of notification objects or null on failure.
   */
  async function fetchNotifications(options = {}) {
    try {
      const scope = (typeof options === 'string' ? options : (options && options.scope)) || '';
      const scopeParam = scope ? `&scope=${encodeURIComponent(scope)}` : '';
      const response = await fetch(`/api/notifications?_=${Date.now()}${scopeParam}`, {
        credentials: 'include',
        headers: {
          'X-Background-Poll': 'true'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      try {
        if (Array.isArray(data)) {
          if (scope === 'timeline') {
            sessionStorage.setItem('labsync_cached_activities', JSON.stringify(data));
          } else {
            sessionStorage.setItem('labsync_cached_notifications', JSON.stringify(data));
          }
        }
      } catch (e) { }
      return data;
    } catch (err) {
      console.error('[NotificationService] Failed to fetch notifications:', err);
      return null;
    }
  }

  /**
   * Fetches full laboratory activity history for room status timelines (bypasses targeted filtering).
   * @returns {Promise<Array|null>} Resolved array of activity objects or null on failure.
   */
  async function fetchTimelineActivities() {
    return fetchNotifications({ scope: 'timeline' });
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.fetchNotifications = fetchNotifications;
  global.fetchTimelineActivities = fetchTimelineActivities;

  // Export global service namespace for future module migration
  global.notificationService = {
    fetchNotifications,
    fetchTimelineActivities
  };

})(typeof window !== 'undefined' ? window : this);
