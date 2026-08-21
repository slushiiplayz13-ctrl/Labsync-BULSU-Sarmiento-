/**
 * Master Schedule Page Controller
 * LabSync - Phase 6A-07I
 *
 * Encapsulates room management, signature settings, curriculum import/export,
 * file parsing (Excel / CSV / JSON), drag-and-drop, and schedule printing.
 */

(function () {
  'use strict';

  // Global state bridges / properties
  window.isFileUploadedToCurriculum = false;
  let parsedCurriculumData = [];

  // Sidebar scroll clue
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

  // Add Room Modal Logic
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
        if (window.setCustomSelectValue) window.setCustomSelectValue('building-select-wrapper', 'Bldg. B');
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

        if (!roomNum) {
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
          }
          return;
        }

        try {
          const res = await fetch('/api/laboratories/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomNumber: roomNum, building: bldg })
          });

          const data = await res.json();

          if (!res.ok) {
            alert(data.error || 'Failed to add room');
            if (roomNumInput) {
              roomNumInput.style.borderColor = '#ef4444';
              setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
            }
            return;
          }

          loadRooms();
          closeModal();
        } catch (err) {
          console.error('Error adding room:', err);
          alert('An unexpected error occurred.');
        }
      });
    }

    window.openModal = openModal;
    window.closeModal = closeModal;
  }

  // Edit Room Modal Logic
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
      if (window.setCustomSelectValue) {
        window.setCustomSelectValue('edit-building-select-wrapper', room.Building || 'Bldg. B');
      }

      editRoomModal.style.display = 'flex';
      void editRoomModal.offsetWidth;
      editRoomModal.style.opacity = '1';
      if (editModalContent) editModalContent.style.transform = 'translateY(0)';
      if (numInput) numInput.focus();
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: editRoomModal });
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

        if (!roomNum) {
          if (roomNumInput) {
            roomNumInput.style.borderColor = '#ef4444';
            setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
          }
          return;
        }

        try {
          const res = await fetch(`/api/laboratories/${roomId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomNumber: roomNum, building: bldg })
          });

          const data = await res.json();

          if (!res.ok) {
            alert(data.error || 'Failed to update room');
            if (roomNumInput) {
              roomNumInput.style.borderColor = '#ef4444';
              setTimeout(() => roomNumInput.style.borderColor = 'var(--primary-teal)', 1000);
            }
            return;
          }

          loadRooms();
          closeEditModal();
        } catch (err) {
          console.error('Error updating room:', err);
          alert('An unexpected error occurred.');
        }
      });
    }

    window.openEditModal = openEditModal;
    window.closeEditModal = closeEditModal;
  }

  // Numeric input restrictor
  function initNumericRestrictions() {
    const restrictToNumeric = (inputElement) => {
      if (!inputElement) return;
      inputElement.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
      inputElement.addEventListener('keypress', (e) => {
        if (!/[0-9]/.test(e.key)) {
          e.preventDefault();
        }
      });
    };

    restrictToNumeric(document.getElementById('roomNumberInput'));
    restrictToNumeric(document.getElementById('editRoomNumberInput'));
  }

  // Custom confirmation modal for room deletion
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
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: modal });
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
          const res = await fetch(`/api/laboratories/${roomId}`, {
            method: 'DELETE'
          });

          const data = await res.json();

          if (!res.ok) {
            alert(data.error || 'Failed to delete room');
            return;
          }

          closeConfirmModal();
          loadRooms();
          if (window.closeEditModal) window.closeEditModal();
        } catch (err) {
          console.error('Error deleting room:', err);
          alert('An unexpected error occurred.');
        }
      });
    }
  }

  // Load existing rooms from database
  async function loadRooms() {
    try {
      const res = await fetch('/api/laboratories');
      if (res.status === 401) {
        console.error('Authentication required to load rooms.');
        return;
      }
      if (!res.ok) throw new Error('Failed to fetch rooms');
      const rooms = await res.json();

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
            if (window.openEditModal) window.openEditModal(room);
          };
        }

        grid.appendChild(newCard);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: newCard });
      });
    } catch (err) {
      console.error('Error loading rooms:', err);
    }
  }

  // Download / Print Modal Logic
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
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: downloadModal });
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

    window.openDownloadModal = openDownloadModal;
    window.closeDownloadModal = closeDownloadModal;
    window.printAllSchedules = function() {
      openDownloadModal();
    };
  }

  // Signature Settings Modal Logic
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
        const res = await fetch('/api/settings');
        if (res.ok) {
          const settings = await res.json();
          if (programChairInput) programChairInput.value = settings.program_chair || '';
          if (campusDeanInput) campusDeanInput.value = settings.campus_dean || '';
        }
      } catch (err) {
        console.error('Failed to fetch signature settings:', err);
      }

      signatureSettingsModal.style.display = 'flex';
      void signatureSettingsModal.offsetWidth;
      signatureSettingsModal.style.opacity = '1';
      const dialog = signatureSettingsModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(0)';
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: signatureSettingsModal });
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
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              program_chair: chair,
              campus_dean: dean
            })
          });

          if (res.ok) {
            closeSignatureModal();
          } else {
            const data = await res.json();
            alert(data.error || 'Failed to save settings');
          }
        } catch (err) {
          console.error('Error saving signature settings:', err);
          alert('An error occurred while saving.');
        } finally {
          saveSignatureBtn.disabled = false;
          saveSignatureBtn.innerHTML = '<i data-lucide="check" style="width: 18px; height: 18px;"></i>Save Settings';
          if (typeof lucide !== 'undefined') lucide.createIcons({ root: saveSignatureBtn });
        }
      });
    }

    window.openSignatureModal = openSignatureModal;
    window.closeSignatureModal = closeSignatureModal;
  }

  // Import Curriculum Modal Logic
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
        const res = await fetch('/api/curriculum');
        if (res.ok) {
          const data = await res.json();
          if (!window.isFileUploadedToCurriculum) {
            parsedCurriculumData = data;
            renderCurriculumTable();
          }
        }
      } catch (err) {
        console.error('Failed to fetch existing curriculum:', err);
      }
    }

    function escapeHtmlString(str) {
      if (window.escapeHtml && typeof window.escapeHtml === 'function') {
        return window.escapeHtml(str);
      }
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
      window.isFileUploadedToCurriculum = false;
      fetchExistingCurriculum();
      importCurriculumModal.style.display = 'flex';
      void importCurriculumModal.offsetWidth;
      importCurriculumModal.style.opacity = '1';
      const dialog = importCurriculumModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(0)';
      if (typeof lucide !== 'undefined') lucide.createIcons({ root: importCurriculumModal });
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

    // File parsing (Excel / CSV / JSON)
    function processUploadedFile(file) {
      if (!file) return;
      window.isFileUploadedToCurriculum = true;
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.json')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            parsedCurriculumData = Array.isArray(data) ? data : (data.subjects || []);
            renderCurriculumTable();
          } catch (err) {
            alert('Failed to parse JSON file.');
          }
        };
        reader.readAsText(file);
        return;
      }

      if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
        readAsTextFallback(file);
        return;
      }

      console.log('[LabSync] processUploadedFile: fileName=', fileName, 'fileSize=', file.size);
      const reader = new FileReader();
      reader.onload = (e) => {
        if (typeof XLSX === 'undefined') {
          console.warn('[LabSync] XLSX library not loaded, attempting text fallback');
          readAsTextFallback(file);
          return;
        }

        try {
          let workbook = null;
          try {
            workbook = XLSX.read(e.target.result, { type: 'array' });
            console.log('[LabSync] SheetJS read OK (array mode)');
          } catch (e1) {
            console.warn('[LabSync] array mode failed:', e1.message);
            try {
              const dataArr = new Uint8Array(e.target.result);
              workbook = XLSX.read(dataArr, { type: 'array' });
              console.log('[LabSync] SheetJS read OK (Uint8Array mode)');
            } catch (e2) {
              console.warn('[LabSync] Uint8Array mode failed:', e2.message);
              const binary = new Uint8Array(e.target.result).reduce((data, byte) => data + String.fromCharCode(byte), '');
              workbook = XLSX.read(binary, { type: 'binary' });
              console.log('[LabSync] SheetJS read OK (binary mode)');
            }
          }

          if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
            console.warn('[LabSync] No sheets found, falling back to text');
            readAsTextFallback(file);
            return;
          }

          console.log('[LabSync] Sheet names:', workbook.SheetNames);

          let allExtractedSubjects = [];
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) continue;
            const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            console.log('[LabSync] Sheet "' + sheetName + '" raw rows count:', jsonRows ? jsonRows.length : 0);
            if (jsonRows && jsonRows.length > 0) {
              console.log('[LabSync] First 5 rows:', JSON.stringify(jsonRows.slice(0, 5)));
              const subjects = parseExcelOrArrayRows(jsonRows);
              console.log('[LabSync] Parsed subjects from sheet "' + sheetName + '":', subjects.length, subjects.slice(0, 3));
              if (subjects.length > 0) {
                allExtractedSubjects = allExtractedSubjects.concat(subjects);
              }
            }
          }

          if (allExtractedSubjects.length > 0) {
            parsedCurriculumData = allExtractedSubjects;
            renderCurriculumTable();
          } else {
            console.warn('[LabSync] Zero subjects parsed from XLSX, trying text fallback');
            readAsTextFallback(file);
          }
        } catch (err) {
          console.warn('[LabSync] SheetJS error, attempting text fallback:', err);
          readAsTextFallback(file);
        }
      };
      reader.onerror = () => { console.error('[LabSync] FileReader error'); readAsTextFallback(file); };
      reader.readAsArrayBuffer(file);
    }

    function readAsTextFallback(file) {
      console.log('[LabSync] readAsTextFallback triggered for:', file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          console.log('[LabSync] Text fallback raw length:', text.length, '| first 300 chars:', text.substring(0, 300));
          parsedCurriculumData = parseCSVText(text);
          console.log('[LabSync] Text fallback parsed count:', parsedCurriculumData.length);
          if (parsedCurriculumData.length === 0) {
            alert('Could not extract valid subject rows from the uploaded file. Please ensure your file contains Subject Code and Subject Name columns.');
          } else {
            renderCurriculumTable();
          }
        } catch (err) {
          console.error('[LabSync] Fallback parse error:', err);
          alert('Failed to parse uploaded file. Please ensure it is a valid Excel or CSV file.');
        }
      };
      reader.readAsText(file);
    }

    function parseExcelOrArrayRows(rows) {
      if (!rows || rows.length === 0) return [];

      let rawRows = rows;
      if (rows.length > 0 && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
        const keys = Object.keys(rows[0]);
        rawRows = [keys].concat(rows.map(obj => keys.map(k => obj[k])));
      }

      const cleanRows = [];
      for (let r of rawRows) {
        if (!r) continue;
        let arr = [];
        if (Array.isArray(r)) {
          arr = r.map(c => (c !== undefined && c !== null) ? String(c).trim() : '');
        } else if (typeof r === 'object') {
          arr = Object.values(r).map(c => (c !== undefined && c !== null) ? String(c).trim() : '');
        } else {
          arr = [String(r).trim()];
        }
        if (arr.some(c => c.length > 0)) {
          cleanRows.push(arr);
        }
      }

      if (cleanRows.length === 0) return [];

      let codeIdx = -1;
      let nameIdx = -1;
      let headerRowIdx = -1;

      for (let i = 0; i < Math.min(cleanRows.length, 25); i++) {
        const row = cleanRows[i];
        let foundCode = -1;
        let foundName = -1;

        row.forEach((cell, idx) => {
          const c = cell.toLowerCase();
          if (c.includes('code') || c.includes('course_no') || c.includes('subj_no') || c.includes('course no') || c.includes('subject no')) {
            foundCode = idx;
          } else if (c.includes('name') || c.includes('title') || c.includes('description') || c.includes('descriptive') || c.includes('course title') || c.includes('subject title')) {
            foundName = idx;
          } else if (c === 'subject' || c === 'course' || c === 'subj') {
            if (foundName === -1) foundName = idx;
          }
        });

        if (foundCode !== -1 || foundName !== -1) {
          headerRowIdx = i;
          codeIdx = foundCode;
          nameIdx = foundName;
          break;
        }
      }

      const result = [];
      const startIdx = (headerRowIdx !== -1) ? headerRowIdx + 1 : 0;

      for (let i = startIdx; i < cleanRows.length; i++) {
        const row = cleanRows[i];
        if (!row || row.length === 0) continue;

        let code = '';
        let name = '';

        if (codeIdx !== -1 && nameIdx !== -1 && codeIdx !== nameIdx) {
          code = row[codeIdx] || '';
          name = row[nameIdx] || '';
        } else if (codeIdx !== -1 && nameIdx === -1) {
          code = row[codeIdx] || '';
          const otherIdx = row.findIndex((cell, idx) => idx !== codeIdx && cell.length > 0);
          if (otherIdx !== -1) name = row[otherIdx];
        } else if (nameIdx !== -1 && codeIdx === -1) {
          name = row[nameIdx] || '';
          const otherIdx = row.findIndex((cell, idx) => idx !== nameIdx && cell.length > 0);
          if (otherIdx !== -1) code = row[otherIdx];
        } else {
          const nonEmp = [];
          row.forEach((cell, idx) => { if (cell.length > 0) nonEmp.push({ val: cell, idx }); });
          
          if (nonEmp.length >= 2) {
            const isFirstNum = !isNaN(Number(nonEmp[0].val)) && nonEmp[0].val.length <= 4;
            if (isFirstNum && nonEmp.length >= 3) {
              code = nonEmp[1].val;
              name = nonEmp[2].val;
            } else {
              code = nonEmp[0].val;
              name = nonEmp[1].val;
            }
          } else if (nonEmp.length === 1) {
            const single = nonEmp[0].val;
            if (single.length > 12 || single.includes(' ')) {
              name = single;
            } else {
              code = single;
            }
          }
        }

        code = code.trim();
        name = name.trim();

        const lowCode = code.toLowerCase();
        const lowName = name.toLowerCase();

        if (!code && !name) continue;
        if (lowCode === 'code' || lowCode === 'subject code' || lowCode === 'course code' || lowCode === '#' || lowCode === 'no' || lowCode === 'no.') continue;
        if (lowName === 'name' || lowName === 'subject name' || lowName === 'course title' || lowName === 'description') continue;
        if (lowCode.includes('bulacan state') || lowCode.includes('curriculum') || lowName.includes('bulacan state')) continue;

        result.push({
          Subject_Code: code,
          Subject_Name: name
        });
      }

      return result;
    }

    function parseCSVText(text) {
      if (!text || !text.trim()) return [];

      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return [];

      const sample = lines.slice(0, 10).join('\n');
      let delimiter = ',';
      if ((sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length) {
        delimiter = '\t';
      } else if ((sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length) {
        delimiter = ';';
      } else if ((sample.match(/\|/g) || []).length > (sample.match(/,/g) || []).length) {
        delimiter = '|';
      }

      const rows = lines.map(line => {
        return line.split(delimiter).map(cell => cell.replace(/^["']|["']$/g, '').trim());
      });

      return parseExcelOrArrayRows(rows);
    }

    if (curriculumFileInput) {
      curriculumFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          processUploadedFile(e.target.files[0]);
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
          processUploadedFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (downloadSampleCsvBtn) {
      downloadSampleCsvBtn.addEventListener('click', () => {
        const csvContent = "data:text/csv;charset=utf-8," 
          + "#,Subject Code,Subject Name\n"
          + "1,CC 102,Introduction to Computing\n"
          + "2,CC 103,Computer Programming 1\n"
          + "3,IT 107*,Human-Computer Interaction\n"
          + "4,IT 106*,Platform Technologies\n"
          + "5,CC 104,Computer Programming 2\n"
          + "6,IT 104*,Discrete Mathematics\n"
          + "7,IT 205*,Quantitative Methods\n"
          + "8,IT 203,Object-Oriented Programming\n"
          + "9,IT 204,Networking 1\n"
          + "10,CC 106,Information Management\n";

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'labsync_subjects_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
          const res = await fetch('/api/curriculum/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subjects: parsedCurriculumData, mode: 'replace' })
          });

          if (res.ok) {
            alert('Subjects imported and saved successfully!');
            closeImportCurriculumModal();
          } else {
            const data = await res.json();
            alert(data.error || 'Failed to save subjects.');
          }
        } catch (err) {
          console.error('Error saving subjects:', err);
          alert('An unexpected error occurred.');
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
          const res = await fetch('/api/curriculum', { method: 'DELETE' });
          if (res.ok) {
            parsedCurriculumData = [];
            renderCurriculumTable();
            alert('Subjects cleared successfully.');
          }
        } catch (err) {
          console.error('Error clearing subjects:', err);
        }
      });
    }

    window.openImportCurriculumModal = openImportCurriculumModal;
    window.closeImportCurriculumModal = closeImportCurriculumModal;
    window.fetchExistingCurriculum = fetchExistingCurriculum;
    window.renderCurriculumTable = renderCurriculumTable;
    window.processUploadedFile = processUploadedFile;
    window.readAsTextFallback = readAsTextFallback;
    window.parseExcelOrArrayRows = parseExcelOrArrayRows;
    window.parseCSVText = parseCSVText;
  }

  // Initialize Page Component & Selectors
  function initPage() {
    initSidebarScrollClue();
    initAddRoomModal();
    initEditRoomModal();
    initNumericRestrictions();
    initDownloadModal();
    initSignatureSettingsModal();
    initCurriculumImportModal();

    const currentYear = new Date().getFullYear();
    if (window.populateCustomYearSelectors) {
      window.populateCustomYearSelectors('academic-year-wrapper', `${currentYear}-${currentYear + 1}`);
    }
    if (window.initCustomSelect) {
      window.initCustomSelect('semester-wrapper');
      window.initCustomSelect('building-select-wrapper');
      window.initCustomSelect('edit-building-select-wrapper');
    }

    loadRooms();
  }

  // Global Bridges
  window.loadRooms = loadRooms;

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
