/**
 * LabSync Schedule Editor Controller | js/scheduling/controller/schedule-editor.controller.js
 * Coordinates page lifecycle, custom select bindings, modals, action toolbars, and dirty state guards.
 */

(function (global) {
  'use strict';

  let activeEditingCard = null;

  /**
   * Prepares draft print payload and opens single room print preview in a new tab.
   */
  function preparePrint() {
    const context = global.slotMath ? global.slotMath.getScheduleContext() : {};
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = context.roomNumber || '204';
    const bldgName = urlParams.get('bldg') || 'Building B';

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const scheduleData = [];
    const timeUtils = global.timeUtils || global.scheduleTimeUtils || {};

    days.forEach(day => {
      const col = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      if (!col) return;
      const cards = col.querySelectorAll('.grid-card');
      cards.forEach(card => {
        const subject = card.querySelector('.grid-card-title')?.textContent.trim() || '';
        const section = (card.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/, '').trim();
        const professor = card.querySelector('.grid-card-prof')?.textContent.trim() || '';

        const startSlot = parseFloat(card.dataset.start);
        const endSlot = parseFloat(card.dataset.end);

        const startTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(startSlot) : '08:00';
        const endTime = typeof timeUtils.slotsToTime === 'function' ? timeUtils.slotsToTime(endSlot) : '10:00';

        scheduleData.push({
          day,
          startTime,
          endTime,
          subject,
          professor,
          section
        });
      });
    });

    const academicYear = context.academicYear;
    const semester = context.semester;

    const printPayload = {
      roomNum,
      bldgName,
      scheduleData
    };
    try {
      localStorage.setItem('print_schedule_data', JSON.stringify(printPayload));
    } catch (e) { }

    window.open(`print-schedule.html?room=${roomNum}&bldg=${encodeURIComponent(bldgName)}&academicYear=${encodeURIComponent(academicYear)}&semester=${encodeURIComponent(semester)}`, '_blank');
  }

  /**
   * Opens card detail & color customization modal.
   * @param {HTMLElement} card
   */
  function openCardDetailModal(card) {
    activeEditingCard = card;
    if (global.scheduleState) global.scheduleState.setActiveEditingCard(card);

    const detailModal = document.getElementById('card-detail-modal');
    if (!detailModal) return;

    const modalTitle = document.getElementById('modal-card-title');
    const modalSection = document.getElementById('modal-card-section');
    const modalProf = document.getElementById('modal-card-prof');
    const modalTime = document.getElementById('modal-card-time');
    const modalEditActions = document.getElementById('modal-edit-actions');
    const modalColorPicker = document.getElementById('modal-color-picker');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');

    const subject = card.querySelector('.grid-card-title')?.textContent.trim() || '';
    const section = (card.querySelector('.grid-card-section')?.textContent || '').replace(/^Sec:\s*/, '').trim();
    const professor = card.querySelector('.grid-card-prof')?.textContent.trim() || '';
    const timeLabel = card.querySelector('.grid-card-time')?.textContent.trim() || '';

    if (modalTitle) modalTitle.textContent = subject;
    if (modalSection) modalSection.textContent = section;
    if (modalProf) modalProf.textContent = professor;
    if (modalTime) modalTime.textContent = timeLabel;

    if (modalColorPicker) modalColorPicker.innerHTML = '';

    const isCurrentViewMode = document.body.classList.contains('view-mode');

    if (isCurrentViewMode) {
      if (modalEditActions) modalEditActions.style.display = 'none';
      if (modalDeleteBtn) modalDeleteBtn.style.display = 'none';
      if (modalSaveBtn) modalSaveBtn.textContent = 'Close';
    } else {
      if (modalEditActions) modalEditActions.style.display = 'block';
      if (modalDeleteBtn) modalDeleteBtn.style.display = 'inline-flex';
      if (modalSaveBtn) modalSaveBtn.textContent = 'Done';

      const currentColor = card.dataset.color || 'Default';
      const palettes = global.COLOR_PALETTES || {};

      Object.keys(palettes).forEach(themeName => {
        const dot = document.createElement('button');
        dot.className = 'color-dot';
        const paletteItem = palettes[themeName];
        const accentColor = paletteItem.light ? paletteItem.light.accent : paletteItem.accent;
        dot.style.backgroundColor = accentColor;
        dot.style.border = themeName === currentColor ? '3px solid #0F172A' : '1.5px solid rgba(15, 23, 42, 0.15)';
        dot.title = paletteItem.label || themeName;

        dot.addEventListener('click', () => {
          if (global.applyCardColor) {
            global.applyCardColor(card, themeName);
          }
          if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
            global.scheduleState.updateSaveButtonState();
          } else {
            if (global.scheduleState) global.scheduleState.isDirty = true;
            global.isDirty = true;
          }
          modalColorPicker.querySelectorAll('.color-dot, .color-wheel-btn').forEach(el => {
            el.style.border = '1.5px solid rgba(15, 23, 42, 0.15)';
          });
          dot.style.border = '3px solid #0F172A';
        });

        if (modalColorPicker) modalColorPicker.appendChild(dot);
      });

      // Custom Color Wheel Picker Button
      const customWheelWrapper = document.createElement('div');
      customWheelWrapper.className = 'color-wheel-btn';
      customWheelWrapper.title = 'Custom Color Wheel';
      const isCustomColor = currentColor.startsWith('#');
      if (isCustomColor) customWheelWrapper.classList.add('selected-theme');

      customWheelWrapper.innerHTML = `<i data-lucide="palette" style="width: 11px; height: 11px; color: #475569; pointer-events: none;"></i>`;

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = isCustomColor ? currentColor : '#1EBBD7';

      const applyCustom = (hexVal) => {
        if (global.applyCardColor) {
          global.applyCardColor(card, hexVal);
        }
        if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
          global.scheduleState.updateSaveButtonState();
        } else {
          if (global.scheduleState) global.scheduleState.isDirty = true;
          global.isDirty = true;
        }
        modalColorPicker.querySelectorAll('.color-dot, .color-wheel-btn').forEach(el => {
          el.style.border = '1.5px solid rgba(15, 23, 42, 0.15)';
          el.classList.remove('selected-theme');
        });
        customWheelWrapper.classList.add('selected-theme');
      };

      colorInput.addEventListener('input', (e) => applyCustom(e.target.value));
      colorInput.addEventListener('change', (e) => applyCustom(e.target.value));

      customWheelWrapper.appendChild(colorInput);
      if (modalColorPicker) modalColorPicker.appendChild(customWheelWrapper);
    }

    detailModal.style.display = 'flex';
    if (global.setModalOpenState) global.setModalOpenState(true);
    setTimeout(() => {
      detailModal.classList.add('active');
    }, 10);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: detailModal });
    }
  }

  /**
   * Closes card detail & color customization modal.
   */
  function closeCardDetailModal() {
    const detailModal = document.getElementById('card-detail-modal');
    if (detailModal) {
      detailModal.classList.remove('active');
      setTimeout(() => {
        detailModal.style.display = 'none';
      }, 200);
      if (global.setModalOpenState) global.setModalOpenState(false);
    }
    activeEditingCard = null;
    if (global.scheduleState) global.scheduleState.setActiveEditingCard(null);
  }

  /**
   * Discards unsaved changes or executes pending navigation callback.
   * @param {Function} [action]
   * @param {Function} [revertCallback]
   */
  function showUnsavedChangesModal(action, revertCallback) {
    if (global.scheduleState) {
      global.scheduleState.setPendingAction(action);
      global.scheduleState.setRevertSelectCallback(revertCallback);
    }
    global.pendingAction = action;
    global.revertSelectCallback = revertCallback;

    const modal = document.getElementById('unsavedChangesModal') || document.getElementById('unsaved-changes-modal');
    if (modal) {
      modal.style.display = 'flex';
      if (global.setModalOpenState) global.setModalOpenState(true);
      setTimeout(() => modal.classList.add('active'), 10);
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: modal });
      }
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      modal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    } else {
      const confirmLeave = confirm('You have unsaved changes. Are you sure you want to discard them?');
      if (confirmLeave) {
        if (global.scheduleState) global.scheduleState.isDirty = false;
        global.isDirty = false;
        if (typeof action === 'function') action();
      } else {
        if (typeof revertCallback === 'function') revertCallback();
      }
    }
  }

  /**
   * Initializes dirty-state guard for page navigation and unloads.
   */
  function setupDirtyGuard() {
    window.addEventListener('beforeunload', (e) => {
      const isDirty = (global.scheduleState && global.scheduleState.isDirty) || global.isDirty;
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Back Button
    const backBtn = document.getElementById('editor-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isDirty = (global.scheduleState && global.scheduleState.isDirty) || global.isDirty;
        if (isDirty) {
          showUnsavedChangesModal(() => {
            window.location.href = 'master-schedule.html';
          });
        } else {
          window.location.href = 'master-schedule.html';
        }
      });
    }

    // Modal Confirmation Action Buttons
    const cancelConfirmBtn = document.getElementById('confirm-cancel-btn');
    const discardConfirmBtn = document.getElementById('confirm-discard-btn');
    const saveConfirmBtn = document.getElementById('confirm-save-btn');

    if (cancelConfirmBtn) {
      cancelConfirmBtn.addEventListener('click', () => {
        const confirmModal = document.getElementById('unsavedChangesModal') || document.getElementById('unsaved-changes-modal');
        if (confirmModal) {
          confirmModal.classList.remove('active');
          setTimeout(() => { confirmModal.style.display = 'none'; }, 200);
          if (global.setModalOpenState) global.setModalOpenState(false);
        }
        const revertCallback = (global.scheduleState && global.scheduleState.getRevertSelectCallback && global.scheduleState.getRevertSelectCallback()) || global.revertSelectCallback;
        if (typeof revertCallback === 'function') revertCallback();
      });
    }

    if (discardConfirmBtn) {
      discardConfirmBtn.addEventListener('click', () => {
        if (global.scheduleState) global.scheduleState.isDirty = false;
        global.isDirty = false;
        const confirmModal = document.getElementById('unsavedChangesModal') || document.getElementById('unsaved-changes-modal');
        if (confirmModal) {
          confirmModal.classList.remove('active');
          setTimeout(() => { confirmModal.style.display = 'none'; }, 200);
          if (global.setModalOpenState) global.setModalOpenState(false);
        }
        const pendingAction = (global.scheduleState && global.scheduleState.getPendingAction && global.scheduleState.getPendingAction()) || global.pendingAction;
        if (typeof pendingAction === 'function') pendingAction();
      });
    }

    if (saveConfirmBtn) {
      saveConfirmBtn.addEventListener('click', async () => {
        const persistence = global.schedulePersistence;
        try {
          if (persistence && typeof persistence.saveCurrentSchedule === 'function') {
            await persistence.saveCurrentSchedule();
          }
          if (global.scheduleState) global.scheduleState.isDirty = false;
          global.isDirty = false;
          const confirmModal = document.getElementById('unsavedChangesModal') || document.getElementById('unsaved-changes-modal');
          if (confirmModal) {
            confirmModal.classList.remove('active');
            setTimeout(() => { confirmModal.style.display = 'none'; }, 200);
            if (global.setModalOpenState) global.setModalOpenState(false);
          }
          const pendingAction = (global.scheduleState && global.scheduleState.getPendingAction && global.scheduleState.getPendingAction()) || global.pendingAction;
          if (typeof pendingAction === 'function') pendingAction();
        } catch (err) {
          console.error('Error saving schedule before leaving:', err);
          if (global.showToast) {
            global.showToast('Failed to save schedule. Please try again.', 'error');
          } else {
            alert('Failed to save schedule.');
          }
        }
      });
    }

    document.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', (e) => {
        const isDirty = (global.scheduleState && global.scheduleState.isDirty) || global.isDirty;
        if (isDirty) {
          const href = link.getAttribute('href');
          if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            e.preventDefault();
            showUnsavedChangesModal(() => {
              window.location.href = href;
            });
          }
        }
      });
    });
  }

  /**
   * Initializes Room Schedule Editor page.
   */
  function initEditor() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomNum = urlParams.get('room') || '204';
    const bldgName = urlParams.get('bldg') || 'Building B';
    const currentYear = new Date().getFullYear();
    const initialAY = urlParams.get('academicYear') || `${currentYear}-${currentYear + 1}`;
    const initialSem = urlParams.get('semester') || '1st Semester';

    const headerLeftH1 = document.querySelector('.seh-left h1');
    const headerLeftP = document.querySelector('.seh-left p');
    if (headerLeftH1) headerLeftH1.textContent = `Room ${roomNum} Schedule`;
    if (headerLeftP) headerLeftP.textContent = bldgName;

    const printRoomTitle = document.getElementById('print-room-title');
    if (printRoomTitle) {
      printRoomTitle.textContent = `${bldgName.toUpperCase()} RM ${roomNum}`;
    }

    const persistence = global.schedulePersistence;

    if (global.populateCustomYearSelectors) {
      global.populateCustomYearSelectors('academic-year-wrapper', initialAY, () => {
        if (persistence && typeof persistence.loadRoomSchedule === 'function') {
          persistence.loadRoomSchedule();
        }
      });
    }

    if (global.initCustomSelect) {
      global.initCustomSelect('semester-wrapper', () => {
        if (persistence && typeof persistence.loadRoomSchedule === 'function') {
          persistence.loadRoomSchedule();
        }
      });
    }

    if (initialSem && global.setCustomSelectValue) {
      global.setCustomSelectValue('semester-wrapper', initialSem);
    }

    // Grid layout styling
    const slotMath = global.slotMath;
    const slotHeight = slotMath ? slotMath.getSlotHeight() : (window.innerWidth <= 768 ? 30 : 36);
    const totalSlots = (slotMath && slotMath.TOTAL_SLOTS) || 27;

    const gridBody = document.querySelector('.calendar-grid-body');
    if (gridBody) {
      gridBody.style.height = `${totalSlots * slotHeight}px`;
    }
    document.querySelectorAll('.grid-day-column').forEach(col => {
      col.style.backgroundSize = `100% ${slotHeight}px`;
      col.style.backgroundImage = `linear-gradient(to bottom, transparent ${slotHeight - 1}px, var(--border-light) ${slotHeight - 1}px, var(--border-light) ${slotHeight}px)`;
    });
    document.querySelectorAll('.grid-time-label').forEach((label, idx) => {
      label.style.top = `${idx * slotHeight}px`;
      label.style.height = `${slotHeight}px`;
    });

    const blocksContainer = document.getElementById('blocks-container');
    const dayColumns = document.querySelectorAll('.grid-day-column');

    // Attach drag and drop
    const dragDrop = global.scheduleDragDrop;
    if (dragDrop) {
      if (typeof dragDrop.initDayColumnDropZones === 'function') {
        dragDrop.initDayColumnDropZones(dayColumns, blocksContainer);
      }
      if (typeof dragDrop.initTrayDropZone === 'function') {
        dragDrop.initTrayDropZone(blocksContainer);
      }
      if (typeof dragDrop.initTouchDragAndDrop === 'function') {
        dragDrop.initTouchDragAndDrop(blocksContainer);
      }
    }

    // Create block button
    const createBtn = document.getElementById('create-block-btn');
    const subjectSelect = document.getElementById('block-subject');
    const professorSelect = document.getElementById('professor-wrapper');
    const sectionSelect = document.getElementById('block-section');

    if (createBtn) {
      createBtn.addEventListener('click', () => {
        const subject = subjectSelect ? subjectSelect.value.trim() : '';
        const professor = professorSelect ? (professorSelect.dataset.value || '') : '';
        const section = sectionSelect ? sectionSelect.value.trim() : '';

        if (!subject || !professor || !section) {
          if (global.showToast) {
            global.showToast('Please select Subject, Professor, and Section to create a block.', 'warning');
          } else {
            alert('Please select Subject, Professor, and Section to create a block.');
          }
          return;
        }

        if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
          global.scheduleState.updateSaveButtonState();
        }

        const emptyMsg = document.getElementById('no-blocks-msg');
        if (emptyMsg) emptyMsg.remove();

        const trayRenderer = global.trayBlockRenderer;
        const block = trayRenderer ? trayRenderer.convertToTrayBlock(subject, professor, section) : null;
        if (blocksContainer && block) blocksContainer.appendChild(block);
        if (trayRenderer) trayRenderer.updateBlockCount();

        if (subjectSelect) subjectSelect.value = '';
        if (global.setCustomSelectValue) global.setCustomSelectValue('professor-wrapper', '');

        const ghostRenderer = global.ghostScheduleRenderer;
        if (ghostRenderer && typeof ghostRenderer.clearGhostBlocks === 'function') {
          ghostRenderer.clearGhostBlocks();
        }

        const triggerText = professorSelect ? professorSelect.querySelector('.custom-select-trigger span') : null;
        if (triggerText) {
          triggerText.textContent = 'Select Professor';
          triggerText.style.color = '#94A3B8';
        }
        if (sectionSelect) sectionSelect.value = '';
        resetSectionSelector();
      });
    }

    // Subject input search autocomplete & custom select wrapper handling
    const blockSubjectInput = document.getElementById('block-subject');
    const subjectWrapper = document.getElementById('subject-wrapper');
    const subjectTrigger = subjectWrapper ? subjectWrapper.querySelector('.custom-select-trigger') : null;

    if (blockSubjectInput && subjectWrapper) {
      const openSubjectDropdown = () => {
        const dropdown = document.getElementById('subject-select-dropdown');
        if (dropdown && dropdown.children.length > 0) {
          document.querySelectorAll('.custom-select-wrapper').forEach(w => {
            if (w !== subjectWrapper) w.classList.remove('open');
          });
          subjectWrapper.classList.add('open');
        }
      };

      blockSubjectInput.addEventListener('focus', openSubjectDropdown);
      blockSubjectInput.addEventListener('click', (e) => {
        e.stopPropagation();
        openSubjectDropdown();
      });

      if (subjectTrigger) {
        subjectTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          openSubjectDropdown();
          blockSubjectInput.focus();
        });
      }

      blockSubjectInput.addEventListener('input', () => {
        const filter = blockSubjectInput.value.toLowerCase().trim();
        const items = subjectWrapper.querySelectorAll('.custom-select-option');
        let matchCount = 0;
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          const isMatch = !filter || text.includes(filter);
          item.style.display = isMatch ? 'flex' : 'none';
          if (isMatch) matchCount++;

          if (filter && text === filter) {
            item.classList.add('selected');
          } else {
            item.classList.remove('selected');
          }
        });

        if (matchCount > 0) {
          subjectWrapper.classList.add('open');
        } else {
          subjectWrapper.classList.remove('open');
        }
      });
    }

    // Modal Action Buttons
    const modalSaveBtn = document.getElementById('modal-save-btn');
    if (modalSaveBtn) modalSaveBtn.addEventListener('click', closeCardDetailModal);

    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    if (modalDeleteBtn) {
      modalDeleteBtn.addEventListener('click', () => {
        if (activeEditingCard && persistence && typeof persistence.deleteGridCardRef === 'function') {
          persistence.deleteGridCardRef(activeEditingCard);
        }
        if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
          global.scheduleState.updateSaveButtonState();
        }
        closeCardDetailModal();
      });
    }

    const modalCloseX = document.getElementById('modal-close-btn');
    if (modalCloseX) modalCloseX.addEventListener('click', closeCardDetailModal);

    const detailModal = document.getElementById('card-detail-modal');
    if (detailModal) {
      detailModal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      detailModal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }

    // Save schedule button
    const saveBtn = document.getElementById('save-schedule-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const state = global.scheduleState;
        if (state && typeof state.hasChanges === 'function' && !state.hasChanges()) {
          return;
        }

        try {
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width: 17px; height: 17px;"></i> Saving...';
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: saveBtn });
          }

          const saved = persistence && typeof persistence.saveCurrentSchedule === 'function'
            ? await persistence.saveCurrentSchedule()
            : true;
          if (!saved) return;
          if (global.showToast) {
            global.showToast('Schedule saved successfully!', 'success');
          }
        } catch (err) {
          console.error('Error saving schedule:', err);
          if (global.showToast) {
            global.showToast('Failed to save schedule. Please try again.', 'error');
          } else {
            alert('Failed to save schedule.');
          }
        } finally {
          saveBtn.innerHTML = '<i data-lucide="save" style="width: 17px; height: 17px;"></i> Save Schedule';
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: saveBtn });
          }
          if (state && typeof state.updateSaveButtonState === 'function') {
            state.updateSaveButtonState();
          } else {
            saveBtn.disabled = false;
          }
        }
      });
    }

    // Print Button
    const printBtn = document.getElementById('print-schedule-btn');
    if (printBtn) {
      printBtn.addEventListener('click', preparePrint);
    }

    // Set up MutationObserver on grid body to monitor any card additions, removals, moves, or attribute modifications
    if (gridBody && typeof MutationObserver !== 'undefined') {
      const gridObserver = new MutationObserver(() => {
        if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
          global.scheduleState.updateSaveButtonState();
        }
      });
      gridObserver.observe(gridBody, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-start', 'data-end', 'data-color', 'style']
      });
    }

    if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
      global.scheduleState.updateSaveButtonState();
    }

    setupDirtyGuard();

    if (persistence) {
      if (typeof persistence.loadProfessors === 'function') persistence.loadProfessors();
      if (typeof persistence.loadCurriculumSubjects === 'function') persistence.loadCurriculumSubjects();
      if (typeof persistence.loadRoomSchedule === 'function') persistence.loadRoomSchedule();
    }
  }

  // Section Selector State & Logic
  let selectedYear = '';
  let selectedLetter = '';
  let selectedBatch = '';

  /**
   * Resets the section selector choices and preview value.
   */
  function resetSectionSelector() {
    selectedYear = '';
    selectedLetter = '';
    selectedBatch = '';
    const hiddenInput = document.getElementById('block-section');
    if (hiddenInput) hiddenInput.value = '';
    const preview = document.getElementById('section-preview');
    if (preview) preview.textContent = '';

    document.querySelectorAll('.sec-choice-btn:not(.sec-add-btn)').forEach(btn => {
      btn.classList.remove('selected', 'active');
    });
  }

  /**
   * Recalculates and updates the composed section code (e.g. 2E1).
   */
  function updateSectionValue() {
    const hiddenInput = document.getElementById('block-section');
    const preview = document.getElementById('section-preview');

    if (selectedYear && selectedLetter && selectedBatch) {
      const code = `${selectedYear}${selectedLetter}${selectedBatch}`;
      if (hiddenInput) hiddenInput.value = code;
      if (preview) preview.textContent = code;
    } else {
      if (hiddenInput) hiddenInput.value = '';
      const partial = `${selectedYear || '?'}${selectedLetter || '?'}${selectedBatch || '?'}`;
      if (preview) preview.textContent = partial === '???' ? '' : partial;
    }
  }

  /**
   * Initializes Year, Section Letter (with '+' custom adder), and Batch buttons.
   */
  function initSectionSelector() {
    const attachBtnHandler = (btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const type = btn.dataset.type;
        const val = btn.dataset.value;
        if (!type || !val) return;

        const group = btn.closest('.simple-btn-group');
        if (group) {
          group.querySelectorAll('.sec-choice-btn:not(.sec-add-btn)').forEach(b => {
            b.classList.remove('selected', 'active');
          });
        }
        btn.classList.add('selected', 'active');

        if (type === 'year') selectedYear = val;
        else if (type === 'letter') selectedLetter = val;
        else if (type === 'batch') selectedBatch = val;

        updateSectionValue();
      });
    };

    document.querySelectorAll('.sec-choice-btn:not(.sec-add-btn)').forEach(attachBtnHandler);

    // '+' Button for adding custom section letter
    const addBtn = document.getElementById('simple-add-letter-btn');
    const letterGroup = document.getElementById('sec-letter-group');

    if (addBtn && letterGroup && !addBtn.dataset.bound) {
      addBtn.dataset.bound = 'true';
      addBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const custom = prompt('Enter section letter (e.g. F, G):');
        if (!custom) return;

        const cleanVal = custom.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
        if (!cleanVal) return;

        let targetBtn = letterGroup.querySelector(`.sec-choice-btn[data-value="${cleanVal}"]`);
        if (!targetBtn) {
          targetBtn = document.createElement('button');
          targetBtn.type = 'button';
          targetBtn.className = 'sec-choice-btn';
          targetBtn.dataset.type = 'letter';
          targetBtn.dataset.value = cleanVal;
          targetBtn.textContent = cleanVal;
          attachBtnHandler(targetBtn);
          letterGroup.insertBefore(targetBtn, addBtn);
        }

        letterGroup.querySelectorAll('.sec-choice-btn:not(.sec-add-btn)').forEach(b => {
          b.classList.remove('selected', 'active');
        });
        targetBtn.classList.add('selected', 'active');
        selectedLetter = cleanVal;
        updateSectionValue();
      });
    }
  }

  const scheduleEditorController = {
    initEditor,
    preparePrint,
    openCardDetailModal,
    closeCardDetailModal,
    showUnsavedChangesModal,
    setupDirtyGuard,
    initSectionSelector,
    resetSectionSelector,
    updateSectionValue
  };

  global.scheduleEditorController = scheduleEditorController;
  global.initEditor = initEditor;
  global.preparePrint = preparePrint;
  global.openCardDetailModal = openCardDetailModal;
  global.closeCardDetailModal = closeCardDetailModal;
  global.showUnsavedChangesModal = showUnsavedChangesModal;
  global.resetSectionSelector = resetSectionSelector;
  global.initSectionSelector = initSectionSelector;

})(typeof window !== 'undefined' ? window : this);


