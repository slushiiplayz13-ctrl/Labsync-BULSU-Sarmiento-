/* ================================================================
   LabSync – MIS PC & QR Management Controller  |  js/pages/mis-qr-generator.js
   ================================================================ */

'use strict';

// Page-local state
let currentRoomId = null;
let currentRoomNumber = null;
let currentPCs = [];
let pendingAddRoomId = null;
let isCustomMode = false;

/**
 * Switches view to PC Grid for selected room.
 * @param {number} roomId
 * @param {string|number} roomNumber
 */
function showPCGrid(roomId, roomNumber) {
  currentRoomId = roomId;
  currentRoomNumber = roomNumber;
  const roomView = document.getElementById('roomSelectionView');
  const pcView = document.getElementById('pcGridView');
  const titleEl = document.getElementById('selectedRoomTitle');

  if (roomView) roomView.style.display = 'none';
  if (pcView) pcView.style.display = 'block';
  if (titleEl) titleEl.textContent = `Room ${roomNumber}`;
  loadPCs(roomId);
}

/**
 * Switches view back to Room Selection Grid.
 */
function showRoomSelection() {
  const roomView = document.getElementById('roomSelectionView');
  const pcView = document.getElementById('pcGridView');

  if (roomView) roomView.style.display = 'block';
  if (pcView) pcView.style.display = 'none';
  currentRoomId = null;
  currentRoomNumber = null;
  currentPCs = [];
}

/**
 * Fetches PCs for a given room ID and triggers grid render.
 * @param {number} roomId
 */
async function loadPCs(roomId) {
  const grid = document.getElementById('dynamicPCGrid');
  if (grid) {
    grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px;">Loading PCs...</div>';
  }

  try {
    const response = await fetch(`/api/laboratories/${roomId}/pcs`);
    if (!response.ok) throw new Error('Failed to load PCs');

    currentPCs = await response.json();
    renderPCGrid();
  } catch (error) {
    console.error('Error loading PCs:', error);
    if (grid) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #EF4444;">Failed to load PCs</div>';
    }
  }
}

/**
 * Renders PC cards and Add PC button in #dynamicPCGrid.
 */
function renderPCGrid() {
  const grid = document.getElementById('dynamicPCGrid');
  if (!grid) return;

  grid.innerHTML = '';

  currentPCs.forEach(pc => {
    const card = document.createElement('div');
    card.className = 'pc-qr-card';
    card.style.position = 'relative';
    card.innerHTML = `
      <button class="delete-pc-btn" onclick="deletePC(${pc.PC_ID})" title="Delete PC ${pc.PC_Number}">
        <i data-lucide="trash-2"></i>
      </button>
      <div class="pc-qr-title">PC ${pc.PC_Number}</div>
      <button class="pc-qr-btn" onclick="generateQR(${pc.PC_ID})">
        <i data-lucide="qr-code" style="width: 14px; height: 14px;"></i>
        Generate QR
      </button>
    `;
    grid.appendChild(card);
  });

  // Add PC button card
  const addCard = document.createElement('div');
  addCard.className = 'pc-qr-card';
  addCard.style.cssText = 'border: 2px dashed var(--border-light); background: transparent; box-shadow: none; cursor: pointer; transition: all 0.2s;';
  addCard.onclick = () => addPC(currentRoomId);
  addCard.innerHTML = `
    <div style="background: transparent; color: var(--primary-teal); border: 2px dashed var(--primary-teal); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
      <i data-lucide="plus" style="width: 24px; height: 24px;"></i>
    </div>
    <div class="pc-qr-title" style="font-size: 18px; color: var(--primary-teal);">Add PC</div>
  `;
  grid.appendChild(addCard);

  if (window.lucide) lucide.createIcons();
}

/**
 * Parses input string into array of PC numbers.
 * @param {string} inputStr
 * @returns {Array<string>} Sorted array of unique PC numbers
 */
