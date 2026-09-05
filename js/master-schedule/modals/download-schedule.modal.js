/**
 * LabSync Download Schedule Modal | js/master-schedule/modals/download-schedule.modal.js
 * Controls bulk schedule export and print modal for academic years and semesters.
 */

(function (global) {
  'use strict';

  function initDownloadModal() {
    const downloadModal = document.getElementById('downloadModal');
    if (!downloadModal) return;

    const downloadModalContent = downloadModal.querySelector('.modal-content');
    const downloadAllSchedulesBtn = document.getElementById('downloadAllSchedulesBtn');
    const closeDownloadModalBtn = document.getElementById('closeDownloadModalBtn');
    const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');

    function openDownloadModal() {
      const wasAlreadyOpen = downloadModal.style.display === 'flex' && !downloadModal.classList.contains('closing');
      downloadModal.classList.remove('closing');
      downloadModal.removeAttribute('data-closing');
      downloadModal.style.display = 'flex';
      downloadModal.style.pointerEvents = 'auto';
      if (!wasAlreadyOpen && global.setModalOpenState) global.setModalOpenState(true);
      void downloadModal.offsetWidth;
      downloadModal.style.opacity = '1';
      if (downloadModalContent) downloadModalContent.style.transform = 'translateY(0)';
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: downloadModal });
      }
    }

    function closeDownloadModal() {
      if (downloadModal.style.display === 'none' && !downloadModal.classList.contains('closing')) return;
      downloadModal.classList.add('closing');
      downloadModal.setAttribute('data-closing', 'true');
      downloadModal.style.opacity = '0';
      downloadModal.style.pointerEvents = 'none';
      if (downloadModalContent) downloadModalContent.style.transform = 'translateY(20px)';
      if (global.setModalOpenState) global.setModalOpenState(false);
      setTimeout(() => {
        downloadModal.style.display = 'none';
        downloadModal.classList.remove('closing');
        downloadModal.removeAttribute('data-closing');
        if (global.setModalOpenState) global.setModalOpenState(null);
      }, 300);
    }

    if (downloadAllSchedulesBtn) {
      downloadAllSchedulesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDownloadModal();
      });
    }

    if (closeDownloadModalBtn) {
      closeDownloadModalBtn.addEventListener('click', closeDownloadModal);
    }

    downloadModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    downloadModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    if (confirmDownloadBtn) {
      confirmDownloadBtn.addEventListener('click', () => {
        const currentYear = new Date().getFullYear();
        const ayWrapper = document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
        const ay = ayWrapper ? (ayWrapper.dataset.value || `${currentYear}-${currentYear + 1}`) : `${currentYear}-${currentYear + 1}`;
        const sem = document.getElementById('semester-wrapper')?.dataset.value || '1st Semester';
        window.open(`print-all-schedules.html?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}&download=true`, '_blank');
        closeDownloadModal();
      });
    }

    global.printAllSchedules = openDownloadModal;
  }

  const downloadScheduleModal = {
    initDownloadModal
  };

  global.downloadScheduleModal = downloadScheduleModal;

})(typeof window !== 'undefined' ? window : this);
