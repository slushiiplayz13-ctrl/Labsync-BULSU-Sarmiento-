/**
 * LabSync – Public Found Key Report Script  |  js/pages/key-found.js
 * Handles URL parameter parsing, safe key location info lookup, and public report submission.
 */

(function () {
  'use strict';

  let currentKeyCode = null;

  document.addEventListener('DOMContentLoaded', () => {
    initPublicPage();
  });

  async function initPublicPage() {
    const params = new URLSearchParams(window.location.search);
    currentKeyCode = params.get('key');

    if (!currentKeyCode) {
      showError('No key identifier was provided in the URL.');
      return;
    }

    // Set default date/time picker to current local time
    const now = new Date();
    const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    const dateInput = document.getElementById('foundAt');
    if (dateInput) {
      dateInput.value = localIso;
    }

    await loadKeyPublicInfo(currentKeyCode);
    setupFormListener();
  }

  /**
   * Fetches public minimal room location info for the given key code.
   */
  async function loadKeyPublicInfo(keyCode) {
    const loadingBox = document.getElementById('loadingBox');
    const mainFormView = document.getElementById('mainFormView');

    try {
      const response = await fetch(`/api/keys/public/info/${encodeURIComponent(keyCode)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Key not found.' }));
        showError(errData.error || 'Key identifier not found.');
        return;
      }

      const data = await response.json();

      const dispBldg = document.getElementById('dispBuilding');
      const dispRoom = document.getElementById('dispRoom');
      const dispCode = document.getElementById('dispKeyCode');

      if (dispBldg) dispBldg.textContent = data.building || 'IT BUILDING';
      if (dispRoom) {
        const rawRoom = String(data.roomNumber || '').trim();
        dispRoom.textContent = rawRoom.toLowerCase().startsWith('room') ? rawRoom.toUpperCase() : `LABORATORY ${rawRoom}`;
      }
      if (dispCode) dispCode.textContent = data.keyCode || keyCode;

      if (loadingBox) loadingBox.style.display = 'none';
      if (mainFormView) mainFormView.style.display = 'block';

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (err) {
      console.error('[KeyFound] Failed to load key info:', err);
      showError('Unable to connect to LabSync server. Please try again.');
    }
  }

  /**
   * Displays error message card.
   */
  function showError(msg) {
    const loadingBox = document.getElementById('loadingBox');
    const errorBox = document.getElementById('errorBox');
    const errorText = document.getElementById('errorText');

    if (loadingBox) loadingBox.style.display = 'none';
    if (errorText) errorText.textContent = msg;
    if (errorBox) errorBox.style.display = 'block';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Attaches submission form event listener.
   */
  function setupFormListener() {
    const form = document.getElementById('foundKeyForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const foundLocation = document.getElementById('foundLocation').value;
      const foundAt = document.getElementById('foundAt').value;
      const finderContact = document.getElementById('finderContact').value;
      const message = document.getElementById('message').value;

      if (!foundLocation || !foundAt) {
        alert('Please fill out the location and date/time found.');
        return;
      }

      const btnSubmit = document.getElementById('btnSubmitReport');
      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i data-lucide="loader" class="spin" style="width:18px;height:18px;"></i> Submitting report...';
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
      }

      try {
        const response = await fetch('/api/keys/public/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyCode: currentKeyCode,
            foundLocation,
            foundAt,
            finderContact,
            message
          })
        });

        const resData = await response.json();

        if (!response.ok) {
          throw new Error(resData.error || 'Failed to submit report.');
        }

        // Show success state
        const mainFormView = document.getElementById('mainFormView');
        const successView = document.getElementById('successView');

        if (mainFormView) mainFormView.style.display = 'none';
        if (successView) successView.style.display = 'block';

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      } catch (err) {
        alert(err.message || 'Failed to submit report');
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerHTML = '<i data-lucide="send" style="width:18px;height:18px;"></i> Submit Found Key Report';
          if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        }
      }
    });
  }

})();
