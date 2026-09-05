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
        <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:rgba(30,187,215,0.06); padding:14px 16px; border-radius:12px; border:1px solid rgba(30,187,215,0.15);">
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Location & Unit</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">Room ${escapeText(String(report.Room_Number || 'N/A'))} • PC #${escapeText(String(report.PC_Number || 'N/A'))}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Reporter</div>
              <div style="font-size:13.5px; font-weight:700; color:var(--text-dark);">${escapeText(singleReport.Student_Name || report.Student_Name || 'Student')} <span style="font-size:11px; color:#0E7490; background:#E0F2FE; padding:2px 6px; border-radius:99px; font-weight:600; margin-left:4px;">${escapeText(singleParsed.section || 'N/A')}</span></div>
            </div>
          </div>

          <div>
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Flagged Component Issues</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${issueBadges}
            </div>
          </div>

          <div>
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Student Remarks</div>
            <div style="display:flex; align-items:center; gap:10px; background:var(--bg-body); border:1px solid var(--border-light); padding:14px 16px; border-radius:12px; max-height:200px; overflow-y:auto;">
              <i data-lucide="message-square" style="width:18px; height:18px; min-width:18px; min-height:18px; color:var(--primary-teal, #0891B2); flex-shrink:0;"></i>
              <div style="font-size:13.5px; color:var(--text-dark); line-height:1.5; font-weight:500; word-break:break-word; flex:1;">
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
          <div style="background:var(--bg-body); border:1px solid var(--border-light); padding:12px 14px; border-radius:10px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:13px;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:750; color:var(--text-dark); font-size:13.5px;">${escapeText(rep.Student_Name || 'Student')}</span>
                <span style="font-size:11px; color:#0284C7; background:#E0F2FE; padding:1px 6px; border-radius:6px; font-weight:700;">${escapeText(repParsed.section || 'N/A')}</span>
              </div>
              <span style="font-size:11.5px; color:var(--text-muted); font-weight:500;">${repTimeStr}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <i data-lucide="message-square" style="width:16px; height:16px; min-width:16px; min-height:16px; color:var(--primary-teal, #0891B2); flex-shrink:0;"></i>
              <span style="font-size:13px; color:${isRepEmpty ? 'var(--text-muted)' : 'var(--text-dark)'}; ${isRepEmpty ? 'font-style:italic;' : ''} line-height:1.4; font-weight:500; word-break:break-word; flex:1;">
                ${isRepEmpty ? 'No remarks provided.' : escapeText(repRemarks)}
              </span>
            </div>
          </div>
        `;
      }).join('');

      bodyContentHtml = `
        <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:rgba(30,187,215,0.06); padding:14px 16px; border-radius:12px; border:1px solid rgba(30,187,215,0.15);">
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Location & Unit</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">Room ${escapeText(String(report.Room_Number || 'N/A'))} • PC #${escapeText(String(report.PC_Number || 'N/A'))}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Issue Category</div>
              <div style="font-size:13.5px; font-weight:700; color:var(--text-dark);">${escapeText(displayIssues)}</div>
            </div>
          </div>

          <div>
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Flagged Component Issues</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${issueBadges}
            </div>
          </div>

          <div>
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
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
        <button type="button" class="btn-resolve-ticket" data-action="resolve-ticket-modal" data-report-id="${report.Report_ID}" style="padding:10px 20px;font-size:13px;">
          <i data-lucide="check" style="width:16px;height:16px;"></i> Mark Resolved & Restored
        </button>
      `;
    } else {
      resolveBtnHtml = `<span class="completed-chip" style="font-size:13px;padding:8px 16px;"><i data-lucide="check-check" style="width:16px;height:16px;"></i> Work Order Completed</span>`;
    }

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 560px; width: 92%; border-radius: 20px; padding: 28px; background: var(--bg-card); border: 1px solid var(--border-light); box-shadow: 0 20px 50px rgba(0,0,0,0.25);">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom:1px solid var(--border-light); padding-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="ticket-chip" style="font-size:14px; padding:6px 14px;">LS-TKT-${report.Report_ID}</span>
              <span class="status-badge-pulse ${report.Status === 'Resolved' ? 'resolved' : 'pending'}">
                <span class="pulse-dot"></span> ${report.Status}
              </span>
            </div>
            <div style="font-size:13px; color:var(--text-mid); margin-top:6px; font-weight:500;">
              First reported on ${formattedDate}
            </div>
          </div>
          <button type="button" data-action="close-modal" style="background:none; border:none; color:var(--text-mid); cursor:pointer; padding:4px;">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>

        <!-- Body Info -->
        ${bodyContentHtml}

        <!-- Footer Actions -->
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; border-top:1px solid var(--border-light); padding-top:18px;">
          <button type="button" data-action="close-modal" style="padding:9px 18px; border:1px solid var(--border-light); background:var(--bg-card); color:var(--text-dark); border-radius:99px; font-size:13px; font-weight:600; cursor:pointer;">Close</button>
          ${resolveBtnHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.setModalOpenState) global.setModalOpenState(true);
    modal.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    modal.addEventListener('mousedown', (e) => {
      e.stopPropagation();
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
