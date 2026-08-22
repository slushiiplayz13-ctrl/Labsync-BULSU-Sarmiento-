/**
 * LabSync – Faculty Weekly Schedule Controller | js/schedule.js
 * Refactored in Phase 2 (Scheduling Architecture Refactor)
 * Renders faculty's personal weekly timetable with subject filters and legend interactions.
 */

(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime12(timeStr) {
    if (global.formatTimeLabel) return global.formatTimeLabel(timeStr);
    if (!timeStr) return '';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${ampm}`;
  }

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
      if (global.scheduleService && typeof global.scheduleService.getUserSchedule === 'function') {
        schedules = await global.scheduleService.getUserSchedule(ay, sem);
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
      const totalClasses = schedules.length;

      const palettes = global.SUBJECT_COLOR_PALETTES || [
        { name: 'blue', class: 'subject-webdev', dot: '#3B82F6', bg: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)', color: '#EFF6FF' },
        { name: 'amber', class: 'subject-intro', dot: '#F59E0B', bg: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)', color: '#FEF3C7' },
        { name: 'cyan', class: 'subject-network', dot: '#06B6D4', bg: 'linear-gradient(135deg, #0E7490 0%, #155E75 100%)', color: '#E0F2FE' },
        { name: 'purple', class: 'subject-capstone', dot: '#A855F7', bg: 'linear-gradient(135deg, #7E22CE 0%, #581C87 100%)', color: '#FAF5FF' },
        { name: 'emerald', class: 'subject-prog', dot: '#22C55E', bg: 'linear-gradient(135deg, #15803D 0%, #14532D 100%)', color: '#F0FDF4' },
        { name: 'rose', class: 'subject-rose', dot: '#F43F5E', bg: 'linear-gradient(135deg, #BE123C 0%, #881337 100%)', color: '#FFE4E6' },
        { name: 'indigo', class: 'subject-indigo', dot: '#6366F1', bg: 'linear-gradient(135deg, #4338CA 0%, #312E81 100%)', color: '#E0E7FF' },
        { name: 'orange', class: 'subject-orange', dot: '#EA580C', bg: 'linear-gradient(135deg, #C2410C 0%, #7C2D12 100%)', color: '#FFEDD5' }
      ];

      const subjectMap = new Map();
      let paletteIdx = 0;

      schedules.forEach(s => {
        const name = (s.Subject_Name || 'General Subject').trim();
        if (!subjectMap.has(name)) {
          const lower = name.toLowerCase();
          let selectedPalette;
          if (lower.includes('web')) selectedPalette = palettes[0];
          else if (lower.includes('net')) selectedPalette = palettes[2];
          else if (lower.includes('cap')) selectedPalette = palettes[3];
          else if (lower.includes('prog')) selectedPalette = palettes[4];
          else if (lower.includes('data') || lower.includes('db') || lower.includes('base')) selectedPalette = palettes[7];
          else if (lower.includes('intro') || lower.includes('itc')) selectedPalette = palettes[1];
          else {
            selectedPalette = palettes[paletteIdx % palettes.length];
            paletteIdx++;
          }
          subjectMap.set(name, selectedPalette);
        }
      });

      global.latestUserSchedules = schedules.map(s => {
        const palette = subjectMap.get((s.Subject_Name || 'General Subject').trim());
        return {
          ...s,
          bg: palette ? palette.bg : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          color: palette ? palette.color : '#FFFFFF'
        };
      });

      let html = `
      <!-- Top Filter & Legend Toolbar -->
      <div class="schedule-filter-bar">
        <div class="sf-left">
          <span class="sf-badge"><i data-lucide="layers"></i> ${totalClasses} Class${totalClasses === 1 ? '' : 'es'} Scheduled</span>
        </div>
        <div class="schedule-legend">
          <span class="sl-title">SUBJECTS:</span>
          <div class="sl-item active" data-filter="all"><div class="dot all-dot"></div> All</div>
          ${Array.from(subjectMap.entries()).map(([subjName, palette]) => `
            <div class="sl-item" data-filter="${escapeHtml(subjName)}">
              <div class="dot" style="background: ${palette.dot}; box-shadow: 0 0 0 3px ${palette.dot}33;"></div> ${escapeHtml(subjName)}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Schedule Day Columns -->
      <div class="schedule-columns">
      `;

      days.forEach(day => {
        const isToday = day === todayName;
        const dayScheds = schedules.filter(s => s.Day_of_Week === day);

        dayScheds.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

        const isEmpty = dayScheds.length === 0;
        html += `
          <div class="day-column ${isToday ? 'highlight-day' : ''} ${isEmpty ? 'empty-day' : ''}">
            <div class="day-header">
              <span>${dayShortNames[day]}</span>
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
            const start = formatTime12(s.Start_Time);
            const end = formatTime12(s.End_Time);
            const subjName = (s.Subject_Name || 'General Subject').trim();
            const palette = subjectMap.get(subjName) || palettes[0];

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
      container.innerHTML = html;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }

      // Interactive Filter Logic
      let currentFilter = 'all';
      const legendItems = container.querySelectorAll('.sl-item');
      const cells = container.querySelectorAll('.sg-cell.filled');

      legendItems.forEach(item => {
        item.addEventListener('click', () => {
          const selectedFilter = item.dataset.filter;

          if (currentFilter === selectedFilter && selectedFilter !== 'all') {
            currentFilter = 'all';
          } else {
            currentFilter = selectedFilter;
          }

          legendItems.forEach(el => {
            if (el.dataset.filter === currentFilter) {
              el.classList.add('active');
              el.style.opacity = '1';
            } else {
              el.classList.remove('active');
              el.style.opacity = currentFilter === 'all' ? '1' : '0.45';
            }
          });

          cells.forEach(cell => {
            const cellSubj = cell.dataset.subjectName;
            if (currentFilter === 'all' || cellSubj === currentFilter) {
              cell.style.opacity = '1';
              cell.style.filter = 'none';
              if (currentFilter !== 'all') {
                cell.style.transform = 'scale(1.03)';
                cell.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--primary-teal)';
                cell.style.zIndex = '10';
              } else {
                cell.style.transform = 'none';
                cell.style.boxShadow = '';
                cell.style.zIndex = '1';
              }
            } else {
              cell.style.opacity = '0.2';
              cell.style.filter = 'grayscale(60%)';
              cell.style.transform = 'scale(0.97)';
              cell.style.boxShadow = 'none';
              cell.style.zIndex = '1';
            }
          });
        });
      });

    } catch (err) {
      console.error('Error loading user schedule:', err);
    }
  }

  global.loadUserSchedule = loadUserSchedule;

  let _schedulePageInitialized = false;
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

})(typeof window !== 'undefined' ? window : this);
