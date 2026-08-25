/* ================================================================
   LabSync – Print Schedule Page Controller  |  js/pages/print-schedule.js
   Refactored in Phase 2 (Scheduling Architecture Refactor)
   ================================================================ */

'use strict';

/**
 * Formats a 24-hour time string (HH:MM) to 12-hour AM/PM format.
 * @param {string} t - Time string in "HH:MM"
 * @returns {string} Formatted string "h:MM AM/PM"
 */
function formatTime24to12(t) {
  if (window.formatTimeLabel) return window.formatTimeLabel(t);
  if (!t) return '';
  let [h, m] = t.split(':');
  h = parseInt(h, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/**
 * Initializes and renders the printable schedule document.
 */
async function initPrintSchedulePage() {
  // 1. Fetch and display dynamic signatures from settings
  try {
    let settings = {};
    if (window.settingsService && typeof window.settingsService.getSettings === 'function') {
      settings = await window.settingsService.getSettings();
    } else {
      const settingsRes = await fetch('/api/settings', { credentials: 'include' });
      if (settingsRes.ok) settings = await settingsRes.json();
    }

    if (settings.program_chair) {
      const chairEl = document.getElementById('print-program-chair');
      if (chairEl) chairEl.textContent = settings.program_chair.toUpperCase();
    }
    if (settings.campus_dean) {
      const deanEl = document.getElementById('print-campus-dean');
      if (deanEl) deanEl.textContent = settings.campus_dean.toUpperCase();
    }
  } catch (err) {
    console.error('Failed to load dynamic signatures:', err);
  }

  // 2. Get room and building info from URL parameters
  const urlParams = new URLSearchParams(window.location.search);
  const roomNum = urlParams.get('room') || '204';
  const bldgName = urlParams.get('bldg') || 'Building B';

  const academicYear = urlParams.get('academicYear') || '2025-2026';
  const semester = urlParams.get('semester') || '1st Semester';

  // Set page document title and header titles
  document.title = `Room Assignment - ${bldgName.toUpperCase()} RM ${roomNum}`;
  const roomTitleEl = document.getElementById('print-room-title');
  const actionsTitleEl = document.getElementById('actions-title');
  const actionsSubEl = document.getElementById('actions-subtitle');
  const aySemEl = document.getElementById('print-ay-sem');

  if (roomTitleEl) roomTitleEl.textContent = `${bldgName.toUpperCase()} RM ${roomNum}`;
  if (actionsTitleEl) actionsTitleEl.textContent = `${bldgName.toUpperCase()} RM ${roomNum} - Print Preview`;
  if (actionsSubEl) actionsSubEl.textContent = `BulSU schedule print format ready`;
  if (aySemEl) aySemEl.textContent = `Academic Year: ${academicYear} ${semester.toUpperCase()}`;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let rawSchedules = [];

  // 3. State loading strategy: check localStorage first for previewing unsaved editor state, fallback to database
  const localDataString = localStorage.getItem('print_schedule_data');
  if (localDataString) {
    try {
      const parsed = JSON.parse(localDataString);
      if (String(parsed.roomNum) === String(roomNum)) {
        rawSchedules = parsed.scheduleData;
        localStorage.removeItem('print_schedule_data');
      }
    } catch (err) {
      console.error('Failed to parse localStorage print data:', err);
    }
  }

  // If local draft data wasn't found or was for a different room, fetch from database API
  if (rawSchedules.length === 0) {
    try {
      if (window.scheduleService && typeof window.scheduleService.getRoomSchedule === 'function') {
        rawSchedules = await window.scheduleService.getRoomSchedule(roomNum, academicYear, semester);
      } else {
        const res = await fetch(`/api/schedules/room/${encodeURIComponent(roomNum)}?academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, { credentials: 'include' });
        if (res.ok) rawSchedules = await res.json();
      }
    } catch (err) {
      console.error('API fetch error:', err);
    }
  }

  // 4. Normalize the schedules
  const scheduleData = (rawSchedules || []).map(s => ({
    day: s.day || s.Day_of_Week,
    startTime: (s.startTime || s.Start_Time || '').substring(0, 5),
    endTime: (s.endTime || s.End_Time || '').substring(0, 5),
    subject: s.subject || s.Subject_Name || '',
    professor: s.professor || s.ProfessorName || '',
    section: s.section || s.Section || ''
  }));

  // 5. Generate 30-minute intervals from 7:00 AM (07:00) to 8:30 PM (20:30)
  const times = [];
  for (let h = 7; h <= 19; h++) {
    times.push(`${h.toString().padStart(2, '0')}:00`);
    times.push(`${h.toString().padStart(2, '0')}:30`);
  }
  times.push('20:00');
  times.push('20:30');

  // 6. Initialize layout grid [time slot index][day index]
  const grid = Array.from({ length: times.length - 1 }, () => Array(7).fill(null));

  scheduleData.forEach(s => {
    const startIndex = times.indexOf(s.startTime);
    const endIndex = times.indexOf(s.endTime);
    const dayIndex = days.indexOf(s.day);

    if (startIndex !== -1 && endIndex !== -1 && dayIndex !== -1 && endIndex > startIndex) {
      grid[startIndex][dayIndex] = {
        type: 'block',
        rowspan: endIndex - startIndex,
        data: s
      };
      for (let i = startIndex + 1; i < endIndex; i++) {
        grid[i][dayIndex] = { type: 'skip' };
      }
    }
  });

  // 7. Build DOM Table Rows dynamically
  let tbodyHtml = '';
  for (let r = 0; r < times.length - 1; r++) {
    tbodyHtml += '<tr>';

    const startStr = formatTime24to12(times[r]);
    const endStr = formatTime24to12(times[r + 1]);
    tbodyHtml += `<td class="time-col">${startStr} - ${endStr}</td>`;

    for (let c = 0; c < 7; c++) {
      const cell = grid[r][c];
      if (!cell) {
        tbodyHtml += '<td></td>';
      } else if (cell.type === 'block') {
        let bgClass = '';
        if (cell.data.subject && cell.data.subject.toUpperCase().includes('BINDTECH')) {
          bgClass = 'bg-yellow';
        }

        tbodyHtml += `<td rowspan="${cell.rowspan}" class="${bgClass}">
          <div class="class-box">
            <span class="subject">${cell.data.subject}</span>
            <span class="section">${cell.data.section}</span>
            <span class="instructor">${cell.data.professor}</span>
          </div>
        </td>`;
      }
    }
    tbodyHtml += '</tr>';
  }

  const printTbody = document.getElementById('print-tbody');
  if (printTbody) {
    printTbody.innerHTML = tbodyHtml;
  }

  // 8. Auto-trigger print prompt after rendering completes
  setTimeout(() => {
    window.print();
  }, 500);
}

let _printScheduleInitialized = false;
function bootstrapPrintSchedule() {
  if (_printScheduleInitialized) return;
  _printScheduleInitialized = true;
  initPrintSchedulePage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapPrintSchedule);
} else {
  bootstrapPrintSchedule();
}
