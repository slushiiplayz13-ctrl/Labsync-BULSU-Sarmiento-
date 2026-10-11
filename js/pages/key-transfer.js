/**
 * LabSync – Key Transfer & Room Claim Script  |  js/pages/key-transfer.js
 * Handles URL parameter parsing, transfer info lookup, permission verification, and transfer confirmation.
 */

(function () {
  'use strict';

  let currentKeyCode = null;
  let keyData = null;

  document.addEventListener('DOMContentLoaded', () => {
    initPage();
  });

  async function initPage() {
    const params = new URLSearchParams(window.location.search);
    currentKeyCode = params.get('key');

    if (!currentKeyCode) {
      showError('Missing Key Identifier', 'No key identifier was provided in the URL. Please scan a valid physical key QR tag.');
      return;
    }

    await loadTransferDetails(currentKeyCode);
    setupEventListeners();
  }

  async function loadTransferDetails(keyCode) {
    const loadingBox = document.getElementById('loadingBox');
    const mainView = document.getElementById('mainTransferView');
    const unauthBox = document.getElementById('unauthBox');
    const errorBox = document.getElementById('errorBox');

    try {
      const response = await fetch(`/api/keys/transfer-info/${encodeURIComponent(keyCode)}`, {
        credentials: 'include'
      });

      if (response.status === 401) {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        const loginUrl = `login.html?redirect=${returnUrl}&reason=claim-key`;

        // Seamless mobile experience: immediately navigate to sign-in
        window.location.replace(loginUrl);

        // Fallback UI in case redirect is delayed or cancelled by browser
        if (loadingBox) loadingBox.style.display = 'none';
        if (unauthBox) unauthBox.style.display = 'block';
        if (window.lucide) window.lucide.createIcons();

        const btnLogin = document.getElementById('btnLoginRedirect');
        if (btnLogin) {
          btnLogin.onclick = () => {
            window.location.href = loginUrl;
          };
        }
        return;
      }

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        showError('Key Lookup Failed', resData.error || 'The scanned key could not be found in the LabSync system.');
        return;
      }

      keyData = resData;

      function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function isSafePhotoUrl(url) {
        if (typeof url !== 'string' || !url.trim()) return false;
        const trimmed = url.trim();
        return (
          trimmed.startsWith('data:image/') ||
          trimmed.startsWith('assets/') ||
          trimmed.startsWith('/assets/') ||
          trimmed.startsWith('uploads/') ||
          trimmed.startsWith('/uploads/') ||
          trimmed.startsWith('http://') ||
          trimmed.startsWith('https://') ||
          trimmed.startsWith('/')
        );
      }

      function renderAvatar(containerEl, photoUrl, fallbackInitials) {
        if (!containerEl) return;
        if (isSafePhotoUrl(photoUrl)) {
          containerEl.innerHTML = '';
          const img = document.createElement('img');
          img.src = photoUrl;
          img.alt = fallbackInitials || 'Profile';
          img.onerror = () => {
            containerEl.textContent = fallbackInitials || 'U';
          };
          containerEl.appendChild(img);
        } else {
          containerEl.textContent = fallbackInitials || 'U';
        }
      }

      function getCachedUserProfilePhoto() {
        try {
          const cached = JSON.parse(sessionStorage.getItem('labsync_user') || localStorage.getItem('user') || 'null');
          if (cached) {
            if (cached.profilePhoto) return cached.profilePhoto;
            if (cached.user && cached.user.profilePhoto) return cached.user.profilePhoto;
            if (cached.Profile_Photo) return cached.Profile_Photo;
          }
        } catch (e) {}
        return null;
      }

      // Resolve current user photo (from keyData.currentUser, or cached storage)
      let currentUserPhoto = (keyData.currentUser && keyData.currentUser.profilePhoto) || getCachedUserProfilePhoto();

      // Update Header
      const headerBadge = document.getElementById('userHeaderBadge');
      if (headerBadge && keyData.currentUser) {
        const initials = keyData.currentUser.name
          ? keyData.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
          : 'U';

        headerBadge.innerHTML = `
          <div class="user-header-chip" title="${escapeHtml(keyData.currentUser.name)}">
            <div class="user-chip-avatar"></div>
            <div class="user-chip-info">
              <span class="user-chip-name">${escapeHtml(keyData.currentUser.name)}</span>
              <span class="user-chip-role">${escapeHtml(keyData.currentUser.role || 'Faculty')}</span>
            </div>
          </div>
        `;
        const chipAvatar = headerBadge.querySelector('.user-chip-avatar');
        renderAvatar(chipAvatar, currentUserPhoto, initials);
      }

      // Populate Key and Room Info
      const dispBldg = document.getElementById('dispBuilding');
      const dispRoom = document.getElementById('dispRoom');
      const dispCode = document.getElementById('dispKeyCode');

      if (dispBldg) dispBldg.textContent = keyData.building || 'IT BUILDING';
      if (dispRoom) {
        const rawRoom = String(keyData.roomNumber || '').trim();
        dispRoom.textContent = rawRoom.toLowerCase().startsWith('room') ? rawRoom.toUpperCase() : `LABORATORY ${rawRoom}`;
      }
      if (dispCode) dispCode.textContent = keyData.keyCode || keyCode;

      // Populate Current Holder
      const prevAvatar = document.getElementById('dispPrevAvatar');
      const prevRole = document.getElementById('dispPrevRole');
      const prevName = document.getElementById('dispPrevName');
      const prevSub = document.getElementById('dispPrevSub');

      if (keyData.isDocked || keyData.roomKeyStatus === 'Present') {
        if (prevAvatar) prevAvatar.innerHTML = '<i data-lucide="archive" style="width:20px;height:20px;"></i>';
        if (prevRole) prevRole.textContent = 'STATUS: IN DOCK';
        if (prevName) prevName.textContent = 'IoT Key Box (Docked)';
        if (prevSub) prevSub.textContent = 'Key is inside the IoT key box';
      } else if (keyData.currentHolder) {
        const initials = keyData.currentHolder.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const prevPhoto = keyData.currentHolder.profilePhoto || null;
        renderAvatar(prevAvatar, prevPhoto, initials);
        if (prevRole) prevRole.textContent = 'CURRENT KEY HOLDER';
        if (prevName) prevName.textContent = keyData.currentHolder.name;
        if (prevSub) prevSub.textContent = keyData.currentHolder.role + (keyData.currentHolder.email ? ` • ${keyData.currentHolder.email}` : '');
      } else {
        if (prevAvatar) prevAvatar.innerHTML = '<i data-lucide="alert-circle" style="width:20px;height:20px;"></i>';
        if (prevRole) prevRole.textContent = 'STATUS: UNREGISTERED / UNKNOWN';
        if (prevName) prevName.textContent = 'No Registered Custodian';
        if (prevSub) prevSub.textContent = 'Key status must be verified';
      }

      // Populate Receiving User
      const recvAvatar = document.getElementById('dispRecvAvatar');
      const recvRole = document.getElementById('dispRecvRole');
      const recvName = document.getElementById('dispRecvName');
      const recvSub = document.getElementById('dispRecvSub');

      if (keyData.currentUser) {
        const initials = keyData.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        renderAvatar(recvAvatar, currentUserPhoto, initials);
        if (recvRole) recvRole.textContent = (keyData.currentUser.role || 'FACULTY').toUpperCase();
        if (recvName) recvName.textContent = keyData.currentUser.name;
        if (recvSub) recvSub.textContent = 'Will assume physical key & room responsibility';
      }

      // Asynchronous background hydration: if photo wasn't found yet, fetch from /api/user/current
      if (!currentUserPhoto && keyData.currentUser) {
        fetch('/api/user/current', { credentials: 'include' })
          .then(res => res.ok ? res.json() : null)
          .then(userData => {
            const fetchedPhoto = userData && userData.user && userData.user.profilePhoto;
            if (fetchedPhoto && isSafePhotoUrl(fetchedPhoto)) {
              currentUserPhoto = fetchedPhoto;
              const initials = keyData.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              renderAvatar(recvAvatar, fetchedPhoto, initials);
              const chipAvatar = headerBadge ? headerBadge.querySelector('.user-chip-avatar') : null;
              if (chipAvatar) {
                renderAvatar(chipAvatar, fetchedPhoto, initials);
              }
              try {
                const cached = JSON.parse(localStorage.getItem('user') || '{}');
                cached.profilePhoto = fetchedPhoto;
                localStorage.setItem('user', JSON.stringify(cached));
              } catch (e) {}
            }
          })
          .catch(() => {});
      }

      // Permission & Restriction handling
      const btnConfirm = document.getElementById('btnConfirmTransfer');
      const noticeBox = document.getElementById('restrictionNotice');
      const noticeText = document.getElementById('restrictionNoticeText');
      const approvedNotice = document.getElementById('approvedNotice');
      const approvedNoticeText = document.getElementById('approvedNoticeText');
      const btnOpenReq = document.getElementById('btnOpenRequestModal');

      // 1. Guard against docked key or any transfer disqualification
      if (!keyData.canTransfer) {
        if (approvedNotice) approvedNotice.style.display = 'none';
        if (btnConfirm) {
          btnConfirm.disabled = true;
          btnConfirm.classList.add('btn-transfer-disabled');
          btnConfirm.style.background = '#94a3b8';
          btnConfirm.style.boxShadow = 'none';
          btnConfirm.style.cursor = 'not-allowed';
          btnConfirm.style.pointerEvents = 'none';
          const btnSpan = btnConfirm.querySelector('span');
          if (btnSpan) {
            btnSpan.textContent = keyData.isDocked
              ? 'Key Inside Key Box (Unavailable)'
              : (keyData.heldOtherRoom ? 'Cannot Claim (Key Limit Reached)' : 'Transfer Unavailable');
          }
        }
        if (noticeBox && noticeText) {
          noticeText.textContent = keyData.cannotTransferReason || 'Key transfer is unavailable while the key is inside the IoT key box. Take and register the key through the IoT key box first, then transfer it to another professor.';
          noticeBox.style.display = 'block';
          if (keyData.isDocked) {
            noticeBox.classList.add('docked-warning');
          } else {
            noticeBox.classList.remove('docked-warning');
          }
        }
        if (btnOpenReq) {
          btnOpenReq.style.display = (keyData.canRequestApproval && !keyData.isDocked) ? 'inline-flex' : 'none';
        }
      } else if (keyData.isApprovedMultiKey) {
        // Multi-key transfer authorized by Department Head
        if (approvedNotice) {
          approvedNotice.style.display = 'block';
          if (approvedNoticeText) {
            approvedNoticeText.textContent = `Department Head approved! You are authorized to claim Key ${keyData.keyCode} for Laboratory ${keyData.roomNumber}.`;
          }
        }
        if (noticeBox) {
          noticeBox.style.display = 'none';
          noticeBox.classList.remove('docked-warning');
        }
        if (btnOpenReq) btnOpenReq.style.display = 'none';
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.classList.remove('btn-transfer-disabled');
          btnConfirm.style.background = '';
          btnConfirm.style.boxShadow = '';
          btnConfirm.style.cursor = 'pointer';
          btnConfirm.style.pointerEvents = 'auto';
          const btnSpan = btnConfirm.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Confirm Key Transfer (Authorized)';
        }
      } else {
        // Normal eligible transfer
        if (approvedNotice) approvedNotice.style.display = 'none';
        if (noticeBox) {
          noticeBox.style.display = 'none';
          noticeBox.classList.remove('docked-warning');
        }
        if (btnOpenReq) btnOpenReq.style.display = 'none';
        if (btnConfirm) {
          btnConfirm.disabled = false;
          btnConfirm.classList.remove('btn-transfer-disabled');
          btnConfirm.style.background = '';
          btnConfirm.style.boxShadow = '';
          btnConfirm.style.cursor = 'pointer';
          btnConfirm.style.pointerEvents = 'auto';
          const btnSpan = btnConfirm.querySelector('span');
          if (btnSpan) btnSpan.textContent = 'Confirm Key Transfer';
        }
      }

      if (loadingBox) loadingBox.style.display = 'none';
      if (mainView) mainView.style.display = 'block';

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }

      // Keep key state synced with live backend state
      startAutoPoll(keyCode);
    } catch (err) {
      console.error('[KeyTransfer] Failed to load details:', err);
      showError('Connection Error', 'Unable to connect to the LabSync server. Please check your network and try again.');
    }
  }

  let autoPollTimer = null;
  function startAutoPoll(keyCode) {
    if (autoPollTimer) clearInterval(autoPollTimer);
    autoPollTimer = setInterval(async () => {
      const successView = document.getElementById('successView');
      if (successView && successView.style.display === 'block') {
        clearInterval(autoPollTimer);
        return;
      }
      try {
        const response = await fetch(`/api/keys/transfer-info/${encodeURIComponent(keyCode)}`, { credentials: 'include' });
        if (response.ok) {
          const fresh = await response.json();
          const stateChanged = Boolean(
            !keyData ||
            fresh.roomKeyStatus !== keyData.roomKeyStatus ||
            fresh.canTransfer !== keyData.canTransfer ||
            fresh.isDocked !== keyData.isDocked ||
            fresh.isApprovedMultiKey !== keyData.isApprovedMultiKey ||
            (fresh.currentHolder && (!keyData.currentHolder || String(fresh.currentHolder.id) !== String(keyData.currentHolder.id))) ||
            (!fresh.currentHolder && keyData.currentHolder)
          );
          if (stateChanged) {
            await loadTransferDetails(keyCode);
          }
        }
      } catch (e) {}
    }, 3500);
  }

  function setupEventListeners() {
    const btnConfirm = document.getElementById('btnConfirmTransfer');
    const btnCancel = document.getElementById('btnCancelTransfer');

    // Modal controls for key authorization request
    const btnOpenReq = document.getElementById('btnOpenRequestModal');
    const modal = document.getElementById('keyRequestModal');
    const btnCloseModal = document.getElementById('btnCloseRequestModal');
    const btnCancelModal = document.getElementById('btnCancelKeyRequest');
    const btnSubmitReq = document.getElementById('btnSubmitKeyRequest');
    const reasonInput = document.getElementById('reqReasonInput');
    const charCountEl = document.getElementById('reqReasonCharCount');

    function updateCharCount() {
      if (!charCountEl || !reasonInput) return;
      const len = reasonInput.value.length;
      charCountEl.textContent = `${len} / 150`;
      charCountEl.classList.toggle('counter-warning', len >= 135 && len < 150);
      charCountEl.classList.toggle('counter-limit', len >= 150);
    }

    if (reasonInput) {
      reasonInput.addEventListener('input', updateCharCount);
    }

    function openModal() {
      if (!modal || !keyData) return;
      const modalReqRoom = document.getElementById('modalReqRoom');
      const modalHeldRoom = document.getElementById('modalHeldRoom');
      if (modalReqRoom) modalReqRoom.textContent = `Laboratory ${keyData.roomNumber}`;
      if (modalHeldRoom) modalHeldRoom.textContent = `Room ${keyData.heldOtherRoom || 'Unknown'}`;
      if (reasonInput) {
        reasonInput.value = '';
        updateCharCount();
      }
      modal.style.display = 'flex';
      if (window.lucide) window.lucide.createIcons();
    }

    function closeModal() {
      if (modal) modal.style.display = 'none';
    }

    if (btnOpenReq) btnOpenReq.addEventListener('click', openModal);
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);

    if (btnSubmitReq) {
      btnSubmitReq.addEventListener('click', async () => {
        if (!keyData || !keyData.roomId) return;
        const reason = reasonInput ? reasonInput.value.trim() : '';
        if (reason.length < 5) {
          alert('Please enter a brief justification for requesting this key (at least 5 characters).');
          return;
        }
        if (reason.length > 150) {
          alert('Justification cannot exceed 150 characters.');
          return;
        }

        btnSubmitReq.disabled = true;
        btnSubmitReq.innerHTML = '<i data-lucide="loader" class="spin" style="width:16px;height:16px;"></i> Submitting...';
        if (window.lucide) window.lucide.createIcons();

        try {
          const resp = await fetch('/api/keys/request-additional', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ roomId: keyData.roomId, reason })
          });
          const resJson = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            throw new Error(resJson.error || 'Failed to submit request.');
          }

          closeModal();
          const noticeText = document.getElementById('restrictionNoticeText');
          if (noticeText) {
            noticeText.innerHTML = `<strong>⏳ Request Submitted:</strong> Waiting for Department Head approval. This screen will automatically unlock as soon as approved.`;
          }
          if (btnOpenReq) btnOpenReq.style.display = 'none';
          startAutoPoll(currentKeyCode);
        } catch (err) {
          alert(err.message || 'Submission failed.');
          btnSubmitReq.disabled = false;
          btnSubmitReq.innerHTML = '<i data-lucide="send" style="width:16px;height:16px;"></i> Send Request to Dept Head';
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        navigateToDashboard();
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        if (!keyData || !keyData.canTransfer || keyData.isDocked) return;

        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i data-lucide="loader" class="spin" style="width:18px;height:18px;"></i> Recording transfer...';
        if (window.lucide) window.lucide.createIcons();

        try {
          const response = await fetch('/api/keys/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ keyCode: currentKeyCode })
          });

          const result = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(result.error || 'Failed to complete key transfer.');
          }

          if (autoPollTimer) clearInterval(autoPollTimer);

          // Show success state view
          const mainView = document.getElementById('mainTransferView');
          const successView = document.getElementById('successView');

          if (mainView) mainView.style.display = 'none';
          if (successView) successView.style.display = 'block';

          const t = result.transfer || {};
          const recLab = document.getElementById('recLab');
          const recKey = document.getElementById('recKey');
          const recPrev = document.getElementById('recPrev');
          const recNew = document.getElementById('recNew');
          const recTime = document.getElementById('recTime');

          if (recLab) recLab.textContent = `Laboratory ${t.roomNumber || keyData.roomNumber}`;
          if (recKey) recKey.textContent = t.keyCode || currentKeyCode;
          if (recPrev) recPrev.textContent = t.previousHolder || 'Key Dock';
          if (recNew) recNew.textContent = t.newHolder || (keyData.currentUser ? keyData.currentUser.name : 'You');
          if (recTime) {
            const d = t.transferredAt ? new Date(t.transferredAt) : new Date();
            recTime.textContent = d.toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }

          const btnGoDash = document.getElementById('btnGoDashboard');
          if (btnGoDash) {
            btnGoDash.onclick = () => navigateToDashboard();
          }

          if (window.lucide) window.lucide.createIcons();
        } catch (err) {
          alert(err.message || 'Transfer failed.');
          btnConfirm.disabled = false;
          btnConfirm.innerHTML = '<i data-lucide="check-circle-2" style="width:18px;height:18px;"></i> Confirm Key Transfer';
          if (window.lucide) window.lucide.createIcons();
        }
      });
    }
  }

  function navigateToDashboard() {
    const role = (keyData && keyData.currentUser && keyData.currentUser.role) || '';
    if (role === 'IT Dept. Head' || role === 'IT Head' || role === 'Program Coordinator' || role.toLowerCase().includes('head')) {
      window.location.href = 'it-head-dashboard.html';
    } else if (role === 'MIS Staff') {
      window.location.href = 'mis-staff-dashboard.html';
    } else {
      window.location.href = 'faculty-dashboard.html';
    }
  }

  function showError(title, msg) {
    const loadingBox = document.getElementById('loadingBox');
    const mainView = document.getElementById('mainTransferView');
    const unauthBox = document.getElementById('unauthBox');
    const errorBox = document.getElementById('errorBox');
    const errorTitle = document.getElementById('errorTitle');
    const errorText = document.getElementById('errorText');

    if (loadingBox) loadingBox.style.display = 'none';
    if (mainView) mainView.style.display = 'none';
    if (unauthBox) unauthBox.style.display = 'none';

    if (errorTitle) errorTitle.textContent = title;
    if (errorText) errorText.textContent = msg;
    if (errorBox) errorBox.style.display = 'block';

    if (window.lucide) window.lucide.createIcons();
  }

})();
