/**
 * LabSync Reports Facade | js/reports.js
 * Thin compatibility facade coordinating modular reports architecture:
 *   - js/state/report.store.js
 *   - js/services/report.service.js
 *   - js/reports/report.parser.js
 *   - js/reports/report.filters.js
 *   - js/reports/report.renderer.js
 *   - js/reports/report.actions.js
 *   - js/reports/report.modal.js
 *   - js/reports/report.controller.js
 */

(function (global) {
  'use strict';

  // Ensure global backward compatibility contracts
  global.parseIssueDescription = (desc) => {
    if (global.reportParser && typeof global.reportParser.parseIssueDescription === 'function') {
      return global.reportParser.parseIssueDescription(desc);
    }
    return { section: 'N/A', issues: 'None', remarks: 'No details provided.' };
  };

  global.matchesReportQuery = (report, query) => {
    if (global.reportFilters && typeof global.reportFilters.matchesReportQuery === 'function') {
      return global.reportFilters.matchesReportQuery(report, query);
    }
    return true;
  };

  global.renderSingleCard = (report) => {
    if (global.reportRenderer && typeof global.reportRenderer.renderSingleCard === 'function') {
      return global.reportRenderer.renderSingleCard(report);
    }
    return '';
  };

  global.renderModalTicketCard = (report) => {
    if (global.reportRenderer && typeof global.reportRenderer.renderModalTicketCard === 'function') {
      return global.reportRenderer.renderModalTicketCard(report);
    }
    return '';
  };

  global.updateReportStatus = (id, status) => {
    if (global.reportActions && typeof global.reportActions.updateReportStatus === 'function') {
      return global.reportActions.updateReportStatus(id, status);
    }
  };

  global.deleteReport = (id) => {
    if (global.reportActions && typeof global.reportActions.deleteReport === 'function') {
      return global.reportActions.deleteReport(id);
    }
  };

  global.openCompletedModal = () => {
    if (global.reportModal && typeof global.reportModal.openCompletedModal === 'function') {
      return global.reportModal.openCompletedModal();
    }
  };

  global.closeCompletedModal = () => {
    if (global.reportModal && typeof global.reportModal.closeCompletedModal === 'function') {
      return global.reportModal.closeCompletedModal();
    }
  };

  global.filterCompletedTickets = () => {
    if (global.reportModal && typeof global.reportModal.filterCompletedTickets === 'function') {
      return global.reportModal.filterCompletedTickets();
    }
  };

  global.loadReports = () => {
    if (global.reportController && typeof global.reportController.loadReports === 'function') {
      return global.reportController.loadReports();
    }
  };

  global.renderReports = () => {
    if (global.reportController && typeof global.reportController.renderReports === 'function') {
      return global.reportController.renderReports();
    }
  };

})(typeof window !== 'undefined' ? window : this);
