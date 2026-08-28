/**
 * LabSync Tray Block Renderer | js/scheduling/rendering/tray-block.renderer.js
 * Manages the creation, deletion, counter badges, and empty-state lifecycle of available subject tray blocks.
 */

(function (global) {
  'use strict';

  /**
   * Updates the counter badge for available blocks in the sidebar tray.
   */
  function updateBlockCount() {
    const blocksContainer = document.getElementById('blocks-container');
    const availableCount = document.getElementById('available-count');
    if (!blocksContainer || !availableCount) return;

    const count = blocksContainer.querySelectorAll('.schedule-block').length;
    availableCount.textContent = count;

    let emptyMsg = document.getElementById('no-blocks-msg');
    if (count === 0) {
      if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.id = 'no-blocks-msg';
        emptyMsg.className = 'ui-empty-state';
        emptyMsg.style.cssText = 'padding: 24px 12px; margin: 0; min-height: 140px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border: 1.5px dashed var(--border-light); border-radius: 12px;';
        emptyMsg.innerHTML = `
          <div class="ui-empty-icon" style="width: 36px; height: 36px; border-radius: 50%; background: #F1F5F9; color: #64748B; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 8px;">
            <i data-lucide="inbox" style="width: 18px; height: 18px;"></i>
          </div>
          <p style="font-size: 13px; font-weight: 600; color: var(--text-dark, #0F172A); margin: 0 0 2px 0;">No Available Subjects</p>
          <p style="font-size: 11.5px; color: var(--text-muted, #94A3B8); margin: 0;">Create a block above or reset the grid.</p>
        `;
        blocksContainer.appendChild(emptyMsg);
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: emptyMsg });
        }
      }
    } else {
      if (emptyMsg) emptyMsg.remove();
    }
  }

  /**
   * Converts subject, professor, section into an available tray block element.
   * @param {string} subject
   * @param {string} professor
   * @param {string} section
   * @returns {HTMLElement}
   */
  function convertToTrayBlock(subject, professor, section) {
    const state = global.scheduleState || {};
    const blockNum = typeof state.incrementBlockCounter === 'function' ? state.incrementBlockCounter() : Date.now();

    const block = document.createElement('div');
    block.className = 'schedule-block';
    block.draggable = true;
    block.id = 'block-new-' + blockNum;

    const escapeFn = global.escapeHtml || window.escapeHtml || ((s) => s || '');

    block.innerHTML = `
      <div style="font-weight: 700;">${escapeFn(subject)}</div>
      <div style="font-size: 11.5px; opacity: 0.9;">${escapeFn(professor)}</div>
      <div style="font-size: 11.5px; opacity: 0.9;">${escapeFn(section)}</div>
      <button class="delete-block-btn" type="button" aria-label="Delete block">
        <i data-lucide="x" style="width: 14px; height: 14px; pointer-events: none;"></i>
      </button>
    `;

    const deleteBtn = block.querySelector('.delete-block-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        deleteBlock(e, deleteBtn);
      });
    }

    if (global.scheduleDragDrop && typeof global.scheduleDragDrop.bindTrayBlockDragListeners === 'function') {
      global.scheduleDragDrop.bindTrayBlockDragListeners(block, professor);
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: block });
    }

    return block;
  }

  /**
   * Deletes a tray block on clicking the x button.
   * @param {Event} event
   * @param {HTMLElement} btn
   */
  function deleteBlock(event, btn) {
    if (event) event.stopPropagation();
    const block = btn ? btn.closest('.schedule-block') : null;
    if (block) {
      block.remove();
      if (global.scheduleState) global.scheduleState.isDirty = true;
      global.isDirty = true;
      updateBlockCount();
    }
  }

  /**
   * Clears all available tray blocks.
   */
  function clearAvailableBlocks() {
    const blocksContainer = document.getElementById('blocks-container');
    if (blocksContainer) {
      blocksContainer.innerHTML = '';
      updateBlockCount();
    }
  }

  const trayBlockRenderer = {
    updateBlockCount,
    convertToTrayBlock,
    deleteBlock,
    clearAvailableBlocks
  };

  global.trayBlockRenderer = trayBlockRenderer;
  global.convertToTrayBlock = convertToTrayBlock;
  global.deleteBlock = deleteBlock;
  global.updateBlockCount = updateBlockCount;

})(typeof window !== 'undefined' ? window : this);
