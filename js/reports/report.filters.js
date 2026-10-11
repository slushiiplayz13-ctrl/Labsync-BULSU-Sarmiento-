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

  let _activeFilters = {
    issueType: '',
    roomNumber: '',
    pcNumber: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    section: ''
  };

  /**
   * Returns a copy of the active filter state.
   * @returns {Object}
   */
  function getActiveFilters() {
    return Object.assign({}, _activeFilters);
  }

  /**
   * Updates active filters state.
   * @param {Object} newFilters
   * @returns {Object}
   */
  function setActiveFilters(newFilters = {}) {
    _activeFilters = {
      issueType: (newFilters.issueType || '').trim(),
      roomNumber: (newFilters.roomNumber || '').trim(),
      pcNumber: (newFilters.pcNumber || '').trim(),
      status: (newFilters.status || '').trim(),
      dateFrom: (newFilters.dateFrom || '').trim(),
      dateTo: (newFilters.dateTo || '').trim(),
      section: (newFilters.section || '').trim()
    };
    return getActiveFilters();
  }

  /**
   * Resets all filter fields to empty strings.
   * @returns {Object}
   */
  function resetFilters() {
    _activeFilters = {
      issueType: '',
      roomNumber: '',
      pcNumber: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      section: ''
    };
    return getActiveFilters();
  }

  /**
   * Counts active (non-empty) filter conditions.
   * Note: dateFrom and dateTo together count as 1 active date condition.
   * @param {Object} [filters]
   * @returns {number}
   */
  function countActiveFilters(filters) {
    const f = filters || _activeFilters;
    let count = 0;
    if (f.issueType) count++;
    if (f.roomNumber) count++;
    if (f.pcNumber) count++;
    if (f.status) count++;
    if (f.dateFrom || f.dateTo) count++;
    if (f.section) count++;
    return count;
  }

  /**
   * Validates date range.
   * @param {string} from - 'YYYY-MM-DD'
   * @param {string} to - 'YYYY-MM-DD'
   * @returns {{valid: boolean, error?: string}}
   */
  function validateDateRange(from, to) {
    if (!from || !to) return { valid: true };
    const fromTime = new Date(from + 'T00:00:00').getTime();
    const toTime = new Date(to + 'T00:00:00').getTime();
    if (isNaN(fromTime) || isNaN(toTime)) {
      return { valid: false, error: 'Invalid date format.' };
    }
    if (fromTime > toTime) {
      return { valid: false, error: 'Start date cannot be after end date.' };
    }
    return { valid: true };
  }

  /**
   * Evaluates if a single report matches active filter criteria using AND logic.
   * @param {Object} report
   * @param {Object} [filters]
   * @returns {boolean}
   */
  function matchesReportFilters(report, filters) {
    if (!report) return false;
    const f = filters || _activeFilters;

    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function'
      ? parser.parseIssueDescription
      : (typeof global.parseIssueDescription === 'function' ? global.parseIssueDescription : null);

    // 1. Issue Type
    if (f.issueType) {
      const targetType = f.issueType.toLowerCase().trim();
      const canonicalType = String(report.Issue_Type || '').trim();

      if (canonicalType && canonicalType.toLowerCase() !== 'none') {
        const cLower = canonicalType.toLowerCase();
        const typeMatches = cLower === targetType || cLower.includes(targetType) || targetType.includes(cLower);
        if (!typeMatches) return false;
      } else {
        const parsed = parseFn ? parseFn(report.Issue_Description) : { issues: '' };
        const parsedIssues = (parsed.issues || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
        const typeMatches = parsedIssues.some(iss => iss === targetType || iss.includes(targetType) || targetType.includes(iss));
        if (!typeMatches) return false;
      }
    }

    // 2. Room Number
    if (f.roomNumber) {
      const targetRoom = f.roomNumber.toLowerCase().replace(/^room\s*/i, '').trim();
      const reportRoom = String(report.Room_Number != null ? report.Room_Number : '').toLowerCase().replace(/^room\s*/i, '').trim();
      if (reportRoom !== targetRoom) return false;
    }

    // 3. PC Number
    if (f.pcNumber) {
      const targetPcStr = String(f.pcNumber).toLowerCase().trim();
      const reportPcStr = String(report.PC_Number != null ? report.PC_Number : '').toLowerCase().trim();

      const targetDigits = targetPcStr.replace(/\D/g, '');
      const reportDigits = reportPcStr.replace(/\D/g, '');

      let pcMatches = false;
      if (targetDigits && reportDigits) {
        pcMatches = parseInt(targetDigits, 10) === parseInt(reportDigits, 10);
      } else {
        pcMatches = reportPcStr === targetPcStr || reportPcStr.includes(targetPcStr);
      }
      if (!pcMatches) return false;
    }

    // 4. Status
    if (f.status) {
      const targetStatus = f.status.toLowerCase().trim();
      const reportStatus = String(report.Status || '').toLowerCase().trim();
      if (reportStatus !== targetStatus) return false;
    }

    // 5. Date Range
    if (f.dateFrom || f.dateTo) {
      const rawDate = report.Date_Reported || report.Created_At;
      if (!rawDate) return false;
      const reportTime = new Date(rawDate).getTime();
      if (isNaN(reportTime)) return false;

      if (f.dateFrom) {
        const fromTime = new Date(f.dateFrom + 'T00:00:00').getTime();
        if (!isNaN(fromTime) && reportTime < fromTime) return false;
      }
      if (f.dateTo) {
        const toTime = new Date(f.dateTo + 'T23:59:59.999').getTime();
        if (!isNaN(toTime) && reportTime > toTime) return false;
      }
    }

    // 6. Section
    if (f.section) {
      const targetSection = f.section.toLowerCase().trim();
      const parsed = parseFn ? parseFn(report.Issue_Description) : { section: '' };
      const reportSection = (parsed.section || '').toLowerCase().trim();
      if (!reportSection.includes(targetSection)) return false;
    }

    return true;
  }

  /**
   * Evaluates if a report matches both active search query AND active filter criteria.
   * @param {Object} report
   * @param {string} [query]
   * @param {Object} [filters]
   * @returns {boolean}
   */
  function matchesReport(report, query, filters) {
    return matchesReportQuery(report, query) && matchesReportFilters(report, filters);
  }

  /**
   * Extracts available filter options dynamically from an array of reports.
   * @param {Array} [reports]
   * @returns {{issueTypes: Array<string>, rooms: Array<string>, pcs: Array<string>, pcsByRoom: Object, sections: Array<string>}}
   */
  function extractFilterOptions(reports = []) {
    const issueTypesSet = new Set(['Monitor', 'Keyboard', 'Mouse', 'System Unit', 'PC/Laptop', 'Other']);
    const roomsSet = new Set(['203', '204']);
    const pcMap = new Map();
    const allPcsSet = new Set();
    const sectionsSet = new Set();

    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function'
      ? parser.parseIssueDescription
      : (typeof global.parseIssueDescription === 'function' ? global.parseIssueDescription : null);

    if (Array.isArray(reports)) {
      reports.forEach(r => {
        if (r.Issue_Type && r.Issue_Type !== 'None') {
          issueTypesSet.add(r.Issue_Type.trim());
        }
        if (r.Room_Number != null) {
          const room = String(r.Room_Number).trim();
          if (room) roomsSet.add(room);
        }
        if (r.PC_Number != null) {
          const pc = String(r.PC_Number).trim();
          if (pc) {
            allPcsSet.add(pc);
            const roomKey = String(r.Room_Number || '').trim();
            if (roomKey) {
              if (!pcMap.has(roomKey)) pcMap.set(roomKey, new Set());
              pcMap.get(roomKey).add(pc);
            }
          }
        }
        if (parseFn && r.Issue_Description) {
          const parsed = parseFn(r.Issue_Description);
          if (parsed.section && parsed.section !== 'N/A' && parsed.section !== 'None') {
            sectionsSet.add(parsed.section.trim());
          }
          if (!r.Issue_Type || r.Issue_Type === 'None') {
            if (parsed.issues && parsed.issues !== 'None') {
              parsed.issues.split(',').forEach(i => {
                const cleaned = i.trim();
                if (cleaned && cleaned.toLowerCase() !== 'none') {
                  issueTypesSet.add(cleaned);
                }
              });
            }
          }
        }
      });
    }

    const sortNatural = (a, b) => {
      const numA = parseInt(String(a).replace(/\D/g, ''), 10);
      const numB = parseInt(String(b).replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b));
    };

    return {
      issueTypes: Array.from(issueTypesSet).sort(),
      rooms: Array.from(roomsSet).sort(sortNatural),
      pcs: Array.from(allPcsSet).sort(sortNatural),
      pcsByRoom: Object.fromEntries(
        Array.from(pcMap.entries()).map(([k, set]) => [k, Array.from(set).sort(sortNatural)])
      ),
      sections: Array.from(sectionsSet).sort()
    };
  }

  const reportFilters = {
    matchesReportQuery,
    filterByTimeRange,
    getActiveFilters,
    setActiveFilters,
    resetFilters,
    countActiveFilters,
    validateDateRange,
    matchesReportFilters,
    matchesReport,
    extractFilterOptions
  };

  global.reportFilters = reportFilters;
  global.matchesReportQuery = matchesReportQuery;

})(typeof window !== 'undefined' ? window : this);