function parsePcInputString(inputStr) {
  if (!inputStr) return [];
  const parts = inputStr.split(',').map(s => s.trim()).filter(Boolean);
  const result = new Set();

  parts.forEach(part => {
    const rangeMatch = part.match(/^(\d+)\s*(?:-|to)\s*(\d+)$/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let i = min; i <= max; i++) {
          result.add(i.toString());
        }
        return;
      }
    }

    const singleNum = part.replace(/[^\d]/g, '');
    if (singleNum) {
      result.add(parseInt(singleNum, 10).toString());
    }
  });

  return Array.from(result).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/**
 * Switches tab mode in Add PC Modal ('simple' vs 'custom').
 * @param {string} mode
 */
function selectAddMode(mode) {
  isCustomMode = (mode === 'custom');
  const tabSimple = document.getElementById('tabModeSimple');
  const tabCustom = document.getElementById('tabModeCustom');
  const simpleSection = document.getElementById('addPcSimpleSection');
  const customSection = document.getElementById('addPcCustomSection');
  const submitBtn = document.getElementById('submitAddPcBtn');

  if (isCustomMode) {
    if (tabCustom) {
      tabCustom.style.background = 'var(--bg-white)';
      tabCustom.style.color = 'var(--primary-teal)';
      tabCustom.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
    }
    if (tabSimple) {
      tabSimple.style.background = 'transparent';
      tabSimple.style.color = 'var(--text-light)';
      tabSimple.style.boxShadow = 'none';
    }

    if (simpleSection) simpleSection.style.display = 'none';
    if (customSection) customSection.style.display = 'block';
    if (submitBtn) submitBtn.textContent = 'Add PCs';

    const input = document.getElementById('newPcNumberInput');
    if (input) input.focus();
  } else {
    if (tabSimple) {
      tabSimple.style.background = 'var(--bg-white)';
      tabSimple.style.color = 'var(--primary-teal)';
      tabSimple.style.boxShadow = '0 2px 6px rgba(0,0,0,0.06)';
    }
    if (tabCustom) {
      tabCustom.style.background = 'transparent';
      tabCustom.style.color = 'var(--text-light)';
      tabCustom.style.boxShadow = 'none';
    }

    if (simpleSection) simpleSection.style.display = 'block';
    if (customSection) customSection.style.display = 'none';
    updateSimplePreview();
  }

  const modalOverlay = document.getElementById('addPcModalOverlay');
  if (window.lucide && modalOverlay) lucide.createIcons({ root: modalOverlay });
}

/**
 * Opens Add PC Modal and initializes start number & mode.
 * @param {number} roomId
 */
function addPC(roomId) {
  pendingAddRoomId = roomId;
  const newPcInput = document.getElementById('newPcNumberInput');
  if (newPcInput) newPcInput.value = '';

  let highestNum = 0;
  if (currentPCs && currentPCs.length > 0) {
    currentPCs.forEach(p => {
      const num = parseInt(p.PC_Number, 10);
      if (!isNaN(num) && num > highestNum) highestNum = num;
    });
  }

  const defaultAdd = highestNum > 0 ? 10 : 30;
  const countInput = document.getElementById('pcCountInput');
  if (countInput) {
    countInput.value = defaultAdd;
    countInput.dataset.startNum = (highestNum + 1).toString();
  }

  const subtitle = document.getElementById('addPcRoomSubtitle');
  if (subtitle && currentRoomNumber) {
    subtitle.textContent = `Room ${currentRoomNumber} • Currently has ${currentPCs.length} PC(s)`;
  }

  selectAddMode('simple');
  const modalOverlay = document.getElementById('addPcModalOverlay');
  if (modalOverlay) modalOverlay.style.display = 'flex';
  if (window.lucide && modalOverlay) lucide.createIcons({ root: modalOverlay });
}

/**
 * Stepper adjuster for quantity count.
 * @param {number} delta
 */
