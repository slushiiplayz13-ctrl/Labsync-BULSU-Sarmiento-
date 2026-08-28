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

  // Load room status & activity logs concurrently with instant SWR cache
  async function loadRoomStatusAndLogs() {
    // 1. Instant SWR pre-render from cache (0ms delay!)
    try {
      const cachedRooms = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
      if (Array.isArray(cachedRooms) && cachedRooms.length > 0) {
        renderRoomStatusGrid(cachedRooms);
      }
      const cachedNotifs = JSON.parse(sessionStorage.getItem('labsync_cached_activities') || 'null');
      if (Array.isArray(cachedNotifs) && cachedNotifs.length > 0) {
        renderActivityLogList(cachedNotifs);
      }
    } catch (e) {}

    try {
      const [roomsRes, notifsRes] = await Promise.all([
        fetch('/api/laboratories', { credentials: 'include' }),
        fetch('/api/notifications', { credentials: 'include' })
      ]);

      if (roomsRes.ok) {
        const rooms = await roomsRes.json();
        try { sessionStorage.setItem('labsync_cached_labs', JSON.stringify(rooms)); } catch (e) {}
        renderRoomStatusGrid(rooms);
      }

      if (notifsRes.ok) {
        const notifs = await notifsRes.json();
        try { sessionStorage.setItem('labsync_cached_activities', JSON.stringify(notifs)); } catch (e) {}
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
    const dataKey = occupancyOnly.map(n => `${n.id || ''}-${n.type}-${n.status}-${n.room_number}-${n.session_type || ''}`).join('|');
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
      const hasUser = log.description && log.description !== 'Room Key';
      const profText = hasUser
        ? (log.description.startsWith('Prof.') ? log.description : `Prof. ${log.description}`)
        : '';

      if (log.status === 'Key Taken') {
        if (log.session_type === 'In Session') {
          activityText = `Key taken by ${profText || 'Faculty'} (In Session)`;
        } else if (log.session_type === 'Borrowed' || hasUser) {
          activityText = `Key borrowed by ${profText || 'Faculty'}`;
        } else {
          activityText = `Key taken for RM ${log.room_number || ''}`;
        }
      } else if (log.status === 'Key Returned') {
        activityText = `Key returned for RM ${log.room_number || ''}`;
      } else {
        activityText = `QR Code verified for ${log.description || 'User'} (Awaiting key retrieval).`;
      }

      const titleText = log.description && log.description !== 'Room Key' ? log.description : 'Room Key';
      const detailText = log.detail || 'System';
      const relTime = getRelativeTime(log.time);

      return `
        <div class="timeline-item">
          <div class="timeline-badge">
            <i data-lucide="key-round"></i>
          </div>
          <div class="timeline-panel">
            <div class="timeline-heading">
              <h4 class="timeline-title">${titleText}</h4>
              <p class="timeline-heading-meta">
                <i data-lucide="clock"></i>
                <span>${relTime}</span>
                <span style="color:var(--border-light, #cbd5e1);">•</span>
                <span>${detailText}</span>
              </p>
            </div>
            <div class="timeline-body">
              <p>${activityText}</p>
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

  // Expose globally for real-time polling
  window.loadITHeadRoomStatus = loadRoomStatusAndLogs;
  window.loadRoomStatusAndLogs = loadRoomStatusAndLogs;

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
