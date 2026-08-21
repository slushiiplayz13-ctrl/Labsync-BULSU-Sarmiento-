/* ================================================================
   LabSync – MIS Maintenance Tracker Controller  |  js/pages/mis-maintenance.js
   ================================================================ */

'use strict';

// Page-local state
let maintenanceReports = [];
let activeFilter = 'all';

/**
 * Parses raw Issue_Description string into section, issues list, and remarks.
 * @param {string} desc - Raw issue description text
 * @returns {Object} Object containing section, issues, and remarks strings
 */
function parseIssueDesc(desc) {
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
 * Calculates total, pending, and resolved metrics and updates top stat cards.
 * @param {Array} reports - Array of report objects
 */
function calculateStats(reports) {
  const total = reports.length;
  const pending = reports.filter(r => r.Status !== 'Resolved').length;
  const resolved = reports.filter(r => r.Status === 'Resolved').length;

  const totalEl = document.getElementById('stat-total');
  const pendingEl = document.getElementById('stat-pending');
  const resolvedEl = document.getElementById('stat-resolved');

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (resolvedEl) resolvedEl.textContent = resolved;
}

/**
 * Updates active filter pill UI and triggers table re-render.
 * @param {string} status - Filter name ('all', 'pending', 'resolved')
 */
function filterStatus(status) {
  activeFilter = status;
  document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`filter-${status}`);
  if (activeBtn) activeBtn.classList.add('active');
  applyFiltersAndRender();
}

/**
 * Filters reports according to activeFilter and maintenanceSearchInput value, then renders rows.
 */
function applyFiltersAndRender() {
  const searchInput = document.getElementById('maintenanceSearchInput');
  const searchVal = (searchInput?.value || '').toLowerCase().trim();

  const filtered = maintenanceReports.filter(report => {
    // Status filter
    const status = (report.Status || '').toLowerCase();
    if (activeFilter === 'pending' && status === 'resolved') return false;
    if (activeFilter === 'resolved' && status !== 'resolved') return false;

    // Search filter
    if (searchVal) {
      const parsed = parseIssueDesc(report.Issue_Description);

      const idStr = report.Report_ID != null ? String(report.Report_ID) : '';
      const formattedId = idStr ? `ls-tkt-${idStr}` : '';
      const shortTktId = idStr ? `tkt-${idStr}` : '';

      const studentName = (report.Student_Name || '').toLowerCase();
      const roomNum = report.Room_Number != null ? String(report.Room_Number).toLowerCase() : '';
      const roomFormatted = roomNum ? `room ${roomNum}` : '';
      const pcNum = report.PC_Number != null ? String(report.PC_Number).toLowerCase() : '';
      const pcFormatted = pcNum ? `pc ${pcNum}` : '';
      const pcHashFormatted = pcNum ? `pc #${pcNum}` : '';
      const issueDesc = (report.Issue_Description || '').toLowerCase();
      const section = (parsed.section || '').toLowerCase();
      const issues = (parsed.issues || '').toLowerCase();
      const remarks = (parsed.remarks || '').toLowerCase();
      const priority = (report.Priority_Level || '').toLowerCase();

      const match =
        idStr.includes(searchVal) ||
        formattedId.includes(searchVal) ||
        shortTktId.includes(searchVal) ||
        studentName.includes(searchVal) ||
        roomNum.includes(searchVal) ||
        roomFormatted.includes(searchVal) ||
        pcNum.includes(searchVal) ||
        pcFormatted.includes(searchVal) ||
        pcHashFormatted.includes(searchVal) ||
        issueDesc.includes(searchVal) ||
        section.includes(searchVal) ||
        issues.includes(searchVal) ||
        remarks.includes(searchVal) ||
        priority.includes(searchVal) ||
        status.includes(searchVal);

      if (!match) return false;
    }

    return true;
  });

  renderTableRows(filtered);
}

/**
 * Formats issue tag HTML elements.
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
 * Renders table rows in #dynamicMaintenanceRows.
 * @param {Array} reports - Array of filtered report objects
 */
function renderTableRows(reports) {
  const tbody = document.getElementById('dynamicMaintenanceRows');
  if (!tbody) return;

  if (reports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 13.5px;">
          No maintenance tickets match the selected filter.
        </td>
      </tr>
    `;
    return;
  }

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

  if (window.lucide) lucide.createIcons();
}

/**
 * Builds and presents the Ticket Details Modal overlay.
 * @param {number} reportId - ID of the report to display
 */
function viewTicketModal(reportId) {
  const report = maintenanceReports.find(r => r.Report_ID === reportId);
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

  const parsed = parseIssueDesc(report.Issue_Description);
  const issueBadges = formatIssueBadges(parsed.issues, parsed.remarks, true);

  const existingModal = document.getElementById('ticket-details-modal');
  if (existingModal) existingModal.remove();

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
  if (window.lucide) lucide.createIcons();
}

/**
 * Sends status update request to backend and reloads maintenance data.
 * @param {number} reportId
 * @param {string} newStatus
 */
async function updateReportStatus(reportId, newStatus) {
  if (!confirm(`Set Ticket LS-TKT-${reportId} status to '${newStatus}'?`)) return;

  try {
    const response = await fetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (response.ok) {
      if (window.showToast) window.showToast(`Ticket LS-TKT-${reportId} status updated to ${newStatus}`, 'success');
      await loadMaintenanceData();
    } else {
      const err = await response.json();
      alert('Error: ' + err.error);
    }
  } catch (error) {
    console.error('Error updating status:', error);
    alert('Failed to update ticket status.');
  }
}

/**
 * Primary loader function fetching /api/reports and rendering stats & table.
 */
async function loadMaintenanceData() {
  try {
    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('Failed to fetch reports');
    maintenanceReports = await response.json();

    calculateStats(maintenanceReports);
    applyFiltersAndRender();
  } catch (error) {
    console.error('Error loading maintenance data:', error);
    const tbody = document.getElementById('dynamicMaintenanceRows');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="padding: 40px; text-align: center; color: #EF4444; font-weight: 600;">
            Failed to load maintenance tickets. Please refresh or try again later.
          </td>
        </tr>
      `;
    }
  }
}

/**
 * Initializes sidebar scroll clue, search listener, and triggers initial load.
 */
function initMISMaintenancePage() {
  const sidebar = document.querySelector('.sidebar');
  const scrollClue = document.getElementById('sidebarScrollClue');

  if (sidebar && scrollClue) {
    if (sidebar.scrollHeight <= sidebar.clientHeight) {
      scrollClue.style.display = 'none';
    }
    sidebar.addEventListener('scroll', () => {
      if (sidebar.scrollTop > 10) {
        scrollClue.style.opacity = '0';
      } else {
        scrollClue.style.opacity = '1';
      }
    });
  }

  const searchInput = document.getElementById('maintenanceSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', applyFiltersAndRender);
  }

  loadMaintenanceData();
}

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMISMaintenancePage);
} else {
  initMISMaintenancePage();
}

// Global compatibility bridges
window.loadMaintenanceData = loadMaintenanceData;
window.filterStatus = filterStatus;
window.viewTicketModal = viewTicketModal;
window.updateReportStatus = updateReportStatus;
