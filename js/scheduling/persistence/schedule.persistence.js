/**
 * LabSync Schedule Persistence Layer | js/scheduling/persistence/schedule.persistence.js
 * Handles loading, saving, resetting, and API persistence of room schedules, faculty, and curriculum subjects.
 */

(function (global) {
  'use strict';

  /**
   * Clears all schedule cards from the timetable grid.
   */
  function resetTableToDefault() {
    document.querySelectorAll('.grid-day-column').forEach(col => {
      col.innerHTML = '';
    });
    const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
    if (updateCountFn) updateCountFn();
  }

  /**
   * Deletes a card from the grid and converts it back into an available tray block.
   * @param {HTMLElement} card
   */
  function deleteGridCardRef(card) {
    if (document.body.classList.contains('view-mode') || !card) return;
    const blocksContainer = document.getElementById('blocks-container');
    if (!blocksContainer) return;

    const subject = card.querySelector('.grid-card-title')?.textContent.trim() || '';
    const section = (card.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/, '').trim();
    const professor = card.querySelector('.grid-card-prof')?.textContent.trim() || '';

    const convertBlockFn = (global.trayBlockRenderer && global.trayBlockRenderer.convertToTrayBlock) || global.convertToTrayBlock;
    if (convertBlockFn) {
      const trayBlock = convertBlockFn(subject, professor, section);
      blocksContainer.appendChild(trayBlock);
    }

    card.remove();
    if (global.scheduleState) {
      if (typeof global.scheduleState.updateSaveButtonState === 'function') {
        global.scheduleState.updateSaveButtonState();
      } else {
        global.scheduleState.isDirty = true;
      }
    }
    global.isDirty = true;

    const emptyMsg = document.getElementById('no-blocks-msg');
    if (emptyMsg) emptyMsg.remove();

    const updateCountFn = (global.trayBlockRenderer && global.trayBlockRenderer.updateBlockCount) || global.updateBlockCount;
    if (updateCountFn) updateCountFn();
  }

  /**
   * Fetches and loads existing saved schedule cards for the current room into the grid.
   */
  async function loadRoomSchedule() {
    const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
    const roomNum = context.roomNumber || '204';
    const academicYear = context.academicYear;
    const semester = context.semester;

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
        if (global.scheduleState && typeof global.scheduleState.setBaseline === 'function') {
          global.scheduleState.setBaseline();
        } else {
          if (global.scheduleState) global.scheduleState.isDirty = false;
          global.isDirty = false;
        }

        const ghostRenderer = global.ghostScheduleRenderer;
        if (selectedProf && ghostRenderer && typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
          ghostRenderer.loadProfessorGhostSchedule(selectedProf, academicYear, semester, roomNum);
        }
        return;
      }

      const createCardFn = (global.scheduleCardRenderer && global.scheduleCardRenderer.createGridCard) || global.createGridCard;

      schedules.forEach(s => {
        const day = s.Day_of_Week;
        const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
        if (!col) return;

        const start = (s.Start_Time || '').substring(0, 5);
        const end = (s.End_Time || '').substring(0, 5);

        if (createCardFn) {
          const profName = s.Professor_Name || s.ProfessorName || s.professor || '';
          const card = createCardFn(s.Schedule_ID, s.Subject_Name, profName, s.Section, start, end, s.Color_Theme || 'Default');
          col.appendChild(card);
        }
      });

      if (global.scheduleState && typeof global.scheduleState.setBaseline === 'function') {
        global.scheduleState.setBaseline();
      } else {
        if (global.scheduleState) global.scheduleState.isDirty = false;
        global.isDirty = false;
      }

      const ghostRenderer = global.ghostScheduleRenderer;
      if (selectedProf && ghostRenderer && typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
        ghostRenderer.loadProfessorGhostSchedule(selectedProf, academicYear, semester, roomNum);
      }
    } catch (err) {
      console.error('[SchedulePersistence] Error loading room schedule:', err);
      if (global.showToast) {
        global.showToast('Failed to load room schedule. Please refresh.', 'error');
      }
    }
  }

  /**
   * Saves current grid schedule to the backend database.
   * @returns {Promise<boolean>}
   */
  async function saveCurrentSchedule() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleData = [];
    const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
    const roomNum = context.roomNumber || '204';
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};

    for (let day of days) {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) continue;

      const cards = col.querySelectorAll('.grid-card');
      for (let card of cards) {
        const subject = card.querySelector('.grid-card-title')?.textContent.trim() || '';
        const section = (card.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/, '').trim();
        const professor = card.querySelector('.grid-card-prof')?.textContent.trim() || '';

        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);

        const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(startSlot) : '08:00';
        const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(endSlot) : '10:00';
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

    const academicYear = context.academicYear;
    const semester = context.semester;

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

    if (global.scheduleState && typeof global.scheduleState.setBaseline === 'function') {
      global.scheduleState.setBaseline();
    } else {
      if (global.scheduleState) global.scheduleState.isDirty = false;
      global.isDirty = false;
    }
    return true;
  }

  /**
   * Loads professors for the professor selector dropdown and ghost schedules.
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
            const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
            const ghostRenderer = global.ghostScheduleRenderer;
            if (ghostRenderer && typeof ghostRenderer.loadProfessorGhostSchedule === 'function') {
              ghostRenderer.loadProfessorGhostSchedule(val, context.academicYear, context.semester, context.roomNumber);
            }
          } else {
            if (triggerText) triggerText.style.color = '#94A3B8';
            const ghostRenderer = global.ghostScheduleRenderer;
            if (ghostRenderer && typeof ghostRenderer.clearGhostBlocks === 'function') {
              ghostRenderer.clearGhostBlocks();
            }
          }
        });
      }
    } catch (err) {
      console.error('[SchedulePersistence] Error loading professors:', err);
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
          item.dataset.value = fullLabel;
          item.textContent = fullLabel;
          item.onclick = (e) => {
            e.stopPropagation();
            const input = document.getElementById('block-subject');
            if (input) input.value = fullLabel;

            const wrapper = document.getElementById('subject-wrapper');
            if (wrapper) wrapper.classList.remove('open');

            const options = subjectWrapper.querySelectorAll('.custom-select-option');
            options.forEach(o => o.classList.remove('selected'));
            item.classList.add('selected');
          };
          subjectWrapper.appendChild(item);
        });
      }
    } catch (err) {
      console.error('[SchedulePersistence] Error loading curriculum subjects:', err);
    }
  }

  const schedulePersistence = {
    resetTableToDefault,
    deleteGridCardRef,
    loadRoomSchedule,
    saveCurrentSchedule,
    loadProfessors,
    loadCurriculumSubjects
  };

  global.schedulePersistence = schedulePersistence;
  global.loadRoomSchedule = loadRoomSchedule;
  global.saveCurrentSchedule = saveCurrentSchedule;
  global.resetTableToDefault = resetTableToDefault;
  global.deleteGridCardRef = deleteGridCardRef;

})(typeof window !== 'undefined' ? window : this);
