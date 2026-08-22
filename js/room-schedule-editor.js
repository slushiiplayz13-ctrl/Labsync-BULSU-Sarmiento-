/**
 * LabSync – Room Schedule Editor Bootstrap | js/room-schedule-editor.js
 * Refactored in Phase 2 (Scheduling Architecture Refactor)
 * Modularized into:
 *   - js/scheduling/time-utils.js
 *   - js/scheduling/colors.js
 *   - js/scheduling/conflicts.js
 *   - js/scheduling/grid.js
 *   - js/scheduling/dragdrop.js
 *   - js/scheduling/editor.js
 *   - js/services/schedule.service.js
 */

(function (global) {
  'use strict';

  let _editorInitialized = false;

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

  function bootstrap() {
    if (_editorInitialized) return;
    _editorInitialized = true;

    initSidebarScrollClue();

    if (global.scheduleEditor && typeof global.scheduleEditor.initEditor === 'function') {
      global.scheduleEditor.initEditor();
    } else if (typeof global.initRoomScheduleEditor === 'function') {
      global.initRoomScheduleEditor();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  global.initRoomScheduleEditorPage = bootstrap;

})(typeof window !== 'undefined' ? window : this);
