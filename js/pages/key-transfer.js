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
        if (loadingBox) loadingBox.style.display = 'none';
        if (unauthBox) unauthBox.style.display = 'block';
        if (window.lucide) window.lucide.createIcons();

        const btnLogin = document.getElementById('btnLoginRedirect');
        if (btnLogin) {
          btnLogin.onclick = () => {
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `login.html?redirect=${returnUrl}`;
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

      // Update Header
      const headerBadge = document.getElementById('userHeaderBadge');
      if (headerBadge && keyData.currentUser) {
        headerBadge.innerHTML = `
          <span style="color: var(--text-muted); font-weight: 500;">Logged in as:</span>
          <strong style="color: var(--primary-teal);">${keyData.currentUser.name}</strong>
          <span style="font-size: 11px; background: rgba(30,187,215,0.12); color: var(--primary-teal); padding: 2px 8px; border-radius: 6px; margin-left: 4px;">${keyData.currentUser.role}</span>
        `;
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

      if (keyData.currentHolder) {
        const initials = keyData.currentHolder.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        if (prevAvatar) prevAvatar.textContent = initials;
        if (prevRole) prevRole.textContent = 'CURRENT KEY HOLDER';
        if (prevName) prevName.textContent = keyData.currentHolder.name;
        if (prevSub) prevSub.textContent = keyData.currentHolder.role + (keyData.currentHolder.email ? ` • ${keyData.currentHolder.email}` : '');
      } else {
        if (prevAvatar) prevAvatar.innerHTML = '<i data-lucide="inbox" style="width:20px;height:20px;"></i>';
        if (prevRole) prevRole.textContent = 'STATUS: IN DOCK';
        if (prevName) prevName.textContent = 'Key Box / No Active Holder';
        if (prevSub) prevSub.textContent = 'Key is ready to be claimed';
      }

      // Populate Receiving User
      const recvAvatar = document.getElementById('dispRecvAvatar');
      const recvRole = document.getElementById('dispRecvRole');
      const recvName = document.getElementById('dispRecvName');
      const recvSub = document.getElementById('dispRecvSub');

      if (keyData.currentUser) {
        const initials = keyData.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        if (recvAvatar) recvAvatar.textContent = initials;
        if (recvRole) recvRole.textContent = (keyData.currentUser.role || 'FACULTY').toUpperCase();
        if (recvName) recvName.textContent = keyData.currentUser.name;
        if (recvSub) recvSub.textContent = 'Will assume physical key & room responsibility';
      }

      // Permission & Restriction handling
      const btnConfirm = document.getElementById('btnConfirmTransfer');
      const noticeBox = document.getElementById('restrictionNotice');
      const noticeText = document.getElementById('restrictionNoticeText');

      if (!keyData.canTransfer) {
        if (btnConfirm) {
          btnConfirm.disabled = true;
          btnConfirm.style.background = '#94a3b8';
          btnConfirm.style.boxShadow = 'none';
        }
        if (noticeBox && noticeText) {
          noticeText.textContent = keyData.cannotTransferReason || 'You are not authorized to transfer this key.';
          noticeBox.style.display = 'block';
        }
      }

      if (loadingBox) loadingBox.style.display = 'none';
      if (mainView) mainView.style.display = 'block';

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (err) {
      console.error('[KeyTransfer] Failed to load details:', err);
      showError('Connection Error', 'Unable to connect to the LabSync server. Please check your network and try again.');
    }
  }

  function setupEventListeners() {
    const btnConfirm = document.getElementById('btnConfirmTransfer');
    const btnCancel = document.getElementById('btnCancelTransfer');

    if (btnCancel) {
      btnCancel.addEventListener('click', () => {
        navigateToDashboard();
      });
    }

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        if (!keyData || !keyData.canTransfer) return;

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
    if (keyData && keyData.currentUser && keyData.currentUser.role === 'IT Dept. Head') {
      window.location.href = 'it-head-dashboard.html';
    } else if (keyData && keyData.currentUser && keyData.currentUser.role === 'MIS Staff') {
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
