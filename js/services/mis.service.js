/* ================================================================
   LabSync – MIS Staff Service  |  js/services/mis.service.js
   Encapsulates all MIS Staff API communication with error handling.
   ================================================================ */

'use strict';

(function (global) {
  const misService = {
    /**
     * Fetches current active and historical MIS Staff accounts.
     * @returns {Promise<Object>}
     */
    async getMisStaff() {
      const response = await fetch('/api/mis-staff', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const err = new Error(data.error || `Failed to fetch MIS Staff roster: HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return await response.json();
    },

    /**
     * Creates a new MIS Staff account with auto-generated credentials.
     * @param {Object} formData - { name, email, phone }
     * @returns {Promise<Object>}
     */
    async createMisStaff(formData) {
      const response = await fetch('/api/mis-staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to create MIS Staff: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
      }
      return data;
    },

    /**
     * Updates an existing MIS Staff account's details.
     * @param {string|number} userId
     * @param {Object} formData - { name, email, phone }
     * @returns {Promise<Object>}
     */
    async updateMisStaff(userId, formData) {
      const response = await fetch(`/api/mis-staff/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to update MIS Staff: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }
      return data;
    },

    /**
     * Deactivates an active MIS Staff account.
     * @param {string|number} userId
     * @returns {Promise<Object>}
     */
    async deactivateMisStaff(userId) {
      const response = await fetch(`/api/mis-staff/${userId}/deactivate`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to deactivate MIS Staff: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }
      return data;
    },

    /**
     * Reactivates a deactivated MIS Staff account.
     * @param {string|number} userId
     * @returns {Promise<Object>}
     */
    async reactivateMisStaff(userId) {
      const response = await fetch(`/api/mis-staff/${userId}/reactivate`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to reactivate MIS Staff: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }
      return data;
    }
  };

  // Expose globally
  global.misService = misService;
})(typeof window !== 'undefined' ? window : this);
