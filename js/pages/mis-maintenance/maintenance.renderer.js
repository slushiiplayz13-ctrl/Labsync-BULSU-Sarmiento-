/**
 * LabSync – MIS Maintenance Renderer  |  js/pages/mis-maintenance/maintenance.renderer.js
 * Pure presentation component for maintenance table rows, issue badges, and error/empty states.
 */

(function (global) {
  'use strict';

  /**
   * Helper to parse raw issue description.
   * Delegates to canonical reportParser (js/reports/report.parser.js).
   * @param {string} desc - Raw issue description text
   * @returns {{section: string, issues: string, remarks: string}}
   */
  function parseIssueDesc(desc) {
    if (global.reportParser && typeof global.reportParser.parseIssueDescription === 'function') {
      return global.reportParser.parseIssueDescription(desc);
    }
    if (typeof global.parseIssueDescription === 'function') {
      return global.parseIssueDescription(desc);
    }
    if (!desc) return { section: 'N/A', issues: 'Hardware Issue', remarks: '' };

    const sectionMatch = desc.match(/\[Program & Section:\s*([^\]]+)\]/i);
    const issuesMatch = desc.match(/\[Issues:\s*([^\]]+)\]/i);
    const remarksMatch = desc.match(/Remarks:\s*(.*)$/is);

    const section = sectionMatch ? sectionMatch[1].trim() : 'N/A';
    const issues = issuesMatch ? issuesMatch[1].trim() : 'Hardware Issue';
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

    return { section, issues, remarks: remarks || 'None' };
  }

  /**
   * Formats issue tag HTML elements with Lucide icons.
   * @param {string} issuesStr
   * @param {string} remarksStr
   * @param {boolean} isModal
   * @returns {string} HTML string
   */
  function formatIssueBadges(issuesStr, remarksStr, isModal = false) {
    const iconSize = isModal ? '13px' : '12px';
    const extraStyle = isModal ? ' style="font-size:12.5px;padding:5px 12px;"' : '';
    const issues = (issuesStr || '').split(',').map(s => s.trim()).filter(Boolean);
    const remarks = (remarksStr || '').trim();
    const hasRemarks = remarks.length > 0 &&
      remarks.toLowerCase() !== 'none' &&
      remarks.toLowerCase() !== 'no remarks provided' &&
      remarks.toLowerCase() !== 'no details provided.';

    if (issues.length === 0) {
      if (hasRemarks) {
        return `<span class="issue-tag other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Other</span>`;
      }
      return `<span class="issue-tag ok"${extraStyle}><i data-lucide="check-square" style="width:${iconSize};height:${iconSize};"></i> None</span>`;
    }

    return issues.map(item => {
      const lower = item.toLowerCase();
      if (lower === 'none' || lower === 'n/a') {
        if (hasRemarks) {
          return `<span class="issue-tag other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Other</span>`;
        }
        return `<span class="issue-tag ok"${extraStyle}><i data-lucide="check-square" style="width:${iconSize};height:${iconSize};"></i> None</span>`;
      }
      if (lower === 'others' || lower === 'other') {
        return `<span class="issue-tag other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Other</span>`;
      }
      return `<span class="issue-tag bad"${extraStyle}><i data-lucide="alert-triangle" style="width:${iconSize};height:${iconSize};"></i> ${item}</span>`;
    }).join(' ');
  }

  /**
   * Computes a deterministic signature of the rendered maintenance dataset.
   * @param {Array} reports
   * @returns {string}
   */
  function computeMaintenanceSignature(reports) {
    if (!Array.isArray(reports) || reports.length === 0) return 'empty';
    return reports.map(r =>
      `${r.Report_ID}_${r.Status}_${r.Room_Number}_${r.PC_Number}_${r.Priority_Level || ''}_${r.Date_Reported || ''}_${r.Issue_Description || ''}`
    ).join('|');
  }

  /**
   * Renders table rows into #dynamicMaintenanceRows.
   * @param {Array} reports - Array of filtered report objects
   * @param {HTMLElement} [targetElement] - Optional tbody override
   */
  function renderTableRows(reports, targetElement) {
    const tbody = targetElement || document.getElementById('dynamicMaintenanceRows');
    if (!tbody) return;

    if (!Array.isArray(reports) || reports.length === 0) {
      const sig = 'empty';
      if (tbody._lastRenderSignature === sig) return;
      tbody._lastRenderSignature = sig;
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 13.5px;">
            No maintenance tickets match the selected filter.
          </td>
        </tr>
      `;
      return;
    }

    const signature = computeMaintenanceSignature(reports);
    if (tbody._lastRenderSignature === signature) {
      return; // Signature match: identical rendered dataset, skip DOM write and icon recreation
    }
    tbody._lastRenderSignature = signature;

    tbody.innerHTML = reports.map(report => {
      const dateObj = new Date(report.Date_Reported);
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const parsed = parseIssueDesc(report.Issue_Description);

      let actionsHtml = '';
      if (report.Status !== 'Resolved') {
        actionsHtml = `
          <button class="btn-resolve-ticket" onclick="event.stopPropagation(); updateReportStatus(${report.Report_ID}, 'Resolved')">
            <i data-lucide="check" style="width:14px;height:14px;"></i> Mark Resolved
          </button>
        `;
      } else {
        actionsHtml = `<span class="completed-chip"><i data-lucide="check-check" style="width:13px;height:13px;"></i> Completed</span>`;
      }

      const sectionChip = parsed.section && parsed.section !== 'N/A'
        ? `<span class="section-chip">${parsed.section}</span>`
        : '';

      const issueBadges = formatIssueBadges(parsed.issues, parsed.remarks, false);

      const statusPill = report.Status === 'Resolved'
        ? `<span class="status-badge-pulse resolved"><span class="pulse-dot"></span> Resolved</span>`
        : `<span class="status-badge-pulse pending"><span class="pulse-dot"></span> Pending</span>`;

      const isLongRemark = parsed.remarks && parsed.remarks.length > 70;
      const readMoreBtn = isLongRemark
        ? `<button class="btn-read-more" onclick="event.stopPropagation(); viewTicketModal(${report.Report_ID})">Expand <i data-lucide="maximize-2" style="width:11px;height:11px;"></i></button>`
        : '';

      return `
        <tr onclick="viewTicketModal(${report.Report_ID})" style="cursor: pointer;" title="Tap to view full ticket details">
          <td class="col-ticket" style="white-space: nowrap;">
            <span class="ticket-chip" onclick="event.stopPropagation(); viewTicketModal(${report.Report_ID})" title="Click to view full ticket details">
              LS-TKT-${report.Report_ID}
            </span>
          </td>
          <td class="col-date" style="white-space: nowrap;">
            <div class="col-date-wrap">
              <i data-lucide="calendar" class="col-date-icon"></i>
              <div class="col-date-text">
                <span class="date-main">${dateStr}</span>
                <span class="time-sub">${timeStr}</span>
              </div>
            </div>
          </td>
          <td class="col-room" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="map-pin" class="cell-icon room"></i>
              Room ${report.Room_Number}
            </div>
          </td>
          <td class="col-pc" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="monitor" class="cell-icon pc"></i>
              PC #${report.PC_Number}
            </div>
          </td>
          <td class="col-issues" style="min-width: 200px; max-width: 360px;">
            <div class="ticket-badge-group">
              ${issueBadges}
              ${sectionChip}
            </div>
            <div class="remarks-quote-box">
              "${parsed.remarks}"
            </div>
            ${readMoreBtn}
          </td>
          <td class="col-status" style="white-space: nowrap;">
            ${statusPill}
          </td>
          <td class="col-actions" style="text-align: center; white-space: nowrap;">
            ${actionsHtml}
          </td>
        </tr>
      `;
    }).join('');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbody });
    }
  }

  /**
   * Renders an error message row into the maintenance table.
   * @param {string} [message]
   * @param {HTMLElement} [targetElement]
   */
  function renderTableError(message, targetElement) {
    const tbody = targetElement || document.getElementById('dynamicMaintenanceRows');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 40px; text-align: center; color: #EF4444; font-weight: 600;">
          ${message || 'Failed to load maintenance tickets. Please refresh or try again later.'}
        </td>
      </tr>
    `;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbody });
    }
  }

  const maintenanceRenderer = {
    parseIssueDesc,
    formatIssueBadges,
    renderTableRows,
    renderTableError
  };

  global.maintenanceRenderer = maintenanceRenderer;
  global.formatIssueBadges = formatIssueBadges;

})(typeof window !== 'undefined' ? window : this);
