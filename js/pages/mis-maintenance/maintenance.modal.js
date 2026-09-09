/**
 * LabSync – MIS Maintenance Ticket Details Modal  |  js/pages/mis-maintenance/maintenance.modal.js
 * Encapsulates the Ticket Details Modal overlay construction, DOM injection, and dismissal.
 */

(function (global) {
  'use strict';

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
   * Closes and removes the Ticket Details Modal from DOM if present.
   */
  function closeTicketModal() {
    const existingModal = document.getElementById('ticket-details-modal');
    if (existingModal) {
      if (typeof existingModal._cleanup === 'function') {
        existingModal._cleanup();
      }
      if (global.setModalOpenState) global.setModalOpenState(false);
      existingModal.remove();
    }
  }

  /**
   * Builds and presents the Ticket Details Modal overlay.
   * @param {number|string} reportId - ID of the report/issue to display
   * @param {Array} [reportsList] - Optional array of reports; defaults to global list
   */
  function viewTicketModal(reportId, reportsList) {
    const reports = reportsList || global.maintenanceReports || (typeof window !== 'undefined' ? window.maintenanceReports : []) || [];
    const report = reports.find(r => r && (String(r.Report_ID) === String(reportId) || String(r.Issue_ID) === String(reportId)));
    if (!report) return;

    const dateObj = new Date(report.Date_Reported || report.Created_At);
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const parserFn = (global.reportParser && typeof global.reportParser.parseIssueDescription === 'function')
      ? global.reportParser.parseIssueDescription
      : ((global.maintenanceRenderer && typeof global.maintenanceRenderer.parseIssueDesc === 'function')
        ? global.maintenanceRenderer.parseIssueDesc
        : null);

    const parsed = typeof parserFn === 'function'
      ? parserFn(report.Issue_Description)
      : { section: 'N/A', issues: report.Issue_Type || 'Hardware Issue', remarks: report.Issue_Description || 'None' };

    const badgeFormatter = (global.maintenanceRenderer && typeof global.maintenanceRenderer.formatIssueBadges === 'function')
      ? global.maintenanceRenderer.formatIssueBadges
      : (typeof global.formatIssueBadges === 'function' ? global.formatIssueBadges : () => '');

    const displayIssues = report.Issue_Type || parsed.issues;
    const issueBadges = badgeFormatter(displayIssues, parsed.remarks, true);

    closeTicketModal();

    const linkedReports = Array.isArray(report.reports) && report.reports.length > 0
      ? report.reports
      : [{
          Student_Name: report.Student_Name || 'Student',
          Issue_Description: report.Issue_Description,
          Date_Reported: report.Date_Reported || report.Created_At
        }];

    let bodyContentHtml = '';

    if (linkedReports.length === 1) {
      // ─── SINGLE STUDENT REPORT LAYOUT ─────────────────────────────────────
      const singleReport = linkedReports[0];
      const singleParsed = typeof parserFn === 'function'
        ? parserFn(singleReport.Issue_Description)
        : { section: 'N/A', remarks: singleReport.Issue_Description || 'None' };

      bodyContentHtml = `
        <div class="ticket-modal-body">
          <div class="ticket-modal-meta-card">
            <div class="ticket-modal-meta-cell">
              <div class="ticket-modal-meta-label">
                <i data-lucide="map-pin" style="width:13px;height:13px;color:var(--primary-teal);flex-shrink:0;"></i>
                <span>Location & Unit</span>
              </div>
              <div class="ticket-modal-meta-val">
                <span>Room ${escapeText(String(report.Room_Number || 'N/A'))}</span>
                <span style="opacity:0.4; margin:0 4px;">•</span>
                <span style="white-space:nowrap;">PC #${escapeText(String(report.PC_Number || 'N/A'))}</span>
              </div>
            </div>
            <div class="ticket-modal-meta-cell">
              <div class="ticket-modal-meta-label">
                <i data-lucide="user" style="width:13px;height:13px;color:var(--primary-teal);flex-shrink:0;"></i>
                <span>Reporter</span>
              </div>
              <div class="ticket-modal-meta-val">
                <span>${escapeText(singleReport.Student_Name || report.Student_Name || 'Student')}</span>
                ${singleParsed.section && singleParsed.section !== 'N/A' ? `<span class="section-chip" style="font-size:11px;padding:2px 7px;">${escapeText(singleParsed.section)}</span>` : ''}
              </div>
            </div>
          </div>

          <div>
            <div class="ticket-modal-section-title">Flagged Component Issues</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${issueBadges}
            </div>
          </div>

          <div>
            <div class="ticket-modal-section-title">Student Remarks</div>
            <div class="ticket-modal-remarks-box">
              <i data-lucide="message-square" class="ticket-modal-remarks-icon"></i>
              <div class="ticket-modal-remarks-text">
                ${escapeText(singleParsed.remarks || 'No remarks provided.')}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // ─── MULTIPLE STUDENT REPORTS LAYOUT (2+) ─────────────────────────────
      const studentReportsHtml = linkedReports.map((rep) => {
        const repDate = rep.Date_Reported ? new Date(rep.Date_Reported) : new Date();
        const repTimeStr = repDate.toLocaleTimeString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const repParsed = typeof parserFn === 'function' ? parserFn(rep.Issue_Description) : { section: 'N/A', remarks: rep.Issue_Description || 'None' };
        const repRemarks = (repParsed.remarks || '').trim();
        const isRepEmpty = !repRemarks || repRemarks.toLowerCase() === 'none' || repRemarks.toLowerCase() === 'n/a';

        return `
          <div class="ticket-modal-report-item">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:750; color:var(--text-dark); font-size:13.5px;">${escapeText(rep.Student_Name || 'Student')}</span>
                <span style="font-size:11px; color:#0284C7; background:#E0F2FE; padding:1px 6px; border-radius:6px; font-weight:700;">${escapeText(repParsed.section || 'N/A')}</span>
              </div>
              <span style="font-size:11.5px; color:var(--text-muted); font-weight:500;">${repTimeStr}</span>
            </div>
            <div style="display:flex; align-items:flex-start; gap:8px; margin-top:4px;">
              <i data-lucide="message-square" style="width:15px; height:15px; color:var(--primary-teal, #0891B2); flex-shrink:0; margin-top:2px;"></i>
              <span style="font-size:13px; color:${isRepEmpty ? 'var(--text-muted)' : 'var(--text-dark)'}; ${isRepEmpty ? 'font-style:italic;' : ''} line-height:1.45; font-weight:500; word-break:break-word; flex:1;">
                ${isRepEmpty ? 'No remarks provided.' : escapeText(repRemarks)}
              </span>
            </div>
          </div>
        `;
      }).join('');

      bodyContentHtml = `
        <div class="ticket-modal-body">
          <div class="ticket-modal-meta-card">
            <div class="ticket-modal-meta-cell">
              <div class="ticket-modal-meta-label">
                <i data-lucide="map-pin" style="width:13px;height:13px;color:var(--primary-teal);flex-shrink:0;"></i>
                <span>Location & Unit</span>
              </div>
              <div class="ticket-modal-meta-val">
                <span>Room ${escapeText(String(report.Room_Number || 'N/A'))}</span>
                <span style="opacity:0.4; margin:0 4px;">•</span>
                <span style="white-space:nowrap;">PC #${escapeText(String(report.PC_Number || 'N/A'))}</span>
              </div>
            </div>
            <div class="ticket-modal-meta-cell">
              <div class="ticket-modal-meta-label">
                <i data-lucide="layers" style="width:13px;height:13px;color:var(--primary-teal);flex-shrink:0;"></i>
                <span>Issue Category</span>
              </div>
              <div class="ticket-modal-meta-val">
                <span>${escapeText(displayIssues)}</span>
              </div>
            </div>
          </div>

          <div>
            <div class="ticket-modal-section-title">Flagged Component Issues</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${issueBadges}
            </div>
          </div>

          <div>
            <div class="ticket-modal-section-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Student Reports (${linkedReports.length})</span>
              <span style="font-size:11px; background:rgba(30,187,215,0.12); color:var(--primary-teal); padding:2px 8px; border-radius:99px; font-weight:600;">Linked Submissions</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; max-height:220px; overflow-y:auto; padding-right:4px;">
              ${studentReportsHtml}
            </div>
          </div>
        </div>
      `;
    }

    const modal = document.createElement('div');
    modal.id = 'ticket-details-modal';
    modal.className = 'modal-backdrop active';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:2500;padding:20px;box-sizing:border-box;overflow-y:auto;';

    let resolveBtnHtml = '';
    if (report.Status !== 'Resolved') {
      resolveBtnHtml = `
        <button type="button" class="btn-resolve-ticket" data-action="resolve-ticket-modal" data-report-id="${report.Report_ID}" style="padding:10px 20px;font-size:13.5px;font-weight:700;border-radius:12px;">
          <i data-lucide="check" style="width:16px;height:16px;"></i> Mark Resolved
        </button>
      `;
    } else {
      resolveBtnHtml = `<span class="completed-chip" style="font-size:13px;padding:9px 16px;border-radius:12px;font-weight:700;"><i data-lucide="check-check" style="width:16px;height:16px;"></i> Work Order Completed</span>`;
    }

    modal.innerHTML = `
      <div class="modal-card ticket-modal-card">
        <!-- Header: No X Button, clean Ticket ID + Status Badge + Date -->
        <div class="ticket-modal-header">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="ticket-chip" style="font-size:13.5px; padding:5px 14px; font-weight:700;">LS-TKT-${report.Report_ID}</span>
            <span class="status-badge-pulse ${report.Status === 'Resolved' ? 'resolved' : 'pending'}">
              <span class="pulse-dot"></span> ${report.Status}
            </span>
          </div>
          <div class="ticket-modal-date">
            First reported on ${formattedDate}
          </div>
        </div>

        <!-- Body Info -->
        ${bodyContentHtml}

        <!-- Footer Actions -->
        <div class="ticket-modal-footer">
          <button type="button" class="btn-ticket-modal-close" data-action="close-modal">Close</button>
          ${resolveBtnHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.setModalOpenState) global.setModalOpenState(true);

    // Keyboard listener for Escape dismissal
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeTicketModal();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    modal._cleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
    };

    // Direct modal click delegation: handles Close, Backdrop, and Resolve reliably
    modal.addEventListener('click', (e) => {
      // 1. Close button clicked
      const closeBtn = e.target.closest('[data-action="close-modal"], .btn-ticket-modal-close');
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeTicketModal();
        return;
      }

      // 2. Backdrop (outside card) clicked
      if (e.target === modal) {
        e.preventDefault();
        e.stopPropagation();
        closeTicketModal();
        return;
      }

      // 3. Resolve button inside modal clicked
      const resolveBtn = e.target.closest('[data-action="resolve-ticket-modal"]');
      if (resolveBtn) {
        e.preventDefault();
        e.stopPropagation();
        const repId = resolveBtn.getAttribute('data-report-id');
        closeTicketModal();
        if (repId && global.maintenanceActions && typeof global.maintenanceActions.updateReportStatus === 'function') {
          global.maintenanceActions.updateReportStatus(repId, 'Resolved');
        } else if (repId && typeof global.updateReportStatus === 'function') {
          global.updateReportStatus(repId, 'Resolved');
        }
        return;
      }
    });

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }
  }

  const maintenanceModal = {
    viewTicketModal,
    closeTicketModal
  };

  global.maintenanceModal = maintenanceModal;
  global.viewTicketModal = viewTicketModal;

})(typeof window !== 'undefined' ? window : this);
