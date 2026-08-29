// ── Schedule Studio Logic (Custom Schedule Image & Wallpaper Generator) ─────

(function () {
  'use strict';

  // Default Studio State (Fixed to 16:9 Desktop format)
  const state = {
    ratio: 'desktop', // 'desktop', 'mobile', 'card'
    theme: 'teal', // 'teal', 'minimal', 'midnight', 'academic', 'glass', 'sunset'
    showLogo: true,
    showUser: true,
    showMeta: true,
    showFooter: true
  };

  // Inject Modal Structure into DOM if missing
  function injectStudioModal() {
    if (document.getElementById('studio-modal-overlay')) return;

    const modalHTML = `
      <div id="studio-modal-overlay" class="studio-modal-overlay">
        <div class="studio-modal">
          
          <!-- Header -->
          <div class="studio-header">
            <div class="studio-title-group">
              <div class="studio-icon-badge">
                <i data-lucide="palette" style="width:22px;height:22px;"></i>
              </div>
              <div>
                <h2 class="studio-title">Schedule Studio</h2>
                <p class="studio-subtitle">Customize and export your schedule as a high-quality wallpaper or image</p>
              </div>
            </div>
            <button class="studio-close-btn" id="studio-close-btn" title="Close Studio">
              <i data-lucide="x" style="width:20px;height:20px;"></i>
            </button>
          </div>

          <!-- Body -->
          <div class="studio-body">
            
            <!-- Sidebar Controls -->
            <div class="studio-controls-sidebar">
              
              <!-- Color Theme -->
              <div class="control-group">
                <div class="studio-section-title">
                  <i data-lucide="sparkles" style="width:16px;height:16px;"></i> Visual Theme
                </div>
                <div class="theme-grid">
                  <button class="theme-card-btn ${state.theme === 'midnight' ? 'active' : ''}" data-theme="midnight">
                    <div class="theme-swatch theme-midnight"></div>
                    <span class="theme-name">Midnight Dark</span>
                  </button>
                  <button class="theme-card-btn ${state.theme === 'teal' ? 'active' : ''}" data-theme="teal">
                    <div class="theme-swatch theme-teal"></div>
                    <span class="theme-name">LabSync Blue</span>
                  </button>
                  <button class="theme-card-btn ${state.theme === 'academic' ? 'active' : ''}" data-theme="academic">
                    <div class="theme-swatch theme-academic"></div>
                    <span class="theme-name">Academic Navy</span>
                  </button>
                  <button class="theme-card-btn ${state.theme === 'glass' ? 'active' : ''}" data-theme="glass">
                    <div class="theme-swatch theme-glass"></div>
                    <span class="theme-name">Frosted Glass</span>
                  </button>
                  <button class="theme-card-btn ${state.theme === 'minimal' ? 'active' : ''}" data-theme="minimal">
                    <div class="theme-swatch theme-minimal"></div>
                    <span class="theme-name">Clean Minimal</span>
                  </button>
                  <button class="theme-card-btn ${state.theme === 'sunset' ? 'active' : ''}" data-theme="sunset">
                    <div class="theme-swatch theme-sunset"></div>
                    <span class="theme-name">Sunset Warmth</span>
                  </button>
                </div>
              </div>

              <!-- Display Elements -->
              <div class="control-group">
                <div class="studio-section-title">
                  <i data-lucide="sliders" style="width:16px;height:16px;"></i> Display Options
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <label class="toggle-option" for="toggle-logo">
                    <span>Show Campus Logo</span>
                    <div class="studio-switch">
                      <input type="checkbox" id="toggle-logo" ${state.showLogo ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                  <label class="toggle-option" for="toggle-user">
                    <span>Show Faculty Profile</span>
                    <div class="studio-switch">
                      <input type="checkbox" id="toggle-user" ${state.showUser ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                  <label class="toggle-option" for="toggle-meta">
                    <span>Show AY & Semester</span>
                    <div class="studio-switch">
                      <input type="checkbox" id="toggle-meta" ${state.showMeta ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                  <label class="toggle-option" for="toggle-footer">
                    <span>Show BulSU Watermark</span>
                    <div class="studio-switch">
                      <input type="checkbox" id="toggle-footer" ${state.showFooter ? 'checked' : ''}>
                      <span class="switch-slider"></span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Export Button -->
              <button class="btn-export-download" id="btn-studio-download">
                <i data-lucide="download" style="width:18px;height:18px;"></i> Save as Image (PNG)
              </button>

            </div>

            <!-- Real-time Canvas Workspace (16:9 Desktop) -->
            <div class="studio-preview-workspace">
              <div id="studio-canvas-container" class="studio-canvas-container ratio-desktop">
                <div id="studio-render-card" class="studio-render-card theme-midnight-card">
                  <!-- Rendered dynamically -->
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    if (window.lucide) {
      lucide.createIcons({ root: document.getElementById('studio-modal-overlay') });
    }

    bindStudioEvents();
  }

  // Bind Event Listeners
  function bindStudioEvents() {
    const overlay = document.getElementById('studio-modal-overlay');
    const closeBtn = document.getElementById('studio-close-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeScheduleStudio);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeScheduleStudio();
      });
    }

    // Theme Buttons
    document.querySelectorAll('.theme-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-card-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.theme = btn.dataset.theme;
        updateStudioPreview();
      });
    });

    // Toggle options
    document.getElementById('toggle-logo')?.addEventListener('change', (e) => {
      state.showLogo = e.target.checked;
      updateStudioPreview();
    });
    document.getElementById('toggle-user')?.addEventListener('change', (e) => {
      state.showUser = e.target.checked;
      updateStudioPreview();
    });
    document.getElementById('toggle-meta')?.addEventListener('change', (e) => {
      state.showMeta = e.target.checked;
      updateStudioPreview();
    });
    document.getElementById('toggle-footer')?.addEventListener('change', (e) => {
      state.showFooter = e.target.checked;
      updateStudioPreview();
    });

    // Export button
    document.getElementById('btn-studio-download')?.addEventListener('click', downloadSchedulePNG);
  }

  // Open Studio Modal (Desktop Only)
  window.openScheduleStudio = function () {
    if (window.innerWidth <= 1024) {
      return;
    }
    injectStudioModal();
    const overlay = document.getElementById('studio-modal-overlay');
    if (overlay) overlay.classList.add('active');
    updateStudioPreview();
  };

  // Close Studio Modal
  window.closeScheduleStudio = function () {
    const overlay = document.getElementById('studio-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  };

  // Update Live Preview Canvas
  function updateStudioPreview() {
    const container = document.getElementById('studio-canvas-container');
    const renderCard = document.getElementById('studio-render-card');
    if (!container || !renderCard) return;

    // Fixed 16:9 desktop container ratio
    container.className = `studio-canvas-container ratio-desktop`;
    renderCard.className = `studio-render-card theme-${state.theme}-card`;

    // Fetch user info from active page
    const profileName = document.querySelector('.profile-name')?.textContent || 'Faculty Schedule';
    const profileRole = document.querySelector('.profile-role')?.textContent || 'BulSU Sarmiento Campus';
    const ayVal = document.getElementById('academic-year-wrapper')?.dataset.value || '2026-2027';
    const semVal = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';

    // Get active schedule items stored by schedule.js or extracted from DOM
    const schedules = window.latestUserSchedules || extractSchedulesFromDOM();

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayShorts = { Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI', Saturday: 'SAT' };

    // Group schedules by Day
    const schedulesByDay = {};
    days.forEach(d => schedulesByDay[d] = []);

    schedules.forEach(s => {
      if (schedulesByDay[s.Day_of_Week]) {
        schedulesByDay[s.Day_of_Week].push(s);
      }
    });

    // Calculate max classes in any day to apply uniform dense scaling across all columns
    let maxClassesInSchedule = 0;
    days.forEach(d => {
      if (schedulesByDay[d].length > maxClassesInSchedule) {
        maxClassesInSchedule = schedulesByDay[d].length;
      }
    });

    const isGlobalDense = maxClassesInSchedule >= 3;

    // Build 16:9 6-Column Days Grid (MON to SAT)
    let daysHTML = '';
    days.forEach(day => {
      const items = schedulesByDay[day] || [];
      let itemsHTML = '';

      if (items.length === 0) {
        itemsHTML = `<div class="canvas-empty-day"><i data-lucide="coffee" style="width:12px;height:12px;opacity:0.4;"></i><span>No Classes</span></div>`;
      } else {
        items.forEach(item => {
          const timeStr = formatTimeRange(item.Start_Time, item.End_Time);
          const subjName = item.Subject_Name || 'Class';
          const subjCode = item.Subject_Code || (subjName.includes(' - ') ? subjName.split(' - ')[0].trim() : subjName);
          let roomVal = item.Room_Name || item.Room_Number || 'TBA';
          if (roomVal !== 'TBA' && !roomVal.toLowerCase().includes('rm') && !roomVal.toLowerCase().includes('lab') && !roomVal.toLowerCase().includes('room')) {
            roomVal = `RM ${roomVal}`;
          }
          const sectionVal = item.Section_Name || item.Section || '';

          itemsHTML += `
            <div class="canvas-class-block" style="background: ${item.bg || 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)'}; color: ${item.color || '#FFFFFF'};">
              <div class="canvas-class-time">
                ${timeStr}
              </div>
              <div class="canvas-class-subject" title="${escapeHtml(subjName)}">${escapeHtml(subjCode)}</div>
              <div class="canvas-class-meta">
                <span>📍 ${escapeHtml(roomVal)}</span>
                ${sectionVal ? `<span class="canvas-sec-tag">${escapeHtml(sectionVal)}</span>` : ''}
              </div>
            </div>
          `;
        });
      }

      const itemCount = items.length;
      daysHTML += `
        <div class="canvas-day-col day-count-${itemCount} ${isGlobalDense ? 'global-dense' : ''}">
          <div class="canvas-day-title">${dayShorts[day]}</div>
          <div class="canvas-day-content">${itemsHTML}</div>
        </div>
      `;
    });

    // Render inside Card
    renderCard.innerHTML = `
      <!-- Header -->
      <div class="canvas-header">
        <div class="canvas-brand">
          ${state.showLogo ? `<img src="assets/bsu-sarmiento-logo.png" class="canvas-brand-logo bsu-logo" alt="BSU Sarmiento Logo">` : ''}
          <div>
            ${state.showUser ? `<h3 class="canvas-user-title">${escapeHtml(profileName)}</h3>` : `<h3 class="canvas-user-title">Weekly Teaching Schedule</h3>`}
            <p class="canvas-user-sub">${escapeHtml(profileRole)} • BulSU Sarmiento</p>
          </div>
        </div>
        ${state.showMeta ? `
          <div class="canvas-meta-badge">
            <i data-lucide="calendar" style="width:12px;height:12px;"></i> AY ${escapeHtml(ayVal)} | ${escapeHtml(semVal)}
          </div>
        ` : ''}
      </div>

      <!-- Days Grid -->
      <div class="canvas-days-grid ${isGlobalDense ? 'global-dense-grid' : ''}">
        ${daysHTML}
      </div>



      <!-- Footer -->
      ${state.showFooter ? `
        <div class="canvas-footer">
          <span>✨ Designed with LabSync Schedule Studio</span>
          <span>Bulacan State University – Sarmiento Campus</span>
        </div>
      ` : ''}
    `;

    if (window.lucide) {
      lucide.createIcons({ root: renderCard });
    }
  }

  // Fallback to extract schedules if window.latestUserSchedules is not set
  function extractSchedulesFromDOM() {
    const list = [];
    document.querySelectorAll('.sg-cell.filled').forEach(cell => {
      const day = cell.closest('.day-column')?.querySelector('.day-header')?.textContent?.trim();
      const time = cell.querySelector('.sg-time-badge')?.textContent?.replace(/[\s\S]*?(?=\d)/, '')?.trim() || cell.querySelector('.sg-time')?.textContent?.trim();
      const subj = cell.querySelector('.sg-title')?.textContent?.trim() || cell.querySelector('.sg-subject')?.textContent?.trim();
      const roomRaw = cell.querySelector('.sg-room-badge')?.textContent?.trim() || cell.querySelector('.sg-room')?.textContent?.trim() || '';
      const room = roomRaw.replace(/^[📍📍\s]+/, '').trim();
      const sec = cell.querySelector('.sg-section-badge')?.textContent?.trim() || cell.querySelector('.sg-badge')?.textContent?.trim() || '';

      let dayFull = 'Monday';
      if (day === 'MON') dayFull = 'Monday';
      else if (day === 'TUE') dayFull = 'Tuesday';
      else if (day === 'WED') dayFull = 'Wednesday';
      else if (day === 'THU') dayFull = 'Thursday';
      else if (day === 'FRI') dayFull = 'Friday';
      else if (day === 'SAT') dayFull = 'Saturday';

      list.push({
        Day_of_Week: dayFull,
        Start_Time: time ? time.split('–')[0]?.split('-')[0]?.trim() : '08:00',
        End_Time: time ? time.split('–')[1]?.split('-')[1]?.trim() : '10:00',
        Subject_Name: subj || 'Subject',
        Room_Name: room || 'TBA',
        Section_Name: sec || '',
        bg: cell.style.background || 'linear-gradient(135deg, #1E3A8A 0%, #1D4ED8 100%)',
        color: cell.style.color || '#FFFFFF'
      });
    });
    return list;
  }

  // Download razor-sharp Ultra-HD PNG Image using html2canvas
  async function downloadSchedulePNG() {
    const downloadBtn = document.getElementById('btn-studio-download');
    const renderCard = document.getElementById('studio-render-card');
    if (!renderCard) return;

    if (!window.html2canvas) {
      alert('Image export engine is loading. Please try again in a moment.');
      return;
    }

    try {
      const originalText = downloadBtn.innerHTML;
      downloadBtn.innerHTML = `<i data-lucide="loader-2" class="spin" style="width:18px;height:18px;"></i> Exporting 4K HD PNG...`;
      downloadBtn.style.opacity = '0.75';
      downloadBtn.disabled = true;

      // Determine Ultra-HD Scale based on aspect ratio preset for razor-sharp wallpapers
      let targetScale = 3.5;
      if (state.ratio === 'mobile') targetScale = 4.5; // ~1700px ultra-HD mobile lockscreen
      else if (state.ratio === 'card') targetScale = 3.5; // ~2400px ultra-HD card
      else if (state.ratio === 'desktop') targetScale = 3.2; // ~2700px ultra-HD desktop wallpaper

      // Render DOM element to canvas with 300 DPI ultra-HD scale
      const canvas = await html2canvas(renderCard, {
        scale: targetScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        imageTimeout: 0,
        letterRendering: true,
        onclone: (clonedDoc) => {
          const clonedCard = clonedDoc.getElementById('studio-render-card');
          if (clonedCard) {
            clonedCard.style.transform = 'none';
            clonedCard.style.boxShadow = 'none';
          }
        }
      });

      const imageURI = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      const profileName = (document.querySelector('.profile-name')?.textContent || 'Schedule').replace(/\s+/g, '_');
      link.download = `LabSync_${profileName}_Schedule_${state.ratio}_${state.theme}_HD.png`;
      link.href = imageURI;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      downloadBtn.innerHTML = originalText;
      downloadBtn.style.opacity = '1';
      downloadBtn.disabled = false;
      if (window.lucide) lucide.createIcons({ root: downloadBtn });

    } catch (err) {
      console.error('Failed to generate PNG wallpaper:', err);
      alert('Unable to export schedule image. Please try again.');
      downloadBtn.disabled = false;
    }
  }

})();
