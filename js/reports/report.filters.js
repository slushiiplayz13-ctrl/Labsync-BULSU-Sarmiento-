/**
 * LabSync Report Filters | js/reports/report.filters.js
 * Multi-field live query matching and date range filter functions for hardware issue reports.
 */

(function (global) {
  'use strict';

  /**
   * Safe query matcher handling null/undefined fields, variations of ticket IDs, student names, PC numbers, and remarks.
   * @param {Object} report
   * @param {string} query
   * @returns {boolean}
   */
  function matchesReportQuery(report, query) {
    if (!query) return true;
    const q = String(query).toLowerCase().trim();
    if (!q) return true;

    const cleanQuery = q.replace(/[^a-z0-9]/g, '');

    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function'
      ? parser.parseIssueDescription
      : (typeof global.parseIssueDescription === 'function' ? global.parseIssueDescription : null);

    const parsed = parseFn
      ? parseFn(report.Issue_Description)
      : { section: '', issues: '', remarks: '' };

    const idStr = report.Report_ID != null ? String(report.Report_ID) : '';
    const formattedId = idStr ? `ls-tkt-${idStr}` : '';
    const shortTktId = idStr ? `tkt-${idStr}` : '';
    const noDashId = idStr ? `lstkt${idStr}` : '';
    const shortNoDashId = idStr ? `tkt${idStr}` : '';

    const studentName = (report.Student_Name || '').toLowerCase();
    const roomNum = report.Room_Number != null ? String(report.Room_Number).toLowerCase() : '';
    const roomFormatted = roomNum ? `room ${roomNum}` : '';
    const pcNum = report.PC_Number != null ? String(report.PC_Number).toLowerCase() : '';
    const pcFormatted = pcNum ? `pc ${pcNum}` : '';
    const pcHashFormatted = pcNum ? `pc #${pcNum}` : '';
    const issueDesc = (report.Issue_Description || '').toLowerCase();
    const section = (parsed.section || '').toLowerCase();
    const issues = (parsed.issues || '').toLowerCase();
    const remarks = (parsed.remarks || '').toLowerCase();
    const priority = (report.Priority_Level || '').toLowerCase();
    const status = (report.Status || '').toLowerCase();

    return (
      idStr === q ||
      idStr.includes(q) ||
      formattedId.includes(q) ||
      shortTktId.includes(q) ||
      (cleanQuery && noDashId.includes(cleanQuery)) ||
      (cleanQuery && shortNoDashId.includes(cleanQuery)) ||
      studentName.includes(q) ||
      roomNum.includes(q) ||
      roomFormatted.includes(q) ||
      pcNum.includes(q) ||
      pcFormatted.includes(q) ||
      pcHashFormatted.includes(q) ||
      issueDesc.includes(q) ||
      section.includes(q) ||
      issues.includes(q) ||
      remarks.includes(q) ||
      priority.includes(q) ||
      status.includes(q)
    );
  }

  /**
   * Filters report array by time range (7days, 30days, all).
   * @param {Array} reports
   * @param {string} timeFilter - '7days' | '30days' | 'all'
   * @returns {Array}
   */
  function filterByTimeRange(reports, timeFilter = 'all') {
    if (!Array.isArray(reports)) return [];
    if (timeFilter === 'all') return reports;

    const now = Date.now();
    if (timeFilter === '30days') {
      const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
      return reports.filter(r => new Date(r.Date_Reported || 0).getTime() >= thirtyDaysAgo);
    } else if (timeFilter === '7days') {
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
      return reports.filter(r => new Date(r.Date_Reported || 0).getTime() >= sevenDaysAgo);
    }
    return reports;
  }

  const reportFilters = {
    matchesReportQuery,
    filterByTimeRange
  };

  global.reportFilters = reportFilters;
  global.matchesReportQuery = matchesReportQuery;

})(typeof window !== 'undefined' ? window : this);
