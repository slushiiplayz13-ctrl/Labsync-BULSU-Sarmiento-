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

    // Filter only meaningful room key custody & hardware security events (exclude intermediate QR scan events)
    const occupancyOnly = rawLogs.filter(item => {
      if (!item) return false;
      const status = String(item.status || '').trim().toLowerCase();
      if (status === 'qr code' || status === 'qr verified' || status === 'qr' || status.includes('qr verified')) {
        return false;
      }
      return (item.type === 'occupancy' || (!item.type && item.status && item.status !== 'Pending' && item.status !== 'In Progress' && item.status !== 'Resolved'));
    });

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
   * Formats a date string into an accessible full date and time string.
   * @param {string} dateString
   * @returns {string}
   */
  function formatExactDateTime(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  }

  /**
   * Derives presentation metadata for an activity log action.
   * Preserves authentic event data while providing semantic styling and iconography.
   * @param {object} log
   * @returns {{ label: string, actionType: string, icon: string, context: string|null }}
   */
  function getActionPresentation(log) {
    const status = String(log.status || '').trim();
    const sessionType = String(log.session_type || '').trim();

    // 1. Key Returned
    if (status === 'Key Returned' || status === 'KEY_RETURN' || status.toLowerCase() === 'returned') {
      return {
        label: 'Key Returned',
        actionType: 'returned',
        icon: 'check-circle-2'
      };
    }

    // 2. Key Taken / Borrowed
    if (status === 'Key Taken' || status.toLowerCase() === 'taken') {
      if (sessionType === 'Borrowed') {
        return {
          label: 'Key Borrowed',
          actionType: 'borrowed',
          icon: 'key-round'
        };
      }
      return {
        label: 'Key Taken',
        actionType: 'taken',
        icon: 'key-round'
      };
    }

    // 3. Key Transfer / Custody Handoff
    if (status === 'Key Transfer' || status === 'KEY_TRANSFER' || status.toLowerCase() === 'key transferred') {
      return {
        label: 'Key Transferred',
        actionType: 'transfer',
        icon: 'arrow-right-left'
      };
    }

    // 4. QR Identity Verification
    if (status.toLowerCase().includes('qr') || status === 'QR Code') {
      return {
        label: 'QR Verified',
        actionType: 'qr',
        icon: 'qr-code'
      };
    }

    // 5. Hardware / Security Warnings
    if (status === 'UNAUTHORIZED' || status.toLowerCase().includes('unauthorized')) {
      return {
        label: 'Unauthorized Key Access',
        actionType: 'security',
        icon: 'alert-triangle'
      };
    }
    if (status === 'WRONG_SLOT' || status.toLowerCase().includes('wrong')) {
      return {
        label: 'Wrong Key Slot',
        actionType: 'warning',
        icon: 'alert-triangle'
      };
    }

    // 6. Maintenance / Reports (if present)
    if (status === 'Resolved') {
      return {
        label: 'Issue Resolved',
        actionType: 'resolved',
        icon: 'check-circle-2'
      };
    }
    if (status === 'In Progress') {
      return {
        label: 'In Progress',
        actionType: 'progress',
        icon: 'wrench'
      };
    }
    if (status === 'Pending') {
      return {
        label: 'Issue Reported',
        actionType: 'pending',
        icon: 'alert-circle'
      };
    }

    // 7. General fallback / preservation of actual event meaning
    return {
      label: status || 'Activity Logged',
      actionType: 'neutral',
      icon: 'clock'
    };
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
      const rawStatus = String(log.status || '').trim();
      const isSecurityAlert = rawStatus === 'UNAUTHORIZED' || rawStatus.toLowerCase().includes('unauthorized');
      const isWrongSlot = rawStatus === 'WRONG_SLOT' || rawStatus.toLowerCase().includes('wrong');
      const isUnauthorizedReturn = (rawStatus === 'Key Returned' || rawStatus === 'KEY_RETURN' || rawStatus.toLowerCase() === 'returned') && (log.detail === 'Alarm Cleared' || log.description === 'Unidentified Person');

      let actorName = '';
      let detailText = '';
      let hasUser = false;

      if (isSecurityAlert) {
        actorName = 'Unidentified Person';
        detailText = 'Security Alert';
        hasUser = true;
      } else if (isWrongSlot) {
        actorName = 'Unidentified Person';
        detailText = 'Hardware Warning';
        hasUser = true;
      } else if (isUnauthorizedReturn) {
        actorName = 'Unidentified Person';
        detailText = 'Alarm Cleared';
        hasUser = true;
      } else {
        let profName = (log.description && log.description !== 'Room Key' && log.description !== 'Unidentified Person' && log.description !== 'None' && log.description !== 'N/A') ? log.description : '';
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

        hasUser = !!profName && profName !== 'None' && profName !== 'N/A';
        actorName = hasUser
          ? ((profName.startsWith('Prof.') || profName.startsWith('Dr.') || profName.startsWith('Engr.')) ? profName : `Prof. ${profName}`)
          : (log.detail && log.detail !== 'Faculty' ? log.detail : 'System');
        detailText = hasUser
          ? (log.detail || 'Faculty')
          : 'Automated Event';
      }

      const relTime = getRelativeTime(log.time);
      const exactStamp = formatExactDateTime(log.time);
      const isoTime = (function () {
        if (!log.time) return '';
        const d = new Date(log.time);
        return isNaN(d.getTime()) ? '' : d.toISOString();
      })();

      const actionInfo = getActionPresentation(log);

      const targetHtml = log.room_number
        ? `<span class="audit-target-tag"><span>RM ${escapeHtml(log.room_number)}</span></span>`
        : '';

      const extraNoteHtml = (log.description && !hasUser && log.description !== 'Room Key' && log.description !== 'None' && log.description !== 'N/A' && log.description !== actorName)
        ? `<div class="audit-extra-note">${escapeHtml(log.description)}</div>`
        : '';

      html += `
        <div class="timeline-item audit-item type-${escapeHtml(actionInfo.actionType)}">
          <div class="timeline-dot audit-timeline-dot dot-${escapeHtml(actionInfo.actionType)}" aria-hidden="true"></div>
          <div class="audit-row-header">
            <time class="audit-time-badge" datetime="${escapeHtml(isoTime)}" title="${escapeHtml(relTime)}" aria-label="${escapeHtml(exactStamp)}">
              <span>${escapeHtml(exactStamp)}</span>
            </time>
          </div>
          <div class="timeline-panel audit-panel">
            <div class="audit-action-row">
              <i data-lucide="${escapeHtml(actionInfo.icon)}" class="audit-type-icon icon-${escapeHtml(actionInfo.actionType)}"></i>
              <span class="audit-action-badge action-${escapeHtml(actionInfo.actionType)}">${escapeHtml(actionInfo.label)}</span>
            </div>
            <div class="audit-meta-line">
              ${targetHtml}
              <span class="audit-actor-group">
                ${hasUser ? '<span class="audit-by-prefix">by</span>' : ''}
                <strong class="audit-actor-name" title="${escapeHtml(detailText)}">${escapeHtml(actorName)}</strong>
                <span class="audit-dot">·</span>
                <span class="audit-role-text">${escapeHtml(detailText)}</span>
              </span>
            </div>
            ${extraNoteHtml}
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
    getRelativeTime,
    formatExactDateTime,
    getActionPresentation
  };

  global.roomStatusTimeline = roomStatusTimeline;

})(typeof window !== 'undefined' ? window : this);
