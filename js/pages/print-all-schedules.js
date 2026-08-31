/* ================================================================
   LabSync – Print All Schedules Page Controller  |  js/pages/print-all-schedules.js
   Refactored in Phase 2 (Scheduling Architecture Refactor)
   ================================================================ */

'use strict';

/**
 * Triggers PDF generation and download using html2pdf library.
 */
function triggerDownload() {
  document.querySelectorAll('.document-page-wrapper').forEach(w => {
    w.style.marginBottom = '0px';
  });

  const element = document.getElementById('pages-container');
  const opt = {
    margin:       0,
    filename:     'All_Lab_Schedules.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: 'legacy' }
  };

  const titleEl = document.getElementById('actions-title');
  const subEl = document.getElementById('actions-subtitle');

  if (titleEl) titleEl.textContent = 'Generating PDF...';
  if (subEl) subEl.textContent = 'Please wait, your download will start shortly.';

  if (typeof window.html2pdf === 'function') {
    window.html2pdf().set(opt).from(element).save().then(() => {
      if (titleEl) titleEl.textContent = 'Download Complete';
      if (subEl) subEl.textContent = 'You can close this tab now.';

      document.querySelectorAll('.document-page-wrapper').forEach(w => {
        w.style.marginBottom = '20px';
      });
    });
  } else {
    console.error('html2pdf library is not loaded');
  }
}

/**
 * Initializes and builds multi-room printable schedules document.
 */
