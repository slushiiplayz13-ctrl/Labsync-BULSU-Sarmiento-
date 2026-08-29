/* ================================================================
   LabSync – Faculty Schedule Modal Component  |  js/components/faculty-schedule-modal.js
   Fetches and renders a professor's weekly laboratory teaching schedule.
   ================================================================ */

'use strict';

(function (global) {
  /**
  /**
   * Formats time string (HH:MM or HH:MM:SS) to 12h AM/PM.
   */
  function formatTime(t) {
    if (!t) return '--';
    if (global.timeUtils && typeof global.timeUtils.formatTime12 === 'function') {
      return global.timeUtils.formatTime12(t);
    }
    if (typeof global.formatTime12 === 'function') return global.formatTime12(t);
    return String(t);
  }

  const facultyScheduleModal = {
    /**
     * Opens modal and loads weekly timetable for the given faculty member.
     * @param {string} profName
     */
    async viewFacultySchedule(profName) {
      if (!profName) return;

      // Remove any existing instance to prevent duplicates
      const existing = document.getElementById('schedule-view-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'schedule-view-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';

      modal.innerHTML = `
        <div class="sched-modal-dialog">
          <div class="sched-modal-header">
            <div>
              <h2 class="sched-modal-title">Faculty Schedule</h2>
              <p class="sched-modal-subtitle">Weekly class assignments for <strong>${escapeHtml(profName)}</strong></p>
            </div>
            <button id="close-sched-modal" class="sched-modal-close-btn" title="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          
          <div id="sched-modal-body" style="padding:24px 28px;overflow-y:auto;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:220px;">
            <div class="sched-spinner" style="border: 3px solid var(--border-light, #E5E7EB); border-top: 3px solid var(--primary-teal, #00b4d8); border-radius: 50%; width: 36px; height: 36px; animation: spin 1s linear infinite; margin-bottom:12px;"></div>
            <span style="font-family:var(--font-body);font-size:13.5px;color:var(--text-muted, #6B7280);">Loading schedule data from all rooms...</span>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      setTimeout(() => {
        modal.style.opacity = '1';
      }, 10);

      const closeModal = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 250);
      };

      const closeBtn = document.getElementById('close-sched-modal');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      try {
        let profSchedules = [];
        const getFacSchedFn = global.getFacultyScheduleByName ||
          (global.scheduleService && global.scheduleService.getFacultyScheduleByName) ||
          (global.facultyService && global.facultyService.getFacultySchedule);

        if (typeof getFacSchedFn === 'function') {
          profSchedules = await getFacSchedFn(profName);
        } else {
          const encodedName = encodeURIComponent(profName);
          const schedRes = await fetch(`/api/schedules/faculty/${encodedName}`);
          if (!schedRes.ok) throw new Error('Failed to load faculty schedule');
          profSchedules = await schedRes.json();
        }

        const body = document.getElementById('sched-modal-body');
        if (!body) return;
        body.style.display = 'block';
        body.style.alignItems = 'initial';
        body.style.justifyContent = 'initial';
        body.innerHTML = '';

        if (!Array.isArray(profSchedules) || profSchedules.length === 0) {
          body.innerHTML = `
            <div class="sched-modal-empty">
              <div class="sched-modal-empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
              </div>
              <h3 class="sched-modal-empty-title">No Active Assignments</h3>
              <p class="sched-modal-empty-desc">This faculty member is not currently assigned to teach in any computer laboratories.</p>
            </div>
          `;
          return;
        }

        const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        profSchedules.sort((a, b) => {
          const dayA = a.day || a.Day_of_Week;
          const dayB = b.day || b.Day_of_Week;
          const indexA = daysOrder.indexOf(dayA);
          const indexB = daysOrder.indexOf(dayB);
          if (indexA !== indexB) return indexA - indexB;
          return (a.startTime || a.Start_Time || '').localeCompare(b.startTime || b.Start_Time || '');
        });

        let html = `<div style="display:flex;flex-direction:column;gap:14px;font-family:var(--font-body);">`;
        let currentDay = '';

        profSchedules.forEach(s => {
          const day = s.day || s.Day_of_Week;
          if (day !== currentDay) {
            currentDay = day;
            html += `<div class="sched-modal-day-divider">${escapeHtml(currentDay)}</div>`;
          }

          const subj = s.subject || s.Subject_Name || 'Class';
          const sec = s.section || s.Section || 'N/A';
          const rm = s.Room_Number || 'TBA';
          const bldg = s.Building || 'Laboratory';
          const start = formatTime(s.startTime || s.Start_Time);
          const end = formatTime(s.endTime || s.End_Time);

          html += `
            <div class="sched-modal-card">
              <div class="sched-card-left">
                <div class="sched-card-subject">${escapeHtml(subj)}</div>
                <div class="sched-card-meta">
                  <span class="sched-meta-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Section: <strong>${escapeHtml(sec)}</strong>
                  </span>
                  <span class="sched-meta-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-map-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
                    ${escapeHtml(bldg)} Rm ${escapeHtml(rm)}
                  </span>
                </div>
              </div>
              <div class="sched-card-right">
                <div class="sched-time-badge">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>${start} – ${end}</span>
                </div>
                <span class="sched-status-pill">Scheduled</span>
              </div>
            </div>
          `;
        });

        html += `</div>`;
        body.innerHTML = html;
      } catch (error) {
        console.error('Failed to view faculty schedule:', error);
        const body = document.getElementById('sched-modal-body');
        if (body) {
          body.innerHTML = `
            <div style="text-align:center;padding:30px 10px;color:#EF4444;font-family:var(--font-body);">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:12px;"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
              <p style="margin:0;font-size:14px;font-weight:600;">Failed to load schedule. Please try again.</p>
            </div>
          `;
        }
      }
    }
  };

  // Expose globally
  global.facultyScheduleModal = facultyScheduleModal;
  global.viewFacultySchedule = facultyScheduleModal.viewFacultySchedule;
})(typeof window !== 'undefined' ? window : this);
