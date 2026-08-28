/**
 * LabSync Schedule Editor Facade | js/scheduling/editor.js
 * Thin compatibility facade coordinating modular scheduling components:
 *   - js/scheduling/state/schedule.state.js
 *   - js/scheduling/persistence/schedule.persistence.js
 *   - js/scheduling/rendering/tray-block.renderer.js
 *   - js/scheduling/rendering/ghost-schedule.renderer.js
 *   - js/scheduling/controller/schedule-editor.controller.js
 */

(function (global) {
  'use strict';

  const scheduleEditor = {
    initEditor() {
      if (global.scheduleEditorController && typeof global.scheduleEditorController.initEditor === 'function') {
        return global.scheduleEditorController.initEditor();
      }
    },
    loadRoomSchedule() {
      if (global.schedulePersistence && typeof global.schedulePersistence.loadRoomSchedule === 'function') {
        return global.schedulePersistence.loadRoomSchedule();
      }
    },
    saveCurrentSchedule() {
      if (global.schedulePersistence && typeof global.schedulePersistence.saveCurrentSchedule === 'function') {
        return global.schedulePersistence.saveCurrentSchedule();
      }
    },
    resetTableToDefault() {
      if (global.schedulePersistence && typeof global.schedulePersistence.resetTableToDefault === 'function') {
        return global.schedulePersistence.resetTableToDefault();
      }
    },
    deleteGridCardRef(card) {
      if (global.schedulePersistence && typeof global.schedulePersistence.deleteGridCardRef === 'function') {
        return global.schedulePersistence.deleteGridCardRef(card);
      }
    },
    convertToTrayBlock(subject, professor, section) {
      if (global.trayBlockRenderer && typeof global.trayBlockRenderer.convertToTrayBlock === 'function') {
        return global.trayBlockRenderer.convertToTrayBlock(subject, professor, section);
      }
    },
    deleteBlock(event, btn) {
      if (global.trayBlockRenderer && typeof global.trayBlockRenderer.deleteBlock === 'function') {
        return global.trayBlockRenderer.deleteBlock(event, btn);
      }
    },
    updateBlockCount() {
      if (global.trayBlockRenderer && typeof global.trayBlockRenderer.updateBlockCount === 'function') {
        return global.trayBlockRenderer.updateBlockCount();
      }
    },
    preparePrint() {
      if (global.scheduleEditorController && typeof global.scheduleEditorController.preparePrint === 'function') {
        return global.scheduleEditorController.preparePrint();
      }
    },
    openCardDetailModal(card) {
      if (global.scheduleEditorController && typeof global.scheduleEditorController.openCardDetailModal === 'function') {
        return global.scheduleEditorController.openCardDetailModal(card);
      }
    },
    closeCardDetailModal() {
      if (global.scheduleEditorController && typeof global.scheduleEditorController.closeCardDetailModal === 'function') {
        return global.scheduleEditorController.closeCardDetailModal();
      }
    },
    showUnsavedChangesModal(action, revertCallback) {
      if (global.scheduleEditorController && typeof global.scheduleEditorController.showUnsavedChangesModal === 'function') {
        return global.scheduleEditorController.showUnsavedChangesModal(action, revertCallback);
      }
    }
  };

  global.scheduleEditor = scheduleEditor;

  // Global backward-compatibility exports
  global.convertToTrayBlock = (s, p, sec) => scheduleEditor.convertToTrayBlock(s, p, sec);
  global.deleteBlock = (e, btn) => scheduleEditor.deleteBlock(e, btn);
  global.updateBlockCount = () => scheduleEditor.updateBlockCount();
  global.deleteGridCardRef = (card) => scheduleEditor.deleteGridCardRef(card);
  global.resetTableToDefault = () => scheduleEditor.resetTableToDefault();
  global.saveCurrentSchedule = () => scheduleEditor.saveCurrentSchedule();
  global.loadRoomSchedule = () => scheduleEditor.loadRoomSchedule();
  global.preparePrint = () => scheduleEditor.preparePrint();
  global.openCardDetailModal = (card) => scheduleEditor.openCardDetailModal(card);
  global.closeCardDetailModal = () => scheduleEditor.closeCardDetailModal();
  global.showUnsavedChangesModal = (a, r) => scheduleEditor.showUnsavedChangesModal(a, r);
  global.initRoomScheduleEditor = () => scheduleEditor.initEditor();

})(typeof window !== 'undefined' ? window : this);
