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
   * Smooth RAF AutoScroller for drag & drop and card resize interactions.
   * Auto-scrolls both the timetable grid container (.calendar-grid-container)
   * and the browser viewport when cursor is dragged near edges.
   */
  const AutoScroller = {
    rafId: null,
    pointerX: 0,
    pointerY: 0,
    active: false,
    onScrollCallback: null,
    EDGE_THRESHOLD: 70, // proximity zone in px
    MIN_SPEED: 2,       // min px per frame
    MAX_SPEED: 18,      // max px per frame

    getGridContainer() {
      return document.querySelector('.calendar-grid-container');
    },

    start(onScrollCallback) {
      this.active = true;
      if (typeof onScrollCallback === 'function') {
        this.onScrollCallback = onScrollCallback;
      }
      if (!this.rafId) {
        this.loop = this.loop.bind(this);
        this.rafId = requestAnimationFrame(this.loop);
      }
    },

    update(clientX, clientY, onScrollCallback) {
      if (clientX !== undefined) this.pointerX = clientX;
      if (clientY !== undefined) this.pointerY = clientY;
      if (typeof onScrollCallback === 'function') {
        this.onScrollCallback = onScrollCallback;
      }
      if (!this.active) {
        this.start(onScrollCallback);
      }
    },

    stop() {
      this.active = false;
      this.onScrollCallback = null;
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    },

    computeSpeed(distanceInsideEdge) {
      const ratio = Math.min(1.6, Math.max(0, distanceInsideEdge / this.EDGE_THRESHOLD));
      return this.MIN_SPEED + (this.MAX_SPEED - this.MIN_SPEED) * Math.pow(ratio, 1.4);
    },

    loop() {
      if (!this.active) {
        this.rafId = null;
        return;
      }

      let didScroll = false;
      const container = this.getGridContainer();
      const clientY = this.pointerY;
      const clientX = this.pointerX;

      if (clientY > 0 && container) {
        const cRect = container.getBoundingClientRect();

        // 1. Calendar Grid Container auto-scroll (Primary)
        if (clientX >= cRect.left - 60 && clientX <= cRect.right + 60) {
          // Bottom edge of container
          if (clientY >= cRect.bottom - this.EDGE_THRESHOLD && clientY <= cRect.bottom + 120) {
            const distance = clientY - (cRect.bottom - this.EDGE_THRESHOLD);
            const speed = this.computeSpeed(distance);
            const maxScrollTop = container.scrollHeight - container.clientHeight;
            if (container.scrollTop < maxScrollTop) {
              container.scrollTop = Math.min(maxScrollTop, container.scrollTop + speed);
              didScroll = true;
            }
          }
          // Top edge of container
          else if (clientY <= cRect.top + this.EDGE_THRESHOLD && clientY >= cRect.top - 60) {
            const distance = (cRect.top + this.EDGE_THRESHOLD) - clientY;
            const speed = this.computeSpeed(distance);
            if (container.scrollTop > 0) {
              container.scrollTop = Math.max(0, container.scrollTop - speed);
              didScroll = true;
            }
          }
        }

        // 2. Viewport / Window vertical auto-scroll (Secondary / Page level)
        const vh = window.innerHeight;
        if (clientY >= vh - this.EDGE_THRESHOLD) {
          const distance = clientY - (vh - this.EDGE_THRESHOLD);
          const speed = this.computeSpeed(distance);
          window.scrollBy(0, speed);
          didScroll = true;
        } else if (clientY <= this.EDGE_THRESHOLD && clientY >= 0) {
          const distance = this.EDGE_THRESHOLD - clientY;
          const speed = this.computeSpeed(distance);
          window.scrollBy(0, -speed);
          didScroll = true;
        }
      }

      // Continuously update placeholder / resize calculations on each animation frame
      if (this.onScrollCallback) {
        this.onScrollCallback(this.pointerX, this.pointerY, didScroll);
      }

      if (this.active) {
        this.rafId = requestAnimationFrame(this.loop);
      } else {
        this.rafId = null;
      }
    }
  };

  /**
   * Helper to recalculate slot and update the snap placeholder during native drag auto-scroll
   */
  function updateDropPlaceholderFromPoint(clientX, clientY) {
    if (document.body.classList.contains('view-mode')) return;
    const elem = document.elementFromPoint(clientX, clientY);
    if (!elem) return;

    const col = elem.closest('.grid-day-column');
    if (!col) return;

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

    if (global.showPlaceholder) {
      global.showPlaceholder(col, slotIndex, durationSlots);
    }
  }

  // Global drag listeners to keep AutoScroller updated across window boundaries
  document.addEventListener('dragover', (e) => {
    if (document.body.classList.contains('view-mode')) return;
    const isDragging = document.querySelector('.grid-card.dragging, .schedule-block.dragging');
    if (isDragging) {
      AutoScroller.update(e.clientX, e.clientY, updateDropPlaceholderFromPoint);
    }
  });

  document.addEventListener('dragend', () => {
    AutoScroller.stop();
  });

  document.addEventListener('drop', () => {
    AutoScroller.stop();
  });

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
      const container = AutoScroller.getGridContainer();
      const startScrollTop = container ? container.scrollTop : 0;

      const originalEndSlot = parseFloat(card.dataset.end);

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

      function handleResizeMove(moveEvt) {
        const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0] ? moveEvt.touches[0].clientX : 0);
        const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0] ? moveEvt.touches[0].clientY : 0);
        doResize(moveEvt);
        AutoScroller.update(currentX, currentY, () => {
          doResize({ clientX: currentX, clientY: currentY });
        });
      }

      async function stopResize() {
        AutoScroller.stop();
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', handleResizeMove);
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

      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', handleResizeMove, { passive: false });
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
      AutoScroller.start(updateDropPlaceholderFromPoint);

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
      AutoScroller.stop();
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
      AutoScroller.start(updateDropPlaceholderFromPoint);

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
      AutoScroller.stop();
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

        AutoScroller.update(e.clientX, e.clientY, updateDropPlaceholderFromPoint);

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
        AutoScroller.stop();
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
      AutoScroller.stop();

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

        if (global.showPlaceholder) {
          global.showPlaceholder(activeDropZone, slotIndex, durationSlots);
        }
      } else {
        if (global.removePlaceholder) global.removePlaceholder();
      }
    }

    document.addEventListener('touchmove', function (e) {
      if (!draggedElement) return;

      const touch = e.touches[0];
      handleTouchMoveCoordinates(touch.clientX, touch.clientY);
      AutoScroller.update(touch.clientX, touch.clientY, (cx, cy) => {
        handleTouchMoveCoordinates(cx, cy);
      });

      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', async function (e) {
      if (!draggedElement) return;

      AutoScroller.stop();
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
    AutoScroller,
    initCardResize,
    bindCardDragListeners,
    bindTrayBlockDragListeners,
    initDayColumnDropZones,
    initTrayDropZone,
    initTouchDragAndDrop
  };

  global.scheduleDragDrop = scheduleDragDrop;

})(typeof window !== 'undefined' ? window : this);
