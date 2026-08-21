/**
 * Reset Password Page Controller
 * LabSync - Phase 6A-07J-B2
 *
 * Encapsulates accessibility high-contrast checks, password field visibility toggles,
 * backend token validation, and password reset submission.
 */

(function () {
  'use strict';

  // Apply Accessibility Settings (High Contrast Mode)
  function applyAccessibilitySettings() {
    const savedContrast = localStorage.getItem('labsync-high-contrast') === 'true';
    if (savedContrast) {
      document.documentElement.classList.add('high-contrast');
    }
  }

  // Initialize Lucide icons
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  // Password fields visibility toggles
  function setupToggle(inputEl, toggleEl) {
    if (!inputEl || !toggleEl) return;
    toggleEl.addEventListener('click', () => {
      const isHidden = inputEl.type === 'password';
      inputEl.type = isHidden ? 'text' : 'password';
      toggleEl.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
      toggleEl.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      toggleEl.innerHTML =
        '<i data-lucide="' + (isHidden ? 'eye' : 'eye-off') + '" style="width: 18px; height: 18px;"></i>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    });
  }

  function initPasswordToggles() {
    setupToggle(document.getElementById('newPassword'), document.getElementById('newPasswordToggle'));
    setupToggle(document.getElementById('confirmPassword'), document.getElementById('confirmPasswordToggle'));
  }

  // Token Validation & Password Reset Workflow
  async function initResetWorkflow() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    const loadingState = document.getElementById('loadingState');
    const errorState = document.getElementById('errorState');
    const errorMessage = document.getElementById('errorMessage');
    const formState = document.getElementById('formState');
    const successState = document.getElementById('successState');
    const resetBtn = document.getElementById('resetBtn');

    if (!token) {
      if (loadingState) loadingState.style.display = 'none';
      if (errorMessage) errorMessage.textContent = "No reset token provided. Please request a new link.";
      if (errorState) errorState.style.display = 'flex';
      return;
    }

    // Validate token on backend
    try {
      const response = await fetch(`/api/auth/validate-reset-token?token=${encodeURIComponent(token)}`);
      const data = await response.json();

      if (loadingState) loadingState.style.display = 'none';

      if (response.ok && data.valid) {
        if (formState) formState.style.display = 'flex';
      } else {
        if (errorMessage) errorMessage.textContent = data.error || "This password reset link is invalid or has expired.";
        if (errorState) errorState.style.display = 'flex';
      }
    } catch (err) {
      console.error(err);
      if (loadingState) loadingState.style.display = 'none';
      if (errorMessage) errorMessage.textContent = "Could not connect to the authentication server. Please try again later.";
      if (errorState) errorState.style.display = 'flex';
    }

    // Handle password form submission
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        const newPasswordInput = document.getElementById('newPassword');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        const newPassword = newPasswordInput ? newPasswordInput.value : '';
        const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

        if (!newPassword) {
          alert("Please enter a new password.");
          return;
        }

        if (newPassword.length < 6) {
          alert("Password must be at least 6 characters long.");
          return;
        }

        if (newPassword !== confirmPassword) {
          alert("Passwords do not match.");
          return;
        }

        resetBtn.disabled = true;
        resetBtn.textContent = "Updating...";

        try {
          const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password: newPassword })
          });

          const data = await response.json();

          if (response.ok) {
            if (formState) formState.style.display = 'none';
            if (successState) successState.style.display = 'flex';
          } else {
            alert(data.error || "Failed to reset password.");
            resetBtn.disabled = false;
            resetBtn.textContent = "Update Password";
          }
        } catch (err) {
          console.error(err);
          alert("Server connection failed. Is the server running?");
          resetBtn.disabled = false;
          resetBtn.textContent = "Update Password";
        }
      });
    }
  }

  // Component Initialization
  function initPage() {
    applyAccessibilitySettings();
    initPasswordToggles();
    initResetWorkflow();
  }

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
