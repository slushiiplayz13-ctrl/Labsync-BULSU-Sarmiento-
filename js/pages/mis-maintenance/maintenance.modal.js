/**
 * LabSync – MIS Maintenance Ticket Details Modal  |  js/pages/mis-maintenance/maintenance.modal.js
 * Encapsulates the Ticket Details Modal overlay construction, DOM injection, and dismissal.
 */

(function (global) {
  'use strict';

  /**
   * Closes and removes the Ticket Details Modal from DOM if present.
   */
  function closeTicketModal() {
    const existingModal = document.getElementById('ticket-details-modal');
    if (existingModal) {
      existingModal.remove();
    }
  }

  /**
   * Builds and presents the Ticket Details Modal overlay.
   * @param {number} reportId - ID of the report to display
   * @param {Array} [reportsList] - Optional array of reports; defaults to global list
   */
  function viewTicketModal(reportId, reportsList) {
    const reports = reportsList || global.maintenanceReports || (typeof window !== 'undefined' ? window.maintenanceReports : []) || [];
    const report = reports.find(r => r.Report_ID === reportId);
    if (!report) return;

    const dateObj = new Date(report.Date_Reported);
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
      : { section: 'N/A', issues: 'Hardware Issue', remarks: report.Issue_Description || 'None' };

    const badgeFormatter = (global.maintenanceRenderer && typeof global.maintenanceRenderer.formatIssueBadges === 'function')
      ? global.maintenanceRenderer.formatIssueBadges
      : (typeof global.formatIssueBadges === 'function' ? global.formatIssueBadges : () => '');

    const issueBadges = badgeFormatter(parsed.issues, parsed.remarks, true);

    closeTicketModal();

    const modal = document.createElement('div');
    modal.id = 'ticket-details-modal';
    modal.className = 'modal-backdrop active';
    modal.style.zIndex = '1000';

    let resolveBtnHtml = '';
    if (report.Status !== 'Resolved') {
      resolveBtnHtml = `
        <button class="btn-resolve-ticket" style="padding:10px 20px;font-size:13px;" onclick="updateReportStatus(${report.Report_ID}, 'Resolved'); document.getElementById('ticket-details-modal').remove();">
          <i data-lucide="check" style="width:16px;height:16px;"></i> Mark Resolved & Restored
        </button>
      `;
    } else {
      resolveBtnHtml = `<span class="completed-chip" style="font-size:13px;padding:8px 16px;"><i data-lucide="check-check" style="width:16px;height:16px;"></i> Work Order Completed</span>`;
    }

    modal.innerHTML = `
      <div class="modal-card" style="max-width: 540px; width: 90%; border-radius: 20px; padding: 28px; background: var(--bg-card); border: 1px solid var(--border-light); box-shadow: 0 20px 50px rgba(0,0,0,0.25);">
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
              Reported on ${formattedDate}
            </div>
          </div>
          <button onclick="document.getElementById('ticket-details-modal').remove()" style="background:none; border:none; color:var(--text-mid); cursor:pointer; padding:4px;">
            <i data-lucide="x" style="width:20px;height:20px;"></i>
          </button>
        </div>

        <!-- Body Info -->
        <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:24px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:rgba(30,187,215,0.06); padding:14px 16px; border-radius:12px; border:1px solid rgba(30,187,215,0.15);">
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Location & Unit</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">Room ${report.Room_Number} • PC #${report.PC_Number}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px;">Reporter</div>
              <div style="font-size:13.5px; font-weight:700; color:var(--text-dark);">${report.Student_Name || 'Student'} <span style="font-size:11px; color:#0E7490; background:#E0F2FE; padding:2px 6px; border-radius:99px; margin-left:4px;">${parsed.section}</span></div>
            </div>
          </div>

          <div>
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Flagged Component Issues</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${issueBadges}
            </div>
          </div>

          <div>
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase;">Complete Student Remarks</div>
            <div style="font-size:13.5px; color:var(--text-dark); background:var(--bg-body); border-left:4px solid var(--primary-teal); padding:12px 16px; border-radius:8px; line-height:1.5; font-weight:500; max-height:200px; overflow-y:auto;">
              "${parsed.remarks}"
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; border-top:1px solid var(--border-light); padding-top:18px;">
          <button onclick="document.getElementById('ticket-details-modal').remove()" style="padding:9px 18px; border:1px solid var(--border-light); background:var(--bg-card); color:var(--text-dark); border-radius:99px; font-size:13px; font-weight:600; cursor:pointer;">Close</button>
          ${resolveBtnHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
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
