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

  const scheduleState = {
    get isDirty() {
      return !!global.isDirty;
    },
    set isDirty(val) {
      global.isDirty = !!val;
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
    getSelectedProfessor
  };

  // Global bridges
  global.scheduleState = scheduleState;
  global.isDirty = false;
  global.pendingAction = null;
  global.revertSelectCallback = null;
  global.getSelectedAcademicYear = getSelectedAcademicYear;

})(typeof window !== 'undefined' ? window : this);
