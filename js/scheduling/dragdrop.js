/**
 * LabSync Scheduling Drag & Drop Facade | js/scheduling/dragdrop.js
 * Thin compatibility facade coordinating modular interaction engines:
 *   - js/scheduling/interactions/autoscroll.js
 *   - js/scheduling/interactions/card-resize.js
 *   - js/scheduling/interactions/mouse-drag.js
 *   - js/scheduling/interactions/touch-drag.js
 */

(function (global) {
  'use strict';

  const scheduleDragDrop = {
    get AutoScroller() {
      return global.scheduleAutoScroller || global.AutoScroller;
    },
    initCardResize(card, handle, professor) {
      if (global.scheduleCardResize && typeof global.scheduleCardResize.initCardResize === 'function') {
        return global.scheduleCardResize.initCardResize(card, handle, professor);
      }
    },
    bindCardDragListeners(card, professor) {
      if (global.scheduleMouseDrag && typeof global.scheduleMouseDrag.bindCardDragListeners === 'function') {
        return global.scheduleMouseDrag.bindCardDragListeners(card, professor);
      }
    },
    bindTrayBlockDragListeners(block, professor) {
      if (global.scheduleMouseDrag && typeof global.scheduleMouseDrag.bindTrayBlockDragListeners === 'function') {
        return global.scheduleMouseDrag.bindTrayBlockDragListeners(block, professor);
      }
    },
    initDayColumnDropZones(dayColumns, blocksContainer) {
      if (global.scheduleMouseDrag && typeof global.scheduleMouseDrag.initDayColumnDropZones === 'function') {
        return global.scheduleMouseDrag.initDayColumnDropZones(dayColumns, blocksContainer);
      }
    },
    initTrayDropZone(blocksContainer) {
      if (global.scheduleMouseDrag && typeof global.scheduleMouseDrag.initTrayDropZone === 'function') {
        return global.scheduleMouseDrag.initTrayDropZone(blocksContainer);
      }
    },
    initTouchDragAndDrop(blocksContainer) {
      if (global.scheduleTouchDrag && typeof global.scheduleTouchDrag.initTouchDragAndDrop === 'function') {
        return global.scheduleTouchDrag.initTouchDragAndDrop(blocksContainer);
      }
    }
  };

  global.scheduleDragDrop = scheduleDragDrop;

})(typeof window !== 'undefined' ? window : this);
