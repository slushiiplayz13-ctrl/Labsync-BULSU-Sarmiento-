/**
 * LabSync Profile Dropdown Menu | js/components/profile/profile-dropdown.js
 * Injects and manages the header avatar dropdown, dark mode toggle sync, and click-outside dismissal.
 */

(function (global) {
  'use strict';

  /**
   * Initializes the profile dropdown menu inside the header.
   */
  function initProfileDropdown() {
    const headerRight = document.querySelector('.header-right');
    const profileDropdown = document.querySelector('.profile-dropdown');
    if (!headerRight || !profileDropdown) return;

    let profileMenu = document.getElementById('profile-menu');
    if (!profileMenu) {
      profileMenu = document.createElement('div');
      profileMenu.id = 'profile-menu';
      profileMenu.className = 'profile-menu';
      profileMenu.innerHTML = `
        <button type="button" id="profile-menu-account-btn" class="profile-menu-item">
          <i data-lucide="user-cog" style="width:16px;height:16px;"></i>
          Account Settings
        </button>
        <div class="profile-menu-item profile-dark-mode-toggle" id="profile-dark-mode-item" role="button" tabindex="0">
          <div class="profile-dark-mode-left">
            <i data-lucide="moon" id="profile-dark-mode-icon" style="width:16px;height:16px;"></i>
            <span>Dark Mode</span>
          </div>
          <label class="menu-switch" id="profile-dark-mode-switch">
            <input type="checkbox" id="profile-dark-mode-checkbox" aria-label="Toggle Dark Mode">
            <span class="menu-slider"></span>
          </label>
        </div>
        <div class="profile-menu-divider"></div>
        <button type="button" id="profile-menu-help-btn" class="profile-menu-item">
          <i data-lucide="circle-help" style="width:16px;height:16px;"></i>
          Help Center
        </button>
        <button type="button" id="profile-menu-tutorial-btn" class="profile-menu-item">
          <i data-lucide="play-circle" style="width:16px;height:16px;"></i>
          Watch System Tutorial
        </button>
        <div class="profile-menu-divider"></div>
        <button type="button" id="profile-menu-logout-btn" class="profile-menu-item logout">
          <i data-lucide="log-out" style="width:16px;height:16px;"></i>
          Logout
        </button>
      `;
      headerRight.appendChild(profileMenu);

      // Attach CSP-compliant click handlers to menu actions
      const accountBtn = profileMenu.querySelector('#profile-menu-account-btn');
      if (accountBtn) {
        accountBtn.addEventListener('click', () => {
          if (typeof global.openAccountSettings === 'function') global.openAccountSettings();
        });
      }
      const switchLabel = profileMenu.querySelector('#profile-dark-mode-switch');
      if (switchLabel) {
        switchLabel.addEventListener('click', (e) => e.stopPropagation());
      }
      const helpBtn = profileMenu.querySelector('#profile-menu-help-btn');
      if (helpBtn) {
        helpBtn.addEventListener('click', () => {
          if (typeof global.openHelpModal === 'function') global.openHelpModal();
        });
      }
      const tutorialBtn = profileMenu.querySelector('#profile-menu-tutorial-btn');
      if (tutorialBtn) {
        tutorialBtn.addEventListener('click', (e) => {
          if (e) e.stopPropagation();
          profileMenu.style.display = 'none';
          const profileBtn = document.getElementById('profile-btn');
          if (profileBtn) profileBtn.setAttribute('aria-expanded', 'false');
          if (typeof global.startSystemTutorial === 'function') {
            global.startSystemTutorial(true);
          } else if (typeof global.startFacultyTutorial === 'function') {
            global.startFacultyTutorial(true);
          }
        });
      }
      const logoutBtn = profileMenu.querySelector('#profile-menu-logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          if (typeof global.handleLogout === 'function') global.handleLogout();
        });
      }

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: profileMenu });
      }
    }

    const darkModeItem = document.getElementById('profile-dark-mode-item');
    const darkModeCheckbox = document.getElementById('profile-dark-mode-checkbox');

    function syncDarkModeUI() {
      const isDark = document.documentElement.classList.contains('high-contrast') || localStorage.getItem('labsync-high-contrast') === 'true';
      if (darkModeCheckbox) darkModeCheckbox.checked = isDark;
    }

    function toggleDarkMode(e) {
      if (e) e.stopPropagation();
      const isCurrentlyDark = document.documentElement.classList.contains('high-contrast') || localStorage.getItem('labsync-high-contrast') === 'true';
      const newDark = !isCurrentlyDark;

      if (typeof global.toggleAccessibilityContrast === 'function') {
        global.toggleAccessibilityContrast(newDark);
      } else {
        try {
          localStorage.setItem('labsync-high-contrast', String(newDark));
        } catch (err) {}
        if (newDark) {
          document.documentElement.classList.add('high-contrast');
        } else {
          document.documentElement.classList.remove('high-contrast');
        }
      }
      syncDarkModeUI();
    }

    if (darkModeItem && !darkModeItem.dataset.listenerAttached) {
      darkModeItem.dataset.listenerAttached = 'true';
      darkModeItem.addEventListener('click', toggleDarkMode);
      darkModeItem.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleDarkMode(e);
        }
      });
    }

    if (darkModeCheckbox && !darkModeCheckbox.dataset.listenerAttached) {
      darkModeCheckbox.dataset.listenerAttached = 'true';
      darkModeCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const newDark = darkModeCheckbox.checked;
        if (typeof global.toggleAccessibilityContrast === 'function') {
          global.toggleAccessibilityContrast(newDark);
        } else {
          try {
            localStorage.setItem('labsync-high-contrast', String(newDark));
          } catch (err) {}
          if (newDark) {
            document.documentElement.classList.add('high-contrast');
          } else {
            document.documentElement.classList.remove('high-contrast');
          }
        }
        syncDarkModeUI();
      });
    }

    syncDarkModeUI();

    // Attach click handlers to dropdown trigger
    if (profileDropdown.dataset.listenerAttached) return;
    profileDropdown.dataset.listenerAttached = 'true';

    const chevronBtn = document.querySelector('.chevron-btn');

    function toggleMenu(e) {
      e.stopPropagation();
      const isOpening = profileMenu.style.display !== 'block';
      profileMenu.style.display = isOpening ? 'block' : 'none';
      if (isOpening) {
        syncDarkModeUI();
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: profileMenu });
        }
      }
    }

    profileDropdown.addEventListener('click', toggleMenu);
    if (chevronBtn) {
      chevronBtn.addEventListener('click', toggleMenu);
    }

    document.addEventListener('click', () => {
      profileMenu.style.display = 'none';
    });
  }

  const profileDropdown = {
    initProfileDropdown
  };

  global.profileDropdown = profileDropdown;
  global.initProfileDropdown = initProfileDropdown;

})(typeof window !== 'undefined' ? window : this);
