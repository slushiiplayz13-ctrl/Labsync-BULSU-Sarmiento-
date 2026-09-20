/**
 * IT Head Room Status Page Controller
 * LabSync - Phase 6A-07J-A
 *
 * Encapsulates room status overview grid, occupancy activity logs with data fingerprinting,
 * and sidebar scroll clue interactions.
 */

(function () {
  'use strict';

  const escapeHtml = (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : function (str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

  // State fingerprint to avoid unnecessary re-renders
  let _inlineActivityLogLastKey = '';
  let _itHeadRequestId = 0;
  let _itHeadFirstLoad = true;

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

  /**
   * Formats a date string into human-readable relative time.
   * @param {string} dateString
   * @returns {string}
   */
  function getRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Just now';
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }

  /**
   * Normalizes, deterministically sorts, and deduplicates activity logs.
   * @param {Array} rawLogs
   * @returns {Array}
   */
  function processOccupancyLogs(rawLogs) {
    if (!Array.isArray(rawLogs)) return [];

    // Filter only occupancy events (room key events & QR verification)
    const occupancyOnly = rawLogs.filter(item => item && (item.type === 'occupancy' || (!item.type && item.status && item.status !== 'Pending' && item.status !== 'In Progress' && item.status !== 'Resolved')));

    // Deterministic sort: Newest timestamp first; stable tie-breaker: highest record ID first
    const sorted = [...occupancyOnly].sort((a, b) => {
      const timeA = new Date(a.time || 0).getTime();
      const timeB = new Date(b.time || 0).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

    // Deduplicate by stable identifier
    const seenIds = new Set();
    const deduped = [];
    for (const log of sorted) {
      const idKey = log.id != null ? String(log.id) : null;
      if (idKey) {
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
      }
      deduped.push(log);
    }

    return deduped;
  }

  // Load room status & activity logs concurrently with instant SWR cache
  async function loadRoomStatusAndLogs() {
    // 1. Instant SWR pre-render from cache ONLY on initial first load
    if (_itHeadFirstLoad) {
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
    }

    const currentReqId = ++_itHeadRequestId;

    try {
      const fetchLabsFn = window.fetchLaboratories || (window.laboratoryService && window.laboratoryService.fetchLaboratories);
      const roomsPromise = typeof fetchLabsFn === 'function'
        ? fetchLabsFn().catch(() => [])
        : fetch('/api/laboratories', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []);

      const fetchNotifsFn = window.fetchNotifications || (window.notificationService && window.notificationService.fetchNotifications);
      const notifsPromise = typeof fetchNotifsFn === 'function'
        ? fetchNotifsFn().then(n => n || []).catch(() => [])
        : Promise.resolve([]);

      const [rooms, notifs] = await Promise.all([roomsPromise, notifsPromise]);

      // Discard stale out-of-order response if another request completed
      if (currentReqId !== _itHeadRequestId) return;

      if (Array.isArray(rooms) && rooms.length > 0) {
        renderRoomStatusGrid(rooms);
      }

      if (Array.isArray(notifs) && notifs.length > 0) {
        try { sessionStorage.setItem('labsync_cached_activities', JSON.stringify(notifs)); } catch (e) {}
        renderActivityLogList(notifs);
      }

      _itHeadFirstLoad = false;
    } catch (err) {
      if (currentReqId !== _itHeadRequestId) return;
      console.error('Error loading room status:', err);
    }
  }

  // Render room status cards using unified Laboratory Service design
  function renderRoomStatusGrid(rooms, targetGrid) {
    const grid = typeof targetGrid === 'string'
      ? document.querySelector(targetGrid)
      : (targetGrid || document.getElementById('ithead-room-grid'));
    if (!grid) return;

    if (window.laboratoryService && typeof window.laboratoryService.renderLabCards === 'function') {
      window.laboratoryService.renderLabCards(rooms, grid);
    } else if (typeof window.renderLabCards === 'function') {
      window.renderLabCards(rooms, grid);
    } else if (typeof renderLabCards === 'function') {
      renderLabCards(rooms, grid);
    }
  }

  // Render activity logs with scroll preservation & change fingerprinting
  function renderActivityLogList(notifs, targetContainer) {
    const container = typeof targetContainer === 'string'
      ? document.querySelector(targetContainer)
      : (targetContainer || document.getElementById('ithead-activity-list'));
    if (!container) return;

    // Normalize, deterministically sort, and deduplicate occupancy logs
    const occupancyOnly = processOccupancyLogs(notifs);

    // Build a data fingerprint to detect real changes
    const dataKey = occupancyOnly.length === 0
      ? '__EMPTY__'
      : occupancyOnly.map(n => `${n.id || ''}:${n.time || ''}:${n.status || ''}:${n.room_number || ''}:${n.description || ''}:${n.session_type || ''}`).join('|');

    if (container._lastActivitySignature === dataKey) {
      if (occupancyOnly.length === 0 && container.querySelector('.ui-empty-state')) {
        return;
      }
      if (occupancyOnly.length > 0 && container.querySelector('.timeline-item')) {
        return; // No change, skip re-render
      }
    }
    container._lastActivitySignature = dataKey;
    _inlineActivityLogLastKey = dataKey;

    // Save scroll position
    const savedScrollTop = container.scrollTop;

    if (occupancyOnly.length === 0) {
      container.innerHTML = `
        <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
          <div class="ui-empty-icon"><i data-lucide="clock-4"></i></div>
          <p>No recent activity events recorded.</p>
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: container });
      }
      return;
    }

    container.innerHTML = occupancyOnly.map(log => {
      let activityText = '';
      let profName = (log.description && log.description !== 'Room Key' && log.description !== 'None' && log.description !== 'N/A') ? log.description : '';
      if (!profName && log.room_number) {
        try {
          const cachedLabs = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
          if (Array.isArray(cachedLabs)) {
            const matched = cachedLabs.find(r => String(r.Room_Number).trim().toLowerCase() === String(log.room_number).trim().toLowerCase());
            if (matched) {
              const candidate = matched.Current_Key_Holder_Name || matched.Scheduled_Professor_Name || '';
              if (candidate && candidate !== 'None' && candidate !== 'N/A') {
                profName = candidate;
              }
            }
          }
        } catch (e) {}
      }

      const hasUser = !!profName && profName !== 'None' && profName !== 'N/A';
      const profText = hasUser
        ? (profName.startsWith('Prof.') ? profName : `Prof. ${profName}`)
        : '';
      const roomLabel = log.room_number ? `RM ${log.room_number}` : 'Room';

      if (log.status === 'Key Taken') {
        if (log.session_type === 'In Session') {
          activityText = profText
            ? `Key taken for ${roomLabel} by ${profText} (In Session)`
            : `Key taken for ${roomLabel} (In Session)`;
        } else if (profText) {
          activityText = `Key taken for ${roomLabel} by ${profText}`;
        } else {
          activityText = `Key taken for ${roomLabel}`;
        }
      } else if (log.status === 'Key Returned') {
        activityText = profText
          ? `Key returned for ${roomLabel} by ${profText}`
          : `Key returned for ${roomLabel}`;
      } else {
        activityText = `QR Code verified for ${profText || log.description || 'User'} (Awaiting key retrieval).`;
      }

      const titleText = profText || (log.room_number ? `RM ${log.room_number} Key` : 'Room Key');
      const detailText = log.detail || (hasUser ? 'Faculty' : 'System');
      const relTime = getRelativeTime(log.time);
      const roomBadgeHtml = log.room_number ? `<span class="timeline-meta-dot">•</span><span>${escapeHtml(roomLabel)}</span>` : '';

      return `
        <div class="timeline-item">
          <div class="timeline-panel">
            <div class="timeline-heading">
              <h4 class="timeline-title">${escapeHtml(titleText)}</h4>
              <p class="timeline-heading-meta">
                <i data-lucide="clock"></i>
                <span>${escapeHtml(relTime)}</span>
                <span class="timeline-meta-dot">•</span>
                <span>${escapeHtml(detailText)}</span>
                ${roomBadgeHtml}
              </p>
            </div>
            <div class="timeline-body">
              <p>${escapeHtml(activityText)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: container });
    }

    // Restore scroll position after re-render
    container.scrollTop = savedScrollTop;
  }

  // Initialize Page Component
  function initPage() {
    initSidebarScrollClue();
    loadRoomStatusAndLogs();
  }

  // Expose globally for real-time polling and parser-time hydration
  window.loadITHeadRoomStatus = loadRoomStatusAndLogs;
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
