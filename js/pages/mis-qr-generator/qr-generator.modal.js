/**
 * LabSync – MIS Add PC Modal Controller  |  js/pages/mis-qr-generator/qr-generator.modal.js
 * Encapsulates the Add PC Multi-Mode modal (Quick Add stepper & Specific PC duplicate validation).
 */

(function (global) {
  'use strict';

  let _isCustomMode = false;
  let _pendingAddRoomId = null;
  let _currentRoomNumber = null;
  let _currentPCs = [];

  /**
   * Parses comma-separated and range strings (e.g. "1-10", "1 to 30") into a sorted array of unique PC numbers.
   * @param {string} inputStr
   * @returns {Array<string>}
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
    _isCustomMode = (mode === 'custom');
    const tabSimple = document.getElementById('tabModeSimple');
    const tabCustom = document.getElementById('tabModeCustom');
    const simpleSection = document.getElementById('addPcSimpleSection');
    const customSection = document.getElementById('addPcCustomSection');
    const submitBtn = document.getElementById('submitAddPcBtn');

    if (_isCustomMode) {
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
    if (global.lucide && modalOverlay) global.lucide.createIcons({ root: modalOverlay });
  }

  /**
   * Opens the Add PC Modal and initializes start number & mode.
   * @param {number|string} roomId
   * @param {string|number} [roomNumber]
   * @param {Array} [existingPCs]
   */
  function openAddPcModal(roomId, roomNumber, existingPCs = []) {
    _pendingAddRoomId = roomId;
    _currentRoomNumber = roomNumber || '';
    _currentPCs = Array.isArray(existingPCs) ? existingPCs : [];

    const newPcInput = document.getElementById('newPcNumberInput');
    if (newPcInput) newPcInput.value = '';

    let highestNum = 0;
    if (_currentPCs && _currentPCs.length > 0) {
      _currentPCs.forEach(p => {
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
    if (subtitle && _currentRoomNumber) {
      subtitle.textContent = `Room ${_currentRoomNumber} • Currently has ${_currentPCs.length} PC(s)`;
    }

    selectAddMode('simple');
    const modalOverlay = document.getElementById('addPcModalOverlay');
    if (modalOverlay) modalOverlay.style.display = 'flex';
    if (global.lucide && modalOverlay) global.lucide.createIcons({ root: modalOverlay });
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
    selectAddMode(_isCustomMode ? 'simple' : 'custom');
  }

  /**
   * Closes Add PC Modal and resets pending room state.
   */
  function closeAddPcModal() {
    const modalOverlay = document.getElementById('addPcModalOverlay');
    if (modalOverlay) modalOverlay.style.display = 'none';
    _pendingAddRoomId = null;
  }

  /**
   * Validates specific PC number input for custom add mode.
   * @param {Array} [pcsList] - Optional PC list override
   * @returns {boolean} True if valid/non-duplicate
   */
  function validateSpecificPcInput(pcsList) {
    const inputEl = document.getElementById('newPcNumberInput');
    const errorEl = document.getElementById('specificPcErrorMsg');
    const errorTextEl = document.getElementById('specificPcErrorText');
    const submitBtn = document.getElementById('submitAddPcBtn');

    if (!inputEl || !_isCustomMode) return true;

    const val = inputEl.value.trim();
    if (!val) {
      if (errorEl) errorEl.style.display = 'none';
      inputEl.style.borderColor = 'var(--border-light)';
      if (submitBtn) submitBtn.disabled = false;
      return true;
    }

    const pcsToCheck = Array.isArray(pcsList) ? pcsList : _currentPCs;
    const existingMatch = pcsToCheck && pcsToCheck.find(pc => pc.PC_Number.toString().trim() === val);

    if (existingMatch) {
      if (errorTextEl) errorTextEl.textContent = `PC ${val} already exists in Room ${_currentRoomNumber || ''}. Please enter a unique PC number.`;
      if (errorEl) {
        errorEl.style.display = 'flex';
        if (global.lucide) global.lucide.createIcons({ root: errorEl });
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
   * @param {Object} [options] - Optional overrides { roomId, onSuccess }
   */
  async function submitAddPc(options = {}) {
    let pcNumbers = [];

    if (!_isCustomMode) {
      const countInput = document.getElementById('pcCountInput');
      const count = parseInt(countInput?.value, 10) || 0;
      const startNum = parseInt(countInput?.dataset?.startNum, 10) || 1;

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
      const rawVal = document.getElementById('newPcNumberInput')?.value?.trim();
      const pcNum = parseInt(rawVal, 10);
      if (isNaN(pcNum) || pcNum <= 0) {
        alert('Please enter a valid PC number.');
        return;
      }
      pcNumbers = [pcNum.toString()];
    }

    const roomId = options.roomId || _pendingAddRoomId;
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
      const actions = global.qrGeneratorActions;
      let result = null;

      if (actions && typeof actions.submitAddPCs === 'function') {
        result = await actions.submitAddPCs(roomId, pcNumbers);
      } else {
        const response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs/add-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ pcNumbers })
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to add PCs');
        }
        result = await response.json();
      }

      closeAddPcModal();

      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function' && result && result.message) {
        toastFn(result.message);
      }

      if (typeof options.onSuccess === 'function') {
        await options.onSuccess(roomId);
      } else if (typeof global.loadPCs === 'function') {
        await global.loadPCs(roomId);
      }
    } catch (error) {
      console.error('[QRModal] Error adding PCs:', error);
      alert(error.message || 'Failed to add PCs');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add PCs';
      }
    }
  }

  const qrGeneratorModal = {
    parsePcInputString,
    selectAddMode,
    openAddPcModal,
    adjustCount,
    setCountPreset,
    updateSimplePreview,
    toggleCustomListInput,
    closeAddPcModal,
    validateSpecificPcInput,
    submitAddPc
  };

  global.qrGeneratorModal = qrGeneratorModal;

})(typeof window !== 'undefined' ? window : this);
