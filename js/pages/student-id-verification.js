/**
 * LabSync – Dedicated Student ID Verification Gateway Controller
 * ================================================================
 * Handles physical Student ID QR scanning before allowing access to
 * the Submit PC Report form.
 */

'use strict';

let currentRoomNumber = '';
let currentPcNumber = '';
let html5QrCodeInstance = null;
let isCameraScanning = false;
let isProcessingQR = false;
let isVerifyingID = false;
let currentCameraIndex = 0;
let availableCameras = [];

/**
 * Normalizes query string parameter values for Room and PC
 */
function parseWorkstationParams() {
  const urlParams = new URLSearchParams(window.location.search);

  const rawRoom = (
    urlParams.get('room') ||
    urlParams.get('roomNumber') ||
    urlParams.get('room_number') ||
    urlParams.get('roomId') ||
    ''
  ).trim();

  const rawPc = (
    urlParams.get('pc') ||
    urlParams.get('pcNumber') ||
    urlParams.get('pc_number') ||
    urlParams.get('pcId') ||
    ''
  ).trim();

  // Strip prefixes for consistent display: "Room 204" -> "204", "PC 2" -> "2"
  let cleanRoom = rawRoom.replace(/^(room|rm|laboratory|lab)\s*[-:]?\s*/i, '').trim();
  let cleanPc = rawPc.replace(/^(pc\s*unit|pc\s*#|pc|unit)\s*[-:]?\s*/i, '').trim();

  currentRoomNumber = cleanRoom || rawRoom;
  currentPcNumber = cleanPc || rawPc;

  const roomDisplayEl = document.getElementById('room-display');
  const pcDisplayEl = document.getElementById('pc-display');

  if (roomDisplayEl) {
    roomDisplayEl.textContent = currentRoomNumber ? `Room ${currentRoomNumber}` : 'Room Not Specified';
  }

  if (pcDisplayEl) {
    if (currentPcNumber) {
      const pcUpper = currentPcNumber.toUpperCase();
      const pcNormalized = pcUpper.startsWith('PC-')
        ? pcUpper
        : (pcUpper.startsWith('PC') ? `PC-${pcUpper.replace(/^PC\s*/, '')}` : `PC-${currentPcNumber}`);
      pcDisplayEl.textContent = pcNormalized;
    } else {
      pcDisplayEl.textContent = 'PC Not Specified';
    }
  }

  const dateEl = document.getElementById('current-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

/**
 * In-App System Toast Notification helper
 */
function showSystemToast(message, type = 'warning', title = null) {
  let container = document.getElementById('labsync-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'labsync-toast-container';
    document.body.appendChild(container);
  }

  const card = document.createElement('div');
  card.className = 'labsync-toast-card';
  const isError = type === 'error';
  const isWarning = type === 'warning';
  const toastTitle = title || (isError ? 'Notice' : (isWarning ? 'Notice' : 'Success'));
  const iconName = isError ? 'alert-triangle' : (isWarning ? 'alert-circle' : 'check-circle-2');
  const iconColor = isError ? '#EF4444' : (isWarning ? '#F59E0B' : '#1EBBD7');
  const iconBg = isError ? 'rgba(239, 68, 68, 0.12)' : (isWarning ? 'rgba(245, 158, 11, 0.12)' : 'rgba(30, 187, 215, 0.12)');

  card.innerHTML = `
    <div style="width: 32px; height: 32px; min-width: 32px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;">
      <i data-lucide="${iconName}" style="width: 17px; height: 17px;"></i>
    </div>
    <div class="toast-content" style="flex: 1;">
      <strong>${toastTitle}</strong>
      <span>${message}</span>
    </div>
  `;

  container.appendChild(card);
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }

  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-10px)';
    card.style.transition = 'all 0.25s ease-out';
    setTimeout(() => {
      if (card.parentNode) card.parentNode.removeChild(card);
    }, 250);
  }, 4200);
}

/**
 * Unified handler for successful QR detection from camera stream.
 * Synchronously sets in-flight processing flag before any async operations
 * to prevent duplicate API requests while camera is shutting down.
 */
async function handleQRScanSuccess(decodedText) {
  if (isProcessingQR || isVerifyingID) return;
  isProcessingQR = true;
  try {
    await stopCameraScanner();
    await processScannedID(decodedText);
  } catch (err) {
    isProcessingQR = false;
  }
}

/**
 * Activates camera scanner using Html5Qrcode.
 */
