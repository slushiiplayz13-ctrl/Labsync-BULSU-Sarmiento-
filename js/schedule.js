/**
 * LabSync Faculty Schedule Facade | js/schedule.js
 * Thin compatibility facade coordinating modular faculty schedule components:
 *   - js/faculty-schedule/faculty-schedule.colors.js
 *   - js/faculty-schedule/faculty-schedule.renderer.js
 *   - js/faculty-schedule/faculty-schedule.filters.js
 *   - js/faculty-schedule/faculty-schedule.controller.js
 */

(function (global) {
  'use strict';

  global.loadUserSchedule = () => {
    if (global.facultyScheduleController && typeof global.facultyScheduleController.loadUserSchedule === 'function') {
      return global.facultyScheduleController.loadUserSchedule();
    }
  };

  global.renderFacultySchedule = (schedules, targetContainer, academicYear, semester) => {
    if (global.facultyScheduleController && typeof global.facultyScheduleController.renderFacultySchedule === 'function') {
      return global.facultyScheduleController.renderFacultySchedule(schedules, targetContainer, academicYear, semester);
    }
  };

  global.initSchedulePage = () => {
    if (global.facultyScheduleController && typeof global.facultyScheduleController.initSchedulePage === 'function') {
      return global.facultyScheduleController.initSchedulePage();
    }
  };

})(typeof window !== 'undefined' ? window : this);
