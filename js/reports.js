// Report state ownership is managed by reportStore (js/state/report.store.js)
if (!window.reportStore) {
  window.allReports = [];
}

window.parseIssueDescription = function (desc) {
  if (!desc) {
    return { section: 'N/A', issues: 'None', remarks: 'No details provided.' };
  }

  const sectionMatch = desc.match(/\[Program & Section:\s*([^\]]+)\]/i);
  const issuesMatch = desc.match(/\[Issues:\s*([^\]]+)\]/i);
  const remarksMatch = desc.match(/Remarks:\s*(.*)$/is);

  const section = sectionMatch ? sectionMatch[1].trim() : 'N/A';
  const issues = issuesMatch ? issuesMatch[1].trim() : 'None';
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

  if (!remarks) remarks = 'No remarks provided.';

  return { section, issues, remarks };
};

// Safe query matcher handling null/undefined fields and ticket IDs
window.matchesReportQuery = function (report, query) {
  if (!query) return true;
  const q = String(query).toLowerCase().trim();
  if (!q) return true;

  const cleanQuery = q.replace(/[^a-z0-9]/g, '');

  const parsed = window.parseIssueDescription
    ? window.parseIssueDescription(report.Issue_Description)
    : { section: '', issues: '', remarks: '' };

  const idStr = report.Report_ID != null ? String(report.Report_ID) : '';
  const formattedId = idStr ? `ls-tkt-${idStr}` : '';
  const shortTktId = idStr ? `tkt-${idStr}` : '';
  const noDashId = idStr ? `lstkt${idStr}` : '';
  const shortNoDashId = idStr ? `tkt${idStr}` : '';

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
  const status = (report.Status || '').toLowerCase();

  return (
    idStr === q ||
    idStr.includes(q) ||
    formattedId.includes(q) ||
    shortTktId.includes(q) ||
    (cleanQuery && noDashId.includes(cleanQuery)) ||
    (cleanQuery && shortNoDashId.includes(cleanQuery)) ||
    studentName.includes(q) ||
    roomNum.includes(q) ||
    roomFormatted.includes(q) ||
    pcNum.includes(q) ||
    pcFormatted.includes(q) ||
    pcHashFormatted.includes(q) ||
    issueDesc.includes(q) ||
    section.includes(q) ||
    issues.includes(q) ||
    remarks.includes(q) ||
    priority.includes(q) ||
    status.includes(q)
  );
};

