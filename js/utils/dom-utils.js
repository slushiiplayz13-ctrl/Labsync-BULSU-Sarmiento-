/**
 * LabSync DOM & Sanitization Utilities | js/utils/dom-utils.js
 * Provides safe HTML escaping and Lucide icon rendering helpers.
 */

(function (global) {
  'use strict';

  /**
   * Safely escapes untrusted input strings for insertion into HTML templates.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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

  const domUtils = {
    escapeHtml,
    renderIcons
  };

  global.domUtils = domUtils;
  global.escapeHtml = escapeHtml;
  global.renderIcons = renderIcons;

})(typeof window !== 'undefined' ? window : this);
