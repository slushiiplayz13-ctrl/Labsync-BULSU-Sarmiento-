/**
 * LabSync – Room Status Occupancy Timeline Module  |  js/pages/room-status/room-status.timeline.js
 * Encapsulates occupancy access event fetching, SWR caching, fingerprint diffing, scroll preservation, and timeline rendering.
 */

(function (global) {
  'use strict';

  const escapeHtml = (typeof global.escapeHtml === 'function')
    ? global.escapeHtml
    : function (str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

  let _activityLogFirstLoad = true;
  let _activityLogLastDataKey = '';
  let _timelineRequestId = 0;

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

  /**
   * Single authoritative timeline item renderer for occupancy activity logs.
   * @param {Array} occupancyLogs - Array of occupancy notification objects
   * @param {HTMLElement} timelineList - Target container element
   */
  function renderTimelineItems(occupancyLogs, timelineList) {
    if (!timelineList || !Array.isArray(occupancyLogs)) return;

    const processedLogs = processOccupancyLogs(occupancyLogs);

    const dataKey = processedLogs.length === 0
      ? '__EMPTY__'
      : processedLogs.map(l => `${l.id || ''}:${l.time || ''}:${l.status || ''}:${l.room_number || ''}:${l.description || ''}:${l.session_type || ''}`).join('|');

    if (timelineList._lastActivitySignature === dataKey) {
      if (processedLogs.length === 0 && timelineList.querySelector('.ui-empty-state')) {
        return;
      }
      if (processedLogs.length > 0 && timelineList.querySelector('.timeline-item')) {
        return;
      }
    }
    timelineList._lastActivitySignature = dataKey;
    _activityLogLastDataKey = dataKey;

    if (processedLogs.length === 0) {
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
          <div class="ui-empty-icon">
            <i data-lucide="clock-4" style="width:24px;height:24px;"></i>
          </div>
          <p>No activity yet. Recent room events will appear here when available.</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: timelineList });
      }
      return;
    }

    let html = '';
    processedLogs.forEach(log => {
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

      html += `
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
    });

    timelineList.innerHTML = html;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: timelineList });
    }
  }

  /**
   * Fetches and loads live occupancy access events on the room status timeline.
   * Zero-flicker background updates with SWR cache and data fingerprint diffing.
   */
  async function loadRoomStatusActivityLog() {
    const timelineList = document.querySelector('.timeline-list');
    if (!timelineList) return;

    // Instant SWR pre-render from cache ONLY on initial load
    if (_activityLogFirstLoad) {
      try {
        const cached = JSON.parse(sessionStorage.getItem('labsync_cached_activities') || 'null');
        if (Array.isArray(cached) && cached.length > 0) {
          renderTimelineItems(cached, timelineList);
        }
      } catch (e) {}
    }

    // Only show the loading spinner if there is no cache and first load
    if (_activityLogFirstLoad && (!timelineList.children || timelineList.children.length === 0 || timelineList.querySelector('.ui-empty-state'))) {
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
          <div class="ui-empty-icon">
            <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
          </div>
          <p>Loading recent activities...</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: timelineList });
      }
    }

    const currentReqId = ++_timelineRequestId;

    try {
      const fetchNotifsFn = (global.notificationService && typeof global.notificationService.fetchNotifications === 'function')
        ? global.notificationService.fetchNotifications
        : (typeof global.fetchNotifications === 'function' ? global.fetchNotifications : null);

      const activities = typeof fetchNotifsFn === 'function' ? await fetchNotifsFn() : null;

      // Discard stale out-of-order response if another request completed
      if (currentReqId !== _timelineRequestId) return;

      if (!activities || !Array.isArray(activities)) throw new Error('Failed to load activities');

      // Cache fresh activity array for future SWR pre-render
      try {
        sessionStorage.setItem('labsync_cached_activities', JSON.stringify(activities));
      } catch (e) {}

      const savedScrollTop = timelineList.scrollTop;
      renderTimelineItems(activities, timelineList);
      timelineList.scrollTop = savedScrollTop;

      _activityLogFirstLoad = false;
    } catch (err) {
      if (currentReqId !== _timelineRequestId) return;
      console.error('[RoomStatusTimeline] Error loading room status activities:', err);
      if (_activityLogFirstLoad) {
        timelineList.innerHTML = `
          <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
            <div class="ui-empty-icon" style="background:#FEE2E2;color:#EF4444;">
              <i data-lucide="alert-circle"></i>
            </div>
            <p>Failed to load activity logs.</p>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: timelineList });
        }
      }
    }
  }

  const roomStatusTimeline = {
    loadRoomStatusActivityLog,
    renderTimelineItems,
    getRelativeTime
  };

  global.roomStatusTimeline = roomStatusTimeline;

})(typeof window !== 'undefined' ? window : this);
