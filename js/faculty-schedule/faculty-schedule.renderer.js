/**
 * LabSync Faculty Schedule Renderer | js/faculty-schedule/faculty-schedule.renderer.js
 * Generates HTML components for faculty timetable columns, schedule cards, and interactive legend items.
 */

(function (global) {
  'use strict';

  function formatTime(timeStr) {
    const timeUtils = global.timeUtils || global.scheduleTimeUtils;
    if (timeUtils && typeof timeUtils.formatTime12 === 'function') {
      return timeUtils.formatTime12(timeStr);
    }
    if (typeof global.formatTime12 === 'function') return global.formatTime12(timeStr);
    return timeStr || '';
  }

  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT_NAMES = {
    'Monday': 'Mon',
    'Tuesday': 'Tue',
    'Wednesday': 'Wed',
    'Thursday': 'Thu',
    'Friday': 'Fri',
    'Saturday': 'Sat',
    'Sunday': 'Sun'
  };

  /**
   * Generates the entire faculty timetable layout HTML.
   * @param {Array} schedules
   * @param {Map<string, Object>} subjectMap
   * @returns {string} HTML markup
   */
  function renderFacultyScheduleLayout(schedules, subjectMap) {
    const totalClasses = (schedules || []).length;
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const subjectEntries = Array.from((subjectMap && subjectMap.entries) ? subjectMap.entries() : []);
    const hasSubjects = subjectEntries.length > 0;

    let optionsHtml = '';
    if (hasSubjects) {
      optionsHtml = subjectEntries.map(([subjName, palette]) => {
        const subjCode = subjName.includes(' - ') ? subjName.split(' - ')[0].trim() : subjName;
        const subjDesc = subjName.includes(' - ') ? subjName.split(' - ').slice(1).join(' - ').trim() : '';
        const dotBg = (palette && palette.dot) ? palette.dot : 'var(--primary-teal, #1ebbd7)';
        return `
          <div class="custom-select-option" data-value="${escapeHtml(subjName)}" data-code="${escapeHtml(subjCode)}" role="option" aria-selected="false" title="${escapeHtml(subjName)}">
            <div class="dot" style="background: ${dotBg}; box-shadow: 0 0 0 3px ${dotBg}33;"></div>
            <span class="subject-option-text">${escapeHtml(subjCode)}</span>
            ${subjDesc ? `<span class="subject-option-desc">${escapeHtml(subjDesc)}</span>` : ''}
          </div>
        `;
      }).join('');
    } else {
      optionsHtml = `
        <div class="custom-select-option disabled" data-value="" role="option" aria-disabled="true" style="opacity: 0.6; cursor: default; font-style: italic; pointer-events: none; justify-content: center;">
          <span class="subject-option-text">No subjects available</span>
        </div>
      `;
    }

    const hasSunday = (schedules || []).some(s => (s.Day_of_Week || '').trim().toLowerCase() === 'sunday');
    const daysToRender = hasSunday ? [...DAYS, 'Sunday'] : DAYS;

    let html = `
      <!-- Top Filter & Legend Toolbar -->
      <div class="schedule-filter-bar">
        <div class="sf-left">
          <span class="sf-badge"><i data-lucide="layers"></i> ${totalClasses} Class${totalClasses === 1 ? '' : 'es'} Scheduled</span>
        </div>
        <div class="schedule-legend">
          <span class="sl-title">SUBJECTS:</span>
          <button type="button" class="sl-item active" id="subject-filter-all" data-filter="all" aria-pressed="true">
            <div class="dot all-dot"></div> All
          </button>
          <div class="sl-divider" aria-hidden="true"></div>
          <div class="custom-select-wrapper subject-select-wrapper" id="subject-filter-dropdown-wrapper" data-value="all">
            <button type="button" class="custom-select-trigger subject-select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Filter schedule by subject" title="Filter by subject">
              <span class="subject-trigger-text">Subject</span>
              <i data-lucide="chevron-down" class="subject-chevron"></i>
            </button>
            <div class="custom-select-dropdown subject-select-dropdown" role="listbox" aria-label="Available subjects">
              ${optionsHtml}
            </div>
          </div>
        </div>
      </div>

      <!-- Schedule Day Columns -->
      <div class="schedule-columns" style="--schedule-cols: ${daysToRender.length};">
    `;

    daysToRender.forEach(day => {
      const isToday = day === todayName;
      const dayScheds = (schedules || []).filter(s => s.Day_of_Week === day);
      dayScheds.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

      const isEmpty = dayScheds.length === 0;
      html += `
        <div class="day-column ${isToday ? 'highlight-day' : ''} ${isEmpty ? 'empty-day' : ''}" data-day="${escapeHtml(day)}">
          <div class="day-header ${isToday ? 'has-today' : ''}" title="${escapeHtml(day)}">
            <span class="day-name">
              <span class="day-name-full">${escapeHtml(day)}</span>
              <span class="day-name-short">${escapeHtml(DAY_SHORT_NAMES[day] || day)}</span>
            </span>
            ${isToday ? '<span class="today-tag">TODAY</span>' : ''}
          </div>
          <div class="day-classes">
      `;

      if (isEmpty) {
        html += `
          <div class="empty-day-box">
            <i data-lucide="coffee"></i>
            <span>No classes</span>
          </div>
        `;
      } else {
        dayScheds.forEach(s => {
          const start = formatTime(s.Start_Time);
          const end = formatTime(s.End_Time);
          const subjName = (s.Subject_Name || 'General Subject').trim();
          const palette = subjectMap.get(subjName) || { class: 'subject-webdev', bg: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)', color: '#EFF6FF' };

          html += `
            <div class="sg-cell filled ${palette.class}" data-subject-name="${escapeHtml(subjName)}" style="background: ${palette.bg} !important; color: ${palette.color} !important;">
              <div class="sg-time-badge">
                <i data-lucide="clock"></i> ${start} – ${end}
              </div>
              <div class="sg-main-info">
                <span class="sg-room-badge"><i data-lucide="map-pin"></i> RM ${s.Room_Number || ''}</span>
                <span class="sg-section-badge">${s.Section || ''}</span>
              </div>
              <div class="sg-title">${escapeHtml(subjName)}</div>
            </div>
          `;
        });
      }

      html += `</div></div>`;
    });

    html += `</div>`;
    return html;
  }

  const facultyScheduleRenderer = {
    renderFacultyScheduleLayout,
    formatTime
  };

  global.facultyScheduleRenderer = facultyScheduleRenderer;

})(typeof window !== 'undefined' ? window : this);
