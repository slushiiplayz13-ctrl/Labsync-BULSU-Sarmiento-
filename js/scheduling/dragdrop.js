/**
 * LabSync – Scheduling Drag, Drop & Resize Engine | js/scheduling/dragdrop.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Handles mouse drag & drop, card resizing with bounds & collision checks, and mobile/tablet touch polyfill.
 */

(function (global) {
  'use strict';

  function getSlotHeight() {
    return window.innerWidth <= 768 ? 30 : 36;
  }

  const TOTAL_SLOTS = 27; // 7am to 8:30pm (27 slots)

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
      const startY = e.clientY || (e.touches && e.touches[0].clientY);
      const startHeight = card.offsetHeight;
      const startTop = card.offsetTop;
      const col = card.closest('.grid-day-column');
      const day = col ? col.dataset.day : '';

      const originalEndSlot = parseFloat(card.dataset.end);

      function doResize(moveEvt) {
        const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY);
        const dy = currentY - startY;

        // Calculate new height, snap to slotHeight
        let newHeight = startHeight + dy;
        newHeight = Math.round(newHeight / slotHeight) * slotHeight;
        if (newHeight < slotHeight) newHeight = slotHeight;

        // Check bounds (cannot exceed 7:00 PM)
        const proposedEndSlot = (startTop + newHeight) / slotHeight;
        if (proposedEndSlot > TOTAL_SLOTS) {
          return;
        }

        // Overlap Collision Check (Local Room)
        const startSlot = startTop / slotHeight;
        if (global.checkOverlap && global.checkOverlap(day, startSlot, proposedEndSlot, card.id)) {
          return; // Collision detected, stop resizing further down
        }

        card.style.height = `${newHeight}px`;
        card.dataset.end = proposedEndSlot;
        if (global.updateCardSpanClass) global.updateCardSpanClass(card);

        // Update Time display inside card
        const tStart = global.slotsToTime ? global.slotsToTime(startSlot) : '';
        const tEnd = global.slotsToTime ? global.slotsToTime(proposedEndSlot) : '';
        const fStart = global.formatShortTime ? global.formatShortTime(tStart) : tStart;
        const fEnd = global.formatShortTime ? global.formatShortTime(tEnd) : tEnd;
        const timeEl = card.querySelector('.grid-card-time-text');
        if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;
      }

      async function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', doResize);
        document.removeEventListener('touchend', stopResize);

        // Perform Async Professor Conflict Check upon completion of resizing
        const startSlot = startTop / slotHeight;
        const currentEndSlot = parseFloat(card.dataset.end);
        const tStart = global.slotsToTime ? global.slotsToTime(startSlot) : '';
        const tEnd = global.slotsToTime ? global.slotsToTime(currentEndSlot) : '';

        const academicYear = typeof global.getSelectedAcademicYear === 'function' ? global.getSelectedAcademicYear() : '';
        const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        const urlParams = new URLSearchParams(window.location.search);
        const roomNum = urlParams.get('room') || '204';

        if (global.checkProfessorConflict) {
          const profCheck = await global.checkProfessorConflict(professor, day, tStart, tEnd, academicYear, semester, roomNum);
          if (profCheck && profCheck.conflict) {
            const timeLabelStart = global.formatTimeLabel ? global.formatTimeLabel(profCheck.startTime) : profCheck.startTime;
            const timeLabelEnd = global.formatTimeLabel ? global.formatTimeLabel(profCheck.endTime) : profCheck.endTime;
            if (global.showToast) {
              global.showToast(`Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`, 'warning', 'Schedule Conflict');
            } else {
              alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`);
            }

            // Revert Resize
            card.style.height = `${(originalEndSlot - startSlot) * slotHeight}px`;
            card.dataset.end = originalEndSlot;
            if (global.updateCardSpanClass) global.updateCardSpanClass(card);
            const origEnd = global.slotsToTime ? global.slotsToTime(originalEndSlot) : '';
            const fStart = global.formatShortTime ? global.formatShortTime(tStart) : tStart;
            const fEnd = global.formatShortTime ? global.formatShortTime(origEnd) : origEnd;
            const timeEl = card.querySelector('.grid-card-time-text');
            if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;
            return;
          }
        }

        global.isDirty = true;
      }

      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', doResize, { passive: false });
      document.addEventListener('touchend', stopResize);
    }

    handle.addEventListener('mousedown', initResize);
    handle.addEventListener('touchstart', initResize, { passive: false });
  }

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
      e.dataTransfer.setData('text/plain', card.id);
      setTimeout(() => card.classList.add('dragging'), 0);
      if (professor && typeof global.loadProfessorGhostSchedule === 'function') {
        const academicYear = typeof global.getSelectedAcademicYear === 'function' ? global.getSelectedAcademicYear() : '';
        const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        const urlParams = new URLSearchParams(window.location.search);
        const roomNum = urlParams.get('room') || '204';
        global.loadProfessorGhostSchedule(professor, academicYear, semester, roomNum);
      }
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      if (typeof global.restoreDefaultOrClearGhost === 'function') {
        global.restoreDefaultOrClearGhost();
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
      e.dataTransfer.setData('text/plain', block.id);
      setTimeout(() => block.classList.add('dragging'), 0);
      if (professor && typeof global.loadProfessorGhostSchedule === 'function') {
        const academicYear = typeof global.getSelectedAcademicYear === 'function' ? global.getSelectedAcademicYear() : '';
        const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        const urlParams = new URLSearchParams(window.location.search);
        const roomNum = urlParams.get('room') || '204';
        global.loadProfessorGhostSchedule(professor, academicYear, semester, roomNum);
      }
    });

    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      if (typeof global.updateBlockCount === 'function') {
        global.updateBlockCount();
      }
      if (typeof global.restoreDefaultOrClearGhost === 'function') {
        global.restoreDefaultOrClearGhost();
      }
    });
  }

  /**
   * Initializes drag & drop on all day columns in the grid.
   * @param {NodeList|Array} dayColumns
   * @param {HTMLElement} blocksContainer
   */
  function initDayColumnDropZones(dayColumns, blocksContainer) {
    if (!dayColumns) return;

    dayColumns.forEach(col => {
      col.addEventListener('dragover', (e) => {
        if (document.body.classList.contains('view-mode')) return;
        e.preventDefault();
        col.classList.add('drag-over');

        const slotHeight = getSlotHeight();
        const rect = col.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        let slotIndex = Math.round(dropY / slotHeight);
        if (slotIndex < 0) slotIndex = 0;

        const draggedId = document.querySelector('.grid-card.dragging, .schedule-block.dragging')?.id;
        if (!draggedId) return;
        const draggedBlock = document.getElementById(draggedId);
        if (!draggedBlock) return;

        let durationSlots = 3; // default 1.5h = 3 slots
        if (draggedBlock.classList.contains('grid-card')) {
          durationSlots = parseFloat(draggedBlock.dataset.end) - parseFloat(draggedBlock.dataset.start);
        }

        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        if (global.showPlaceholder) {
          global.showPlaceholder(col, slotIndex, durationSlots);
        }
      });

      col.addEventListener('dragleave', () => {
        col.classList.remove('drag-over');
        if (global.removePlaceholder) global.removePlaceholder();
      });

      col.addEventListener('drop', async (e) => {
        if (document.body.classList.contains('view-mode')) return;
        e.preventDefault();
        col.classList.remove('drag-over');
        if (global.removePlaceholder) global.removePlaceholder();

        const id = e.dataTransfer.getData('text/plain');
        const block = document.getElementById(id);
        if (!block) return;

        const slotHeight = getSlotHeight();
        const rect = col.getBoundingClientRect();
        const dropY = e.clientY - rect.top;

        let slotIndex = Math.round(dropY / slotHeight);
        if (slotIndex < 0) slotIndex = 0;

        const day = col.dataset.day;
        const academicYear = typeof global.getSelectedAcademicYear === 'function' ? global.getSelectedAcademicYear() : '';
        const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        const urlParams = new URLSearchParams(window.location.search);
        const roomNum = urlParams.get('room') || '204';

        // Case 1: Dragging from tray
        if (block.classList.contains('schedule-block')) {
          const divs = block.querySelectorAll('div');
          const subject = divs[0].textContent;
          const professor = divs[1].textContent;
          const section = divs[2].textContent;

          let durationSlots = 3;
          if (slotIndex + durationSlots > TOTAL_SLOTS) {
            slotIndex = TOTAL_SLOTS - durationSlots;
          }

          if (global.checkOverlap && global.checkOverlap(day, slotIndex, slotIndex + durationSlots, null)) {
            if (global.showToast) {
              global.showToast('This time slot overlaps with another scheduled class.', 'warning', 'Schedule Conflict');
            } else {
              alert('Schedule Conflict: This time slot overlaps with another scheduled class.');
            }
            return;
          }

          const startTime = global.slotsToTime ? global.slotsToTime(slotIndex) : '';
          const endTime = global.slotsToTime ? global.slotsToTime(slotIndex + durationSlots) : '';

          if (global.checkProfessorConflict) {
            const profCheck = await global.checkProfessorConflict(professor, day, startTime, endTime, academicYear, semester, roomNum);
            if (profCheck && profCheck.conflict) {
              const timeLabelStart = global.formatTimeLabel ? global.formatTimeLabel(profCheck.startTime) : profCheck.startTime;
              const timeLabelEnd = global.formatTimeLabel ? global.formatTimeLabel(profCheck.endTime) : profCheck.endTime;
              if (global.showToast) {
                global.showToast(`Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`, 'warning', 'Schedule Conflict');
              } else {
                alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`);
              }
              return;
            }
          }

          if (global.createGridCard) {
            const card = global.createGridCard(null, subject, professor, section, startTime, endTime, 'Default');
            col.appendChild(card);
          }
          block.remove();
          global.isDirty = true;
        }
        // Case 2: Dragging existing grid card
        else if (block.classList.contains('grid-card')) {
          const durationSlots = parseFloat(block.dataset.end) - parseFloat(block.dataset.start);

          if (slotIndex + durationSlots > TOTAL_SLOTS) {
            slotIndex = TOTAL_SLOTS - durationSlots;
          }

          if (global.checkOverlap && global.checkOverlap(day, slotIndex, slotIndex + durationSlots, block.id)) {
            if (global.showToast) {
              global.showToast('This time slot overlaps with another scheduled class.', 'warning', 'Schedule Conflict');
            } else {
              alert('Schedule Conflict: This time slot overlaps with another scheduled class.');
            }
            return;
          }

          const startTime = global.slotsToTime ? global.slotsToTime(slotIndex) : '';
          const endTime = global.slotsToTime ? global.slotsToTime(slotIndex + durationSlots) : '';
          const professor = block.querySelector('.grid-card-prof')?.textContent || '';

          if (global.checkProfessorConflict) {
            const profCheck = await global.checkProfessorConflict(professor, day, startTime, endTime, academicYear, semester, roomNum);
            if (profCheck && profCheck.conflict) {
              const timeLabelStart = global.formatTimeLabel ? global.formatTimeLabel(profCheck.startTime) : profCheck.startTime;
              const timeLabelEnd = global.formatTimeLabel ? global.formatTimeLabel(profCheck.endTime) : profCheck.endTime;
              if (global.showToast) {
                global.showToast(`Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`, 'warning', 'Schedule Conflict');
              } else {
                alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`);
              }
              return;
            }
          }

          col.appendChild(block);
          block.dataset.start = slotIndex;
          block.dataset.end = slotIndex + durationSlots;
          block.style.top = `${slotIndex * slotHeight}px`;
          if (global.updateCardSpanClass) global.updateCardSpanClass(block);

          const fStart = global.formatShortTime ? global.formatShortTime(startTime) : startTime;
          const fEnd = global.formatShortTime ? global.formatShortTime(endTime) : endTime;
          const timeEl = block.querySelector('.grid-card-time-text');
          if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;

          global.isDirty = true;
        }

        if (typeof global.updateBlockCount === 'function') {
          global.updateBlockCount();
        }
      });
    });
  }

  /**
   * Initializes drop zone on availability tray blocksContainer.
   * @param {HTMLElement} blocksContainer
   */
  function initTrayDropZone(blocksContainer) {
    if (!blocksContainer) return;

    blocksContainer.addEventListener('dragover', (e) => {
      if (document.body.classList.contains('view-mode')) return;
      e.preventDefault();
      blocksContainer.classList.add('drag-over');
    });

    blocksContainer.addEventListener('dragleave', () => {
      blocksContainer.classList.remove('drag-over');
    });

    blocksContainer.addEventListener('drop', (e) => {
      if (document.body.classList.contains('view-mode')) return;
      e.preventDefault();
      blocksContainer.classList.remove('drag-over');

      const id = e.dataTransfer.getData('text/plain');
      const block = document.getElementById(id);
      if (block && block.classList.contains('grid-card')) {
        const subject = block.querySelector('.grid-card-title')?.textContent || '';
        const section = (block.querySelector('.grid-card-section')?.textContent || '').replace('Sec: ', '');
        const professor = block.querySelector('.grid-card-prof')?.textContent || '';

        if (typeof global.convertToTrayBlock === 'function') {
          const trayBlock = global.convertToTrayBlock(subject, professor, section);
          blocksContainer.appendChild(trayBlock);
        }
        block.remove();

        global.isDirty = true;
        const emptyMsg = document.getElementById('no-blocks-msg');
        if (emptyMsg) emptyMsg.remove();
        if (typeof global.updateBlockCount === 'function') {
          global.updateBlockCount();
        }
      }
    });
  }

  /**
   * Touch Drag & Drop Polyfill for Mobile and Tablet Devices supporting both available blocks & grid cards.
   * @param {HTMLElement} blocksContainer
   */
  function initTouchDragAndDrop(blocksContainer) {
    let draggedElement = null;
    let ghostElement = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;
    let activeDropZone = null;

    document.addEventListener('touchstart', function (e) {
      if (document.body.classList.contains('view-mode')) return;

      const block = e.target.closest('.schedule-block, .grid-card');
      if (!block) return;

      if (e.target.closest('.delete-block-btn, .grid-card-delete-btn, .grid-card-resize-handle, .grid-card-color-btn, .color-picker-popover')) return;
      if (block.draggable === false || block.getAttribute('draggable') === 'false') return;

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

      const profName = global.getBlockProfessorName ? global.getBlockProfessorName(block) : '';
      if (profName && typeof global.loadProfessorGhostSchedule === 'function') {
        const academicYear = typeof global.getSelectedAcademicYear === 'function' ? global.getSelectedAcademicYear() : '';
        const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        const urlParams = new URLSearchParams(window.location.search);
        const roomNum = urlParams.get('room') || '204';
        global.loadProfessorGhostSchedule(profName, academicYear, semester, roomNum);
      }
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
      if (!draggedElement) return;

      const touch = e.touches[0];
      const x = touch.clientX - touchOffsetX;
      const y = touch.clientY - touchOffsetY;

      if (ghostElement) {
        ghostElement.style.left = x + 'px';
        ghostElement.style.top = y + 'px';
      }

      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
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
        const dropY = touch.clientY - rect.top;
        let slotIndex = Math.round(dropY / slotHeight);
        if (slotIndex < 0) slotIndex = 0;

        let durationSlots = 3;
        if (draggedElement.classList.contains('grid-card')) {
          durationSlots = parseFloat(draggedElement.dataset.end) - parseFloat(draggedElement.dataset.start);
        }

        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        if (global.showPlaceholder) {
          global.showPlaceholder(activeDropZone, slotIndex, durationSlots);
        }
      } else {
        if (global.removePlaceholder) global.removePlaceholder();
      }

      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', async function (e) {
      if (!draggedElement) return;

      draggedElement.classList.remove('dragging');
      document.body.classList.remove('dragging-active');
      if (global.removePlaceholder) global.removePlaceholder();
      if (typeof global.restoreDefaultOrClearGhost === 'function') {
        global.restoreDefaultOrClearGhost();
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
        const academicYear = typeof global.getSelectedAcademicYear === 'function' ? global.getSelectedAcademicYear() : '';
        const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        const urlParams = new URLSearchParams(window.location.search);
        const roomNum = urlParams.get('room') || '204';

        // Dropped onto available blocks tray
        if (col.id === 'blocks-container' || col === blocksContainer) {
          if (block.classList.contains('grid-card')) {
            const subject = block.querySelector('.grid-card-title')?.textContent || '';
            const section = (block.querySelector('.grid-card-section')?.textContent || '').replace('Sec: ', '');
            const professor = block.querySelector('.grid-card-prof')?.textContent || '';

            if (typeof global.convertToTrayBlock === 'function') {
              const trayBlock = global.convertToTrayBlock(subject, professor, section);
              blocksContainer.appendChild(trayBlock);
            }
            block.remove();

            global.isDirty = true;
            const emptyMsg = document.getElementById('no-blocks-msg');
            if (emptyMsg) emptyMsg.remove();
          }
        }
        // Dropped onto a day column
        else if (col.classList.contains('grid-day-column')) {
          const rect = col.getBoundingClientRect();
          const touch = e.changedTouches[0];
          const dropY = touch.clientY - rect.top;

          let slotIndex = Math.round(dropY / slotHeight);
          if (slotIndex < 0) slotIndex = 0;

          const day = col.dataset.day;

          // Case A: Dropping tray block
          if (block.classList.contains('schedule-block')) {
            const divs = block.querySelectorAll('div');
            const subject = divs[0].textContent;
            const professor = divs[1].textContent;
            const section = divs[2].textContent;

            let durationSlots = 3;
            if (slotIndex + durationSlots > TOTAL_SLOTS) {
              slotIndex = TOTAL_SLOTS - durationSlots;
            }

            if (global.checkOverlap && global.checkOverlap(day, slotIndex, slotIndex + durationSlots, null)) {
              if (global.showToast) {
                global.showToast('This time slot overlaps with another scheduled class.', 'warning', 'Schedule Conflict');
              } else {
                alert('Schedule Conflict: This time slot overlaps with another scheduled class.');
              }
            } else {
              const startTime = global.slotsToTime ? global.slotsToTime(slotIndex) : '';
              const endTime = global.slotsToTime ? global.slotsToTime(slotIndex + durationSlots) : '';

              if (global.checkProfessorConflict) {
                const profCheck = await global.checkProfessorConflict(professor, day, startTime, endTime, academicYear, semester, roomNum);
                if (profCheck && profCheck.conflict) {
                  const timeLabelStart = global.formatTimeLabel ? global.formatTimeLabel(profCheck.startTime) : profCheck.startTime;
                  const timeLabelEnd = global.formatTimeLabel ? global.formatTimeLabel(profCheck.endTime) : profCheck.endTime;
                  if (global.showToast) {
                    global.showToast(`Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`, 'warning', 'Schedule Conflict');
                  } else {
                    alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`);
                  }
                  if (typeof global.updateBlockCount === 'function') global.updateBlockCount();
                  draggedElement = null;
                  activeDropZone = null;
                  return;
                }
              }

              if (global.createGridCard) {
                const card = global.createGridCard(null, subject, professor, section, startTime, endTime, 'Default');
                col.appendChild(card);
              }
              block.remove();
              global.isDirty = true;
            }
          }
          // Case B: Dragging card to another column or within same column
          else if (block.classList.contains('grid-card')) {
            const durationSlots = parseFloat(block.dataset.end) - parseFloat(block.dataset.start);

            if (slotIndex + durationSlots > TOTAL_SLOTS) {
              slotIndex = TOTAL_SLOTS - durationSlots;
            }

            if (global.checkOverlap && global.checkOverlap(day, slotIndex, slotIndex + durationSlots, block.id)) {
              if (global.showToast) {
                global.showToast('This time slot overlaps with another scheduled class.', 'warning', 'Schedule Conflict');
              } else {
                alert('Schedule Conflict: This time slot overlaps with another scheduled class.');
              }
            } else {
              const startTime = global.slotsToTime ? global.slotsToTime(slotIndex) : '';
              const endTime = global.slotsToTime ? global.slotsToTime(slotIndex + durationSlots) : '';
              const professor = block.querySelector('.grid-card-prof')?.textContent || '';

              if (global.checkProfessorConflict) {
                const profCheck = await global.checkProfessorConflict(professor, day, startTime, endTime, academicYear, semester, roomNum);
                if (profCheck && profCheck.conflict) {
                  const timeLabelStart = global.formatTimeLabel ? global.formatTimeLabel(profCheck.startTime) : profCheck.startTime;
                  const timeLabelEnd = global.formatTimeLabel ? global.formatTimeLabel(profCheck.endTime) : profCheck.endTime;
                  if (global.showToast) {
                    global.showToast(`Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`, 'warning', 'Schedule Conflict');
                  } else {
                    alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${timeLabelStart} to ${timeLabelEnd} on ${day}.`);
                  }
                  if (typeof global.updateBlockCount === 'function') global.updateBlockCount();
                  draggedElement = null;
                  activeDropZone = null;
                  return;
                }
              }

              col.appendChild(block);
              block.dataset.start = slotIndex;
              block.dataset.end = slotIndex + durationSlots;
              block.style.top = `${slotIndex * slotHeight}px`;
              if (global.updateCardSpanClass) global.updateCardSpanClass(block);

              const fStart = global.formatShortTime ? global.formatShortTime(startTime) : startTime;
              const fEnd = global.formatShortTime ? global.formatShortTime(endTime) : endTime;
              const timeEl = block.querySelector('.grid-card-time-text');
              if (timeEl) timeEl.textContent = `${fStart} - ${fEnd}`;

              global.isDirty = true;
            }
          }
        }
        if (typeof global.updateBlockCount === 'function') {
          global.updateBlockCount();
        }
      }

      draggedElement = null;
      activeDropZone = null;
    });
  }

  const scheduleDragDrop = {
    initCardResize,
    bindCardDragListeners,
    bindTrayBlockDragListeners,
    initDayColumnDropZones,
    initTrayDropZone,
    initTouchDragAndDrop
  };

  global.scheduleDragDrop = scheduleDragDrop;

})(typeof window !== 'undefined' ? window : this);
