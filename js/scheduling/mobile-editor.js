/**
 * LabSync Mobile Schedule Editor Controller | js/scheduling/mobile-editor.js
 * Controls the mobile-specific user interface:
 *   - Day Switcher Tabs (Mon - Sat, All) with full-width single-day zoom.
 *   - Collapsible Bottom Sheet & Dock for Available Blocks and Create Block form.
 *   - Live counter badge synchronization on the bottom dock.
 *   - Seamless switching between mobile drawer and desktop 2-panel layout on resize.
 */

(function (global) {
  'use strict';

  let currentActiveDay = 'Monday';
  let activeSheetTab = 'blocks'; // 'blocks' | 'create'
  let targetSlotContext = null; // { day, slotIndex, timeLabel }

  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /**
   * Sets the active day or focuses on a specific day in the timetable.
   * Keeps all day columns visible to preserve the weekly schedule grid layout.
   * @param {string} day - 'Monday'..'Saturday' or 'All'
   */
  function setActiveDay(day) {
    currentActiveDay = day || 'Monday';

    const headerCells = document.querySelectorAll('.calendar-grid-header .grid-header-cell');
    const dayColumns = document.querySelectorAll('.grid-day-column');

    // Keep all columns visible (old weekly schedule grid layout)
    headerCells.forEach((cell) => {
      cell.style.display = '';
      cell.classList.remove('is-active-day');
    });
    dayColumns.forEach(col => {
      col.style.display = '';
      col.classList.remove('is-active-day');
    });

    // If a specific day is targeted and container exists, smoothly scroll to it
    if (day && day !== 'All') {
      const targetCol = document.querySelector(`.grid-day-column[data-day="${day}"]`);
      const container = document.querySelector('.calendar-grid-container');
      if (targetCol && container) {
        targetCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      }
    }

    // Update placement bar hint if currently in placement mode
    if (global.scheduleTapToPlace && typeof global.scheduleTapToPlace.getPlacementState === 'function') {
      const state = global.scheduleTapToPlace.getPlacementState();
      if (state.mode !== 'idle') {
        const hint = document.getElementById('mpb-hint');
        if (hint) {
          hint.textContent = 'Tap any slot on the timetable to drop';
        }
      }
    }
  }

  /**
   * Returns the currently active day name.
   */
  function getActiveDay() {
    return currentActiveDay;
  }

  /**
   * Initializes Day Switcher Tabs if present.
   */
  function initDayTabs() {
    const tabContainer = document.getElementById('mobile-day-tabs');
    if (!tabContainer) return;

    tabContainer.querySelectorAll('.day-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const day = tab.dataset.day;
        if (day) setActiveDay(day);
      });
    });
  }

  let panelPlaceholder = null;

  /**
   * Restores create-block-panel to its original position inside .editor-layout-container.
   */
  function restorePanelToDesktop() {
    const panel = document.getElementById('create-block-panel');
    if (panel && panelPlaceholder && panelPlaceholder.parentNode) {
      panelPlaceholder.parentNode.insertBefore(panel, panelPlaceholder);
      panelPlaceholder.remove();
      panelPlaceholder = null;
    }
  }

  /**
   * Opens the mobile bottom sheet in a specific tab ('blocks' | 'create').
   */
  function openSheet(tabName = 'blocks') {
    if (window.innerWidth > 1024) return;

    activeSheetTab = tabName;
    const panel = document.getElementById('create-block-panel');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    if (!panel) return;

    // Port panel directly to body so it escapes any ancestor stacking context/overflow
    // and stacks cleanly above the blurred backdrop (z-index 10002 > 10001)
    if (panel.parentElement !== document.body) {
      if (!panelPlaceholder) {
        panelPlaceholder = document.createComment('create-block-panel-placeholder');
      }
      panel.parentNode.insertBefore(panelPlaceholder, panel);
      document.body.appendChild(panel);
    }

    panel.classList.add('mobile-sheet-open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('mobile-sheet-active');

    // Hide floating dock while sheet is open
    const dock = document.getElementById('mobile-editor-dock');
    if (dock) dock.style.setProperty('display', 'none', 'important');

    // Switch tab inside sheet
    setSheetTab(tabName);
  }

  /**
   * Closes the mobile bottom sheet.
   */
  function closeSheet() {
    const panel = document.getElementById('create-block-panel');
    const backdrop = document.getElementById('mobile-sheet-backdrop');
    if (panel) panel.classList.remove('mobile-sheet-open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('mobile-sheet-active');
    targetSlotContext = null;

    // Restore panel back into .editor-layout-container after slide-down transition (avoiding reparenting during active drag)
    if (panel && panelPlaceholder && panelPlaceholder.parentNode) {
      setTimeout(() => {
        if (!panel.classList.contains('mobile-sheet-open') && !document.body.classList.contains('dragging-active')) {
          restorePanelToDesktop();
        }
      }, 330);
    }

    // Restore floating dock if not in active placement mode
    const dock = document.getElementById('mobile-editor-dock');
    if (dock) {
      const isPlacing = (global.tapToPlaceEngine && typeof global.tapToPlaceEngine.getState === 'function')
        ? (global.tapToPlaceEngine.getState().mode !== 'idle')
        : false;
      if (!isPlacing) {
        dock.style.setProperty('display', 'flex', 'important');
      }
    }
  }

  /**
   * Sets active tab inside the mobile bottom sheet.
   */
  function setSheetTab(tabName) {
    activeSheetTab = tabName;

    const panel = document.getElementById('create-block-panel');
    if (panel) {
      panel.dataset.sheetTab = tabName;
    }

    const tabs = document.querySelectorAll('.mobile-sheet-tab');
    tabs.forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
      } else {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      }
    });

    const createFormSection = document.querySelector('.editor-create-form-section');
    const availableBlocksSection = document.querySelector('.available-blocks-section');

    if (window.innerWidth <= 1024) {
      if (tabName === 'blocks') {
        if (createFormSection) createFormSection.style.setProperty('display', 'none', 'important');
        if (availableBlocksSection) availableBlocksSection.style.setProperty('display', 'flex', 'important');
      } else {
        if (createFormSection) createFormSection.style.setProperty('display', 'block', 'important');
        if (availableBlocksSection) availableBlocksSection.style.setProperty('display', 'none', 'important');
      }
    } else {
      if (createFormSection) createFormSection.style.display = '';
      if (availableBlocksSection) availableBlocksSection.style.display = '';
    }
  }

  /**
   * Opens the bottom sheet when an empty slot is tapped directly on the grid.
   */
  function openSheetForSlot(day, slotIndex, timeLabel) {
    targetSlotContext = { day, slotIndex, timeLabel };

    // Check available blocks count
    const blocksCount = document.querySelectorAll('#blocks-container .schedule-block').length;
    if (blocksCount > 0) {
      openSheet('blocks');
      if (global.showToast) {
        global.showToast(`Selected ${day} at ${timeLabel}. Tap a block to place.`, 'info');
      }
    } else {
      openSheet('create');
      if (global.showToast) {
        global.showToast(`Selected ${day} at ${timeLabel}. Create a block to schedule.`, 'info');
      }
    }
  }

  /**
   * Synchronizes the count on the mobile bottom dock button.
   */
  function syncDockCount() {
    const dockCount = document.getElementById('mobile-dock-count');
    const availableCount = document.getElementById('available-count');
    const sheetTabCount = document.querySelector('.mobile-sheet-count');

    const count = document.querySelectorAll('#blocks-container .schedule-block').length;

    if (dockCount) dockCount.textContent = count;
    if (availableCount) availableCount.textContent = count;
    if (sheetTabCount) sheetTabCount.textContent = count;
  }

  /**
   * Initializes the mobile bottom dock and sheet UI.
   */
  function initMobileDockAndSheet() {
    // Dock buttons
    const dockBlocksBtn = document.getElementById('mobile-dock-blocks-btn');
    const dockCreateBtn = document.getElementById('mobile-dock-create-btn');
    const backdrop = document.getElementById('mobile-sheet-backdrop');

    if (dockBlocksBtn) {
      dockBlocksBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openSheet('blocks');
      });
    }

    if (dockCreateBtn) {
      dockCreateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openSheet('create');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        closeSheet();
      });
    }

    // Drag handle close on tap
    const dragHandle = document.querySelector('.sheet-drag-handle');
    if (dragHandle) {
      dragHandle.addEventListener('click', () => {
        closeSheet();
      });
    }

    // Sheet close button (if present)
    const sheetCloseBtn = document.getElementById('mobile-sheet-close-btn');
    if (sheetCloseBtn) {
      sheetCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeSheet();
      });
    }

    // Sheet tabs
    const sheetTabs = document.querySelectorAll('.mobile-sheet-tab');
    sheetTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const tabName = tab.dataset.tab;
        if (tabName) setSheetTab(tabName);
      });
    });

    // When creating a block, auto switch to blocks tab or auto start placing if targeted
    const createBtn = document.getElementById('create-block-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        setTimeout(() => {
          syncDockCount();
          if (window.innerWidth <= 1024) {
            setSheetTab('blocks');
          }
        }, 100);
      });
    }

    // Observe changes to blocks container to keep count synced
    const blocksContainer = document.getElementById('blocks-container');
    if (blocksContainer) {
      const observer = new MutationObserver(() => {
        syncDockCount();
      });
      observer.observe(blocksContainer, { childList: true, subtree: true });
    }

    syncDockCount();
  }

  /**
   * Handles window resize to adjust layout cleanly.
   */
  /**
   * Handles window resize to adjust layout cleanly.
   */
  function handleResize() {
    const headerCells = document.querySelectorAll('.calendar-grid-header .grid-header-cell');
    const dayColumns = document.querySelectorAll('.grid-day-column');
    headerCells.forEach(cell => cell.style.display = '');
    dayColumns.forEach(col => col.style.display = '');

    if (window.innerWidth > 1024) {
      // Desktop: restore panel and reset sheet states
      restorePanelToDesktop();
      closeSheet();
      const createFormSection = document.querySelector('.editor-create-form-section');
      const availableBlocksSection = document.querySelector('.available-blocks-section');
      if (createFormSection) createFormSection.style.display = '';
      if (availableBlocksSection) availableBlocksSection.style.display = '';
    }
  }

  /**
   * Initializes the complete mobile schedule editor module.
   */
  function initMobileScheduleEditor() {
    // Ensure all columns remain visible (classic weekly schedule grid layout)
    const headerCells = document.querySelectorAll('.calendar-grid-header .grid-header-cell');
    const dayColumns = document.querySelectorAll('.grid-day-column');
    headerCells.forEach(cell => cell.style.display = '');
    dayColumns.forEach(col => col.style.display = '');

    initDayTabs();
    initMobileDockAndSheet();

    window.addEventListener('resize', handleResize);

    // Connect tap-to-place engine
    if (global.scheduleTapToPlace && typeof global.scheduleTapToPlace.initTapToPlace === 'function') {
      global.scheduleTapToPlace.initTapToPlace();
    }
  }

  const mobileEditor = {
    initMobileScheduleEditor,
    setActiveDay,
    getActiveDay,
    openSheet,
    closeSheet,
    setSheetTab,
    openSheetForSlot,
    syncDockCount
  };

  global.mobileScheduleEditor = mobileEditor;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileScheduleEditor);
  } else {
    initMobileScheduleEditor();
  }

})(typeof window !== 'undefined' ? window : this);
