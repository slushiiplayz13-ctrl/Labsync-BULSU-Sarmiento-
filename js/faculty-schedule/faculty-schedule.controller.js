/**
 * LabSync Faculty Schedule Controller | js/faculty-schedule/faculty-schedule.controller.js
 * Coordinates schedule data fetching, custom select synchronization, and timetable rendering.
 */

(function (global) {
  'use strict';

  let _schedulePageInitialized = false;

  /**
   * Fetches and renders user weekly schedule.
   */
  async function loadUserSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container) return;

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

    try {
      const ayWrapper = document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
      const currentYear = new Date().getFullYear();
      const ay = ayWrapper?.dataset?.value || `${currentYear}-${currentYear + 1}`;
      const sem = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';

      let schedules = [];
      const schedService = global.scheduleService;
      if (schedService && typeof schedService.getUserSchedule === 'function') {
        schedules = await schedService.getUserSchedule(ay, sem);
      } else {
        const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch schedule');
        schedules = await res.json();
      }

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
    } catch (err) {
      console.error('[FacultyScheduleController] Error loading user schedule:', err);
    }
  }

  function initSchedulePage() {
    if (_schedulePageInitialized) return;
    _schedulePageInitialized = true;

    const currentYear = new Date().getFullYear();
    if (global.populateCustomYearSelectors) {
      global.populateCustomYearSelectors('academic-year-wrapper', `${currentYear}-${currentYear + 1}`, () => {
        loadUserSchedule();
      });
    }

    if (global.initCustomSelect) {
      global.initCustomSelect('semester-wrapper', () => {
        loadUserSchedule();
      });
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
    initSchedulePage
  };

  global.facultyScheduleController = facultyScheduleController;
  global.loadUserSchedule = loadUserSchedule;
  global.initSchedulePage = initSchedulePage;

})(typeof window !== 'undefined' ? window : this);
