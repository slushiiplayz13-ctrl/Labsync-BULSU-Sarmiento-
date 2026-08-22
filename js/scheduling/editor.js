/**
 * LabSync – Room Schedule Editor Master Coordinator | js/scheduling/editor.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Coordinates editor lifecycle, availability tray, modals, dirty-state guard, and schedule persistence.
 */

(function (global) {
  'use strict';

  let blockCounter = 0;
  let activeEditingCard = null;
  let isViewMode = false;

  // Initialize global state bridges
  global.isDirty = false;
  global.pendingAction = null;
  global.revertSelectCallback = null;

  function getSelectedAcademicYear() {
    const wrapper = document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
    if (wrapper && wrapper.dataset && wrapper.dataset.value) {
      return wrapper.dataset.value;
    }
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${currentYear + 1}`;
  }
  global.getSelectedAcademicYear = getSelectedAcademicYear;

  function restoreDefaultOrClearGhost() {
    const selectedProf = document.getElementById('professor-wrapper')?.dataset.value;
    if (selectedProf && typeof global.loadProfessorGhostSchedule === 'function') {
      const academicYear = getSelectedAcademicYear();
      const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
      const urlParams = new URLSearchParams(window.location.search);
      const roomNum = urlParams.get('room') || '204';
      global.loadProfessorGhostSchedule(selectedProf, academicYear, semester, roomNum);
    } else if (typeof global.clearGhostBlocks === 'function') {
      global.clearGhostBlocks();
    }
  }
  global.restoreDefaultOrClearGhost = restoreDefaultOrClearGhost;

  /**
   * Converts subject, professor, section into an available tray block element.
   * @param {string} subject
   * @param {string} professor
   * @param {string} section
   * @returns {HTMLElement}
   */
  function convertToTrayBlock(subject, professor, section) {
    blockCounter++;
    const block = document.createElement('div');
    block.className = 'schedule-block';
    block.draggable = true;
    block.id = 'block-new-' + blockCounter;
    block.innerHTML = `
      <div style="font-weight: 700;">${subject}</div>
      <div style="font-size: 11.5px; opacity: 0.9;">${professor}</div>
      <div style="font-size: 11.5px; opacity: 0.9;">${section}</div>
      <button class="delete-block-btn" onclick="deleteBlock(event, this)">
        <i data-lucide="x" style="width: 14px; height: 14px; pointer-events: none;"></i>
      </button>
    `;

    if (global.scheduleDragDrop && typeof global.scheduleDragDrop.bindTrayBlockDragListeners === 'function') {
      global.scheduleDragDrop.bindTrayBlockDragListeners(block, professor);
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: block });
    }

    return block;
  }
  global.convertToTrayBlock = convertToTrayBlock;

  /**
   * Deletes a tray block on clicking the x button.
   * @param {Event} event
   * @param {HTMLElement} btn
   */
  function deleteBlock(event, btn) {
    if (event) event.stopPropagation();
    const block = btn ? btn.closest('.schedule-block') : null;
    if (block) {
      block.remove();
      global.isDirty = true;
      updateBlockCount();
    }
  }
  global.deleteBlock = deleteBlock;

  /**
   * Updates the counter badge for available blocks.
   */
  function updateBlockCount() {
    const blocksContainer = document.getElementById('blocks-container');
    const availableCount = document.getElementById('available-count');
    if (!blocksContainer || !availableCount) return;

    const count = blocksContainer.querySelectorAll('.schedule-block').length;
    availableCount.textContent = count;

    if (count === 0 && !document.getElementById('no-blocks-msg')) {
      blocksContainer.innerHTML = `<p id="no-blocks-msg" style="font-size: 11.5px; color: #94A3B8; font-weight: 500; text-align: center; line-height: 1.5; margin-top: 16px;">No blocks created yet. Create a block to start scheduling.</p>`;
    }
  }
  global.updateBlockCount = updateBlockCount;

  /**
   * Deletes a card from the grid and converts it back into a tray block.
   * @param {HTMLElement} card
   */
  function deleteGridCardRef(card) {
    if (document.body.classList.contains('view-mode') || !card) return;
    const blocksContainer = document.getElementById('blocks-container');
    if (!blocksContainer) return;

    const subject = card.querySelector('.grid-card-title')?.textContent || '';
    const section = (card.querySelector('.grid-card-section')?.textContent || '').replace('Sec: ', '');
    const professor = card.querySelector('.grid-card-prof')?.textContent || '';

    const trayBlock = convertToTrayBlock(subject, professor, section);
    blocksContainer.appendChild(trayBlock);

    card.remove();
    global.isDirty = true;

    const emptyMsg = document.getElementById('no-blocks-msg');
    if (emptyMsg) emptyMsg.remove();

    updateBlockCount();
  }
  global.deleteGridCardRef = deleteGridCardRef;

  /**
   * Clears all cards from the grid.
   */
  function resetTableToDefault() {
    document.querySelectorAll('.grid-day-column').forEach(col => {
      col.innerHTML = '';
    });
    updateBlockCount();
  }
  global.resetTableToDefault = resetTableToDefault;

  /**
   * Saves current grid schedule to the backend database.
   * @returns {Promise<boolean>}
   */
  async function saveCurrentSchedule() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleData = [];
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = urlParams.get('room') || '204';

    for (let day of days) {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) continue;

      const cards = col.querySelectorAll('.grid-card');
      for (let card of cards) {
        const subject = card.querySelector('.grid-card-title')?.textContent || '';
        const section = (card.querySelector('.grid-card-section')?.textContent || '').replace('Sec: ', '');
        const professor = card.querySelector('.grid-card-prof')?.textContent || '';

        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);

        const startTime = global.slotsToTime ? global.slotsToTime(startSlot) : '08:00';
        const endTime = global.slotsToTime ? global.slotsToTime(endSlot) : '10:00';
        const colorTheme = card.dataset.color || 'Default';

        scheduleData.push({
          subject,
          professor,
          section,
          startTime,
          endTime,
          day,
          colorTheme
        });
      }
    }

    const academicYear = getSelectedAcademicYear();
    const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';

    if (global.scheduleService && typeof global.scheduleService.saveRoomSchedule === 'function') {
      await global.scheduleService.saveRoomSchedule(roomNum, scheduleData, academicYear, semester);
    } else {
      const res = await fetch('/api/schedules/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          roomNumber: roomNum,
          schedules: scheduleData,
          academicYear,
          semester
        })
      });
      if (!res.ok) throw new Error('Save API response not OK');
    }

    global.isDirty = false;
    return true;
  }
  global.saveCurrentSchedule = saveCurrentSchedule;

  /**
   * Loads professors for the professor selector and ghost schedules.
   */
  async function loadProfessors() {
    try {
      let professors = [];
      if (global.scheduleService && typeof global.scheduleService.getFaculty === 'function') {
        professors = await global.scheduleService.getFaculty();
      } else {
        const res = await fetch('/api/faculty', { credentials: 'include' });
        if (res.ok) professors = await res.json();
      }

      const wrapper = document.getElementById('professor-wrapper');
      if (!wrapper) return;
      const dropdown = wrapper.querySelector('.custom-select-dropdown');
      const triggerText = wrapper.querySelector('.custom-select-trigger span');

      if (dropdown) dropdown.innerHTML = '';
      wrapper.dataset.value = '';
      if (triggerText) {
        triggerText.textContent = 'Select Professor';
        triggerText.style.color = '#94A3B8';
      }

      professors.forEach(prof => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = prof.Name;
        opt.textContent = prof.Name;
        if (dropdown) dropdown.appendChild(opt);
      });

      if (global.initCustomSelect) {
        global.initCustomSelect('professor-wrapper', (val) => {
          if (val) {
            if (triggerText) triggerText.style.color = 'var(--text-dark)';
            const academicYear = getSelectedAcademicYear();
            const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
            const urlParams = new URLSearchParams(window.location.search);
            const roomNum = urlParams.get('room') || '204';
            if (global.loadProfessorGhostSchedule) {
              global.loadProfessorGhostSchedule(val, academicYear, semester, roomNum);
            }
          } else {
            if (triggerText) triggerText.style.color = '#94A3B8';
            if (global.clearGhostBlocks) global.clearGhostBlocks();
          }
        });
      }
    } catch (err) {
      console.error('Error loading professors:', err);
    }
  }

  /**
   * Loads curriculum subjects for the quick autocomplete dropdown.
   */
  async function loadCurriculumSubjects() {
    const subjectWrapper = document.getElementById('subject-select-dropdown');
    try {
      let subjects = [];
      if (global.curriculumService && typeof global.curriculumService.getCurriculum === 'function') {
        subjects = await global.curriculumService.getCurriculum();
      } else {
        const res = await fetch('/api/curriculum', { credentials: 'include' });
        if (res.ok) subjects = await res.json();
      }

      if (subjectWrapper) {
        subjectWrapper.innerHTML = '';
        if (subjects.length === 0) {
          subjectWrapper.innerHTML = '<div style="padding: 10px 14px; font-size: 13px; color: #94A3B8;">No imported curriculum found. Type manually.</div>';
          return;
        }

        subjects.forEach(s => {
          const item = document.createElement('div');
          const fullLabel = s.Subject_Code ? `${s.Subject_Code} - ${s.Subject_Name}` : s.Subject_Name;
          item.className = 'custom-select-option';
          item.style.cssText = 'padding: 10px 14px; font-size: 13px; cursor: pointer; border-bottom: 1px solid var(--border-light); color: var(--text-dark);';
          item.textContent = fullLabel;
          item.onmouseover = () => {
            item.style.background = 'var(--primary-teal-light)';
            item.style.color = 'var(--primary-teal)';
          };
          item.onmouseout = () => {
            item.style.background = 'transparent';
            item.style.color = 'var(--text-dark)';
          };
          item.onclick = (e) => {
            e.stopPropagation();
            const input = document.getElementById('block-subject');
            if (input) input.value = fullLabel;
            subjectWrapper.style.display = 'none';
          };
          subjectWrapper.appendChild(item);
        });
      }
    } catch (err) {
      console.error('Error loading curriculum subjects:', err);
    }
  }

  /**
   * Fetches and loads existing saved schedule cards for the current room into the grid.
   */
  async function loadRoomSchedule() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = urlParams.get('room') || '204';
    const academicYear = getSelectedAcademicYear();
    const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';

    try {
      let schedules = [];
      if (global.scheduleService && typeof global.scheduleService.getRoomSchedule === 'function') {
        schedules = await global.scheduleService.getRoomSchedule(roomNum, academicYear, semester);
      } else {
        const res = await fetch(`/api/schedules/room/${encodeURIComponent(roomNum)}?academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, { credentials: 'include' });
        if (res.ok) schedules = await res.json();
      }

      resetTableToDefault();

      const selectedProf = document.getElementById('professor-wrapper')?.dataset.value;
      if (!Array.isArray(schedules) || schedules.length === 0) {
        global.isDirty = false;
        if (selectedProf && global.loadProfessorGhostSchedule) {
          global.loadProfessorGhostSchedule(selectedProf, academicYear, semester, roomNum);
        }
        return;
      }

      schedules.forEach(s => {
        const day = s.Day_of_Week;
        const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
        if (!col) return;

        const start = (s.Start_Time || '').substring(0, 5);
        const end = (s.End_Time || '').substring(0, 5);

        if (global.createGridCard) {
          const card = global.createGridCard(
            s.Schedule_ID,
            s.Subject_Name,
            s.ProfessorName || s.Professor_Name || 'Not specified',
            s.Section,
            start,
            end,
            s.Color_Theme || 'Default'
          );
          col.appendChild(card);
        }
      });

      if (selectedProf && global.loadProfessorGhostSchedule) {
        global.loadProfessorGhostSchedule(selectedProf, academicYear, semester, roomNum);
      }

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
      global.isDirty = false;
    } catch (err) {
      console.error('Error loading schedule:', err);
    }
  }
  global.loadRoomSchedule = loadRoomSchedule;

  /**
   * Prepares draft print payload and opens single room print preview in a new tab.
   */
  function preparePrint() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = urlParams.get('room') || '204';
    const bldgName = urlParams.get('bldg') || 'Building B';

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleData = [];

    days.forEach(day => {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) return;
      const cards = col.querySelectorAll('.grid-card');
      cards.forEach(card => {
        const subject = card.querySelector('.grid-card-title')?.textContent || '';
        const section = (card.querySelector('.grid-card-section')?.textContent || '').replace('Sec: ', '');
        const professor = card.querySelector('.grid-card-prof')?.textContent || '';

        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);

        const startTime = global.slotsToTime ? global.slotsToTime(startSlot) : '08:00';
        const endTime = global.slotsToTime ? global.slotsToTime(endSlot) : '10:00';

        scheduleData.push({
          day,
          startTime,
          endTime,
          subject,
          professor,
          section
        });
      });
    });

    const academicYear = getSelectedAcademicYear();
    const semester = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';

    const printPayload = {
      roomNum,
      bldgName,
      scheduleData
    };
    localStorage.setItem('print_schedule_data', JSON.stringify(printPayload));

    window.open(`print-schedule.html?room=${roomNum}&bldg=${encodeURIComponent(bldgName)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, '_blank');
  }
  global.preparePrint = preparePrint;

  /**
   * Opens card detail & color customization modal.
   * @param {HTMLElement} card
   */
  function openCardDetailModal(card) {
    activeEditingCard = card;
    const detailModal = document.getElementById('card-detail-modal');
    if (!detailModal) return;

    const modalTitle = document.getElementById('modal-card-title');
    const modalSection = document.getElementById('modal-card-section');
    const modalProf = document.getElementById('modal-card-prof');
    const modalTime = document.getElementById('modal-card-time');
    const modalEditActions = document.getElementById('modal-edit-actions');
    const modalColorPicker = document.getElementById('modal-color-picker');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');

    const subject = card.querySelector('.grid-card-title')?.textContent || '';
    const section = (card.querySelector('.grid-card-section')?.textContent || '').replace('Sec: ', '');
    const professor = card.querySelector('.grid-card-prof')?.textContent || '';
    const timeLabel = card.querySelector('.grid-card-time')?.textContent || '';

    if (modalTitle) modalTitle.textContent = subject;
    if (modalSection) modalSection.textContent = section;
    if (modalProf) modalProf.textContent = professor;
    if (modalTime) modalTime.textContent = timeLabel;

    if (modalColorPicker) modalColorPicker.innerHTML = '';

    const isCurrentViewMode = document.body.classList.contains('view-mode');

    if (isCurrentViewMode) {
      if (modalEditActions) modalEditActions.style.display = 'none';
      if (modalDeleteBtn) modalDeleteBtn.style.display = 'none';
      if (modalSaveBtn) modalSaveBtn.textContent = 'Close';
    } else {
      if (modalEditActions) modalEditActions.style.display = 'block';
      if (modalDeleteBtn) modalDeleteBtn.style.display = 'inline-flex';
      if (modalSaveBtn) modalSaveBtn.textContent = 'Done';

      const currentColor = card.dataset.color || 'Default';
      const palettes = global.COLOR_PALETTES || {};

      Object.keys(palettes).forEach(themeName => {
        const dot = document.createElement('button');
        dot.className = 'color-dot';
        const paletteItem = palettes[themeName];
        const accentColor = paletteItem.light ? paletteItem.light.accent : paletteItem.accent;
        dot.style.backgroundColor = accentColor;
        dot.style.border = themeName === currentColor ? '3px solid #0F172A' : '1.5px solid rgba(15, 23, 42, 0.15)';
        dot.title = paletteItem.label || themeName;

        dot.addEventListener('click', () => {
          if (global.applyCardColor) {
            global.applyCardColor(card, themeName);
          }
          global.isDirty = true;
          modalColorPicker.querySelectorAll('.color-dot, .color-wheel-btn').forEach(el => {
            el.style.border = '1.5px solid rgba(15, 23, 42, 0.15)';
          });
          dot.style.border = '3px solid #0F172A';
        });

        if (modalColorPicker) modalColorPicker.appendChild(dot);
      });

      // Custom Color Wheel Picker Button
      const customWheelWrapper = document.createElement('div');
      customWheelWrapper.className = 'color-wheel-btn';
      customWheelWrapper.title = 'Custom Color Wheel';
      const isCustomColor = currentColor.startsWith('#');
      if (isCustomColor) customWheelWrapper.classList.add('selected-theme');

      customWheelWrapper.innerHTML = `<i data-lucide="palette" style="width: 11px; height: 11px; color: #475569; pointer-events: none;"></i>`;

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = isCustomColor ? currentColor : '#1EBBD7';

      const applyCustom = (hexVal) => {
        if (global.applyCardColor) {
          global.applyCardColor(card, hexVal);
        }
        global.isDirty = true;
        modalColorPicker.querySelectorAll('.color-dot, .color-wheel-btn').forEach(el => {
          el.style.border = '1.5px solid rgba(15, 23, 42, 0.15)';
          el.classList.remove('selected-theme');
        });
        customWheelWrapper.classList.add('selected-theme');
      };

      colorInput.addEventListener('input', (e) => applyCustom(e.target.value));
      colorInput.addEventListener('change', (e) => applyCustom(e.target.value));

      customWheelWrapper.appendChild(colorInput);
      if (modalColorPicker) modalColorPicker.appendChild(customWheelWrapper);
    }

    detailModal.style.display = 'flex';
    setTimeout(() => {
      detailModal.classList.add('active');
    }, 10);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: detailModal });
    }
  }
  global.openCardDetailModal = openCardDetailModal;

  /**
   * Initializes the Room Schedule Editor page.
   */
  function initEditor() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = urlParams.get('room') || '204';
    const bldgName = urlParams.get('bldg') || 'Building B';
    const currentYear = new Date().getFullYear();
    const initialAY = urlParams.get('academicYear') || `${currentYear}-${currentYear + 1}`;
    const initialSem = urlParams.get('semester') || '1st Semester';

    const headerLeftH1 = document.querySelector('.seh-left h1');
    const headerLeftP = document.querySelector('.seh-left p');
    if (headerLeftH1) headerLeftH1.textContent = `Room ${roomNum} Schedule`;
    if (headerLeftP) headerLeftP.textContent = bldgName;

    const printRoomTitle = document.getElementById('print-room-title');
    if (printRoomTitle) {
      printRoomTitle.textContent = `${bldgName.toUpperCase()} RM ${roomNum}`;
    }

    if (global.populateCustomYearSelectors) {
      global.populateCustomYearSelectors('academic-year-wrapper', initialAY, () => {
        loadRoomSchedule();
      });
    }

    if (global.initCustomSelect) {
      global.initCustomSelect('semester-wrapper', () => {
        loadRoomSchedule();
      });
    }

    if (initialSem && global.setCustomSelectValue) {
      global.setCustomSelectValue('semester-wrapper', initialSem);
    }

    // Grid layout styling
    const slotHeight = window.innerWidth <= 768 ? 30 : 45;
    const gridBody = document.querySelector('.calendar-grid-body');
    if (gridBody) {
      gridBody.style.height = `${24 * slotHeight}px`;
    }
    document.querySelectorAll('.grid-day-column').forEach(col => {
      col.style.backgroundSize = `100% ${slotHeight}px`;
      col.style.backgroundImage = `linear-gradient(to bottom, transparent ${slotHeight - 1}px, rgba(226, 232, 240, 0.4) ${slotHeight - 1}px, rgba(226, 232, 240, 0.4) ${slotHeight}px)`;
    });
    document.querySelectorAll('.grid-time-label').forEach((label, idx) => {
      label.style.top = `${idx * slotHeight}px`;
      label.style.height = `${slotHeight}px`;
    });

    const blocksContainer = document.getElementById('blocks-container');
    const dayColumns = document.querySelectorAll('.grid-day-column');

    // Attach drag and drop
    if (global.scheduleDragDrop) {
      if (typeof global.scheduleDragDrop.initDayColumnDropZones === 'function') {
        global.scheduleDragDrop.initDayColumnDropZones(dayColumns, blocksContainer);
      }
      if (typeof global.scheduleDragDrop.initTrayDropZone === 'function') {
        global.scheduleDragDrop.initTrayDropZone(blocksContainer);
      }
      if (typeof global.scheduleDragDrop.initTouchDragAndDrop === 'function') {
        global.scheduleDragDrop.initTouchDragAndDrop(blocksContainer);
      }
    }

    // Create block button
    const createBtn = document.getElementById('create-block-btn');
    const subjectSelect = document.getElementById('block-subject');
    const professorSelect = document.getElementById('professor-wrapper');
    const sectionSelect = document.getElementById('block-section');

    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const subject = subjectSelect ? subjectSelect.value : '';
        const professor = professorSelect ? (professorSelect.dataset.value || '') : '';
        const section = sectionSelect ? sectionSelect.value : '';

        if (!subject || !professor || !section) {
          alert('Please select Subject, Professor, and Section to create a block.');
          return;
        }

        global.isDirty = true;
        const emptyMsg = document.getElementById('no-blocks-msg');
        if (emptyMsg) emptyMsg.remove();

        const block = convertToTrayBlock(subject, professor, section);
        if (blocksContainer) blocksContainer.appendChild(block);
        updateBlockCount();

        if (subjectSelect) subjectSelect.value = '';
        if (global.setCustomSelectValue) global.setCustomSelectValue('professor-wrapper', '');
        if (global.clearGhostBlocks) global.clearGhostBlocks();
        const triggerText = professorSelect ? professorSelect.querySelector('.custom-select-trigger span') : null;
        if (triggerText) {
          triggerText.textContent = 'Select Professor';
          triggerText.style.color = '#94A3B8';
        }
        if (sectionSelect) sectionSelect.value = '';
      });
    }

    // Subject input search autocomplete
    const blockSubjectInput = document.getElementById('block-subject');
    if (blockSubjectInput) {
      blockSubjectInput.addEventListener('input', () => {
        const filter = blockSubjectInput.value.toLowerCase().trim();
        const dropdown = document.getElementById('subject-select-dropdown');
        if (!dropdown) return;

        const items = dropdown.querySelectorAll('.custom-select-option');
        let matchCount = 0;
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          if (!filter || text.includes(filter)) {
            item.style.display = 'block';
            matchCount++;
          } else {
            item.style.display = 'none';
          }
        });
        dropdown.style.display = matchCount > 0 ? 'block' : 'none';
      });
    }

    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('subject-select-dropdown');
      const input = document.getElementById('block-subject');
      if (dropdown && input && !dropdown.contains(e.target) && e.target !== input) {
        dropdown.style.display = 'none';
      }
    });

    // Save schedule / Edit mode button
    const saveBtn = document.getElementById('save-schedule-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (!isViewMode) {
          try {
            const saved = await saveCurrentSchedule();
            if (!saved) return;
          } catch (e) {
            console.error('Failed to save', e);
            alert('Failed to save the schedule. Please try again.');
            return;
          }
          isViewMode = true;
          document.body.classList.add('view-mode');
          saveBtn.innerHTML = '<i data-lucide="edit-2" style="width: 20px; height: 20px;"></i> Edit Schedule';
          document.querySelectorAll('.schedule-block').forEach(b => b.draggable = false);
          document.querySelectorAll('.grid-card').forEach(b => b.draggable = false);
        } else {
          isViewMode = false;
          document.body.classList.remove('view-mode');
          saveBtn.innerHTML = '<i data-lucide="save" style="width: 20px; height: 20px;"></i> Save Schedule';
          document.querySelectorAll('.schedule-block').forEach(b => b.draggable = true);
          document.querySelectorAll('.grid-card').forEach(b => b.draggable = true);
        }
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: saveBtn });
        }
      });
    }

    // Unsaved changes confirmation modal logic
    const backBtn = document.getElementById('editor-back-btn');
    const confirmModal = document.getElementById('unsavedChangesModal');
    const cancelConfirmBtn = document.getElementById('confirm-cancel-btn');
    const discardConfirmBtn = document.getElementById('confirm-discard-btn');
    const saveConfirmBtn = document.getElementById('confirm-save-btn');

    if (backBtn && confirmModal) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (global.isDirty) {
          global.pendingAction = () => {
            window.location.href = 'master-schedule.html';
          };
          confirmModal.style.display = 'flex';
          setTimeout(() => {
            confirmModal.classList.add('active');
          }, 10);
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: confirmModal });
          }
        } else {
          window.location.href = 'master-schedule.html';
        }
      });

      const hideModal = () => {
        confirmModal.classList.remove('active');
        setTimeout(() => {
          confirmModal.style.display = 'none';
        }, 300);
      };

      if (cancelConfirmBtn) {
        cancelConfirmBtn.addEventListener('click', () => {
          hideModal();
          if (global.revertSelectCallback) {
            global.revertSelectCallback();
            global.revertSelectCallback = null;
          }
          global.pendingAction = null;
        });
      }

      if (discardConfirmBtn) {
        discardConfirmBtn.addEventListener('click', () => {
          global.isDirty = false;
          hideModal();
          global.revertSelectCallback = null;
          if (global.pendingAction) {
            global.pendingAction();
            global.pendingAction = null;
          }
        });
      }

      if (saveConfirmBtn) {
        saveConfirmBtn.addEventListener('click', async () => {
          try {
            const originalHtml = saveConfirmBtn.innerHTML;
            saveConfirmBtn.innerHTML = '<i class="animate-spin" data-lucide="loader-2" style="width:16px;height:16px;margin-right:8px;"></i> Saving...';
            if (global.lucide && typeof global.lucide.createIcons === 'function') {
              global.lucide.createIcons({ root: saveConfirmBtn });
            }

            const saved = await saveCurrentSchedule();
            if (saved) {
              global.isDirty = false;
              hideModal();
              global.revertSelectCallback = null;
              if (global.pendingAction) {
                global.pendingAction();
                global.pendingAction = null;
              }
            } else {
              saveConfirmBtn.innerHTML = originalHtml;
              if (global.lucide && typeof global.lucide.createIcons === 'function') {
                global.lucide.createIcons({ root: saveConfirmBtn });
              }
            }
          } catch (e) {
            console.error('Failed to save', e);
            alert('An error occurred while saving the schedule.');
            saveConfirmBtn.innerHTML = 'Save & Leave';
            if (global.lucide && typeof global.lucide.createIcons === 'function') {
              global.lucide.createIcons({ root: saveConfirmBtn });
            }
          }
        });
      }
    }

    // Card Detail Modal close/delete handlers
    const detailModal = document.getElementById('card-detail-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');

    const hideDetailModal = () => {
      if (detailModal) {
        detailModal.classList.remove('active');
        setTimeout(() => {
          detailModal.style.display = 'none';
        }, 300);
      }
      activeEditingCard = null;
    };

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', hideDetailModal);
    if (modalSaveBtn) modalSaveBtn.addEventListener('click', hideDetailModal);
    if (modalDeleteBtn) {
      modalDeleteBtn.addEventListener('click', () => {
        if (activeEditingCard) {
          deleteGridCardRef(activeEditingCard);
          hideDetailModal();
        }
      });
    }

    // Load initial data
    loadProfessors();
    loadCurriculumSubjects();
    loadRoomSchedule();
  }

  const scheduleEditor = {
    initEditor,
    loadRoomSchedule,
    saveCurrentSchedule,
    preparePrint,
    openCardDetailModal,
    convertToTrayBlock,
    deleteBlock,
    deleteGridCardRef,
    updateBlockCount,
    resetTableToDefault
  };

  global.scheduleEditor = scheduleEditor;
  global.initRoomScheduleEditor = initEditor;

})(typeof window !== 'undefined' ? window : this);
