/**
 * LabSync – Scheduling Domain Time Utilities | js/scheduling/time-utils.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Pure domain time calculations, slot conversions, and formatters.
 */

(function (global) {
  'use strict';

  const START_HOUR = 7;
  const END_HOUR = 19;
  const TOTAL_SLOTS = 24; // 12 hours from 7:00 AM to 7:00 PM (30 min per slot)

  /**
   * Converts a "HH:MM" 24-hour time string to a slot index relative to start hour (0 to 24).
   * @param {string} timeStr - Time in "HH:MM" format
   * @param {number} [startHour=7] - Base starting hour
   * @returns {number} Slot index
   */
  function timeToSlots(timeStr, startHour = START_HOUR) {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    const diffMinutes = (h - startHour) * 60 + m;
    return diffMinutes / 30;
  }

  /**
   * Converts a slot index back to a "HH:MM" 24-hour time string.
   * @param {number} slotIndex - Slot index (0-based)
   * @param {number} [startHour=7] - Base starting hour
   * @returns {string} Time in "HH:MM" format
   */
  function slotsToTime(slotIndex, startHour = START_HOUR) {
    const totalMinutes = slotIndex * 30;
    const h = startHour + Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /**
   * Formats a 24-hour time string "13:30" to 12-hour format with AM/PM "1:30 PM".
   * @param {string} timeStr - Time in "HH:MM"
   * @returns {string} Formatted 12-hour time
   */
  function formatTimeLabel(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':');
    h = parseInt(h, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 || 12;
    return `${displayH}:${m} ${ampm}`;
  }

  /**
   * Formats a 24-hour time string "13:00" to short 12-hour format without AM/PM "1:00".
   * @param {string} timeStr - Time in "HH:MM"
   * @returns {string} Short 12-hour time
   */
  function formatShortTime(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(':');
    h = parseInt(h, 10);
    const displayH = h % 12 || 12;
    return `${displayH}:${m}`;
  }

  /**
   * Formats a 24-hour time string to 12-hour "h:MM AM/PM" (print tables compatibility).
   * @param {string} t - Time in "HH:MM"
   * @returns {string} Formatted 12-hour time
   */
  function formatTime24to12(t) {
    return formatTimeLabel(t);
  }

  /**
   * Concise single-line time range formatter (e.g. "8:00–10:00 AM" or "11:00 AM–1:00 PM").
   * @param {string} startStr - Start time
   * @param {string} endStr - End time
   * @returns {string} Formatted range
   */
  function formatTimeRange(startStr, endStr) {
    const s = formatTimeLabel(startStr);
    const e = formatTimeLabel(endStr);
    if (!s || !e) return `${s || ''} ${e || ''}`.trim();

    const sMatch = s.match(/^(\d+:\d+)\s*(AM|PM)$/i);
    const eMatch = e.match(/^(\d+:\d+)\s*(AM|PM)$/i);

    if (sMatch && eMatch) {
      const sPer = sMatch[2].toUpperCase();
      const ePer = eMatch[2].toUpperCase();
      if (sPer === ePer) {
        return `${sMatch[1]}–${eMatch[1]} ${ePer}`;
      }
      return `${sMatch[1]}${sPer[0]}–${eMatch[1]}${ePer[0]}`;
    }
    return `${s}–${e}`;
  }

  const timeUtils = {
    START_HOUR,
    END_HOUR,
    TOTAL_SLOTS,
    timeToSlots,
    slotsToTime,
    formatTimeLabel,
    formatShortTime,
    formatTime24to12,
    formatTimeRange
  };

  global.timeUtils = timeUtils;
  global.timeToSlots = timeToSlots;
  global.slotsToTime = slotsToTime;
  global.formatTimeLabel = formatTimeLabel;
  global.formatShortTime = formatShortTime;
  global.formatTime24to12 = formatTime24to12;
  global.formatTimeRange = formatTimeRange;

})(typeof window !== 'undefined' ? window : this);
