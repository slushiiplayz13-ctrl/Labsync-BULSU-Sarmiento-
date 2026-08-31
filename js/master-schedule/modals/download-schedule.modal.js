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
      downloadAllSchedulesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openDownloadModal();
      });
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
