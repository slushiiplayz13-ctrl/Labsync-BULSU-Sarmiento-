/* ================================================================
   LabSync – MIS PC & QR Management Coordinator  |  js/pages/mis-qr-generator.js
   Coordinating view switching, room/PC state, and modular subcomponents:
     - js/pages/mis-qr-generator/qr-generator.print.js
     - js/pages/mis-qr-generator/qr-generator.renderer.js
     - js/pages/mis-qr-generator/qr-generator.actions.js
     - js/pages/mis-qr-generator/qr-generator.modal.js
   ================================================================ */

'use strict';

(function (global) {
  // Page-local state
  let currentRoomId = null;
  let currentRoomNumber = null;
  let currentPCs = [];
  let allRooms = [];
  let isSelectionMode = false;
  let selectedPcIds = new Set();

  /**
   * Switches view to PC Grid for selected room.
   * @param {number|string} roomId
   * @param {string|number} roomNumber
   */
  function showPCGrid(roomId, roomNumber) {
    currentRoomId = roomId;
    currentRoomNumber = roomNumber;
    exitSelectionMode();

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
    exitSelectionMode();
    const roomView = document.getElementById('roomSelectionView');
    const pcView = document.getElementById('pcGridView');

    if (roomView) roomView.style.display = 'block';
    if (pcView) pcView.style.display = 'none';
    currentRoomId = null;
    currentRoomNumber = null;
    currentPCs = [];
  }

  /**
   * Renders the PC grid with the current selection state.
   */
  function refreshPCGridView() {
    const renderer = global.qrGeneratorRenderer;
    if (renderer && typeof renderer.renderPCGrid === 'function') {
      renderer.renderPCGrid(currentPCs, null, {
        roomId: currentRoomId,
        isSelectionMode,
        selectedPcIds,
        onAddPC: (rId) => handleAddPC(rId),
        onDeletePC: (pcId) => handleDeletePC(pcId),
        onGenerateQR: (pcId) => handleGenerateQR(pcId),
        onToggleSelectPC: (pcId) => handleToggleSelectPC(pcId)
      });
    }
    updateBulkActionBarUI();
  }

  /**
   * Fetches PCs for a given room ID with SWR cache hydration and race-condition guards.
   * @param {number|string} roomId
   */
  async function loadPCs(roomId) {
    const requestedRoomId = String(roomId);
    const renderer = global.qrGeneratorRenderer;
    const actions = global.qrGeneratorActions;

    // 1. SWR Cache check: If room PCs exist in cache, immediately render them without loading placeholder
    const cachedPCs = (actions && typeof actions.getCachedRoomPCs === 'function')
      ? actions.getCachedRoomPCs(roomId)
      : null;

    if (Array.isArray(cachedPCs) && cachedPCs.length > 0) {
      currentPCs = cachedPCs;
      refreshPCGridView();
    } else {
      // 2. First visit with no cache: Render layout-preserving skeleton grid only if we have no existing PCs in view
      if ((!Array.isArray(currentPCs) || currentPCs.length === 0) && renderer && typeof renderer.renderPCGridLoading === 'function') {
        renderer.renderPCGridLoading();
      }
    }

    // 3. Fetch fresh PCs in background
    try {
      let freshPCs = null;
      if (actions && typeof actions.fetchRoomPCs === 'function') {
        freshPCs = await actions.fetchRoomPCs(roomId);
      } else {
        const response = await fetch(`/api/laboratories/${encodeURIComponent(roomId)}/pcs`, { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load PCs');
        freshPCs = await response.json();
      }

      // 4. Stale-response guard: do NOT render if user already switched to another room or went back
      if (String(currentRoomId) !== requestedRoomId) {
        return;
      }

      if (Array.isArray(freshPCs)) {
        currentPCs = freshPCs;
        if (actions && typeof actions.cacheRoomPCs === 'function') {
          actions.cacheRoomPCs(roomId, freshPCs);
        }
        refreshPCGridView();
      }
    } catch (error) {
      console.error('[MISQRGenerator] Error loading PCs:', error);
      if (String(currentRoomId) !== requestedRoomId) return;
      if (!Array.isArray(currentPCs) || currentPCs.length === 0) {
        if (renderer && typeof renderer.renderPCGridError === 'function') {
          renderer.renderPCGridError();
        }
      }
    }
  }

  /**
   * Primary loader function fetching lab rooms and building room cards.
   */
  async function loadRooms() {
    const renderer = global.qrGeneratorRenderer;

    try {
      const fetchLabsFn = (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function')
        ? global.laboratoryService.fetchLaboratories
        : (typeof global.fetchLaboratories === 'function' ? global.fetchLaboratories : null);

      let rooms = [];
      if (typeof fetchLabsFn === 'function') {
        rooms = await fetchLabsFn();
      } else {
        const response = await fetch('/api/laboratories', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load rooms');
        rooms = await response.json();
      }

      allRooms = Array.isArray(rooms) ? rooms : [];

      if (renderer && typeof renderer.renderRoomGrid === 'function') {
        renderer.renderRoomGrid(allRooms, null, (roomId, roomNumber) => showPCGrid(roomId, roomNumber));
      }
    } catch (error) {
      console.error('[MISQRGenerator] Error loading rooms:', error);
      const grid = document.getElementById('dynamicRoomGrid');
      const hasCards = grid && grid.querySelector('.room-select-card');
      if (!hasCards && renderer && typeof renderer.renderRoomGridError === 'function') {
        renderer.renderRoomGridError();
      }
    }
  }

  /**
   * Toggles selection mode on/off.
   */
  function toggleSelectionMode() {
    if (isSelectionMode) {
      exitSelectionMode();
    } else {
      isSelectionMode = true;
      selectedPcIds.clear();
      updateModeButtonUI();
      updateBulkActionBarUI();
      refreshPCGridView();
    }
  }

  /**
   * Exits selection mode and clears selections.
   */
  function exitSelectionMode() {
    isSelectionMode = false;
    selectedPcIds.clear();
    updateModeButtonUI();
    updateBulkActionBarUI();
    refreshPCGridView();
  }

  /**
   * Updates the toggle selection button styling and text.
   */
  function updateModeButtonUI() {
    const btn = document.getElementById('btnToggleSelectionMode');
    const textSpan = document.getElementById('btnToggleSelectionModeText');
    if (btn) {
      if (isSelectionMode) {
        btn.classList.add('active');
        if (textSpan) textSpan.textContent = 'Cancel Selection';
      } else {
        btn.classList.remove('active');
        if (textSpan) textSpan.textContent = 'Select PCs';
      }
    }
  }

  /**
   * Toggles selection of a specific PC.
   * @param {string|number} pcId
   */
  function handleToggleSelectPC(pcId) {
    const idStr = String(pcId);
    if (selectedPcIds.has(idStr)) {
      selectedPcIds.delete(idStr);
    } else {
      selectedPcIds.add(idStr);
    }
    refreshPCGridView();
  }

  /**
   * Toggles select all / deselect all visible PCs in current room.
   */
  function handleToggleSelectAll() {
    const totalVisible = Array.isArray(currentPCs) ? currentPCs.length : 0;
    if (totalVisible === 0) return;

    if (selectedPcIds.size === totalVisible) {
      // All selected -> deselect all
      selectedPcIds.clear();
    } else {
      // Not all selected -> select all
      selectedPcIds.clear();
      currentPCs.forEach(pc => selectedPcIds.add(String(pc.PC_ID)));
    }
    refreshPCGridView();
  }

  /**
   * Updates floating bulk action bar counters and visibility.
   */
  function updateBulkActionBarUI() {
    const bar = document.getElementById('pcBulkActionBar');
    const badge = document.getElementById('pcBulkSelectedBadge');
    const selectAllText = document.getElementById('btnBulkSelectAllText');
    const count = selectedPcIds.size;
    const totalVisible = Array.isArray(currentPCs) ? currentPCs.length : 0;

    if (!bar) return;

    if (isSelectionMode) {
      bar.style.display = 'flex';
      if (badge) badge.textContent = `${count} Selected`;
      if (selectAllText) {
        selectAllText.textContent = (count === totalVisible && totalVisible > 0) ? 'Deselect All' : 'Select All';
      }

      // Disable/enable action buttons based on selection count
      const btnDel = document.getElementById('btnBulkDeletePCs');
      const btnPrint = document.getElementById('btnBulkPrintQR');
      if (btnDel) {
        btnDel.style.opacity = count > 0 ? '1' : '0.5';
        btnDel.style.pointerEvents = count > 0 ? 'auto' : 'none';
      }
      if (btnPrint) {
        btnPrint.style.opacity = count > 0 ? '1' : '0.5';
        btnPrint.style.pointerEvents = count > 0 ? 'auto' : 'none';
      }
    } else {
      bar.style.display = 'none';
    }

    if (global.lucide && bar) global.lucide.createIcons({ root: bar });
  }

  /**
   * Opens the custom Bulk Delete confirmation modal with PC unit preview.
   */
  function openBulkDeleteModal() {
    if (selectedPcIds.size === 0) {
      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn('Please select at least one PC to delete.', 'warning');
      } else {
        alert('Please select at least one PC to delete.');
      }
      return;
    }

    const modal = document.getElementById('bulkDeleteModalOverlay');
    const countSpan = document.getElementById('bulkDeleteCountSpan');
    const previewDiv = document.getElementById('bulkDeleteUnitsPreview');

    const selectedUnits = currentPCs
      .filter(p => selectedPcIds.has(String(p.PC_ID)))
      .map(p => `PC ${p.PC_Number}`);

    if (countSpan) countSpan.textContent = selectedPcIds.size.toString();
    if (previewDiv) {
      previewDiv.textContent = selectedUnits.join(', ') || `${selectedPcIds.size} unit(s)`;
    }

    if (modal) {
      modal.style.display = 'flex';
      if (global.setModalOpenState) global.setModalOpenState(true);
      modal.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      modal.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }
    if (global.lucide && modal) global.lucide.createIcons({ root: modal });
  }

  /**
   * Closes the Bulk Delete modal.
   */
  function closeBulkDeleteModal() {
    const modal = document.getElementById('bulkDeleteModalOverlay');
    if (modal) {
      modal.style.display = 'none';
      if (global.setModalOpenState) global.setModalOpenState(false);
    }
  }

  /**
   * Executes the bulk deletion after user confirms in the modal.
   */
  async function confirmBulkDelete() {
    const actions = global.qrGeneratorActions;
    const confirmBtn = document.getElementById('btnConfirmBulkDelete');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';
    }

    try {
      const pcIdsArray = Array.from(selectedPcIds);
      if (actions && typeof actions.deletePCsBulk === 'function') {
        await actions.deletePCsBulk(currentRoomId, pcIdsArray, () => {
          selectedPcIds.clear();
          loadPCs(currentRoomId);
        });
      }
      closeBulkDeleteModal();
    } catch (err) {
      console.error('[MISQRGenerator] Error in bulk delete:', err);
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Delete PCs';
      }
    }
  }

  /**
   * Prints QR codes for selected PCs.
   */
  function handleBulkPrintQR() {
    if (selectedPcIds.size === 0) {
      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn('Please select at least one PC to print.', 'warning');
      } else {
        alert('Please select at least one PC to print.');
      }
      return;
    }

    const print = global.qrGeneratorPrint;
    if (print && typeof print.generateSelectedQR === 'function') {
      print.generateSelectedQR(currentRoomId, selectedPcIds, currentPCs);
    }
  }

  /**
   * Opens Add PC modal for current room.
   * @param {number|string} [roomId]
   */
  function handleAddPC(roomId) {
    const modal = global.qrGeneratorModal;
    if (modal && typeof modal.openAddPcModal === 'function') {
      modal.openAddPcModal(roomId || currentRoomId, currentRoomNumber, currentPCs);
    }
  }

  /**
   * Deletes a PC unit and refreshes the current PC grid.
   * @param {number|string} pcId
   * @param {string|number} [pcNumber]
   */
  function handleDeletePC(pcId, pcNumber) {
    const actions = global.qrGeneratorActions;
    if (actions && typeof actions.deletePCUnit === 'function') {
      let resolvedNumber = pcNumber;
      if (!resolvedNumber && Array.isArray(currentPCs)) {
        const found = currentPCs.find(p => String(p.PC_ID) === String(pcId));
        if (found) resolvedNumber = found.PC_Number;
      }
      actions.deletePCUnit(pcId, () => loadPCs(currentRoomId), currentRoomId, resolvedNumber);
    }
  }

  /**
   * Generates a single PC QR printable sticker.
   * @param {number|string} pcId
   */
  function handleGenerateQR(pcId) {
    const print = global.qrGeneratorPrint;
    if (print && typeof print.generateQR === 'function') {
      print.generateQR(pcId);
    }
  }

  /**
   * Generates batch QR printable stickers for all PCs in the active room.
   */
  function handleGenerateAllQR() {
    const print = global.qrGeneratorPrint;
    if (print && typeof print.generateAllQR === 'function') {
      print.generateAllQR(currentRoomId, currentPCs);
    }
  }

  /**
   * Submits Add PC form and reloads current room PCs upon success.
   */
  function handleSubmitAddPc() {
    const modal = global.qrGeneratorModal;
    const actions = global.qrGeneratorActions;
    if (modal && typeof modal.submitAddPc === 'function') {
      modal.submitAddPc({
        roomId: currentRoomId,
        onSuccess: () => {
          if (actions && typeof actions.invalidateCachedRoomPCs === 'function') {
            actions.invalidateCachedRoomPCs(currentRoomId);
          }
          loadPCs(currentRoomId);
        }
      });
    }
  }

  let _pageDelegationInitialized = false;

  /**
   * Initializes page-level delegated click listeners and triggers room load.
   */
  function initMISQRGeneratorPage() {
    if (!_pageDelegationInitialized) {
      _pageDelegationInitialized = true;

      // Delegated listener for Return / Back, Selection toggle, Header Add, Bulk actions
      document.addEventListener('click', (e) => {
        // Return to rooms
        const backBtn = e.target.closest('.back-btn, [data-action="return-to-rooms"]');
        if (backBtn) {
          e.preventDefault();
          showRoomSelection();
          return;
        }

        // Header Add PCs
        const headerAddBtn = e.target.closest('#btnHeaderAddPc, [data-action="header-add-pc"]');
        if (headerAddBtn) {
          e.preventDefault();
          handleAddPC(currentRoomId);
          return;
        }

        // Toggle Selection Mode
        const toggleSelBtn = e.target.closest('#btnToggleSelectionMode, [data-action="toggle-selection-mode"]');
        if (toggleSelBtn) {
          e.preventDefault();
          toggleSelectionMode();
          return;
        }

        // Cancel / Done Selection
        const cancelSelBtn = e.target.closest('[data-action="cancel-selection-mode"]');
        if (cancelSelBtn) {
          e.preventDefault();
          exitSelectionMode();
          return;
        }

        // Bulk Select / Deselect All
        const selectAllBtn = e.target.closest('[data-action="bulk-toggle-select-all"]');
        if (selectAllBtn) {
          e.preventDefault();
          handleToggleSelectAll();
          return;
        }

        // Bulk Print QRs
        const bulkPrintBtn = e.target.closest('[data-action="bulk-print-qr"]');
        if (bulkPrintBtn) {
          e.preventDefault();
          handleBulkPrintQR();
          return;
        }

        // Bulk Delete trigger
        const bulkDelBtn = e.target.closest('[data-action="bulk-delete-pcs"]');
        if (bulkDelBtn) {
          e.preventDefault();
          openBulkDeleteModal();
          return;
        }

        // Close bulk delete modal
        const closeBulkDelBtn = e.target.closest('[data-action="close-bulk-delete-modal"]');
        if (closeBulkDelBtn) {
          e.preventDefault();
          closeBulkDeleteModal();
          return;
        }

        // Confirm bulk delete
        const confirmBulkDelBtn = e.target.closest('[data-action="confirm-bulk-delete"]');
        if (confirmBulkDelBtn) {
          e.preventDefault();
          confirmBulkDelete();
          return;
        }

        // Generate All QR
        const genAllBtn = e.target.closest('.generate-all-btn, [data-action="generate-all-qr"]');
        if (genAllBtn) {
          e.preventDefault();
          handleGenerateAllQR();
          return;
        }
      });
    }

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

  // Global compatibility bridges for inline HTML handlers
  global.showPCGrid = showPCGrid;
  global.showRoomSelection = showRoomSelection;
  global.loadRooms = loadRooms;
  global.loadPCs = loadPCs;
  global.deletePC = handleDeletePC;
  global.generateQR = handleGenerateQR;
  global.generateAllQR = handleGenerateAllQR;
  global.addPC = handleAddPC;
  global.toggleSelectPC = handleToggleSelectPC;
  global.toggleSelectionMode = toggleSelectionMode;
  global.closeAddPcModal = () => global.qrGeneratorModal?.closeAddPcModal();
  global.selectAddMode = (mode) => global.qrGeneratorModal?.selectAddMode(mode);
  global.adjustCount = (delta) => global.qrGeneratorModal?.adjustCount(delta);
  global.setCountPreset = (num) => global.qrGeneratorModal?.setCountPreset(num);
  global.updateSimplePreview = () => global.qrGeneratorModal?.updateSimplePreview();
  global.validateSpecificPcInput = () => global.qrGeneratorModal?.validateSpecificPcInput(currentPCs);
  global.submitAddPc = handleSubmitAddPc;
  global.openBulkDeleteModal = openBulkDeleteModal;
  global.closeBulkDeleteModal = closeBulkDeleteModal;
  global.confirmBulkDelete = confirmBulkDelete;

})(typeof window !== 'undefined' ? window : this);
