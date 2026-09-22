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

  // Formats date string into accessible full date and time string
  function formatExactDateTime(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  }

  // Derives presentation metadata for an activity log action
  function getActionPresentation(log) {
    if (window.roomStatusTimeline && typeof window.roomStatusTimeline.getActionPresentation === 'function') {
      return window.roomStatusTimeline.getActionPresentation(log);
    }
    const status = String(log.status || '').trim();
    const sessionType = String(log.session_type || '').trim();

    if (status === 'Key Returned' || status === 'KEY_RETURN' || status.toLowerCase() === 'returned') {
      return { label: 'Key Returned', actionType: 'returned', icon: 'check-circle-2' };
    }
    if (status === 'Key Taken' || status.toLowerCase() === 'taken') {
      if (sessionType === 'Borrowed') {
        return { label: 'Key Borrowed', actionType: 'borrowed', icon: 'key-round' };
      }
      return { label: 'Key Taken', actionType: 'taken', icon: 'key-round' };
    }
    if (status === 'Key Transfer' || status === 'KEY_TRANSFER' || status.toLowerCase() === 'key transferred') {
      return { label: 'Key Transferred', actionType: 'transfer', icon: 'arrow-right-left' };
    }
    if (status.toLowerCase().includes('qr') || status === 'QR Code') {
      return { label: 'QR Verified', actionType: 'qr', icon: 'qr-code' };
    }
    if (status === 'UNAUTHORIZED' || status.toLowerCase().includes('unauthorized')) {
      return { label: 'Unauthorized Key Access', actionType: 'security', icon: 'alert-triangle' };
    }
    if (status === 'WRONG_SLOT' || status.toLowerCase().includes('wrong')) {
      return { label: 'Wrong Key Slot', actionType: 'warning', icon: 'alert-triangle' };
    }
    if (status === 'Resolved') {
      return { label: 'Issue Resolved', actionType: 'resolved', icon: 'check-circle-2' };
    }
    if (status === 'In Progress') {
      return { label: 'In Progress', actionType: 'progress', icon: 'wrench' };
    }
    if (status === 'Pending') {
      return { label: 'Issue Reported', actionType: 'pending', icon: 'alert-circle' };
    }
    return { label: status || 'Activity Logged', actionType: 'neutral', icon: 'clock' };
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

      return `
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
