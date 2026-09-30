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
        emptyMsg = document.createElement('p');
        emptyMsg.id = 'no-blocks-msg';
        emptyMsg.style.cssText = 'font-size: 11.5px; color: #94A3B8; font-weight: 500; text-align: center; line-height: 1.5; margin: 10px auto; width: 100%;';
        emptyMsg.textContent = 'No blocks created yet. Create a block to start scheduling.';
        blocksContainer.appendChild(emptyMsg);
      } else {
        emptyMsg.className = '';
        emptyMsg.style.cssText = 'font-size: 11.5px; color: #94A3B8; font-weight: 500; text-align: center; line-height: 1.5; margin: 10px auto; width: 100%;';
        emptyMsg.textContent = 'No blocks created yet. Create a block to start scheduling.';
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
      if (global.scheduleState && typeof global.scheduleState.updateSaveButtonState === 'function') {
        global.scheduleState.updateSaveButtonState();
      }
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
