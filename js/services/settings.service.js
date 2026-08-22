/**
 * LabSync – System Settings API Service | js/services/settings.service.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Encapsulates backend API communication for global institutional settings and signatures.
 */

(function (global) {
  'use strict';

  /**
   * Fetches current institutional and signature settings.
   * @returns {Promise<object>}
   */
  async function getSettings() {
    const res = await fetch('/api/settings', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch settings');
    return await res.json();
  }

  /**
   * Saves institutional and signature settings.
   * @param {object} settingsData - Settings payload (e.g. { program_chair, campus_dean })
   * @returns {Promise<object>}
   */
  async function saveSettings(settingsData) {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(settingsData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save settings');
    return data;
  }

  const settingsService = {
    getSettings,
    saveSettings
  };

  global.settingsService = settingsService;

})(typeof window !== 'undefined' ? window : this);