function adjustCount(delta) {
  const input = document.getElementById('pcCountInput');
  if (!input) return;
  let val = (parseInt(input.value, 10) || 0) + delta;
  if (val < 1) val = 1;
  if (val > 100) val = 100;
  input.value = val;
  updateSimplePreview();
}

/**
 * Sets quick preset quantity.
 * @param {number} num
 */
function setCountPreset(num) {
  const input = document.getElementById('pcCountInput');
  if (input) input.value = num;
  updateSimplePreview();
}

/**
 * Updates live preview text in Add PC modal.
 */
function updateSimplePreview() {
  const countInput = document.getElementById('pcCountInput');
  if (!countInput) return;
  const count = parseInt(countInput.value, 10) || 0;
  const startNum = parseInt(countInput.dataset.startNum, 10) || 1;
  const endNum = startNum + count - 1;
  const textEl = document.getElementById('simplePreviewText');
  const submitBtn = document.getElementById('submitAddPcBtn');

  if (count <= 0) {
    if (textEl) textEl.textContent = 'Please enter how many PCs to add';
    if (submitBtn) submitBtn.textContent = 'Add PCs';
    return;
  }

  if (count === 1) {
    if (textEl) textEl.textContent = `Will add PC ${startNum}`;
    if (submitBtn) submitBtn.textContent = `Add 1 PC`;
  } else {
    if (textEl) textEl.textContent = `Will add PC ${startNum} through PC ${endNum} (${count} PCs)`;
    if (submitBtn) submitBtn.textContent = `Add ${count} PCs`;
  }
}

/**
 * Legacy tab toggle helper.
 */
function toggleCustomListInput() {
  isCustomMode = !isCustomMode;
  const simpleSection = document.getElementById('addPcSimpleSection');
  const customSection = document.getElementById('addPcCustomSection');
  const submitBtn = document.getElementById('submitAddPcBtn');

  if (isCustomMode) {
    if (simpleSection) simpleSection.style.display = 'none';
    if (customSection) customSection.style.display = 'block';
    if (submitBtn) submitBtn.textContent = 'Add PCs';
    const input = document.getElementById('newPcNumberInput');
    if (input) input.focus();
  } else {
    if (simpleSection) simpleSection.style.display = 'block';
    if (customSection) customSection.style.display = 'none';
    updateSimplePreview();
  }
}

/**
 * Closes Add PC Modal and resets pending room state.
 */
function closeAddPcModal() {
  const modalOverlay = document.getElementById('addPcModalOverlay');
  if (modalOverlay) modalOverlay.style.display = 'none';
  pendingAddRoomId = null;
}

/**
 * Validates specific PC number input for custom add mode.
 * @returns {boolean} True if valid/non-duplicate
 */
function validateSpecificPcInput() {
  const inputEl = document.getElementById('newPcNumberInput');
  const errorEl = document.getElementById('specificPcErrorMsg');
  const errorTextEl = document.getElementById('specificPcErrorText');
  const submitBtn = document.getElementById('submitAddPcBtn');

  if (!inputEl || !isCustomMode) return true;

  const val = inputEl.value.trim();
  if (!val) {
    if (errorEl) errorEl.style.display = 'none';
    inputEl.style.borderColor = 'var(--border-light)';
    if (submitBtn) submitBtn.disabled = false;
    return true;
  }

  const existingMatch = currentPCs && currentPCs.find(pc => pc.PC_Number.toString().trim() === val);
  if (existingMatch) {
    if (errorTextEl) errorTextEl.textContent = `PC ${val} already exists in Room ${currentRoomNumber || ''}. Please enter a unique PC number.`;
    if (errorEl) {
      errorEl.style.display = 'flex';
      if (window.lucide) lucide.createIcons({ root: errorEl });
    }
    inputEl.style.borderColor = '#EF4444';
    if (submitBtn) submitBtn.disabled = true;
    return false;
  } else {
    if (errorEl) errorEl.style.display = 'none';
    inputEl.style.borderColor = 'var(--primary-teal)';
    if (submitBtn) submitBtn.disabled = false;
    return true;
  }
}

