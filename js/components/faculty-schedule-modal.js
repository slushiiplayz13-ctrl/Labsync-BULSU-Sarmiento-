/* ================================================================
   LabSync – Faculty Schedule Modal Component  |  js/components/faculty-schedule-modal.js
   Fetches and renders a professor's weekly laboratory teaching schedule.
   ================================================================ */

'use strict';

(function (global) {
  /**
   * Helper to escape HTML safely.
   */
  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Formats time string (HH:MM or HH:MM:SS) to 12h AM/PM.
   */
  function formatTime(t) {
    if (!t) return '--';
    if (global.timeUtils && typeof global.timeUtils.formatTime24to12 === 'function') {
      return global.timeUtils.formatTime24to12(t);
    }
    const parts = String(t).split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
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
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';

      modal.innerHTML = `
        <div class="sched-modal-dialog">
          <div class="sched-modal-header">
            <div>
              <h2 class="sched-modal-title">Faculty Schedule</h2>
              <p class="sched-modal-subtitle">Weekly class assignments for <strong>${escapeHtml(profName)}</strong></p>
            </div>
            <button id="close-sched-modal" class="sched-modal-close-btn">
              <i data-lucide="x"></i>
            </button>
          </div>
          
          <div id="sched-modal-body" style="padding:28px;overflow-y:auto;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;">
            <div class="sched-spinner" style="border: 3px solid #E5E7EB; border-top: 3px solid #1EBBD7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom:12px;"></div>
            <span style="font-family:var(--font-body);font-size:14px;color:#6B7280;">Loading schedule data from all rooms...</span>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      setTimeout(() => {
        modal.style.opacity = '1';
        const dialog = modal.querySelector('div');
        if (dialog) dialog.style.transform = 'translateY(0)';
      }, 10);

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }

      const closeModal = () => {
        modal.style.opacity = '0';
        const dialog = modal.querySelector('div');
        if (dialog) dialog.style.transform = 'translateY(20px)';
        setTimeout(() => modal.remove(), 250);
      };

      const closeBtn = document.getElementById('close-sched-modal');
      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      try {
        let profSchedules = [];
        if (global.facultyService && typeof global.facultyService.getFacultySchedule === 'function') {
          profSchedules = await global.facultyService.getFacultySchedule(profName);
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
                <i data-lucide="calendar"></i>
              </div>
              <h3 class="sched-modal-empty-title">No Active Assignments</h3>
              <p class="sched-modal-empty-desc">This faculty member is not currently assigned to teach in any computer laboratories.</p>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons();
          }
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

        let html = `<div style="display:flex;flex-direction:column;gap:18px;font-family:var(--font-body);">`;
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
              <div>
                <div style="font-size:15px;font-weight:700;color:var(--text-dark);margin-bottom:3px;font-family:var(--font-display);">${escapeHtml(subj)}</div>
                <div style="display:flex;align-items:center;gap:14px;font-size:12.5px;color:var(--text-mid);">
                  <span style="display:flex;align-items:center;gap:4px;"><i data-lucide="users" style="width:14px;height:14px;color:var(--text-muted);"></i> Section: <strong>${escapeHtml(sec)}</strong></span>
                  <span style="display:flex;align-items:center;gap:4px;"><i data-lucide="map-pin" style="width:14px;height:14px;color:var(--text-muted);"></i> ${escapeHtml(bldg)} Rm ${escapeHtml(rm)}</span>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-size:13.5px;font-weight:600;color:var(--text-dark);display:flex;align-items:center;gap:5px;justify-content:flex-end;"><i data-lucide="clock" style="width:14px;height:14px;color:var(--primary-teal);"></i> ${start} - ${end}</div>
                <span class="rc-badge in-progress" style="margin-top:4px;display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;">Scheduled</span>
              </div>
            </div>
          `;
        });

        html += `</div>`;
        body.innerHTML = html;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons();
        }
      } catch (error) {
        console.error('Failed to view faculty schedule:', error);
        const body = document.getElementById('sched-modal-body');
        if (body) {
          body.innerHTML = `
            <div style="text-align:center;padding:30px 10px;color:#EF4444;font-family:var(--font-body);">
              <i data-lucide="alert-circle" style="width:36px;height:36px;margin-bottom:12px;"></i>
              <p style="margin:0;font-size:14px;font-weight:600;">Failed to load schedule. Please try again.</p>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons();
          }
        }
      }
    }
  };

  // Expose globally
  global.facultyScheduleModal = facultyScheduleModal;
  global.viewFacultySchedule = facultyScheduleModal.viewFacultySchedule;
})(typeof window !== 'undefined' ? window : this);
