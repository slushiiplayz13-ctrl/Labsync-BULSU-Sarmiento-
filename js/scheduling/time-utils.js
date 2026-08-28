/**
 * LabSync Scheduling Time Utilities Adapter | js/scheduling/time-utils.js
 * Delegates to canonical js/utils/time-utils.js while preserving all scheduling exports.
 */

(function (global) {
  'use strict';

  const utils = global.timeUtils || {};

  function slotsToTime(slotIndex) {
    if (typeof utils.slotsToTime === 'function') return utils.slotsToTime(slotIndex);
    const totalMinutes = 7 * 60 + Math.round(slotIndex * 30);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  function timeToSlots(timeStr) {
    if (typeof utils.timeToSlots === 'function') return utils.timeToSlots(timeStr);
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1] || '0', 10);
    const totalMinutes = hours * 60 + minutes;
    const slot = (totalMinutes - 7 * 60) / 30;
    return Math.max(0, Math.min(27, Math.round(slot)));
  }

  function formatTimeLabel(timeStr) {
    if (typeof utils.formatTimeLabel === 'function') return utils.formatTimeLabel(timeStr);
    if (typeof global.formatTime12 === 'function') return global.formatTime12(timeStr);
    return timeStr;
  }

  function formatShortTime(timeStr) {
    if (typeof utils.formatShortTime === 'function') return utils.formatShortTime(timeStr);
    return formatTimeLabel(timeStr);
  }

  function formatTime24to12(t) {
    return formatTimeLabel(t);
  }

  function formatTimeRange(startStr, endStr) {
    if (typeof utils.formatTimeRange === 'function') return utils.formatTimeRange(startStr, endStr);
    const s = formatTimeLabel(startStr);
    const e = formatTimeLabel(endStr);
    return `${s} – ${e}`;
  }

  const scheduleTimeUtils = {
    slotsToTime,
    timeToSlots,
    formatTimeLabel,
    formatShortTime,
    formatTime24to12,
    formatTimeRange
  };

  global.scheduleTimeUtils = scheduleTimeUtils;
  global.slotsToTime = slotsToTime;
  global.timeToSlots = timeToSlots;
  global.formatTimeLabel = formatTimeLabel;
  global.formatShortTime = formatShortTime;
  global.formatTime24to12 = formatTime24to12;
  global.formatTimeRange = formatTimeRange;

})(typeof window !== 'undefined' ? window : this);
