/**
 * LabSync – Schedule Grid & Card Renderer | js/scheduling/grid.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Handles schedule card creation, span classes, placeholders, and professor ghost slot rendering.
 */

(function (global) {
  'use strict';

  let blockCounter = 0;
  let placeholderEl = null;

  /**
   * Helper to get slot height based on viewport width.
   * @returns {number}
   */
  function getSlotHeight() {
    return window.innerWidth <= 768 ? 30 : 45;
  }

  /**
   * Updates duration span class on a schedule card (span-1, span-2, span-3-plus).
   * @param {HTMLElement} card - Schedule card element
   */
  function updateCardSpanClass(card) {
    if (!card) return;
    const start = parseFloat(card.dataset.start);
    const end = parseFloat(card.dataset.end);
    const span = end - start;

    card.classList.remove('span-1', 'span-2', 'span-3-plus');
    if (span <= 1) {
      card.classList.add('span-1');
    } else if (span <= 2) {
      card.classList.add('span-2');
    } else {
      card.classList.add('span-3-plus');
    }
  }

  /**
   * Renders or positions the live snapping placeholder guide showing actual times.
   * @param {HTMLElement} col - Day column element
   * @param {number} slotIndex - Slot index
   * @param {number} durationSlots - Duration in slots
   */
  function showPlaceholder(col, slotIndex, durationSlots) {
    if (!col) return;
    const slotHeight = getSlotHeight();

    if (!placeholderEl) {
      placeholderEl = document.createElement('div');
      placeholderEl.className = 'grid-card-placeholder';
    }

    const startTime = global.slotsToTime ? global.slotsToTime(slotIndex) : '';
    const endTime = global.slotsToTime ? global.slotsToTime(slotIndex + durationSlots) : '';
    const startLabel = global.formatTimeLabel ? global.formatTimeLabel(startTime) : startTime;
    const endLabel = global.formatTimeLabel ? global.formatTimeLabel(endTime) : endTime;

    placeholderEl.textContent = `${startLabel} - ${endLabel}`;
    placeholderEl.style.top = `${slotIndex * slotHeight}px`;
    placeholderEl.style.height = `${durationSlots * slotHeight}px`;

    if (placeholderEl.parentNode !== col) {
      col.appendChild(placeholderEl);
    }
  }

  /**
   * Removes the active snapping placeholder guide from the DOM.
   */
  function removePlaceholder() {
    if (placeholderEl) {
      placeholderEl.remove();
      placeholderEl = null;
    }
  }

  /**
   * Creates a new DOM schedule card element.
   * @param {number|string|null} dbId - Database schedule ID if loaded from API
   * @param {string} subject - Subject name
   * @param {string} professor - Professor name
   * @param {string} section - Section string
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @param {string} [colorTheme='Default'] - Color palette key or custom hex
   * @returns {HTMLElement}
   */
  function createGridCard(dbId, subject, professor, section, startTime = '08:30', endTime = '10:00', colorTheme = 'Default') {
    const card = document.createElement('div');
    card.className = 'grid-card';
    card.draggable = true;
    blockCounter++;
    card.id = dbId ? `card-db-${dbId}` : `card-new-${blockCounter}`;

    const slotHeight = getSlotHeight();
    const startSlot = global.timeToSlots ? global.timeToSlots(startTime) : 0;
    const endSlot = global.timeToSlots ? global.timeToSlots(endTime) : 3;
    const duration = endSlot - startSlot;

    card.dataset.start = startSlot;
    card.dataset.end = endSlot;
    card.style.top = `${startSlot * slotHeight}px`;
    card.style.height = `${duration * slotHeight}px`;
    updateCardSpanClass(card);

    const formattedStart = global.formatShortTime ? global.formatShortTime(startTime) : startTime;
    const formattedEnd = global.formatShortTime ? global.formatShortTime(endTime) : endTime;

    card.innerHTML = `
      <div class="grid-card-details">
        <div class="grid-card-title" title="${subject || ''}">${subject || ''}</div>
        <div class="grid-card-section">Sec: ${section || ''}</div>
        <div class="grid-card-prof" title="${professor || ''}">${professor || ''}</div>
      </div>
      <div class="grid-card-time">
        <span class="grid-card-time-text">${formattedStart} - ${formattedEnd}</span>
        <div class="card-info-icon" role="button" title="Click to view details & edit color">
          <i data-lucide="info"></i>
        </div>
      </div>
      <div class="grid-card-resize-handle"></div>
    `;

    if (global.applyCardColor) {
      global.applyCardColor(card, colorTheme);
    }

    // Attach resize handle listener if dragdrop engine is available
    const handle = card.querySelector('.grid-card-resize-handle');
    if (handle && global.scheduleDragDrop && typeof global.scheduleDragDrop.initCardResize === 'function') {
      global.scheduleDragDrop.initCardResize(card, handle, professor);
    }

    // Attach dragstart/dragend listeners
    if (global.scheduleDragDrop && typeof global.scheduleDragDrop.bindCardDragListeners === 'function') {
      global.scheduleDragDrop.bindCardDragListeners(card, professor);
    }

    // Click listener: open detail modal when clicking the info icon
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-info-icon')) {
        e.stopPropagation();
        if (typeof global.openCardDetailModal === 'function') {
          global.openCardDetailModal(card);
        }
      }
    });

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: card });
    }

    return card;
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
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @param {string|number} excludeRoomNumber - Exclude current room
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
        console.error('Error loading professor ghost schedule:', err);
        return;
      }
    }

    const slotHeight = getSlotHeight();

    schedules.forEach(s => {
      const day = s.Day_of_Week;
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) return;

      const startTime = (s.Start_Time || '').substring(0, 5);
      const endTime = (s.End_Time || '').substring(0, 5);

      const startSlot = global.timeToSlots ? global.timeToSlots(startTime) : 0;
      const endSlot = global.timeToSlots ? global.timeToSlots(endTime) : 3;
      const duration = endSlot - startSlot;

      // Exclude schedules in the current room (already rendered as regular cards)
      if (String(s.Room_Number) === String(excludeRoomNumber)) return;

      const ghostEl = document.createElement('div');
      ghostEl.className = 'grid-card-ghost';
      ghostEl.style.top = `${startSlot * slotHeight}px`;
      ghostEl.style.height = `${duration * slotHeight}px`;

      const roomBadgeText = `Occupied (Rm ${s.Room_Number})`;
      const formattedStart = global.formatShortTime ? global.formatShortTime(startTime) : startTime;
      const formattedEnd = global.formatShortTime ? global.formatShortTime(endTime) : endTime;

      ghostEl.innerHTML = `
        <div>
          <div class="ghost-badge">
            <i data-lucide="lock" style="width:10px;height:10px;"></i>
            ${roomBadgeText}
          </div>
          <div class="ghost-title" title="${s.Subject_Name || 'Class'}">${s.Subject_Name || 'Occupied Slot'}</div>
        </div>
        <div class="ghost-sub">
          <span>${s.Section ? 'Sec: ' + s.Section + ' • ' : ''}${formattedStart} - ${formattedEnd}</span>
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

  const scheduleGrid = {
    getSlotHeight,
    createGridCard,
    updateCardSpanClass,
    showPlaceholder,
    removePlaceholder,
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
