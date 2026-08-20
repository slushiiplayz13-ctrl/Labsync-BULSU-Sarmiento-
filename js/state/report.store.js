/**
 * LabSync Report State Store
 * Extracted in Phase 6A-05 (Report State Store Extraction)
 */

(function (global) {
  'use strict';

  let reports = [];
  const listeners = new Set();

  /**
   * Returns the current internal report array state.
   * @returns {Array} Current report items
   */
  function getReports() {
    return reports;
  }

  /**
   * Replaces the internal report array state and notifies registered subscribers.
   * @param {Array} data - New array of report objects
   */
  function setReports(data) {
    reports = Array.isArray(data) ? data : [];
    listeners.forEach(listener => {
      try {
        listener(reports);
      } catch (err) {
        console.error('[ReportStore] Subscriber error:', err);
      }
    });
  }

  /**
   * Registers a listener to be notified whenever report state is replaced.
   * @param {Function} listener - Callback function receiving current reports
   * @returns {Function} Unsubscribe function
   */
  function subscribe(listener) {
    if (typeof listener === 'function') {
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }
    return function () {};
  }

  const reportStore = {
    getReports,
    setReports,
    subscribe
  };

  // Backward-compatibility bridge for window.allReports
  if (typeof Object.defineProperty === 'function') {
    Object.defineProperty(global, 'allReports', {
      get: function () {
        return getReports();
      },
      set: function (data) {
        setReports(data);
      },
      configurable: true,
      enumerable: true
    });
  } else {
    global.allReports = reports;
  }

  // Export global store reference
  global.reportStore = reportStore;

})(typeof window !== 'undefined' ? window : this);