/**
 * Submits Add PC request to backend.
 */
async function submitAddPc() {
  let pcNumbers = [];

  if (!isCustomMode) {
    const countInput = document.getElementById('pcCountInput');
    const count = parseInt(countInput.value, 10) || 0;
    const startNum = parseInt(countInput.dataset.startNum, 10) || 1;

    if (count <= 0) {
      alert('Please enter a valid number of PCs to add.');
      return;
    }
    if (count > 100) {
      alert('Maximum 100 PCs can be added at one time.');
      return;
    }

    for (let i = 0; i < count; i++) {
      pcNumbers.push((startNum + i).toString());
    }
  } else {
    if (!validateSpecificPcInput()) {
      return;
    }
    const rawVal = document.getElementById('newPcNumberInput').value.trim();
    const pcNum = parseInt(rawVal, 10);
    if (isNaN(pcNum) || pcNum <= 0) {
      alert('Please enter a valid PC number.');
      return;
    }
    pcNumbers = [pcNum.toString()];
  }

  const roomId = pendingAddRoomId;
  if (!roomId) {
    alert('Room ID error. Please re-select the room.');
    return;
  }

  const submitBtn = document.getElementById('submitAddPcBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding...';
  }

  try {
    let response = await fetch(`/api/laboratories/${roomId}/pcs/add-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcNumbers })
    });

    // Sequential fallback if /add-bulk returns 404 (e.g. server running old code)
    if (response.status === 404) {
      let addedCount = 0;
      for (const pcNumber of pcNumbers) {
        try {
          const singleRes = await fetch(`/api/laboratories/${roomId}/pcs/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pcNumber })
          });
          if (singleRes.ok) addedCount++;
        } catch (e) {}
      }
      closeAddPcModal();
      await loadPCs(roomId);
      if (window.showToast) window.showToast(`Added ${addedCount} PC(s) successfully!`);
      return;
    }

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to add PCs');
    }

    const data = await response.json();
    closeAddPcModal();
    await loadPCs(roomId);
    if (window.showToast) window.showToast(data.message);
  } catch (error) {
    console.error('Error adding PCs:', error);
    alert(error.message || 'Failed to add PCs');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add PCs';
    }
  }
}

/**
 * Sends delete request for a PC unit.
 * @param {number} pcId
 */
