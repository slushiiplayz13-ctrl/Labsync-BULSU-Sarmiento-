/**
 * LabSync Canonical Time Utilities | js/utils/time-utils.js
 * Centralized, standardized time formatting, slot conversion, and duration calculations.
 */

(function (global) {
  'use strict';

  /**
   * Format a 24-hour time string ("13:45" or "13:45:00") into a 12-hour AM/PM string ("1:45 PM").
   * @param {string} timeStr - Time string in HH:MM or HH:MM:SS format
   * @returns {string} Formatted 12-hour time string
   */
  function formatTime12(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    const parts = timeStr.split(':');
    let hour = parseInt(parts[0], 10);
    const minute = parts[1] || '00';
    if (isNaN(hour)) return timeStr;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    hour = hour ? hour : 12;
    return `${hour}:${minute} ${ampm}`;
  }

  /**
   * Format time for scheduling labels ("07:00" -> "7:00 AM").
   * @param {string} timeStr - HH:MM string
   * @returns {string}
   */
  function formatTimeLabel(timeStr) {
    return formatTime12(timeStr);
  }

  /**
   * Alias for formatTime12.
   * @param {string} t
   * @returns {string}
   */
  function formatTime24to12(t) {
    return formatTime12(t);
  }

  /**
   * Short time formatting for compact schedule cards ("7:00 AM" or "7:00").
   * @param {string} timeStr
   * @returns {string}
   */
  function formatShortTime(timeStr) {
    return formatTime12(timeStr);
  }

  /**
   * Format a time range string ("07:00", "08:30" -> "7:00 AM – 8:30 AM").
   * @param {string} startStr
   * @param {string} endStr
   * @returns {string}
   */
  function formatTimeRange(startStr, endStr) {
    const s = formatTime12(startStr);
    const e = formatTime12(endStr);
    if (!s && !e) return '';
    if (!s) return e;
    if (!e) return s;
    return `${s} – ${e}`;
  }

  /**
   * Format an ISO timestamp or date into a human-readable relative time string.
   * @param {string|Date} timestampStr
   * @returns {string} (e.g. "Just now", "5 minutes ago", "Aug 20, 2026")
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

  /**
   * Convert slot index (0 to 27) to 24-hour HH:MM time string (0 = "07:00", 1 = "07:30", etc.).
   * @param {number} slotIndex
   * @returns {string}
   */
  function slotsToTime(slotIndex) {
    const totalMinutes = 7 * 60 + Math.round(slotIndex * 30);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  /**
   * Convert 24-hour HH:MM time string to slot index (0 to 27).
   * @param {string} timeStr
   * @returns {number}
   */
  function timeToSlots(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] || '0', 10);
    const totalMinutes = hours * 60 + minutes;
    const slot = (totalMinutes - 7 * 60) / 30;
    return Math.max(0, Math.min(27, Math.round(slot)));
  }

  const timeUtils = {
    formatTime12,
    formatTimeLabel,
    formatTime24to12,
    formatShortTime,
    formatTimeRange,
    formatLastUpdatedTime,
    slotsToTime,
    timeToSlots
  };

  // Expose as clean object & global backward-compatibility bridges
  global.timeUtils = timeUtils;
  global.formatTime12 = formatTime12;
  global.formatTimeLabel = formatTimeLabel;
  global.formatTime24to12 = formatTime24to12;
  global.formatShortTime = formatShortTime;
  global.formatTimeRange = formatTimeRange;
  global.formatLastUpdatedTime = formatLastUpdatedTime;
  global.slotsToTime = slotsToTime;
  global.timeToSlots = timeToSlots;

})(typeof window !== 'undefined' ? window : this);
