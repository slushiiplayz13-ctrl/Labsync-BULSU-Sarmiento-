/**
 * LabSync Report Renderer | js/reports/report.renderer.js
 * Generates HTML components for report cards, modal history items, empty states, and status badges.
 */

(function (global) {
  'use strict';

  function getEscapeFn() {
    return global.escapeHtml || window.escapeHtml || ((s) => s || '');
  }

  function formatTicketDate(rawDate) {
    if (!rawDate) return 'N/A';
    const dateObj = new Date(rawDate);
    if (isNaN(dateObj.getTime())) return 'N/A';
    const datePart = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timePart = dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    return `${datePart}, ${timePart}`;
  }

  function formatIssueBadges(issuesStr, isEmptyRemarks, escapeFn) {
    const rawIssuesList = (issuesStr || '').split(',').map(comp => comp.trim()).filter(Boolean);
    const validIssues = rawIssuesList.filter(comp => {
      const lower = comp.toLowerCase();
      return lower !== 'none' && lower !== 'n/a';
    });

    if (validIssues.length === 0) {
      if (!isEmptyRemarks) {
        return `<span class="issue-badge-other"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> Others</span>`;
      }
      return `<span class="issue-badge-none"><i data-lucide="check-circle-2" style="width:12px;height:12px;"></i> No Faults</span>`;
    }

    return validIssues.map(comp => {
      const lower = comp.toLowerCase();
      if (lower === 'others' || lower === 'other') {
        return `<span class="issue-badge-other"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> Others</span>`;
      }
      return `<span class="issue-badge-fault"><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> ${escapeFn(comp)}</span>`;
    }).join(' ');
  }

  /**
   * Shared ticket card renderer enforcing unified field ordering, typography, and layout.
   * Keeps card summary clean and leaves full metadata (Ticket ID, reporter, section) for the View Full Report modal.
   * @param {Object} report
   * @param {Object} [options]
   * @param {boolean} [options.isModal=false]
   * @returns {string} HTML markup
   */
  function renderTicketCard(report, options = {}) {
    const escapeFn = getEscapeFn();
    const isModal = Boolean(options.isModal);

    const reportId = report.Report_ID != null ? report.Report_ID : (report.Issue_ID || '');
    const statusStr = (report.Status || 'Pending').trim();
    const isResolved = statusStr.toLowerCase() === 'resolved';
    const badgeClass = isResolved ? 'resolved' : 'pending';
    const actualBadgeLabel = isResolved ? 'RESOLVED' : statusStr.toUpperCase();

    // Timestamp: Resolved tickets display the year dynamically; falls back to Date_Reported or Created_At
    const rawDate = isResolved
      ? (report.Resolved_At || report.Date_Reported || report.Created_At)
      : (report.Date_Reported || report.Created_At);
    const formattedDate = formatTicketDate(rawDate);

    // Parse issue description
    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function' ? parser.parseIssueDescription : (global.parseIssueDescription || (() => ({})));
    const parsed = parseFn(report.Issue_Description) || { section: 'N/A', issues: report.Issue_Type || 'None', remarks: '' };

    const rawRemarks = (parsed.remarks || '').trim();
    const lowerRemarks = rawRemarks.toLowerCase();
    const isEmptyRemarks = !rawRemarks ||
      lowerRemarks === 'none' ||
      lowerRemarks === 'n/a' ||
      lowerRemarks === 'no remarks provided' ||
      lowerRemarks === 'no additional remarks provided' ||
      lowerRemarks === 'no details provided.' ||
      lowerRemarks === 'none.';

    const issuesBadgesHtml = formatIssueBadges(parsed.issues || report.Issue_Type, isEmptyRemarks, escapeFn);

    const roomNum = report.Room_Number != null ? report.Room_Number : 'N/A';
    const pcNum = report.PC_Number != null ? report.PC_Number : 'N/A';

    // Actions block: pending cards retain action buttons
    let actionsHtml = '';
    const currentPage = (typeof document !== 'undefined' && document.body) ? document.body.dataset.page : '';
    if (currentPage === 'mis-pc-reports' || currentPage === 'mis-maintenance' || currentPage === 'mis-dashboard') {
      if (!isResolved) {
        actionsHtml = `
          <button type="button" class="btn-action resolve" onclick="window.updateReportStatus(${reportId}, 'Resolved')">
            <i data-lucide="check" style="width:13px;height:13px;"></i>Resolve Ticket
          </button>
        `;
      }
    }

    // Uniform remarks callout box
    let remarksHtml = '';
    if (isEmptyRemarks) {
      remarksHtml = `
        <div class="remarks-box empty-remarks">
          <i data-lucide="message-square" class="remarks-box-icon"></i>
          <span class="remarks-box-text" style="font-style:italic; font-size:12.5px;">No additional remarks provided</span>
        </div>
      `;
    } else {
      remarksHtml = `
        <div class="remarks-box">
          <i data-lucide="message-square" class="remarks-box-icon"></i>
          <span class="remarks-box-text preview-clamped">${escapeFn(rawRemarks)}</span>
        </div>
      `;
    }

    // Header date: resolved tickets display the date with the year in the header
    const dateBadgeHtml = isResolved
      ? `<span class="modal-ticket-date">${formattedDate}</span>`
      : '';

    const containerClasses = isModal
      ? 'report-card modal-ticket-card'
      : 'report-card';

    return `
      <div class="${containerClasses}" data-report-id="${reportId}">
        <!-- Tier 1: Header Row (Asset Info on Left, Status Badge on Right) -->
        <div class="report-card-header">
          <div class="rc-asset-row">
            <div class="rc-asset-icon">
              <i data-lucide="monitor" style="width:16px;height:16px;"></i>
            </div>
            <span class="rc-asset-title">Room ${roomNum} – PC ${pcNum}</span>
          </div>
          <div class="rc-header-right">
            ${dateBadgeHtml}
            <span class="status-badge ${badgeClass}">${actualBadgeLabel}</span>
          </div>
        </div>

        <!-- Tier 2: Middle Row (Reported Issue on Left, View Full Report on Right) -->
        <div class="report-card-middle-row">
          <div class="rc-issue-block">
            <span class="rc-block-label">REPORTED ISSUE</span>
            <div class="rc-badges-list">
              ${issuesBadgesHtml}
            </div>
          </div>
          <div class="rc-action-block">
            <button type="button" class="btn-view-full-report" data-action="view-ticket-details" data-report-id="${reportId}" aria-label="View full report for Room ${roomNum} PC ${pcNum}">
              <span>View Full Report</span>
              <i data-lucide="arrow-up-right" style="width:12px;height:12px;"></i>
            </button>
            ${actionsHtml}
          </div>
        </div>

        <!-- Tier 3: Bottom Row (Remarks & Problem Details) -->
        <div class="report-card-remarks-section">
          <span class="rc-block-label">REMARKS & PROBLEM DETAILS</span>
          ${remarksHtml}
        </div>
      </div>
    `;
  }

  /**
   * Renders a single active or resolved PC issue report card on the reports page.
   * @param {Object} report
   * @returns {string} HTML markup
   */
  function renderSingleCard(report) {
    return renderTicketCard(report, { isModal: false });
  }

  /**
   * Renders a resolved ticket card inside the completed tickets history modal.
   * @param {Object} report
   * @returns {string} HTML markup
   */
  function renderModalTicketCard(report) {
    return renderTicketCard(report, { isModal: true });
  }

  const reportRenderer = {
    formatTicketDate,
    formatIssueBadges,
    renderTicketCard,
    renderSingleCard,
    renderModalTicketCard
  };

  global.reportRenderer = reportRenderer;
  global.formatTicketDate = formatTicketDate;
  global.renderSingleCard = renderSingleCard;
  global.renderModalTicketCard = renderModalTicketCard;

})(typeof window !== 'undefined' ? window : this);
