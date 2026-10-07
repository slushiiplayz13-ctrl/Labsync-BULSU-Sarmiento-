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

  function formatIssueBadges(issuesStr, isEmptyRemarks, escapeFn, options = {}) {
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

    const isCompact = Boolean(options && options.isCompact);
    const extraStyle = isCompact ? ' style="font-size:11.5px;padding:3px 9px;border-radius:6px;gap:4px;"' : '';
    const iconSize = isCompact ? '11px' : '12px';

    function renderBadge(comp) {
      const lower = comp.toLowerCase();
      if (lower === 'others' || lower === 'other') {
        return `<span class="issue-badge-other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Others</span>`;
      }
      return `<span class="issue-badge-fault"${extraStyle}><i data-lucide="alert-triangle" style="width:${iconSize};height:${iconSize};"></i> ${escapeFn(comp)}</span>`;
    }

    const isModal = Boolean(options && options.isModal);
    if (!isModal && validIssues.length > 1) {
      const reportId = options && options.reportId != null ? options.reportId : '';
      const actionAttr = reportId
        ? ` data-action="view-ticket-details" data-report-id="${reportId}" role="button" tabindex="0"`
        : '';
      const interactiveClass = reportId ? ' interactive' : '';
      return `<span class="issue-badge-fault${interactiveClass}"${actionAttr}><i data-lucide="alert-triangle" style="width:12px;height:12px;"></i> Multiple Issues (${validIssues.length})</span>`;
    }

    return validIssues.map(renderBadge).join(' ');
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

    const maxBadges = (options && typeof options.maxBadges === 'number')
      ? options.maxBadges
      : (isModal ? null : 1);

    const issuesBadgesHtml = formatIssueBadges(
      parsed.issues || report.Issue_Type,
      isEmptyRemarks,
      escapeFn,
      {
        maxBadges,
        reportId,
        isModal
      }
    );

    const roomNum = report.Room_Number != null ? report.Room_Number : 'N/A';
    const pcNum = report.PC_Number != null ? report.PC_Number : 'N/A';

    // Actions block: pending cards retain action buttons
    let actionsHtml = '';
    const currentPage = (typeof document !== 'undefined' && document.body) ? document.body.dataset.page : '';

    function isITDeptHeadUser() {
      if (options && options.userRole) {
        const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
        return itHeadAliases.includes(options.userRole);
      }
      try {
        const rawUser = (typeof global !== 'undefined' && global.currentUser) ||
          JSON.parse(
            (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('labsync_user')) ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('user')) ||
            'null'
          );
        const user = (rawUser && (rawUser.user || rawUser)) || null;
        const role = String((user && (user.role || user.Role)) || '').trim();
        const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
        return itHeadAliases.includes(role);
      } catch (e) {
        return false;
      }
    }

    function isFollowedUpToday(r) {
      if (r.Followed_Up_Today === true || r.Followed_Up_Today === 1) return true;
      if (r.Followed_Up_At) {
        try {
          const fuDate = new Date(r.Followed_Up_At);
          const nowDate = new Date();
          return !isNaN(fuDate.getTime()) &&
            fuDate.getFullYear() === nowDate.getFullYear() &&
            fuDate.getMonth() === nowDate.getMonth() &&
            fuDate.getDate() === nowDate.getDate();
        } catch (e) {
          return false;
        }
      }
      return false;
    }

    if (currentPage === 'mis-pc-reports' || currentPage === 'mis-maintenance' || currentPage === 'mis-dashboard') {
      if (!isResolved) {
        actionsHtml = `
          <button type="button" class="btn-action resolve" onclick="window.updateReportStatus(${reportId}, 'Resolved')">
            <i data-lucide="check" style="width:13px;height:13px;"></i>Resolve Ticket
          </button>
        `;
      }
    } else if (!isModal && !isResolved && isITDeptHeadUser() && (currentPage === 'pc-reports' || currentPage === 'it-head-pc-reports' || !currentPage)) {
      if (isFollowedUpToday(report)) {
        actionsHtml = `
          <button type="button" class="btn-card-followup disabled" disabled title="Followed up today. Next follow-up available tomorrow." aria-label="Followed up today for Room ${roomNum} PC ${pcNum}">
            <i data-lucide="check" style="width:12px;height:12px;"></i>
            <span>Followed Up Today</span>
          </button>
        `;
      } else {
        actionsHtml = `
          <button type="button" class="btn-card-followup" data-action="followup-ticket" data-report-id="${reportId}" title="Follow up this unresolved report" aria-label="Follow up ticket for Room ${roomNum} PC ${pcNum}">
            <i data-lucide="bell-ring" style="width:12px;height:12px;"></i>
            <span>Follow Up</span>
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

    // Resolution identity mini-block for resolved cards
    let resolutionStripHtml = '';
    if (isResolved) {
      let resDateFormatted = formattedDate;
      if (report.Resolved_At) {
        const resDateObj = new Date(report.Resolved_At);
        if (!isNaN(resDateObj.getTime())) {
          resDateFormatted = resDateObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }) + ' • ' + resDateObj.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        }
      }

      if (report.Resolved_By_Name) {
        const resolverTitle = `Resolved by ${escapeFn(report.Resolved_By_Name)} (${escapeFn(report.Resolved_By_Role || 'MIS Staff')})`;
        resolutionStripHtml = `
          <div class="rc-card-resolution" title="${resolverTitle}">
            <span class="rc-card-res-who">
              <i data-lucide="user" class="rc-card-res-icon"></i>
              <span class="rc-card-res-name">${escapeFn(report.Resolved_By_Name)}</span>
              <span class="rc-card-res-role">${escapeFn(report.Resolved_By_Role || 'MIS Staff')}</span>
            </span>
            <span class="rc-card-res-dot">•</span>
            <span class="rc-card-res-when">
              <i data-lucide="clock" class="rc-card-res-time-icon"></i>
              ${resDateFormatted}
            </span>
          </div>
        `;
      } else {
        resolutionStripHtml = `
          <div class="rc-card-resolution">
            <span class="rc-card-res-who">
              <i data-lucide="check-check" class="rc-card-res-icon" style="color:#059669;"></i>
              <span class="rc-card-res-name">Work Order Completed</span>
            </span>
            <span class="rc-card-res-dot">•</span>
            <span class="rc-card-res-when">
              <i data-lucide="clock" class="rc-card-res-time-icon"></i>
              ${resDateFormatted}
            </span>
          </div>
        `;
      }
    }

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
          <div class="rc-header-right" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            ${report.Follow_Up_Count > 0 ? `
              <span class="status-badge" style="background:#FEF3C7; color:#D97706; display:inline-flex; align-items:center; gap:4px;" title="Followed up by ${escapeFn(report.Followed_Up_By_Name || 'IT Dept. Head')}${report.Followed_Up_At ? ' on ' + formatTicketDate(report.Followed_Up_At) : ''} (${report.Follow_Up_Count}x)">
                <i data-lucide="bell-ring" style="width:11px;height:11px;"></i> FOLLOW-UP: ${report.Follow_Up_Count}X
              </span>
            ` : ''}
            <span class="status-badge ${badgeClass}">${actualBadgeLabel}</span>
          </div>
        </div>

        ${resolutionStripHtml}

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
  function renderSingleCard(report, options = {}) {
    return renderTicketCard(report, { ...options, isModal: false });
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
