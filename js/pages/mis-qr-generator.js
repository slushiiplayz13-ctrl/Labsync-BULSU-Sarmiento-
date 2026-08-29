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

  /**
   * Switches view to PC Grid for selected room.
   * @param {number|string} roomId
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
   * Fetches PCs for a given room ID with SWR cache hydration and race-condition guards.
   * @param {number|string} roomId
   */
  async function loadPCs(roomId) {
    const requestedRoomId = roomId;
    const renderer = global.qrGeneratorRenderer;
    const actions = global.qrGeneratorActions;

    // 1. SWR Cache check: If room PCs exist in cache, immediately render them without loading placeholder
    const cachedPCs = (actions && typeof actions.getCachedRoomPCs === 'function')
      ? actions.getCachedRoomPCs(roomId)
      : null;

    if (Array.isArray(cachedPCs)) {
      currentPCs = cachedPCs;
      if (renderer && typeof renderer.renderPCGrid === 'function') {
        renderer.renderPCGrid(currentPCs, null, {
          roomId: roomId,
          onAddPC: (rId) => handleAddPC(rId),
          onDeletePC: (pcId) => handleDeletePC(pcId),
          onGenerateQR: (pcId) => handleGenerateQR(pcId)
        });
      }
    } else {
      // 2. First visit with no cache: Render layout-preserving skeleton grid (never a tiny collapsed text box)
      if (renderer && typeof renderer.renderPCGridLoading === 'function') {
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
      if (currentRoomId !== requestedRoomId) {
        return;
      }

      if (Array.isArray(freshPCs)) {
        currentPCs = freshPCs;
        if (actions && typeof actions.cacheRoomPCs === 'function') {
          actions.cacheRoomPCs(roomId, freshPCs);
        }
        if (renderer && typeof renderer.renderPCGrid === 'function') {
          renderer.renderPCGrid(currentPCs, null, {
            roomId: currentRoomId,
            onAddPC: (rId) => handleAddPC(rId),
            onDeletePC: (pcId) => handleDeletePC(pcId),
            onGenerateQR: (pcId) => handleGenerateQR(pcId)
          });
        }
      }
    } catch (error) {
      console.error('[MISQRGenerator] Error loading PCs:', error);
      if (currentRoomId !== requestedRoomId) return;
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

      if (renderer && typeof renderer.renderRoomGrid === 'function') {
        renderer.renderRoomGrid(rooms, null, (roomId, roomNumber) => showPCGrid(roomId, roomNumber));
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
   */
  function handleDeletePC(pcId) {
    const actions = global.qrGeneratorActions;
    if (actions && typeof actions.deletePCUnit === 'function') {
      actions.deletePCUnit(pcId, () => loadPCs(currentRoomId), currentRoomId);
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

  // Global compatibility bridges for inline HTML handlers
  global.showPCGrid = showPCGrid;
  global.showRoomSelection = showRoomSelection;
  global.loadRooms = loadRooms;
  global.loadPCs = loadPCs;
  global.deletePC = handleDeletePC;
  global.generateQR = handleGenerateQR;
  global.generateAllQR = handleGenerateAllQR;
  global.addPC = handleAddPC;
  global.closeAddPcModal = () => global.qrGeneratorModal?.closeAddPcModal();
  global.selectAddMode = (mode) => global.qrGeneratorModal?.selectAddMode(mode);
  global.adjustCount = (delta) => global.qrGeneratorModal?.adjustCount(delta);
  global.setCountPreset = (num) => global.qrGeneratorModal?.setCountPreset(num);
  global.updateSimplePreview = () => global.qrGeneratorModal?.updateSimplePreview();
  global.validateSpecificPcInput = () => global.qrGeneratorModal?.validateSpecificPcInput(currentPCs);
  global.submitAddPc = handleSubmitAddPc;

})(typeof window !== 'undefined' ? window : this);
