/**
 * IT Head Room Status Page Controller
 * LabSync - Phase 6A-07J-A
 *
 * Encapsulates room status overview grid, occupancy activity logs with data fingerprinting,
 * and sidebar scroll clue interactions.
 */

(function () {
  'use strict';

  // State fingerprint to avoid unnecessary re-renders
  let _inlineActivityLogLastKey = '';

  // Sidebar scroll clue
  function initSidebarScrollClue() {
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
  }

  // Load room status & activity logs concurrently
  async function loadRoomStatusAndLogs() {
    try {
      const [roomsRes, notifsRes] = await Promise.all([
        fetch('/api/laboratories', { credentials: 'include' }),
        fetch('/api/notifications', { credentials: 'include' })
      ]);

      if (roomsRes.ok) {
        const rooms = await roomsRes.json();
        renderRoomStatusGrid(rooms);
      }

      if (notifsRes.ok) {
        const notifs = await notifsRes.json();
        renderActivityLogList(notifs);
      }
    } catch (err) {
      console.error('Error loading room status:', err);
    }
  }

  // Render room status cards
  function renderRoomStatusGrid(rooms) {
    const grid = document.getElementById('ithead-room-grid');
    if (!grid) return;

    if (!rooms || rooms.length === 0) {
      grid.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon"><i data-lucide="monitor-dot"></i></div>
          <p>No room data available.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = rooms.map(r => {
      const statusClass = (r.Current_Status || 'Available').toLowerCase().replace(/\s+/g, '-');
      const badgeColor = statusClass === 'in-use' ? '#EF4444' : (statusClass === 'claimed' ? '#F59E0B' : '#10B981');
      const badgeBg = statusClass === 'in-use' ? '#FEE2E2' : (statusClass === 'claimed' ? '#FEF3C7' : '#D1FAE5');

      return `
        <div class="lab-card" style="background: var(--bg-white); border: 1px solid var(--border-light); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 800; font-size: 16px; color: var(--text-dark);">Room ${r.Room_Number}</div>
            <span style="font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; background: ${badgeBg}; color: ${badgeColor}; text-transform: uppercase;">
              ${r.Current_Status}
            </span>
          </div>
          <div style="font-size: 12.5px; color: var(--text-mid);">${r.Building || 'IT Building'}   Key: <strong>${r.Key_Status || 'Present'}</strong></div>
          <div style="font-size: 12px; color: var(--text-dark); font-weight: 600; background: var(--bg-body); padding: 8px 10px; border-radius: 8px;">
            ${r.Current_Class !== 'None' ? r.Current_Class : 'No Active Class'}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
  }

  // Render activity logs with scroll preservation & change fingerprinting
  function renderActivityLogList(notifs) {
    const container = document.getElementById('ithead-activity-list');
    if (!container) return;

    // Only show occupancy logs (room key events & QR verification), not PC reports
    const occupancyOnly = (notifs || []).filter(n => n.type === 'occupancy');

    // Build a data fingerprint to detect real changes
    const dataKey = occupancyOnly.map(n => `${n.id || ''}-${n.type}-${n.status}-${n.room_number}`).join('|');
    if (dataKey === _inlineActivityLogLastKey) return; // No change, skip re-render

    // Save scroll position
    const savedScrollTop = container.scrollTop;

    if (occupancyOnly.length === 0) {
      container.innerHTML = `
        <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
          <div class="ui-empty-icon"><i data-lucide="clock-4"></i></div>
          <p>No recent activity events recorded.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      _inlineActivityLogLastKey = dataKey;
      return;
    }

    container.innerHTML = occupancyOnly.map(n => {
      const dateObj = n.time ? new Date(n.time) : new Date();
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isReport = n.type === 'report';

      return `
        <div style="display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-bottom: 1px solid var(--border-light); font-size: 13px;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isReport ? '#FEF3C7' : '#E0F2FE'}; color: ${isReport ? '#D97706' : '#0284C7'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
            <i data-lucide="${isReport ? 'wrench' : 'key'}" style="width: 16px; height: 16px;"></i>
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 700; color: var(--text-dark); display: flex; justify-content: space-between;">
              <span>${isReport ? `PC Report (Room ${n.room_number})` : `Room Access (Room ${n.room_number})`}</span>
              <span style="font-size: 11px; font-weight: 500; color: var(--text-light);">${formattedDate}</span>
            </div>
            <div style="font-size: 12.5px; color: var(--text-mid); margin-top: 2px;">
              ${isReport ? `PC ${n.pc_number} - ${n.description}` : `${n.description} (${n.detail || 'Event'})`}
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    _inlineActivityLogLastKey = dataKey;

    // Restore scroll position after re-render
    container.scrollTop = savedScrollTop;
  }

  // Initialize Page Component
  function initPage() {
    initSidebarScrollClue();
    loadRoomStatusAndLogs();
  }

  // Global Compatibility Bridges
  window.loadRoomStatusAndLogs = loadRoomStatusAndLogs;
  window.renderRoomStatusGrid = renderRoomStatusGrid;
  window.renderActivityLogList = renderActivityLogList;

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
