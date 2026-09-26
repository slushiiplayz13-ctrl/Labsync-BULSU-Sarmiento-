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
   * Removes all professor ghost blocks from the grid and resets split states.
   */
  function clearGhostBlocks() {
    document.querySelectorAll('.grid-card-ghost').forEach(el => el.remove());
    document.querySelectorAll('.grid-card.is-split-left, .grid-card.is-clash-conflict').forEach(el => {
      el.classList.remove('is-split-left', 'is-clash-conflict');
    });
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

      // Assign span class matching regular schedule card duration mapping:
      // duration <= 1 slot (30 min) -> span-1
      // duration <= 2 slots (1 hour = 72px) -> span-2
      // duration > 2 slots (1.5h+) -> span-3-plus
      ghostEl.classList.remove('span-1', 'span-2', 'span-3-plus');
      if (duration <= 1) {
        ghostEl.classList.add('span-1');
      } else if (duration <= 2) {
        ghostEl.classList.add('span-2');
      } else {
        ghostEl.classList.add('span-3-plus');
      }

      // Detect collision with existing room cards in this column
      const existingCards = col.querySelectorAll('.grid-card:not(.grid-card-ghost)');
      let hasConflict = false;

      existingCards.forEach(card => {
        let cStart = card.dataset.start !== undefined ? parseInt(card.dataset.start, 10) : NaN;
        let cEnd = card.dataset.end !== undefined ? parseInt(card.dataset.end, 10) : NaN;

        if (isNaN(cStart) || isNaN(cEnd)) {
          const topPx = parseFloat(card.style.top) || 0;
          const heightPx = parseFloat(card.style.height) || (slotHeight * 2);
          cStart = Math.round(topPx / slotHeight);
          cEnd = cStart + Math.round(heightPx / slotHeight);
        }

        // Interval overlap test: [startSlot, endSlot) overlaps [cStart, cEnd)
        if (startSlot < cEnd && endSlot > cStart) {
          hasConflict = true;
          card.classList.add('is-split-left', 'is-clash-conflict');
        }
      });

      // Also detect collision with existing ghost cards in this column
      const prevGhosts = col.querySelectorAll('.grid-card-ghost');
      prevGhosts.forEach(prevGhost => {
        const topPx = parseFloat(prevGhost.style.top) || 0;
        const heightPx = parseFloat(prevGhost.style.height) || (slotHeight * 2);
        const gStart = Math.round(topPx / slotHeight);
        const gEnd = gStart + Math.round(heightPx / slotHeight);

        if (startSlot < gEnd && endSlot > gStart) {
          hasConflict = true;
          prevGhost.classList.add('is-split-right', 'is-clash-conflict');
        }
      });

      if (hasConflict) {
        ghostEl.classList.add('is-split-right', 'is-clash-conflict');
      }

      const assignedProf = s.Professor_Name || s.ProfessorName || professorName || '';
      const roomBadgeText = `Occupied (Rm ${s.Room_Number || '?'})`;
      const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
      const formattedStart = formatShort(startTime);
      const formattedEnd = formatShort(endTime);

      const escapeFn = global.escapeHtml || window.escapeHtml || ((str) => str || '');

      ghostEl.title = `Occupied (Rm ${s.Room_Number || '?'})\nSubject: ${s.Subject_Name || 'Occupied Slot'}${assignedProf ? '\nProfessor: ' + assignedProf : ''}${s.Section ? '\nSection: ' + s.Section : ''}\nTime: ${formattedStart} - ${formattedEnd}`;

      ghostEl.innerHTML = `
        <div class="ghost-header">
          <div class="ghost-badge">
            <i data-lucide="lock" style="width:10px;height:10px;"></i>
            <span>${escapeFn(roomBadgeText)}</span>
          </div>
          <div class="ghost-title" title="${escapeFn(s.Subject_Name || 'Class')}">${escapeFn(s.Subject_Name || 'Occupied Slot')}</div>
          ${assignedProf ? `
          <div class="ghost-prof" title="Reserved for ${escapeFn(assignedProf)}">${escapeFn(assignedProf)}</div>` : ''}
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
   * Helper to extract professor name from either a tray block, grid card, or ghost card element.
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
    } else if (element.classList.contains('grid-card-ghost')) {
      const profEl = element.querySelector('.ghost-prof span') || element.querySelector('.ghost-prof');
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
