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

  /**
   * Validates whether a profile photo URL is an authorized image data URL or safe relative/https path.
   * Rejects javascript:, data:text/html, unknown protocols, or malformed values.
   * @param {string} url
   * @returns {boolean}
   */
  function isValidProfilePhotoUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return false;
    const trimmed = url.trim();
    // Allow safe base64 image data URLs (png, jpeg, jpg, webp, gif, svg+xml)
    if (/^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return true;
    }
    // Allow safe relative asset paths (e.g. assets/... or /assets/...)
    if (/^(?:\/|assets\/)[\w./-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(trimmed)) {
      return true;
    }
    // Allow safe absolute HTTPS image URLs
    if (/^https:\/\/[\w.-]+(?::\d+)?\/[\w./-]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(trimmed)) {
      return true;
    }
    return false;
  }

  const domUtils = {
    escapeHtml,
    isValidProfilePhotoUrl,
    renderIcons
  };

  global.domUtils = domUtils;
  global.escapeHtml = escapeHtml;
  global.isValidProfilePhotoUrl = isValidProfilePhotoUrl;
  global.renderIcons = renderIcons;

})(typeof window !== 'undefined' ? window : this);
