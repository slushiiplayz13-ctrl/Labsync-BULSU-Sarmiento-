/**
 * LabSync – MIS Staff Dashboard Reports Module  |  js/pages/mis-staff-dashboard/staff-dashboard.reports.js
 * Encapsulates the recent PC reports table rendering, live search filtering, canonical report parsing, and ticket resolution.
 */

(function (global) {
  'use strict';

  /**
   * Safe HTML string escaper.
   * @param {string} str
   * @returns {string}
   */
  function escapeText(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Formats the display issue category using canonical reportParser.
   * @param {string} rawDesc
   * @returns {string}
   */
  function getDisplayIssue(rawDesc) {
    if (!rawDesc) return 'None';

    const parserFn = (global.reportParser && typeof global.reportParser.parseIssueDescription === 'function')
      ? global.reportParser.parseIssueDescription
      : (typeof global.parseIssueDescription === 'function' ? global.parseIssueDescription : null);

    let issues = '';
    let remarks = '';

    if (typeof parserFn === 'function') {
      const parsed = parserFn(rawDesc);
      issues = parsed.issues || '';
      remarks = parsed.remarks || '';
    } else {
      const issuesMatch = rawDesc.match(/\[Issues:\s*([^\]]+)\]/i);
      const remarksMatch = rawDesc.match(/Remarks:\s*(.*)$/is);
      issues = issuesMatch ? issuesMatch[1].trim() : '';
      remarks = remarksMatch ? remarksMatch[1].trim() : '';
    }

    const hasRemarks = remarks.length > 0 &&
      remarks.toLowerCase() !== 'none' &&
      remarks.toLowerCase() !== 'no remarks provided';

    const lowerIssue = issues.toLowerCase();
    if (!issues || lowerIssue === 'none' || lowerIssue === 'n/a') {
      return hasRemarks ? 'Other' : 'None';
    } else if (lowerIssue === 'others' || lowerIssue === 'other') {
      return 'Other';
    }
    return issues;
  }

  /**
   * Computes a deterministic signature of the rendered reports dataset and active search query.
   * @param {Array} reports
   * @param {string} query
   * @returns {string}
   */
  function computeReportsSignature(reports, query = '') {
    if (!Array.isArray(reports) || reports.length === 0) return 'empty:' + query;
    return query + '::' + reports.slice(0, 10).map(r =>
      `${r.Report_ID}_${r.Status}_${r.Date_Reported}_${r.Room_Number}_${r.PC_Number}_${r.Issue_Description || ''}`
    ).join('|');
  }

  /**
   * Renders the recent PC reports table rows.
   * @param {Array} reports - List of report objects
   * @param {HTMLElement} [targetTbody] - Target table body element
   */
  function renderDashboardTable(reports, targetTbody) {
    const tbody = targetTbody || document.getElementById('misDashboardReportRows');
    if (!tbody) return;

    const searchInput = document.getElementById('dashboardSearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (!Array.isArray(reports) || reports.length === 0) {
      const sig = 'empty:' + query;
      if (tbody.dataset.renderedSignature === sig) return;
      tbody.dataset.renderedSignature = sig;
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px;">
            No PC reports available. Reports will appear here when submitted.
          </td>
        </tr>
      `;
      return;
    }

    const filtered = reports.filter(r => {
      if (!query) return true;
      const tkt = `ls-tkt-${r.Report_ID}`.toLowerCase();
      const room = `room ${r.Room_Number}`.toLowerCase();
      const pc = `pc ${r.PC_Number}`.toLowerCase();
      const desc = (r.Issue_Description || '').toLowerCase();
      return tkt.includes(query) || room.includes(query) || pc.includes(query) || desc.includes(query);
    });

    const signature = computeReportsSignature(filtered, query);
    if (tbody.dataset.renderedSignature === signature) {
      return; // Signature match: identical dataset, bypass DOM replacement and icon creation
    }
    tbody.dataset.renderedSignature = signature;

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px;">
            No reports match your search criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.slice(0, 10).map(r => {
      const dateObj = r.Date_Reported ? new Date(r.Date_Reported) : new Date();
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isResolved = (r.Status || '').toLowerCase() === 'resolved';
      const displayIssue = getDisplayIssue(r.Issue_Description);

      return `
        <tr class="table-data-row">
          <td class="table-cell ticket-id-cell">
            <a href="mis-maintenance.html" class="ticket-id-link">LS-TKT-${r.Report_ID}</a>
          </td>
          <td class="table-cell date-cell col-date">${formattedDate}</td>
          <td class="table-cell room-cell text-center">Room ${r.Room_Number || 'N/A'}</td>
          <td class="table-cell pc-cell text-center">PC ${r.PC_Number || 'N/A'}</td>
          <td class="table-cell issue-cell">${escapeText(displayIssue)}</td>
          <td class="table-cell text-center">
            <span class="status-pill ${isResolved ? 'resolved' : 'pending'}">
              ${r.Status || 'Pending'}
            </span>
          </td>
          <td class="table-cell text-center">
            ${!isResolved ? `
              <button onclick="resolveDashboardTicket(${r.Report_ID})" class="btn-resolve-ticket">
                Resolve
              </button>
            ` : `
              <span class="completed-chip"><i data-lucide="check-check"></i> Completed</span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbody });
    }
  }

  /**
   * Resolves a ticket by Report_ID and refreshes dashboard data.
   * @param {number|string} reportId
   * @param {Function} [onComplete] - Callback to reload data
   */
  async function resolveDashboardTicket(reportId, onComplete) {
    const confirmFn = global.showConfirmModal || (typeof window !== 'undefined' ? window.showConfirmModal : null);
    let confirmed = false;

    if (typeof confirmFn === 'function') {
      confirmed = await confirmFn({
        title: 'Resolve Ticket',
        message: `Are you sure you want to mark Ticket LS-TKT-${reportId} as Resolved?`,
        confirmText: 'Resolve Ticket',
        cancelText: 'Cancel',
        isDestructive: false
      });
    } else {
      confirmed = confirm(`Are you sure you want to resolve Ticket LS-TKT-${reportId}?`);
    }

    if (!confirmed) return;

    try {
      const updateFn = (global.reportService && typeof global.reportService.updateReportStatus === 'function')
        ? global.reportService.updateReportStatus
        : (typeof global.updateReportStatus === 'function' ? global.updateReportStatus : null);

      if (typeof updateFn !== 'function') {
        throw new Error('reportService.updateReportStatus is unavailable');
      }

      await updateFn(reportId, 'Resolved');

      if (typeof onComplete === 'function') {
        await onComplete();
      }

      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn(`Ticket LS-TKT-${reportId} resolved successfully.`, 'success');
      }
    } catch (err) {
      console.error('[StaffDashboardReports] Error resolving ticket:', err);
      const toastFn = global.showToast || (typeof window !== 'undefined' ? window.showToast : null);
      if (typeof toastFn === 'function') {
        toastFn('Failed to resolve ticket.', 'error');
      } else {
        alert('Failed to resolve ticket');
      }
    }
  }

  const staffDashboardReports = {
    renderDashboardTable,
    resolveDashboardTicket,
    getDisplayIssue
  };

  global.staffDashboardReports = staffDashboardReports;

})(typeof window !== 'undefined' ? window : this);