async function initPrintAllSchedulesPage() {
  const pagesContainer = document.getElementById('pages-container');
  if (!pagesContainer) return;

  const urlParams = new URLSearchParams(window.location.search);
  const academicYear = urlParams.get('academicYear') || '2025-2026';
  const semester = urlParams.get('semester') || '1st Semester';

  let programChair = 'ELENITA T. CAPARIÑO';
  let campusDean = 'DR. MARICEL BALIGOD';

  // Fetch dynamic signature settings
  try {
    let settings = {};
    if (window.settingsService && typeof window.settingsService.getSettings === 'function') {
      settings = await window.settingsService.getSettings();
    } else {
      const settingsRes = await fetch('/api/settings', { credentials: 'include' });
      if (settingsRes.ok) settings = await settingsRes.json();
    }
    if (settings.program_chair) programChair = settings.program_chair.toUpperCase();
    if (settings.campus_dean) campusDean = settings.campus_dean.toUpperCase();
  } catch (err) {
    console.error('Failed to fetch signature settings:', err);
  }

  try {
    // 1. Fetch all rooms
    let rooms = [];
    if (window.laboratoryService && typeof window.laboratoryService.fetchLaboratories === 'function') {
      rooms = await window.laboratoryService.fetchLaboratories();
    } else {
      const res = await fetch('/api/laboratories', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch rooms');
      rooms = await res.json();
    }

    if (!Array.isArray(rooms) || rooms.length === 0) {
      pagesContainer.innerHTML = '<div style="padding: 40px; color: #64748b; font-family: \'Plus Jakarta Sans\', sans-serif;">No rooms found.</div>';
      return;
    }

    pagesContainer.innerHTML = '';

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Generate 30-minute intervals from 7:00 AM to 8:30 PM
    const times = [];
    for (let h = 7; h <= 19; h++) {
      times.push(`${h.toString().padStart(2, '0')}:00`);
      times.push(`${h.toString().padStart(2, '0')}:30`);
    }
    times.push('20:00');
    times.push('20:30');

    // 2. Process each room
    for (const room of rooms) {
      const roomNum = room.Room_Number;
      const bldgName = room.Building || 'Building B';

      let rawSchedules = [];
      const getRoomSchedFn = window.getRoomSchedule || (window.scheduleService && window.scheduleService.getRoomSchedule);
      if (typeof getRoomSchedFn === 'function') {
        rawSchedules = await getRoomSchedFn(roomNum, academicYear, semester);
      } else {
        const schedRes = await fetch(`/api/schedules/room/${encodeURIComponent(roomNum)}?academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, { credentials: 'include' });
        if (schedRes.ok) rawSchedules = await schedRes.json();
      }

      // Normalize schedules
      const scheduleData = (rawSchedules || []).map(s => ({
        day: s.day || s.Day_of_Week,
        startTime: (s.startTime || s.Start_Time || '').substring(0, 5),
        endTime: (s.endTime || s.End_Time || '').substring(0, 5),
        subject: s.subject || s.Subject_Name || '',
        professor: s.professor || s.ProfessorName || '',
        section: s.section || s.Section || ''
      }));

      // Initialize layout grid
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

      // Build tbody HTML
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

      // Create page element wrapper
      const wrapperEl = document.createElement('div');
      wrapperEl.className = 'document-page-wrapper';

      const pageEl = document.createElement('div');
      pageEl.className = 'document-page';
      pageEl.innerHTML = `
        <div class="print-header-container">
          <img src="assets/BULSU%20Logo.png" alt="BulSU Logo" style="position: absolute; left: 120px; top: 50%; transform: translateY(-50%); height: 75px; width: auto; object-fit: contain;">
          <div class="header-text" style="text-align: center; margin: 0 200px;">
            <h1 style="font-size: 13px; margin: 0; text-transform: uppercase; font-weight: normal; color: black;">Republic of the Philippines</h1>
            <h2 style="font-size: 15px; margin: 2px 0; font-weight: bold; color: black; margin-top: 4px;">Bulacan State University</h2>
            <p style="font-size: 11px; margin: 2px 0; color: black;">City of Malolos</p>
            <p style="font-weight: bold; margin-top: 8px; font-size: 13px; color: black; letter-spacing: 0.5px;">ROOM ASSIGNMENT</p>
            <p style="font-size: 11px; margin: 2px 0; color: black; margin-top: 4px;">Academic Year: ${academicYear} ${semester.toUpperCase()}</p>
          </div>
          <div style="position: absolute; right: 120px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 10px;">
            <img src="assets/bsu-sarmiento-logo.png" alt="BSU Sarmiento Campus Logo" style="height: 65px; width: auto; object-fit: contain;">
          </div>
        </div>
        <div class="print-room-title-block">
          <span style="float: left; font-size: 11px; font-weight: bold; margin-top: 5px;">BLDG. AND ROOM NO.:</span>
          <h3>${bldgName.toUpperCase()} RM ${roomNum}</h3>
        </div>
        <table class="print-table">
          <thead>
            <tr>
              <th style="width: 14%;">Time</th>
              <th style="width: 5%;">Sunday</th>
              <th style="width: 13.5%;">Monday</th>
              <th style="width: 13.5%;">Tuesday</th>
              <th style="width: 13.5%;">Wednesday</th>
              <th style="width: 13.5%;">Thursday</th>
              <th style="width: 13.5%;">Friday</th>
              <th style="width: 13.5%;">Saturday</th>
            </tr>
          </thead>
          <tbody>
            ${tbodyHtml}
          </tbody>
        </table>
        <div class="print-footer-container">
          <div class="signature-block">
            <p style="margin: 0;">Prepared by:</p>
            <div class="signature-line">
              <span class="sign-name">${programChair}</span><br>
              <span>Program Chair</span>
            </div>
          </div>
          <div class="footer-brand" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; opacity: 0.95; align-self: flex-end; padding-bottom: 5px;">
            <span style="font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: #475569; font-weight: bold;">Generated by</span>
            <img src="assets/labsync-logo.png" alt="LabSync Logo" style="height: 28px; width: auto; object-fit: contain;">
          </div>
          <div class="signature-block" style="text-align: right;">
            <p style="text-align: left; margin: 0; margin-left: 40px;">Approved by:</p>
            <div class="signature-line" style="text-align: left; margin-left: 40px;">
              <span class="sign-name">${campusDean}</span><br>
              <span>Campus Dean</span>
            </div>
          </div>
        </div>
      `;
      wrapperEl.appendChild(pageEl);
      pagesContainer.appendChild(wrapperEl);

      if (room !== rooms[rooms.length - 1]) {
        const pageBreak = document.createElement('div');
        pageBreak.className = 'html2pdf__page-break';
        pagesContainer.appendChild(pageBreak);
      }
    }

    const isAutoDownload = urlParams.get('download') === 'true' || urlParams.get('mode') === 'download';
    if (isAutoDownload) {
      setTimeout(() => {
        triggerDownload();
      }, 700);
    }

  } catch (err) {
    console.error('Error generating all schedules:', err);
    pagesContainer.innerHTML = '<div style="padding: 40px; color: #ef4444; font-family: \'Plus Jakarta Sans\', sans-serif;">An error occurred while loading schedules.</div>';
  }
}

let _printAllSchedulesInitialized = false;
function bootstrapPrintAllSchedules() {
  if (_printAllSchedulesInitialized) return;
  _printAllSchedulesInitialized = true;

  const closeBtn = document.querySelector('.btn-close');
  if (closeBtn) {
    closeBtn.removeAttribute('onclick');
    closeBtn.addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.close();
      }
    });
  }

  const downloadBtn = document.querySelector('.btn-download, #btn-download-pdf');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      triggerDownload();
    });
  }

  const printBtn = document.querySelector('.btn-print');
  if (printBtn) {
    printBtn.removeAttribute('onclick');
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  initPrintAllSchedulesPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapPrintAllSchedules);
} else {
  bootstrapPrintAllSchedules();
}

window.triggerDownload = triggerDownload;
