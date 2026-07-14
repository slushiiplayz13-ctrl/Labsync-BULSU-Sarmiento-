// ── Shared PC Issue Reports Logic ────────────────────────────────────
window.allReports = [];

window.parseIssueDescription = function(desc) {
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

window.loadReports = async function() {
  try {
    const response = await fetch('/api/reports');
    if (!response.ok) throw new Error('Failed to load reports');
    window.allReports = await response.json();
    window.renderReports(window.allReports);
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

window.renderSingleCard = function(report) {
  // Format Date
  const dateObj = new Date(report.Date_Reported);
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const parsed = window.parseIssueDescription(report.Issue_Description);

  // Determine actions based on status for MIS staff page
  let actionsHtml = '';
  let borderStyle = '';
  if (document.body.dataset.page === 'mis-pc-reports') {
    borderStyle = 'border-bottom: 1px solid var(--border-light); padding-bottom: 14px;';
    if (report.Status === 'Pending') {
      actionsHtml = `
        <button class="btn-action process" onclick="window.updateReportStatus(${report.Report_ID}, 'In Progress')">
          <i data-lucide="play" style="width:14px;height:14px;"></i>Process Ticket
        </button>
      `;
    } else if (report.Status === 'In Progress') {
      actionsHtml = `
        <button class="btn-action resolve" onclick="window.updateReportStatus(${report.Report_ID}, 'Resolved')">
          <i data-lucide="check" style="width:14px;height:14px;"></i>Resolve Ticket
        </button>
      `;
    } else if (report.Status === 'Resolved') {
      actionsHtml = `
        <span style="font-size:12.5px; font-weight:600; color:#059669; display:flex; align-items:center; gap:4px; padding:6px 0;"><i data-lucide="check" style="width:14px;height:14px;"></i>Ticket Completed</span>
      `;
    }
  }

  return `
    <div class="report-card">
      <!-- Card Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-family:var(--font-display); font-weight:700; font-size:14px; color:var(--primary-teal);">LS-TKT-${report.Report_ID}</span>
          <span style="font-size:11px; font-weight:600; padding:4px 10px; border-radius:99px; background:#F1F5F9; color:var(--text-mid);">${formattedDate}</span>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <!-- Priority Badge -->
          <span class="priority-badge ${report.Priority_Level.toLowerCase()}">
            ${report.Priority_Level} Priority
          </span>
          <!-- Status Badge -->
          <span class="status-badge ${report.Status.toLowerCase().replace(' ', '-')}">
            ${report.Status}
          </span>
        </div>
      </div>

      <!-- Card Body -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; ${borderStyle} margin-top: 10px; align-items: start;">
        <!-- Left Column: Asset, Reporter & Issues -->
        <div style="display:flex; flex-direction:column; gap:10px;">
          <!-- Location & PC -->
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:6px; background:#E8F9FC; color:var(--primary-teal);">
              <i data-lucide="monitor" style="width:16px;height:16px;"></i>
            </div>
            <div style="font-size:14.5px; font-weight:800; color:var(--text-dark);">Room ${report.Room_Number} – PC ${report.PC_Number}</div>
          </div>
          
          <!-- Reporter -->
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:13px; font-weight:600; color:var(--text-mid); margin-left:2px;">
            <i data-lucide="user" style="width:13.5px;height:13.5px;color:var(--text-muted);"></i>
            <span>${report.Student_Name}</span>
            <span style="font-size:9.5px; font-weight:700; padding:2px 6px; border-radius:4px; background:#F1F5F9; color:var(--text-mid);">${parsed.section}</span>
          </div>

          <!-- Hardware Issues -->
          <div style="margin-left: 2px;">
            <span style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px; display:block; margin-bottom:4px;">Issues</span>
            <div style="display:flex; flex-wrap:wrap; gap:4px;">
              ${
                parsed.issues.split(',').map(comp => comp.trim()).filter(Boolean).map(comp => {
                  if (comp.toLowerCase() === 'none' || comp.toLowerCase() === 'others') {
                    return `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10.5px; font-weight:600; padding:2.5px 6px; border-radius:4px; background:#F1F5F9; color:#64748B;"><i data-lucide="check" style="width:11px;height:11px;color:#10B981;"></i> None</span>`;
                  }
                  return `<span style="display:inline-flex; align-items:center; gap:3px; font-size:10.5px; font-weight:700; padding:2.5px 6px; border-radius:4px; background:#FEE2E2; color:#DC2626; border:1px solid #FCA5A5;"><i data-lucide="alert-triangle" style="width:11px;height:11px;color:#EF4444;"></i> ${comp}</span>`;
                }).join('')
              }
            </div>
          </div>
        </div>

        <!-- Right Column: Student Remarks -->
        <div style="display:flex; flex-direction:column; gap:4px;">
          <span style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.3px;">Remarks & Problem Details</span>
          <div style="font-size:13.5px; font-weight:600; color:#1E293B; line-height:1.5; white-space:pre-line; background:#FAFDFE; border-left:3.5px solid var(--primary-teal); padding:10px 14px; border-radius:8px; min-height:86px;">${parsed.remarks}</div>
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

