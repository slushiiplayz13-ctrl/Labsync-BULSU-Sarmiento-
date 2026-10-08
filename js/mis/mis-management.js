/* ================================================================
   LabSync – MIS Staff Management UI Coordinator | js/mis/mis-management.js
   Handles roster rendering, account replacement, deactivation, and modals.
   ================================================================ */

'use strict';

(function (global) {
  let _misData = { active: null, history: [], all: [] };

  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Fetches MIS Staff data from server and renders active and historical sections.
   */
  async function loadMisStaff() {
    const activeEl = document.getElementById('mis-active-container');
    const historyEl = document.getElementById('mis-history-container');
    if (!activeEl) return;

    try {
      if (global.misService && typeof global.misService.getMisStaff === 'function') {
        const res = await global.misService.getMisStaff();
        _misData = res || { active: null, history: [], all: [] };
      }

      renderActiveMisSection(_misData.active, activeEl);
      if (historyEl) {
        renderHistoryMisSection(_misData.history, historyEl);
      }

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
    } catch (err) {
      console.error('[MIS Management] Error loading accounts:', err);
      if (activeEl) {
        activeEl.innerHTML = `
          <div class="ui-empty-state" style="padding: 24px;">
            <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
              <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
            </div>
            <p>Failed to load MIS Staff records. Please refresh the page.</p>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: activeEl });
        }
      }
    }
  }

  /**
   * Renders the Active MIS Staff section.
   */
  function renderActiveMisSection(activeUser, container) {
    if (!activeUser) {
      container.innerHTML = `
        <div class="mis-empty-card">
          <div class="mis-empty-icon">
            <i data-lucide="shield-alert"></i>
          </div>
          <h3 class="mis-empty-title">No Active MIS Staff Account</h3>
          <p class="mis-empty-desc">
            The school's MIS Staff position is currently vacant or the outgoing account has been deactivated. Create a new MIS Staff account to activate system maintenance and custodial administration.
          </p>
          <button type="button" class="fm-add-btn" id="btn-add-mis" style="display:inline-flex;margin:0 auto;">
            <i data-lucide="user-plus" style="width:16px;height:16px;"></i>
            Add MIS Staff
          </button>
        </div>
      `;

      const addBtn = container.querySelector('#btn-add-mis');
      if (addBtn) {
        addBtn.addEventListener('click', () => showAddMisStaffModal());
      }
      return;
    }

    const name = activeUser.Name || 'Unnamed Staff';
    const email = activeUser.Email || 'No email';
    const phone = activeUser.Phone || 'Not specified';
    const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

    const isSafePhoto = typeof activeUser.Profile_Photo === 'string' &&
      /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(activeUser.Profile_Photo.trim());

    const avatarHtml = isSafePhoto
      ? `<img src="${escapeHtml(activeUser.Profile_Photo)}" alt="${escapeHtml(name)}">`
      : escapeHtml(initials);

    container.innerHTML = `
      <div class="mis-lead-card">
        <div class="mis-lead-header">
          
          <!-- Avatar + Identity -->
          <div class="mis-lead-identity">
            <div class="mis-lead-avatar">
              ${avatarHtml}
            </div>
            <div class="mis-lead-meta">
              <div class="mis-lead-name-row">
                <h3 class="mis-lead-name">${escapeHtml(name)}</h3>
                <span class="mis-badge-active">
                  <span class="mis-badge-dot"></span> Active
                </span>
              </div>
              <div class="mis-role-pill">
                <i data-lucide="shield-check"></i> MIS Staff (Technical &amp; Custodial Lead)
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="mis-actions">
            <button type="button" id="btn-edit-mis" class="mis-btn mis-btn-edit">
              <i data-lucide="edit-3"></i> Edit Details
            </button>
            <button type="button" id="btn-deactivate-mis" class="mis-btn mis-btn-deact">
              <i data-lucide="user-x"></i> Deactivate Account
            </button>
          </div>

        </div>

        <!-- Contact Detail Bento Grid -->
        <div class="mis-contact-grid">
          <div class="mis-contact-card">
            <div class="mis-contact-icon-wrap email-wrap">
              <i data-lucide="mail"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Official Email</span>
              <span class="mis-contact-val" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
            </div>
          </div>
          <div class="mis-contact-card">
            <div class="mis-contact-icon-wrap phone-wrap">
              <i data-lucide="phone"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Contact Number</span>
              <span class="mis-contact-val">${escapeHtml(phone)}</span>
            </div>
          </div>
          <div class="mis-contact-card">
            <div class="mis-contact-icon-wrap role-wrap">
              <i data-lucide="shield"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Custodial Scope</span>
              <span class="mis-contact-val">PC Maintenance &amp; Custody</span>
            </div>
          </div>
        </div>

      </div>
    `;

    const editBtn = container.querySelector('#btn-edit-mis');
    if (editBtn) {
      editBtn.addEventListener('click', () => showEditMisStaffModal(activeUser));
    }

    const deactBtn = container.querySelector('#btn-deactivate-mis');
    if (deactBtn) {
      deactBtn.addEventListener('click', () => showDeactivateMisStaffModal(activeUser));
    }
  }

  /**
   * Renders the Historical/Deactivated MIS Staff section.
   */
  function renderHistoryMisSection(historyList, container) {
    if (!Array.isArray(historyList) || historyList.length === 0) {
      container.innerHTML = `
        <div class="mis-history-empty">
          <div class="mis-history-empty-icon">
            <i data-lucide="history"></i>
          </div>
          <p style="margin:0;">No deactivated MIS accounts on record.</p>
        </div>
      `;
      return;
    }

    let rowsHtml = '';
    historyList.forEach(u => {
      const name = u.Name || 'Unnamed Staff';
      const email = u.Email || 'No email';
      const phone = u.Phone || '—';
      const updatedDate = u.Updated_At ? new Date(u.Updated_At).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
      const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

      rowsHtml += `
        <tr>
          <td>
            <div class="mis-hist-user">
              <div class="mis-hist-avatar">
                ${escapeHtml(initials)}
              </div>
              <div>
                <div class="mis-hist-name">${escapeHtml(name)}</div>
                <div class="mis-hist-email">${escapeHtml(email)}</div>
              </div>
            </div>
          </td>
          <td class="mis-hist-phone">${escapeHtml(phone)}</td>
          <td class="mis-hist-date">${escapeHtml(updatedDate)}</td>
          <td>
            <span class="mis-badge-deact">
              DEACTIVATED
            </span>
          </td>
          <td>
            <span class="mis-badge-audit">
              <i data-lucide="check-circle-2"></i> Records Preserved
            </span>
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="mis-history-wrapper">
        <table class="mis-history-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Contact</th>
              <th>Deactivated On</th>
              <th>Status</th>
              <th>Audit Trail</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Modal: Add New MIS Staff
   */
  function showAddMisStaffModal() {
    const existing = document.getElementById('mis-add-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mis-add-modal';
    modal.className = 'mis-modal-overlay';

    modal.innerHTML = `
      <div class="mis-modal-dialog">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-dark);margin:0;">Add MIS Staff Member</h2>
            <p style="font-size:13px;color:var(--text-light);margin:4px 0 0 0;">Create a replacement MIS account for system technical administration.</p>
          </div>
          <button id="close-mis-modal" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
          </button>
        </div>

        <form id="add-mis-form" style="display:flex;flex-direction:column;gap:18px;">
          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text-dark);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Full Name *</label>
            <input type="text" id="mis-name" class="mis-modal-input" maxlength="60" required placeholder="e.g. Engr. Mark Santos">
            <div id="mis-name-err" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"></div>
          </div>

          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text-dark);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Email Address *</label>
            <input type="email" id="mis-email" class="mis-modal-input" required placeholder="e.g. mark.mis@bulsu.edu.ph">
            <div id="mis-email-err" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"></div>
          </div>

          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text-dark);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Contact Number (Optional)</label>
            <input type="text" id="mis-phone" class="mis-modal-input" maxlength="11" placeholder="e.g. 09171234567">
            <div id="mis-phone-err" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"></div>
          </div>

          <div class="mis-info-callout">
            <i data-lucide="info" style="width:16px;height:16px;color:var(--primary-teal);flex-shrink:0;margin-top:2px;"></i>
            <p style="margin:0;font-size:12.5px;color:var(--text-dark);line-height:1.4;">
              A temporary password and QR login credential will be automatically generated and dispatched to the provided email.
            </p>
          </div>

          <div style="display:flex;gap:12px;margin-top:6px;">
            <button type="button" id="cancel-mis-btn" class="mis-btn mis-btn-edit" style="flex:1;justify-content:center;">Cancel</button>
            <button type="submit" id="submit-mis-btn" style="flex:1;padding:11px;border:none;background:var(--primary-teal);color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(30,187,215,0.3);font-family:var(--font-body);">Create Account</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeModal = () => modal.remove();
    modal.querySelector('#close-mis-modal')?.addEventListener('click', closeModal);
    modal.querySelector('#cancel-mis-btn')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#add-mis-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#submit-mis-btn');
      const nameInput = modal.querySelector('#mis-name');
      const emailInput = modal.querySelector('#mis-email');
      const phoneInput = modal.querySelector('#mis-phone');

      const payload = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim() || null
      };

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Creating...';
        }

        const res = await global.misService.createMisStaff(payload);
        closeModal();

        if (typeof global.showToast === 'function') {
          global.showToast('MIS Staff account created successfully!', 'success', 'Account Created');
        }

        await loadMisStaff();

        // Show credentials modal for one-time copy display
        if (res && res.data && res.data.temporaryPassword) {
          showCredentialsModal(res.data.user, res.data.temporaryPassword);
        }
      } catch (err) {
        console.error('[Add MIS] Error:', err);
        const msg = err.message || 'Failed to create MIS Staff account.';
        if (typeof global.showToast === 'function') {
          global.showToast(msg, 'error', 'Creation Failed');
        } else {
          alert(msg);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
        }
      }
    });
  }

  /**
   * Modal: Edit MIS Staff Details
   */
  function showEditMisStaffModal(user) {
    if (!user) return;
    const existing = document.getElementById('mis-edit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mis-edit-modal';
    modal.className = 'mis-modal-overlay';

    modal.innerHTML = `
      <div class="mis-modal-dialog">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-dark);margin:0;">Edit MIS Staff Details</h2>
          <button id="close-mis-edit" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
          </button>
        </div>

        <form id="edit-mis-form" style="display:flex;flex-direction:column;gap:18px;">
          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text-dark);margin-bottom:6px;text-transform:uppercase;">Full Name *</label>
            <input type="text" id="edit-mis-name" class="mis-modal-input" maxlength="60" required value="${escapeHtml(user.Name || '')}">
          </div>

          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text-dark);margin-bottom:6px;text-transform:uppercase;">Email Address *</label>
            <input type="email" id="edit-mis-email" class="mis-modal-input" required value="${escapeHtml(user.Email || '')}">
          </div>

          <div>
            <label style="display:block;font-size:12.5px;font-weight:700;color:var(--text-dark);margin-bottom:6px;text-transform:uppercase;">Contact Number</label>
            <input type="text" id="edit-mis-phone" class="mis-modal-input" maxlength="11" value="${escapeHtml(user.Phone || '')}" placeholder="09171234567">
          </div>

          <div style="display:flex;gap:12px;margin-top:6px;">
            <button type="button" id="cancel-mis-edit" class="mis-btn mis-btn-edit" style="flex:1;justify-content:center;">Cancel</button>
            <button type="submit" id="submit-mis-edit" style="flex:1;padding:11px;border:none;background:var(--primary-teal);color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:var(--font-body);">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeModal = () => modal.remove();
    modal.querySelector('#close-mis-edit')?.addEventListener('click', closeModal);
    modal.querySelector('#cancel-mis-edit')?.addEventListener('click', closeModal);

    const form = modal.querySelector('#edit-mis-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('#submit-mis-edit');
      const payload = {
        name: modal.querySelector('#edit-mis-name').value.trim(),
        email: modal.querySelector('#edit-mis-email').value.trim(),
        phone: modal.querySelector('#edit-mis-phone').value.trim() || null
      };

      try {
        if (submitBtn) submitBtn.disabled = true;
        await global.misService.updateMisStaff(user.User_ID, payload);
        closeModal();

        if (typeof global.showToast === 'function') {
          global.showToast('MIS Staff details updated successfully.', 'success', 'Details Updated');
        }
        await loadMisStaff();
      } catch (err) {
        console.error('[Edit MIS] Error:', err);
        const msg = err.message || 'Failed to update MIS Staff details.';
        if (typeof global.showToast === 'function') {
          global.showToast(msg, 'error', 'Update Failed');
        } else {
          alert(msg);
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  /**
   * Modal: Deactivate MIS Staff Account
   */
  function showDeactivateMisStaffModal(user) {
    if (!user) return;
    const existing = document.getElementById('mis-deact-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mis-deact-modal';
    modal.className = 'mis-modal-overlay';

    modal.innerHTML = `
      <div class="mis-modal-dialog" style="text-align:center;">
        <div style="width:56px;height:56px;border-radius:50%;background:rgba(239,68,68,0.12);color:#EF4444;display:flex;align-items:center;justify-content:center;margin:0 auto 18px auto;">
          <i data-lucide="user-x" style="width:28px;height:28px;"></i>
        </div>

        <h3 style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-dark);margin:0 0 10px 0;">Deactivate MIS Staff Account?</h3>
        
        <p style="font-size:13.5px;color:var(--text-mid);line-height:1.5;margin:0 0 20px 0;">
          Are you sure you want to deactivate the account for <strong>${escapeHtml(user.Name)}</strong>? This will revoke active login credentials and allow you to create a replacement MIS Staff member.
        </p>

        <div class="mis-deact-integrity-callout">
          <i data-lucide="shield-check" style="width:16px;height:16px;color:#059669;flex-shrink:0;margin-top:2px;"></i>
          <p style="margin:0;font-size:12px;color:#166534;line-height:1.4;">
            <strong>Historical Integrity Guaranteed:</strong> All repair tickets, ticket resolution timestamps, physical key transactions, and audit trails associated with this account will remain permanently intact.
          </p>
        </div>

        <div style="display:flex;gap:12px;">
          <button type="button" id="cancel-mis-deact" class="mis-btn mis-btn-edit" style="flex:1;justify-content:center;">Cancel</button>
          <button type="button" id="confirm-mis-deact" style="flex:1;padding:12px;border:none;background:#EF4444;color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(239,68,68,0.25);font-family:var(--font-body);">Deactivate Account</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeModal = () => modal.remove();
    modal.querySelector('#cancel-mis-deact')?.addEventListener('click', closeModal);

    const confirmBtn = modal.querySelector('#confirm-mis-deact');
    confirmBtn?.addEventListener('click', async () => {
      try {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Deactivating...';

        await global.misService.deactivateMisStaff(user.User_ID);
        closeModal();

        if (typeof global.showToast === 'function') {
          global.showToast('MIS Staff account deactivated. You can now create a replacement.', 'success', 'Account Deactivated');
        }

        await loadMisStaff();
      } catch (err) {
        console.error('[Deactivate MIS] Error:', err);
        const msg = err.message || 'Failed to deactivate account.';
        if (typeof global.showToast === 'function') {
          global.showToast(msg, 'error', 'Deactivation Failed');
        } else {
          alert(msg);
        }
      }
    });
  }

  /**
   * Modal: One-Time Credentials Display
   */
  function showCredentialsModal(user, temporaryPassword) {
    const existing = document.getElementById('mis-cred-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'mis-cred-modal';
    modal.className = 'mis-modal-overlay';

    modal.innerHTML = `
      <div class="mis-modal-dialog" style="text-align:center;">
        <div style="width:54px;height:54px;border-radius:50%;background:rgba(16,185,129,0.12);color:#10B981;display:flex;align-items:center;justify-content:center;margin:0 auto 16px auto;">
          <i data-lucide="key" style="width:26px;height:26px;"></i>
        </div>

        <h3 style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-dark);margin:0 0 6px 0;">Account Created Successfully</h3>
        <p style="font-size:13px;color:var(--text-mid);margin:0 0 20px 0;">
          Credentials for <strong>${escapeHtml(user ? user.Name : 'MIS Staff')}</strong> have been generated.
        </p>

        <!-- Credentials Box -->
        <div class="mis-cred-box">
          <div style="margin-bottom:12px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Email Address</div>
            <div class="mis-cred-val" style="font-family:monospace;font-size:13.5px;font-weight:600;color:var(--text-dark);word-break:break-all;">${escapeHtml(user ? user.Email : '')}</div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Temporary Password</div>
            <div class="mis-cred-val" style="font-family:monospace;font-size:15px;font-weight:700;color:var(--text-dark);letter-spacing:1px;">${escapeHtml(temporaryPassword)}</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;">
          <button type="button" id="copy-cred-btn" class="mis-btn mis-btn-edit" style="flex:1;justify-content:center;">
            <i data-lucide="copy" style="width:15px;height:15px;"></i> Copy Credentials
          </button>
          <button type="button" id="close-cred-btn" style="flex:1;padding:11px;border:none;background:var(--primary-teal);color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:var(--font-body);">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeModal = () => modal.remove();
    modal.querySelector('#close-cred-btn')?.addEventListener('click', closeModal);

    const copyBtn = modal.querySelector('#copy-cred-btn');
    copyBtn?.addEventListener('click', () => {
      const textToCopy = `LabSync MIS Staff Login\nEmail: ${user ? user.Email : ''}\nTemporary Password: ${temporaryPassword}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        copyBtn.innerHTML = '<i data-lucide="check" style="width:15px;height:15px;color:#10B981;"></i> Copied!';
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: copyBtn });
        }
        setTimeout(() => {
          copyBtn.innerHTML = '<i data-lucide="copy" style="width:15px;height:15px;"></i> Copy Credentials';
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: copyBtn });
          }
        }, 2000);
      });
    });
  }

  // Expose globally
  global.misManagement = {
    loadMisStaff,
    showAddMisStaffModal,
    showEditMisStaffModal,
    showDeactivateMisStaffModal
  };

})(typeof window !== 'undefined' ? window : this);
