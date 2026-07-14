// ── Shared Schedule Logic for User Schedules ─────────────────────────
window.loadUserSchedule = async function() {
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
  if (window.lucide) lucide.createIcons({ root: container });

  try {
    const startYear = document.getElementById('academic-year-start-wrapper')?.dataset.value || '2026';
    const endYear = document.getElementById('academic-year-end-wrapper')?.dataset.value || '2027';
    const ay = `${startYear}-${endYear}`;
    const sem = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';

    const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`);
    if (!res.ok) throw new Error('Failed to fetch schedule');
    const schedules = await res.json();
    
    if (schedules.length === 0) {
      container.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon">
            <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
          </div>
          <p>No weekly schedule loaded for ${ay} ${sem}. Your teaching blocks will appear here when data is synced.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: container });
      return;
    }

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayShortNames = {
      'Monday': 'MON',
      'Tuesday': 'TUE',
      'Wednesday': 'WED',
      'Thursday': 'THU',
      'Friday': 'FRI',
      'Saturday': 'SAT'
    };

    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    function formatTime12(timeStr) {
      if (!timeStr) return '';
      const parts = timeStr.split(':');
      let hour = parseInt(parts[0], 10);
      const minute = parts[1];
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      hour = hour ? hour : 12;
      return `${hour}:${minute} ${ampm}`;
    }

    let html = '<div class="schedule-columns">';

    days.forEach(day => {
      const isToday = day === todayName;
      const dayScheds = schedules.filter(s => s.Day_of_Week === day);
      
      // Sort schedules chronologically by start time
      dayScheds.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

      html += `
        <div class="day-column ${isToday ? 'highlight-day' : ''}">
          <div class="day-header">${dayShortNames[day]}</div>
      `;

      if (dayScheds.length === 0) {
        html += `
          <div style="flex: 1; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--border-light); border-radius: 12px; padding: 12px; color: var(--text-muted); font-size: 11.5px; font-weight: 500; text-align: center; min-height: 80px; background: rgba(255,255,255,0.4);">
            No classes
          </div>
        `;
      } else {
        dayScheds.forEach(s => {
          const start = formatTime12(s.Start_Time);
          const end = formatTime12(s.End_Time);
          
          let colorClass = 'subject-intro'; // default
          const subj = (s.Subject_Name || '').toLowerCase();
          if (subj.includes('web')) colorClass = 'subject-webdev';
          else if (subj.includes('net')) colorClass = 'subject-network';
          else if (subj.includes('cap')) colorClass = 'subject-capstone';
          else if (subj.includes('prog')) colorClass = 'subject-prog';

          html += `
            <div class="sg-cell filled ${colorClass}" style="min-height: auto; gap: 6px; padding: 12px;">
              <div style="font-size: 11px; font-weight: 700; opacity: 0.85; display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
                <i data-lucide="clock" style="width: 12px; height: 12px;"></i> ${start} - ${end}
              </div>
              <div class="sg-room"><i data-lucide="map-pin" style="width: 12px; height: 12px;"></i> RM ${s.Room_Number || ''}</div>
              <div class="sg-class">${s.Section || ''}</div>
              <div class="sg-code">${s.Subject_Name || ''}</div>
            </div>
          `;
        });
      }

      html += `</div>`;
    });

    html += `</div>
    <div class="schedule-legend" style="margin-top: 20px;">
      <div class="sl-title">SUBJECTS:</div>
      <div class="sl-item"><div class="dot network"></div> Network Admin</div>
      <div class="sl-item"><div class="dot webdev"></div> Web Dev</div>
      <div class="sl-item"><div class="dot capstone"></div> Capstone</div>
      <div class="sl-item"><div class="dot prog"></div> Programming</div>
      <div class="sl-item"><div class="dot intro"></div> Intro to Computing</div>
    </div>`;
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons({ root: container });
    
  } catch (err) {
    console.error(err);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const currentYear = new Date().getFullYear();
  if (window.populateCustomYearSelectors) {
    window.populateCustomYearSelectors('academic-year-start-wrapper', 'academic-year-end-wrapper', `${currentYear}-${currentYear + 1}`, () => {
      window.loadUserSchedule();
    });
  }

  if (window.initCustomSelect) {
    window.initCustomSelect('semester-wrapper', () => {
      window.loadUserSchedule();
    });
  }

  window.loadUserSchedule();
});
