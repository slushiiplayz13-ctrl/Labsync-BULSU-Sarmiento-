/**
 * LabSync – Profile Dropdown & Modal Manager | js/components/profile-menu.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
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
        <button type="button" onclick="openAccountSettings()" class="profile-menu-item">
          <i data-lucide="user-cog" style="width:16px;height:16px;"></i>
          Account Settings
        </button>
        <div class="profile-menu-item profile-dark-mode-toggle" id="profile-dark-mode-item" role="button" tabindex="0">
          <div class="profile-dark-mode-left">
            <i data-lucide="moon" id="profile-dark-mode-icon" style="width:16px;height:16px;"></i>
            <span>Dark Mode</span>
          </div>
          <label class="menu-switch" onclick="event.stopPropagation()">
            <input type="checkbox" id="profile-dark-mode-checkbox" aria-label="Toggle Dark Mode">
            <span class="menu-slider"></span>
          </label>
        </div>
        <div class="profile-menu-divider"></div>
        <button type="button" onclick="openHelpModal()" class="profile-menu-item">
          <i data-lucide="circle-help" style="width:16px;height:16px;"></i>
          Help Center
        </button>
        <button type="button" onclick="window.startSystemTutorial(true)" class="profile-menu-item">
          <i data-lucide="play-circle" style="width:16px;height:16px;"></i>
          Watch System Tutorial
        </button>
        <div class="profile-menu-divider"></div>
        <button type="button" onclick="handleLogout()" class="profile-menu-item logout">
          <i data-lucide="log-out" style="width:16px;height:16px;"></i>
          Logout
        </button>
      `;
      headerRight.appendChild(profileMenu);
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

    // Add click handlers
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

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      profileMenu.style.display = 'none';
    });
  }

  /**
   * Helper function to show secure email change authentication modal.
   */
  function showEmailChangeConfirmation(oldEmail, newEmail, onConfirm) {
    const overlay = document.createElement('div');
    overlay.id = 'email-confirm-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:2100;padding:20px;';

    overlay.innerHTML = `
      <div class="email-confirm-content" style="background:var(--bg-white, #fff);border:1px solid var(--border-light, #e2e8f0);border-radius:24px;width:100%;max-width:460px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,0.25);display:flex;flex-direction:column;align-items:center;gap:20px;font-family:var(--font-body);animation:fadeIn 0.25s ease-out;color:var(--text-dark);">
        <!-- Icon Container -->
        <div style="width:68px;height:68px;background:rgba(239,68,68,0.1);color:#EF4444;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(239,68,68,0.15);">
          <i data-lucide="shield-alert" style="width:34px;height:34px;"></i>
        </div>
        
        <!-- Text & Security Warnings -->
        <div style="width:100%;text-align:center;">
          <h3 style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-dark);margin:0 0 8px 0;">Email Change Security Authorization</h3>
          <p style="font-size:13.5px;color:var(--text-mid);line-height:1.5;margin:0 0 16px 0;">
            You are requesting to change your account email to <strong style="color:var(--text-dark);font-weight:700;">${newEmail}</strong>.
          </p>
          
          <!-- Security Notice -->
          <div style="display:flex;flex-direction:column;gap:10px;text-align:left;margin-bottom:16px;">
            <div class="email-alert-notice" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:12px 14px;font-size:12.5px;color:var(--text-dark);line-height:1.5;display:flex;gap:10px;align-items:flex-start;">
              <i data-lucide="shield-check" style="width:18px;height:18px;color:#F59E0B;flex-shrink:0;margin-top:2px;"></i>
              <span style="color:var(--text-dark);">A <strong class="highlight-text" style="color:#D97706;font-weight:700;">Confirmation Approval Link</strong> will be sent to your current email (<strong style="color:var(--text-dark);font-weight:700;">${oldEmail}</strong>). You must click this link to authorize updating your account email to <strong style="color:var(--text-dark);font-weight:700;">${newEmail}</strong>.</span>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px 0;line-height:1.4;text-align:left;">Your account login email address will remain unchanged until authorized from your current email inbox.</p>

          <!-- Current Password Re-Authentication Field -->
          <div style="text-align:left;width:100%;">
            <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Enter Current Password to Authorize *</label>
            <div style="position:relative;">
              <input type="password" id="email-confirm-password" required style="width:100%;padding:12px 44px 12px 16px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;box-sizing:border-box;background:var(--bg-card);color:var(--text-dark);" placeholder="Enter current password">
              <button type="button" id="toggle-confirm-pass-btn" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:var(--text-muted);outline:none;">
                <i data-lucide="eye" style="width:18px;height:18px;"></i>
              </button>
            </div>
            <div id="email-confirm-pass-err" style="display:none;color:#EF4444;font-size:12px;margin-top:6px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Current password is required to change email address.</div>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div style="display:flex;gap:12px;width:100%;margin-top:6px;">
          <button id="cancel-email-confirm" type="button" style="flex:1;padding:12px;border:1px solid var(--border-light);background:var(--bg-card);color:var(--text-dark);border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Cancel</button>
          <button id="proceed-email-confirm" type="button" style="flex:1;padding:12px;border:none;background:var(--primary-teal);color:#fff;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px var(--primary-teal-glow);font-family:var(--font-body);">Authenticate & Send</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: overlay });
    }

    const passInput = document.getElementById('email-confirm-password');
    const passErr = document.getElementById('email-confirm-pass-err');
    const toggleBtn = document.getElementById('toggle-confirm-pass-btn');

    if (passInput) passInput.focus();

    if (toggleBtn && passInput) {
      toggleBtn.addEventListener('click', () => {
        const isPass = passInput.type === 'password';
        passInput.type = isPass ? 'text' : 'password';
        toggleBtn.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}" style="width:18px;height:18px;"></i>`;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: toggleBtn });
        }
      });
    }

    // Handlers
    document.getElementById('cancel-email-confirm').addEventListener('click', () => {
      overlay.remove();
    });

    document.getElementById('proceed-email-confirm').addEventListener('click', () => {
      const passwordVal = passInput ? passInput.value : '';
      if (!passwordVal) {
        if (passInput) passInput.style.borderColor = '#EF4444';
        if (passErr) passErr.style.display = 'block';
        return;
      }
      overlay.remove();
      onConfirm(passwordVal);
    });
  }

  /**
   * Helper function to switch tabs inside the Account Settings modal.
   */
  function switchSettingsTab(tabName, btnEl) {
    document.querySelectorAll('.settings-tab-panel').forEach(p => p.style.display = 'none');
    const targetPanel = document.getElementById(`panel-${tabName}`);
    if (targetPanel) {
      targetPanel.style.display = 'block';
    }
    document.querySelectorAll('.settings-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (btnEl) {
      btnEl.classList.add('active');
    }
  }

  /**
   * Loads current user information into the Account Settings modal fields.
   */
  async function loadAccountSettingsData() {
    try {
      const response = await fetch('/api/user/current', { credentials: 'include' });
      if (!response.ok) return;
      const user = await response.json();

      const nameInput = document.getElementById('settings-name');
      const emailInput = document.getElementById('settings-email');
      const phoneInput = document.getElementById('settings-phone');

      if (nameInput) nameInput.value = user.name || '';
      if (emailInput) {
        emailInput.value = user.email || '';
        emailInput.dataset.initialEmail = user.email || '';
      }
      if (phoneInput) phoneInput.value = user.phone || '';

      const isMisStaff = user.role === 'MIS Staff';
      if (isMisStaff) {
        if (nameInput) {
          nameInput.readOnly = true;
          nameInput.style.background = '#F8FAFC';
          nameInput.style.cursor = 'not-allowed';
          nameInput.title = 'Full Name is restricted for the shared MIS Staff account.';
        }
        if (emailInput) {
          emailInput.readOnly = true;
          emailInput.style.background = '#F8FAFC';
          emailInput.style.cursor = 'not-allowed';
          emailInput.title = 'Email Address is restricted for the shared MIS Staff account.';
        }
        if (phoneInput) {
          phoneInput.readOnly = true;
          phoneInput.style.background = '#F8FAFC';
          phoneInput.style.cursor = 'not-allowed';
          phoneInput.title = 'Mobile Number is restricted for the shared MIS Staff account.';
        }

        const photoUploadBtn = document.querySelector('button[onclick*="profile-photo-input"]');
        if (photoUploadBtn) photoUploadBtn.style.display = 'none';

        const misBanner = document.getElementById('mis-shared-account-banner');
        if (misBanner) misBanner.style.display = 'flex';

        const misPasswordNotice = document.getElementById('mis-password-notice');
        if (misPasswordNotice) misPasswordNotice.style.display = 'flex';
      }

      const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
      const initialsEl = document.getElementById('avatar-initials');
      if (initialsEl) initialsEl.textContent = initials;

      const lastUpdatedEl = document.getElementById('settings-last-updated');
      if (lastUpdatedEl) {
        const lastUpdated = user.updatedAt || user.updated_at || user.last_updated || localStorage.getItem('labsync_last_updated');
        const formatTimeFn = global.formatLastUpdatedTime || window.formatLastUpdatedTime || ((t) => t || 'Never');
        lastUpdatedEl.textContent = `Last updated: ${formatTimeFn(lastUpdated)}`;
      }

      if (user.profilePhoto) {
        const photoImg = document.getElementById('profile-photo-img');
        const avatarInitials = document.getElementById('avatar-initials');
        const removePhotoBtn = document.getElementById('remove-photo-btn');
        if (photoImg && avatarInitials && removePhotoBtn) {
          photoImg.src = user.profilePhoto;
          photoImg.style.display = 'block';
          avatarInitials.style.display = 'none';
          if (!isMisStaff) removePhotoBtn.style.display = 'block';
        }
      }

      const qrResponse = await fetch('/api/user/qrcode', { credentials: 'include' });
      if (qrResponse.ok) {
        const qrData = await qrResponse.json();
        const qrContainer = document.getElementById('qr-code-container');
        if (qrContainer) {
          qrContainer.innerHTML = `<img src="${qrData.qrCode}" style="width:100%;height:100%;object-fit:contain;">`;
        }
        const dlBtn = document.getElementById('download-qr-btn');
        if (dlBtn) {
          dlBtn.addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = `LabSync-QR-${(qrData.user && qrData.user.name ? qrData.user.name : 'user').replace(/\s+/g, '-')}.png`;
            link.href = qrData.qrCode;
            link.click();
          });
        }
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons();
        }
      }
    } catch (error) {
      console.error('[ProfileMenu] Error loading account settings data:', error);
    }
  }

  /**
   * Opens the interactive Account Settings Modal with tabs for Profile, Security, and QR Code.
   */
  function openAccountSettings() {
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu) profileMenu.style.display = 'none';

    // Clean up any existing instance
    const existing = document.getElementById('account-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'account-settings-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;';

    modal.innerHTML = `
      <div class="settings-modal-content-box" style="background:#fff;border-radius:20px;width:100%;max-width:900px;height:85vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;">
        <!-- Header -->
        <div style="padding:28px 32px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%);flex-shrink:0;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:24px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Account Settings</h2>
            <p style="font-size:13px;color:var(--text-mid);margin:0;">Manage your profile information and security settings</p>
          </div>
          <button id="close-settings-modal" style="background:#F5F5F5;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all 0.2s;">
            <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
          </button>
        </div>
        
        <!-- Body Split View -->
        <div class="settings-modal-body" style="flex:1; display:flex; min-height:0; position:relative; overflow:hidden;">
          <!-- Left Sidebar Navigation -->
          <div class="settings-modal-sidebar" style="width:240px; border-right:1px solid var(--border-light); background:#F8FAFC; padding:24px 16px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; overflow-y:auto;">
            <button type="button" class="settings-tab-btn active" onclick="switchSettingsTab('profile', this)">
              <i data-lucide="user" style="width:18px;height:18px;"></i>
              Profile Details
            </button>
            <button type="button" class="settings-tab-btn" onclick="switchSettingsTab('security', this)">
              <i data-lucide="lock" style="width:18px;height:18px;"></i>
              Security & Login
            </button>
            <button type="button" class="settings-tab-btn" onclick="switchSettingsTab('qrcode', this)">
              <i data-lucide="qr-code" style="width:18px;height:18px;"></i>
              My QR Code
            </button>
          </div>

          <!-- Right Content Area (Form wrapper) -->
          <form id="account-settings-form" class="settings-modal-form" style="flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg-card); margin:0;">
            <div class="settings-modal-scroll" style="flex:1; overflow-y:auto; padding:32px 40px;">
              
              <!-- PANEL 1: PROFILE DETAILS -->
              <div id="panel-profile" class="settings-tab-panel" style="display:block;">
                <div style="margin-bottom:28px;">
                  <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Profile Details</h3>
                  <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Update your personal details and profile photo</p>
                </div>

                <!-- Shared MIS Staff Account Notice Banner -->
                <div id="mis-shared-account-banner" class="banner-mis-notice info" style="display:none; border-radius:12px; padding:14px 16px; margin-bottom:24px; align-items:flex-start; gap:12px;">
                  <i data-lucide="shield-alert" class="banner-icon" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;"></i>
                  <div>
                    <div class="banner-title" style="font-weight:700;font-size:13.5px;margin-bottom:2px;">Shared Department Account</div>
                    <p class="banner-text" style="font-size:13px;margin:0;line-height:1.4;">This account is shared by all MIS Personnel. Profile information (Full Name, Email Address, Mobile Number) is restricted to maintain department access.</p>
                  </div>
                </div>

                <!-- Side-by-side: Photo Upload (Left) and Fields (Right) -->
                <div style="display:flex; gap:36px; align-items:flex-start; flex-wrap:wrap;">
                  <!-- Profile Photo Box -->
                  <div style="width:190px; display:flex; flex-direction:column; align-items:center; gap:16px; padding:24px 16px; border:2px dashed var(--border-light); border-radius:16px; background:var(--bg-card); flex-shrink:0;">
                    <div id="profile-photo-preview" style="width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg, #1EBBD7 0%, #0EA5E9 100%);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;font-family:var(--font-display);box-shadow:0 8px 20px rgba(30,187,215,0.25);position:relative;overflow:hidden;flex-shrink:0;">
                      <span id="avatar-initials">U</span>
                      <img id="profile-photo-img" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;display:none;">
                    </div>
                    <input type="file" id="profile-photo-input" accept="image/*" style="display:none;">
                    <button type="button" onclick="document.getElementById('profile-photo-input').click()" style="padding:10px 16px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 10px rgba(30,187,215,0.2);font-family:var(--font-body);display:flex;align-items:center;gap:6px;">
                      <i data-lucide="upload" style="width:14px;height:14px;"></i>
                      Upload Photo
                    </button>
                    <button type="button" id="remove-photo-btn" style="padding:6px 12px;border:1px solid var(--border-light);background:var(--bg-card);color:var(--text-mid);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);display:none;">Remove Photo</button>
                    <p style="font-size:11.5px;color:var(--text-muted);text-align:center;margin:0;line-height:1.4;">JPG, PNG or GIF<br>Max size: 2MB</p>
                  </div>

                  <!-- Input Fields Column -->
                  <div style="flex:1; min-width:260px; display:flex; flex-direction:column; gap:20px;">
                    <div>
                      <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Full Name *</label>
                      <input type="text" id="settings-name" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Your full name">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                      <div>
                        <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Email Address</label>
                        <input type="email" id="settings-email" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;" placeholder="your.email@bsu.edu.ph">
                        <div id="settings-email-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Invalid email address (e.g., user@domain.com)</div>
                      </div>
                      <div>
                        <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Mobile Number *</label>
                        <input type="tel" id="settings-phone" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="09XXXXXXXXX" pattern="09[0-9]{9}" title="Please enter a valid 11-digit mobile number starting with 09.">
                      </div>
                    </div>
                    <div class="alert-info-box" style="margin-top:4px; display:flex; gap:10px; align-items:flex-start;">
                      <i data-lucide="shield-check" style="width:18px;height:18px;color:#0284C7;flex-shrink:0;margin-top:2px;"></i>
                      <p style="margin:0;font-size:12.5px;line-height:1.4;">Changing your email address requires your <strong>Current Password</strong>. A <strong>Confirmation Approval Link</strong> will be sent to your current email address to authorize the change.</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- PANEL 2: SECURITY & LOGIN -->
              <div id="panel-security" class="settings-tab-panel" style="display:none;">
                <div style="margin-bottom:28px;">
                  <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Security & Login</h3>
                  <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Update your account password to remain secure</p>
                </div>

                <!-- Shared Password Notice for MIS -->
                <div id="mis-password-notice" class="banner-mis-notice warning" style="display:none; border-radius:12px; padding:14px 16px; margin-bottom:24px; align-items:flex-start; gap:12px;">
                  <i data-lucide="alert-triangle" class="banner-icon" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;"></i>
                  <div>
                    <div class="banner-title" style="font-weight:700;font-size:13.5px;margin-bottom:2px;">Shared Account Password Warning</div>
                    <p class="banner-text" style="font-size:13px;margin:0;line-height:1.4;">Attention: Changing this password will update the login password for ALL MIS personnel using this shared department account.</p>
                  </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:20px;">
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Current Password</label>
                    <div style="position:relative;">
                      <input type="password" id="settings-current-password" style="width:100%;padding:12px 48px 12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Enter current password">
                      <button type="button" onclick="togglePasswordVisibility('settings-current-password', this)" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:#CBD5E1;transition:color 0.2s;outline:none;" onmouseenter="this.style.color='var(--primary-teal)'" onmouseleave="this.style.color='#CBD5E1'">
                        <i data-lucide="eye" style="width:18px;height:18px;"></i>
                      </button>
                    </div>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                    <div>
                      <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">New Password</label>
                      <div style="position:relative;">
                        <input type="password" id="settings-new-password" style="width:100%;padding:12px 48px 12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Minimum 8 characters">
                        <button type="button" onclick="togglePasswordVisibility('settings-new-password', this)" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:#CBD5E1;transition:color 0.2s;outline:none;" onmouseenter="this.style.color='var(--primary-teal)'" onmouseleave="this.style.color='#CBD5E1'">
                          <i data-lucide="eye" style="width:18px;height:18px;"></i>
                        </button>
                      </div>
                    </div>
                    <div>
                      <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Confirm New Password</label>
                      <div style="position:relative;">
                        <input type="password" id="settings-confirm-password" style="width:100%;padding:12px 48px 12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Re-enter new password">
                        <button type="button" onclick="togglePasswordVisibility('settings-confirm-password', this)" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:#CBD5E1;transition:color 0.2s;outline:none;" onmouseenter="this.style.color='var(--primary-teal)'" onmouseleave="this.style.color='#CBD5E1'">
                          <i data-lucide="eye" style="width:18px;height:18px;"></i>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Security Tip Box -->
                  <div class="alert-warning-box" style="margin-top:8px;">
                    <i data-lucide="shield-check"></i>
                    <div>
                      <p class="alert-title">Security Tip</p>
                      <p class="alert-desc">Use a strong password with at least 8 characters, including numbers and symbols.</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- PANEL 3: MY QR CODE -->
              <div id="panel-qrcode" class="settings-tab-panel" style="display:none;">
                <div style="margin-bottom:28px;">
                  <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">My QR Code</h3>
                  <p style="font-size:12.5px;color:var(--text-mid);margin:0;">Your unique access key for attendance and lab operations</p>
                </div>

                <div style="display:flex; gap:32px; align-items:center; background:#FAFAFA; border:1px solid var(--border-light); border-radius:16px; padding:32px; flex-wrap:wrap; justify-content:center;">
                  <div id="qr-code-container" style="width:170px;height:170px;border:1px solid var(--border-light);border-radius:12px;display:flex;align-items:center;justify-content:center;background:#fff;padding:12px;box-shadow:var(--shadow-sm);flex-shrink:0;">
                    <div style="color:var(--text-muted);font-size:12px;text-align:center;">Loading...</div>
                  </div>
                  <div style="flex:1; min-width:240px; display:flex; flex-direction:column; gap:16px;">
                    <p style="font-size:13.5px;color:var(--text-mid);margin:0;line-height:1.6;">
                      This QR code contains your unique identifier. Keep it secure and use it to log in, register attendance, or scan into active lab sessions.
                    </p>
                    <button type="button" id="download-qr-btn" style="padding:10px 20px;border:1px solid var(--primary-teal);background:#fff;color:var(--primary-teal);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);display:flex;align-items:center;gap:8px;width:fit-content;" onmouseenter="this.style.background='var(--primary-teal-light)'" onmouseleave="this.style.background='#fff'">
                      <i data-lucide="download" style="width:16px;height:16px;"></i>
                      Download QR Code
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </form>
        </div>

        <!-- Footer (Fixed bottom) -->
        <div class="settings-modal-footer" style="padding:20px 32px;border-top:1px solid var(--border-light);background:#FAFAFA;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
          <p id="settings-last-updated" style="font-size:12px;color:var(--text-muted);margin:0;">Last updated: Loading...</p>
          <div style="display:flex;gap:12px;">
            <button type="button" id="cancel-settings-btn" style="padding:12px 24px;border:1px solid var(--border-light);background:#fff;border-radius:10px;font-size:14px;font-weight:600;color:var(--text-mid);cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Cancel</button>
            <button type="submit" form="account-settings-form" style="padding:12px 32px;border:none;background:var(--primary-teal);color:#fff;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);font-family:var(--font-body);display:flex;align-items:center;gap:8px;">
              <i data-lucide="save" style="width:16px;height:16px;"></i>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }

    // Load user data and QR code
    loadAccountSettingsData();

    // Tab validation redirect UX helper
    document.querySelectorAll('#account-settings-form input').forEach(input => {
      input.addEventListener('invalid', () => {
        const panel = input.closest('.settings-tab-panel');
        if (panel) {
          const tabName = panel.id.replace('panel-', '');
          const btn = document.querySelector(`.settings-tab-btn[onclick*="${tabName}"]`);
          switchSettingsTab(tabName, btn);
        }
      });
    });

    // Photo upload handler
    const photoInput = document.getElementById('profile-photo-input');
    const photoImg = document.getElementById('profile-photo-img');
    const avatarInitials = document.getElementById('avatar-initials');
    const removePhotoBtn = document.getElementById('remove-photo-btn');

    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB');
            return;
          }
          const reader = new FileReader();
          reader.onload = (e) => {
            if (photoImg) {
              photoImg.src = e.target.result;
              photoImg.style.display = 'block';
            }
            if (avatarInitials) avatarInitials.style.display = 'none';
            if (removePhotoBtn) removePhotoBtn.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        if (photoInput) photoInput.value = '';
        if (photoImg) {
          photoImg.style.display = 'none';
          photoImg.src = '';
        }
        if (avatarInitials) avatarInitials.style.display = 'block';
        removePhotoBtn.style.display = 'none';
      });
    }

    // Close handlers
    const closeSettingsModalBtn = document.getElementById('close-settings-modal');
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', () => modal.remove());
    if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Input focus effects
    document.querySelectorAll('input[type="text"], input[type="password"], input[type="email"], input[type="tel"]').forEach(input => {
      input.addEventListener('focus', () => {
        input.style.borderColor = 'var(--primary-teal)';
        input.style.boxShadow = '0 0 0 3px rgba(30, 187, 215, 0.1)';
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = 'var(--border-light)';
        input.style.boxShadow = 'none';
      });
    });

    // Live email validation
    const isValidEmail = (email) => {
      if (!email || typeof email !== 'string') return false;
      const cleanEmail = email.trim().toLowerCase();
      const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
      if (!basicRegex.test(cleanEmail)) return false;
      if (cleanEmail.includes('..') || cleanEmail.includes('@.') || cleanEmail.includes('.@')) return false;

      const parts = cleanEmail.split('@');
      if (parts.length !== 2) return false;
      const domainParts = parts[1].split('.');
      if (domainParts.length < 2) return false;

      const fullTld = domainParts.slice(1).join('.');
      const mainTld = domainParts[domainParts.length - 1];

      const validTLDs = new Set([
        'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'store', 'tech', 'app', 'dev',
        'ph', 'edu.ph', 'com.ph', 'gov.ph', 'org.ph', 'net.ph',
        'us', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'de', 'fr', 'br', 'ru', 'sg', 'my'
      ]);

      return validTLDs.has(fullTld) || validTLDs.has(mainTld);
    };

    const settingsEmailInput = document.getElementById('settings-email');
    const emailErrDiv = document.getElementById('settings-email-error');
    if (settingsEmailInput && emailErrDiv) {
      settingsEmailInput.addEventListener('input', () => {
        const val = settingsEmailInput.value.trim();
        if (val && !isValidEmail(val)) {
          settingsEmailInput.style.borderColor = '#EF4444';
          emailErrDiv.style.display = 'block';
        } else {
          settingsEmailInput.style.borderColor = 'var(--border-light)';
          emailErrDiv.style.display = 'none';
        }
      });
    }

    // Form submit
    const settingsForm = document.getElementById('account-settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('settings-name').value.trim();
        const currentPassword = document.getElementById('settings-current-password').value;
        const newPassword = document.getElementById('settings-new-password').value;
        const confirmPassword = document.getElementById('settings-confirm-password').value;

        if (currentPassword || newPassword || confirmPassword) {
          if (!currentPassword) {
            alert('Please enter your current password');
            return;
          }
          if (!newPassword) {
            alert('Please enter a new password');
            return;
          }
          if (newPassword.length < 8) {
            alert('New password must be at least 8 characters');
            return;
          }
          if (newPassword !== confirmPassword) {
            alert('New passwords do not match');
            return;
          }
        }

        const photoImg = document.getElementById('profile-photo-img');
        const profilePhoto = (photoImg && photoImg.style.display === 'block') ? photoImg.src : null;
        const initialEmail = document.getElementById('settings-email').dataset.initialEmail || '';
        const newEmail = document.getElementById('settings-email').value.trim();

        if (!isValidEmail(newEmail)) {
          alert('Security Warning: Invalid email address format!\n\nPlease enter a valid email address (e.g., name@example.com). Random letters or malformed email strings are not allowed.');
          if (settingsEmailInput) {
            settingsEmailInput.focus();
            settingsEmailInput.style.borderColor = '#EF4444';
            if (emailErrDiv) emailErrDiv.style.display = 'block';
          }
          return;
        }

        const isEmailChanging = newEmail.toLowerCase() !== initialEmail.toLowerCase();

        const executeUpdate = async (authPassword) => {
          try {
            const response = await fetch('/api/user/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                name: name,
                email: newEmail,
                currentPassword: authPassword || currentPassword || null,
                newPassword: newPassword || null,
                profilePhoto: profilePhoto,
                phone: document.getElementById('settings-phone').value.trim()
              })
            });

            let result = {};
            try {
              result = await response.json();
            } catch (e) {
              result = { error: 'Server error (HTTP ' + response.status + '). Please try again.' };
            }

            if (response.ok) {
              try {
                localStorage.setItem('labsync_last_updated', new Date().toISOString());
              } catch (e) { }

              if (typeof global.showToast === 'function') {
                global.showToast(result.message || 'Account updated successfully!');
              } else {
                alert(result.message || 'Account updated successfully!');
              }

              modal.remove();

              // Dynamically update UI elements across the page without jarring reload
              const profileNameEls = document.querySelectorAll('.user-name, .profile-name, #user-name-display, .user-profile-name');
              profileNameEls.forEach(el => {
                if (el && name) el.textContent = name;
              });

              if (profilePhoto) {
                const avatarImgs = document.querySelectorAll('.user-avatar img, .profile-avatar img, #user-avatar-img');
                avatarImgs.forEach(img => {
                  if (img) {
                    img.src = profilePhoto;
                    img.style.display = 'block';
                  }
                });
              }
            } else {
              alert('Error: ' + (result.error || 'Failed to update account'));
            }
          } catch (error) {
            console.error('[ProfileMenu] Error updating account:', error);
            alert('Failed to update account. Please check your connection or try again.');
          }
        };

        if (isEmailChanging) {
          showEmailChangeConfirmation(initialEmail, newEmail, (authenticatedPassword) => {
            executeUpdate(authenticatedPassword);
          });
        } else {
          executeUpdate(currentPassword);
        }
      });
    }
  }

  /**
   * Opens the Help & Support modal tailored to user role.
   */
  async function openHelpModal() {
    let userRole = 'Faculty';
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

    try {
      const response = await fetch('/api/user/current', { credentials: 'include' });
      if (response.ok) {
        const user = await response.json();
        userRole = user.role || 'Faculty';
      }
    } catch (error) {
      console.error('[ProfileMenu] Error fetching user role for help modal:', error);
    }

    const isMis = userRole === 'MIS Staff' || page.startsWith('mis-');
    const isItHead = (userRole && userRole.toLowerCase().includes('head')) || page.startsWith('it-head-') || page === 'master-schedule.html' || page === 'faculty-management.html' || page === 'room-schedule-editor.html';

    // Clean up any existing help modal
    const existing = document.getElementById('help-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.className = 'help-modal-overlay';

    let quickStartHTML = '';
    let featuresHTML = '';

    if (isMis) {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-teal">
              <i data-lucide="layout-dashboard"></i>
            </div>
            <div class="help-qs-title">Dashboard</div>
          </div>
          <p class="help-qs-text">Monitor active work orders, total registered PC counts, and recent student report submissions at a glance.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-red">
              <i data-lucide="wrench"></i>
            </div>
            <div class="help-qs-title">Maintenance Tracker</div>
          </div>
          <p class="help-qs-text">Filter tickets by status (All, Pending, Resolved), view issue details, and mark broken PCs as resolved with 1 click.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-blue">
              <i data-lucide="qr-code"></i>
            </div>
            <div class="help-qs-title">PC & QR Management</div>
          </div>
          <p class="help-qs-text">Add or delete workstation units, inspect room-by-room lab health, and generate printable QR code stickers.</p>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="bell"></i>
            Instant Ticket Alerts
          </div>
          <p class="help-feat-desc">Receive live notifications whenever students or faculty submit new hardware issue reports.</p>
        </div>
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="check-circle-2"></i>
            1-Click Ticket Repair
          </div>
          <p class="help-feat-desc">Resolving a ticket updates the work order and restores the PC unit to Functional condition in the database.</p>
        </div>
        <div class="help-feature-card theme-purple">
          <div class="help-feat-title">
            <i data-lucide="qr-code"></i>
            QR Sticker Generator
          </div>
          <p class="help-feat-desc">Export high-resolution QR stickers per laboratory room for fast workstation scanning.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Shared Account Control
          </div>
          <p class="help-feat-desc">Securely manage shared department access credentials and profile security settings.</p>
        </div>`;
    } else if (isItHead) {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-teal">
              <i data-lucide="layout-dashboard"></i>
            </div>
            <div class="help-qs-title">IT Head Dashboard</div>
          </div>
          <p class="help-qs-text">Overview of overall lab usage, schedule publishing, and department activity.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-green">
              <i data-lucide="calendar-range"></i>
            </div>
            <div class="help-qs-title">Master Schedule</div>
          </div>
          <p class="help-qs-text">View and manage the complete laboratory schedule for all faculty members and classes.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-indigo">
              <i data-lucide="users"></i>
            </div>
            <div class="help-qs-title">Faculty Management</div>
          </div>
          <p class="help-qs-text">Add new faculty members, manage accounts, and send automated credentials.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-purple">
              <i data-lucide="calendar-plus"></i>
            </div>
            <div class="help-qs-title">Schedule Editor</div>
          </div>
          <p class="help-qs-text">Create and customize room schedule blocks with imported subject catalogs.</p>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="file-spreadsheet"></i>
            Curriculum Import
          </div>
          <p class="help-feat-desc">Bulk upload subject catalogs using Excel or CSV templates.</p>
        </div>
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="printer"></i>
            Schedule Export
          </div>
          <p class="help-feat-desc">Print and export laboratory schedules for department display.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Secure Access
          </div>
          <p class="help-feat-desc">High-level administrative control over department scheduling.</p>
        </div>
        <div class="help-feature-card theme-green">
          <div class="help-feat-title">
            <i data-lucide="user-cog"></i>
            Account Settings
          </div>
          <p class="help-feat-desc">Manage your profile, credentials, and department settings.</p>
        </div>`;
    } else {
      quickStartHTML = `
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-teal">
              <i data-lucide="layout-dashboard"></i>
            </div>
            <div class="help-qs-title">Dashboard</div>
          </div>
          <p class="help-qs-text">View real-time lab status, your schedule, and pending PC reports at a glance.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-blue">
              <i data-lucide="monitor-dot"></i>
            </div>
            <div class="help-qs-title">Room Status</div>
          </div>
          <p class="help-qs-text">Monitor all laboratory rooms and their availability across campus.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-warning">
              <i data-lucide="clipboard-list"></i>
            </div>
            <div class="help-qs-title">PC Reports</div>
          </div>
          <p class="help-qs-text">Submit and track computer issues and maintenance requests for lab equipment.</p>
        </div>
        <div class="help-qs-card">
          <div class="help-qs-header">
            <div class="help-qs-icon theme-purple">
              <i data-lucide="calendar"></i>
            </div>
            <div class="help-qs-title">My Schedule</div>
          </div>
          <p class="help-qs-text">View your complete weekly teaching schedule and class assignments.</p>
        </div>`;

      featuresHTML = `
        <div class="help-feature-card theme-blue">
          <div class="help-feat-title">
            <i data-lucide="qr-code"></i>
            QR Code Access
          </div>
          <p class="help-feat-desc">Use your unique QR code for lab access and attendance tracking.</p>
        </div>
        <div class="help-feature-card theme-indigo">
          <div class="help-feat-title">
            <i data-lucide="bell"></i>
            Real-time Updates
          </div>
          <p class="help-feat-desc">Get instant notifications about lab status changes and reports.</p>
        </div>
        <div class="help-feature-card theme-amber">
          <div class="help-feat-title">
            <i data-lucide="shield-check"></i>
            Secure Access
          </div>
          <p class="help-feat-desc">Your account is protected with secure authentication.</p>
        </div>
        <div class="help-feature-card theme-green">
          <div class="help-feat-title">
            <i data-lucide="user-cog"></i>
            Account Settings
          </div>
          <p class="help-feat-desc">Manage your profile, password, and QR code from your account.</p>
        </div>`;
    }

    modal.innerHTML = `
      <div class="help-modal-dialog">
        <!-- Header -->
        <div class="help-modal-header">
          <div class="help-modal-header-left">
            <div class="help-modal-icon-box">
              <i data-lucide="circle-help"></i>
            </div>
            <div class="help-modal-title-wrap">
              <h2 class="help-modal-title">Help & Support</h2>
              <p class="help-modal-subtitle">Quick guide to using LabSync</p>
            </div>
          </div>
          <button id="close-help-modal" class="help-modal-close-btn">
            <i data-lucide="x"></i>
          </button>
        </div>
        
        <!-- Content -->
        <div class="help-modal-body">
          
          <!-- Quick Start -->
          <div style="margin-bottom:32px;">
            <h3 class="help-modal-section-title">
              <i data-lucide="zap"></i>
              Quick Start Guide
            </h3>
            <div class="help-qs-list">
              ${quickStartHTML}
            </div>
          </div>
          
          <!-- Features -->
          <div style="margin-bottom:32px;">
            <h3 class="help-modal-section-title">
              <i data-lucide="sparkles"></i>
              Key Features
            </h3>
            <div class="help-features-grid">
              ${featuresHTML}
            </div>
          </div>
          
          <!-- Need Help -->
          <div class="help-support-box">
            <h3 class="help-support-title">
              <i data-lucide="headphones"></i>
              Need More Help?
            </h3>
            <p class="help-support-desc">If you encounter any issues or have questions, please contact:</p>
            <div class="help-support-list">
              <div class="help-support-item">
                <i data-lucide="mail"></i>
                <strong>Email:</strong> <span class="highlight">support@labsync.bsu.edu.ph</span>
              </div>
              <div class="help-support-item">
                <i data-lucide="phone"></i>
                <strong>Phone:</strong> <span class="highlight">+63 123 456 7890</span>
              </div>
              <div class="help-support-item">
                <i data-lucide="map-pin"></i>
                <strong>Office:</strong> <span>IT Department, BSU Sarmiento Campus</span>
              </div>
            </div>
          </div>
          
        </div>
        
        <!-- Footer -->
        <div class="help-modal-footer">
          <p>LabSync v1.0 - BSU Sarmiento Campus</p>
          <button id="close-help-btn" class="help-modal-got-it-btn">
            Got it!
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    // Close handlers
    const closeHelpModalBtn = document.getElementById('close-help-modal');
    const closeHelpBtn = document.getElementById('close-help-btn');
    if (closeHelpModalBtn) closeHelpModalBtn.addEventListener('click', () => modal.remove());
    if (closeHelpBtn) closeHelpBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  /**
   * Bind click events dynamically to Help buttons in sidebars.
   */
  function initHelpButtons() {
    const helpButtons = document.querySelectorAll('.sidebar-btn[title="Help"]');
    helpButtons.forEach(btn => {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openHelpModal();
      });
    });
  }

  /**
   * Global helper to toggle password input visibility.
   */
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
  global.initProfileDropdown = initProfileDropdown;
  global.openAccountSettings = openAccountSettings;
  global.openHelpModal = openHelpModal;
  global.initHelpButtons = initHelpButtons;
  global.switchSettingsTab = switchSettingsTab;
  global.togglePasswordVisibility = togglePasswordVisibility;

})(typeof window !== 'undefined' ? window : this);
