/**
 * LabSync Report Renderer | js/reports/report.renderer.js
 * Generates HTML components for report cards, modal history items, empty states, and status badges.
 */

(function (global) {
  'use strict';

  function getEscapeFn() {
    return global.escapeHtml || window.escapeHtml || ((s) => s || '');
  }

  /**
   * Renders a single active or resolved PC issue report card.
   * @param {Object} report
   * @returns {string} HTML markup
   */
  function renderSingleCard(report) {
    const escapeFn = getEscapeFn();
    const dateObj = report.Date_Reported ? new Date(report.Date_Reported) : new Date();
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function' ? parser.parseIssueDescription : (global.parseIssueDescription || (() => ({})));
    const parsed = parseFn(report.Issue_Description) || { section: 'N/A', issues: 'None', remarks: '' };

    const rawRemarks = (parsed.remarks || '').trim();
    const lowerRemarks = rawRemarks.toLowerCase();
    const isNone = !rawRemarks ||
      lowerRemarks === 'none' ||
      lowerRemarks === 'n/a' ||
      lowerRemarks === 'no remarks provided' ||
      lowerRemarks === 'no additional remarks provided' ||
      lowerRemarks === 'no details provided.' ||
      lowerRemarks === 'none.';

    let remarksHtml = '';
    if (isNone) {
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

    // Format Reported Issues
    const rawIssuesList = (parsed.issues || '').split(',').map(comp => comp.trim()).filter(Boolean);
    const validIssues = rawIssuesList.filter(comp => {
      const lower = comp.toLowerCase();
      return lower !== 'none' && lower !== 'n/a';
    });

    let issuesBadgesHtml = '';
    if (validIssues.length === 0) {
      if (!isNone) {
        issuesBadgesHtml = `<span class="issue-badge-other"><i data-lucide="alert-circle"></i> Others</span>`;
      } else {
        issuesBadgesHtml = `<span class="issue-badge-none"><i data-lucide="check-circle-2"></i> No Faults</span>`;
      }
    } else {
      const firstIssue = validIssues[0];
      const lower = firstIssue.toLowerCase();
      let primaryBadgeHtml = '';

      if (lower === 'others' || lower === 'other') {
        primaryBadgeHtml = `<span class="issue-badge-other"><i data-lucide="alert-circle" style="width:11px;height:11px;"></i> Others</span>`;
      } else {
        primaryBadgeHtml = `<span class="issue-badge-fault"><i data-lucide="alert-triangle" style="width:11px;height:11px;"></i> ${escapeFn(firstIssue)}</span>`;
      }

      if (validIssues.length > 1) {
        const extraCount = validIssues.length - 1;
        const extraBadgeHtml = `
          <span class="issue-badge-more">+${extraCount} other issue${extraCount > 1 ? 's' : ''}</span>
        `;
        issuesBadgesHtml = `${primaryBadgeHtml} ${extraBadgeHtml}`;
      } else {
        issuesBadgesHtml = primaryBadgeHtml;
      }
    }

    let actionsHtml = '';
    const statusStr = report.Status || 'Pending';
    const currentPage = document.body ? document.body.dataset.page : '';

    if (currentPage === 'mis-pc-reports' || currentPage === 'mis-maintenance' || currentPage === 'mis-dashboard') {
      if (statusStr.toLowerCase() === 'pending' || statusStr.toLowerCase() === 'in progress') {
        actionsHtml = `
          <button class="btn-action resolve" onclick="window.updateReportStatus(${report.Report_ID}, 'Resolved')">
            <i data-lucide="check" style="width:13px;height:13px;"></i>Resolve Ticket
          </button>
        `;
      }
    }

    const studentName = report.Student_Name || 'Student';
    const roomNum = report.Room_Number != null ? report.Room_Number : 'N/A';
    const pcNum = report.PC_Number != null ? report.PC_Number : 'N/A';

    const isResolved = (report.Status || '').toLowerCase() === 'resolved';
    const badgeClass = isResolved ? 'resolved' : 'pending';
    const actualBadgeLabel = isResolved ? 'RESOLVED' : 'PENDING';

    return `
      <div class="report-card">
        <!-- Tier 1: Header Row (Asset Info on Left, Status Badge on Right) -->
        <div class="report-card-header">
          <div class="rc-asset-row">
            <div class="rc-asset-icon">
              <i data-lucide="monitor" style="width:16px;height:16px;"></i>
            </div>
            <span class="rc-asset-title">Room ${roomNum} – PC ${pcNum}</span>
          </div>
          <div class="rc-header-right">
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
            <button type="button" class="btn-view-full-report" data-action="view-ticket-details" data-report-id="${report.Report_ID}" aria-label="View full report for Room ${roomNum} PC ${pcNum}">
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
   * Renders a resolved ticket card inside the completed tickets history modal.
   * @param {Object} report
   * @returns {string} HTML markup
   */
  function renderModalTicketCard(report) {
    const escapeFn = getEscapeFn();
    const dateObj = report.Date_Reported ? new Date(report.Date_Reported) : new Date();
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: dateObj.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit'
    });

    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function' ? parser.parseIssueDescription : (global.parseIssueDescription || (() => ({})));
    const parsed = parseFn(report.Issue_Description) || { section: 'N/A', issues: 'None', remarks: '' };

    const rawRemarks = (parsed.remarks || '').trim();
    const isEmptyRemarks = !rawRemarks || rawRemarks.toLowerCase() === 'none' || rawRemarks.toLowerCase() === 'no remarks provided.';

    const studentName = report.Student_Name || 'Student';
    const roomNum = report.Room_Number != null ? report.Room_Number : 'N/A';
    const pcNum = report.PC_Number != null ? report.PC_Number : 'N/A';

    const issuePillsHtml = (parsed.issues || '').split(',').map(comp => comp.trim()).filter(Boolean).map(comp => {
      const lower = comp.toLowerCase();
      if (lower === 'none' || lower === 'n/a') {
        if (!isEmptyRemarks) {
          return `<span class="issue-badge-other" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; padding:3px 9px; border-radius:6px; background:#FEF3C7; color:#D97706; border:1px solid #FDE68A;"><i data-lucide="alert-circle" style="width:13px;height:13px;"></i> Others</span>`;
        }
        return `<span class="issue-badge-none" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; padding:3px 9px; border-radius:6px; background:#F1F5F9; color:#475569; border:1px solid #E2E8F0;"><i data-lucide="check-circle-2" style="width:13px;height:13px;color:#10B981;"></i> No Faults</span>`;
      }
      if (lower === 'others' || lower === 'other') {
        return `<span class="issue-badge-other" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; padding:3px 9px; border-radius:6px; background:#FEF3C7; color:#D97706; border:1px solid #FDE68A;"><i data-lucide="alert-circle" style="width:13px;height:13px;"></i> Others</span>`;
      }
      return `<span class="issue-badge-fault" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:750; padding:3px 9px; border-radius:6px; background:#FEF2F2; color:#DC2626; border:1px solid #FCA5A5;"><i data-lucide="alert-triangle" style="width:13px;height:13px;"></i> ${escapeFn(comp)}</span>`;
    }).join('');

    return `
      <div class="modal-ticket-card">
        <!-- Card Header -->
        <div class="modal-ticket-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="modal-ticket-id">LS-TKT-${report.Report_ID}</span>
            <span class="modal-ticket-date">${formattedDate}</span>
          </div>
          <span class="status-badge resolved" style="font-size: 11px; padding: 3px 10px;">RESOLVED</span>
        </div>

        <!-- Asset, Issue & Reporter Info Row -->
        <div class="modal-ticket-content-row">
          <div class="modal-ticket-asset">
            <div class="modal-ticket-asset-icon">
              <i data-lucide="monitor" style="width: 17px; height: 17px;"></i>
            </div>
            <div>
              <div class="modal-ticket-asset-name">Room ${roomNum} – PC ${pcNum}</div>
              <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap;">
                ${issuePillsHtml}
              </div>
            </div>
          </div>

          <div class="modal-ticket-reporter">
            <i data-lucide="user" style="width: 14px; height: 14px; color: var(--text-muted);"></i>
            <span>${escapeFn(studentName)}</span>
            ${parsed.section ? `<span style="font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: #F1F5F9; color: var(--text-mid);">${escapeFn(parsed.section)}</span>` : ''}
          </div>
        </div>

        <!-- Full-Width Remarks Callout -->
        <div class="modal-ticket-remarks">
          <div class="modal-remarks-header">
            <i data-lucide="message-square" style="width: 12px; height: 12px;"></i>
            <span>Remarks & Problem Details</span>
          </div>
          <div class="modal-remarks-body ${isEmptyRemarks ? 'is-empty' : ''}">
            ${isEmptyRemarks ? 'No additional remarks provided' : `"${escapeFn(rawRemarks)}"`}
          </div>
        </div>
      </div>
    `;
  }

  const reportRenderer = {
    renderSingleCard,
    renderModalTicketCard
  };

  global.reportRenderer = reportRenderer;
  global.renderSingleCard = renderSingleCard;
  global.renderModalTicketCard = renderModalTicketCard;

})(typeof window !== 'undefined' ? window : this);