window.renderReports = function(reports) {
  const container = document.getElementById('dynamicReportsList');
  if (!container) return;
  
  if (reports.length === 0) {
    container.innerHTML = `
      <div class="ui-empty-state">
        <div class="ui-empty-icon">
          <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
        </div>
        <p>No PC issue reports yet. Submitted tickets will appear here when available.</p>
      </div>
    `;
    const toggleContainer = document.getElementById('completedToggleContainer');
    if (toggleContainer) toggleContainer.innerHTML = '';
    if (window.lucide) lucide.createIcons();
    return;
  }

  const activeReports = reports.filter(r => r.Status.toLowerCase() !== 'resolved');
  const resolvedReports = reports.filter(r => r.Status.toLowerCase() === 'resolved');

  // Update view completed button
  const toggleContainer = document.getElementById('completedToggleContainer');
  if (toggleContainer) {
    if (resolvedReports.length > 0) {
      toggleContainer.innerHTML = `
        <button class="toggle-completed-btn" onclick="window.openCompletedModal()">
          <i data-lucide="history" style="width:16px;height:16px;"></i>
          <span>View Completed Tickets (${resolvedReports.length})</span>
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
    if (activeReports.length === 0 && resolvedReports.length > 0) {
      container.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon">
            <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
          </div>
          <p>No active PC issue reports. Click "View Completed Tickets" to view completed history.</p>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon">
            <i data-lucide="file-bar-chart-2" style="width:24px;height:24px;"></i>
          </div>
          <p>No PC issue reports match your search query.</p>
        </div>
      `;
    }
  } else {
    container.innerHTML = htmlContent;
  }

  if (window.lucide) lucide.createIcons();
};

window.updateReportStatus = async function(reportId, newStatus) {
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
      // If modal is open, we need to refresh resolved list
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

window.deleteReport = async function(reportId) {
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

window.openCompletedModal = function() {
  const modal = document.getElementById('completedTicketsModal');
  const modalBody = document.getElementById('modalCompletedList');
  if (!modal || !modalBody) return;
  
  const searchInput = document.getElementById('reportSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const resolvedReports = window.allReports.filter(r => {
    const isResolved = r.Status.toLowerCase() === 'resolved';
    if (!isResolved) return false;
    if (!query) return true;
    return (
      r.Student_Name.toLowerCase().includes(query) ||
      r.Room_Number.toString().toLowerCase().includes(query) ||
      r.PC_Number.toString().toLowerCase().includes(query) ||
      r.Issue_Description.toLowerCase().includes(query) ||
      r.Priority_Level.toLowerCase().includes(query) ||
      r.Status.toLowerCase().includes(query)
    );
  });

  if (resolvedReports.length === 0) {
    modalBody.innerHTML = `
      <div class="ui-empty-state" style="padding: 40px 0;">
        <div class="ui-empty-icon">
          <i data-lucide="check-circle" style="width:24px;height:24px;"></i>
        </div>
        <p>${query ? 'No completed tickets match your search query.' : 'No completed tickets found.'}</p>
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

window.closeCompletedModal = function() {
  const modal = document.getElementById('completedTicketsModal');
  if (modal) modal.style.display = 'none';
};

// Event Listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Live search filtering
  const searchInput = document.getElementById('reportSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      if (!query) {
        window.renderReports(window.allReports);
        return;
      }

      const filtered = window.allReports.filter(report => {
        return (
          report.Student_Name.toLowerCase().includes(query) ||
          report.Room_Number.toString().toLowerCase().includes(query) ||
          report.PC_Number.toString().toLowerCase().includes(query) ||
          report.Issue_Description.toLowerCase().includes(query) ||
          report.Priority_Level.toLowerCase().includes(query) ||
          report.Status.toLowerCase().includes(query)
        );
      });

      window.renderReports(filtered);
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
