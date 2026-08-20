/**
 * LabSync Core Utilities
 * Extracted in Phase 6A-02 (Pure Core Utilities Extraction)
 */

(function (global) {
  'use strict';

  /**
   * Escape HTML special characters to prevent XSS vulnerabilities
   * @param {string} str - Raw string to escape
   * @returns {string} Escaped HTML string
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Format a 24-hour time string ("13:45") into a 12-hour AM/PM string ("1:45 PM")
   * @param {string} timeStr - Time string in HH:MM format
   * @returns {string} Formatted 12-hour time string
   */
  function formatTime12(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${hour}:${minute} ${ampm}`;
  }

  /**
   * Format an ISO timestamp or date into a human-readable relative time string
   * @param {string|Date} timestampStr - Timestamp or ISO date string
   * @returns {string} Relative time string (e.g. "Just now", "5 minutes ago", "Aug 20, 2026")
   */
  function formatLastUpdatedTime(timestampStr) {
    if (!timestampStr) return 'Never';
    try {
      const d = new Date(timestampStr);
      if (isNaN(d.getTime())) return 'Never';

      const now = new Date();
      const diffMs = now - d;
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins === 1) return '1 minute ago';
      if (diffMins < 60) return `${diffMins} minutes ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;

      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return 'Never';
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.escapeHtml = escapeHtml;
  global.formatTime12 = formatTime12;
  global.formatLastUpdatedTime = formatLastUpdatedTime;

})(typeof window !== 'undefined' ? window : this);
