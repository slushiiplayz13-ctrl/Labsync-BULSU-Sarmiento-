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
      if (global.setModalOpenState) global.setModalOpenState(true);
      recoverEmailInput.focus();
    });

    function closeModal() {
      recoverModal.classList.remove('active');
      recoverEmailInput.value = '';
      if (global.setModalOpenState) global.setModalOpenState(false);
    }

    closeRecoverModalBtn.addEventListener('click', closeModal);

    recoverModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    recoverModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
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
      if (global.setModalOpenState) global.setModalOpenState(true);
    });

    function closeModal() {
      aboutModal.classList.remove('active');
      if (global.setModalOpenState) global.setModalOpenState(false);
    }

    closeAboutModalBtn.addEventListener('click', closeModal);

    aboutModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    aboutModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
  }

  // Contact Modal Controller
  function initContactModal() {
    const contactLink = document.getElementById('contactLink');
    const contactModal = document.getElementById('contactModal');
    const closeContactModalBtn = document.getElementById('closeContactModalBtn');
    const closeContactActionBtn = document.getElementById('closeContactActionBtn');

    if (!contactLink || !contactModal) return;

    function openModal(e) {
      if (e) e.preventDefault();
      contactModal.classList.add('active');
      if (global.setModalOpenState) global.setModalOpenState(true);
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons({ root: contactModal });
      }
      if (closeContactActionBtn) {
        closeContactActionBtn.focus();
      } else if (closeContactModalBtn) {
        closeContactModalBtn.focus();
      }
    }

    function closeModal() {
      contactModal.classList.remove('active');
      if (global.setModalOpenState) global.setModalOpenState(false);
      contactLink.focus();
    }

    contactLink.addEventListener('click', openModal);

    if (closeContactModalBtn) {
      closeContactModalBtn.addEventListener('click', closeModal);
    }

    if (closeContactActionBtn) {
      closeContactActionBtn.addEventListener('click', closeModal);
    }

    contactModal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    contactModal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && contactModal.classList.contains('active')) {
        closeModal();
      }
    });
  }

  // Email Field Clear Controller
  function syncEmailClearVisibility() {
    const emailInput = document.getElementById('email');
    const emailClear = document.getElementById('emailClear');
    if (!emailInput || !emailClear) return;

    const hasText = emailInput.value.length > 0;
    emailClear.hidden = !hasText;
    emailClear.style.display = hasText ? '' : 'none';
  }

  function initEmailClear() {
    const emailInput = document.getElementById('email');
    const emailClear = document.getElementById('emailClear');
    if (!emailInput || !emailClear) return;

    emailClear.addEventListener('click', () => {
      emailInput.value = '';
      syncEmailClearVisibility();
      emailInput.focus();
    });

    ['input', 'change', 'focus', 'blur', 'keyup'].forEach(evt => {
      emailInput.addEventListener(evt, syncEmailClearVisibility);
    });

    syncEmailClearVisibility();

    // Re-check on window load, pageshow, and delayed ticks for autofill / password managers
    window.addEventListener('pageshow', syncEmailClearVisibility);
    window.addEventListener('load', syncEmailClearVisibility);
    setTimeout(syncEmailClearVisibility, 100);
    setTimeout(syncEmailClearVisibility, 300);
  }

  function syncPasswordToggleVisibility() {
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    if (!passwordInput || !passwordToggle) return;

    const hasText = passwordInput.value.length > 0;
    passwordToggle.hidden = !hasText;
    passwordToggle.style.display = hasText ? '' : 'none';

    if (!hasText && passwordInput.type === 'text') {
      passwordInput.type = 'password';
      passwordToggle.setAttribute('aria-pressed', 'false');
      passwordToggle.setAttribute('aria-label', 'Show password');
      passwordToggle.innerHTML = '<i data-lucide="eye-off" style="width: 18px; height: 18px;"></i>';
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    }
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

    ['input', 'change', 'focus', 'blur', 'keyup'].forEach(evt => {
      passwordInput.addEventListener(evt, syncPasswordToggleVisibility);
    });

    syncPasswordToggleVisibility();

    // Re-check on window load, pageshow, and delayed ticks for autofill / password managers
    window.addEventListener('pageshow', syncPasswordToggleVisibility);
    window.addEventListener('load', syncPasswordToggleVisibility);
    setTimeout(syncPasswordToggleVisibility, 100);
    setTimeout(syncPasswordToggleVisibility, 300);
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
    const loginBtn = document.getElementById('loginBtn');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
      showLoginError("Please enter both email and password.");
      return;
    }

    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = "Signing In...";
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
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        localStorage.removeItem('labsync_session_expired');
        try { sessionStorage.setItem('labsync_user', JSON.stringify(data.user)); } catch (e) { }
        hideLoginError();

        const role = (data.user && data.user.role) || '';
        const isItHead = role.toLowerCase().includes('head');
        const isMis = role === 'MIS Staff';

        // Pre-populate minimal destination dashboard session cache using canonical services
        try {
          if (isItHead) {
            const promises = [];
            if (window.scheduleService && typeof window.scheduleService.getITHeadSummary === 'function') {
              promises.push(window.scheduleService.getITHeadSummary());
            }
            if (window.laboratoryService && typeof window.laboratoryService.fetchLaboratories === 'function') {
              promises.push(window.laboratoryService.fetchLaboratories());
            }
            if (window.laboratoryService && typeof window.laboratoryService.getUserAssignedRooms === 'function') {
              promises.push(window.laboratoryService.getUserAssignedRooms());
            }
            if (window.scheduleService && typeof window.scheduleService.getUserSchedule === 'function') {
              promises.push(window.scheduleService.getUserSchedule());
            }
            if (promises.length > 0) {
              await Promise.allSettled(promises);
            }
          } else if (isMis) {
            // MIS Staff dashboard prefetch
            const promises = [];
            if (window.laboratoryService && typeof window.laboratoryService.fetchLaboratories === 'function') {
              promises.push(window.laboratoryService.fetchLaboratories());
            }
            if (window.reportService && typeof window.reportService.fetchReports === 'function') {
              promises.push(window.reportService.fetchReports());
            }
            if (window.notificationService && typeof window.notificationService.fetchNotifications === 'function') {
              promises.push(window.notificationService.fetchNotifications());
            }
            if (promises.length > 0) {
              await Promise.allSettled(promises);
            }
          } else {
            // Faculty / Dean dashboard prefetch
            const promises = [];
            if (window.laboratoryService && typeof window.laboratoryService.fetchLaboratories === 'function') {
              promises.push(window.laboratoryService.fetchLaboratories());
            }
            if (window.laboratoryService && typeof window.laboratoryService.getUserAssignedRooms === 'function') {
              promises.push(window.laboratoryService.getUserAssignedRooms());
            }
            if (window.reportService && typeof window.reportService.fetchReports === 'function') {
              promises.push(window.reportService.fetchReports());
            }
            if (window.scheduleService && typeof window.scheduleService.getUserSchedule === 'function') {
              promises.push(window.scheduleService.getUserSchedule());
            }
            if (promises.length > 0) {
              await Promise.allSettled(promises);
            }
          }
        } catch (prefetchErr) {
          console.warn('[Login] Dashboard prefetch warning:', prefetchErr);
        }

        if (isItHead) {
          window.location.href = 'it-head-dashboard.html';
        } else if (isMis) {
          window.location.href = 'mis-staff-dashboard.html';
        } else {
          window.location.href = 'index.html';
        }
      } else {
        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.textContent = "Sign In";
        }
        showLoginError(data.error || "Login failed");
      }
    } catch (err) {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
      }
      console.error(err);
      showLoginError("Server connection failed. Is the server running?");
    }
  }

  // Ensure login form fields start empty by default on fresh load and back/forward navigation
  function resetLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm && typeof loginForm.reset === 'function') {
      loginForm.reset();
    }
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    if (emailInput) emailInput.value = '';
    if (passwordInput) passwordInput.value = '';
    syncEmailClearVisibility();
  }

  // Pageshow event handler for back/forward navigation
  function initPageShowReset() {
    window.addEventListener('pageshow', (event) => {
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
      }
      // If page was restored from back/forward cache (bfcache), ensure stale form credentials are reset
      if (event && event.persisted) {
        resetLoginForm();
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

  function checkSessionExpiryNotice() {
    let isExpired = false;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('reason') === 'inactivity' || urlParams.get('expired') === 'true') {
        isExpired = true;
      }
      const expiredTimestamp = localStorage.getItem('labsync_session_expired');
      if (expiredTimestamp) {
        const timeDiff = Date.now() - parseInt(expiredTimestamp, 10);
        if (timeDiff < 5 * 60 * 1000) {
          isExpired = true;
        }
        localStorage.removeItem('labsync_session_expired');
      }
    } catch (e) {}

    if (isExpired) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const expiryMessage = "Your session has expired due to inactivity. Please log in again.";
      showLoginError(expiryMessage);
      if (typeof window.showToast === 'function') {
        window.showToast(expiryMessage, "warning", "Session Expired");
      }
    }
  }

  // Component Initialization
  function initPage() {
    resetLoginForm();
    initRecoverModal();
    initAboutModal();
    initContactModal();
    initEmailClear();
    initPasswordToggle();
    initPageShowReset();
    initLoginFormListeners();
    checkSessionExpiryNotice();
  }

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
