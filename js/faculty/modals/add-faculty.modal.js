/**
 * LabSync Add Faculty Modal | js/faculty/modals/add-faculty.modal.js
 * Manages modal input forms, live regex validation, and new faculty creation workflows.
 */

(function (global) {
  'use strict';

  function showAddFacultyModal(onSuccess) {
    const existing = document.getElementById('add-faculty-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'add-faculty-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2500 !important;';

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
            <input type="text" id="faculty-name" maxlength="60" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:8px;font-size:14px;font-family:var(--font-body);outline:none;transition:border-color 0.2s;" placeholder="e.g. Juan Dela Cruz">
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
    if (global.setModalOpenState) global.setModalOpenState(true);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    setTimeout(() => {
      const input = document.getElementById('faculty-name');
      if (input) input.focus();
    }, 100);

    const closeModal = () => {
      if (global.setModalOpenState) global.setModalOpenState(false);
      modal.remove();
    };

    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    modal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    const nameInput = document.getElementById('faculty-name');
    const nameErrDiv = document.getElementById('faculty-name-error');
    const nameErrText = document.getElementById('faculty-name-error-text');
    const validateName = (name) => {
      if (global.facultyUtils && typeof global.facultyUtils.validateFacultyName === 'function') {
        return global.facultyUtils.validateFacultyName(name, global.allFacultyMembers);
      }
      if (!name || !name.trim()) return { valid: false, error: 'Full name is required.' };
      const trimmed = name.trim().replace(/\s+/g, ' ');
      if (trimmed.length < 2) return { valid: false, error: 'Name must be at least 2 characters long.' };
      if (trimmed.length > 60) return { valid: false, error: 'Full name must not exceed 60 characters.' };
      if (/\d/.test(trimmed)) return { valid: false, error: 'Numbers are not allowed in faculty names.' };
      const nameRegex = /^[a-zA-Z\u00C0-\u024F\u1E00-\u1EFF\s.',-]+$/;
      if (!nameRegex.test(trimmed)) {
        return { valid: false, error: 'Special symbols (@, #, $, etc.) are not allowed.' };
      }
      if (Array.isArray(global.allFacultyMembers) && global.allFacultyMembers.length > 0) {
        const norm = trimmed.toLowerCase();
        const exists = global.allFacultyMembers.some(f => {
          const fName = (f.Name || f.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          return fName === norm;
        });
        if (exists) {
          return {
            valid: false,
            error: `A faculty member with the name "${trimmed}" already exists. Please differentiate using a middle initial or suffix (e.g., Jr./Sr./III).`
          };
        }
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

    const emailInput = document.getElementById('faculty-email');
    const emailErrDiv = document.getElementById('faculty-email-error');
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

    const addForm = document.getElementById('add-faculty-form');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
          name: document.getElementById('faculty-name').value.trim(),
          email: document.getElementById('faculty-email').value.trim(),
          role: 'Faculty'
        };

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

        if (!validateEmail(formData.email)) {
          if (typeof global.showToast === 'function') {
            global.showToast('Please enter a valid email address (e.g., user@domain.com).', 'error', 'Invalid Email');
          } else {
            alert('Security Warning: Invalid email address format!');
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
            global.showToast(`Faculty member added successfully! Credentials delivered to ${formData.email}.`, 'success', 'Faculty Added');
          } else {
            alert(`Faculty member added successfully! Login credentials delivered to ${formData.email}.`);
          }

          closeModal();

          if (typeof onSuccess === 'function') {
            await onSuccess();
          } else if (typeof global.loadFacultyMembers === 'function') {
            await global.loadFacultyMembers();
          }
        } catch (error) {
          console.error('[AddFacultyModal] Error adding faculty:', error);
          const errorMsg = error.message || 'Failed to add faculty';

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
  }

  const addFacultyModal = {
    showAddFacultyModal
  };

  global.addFacultyModal = addFacultyModal;

})(typeof window !== 'undefined' ? window : this);
