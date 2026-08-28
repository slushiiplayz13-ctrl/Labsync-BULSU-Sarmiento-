/**
 * LabSync Schedule Grid & Card Renderer Adapter | js/scheduling/grid.js
 * Delegates to canonical rendering modules:
 *   - js/scheduling/rendering/schedule-card.renderer.js
 *   - js/scheduling/rendering/ghost-schedule.renderer.js
 */

(function (global) {
  'use strict';

  const cardRenderer = global.scheduleCardRenderer || {};
  const ghostRenderer = global.ghostScheduleRenderer || {};

  function updateCardSpanClass(card) {
    if (typeof cardRenderer.updateCardSpanClass === 'function') {
      return cardRenderer.updateCardSpanClass(card);
    }
  }

  function showPlaceholder(col, slotIndex, durationSlots) {
    if (typeof cardRenderer.showPlaceholder === 'function') {
      return cardRenderer.showPlaceholder(col, slotIndex, durationSlots);
    }
  }

  function removePlaceholder() {
    if (typeof cardRenderer.removePlaceholder === 'function') {
      return cardRenderer.removePlaceholder();
    }
  }

  function createGridCard(dbId, subject, professor, section, startTime = '08:30', endTime = '10:00', colorTheme = 'Default') {
    if (typeof cardRenderer.createGridCard === 'function') {
      return cardRenderer.createGridCard(dbId, subject, professor, section, startTime, endTime, colorTheme);
    }
  }

  function clearGhostBlocks() {
    if (typeof ghostRenderer.clearGhostBlocks === 'function') {
      return ghostRenderer.clearGhostBlocks();
    }
  }

  async function loadProfessorGhostSchedule(professorName, academicYear = '', semester = '', excludeRoomNumber = '') {
    if (typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
      return await ghostRenderer.loadProfessorGhostSchedule(professorName, academicYear, semester, excludeRoomNumber);
    }
  }

  function getBlockProfessorName(element) {
    if (typeof ghostRenderer.getBlockProfessorName === 'function') {
      return ghostRenderer.getBlockProfessorName(element);
    }
    return '';
  }

  const scheduleGrid = {
    updateCardSpanClass,
    showPlaceholder,
    removePlaceholder,
    createGridCard,
    clearGhostBlocks,
    loadProfessorGhostSchedule,
    getBlockProfessorName
  };

  global.scheduleGrid = scheduleGrid;
  global.createGridCard = createGridCard;
  global.updateCardSpanClass = updateCardSpanClass;
  global.showPlaceholder = showPlaceholder;
  global.removePlaceholder = removePlaceholder;
  global.clearGhostBlocks = clearGhostBlocks;
  global.loadProfessorGhostSchedule = loadProfessorGhostSchedule;
  global.getBlockProfessorName = getBlockProfessorName;

})(typeof window !== 'undefined' ? window : this);
