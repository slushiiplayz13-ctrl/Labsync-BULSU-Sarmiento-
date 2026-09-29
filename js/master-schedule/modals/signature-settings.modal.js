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
    const chairCharCount = document.getElementById('chairCharCount');
    const deanCharCount = document.getElementById('deanCharCount');

    function updateCharCount(input, countEl, max = 50) {
      if (!input) return;
      if (input.value.length > max) {
        input.value = input.value.slice(0, max);
      }
      if (countEl) {
        countEl.textContent = `${input.value.length}/${max}`;
        if (input.value.length >= max) {
          countEl.style.color = '#ef4444';
          countEl.style.fontWeight = '600';
        } else {
          countEl.style.color = 'var(--text-light)';
          countEl.style.fontWeight = '500';
        }
      }
    }

    if (programChairInput) {
      programChairInput.setAttribute('maxlength', '50');
      programChairInput.addEventListener('input', () => updateCharCount(programChairInput, chairCharCount, 50));
      programChairInput.addEventListener('paste', () => {
        setTimeout(() => updateCharCount(programChairInput, chairCharCount, 50), 0);
      });
    }

    if (campusDeanInput) {
      campusDeanInput.setAttribute('maxlength', '50');
      campusDeanInput.addEventListener('input', () => updateCharCount(campusDeanInput, deanCharCount, 50));
      campusDeanInput.addEventListener('paste', () => {
        setTimeout(() => updateCharCount(campusDeanInput, deanCharCount, 50), 0);
      });
    }

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
        if (programChairInput) {
          programChairInput.value = settings.program_chair || '';
          updateCharCount(programChairInput, chairCharCount, 50);
        }
        if (campusDeanInput) {
          campusDeanInput.value = settings.campus_dean || '';
          updateCharCount(campusDeanInput, deanCharCount, 50);
        }
      } catch (err) {
        console.error('[SignatureSettingsModal] Failed to fetch signature settings:', err);
      }

      signatureSettingsModal.scrollTop = 0;
      const wasAlreadyOpen = signatureSettingsModal.style.display === 'flex' && !signatureSettingsModal.classList.contains('closing');
      signatureSettingsModal.classList.remove('closing');
      signatureSettingsModal.removeAttribute('data-closing');
      signatureSettingsModal.style.display = 'flex';
      signatureSettingsModal.style.pointerEvents = 'auto';
      if (!wasAlreadyOpen && global.setModalOpenState) global.setModalOpenState(true);
      void signatureSettingsModal.offsetWidth;
      signatureSettingsModal.style.opacity = '1';
      const dialog = signatureSettingsModal.querySelector('.modal-content');
      if (dialog) {
        dialog.style.opacity = '1';
        dialog.style.transform = 'translateY(0)';
      }
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: signatureSettingsModal });
      }
    }

    function closeSignatureModal(onClosed) {
      if (signatureSettingsModal.style.display === 'none' && !signatureSettingsModal.classList.contains('closing')) {
        if (typeof onClosed === 'function') onClosed();
        return;
      }
      signatureSettingsModal.classList.add('closing');
      signatureSettingsModal.setAttribute('data-closing', 'true');
      signatureSettingsModal.style.opacity = '0';
      signatureSettingsModal.style.pointerEvents = 'none';
      const dialog = signatureSettingsModal.querySelector('.modal-content');
      if (dialog) {
        dialog.style.opacity = '0';
        dialog.style.transform = 'translateY(15px)';
      }
      // Preserve document.body.classList.contains('modal-open') during the transition to eliminate layout jump/header cutoff
      setTimeout(() => {
        signatureSettingsModal.style.display = 'none';
        signatureSettingsModal.classList.remove('closing');
        signatureSettingsModal.removeAttribute('data-closing');
        signatureSettingsModal.scrollTop = 0;
        if (dialog) {
          dialog.style.transform = '';
          dialog.style.opacity = '';
        }
        if (global.setModalOpenState) {
          global.setModalOpenState(false);
          global.setModalOpenState(null);
        }
        if (saveSignatureBtn) {
          saveSignatureBtn.disabled = false;
          saveSignatureBtn.style.pointerEvents = 'auto';
          saveSignatureBtn.style.opacity = '1';
          saveSignatureBtn.innerHTML = '<i data-lucide="check" style="width: 18px; height: 18px;"></i>Save Settings';
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: saveSignatureBtn });
          }
        }
        if (typeof onClosed === 'function') {
          onClosed();
        }
      }, 250);
    }

    if (openSignatureSettingsBtn) openSignatureSettingsBtn.addEventListener('click', openSignatureModal);
    if (closeSignatureModalBtn) closeSignatureModalBtn.addEventListener('click', () => closeSignatureModal());

    signatureSettingsModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    signatureSettingsModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
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

        if (chair.length > 50 || dean.length > 50) {
          if (global.showToast) {
            global.showToast('Signatory names cannot exceed 50 characters.', 'warning');
          } else {
            alert('Signatory names cannot exceed 50 characters.');
          }
          return;
        }

        saveSignatureBtn.style.pointerEvents = 'none';
        saveSignatureBtn.style.opacity = '0.8';
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
          closeSignatureModal(() => {
            if (global.showToast) {
              global.showToast('Signature settings saved successfully!', 'success');
            }
          });
        } catch (err) {
          alert(err.message || 'An error occurred while saving.');
          saveSignatureBtn.style.pointerEvents = 'auto';
          saveSignatureBtn.style.opacity = '1';
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
