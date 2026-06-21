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
    let isDirty = false;
    let pendingAction = null;
    let revertSelectCallback = null;

    function initCustomSelect(wrapperId, onChangeCallback) {
      const wrapper = document.getElementById(wrapperId);
      if (!wrapper) return;
      const trigger = wrapper.querySelector('.custom-select-trigger');
      const display = trigger.querySelector('span');
      const optionsContainer = wrapper.querySelector('.custom-select-dropdown');

      // Set initial value from pre-selected option if dataset.value is not already set
      if (!wrapper.dataset.value) {
        const selectedOpt = optionsContainer.querySelector('.custom-select-option.selected');
        if (selectedOpt) {
          wrapper.dataset.value = selectedOpt.dataset.value;
          display.textContent = selectedOpt.textContent;
        }
      }

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
          if (w !== wrapper) w.classList.remove('open');
        });
        wrapper.classList.toggle('open', !isOpen);
      });

      optionsContainer.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-select-option');
        if (!option) return;

        const val = option.dataset.value;
        const oldVal = wrapper.dataset.value;

        // If the value hasn't changed, do nothing
        if (String(val) === String(oldVal)) {
          wrapper.classList.remove('open');
          return;
        }

        // Intercept selection if editor is dirty (unsaved changes)
        if (isDirty) {
          wrapper.classList.remove('open');

          revertSelectCallback = () => {
            setCustomSelectValue(wrapperId, oldVal);
          };

          pendingAction = () => {
            setCustomSelectValue(wrapperId, val);
            if (onChangeCallback) onChangeCallback(val);
          };

          const confirmModal = document.getElementById('unsavedChangesModal');
          if (confirmModal) {
            confirmModal.style.display = 'flex';
            setTimeout(() => {
              confirmModal.classList.add('active');
            }, 10);
            if (typeof lucide !== 'undefined') {
              lucide.createIcons({ root: confirmModal });
            }
          }
          return;
        }

        const text = option.textContent;
        display.textContent = text;
        wrapper.dataset.value = val;

        optionsContainer.querySelectorAll('.custom-select-option.selected').forEach(o => {
          o.classList.remove('selected');
        });
        option.classList.add('selected');

        wrapper.classList.remove('open');
        if (onChangeCallback) onChangeCallback(val);
      });
    }

    function setCustomSelectValue(wrapperId, value) {
      const wrapper = document.getElementById(wrapperId);
      if (!wrapper) return;
      const display = wrapper.querySelector('.custom-select-trigger span');
      const optionsContainer = wrapper.querySelector('.custom-select-dropdown');
      
      wrapper.dataset.value = value;
      optionsContainer.querySelectorAll('.custom-select-option').forEach(opt => {
        const isMatch = String(opt.dataset.value) === String(value);
        opt.classList.toggle('selected', isMatch);
        if (isMatch) display.textContent = opt.textContent;
      });
    }

    function populateCustomYearSelectors(startWrapperId, endWrapperId, defaultAY = '2025-2026', onChangeCallback) {
      const startWrapper = document.getElementById(startWrapperId);
      const endWrapper = document.getElementById(endWrapperId);
      if (!startWrapper || !endWrapper) return;

      const startOptions = startWrapper.querySelector('.custom-select-dropdown');
      const endOptions = endWrapper.querySelector('.custom-select-dropdown');

      const currentYear = new Date().getFullYear();
      const years = [];
      for (let y = currentYear; y <= currentYear + 10; y++) {
        years.push(y);
      }

      startOptions.innerHTML = '';
      endOptions.innerHTML = '';

      const parts = defaultAY.split('-');
      const defaultStart = parts[0] || '2025';
      const defaultEnd = parts[1] || '2026';

      years.forEach(y => {
        const optStart = document.createElement('div');
        optStart.className = 'custom-select-option' + (String(y) === String(defaultStart) ? ' selected' : '');
        optStart.dataset.value = y;
        optStart.textContent = y;
        startOptions.appendChild(optStart);

        const optEnd = document.createElement('div');
        optEnd.className = 'custom-select-option' + (String(y + 1) === String(defaultEnd) ? ' selected' : '');
        optEnd.dataset.value = y + 1;
        optEnd.textContent = y + 1;
        endOptions.appendChild(optEnd);
      });

      startWrapper.querySelector('.custom-select-trigger span').textContent = defaultStart;
      startWrapper.dataset.value = defaultStart;

      endWrapper.querySelector('.custom-select-trigger span').textContent = defaultEnd;
      endWrapper.dataset.value = defaultEnd;

      initCustomSelect(startWrapperId, (val) => {
        const startVal = parseInt(val);
        setCustomSelectValue(endWrapperId, String(startVal + 1));
        if (onChangeCallback) onChangeCallback();
      });

      initCustomSelect(endWrapperId, () => {
        if (onChangeCallback) onChangeCallback();
      });
    }

    populateCustomYearSelectors('academic-year-start-wrapper', 'academic-year-end-wrapper', initialAY, () => {
        loadRoomSchedule();
    });

    initCustomSelect('semester-wrapper', () => {
        loadRoomSchedule();
    });

    if (initialSem) {
      setCustomSelectValue('semester-wrapper', initialSem);
    }

    // Close custom selects on outer click
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
        w.classList.remove('open');
      });
    });

    document.querySelector('.seh-left h1').textContent = `Room ${roomNum} Schedule`;
    document.querySelector('.seh-left p').textContent = bldgName;
    
    const printRoomTitle = document.getElementById('print-room-title');
    if (printRoomTitle) {
      printRoomTitle.textContent = `${bldgName.toUpperCase()} RM ${roomNum}`;
    }

      async function saveCurrentSchedule() {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const scheduleData = [];
        const rows = document.querySelectorAll('.editor-table tbody tr:not(#add-time-row)');
        
        let validationError = null;
        
        for (let r = 0; r < rows.length; r++) {
            const tr = rows[r];
            const timeCells = tr.querySelectorAll('.editable-time');
            if (timeCells.length < 2) continue;
            const startTime = timeCells[0].value;
            const endTime = timeCells[1].value;
            
            // Validation 1: Ensure both start and end times are selected
            if (!startTime || !endTime) {
                validationError = "Validation Error: Please select both Start Time and End Time for all schedule rows.";
                break;
            }
            
            // Validation 1b: Ensure start time is strictly before end time
            if (startTime >= endTime) {
                validationError = `Validation Error: Invalid time range (${startTime} to ${endTime}). Start Time must be before End Time.`;
                break;
            }
            
            // Validation 2: Ensure there's at least one schedule block dropped in this row
            const tds = tr.querySelectorAll('td');
            let rowHasBlock = false;
            
            for (let i = 1; i < tds.length; i++) {
                if (!tds[i]) continue;
                const block = tds[i].querySelector('.schedule-block');
                if (block) {
                    rowHasBlock = true;
                    const divs = block.querySelectorAll('div');
                    scheduleData.push({
                        day: days[i-1],
                        startTime,
                        endTime,
                        subject: divs[0].textContent,
                        professor: divs[1].textContent,
                        section: divs[2].textContent
                    });
                }
            }
            
            if (!rowHasBlock) {
                validationError = `Validation Error: The time slot ${startTime} - ${endTime} has no assigned schedule blocks for the entire week. Please assign at least one block to this row or delete the empty row.`;
                break;
            }
        }
        
        if (validationError) {
            alert(validationError);
            return false;
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
        isDirty = false;
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
          initCustomSelect('professor-wrapper', (val) => {
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
      const dropZones = document.querySelectorAll('.editor-drop-zone');

      let blockCounter = 0;

      if (!createBtn) return;

      createBtn.addEventListener('click', () => {
        const subject = subjectSelect.value;
        const professor = professorSelect ? (professorSelect.dataset.value || '') : '';
        const section = sectionSelect.value;

        if (!subject || !professor || !section) {
          alert('Please select Subject, Professor, and Section to create a block.');
          return;
        }

        blockCounter++;
        isDirty = true;
        
        const emptyMsg = document.getElementById('no-blocks-msg');
        if (emptyMsg) emptyMsg.remove();

        const block = document.createElement('div');
        block.className = 'schedule-block';
        block.draggable = true;
        block.id = 'block-' + blockCounter;
        block.innerHTML = `
          <div style="font-weight: 700;">${subject}</div>
          <div style="font-size: 10px; opacity: 0.9;">${professor}</div>
          <div style="font-size: 10px; opacity: 0.9;">${section}</div>
          <button class="delete-block-btn" onclick="deleteBlock(event, this)">
            <i data-lucide="x" style="width: 12px; height: 12px; pointer-events: none;"></i>
          </button>
        `;
        if (typeof lucide !== 'undefined') {
          lucide.createIcons({ root: block });
        }

        block.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', block.id);
          setTimeout(() => block.classList.add('dragging'), 0);
          document.body.classList.add('dragging-active');
        });

        block.addEventListener('dragend', () => {
          block.classList.remove('dragging');
          document.body.classList.remove('dragging-active');
          updateBlockCount();
        });

        blocksContainer.appendChild(block);
        updateBlockCount();
        
        subjectSelect.value = "";
        setCustomSelectValue('professor-wrapper', '');
        const triggerText = professorSelect.querySelector('.custom-select-trigger span');
        if (triggerText) {
          triggerText.textContent = 'Select Professor';
          triggerText.style.color = '#94A3B8';
        }
        sectionSelect.value = "";
      });

      window.deleteTimeSlot = function(btn) {
        const tr = btn.closest('tr');
        const blocks = tr.querySelectorAll('.schedule-block');
        const blocksContainer = document.getElementById('blocks-container');
        blocks.forEach(block => {
          blocksContainer.appendChild(block);
        });
        tr.remove();
        isDirty = true;
        
        const count = blocksContainer.querySelectorAll('.schedule-block').length;
        document.getElementById('available-count').textContent = count;
        
        const emptyMsg = document.getElementById('no-blocks-msg');
        if (count === 0 && !emptyMsg) {
           blocksContainer.innerHTML = `<p id="no-blocks-msg" style="font-size: 11.5px; color: #94A3B8; font-weight: 500; text-align: center; line-height: 1.5; margin-top: 16px;">No blocks created yet. Create a block to start scheduling.</p>`;
        } else if (count > 0 && emptyMsg) {
           emptyMsg.remove();
        }
      };

      window.deleteBlock = function(event, btn) {
        event.stopPropagation();
        const block = btn.closest('.schedule-block');
        if (block) {
          const parentZone = block.closest('.editor-drop-zone');
          block.remove();
          isDirty = true;
          
          if (parentZone && !parentZone.querySelector('.schedule-block')) {
            parentZone.classList.remove('has-block');
          }
          
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

      function initDropZone(zone) {
        zone.addEventListener('dragover', (e) => {
          e.preventDefault();
          zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
          zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.classList.remove('drag-over');
          
          const blockId = e.dataTransfer.getData('text/plain');
          const block = document.getElementById(blockId);
          
          if (block) {
            const oldParent = block.closest('.editor-drop-zone');
            
            if (zone.querySelector('.schedule-block')) {
              const existingBlock = zone.querySelector('.schedule-block');
              if (oldParent) {
                 oldParent.appendChild(existingBlock);
                 oldParent.classList.add('has-block');
              } else {
                 blocksContainer.appendChild(existingBlock);
              }
            }
            
            zone.appendChild(block);
            zone.classList.add('has-block');
            isDirty = true;
            
            if (oldParent && oldParent !== zone) {
                if (!oldParent.querySelector('.schedule-block')) {
                    oldParent.classList.remove('has-block');
                }
            }
            updateBlockCount();
          }
        });
      }

      dropZones.forEach(zone => initDropZone(zone));

      // Mode Toggling
      const saveBtn = document.getElementById('save-schedule-btn');
      let isViewMode = false;
      
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          if (!isViewMode) {
            // Save to DB first and validate
            try {
                const saved = await saveCurrentSchedule();
                if (!saved) return; // Abort switching mode if validation fails
            } catch(e) { 
                console.error('Failed to save', e); 
                alert('Failed to save the schedule. Please try again.');
                return;
            }
            
            // Switch to View Mode
            isViewMode = true;
            document.body.classList.add('view-mode');
            saveBtn.innerHTML = '<i data-lucide="edit-2" style="width: 18px; height: 18px;"></i> Edit Schedule';
            
            // Disable dragging
            document.querySelectorAll('.schedule-block').forEach(b => b.draggable = false);
            
          } else {
            // Switch back to Editor Mode
            isViewMode = false;
            document.body.classList.remove('view-mode');
            saveBtn.innerHTML = '<i data-lucide="save" style="width: 18px; height: 18px;"></i> Save Schedule';
            
            // Re-enable dragging
            document.querySelectorAll('.schedule-block').forEach(b => b.draggable = true);
          }
          
          if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: saveBtn });
          }
        });
      }


      const addTimeSlotBtn = document.getElementById('add-time-slot-btn');
      if (addTimeSlotBtn) {
        addTimeSlotBtn.addEventListener('click', () => {
          isDirty = true;
          const tbody = document.querySelector('.editor-table tbody');
          const tr = document.createElement('tr');
          
          let html = `
            <td>
              <div class="editor-time-cell" style="padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 12px;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <input type="time" step="1800" class="editable-time" style="font-size: 13.5px; color: var(--text-dark); font-weight: 600; outline: none; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 10px; background: #fff; cursor: pointer; transition: all 0.2s; font-family: var(--font-body);" onfocus="this.style.borderColor='var(--primary-teal)'; this.style.boxShadow='0 0 0 3px var(--primary-teal-glow)';" onblur="this.style.borderColor='var(--border-light)'; this.style.boxShadow='none';">
                  <input type="time" step="1800" class="editable-time" style="font-size: 13.5px; color: var(--text-dark); font-weight: 600; outline: none; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 10px; background: #fff; cursor: pointer; transition: all 0.2s; font-family: var(--font-body);" onfocus="this.style.borderColor='var(--primary-teal)'; this.style.boxShadow='0 0 0 3px var(--primary-teal-glow)';" onblur="this.style.borderColor='var(--border-light)'; this.style.boxShadow='none';">
                </div>
                <button class="delete-time-btn" onclick="deleteTimeSlot(this)" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; transition: all 0.2s; padding: 0; flex-shrink: 0;" onmouseover="this.style.background='#FEE2E2'; this.querySelector('i').style.color='#EF4444';" onmouseout="this.style.background='transparent'; this.querySelector('i').style.color='#94A3B8';">
                  <i data-lucide="trash-2" style="width: 16px; height: 16px; color: #94A3B8; transition: color 0.2s;"></i>
                </button>
              </div>
            </td>
          `;
          
          for (let i = 0; i < 6; i++) {
            html += `<td><div class="editor-drop-zone">Drop</div></td>`;
          }
          
          tr.innerHTML = html;
          const addTimeRow = document.getElementById('add-time-row');
          tbody.insertBefore(tr, addTimeRow);
          
          if (typeof lucide !== 'undefined') {
            lucide.createIcons({ root: tr });
          }
          
          tr.querySelectorAll('.editor-drop-zone').forEach(zone => initDropZone(zone));
          upgradeTimeInputs();
        });
      }

      blocksContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        blocksContainer.classList.add('drag-over');
      });

      blocksContainer.addEventListener('dragleave', () => {
        blocksContainer.classList.remove('drag-over');
      });

      blocksContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        blocksContainer.classList.remove('drag-over');
        const blockId = e.dataTransfer.getData('text/plain');
        const block = document.getElementById(blockId);
        if (block) {
          const parentZone = block.closest('.editor-drop-zone');
          blocksContainer.appendChild(block);
          
          if (parentZone && !parentZone.querySelector('.schedule-block')) {
             parentZone.classList.remove('has-block');
          }
          
          const emptyMsg = document.getElementById('no-blocks-msg');
          if (emptyMsg) emptyMsg.remove();
          isDirty = true;
          updateBlockCount();
        }
      });

      function upgradeTimeInputs() {
        // Inject styles once
        if (!document.getElementById('ctp-styles')) {
            const style = document.createElement('style');
            style.id = 'ctp-styles';
            style.textContent = `
            .custom-time-picker { position: relative; width: 100%; font-family: var(--font-body); }
            .ctp-display { font-size: 13px; color: var(--text-dark); font-weight: 600; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 24px 6px 8px; background: #fff; cursor: pointer; transition: all 0.2s; user-select: none; position: relative; display: flex; align-items: center; justify-content: space-between; white-space: nowrap; }
            .ctp-display:hover, .custom-time-picker.open .ctp-display { border-color: var(--primary-teal); box-shadow: 0 0 0 3px var(--primary-teal-glow); }
            .ctp-display::after { content: ''; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid #94A3B8; transition: transform 0.2s; }
            .custom-time-picker.open .ctp-display::after { transform: translateY(-50%) rotate(180deg); }
            .ctp-dropdown { position: absolute; top: calc(100% + 6px); left: 0; width: 100%; max-height: 200px; overflow-y: auto; background: #fff; border: 1px solid var(--border-light); border-radius: 8px; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.1); z-index: 1000; opacity: 0; visibility: hidden; transform: translateY(-10px); transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); padding: 4px; }
            .custom-time-picker.open .ctp-dropdown { opacity: 1; visibility: visible; transform: translateY(0); }
            .ctp-dropdown::-webkit-scrollbar { width: 5px; }
            .ctp-dropdown::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
            .ctp-option { padding: 8px 12px; font-size: 13px; font-weight: 500; color: var(--text-dark); cursor: pointer; transition: all 0.15s; border-radius: 6px; margin-bottom: 2px; white-space: nowrap; }
            .ctp-option:last-child { margin-bottom: 0; }
            .ctp-option:hover { background: var(--primary-teal-light); color: var(--primary-teal); }
            .ctp-option.selected { background: var(--primary-teal); color: #fff; font-weight: 600; box-shadow: 0 2px 8px rgba(30,187,215,0.3); }
            `;
            document.head.appendChild(style);
            
            // Close dropdowns when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.custom-time-picker')) {
                    document.querySelectorAll('.custom-time-picker.open').forEach(p => p.classList.remove('open'));
                }
            });
        }

        // We target inputs directly.
        document.querySelectorAll('input[type="time"].editable-time, input[type="text"].editable-time').forEach(input => {
            const currentVal = input.value || '';
            let selectedLabel = 'Select Time';
            
            // Generate options array
            const options = [];
            for(let h=7; h<=21; h++) {
                ['00', '30'].forEach(m => {
                    let hrStr = h.toString().padStart(2, '0');
                    let val = `${hrStr}:${m}`;
                    
                    let ampm = h >= 12 ? 'PM' : 'AM';
                    let dispHr = h > 12 ? h - 12 : h;
                    dispHr = dispHr === 0 ? 12 : dispHr;
                    let dispHrStr = dispHr.toString().padStart(2, '0');
                    let label = `${dispHrStr}:${m} ${ampm}`;
                    
                    options.push({ val, label });
                    if (val === currentVal) selectedLabel = label;
                });
            }

            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-time-picker';
            
            // Create display
            const display = document.createElement('div');
            display.className = 'ctp-display';
            display.textContent = selectedLabel;
            
            // Create hidden input to keep value for saving logic
            const hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.className = 'editable-time';
            hiddenInput.value = currentVal;
            
            // Create dropdown
            const dropdown = document.createElement('div');
            dropdown.className = 'ctp-dropdown';
            
            options.forEach(opt => {
                const optEl = document.createElement('div');
                optEl.className = 'ctp-option' + (opt.val === currentVal ? ' selected' : '');
                optEl.textContent = opt.label;
                optEl.dataset.value = opt.val;
                
                optEl.addEventListener('click', () => {
                    display.textContent = opt.label;
                    hiddenInput.value = opt.val;
                    
                    dropdown.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    optEl.classList.add('selected');
                    
                    wrapper.classList.remove('open');
                    isDirty = true;
                });
                
                dropdown.appendChild(optEl);
            });
            
            display.addEventListener('click', () => {
                const isOpen = wrapper.classList.contains('open');
                // Close all others
                document.querySelectorAll('.custom-time-picker.open').forEach(p => p.classList.remove('open'));
                
                if (!isOpen) {
                    wrapper.classList.add('open');
                    // Scroll selected to view smoothly
                    const selected = dropdown.querySelector('.selected');
                    if (selected) {
                        setTimeout(() => {
                          dropdown.scrollTop = selected.offsetTop - (dropdown.clientHeight / 2) + (selected.clientHeight / 2);
                        }, 10);
                    }
                }
            });
            
            wrapper.appendChild(display);
            wrapper.appendChild(hiddenInput);
            wrapper.appendChild(dropdown);
            
            input.parentNode.replaceChild(wrapper, input);
        });
      }

      // Helper to clear existing rows and insert the default empty 4 rows
      function resetTableToDefault() {
        const tbody = document.querySelector('.editor-table tbody');
        const defaultRows = tbody.querySelectorAll('tr:not(#add-time-row)');
        defaultRows.forEach(r => r.remove());

        const defaultTimes = [
            { start: '07:00', end: '08:30' },
            { start: '08:30', end: '10:00' },
            { start: '10:00', end: '11:30' },
            { start: '11:30', end: '13:00' }
        ];

        defaultTimes.forEach(t => {
            const tr = document.createElement('tr');
            let html = `
              <td>
                <div class="editor-time-cell" style="padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 12px;">
                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <input type="time" value="${t.start}" step="1800" class="editable-time" style="font-size: 13.5px; color: var(--text-dark); font-weight: 600; outline: none; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 10px; background: #fff; cursor: pointer; transition: all 0.2s; font-family: var(--font-body);" onfocus="this.style.borderColor='var(--primary-teal)'; this.style.boxShadow='0 0 0 3px var(--primary-teal-glow)';" onblur="this.style.borderColor='var(--border-light)'; this.style.boxShadow='none';">
                    <input type="time" value="${t.end}" step="1800" class="editable-time" style="font-size: 13.5px; color: var(--text-dark); font-weight: 600; outline: none; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 10px; background: #fff; cursor: pointer; transition: all 0.2s; font-family: var(--font-body);" onfocus="this.style.borderColor='var(--primary-teal)'; this.style.boxShadow='0 0 0 3px var(--primary-teal-glow)';" onblur="this.style.borderColor='var(--border-light)'; this.style.boxShadow='none';">
                  </div>
                  <button class="delete-time-btn" onclick="deleteTimeSlot(this)" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; transition: all 0.2s; padding: 0; flex-shrink: 0;" onmouseover="this.style.background='#FEE2E2'; this.querySelector('i').style.color='#EF4444';" onmouseout="this.style.background='transparent'; this.querySelector('i').style.color='#94A3B8';">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px; color: #94A3B8; transition: color 0.2s;"></i>
                  </button>
                </div>
              </td>
            `;
            for (let i = 0; i < 6; i++) {
                html += `<td><div class="editor-drop-zone">Drop</div></td>`;
            }
            tr.innerHTML = html;
            const addTimeRow = document.getElementById('add-time-row');
            tbody.insertBefore(tr, addTimeRow);
            tr.querySelectorAll('.editor-drop-zone').forEach(zone => initDropZone(zone));
        });

        upgradeTimeInputs();
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: tbody });
        updateBlockCount();
      }

      // Fetch saved schedule and populate grid
      async function loadRoomSchedule() {
        try {
          const startYear = document.getElementById('academic-year-start-wrapper').dataset.value || '2025';
          const endYear = document.getElementById('academic-year-end-wrapper').dataset.value || '2026';
          const academicYear = `${startYear}-${endYear}`;
          const semester = document.getElementById('semester-wrapper').dataset.value || '1st Semester';

          const res = await fetch(`/api/schedules/room/${roomNum}?academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`);
          if (!res.ok) return;
          const schedules = await res.json();
          
          if (schedules.length === 0) {
              resetTableToDefault();
              isDirty = false;
              return; // Keep default empty table
          }
          
          const tbody = document.querySelector('.editor-table tbody');
          const defaultRows = tbody.querySelectorAll('tr:not(#add-time-row)');
          defaultRows.forEach(r => r.remove());
          
          const intervals = new Set();
          schedules.forEach(s => {
            const start = s.Start_Time.substring(0, 5);
            const end = s.End_Time.substring(0, 5);
            intervals.add(`${start}-${end}`);
          });
          
          const sortedIntervals = Array.from(intervals).sort();
          const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          
          sortedIntervals.forEach(interval => {
            const [start, end] = interval.split('-');
            const tr = document.createElement('tr');
            
            let html = `
              <td>
                <div class="editor-time-cell" style="padding: 10px 12px; display: flex; align-items: center; justify-content: center; gap: 12px;">
                  <div style="display: flex; flex-direction: column; gap: 6px;">
                    <input type="time" value="${start}" step="1800" class="editable-time" style="font-size: 13.5px; color: var(--text-dark); font-weight: 600; outline: none; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 10px; background: #fff; cursor: pointer; transition: all 0.2s; font-family: var(--font-body);" onfocus="this.style.borderColor='var(--primary-teal)'; this.style.boxShadow='0 0 0 3px var(--primary-teal-glow)';" onblur="this.style.borderColor='var(--border-light)'; this.style.boxShadow='none';">
                    <input type="time" value="${end}" step="1800" class="editable-time" style="font-size: 13.5px; color: var(--text-dark); font-weight: 600; outline: none; border: 1.5px solid var(--border-light); border-radius: 8px; padding: 6px 10px; background: #fff; cursor: pointer; transition: all 0.2s; font-family: var(--font-body);" onfocus="this.style.borderColor='var(--primary-teal)'; this.style.boxShadow='0 0 0 3px var(--primary-teal-glow)';" onblur="this.style.borderColor='var(--border-light)'; this.style.boxShadow='none';">
                  </div>
                  <button class="delete-time-btn" onclick="deleteTimeSlot(this)" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; transition: all 0.2s; padding: 0; flex-shrink: 0;" onmouseover="this.style.background='#FEE2E2'; this.querySelector('i').style.color='#EF4444';" onmouseout="this.style.background='transparent'; this.querySelector('i').style.color='#94A3B8';">
                    <i data-lucide="trash-2" style="width: 16px; height: 16px; color: #94A3B8; transition: color 0.2s;"></i>
                  </button>
                </div>
              </td>
            `;
            
            for (let i = 0; i < days.length; i++) {
              const day = days[i];
              const match = schedules.find(s => s.Day_of_Week === day && s.Start_Time.substring(0,5) === start && s.End_Time.substring(0,5) === end);
              
              if (match) {
                html += `<td><div class="editor-drop-zone has-block">Drop
                  <div class="schedule-block" draggable="true" id="block-db-${match.Schedule_ID}" ondragstart="event.dataTransfer.setData('text/plain', this.id); setTimeout(() => this.classList.add('dragging'), 0); document.body.classList.add('dragging-active');" ondragend="this.classList.remove('dragging'); document.body.classList.remove('dragging-active'); updateBlockCount();">
                    <div style="font-weight: 700;">${match.Subject_Name}</div>
                    <div style="font-size: 10px; opacity: 0.9;">${match.ProfessorName}</div>
                    <div style="font-size: 10px; opacity: 0.9;">${match.Section}</div>
                    <button class="delete-block-btn" onclick="deleteBlock(event, this)">
                      <i data-lucide="x" style="width: 12px; height: 12px; pointer-events: none;"></i>
                    </button>
                  </div>
                </div></td>`;
              } else {
                html += `<td><div class="editor-drop-zone">Drop</div></td>`;
              }
            }
            
            tr.innerHTML = html;
            const addTimeRow = document.getElementById('add-time-row');
            tbody.insertBefore(tr, addTimeRow);
            
            tr.querySelectorAll('.editor-drop-zone').forEach(zone => initDropZone(zone));
          });
          
          upgradeTimeInputs();
          if (typeof lucide !== 'undefined') lucide.createIcons();
          isDirty = false;
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
        
        // Read data from editor grid
        const rows = document.querySelectorAll('.editor-table tbody tr:not(#add-time-row)');
        rows.forEach(tr => {
            const timeCells = tr.querySelectorAll('input[type="hidden"].editable-time, input[type="time"].editable-time');
            if (timeCells.length < 2) return;
            const startTime = timeCells[0].value;
            const endTime = timeCells[1].value;
            
            const tds = tr.querySelectorAll('td');
            for (let i = 1; i < tds.length; i++) {
                if (!tds[i]) continue;
                const block = tds[i].querySelector('.schedule-block');
                if (block) {
                    const divs = block.querySelectorAll('div');
                    if (divs.length >= 3) {
                        scheduleData.push({
                            day: days[i-1],
                            startTime: startTime,
                            endTime: endTime,
                            subject: divs[0].textContent,
                            professor: divs[1].textContent,
                            section: divs[2].textContent
                        });
                    }
                }
            }
        });

        const startYear = document.getElementById('academic-year-start-wrapper').dataset.value || '2025';
        const endYear = document.getElementById('academic-year-end-wrapper').dataset.value || '2026';
        const academicYear = `${startYear}-${endYear}`;
        const semester = document.getElementById('semester-wrapper').dataset.value || '1st Semester';

        // Save current active state to localStorage so the print preview page can load it
        const printPayload = {
            roomNum: roomNum,
            bldgName: bldgName,
            scheduleData: scheduleData
        };
        localStorage.setItem('print_schedule_data', JSON.stringify(printPayload));

        // Open standalone print preview template in a new window/tab
        window.open(`print-schedule.html?room=${roomNum}&bldg=${encodeURIComponent(bldgName)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, '_blank');
      };

      // Custom select onChangeCallbacks handle reloading of the room schedule automatically.

      // Unsaved changes confirmation modal logic
      const backBtn = document.getElementById('editor-back-btn');
      const confirmModal = document.getElementById('unsavedChangesModal');
      const cancelConfirmBtn = document.getElementById('confirm-cancel-btn');
      const discardConfirmBtn = document.getElementById('confirm-discard-btn');
      const saveConfirmBtn = document.getElementById('confirm-save-btn');

      if (backBtn && confirmModal) {
        backBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (isDirty) {
            pendingAction = () => {
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
            // No changes, navigate away
            window.location.href = 'master-schedule.html';
          }
        });

        // Hide modal helper
        const hideModal = () => {
          confirmModal.classList.remove('active');
          setTimeout(() => {
            confirmModal.style.display = 'none';
          }, 300); // match transition duration
        };

        // Cancel - close modal and do nothing (revert select if applicable)
        cancelConfirmBtn.addEventListener('click', () => {
          hideModal();
          if (revertSelectCallback) {
            revertSelectCallback();
            revertSelectCallback = null;
          }
          pendingAction = null;
        });

        // Discard - execute pending action without saving
        discardConfirmBtn.addEventListener('click', () => {
          isDirty = false;
          hideModal();
          revertSelectCallback = null;
          if (pendingAction) {
            pendingAction();
            pendingAction = null;
          }
        });

        // Save & Switch / Save & Leave - save then execute pending action
        saveConfirmBtn.addEventListener('click', async () => {
          try {
              const originalHtml = saveConfirmBtn.innerHTML;
              saveConfirmBtn.innerHTML = '<i class="animate-spin" data-lucide="loader-2" style="width:16px;height:16px;margin-right:8px;"></i> Saving...';
              if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveConfirmBtn });
              
              const saved = await saveCurrentSchedule();
              if (saved) {
                  isDirty = false;
                  hideModal();
                  revertSelectCallback = null;
                  if (pendingAction) {
                      pendingAction();
                      pendingAction = null;
                  }
              } else {
                  saveConfirmBtn.innerHTML = originalHtml;
                  if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveConfirmBtn });
              }
          } catch(e) { 
              console.error('Failed to save', e);
              alert('An error occurred while saving the schedule.');
              saveConfirmBtn.innerHTML = 'Save & Leave';
              if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveConfirmBtn });
          }
        });
      }
    });
