/**
 * LabSync – MIS QR Generator Renderer  |  js/pages/mis-qr-generator/qr-generator.renderer.js
 * Pure presentation layer for rendering Room Selection cards and PC Grid cards.
 */

(function (global) {
  'use strict';

  /**
   * Computes a deterministic signature of the room list.
   * @param {Array} rooms
   * @returns {string}
   */
  function computeRoomGridSignature(rooms) {
    if (!Array.isArray(rooms) || rooms.length === 0) return 'empty';
    return rooms.map(r => `${r.Room_ID}_${r.Room_Number}_${r.Building || ''}`).join('|');
  }

  /**
   * Computes a deterministic signature of the PC list.
   * @param {Array} pcs
   * @returns {string}
   */
  function computePCGridSignature(pcs) {
    if (!Array.isArray(pcs) || pcs.length === 0) return 'empty';
    return pcs.map(p => `${p.PC_ID}_${p.PC_Number}`).join('|');
  }

  /**
   * Renders room selection cards into #dynamicRoomGrid.
   * @param {Array} rooms - Array of laboratory room objects
   * @param {HTMLElement} [targetElement] - Target container element
   * @param {Function} [onSelectRoom] - Callback when a room card is clicked
   */
  function renderRoomGrid(rooms, targetElement, onSelectRoom) {
    const grid = targetElement || document.getElementById('dynamicRoomGrid');
    if (!grid) return;

    if (!Array.isArray(rooms) || rooms.length === 0) {
      const sig = 'empty';
      if (grid._lastRenderSignature === sig) return;
      grid._lastRenderSignature = sig;
      grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-mid);">No rooms available. Please wait for the IT Dept Head to add rooms.</div>';
      return;
    }

    const signature = computeRoomGridSignature(rooms);
    if (grid._lastRenderSignature === signature) {
      return; // Unchanged data, skip DOM write and icon re-creation
    }
    grid._lastRenderSignature = signature;

    grid.innerHTML = '';
    rooms.forEach(room => {
      const card = document.createElement('div');
      card.className = 'room-select-card';
      card.onclick = () => {
        if (typeof onSelectRoom === 'function') {
          onSelectRoom(room.Room_ID, room.Room_Number);
        } else if (typeof global.showPCGrid === 'function') {
          global.showPCGrid(room.Room_ID, room.Room_Number);
        }
      };

      card.innerHTML = `
        <div class="rsc-icon">${room.Room_Number}</div>
        <div class="rsc-title">Room ${room.Room_Number}</div>
        <div class="rsc-subtitle">${room.Building || 'Unknown Building'}</div>
      `;
      grid.appendChild(card);
    });

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: grid });
    }
  }

  /**
   * Renders error state for room selection grid.
   * @param {string} [message]
   * @param {HTMLElement} [targetElement]
   */
  function renderRoomGridError(message, targetElement) {
    const grid = targetElement || document.getElementById('dynamicRoomGrid');
    if (!grid) return;
    grid._lastRenderSignature = null;
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #EF4444;">${message || 'Failed to load rooms. Please try again later.'}</div>`;
  }

  /**
   * Renders PC cards and the Add PC button card into #dynamicPCGrid.
   * @param {Array} pcs - Array of PC objects for the current room
   * @param {HTMLElement} [targetElement] - Target grid element
   * @param {Object} [options] - Action callbacks { roomId, onAddPC, onDeletePC, onGenerateQR }
   */
  function renderPCGrid(pcs, targetElement, options = {}) {
    const grid = targetElement || document.getElementById('dynamicPCGrid');
    if (!grid) return;

    const pcList = Array.isArray(pcs) ? pcs : [];
    const signature = `${options.roomId || ''}::` + computePCGridSignature(pcList);
    if (grid._lastRenderSignature === signature) {
      return; // Unchanged data, skip DOM write and icon re-creation
    }
    grid._lastRenderSignature = signature;

    grid.innerHTML = '';

    pcList.forEach(pc => {
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
    addCard.onclick = () => {
      if (typeof options.onAddPC === 'function') {
        options.onAddPC(options.roomId);
      } else if (typeof global.addPC === 'function') {
        global.addPC(options.roomId);
      }
    };
    addCard.innerHTML = `
      <div style="background: transparent; color: var(--primary-teal); border: 2px dashed var(--primary-teal); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
        <i data-lucide="plus" style="width: 24px; height: 24px;"></i>
      </div>
      <div class="pc-qr-title" style="font-size: 18px; color: var(--primary-teal);">Add PC</div>
    `;
    grid.appendChild(addCard);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: grid });
    }
  }

  /**
   * Renders a layout-preserving skeleton loading state in PC grid.
   * @param {HTMLElement} [targetElement]
   */
  function renderPCGridLoading(targetElement) {
    const grid = targetElement || document.getElementById('dynamicPCGrid');
    if (!grid) return;
    if (grid._lastRenderSignature === '__LOADING__') return;
    grid._lastRenderSignature = '__LOADING__';

    const skeletonCards = Array.from({ length: 10 }).map(() => `
      <div class="pc-qr-card" style="min-height: 125px; opacity: 0.5; pointer-events: none; justify-content: space-between;">
        <div style="width: 24px; height: 24px; background: var(--border-light, #f1f5f9); border-radius: 6px; align-self: flex-end;"></div>
        <div style="width: 65px; height: 22px; background: var(--border-light, #f1f5f9); border-radius: 8px;"></div>
        <div style="width: 100%; height: 32px; background: var(--border-light, #f1f5f9); border-radius: 10px;"></div>
      </div>
    `).join('');

    grid.innerHTML = skeletonCards;
  }

  /**
   * Renders error state in PC grid.
   * @param {string} [message]
   * @param {HTMLElement} [targetElement]
   */
  function renderPCGridError(message, targetElement) {
    const grid = targetElement || document.getElementById('dynamicPCGrid');
    if (grid) {
      grid._lastRenderSignature = null;
      grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #EF4444; font-weight: 600;">${message || 'Failed to load PCs'}</div>`;
    }
  }

  const qrGeneratorRenderer = {
    renderRoomGrid,
    renderRoomGridError,
    renderPCGrid,
    renderPCGridLoading,
    renderPCGridError
  };

  global.qrGeneratorRenderer = qrGeneratorRenderer;

})(typeof window !== 'undefined' ? window : this);