window.loadReports = async function () {
  try {
    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('Failed to load reports');
    window.allReports = await response.json();
    window.renderReports();
  } catch (error) {
    console.error('Error loading reports:', error);
    const container = document.getElementById('dynamicReportsList');
    if (container) {
      container.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
            <i data-lucide="alert-circle"></i>
          </div>
          <p>Failed to load reports. Please try again later.</p>
        </div>
      `;
    }
    if (window.lucide) lucide.createIcons();
  }
};

window.renderSingleCard = function (report) {
  // Format Date
  const dateObj = report.Date_Reported ? new Date(report.Date_Reported) : new Date();
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const parsed = window.parseIssueDescription(report.Issue_Description);
  const rawRemarks = (parsed.remarks || '').trim();
  const isEmptyRemarksText = !rawRemarks || rawRemarks.toLowerCase() === 'none' || rawRemarks.toLowerCase() === 'no remarks provided.';
  const formattedRemarks = isEmptyRemarksText ? 'None' : escapeHtml(rawRemarks);

  // Determine actions based on status for MIS staff pages
  let actionsHtml = '';
  const statusStr = report.Status || 'Pending';
  const currentPage = document.body.dataset.page;
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
          <!-- Status Badge -->
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

          <!-- Hardware Issues (Prominent & Larger) -->
          <div style="margin-left: 2px;">
            <span style="font-size:11px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.4px; display:block; margin-bottom:4px;">Reported Issue</span>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${parsed.issues.split(',').map(comp => comp.trim()).filter(Boolean).map(comp => {
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
    return `<span class="issue-badge-fault" style="display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:800; padding:4px 11px; border-radius:8px; background:#FEF2F2; color:#DC2626; border:1.5px solid #FCA5A5; box-shadow:0 1px 3px rgba(220,38,38,0.08);"><i data-lucide="alert-triangle" style="width:14px;height:14px;color:#EF4444;"></i> ${comp}</span>`;
  }).join('')}
            </div>
          </div>
          
          <!-- Reporter -->
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:12.5px; font-weight:600; color:var(--text-mid); margin-left:2px;">
            <i data-lucide="user" style="width:13.5px;height:13.5px;color:var(--text-muted);"></i>
            <span>${studentName}</span>
            <span style="font-size:11px; font-weight:700; padding:2px 7px; border-radius:4px; background:#F1F5F9; color:var(--text-mid);">${parsed.section}</span>
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
                <span class="remarks-text">${escapeHtml(rawRemarks)}</span>
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
};

function escapeHtml(str) {
  if (window.escapeHtml && window.escapeHtml !== escapeHtml) return window.escapeHtml(str);
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

window.renderReports = function () {
  const container = document.getElementById('dynamicReportsList');
  if (!container) return;

  const searchInput = document.getElementById('reportSearchInput');
  const query = searchInput ? searchInput.value.trim() : '';

  const reports = window.allReports || [];

  const totalResolvedReports = reports.filter(r => (r.Status || '').toLowerCase() === 'resolved');
  const filteredReports = reports.filter(r => window.matchesReportQuery(r, query));
  const activeReports = filteredReports.filter(r => (r.Status || '').toLowerCase() !== 'resolved');
  const resolvedReports = filteredReports.filter(r => (r.Status || '').toLowerCase() === 'resolved');

  // Update view completed button
  const toggleContainer = document.getElementById('completedToggleContainer');
  if (toggleContainer) {
    if (totalResolvedReports.length > 0) {
      const buttonLabel = query
        ? `View Completed Tickets (${resolvedReports.length} matching)`
        : `View Completed Tickets (${totalResolvedReports.length})`;
      toggleContainer.innerHTML = `
        <button class="toggle-completed-btn" onclick="window.openCompletedModal()">
          <i data-lucide="history" style="width:16px;height:16px;"></i>
          <span>${buttonLabel}</span>
        </button>
      `;
    } else {
      toggleContainer.innerHTML = '';
    }
  }

  let htmlContent = '';

  if (activeReports.length > 0) {
    htmlContent += `
      <div class="report-section active-section">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-bottom:6px; border-bottom:1px solid var(--border-light);">
          <div style="width:10px; height:10px; border-radius:50%; background:#F59E0B; box-shadow:0 0 8px rgba(245,158,11,0.5);"></div>
          <h4 style="font-size:14px; font-weight:700; color:var(--text-dark); text-transform:uppercase; letter-spacing:0.5px;">Active Tickets (${activeReports.length})</h4>
        </div>
        <div class="reports-list">
          ${activeReports.map(r => window.renderSingleCard(r)).join('')}
        </div>
      </div>
    `;
  }

  if (!htmlContent) {
    if (query) {
      if (resolvedReports.length > 0) {
        container.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="search" style="width:24px;height:24px;"></i>
            </div>
            <p>No active PC issue reports match "<strong>${escapeHtml(query)}</strong>".</p>
            <p style="font-size:12px; color:var(--text-muted); margin-top:4px;">Found ${resolvedReports.length} matching completed ticket(s). <a href="javascript:void(0)" onclick="window.openCompletedModal()" style="color:var(--primary-teal); font-weight:600; text-decoration:underline;">Click here to view completed history</a>.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
            </div>
            <p>No PC issue reports match "<strong>${escapeHtml(query)}</strong>".</p>
          </div>
        `;
      }
    } else {
      if (totalResolvedReports.length > 0) {
        container.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="check-circle-2" style="width:24px;height:24px;color:#10B981;"></i>
            </div>
            <p>No active PC issue reports. All tickets are completed. Click "View Completed Tickets" to view history.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
            </div>
            <p>No PC issue reports yet. Submitted tickets will appear here when available.</p>
          </div>
        `;
      }
    }
  } else {
    container.innerHTML = htmlContent;
  }

  if (window.lucide) lucide.createIcons();
};

window.updateReportStatus = async function (reportId, newStatus) {
  if (!confirm(`Are you sure you want to set Ticket LS-TKT-${reportId} status to '${newStatus}'?`)) return;

  try {
    const response = await fetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (response.ok) {
      await window.loadReports();
      // If modal is open, refresh resolved list
      const modal = document.getElementById('completedTicketsModal');
      if (modal && modal.style.display !== 'none') {
        window.openCompletedModal();
      }
    } else {
      const err = await response.json();
      alert('Error: ' + err.error);
    }
  } catch (error) {
    console.error('Error updating status:', error);
    alert('Failed to update ticket status.');
  }
};

window.deleteReport = async function (reportId) {
  if (!confirm(`Are you sure you want to permanently delete Ticket LS-TKT-${reportId}?`)) return;

  try {
    const response = await fetch(`/api/reports/${reportId}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      await window.loadReports();
      // If modal is open, refresh resolved list
      const modal = document.getElementById('completedTicketsModal');
      if (modal && modal.style.display !== 'none') {
        window.openCompletedModal();
      }
    } else {
      const err = await response.json();
      alert('Error: ' + err.error);
    }
  } catch (error) {
    console.error('Error deleting report:', error);
    alert('Failed to delete ticket.');
  }
};

window.openCompletedModal = function () {
  const modal = document.getElementById('completedTicketsModal');
  const modalBody = document.getElementById('modalCompletedList');
  if (!modal || !modalBody) return;

  const searchInput = document.getElementById('reportSearchInput');
  const query = searchInput ? searchInput.value.trim() : '';
  const resolvedReports = (window.allReports || []).filter(r => {
    const isResolved = (r.Status || '').toLowerCase() === 'resolved';
    if (!isResolved) return false;
    return window.matchesReportQuery(r, query);
  });

  if (resolvedReports.length === 0) {
    modalBody.innerHTML = `
      <div class="ui-empty-state" style="padding: 40px 0;">
        <div class="ui-empty-icon">
          <i data-lucide="check-circle" style="width:24px;height:24px;"></i>
        </div>
        <p>${query ? `No completed tickets match "${escapeHtml(query)}".` : 'No completed tickets found.'}</p>
      </div>
    `;
  } else {
    modalBody.innerHTML = `
      <div class="reports-list">
        ${resolvedReports.map(r => window.renderSingleCard(r)).join('')}
      </div>
    `;
  }

  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
};

window.closeCompletedModal = function () {
  const modal = document.getElementById('completedTicketsModal');
  if (modal) modal.style.display = 'none';
};

// Event Listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Live search filtering
  const searchInput = document.getElementById('reportSearchInput');

  // Check for ?room= URL parameter to auto-filter by room
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam && searchInput) {
    searchInput.value = `Room ${roomParam}`;
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window.renderReports();
      const modal = document.getElementById('completedTicketsModal');
      if (modal && modal.style.display !== 'none') {
        window.openCompletedModal();
      }
    });
  }

  // Close modal when clicking backdrop
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('completedTicketsModal');
    if (modal && e.target === modal) {
      window.closeCompletedModal();
    }
  });

  // Load initial reports
  window.loadReports();
});


