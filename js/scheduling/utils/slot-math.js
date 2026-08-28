/**
 * LabSync Slot & Timetable Math Utilities | js/scheduling/utils/slot-math.js
 * Centralizes grid slot conversions, responsive heights, coordinate snapping, and context extraction.
 */

(function (global) {
  'use strict';

  const TOTAL_SLOTS = 27; // 7:00 AM to 8:30 PM (27 slots of 30 mins)
  const DEFAULT_DURATION_SLOTS = 3; // 1.5 hours (3 slots)

  /**
   * Returns current slot height in pixels depending on viewport size.
   * @returns {number}
   */
  function getSlotHeight() {
    return window.innerWidth <= 768 ? 30 : 36;
  }

  /**
   * Calculates slot index from a pointer Y coordinate relative to a column bounding rect.
   * @param {number} clientY - Pointer Y coordinate
   * @param {DOMRect} colRect - Column bounding rectangle
   * @param {number} [durationSlots=1] - Duration in slots to constrain bounds
   * @returns {number} Snapped slot index clamped within [0, TOTAL_SLOTS - durationSlots]
   */
  function calculateDropSlot(clientY, colRect, durationSlots = 1) {
    const slotHeight = getSlotHeight();
    const offsetY = clientY - colRect.top;
    let slotIndex = Math.floor(offsetY / slotHeight);

    if (slotIndex < 0) slotIndex = 0;
    if (slotIndex + durationSlots > TOTAL_SLOTS) {
      slotIndex = Math.max(0, TOTAL_SLOTS - durationSlots);
    }
    return slotIndex;
  }

  /**
   * Extracts duration in slots for an element (grid card or tray block).
   * @param {HTMLElement} element
   * @returns {number}
   */
  function getBlockDuration(element) {
    if (!element) return DEFAULT_DURATION_SLOTS;
    if (element.dataset && element.dataset.start !== undefined && element.dataset.end !== undefined) {
      const start = parseFloat(element.dataset.start);
      const end = parseFloat(element.dataset.end);
      if (!isNaN(start) && !isNaN(end) && end > start) {
        return end - start;
      }
    }
    return DEFAULT_DURATION_SLOTS;
  }

  /**
   * Retrieves active academic year, semester, and room number from UI/URL.
   * @returns {{academicYear: string, semester: string, roomNumber: string, professor: string}}
   */
  function getScheduleContext() {
    const state = global.scheduleState || {};
    const academicYear = typeof state.getSelectedAcademicYear === 'function'
      ? state.getSelectedAcademicYear()
      : (document.getElementById('academic-year-wrapper')?.dataset?.value || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);

    const semester = typeof state.getSelectedSemester === 'function'
      ? state.getSelectedSemester()
      : (document.getElementById('semester-wrapper')?.dataset?.value || '1st Semester');

    const urlParams = new URLSearchParams(window.location.search);
    const roomNumber = urlParams.get('room') || '204';

    const professor = typeof state.getSelectedProfessor === 'function'
      ? state.getSelectedProfessor()
      : (document.getElementById('professor-wrapper')?.dataset?.value || '');

    return {
      academicYear,
      semester,
      roomNumber,
      professor
    };
  }

  const slotMath = {
    TOTAL_SLOTS,
    DEFAULT_DURATION_SLOTS,
    getSlotHeight,
    calculateDropSlot,
    getBlockDuration,
    getScheduleContext
  };

  global.slotMath = slotMath;
  global.TOTAL_SLOTS = TOTAL_SLOTS;
  global.getSlotHeight = getSlotHeight;

})(typeof window !== 'undefined' ? window : this);
