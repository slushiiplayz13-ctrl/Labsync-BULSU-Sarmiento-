/**
 * LabSync – MIS Maintenance Actions  |  js/pages/mis-maintenance/maintenance.actions.js
 * Encapsulates report API operations, status mutations, confirmation dialogs, and toast notifications.
 */

(function (global) {
  'use strict';

  /**
   * Fetches maintenance reports from the canonical report service.
   * @returns {Promise<Array>} Array of report objects
   */
  async function fetchMaintenanceReports() {
    const fetchFn = (global.reportService && typeof global.reportService.fetchReports === 'function')
      ? global.reportService.fetchReports
      : (typeof global.fetchReports === 'function' ? global.fetchReports : null);

    if (typeof fetchFn === 'function') {
      return await fetchFn();
    }

    const response = await fetch('/api/reports', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to fetch reports: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Prompts user confirmation, sends status update via report service, and refreshes view.
   * @param {number|string} reportId
   * @param {string} newStatus
   * @param {Function} [onComplete] - Optional callback after successful update
   */
  async function updateReportStatus(reportId, newStatus, onComplete) {
    const confirmFn = global.showConfirmModal || (typeof window !== 'undefined' ? window.showConfirmModal : null);
    let confirmed = false;
    const isResolved = newStatus === 'Resolved';
    const isOngoingRepair = newStatus === 'In Progress' || newStatus === 'Ongoing Repair';
    const displayStatus = isOngoingRepair ? 'Ongoing Repair' : newStatus;

    if (typeof confirmFn === 'function') {
      confirmed = await confirmFn({
        title: isResolved ? 'Mark Issue Resolved' : (isOngoingRepair ? 'Start Repair' : 'Update Ticket Status'),
        message: isResolved
          ? `Mark the reported issue for Ticket LS-TKT-${reportId} as resolved?`
          : (isOngoingRepair
            ? `Mark Ticket LS-TKT-${reportId} as Ongoing Repair to indicate repair work has started?`
            : `Are you sure you want to set Ticket LS-TKT-${reportId} status to '${displayStatus}'?`),
        confirmText: isResolved ? 'Mark Resolved' : (isOngoingRepair ? 'Start Repair' : 'Update Status'),
        cancelText: 'Cancel',
        isDestructive: false
      });
    } else {
      confirmed = confirm(isResolved
        ? `Mark the reported issue for Ticket LS-TKT-${reportId} as resolved?`
        : (isOngoingRepair
          ? `Mark Ticket LS-TKT-${reportId} as Ongoing Repair?`
          : `Set Ticket LS-TKT-${reportId} status to '${displayStatus}'?`));
    }

    if (!confirmed) return;

    try {
      const updateFn = (global.reportService && typeof global.reportService.updateReportStatus === 'function')
        ? global.reportService.updateReportStatus
        : (typeof global.updateReportStatus === 'function' && global.updateReportStatus !== updateReportStatus
          ? global.updateReportStatus
          : null);

      if (typeof updateFn === 'function') {
        await updateFn(reportId, newStatus);
      } else {
        const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ status: newStatus })
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update ticket status.');
        }
      }

      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        const toastMsg = (newStatus === 'Resolved')
          ? `The reported issue for Ticket LS-TKT-${reportId} has been marked as resolved.`
          : (isOngoingRepair
            ? `Ticket LS-TKT-${reportId} has been marked as Ongoing Repair.`
            : `Ticket LS-TKT-${reportId} status updated to ${displayStatus}`);
        toastFn(toastMsg, 'success');
      }

      if (typeof onComplete === 'function') {
        await onComplete();
      } else if (typeof global.loadMaintenanceData === 'function') {
        await global.loadMaintenanceData();
      } else if (typeof window !== 'undefined' && typeof window.loadMaintenanceData === 'function') {
        await window.loadMaintenanceData();
      }
    } catch (error) {
      console.error('[MaintenanceActions] Error updating status:', error);
      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn(error.message || 'Failed to update ticket status.', 'error');
      } else {
        alert(error.message || 'Failed to update ticket status.');
      }
    }
  }

  const maintenanceActions = {
    fetchMaintenanceReports,
    updateReportStatus
  };

  global.maintenanceActions = maintenanceActions;
  global.updateReportStatus = updateReportStatus;

})(typeof window !== 'undefined' ? window : this);
