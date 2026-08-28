/**
 * LabSync Signature Settings Modal | js/master-schedule/modals/signature-settings.modal.js
 * Manages official signatories configuration for master schedule print layouts.
 */

(function (global) {
  'use strict';

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
        const setService = global.settingsService;
        if (setService && typeof setService.getSettings === 'function') {
          settings = await setService.getSettings();
        } else {
          const res = await fetch('/api/settings', { credentials: 'include' });
          if (res.ok) settings = await res.json();
        }
        if (programChairInput) programChairInput.value = settings.program_chair || '';
        if (campusDeanInput) campusDeanInput.value = settings.campus_dean || '';
      } catch (err) {
        console.error('[SignatureSettingsModal] Failed to fetch signature settings:', err);
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
          if (global.showToast) {
            global.showToast('Both signature fields are required.', 'warning');
          } else {
            alert('Both signature fields are required.');
          }
          return;
        }

        saveSignatureBtn.disabled = true;
        saveSignatureBtn.textContent = 'Saving...';

        try {
          const setService = global.settingsService;
          if (setService && typeof setService.saveSettings === 'function') {
            await setService.saveSettings({ program_chair: chair, campus_dean: dean });
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
          if (global.showToast) {
            global.showToast('Signature settings saved successfully!', 'success');
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

  const signatureSettingsModal = {
    initSignatureSettingsModal
  };

  global.signatureSettingsModal = signatureSettingsModal;

})(typeof window !== 'undefined' ? window : this);
