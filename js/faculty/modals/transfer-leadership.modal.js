/**
 * LabSync Leadership Transfer Modal | js/faculty/modals/transfer-leadership.modal.js
 * Manages administrative confirmation dialogs and leadership tribute modal celebrations.
 */

(function (global) {
  'use strict';

  function showTransferConfirmation(name, onConfirm, onCancel) {
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
  }

  function showSuccessGreetingModal(newName) {
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
        setTimeout(() => successModal.remove(), 250);
      });
    }
  }

  const transferLeadershipModal = {
    showTransferConfirmation,
    showSuccessGreetingModal
  };

  global.transferLeadershipModal = transferLeadershipModal;

})(typeof window !== 'undefined' ? window : this);
