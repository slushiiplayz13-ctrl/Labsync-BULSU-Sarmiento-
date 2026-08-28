/**
 * LabSync Profile Menu Facade | js/components/profile-menu.js
 * Thin compatibility facade coordinating modular profile components:
 *   - js/components/profile/profile-dropdown.js
 *   - js/components/profile/account-modal.js
 *   - js/components/profile/signature-modal.js
 *   - js/components/profile/password-modal.js
 *   - js/components/profile/help-modal.js
 */

(function (global) {
  'use strict';

  function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = btnEl ? btnEl.querySelector('i') : null;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
      input.type = 'password';
      if (icon) icon.setAttribute('data-lucide', 'eye');
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({
        attrs: { class: 'lucide-icon' },
        nameAttr: 'data-lucide'
      });
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.initProfileDropdown = () => {
    if (global.profileDropdown && typeof global.profileDropdown.initProfileDropdown === 'function') {
      return global.profileDropdown.initProfileDropdown();
    }
  };

  global.openAccountSettings = () => {
    if (global.accountModal && typeof global.accountModal.openAccountSettings === 'function') {
      return global.accountModal.openAccountSettings();
    }
  };

  global.openSignatureModal = () => {
    if (global.signatureModal && typeof global.signatureModal.openSignatureModal === 'function') {
      return global.signatureModal.openSignatureModal();
    }
  };

  global.openChangePasswordModal = () => {
    if (global.passwordModal && typeof global.passwordModal.openChangePasswordModal === 'function') {
      return global.passwordModal.openChangePasswordModal();
    }
  };

  global.openHelpModal = () => {
    if (global.helpModal && typeof global.helpModal.openHelpModal === 'function') {
      return global.helpModal.openHelpModal();
    }
  };

  global.initHelpButtons = () => {
    if (global.helpModal && typeof global.helpModal.initHelpButtons === 'function') {
      return global.helpModal.initHelpButtons();
    }
  };

  global.switchSettingsTab = (tab, btn) => {
    if (global.accountModal && typeof global.accountModal.switchSettingsTab === 'function') {
      return global.accountModal.switchSettingsTab(tab, btn);
    }
  };

  global.togglePasswordVisibility = togglePasswordVisibility;

  // Auto-initialize profile dropdown on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof global.initProfileDropdown === 'function') global.initProfileDropdown();
      if (typeof global.initHelpButtons === 'function') global.initHelpButtons();
    });
  } else {
    if (typeof global.initProfileDropdown === 'function') global.initProfileDropdown();
    if (typeof global.initHelpButtons === 'function') global.initHelpButtons();
  }

})(typeof window !== 'undefined' ? window : this);
