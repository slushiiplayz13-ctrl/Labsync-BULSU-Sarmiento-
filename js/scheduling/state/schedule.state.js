/**
 * LabSync Scheduling State Store | js/scheduling/state/schedule.state.js
 * Manages editor dirty flag, active editing card, selected room, professor, academic year, and semester.
 */

(function (global) {
  'use strict';

  let blockCounter = 0;
  let activeEditingCard = null;
  let isViewMode = false;
  let pendingAction = null;
  let revertSelectCallback = null;

  function getSelectedAcademicYear() {
    const wrapper = document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
    if (wrapper && wrapper.dataset && wrapper.dataset.value) {
      return wrapper.dataset.value;
    }
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${currentYear + 1}`;
  }

  function getSelectedSemester() {
    const wrapper = document.getElementById('semester-wrapper');
    return (wrapper && wrapper.dataset && wrapper.dataset.value) ? wrapper.dataset.value : '1st Semester';
  }

  function getRoomNumber() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('room') || '204';
  }

  function getSelectedProfessor() {
    const wrapper = document.getElementById('professor-wrapper');
    return (wrapper && wrapper.dataset && wrapper.dataset.value) ? wrapper.dataset.value : '';
  }

  let baselineSnapshot = null;

  function captureScheduleSnapshot() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const items = [];
    days.forEach(day => {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) return;
      const cards = col.querySelectorAll('.grid-card');
      cards.forEach(card => {
        const subject = card.querySelector('.grid-card-title')?.textContent.trim() || '';
        const section = (card.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/i, '').trim();
        const professor = card.querySelector('.grid-card-prof')?.textContent.trim() || '';
        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);
        const colorTheme = card.dataset.color || 'Default';

        items.push({
          day,
          startSlot: isNaN(startSlot) ? 0 : startSlot,
          endSlot: isNaN(endSlot) ? 0 : endSlot,
          subject,
          section,
          professor,
          colorTheme
        });
      });
    });

    items.sort((a, b) => {
      if (a.day !== b.day) return days.indexOf(a.day) - days.indexOf(b.day);
      if (a.startSlot !== b.startSlot) return a.startSlot - b.startSlot;
      if (a.endSlot !== b.endSlot) return a.endSlot - b.endSlot;
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      if (a.section !== b.section) return a.section.localeCompare(b.section);
      if (a.professor !== b.professor) return a.professor.localeCompare(b.professor);
      return a.colorTheme.localeCompare(b.colorTheme);
    });

    return JSON.stringify(items);
  }

  function setBaseline(snapshot) {
    baselineSnapshot = typeof snapshot === 'string' ? snapshot : captureScheduleSnapshot();
    global.isDirty = false;
    updateSaveButtonState();
  }

  function getBaseline() {
    return baselineSnapshot;
  }

  function hasChanges() {
    if (baselineSnapshot === null) return false;
    return captureScheduleSnapshot() !== baselineSnapshot;
  }

  function updateSaveButtonState() {
    const saveBtn = document.getElementById('save-schedule-btn');
    const changed = hasChanges();
    global.isDirty = changed;
    if (!saveBtn) return;
    saveBtn.disabled = !changed;
    if (!changed) {
      saveBtn.setAttribute('disabled', 'true');
    } else {
      saveBtn.removeAttribute('disabled');
    }
  }

  const scheduleState = {
    get isDirty() {
      if (baselineSnapshot !== null) {
        return hasChanges();
      }
      return !!global.isDirty;
    },
    set isDirty(val) {
      global.isDirty = !!val;
      updateSaveButtonState();
    },
    get blockCounter() {
      return blockCounter;
    },
    incrementBlockCounter() {
      return ++blockCounter;
    },
    get activeEditingCard() {
      return activeEditingCard;
    },
    setActiveEditingCard(card) {
      activeEditingCard = card;
    },
    get isViewMode() {
      return isViewMode;
    },
    setIsViewMode(val) {
      isViewMode = !!val;
    },
    get pendingAction() {
      return pendingAction || global.pendingAction;
    },
    setPendingAction(action) {
      pendingAction = action;
      global.pendingAction = action;
    },
    get revertSelectCallback() {
      return revertSelectCallback || global.revertSelectCallback;
    },
    setRevertSelectCallback(cb) {
      revertSelectCallback = cb;
      global.revertSelectCallback = cb;
    },
    getSelectedAcademicYear,
    getSelectedSemester,
    getRoomNumber,
    getSelectedProfessor,
    captureScheduleSnapshot,
    setBaseline,
    getBaseline,
    hasChanges,
    updateSaveButtonState
  };

  // Global bridges
  global.scheduleState = scheduleState;
  global.isDirty = false;
  global.pendingAction = null;
  global.revertSelectCallback = null;
  global.getSelectedAcademicYear = getSelectedAcademicYear;
  global.captureScheduleSnapshot = captureScheduleSnapshot;
  global.setBaseline = setBaseline;
  global.hasChanges = hasChanges;
  global.updateSaveButtonState = updateSaveButtonState;

})(typeof window !== 'undefined' ? window : this);
