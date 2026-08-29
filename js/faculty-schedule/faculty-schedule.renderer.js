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

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_SHORT_NAMES = {
    'Monday': 'MON',
    'Tuesday': 'TUE',
    'Wednesday': 'WED',
    'Thursday': 'THU',
    'Friday': 'FRI',
    'Saturday': 'SAT'
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

    let html = `
      <!-- Top Filter & Legend Toolbar -->
      <div class="schedule-filter-bar">
        <div class="sf-left">
          <span class="sf-badge"><i data-lucide="layers"></i> ${totalClasses} Class${totalClasses === 1 ? '' : 'es'} Scheduled</span>
        </div>
        <div class="schedule-legend">
          <span class="sl-title">SUBJECTS:</span>
          <div class="sl-item active" data-filter="all"><div class="dot all-dot"></div> All</div>
          ${Array.from(subjectMap.entries()).map(([subjName, palette]) => {
            const subjCode = subjName.includes(' - ') ? subjName.split(' - ')[0].trim() : subjName;
            return `
            <div class="sl-item" data-filter="${escapeHtml(subjName)}" title="${escapeHtml(subjName)}">
              <div class="dot" style="background: ${palette.dot}; box-shadow: 0 0 0 3px ${palette.dot}33;"></div> ${escapeHtml(subjCode)}
            </div>
          `;
          }).join('')}
        </div>
      </div>

      <!-- Schedule Day Columns -->
      <div class="schedule-columns">
    `;

    DAYS.forEach(day => {
      const isToday = day === todayName;
      const dayScheds = (schedules || []).filter(s => s.Day_of_Week === day);
      dayScheds.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

      const isEmpty = dayScheds.length === 0;
      html += `
        <div class="day-column ${isToday ? 'highlight-day' : ''} ${isEmpty ? 'empty-day' : ''}">
          <div class="day-header">
            <span>${DAY_SHORT_NAMES[day]}</span>
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
