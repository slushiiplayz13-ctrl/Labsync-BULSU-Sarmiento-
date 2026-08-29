/**
 * LabSync Report Actions | js/reports/report.actions.js
 * Handles status updates, ticket resolutions, deletions, and confirmation dialogs.
 */

(function (global) {
  'use strict';

  /**
   * Updates a report's status with confirmation dialog and toast feedback.
   * @param {number|string} reportId
   * @param {string} newStatus
   */
  async function updateReportStatus(reportId, newStatus) {
    const confirmFn = window.showConfirmModal || global.showConfirmModal;
    let confirmed = false;
    if (typeof confirmFn === 'function') {
      confirmed = await confirmFn({
        title: 'Update Ticket Status',
        message: `Are you sure you want to set Ticket LS-TKT-${reportId} status to '${newStatus}'?`,
        confirmText: 'Update Status',
        cancelText: 'Cancel',
        isDestructive: false
      });
    } else {
      confirmed = confirm(`Are you sure you want to set Ticket LS-TKT-${reportId} status to '${newStatus}'?`);
    }
    if (!confirmed) return;

    try {
      const updateFn = global.updateReportStatus || (global.reportService && global.reportService.updateReportStatus);
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
          const err = await response.json();
          throw new Error(err.error || 'Failed to update status');
        }
      }

      if (window.showToast) window.showToast(`Ticket LS-TKT-${reportId} updated to ${newStatus}`, 'success');

      if (typeof global.loadReports === 'function') {
        await global.loadReports();
      }

      // If completed modal is currently open, refresh resolved list
      const modal = document.getElementById('completedTicketsModal');
      if (modal && modal.style.display !== 'none' && typeof global.openCompletedModal === 'function') {
        global.openCompletedModal();
      }
    } catch (error) {
      console.error('[ReportActions] Error updating status:', error);
      if (window.showToast) {
        window.showToast(error.message || 'Failed to update ticket status.', 'error');
      } else {
        alert(error.message || 'Failed to update ticket status.');
      }
    }
  }

  /**
   * Deletes a report permanently with destructive confirmation dialog.
   * @param {number|string} reportId
   */
  async function deleteReport(reportId) {
    const confirmFn = window.showConfirmModal || global.showConfirmModal;
    let confirmed = false;
    if (typeof confirmFn === 'function') {
      confirmed = await confirmFn({
        title: 'Delete Ticket',
        message: `Are you sure you want to permanently delete Ticket LS-TKT-${reportId}? This action cannot be undone.`,
        confirmText: 'Delete Ticket',
        cancelText: 'Cancel',
        isDestructive: true
      });
    } else {
      confirmed = confirm(`Are you sure you want to permanently delete Ticket LS-TKT-${reportId}?`);
    }
    if (!confirmed) return;

    try {
      const deleteFn = global.deleteReport || (global.reportService && global.reportService.deleteReport);
      if (typeof deleteFn === 'function') {
        await deleteFn(reportId);
      } else {
        const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to delete report');
        }
      }

      if (window.showToast) window.showToast(`Ticket LS-TKT-${reportId} deleted successfully.`, 'success');

      if (typeof global.loadReports === 'function') {
        await global.loadReports();
      }

      const modal = document.getElementById('completedTicketsModal');
      if (modal && modal.style.display !== 'none' && typeof global.openCompletedModal === 'function') {
        global.openCompletedModal();
      }
    } catch (error) {
      console.error('[ReportActions] Error deleting report:', error);
      if (window.showToast) {
        window.showToast(error.message || 'Failed to delete ticket.', 'error');
      } else {
        alert(error.message || 'Failed to delete ticket.');
      }
    }
  }

  const reportActions = {
    updateReportStatus,
    deleteReport
  };

  global.reportActions = reportActions;
  global.updateReportStatus = updateReportStatus;
  global.deleteReport = deleteReport;

})(typeof window !== 'undefined' ? window : this);
