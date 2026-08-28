/**
 * LabSync Touch Drag & Drop Interaction | js/scheduling/interactions/touch-drag.js
 * Mobile/tablet touch polyfill with live ghost block dragging, boundary snapping, and placement validation.
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

  let draggedElement = null;
  let ghostElement = null;
  let touchOffsetX = 0;
  let touchOffsetY = 0;
  let activeDropZone = null;

  /**
   * Initializes touch drag and drop polyfill across the scheduling grid and tray.
   * @param {HTMLElement} blocksContainer
   */
  function initTouchDragAndDrop(blocksContainer) {
    const autoScroller = global.scheduleAutoScroller || global.AutoScroller;
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};
    const validator = global.scheduleValidator;

    document.addEventListener('touchstart', function (e) {
      if (document.body.classList.contains('view-mode')) return;
      if (e.target.closest('.delete-block-btn, .grid-card-resize-handle, .card-info-icon')) return;

      const block = e.target.closest('.schedule-block, .grid-card');
      if (!block) return;

      draggedElement = block;
      const touch = e.touches[0];
      const rect = block.getBoundingClientRect();

      touchOffsetX = touch.clientX - rect.left;
      touchOffsetY = touch.clientY - rect.top;

      ghostElement = block.cloneNode(true);
      ghostElement.style.position = 'fixed';
      ghostElement.style.width = rect.width + 'px';
      ghostElement.style.height = rect.height + 'px';
      ghostElement.style.left = rect.left + 'px';
      ghostElement.style.top = rect.top + 'px';
      ghostElement.style.opacity = '0.8';
      ghostElement.style.pointerEvents = 'none';
      ghostElement.style.zIndex = '10000';
      ghostElement.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
      ghostElement.style.transform = 'scale(1.03)';

      document.body.appendChild(ghostElement);
      block.classList.add('dragging');
      document.body.classList.add('dragging-active');

      const ghostRenderer = global.ghostScheduleRenderer;
      const profName = ghostRenderer && typeof ghostRenderer.getBlockProfessorName === 'function'
        ? ghostRenderer.getBlockProfessorName(block)
        : '';

      if (profName && ghostRenderer && typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
        const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
        ghostRenderer.loadProfessorGhostSchedule(profName, context.academicYear, context.semester, context.roomNumber);
      }
    }, { passive: false });

    function handleTouchMoveCoordinates(clientX, clientY) {
      if (!draggedElement) return;

      const x = clientX - touchOffsetX;
      const y = clientY - touchOffsetY;

      if (ghostElement) {
        ghostElement.style.left = x + 'px';
        ghostElement.style.top = y + 'px';
      }

      const elementUnderTouch = document.elementFromPoint(clientX, clientY);
      if (!elementUnderTouch) return;

      const dropZone = elementUnderTouch.closest('.grid-day-column, #blocks-container');

      if (dropZone !== activeDropZone) {
        if (activeDropZone) {
          activeDropZone.classList.remove('drag-over');
        }
        activeDropZone = dropZone;
        if (activeDropZone) {
          activeDropZone.classList.add('drag-over');
        }
      }

      if (activeDropZone && activeDropZone.classList.contains('grid-day-column')) {
        const slotHeight = getSlotHeight();
        const rect = activeDropZone.getBoundingClientRect();
        const dropY = clientY - rect.top;
        let slotIndex = Math.round(dropY / slotHeight);
        if (slotIndex < 0) slotIndex = 0;

        let durationSlots = 3;
        if (draggedElement.classList.contains('grid-card')) {
          durationSlots = parseFloat(draggedElement.dataset.end) - parseFloat(draggedElement.dataset.start);
        }

        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        const showPlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.showPlaceholder) || global.showPlaceholder;
        if (showPlaceholderFn) {
          showPlaceholderFn(activeDropZone, slotIndex, durationSlots);
        }
      } else {
        const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
        if (removePlaceholderFn) removePlaceholderFn();
      }
    }

    document.addEventListener('touchmove', function (e) {
      if (!draggedElement) return;

      const touch = e.touches[0];
      handleTouchMoveCoordinates(touch.clientX, touch.clientY);
      if (autoScroller && typeof autoScroller.update === 'function') {
        autoScroller.update(touch.clientX, touch.clientY, (cx, cy) => {
          handleTouchMoveCoordinates(cx, cy);
        });
      }

      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', async function (e) {
      if (!draggedElement) return;

      if (autoScroller && typeof autoScroller.stop === 'function') {
        autoScroller.stop();
      }
      draggedElement.classList.remove('dragging');
      document.body.classList.remove('dragging-active');

      const removePlaceholderFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.removePlaceholder) || global.removePlaceholder;
      if (removePlaceholderFn) removePlaceholderFn();

      const ghostRenderer = global.ghostScheduleRenderer;
      if (ghostRenderer && typeof ghostRenderer.restoreDefaultOrClearGhost === 'function') {
        ghostRenderer.restoreDefaultOrClearGhost();
      }

      if (ghostElement) {
        ghostElement.remove();
        ghostElement = null;
      }

      if (activeDropZone) {
        activeDropZone.classList.remove('drag-over');

        const col = activeDropZone;
        const block = draggedElement;
        const slotHeight = getSlotHeight();
        const context = global.slotMath ? global.slotMath.getScheduleContext() : {};

        // Dropped onto available blocks tray
        if (col.id === 'blocks-container' || col.closest('#blocks-container')) {
          if (block.classList.contains('grid-card')) {
            const subject = block.querySelector('.grid-card-title')?.textContent.trim() || '';
            const section = block.querySelector('.grid-card-section')?.textContent.replace(/^Sec:\s*/, '').trim() || '';
            const professor = block.querySelector('.grid-card-prof')?.textContent.trim() || '';

            const convertBlockFn = (global.trayBlockRenderer && global.trayBlockRenderer.convertToTrayBlock) || global.convertToTrayBlock;
            if (convertBlockFn) {
              const newBlock = convertBlockFn(subject, professor, section);
              const targetContainer = document.getElementById('blocks-container');
              if (targetContainer) targetContainer.appendChild(newBlock);
            }

            block.remove();
            if (global.scheduleState) global.scheduleState.isDirty = true;
            global.isDirty = true;

            const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
            if (updateCountFn) updateCountFn();
          }
        }
        // Dropped onto a day column
        else if (col.classList.contains('grid-day-column')) {
          const rect = col.getBoundingClientRect();
          const lastTouchY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : 0;
          const dropY = lastTouchY - rect.top;
          let slotIndex = Math.round(dropY / slotHeight);
          if (slotIndex < 0) slotIndex = 0;

          const day = col.dataset.day;

          // Case A: Dragging from tray into grid column
          if (block.classList.contains('schedule-block')) {
            const durationSlots = 3;
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
              const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
              if (updateCountFn) updateCountFn();
              draggedElement = null;
              activeDropZone = null;
              return;
            }

            const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex) : '';
            const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(slotIndex + durationSlots) : '';

            const createCardFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.createGridCard) || global.createGridCard;
            if (createCardFn) {
              const card = createCardFn(null, subject, professor, section, startTime, endTime, 'Default');
              col.appendChild(card);
            }

            block.remove();
            if (global.scheduleState) global.scheduleState.isDirty = true;
            global.isDirty = true;
          }
          // Case B: Moving card to another column or within same column
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
              const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
              if (updateCountFn) updateCountFn();
              draggedElement = null;
              activeDropZone = null;
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

            if (global.scheduleState) global.scheduleState.isDirty = true;
            global.isDirty = true;
          }
        }

        const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
        if (updateCountFn) updateCountFn();
      }

      draggedElement = null;
      activeDropZone = null;
    });
  }

  const scheduleTouchDrag = {
    initTouchDragAndDrop
  };

  global.scheduleTouchDrag = scheduleTouchDrag;

})(typeof window !== 'undefined' ? window : this);
