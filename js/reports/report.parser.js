/**
 * LabSync Report Parser | js/reports/report.parser.js
 * Pure string parsing utility for extracting Program & Section, Issues, and Remarks from report descriptions.
 */

(function (global) {
  'use strict';

  /**
   * Parses raw issue description string into section, issues list, and remarks.
   * @param {string} desc - Raw issue description text
   * @returns {{section: string, issues: string, remarks: string}}
   */
  function parseIssueDescription(desc) {
    if (!desc) {
      return { section: 'N/A', issues: 'None', remarks: 'No details provided.' };
    }

    const sectionMatch = desc.match(/\[Program & Section:\s*([^\]]+)\]/i);
    const issuesMatch = desc.match(/\[Issues:\s*([^\]]+)\]/i);
    const remarksMatch = desc.match(/Remarks:\s*(.*)$/is);

    const section = sectionMatch ? sectionMatch[1].trim() : 'N/A';
    const issues = issuesMatch ? issuesMatch[1].trim() : 'None';
    let remarks = remarksMatch ? remarksMatch[1].trim() : '';

    if (!remarks) {
      if (!desc.includes('[') && !desc.includes(']')) {
        remarks = desc.trim();
      } else {
        remarks = desc
          .replace(/\[Program & Section:[^\]]+\]/gi, '')
          .replace(/\[Issues:[^\]]+\]/gi, '')
          .replace(/Remarks:/gi, '')
          .trim();
      }
    }

    if (!remarks) remarks = 'No remarks provided.';

    return { section, issues, remarks };
  }

  const reportParser = {
    parseIssueDescription
  };

  global.reportParser = reportParser;
  global.parseIssueDescription = parseIssueDescription;

})(typeof window !== 'undefined' ? window : this);
