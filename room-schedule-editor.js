const sidebar = document.querySelector('.sidebar');
const scrollClue = document.getElementById('sidebarScrollClue');

// Hide arrow if it's not scrollable
if (sidebar.scrollHeight <= sidebar.clientHeight) {
  scrollClue.style.display = 'none';
}

// Hide arrow when scrolled
sidebar.addEventListener('scroll', () => {
  if (sidebar.scrollTop > 10) {
    scrollClue.style.opacity = '0';
  } else {
    scrollClue.style.opacity = '1';
  }
});

// Drag and Drop Logic
document.addEventListener('DOMContentLoaded', () => {

  // Update Header dynamically
  const urlParams = new URLSearchParams(window.location.search);
  const roomNum = urlParams.get('room') || '204';
  const bldgName = urlParams.get('bldg') || 'Building B';
  const currentYear = new Date().getFullYear();
  const initialAY = urlParams.get('academicYear') || `${currentYear}-${currentYear + 1}`;
  const initialSem = urlParams.get('semester') || '1st Semester';
  window.isDirty = false;
  window.pendingAction = null;
  window.revertSelectCallback = null;

  window.populateCustomYearSelectors('academic-year-wrapper', initialAY, () => {
    loadRoomSchedule();
  });

  window.initCustomSelect('semester-wrapper', () => {
    loadRoomSchedule();
  });

  if (initialSem) {
    window.setCustomSelectValue('semester-wrapper', initialSem);
  }

  document.querySelector('.seh-left h1').textContent = `Room ${roomNum} Schedule`;
  document.querySelector('.seh-left p').textContent = bldgName;

  const printRoomTitle = document.getElementById('print-room-title');
  if (printRoomTitle) {
    printRoomTitle.textContent = `${bldgName.toUpperCase()} RM ${roomNum}`;
  }

  // Weekly snapping & resizing parameters
  const SLOT_HEIGHT = window.innerWidth <= 768 ? 30 : 45; // Dynamically scale grid on mobile viewports
  const START_HOUR = 7;
  const END_HOUR = 19;
  const TOTAL_SLOTS = 24; // 12 hours from 7am to 7pm

  // Dynamically update container and labels heights and positions for mobile scale
  const gridBody = document.querySelector('.calendar-grid-body');
  if (gridBody) {
    gridBody.style.height = `${TOTAL_SLOTS * SLOT_HEIGHT}px`;
  }
  document.querySelectorAll('.grid-day-column').forEach(col => {
    col.style.backgroundSize = `100% ${SLOT_HEIGHT}px`;
    col.style.backgroundImage = `linear-gradient(to bottom, transparent ${SLOT_HEIGHT - 1}px, rgba(226, 232, 240, 0.4) ${SLOT_HEIGHT - 1}px, rgba(226, 232, 240, 0.4) ${SLOT_HEIGHT}px)`;
  });
  document.querySelectorAll('.grid-time-label').forEach((label, idx) => {
    label.style.top = `${idx * SLOT_HEIGHT}px`;
    label.style.height = `${SLOT_HEIGHT}px`;
  });

  // Customizable premium glassmorphic color themes
  const COLOR_PALETTES = {
    Default: { bg: 'rgba(30, 187, 215, 0.06)', border: 'rgba(30, 187, 215, 0.25)', accent: '#1EBBD7', text: '#0B5E6D', label: 'Default' },
    Indigo: { bg: 'rgba(99, 102, 241, 0.06)', border: 'rgba(99, 102, 241, 0.25)', accent: '#6366F1', text: '#312E81', label: 'Indigo' },
    Emerald: { bg: 'rgba(16, 185, 129, 0.06)', border: 'rgba(16, 185, 129, 0.25)', accent: '#10B981', text: '#064E3B', label: 'Emerald' },
    Amber: { bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.25)', accent: '#F59E0B', text: '#78350F', label: 'Amber' },
    Rose: { bg: 'rgba(239, 68, 68, 0.06)', border: 'rgba(239, 68, 68, 0.25)', accent: '#EF4444', text: '#7F1D1D', label: 'Rose' },
    Blue: { bg: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.25)', accent: '#3B82F6', text: '#1E3A8A', label: 'Blue' },
    Purple: { bg: 'rgba(168, 85, 247, 0.06)', border: 'rgba(168, 85, 247, 0.25)', accent: '#A855F7', text: '#581C87', label: 'Purple' },
    Teal: { bg: 'rgba(20, 184, 166, 0.06)', border: 'rgba(20, 184, 166, 0.25)', accent: '#20B8A6', text: '#115E59', label: 'Teal' },
    Pink: { bg: 'rgba(236, 72, 153, 0.06)', border: 'rgba(236, 72, 153, 0.25)', accent: '#EC4899', text: '#831843', label: 'Pink' }
  };

  // Convert time string "HH:MM" to slot index (0 to 24)
  function timeToSlots(timeStr) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    const diffMinutes = (h - START_HOUR) * 60 + m;
    return diffMinutes / 30;
  }

  // Convert slot index to time string "HH:MM"
  function slotsToTime(slotIndex) {
    const totalMinutes = slotIndex * 30;
    const h = START_HOUR + Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  // Format "13:30" -> "1:30 PM", "08:00" -> "8:00 AM"
  function formatTimeLabel(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':');
    h = parseInt(h);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m} ${ampm}`;
  }

  // Format "08:30" -> "8:30", "13:00" -> "1:00" (no AM/PM)
  function formatShortTime(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':');
    h = parseInt(h);
    const displayH = h % 12 || 12;
    return `${displayH}:${m}`;
  }

  // Verify if a proposed slot range overlaps with any other block inside a day
  function checkOverlap(day, startSlot, endSlot, excludeCardId) {
    const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
    if (!col) return false;
    const cards = col.querySelectorAll('.grid-card');
    for (let card of cards) {
      if (card.id === excludeCardId) continue;
      const cardStart = parseFloat(card.dataset.start);
      const cardEnd = parseFloat(card.dataset.end);
      
      // Overlap condition: max(start1, start2) < min(end1, end2)
      const maxStart = Math.max(startSlot, cardStart);
      const minEnd = Math.min(endSlot, cardEnd);
      if (maxStart < minEnd) {
        return true;
      }
    }
    return false;
  }

  // Query backend to check if a professor is already scheduled at this time elsewhere
  async function checkProfessorConflict(professorName, day, startTime, endTime) {
    if (!professorName || professorName === 'Not specified') return { conflict: false };
    
    const startYear = document.getElementById('academic-year-start-wrapper').dataset.value || '2025';
    const endYear = document.getElementById('academic-year-end-wrapper').dataset.value || '2026';
    const academicYear = `${startYear}-${endYear}`;
    const semester = document.getElementById('semester-wrapper').dataset.value || '1st Semester';
    
    try {
      const url = `/api/schedules/check-professor-conflict?professorName=${encodeURIComponent(professorName)}&day=${encodeURIComponent(day)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}&excludeRoomNumber=${encodeURIComponent(roomNum)}`;
      const res = await fetch(url);
      if (!res.ok) return { conflict: false };
      return await res.json();
    } catch (err) {
      console.error('Error checking professor conflict:', err);
      return { conflict: false };
    }
  }

  // Live snapping placeholder helpers
  let placeholderEl = null;
  function showPlaceholder(col, slotIndex, durationSlots) {
    if (!placeholderEl) {
      placeholderEl = document.createElement('div');
      placeholderEl.className = 'grid-card-placeholder';
    }
    
    const startTime = slotsToTime(slotIndex);
    const endTime = slotsToTime(slotIndex + durationSlots);
    placeholderEl.textContent = `${formatTimeLabel(startTime)} - ${formatTimeLabel(endTime)}`;
    
    placeholderEl.style.top = `${slotIndex * SLOT_HEIGHT}px`;
    placeholderEl.style.height = `${durationSlots * SLOT_HEIGHT}px`;
    
    if (placeholderEl.parentNode !== col) {
      col.appendChild(placeholderEl);
    }
  }

  // Helper to apply dynamic style variables from COLOR_PALETTES map
  function applyCardColor(card, colorName) {
    const palette = COLOR_PALETTES[colorName] || COLOR_PALETTES.Default;
    card.dataset.color = colorName;
    card.style.backgroundColor = palette.bg;
    card.style.border = `1.5px solid ${palette.border}`;
    card.style.borderLeft = `5px solid ${palette.accent}`;
    card.style.color = palette.text;
    
    const title = card.querySelector('.grid-card-title');
    if (title) title.style.color = palette.text;
    
    const sec = card.querySelector('.grid-card-section');
    if (sec) sec.style.color = `${palette.text}bf`;
    
    const prof = card.querySelector('.grid-card-prof');
    if (prof) prof.style.color = `${palette.text}bf`;
    
    const time = card.querySelector('.grid-card-time');
    if (time) time.style.color = palette.accent;
  }

  function removePlaceholder() {
    if (placeholderEl) {
      placeholderEl.remove();
      placeholderEl = null;
    }
  }

  // Update scale styling class based on block duration height
  function updateCardSpanClass(card) {
    const start = parseFloat(card.dataset.start);
    const end = parseFloat(card.dataset.end);
    const span = end - start;
    
    card.classList.remove('span-1', 'span-2', 'span-3-plus');
    if (span <= 1) {
      card.classList.add('span-1');
    } else if (span <= 2) {
      card.classList.add('span-2');
    } else {
      card.classList.add('span-3-plus');
    }
  }

  // Helper: Create a grid card element inside the day columns
  let blockCounter = 0;
  function createGridCard(dbId, subject, professor, section, startTime = '08:30', endTime = '10:00', colorTheme = 'Default') {
    const card = document.createElement('div');
    card.className = 'grid-card';
    card.title = "Click to view details";
    card.draggable = true;
    blockCounter++;
    card.id = dbId ? `card-db-${dbId}` : `card-new-${blockCounter}`;
    
    const startSlot = timeToSlots(startTime);
    const endSlot = timeToSlots(endTime);
    const duration = endSlot - startSlot;
    
    card.dataset.start = startSlot;
    card.dataset.end = endSlot;
    card.style.top = `${startSlot * SLOT_HEIGHT}px`;
    card.style.height = `${duration * SLOT_HEIGHT}px`;
    updateCardSpanClass(card);
    
    card.innerHTML = `
      <div class="grid-card-details">
        <div class="grid-card-title" title="${subject}">${subject}</div>
        <div class="grid-card-section">Sec: ${section}</div>
        <div class="grid-card-prof" title="${professor}">${professor}</div>
      </div>
      <div class="grid-card-time">
        <span class="grid-card-time-text">${formatShortTime(startTime)} - ${formatShortTime(endTime)}</span>
        <i class="card-info-icon" data-lucide="info" style="width: 13px; height: 13px; opacity: 0.55; transition: opacity 0.2s;"></i>
      </div>
      <div class="grid-card-resize-handle"></div>
    `;

    applyCardColor(card, colorTheme);

    // Click listener to open detail modal
    card.addEventListener('click', (e) => {
      if (e.target.classList.contains('grid-card-resize-handle')) return;
      openCardDetailModal(card);
    });
    
    // Resize Listener
    const handle = card.querySelector('.grid-card-resize-handle');
    
    function initResize(e) {
      if (document.body.classList.contains('view-mode')) return;
      e.stopPropagation();
      e.preventDefault();
      
      const startY = e.clientY || (e.touches && e.touches[0].clientY);
      const startHeight = card.offsetHeight;
      const startTop = card.offsetTop;
      const day = card.closest('.grid-day-column').dataset.day;
      
      const originalEndSlot = parseFloat(card.dataset.end);
      
      function doResize(moveEvt) {
        const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY);
        const dy = currentY - startY;
        
        // Calculate new height, snap to SLOT_HEIGHT
        let newHeight = startHeight + dy;
        newHeight = Math.round(newHeight / SLOT_HEIGHT) * SLOT_HEIGHT;
        if (newHeight < SLOT_HEIGHT) newHeight = SLOT_HEIGHT;
        
        // Check bounds (cannot exceed 7:00 PM)
        const proposedEndSlot = (startTop + newHeight) / SLOT_HEIGHT;
        if (proposedEndSlot > TOTAL_SLOTS) {
          return; // exceed max slots boundary
        }
        
        // Overlap Collision Check (Local Room)
        const startSlot = startTop / SLOT_HEIGHT;
        if (checkOverlap(day, startSlot, proposedEndSlot, card.id)) {
          return; // Collision detected, stop resizing further down
        }
        
        card.style.height = `${newHeight}px`;
        card.dataset.end = proposedEndSlot;
        updateCardSpanClass(card);
        
        // Update Time display inside card
        const tStart = slotsToTime(startSlot);
        const tEnd = slotsToTime(proposedEndSlot);
        card.querySelector('.grid-card-time-text').textContent = `${formatShortTime(tStart)} - ${formatShortTime(tEnd)}`;
      }
      
      async function stopResize() {
        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', doResize);
        document.removeEventListener('touchend', stopResize);

        // Perform Async Professor Conflict Check upon completion of resizing
        const startSlot = startTop / SLOT_HEIGHT;
        const currentEndSlot = parseFloat(card.dataset.end);
        const tStart = slotsToTime(startSlot);
        const tEnd = slotsToTime(currentEndSlot);

        const profCheck = await checkProfessorConflict(professor, day, tStart, tEnd);
        if (profCheck.conflict) {
          alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${formatTimeLabel(profCheck.startTime)} to ${formatTimeLabel(profCheck.endTime)} on ${day}.`);
          
          // Revert Resize
          card.style.height = `${(originalEndSlot - startSlot) * SLOT_HEIGHT}px`;
          card.dataset.end = originalEndSlot;
          updateCardSpanClass(card);
          card.querySelector('.grid-card-time-text').textContent = `${formatShortTime(tStart)} - ${formatShortTime(slotsToTime(originalEndSlot))}`;
        } else {
          window.isDirty = true;
        }
      }
      
      document.addEventListener('mousemove', doResize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', doResize, { passive: false });
      document.addEventListener('touchend', stopResize);
    }
    
    handle.addEventListener('mousedown', initResize);
    handle.addEventListener('touchstart', initResize, { passive: false });
    
    // Drag Start Listener
    card.addEventListener('dragstart', (e) => {
      if (document.body.classList.contains('view-mode')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', card.id);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: card });
    }
    
    return card;
  }

  // Delete Card by reference function
  function deleteGridCardRef(card) {
    if (document.body.classList.contains('view-mode')) return;
    if (card) {
      // Convert details back into availability tray block
      const subject = card.querySelector('.grid-card-title').textContent;
      const section = card.querySelector('.grid-card-section').textContent.replace('Sec: ', '');
      const professor = card.querySelector('.grid-card-prof').textContent;
      
      const trayBlock = convertToTrayBlock(subject, professor, section);
      blocksContainer.appendChild(trayBlock);
      
      card.remove();
      window.isDirty = true;
      
      const emptyMsg = document.getElementById('no-blocks-msg');
      if (emptyMsg) emptyMsg.remove();
      
      updateBlockCount();
    }
  }

  // Convert timeline card properties to availability tray block
  function convertToTrayBlock(subject, professor, section) {
    blockCounter++;
    const block = document.createElement('div');
    block.className = 'schedule-block';
    block.draggable = true;
    block.id = 'block-new-' + blockCounter;
    block.innerHTML = `
      <div style="font-weight: 700;">${subject}</div>
      <div style="font-size: 10px; opacity: 0.9;">${professor}</div>
      <div style="font-size: 10px; opacity: 0.9;">${section}</div>
      <button class="delete-block-btn" onclick="deleteBlock(event, this)">
        <i data-lucide="x" style="width: 14px; height: 14px; pointer-events: none;"></i>
      </button>
    `;
    
    block.addEventListener('dragstart', (e) => {
      if (document.body.classList.contains('view-mode')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/plain', block.id);
      setTimeout(() => block.classList.add('dragging'), 0);
    });

    block.addEventListener('dragend', () => {
      block.classList.remove('dragging');
      updateBlockCount();
    });
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: block });
    }
    
    return block;
  }

  // Clear timeline planner grid
  function resetTableToDefault() {
    document.querySelectorAll('.grid-day-column').forEach(col => {
      col.innerHTML = '';
    });
    updateBlockCount();
  }

  // Save changes to database API
  async function saveCurrentSchedule() {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleData = [];

    for (let day of days) {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) continue;
      
      const cards = col.querySelectorAll('.grid-card');
      for (let card of cards) {
        const subject = card.querySelector('.grid-card-title').textContent;
        const section = card.querySelector('.grid-card-section').textContent.replace('Sec: ', '');
        const professor = card.querySelector('.grid-card-prof').textContent;
        
        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);
        
        const startTime = slotsToTime(startSlot);
        const endTime = slotsToTime(endSlot);

        const colorTheme = card.dataset.color || 'Default';
        
        scheduleData.push({
          subject: subject,
          professor: professor,
          section: section,
          startTime: startTime,
          endTime: endTime,
          day: day,
          colorTheme: colorTheme
        });
      }
    }

    const startYear = document.getElementById('academic-year-start-wrapper').dataset.value || '2025';
    const endYear = document.getElementById('academic-year-end-wrapper').dataset.value || '2026';
    const academicYear = `${startYear}-${endYear}`;
    const semester = document.getElementById('semester-wrapper').dataset.value || '1st Semester';

    const res = await fetch('/api/schedules/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        roomNumber: roomNum, 
        schedules: scheduleData,
        academicYear,
        semester
      })
    });
    if (!res.ok) throw new Error('Save API response not OK');
    window.isDirty = false;
    return true;
  }

  async function loadProfessors() {
    try {
      const res = await fetch('/api/faculty');
      if (res.status === 401) {
        console.error('Authentication required to load professors.');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch professors');
      const professors = await res.json();

      const wrapper = document.getElementById('professor-wrapper');
      if (!wrapper) return;
      const dropdown = wrapper.querySelector('.custom-select-dropdown');
      const triggerText = wrapper.querySelector('.custom-select-trigger span');

      dropdown.innerHTML = '';
      wrapper.dataset.value = '';
      triggerText.textContent = 'Select Professor';
      triggerText.style.color = '#94A3B8';

      professors.forEach(prof => {
        const opt = document.createElement('div');
        opt.className = 'custom-select-option';
        opt.dataset.value = prof.Name;
        opt.textContent = prof.Name;
        dropdown.appendChild(opt);
      });

      // Initialize custom select
      window.initCustomSelect('professor-wrapper', (val) => {
        triggerText.style.color = 'var(--text-dark)';
      });
    } catch (err) {
      console.error('Error loading professors:', err);
    }
  }
  loadProfessors();

  const createBtn = document.getElementById('create-block-btn');
  const subjectSelect = document.getElementById('block-subject');
  const professorSelect = document.getElementById('professor-wrapper');
  const sectionSelect = document.getElementById('block-section');
  const blocksContainer = document.getElementById('blocks-container');
  const availableCount = document.getElementById('available-count');
  const dayColumns = document.querySelectorAll('.grid-day-column');

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const subject = subjectSelect.value;
      const professor = professorSelect ? (professorSelect.dataset.value || '') : '';
      const section = sectionSelect.value;

      if (!subject || !professor || !section) {
        alert('Please select Subject, Professor, and Section to create a block.');
        return;
      }

      window.isDirty = true;
      
      const emptyMsg = document.getElementById('no-blocks-msg');
      if (emptyMsg) emptyMsg.remove();

      const block = convertToTrayBlock(subject, professor, section);
      blocksContainer.appendChild(block);
      updateBlockCount();
      
      subjectSelect.value = "";
      window.setCustomSelectValue('professor-wrapper', '');
      const triggerText = professorSelect.querySelector('.custom-select-trigger span');
      if (triggerText) {
        triggerText.textContent = 'Select Professor';
        triggerText.style.color = '#94A3B8';
      }
      sectionSelect.value = "";
    });
  }

  window.deleteBlock = function(event, btn) {
    event.stopPropagation();
    const block = btn.closest('.schedule-block');
    if (block) {
      block.remove();
      window.isDirty = true;
      updateBlockCount();
    }
  };

  function updateBlockCount() {
    const count = blocksContainer.querySelectorAll('.schedule-block').length;
    availableCount.textContent = count;

    if (count === 0 && !document.getElementById('no-blocks-msg')) {
      blocksContainer.innerHTML = `<p id="no-blocks-msg" style="font-size: 11.5px; color: #94A3B8; font-weight: 500; text-align: center; line-height: 1.5; margin-top: 16px;">No blocks created yet. Create a block to start scheduling.</p>`;
    }
  }

  // Snapping Drop listeners on Day Columns
  dayColumns.forEach(col => {
    col.addEventListener('dragover', (e) => {
      if (document.body.classList.contains('view-mode')) return;
      e.preventDefault();
      col.classList.add('drag-over');

      // Show live snapping placeholder guide showing actual times
      const rect = col.getBoundingClientRect();
      const dropY = e.clientY - rect.top;
      let slotIndex = Math.round(dropY / SLOT_HEIGHT);
      if (slotIndex < 0) slotIndex = 0;

      const draggedId = document.querySelector('.grid-card.dragging, .schedule-block.dragging')?.id;
      if (!draggedId) return;
      const draggedBlock = document.getElementById(draggedId);
      if (!draggedBlock) return;

      let durationSlots = 3; // default for schedule-block
      if (draggedBlock.classList.contains('grid-card')) {
        durationSlots = parseFloat(draggedBlock.dataset.end) - parseFloat(draggedBlock.dataset.start);
      }

      if (slotIndex + durationSlots > TOTAL_SLOTS) {
        slotIndex = TOTAL_SLOTS - durationSlots;
      }

      showPlaceholder(col, slotIndex, durationSlots);
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
      removePlaceholder();
    });

    col.addEventListener('drop', async (e) => {
      if (document.body.classList.contains('view-mode')) return;
      e.preventDefault();
      col.classList.remove('drag-over');
      removePlaceholder();

      const id = e.dataTransfer.getData('text/plain');
      const block = document.getElementById(id);
      if (!block) return;

      const rect = col.getBoundingClientRect();
      const dropY = e.clientY - rect.top;
      
      // Snap drop offset to nearest 30-min slot (SLOT_HEIGHT = 45px)
      let slotIndex = Math.round(dropY / SLOT_HEIGHT);
      if (slotIndex < 0) slotIndex = 0;

      const day = col.dataset.day;

      // Case 1: Dragging from tray (available blocks)
      if (block.classList.contains('schedule-block')) {
        const divs = block.querySelectorAll('div');
        const subject = divs[0].textContent;
        const professor = divs[1].textContent;
        const section = divs[2].textContent;

        // Default duration is 1.5 hours = 3 slots
        let durationSlots = 3;
        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        // Collision Check (Local Room)
        if (checkOverlap(day, slotIndex, slotIndex + durationSlots, null)) {
          alert('Schedule Conflict: There is already an assigned class in this time frame.');
          return;
        }

        const startTime = slotsToTime(slotIndex);
        const endTime = slotsToTime(slotIndex + durationSlots);

        // Async Professor Conflict Check
        const profCheck = await checkProfessorConflict(professor, day, startTime, endTime);
        if (profCheck.conflict) {
          alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${formatTimeLabel(profCheck.startTime)} to ${formatTimeLabel(profCheck.endTime)} on ${day}.`);
          return;
        }

        const card = createGridCard(null, subject, professor, section, startTime, endTime, 'Default');
        col.appendChild(card);
        block.remove();

        window.isDirty = true;
      }
      // Case 2: Dragging existing grid card
      else if (block.classList.contains('grid-card')) {
        const oldCol = block.closest('.grid-day-column');
        const durationSlots = parseFloat(block.dataset.end) - parseFloat(block.dataset.start);

        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        // Collision Check (Local Room)
        if (checkOverlap(day, slotIndex, slotIndex + durationSlots, block.id)) {
          alert('Schedule Conflict: Moving this card here overlaps with another class.');
          return;
        }

        const startTime = slotsToTime(slotIndex);
        const endTime = slotsToTime(slotIndex + durationSlots);
        const professor = block.querySelector('.grid-card-prof').textContent;

        // Async Professor Conflict Check
        const profCheck = await checkProfessorConflict(professor, day, startTime, endTime);
        if (profCheck.conflict) {
          alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${formatTimeLabel(profCheck.startTime)} to ${formatTimeLabel(profCheck.endTime)} on ${day}.`);
          return;
        }

        col.appendChild(block);
        block.dataset.start = slotIndex;
        block.dataset.end = slotIndex + durationSlots;
        block.style.top = `${slotIndex * SLOT_HEIGHT}px`;
        updateCardSpanClass(block);

        block.querySelector('.grid-card-time-text').textContent = `${formatShortTime(startTime)} - ${formatShortTime(endTime)}`;

        window.isDirty = true;
      }
      updateBlockCount();
    });
  });

  // Tray Drag Over
  blocksContainer.addEventListener('dragover', (e) => {
    if (document.body.classList.contains('view-mode')) return;
    e.preventDefault();
    blocksContainer.classList.add('drag-over');
  });

  blocksContainer.addEventListener('dragleave', () => {
    blocksContainer.classList.remove('drag-over');
  });

  blocksContainer.addEventListener('drop', (e) => {
    if (document.body.classList.contains('view-mode')) return;
    e.preventDefault();
    blocksContainer.classList.remove('drag-over');

    const id = e.dataTransfer.getData('text/plain');
    const block = document.getElementById(id);
    if (block && block.classList.contains('grid-card')) {
      // Revert back to available block list
      const subject = block.querySelector('.grid-card-title').textContent;
      const section = block.querySelector('.grid-card-section').textContent.replace('Sec: ', '');
      const professor = block.querySelector('.grid-card-prof').textContent;

      const trayBlock = convertToTrayBlock(subject, professor, section);
      blocksContainer.appendChild(trayBlock);
      block.remove();

      window.isDirty = true;
      const emptyMsg = document.getElementById('no-blocks-msg');
      if (emptyMsg) emptyMsg.remove();
      updateBlockCount();
    }
  });

  // Fetch and Load saved schedule items
  async function loadRoomSchedule() {
    try {
      const startYear = document.getElementById('academic-year-start-wrapper').dataset.value || '2025';
      const endYear = document.getElementById('academic-year-end-wrapper').dataset.value || '2026';
      const academicYear = `${startYear}-${endYear}`;
      const semester = document.getElementById('semester-wrapper').dataset.value || '1st Semester';

      const res = await fetch(`/api/schedules/room/${roomNum}?academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`);
      if (!res.ok) return;
      const schedules = await res.json();

      resetTableToDefault();

      if (schedules.length === 0) {
        window.isDirty = false;
        return;
      }

      schedules.forEach(s => {
        const day = s.Day_of_Week;
        const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
        if (!col) return;

        const start = s.Start_Time.substring(0, 5);
        const end = s.End_Time.substring(0, 5);

        const card = createGridCard(
          s.Schedule_ID,
          s.Subject_Name,
          s.ProfessorName || s.Professor_Name || 'Not specified',
          s.Section,
          start,
          end,
          s.Color_Theme || 'Default'
        );
        col.appendChild(card);
      });

      if (typeof lucide !== 'undefined') lucide.createIcons();
      window.isDirty = false;
    } catch (err) {
      console.error('Error loading schedule:', err);
    }
  }

  loadRoomSchedule();

  window.preparePrint = function() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = urlParams.get('room') || '204';
    const bldgName = urlParams.get('bldg') || 'Building B';

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleData = [];

    days.forEach(day => {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) return;
      const cards = col.querySelectorAll('.grid-card');
      cards.forEach(card => {
        const subject = card.querySelector('.grid-card-title').textContent;
        const section = card.querySelector('.grid-card-section').textContent.replace('Sec: ', '');
        const professor = card.querySelector('.grid-card-prof').textContent;

        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);

        scheduleData.push({
          day: day,
          startTime: slotsToTime(startSlot),
          endTime: slotsToTime(endSlot),
          subject: subject,
          professor: professor,
          section: section
        });
      });
    });

    const startYear = document.getElementById('academic-year-start-wrapper').dataset.value || '2025';
    const endYear = document.getElementById('academic-year-end-wrapper').dataset.value || '2026';
    const academicYear = `${startYear}-${endYear}`;
    const semester = document.getElementById('semester-wrapper').dataset.value || '1st Semester';

    const printPayload = {
      roomNum: roomNum,
      bldgName: bldgName,
      scheduleData: scheduleData
    };
    localStorage.setItem('print_schedule_data', JSON.stringify(printPayload));

    window.open(`print-schedule.html?room=${roomNum}&bldg=${encodeURIComponent(bldgName)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, '_blank');
  };

  // Mode Toggling
  const saveBtn = document.getElementById('save-schedule-btn');
  let isViewMode = false;
  
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (!isViewMode) {
        try {
          const saved = await saveCurrentSchedule();
          if (!saved) return;
        } catch(e) {
          console.error('Failed to save', e);
          alert('Failed to save the schedule. Please try again.');
          return;
        }
        isViewMode = true;
        document.body.classList.add('view-mode');
        saveBtn.innerHTML = '<i data-lucide="edit-2" style="width: 20px; height: 20px;"></i> Edit Schedule';
        document.querySelectorAll('.schedule-block').forEach(b => b.draggable = false);
        document.querySelectorAll('.grid-card').forEach(b => b.draggable = false);
      } else {
        isViewMode = false;
        document.body.classList.remove('view-mode');
        saveBtn.innerHTML = '<i data-lucide="save" style="width: 20px; height: 20px;"></i> Save Schedule';
        document.querySelectorAll('.schedule-block').forEach(b => b.draggable = true);
        document.querySelectorAll('.grid-card').forEach(b => b.draggable = true);
      }
      if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: saveBtn });
      }
    });
  }

  // Unsaved changes confirmation modal logic
  const backBtn = document.getElementById('editor-back-btn');
  const confirmModal = document.getElementById('unsavedChangesModal');
  const cancelConfirmBtn = document.getElementById('confirm-cancel-btn');
  const discardConfirmBtn = document.getElementById('confirm-discard-btn');
  const saveConfirmBtn = document.getElementById('confirm-save-btn');

  if (backBtn && confirmModal) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.isDirty) {
        window.pendingAction = () => {
          window.location.href = 'master-schedule.html';
        };
        // Show modal
        confirmModal.style.display = 'flex';
        setTimeout(() => {
          confirmModal.classList.add('active');
        }, 10);
        if (typeof lucide !== 'undefined') {
          lucide.createIcons({ root: confirmModal });
        }
      } else {
        window.location.href = 'master-schedule.html';
      }
    });

    const hideModal = () => {
      confirmModal.classList.remove('active');
      setTimeout(() => {
        confirmModal.style.display = 'none';
      }, 300);
    };

    cancelConfirmBtn.addEventListener('click', () => {
      hideModal();
      if (window.revertSelectCallback) {
        window.revertSelectCallback();
        window.revertSelectCallback = null;
      }
      window.pendingAction = null;
    });

    discardConfirmBtn.addEventListener('click', () => {
      window.isDirty = false;
      hideModal();
      window.revertSelectCallback = null;
      if (window.pendingAction) {
        window.pendingAction();
        window.pendingAction = null;
      }
    });

    saveConfirmBtn.addEventListener('click', async () => {
      try {
        const originalHtml = saveConfirmBtn.innerHTML;
        saveConfirmBtn.innerHTML = '<i class="animate-spin" data-lucide="loader-2" style="width:16px;height:16px;margin-right:8px;"></i> Saving...';
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveConfirmBtn });

        const saved = await saveCurrentSchedule();
        if (saved) {
          window.isDirty = false;
          hideModal();
          window.revertSelectCallback = null;
          if (window.pendingAction) {
            window.pendingAction();
            window.pendingAction = null;
          }
        } else {
          saveConfirmBtn.innerHTML = originalHtml;
          if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveConfirmBtn });
        }
      } catch (e) {
        console.error('Failed to save', e);
        alert('An error occurred while saving the schedule.');
        saveConfirmBtn.innerHTML = 'Save & Leave';
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveConfirmBtn });
      }
    });
  }

  // Touch Drag & Drop Polyfill for Mobile and Tablet Devices supporting both available blocks & grid cards
  (function initTouchDragAndDrop() {
    let draggedElement = null;
    let ghostElement = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;
    let activeDropZone = null;

    document.addEventListener('touchstart', function (e) {
      if (document.body.classList.contains('view-mode')) return;

      const block = e.target.closest('.schedule-block, .grid-card');
      if (!block) return;

      if (e.target.closest('.delete-block-btn, .grid-card-delete-btn, .grid-card-resize-handle, .grid-card-color-btn, .color-picker-popover')) return;
      if (block.draggable === false || block.getAttribute('draggable') === 'false') return;

      draggedElement = block;

      const touch = e.touches[0];
      const rect = block.getBoundingClientRect();

      touchOffsetX = touch.clientX - rect.left;
      touchOffsetY = touch.clientY - rect.top;

      ghostElement = block.cloneNode(true);
      ghostElement.style.position = 'fixed';
      ghostElement.style.width = rect.width + 'px';
      ghostElement.style.height = rect.height + 'px';
      ghostElement.style.left = rect.left + 'px';
      ghostElement.style.top = rect.top + 'px';
      ghostElement.style.opacity = '0.8';
      ghostElement.style.pointerEvents = 'none';
      ghostElement.style.zIndex = '10000';
      ghostElement.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
      ghostElement.style.transform = 'scale(1.03)';
      
      document.body.appendChild(ghostElement);
      block.classList.add('dragging');
      document.body.classList.add('dragging-active');
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
      if (!draggedElement) return;

      const touch = e.touches[0];
      const x = touch.clientX - touchOffsetX;
      const y = touch.clientY - touchOffsetY;

      if (ghostElement) {
        ghostElement.style.left = x + 'px';
        ghostElement.style.top = y + 'px';
      }

      const elementUnderTouch = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!elementUnderTouch) return;

      const dropZone = elementUnderTouch.closest('.grid-day-column, #blocks-container');

      if (dropZone !== activeDropZone) {
        if (activeDropZone) {
          activeDropZone.classList.remove('drag-over');
        }
        activeDropZone = dropZone;
        if (activeDropZone) {
          activeDropZone.classList.add('drag-over');
        }
      }

      // Show live placeholder for touch drag
      if (activeDropZone && activeDropZone.classList.contains('grid-day-column')) {
        const rect = activeDropZone.getBoundingClientRect();
        const dropY = touch.clientY - rect.top;
        let slotIndex = Math.round(dropY / SLOT_HEIGHT);
        if (slotIndex < 0) slotIndex = 0;

        let durationSlots = 3;
        if (draggedElement.classList.contains('grid-card')) {
          durationSlots = parseFloat(draggedElement.dataset.end) - parseFloat(draggedElement.dataset.start);
        }

        if (slotIndex + durationSlots > TOTAL_SLOTS) {
          slotIndex = TOTAL_SLOTS - durationSlots;
        }

        showPlaceholder(activeDropZone, slotIndex, durationSlots);
      } else {
        removePlaceholder();
      }

      e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', async function (e) {
      if (!draggedElement) return;

      draggedElement.classList.remove('dragging');
      document.body.classList.remove('dragging-active');
      removePlaceholder();

      if (ghostElement) {
        ghostElement.remove();
        ghostElement = null;
      }

      if (activeDropZone) {
        activeDropZone.classList.remove('drag-over');

        const col = activeDropZone;
        const block = draggedElement;

        // If dropped onto available blocks tray
        if (col.id === 'blocks-container') {
          if (block.classList.contains('grid-card')) {
            const subject = block.querySelector('.grid-card-title').textContent;
            const section = block.querySelector('.grid-card-section').textContent.replace('Sec: ', '');
            const professor = block.querySelector('.grid-card-prof').textContent;

            const trayBlock = convertToTrayBlock(subject, professor, section);
            blocksContainer.appendChild(trayBlock);
            block.remove();

            window.isDirty = true;
            const emptyMsg = document.getElementById('no-blocks-msg');
            if (emptyMsg) emptyMsg.remove();
          }
        } 
        // If dropped onto a day column
        else if (col.classList.contains('grid-day-column')) {
          const rect = col.getBoundingClientRect();
          // Find touch vertical coordinate relative to day column top
          const touch = e.changedTouches[0];
          const dropY = touch.clientY - rect.top;

          let slotIndex = Math.round(dropY / SLOT_HEIGHT);
          if (slotIndex < 0) slotIndex = 0;

          const day = col.dataset.day;

          // Case A: Dropping tray block -> converts to card
          if (block.classList.contains('schedule-block')) {
            const divs = block.querySelectorAll('div');
            const subject = divs[0].textContent;
            const professor = divs[1].textContent;
            const section = divs[2].textContent;

            let durationSlots = 3; // default 1.5h
            if (slotIndex + durationSlots > TOTAL_SLOTS) {
              slotIndex = TOTAL_SLOTS - durationSlots;
            }

            if (checkOverlap(day, slotIndex, slotIndex + durationSlots, null)) {
              alert('Schedule Conflict: There is already an assigned class in this time frame.');
            } else {
              const startTime = slotsToTime(slotIndex);
              const endTime = slotsToTime(slotIndex + durationSlots);

              // Async Professor Conflict Check
              const profCheck = await checkProfessorConflict(professor, day, startTime, endTime);
              if (profCheck.conflict) {
                alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${formatTimeLabel(profCheck.startTime)} to ${formatTimeLabel(profCheck.endTime)} on ${day}.`);
              } else {
                const card = createGridCard(null, subject, professor, section, startTime, endTime, 'Default');
                col.appendChild(card);
                block.remove();

                window.isDirty = true;
              }
            }
          } 
          // Case B: Dragging card to another column or within same column
          else if (block.classList.contains('grid-card')) {
            const durationSlots = parseFloat(block.dataset.end) - parseFloat(block.dataset.start);
            
            if (slotIndex + durationSlots > TOTAL_SLOTS) {
              slotIndex = TOTAL_SLOTS - durationSlots;
            }

            if (checkOverlap(day, slotIndex, slotIndex + durationSlots, block.id)) {
              alert('Schedule Conflict: Moving this card here overlaps with another class.');
            } else {
              const startTime = slotsToTime(slotIndex);
              const endTime = slotsToTime(slotIndex + durationSlots);
              const professor = block.querySelector('.grid-card-prof').textContent;
              const colorTheme = block.dataset.color || 'Default';

              // Async Professor Conflict Check
              const profCheck = await checkProfessorConflict(professor, day, startTime, endTime);
              if (profCheck.conflict) {
                alert(`Schedule Conflict: Professor ${professor} is already scheduled in Room ${profCheck.conflictingRoom} from ${formatTimeLabel(profCheck.startTime)} to ${formatTimeLabel(profCheck.endTime)} on ${day}.`);
              } else {
                col.appendChild(block);
                block.dataset.start = slotIndex;
                block.dataset.end = slotIndex + durationSlots;
                block.style.top = `${slotIndex * SLOT_HEIGHT}px`;
                updateCardSpanClass(block);

                block.querySelector('.grid-card-time-text').textContent = `${formatShortTime(startTime)} - ${formatShortTime(endTime)}`;

                window.isDirty = true;
              }
            }
          }
        }
        updateBlockCount();
      }

      draggedElement = null;
      activeDropZone = null;
    });
  })();

  // Card Detail Modal references and interactions
  const detailModal = document.getElementById('card-detail-modal');
  const modalTitle = document.getElementById('modal-card-title');
  const modalSection = document.getElementById('modal-card-section');
  const modalProf = document.getElementById('modal-card-prof');
  const modalTime = document.getElementById('modal-card-time');
  const modalEditActions = document.getElementById('modal-edit-actions');
  const modalColorPicker = document.getElementById('modal-color-picker');
  const modalDeleteBtn = document.getElementById('modal-delete-btn');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  let activeEditingCard = null;

  function openCardDetailModal(card) {
    activeEditingCard = card;
    const subject = card.querySelector('.grid-card-title').textContent;
    const section = card.querySelector('.grid-card-section').textContent.replace('Sec: ', '');
    const professor = card.querySelector('.grid-card-prof').textContent;
    const timeLabel = card.querySelector('.grid-card-time').textContent;

    modalTitle.textContent = subject;
    modalSection.textContent = section;
    modalProf.textContent = professor;
    modalTime.textContent = timeLabel;

    // Clear previous color picker options
    modalColorPicker.innerHTML = '';

    const isViewMode = document.body.classList.contains('view-mode');

    if (isViewMode) {
      modalEditActions.style.display = 'none';
      modalDeleteBtn.style.display = 'none';
      modalSaveBtn.textContent = 'Close';
    } else {
      modalEditActions.style.display = 'block';
      modalDeleteBtn.style.display = 'inline-flex';
      modalSaveBtn.textContent = 'Done';

      // Load color themes dynamically
      const currentColor = card.dataset.color || 'Default';
      Object.keys(COLOR_PALETTES).forEach(themeName => {
        const dot = document.createElement('button');
        dot.className = 'color-dot';
        dot.style.backgroundColor = COLOR_PALETTES[themeName].accent;
        dot.style.width = '24px';
        dot.style.height = '24px';
        dot.style.borderRadius = '50%';
        dot.style.cursor = 'pointer';
        dot.style.border = themeName === currentColor ? '3px solid #0F172A' : '1.5px solid rgba(15, 23, 42, 0.15)';
        dot.style.padding = '0';
        dot.title = COLOR_PALETTES[themeName].label;

        dot.addEventListener('click', () => {
          applyCardColor(card, themeName);
          window.isDirty = true;
          // Highlight selected dot
          modalColorPicker.querySelectorAll('.color-dot').forEach(el => {
            el.style.border = '1.5px solid rgba(15, 23, 42, 0.15)';
          });
          dot.style.border = '3px solid #0F172A';
        });

        modalColorPicker.appendChild(dot);
      });
    }

    // Open Modal
    detailModal.style.display = 'flex';
    setTimeout(() => {
      detailModal.classList.add('active');
    }, 10);

    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: detailModal });
    }
  }

  const hideDetailModal = () => {
    detailModal.classList.remove('active');
    setTimeout(() => {
      detailModal.style.display = 'none';
    }, 300);
    activeEditingCard = null;
  };

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', hideDetailModal);
  }
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener('click', hideDetailModal);
  }
  if (modalDeleteBtn) {
    modalDeleteBtn.addEventListener('click', () => {
      if (activeEditingCard) {
        deleteGridCardRef(activeEditingCard);
        hideDetailModal();
      }
    });
  }
});