async function startCameraScanner() {
  if (isVerifyingID) return;
  isProcessingQR = false;

  const placeholderEl = document.getElementById('scanner-placeholder');
  const controlsEl = document.getElementById('scanner-controls-row');
  const overlayEl = document.getElementById('scanner-active-overlay');

  if (typeof window.Html5Qrcode === 'undefined') {
    showSystemToast(
      'Camera scanner library is unavailable. Please use the ID photo upload option below.',
      'warning',
      'Scanner Notice'
    );
    toggleFallbackInput(true);
    return;
  }

  try {
    if (!html5QrCodeInstance) {
      html5QrCodeInstance = new window.Html5Qrcode('qr-reader');
    }

    const viewportContainer = document.getElementById('scanner-viewport-container');
    if (viewportContainer) viewportContainer.classList.add('scanner-active');
    if (placeholderEl) placeholderEl.style.display = 'none';
    if (overlayEl) overlayEl.style.display = 'block';
    if (controlsEl) controlsEl.style.display = 'flex';

    const config = {
      fps: 15,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    try {
      await html5QrCodeInstance.start(
        { facingMode: 'environment' },
        config,
        handleQRScanSuccess,
        () => {}
      );
      isCameraScanning = true;
    } catch (camErr) {
      availableCameras = await window.Html5Qrcode.getCameras().catch(() => []);
      if (availableCameras.length > 0) {
        const preferredId = selectPreferredCamera(availableCameras);
        currentCameraIndex = availableCameras.findIndex(c => c.id === preferredId);
        if (currentCameraIndex === -1) currentCameraIndex = 0;
        await html5QrCodeInstance.start(
          preferredId,
          config,
          handleQRScanSuccess,
          () => {}
        );
        isCameraScanning = true;
      } else {
        throw camErr;
      }
    }
  } catch (err) {
    console.error('Camera access error:', err);
    const viewportContainer = document.getElementById('scanner-viewport-container');
    if (viewportContainer) viewportContainer.classList.remove('scanner-active');
    if (placeholderEl) placeholderEl.style.display = 'flex';
    if (overlayEl) overlayEl.style.display = 'none';
    if (controlsEl) controlsEl.style.display = 'none';
    showSystemToast(
      'Camera access was not permitted. Please allow camera permissions or use the ID photo upload option below.',
      'warning',
      'Camera Required'
    );
    toggleFallbackInput(true);
  }
}

/**
 * Selects the best rear-facing camera from an array of detected cameras.
 */
function selectPreferredCamera(cameras) {
  if (!cameras || cameras.length === 0) return null;
  const rear = cameras.find(c => {
    const label = (c.label || '').toLowerCase();
    return label.includes('back') || label.includes('rear') || label.includes('environment');
  });
  if (rear) return rear.id;
  return cameras.length > 1 ? cameras[cameras.length - 1].id : cameras[0].id;
}

/**
 * Stops camera scanner.
 */
async function stopCameraScanner() {
  if (html5QrCodeInstance && isCameraScanning) {
    try {
      await html5QrCodeInstance.stop();
    } catch (_) {}
    isCameraScanning = false;
  }
  const viewportContainer = document.getElementById('scanner-viewport-container');
  if (viewportContainer) viewportContainer.classList.remove('scanner-active');
  const placeholderEl = document.getElementById('scanner-placeholder');
  const controlsEl = document.getElementById('scanner-controls-row');
  const overlayEl = document.getElementById('scanner-active-overlay');
  if (placeholderEl) placeholderEl.style.display = 'flex';
  if (controlsEl) controlsEl.style.display = 'none';
  if (overlayEl) overlayEl.style.display = 'none';
}

/**
 * Switches between front and back camera.
 */
async function switchCamera() {
  if (!html5QrCodeInstance || !isCameraScanning) return;
  try {
    if (availableCameras.length === 0) {
      availableCameras = await window.Html5Qrcode.getCameras().catch(() => []);
    }
    if (availableCameras.length > 1) {
      currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
      await stopCameraScanner();
      const placeholderEl = document.getElementById('scanner-placeholder');
      const controlsEl = document.getElementById('scanner-controls-row');
      const overlayEl = document.getElementById('scanner-active-overlay');
      if (placeholderEl) placeholderEl.style.display = 'none';
      if (overlayEl) overlayEl.style.display = 'block';
      if (controlsEl) controlsEl.style.display = 'flex';

      const config = {
        fps: 15,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      await html5QrCodeInstance.start(
        availableCameras[currentCameraIndex].id,
        config,
        handleQRScanSuccess,
        () => {}
      );
      isCameraScanning = true;
    }
  } catch (err) {
    console.error('Camera switch error:', err);
  }
}

/**
 * Toggles fallback upload box.
 */
function toggleFallbackInput(forceShow = null) {
  const fallbackBox = document.getElementById('fallback-input-box');
  if (!fallbackBox) return;
  const shouldShow = typeof forceShow === 'boolean' ? forceShow : (fallbackBox.style.display === 'none');
  fallbackBox.style.display = shouldShow ? 'block' : 'none';
}

/**
 * Reads QR code from a file image chosen by student.
 */
async function handleQRFileUpload(fileInput) {
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) return;
  if (isProcessingQR || isVerifyingID) return;
  isProcessingQR = true;
  const file = fileInput.files[0];
  try {
    if (!html5QrCodeInstance && typeof window.Html5Qrcode !== 'undefined') {
      html5QrCodeInstance = new window.Html5Qrcode('qr-reader');
    }
    if (html5QrCodeInstance) {
      showSystemToast('Processing Student ID image...', 'warning', 'Scanning');
      const decoded = await html5QrCodeInstance.scanFile(file, true);
      await processScannedID(decoded);
    } else {
      showSystemToast('Scanner library not loaded.', 'warning', 'Notice');
      isProcessingQR = false;
    }
  } catch (err) {
    isProcessingQR = false;
    showSystemToast('Could not detect a QR code from the uploaded image. Please try a clearer picture.', 'warning', 'Scan Failed');
  } finally {
    fileInput.value = '';
  }
}

/**
 * Sends scanned QR data to backend for cryptographic verification,
 * displays Identity Confirmed card, stores state into sessionStorage,
 * and seamlessly redirects to the Submit PC Report form.
 */
async function processScannedID(qrData) {
  if (isVerifyingID) return;
  if (!qrData || typeof qrData !== 'string') {
    isProcessingQR = false;
    return;
  }
  isVerifyingID = true;
  isProcessingQR = true;

  const room = currentRoomNumber || 'N/A';
  const pc = currentPcNumber || 'N/A';

  showSystemToast('Verifying Student ID credentials...', 'warning', 'Verifying');

  try {
    const response = await fetch('/api/reports/verify-student-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrData, roomNumber: room, pcNumber: pc })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Student ID verification failed');
    }

    // Persist verified session bundle into sessionStorage
    // Note: The backend verification token remains authoritative upon report submission.
    const verifiedSessionBundle = {
      roomNumber: room,
      pcNumber: pc,
      studentName: result.studentName,
      studentNumber: result.studentNumber,
      verificationToken: result.verificationToken,
      verificationTimestamp: result.verificationTimestamp
    };

    try {
      sessionStorage.setItem('labsync_verified_student', JSON.stringify(verifiedSessionBundle));
    } catch (storageErr) {
      console.warn('sessionStorage write warning:', storageErr);
    }

    // Switch UI to Identity Confirmed card
    const scanContainer = document.getElementById('scanning-state-container');
    const confirmedContainer = document.getElementById('confirmed-state-container');
    const nameEl = document.getElementById('confirmed-student-name');
    const numberEl = document.getElementById('confirmed-student-number');
    const workstationEl = document.getElementById('confirmed-workstation');

    if (nameEl) nameEl.textContent = result.studentName;
    if (numberEl) numberEl.textContent = result.studentNumber;
    if (workstationEl) {
      const pcFormatted = pc.toUpperCase().startsWith('PC') ? pc.toUpperCase() : `PC-${pc}`;
      workstationEl.textContent = `Room ${room} · ${pcFormatted}`;
    }

    if (scanContainer) scanContainer.style.display = 'none';
    if (confirmedContainer) confirmedContainer.style.display = 'flex';

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }

    showSystemToast(`Verified: ${result.studentName}`, 'success', 'Identity Confirmed');

    // Automatically transition to the report form after short visual confirmation
    setTimeout(() => {
      const targetUrl = `submit-pc-report.html?room=${encodeURIComponent(room)}&pc=${encodeURIComponent(pc)}`;
      window.location.href = targetUrl;
    }, 1200);

  } catch (err) {
    isProcessingQR = false;
    console.error('ID verification error:', err);
    showSystemToast(
      err.message || 'Invalid Student ID QR code. Please scan the QR code on the back of your official Student ID.',
      'error',
      'Verification Failed'
    );
  } finally {
    isVerifyingID = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  parseWorkstationParams();

  // Enforce Light Mode (Student ID verification gateway is permanently Light Mode)
  if (typeof document !== 'undefined') {
    if (document.documentElement) {
      if (document.documentElement.classList) {
        document.documentElement.classList.remove('dark-mode', 'high-contrast');
      }
      if (typeof document.documentElement.setAttribute === 'function') {
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
    if (document.body && document.body.classList) {
      document.body.classList.remove('dark-mode', 'high-contrast');
    }
  }

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
});

window.startCameraScanner = startCameraScanner;
window.stopCameraScanner = stopCameraScanner;
window.switchCamera = switchCamera;
window.toggleFallbackInput = toggleFallbackInput;
window.handleQRFileUpload = handleQRFileUpload;
window.processScannedID = processScannedID;
