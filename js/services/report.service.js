/**
 * LabSync Report Service | js/services/report.service.js
 * Centralized API client for maintenance tickets, issue reporting, and report status management.
 */

(function (global) {
  'use strict';

  /**
   * Fetches all reports/tickets from the backend API.
   * @returns {Promise<Array>}
   */
  async function fetchReports() {
    const response = await fetch('/api/reports', { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Failed to load reports: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Submits a new hardware issue report.
   * @param {Object} reportData
   * @returns {Promise<{message: string, ticketId: string}>}
   */
  async function submitReport(reportData) {
    const response = await fetch('/api/reports/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(reportData)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to submit report');
    }
    return data;
  }

  /**
   * Updates a report's status (Pending, In Progress, Resolved).
   * @param {number|string} reportId
   * @param {string} status
   * @returns {Promise<{message: string}>}
   */
  async function updateReportStatus(reportId, status) {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ status })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to update report status');
    }
    return data;
  }

  /**
   * Deletes a report permanently.
   * @param {number|string} reportId
   * @returns {Promise<{message: string}>}
   */
  async function deleteReport(reportId) {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete report');
    }
    return data;
  }

  const reportService = {
    fetchReports,
    submitReport,
    updateReportStatus,
    deleteReport
  };

  global.reportService = reportService;

})(typeof window !== 'undefined' ? window : this);
