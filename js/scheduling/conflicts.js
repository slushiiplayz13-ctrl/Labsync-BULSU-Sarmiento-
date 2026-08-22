/**
 * LabSync – Schedule Conflict Detection Engine | js/scheduling/conflicts.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Handles local visual room overlap calculation and remote professor schedule clashes.
 */

(function (global) {
  'use strict';

  /**
   * Verifies if a proposed slot range overlaps with any existing schedule card in a given day column.
   * Overlap condition: max(start1, start2) < min(end1, end2)
   * @param {string} day - Day of week
   * @param {number} startSlot - Proposed start slot index
   * @param {number} endSlot - Proposed end slot index
   * @param {string|null} excludeCardId - ID of card being moved/resized to exclude
   * @returns {boolean} True if an overlap exists
   */
  function checkOverlap(day, startSlot, endSlot, excludeCardId) {
    const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
    if (!col) return false;
    const cards = col.querySelectorAll('.grid-card');
    for (let card of cards) {
      if (excludeCardId && card.id === excludeCardId) continue;
      const cardStart = parseFloat(card.dataset.start);
      const cardEnd = parseFloat(card.dataset.end);

      const maxStart = Math.max(startSlot, cardStart);
      const minEnd = Math.min(endSlot, cardEnd);
      if (maxStart < minEnd) {
        return true;
      }
    }
    return false;
  }

  /**
   * Queries backend API to check if a professor is already scheduled at this time in another room.
   * @param {string} professorName - Professor name
   * @param {string} day - Day of week
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @param {string} [academicYear] - Academic year
   * @param {string} [semester] - Semester
   * @param {string|number} [excludeRoomNumber] - Current room number to exclude
   * @returns {Promise<{conflict: boolean, conflictingRoom?: string, startTime?: string, endTime?: string}>}
   */
  async function checkProfessorConflict(professorName, day, startTime, endTime, academicYear = '', semester = '', excludeRoomNumber = '') {
    if (!professorName || professorName === 'Not specified') return { conflict: false };

    if (global.scheduleService && typeof global.scheduleService.checkProfessorConflict === 'function') {
      return await global.scheduleService.checkProfessorConflict(
        professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber
      );
    }

    try {
      const url = `/api/schedules/check-professor-conflict?professorName=${encodeURIComponent(professorName)}&day=${encodeURIComponent(day)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}&excludeRoomNumber=${encodeURIComponent(excludeRoomNumber)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { conflict: false };
      return await res.json();
    } catch (err) {
      console.error('Error checking professor conflict:', err);
      return { conflict: false };
    }
  }

  const scheduleConflicts = {
    checkOverlap,
    checkProfessorConflict
  };

  global.scheduleConflicts = scheduleConflicts;
  global.checkOverlap = checkOverlap;
  global.checkProfessorConflict = checkProfessorConflict;

})(typeof window !== 'undefined' ? window : this);
