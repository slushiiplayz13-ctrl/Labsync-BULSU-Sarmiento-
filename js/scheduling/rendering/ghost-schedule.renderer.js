/**
 * LabSync Ghost Schedule Renderer | js/scheduling/rendering/ghost-schedule.renderer.js
 * Renders read-only locked professor bookings from other rooms to visualize scheduling clashes.
 */

(function (global) {
  'use strict';

  function getSlotHeight() {
    const slotMath = global.slotMath;
    if (slotMath && typeof slotMath.getSlotHeight === 'function') {
      return slotMath.getSlotHeight();
    }
    return window.innerWidth <= 768 ? 30 : 36;
  }

  /**
   * Removes all professor ghost blocks from the grid.
   */
  function clearGhostBlocks() {
    document.querySelectorAll('.grid-card-ghost').forEach(el => el.remove());
  }

  /**
   * Loads and displays locked ghost blocks for a selected professor across other rooms.
   * @param {string} professorName - Professor name
   * @param {string} [academicYear] - Academic year
   * @param {string} [semester] - Semester
   * @param {string|number} [excludeRoomNumber] - Exclude current room
   */
  async function loadProfessorGhostSchedule(professorName, academicYear = '', semester = '', excludeRoomNumber = '') {
    clearGhostBlocks();
    if (!professorName || professorName === 'Not specified') return;

    let schedules = [];
    if (global.scheduleService && typeof global.scheduleService.getProfessorSchedule === 'function') {
      schedules = await global.scheduleService.getProfessorSchedule(professorName, academicYear, semester, excludeRoomNumber);
    } else {
      try {
        const url = `/api/schedules/professor?professorName=${encodeURIComponent(professorName)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}&excludeRoomNumber=${encodeURIComponent(excludeRoomNumber)}`;
        const res = await fetch(url, { credentials: 'include' });
        if (res.ok) schedules = await res.json();
      } catch (err) {
        console.error('[GhostScheduleRenderer] Error loading professor ghost schedule:', err);
        return;
      }
    }

    const slotHeight = getSlotHeight();
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};

    schedules.forEach(s => {
      const day = s.Day_of_Week;
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) return;

      const startTime = (s.Start_Time || '').substring(0, 5);
      const endTime = (s.End_Time || '').substring(0, 5);

      const startSlot = typeof timeUtils.timeToSlots === 'function' ? timeUtils.timeToSlots(startTime) : 0;
      const endSlot = typeof timeUtils.timeToSlots === 'function' ? timeUtils.timeToSlots(endTime) : 3;
      const duration = endSlot - startSlot;

      // Exclude schedules in the current room (already rendered as regular cards)
      if (String(s.Room_Number) === String(excludeRoomNumber)) return;

      const ghostEl = document.createElement('div');
      ghostEl.className = 'grid-card-ghost';
      ghostEl.style.top = `${startSlot * slotHeight}px`;
      ghostEl.style.height = `${duration * slotHeight}px`;

      const roomBadgeText = `Occupied (Rm ${s.Room_Number})`;
      const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
      const formattedStart = formatShort(startTime);
      const formattedEnd = formatShort(endTime);

      const escapeFn = global.escapeHtml || window.escapeHtml || ((str) => str || '');

      ghostEl.innerHTML = `
        <div>
          <div class="ghost-badge">
            <i data-lucide="lock" style="width:10px;height:10px;"></i>
            ${escapeFn(roomBadgeText)}
          </div>
          <div class="ghost-title" title="${escapeFn(s.Subject_Name || 'Class')}">${escapeFn(s.Subject_Name || 'Occupied Slot')}</div>
        </div>
        <div class="ghost-sub">
          <span>${s.Section ? 'Sec: ' + escapeFn(s.Section) + ' • ' : ''}${formattedStart} - ${formattedEnd}</span>
        </div>
      `;

      col.appendChild(ghostEl);
    });

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
  }

  /**
   * Helper to extract professor name from either a tray block or a grid card element.
   * @param {HTMLElement} element
   * @returns {string}
   */
  function getBlockProfessorName(element) {
    if (!element) return '';
    if (element.classList.contains('schedule-block')) {
      const divs = element.querySelectorAll('div');
      return divs[1] ? divs[1].textContent.trim() : '';
    } else if (element.classList.contains('grid-card')) {
      const profEl = element.querySelector('.grid-card-prof');
      return profEl ? profEl.textContent.trim() : '';
    }
    return '';
  }

  /**
   * Restores default selected professor ghost blocks or clears ghost blocks.
   */
  function restoreDefaultOrClearGhost() {
    const selectedProf = document.getElementById('professor-wrapper')?.dataset.value;
    if (selectedProf) {
      const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
      loadProfessorGhostSchedule(selectedProf, context.academicYear, context.semester, context.roomNumber);
    } else {
      clearGhostBlocks();
    }
  }

  const ghostScheduleRenderer = {
    clearGhostBlocks,
    loadProfessorGhostSchedule,
    getBlockProfessorName,
    restoreDefaultOrClearGhost
  };

  global.ghostScheduleRenderer = ghostScheduleRenderer;
  global.clearGhostBlocks = clearGhostBlocks;
  global.loadProfessorGhostSchedule = loadProfessorGhostSchedule;
  global.getBlockProfessorName = getBlockProfessorName;
  global.restoreDefaultOrClearGhost = restoreDefaultOrClearGhost;

})(typeof window !== 'undefined' ? window : this);
