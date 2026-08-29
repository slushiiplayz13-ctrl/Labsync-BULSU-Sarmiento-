/**
 * LabSync Change Password Modal | js/components/profile/password-modal.js
 * Password change modal with input validation, password match verification, and API submission.
 */

(function (global) {
  'use strict';

  function openChangePasswordModal() {
    const existing = document.getElementById('change-password-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'change-password-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2200;padding:20px;';

    modal.innerHTML = `
      <div style="background:var(--bg-white, #ffffff);border:1.5px solid var(--border-light, #374151);border-radius:20px;width:100%;max-width:440px;padding:28px;box-shadow:0 25px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;gap:20px;font-family:var(--font-body);color:var(--text-dark);">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-light);padding-bottom:16px;">
          <div>
            <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;margin:0 0 4px 0;color:var(--text-dark);">Change Password</h3>
            <p style="font-size:13px;color:var(--text-mid);margin:0;">Update your login credentials securely</p>
          </div>
          <button id="close-password-modal-btn" type="button" style="background:var(--bg-card, #F1F5F9);border:1px solid var(--border-light);cursor:pointer;padding:6px;border-radius:8px;display:flex;align-items:center;color:var(--text-dark);">
            <i data-lucide="x" style="width:18px;height:18px;"></i>
          </button>
        </div>

        <!-- Form -->
        <form id="change-password-form" style="display:flex;flex-direction:column;gap:16px;margin:0;">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-dark);">Current Password *</label>
            <input type="password" id="cp-current-password" required style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;outline:none;background:var(--bg-card, #fff);color:var(--text-dark);" placeholder="Enter current password">
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-dark);">New Password *</label>
            <input type="password" id="cp-new-password" required minlength="8" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;outline:none;background:var(--bg-card, #fff);color:var(--text-dark);" placeholder="At least 8 characters">
          </div>
          <div>
            <label style="display:block;font-size:13px;font-weight:600;margin-bottom:6px;color:var(--text-dark);">Confirm New Password *</label>
            <input type="password" id="cp-confirm-password" required minlength="8" style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid var(--border-light);border-radius:10px;font-size:14px;outline:none;background:var(--bg-card, #fff);color:var(--text-dark);" placeholder="Re-enter new password">
          </div>

          <!-- Password Requirements Instruction Box -->
          <div style="background:rgba(245,158,11,0.12);border:1.5px solid rgba(245,158,11,0.25);border-radius:10px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start;">
            <i data-lucide="shield-check" style="width:18px;height:18px;color:#F59E0B;flex-shrink:0;margin-top:2px;"></i>
            <div>
              <p style="margin:0 0 2px 0;font-size:12.5px;font-weight:700;color:var(--text-dark);">Password Requirements</p>
              <p style="margin:0;font-size:12px;color:var(--text-mid);line-height:1.4;">Must be at least 8 characters long with a combination of letters, numbers, or symbols.</p>
            </div>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
            <button type="button" id="cancel-cp-btn" style="padding:10px 18px;border:1.5px solid var(--border-light);background:var(--bg-card, #fff);border-radius:10px;font-size:13.5px;font-weight:600;color:var(--text-dark);cursor:pointer;transition:all 0.2s;">Cancel</button>
            <button type="submit" id="submit-cp-btn" style="padding:10px 22px;border:none;background:var(--primary-teal);color:#fff;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px var(--primary-teal-glow);transition:all 0.2s;">Update Password</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeModal = () => modal.remove();
    document.getElementById('close-password-modal-btn').addEventListener('click', closeModal);
    document.getElementById('cancel-cp-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const form = document.getElementById('change-password-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('cp-current-password')?.value;
        const newPass = document.getElementById('cp-new-password')?.value;
        const confirmPass = document.getElementById('cp-confirm-password')?.value;

        if (newPass !== confirmPass) {
          if (global.showToast) {
            global.showToast('New passwords do not match.', 'error');
          } else {
            alert('New passwords do not match.');
          }
          return;
        }

        const submitBtn = document.getElementById('submit-cp-btn');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Updating...';
        }

        try {
          const userService = global.userService;
          if (userService && typeof userService.updatePassword === 'function') {
            await userService.updatePassword(currentPass, newPass);
          } else {
            const res = await fetch('/api/user/update', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update password');
          }

          if (global.showToast) {
            global.showToast('Password updated successfully!', 'success');
          } else {
            alert('Password updated successfully!');
          }
          closeModal();
        } catch (err) {
          alert(err.message || 'An error occurred while updating password.');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Update Password';
          }
        }
      });
    }
  }

  const passwordModal = {
    openChangePasswordModal
  };

  global.passwordModal = passwordModal;
  global.openChangePasswordModal = openChangePasswordModal;

})(typeof window !== 'undefined' ? window : this);
