/**
 * LabSync Card Resize Interaction | js/scheduling/interactions/card-resize.js
 * Handles mouse and touch card bottom-handle resizing with collision detection and async conflict checking.
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

  /**
   * Initializes resize interaction on a schedule card handle.
   * @param {HTMLElement} card - The schedule card
   * @param {HTMLElement} handle - The resize handle element
   * @param {string} professor - Professor name
   */
  function initCardResize(card, handle, professor) {
    if (!card || !handle) return;

    function initResize(e) {
      if (document.body.classList.contains('view-mode')) return;
      e.stopPropagation();
      e.preventDefault();

      const slotHeight = getSlotHeight();
      const startY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
      const startHeight = card.offsetHeight;
      const startTop = card.offsetTop;
      const col = card.closest('.grid-day-column');
      const day = col ? col.dataset.day : '';

      const autoScroller = global.scheduleAutoScroller || global.AutoScroller;
      const container = autoScroller && typeof autoScroller.getGridContainer === 'function' ? autoScroller.getGridContainer() : null;
      const startScrollTop = container ? container.scrollTop : 0;

      const originalEndSlot = parseFloat(card.dataset.end);
      const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};

      function doResize(moveEvt) {
        const currentY = (moveEvt && moveEvt.clientY !== undefined)
          ? moveEvt.clientY
          : (moveEvt && moveEvt.touches && moveEvt.touches[0] ? moveEvt.touches[0].clientY : startY);

        const currentScrollTop = container ? container.scrollTop : 0;
        const scrollDiff = currentScrollTop - startScrollTop;
        const dy = (currentY - startY) + scrollDiff;

        // Calculate new height, snap to slotHeight
        let newHeight = startHeight + dy;
        newHeight = Math.round(newHeight / slotHeight) * slotHeight;
        if (newHeight < slotHeight) newHeight = slotHeight;

        // Check bounds (cannot exceed TOTAL_SLOTS)
        const proposedEndSlot = (startTop + newHeight) / slotHeight;
        if (proposedEndSlot > TOTAL_SLOTS) {
          return;
        }

        // Overlap Collision Check (Local Room)
        const startSlot = startTop / slotHeight;
        const checkOverlapFn = (global.scheduleValidator && global.scheduleValidator.checkOverlap) || global.checkOverlap;
        if (checkOverlapFn && checkOverlapFn(day, startSlot, proposedEndSlot, card.id)) {
          return; // Collision detected, stop resizing further down
        }

        card.style.height = `${newHeight}px`;
        card.dataset.end = proposedEndSlot;

        const updateSpanFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.updateCardSpanClass) || global.updateCardSpanClass;
        if (updateSpanFn) updateSpanFn(card);

        // Update Time display inside card
        const tStart = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(startSlot) : '';
        const tEnd = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(proposedEndSlot) : '';
        const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
        const fStart = formatShort(tStart);
        const fEnd = formatShort(tEnd);
        const timeEl = card.querySelector('.grid-card-time-text');
        if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;
      }

      function handleResizeMove(moveEvt) {
        const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0] ? moveEvt.touches[0].clientX : 0);
        const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0] ? moveEvt.touches[0].clientY : 0);
        doResize(moveEvt);
        if (autoScroller && typeof autoScroller.update === 'function') {
          autoScroller.update(currentX, currentY, () => {
            doResize({ clientX: currentX, clientY: currentY });
          });
        }
      }

      async function stopResize() {
        if (autoScroller && typeof autoScroller.stop === 'function') {
          autoScroller.stop();
        }
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', handleResizeMove);
        document.removeEventListener('touchend', stopResize);

        // Perform Async Professor Conflict Check upon completion of resizing
        const startSlot = startTop / slotHeight;
        const currentEndSlot = parseFloat(card.dataset.end);
        const tStart = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(startSlot) : '';
        const tEnd = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(currentEndSlot) : '';

        const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
        const checkConflictFn = (global.scheduleValidator && global.scheduleValidator.checkProfessorConflict) || global.checkProfessorConflict;

        if (checkConflictFn) {
          const profCheck = await checkConflictFn(professor, day, tStart, tEnd, context.academicYear, context.semester, context.roomNumber);
          if (profCheck && profCheck.conflict) {
            const formatLabel = timeUtils.formatTimeLabel || global.formatTimeLabel || ((t) => t);
            const timeLabelStart = formatLabel(profCheck.startTime);
            const timeLabelEnd = formatLabel(profCheck.endTime);
            if (global.showToast) {
              global.showToast(`Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`, 'warning', 'Schedule Conflict');
            } else {
              alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`);
            }

            // Revert Resize
            card.style.height = `${(originalEndSlot - startSlot) * slotHeight}px`;
            card.dataset.end = originalEndSlot;

            const updateSpanFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.updateCardSpanClass) || global.updateCardSpanClass;
            if (updateSpanFn) updateSpanFn(card);

            const origEnd = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(originalEndSlot) : '';
            const formatShort = timeUtils.formatShortTime || global.formatShortTime || ((t) => t);
            const fStart = formatShort(tStart);
            const fEnd = formatShort(origEnd);
            const timeEl = card.querySelector('.grid-card-time-text');
            if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;
            return;
          }
        }

        if (global.scheduleState) global.scheduleState.isDirty = true;
        global.isDirty = true;
      }

      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', handleResizeMove, { passive: false });
      document.addEventListener('touchend', stopResize);
    }

    handle.addEventListener('mousedown', initResize);
    handle.addEventListener('touchstart', initResize, { passive: false });
  }

  const scheduleCardResize = {
    initCardResize
  };

  global.scheduleCardResize = scheduleCardResize;
  global.initCardResize = initCardResize;

})(typeof window !== 'undefined' ? window : this);
