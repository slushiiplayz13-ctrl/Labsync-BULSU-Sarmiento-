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

  // Render room status cards using unified Laboratory Service design
  function renderRoomStatusGrid(rooms) {
    const grid = document.getElementById('ithead-room-grid');
    if (!grid) return;

    if (typeof window.renderLabCards === 'function') {
      window.renderLabCards(rooms, grid);
    } else if (typeof renderLabCards === 'function') {
      renderLabCards(rooms, grid);
    }
  }

  function getRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
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

    container.innerHTML = occupancyOnly.map(log => {
      let activityText = '';
      if (log.status === 'Key Taken') {
        if (log.description && log.description !== 'Room Key') {
          activityText = `Room key for Room ${log.room_number} taken by ${log.description} (Registered to system).`;
        } else {
          activityText = `Room key for Room ${log.room_number} was taken from the holder.`;
        }
      } else if (log.status === 'Key Returned') {
        activityText = `Room key for Room ${log.room_number} was returned (Room Secured).`;
      } else {
        activityText = `QR Code verified for ${log.description || 'user'} (Awaiting key retrieval).`;
      }

      const titleText = log.description && log.description !== 'Room Key' ? log.description : 'Room Key';
      const detailText = log.detail || 'System';
      const relTime = getRelativeTime(log.time);

      return `
        <div class="timeline-item" style="display:flex;gap:16px;margin-bottom:16px;position:relative;">
          <div class="timeline-badge" style="width:40px;height:40px;border-radius:50%;background:#E8F9FC;color:#1EBBD7;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:2;">
            <i data-lucide="key-round" style="width:18px;height:18px;"></i>
          </div>
          <div class="timeline-panel" style="flex:1;background:var(--bg-white, #fff);border:1px solid var(--border-light, #e2e8f0);border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <div class="timeline-heading" style="margin-bottom:6px;">
              <h4 class="timeline-title" style="font-family:var(--font-display);font-size:14.5px;font-weight:700;color:var(--text-dark, #1e293b);margin:0;">${titleText}</h4>
              <p style="margin:2px 0 0 0;font-size:12px;color:var(--text-light, #64748b);display:flex;align-items:center;gap:4px;">
                <i data-lucide="clock" style="width:12px;height:12px;"></i>
                <span>${relTime}</span>
                <span style="color:var(--border-light, #cbd5e1);">•</span>
                <span>${detailText}</span>
              </p>
            </div>
            <div class="timeline-body" style="font-family:var(--font-body);font-size:13.5px;color:var(--text-mid, #475569);line-height:1.5;">
              <p style="margin:0;">${activityText}</p>
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

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
