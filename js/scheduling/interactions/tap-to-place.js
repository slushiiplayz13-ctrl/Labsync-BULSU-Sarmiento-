/**
 * LabSync Mobile Tap-to-Place Interaction Engine | js/scheduling/interactions/tap-to-place.js
 * Enables effortless, touch-friendly scheduling:
 *   - Tap a tray block -> enter placement mode -> tap grid slot to place.
 *   - Tap empty grid slot -> open drawer to pick/create block for that slot.
 *   - Move card -> tap Move -> tap new slot to reposition.
 *   - Quick duration adjustments (+/- 30 min, preset chips).
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

  const TOTAL_SLOTS = (global.slotMath && global.slotMath.TOTAL_SLOTS) || 27;
  const DEFAULT_DURATION_SLOTS = 3; // 1.5 hrs

  // Placement state machine
  let placementState = {
    mode: 'idle', // 'idle' | 'placing-tray' | 'moving-card'
    trayBlock: null,
    movingCard: null,
    subject: '',
    professor: '',
    section: '',
    durationSlots: DEFAULT_DURATION_SLOTS,
    colorTheme: 'Default'
  };

  /**
   * Starts placement mode for a block from the available blocks tray.
   */
  function startPlacingFromTray(trayBlock) {
    if (!trayBlock) return;
    if (document.body.classList.contains('view-mode')) return;

    let subject = 'Class';
    let prof = '';
    let section = '';
    let colorTheme = 'Default';

    if (trayBlock instanceof HTMLElement || (trayBlock.nodeType && trayBlock.querySelector)) {
      subject = trayBlock.querySelector('div:first-child')?.textContent.trim() || 'Class';
      prof = trayBlock.querySelectorAll('div')[1]?.textContent.trim() || '';
      section = trayBlock.querySelectorAll('div')[2]?.textContent.trim() || '';
      colorTheme = trayBlock.dataset.color || 'Default';
    } else if (typeof trayBlock === 'object') {
      subject = trayBlock.subject || trayBlock.Subject_Name || 'Class';
      prof = trayBlock.professor || trayBlock.Professor_Name || '';
      section = trayBlock.section || trayBlock.Section || '';
      colorTheme = trayBlock.color || trayBlock.colorTheme || 'Default';
    }

    placementState = {
      mode: 'placing-tray',
      trayBlock: (trayBlock instanceof HTMLElement) ? trayBlock : null,
      movingCard: null,
      subject: subject,
      professor: prof,
      section: section,
      durationSlots: DEFAULT_DURATION_SLOTS,
      colorTheme: colorTheme
    };

    updatePlacementBarUI();

    // Close mobile sheet if open
    if (global.mobileScheduleEditor && typeof global.mobileScheduleEditor.closeSheet === 'function') {
      global.mobileScheduleEditor.closeSheet();
    }
  }

  /**
   * Starts repositioning mode for an existing card on the grid.
   */
  function startMovingCard(card) {
    if (!card) return;
    if (document.body.classList.contains('view-mode')) return;

    const subject = card.querySelector('.grid-card-title')?.textContent.trim() || 'Class';
    const prof = card.querySelector('.grid-card-prof')?.textContent.trim() || '';
    const section = (card.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/, '').trim();
    const startSlot = parseFloat(card.dataset.start) || 0;
    const endSlot = parseFloat(card.dataset.end) || (startSlot + DEFAULT_DURATION_SLOTS);
    const duration = endSlot - startSlot;
    const colorTheme = card.dataset.color || 'Default';

    placementState = {
      mode: 'moving-card',
      trayBlock: null,
      movingCard: card,
      subject: subject,
      professor: prof,
      section: section,
      durationSlots: duration,
      colorTheme: colorTheme
    };

    card.classList.add('moving-active');
    updatePlacementBarUI();

    // Close detail modal if open
    if (global.scheduleEditorController && typeof global.scheduleEditorController.closeCardDetailModal === 'function') {
      global.scheduleEditorController.closeCardDetailModal();
    }
  }

  /**
   * Cancels any active placement or moving mode.
   */
  function cancelPlacement() {
    if (placementState.movingCard) {
      placementState.movingCard.classList.remove('moving-active');
    }
    placementState = {
      mode: 'idle',
      trayBlock: null,
      movingCard: null,
      subject: '',
      professor: '',
      section: '',
      durationSlots: DEFAULT_DURATION_SLOTS,
      colorTheme: 'Default'
    };
    updatePlacementBarUI();
  }

  /**
   * Updates the placement bar display and hint.
   */
  function updatePlacementBarUI() {
    const bar = document.getElementById('mobile-placement-bar');
    const badge = document.getElementById('mpb-badge');
    const title = document.getElementById('mpb-title');
    const hint = document.getElementById('mpb-hint');
    const dock = document.getElementById('mobile-editor-dock');

    if (!bar) return;

    if (placementState.mode === 'idle') {
      bar.style.setProperty('display', 'none', 'important');
      if (dock) {
        if (window.innerWidth <= 1024) {
          dock.style.setProperty('display', 'flex', 'important');
        } else {
          dock.style.removeProperty('display');
        }
      }
      return;
    }

    if (dock) dock.style.setProperty('display', 'none', 'important');
    bar.style.setProperty('display', 'flex', 'important');

    if (badge) {
      badge.textContent = placementState.mode === 'moving-card' ? 'Moving' : 'Placing';
      badge.className = placementState.mode === 'moving-card' ? 'mpb-badge moving' : 'mpb-badge';
    }

    if (title) {
      title.textContent = `${placementState.subject} • ${placementState.section || 'Class'}`;
    }

    if (hint) {
      hint.textContent = 'Tap any slot on the timetable to drop';
    }
  }

  /**
   * Handles dropping the active block onto a target day and slot index.
   */
  async function handleSlotPlacement(day, slotIndex) {
    if (placementState.mode === 'idle') return false;

    const validator = global.scheduleValidator;
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};
    const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
    const duration = placementState.durationSlots || DEFAULT_DURATION_SLOTS;

    // Check bounds
    let clampedSlot = slotIndex;
    if (clampedSlot + duration > TOTAL_SLOTS) {
      clampedSlot = TOTAL_SLOTS - duration;
    }
    if (clampedSlot < 0) clampedSlot = 0;

    const targetColumn = document.querySelector(`.grid-day-column[data-day="${day}"]`);
    if (!targetColumn) return false;

    const excludeId = placementState.movingCard ? placementState.movingCard.id : null;

    if (validator && typeof validator.validatePlacement === 'function') {
      const validation = await validator.validatePlacement({
        day,
        startSlot: clampedSlot,
        endSlot: clampedSlot + duration,
        professor: placementState.professor,
        excludeCardId: excludeId,
        academicYear: context.academicYear,
        semester: context.semester,
        roomNumber: context.roomNumber
      });

      if (!validation.valid) {
        if (global.showToast) {
          global.showToast(validation.message, 'warning', 'Schedule Conflict');
        } else {
          alert(`Schedule Conflict: ${validation.message}`);
        }
        return false;
      }
    }

    const slotHeight = getSlotHeight();
    const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(clampedSlot) : '';
    const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(clampedSlot + duration) : '';

    if (placementState.mode === 'placing-tray') {
      const createCardFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.createGridCard) || global.createGridCard;
      if (createCardFn) {
        const card = createCardFn(
          null,
          placementState.subject,
          placementState.professor,
          placementState.section,
          startTime,
          endTime,
          placementState.colorTheme || 'Default'
        );
        targetColumn.appendChild(card);
      }

      // Remove tray block
      if (placementState.trayBlock) {
        placementState.trayBlock.remove();
      }

      if (global.scheduleState) global.scheduleState.isDirty = true;
      global.isDirty = true;

      const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
      if (updateCountFn) updateCountFn();

      if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
        global.scheduleState.updateSaveButtonState();
      }

      if (global.showToast) {
        global.showToast(`Placed ${placementState.subject} at ${day} ${startTime}`, 'success', 'Class Scheduled');
      }

      cancelPlacement();
      return true;
    } else if (placementState.mode === 'moving-card' && placementState.movingCard) {
      const card = placementState.movingCard;
      card.dataset.start = clampedSlot;
      card.dataset.end = clampedSlot + duration;
      card.style.top = `${clampedSlot * slotHeight}px`;
      card.style.height = `${duration * slotHeight}px`;

      const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
      const fStart = formatShort(startTime);
      const fEnd = formatShort(endTime);

      const timeText = card.querySelector('.grid-card-time-text');
      if (timeText) timeText.textContent = `${fStart} - ${fEnd}`;

      card.title = `${placementState.subject} (Sec: ${placementState.section || 'N/A'}) • ${placementState.professor || 'No Prof'} • ${fStart} - ${fEnd}`;

      targetColumn.appendChild(card);
      card.classList.remove('moving-active');

      const updateSpanFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.updateCardSpanClass) || global.updateCardSpanClass;
      if (updateSpanFn) updateSpanFn(card);

      if (global.scheduleState) global.scheduleState.isDirty = true;
      global.isDirty = true;

      if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
        global.scheduleState.updateSaveButtonState();
      }

      if (global.showToast) {
        global.showToast(`Moved ${placementState.subject} to ${day} ${startTime}`, 'success', 'Class Moved');
      }

      cancelPlacement();
      return true;
    }

    return false;
  }

  /**
   * Adjusts the duration of a card by deltaSlots (+1 = +30m, -1 = -30m) with conflict check.
   */
  async function adjustCardDuration(card, deltaSlots) {
    if (!card) return false;
    if (document.body.classList.contains('view-mode')) return false;

    const startSlot = parseFloat(card.dataset.start);
    const currentEndSlot = parseFloat(card.dataset.end);
    const newEndSlot = currentEndSlot + deltaSlots;
    const newDuration = newEndSlot - startSlot;

    // Minimum 1 slot (30 min), maximum remaining slots
    if (newDuration < 1) {
      if (global.showToast) global.showToast('Minimum class duration is 30 minutes', 'info');
      return false;
    }
    if (newEndSlot > TOTAL_SLOTS) {
      if (global.showToast) global.showToast('Cannot extend past 8:00 PM closing time', 'warning');
      return false;
    }

    const col = card.closest('.grid-day-column');
    const day = col ? col.dataset.day : '';
    const prof = card.querySelector('.grid-card-prof')?.textContent.trim() || '';
    const validator = global.scheduleValidator;
    const context = global.slotMath ? global.slotMath.getScheduleContext() : {};

    if (validator && typeof validator.validatePlacement === 'function') {
      const validation = await validator.validatePlacement({
        day,
        startSlot,
        endSlot: newEndSlot,
        professor: prof,
        excludeCardId: card.id,
        academicYear: context.academicYear,
        semester: context.semester,
        roomNumber: context.roomNumber
      });

      if (!validation.valid) {
        if (global.showToast) global.showToast(validation.message, 'warning', 'Conflict');
        return false;
      }
    }

    const slotHeight = getSlotHeight();
    card.dataset.end = newEndSlot;
    card.style.height = `${newDuration * slotHeight}px`;

    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};
    const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(startSlot) : '';
    const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(newEndSlot) : '';
    const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
    const fStart = formatShort(startTime);
    const fEnd = formatShort(endTime);

    const timeText = card.querySelector('.grid-card-time-text');
    if (timeText) timeText.textContent = `${fStart} - ${fEnd}`;

    const updateSpanFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.updateCardSpanClass) || global.updateCardSpanClass;
    if (updateSpanFn) updateSpanFn(card);

    if (global.scheduleState) global.scheduleState.isDirty = true;
    global.isDirty = true;

    if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
      global.scheduleState.updateSaveButtonState();
    }

    // Refresh modal time display if modal is open
    const modalTime = document.getElementById('modal-card-time');
    if (modalTime) {
      modalTime.textContent = `${fStart} - ${fEnd} (${(newDuration * 0.5)} hrs)`;
    }

    return true;
  }

  /**
   * Binds click/tap listeners on grid day columns for Tap-to-Place.
   */
  function initGridTapListeners() {
    const dayColumns = document.querySelectorAll('.grid-day-column');

    dayColumns.forEach(col => {
      if (col.dataset.tapListenerAttached) return;
      col.dataset.tapListenerAttached = 'true';

      col.addEventListener('click', async (e) => {
        // If clicking directly on a card, let the card click handler handle it
        if (e.target.closest('.grid-card')) {
          return;
        }

        const day = col.dataset.day;
        const rect = col.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const currentSlotHeight = getSlotHeight();
        const slotIndex = Math.floor(clickY / currentSlotHeight);

        // Case 1: In placing or moving mode -> drop block here
        if (placementState.mode !== 'idle') {
          await handleSlotPlacement(day, slotIndex);
          return;
        }

        // Case 2: In idle mode (Bidirectional) -> prompt user to pick block or create one
        if (window.innerWidth <= 1024 && !document.body.classList.contains('view-mode')) {
          const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};
          const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex) : '';
          const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);

          if (global.mobileScheduleEditor && typeof global.mobileScheduleEditor.openSheetForSlot === 'function') {
            global.mobileScheduleEditor.openSheetForSlot(day, slotIndex, formatShort(startTime));
          }
        }
      });
    });
  }

  /**
   * Binds listeners on tray blocks so tapping a tray block enters placement mode on mobile.
   */
  function bindTrayBlockTap(block) {
    if (!block || block.dataset.tapToPlaceAttached) return;
    block.dataset.tapToPlaceAttached = 'true';

    block.addEventListener('click', (e) => {
      // Don't trigger if user clicked delete button
      if (e.target.closest('.delete-block-btn')) return;

      if (window.innerWidth <= 1024) {
        e.preventDefault();
        e.stopPropagation();
        startPlacingFromTray(block);
      }
    });
  }

  /**
   * Initializes the tap-to-place system.
   */
  function initTapToPlace() {
    initGridTapListeners();

    // Observe tray blocks container for new blocks
    const blocksContainer = document.getElementById('blocks-container');
    if (blocksContainer) {
      blocksContainer.querySelectorAll('.schedule-block').forEach(bindTrayBlockTap);

      const observer = new MutationObserver((mutations) => {
        mutations.forEach(m => {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('schedule-block')) {
              bindTrayBlockTap(node);
            }
          });
        });
      });
      observer.observe(blocksContainer, { childList: true });
    }

    // Cancel button on placement bar
    const cancelBtn = document.getElementById('mpb-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        cancelPlacement();
      });
    }

    // Escape key cancels placement
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && placementState.mode !== 'idle') {
        cancelPlacement();
      }
    });

    // Window resize handler: clean up inline styles on desktop
    window.addEventListener('resize', () => {
      const dock = document.getElementById('mobile-editor-dock');
      const bar = document.getElementById('mobile-placement-bar');
      if (window.innerWidth > 1024) {
        if (dock) dock.style.removeProperty('display');
        if (bar) bar.style.removeProperty('display');
      } else {
        if (placementState.mode === 'idle' && dock) {
          dock.style.setProperty('display', 'flex', 'important');
        }
      }
    });
  }

  const tapToPlace = {
    initTapToPlace,
    startPlacingFromTray,
    startMovingCard,
    cancelPlacement,
    handleSlotPlacement,
    adjustCardDuration,
    bindTrayBlockTap,
    getPlacementState: () => placementState,
    getState: () => placementState
  };

  global.scheduleTapToPlace = tapToPlace;
  global.tapToPlaceEngine = tapToPlace;

  // Global backward-compatibility exports
  global.startPlacingFromTray = startPlacingFromTray;
  global.startMovingCard = startMovingCard;
  global.cancelPlacement = cancelPlacement;
  global.adjustCardDuration = adjustCardDuration;

})(typeof window !== 'undefined' ? window : this);
