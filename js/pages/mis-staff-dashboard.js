/* ================================================================
   LabSync – MIS Staff Dashboard Controller  |  js/pages/mis-staff-dashboard.js
   ================================================================ */

'use strict';

/**
 * Updates dynamic greeting text and subtext for MIS Staff based on local time.
 */
function updateMISGreeting() {
  const now = new Date();
  const h = now.getHours();
  const greet = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
  const greetingEl = document.getElementById('greetingText');
  if (greetingEl) greetingEl.textContent = greet + ', MIS Staff!';
  const subEl = document.getElementById('greetingSub');
  if (subEl) {
    subEl.textContent = 'Manage system-wide hardware reports, administrative tasks, and the technical integrity of all IT laboratory spaces.';
  }
}

/**
 * Renders recent activity feed using shared ecosystem activity renderer.
 * @param {Array} reports - List of report objects
 */
function renderActivityFeed(reports) {
  const feedContainer = document.getElementById('misDashboardActivityList') || document.querySelector('.activity-feed-list');
  if (!feedContainer) return;
  if (typeof window.renderEcosystemActivityFeed === 'function') {
    window.renderEcosystemActivityFeed(reports, feedContainer);
  }
}

/**
 * Escapes HTML string content for safe DOM injection.
 * Uses window.escapeHtml if available, or local fallback.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (typeof window.escapeHtml === 'function' && window.escapeHtml !== escapeHtml) {
    return window.escapeHtml(str);
  }
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders the recent PC reports table rows.
 * @param {Array} reports - List of report objects
 */
function renderDashboardTable(reports) {
  const tbody = document.getElementById('misDashboardReportRows');
  if (!tbody) return;

  if (!reports || reports.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px;">
          No PC reports available. Reports will appear here when submitted.
        </td>
      </tr>
    `;
    return;
  }

  const searchInput = document.getElementById('dashboardSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const filtered = reports.filter(r => {
    if (!query) return true;
    const tkt = `ls-tkt-${r.Report_ID}`.toLowerCase();
    const room = `room ${r.Room_Number}`.toLowerCase();
    const pc = `pc ${r.PC_Number}`.toLowerCase();
    const desc = (r.Issue_Description || '').toLowerCase();
    return tkt.includes(query) || room.includes(query) || pc.includes(query) || desc.includes(query);
  });

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

    let displayIssue = 'Other';
    if (r.Issue_Description) {
      const rawDesc = r.Issue_Description;
      const issuesMatch = rawDesc.match(/\[Issues:\s*([^\]]+)\]/i);
      const remarksMatch = rawDesc.match(/Remarks:\s*(.*)$/is);
      const issues = issuesMatch ? issuesMatch[1].trim() : '';
      const remarks = remarksMatch ? remarksMatch[1].trim() : '';

      const hasRemarks = remarks.length > 0 &&
        remarks.toLowerCase() !== 'none' &&
        remarks.toLowerCase() !== 'no remarks provided';

      const lowerIssue = issues.toLowerCase();
      if (!issues || lowerIssue === 'none' || lowerIssue === 'n/a') {
        displayIssue = hasRemarks ? 'Other' : 'None';
      } else if (lowerIssue === 'others' || lowerIssue === 'other') {
        displayIssue = 'Other';
      } else {
        displayIssue = issues;
      }
    }

    return `
      <tr class="table-data-row">
        <td class="table-cell ticket-id-cell">
          <a href="mis-maintenance.html" class="ticket-id-link">LS-TKT-${r.Report_ID}</a>
        </td>
        <td class="table-cell date-cell col-date">${formattedDate}</td>
        <td class="table-cell room-cell text-center">Room ${r.Room_Number || 'N/A'}</td>
        <td class="table-cell pc-cell text-center">PC ${r.PC_Number || 'N/A'}</td>
        <td class="table-cell issue-cell">${escapeHtml(displayIssue)}</td>
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

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons({ root: tbody });
  }
}

/**
 * Fetches and binds live dashboard metrics, stat cards, report table, and activity feed.
 */
async function loadDashboardData() {
  try {
    const [reportsRes, roomsRes] = await Promise.all([
      fetch('/api/reports'),
      fetch('/api/laboratories')
    ]);

    const reports = reportsRes.ok ? await reportsRes.json() : [];
    const rooms = roomsRes.ok ? await roomsRes.json() : [];

    // Compute metrics
    const totalTickets = reports.length;
    const pendingTickets = reports.filter(r => (r.Status || '').toLowerCase() === 'pending');
    const resolvedTickets = reports.filter(r => (r.Status || '').toLowerCase() === 'resolved').length;
    const activeTickets = pendingTickets.length;
    const totalRooms = rooms.length;

    // Fetch PC counts
    let totalPcs = 0;
    if (rooms.length > 0) {
      const pcPromises = rooms.map(r => fetch(`/api/laboratories/${r.Room_ID}/pcs`).then(res => res.ok ? res.json() : []));
      const pcLists = await Promise.all(pcPromises);
      totalPcs = pcLists.reduce((acc, pcs) => acc + pcs.length, 0);
    }

    // Update Stat Cards
    const pcsEl = document.getElementById('mis-stat-pcs');
    if (pcsEl) pcsEl.textContent = totalPcs;
    const roomsEl = document.getElementById('mis-stat-rooms');
    if (roomsEl) roomsEl.textContent = `Across ${totalRooms} Room${totalRooms !== 1 ? 's' : ''}`;

    const pendingEl = document.getElementById('mis-stat-pending');
    if (pendingEl) pendingEl.textContent = activeTickets;
    const totalEl = document.getElementById('mis-stat-total');
    if (totalEl) totalEl.textContent = `${totalTickets} Total Tickets`;

    const resolvedEl = document.getElementById('mis-stat-resolved');
    if (resolvedEl) resolvedEl.textContent = resolvedTickets;

    // Render Recent Reports Table & Activity Feed
    renderDashboardTable(reports);
    renderActivityFeed(reports);
  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

/**
 * Resolves a ticket by Report_ID and refreshes dashboard data.
 * @param {number} reportId
 */
async function resolveDashboardTicket(reportId) {
  if (!confirm(`Are you sure you want to resolve Ticket LS-TKT-${reportId}?`)) return;
  try {
    const res = await fetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Resolved' })
    });
    if (res.ok) {
      loadDashboardData();
      if (window.showToast) window.showToast(`Ticket LS-TKT-${reportId} resolved successfully.`);
    }
  } catch (err) {
    console.error('Error resolving ticket:', err);
  }
}

/**
 * Initializes the MIS Staff Dashboard page listeners and elements.
 */
function initMISDashboardPage() {
  // Sidebar scroll clue handling
  const sidebar = document.querySelector('.sidebar');
  const scrollClue = document.getElementById('sidebarScrollClue');
  if (sidebar && scrollClue) {
    if (sidebar.scrollHeight <= sidebar.clientHeight) scrollClue.style.display = 'none';
    sidebar.addEventListener('scroll', () => {
      scrollClue.style.opacity = sidebar.scrollTop > 10 ? '0' : '1';
    });
  }

  updateMISGreeting();
  loadDashboardData();

  const searchInput = document.getElementById('dashboardSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => loadDashboardData());
  }
}

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMISDashboardPage);
} else {
  initMISDashboardPage();
}

// Global exports for inline HTML handlers
window.resolveDashboardTicket = resolveDashboardTicket;
