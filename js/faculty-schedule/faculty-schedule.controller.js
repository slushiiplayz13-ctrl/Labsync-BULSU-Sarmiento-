/**
 * LabSync Faculty Schedule Controller | js/faculty-schedule/faculty-schedule.controller.js
 * Coordinates schedule data fetching, custom select synchronization, and timetable rendering.
 */

(function (global) {
  'use strict';

  let _schedulePageInitialized = false;

  /**
   * Helper to retrieve currently selected Academic Year from UI or defaults.
   * @returns {string}
   */
  function getSelectedAcademicYear() {
    const ayWrapper = document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
    const raw = ayWrapper?.dataset?.value ||
      ayWrapper?.querySelector('.custom-select-option.selected')?.getAttribute('data-value') ||
      ayWrapper?.querySelector('.custom-select-trigger span')?.textContent?.trim()?.replace('–', '-');
    if (raw && raw !== 'Select' && /^\d{4}-\d{4}$/.test(raw)) {
      return raw;
    }
    if (global.AcademicTerm && typeof global.AcademicTerm.getSelectedTerm === 'function') {
      return global.AcademicTerm.getSelectedTerm('my_schedule').academicYear;
    }
    const currentYear = new Date().getFullYear();
    return `${currentYear}-${currentYear + 1}`;
  }

  /**
   * Helper to retrieve currently selected Semester from UI or defaults.
   * @returns {string}
   */
  function getSelectedSemester() {
    const semWrapper = document.getElementById('semester-wrapper');
    const raw = semWrapper?.dataset?.value ||
      semWrapper?.querySelector('.custom-select-option.selected')?.getAttribute('data-value') ||
      semWrapper?.querySelector('.custom-select-trigger span')?.textContent?.trim();
    if (raw && raw !== 'Select') {
      return raw;
    }
    if (global.AcademicTerm && typeof global.AcademicTerm.getSelectedTerm === 'function') {
      return global.AcademicTerm.getSelectedTerm('my_schedule').semester;
    }
    return '1st Semester';
  }

  /**
   * Generates a stable signature for weekly faculty schedules to prevent redundant DOM rewrites.
   * @param {Array} schedules
   * @param {string} [academicYear]
   * @param {string} [semester]
   * @returns {string}
   */
  function createFacultyScheduleSignature(schedules, academicYear, semester) {
    if (!Array.isArray(schedules) || schedules.length === 0) {
      return `__EMPTY__ay_${academicYear || ''}_sem_${semester || ''}`;
    }
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const rows = schedules.map(s => `${s.Schedule_ID || ''}_${s.Day_of_Week || ''}_${s.Start_Time || ''}_${s.End_Time || ''}_${s.Subject_Name || ''}_${s.Room_Number || ''}_${s.Section || ''}`);
    return `sig_${rows.join('|')}__ay_${academicYear || ''}_sem_${semester || ''}_day_${todayName}`;
  }

  /**
   * Canonical faculty schedule renderer with signature diffing.
   * @param {Array} schedules
   * @param {HTMLElement|string} [targetContainer]
   * @param {string} [academicYear]
   * @param {string} [semester]
   */
  function renderFacultySchedule(schedules, targetContainer, academicYear, semester) {
    const container = typeof targetContainer === 'string'
      ? document.querySelector(targetContainer)
      : (targetContainer || document.getElementById('schedule-container'));
    if (!container) return;

    const ay = academicYear || getSelectedAcademicYear();
    const sem = semester || getSelectedSemester();

    const signature = createFacultyScheduleSignature(schedules, ay, sem);
    if (container._lastRenderSignature === signature && container.querySelector('.schedule-columns, .ui-empty-state') !== null) {
      // Unchanged schedule, skip DOM replacement to prevent flicker
      return;
    }
    container._lastRenderSignature = signature;

    if (!Array.isArray(schedules) || schedules.length === 0) {
      container.innerHTML = `
        <div class="ui-empty-state" style="width: 100%; flex: 1; height: 100%; min-height: 280px; display: flex; flex-direction: column; justify-content: center; align-items: center; margin: 0; box-sizing: border-box;">
          <div class="ui-empty-icon" style="background:#E8F9FC; color:#1EBBD7;">
            <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
          </div>
          <p style="font-weight:600; color:var(--text-dark, #1e293b); margin-top:8px; margin-bottom:4px;">No weekly schedule loaded for ${ay} ${sem}</p>
          <p style="font-size:12.5px; color:var(--text-muted, #94a3b8); margin-bottom:0;">Your teaching blocks will appear here when data is synced.</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }
      return;
    }

    const colorsModule = global.facultyScheduleColors;
    const subjectMap = colorsModule && typeof colorsModule.buildSubjectColorMap === 'function'
      ? colorsModule.buildSubjectColorMap(schedules)
      : new Map();

    global.latestUserSchedules = schedules.map(s => {
      const palette = subjectMap.get((s.Subject_Name || 'General Subject').trim());
      return {
        ...s,
        bg: palette ? palette.bg : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
        color: palette ? palette.color : '#FFFFFF'
      };
    });

    const renderer = global.facultyScheduleRenderer;
    if (renderer && typeof renderer.renderFacultyScheduleLayout === 'function') {
      container.innerHTML = renderer.renderFacultyScheduleLayout(schedules, subjectMap);
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: container });
    }

    const filterModule = global.facultyScheduleFilters;
    if (filterModule && typeof filterModule.initLegendFilter === 'function') {
      filterModule.initLegendFilter(container);
    }
  }

  /**
   * Fetches and renders user weekly schedule.
   */
  async function loadUserSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container) return;

    // Only show loading placeholder if container has not been pre-hydrated with valid schedule content
    if (!container._lastRenderSignature) {
      container.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon">
            <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
          </div>
          <p>Loading your schedule...</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }
    }

    try {
      const ay = getSelectedAcademicYear();
      const sem = getSelectedSemester();

      let schedules = [];
      const getUserSchedFn = global.getUserSchedule || (global.scheduleService && global.scheduleService.getUserSchedule);
      if (typeof getUserSchedFn === 'function') {
        schedules = await getUserSchedFn(ay, sem);
      } else {
        const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch schedule');
        schedules = await res.json();
      }

      renderFacultySchedule(schedules, container, ay, sem);
    } catch (err) {
      console.error('[FacultyScheduleController] Error loading user schedule:', err);
    }
  }

  function initSchedulePage() {
    if (_schedulePageInitialized) return;
    _schedulePageInitialized = true;

    const termInfo = (global.AcademicTerm && typeof global.AcademicTerm.getSelectedTerm === 'function')
      ? global.AcademicTerm.getSelectedTerm('my_schedule')
      : { academicYear: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`, semester: '1st Semester' };

    function onFilterChange() {
      const ay = getSelectedAcademicYear();
      const sem = getSelectedSemester();
      if (global.AcademicTerm && typeof global.AcademicTerm.setSelectedTerm === 'function') {
        global.AcademicTerm.setSelectedTerm('my_schedule', ay, sem);
      }
      loadUserSchedule();
    }

    if (global.populateCustomYearSelectors) {
      global.populateCustomYearSelectors('academic-year-wrapper', termInfo.academicYear, onFilterChange);
    }

    if (global.initCustomSelect) {
      global.initCustomSelect('semester-wrapper', onFilterChange);
      if (global.setCustomSelectValue) {
        global.setCustomSelectValue('semester-wrapper', termInfo.semester);
      }
    }

    loadUserSchedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSchedulePage);
  } else {
    initSchedulePage();
  }

  const facultyScheduleController = {
    loadUserSchedule,
    renderFacultySchedule,
    createFacultyScheduleSignature,
    initSchedulePage
  };

  global.facultyScheduleController = facultyScheduleController;
  global.loadUserSchedule = loadUserSchedule;
  global.renderFacultySchedule = renderFacultySchedule;
  global.initSchedulePage = initSchedulePage;

})(typeof window !== 'undefined' ? window : this);
