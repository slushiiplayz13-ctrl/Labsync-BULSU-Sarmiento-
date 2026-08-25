/**
 * LabSync – Master Schedule Page Controller | js/pages/master-schedule.js
 * Refactored in Phase 2 (Scheduling Architecture Refactor)
 * Modularized with:
 *   - js/services/laboratory.service.js
 *   - js/services/settings.service.js
 *   - js/services/curriculum.service.js
 *   - js/scheduling/import.js
 */

(function (global) {
  'use strict';

  let _masterPageInitialized = false;
  let parsedCurriculumData = [];
  global.isFileUploadedToCurriculum = false;

  // 1. Sidebar Scroll Clue
  function initSidebarScrollClue() {
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');

    if (sidebar && scrollClue) {
      if (sidebar.scrollHeight <= sidebar.clientHeight) {
        scrollClue.style.display = 'none';
      }

      sidebar.addEventListener('scroll', () => {
        if (sidebar.scrollTop > 10) {
          scrollClue.style.opacity = '0';
        } else {
          scrollClue.style.opacity = '1';
        }
      });
    }
  }

  // 2. Numeric Input Restrictor
  function initNumericRestrictions() {
    const restrictToNumeric = (inputElement) => {
      if (!inputElement) return;
      inputElement.setAttribute('maxlength', '3');
      inputElement.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
      });
      inputElement.addEventListener('keypress', (e) => {
        if (!/[0-9]/.test(e.key)) {
          e.preventDefault();
          return;
        }
        const selection = window.getSelection ? window.getSelection().toString() : '';
        if (e.target.value.length >= 3 && !selection) {
          e.preventDefault();
        }
      });
      inputElement.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        e.target.value = pasteData.replace(/\D/g, '').slice(0, 3);
      });
    };

    restrictToNumeric(document.getElementById('roomNumberInput'));
    restrictToNumeric(document.getElementById('editRoomNumberInput'));
  }

  // 3. Add Room Modal Logic
  function initAddRoomModal() {
    const addRoomModal = document.getElementById('addRoomModal');
    if (!addRoomModal) return;

    const modalContent = addRoomModal.querySelector('.modal-content');
    const addRoomCardBtn = document.getElementById('addRoomCardBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const submitRoomBtn = document.getElementById('submitRoomBtn');

    function openModal() {
      addRoomModal.style.display = 'flex';
      void addRoomModal.offsetWidth;
      addRoomModal.style.opacity = '1';
      if (modalContent) modalContent.style.transform = 'translateY(0)';
      const input = document.getElementById('roomNumberInput');
      if (input) input.focus();
    }

    function closeModal() {
      addRoomModal.style.opacity = '0';
      if (modalContent) modalContent.style.transform = 'translateY(20px)';
      setTimeout(() => {
        addRoomModal.style.display = 'none';
        const input = document.getElementById('roomNumberInput');
        if (input) input.value = '';
        if (global.setCustomSelectValue) global.setCustomSelectValue('building-select-wrapper', 'Bldg. B');
      }, 300);
    }

    if (addRoomCardBtn) addRoomCardBtn.addEventListener('click', openModal);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);

    addRoomModal.addEventListener('click', (e) => {
      if (e.target === addRoomModal) closeModal();
    });

    if (submitRoomBtn) {
      submitRoomBtn.addEventListener('click', async () => {
        const roomNumInput = document.getElementById('roomNumberInput');
        const roomNum = roomNumInput ? roomNumInput.value.trim() : '';
        const bldgSelect = document.getElementById('building-select-wrapper');
        const bldgNative = document.getElementById('buildingSelect');
        const bldg = (bldgSelect && bldgSelect.dataset ? bldgSelect.dataset.value : null) || (bldgNative ? bldgNative.value : null) || 'Bldg. B';

        const numVal = parseInt(roomNum, 10);
        if (!roomNum || isNaN(numVal) || numVal < 1 || numVal > 999) {
          if (global.showToast) {
            global.showToast('Room number must be between 1 and 999 (up to 3 digits).', 'warning');
          } else {
            alert('Room number must be between 1 and 999.');
          }
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1200);
          }
          return;
        }

        try {
          if (global.laboratoryService && typeof global.laboratoryService.addLaboratory === 'function') {
            await global.laboratoryService.addLaboratory(roomNum, bldg);
          } else {
            const res = await fetch('/api/laboratories/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ roomNumber: roomNum, building: bldg })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to add room');
          }

          loadRooms();
          closeModal();
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
          }
        }
      });
    }
  }

  // 4. Edit Room Modal Logic
  function initEditRoomModal() {
    const editRoomModal = document.getElementById('editRoomModal');
    if (!editRoomModal) return;

    const editModalContent = editRoomModal.querySelector('.modal-content');
    const closeEditModalBtn = document.getElementById('closeEditModalBtn');
    const submitEditRoomBtn = document.getElementById('submitEditRoomBtn');
    const deleteRoomBtn = document.getElementById('deleteRoomBtn');

    function openEditModal(room) {
      const idInput = document.getElementById('editRoomIdInput');
      const numInput = document.getElementById('editRoomNumberInput');
      if (idInput) idInput.value = room.Room_ID;
      if (numInput) numInput.value = room.Room_Number;
      if (global.setCustomSelectValue) {
        global.setCustomSelectValue('edit-building-select-wrapper', room.Building || 'Bldg. B');
      }

      editRoomModal.style.display = 'flex';
      void editRoomModal.offsetWidth;
      editRoomModal.style.opacity = '1';
      if (editModalContent) editModalContent.style.transform = 'translateY(0)';
      if (numInput) numInput.focus();
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: editRoomModal });
      }
    }

    function closeEditModal() {
      editRoomModal.style.opacity = '0';
      if (editModalContent) editModalContent.style.transform = 'translateY(20px)';
      setTimeout(() => {
        editRoomModal.style.display = 'none';
        const idInput = document.getElementById('editRoomIdInput');
        const numInput = document.getElementById('editRoomNumberInput');
        if (idInput) idInput.value = '';
        if (numInput) numInput.value = '';
      }, 300);
    }

    global.openEditModal = openEditModal;
    global.closeEditModal = closeEditModal;

    if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
    editRoomModal.addEventListener('click', (e) => {
      if (e.target === editRoomModal) closeEditModal();
    });

    if (deleteRoomBtn) {
      deleteRoomBtn.addEventListener('click', () => {
        const roomId = document.getElementById('editRoomIdInput')?.value;
        const roomNum = document.getElementById('editRoomNumberInput')?.value.trim() || '';

        if (!roomId) return;
        showDeleteRoomConfirmation(roomId, roomNum);
      });
    }

    if (submitEditRoomBtn) {
      submitEditRoomBtn.addEventListener('click', async () => {
        const roomId = document.getElementById('editRoomIdInput')?.value;
        const roomNumInput = document.getElementById('editRoomNumberInput');
        const roomNum = roomNumInput ? roomNumInput.value.trim() : '';
        const bldgWrapper = document.getElementById('edit-building-select-wrapper');
        const bldgSelect = document.getElementById('editBuildingSelect');
        const bldg = (bldgWrapper && bldgWrapper.dataset ? bldgWrapper.dataset.value : null) || (bldgSelect ? bldgSelect.value : null) || 'Bldg. B';

        const numVal = parseInt(roomNum, 10);
        if (!roomNum || isNaN(numVal) || numVal < 1 || numVal > 999) {
          if (global.showToast) {
            global.showToast('Room number must be between 1 and 999 (up to 3 digits).', 'warning');
          } else {
            alert('Room number must be between 1 and 999.');
          }
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1200);
          }
          return;
        }

        try {
          if (global.laboratoryService && typeof global.laboratoryService.updateLaboratory === 'function') {
            await global.laboratoryService.updateLaboratory(roomId, roomNum, bldg);
          } else {
            const res = await fetch(`/api/laboratories/${roomId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ roomNumber: roomNum, building: bldg })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update room');
          }

          loadRooms();
          closeEditModal();
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
          }
        }
      });
    }
  }

  // 5. Delete Room Confirmation Modal
  function showDeleteRoomConfirmation(roomId, roomNum) {
    const modal = document.createElement('div');
    modal.id = 'delete-confirm-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1100;opacity:0;transition:opacity 0.25s ease;';

    modal.innerHTML = `
      <div style="background:var(--bg-white);color:var(--text-dark);border:1px solid var(--border-light);border-radius:18px;width:90%;max-width:400px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,0.3);transform:translateY(20px);transition:transform 0.25s ease;text-align:center;">
        <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;color:#EF4444;">
          <i data-lucide="trash-2" style="width:28px;height:28px;"></i>
        </div>

        <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 10px 0;">Delete Laboratory Room</h2>

        <p style="margin:0 0 24px 0;font-size:14px;color:var(--text-mid);font-family:var(--font-body);line-height:1.5;">
          Are you sure you want to delete <strong>Room ${roomNum}</strong>? This action will permanently remove the laboratory and all associated schedules and PC units.
        </p>

        <div style="display:flex;gap:12px;font-family:var(--font-body);">
          <button id="cancel-delete-room-btn" style="flex:1;padding:12px;border:1px solid var(--border-light);background:var(--bg-card);border-radius:8px;font-size:14px;font-weight:600;color:var(--text-dark);cursor:pointer;transition:all 0.2s;">Cancel</button>
          <button id="confirm-delete-room-btn" style="flex:1;padding:12px;border:none;background:#EF4444;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(239,68,68,0.25);">Delete</button>
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
      global.lucide.createIcons({ root: modal });
    }

    const closeConfirmModal = () => {
      modal.style.opacity = '0';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => modal.remove(), 250);
    };

    const cancelBtn = document.getElementById('cancel-delete-room-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeConfirmModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeConfirmModal();
    });

    const confirmBtn = document.getElementById('confirm-delete-room-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        try {
          if (global.laboratoryService && typeof global.laboratoryService.deleteLaboratory === 'function') {
            await global.laboratoryService.deleteLaboratory(roomId);
          } else {
            const res = await fetch(`/api/laboratories/${roomId}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete room');
          }

          closeConfirmModal();
          loadRooms();
          if (global.closeEditModal) global.closeEditModal();
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
        }
      });
    }
  }

  // 6. Load Rooms List
  async function loadRooms() {
    try {
      let rooms = [];
      if (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function') {
        rooms = await global.laboratoryService.fetchLaboratories();
      } else {
        const res = await fetch('/api/laboratories', { credentials: 'include' });
        if (res.ok) rooms = await res.json();
      }

      const grid = document.querySelector('.room-selection-grid');
      if (!grid) return;

      const cards = grid.querySelectorAll('.room-select-card:not(#addRoomCardBtn)');
      cards.forEach(c => c.remove());

      rooms.forEach(room => {
        const newCard = document.createElement('div');
        newCard.className = 'room-select-card';
        newCard.onclick = () => {
          window.location.href = `room-schedule-editor.html?room=${room.Room_Number}&bldg=${encodeURIComponent(room.Building)}`;
        };

        newCard.innerHTML = `
          <button class="room-edit-btn" title="Edit Room">
            <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
          </button>
          <div class="rsc-icon">
            <i data-lucide="monitor" style="width: 36px; height: 36px;"></i>
          </div>
          <div class="rsc-title">Room ${room.Room_Number}</div>
          <div class="rsc-subtitle">${room.Building}</div>
        `;

        const editBtn = newCard.querySelector('.room-edit-btn');
        if (editBtn) {
          editBtn.onclick = (e) => {
            e.stopPropagation();
            if (global.openEditModal) global.openEditModal(room);
          };
        }

        grid.appendChild(newCard);
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: newCard });
        }
      });
    } catch (err) {
      console.error('Error loading rooms:', err);
    }
  }

  // 7. Download / Print All Schedules Modal
  function initDownloadModal() {
    const downloadModal = document.getElementById('downloadModal');
    if (!downloadModal) return;

    const downloadModalContent = downloadModal.querySelector('.modal-content');
    const downloadAllSchedulesBtn = document.getElementById('downloadAllSchedulesBtn');
    const closeDownloadModalBtn = document.getElementById('closeDownloadModalBtn');
    const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');

    function openDownloadModal() {
      downloadModal.style.display = 'flex';
      void downloadModal.offsetWidth;
      downloadModal.style.opacity = '1';
      if (downloadModalContent) downloadModalContent.style.transform = 'translateY(0)';
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: downloadModal });
      }
    }

    function closeDownloadModal() {
      downloadModal.style.opacity = '0';
      if (downloadModalContent) downloadModalContent.style.transform = 'translateY(20px)';
      setTimeout(() => {
        downloadModal.style.display = 'none';
      }, 300);
    }

    if (downloadAllSchedulesBtn) {
      downloadAllSchedulesBtn.onclick = (e) => {
        e.preventDefault();
        openDownloadModal();
      };
    }

    if (closeDownloadModalBtn) {
      closeDownloadModalBtn.addEventListener('click', closeDownloadModal);
    }

    downloadModal.addEventListener('click', (e) => {
      if (e.target === downloadModal) closeDownloadModal();
    });

    if (confirmDownloadBtn) {
      confirmDownloadBtn.addEventListener('click', () => {
        const currentYear = new Date().getFullYear();
        const ayWrapper = document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
        const ay = ayWrapper ? (ayWrapper.dataset.value || `${currentYear}-${currentYear + 1}`) : `${currentYear}-${currentYear + 1}`;
        const sem = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        window.open(`print-all-schedules.html?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`, '_blank');
        closeDownloadModal();
      });
    }

    global.printAllSchedules = function () {
      openDownloadModal();
    };
  }

  // 8. Signature Settings Modal
  function initSignatureSettingsModal() {
    const signatureSettingsModal = document.getElementById('signatureSettingsModal');
    if (!signatureSettingsModal) return;

    const openSignatureSettingsBtn = document.getElementById('openSignatureSettingsBtn');
    const closeSignatureModalBtn = document.getElementById('closeSignatureModalBtn');
    const saveSignatureBtn = document.getElementById('saveSignatureBtn');
    const programChairInput = document.getElementById('programChairInput');
    const campusDeanInput = document.getElementById('campusDeanInput');

    async function openSignatureModal() {
      try {
        let settings = {};
        if (global.settingsService && typeof global.settingsService.getSettings === 'function') {
          settings = await global.settingsService.getSettings();
        } else {
          const res = await fetch('/api/settings', { credentials: 'include' });
          if (res.ok) settings = await res.json();
        }
        if (programChairInput) programChairInput.value = settings.program_chair || '';
        if (campusDeanInput) campusDeanInput.value = settings.campus_dean || '';
      } catch (err) {
        console.error('Failed to fetch signature settings:', err);
      }

      signatureSettingsModal.style.display = 'flex';
      void signatureSettingsModal.offsetWidth;
      signatureSettingsModal.style.opacity = '1';
      const dialog = signatureSettingsModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(0)';
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: signatureSettingsModal });
      }
    }

    function closeSignatureModal() {
      signatureSettingsModal.style.opacity = '0';
      const dialog = signatureSettingsModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => {
        signatureSettingsModal.style.display = 'none';
      }, 300);
    }

    if (openSignatureSettingsBtn) openSignatureSettingsBtn.addEventListener('click', openSignatureModal);
    if (closeSignatureModalBtn) closeSignatureModalBtn.addEventListener('click', closeSignatureModal);

    signatureSettingsModal.addEventListener('click', (e) => {
      if (e.target === signatureSettingsModal) closeSignatureModal();
    });

    if (saveSignatureBtn) {
      saveSignatureBtn.addEventListener('click', async () => {
        const chair = programChairInput ? programChairInput.value.trim() : '';
        const dean = campusDeanInput ? campusDeanInput.value.trim() : '';

        if (!chair || !dean) {
          alert('Both signature fields are required.');
          return;
        }

        saveSignatureBtn.disabled = true;
        saveSignatureBtn.textContent = 'Saving...';

        try {
          if (global.settingsService && typeof global.settingsService.saveSettings === 'function') {
            await global.settingsService.saveSettings({ program_chair: chair, campus_dean: dean });
          } else {
            const res = await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ program_chair: chair, campus_dean: dean })
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Failed to save settings');
            }
          }
          closeSignatureModal();
        } catch (err) {
          alert(err.message || 'An error occurred while saving.');
        } finally {
          saveSignatureBtn.disabled = false;
          saveSignatureBtn.innerHTML = '<i data-lucide="check" style="width: 18px; height: 18px;"></i>Save Settings';
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: saveSignatureBtn });
          }
        }
      });
    }
  }

  // 9. Curriculum Import Modal
  function initCurriculumImportModal() {
    const importCurriculumModal = document.getElementById('importCurriculumModal');
    if (!importCurriculumModal) return;

    const openImportCurriculumBtn = document.getElementById('openImportCurriculumBtn');
    const closeImportCurriculumModalBtn = document.getElementById('closeImportCurriculumModalBtn');
    const cancelImportCurriculumBtn = document.getElementById('cancelImportCurriculumBtn');
    const curriculumFileInput = document.getElementById('curriculumFileInput');
    const dropZone = document.getElementById('dropZone');
    const downloadSampleCsvBtn = document.getElementById('downloadSampleCsvBtn');
    const curriculumTableBody = document.getElementById('curriculumTableBody');
    const saveImportCurriculumBtn = document.getElementById('saveImportCurriculumBtn');
    const clearCurriculumBtn = document.getElementById('clearCurriculumBtn');

    async function fetchExistingCurriculum() {
      try {
        let data = [];
        if (global.curriculumService && typeof global.curriculumService.getCurriculum === 'function') {
          data = await global.curriculumService.getCurriculum();
        } else {
          const res = await fetch('/api/curriculum', { credentials: 'include' });
          if (res.ok) data = await res.json();
        }
        if (!global.isFileUploadedToCurriculum) {
          parsedCurriculumData = data;
          renderCurriculumTable();
        }
      } catch (err) {
        console.error('Failed to fetch existing curriculum:', err);
      }
    }

    function escapeHtmlString(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function renderCurriculumTable() {
      if (!curriculumTableBody) return;
      curriculumTableBody.innerHTML = '';

      if (parsedCurriculumData.length === 0) {
        curriculumTableBody.innerHTML = `
          <tr>
            <td colspan="3" style="text-align: center; padding: 32px; color: var(--text-light);">No curriculum data loaded yet. Upload an Excel or CSV file.</td>
          </tr>
        `;
        return;
      }

      parsedCurriculumData.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border-light)';
        tr.innerHTML = `
          <td style="padding: 10px 16px; font-weight: 600; color: var(--text-light); text-align: center; width: 60px;">${index + 1}</td>
          <td style="padding: 10px 16px; font-weight: 700; color: var(--primary-teal);">${escapeHtmlString(item.Subject_Code || item.code || '-')}</td>
          <td style="padding: 10px 16px; font-weight: 600; color: var(--text-dark);">${escapeHtmlString(item.Subject_Name || item.name || '')}</td>
        `;
        curriculumTableBody.appendChild(tr);
      });
    }

    function openImportCurriculumModal() {
      global.isFileUploadedToCurriculum = false;
      fetchExistingCurriculum();
      importCurriculumModal.style.display = 'flex';
      void importCurriculumModal.offsetWidth;
      importCurriculumModal.style.opacity = '1';
      const dialog = importCurriculumModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(0)';
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: importCurriculumModal });
      }
    }

    function closeImportCurriculumModal() {
      importCurriculumModal.style.opacity = '0';
      const dialog = importCurriculumModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => {
        importCurriculumModal.style.display = 'none';
      }, 300);
    }

    if (openImportCurriculumBtn) openImportCurriculumBtn.addEventListener('click', openImportCurriculumModal);
    if (closeImportCurriculumModalBtn) closeImportCurriculumModalBtn.addEventListener('click', closeImportCurriculumModal);
    if (cancelImportCurriculumBtn) cancelImportCurriculumBtn.addEventListener('click', closeImportCurriculumModal);

    importCurriculumModal.addEventListener('click', (e) => {
      if (e.target === importCurriculumModal) closeImportCurriculumModal();
    });

    // Handle file uploads
    function handleFile(file) {
      if (!file) return;
      global.isFileUploadedToCurriculum = true;
      if (global.curriculumImport && typeof global.curriculumImport.processUploadedFile === 'function') {
        global.curriculumImport.processUploadedFile(file, (subjects) => {
          parsedCurriculumData = subjects;
          renderCurriculumTable();
        });
      }
    }

    if (curriculumFileInput) {
      curriculumFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    if (dropZone) {
      ['dragenter', 'dragover'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropZone.style.background = 'rgba(30, 187, 215, 0.15)';
        });
      });
      ['dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, (e) => {
          e.preventDefault();
          dropZone.style.background = 'rgba(30, 187, 215, 0.05)';
        });
      });
      dropZone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (downloadSampleCsvBtn) {
      downloadSampleCsvBtn.addEventListener('click', () => {
        if (global.curriculumImport && typeof global.curriculumImport.downloadSampleCsv === 'function') {
          global.curriculumImport.downloadSampleCsv();
        }
      });
    }

    if (saveImportCurriculumBtn) {
      saveImportCurriculumBtn.addEventListener('click', async () => {
        if (!parsedCurriculumData || parsedCurriculumData.length === 0) {
          alert('Please upload or load subject data before saving.');
          return;
        }

        saveImportCurriculumBtn.disabled = true;
        saveImportCurriculumBtn.textContent = 'Saving...';

        try {
          if (global.curriculumService && typeof global.curriculumService.importCurriculum === 'function') {
            await global.curriculumService.importCurriculum(parsedCurriculumData, 'replace');
          } else {
            const res = await fetch('/api/curriculum/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ subjects: parsedCurriculumData, mode: 'replace' })
            });
            if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || 'Failed to save subjects.');
            }
          }
          alert('Subjects imported and saved successfully!');
          closeImportCurriculumModal();
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
        } finally {
          saveImportCurriculumBtn.disabled = false;
          saveImportCurriculumBtn.textContent = 'Save & Import Subjects';
        }
      });
    }

    if (clearCurriculumBtn) {
      clearCurriculumBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to clear all imported subjects?')) return;
        try {
          if (global.curriculumService && typeof global.curriculumService.deleteCurriculum === 'function') {
            await global.curriculumService.deleteCurriculum();
          } else {
            await fetch('/api/curriculum', { method: 'DELETE', credentials: 'include' });
          }
          parsedCurriculumData = [];
          renderCurriculumTable();
          alert('Subjects cleared successfully.');
        } catch (err) {
          console.error('Error clearing subjects:', err);
        }
      });
    }
  }

  // 10. Master Schedule Page Bootstrap
  function initMasterSchedulePage() {
    if (_masterPageInitialized) return;
    _masterPageInitialized = true;

    initSidebarScrollClue();
    initAddRoomModal();
    initEditRoomModal();
    initNumericRestrictions();
    initDownloadModal();
    initSignatureSettingsModal();
    initCurriculumImportModal();

    const currentYear = new Date().getFullYear();
    if (global.populateCustomYearSelectors) {
      global.populateCustomYearSelectors('academic-year-wrapper', `${currentYear}-${currentYear + 1}`);
    }
    if (global.initCustomSelect) {
      global.initCustomSelect('semester-wrapper');
      global.initCustomSelect('building-select-wrapper');
      global.initCustomSelect('edit-building-select-wrapper');
    }

    loadRooms();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMasterSchedulePage);
  } else {
    initMasterSchedulePage();
  }

  global.initMasterSchedulePage = initMasterSchedulePage;

})(typeof window !== 'undefined' ? window : this);