async function deletePC(pcId) {
  if (!confirm('Are you sure you want to delete this PC?')) return;
  try {
    const response = await fetch(`/api/pcs/${pcId}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete PC');
    await loadPCs(currentRoomId);
  } catch (error) {
    console.error('Error deleting PC:', error);
    alert('Failed to delete PC');
  }
}

/**
 * Generates single QR code printable sticker.
 * @param {number} pcId
 */
async function generateQR(pcId) {
  try {
    const response = await fetch(`/api/pcs/${pcId}/qrcode`);
    if (!response.ok) throw new Error('Failed to generate QR');

    const data = await response.json();

    const printArea = document.getElementById('printArea');
    if (printArea) {
      printArea.innerHTML = `
        <div class="qr-print-grid">
          <div class="qr-sticker">
            <img src="${data.qrCode}" alt="QR Code" />
            <h2 style="color: #0f172a !important; -webkit-text-fill-color: #0f172a !important; font-weight: 700;">Room ${data.roomNumber} - PC ${data.pcNumber}</h2>
            <p style="color: #475569 !important; -webkit-text-fill-color: #475569 !important; font-weight: 600;">Scan to report an issue</p>
          </div>
        </div>
      `;
    }

    setTimeout(() => {
      window.print();
      if (printArea) printArea.innerHTML = '';
    }, 100);
  } catch (error) {
    console.error('Error generating QR:', error);
    alert('Failed to generate QR code');
  }
}

/**
 * Generates batch QR code printable stickers for all PCs in current room.
 */
async function generateAllQR() {
  if (!currentRoomId || currentPCs.length === 0) {
    alert('No PCs in this room yet.');
    return;
  }

  try {
    const response = await fetch(`/api/laboratories/${currentRoomId}/pcs/qrcodes`);
    if (!response.ok) throw new Error('Failed to generate batch QR codes');
    const qrDataList = await response.json();

    const stickersHtml = qrDataList.map(data => `
      <div class="qr-sticker">
        <img src="${data.qrCode}" alt="QR Code" />
        <h2 style="color: #0f172a !important; -webkit-text-fill-color: #0f172a !important; font-weight: 700;">Room ${data.roomNumber} - PC ${data.pcNumber}</h2>
        <p style="color: #475569 !important; -webkit-text-fill-color: #475569 !important; font-weight: 600;">Scan to report an issue</p>
      </div>
    `).join('');

    const printArea = document.getElementById('printArea');
    if (printArea) {
      printArea.innerHTML = `
        <div class="qr-print-grid">
          ${stickersHtml}
        </div>
      `;
    }

    setTimeout(() => {
      window.print();
      if (printArea) printArea.innerHTML = '';
    }, 100);
  } catch (error) {
    console.error('Error generating all QRs:', error);
    alert('Failed to generate QR codes');
  }
}

/**
 * Primary loader function fetching lab rooms and building room cards.
 */
async function loadRooms() {
  try {
    const grid = document.getElementById('dynamicRoomGrid');
    if (!grid) return;

    const response = await fetch('/api/laboratories');
    if (!response.ok) throw new Error('Failed to load rooms');

    const rooms = await response.json();

    if (rooms.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-mid);">No rooms available. Please wait for the IT Dept Head to add rooms.</div>';
      return;
    }

    grid.innerHTML = '';
    rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-select-card';
      card.onclick = () => showPCGrid(room.Room_ID, room.Room_Number);

      card.innerHTML = `
        <div class="rsc-icon">${room.Room_Number}</div>
        <div class="rsc-title">Room ${room.Room_Number}</div>
        <div class="rsc-subtitle">${room.Building || 'Unknown Building'}</div>
      `;
      grid.appendChild(card);
    });
  } catch (error) {
    console.error('Error loading rooms:', error);
    const grid = document.getElementById('dynamicRoomGrid');
    if (grid) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #EF4444;">Failed to load rooms. Please try again later.</div>';
    }
  }
}

/**
 * Initializes sidebar scroll clue listener and triggers room load.
 */
function initMISQRGeneratorPage() {
  const sidebar = document.querySelector('.sidebar');
  const scrollClue = document.getElementById('sidebarScrollClue');

  if (sidebar && scrollClue) {
    if (sidebar.scrollHeight <= sidebar.clientHeight) {
      scrollClue.style.display = 'none';
    }

    sidebar.addEventListener('scroll', () => {
      if (sidebar.scrollTop > 10) {
        scrollClue.style.opacity = '0';
      } else {
        scrollClue.style.opacity = '1';
      }
    });
  }

  loadRooms();
}

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMISQRGeneratorPage);
} else {
  initMISQRGeneratorPage();
}

// Global compatibility bridges
window.showRoomSelection = showRoomSelection;
window.deletePC = deletePC;
window.generateQR = generateQR;
window.generateAllQR = generateAllQR;
window.addPC = addPC;
window.closeAddPcModal = closeAddPcModal;
window.selectAddMode = selectAddMode;
window.adjustCount = adjustCount;
window.setCountPreset = setCountPreset;
window.updateSimplePreview = updateSimplePreview;
window.validateSpecificPcInput = validateSpecificPcInput;
window.submitAddPc = submitAddPc;
