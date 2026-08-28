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
    const isEmptyRemarksText = !rawRemarks || rawRemarks.toLowerCase() === 'none' || rawRemarks.toLowerCase() === 'no remarks provided.';
    const formattedRemarks = isEmptyRemarksText ? 'None' : escapeFn(rawRemarks);

    let actionsHtml = '';
    const statusStr = report.Status || 'Pending';
    const currentPage = document.body ? document.body.dataset.page : '';

    if (currentPage === 'mis-pc-reports' || currentPage === 'mis-maintenance' || currentPage === 'mis-dashboard') {
      if (statusStr.toLowerCase() === 'pending' || statusStr.toLowerCase() === 'in progress') {
        actionsHtml = `
          <button class="btn-action resolve" onclick="window.updateReportStatus(${report.Report_ID}, 'Resolved')">
            <i data-lucide="check" style="width:14px;height:14px;"></i>Resolve Ticket
          </button>
        `;
      } else if (statusStr.toLowerCase() === 'resolved') {
        actionsHtml = `
          <span class="completed-chip" style="font-size:13px; padding:6px 14px;"><i data-lucide="check-check" style="width:14px;height:14px;"></i> Ticket Completed</span>
        `;
      }
    }

    const studentName = report.Student_Name || 'Student';
    const roomNum = report.Room_Number != null ? report.Room_Number : 'N/A';
    const pcNum = report.PC_Number != null ? report.PC_Number : 'N/A';

    const isResolved = (report.Status || '').toLowerCase() === 'resolved';
    const badgeClass = isResolved ? 'resolved' : 'pending';
    const badgeLabel = isResolved ? 'RESOLVED' : 'PENDING';

    return `
      <div class="report-card">
        <!-- Card Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-family:var(--font-display); font-weight:700; font-size:14px; color:var(--primary-teal);">LS-TKT-${report.Report_ID}</span>
            <span style="font-size:11px; font-weight:600; padding:4px 10px; border-radius:99px; background:#F1F5F9; color:var(--text-mid);">${formattedDate}</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="status-badge ${badgeClass}">
              ${badgeLabel}
            </span>
          </div>
        </div>

        <!-- Card Body -->
        <div class="report-card-body">
          <!-- Left Column: Asset, Issues & Reporter -->
          <div class="report-card-info">
            <!-- Location & PC -->
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:8px; background:#E0F2FE; color:#0284C7; flex-shrink:0;">
                <i data-lucide="monitor" style="width:17px;height:17px;"></i>
              </div>
              <div style="font-size:15px; font-weight:800; color:var(--text-dark);">Room ${roomNum} – PC ${pcNum}</div>
            </div>

            <!-- Hardware Issues -->
            <div style="margin-left: 2px;">
              <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.4px; display:block; margin-bottom:4px;">Reported Issue</span>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${(parsed.issues || '').split(',').map(comp => comp.trim()).filter(Boolean).map(comp => {
                  const lower = comp.toLowerCase();
                  if (lower === 'none' || lower === 'n/a') {
                    if (!isEmptyRemarksText) {
                      return `<span class="issue-badge-other" style="display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:700; padding:4px 11px; border-radius:8px; background:#FEF3C7; color:#D97706; border:1.5px solid #FDE68A; box-shadow:0 1px 3px rgba(217,119,6,0.08);"><i data-lucide="alert-circle" style="width:14px;height:14px;color:#D97706;"></i> Others</span>`;
                    }
                    return `<span class="issue-badge-none" style="display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:600; padding:4px 10px; border-radius:8px; background:#F1F5F9; color:#475569; border:1px solid #E2E8F0;"><i data-lucide="check-circle-2" style="width:13px;height:13px;color:#10B981;"></i> No Faults</span>`;
                  }
                  if (lower === 'others' || lower === 'other') {
                    return `<span class="issue-badge-other" style="display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:700; padding:4px 11px; border-radius:8px; background:#FEF3C7; color:#D97706; border:1.5px solid #FDE68A; box-shadow:0 1px 3px rgba(217,119,6,0.08);"><i data-lucide="alert-circle" style="width:14px;height:14px;color:#D97706;"></i> Others</span>`;
                  }
                  return `<span class="issue-badge-fault" style="display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:800; padding:4px 11px; border-radius:8px; background:#FEF2F2; color:#DC2626; border:1.5px solid #FCA5A5; box-shadow:0 1px 3px rgba(220,38,38,0.08);"><i data-lucide="alert-triangle" style="width:14px;height:14px;color:#EF4444;"></i> ${escapeFn(comp)}</span>`;
                }).join('')}
              </div>
            </div>
            
            <!-- Reporter -->
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12.5px; font-weight:600; color:var(--text-mid); margin-left:2px;">
              <i data-lucide="user" style="width:13.5px;height:13.5px;color:var(--text-muted);"></i>
              <span>${escapeFn(studentName)}</span>
              <span style="font-size:11px; font-weight:700; padding:2px 7px; border-radius:4px; background:#F1F5F9; color:var(--text-mid);">${escapeFn(parsed.section)}</span>
            </div>
          </div>

          <!-- Right Column: Student Remarks -->
          <div class="report-card-remarks">
            <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.4px; display:block; margin-bottom:4px;">Remarks & Problem Details</span>
            ${isEmptyRemarksText ? `
              <div class="remarks-box is-empty">
                <i data-lucide="file-text" class="remarks-empty-icon"></i>
                <span>No additional remarks provided</span>
              </div>
            ` : `
              <div class="remarks-box">
                <div class="remarks-content">
                  <i data-lucide="message-square" class="remarks-quote-icon"></i>
                  <span class="remarks-text">${escapeFn(rawRemarks)}</span>
                </div>
              </div>
            `}
          </div>
        </div>

        <!-- Card Actions -->
        ${actionsHtml ? `
        <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; margin-top: 2px;">
          ${actionsHtml}
        </div>` : ''}
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
