/**
 * LabSync Account Settings Modal | js/components/profile/account-modal.js
 * Manages profile photo uploads, personal information updates, email authorization, and QR code downloads.
 */

(function (global) {
  'use strict';

  /**
   * Helper function to show secure email change authentication modal.
   */
  function showEmailChangeConfirmation(oldEmail, newEmail, onConfirm) {
    const overlay = document.createElement('div');
    overlay.id = 'email-confirm-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:2100;padding:20px;';

    overlay.innerHTML = `
      <div class="email-confirm-content" style="background:var(--bg-white, #fff);border:1px solid var(--border-light, #e2e8f0);border-radius:24px;width:100%;max-width:460px;padding:32px;box-shadow:0 25px 60px rgba(0,0,0,0.25);display:flex;flex-direction:column;align-items:center;gap:20px;font-family:var(--font-body);animation:fadeIn 0.25s ease-out;color:var(--text-dark);">
        <div style="width:68px;height:68px;background:rgba(239,68,68,0.1);color:#EF4444;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(239,68,68,0.15);">
          <i data-lucide="shield-alert" style="width:34px;height:34px;"></i>
        </div>
        
        <div style="width:100%;text-align:center;">
          <h3 style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-dark);margin:0 0 8px 0;">Email Change Security Authorization</h3>
          <p style="font-size:13.5px;color:var(--text-mid);line-height:1.5;margin:0 0 16px 0;">
            You are requesting to change your account email to <strong style="color:var(--text-dark);font-weight:700;">${newEmail}</strong>.
          </p>
          
          <div style="display:flex;flex-direction:column;gap:10px;text-align:left;margin-bottom:16px;">
            <div class="email-alert-notice" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:12px 14px;font-size:12.5px;color:var(--text-dark);line-height:1.5;display:flex;gap:10px;align-items:flex-start;">
              <i data-lucide="shield-check" style="width:18px;height:18px;color:#F59E0B;flex-shrink:0;margin-top:2px;"></i>
              <span style="color:var(--text-dark);">A <strong class="highlight-text" style="color:#D97706;font-weight:700;">Confirmation Approval Link</strong> will be sent to your current email (<strong style="color:var(--text-dark);font-weight:700;">${oldEmail}</strong>). You must click this link to authorize updating your account email to <strong style="color:var(--text-dark);font-weight:700;">${newEmail}</strong>.</span>
            </div>
          </div>
          <p style="font-size:12px;color:var(--text-muted);margin:0 0 16px 0;line-height:1.4;text-align:left;">Your account login email address will remain unchanged until authorized from your current email inbox.</p>

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
   * Switches tabs inside Account Settings modal.
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
   * Loads user information into Account Settings modal fields.
   */
  async function loadAccountSettingsData() {
    try {
      const userService = global.userService;
      let user = null;
      if (userService && typeof userService.getCurrentUser === 'function') {
        user = await userService.getCurrentUser();
      } else {
        const response = await fetch('/api/user/current', { credentials: 'include' });
        if (response.ok) user = await response.json();
      }

      if (!user) return;

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

        // MIS Staff do not borrow laboratory room keys via IoT key box scanner; hide personal QR tab
        const qrTabBtn = document.getElementById('tab-btn-qrcode');
        if (qrTabBtn) qrTabBtn.style.display = 'none';
        const qrPanel = document.getElementById('panel-qrcode');
        if (qrPanel) qrPanel.style.display = 'none';
      }

      const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
      const initialsEl = document.getElementById('avatar-initials');
      if (initialsEl) initialsEl.textContent = initials;

      const lastUpdatedEl = document.getElementById('settings-last-updated');
      if (lastUpdatedEl) {
        const lastUpdated = user.updatedAt || user.updated_at || user.last_updated || localStorage.getItem('labsync_last_updated');
        const timeUtils = global.timeUtils || global.scheduleTimeUtils;
        const formatTimeFn = (timeUtils && typeof timeUtils.formatLastUpdatedTime === 'function')
          ? timeUtils.formatLastUpdatedTime
          : (global.formatLastUpdatedTime || ((t) => t || 'Never'));
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

      // Skip fetching personal user QR code for MIS Staff (faculty-only IoT key box access)
      if (!isMisStaff) {
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
      }
    } catch (error) {
      console.error('[AccountModal] Error loading account settings data:', error);
    }
  }

  /**
   * Opens Account Settings Modal.
   */
  function openAccountSettings() {
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu) profileMenu.style.display = 'none';

    const existing = document.getElementById('account-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'account-settings-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;';

    modal.innerHTML = `
      <div class="settings-modal-content-box" style="background:var(--bg-white, #fff);border:1.5px solid var(--border-light, #374151);border-radius:20px;width:100%;max-width:900px;height:85vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;">
        <!-- Header -->
        <div style="padding:28px 32px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;background:var(--bg-card, #F0F9FF);flex-shrink:0;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:24px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Account Settings</h2>
            <p style="font-size:13px;color:var(--text-mid);margin:0;">Manage your profile information and security settings</p>
          </div>
          <button id="close-settings-modal" style="background:var(--bg-white, #F5F5F5);border:1px solid var(--border-light);cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all 0.2s;color:var(--text-dark);">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>
        
        <!-- Body Split View -->
        <div class="settings-modal-body" style="flex:1; display:flex; min-height:0; position:relative; overflow:hidden;">
          <div class="settings-modal-sidebar" style="width:240px; border-right:1px solid var(--border-light); background:var(--bg-page, #F8FAFC); padding:24px 16px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; overflow-y:auto;">
            <button type="button" class="settings-tab-btn active" data-tab="profile">
              <i data-lucide="user" style="width:18px;height:18px;"></i>
              Profile Details
            </button>
            <button type="button" class="settings-tab-btn" data-tab="security">
              <i data-lucide="lock" style="width:18px;height:18px;"></i>
              Security & Login
            </button>
            <button type="button" class="settings-tab-btn" id="tab-btn-qrcode" data-tab="qrcode">
              <i data-lucide="qr-code" style="width:18px;height:18px;"></i>
              My QR Code
            </button>
          </div>

          <form id="account-settings-form" class="settings-modal-form" style="flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg-white, #fff); margin:0;">
            <div class="settings-modal-scroll" style="flex:1; overflow-y:auto; padding:32px 40px;">
              
              <!-- PANEL 1: PROFILE DETAILS -->
              <div id="panel-profile" class="settings-tab-panel" style="display:block;">
                <div style="margin-bottom:28px;">
                  <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Profile Details</h3>
                  <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Update your personal details and profile photo</p>
                </div>

                <div id="mis-shared-account-banner" class="banner-mis-notice info" style="display:none; border-radius:12px; padding:14px 16px; margin-bottom:24px; align-items:flex-start; gap:12px;">
                  <i data-lucide="shield-alert" class="banner-icon" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;"></i>
                  <div>
                    <div class="banner-title" style="font-weight:700;font-size:13.5px;margin-bottom:2px;">Shared Department Account</div>
                    <p class="banner-text" style="font-size:13px;margin:0;line-height:1.4;">This account is shared by all MIS Personnel. Profile information (Full Name, Email Address, Mobile Number) is restricted to maintain department access.</p>
                  </div>
                </div>

                <div style="display:flex; gap:36px; align-items:flex-start; flex-wrap:wrap;">
                  <div style="width:190px; display:flex; flex-direction:column; align-items:center; gap:16px; padding:24px 16px; border:2px dashed var(--border-light); border-radius:16px; background:var(--bg-card, #F8FAFC); flex-shrink:0;">
                    <div id="profile-photo-preview" style="width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg, #1EBBD7 0%, #0EA5E9 100%);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;font-family:var(--font-display);box-shadow:0 8px 20px rgba(30,187,215,0.25);position:relative;overflow:hidden;flex-shrink:0;">
                      <span id="avatar-initials">U</span>
                      <img id="profile-photo-img" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;display:none;">
                    </div>
                    <input type="file" id="profile-photo-input" accept="image/*" style="display:none;">
                    <button type="button" id="upload-photo-btn" style="padding:10px 16px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 10px rgba(30,187,215,0.2);font-family:var(--font-body);display:flex;align-items:center;gap:6px;">
                      <i data-lucide="upload" style="width:14px;height:14px;"></i>
                      Upload Photo
                    </button>
                    <button type="button" id="remove-photo-btn" style="padding:6px 12px;border:1.5px solid var(--border-light);background:var(--bg-card);color:var(--text-mid);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);display:none;">Remove Photo</button>
                    <p style="font-size:11.5px;color:var(--text-muted);text-align:center;margin:0;line-height:1.4;">JPG, PNG or GIF<br>Max size: 2MB</p>
                  </div>

                  <div style="flex:1; min-width:260px; display:flex; flex-direction:column; gap:20px;">
                    <div>
                      <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Full Name *</label>
                      <input type="text" id="settings-name" required style="width:100%;box-sizing:border-box;padding:12px 16px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;background:var(--bg-card, #F8FAFC);color:var(--text-dark);" placeholder="Your full name">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                      <div>
                        <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Email Address</label>
                        <input type="email" id="settings-email" required style="width:100%;box-sizing:border-box;padding:12px 16px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;background:var(--bg-card, #F8FAFC);color:var(--text-dark);" placeholder="your.email@bsu.edu.ph">
                        <div id="settings-email-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Invalid email address (e.g., user@domain.com)</div>
                      </div>
                      <div>
                        <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Contact Number *</label>
                        <input type="tel" id="settings-phone" inputmode="numeric" maxlength="11" pattern="[0-9]{11}" required style="width:100%;box-sizing:border-box;padding:12px 16px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;background:var(--bg-card, #F8FAFC);color:var(--text-dark);" placeholder="09171234567">
                        <p style="font-size:11.5px;color:var(--text-muted);margin:4px 0 0 0;">Format: Exactly 11-digit mobile number (e.g. 09XXXXXXXXX)</p>
                        <div id="settings-phone-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Contact number must contain exactly 11 digits.</div>
                      </div>
                    </div>

                    <!-- Email & Mobile Change Security Notice -->
                    <div style="background:rgba(14,165,233,0.1); border:1.5px solid rgba(14,165,233,0.25); border-radius:12px; padding:12px 16px; display:flex; gap:12px; align-items:flex-start; margin-top:4px;">
                      <i data-lucide="shield-check" style="width:18px;height:18px;color:#0284C7;flex-shrink:0;margin-top:2px;"></i>
                      <p style="margin:0;font-size:12.5px;line-height:1.5;color:var(--text-dark);">Changing your email address requires your <strong>Current Password</strong>. A <strong>Confirmation Approval Link</strong> will be sent to your current email address to authorize the update.</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- PANEL 2: SECURITY & LOGIN -->
              <div id="panel-security" class="settings-tab-panel" style="display:none;">
                <div style="margin-bottom:28px;">
                  <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Security & Login</h3>
                  <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Manage your account password and security credentials</p>
                </div>

                <div id="mis-password-notice" class="banner-mis-notice alert" style="display:none; border-radius:12px; padding:14px 16px; margin-bottom:24px; align-items:flex-start; gap:12px;">
                  <i data-lucide="lock" class="banner-icon" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;"></i>
                  <div>
                    <div class="banner-title" style="font-weight:700;font-size:13.5px;margin-bottom:2px;">Shared Password Warning</div>
                    <p class="banner-text" style="font-size:13px;margin:0;line-height:1.4;">Changing this password will immediately update access for all other MIS Personnel using this shared account.</p>
                  </div>
                </div>

                <div style="background:var(--bg-card, #F8FAFC);border:1.5px solid var(--border-light);border-radius:14px;padding:24px;display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <div style="font-weight:700;font-size:14px;color:var(--text-dark);margin-bottom:4px;">Change Account Password</div>
                    <div style="font-size:13px;color:var(--text-mid);">Update your login password regularly for security</div>
                  </div>
                  <button type="button" id="open-change-password-modal-btn" style="padding:10px 18px;border:1.5px solid var(--border-light);background:var(--bg-white, #fff);color:var(--text-dark);border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;">
                    <i data-lucide="key-round" style="width:15px;height:15px;"></i>
                    Change Password
                  </button>
                </div>

                <!-- Password Security Tip Box -->
                <div style="background:rgba(245,158,11,0.12);border:1.5px solid rgba(245,158,11,0.25);border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start;margin-top:16px;">
                  <i data-lucide="shield-check" style="width:20px;height:20px;color:#F59E0B;flex-shrink:0;margin-top:2px;"></i>
                  <div>
                    <div style="font-weight:700;font-size:13px;color:var(--text-dark);margin-bottom:2px;">Security Tip</div>
                    <p style="font-size:12.5px;color:var(--text-mid);margin:0;line-height:1.4;">Use a strong password with at least 8 characters, including numbers and symbols to keep your account protected.</p>
                  </div>
                </div>
              </div>

              <!-- PANEL 3: MY QR CODE -->
              <div id="panel-qrcode" class="settings-tab-panel" style="display:none;">
                <div style="margin-bottom:28px;">
                  <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">My QR Code</h3>
                  <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Use this personal QR code for laboratory entry scanner</p>
                </div>

                <div style="display:flex; flex-direction:column; align-items:center; gap:24px; padding:32px 0;">
                  <div id="qr-code-container" style="width:240px;height:240px;padding:16px;background:#fff;border:2px solid var(--border-light);border-radius:20px;box-shadow:0 12px 30px rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:center;">
                    <div class="ui-empty-state"><i data-lucide="loader" style="animation:spin 1s linear infinite;"></i></div>
                  </div>
                  <button type="button" id="download-qr-btn" style="padding:12px 24px;border:none;background:var(--primary-teal);color:#fff;border-radius:12px;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 4px 14px var(--primary-teal-glow);transition:all 0.2s;">
                    <i data-lucide="download" style="width:16px;height:16px;"></i>
                    Download High-Res QR
                  </button>
                </div>
              </div>

            </div>

            <!-- Footer Toolbar -->
            <div style="padding:20px 36px;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;background:var(--bg-card, #fff);flex-shrink:0;">
              <span id="settings-last-updated" style="font-size:12.5px;color:var(--text-muted);">Last updated: Loading...</span>
              <div style="display:flex;gap:12px;">
                <button type="button" id="cancel-settings-btn" style="padding:11px 22px;border:1.5px solid var(--border-light);background:var(--bg-white, #fff);color:var(--text-dark);border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;transition:all 0.2s;">Cancel</button>
                <button type="submit" id="save-settings-btn" style="padding:11px 26px;border:none;background:var(--primary-teal);color:#fff;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 14px var(--primary-teal-glow);transition:all 0.2s;">Save Changes</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    loadAccountSettingsData();

    // Close handlers
    const closeModal = () => modal.remove();
    document.getElementById('close-settings-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-settings-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Tab buttons
    modal.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab) switchSettingsTab(tab, btn);
      });
    });

    // Photo upload trigger button
    const uploadTrigger = document.getElementById('upload-photo-btn');
    if (uploadTrigger) {
      uploadTrigger.addEventListener('click', () => {
        const input = document.getElementById('profile-photo-input');
        if (input) input.click();
      });
    }

    // Sub-modal triggers
    const openPassBtn = document.getElementById('open-change-password-modal-btn');
    if (openPassBtn) {
      openPassBtn.addEventListener('click', () => {
        if (global.passwordModal && typeof global.passwordModal.openChangePasswordModal === 'function') {
          global.passwordModal.openChangePasswordModal();
        } else if (typeof global.openChangePasswordModal === 'function') {
          global.openChangePasswordModal();
        }
      });
    }

    // Photo upload handling
    const photoInput = document.getElementById('profile-photo-input');
    const photoImg = document.getElementById('profile-photo-img');
    const avatarInitials = document.getElementById('avatar-initials');
    const removePhotoBtn = document.getElementById('remove-photo-btn');

    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          if (file.size > 2 * 1024 * 1024) {
            alert('File size exceeds 2MB limit.');
            return;
          }
          const reader = new FileReader();
          reader.onload = (re) => {
            if (photoImg && avatarInitials && removePhotoBtn) {
              photoImg.src = re.target.result;
              photoImg.style.display = 'block';
              avatarInitials.style.display = 'none';
              removePhotoBtn.style.display = 'block';
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (removePhotoBtn) {
      removePhotoBtn.addEventListener('click', () => {
        if (photoImg && avatarInitials) {
          photoImg.src = '';
          photoImg.style.display = 'none';
          avatarInitials.style.display = 'block';
          removePhotoBtn.style.display = 'none';
          if (photoInput) photoInput.value = '';
        }
      });
    }

    // Real-time Contact Number Sanitization (Digits only, max 11 digits, paste protection)
    const phoneInput = document.getElementById('settings-phone');
    const phoneErr = document.getElementById('settings-phone-error');
    if (phoneInput) {
      phoneInput.addEventListener('input', () => {
        const digitsOnly = phoneInput.value.replace(/\D/g, '').slice(0, 11);
        if (phoneInput.value !== digitsOnly) {
          phoneInput.value = digitsOnly;
        }
        if (phoneErr && /^\d{11}$/.test(digitsOnly)) {
          phoneErr.style.display = 'none';
          phoneInput.style.borderColor = 'var(--border-light)';
        }
      });

      phoneInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text') || '';
        const digitsOnly = text.replace(/\D/g, '').slice(0, 11);
        phoneInput.value = digitsOnly;
        if (phoneErr && /^\d{11}$/.test(digitsOnly)) {
          phoneErr.style.display = 'none';
          phoneInput.style.borderColor = 'var(--border-light)';
        }
      });
    }

    // Form submit
    const form = document.getElementById('account-settings-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameVal = document.getElementById('settings-name')?.value.trim();
        const emailVal = document.getElementById('settings-email')?.value.trim();
        const initialEmail = document.getElementById('settings-email')?.dataset.initialEmail || '';
        const phoneVal = document.getElementById('settings-phone')?.value.trim();
        const photoSrc = photoImg && photoImg.style.display !== 'none' ? photoImg.src : null;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailVal)) {
          const emailErr = document.getElementById('settings-email-error');
          if (emailErr) emailErr.style.display = 'block';
          return;
        }

        const phoneRegex = /^\d{11}$/;
        if (!phoneRegex.test(phoneVal)) {
          if (phoneErr) phoneErr.style.display = 'block';
          if (phoneInput) {
            phoneInput.style.borderColor = '#EF4444';
            phoneInput.focus();
          }
          if (global.showToast) {
            global.showToast('Contact number must contain exactly 11 digits.', 'error');
          }
          return;
        }

        async function executeSave(pwdForEmailChange = null) {
          const saveBtn = document.getElementById('save-settings-btn');
          if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
          }

          try {
            const payload = {
              name: nameVal,
              phone: phoneVal,
              profilePhoto: photoSrc
            };

            if (emailVal !== initialEmail && pwdForEmailChange) {
              payload.email = emailVal;
              payload.currentPassword = pwdForEmailChange;
            }

            const userService = global.userService;
            let updatedUser = null;
            if (userService && typeof userService.updateProfile === 'function') {
              updatedUser = await userService.updateProfile(payload);
            } else {
              const res = await fetch('/api/user/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
              });
              const resData = await res.json();
              if (!res.ok) {
                throw new Error(resData.error || 'Failed to update profile');
              }
              updatedUser = resData;
            }

            if (global.showToast) {
              global.showToast('Profile updated successfully!', 'success');
            } else {
              alert('Profile updated successfully!');
            }
            closeModal();
          } catch (err) {
            alert(err.message || 'An error occurred while saving.');
          } finally {
            if (saveBtn) {
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save Changes';
            }
          }
        }

        if (emailVal !== initialEmail) {
          showEmailChangeConfirmation(initialEmail, emailVal, (pwd) => {
            executeSave(pwd);
          });
        } else {
          executeSave();
        }
      });
    }
  }

  const accountModal = {
    openAccountSettings,
    loadAccountSettingsData,
    switchSettingsTab,
    showEmailChangeConfirmation
  };

  global.accountModal = accountModal;
  global.openAccountSettings = openAccountSettings;
  global.switchSettingsTab = switchSettingsTab;

})(typeof window !== 'undefined' ? window : this);
