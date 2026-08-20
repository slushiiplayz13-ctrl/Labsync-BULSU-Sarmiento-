/**
 * LabSync DOM & Icon Utilities
 * Extracted in Phase 6A-03 (Shared UI Infrastructure)
 */

(function (global) {
  'use strict';

  /**
   * Safely renders Lucide icons across the document or within a specific subtree container.
   * @param {Element|Document|null} [root] - Optional root DOM element to scope icon rendering.
   */
  function renderIcons(root) {
    if (typeof global.lucide !== 'undefined' && typeof global.lucide.createIcons === 'function') {
      try {
        if (root) {
          global.lucide.createIcons({ root });
        } else {
          global.lucide.createIcons();
        }
      } catch (e) {
        console.warn('[LabSync DOM Utils] renderIcons failed:', e);
      }
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.renderIcons = renderIcons;

})(typeof window !== 'undefined' ? window : this);
