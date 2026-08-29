/**
 * LabSync Edit Faculty Role Modal | js/faculty/modals/edit-role.modal.js
 * Manages role modifications and permissions upgrades with leadership handoff guards.
 */

(function (global) {
  'use strict';

  function changeFacultyRole(userId, name, currentRole, onSuccess) {
    const existing = document.getElementById('role-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'role-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;width:90%;max-width:440px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,0.2);transform:translateY(20px);transition:transform 0.25s ease;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#1F2937;margin:0;">Change Faculty Role</h2>
          <button id="close-role-modal" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="x" style="width:18px;height:18px;color:#9CA3AF;"></i>
          </button>
        </div>
        
        <p style="margin:0 0 20px 0;font-size:14px;color:#4B5563;font-family:var(--font-body);line-height:1.5;">
          Update the administrative permissions and role for <strong>${escapeHtml(name)}</strong>.
        </p>
        
        <form id="change-role-form" style="display:flex;flex-direction:column;gap:18px;font-family:var(--font-body);">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Select Role</label>
            <div class="custom-select-wrapper" id="role-select-wrapper" style="width: 100%;">
              <div class="custom-select-trigger" style="width: 100%; padding: 12px 14px; border: 1.5px solid var(--border-light); border-radius: 8px; font-family: var(--font-body); font-size: 14px; background: var(--bg-white); color: var(--text-dark); cursor: pointer; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
                <span>${currentRole === 'Faculty' ? 'Faculty (Regular Lecturer)' : 'IT Dept. Head (Administrator)'}</span>
                <i data-lucide="chevron-down" style="width: 18px; height: 18px; color: var(--text-light);"></i>
              </div>
              <div class="custom-select-dropdown" style="color: var(--text-dark);">
                <div class="custom-select-option ${currentRole === 'Faculty' ? 'selected' : ''}" data-value="Faculty">Faculty (Regular Lecturer)</div>
                <div class="custom-select-option ${String(currentRole).includes('Head') ? 'selected' : ''}" data-value="IT Dept. Head">IT Dept. Head (Administrator)</div>
              </div>
            </div>
          </div>
          
          <div class="alert-info-box">
            <i data-lucide="info"></i>
            <p>Upgrading a user to Department Head grants them access to master schedule overrides and faculty roster updates.</p>
          </div>
          
          <div style="display:flex;gap:12px;margin-top:8px;">
            <button type="button" id="cancel-role-btn" style="flex:1;padding:12px;border:1px solid #E5E7EB;background:#fff;border-radius:8px;font-size:14px;font-weight:600;color:#4B5563;cursor:pointer;transition:all 0.2s;">Cancel</button>
            <button type="submit" style="flex:1;padding:12px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(0)';
    }, 10);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons();
    }
    if (global.initCustomSelect) {
      global.initCustomSelect('role-select-wrapper');
    }

    const closeModal = () => {
      modal.style.opacity = '0';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => modal.remove(), 250);
    };

    const closeBtn = document.getElementById('close-role-modal');
    const cancelBtn = document.getElementById('cancel-role-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const roleForm = document.getElementById('change-role-form');
    if (roleForm) {
      roleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wrapper = document.getElementById('role-select-wrapper');
        const select = document.getElementById('role-select');
        const newRole = (wrapper && wrapper.dataset ? wrapper.dataset.value : null) || (select ? select.value : null) || 'Faculty';

        const executeUpdate = async () => {
          try {
            if (global.facultyService && typeof global.facultyService.changeFacultyRole === 'function') {
              await global.facultyService.changeFacultyRole(userId, newRole);
            } else {
              const response = await fetch(`/api/faculty/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ role: newRole })
              });
              if (!response.ok) throw new Error('Failed to update role');
            }

            closeModal();
            if (typeof onSuccess === 'function') {
              await onSuccess();
            } else if (typeof global.loadFacultyMembers === 'function') {
              await global.loadFacultyMembers();
            }

            if (newRole === 'IT Dept. Head') {
              const profileRoleEl = document.querySelector('.profile-role');
              if (profileRoleEl) {
                profileRoleEl.textContent = 'Faculty';
              }

              const cachedUser = localStorage.getItem('user');
              if (cachedUser) {
                try {
                  const userObj = JSON.parse(cachedUser);
                  userObj.role = 'Faculty';
                  localStorage.setItem('user', JSON.stringify(userObj));
                } catch (err) {}
              }

              const transferModal = global.transferLeadershipModal;
              if (transferModal && typeof transferModal.showSuccessGreetingModal === 'function') {
                transferModal.showSuccessGreetingModal(name);
              }
            }
          } catch (err) {
            console.error('[EditRoleModal] Error updating role:', err);
            alert('Error updating role: ' + (err.message || 'Please try again.'));
          }
        };

        if (newRole === 'IT Dept. Head' && !String(currentRole).includes('Head')) {
          modal.style.display = 'none';

          const transferModal = global.transferLeadershipModal;
          if (transferModal && typeof transferModal.showTransferConfirmation === 'function') {
            transferModal.showTransferConfirmation(
              name,
              () => { executeUpdate(); },
              () => { modal.style.display = 'flex'; }
            );
          } else {
            executeUpdate();
          }
        } else {
          executeUpdate();
        }
      });
    }
  }

  const editRoleModal = {
    changeFacultyRole
  };

  global.editRoleModal = editRoleModal;

})(typeof window !== 'undefined' ? window : this);
