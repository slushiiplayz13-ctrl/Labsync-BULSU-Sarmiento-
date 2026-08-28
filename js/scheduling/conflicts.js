/**
 * LabSync Schedule Conflicts Adapter | js/scheduling/conflicts.js
 * Delegates to canonical js/scheduling/validation/schedule.validator.js.
 */

(function (global) {
  'use strict';

  const validator = global.scheduleValidator || {};

  function checkOverlap(day, startSlot, endSlot, excludeCardId) {
    if (typeof validator.checkOverlap === 'function') {
      return validator.checkOverlap(day, startSlot, endSlot, excludeCardId);
    }
    return false;
  }

  async function checkProfessorConflict(professorName, day, startTime, endTime, academicYear = '', semester = '', excludeRoomNumber = '') {
    if (typeof validator.checkProfessorConflict === 'function') {
      return await validator.checkProfessorConflict(professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber);
    }
    return { conflict: false };
  }

  const scheduleConflicts = {
    checkOverlap,
    checkProfessorConflict
  };

  global.scheduleConflicts = scheduleConflicts;
  global.checkOverlap = checkOverlap;
  global.checkProfessorConflict = checkProfessorConflict;

})(typeof window !== 'undefined' ? window : this);
