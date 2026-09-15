/**
 * LabSync – Room Status Occupancy Timeline Module  |  js/pages/room-status/room-status.timeline.js
 * Encapsulates occupancy access event fetching, SWR caching, fingerprint diffing, scroll preservation, and timeline rendering.
 */

(function (global) {
  'use strict';

  let _activityLogFirstLoad = true;
  let _activityLogLastDataKey = '';

  /**
   * Formats a date string into human-readable relative time.
   * @param {string} dateString
   * @returns {string}
   */
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

  /**
   * Single authoritative timeline item renderer for occupancy activity logs.
   * @param {Array} occupancyLogs - Array of occupancy notification objects
   * @param {HTMLElement} timelineList - Target container element
   */
  function renderTimelineItems(occupancyLogs, timelineList) {
    if (!timelineList || !Array.isArray(occupancyLogs)) return;

    const dataKey = occupancyLogs.length === 0
      ? '__EMPTY__'
      : occupancyLogs.map(l => `${l.id}-${l.status}-${l.room_number}-${l.description}-${l.session_type || ''}`).join('|');

    if (timelineList._lastActivitySignature === dataKey) {
      if (occupancyLogs.length === 0 && timelineList.querySelector('.ui-empty-state')) {
        return;
      }
      if (occupancyLogs.length > 0 && timelineList.querySelector('.timeline-item')) {
        return;
      }
    }
    timelineList._lastActivitySignature = dataKey;
    _activityLogLastDataKey = dataKey;

    if (occupancyLogs.length === 0) {
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
    occupancyLogs.forEach(log => {
      let activityText = '';
      let profName = (log.description && log.description !== 'Room Key') ? log.description : '';
      if (!profName && log.room_number) {
        try {
          const cachedLabs = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
          if (Array.isArray(cachedLabs)) {
            const matched = cachedLabs.find(r => String(r.Room_Number).trim().toLowerCase() === String(log.room_number).trim().toLowerCase());
            if (matched) {
              profName = matched.Current_Key_Holder_Name || matched.Scheduled_Professor_Name || '';
            }
          }
        } catch (e) {}
      }

      const hasUser = !!profName;
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
      const metaRoom = log.room_number ? ` • ${roomLabel}` : '';

      html += `
        <div class="timeline-item" style="display:flex;gap:16px;margin-bottom:20px;position:relative;">
          <div class="timeline-badge" style="width:40px;height:40px;border-radius:50%;background:#E8F9FC;color:#1EBBD7;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:2;">
            <i data-lucide="key-round" style="width:18px;height:18px;"></i>
          </div>
          <div class="timeline-panel" style="flex:1;background:var(--bg-white, #fff);border:1px solid var(--border-light, #e2e8f0);border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
            <div class="timeline-heading" style="margin-bottom:6px;">
              <h4 class="timeline-title" style="font-family:var(--font-display);font-size:14.5px;font-weight:700;color:var(--text-dark, #1e293b);margin:0;">${titleText}</h4>
              <p style="margin:2px 0 0 0;font-size:12px;color:var(--text-light, #64748b);display:flex;align-items:center;gap:4px;">
                <i data-lucide="clock" style="width:12px;height:12px;"></i>
                <span>${getRelativeTime(log.time)}</span>
                <span style="color:var(--border-light, #cbd5e1);">•</span>
                <span>${detailText}${metaRoom}</span>
              </p>
            </div>
            <div class="timeline-body" style="font-family:var(--font-body);font-size:13.5px;color:var(--text-mid, #475569);line-height:1.5;">
              <p style="margin:0;">${activityText}</p>
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

    // Instant SWR pre-render from cache (0ms delay!)
    try {
      const cached = JSON.parse(sessionStorage.getItem('labsync_cached_activities') || 'null');
      if (Array.isArray(cached) && cached.length > 0) {
        const occupancyLogs = cached.filter(a => a.type === 'occupancy');
        renderTimelineItems(occupancyLogs, timelineList);
        _activityLogFirstLoad = false;
      }
    } catch (e) {}

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

    try {
      const fetchNotifsFn = (global.notificationService && typeof global.notificationService.fetchNotifications === 'function')
        ? global.notificationService.fetchNotifications
        : (typeof global.fetchNotifications === 'function' ? global.fetchNotifications : null);

      const activities = typeof fetchNotifsFn === 'function' ? await fetchNotifsFn() : null;

      if (!activities || !Array.isArray(activities)) throw new Error('Failed to load activities');

      // Cache fresh activity array for future SWR pre-render
      try {
        sessionStorage.setItem('labsync_cached_activities', JSON.stringify(activities));
      } catch (e) {}

      // Filter only occupancy log notifications
      const occupancyLogs = activities.filter(a => a.type === 'occupancy');

      const savedScrollTop = timelineList.scrollTop;
      renderTimelineItems(occupancyLogs, timelineList);
      timelineList.scrollTop = savedScrollTop;

      _activityLogFirstLoad = false;
    } catch (err) {
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
