/**
 * LabSync – Curriculum API Service | js/services/curriculum.service.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Encapsulates backend API communication for curriculum subject data.
 */

(function (global) {
  'use strict';

  /**
   * Fetches all imported curriculum subjects.
   * @returns {Promise<Array>}
   */
  async function getCurriculum() {
    const res = await fetch('/api/curriculum', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch curriculum subjects');
    return await res.json();
  }

  /**
   * Imports a list of curriculum subjects to backend.
   * @param {Array} subjects - Array of subject objects
   * @param {string} [mode='replace'] - Import mode ('replace' or 'append')
   * @returns {Promise<object>}
   */
  async function importCurriculum(subjects, mode = 'replace') {
    const res = await fetch('/api/curriculum/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ subjects, mode })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import curriculum subjects');
    return data;
  }

  /**
   * Clears all curriculum subjects from database.
   * @returns {Promise<object>}
   */
  async function deleteCurriculum() {
    const res = await fetch('/api/curriculum', {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) throw new Error('Failed to delete curriculum subjects');
    return await res.json();
  }

  const curriculumService = {
    getCurriculum,
    importCurriculum,
    deleteCurriculum
  };

  global.curriculumService = curriculumService;

})(typeof window !== 'undefined' ? window : this);
