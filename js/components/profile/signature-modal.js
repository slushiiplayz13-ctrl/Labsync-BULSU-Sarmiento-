/**
 * LabSync Digital E-Signature Modal | js/components/profile/signature-modal.js
 * Canvas-based signature pad for faculty member schedule authorizations.
 */

(function (global) {
  'use strict';

  function openSignatureModal() {
    const existing = document.getElementById('faculty-signature-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'faculty-signature-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2200;padding:20px;';

    modal.innerHTML = `
      <div style="background:#fff;border-radius:20px;width:100%;max-width:540px;padding:28px;box-shadow:0 25px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;gap:20px;font-family:var(--font-body);color:var(--text-dark);">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border-light);padding-bottom:16px;">
          <div>
            <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;margin:0 0 4px 0;color:var(--text-dark);">Faculty Digital E-Signature</h3>
            <p style="font-size:13px;color:var(--text-mid);margin:0;">Draw your signature below for official schedule printouts</p>
          </div>
          <button id="close-signature-modal-btn" style="background:#F1F5F9;border:none;cursor:pointer;padding:6px;border-radius:8px;display:flex;align-items:center;">
            <i data-lucide="x" style="width:18px;height:18px;color:var(--text-mid);"></i>
          </button>
        </div>

        <!-- Canvas Box -->
        <div style="border:2px dashed var(--border-light);border-radius:14px;background:#F8FAFC;position:relative;overflow:hidden;height:180px;display:flex;align-items:center;justify-content:center;">
          <canvas id="signature-canvas" width="480" height="180" style="width:100%;height:100%;cursor:crosshair;touch-action:none;"></canvas>
          <div id="signature-placeholder" style="position:absolute;pointer-events:none;color:var(--text-muted);font-size:13px;display:flex;align-items:center;gap:6px;">
            <i data-lucide="pen-line" style="width:16px;height:16px;"></i>
            Sign here using mouse or touch
          </div>
        </div>

        <!-- Actions -->
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <button type="button" id="clear-signature-btn" style="padding:8px 14px;border:1px solid var(--border-light);background:#fff;border-radius:8px;font-size:13px;font-weight:600;color:var(--text-mid);cursor:pointer;display:flex;align-items:center;gap:6px;">
            <i data-lucide="rotate-ccw" style="width:14px;height:14px;"></i>
            Clear
          </button>
          <div style="display:flex;gap:10px;">
            <button type="button" id="cancel-sig-btn" style="padding:10px 18px;border:1px solid var(--border-light);background:#fff;border-radius:10px;font-size:13.5px;font-weight:600;color:var(--text-dark);cursor:pointer;">Cancel</button>
            <button type="button" id="save-sig-btn" style="padding:10px 22px;border:none;background:var(--primary-teal);color:#fff;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px var(--primary-teal-glow);">Save Signature</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const canvas = document.getElementById('signature-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const placeholder = document.getElementById('signature-placeholder');
    let isDrawing = false;
    let hasDrawn = false;

    if (ctx) {
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    function getCoords(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function startDrawing(e) {
      isDrawing = true;
      hasDrawn = true;
      if (placeholder) placeholder.style.display = 'none';
      const pos = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      e.preventDefault();
    }

    function draw(e) {
      if (!isDrawing) return;
      const pos = getCoords(e);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      e.preventDefault();
    }

    function stopDrawing() {
      if (isDrawing) {
        ctx.closePath();
        isDrawing = false;
      }
    }

    if (canvas) {
      canvas.addEventListener('mousedown', startDrawing);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stopDrawing);
      canvas.addEventListener('mouseleave', stopDrawing);

      canvas.addEventListener('touchstart', startDrawing, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stopDrawing);
    }

    const clearBtn = document.getElementById('clear-signature-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawn = false;
        if (placeholder) placeholder.style.display = 'flex';
      });
    }

    const closeModal = () => modal.remove();
    document.getElementById('close-signature-modal-btn').addEventListener('click', closeModal);
    document.getElementById('cancel-sig-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const saveBtn = document.getElementById('save-sig-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        if (!hasDrawn) {
          if (global.showToast) {
            global.showToast('Please draw your signature before saving.', 'warning');
          } else {
            alert('Please draw your signature before saving.');
          }
          return;
        }

        const dataUrl = canvas.toDataURL('image/png');
        try {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
          const userService = global.userService;
          if (userService && typeof userService.updateProfile === 'function') {
            await userService.updateProfile({ signatureData: dataUrl });
          } else {
            await fetch('/api/user/profile', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ signatureData: dataUrl })
            });
          }
          if (global.showToast) {
            global.showToast('Signature saved successfully!', 'success');
          } else {
            alert('Signature saved successfully!');
          }
          closeModal();
        } catch (err) {
          alert('Failed to save signature.');
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Signature';
        }
      });
    }
  }

  const signatureModal = {
    openSignatureModal
  };

  global.signatureModal = signatureModal;
  global.openSignatureModal = openSignatureModal;

})(typeof window !== 'undefined' ? window : this);
