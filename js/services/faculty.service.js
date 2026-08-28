/* ================================================================
   LabSync – Faculty Service  |  js/services/faculty.service.js
   Encapsulates all Faculty API communication with error handling.
   ================================================================ */

'use strict';

(function (global) {
  const facultyService = {
    /**
     * Fetches all registered faculty members.
     * @returns {Promise<Array>}
     */
    async getFaculty() {
      const response = await fetch('/api/faculty', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch faculty list: HTTP ${response.status}`);
      }
      const data = await response.json();
      try {
        sessionStorage.setItem('labsync_cached_faculty', JSON.stringify(data));
      } catch (e) {}
      return data;
    },

    /**
     * Adds a new faculty member with auto-generated credentials.
     * @param {Object} formData - { name, email, role }
     * @param {AbortSignal} [signal]
     * @returns {Promise<Object>}
     */
    async addFaculty(formData, signal) {
      const response = await fetch('/api/faculty/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(formData),
        signal: signal || undefined
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to add faculty: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.data = data;
        throw err;
      }
      return data;
    },

    /**
     * Updates a faculty member's role (or transfers leadership).
     * @param {string|number} userId
     * @param {string} newRole
     * @returns {Promise<Object>}
     */
    async changeFacultyRole(userId, newRole) {
      const response = await fetch(`/api/faculty/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to update role: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }
      return data;
    },

    /**
     * Deletes / removes a faculty member.
     * @param {string|number} userId
     * @returns {Promise<Object>}
     */
    async deleteFaculty(userId) {
      const response = await fetch(`/api/faculty/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data.error || data.message || `Failed to remove faculty: HTTP ${response.status}`;
        const err = new Error(errorMsg);
        err.status = response.status;
        throw err;
      }
      return data;
    },

    /**
     * Fetches teaching schedule assignments for a given professor name.
     * @param {string} profName
     * @returns {Promise<Array>}
     */
    async getFacultySchedule(profName) {
      if (!profName) return [];
      const encodedName = encodeURIComponent(profName);
      const response = await fetch(`/api/schedules/faculty/${encodedName}`, {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to load faculty schedule: HTTP ${response.status}`);
      }
      return await response.json();
    }
  };

  // Expose globally
  global.facultyService = facultyService;
})(typeof window !== 'undefined' ? window : this);
