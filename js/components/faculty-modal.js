/* ================================================================
   LabSync – Faculty Modals Component  |  js/components/faculty-modal.js
   Manages Add Faculty, Role Change, Leadership Transfer, Tribute, and Deletion dialogs.
   ================================================================ */

'use strict';

(function (global) {
  /**
   * Helper to escape HTML safely.
   */
  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const facultyModal = {
    /**
     * Opens Add Faculty Modal and handles submission workflow.
     * @param {Function} [onSuccess]
     */
    showAddFacultyModal(onSuccess) {
      // Remove any existing instance to prevent duplicates
      const existing = document.getElementById('add-faculty-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'add-faculty-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';

      modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;width:90%;max-width:500px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
            <h2 style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-dark);margin:0;">Add New Faculty</h2>
            <button id="close-modal" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
            </button>
          </div>
          
          <form id="add-faculty-form" style="display:flex;flex-direction:column;gap:20px;">
            <div>
              <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Full Name *</label>
              <input type="text" id="faculty-name" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:8px;font-size:14px;font-family:var(--font-body);outline:none;transition:border-color 0.2s;" placeholder="e.g. Juan Dela Cruz">
              <div id="faculty-name-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i><span id="faculty-name-error-text">Numbers and symbols are not allowed in names.</span></div>
            </div>
            
            <div>
              <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Email Address *</label>
              <input type="email" id="faculty-email" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:8px;font-size:14px;font-family:var(--font-body);outline:none;transition:border-color 0.2s;" placeholder="e.g. juan.delacruz@bsu.edu.ph">
              <div id="faculty-email-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i><span id="faculty-email-error-text">Invalid email address (e.g., user@domain.com)</span></div>
            </div>
            
            <div class="alert-info-box">
              <i data-lucide="info"></i>
              <p>A temporary password will be auto-generated and sent to the faculty member's email address.</p>
            </div>
            
            <div style="display:flex;gap:12px;margin-top:8px;">
              <button type="button" id="cancel-btn" style="flex:1;padding:12px;border:1px solid var(--border-light);background:#fff;border-radius:8px;font-size:14px;font-weight:600;color:var(--text-mid);cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Cancel</button>
              <button type="submit" style="flex:1;padding:12px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);font-family:var(--font-body);">Add Faculty</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(modal);
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }

      setTimeout(() => {
        const input = document.getElementById('faculty-name');
        if (input) input.focus();
      }, 100);

      // Close handlers
      const closeBtn = document.getElementById('close-modal');
      const cancelBtn = document.getElementById('cancel-btn');
      if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
      if (cancelBtn) cancelBtn.addEventListener('click', () => modal.remove());
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });

      // Live Name Validation
      const nameInput = document.getElementById('faculty-name');
      const nameErrDiv = document.getElementById('faculty-name-error');
      const nameErrText = document.getElementById('faculty-name-error-text');
      const validateName = (name) => {
        if (global.facultyUtils && typeof global.facultyUtils.validateFacultyName === 'function') {
          return global.facultyUtils.validateFacultyName(name);
        }
        if (!name || !name.trim()) return { valid: false, error: 'Full name is required.' };
        const trimmed = name.trim();
        if (trimmed.length < 2) return { valid: false, error: 'Name must be at least 2 characters long.' };
        if (/\d/.test(trimmed)) return { valid: false, error: 'Numbers are not allowed in faculty names.' };
        const nameRegex = /^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s.',-]+$/;
        if (!nameRegex.test(trimmed)) {
          return { valid: false, error: 'Special symbols (@, #, $, etc.) are not allowed.' };
        }
        return { valid: true };
      };

      if (nameInput && nameErrDiv) {
        nameInput.addEventListener('input', () => {
          const val = nameInput.value;
          if (val.trim()) {
            const res = validateName(val);
            if (!res.valid) {
              nameInput.style.borderColor = '#EF4444';
              if (nameErrText) nameErrText.textContent = res.error;
              nameErrDiv.style.display = 'block';
            } else {
              nameInput.style.borderColor = 'var(--border-light)';
              nameErrDiv.style.display = 'none';
            }
          } else {
            nameInput.style.borderColor = 'var(--border-light)';
            nameErrDiv.style.display = 'none';
          }
        });
      }

      // Live Email Validation
      const emailInput = document.getElementById('faculty-email');
      const emailErrDiv = document.getElementById('faculty-email-error');
      const emailErrText = document.getElementById('faculty-email-error-text');
      const validateEmail = (email) => {
        if (global.facultyUtils && typeof global.facultyUtils.validateFacultyEmail === 'function') {
          return global.facultyUtils.validateFacultyEmail(email);
        }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      };

      if (emailInput && emailErrDiv) {
        emailInput.addEventListener('input', () => {
          const val = emailInput.value.trim();
          if (val && !validateEmail(val)) {
            emailInput.style.borderColor = '#EF4444';
            emailErrDiv.style.display = 'block';
          } else {
            emailInput.style.borderColor = 'var(--border-light)';
            emailErrDiv.style.display = 'none';
          }
        });
      }

      // Form submit
      const addForm = document.getElementById('add-faculty-form');
      if (addForm) {
        addForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          const formData = {
            name: document.getElementById('faculty-name').value.trim(),
            email: document.getElementById('faculty-email').value.trim(),
            role: 'Faculty'
          };

          // Validate Name
          const nameValResult = validateName(formData.name);
          if (!nameValResult.valid) {
            if (typeof global.showToast === 'function') {
              global.showToast(nameValResult.error, 'error', 'Invalid Name');
            } else {
              alert('Invalid Name: ' + nameValResult.error);
            }
            if (nameInput) {
              nameInput.focus();
              nameInput.style.borderColor = '#EF4444';
              if (nameErrText) nameErrText.textContent = nameValResult.error;
              if (nameErrDiv) nameErrDiv.style.display = 'block';
            }
            return;
          }

          // Validate Email
          if (!validateEmail(formData.email)) {
            if (typeof global.showToast === 'function') {
              global.showToast('Please enter a valid email address (e.g., user@domain.com).', 'error', 'Invalid Email');
            } else {
              alert('Security Warning: Invalid email address format!\n\nPlease enter a valid email address (e.g., name@example.com).');
            }
            if (emailInput) {
              emailInput.focus();
              emailInput.style.borderColor = '#EF4444';
              if (emailErrDiv) emailErrDiv.style.display = 'block';
            }
            return;
          }

          const submitButton = addForm.querySelector('button[type="submit"]');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          try {
            if (submitButton) {
              submitButton.disabled = true;
              submitButton.textContent = 'Creating Faculty...';
            }

            if (global.facultyService && typeof global.facultyService.addFaculty === 'function') {
              await global.facultyService.addFaculty(formData, controller.signal);
            } else {
              const res = await fetch('/api/faculty/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData),
                signal: controller.signal
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Failed to add faculty');
              }
            }

            if (typeof global.showToast === 'function') {
              global.showToast(`Faculty member added successfully! Credentials will be delivered to ${formData.email}.`, 'success', 'Faculty Added');
            } else {
              alert(`Faculty member added successfully!\n\nLogin credentials will be delivered to ${formData.email}.`);
            }

            modal.remove();

            if (typeof onSuccess === 'function') {
              await onSuccess();
            } else if (typeof global.loadFacultyMembers === 'function') {
              await global.loadFacultyMembers();
            }
          } catch (error) {
            console.error('Error adding faculty:', error);
            const errorMsg = error.message || 'Failed to add faculty';
            
            // Check if error is related to name duplicate
            if (errorMsg.toLowerCase().includes('already exists') && errorMsg.toLowerCase().includes('name')) {
              if (nameInput) {
                nameInput.focus();
                nameInput.style.borderColor = '#EF4444';
                if (nameErrText) nameErrText.textContent = errorMsg;
                if (nameErrDiv) nameErrDiv.style.display = 'block';
              }
            } else if (errorMsg.toLowerCase().includes('email already exists')) {
              if (emailInput) {
                emailInput.focus();
                emailInput.style.borderColor = '#EF4444';
                if (emailErrText) emailErrText.textContent = 'Email already exists';
                if (emailErrDiv) emailErrDiv.style.display = 'block';
              }
            }

            if (error.name === 'AbortError') {
              alert('The request took too long. The faculty account may have been created, but email delivery may be delayed.');
            } else if (typeof global.showToast === 'function') {
              global.showToast(errorMsg, 'error', 'Cannot Add Faculty');
            } else {
              alert(errorMsg);
            }
          } finally {
            clearTimeout(timeoutId);
            if (submitButton) {
              submitButton.disabled = false;
              submitButton.textContent = 'Add Faculty';
            }
          }
        });
      }
    },

    /**
     * Opens Role Edit Modal with leadership transfer protection.
     * @param {string|number} userId
     * @param {string} name
     * @param {string} currentRole
     * @param {Function} [onSuccess]
     */
    changeFacultyRole(userId, name, currentRole, onSuccess) {
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

              // If transferring leadership to a new IT Dept Head, demote current user visually in real-time
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
                  } catch (err) {
                    console.error('Error updating cached user:', err);
                  }
                }

                facultyModal.showSuccessGreetingModal(name);
              }
            } catch (err) {
              console.error(err);
              alert('Error updating role: ' + (err.message || 'Please try again.'));
            }
          };

          // If transferring Department Head leadership to someone else, confirm first
          if (newRole === 'IT Dept. Head' && !String(currentRole).includes('Head')) {
            modal.style.display = 'none';

            facultyModal.showTransferConfirmation(
              name,
              () => { executeUpdate(); },
              () => { modal.style.display = 'flex'; }
            );
          } else {
            executeUpdate();
          }
        });
      }
    },

    /**
     * Confirmation dialog for transferring Department Leadership.
     * @param {string} name
     * @param {Function} onConfirm
     * @param {Function} onCancel
     */
    showTransferConfirmation(name, onConfirm, onCancel) {
      const existing = document.getElementById('transfer-confirm-modal');
      if (existing) existing.remove();

      const confirmModal = document.createElement('div');
      confirmModal.id = 'transfer-confirm-modal';
      confirmModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1100;opacity:0;transition:opacity 0.25s ease;';

      confirmModal.innerHTML = `
        <div style="background:#fff;border-radius:18px;width:90%;max-width:440px;padding:32px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);transform:translateY(20px);transition:transform 0.25s ease;text-align:center;">
          <div style="width:60px;height:60px;background:#FEF3C7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;color:#D97706;">
            <i data-lucide="shield-alert" style="width:30px;height:30px;"></i>
          </div>
          
          <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#1F2937;margin:0 0 10px 0;">Transfer Department Leadership?</h3>
          
          <p style="margin:0 0 24px 0;font-size:14px;color:#4B5563;font-family:var(--font-body);line-height:1.55;">
            You are about to transfer the **IT Department Head** role to <strong>${escapeHtml(name)}</strong>.<br><br>
            <strong style="color:#D97706;">Warning:</strong> This will promote them to the main admin slot and re-assign system privileges. Are you sure you want to proceed?
          </p>
          
          <div style="display:flex;gap:12px;font-family:var(--font-body);">
            <button id="btn-cancel-transfer" style="flex:1;padding:12px;border:1px solid #E5E7EB;background:#fff;border-radius:8px;font-size:14px;font-weight:600;color:#4B5563;cursor:pointer;transition:all 0.2s;">No, Cancel</button>
            <button id="btn-confirm-transfer" style="flex:1;padding:12px;border:none;background:#D97706;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(217,119,6,0.3);">Yes, Transfer</button>
          </div>
        </div>
      `;

      document.body.appendChild(confirmModal);
      setTimeout(() => {
        confirmModal.style.opacity = '1';
        const dialog = confirmModal.querySelector('div');
        if (dialog) dialog.style.transform = 'translateY(0)';
      }, 10);

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }

      const cancelTransferBtn = document.getElementById('btn-cancel-transfer');
      if (cancelTransferBtn) {
        cancelTransferBtn.addEventListener('click', () => {
          confirmModal.style.opacity = '0';
          const dialog = confirmModal.querySelector('div');
          if (dialog) dialog.style.transform = 'translateY(20px)';
          setTimeout(() => {
            confirmModal.remove();
            if (typeof onCancel === 'function') onCancel();
          }, 250);
        });
      }

      const confirmTransferBtn = document.getElementById('btn-confirm-transfer');
      if (confirmTransferBtn) {
        confirmTransferBtn.addEventListener('click', () => {
          confirmModal.style.opacity = '0';
          const dialog = confirmModal.querySelector('div');
          if (dialog) dialog.style.transform = 'translateY(20px)';
          setTimeout(() => {
            confirmModal.remove();
            if (typeof onConfirm === 'function') onConfirm();
          }, 250);
        });
      }
    },

    /**
     * Celebratory Greeting and Leadership Tribute modal.
     * @param {string} newName
     */
    showSuccessGreetingModal(newName) {
      const existing = document.getElementById('success-greeting-modal');
      if (existing) existing.remove();

      const currentHead = (global.allFacultyMembers || []).find(m => m.Role && m.Role.toLowerCase().includes('head'));
      const currentHeadName = currentHead ? currentHead.Name : 'Department Head';

      const successModal = document.createElement('div');
      successModal.id = 'success-greeting-modal';
      successModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1200;opacity:0;transition:opacity 0.3s ease;';

      successModal.innerHTML = `
        <div class="sched-modal-dialog" style="max-width:520px;padding:36px 32px;text-align:center;position:relative;overflow:hidden;">
          
          <div style="position:absolute;top:0;left:0;width:100%;height:6px;background:var(--gradient-primary);"></div>
          
          <div class="heart-container">
            <i data-lucide="heart" style="width:36px;height:36px;fill:#EF4444;animation:pulse 1.5s infinite;"></i>
          </div>
          
          <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--text-dark);margin:0 0 10px 0;">Thank You for Your Leadership!</h2>
          
          <div style="font-size:14.5px;color:var(--text-mid);font-family:var(--font-body);line-height:1.6;margin-bottom:28px;">
            <p style="margin:0 0 16px 0;">The IT Department Head role has been successfully transferred to <strong>Prof. ${escapeHtml(newName)}</strong>.</p>
            
            <div class="tribute-card">
              <span style="display:block;font-size:11px;font-weight:800;color:#B45309;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">A Tribute of Gratitude</span>
              <span style="font-size:14.5px;font-weight:500;color:#78350F;line-height:1.6;display:block;">
                "We extend our heartfelt gratitude to <strong>Prof. ${escapeHtml(currentHeadName)}</strong> for your exceptional leadership, vision, and dedicated service as our Department Head. Thank you for your guidance and for making a lasting difference in our department!"
              </span>
              <div style="margin-top:12px;display:flex;align-items:center;gap:6px;font-size:12.5px;color:#D97706;font-weight:700;">
                <i data-lucide="award" style="width:16px;height:16px;"></i> Dedicated Service & Leadership
              </div>
            </div>
            
            <div class="successor-card">
              <div style="background:#14B8A6;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="user-check" style="width:16px;height:16px;"></i>
              </div>
              <div>
                <span style="display:block;font-size:11px;color:#0D9488;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Successor</span>
                <span style="font-size:13.5px;color:#0f766e;font-weight:700;">Prof. ${escapeHtml(newName)} is now active as the new IT Dept. Head.</span>
              </div>
            </div>
          </div>
          
          <button id="btn-close-success" style="width:100%;padding:14px;border:none;background:linear-gradient(135deg, #1EBBD7 0%, #0EA5E9 100%);color:#fff;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.25s;box-shadow:0 6px 20px rgba(14,165,233,0.3);" onmouseover="this.style.transform='translateY(-1px)';" onmouseout="this.style.transform='none';">
            Wonderful, Thank you!
          </button>
        </div>
      `;

      document.body.appendChild(successModal);
      setTimeout(() => {
        successModal.style.opacity = '1';
        const dialog = successModal.querySelector('div');
        if (dialog) dialog.style.transform = 'scale(1)';
      }, 10);

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }

      const closeSuccessBtn = document.getElementById('btn-close-success');
      if (closeSuccessBtn) {
        closeSuccessBtn.addEventListener('click', () => {
          successModal.style.opacity = '0';
          const dialog = successModal.querySelector('div');
          if (dialog) dialog.style.transform = 'scale(0.9)';
          setTimeout(() => {
            successModal.remove();
            window.location.href = 'index.html';
          }, 250);
        });
      }
    },

    /**
     * Confirmation dialog for removing a faculty member.
     * @param {string|number} userId
     * @param {string} name
     * @param {Function} [onSuccess]
     */
    confirmDeleteFaculty(userId, name, onSuccess) {
      const existing = document.getElementById('delete-confirm-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'delete-confirm-modal';
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';

      modal.innerHTML = `
        <div style="background:var(--bg-white);color:var(--text-dark);border:1px solid var(--border-light);border-radius:18px;width:90%;max-width:400px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,0.3);transform:translateY(20px);transition:transform 0.25s ease;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;color:#EF4444;">
            <i data-lucide="user-x" style="width:28px;height:28px;"></i>
          </div>
          
          <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 10px 0;">Remove Faculty Member</h2>
          
          <p style="margin:0 0 24px 0;font-size:14px;color:var(--text-mid);font-family:var(--font-body);line-height:1.5;">
            Are you sure you want to remove <strong>${escapeHtml(name)}</strong>? This action will revoke their login access and clear their schedule assignments.
          </p>
          
          <div style="display:flex;gap:12px;font-family:var(--font-body);">
            <button id="cancel-delete-btn" style="flex:1;padding:12px;border:1px solid var(--border-light);background:var(--bg-card);border-radius:8px;font-size:14px;font-weight:600;color:var(--text-dark);cursor:pointer;transition:all 0.2s;">Cancel</button>
            <button id="confirm-delete-btn" style="flex:1;padding:12px;border:none;background:#EF4444;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(239,68,68,0.25);">Remove</button>
          </div>
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

      const closeModal = () => {
        modal.style.opacity = '0';
        const dialog = modal.querySelector('div');
        if (dialog) dialog.style.transform = 'translateY(20px)';
        setTimeout(() => modal.remove(), 250);
      };

      const cancelBtn = document.getElementById('cancel-delete-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      const confirmBtn = document.getElementById('confirm-delete-btn');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
          try {
            if (global.facultyService && typeof global.facultyService.deleteFaculty === 'function') {
              await global.facultyService.deleteFaculty(userId);
            } else {
              const response = await fetch(`/api/faculty/${userId}`, {
                method: 'DELETE',
                credentials: 'include'
              });
              if (!response.ok) throw new Error('Failed to remove faculty member');
            }

            closeModal();
            if (typeof onSuccess === 'function') {
              await onSuccess();
            } else if (typeof global.loadFacultyMembers === 'function') {
              await global.loadFacultyMembers();
            }
          } catch (err) {
            console.error(err);
            alert('Error removing faculty: ' + (err.message || 'Please try again.'));
          }
        });
      }
    }
  };

  // Expose globally
  global.facultyModal = facultyModal;
  global.showAddFacultyModal = facultyModal.showAddFacultyModal;
  global.changeFacultyRole = facultyModal.changeFacultyRole;
  global.confirmDeleteFaculty = facultyModal.confirmDeleteFaculty;
})(typeof window !== 'undefined' ? window : this);
