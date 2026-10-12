/**
 * LabSync Desktop Mouse Drag & Drop Interaction | js/scheduling/interactions/mouse-drag.js
 * Handles HTML5 drag & drop for schedule cards and tray blocks across day columns and tray container.
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

  function cleanupDragState() {
    document.body.classList.remove('dragging-active');
    document.querySelectorAll('.grid-day-column.drag-over').forEach(c => c.classList.remove('drag-over'));
    const tray = document.getElementById('blocks-container');
    if (tray) tray.classList.remove('drag-over');

    const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
    if (removePlaceholderFn) removePlaceholderFn();

    const autoScroller = global.scheduleAutoScroller || global.AutoScroller;
    if (autoScroller && typeof autoScroller.stop === 'function') {
      autoScroller.stop();
    }
  }

  /**
   * Recalculates slot and updates the snap placeholder during native drag auto-scroll.
   */
  function updateDropPlaceholderFromPoint(clientX, clientY) {
    if (document.body.classList.contains('view-mode')) return;
    const elem = (clientX >= 0 && clientY >= 0 && clientX <= window.innerWidth && clientY <= window.innerHeight)
      ? document.elementFromPoint(clientX, clientY)
      : null;
    if (!elem) {
      const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
      if (removePlaceholderFn) removePlaceholderFn();
      document.querySelectorAll('.grid-day-column.drag-over').forEach(c => c.classList.remove('drag-over'));
      return;
    }

    const col = elem.closest('.grid-day-column');
    if (!col) {
      const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
      if (removePlaceholderFn) removePlaceholderFn();
      document.querySelectorAll('.grid-day-column.drag-over').forEach(c => c.classList.remove('drag-over'));
      return;
    }

    document.querySelectorAll('.grid-day-column.drag-over').forEach(c => {
      if (c !== col) c.classList.remove('drag-over');
    });
    col.classList.add('drag-over');

    const slotHeight = getSlotHeight();
    const rect = col.getBoundingClientRect();
    const dropY = clientY - rect.top;
    let slotIndex = Math.round(dropY / slotHeight);
    if (slotIndex < 0) slotIndex = 0;

    const draggedId = document.querySelector('.grid-card.dragging, .schedule-block.dragging')?.id;
    if (!draggedId) return;
    const draggedBlock = document.getElementById(draggedId);
    if (!draggedBlock) return;

    let durationSlots = 3;
    if (draggedBlock.classList.contains('grid-card')) {
      durationSlots = parseFloat(draggedBlock.dataset.end) - parseFloat(draggedBlock.dataset.start);
    }

    if (slotIndex + durationSlots > TOTAL_SLOTS) {
      slotIndex = TOTAL_SLOTS - durationSlots;
    }

    const showPlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.showPlaceholder) || global.showPlaceholder;
    if (showPlaceholderFn) {
      showPlaceholderFn(col, slotIndex, durationSlots);
    }
  }

  /**
   * Checks whether an element is an intended valid dropzone for schedule cards/blocks.
   * Only day columns and the tray container are legitimate drop targets.
   * @param {EventTarget} target
   * @returns {boolean}
   */
  function isValidScheduleDropTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return !!(target.closest('.grid-day-column') || target.closest('#blocks-container'));
  }

  /**
   * Explicitly binds dragover and drop blockers to form controls to ensure no native text drop occurs.
   */
  function bindFormInputGuards() {
    const selector = '#block-subject, #block-section, .editor-create-form-section input, .editor-create-form-section select, .custom-select-trigger, .custom-select-input';
    const controls = document.querySelectorAll(selector);
    controls.forEach(ctrl => {
      ctrl.addEventListener('dragover', (e) => {
        const isDragging = document.querySelector('.grid-card.dragging, .schedule-block.dragging');
        if (isDragging) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        }
      });
      ctrl.addEventListener('drop', (e) => {
        const isDragging = document.querySelector('.grid-card.dragging, .schedule-block.dragging');
        if (isDragging) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          cleanupDragState();
        }
      });
    });
  }

  // Global drag listeners to keep AutoScroller updated across window boundaries and block invalid targets
  document.addEventListener('dragover', (e) => {
    if (document.body.classList.contains('view-mode')) return;
    const isDragging = document.querySelector('.grid-card.dragging, .schedule-block.dragging');
    if (!isDragging) return;

    if (!isValidScheduleDropTarget(e.target)) {
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('input, textarea, select, .custom-select-trigger, .custom-select-wrapper, .editor-create-form-section')) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      }
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'none';
      }
    }

    updateDropPlaceholderFromPoint(e.clientX, e.clientY);

    const autoScroller = global.scheduleAutoScroller || global.AutoScroller;
    if (autoScroller && typeof autoScroller.update === 'function') {
      autoScroller.update(e.clientX, e.clientY, updateDropPlaceholderFromPoint);
    }
  }, true);

  document.addEventListener('dragend', () => {
    cleanupDragState();
    const ghostRenderer = global.ghostScheduleRenderer;
    if (ghostRenderer && typeof ghostRenderer.restoreDefaultOrClearGhost === 'function') {
      ghostRenderer.restoreDefaultOrClearGhost();
    }
  });

  // Capture phase drop listener: cancels invalid drops onto inputs/form controls
  document.addEventListener('drop', (e) => {
    const isDragging = document.querySelector('.grid-card.dragging, .schedule-block.dragging');
    if (isDragging) {
      if (!isValidScheduleDropTarget(e.target)) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        if (typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
      }
    }
    cleanupDragState();
  }, true);

  /**
   * Binds mouse drag listeners to a grid card.
   * @param {HTMLElement} card
   * @param {string} professor
   */
  function bindCardDragListeners(card, professor) {
    if (!card) return;

    card.addEventListener('dragstart', (e) => {
      if (document.body.classList.contains('view-mode')) {
        e.preventDefault();
        return;
      }
      const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
      if (removePlaceholderFn) removePlaceholderFn();

      e.dataTransfer.setData('text/plain', card.id);
      card.classList.add('dragging');
      document.body.classList.add('dragging-active');

      // Dismiss mobile bottom sheet and remove backdrop blur
      if (global.mobileScheduleEditor && typeof global.mobileScheduleEditor.closeSheet === 'function') {
        global.mobileScheduleEditor.closeSheet();
      }
      const backdrop = document.getElementById('mobile-sheet-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.body.classList.remove('mobile-sheet-active');

      const ghostRenderer = global.ghostScheduleRenderer;
      if (ghostRenderer && typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
        const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
        ghostRenderer.loadProfessorGhostSchedule(professor, context.academicYear, context.semester, context.roomNumber);
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      cleanupDragState();

      const ghostRenderer = global.ghostScheduleRenderer;
      if (ghostRenderer && typeof ghostRenderer.restoreDefaultOrClearGhost === 'function') {
        ghostRenderer.restoreDefaultOrClearGhost();
      }
    });
  }

  /**
   * Binds mouse drag listeners to an available tray block.
   * @param {HTMLElement} block
   * @param {string} professor
   */
  function bindTrayBlockDragListeners(block, professor) {
    if (!block) return;

    block.addEventListener('dragstart', (e) => {
      if (document.body.classList.contains('view-mode')) {
        e.preventDefault();
        return;
      }
      const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
      if (removePlaceholderFn) removePlaceholderFn();

      e.dataTransfer.setData('text/plain', block.id);
      block.classList.add('dragging');
      document.body.classList.add('dragging-active');

      // Dismiss mobile bottom sheet and remove backdrop blur
      if (global.mobileScheduleEditor && typeof global.mobileScheduleEditor.closeSheet === 'function') {
        global.mobileScheduleEditor.closeSheet();
      }
      const backdrop = document.getElementById('mobile-sheet-backdrop');
      if (backdrop) backdrop.classList.remove('active');
      document.body.classList.remove('mobile-sheet-active');

      const ghostRenderer = global.ghostScheduleRenderer;
      if (ghostRenderer && typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
        const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
        ghostRenderer.loadProfessorGhostSchedule(professor, context.academicYear, context.semester, context.roomNumber);
      }
    });

    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      cleanupDragState();

      const ghostRenderer = global.ghostScheduleRenderer;
      if (ghostRenderer && typeof ghostRenderer.restoreDefaultOrClearGhost === 'function') {
        ghostRenderer.restoreDefaultOrClearGhost();
      }
    });
  }

  /**
   * Initializes day column drop zones for placing/moving schedule cards.
   * @param {NodeList|Array} dayColumns
   * @param {HTMLElement} blocksContainer
   */
  function initDayColumnDropZones(dayColumns, blocksContainer) {
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};

    dayColumns.forEach(col => {
      col.addEventListener('dragenter', (e) => {
        if (document.body.classList.contains('view-mode')) return;
        e.preventDefault();
        col.classList.add('drag-over');
      });

      col.addEventListener('dragover', (e) => {
        if (document.body.classList.contains('view-mode')) return;
        e.preventDefault();

        const slotHeight = getSlotHeight();
        const rect = col.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        let slotIndex = Math.round(dropY / slotHeight);
        if (slotIndex < 0) slotIndex = 0;

        const draggedId = e.dataTransfer.getData('text/plain') || document.querySelector('.grid-card.dragging, .schedule-block.dragging')?.id;
        const draggedBlock = draggedId ? document.getElementById(draggedId) : null;
        let durationSlots = 3;
        if (draggedBlock && draggedBlock.classList.contains('grid-card')) {
          durationSlots = parseFloat(draggedBlock.dataset.end) - parseFloat(draggedBlock.dataset.start);
        }

        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        const showPlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.showPlaceholder) || global.showPlaceholder;
        if (showPlaceholderFn) {
          showPlaceholderFn(col, slotIndex, durationSlots);
        }
      });

      col.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget || !col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over');
          const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
          if (removePlaceholderFn) removePlaceholderFn();
        }
      });

      col.addEventListener('drop', async (e) => {
        if (document.body.classList.contains('view-mode')) return;
        e.preventDefault();
        col.classList.remove('drag-over');

        const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
        if (removePlaceholderFn) removePlaceholderFn();

        const blockId = e.dataTransfer.getData('text/plain') || document.querySelector('.grid-card.dragging, .schedule-block.dragging')?.id;
        const block = blockId ? document.getElementById(blockId) : null;
        if (!block) return;

        const slotHeight = getSlotHeight();
        const rect = col.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        let slotIndex = Math.round(dropY / slotHeight);
        if (slotIndex < 0) slotIndex = 0;

        const day = col.dataset.day;
        const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
        const validator = global.scheduleValidator;

        // Case A: Dropping an available subject block from the sidebar tray
        if (block.classList.contains('schedule-block')) {
          const durationSlots = 3; // 1.5 hours default
          if (slotIndex + durationSlots > TOTAL_SLOTS) {
            slotIndex = TOTAL_SLOTS - durationSlots;
          }

          const divs = block.querySelectorAll('div');
          const subject = divs[0] ? divs[0].textContent.trim() : '';
          const professor = divs[1] ? divs[1].textContent.trim() : '';
          const section = divs[2] ? divs[2].textContent.trim() : '';

          const validation = await validator.validatePlacement({
            day,
            startSlot: slotIndex,
            endSlot: slotIndex + durationSlots,
            professor,
            excludeCardId: null,
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
            return;
          }

          const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex) : '';
          const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex + durationSlots) : '';

          const createCardFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.createGridCard) || global.createGridCard;
          if (createCardFn) {
            const card = createCardFn(null, subject, professor, section, startTime, endTime, 'Default');
            col.appendChild(card);
            if (global.ghostScheduleRenderer && typeof global.ghostScheduleRenderer.refreshSplits === 'function') {
              global.ghostScheduleRenderer.refreshSplits(col);
            }
          }

          block.remove();
          if (global.scheduleState) global.scheduleState.isDirty = true;
          global.isDirty = true;

          const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
          if (updateCountFn) updateCountFn();
        }
        // Case B: Moving an existing card within or across day columns
        else if (block.classList.contains('grid-card')) {
          const durationSlots = parseFloat(block.dataset.end) - parseFloat(block.dataset.start);
          if (slotIndex + durationSlots > TOTAL_SLOTS) {
            slotIndex = TOTAL_SLOTS - durationSlots;
          }

          const professor = block.querySelector('.grid-card-prof')?.textContent.trim() || '';

          const validation = await validator.validatePlacement({
            day,
            startSlot: slotIndex,
            endSlot: slotIndex + durationSlots,
            professor,
            excludeCardId: block.id,
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
            return;
          }

          const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex) : '';
          const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex + durationSlots) : '';

          col.appendChild(block);
          block.dataset.start = slotIndex;
          block.dataset.end = slotIndex + durationSlots;
          block.style.top = `${slotIndex * slotHeight}px`;

          const updateSpanFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.updateCardSpanClass) || global.updateCardSpanClass;
          if (updateSpanFn) updateSpanFn(block);

          const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
          const fStart = formatShort(startTime);
          const fEnd = formatShort(endTime);
          const timeEl = block.querySelector('.grid-card-time-text');
          if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;

          const subject = block.querySelector('.grid-card-title')?.textContent.trim() || '';
          const section = (block.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/, '').trim();
          block.title = `${subject} (Sec: ${section || 'N/A'}) • ${professor || 'No Prof'} • ${fStart} - ${fEnd}`;

          if (global.ghostScheduleRenderer && typeof global.ghostScheduleRenderer.refreshSplits === 'function') {
            global.ghostScheduleRenderer.refreshSplits();
          }

          if (global.scheduleState) {
            global.scheduleState.isDirty = true;
            if (typeof global.scheduleState.updateSaveButtonState === 'function') {
              global.scheduleState.updateSaveButtonState();
            }
          }
          global.isDirty = true;
        }
      });
    });
    bindFormInputGuards();
  }

  /**
   * Initializes tray container drop zone for dragging grid cards back into available subjects.
   * @param {HTMLElement} blocksContainer
   */
  function initTrayDropZone(blocksContainer) {
    if (!blocksContainer) return;
    bindFormInputGuards();

    blocksContainer.addEventListener('dragover', (e) => {
      if (document.body.classList.contains('view-mode')) return;
      e.preventDefault();
      blocksContainer.classList.add('drag-over');
    });

    blocksContainer.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget || !blocksContainer.contains(e.relatedTarget)) {
        blocksContainer.classList.remove('drag-over');
      }
    });

    blocksContainer.addEventListener('drop', (e) => {
      if (document.body.classList.contains('view-mode')) return;
      e.preventDefault();
      cleanupDragState();

      const blockId = e.dataTransfer.getData('text/plain') || document.querySelector('.grid-card.dragging')?.id;
      const card = blockId ? document.getElementById(blockId) : null;

      if (card && card.classList.contains('grid-card')) {
        const subject = card.querySelector('.grid-card-title')?.textContent.trim() || '';
        const section = card.querySelector('.grid-card-section')?.textContent.replace(/^Sec:\s*/, '').trim() || '';
        const professor = card.querySelector('.grid-card-prof')?.textContent.trim() || '';

        const convertBlockFn = (global.trayBlockRenderer && global.trayBlockRenderer.convertToTrayBlock) || global.convertToTrayBlock;
        if (convertBlockFn) {
          const newBlock = convertBlockFn(subject, professor, section);
          blocksContainer.appendChild(newBlock);
        }

        card.remove();
        if (global.scheduleState) global.scheduleState.isDirty = true;
        global.isDirty = true;

        const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
        if (updateCountFn) updateCountFn();
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindFormInputGuards);
    } else {
      bindFormInputGuards();
    }
  }

  const scheduleMouseDrag = {
    bindCardDragListeners,
    bindTrayBlockDragListeners,
    initDayColumnDropZones,
    initTrayDropZone,
    bindFormInputGuards,
    isValidScheduleDropTarget
  };

  global.scheduleMouseDrag = scheduleMouseDrag;

})(typeof window !== 'undefined' ? window : this);
