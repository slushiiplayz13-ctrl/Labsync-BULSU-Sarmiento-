/* ================================================================
   LabSync – Faculty Key Request Status Banner & Advance Request Modal
   File: js/pages/dashboard/dashboard.key-requests.js
   ================================================================ */

'use strict';

(function (global) {
  let _keyRequestsInitialized = false;
  let _dismissedRequestId = null;
  let _lastStatus = null;
  let _cachedLabs = null;

  function escapeText(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTimeOnly(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  /**
   * Fetches active key authorization request for the current faculty user
   * and renders the real-time status banner on the dashboard or room status page.
   */
  async function loadFacultyKeyRequestStatus() {
    const banner = document.getElementById('facultyKeyStatusBanner');
    if (!banner) return;

    try {
      const response = await fetch('/api/keys/my-request-status', { credentials: 'include' });
      if (!response.ok) return;
      const req = await response.json();

      if (!req) {
        banner.style.display = 'none';
        return;
      }

      // Check transition events for real-time toast feedback
      if (_lastStatus === 'PENDING' && req.Status === 'APPROVED') {
        if (typeof global.showToast === 'function') {
          global.showToast(
            `Dept. Head approved your request for Room ${req.Room_Number}! You are authorized to take the 2nd key.`,
            'success',
            'Key Request Approved'
          );
        }
      } else if (_lastStatus === 'PENDING' && req.Status === 'REJECTED') {
        if (typeof global.showToast === 'function') {
          global.showToast(
            `Dept. Head declined your request for Room ${req.Room_Number}: ${req.Rejection_Reason || 'No specific reason provided'}`,
            'error',
            'Key Request Declined'
          );
        }
      }
      _lastStatus = req.Status || null;

      // Handle dismissed rejected requests
      const isDismissed = req.Status === 'REJECTED' && String(_dismissedRequestId) === String(req.Request_ID);

      let bannerHtml = '';
      banner.className = 'faculty-key-status-banner';

      if (req.Status === 'PENDING') {
        banner.classList.add('is-pending');
        const timeStr = formatTimeOnly(req.Requested_At);
        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="clock" style="width:20px;height:20px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Key Request Pending Review — Room ${escapeText(req.Room_Number)}</h4>
              <p class="fks-desc">Submitted at ${escapeText(timeStr)}. Awaiting Department Head review. Reason: <em>"${escapeText(req.Reason)}"</em></p>
            </div>
          </div>
          <div class="fks-actions">
            <span style="font-size:11.5px; font-weight:700; color:#B45309; background:#FEF3C7; padding:4px 10px; border-radius:99px;">
              Awaiting Approval
            </span>
          </div>
        `;
      } else if (req.Status === 'APPROVED') {
        banner.classList.add('is-approved');
        const expireStr = formatTimeOnly(req.Expires_At);
        const minsLeft = req.Minutes_Remaining ? Math.max(0, req.Minutes_Remaining) : 120;
        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="shield-check" style="width:22px;height:22px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Key Request Approved by Dept. Head! — Room ${escapeText(req.Room_Number)}</h4>
              <p class="fks-desc">You are cleared to take this key! Valid until <strong>${escapeText(expireStr)}</strong> (~${minsLeft} mins remaining). Take at the Key Box or scan key QR tag.</p>
            </div>
          </div>
          <div class="fks-actions">
            <a href="room-status.html" class="fks-btn-action">
              <i data-lucide="key" style="width:14px;height:14px;"></i> View Key
            </a>
          </div>
        `;
      } else if (req.Status === 'REJECTED' && !isDismissed) {
        banner.classList.add('is-rejected');
        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="x-circle" style="width:20px;height:20px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Key Request Declined — Room ${escapeText(req.Room_Number)}</h4>
              <p class="fks-desc">Dept. Head declined this request. Reason: <strong>"${escapeText(req.Rejection_Reason || 'No specific reason provided')}"</strong></p>
            </div>
          </div>
          <div class="fks-actions">
            <button type="button" class="fks-btn-dismiss" id="btnDismissKeyBanner" data-id="${req.Request_ID}">
              Dismiss
            </button>
          </div>
        `;
      } else if (req.heldCount === 1) {
        // Faculty holds 1 key with no active pending/approved request -> Advance 2nd Key request banner
        banner.classList.add('is-holding');
        const heldName = (req.heldRooms && req.heldRooms.length > 0) ? req.heldRooms[0].Room_Number : 'Lab';
        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="key" style="width:20px;height:20px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Holding 1 Key — Room ${escapeText(heldName)}</h4>
              <p class="fks-desc">Need a second key? Request Dept. Head approval (max 2 keys allowed).</p>
            </div>
          </div>
          <div class="fks-actions">
            <button type="button" class="fks-btn-action info" id="btnOpenDashboardReqModal">
              <i data-lucide="send" style="width:14px;height:14px;"></i> Request 2nd Key
            </button>
          </div>
        `;
      } else if (req.heldCount === 0) {
        // Faculty holds 0 keys -> Can request 2nd key authorization in advance anytime!
        const isDismissedAdvance = String(_dismissedRequestId) === 'advance-0';
        if (isDismissedAdvance) {
          banner.style.display = 'none';
          return;
        }
        banner.classList.add('is-holding');
        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="key-round" style="width:20px;height:20px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Need a 2nd Laboratory Key in Advance?</h4>
              <p class="fks-desc">You can take your 1st key directly at the Key Box anytime without approval. Request Dept. Head authorization now if you'll need 2 keys.</p>
            </div>
          </div>
          <div class="fks-actions">
            <button type="button" class="fks-btn-action info" id="btnOpenDashboardReqModal">
              <i data-lucide="send" style="width:14px;height:14px;"></i> Request 2nd Key Approval
            </button>
            <button type="button" class="fks-btn-dismiss" id="btnDismissAdvanceBanner" title="Dismiss" style="padding: 6px 10px; font-size: 11px;">
              Dismiss
            </button>
          </div>
        `;
      } else {
        banner.style.display = 'none';
        return;
      }

      banner.innerHTML = bannerHtml;
      banner.style.display = 'flex';

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: banner });
      }

      const dismissBtn = banner.querySelector('#btnDismissKeyBanner');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          _dismissedRequestId = dismissBtn.getAttribute('data-id');
          banner.style.display = 'none';
        });
      }

      const dismissAdvanceBtn = banner.querySelector('#btnDismissAdvanceBanner');
      if (dismissAdvanceBtn) {
        dismissAdvanceBtn.addEventListener('click', () => {
          _dismissedRequestId = 'advance-0';
          banner.style.display = 'none';
        });
      }

      const openModalBtn = banner.querySelector('#btnOpenDashboardReqModal');
      if (openModalBtn) {
        openModalBtn.addEventListener('click', () => {
          openAdvanceKeyRequestModal(req);
        });
      }

    } catch (e) {
      console.error('[DashboardKeyRequests] Failed to load request status:', e);
    }
  }

  /**
   * Lazily loads campus laboratories for the room picker dropdown.
   */
  async function fetchCampusLaboratories() {
    if (_cachedLabs && _cachedLabs.length > 0) return _cachedLabs;
    try {
      const res = await fetch('/api/laboratories', { credentials: 'include' });
      if (res.ok) {
        _cachedLabs = await res.json();
      }
    } catch (e) {
      console.warn('[DashboardKeyRequests] Could not fetch laboratories:', e);
    }
    return _cachedLabs || [];
  }

  /**
   * Opens the Advance Key Request Modal on the dashboard.
   */
  async function openAdvanceKeyRequestModal(facultyReqData) {
    let modal = document.getElementById('dashboardKeyRequestModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboardKeyRequestModal';
      modal.className = 'kt-modal-backdrop';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const heldRooms = facultyReqData.heldRooms || [];
    const heldIds = new Set(heldRooms.map(r => r.Room_ID));
    const isHoldingKey = heldRooms.length > 0;
    const heldName = isHoldingKey ? heldRooms[0].Room_Number : null;

    const holdingBadgeHtml = isHoldingKey
      ? `<span class="kt-pill-held">Room ${escapeText(heldName)}</span>`
      : `<span class="kt-pill-held" style="background: rgba(14, 165, 201, 0.12); color: #0284C7; border: 1px solid rgba(14, 165, 201, 0.25);">None (1st Key Direct via Key Box)</span>`;

    const policyBadgeHtml = isHoldingKey
      ? `<span class="kt-pill-val">2 Keys Total (Strict Ceiling)</span>`
      : `<span class="kt-pill-val">Advance 2nd Key Authorization</span>`;

    // Fetch labs
    const labs = await fetchCampusLaboratories();
    const availableLabs = labs.filter(l => !heldIds.has(l.Room_ID));

    modal.innerHTML = `
      <div class="kt-modal-card">
        <div class="kt-modal-header">
          <div class="kt-modal-icon-badge">
            <i data-lucide="key-round" style="width: 20px; height: 20px;"></i>
          </div>
          <div>
            <h3 class="kt-modal-title">Request 2nd Key Approval</h3>
            <p class="kt-modal-sub">Submit justification to IT Department Head</p>
          </div>
          <button type="button" id="btnCloseDashReqModal" class="kt-modal-close" aria-label="Close">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <div class="kt-modal-body">
          <div class="kt-request-info-pill">
            <div class="kt-pill-row">
              <span class="kt-pill-label">
                <i data-lucide="key" style="width: 14px; height: 14px;"></i>
                <span>Currently Holding:</span>
              </span>
              ${holdingBadgeHtml}
            </div>
            <div class="kt-pill-row">
              <span class="kt-pill-label">
                <i data-lucide="shield-alert" style="width: 14px; height: 14px;"></i>
                <span>Policy Allowance:</span>
              </span>
              ${policyBadgeHtml}
            </div>
          </div>

          <label for="dashReqRoomSelect" class="kt-input-label">Target Laboratory Key:</label>
          <select id="dashReqRoomSelect" class="kt-select">
            ${availableLabs.map(lab => `
              <option value="${lab.Room_ID}">
                Room ${escapeText(lab.Room_Number)} (${escapeText(lab.Building || 'Campus')}) — ${escapeText(lab.Current_Status || 'Lab')}
              </option>
            `).join('')}
          </select>

          <label for="dashReqReasonInput" class="kt-input-label">Justification / Reason:</label>
          <textarea id="dashReqReasonInput" class="kt-textarea" rows="3" placeholder="e.g., Simultaneous lab session, dual examination proctoring, emergency lab change..."></textarea>
          <div class="kt-hint">
            <i data-lucide="info" class="kt-hint-icon"></i>
            <span>Department Head will receive an instant notification to review and approve.</span>
          </div>
        </div>

        <div class="kt-modal-footer">
          <button type="button" id="btnSubmitDashKeyRequest" class="btn-modal-submit">
            <i data-lucide="send" style="width: 16px; height: 16px;"></i>
            <span>Send Request to Dept Head</span>
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }

    const closeBtn = modal.querySelector('#btnCloseDashReqModal');
    if (closeBtn) {
      closeBtn.onclick = () => { modal.style.display = 'none'; };
    }

    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    };

    const submitBtn = modal.querySelector('#btnSubmitDashKeyRequest');
    const roomSelect = modal.querySelector('#dashReqRoomSelect');
    const reasonInput = modal.querySelector('#dashReqReasonInput');

    if (submitBtn) {
      submitBtn.onclick = async () => {
        const roomId = roomSelect ? roomSelect.value : null;
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (!roomId) {
          if (typeof global.showToast === 'function') global.showToast('Please select a target laboratory room.', 'error');
          return;
        }

        if (reason.length < 5) {
          if (typeof global.showToast === 'function') global.showToast('Please provide a justification (at least 5 characters).', 'warning');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px;"></i>
          <span>Submitting...</span>
        `;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: submitBtn });
        }

        try {
          const res = await fetch('/api/keys/request-additional', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ roomId: Number(roomId), reason })
          });

          const data = await res.json();

          if (!res.ok) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="send" style="width: 16px; height: 16px;"></i><span>Send Request to Dept Head</span>`;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons({ root: submitBtn });
            }
            if (typeof global.showToast === 'function') {
              global.showToast(data.error || 'Failed to submit request.', 'error');
            }
            return;
          }

          modal.style.display = 'none';
          if (typeof global.showToast === 'function') {
            global.showToast('Key request submitted successfully to Department Head!', 'success', 'Request Sent');
          }
          await loadFacultyKeyRequestStatus();

        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="send" style="width: 16px; height: 16px;"></i><span>Send Request to Dept Head</span>`;
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
          if (typeof global.showToast === 'function') {
            global.showToast('Network error while submitting request.', 'error');
          }
        }
      };
    }
  }

  function initFacultyKeyRequests() {
    if (_keyRequestsInitialized) return;
    _keyRequestsInitialized = true;

    loadFacultyKeyRequestStatus();

    // Auto-poll for status updates every 6 seconds
    setInterval(loadFacultyKeyRequestStatus, 6000);
  }

  // Expose
  global.dashboardKeyRequests = {
    loadFacultyKeyRequestStatus,
    openAdvanceKeyRequestModal,
    initFacultyKeyRequests
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFacultyKeyRequests);
  } else {
    initFacultyKeyRequests();
  }

})(typeof window !== 'undefined' ? window : this);
