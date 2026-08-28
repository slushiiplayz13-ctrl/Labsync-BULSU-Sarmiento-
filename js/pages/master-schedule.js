/**
 * LabSync Master Schedule Coordinator | js/pages/master-schedule.js
 * Thin compatibility facade coordinating modular master schedule subsystems:
 *   - js/master-schedule/rooms/room.modal.js
 *   - js/master-schedule/rooms/room.renderer.js
 *   - js/master-schedule/rooms/room.controller.js
 *   - js/master-schedule/curriculum/curriculum-import.modal.js
 *   - js/master-schedule/modals/download-schedule.modal.js
 *   - js/master-schedule/modals/signature-settings.modal.js
 *   - js/master-schedule/master-schedule.controller.js
 */

(function (global) {
  'use strict';

  global.loadRooms = () => {
    if (global.roomController && typeof global.roomController.loadRooms === 'function') {
      return global.roomController.loadRooms();
    }
  };

  global.deleteRoom = (roomId, roomNum) => {
    if (global.roomController && typeof global.roomController.showDeleteRoomConfirmation === 'function') {
      return global.roomController.showDeleteRoomConfirmation(roomId, roomNum);
    }
  };

  global.initMasterSchedulePage = () => {
    if (global.masterScheduleController && typeof global.masterScheduleController.initMasterSchedulePage === 'function') {
      return global.masterScheduleController.initMasterSchedulePage();
    }
  };

})(typeof window !== 'undefined' ? window : this);
