/**
 * LabSync Curriculum Import Modal | js/master-schedule/curriculum/curriculum-import.modal.js
 * Manages Excel/CSV curriculum upload, preview table rendering, drag & drop zones, and save/clear operations.
 */

(function (global) {
  'use strict';

  let parsedCurriculumData = [];
  let isFileUploadedToCurriculum = false;

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
    const curriculumTableBody = document.getElementById('curriculumTableBody');
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
      }
    } catch (err) {
      console.error('[CurriculumImportModal] Failed to fetch existing curriculum:', err);
    }
  }

  function handleFile(file) {
    if (!file) return;
    isFileUploadedToCurriculum = true;
    global.isFileUploadedToCurriculum = true;
    if (global.curriculumImport && typeof global.curriculumImport.processUploadedFile === 'function') {
      global.curriculumImport.processUploadedFile(file, (subjects) => {
        parsedCurriculumData = subjects;
        renderCurriculumTable();
      });
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

    function closeModal() {
      importCurriculumModal.style.opacity = '0';
      const dialog = importCurriculumModal.querySelector('.modal-content');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => {
        importCurriculumModal.style.display = 'none';
      }, 300);
    }

    if (openImportCurriculumBtn) openImportCurriculumBtn.addEventListener('click', openModal);
    if (closeImportCurriculumModalBtn) closeImportCurriculumModalBtn.addEventListener('click', closeModal);
    if (cancelImportCurriculumBtn) cancelImportCurriculumBtn.addEventListener('click', closeModal);

    importCurriculumModal.addEventListener('click', (e) => {
      if (e.target === importCurriculumModal) closeModal();
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
          if (global.showToast) {
            global.showToast('Please upload or load subject data before saving.', 'warning');
          } else {
            alert('Please upload or load subject data before saving.');
          }
          return;
        }

        saveImportCurriculumBtn.disabled = true;
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
          closeModal();
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
          renderCurriculumTable();
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
  }

  const curriculumImportModal = {
    initCurriculumImportModal,
    renderCurriculumTable,
    fetchExistingCurriculum
  };

  global.curriculumImportModal = curriculumImportModal;

})(typeof window !== 'undefined' ? window : this);
