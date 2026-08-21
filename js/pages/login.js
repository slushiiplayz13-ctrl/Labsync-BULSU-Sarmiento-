/**
 * Login Page Controller
 * LabSync - Phase 6A-07J-B1
 *
 * Encapsulates login authentication, password recovery modal, about modal,
 * email clear synchronization, password visibility toggle, error handling, and role-based redirects.
 */

(function () {
  'use strict';

  // Initialize Lucide icons on page load
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  // Recover Password Modal Controller
  function initRecoverModal() {
    const forgotLink = document.querySelector('.forgot-link');
    const recoverModal = document.getElementById('recoverModal');
    const closeRecoverModalBtn = document.getElementById('closeRecoverModalBtn');
    const sendRecoverBtn = document.getElementById('sendRecoverBtn');
    const recoverEmailInput = document.getElementById('recoverEmail');
    const emailInput = document.getElementById('email');

    if (!forgotLink || !recoverModal || !closeRecoverModalBtn || !sendRecoverBtn || !recoverEmailInput) return;

    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (emailInput && emailInput.value.trim()) {
        recoverEmailInput.value = emailInput.value.trim();
      }
      recoverModal.classList.add('active');
      recoverEmailInput.focus();
    });

    function closeModal() {
      recoverModal.classList.remove('active');
      recoverEmailInput.value = '';
    }

    closeRecoverModalBtn.addEventListener('click', closeModal);

    recoverModal.addEventListener('click', (e) => {
      if (e.target === recoverModal) {
        closeModal();
      }
    });

    sendRecoverBtn.addEventListener('click', async () => {
      const email = recoverEmailInput.value.trim();
      if (!email) {
        alert("Please enter your email address.");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert("Please enter a valid email address.");
        return;
      }

      sendRecoverBtn.disabled = true;
      sendRecoverBtn.textContent = "Sending link...";
      sendRecoverBtn.style.opacity = "0.7";

      try {
        const response = await fetch('/api/auth/recover-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
          alert(data.message || "Recovery email sent successfully!");
          closeModal();
        } else {
          alert(data.error || "Failed to send recovery link.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to connect to the server. Please check your connection.");
      } finally {
        sendRecoverBtn.disabled = false;
        sendRecoverBtn.textContent = "Send Recovery Link";
        sendRecoverBtn.style.opacity = "1";
      }
    });
  }

  // About Modal Controller
  function initAboutModal() {
    const aboutLink = document.getElementById('aboutLink');
    const aboutModal = document.getElementById('aboutModal');
    const closeAboutModalBtn = document.getElementById('closeAboutModalBtn');

    if (!aboutLink || !aboutModal || !closeAboutModalBtn) return;

    aboutLink.addEventListener('click', (e) => {
      e.preventDefault();
      aboutModal.classList.add('active');
    });

    function closeModal() {
      aboutModal.classList.remove('active');
    }

    closeAboutModalBtn.addEventListener('click', closeModal);

    aboutModal.addEventListener('click', (e) => {
      if (e.target === aboutModal) {
        closeModal();
      }
    });
  }

  // Email Field Clear Controller
  function syncEmailClearVisibility() {
    const emailInput = document.getElementById('email');
    const emailClear = document.getElementById('emailClear');
    if (!emailInput || !emailClear) return;

    const hasText = emailInput.value.trim().length > 0;
    emailClear.hidden = !hasText;
  }

  function initEmailClear() {
    const emailInput = document.getElementById('email');
    const emailClear = document.getElementById('emailClear');
    if (!emailInput || !emailClear) return;

    emailClear.addEventListener('click', () => {
      emailInput.value = '';
      emailInput.focus();
      syncEmailClearVisibility();
    });

    ['input', 'change', 'focus'].forEach(evt => {
      emailInput.addEventListener(evt, syncEmailClearVisibility);
    });

    syncEmailClearVisibility();
  }

  // Password Visibility Toggle
  function initPasswordToggle() {
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    if (!passwordInput || !passwordToggle) return;

    passwordToggle.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      passwordToggle.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
      passwordToggle.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
      passwordToggle.innerHTML =
        '<i data-lucide="' + (isHidden ? 'eye' : 'eye-off') + '" style="width: 18px; height: 18px;"></i>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    });
  }

  // Login Error Helpers
  function showLoginError(msg) {
    const banner = document.getElementById('loginErrorMessage');
    const textSpan = document.getElementById('loginErrorText');
    if (banner && textSpan) {
      textSpan.textContent = msg;
      banner.style.display = 'flex';
      if (window.lucide && lucide.createIcons) lucide.createIcons({ root: banner });
    }
  }

  function hideLoginError() {
    const banner = document.getElementById('loginErrorMessage');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  // Perform Login Handler
  async function performLogin(e) {
    if (e) e.preventDefault();
    hideLoginError();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      showLoginError("Please enter both email and password.");
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('user', JSON.stringify(data.user));
        hideLoginError();

        if (data.user.role && data.user.role.toLowerCase().includes('head')) {
          window.location.href = 'it-head-dashboard.html';
        } else if (data.user.role === 'MIS Staff') {
          window.location.href = 'mis-staff-dashboard.html';
        } else {
          window.location.href = 'index.html';
        }
      } else {
        showLoginError(data.error || "Login failed");
      }
    } catch (err) {
      console.error(err);
      showLoginError("Server connection failed. Is the server running?");
    }
  }

  // Pageshow event handler for back/forward navigation
  function initPageShowReset() {
    window.addEventListener('pageshow', () => {
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
      }
    });
  }

  // Form submit & Keyboard navigation setup
  function initLoginFormListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', performLogin);
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      loginBtn.addEventListener('click', performLogin);
    }

    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');

    if (emailField) {
      emailField.addEventListener('input', hideLoginError);
      emailField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (passwordField) {
            passwordField.focus();
          } else {
            performLogin(e);
          }
        }
      });
    }

    if (passwordField) {
      passwordField.addEventListener('input', hideLoginError);
      passwordField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          performLogin(e);
        }
      });
    }
  }

  // Component Initialization
  function initPage() {
    initRecoverModal();
    initAboutModal();
    initEmailClear();
    initPasswordToggle();
    initPageShowReset();
    initLoginFormListeners();
  }

  // Global Compatibility Bridges
  window.showLoginError = showLoginError;
  window.hideLoginError = hideLoginError;
  window.performLogin = performLogin;
  window.syncEmailClearVisibility = syncEmailClearVisibility;

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
