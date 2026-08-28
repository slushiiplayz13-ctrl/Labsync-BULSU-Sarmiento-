/**
 * LabSync Delete Faculty Modal | js/faculty/modals/delete-faculty.modal.js
 * Destructive confirmation dialog for removing faculty accounts and clearing assignments.
 */

(function (global) {
  'use strict';

  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function confirmDeleteFaculty(userId, name, onSuccess) {
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
          console.error('[DeleteFacultyModal] Error removing faculty:', err);
          alert('Error removing faculty: ' + (err.message || 'Please try again.'));
        }
      });
    }
  }

  const deleteFacultyModal = {
    confirmDeleteFaculty
  };

  global.deleteFacultyModal = deleteFacultyModal;

})(typeof window !== 'undefined' ? window : this);
