/**
 * LabSync Schedule Card Renderer | js/scheduling/rendering/schedule-card.renderer.js
 * Creates DOM schedule cards, manages duration span classes, placeholder snapping guides, and card styling.
 */

(function (global) {
  'use strict';

  let placeholderEl = null;

  function getSlotHeight() {
    const slotMath = global.slotMath;
    if (slotMath && typeof slotMath.getSlotHeight === 'function') {
      return slotMath.getSlotHeight();
    }
    return window.innerWidth <= 768 ? 30 : 36;
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

    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};
    const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex) : '';
    const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex + durationSlots) : '';
    const formatLabel = timeUtils.formatTimeLabel || global.formatTimeLabel || ((t) => t);
    const startLabel = formatLabel(startTime);
    const endLabel = formatLabel(endTime);

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

    const state = global.scheduleState || {};
    const blockNum = typeof state.incrementBlockCounter === 'function' ? state.incrementBlockCounter() : Date.now();
    card.id = dbId ? `card-db-${dbId}` : `card-new-${blockNum}`;

    const slotHeight = getSlotHeight();
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};
    const startSlot = typeof timeUtils.timeToSlots === 'function' ? timeUtils.timeToSlots(startTime) : 0;
    const endSlot = typeof timeUtils.timeToSlots === 'function' ? timeUtils.timeToSlots(endTime) : 3;
    const duration = endSlot - startSlot;

    card.dataset.start = startSlot;
    card.dataset.end = endSlot;
    card.style.top = `${startSlot * slotHeight}px`;
    card.style.height = `${duration * slotHeight}px`;
    updateCardSpanClass(card);

    const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
    const formattedStart = formatShort(startTime);
    const formattedEnd = formatShort(endTime);

    const escapeFn = global.escapeHtml || window.escapeHtml || ((s) => s || '');

    card.innerHTML = `
      <div class="grid-card-details">
        <div class="grid-card-title" title="${escapeFn(subject)}">${escapeFn(subject)}</div>
        <div class="grid-card-section">Sec: ${escapeFn(section)}</div>
        <div class="grid-card-prof" title="${escapeFn(professor)}">${escapeFn(professor)}</div>
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

  const scheduleCardRenderer = {
    updateCardSpanClass,
    showPlaceholder,
    removePlaceholder,
    createGridCard
  };

  global.scheduleCardRenderer = scheduleCardRenderer;
  global.createGridCard = createGridCard;
  global.updateCardSpanClass = updateCardSpanClass;
  global.showPlaceholder = showPlaceholder;
  global.removePlaceholder = removePlaceholder;

})(typeof window !== 'undefined' ? window : this);
