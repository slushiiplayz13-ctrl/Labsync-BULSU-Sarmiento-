/**
 * LabSync Curriculum Import Modal | js/master-schedule/curriculum/curriculum-import.modal.js
 * Manages Excel/CSV curriculum upload, preview table rendering, drag & drop zones, and save/clear operations.
 */

(function (global) {
  'use strict';

  let parsedCurriculumData = [];
  let isFileUploadedToCurriculum = false;

  function updateSaveButtonState() {
    const saveImportCurriculumBtn = document.getElementById('saveImportCurriculumBtn');
    if (!saveImportCurriculumBtn) return;

    const canSave = Boolean(isFileUploadedToCurriculum && parsedCurriculumData && parsedCurriculumData.length > 0);
    saveImportCurriculumBtn.disabled = !canSave;
    if (!canSave) {
      saveImportCurriculumBtn.setAttribute('disabled', 'true');
      saveImportCurriculumBtn.setAttribute('aria-disabled', 'true');
      saveImportCurriculumBtn.classList.add('disabled');
      saveImportCurriculumBtn.style.opacity = '0.45';
      saveImportCurriculumBtn.style.cursor = 'not-allowed';
      saveImportCurriculumBtn.style.boxShadow = 'none';
      saveImportCurriculumBtn.style.background = 'var(--primary-teal)';
    } else {
      saveImportCurriculumBtn.removeAttribute('disabled');
      saveImportCurriculumBtn.setAttribute('aria-disabled', 'false');
      saveImportCurriculumBtn.classList.remove('disabled');
      saveImportCurriculumBtn.style.opacity = '1';
      saveImportCurriculumBtn.style.cursor = 'pointer';
      saveImportCurriculumBtn.style.boxShadow = '0 4px 14px rgba(30, 187, 215, 0.35)';
      saveImportCurriculumBtn.style.background = 'var(--primary-teal)';
    }
  }

  function updateDropzoneWithFileInfo(file, count) {
    const desktopText = document.querySelector('.dropzone-text-desktop');
    const mobileText = document.querySelector('.dropzone-text-mobile');
    const subtext = document.querySelector('#dropZone div:last-child');
    if (desktopText && file) {
      desktopText.textContent = `Selected: ${file.name}`;
      desktopText.style.color = 'var(--primary-teal)';
    }
    if (mobileText && file) {
      mobileText.textContent = `Selected: ${file.name}`;
      mobileText.style.color = 'var(--primary-teal)';
    }
    if (subtext && count !== undefined) {
      subtext.textContent = `${count} subjects parsed and ready to import. Click to change file.`;
    }
  }

  function resetDropzoneUI() {
    const desktopText = document.querySelector('.dropzone-text-desktop');
    const mobileText = document.querySelector('.dropzone-text-mobile');
    const subtext = document.querySelector('#dropZone div:last-child');
    if (desktopText) {
      desktopText.textContent = 'Click or Drag & Drop File';
      desktopText.style.color = 'var(--text-dark)';
    }
    if (mobileText) {
      mobileText.textContent = 'Tap to Upload File';
      mobileText.style.color = 'var(--text-dark)';
    }
    if (subtext) {
      subtext.textContent = 'Supports Excel (.xlsx, .xls), CSV, or JSON format';
    }
  }

  function renderCurriculumTable() {
    const curriculumTableBody = document.getElementById('curriculumTableBody');
    if (!curriculumTableBody) return;
    
    if (parsedCurriculumData.length === 0) {
      curriculumTableBody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; padding: 32px; color: var(--text-light);">No curriculum data loaded yet. Upload an Excel or CSV file.</td>
        </tr>
      `;
      return;
    }

    const escapeFn = global.escapeHtml || window.escapeHtml || ((s) => s || '');
    curriculumTableBody.innerHTML = parsedCurriculumData.map((item, index) => `
      <tr style="border-bottom: 1px solid var(--border-light); background: ${index % 2 === 0 ? 'var(--bg-white)' : 'var(--bg-body)'};">
        <td style="padding: 10px 16px; text-align: center; color: var(--text-light); font-weight: 600;">${index + 1}</td>
        <td style="padding: 10px 16px; font-weight: 700; color: var(--primary-teal);">${escapeFn(item.Subject_Code || item.code || '-')}</td>
        <td style="padding: 10px 16px; font-weight: 600; color: var(--text-dark);">${escapeFn(item.Subject_Name || item.name || '')}</td>
      </tr>
    `).join('');
  }

  async function fetchExistingCurriculum() {
    try {
      let data = [];
      const currService = global.curriculumService;
      if (currService && typeof currService.getCurriculum === 'function') {
        data = await currService.getCurriculum();
      } else {
        const res = await fetch('/api/curriculum', { credentials: 'include' });
        if (res.ok) data = await res.json();
      }
      if (!isFileUploadedToCurriculum) {
        parsedCurriculumData = data;
        renderCurriculumTable();
        updateSaveButtonState();
      }
    } catch (err) {
      console.error('[CurriculumImportModal] Failed to fetch existing curriculum:', err);
    }
  }

  function handleFile(file) {
    if (!file) return;
    if (global.curriculumImport && typeof global.curriculumImport.processUploadedFile === 'function') {
      global.curriculumImport.processUploadedFile(file, (subjects) => {
        if (subjects && subjects.length > 0) {
          isFileUploadedToCurriculum = true;
          global.isFileUploadedToCurriculum = true;
          parsedCurriculumData = subjects;
          renderCurriculumTable();
          updateDropzoneWithFileInfo(file, subjects.length);
          updateSaveButtonState();
        } else {
          isFileUploadedToCurriculum = false;
          global.isFileUploadedToCurriculum = false;
          updateSaveButtonState();
        }
      });
    } else {
      isFileUploadedToCurriculum = true;
      global.isFileUploadedToCurriculum = true;
      updateDropzoneWithFileInfo(file, parsedCurriculumData.length);
      updateSaveButtonState();
    }
  }

  function initCurriculumImportModal() {
    const importCurriculumModal = document.getElementById('importCurriculumModal');
    if (!importCurriculumModal) return;

    const openImportCurriculumBtn = document.getElementById('openImportCurriculumBtn');
    const closeImportCurriculumModalBtn = document.getElementById('closeImportCurriculumModalBtn');
    const cancelImportCurriculumBtn = document.getElementById('cancelImportCurriculumBtn');
    const curriculumFileInput = document.getElementById('curriculumFileInput');
    const dropZone = document.getElementById('dropZone');
    const downloadSampleCsvBtn = document.getElementById('downloadSampleCsvBtn');
    const saveImportCurriculumBtn = document.getElementById('saveImportCurriculumBtn');
    const clearCurriculumBtn = document.getElementById('clearCurriculumBtn');

    function openModal() {
      isFileUploadedToCurriculum = false;
      global.isFileUploadedToCurriculum = false;
      resetDropzoneUI();
      if (curriculumFileInput) curriculumFileInput.value = '';
      updateSaveButtonState();
      fetchExistingCurriculum();
      const wasAlreadyOpen = importCurriculumModal.style.display === 'flex' && !importCurriculumModal.classList.contains('closing');
      importCurriculumModal.classList.remove('closing');
      importCurriculumModal.removeAttribute('data-closing');
      importCurriculumModal.style.display = 'flex';
      importCurriculumModal.style.pointerEvents = 'auto';
      if (!wasAlreadyOpen && global.setModalOpenState) global.setModalOpenState(true);
      void importCurriculumModal.offsetWidth;
      importCurriculumModal.style.opacity = '1';
      const dialog = importCurriculumModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(0)';
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: importCurriculumModal });
      }
    }

    function closeModal() {
      if (importCurriculumModal.style.display === 'none' && !importCurriculumModal.classList.contains('closing')) return;
      importCurriculumModal.classList.add('closing');
      importCurriculumModal.setAttribute('data-closing', 'true');
      importCurriculumModal.style.opacity = '0';
      importCurriculumModal.style.pointerEvents = 'none';
      const dialog = importCurriculumModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(15px)';
      setTimeout(() => {
        importCurriculumModal.style.display = 'none';
        importCurriculumModal.classList.remove('closing');
        importCurriculumModal.removeAttribute('data-closing');
        importCurriculumModal.scrollTop = 0;
        if (dialog) dialog.style.transform = '';
        isFileUploadedToCurriculum = false;
        global.isFileUploadedToCurriculum = false;
        resetDropzoneUI();
        if (curriculumFileInput) curriculumFileInput.value = '';
        updateSaveButtonState();
        if (global.setModalOpenState) {
          global.setModalOpenState(false);
          global.setModalOpenState(null);
        }
      }, 250);
    }

    if (openImportCurriculumBtn) openImportCurriculumBtn.addEventListener('click', openModal);
    if (closeImportCurriculumModalBtn) closeImportCurriculumModalBtn.addEventListener('click', closeModal);
    if (cancelImportCurriculumBtn) cancelImportCurriculumBtn.addEventListener('click', closeModal);

    importCurriculumModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    importCurriculumModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    if (curriculumFileInput) {
      curriculumFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }

    if (dropZone) {
      dropZone.addEventListener('click', () => {
        if (curriculumFileInput) curriculumFileInput.click();
      });

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
        e.preventDefault();
        dropZone.style.background = 'rgba(30, 187, 215, 0.05)';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
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
        if (!isFileUploadedToCurriculum || !parsedCurriculumData || parsedCurriculumData.length === 0) {
          if (global.showToast) {
            global.showToast('Please add and upload a subject catalog file before saving.', 'warning');
          } else {
            alert('Please add and upload a subject catalog file before saving.');
          }
          return;
        }

        saveImportCurriculumBtn.disabled = true;
        saveImportCurriculumBtn.setAttribute('disabled', 'true');
        saveImportCurriculumBtn.textContent = 'Saving...';

        try {
          const currService = global.curriculumService;
          if (currService && typeof currService.importCurriculum === 'function') {
            await currService.importCurriculum(parsedCurriculumData, 'replace');
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
          if (global.showToast) {
            global.showToast('Subjects imported and saved successfully!', 'success');
          } else {
            alert('Subjects imported and saved successfully!');
          }
          isFileUploadedToCurriculum = false;
          global.isFileUploadedToCurriculum = false;
          resetDropzoneUI();
          if (curriculumFileInput) curriculumFileInput.value = '';
          updateSaveButtonState();
          closeModal();
        } catch (err) {
          alert(err.message || 'An unexpected error occurred.');
        } finally {
          updateSaveButtonState();
          saveImportCurriculumBtn.textContent = 'Save & Import Subjects';
        }
      });
    }

    if (clearCurriculumBtn) {
      clearCurriculumBtn.addEventListener('click', async () => {
        const confirmFn = global.showConfirmModal || window.showConfirmModal;
        let confirmed = false;
        if (typeof confirmFn === 'function') {
          confirmed = await confirmFn({
            title: 'Clear Imported Subjects',
            message: 'Are you sure you want to clear all imported subjects? This will permanently remove all curriculum entries from the system.',
            confirmText: 'Clear All',
            cancelText: 'Cancel',
            isDestructive: true
          });
        } else {
          confirmed = confirm('Are you sure you want to clear all imported subjects?');
        }

        if (!confirmed) return;

        try {
          const currService = global.curriculumService;
          if (currService && typeof currService.deleteCurriculum === 'function') {
            await currService.deleteCurriculum();
          } else {
            await fetch('/api/curriculum', { method: 'DELETE', credentials: 'include' });
          }
          parsedCurriculumData = [];
          isFileUploadedToCurriculum = false;
          global.isFileUploadedToCurriculum = false;
          resetDropzoneUI();
          if (curriculumFileInput) curriculumFileInput.value = '';
          renderCurriculumTable();
          updateSaveButtonState();
          if (global.showToast) {
            global.showToast('Subjects cleared successfully.', 'success');
          } else {
            alert('Subjects cleared successfully.');
          }
        } catch (err) {
          console.error('[CurriculumImportModal] Error clearing subjects:', err);
        }
      });
    }

    resetDropzoneUI();
    updateSaveButtonState();
  }

  const curriculumImportModal = {
    initCurriculumImportModal,
    renderCurriculumTable,
    fetchExistingCurriculum,
    updateSaveButtonState,
    get isFileUploaded() { return isFileUploadedToCurriculum; }
  };

  global.curriculumImportModal = curriculumImportModal;

})(typeof window !== 'undefined' ? window : this);
