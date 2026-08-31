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
   * Renders PC cards and the Add PC button card into #dynamicPCGrid with selection mode support.
   * @param {Array} pcs - Array of PC objects for the current room
   * @param {HTMLElement} [targetElement] - Target grid element
   * @param {Object} [options] - Action callbacks and selection state { roomId, onAddPC, onDeletePC, onGenerateQR, isSelectionMode, selectedPcIds, onToggleSelectPC }
   */
  function renderPCGrid(pcs, targetElement, options = {}) {
    const grid = targetElement || document.getElementById('dynamicPCGrid');
    if (!grid) return;

    const pcList = Array.isArray(pcs) ? pcs : [];
    const isSelectionMode = !!options.isSelectionMode;
    const selectedPcIds = options.selectedPcIds || new Set();
    const selCount = selectedPcIds.size || 0;
    const selIdsStr = Array.from(selectedPcIds).sort().join(',');

    const signature = `${options.roomId || ''}::${isSelectionMode ? 'SEL' : 'NORM'}::${selCount}::${selIdsStr}::` + computePCGridSignature(pcList);
    if (grid._lastRenderSignature === signature) {
      return; // Unchanged data & selection, skip DOM write and icon re-creation
    }
    grid._lastRenderSignature = signature;

    // Attach delegated click listener once per grid element (CSP-compliant)
    if (!grid._delegationAttached) {
      grid._delegationAttached = true;
      grid.addEventListener('click', (e) => {
        const activeOpts = grid._callbacks || {};

        // In selection mode, clicking on a PC card (or checkbox) toggles its selection
        if (activeOpts.isSelectionMode) {
          const pcCard = e.target.closest('.pc-qr-card');
          if (pcCard) {
            e.preventDefault();
            e.stopPropagation();
            const pcId = pcCard.getAttribute('data-pc-id');
            if (pcId) {
              const cb = activeOpts.onToggleSelectPC;
              if (typeof cb === 'function') cb(pcId);
              else if (typeof global.toggleSelectPC === 'function') global.toggleSelectPC(pcId);
            }
            return;
          }
        }

        // Generate QR button (disabled in selection mode)
        const qrBtn = e.target.closest('.pc-qr-btn[data-action="generate-qr"]');
        if (qrBtn) {
          e.preventDefault();
          e.stopPropagation();
          const pcId = qrBtn.getAttribute('data-pc-id');
          if (pcId) {
            const cb = activeOpts.onGenerateQR;
            if (typeof cb === 'function') cb(pcId);
            else if (typeof global.generateQR === 'function') global.generateQR(pcId);
          }
          return;
        }

        // Delete PC button (disabled in selection mode)
        const delBtn = e.target.closest('.delete-pc-btn[data-action="delete-pc"]');
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          const pcId = delBtn.getAttribute('data-pc-id');
          const pcNumber = delBtn.getAttribute('data-pc-number');
          if (pcId) {
            const cb = activeOpts.onDeletePC;
            if (typeof cb === 'function') cb(pcId, pcNumber);
            else if (typeof global.deletePC === 'function') global.deletePC(pcId, pcNumber);
          }
          return;
        }
      });
    }

    // Store latest callbacks and selection state for delegated listener to reference
    grid._callbacks = {
      isSelectionMode,
      onDeletePC: options.onDeletePC,
      onGenerateQR: options.onGenerateQR,
      onToggleSelectPC: options.onToggleSelectPC
    };

    grid.innerHTML = '';

    pcList.forEach(pc => {
      const pcIdStr = String(pc.PC_ID);
      const isSelected = selectedPcIds.has(pcIdStr) || selectedPcIds.has(pc.PC_ID);

      const card = document.createElement('div');
      card.className = 'pc-qr-card' + (isSelectionMode ? ' in-selection-mode' : '') + (isSelected ? ' is-selected' : '');
      card.setAttribute('data-pc-id', pc.PC_ID);
      card.style.position = 'relative';

      if (isSelectionMode) {
        // Selection checkbox badge
        const chk = document.createElement('div');
        chk.className = 'pc-card-checkbox';
        chk.setAttribute('aria-label', `Select PC ${pc.PC_Number}`);
        chk.innerHTML = '<i data-lucide="check"></i>';
        card.appendChild(chk);
      } else {
        // Delete button (authorized for MIS Staff and IT Head)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-pc-btn';
        deleteBtn.setAttribute('type', 'button');
        deleteBtn.setAttribute('data-action', 'delete-pc');
        deleteBtn.setAttribute('data-pc-id', pc.PC_ID);
        deleteBtn.setAttribute('data-pc-number', pc.PC_Number);
        deleteBtn.setAttribute('title', `Delete PC ${pc.PC_Number}`);
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        card.appendChild(deleteBtn);
      }

      // PC title
      const title = document.createElement('div');
      title.className = 'pc-qr-title';
      title.textContent = `PC ${pc.PC_Number}`;
      card.appendChild(title);

      if (!isSelectionMode) {
        // Generate QR button (CSP-compliant without inline onclick)
        const qrBtn = document.createElement('button');
        qrBtn.className = 'pc-qr-btn';
        qrBtn.setAttribute('type', 'button');
        qrBtn.setAttribute('data-action', 'generate-qr');
        qrBtn.setAttribute('data-pc-id', pc.PC_ID);
        qrBtn.innerHTML = '<i data-lucide="qr-code" style="width: 14px; height: 14px;"></i> Generate QR';
        card.appendChild(qrBtn);
      } else {
        // In selection mode: visual status label
        const selLabel = document.createElement('div');
        selLabel.style.cssText = `font-size: 12px; font-weight: 700; color: ${isSelected ? 'var(--primary-teal, #1EBBD7)' : 'var(--text-light, #94a3b8)'}; display: flex; align-items: center; gap: 4px;`;
        selLabel.textContent = isSelected ? '✓ Selected' : 'Click to select';
        card.appendChild(selLabel);
      }

      grid.appendChild(card);
    });

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
