/**
 * LabSync Master Schedule Page Controller | js/master-schedule/master-schedule.controller.js
 * Coordinates sidebar scrolling clues, year/semester selector initialization, room cards, and feature modals.
 */

(function (global) {
  'use strict';

  let _masterPageInitialized = false;

  function initSidebarScrollClue() {
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');

    if (sidebar && scrollClue) {
      if (sidebar.scrollHeight <= sidebar.clientHeight) {
        scrollClue.style.display = 'none';
      }

      sidebar.addEventListener('scroll', () => {
        if (sidebar.scrollTop > 10) {
          scrollClue.style.opacity = '0';
        } else {
          scrollClue.style.opacity = '1';
        }
      });
    }
  }

  function initMasterSchedulePage() {
    if (_masterPageInitialized) return;
    _masterPageInitialized = true;

    initSidebarScrollClue();

    const roomModals = global.roomModal;
    if (roomModals) {
      if (typeof roomModals.initNumericRestrictions === 'function') roomModals.initNumericRestrictions();
      if (typeof roomModals.initAddRoomModal === 'function') roomModals.initAddRoomModal();
      if (typeof roomModals.initEditRoomModal === 'function') roomModals.initEditRoomModal();
    }

    const roomCtrl = global.roomController;
    if (roomCtrl && typeof roomCtrl.loadRooms === 'function') {
      roomCtrl.loadRooms();
    }

    const downloadModal = global.downloadScheduleModal;
    if (downloadModal && typeof downloadModal.initDownloadModal === 'function') {
      downloadModal.initDownloadModal();
    }

    const sigModal = global.signatureSettingsModal;
    if (sigModal && typeof sigModal.initSignatureSettingsModal === 'function') {
      sigModal.initSignatureSettingsModal();
    }

    const currModal = global.curriculumImportModal;
    if (currModal && typeof currModal.initCurriculumImportModal === 'function') {
      currModal.initCurriculumImportModal();
    }

    const termInfo = (global.AcademicTerm && typeof global.AcademicTerm.getSelectedTerm === 'function')
      ? global.AcademicTerm.getSelectedTerm('master_schedule')
      : { academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, semester: '1st Semester' };
    const defaultAY = termInfo.academicYear;
    const defaultSem = termInfo.semester;

    if (global.populateCustomYearSelectors) {
      global.populateCustomYearSelectors('academic-year-wrapper', defaultAY);
      global.populateCustomYearSelectors('academic-year-start-wrapper', defaultAY);
    }

    if (global.initCustomSelect) {
      global.initCustomSelect('semester-wrapper');
      global.initCustomSelect('building-select-wrapper');
      global.initCustomSelect('edit-building-select-wrapper');
    }

    if (global.setCustomSelectValue) {
      global.setCustomSelectValue('semester-wrapper', defaultSem);
      global.setCustomSelectValue('building-select-wrapper', 'Bldg. B');
      global.setCustomSelectValue('edit-building-select-wrapper', 'Bldg. B');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMasterSchedulePage);
  } else {
    initMasterSchedulePage();
  }

  const masterScheduleController = {
    initMasterSchedulePage
  };

  global.masterScheduleController = masterScheduleController;
  global.initMasterSchedulePage = initMasterSchedulePage;

})(typeof window !== 'undefined' ? window : this);
