/**
 * LabSync – System Activity Feed Component | js/components/activity-feed.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  function escapeStr(str) {
    if (typeof global.escapeHtml === 'function') {
      return global.escapeHtml(str);
    }
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getRelativeTimeStr(date) {
    if (!date || isNaN(date.getTime())) return 'Recently';
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 45) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mins ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function transformNotificationToActivity(n) {
    const dateObj = n.time ? new Date(n.time) : new Date();

    if (n.type === 'occupancy') {
      let titleText = '';
      const status = n.status || 'Access';
      const hasUser = n.description && n.description !== 'Room Key';
      const profText = hasUser
        ? (n.description.startsWith('Prof.') ? n.description : `Prof. ${n.description}`)
        : '';

      if (status === 'Key Taken') {
        if (n.session_type === 'In Session') {
          titleText = `Key taken by ${profText || 'Faculty'} (In Session)`;
        } else if (n.session_type === 'Borrowed' || hasUser) {
          titleText = `Key borrowed by ${profText || 'Faculty'}`;
        } else {
          titleText = `Key taken for Room ${n.room_number || 'N/A'}`;
        }
      } else if (status === 'Key Returned') {
        titleText = `Key returned for RM ${n.room_number || 'N/A'}`;
      } else {
        titleText = `Access verified for ${n.description || 'User'} in Room ${n.room_number || 'N/A'}`;
      }

      const badgeLabel = (status === 'Key Taken' && n.session_type) ? n.session_type : status;
      const badgeClass = status === 'Key Returned'
        ? 'iot-online'
        : (status === 'Key Taken' && n.session_type === 'In Session')
          ? 'schedule'
          : (status === 'Key Taken')
            ? 'maint-pending'
            : 'security';

      return {
        id: `occ-${n.id}`,
        title: titleText,
        meta: `${n.detail || 'System'} • Room ${n.room_number || 'N/A'}`,
        badgeLabel: badgeLabel,
        badgeClass: badgeClass,
        icon: status === 'Key Returned' ? 'check-circle' : 'key-round',
        timestamp: dateObj
      };
    } else {
      // Maintenance report notification
      const statusLower = (n.status || '').toLowerCase();
      const isResolved = statusLower === 'resolved';
      const isInProgress = statusLower === 'in progress';

      return {
        id: `report-${n.id}`,
        title: isResolved
          ? `Ticket LS-TKT-${n.id} marked as Resolved`
          : isInProgress
            ? `Ticket LS-TKT-${n.id} in progress (Room ${n.room_number || 'N/A'})`
            : `PC #${n.pc_number || 'N/A'} reported in Room ${n.room_number || 'N/A'}`,
        meta: isResolved ? `MIS Maintenance` : `Reported by ${n.detail || 'Student'}`,
        badgeLabel: n.status || 'Pending',
        badgeClass: isResolved ? 'maint-resolved' : isInProgress ? 'maint-progress' : 'maint-pending',
        icon: isResolved ? 'check-circle' : isInProgress ? 'wrench' : 'alert-circle',
        timestamp: dateObj
      };
    }
  }

  function transformReportToActivity(r) {
    const statusLower = (r.Status || '').toLowerCase();
    const isResolved = statusLower === 'resolved';
    const isInProgress = statusLower === 'in progress';
    const dateObj = r.Date_Reported ? new Date(r.Date_Reported) : new Date();

    return {
      id: `maint-${r.Report_ID}`,
      title: isResolved
        ? `Ticket LS-TKT-${r.Report_ID} marked as Resolved by Staff`
        : isInProgress
          ? `Ticket LS-TKT-${r.Report_ID} assigned & in progress (Room ${r.Room_Number || 'N/A'})`
          : `PC #${r.PC_Number || 'N/A'} reported in Room ${r.Room_Number || 'N/A'}`,
      meta: isResolved ? `Initiated by MIS Staff` : `Reported by ${r.Student_Name || 'Student'}`,
      badgeLabel: isResolved ? 'Resolved' : isInProgress ? 'In Progress' : 'Pending',
      badgeClass: isResolved ? 'maint-resolved' : isInProgress ? 'maint-progress' : 'maint-pending',
      icon: isResolved ? 'check-circle' : isInProgress ? 'wrench' : 'alert-circle',
      timestamp: dateObj
    };
  }

  /**
   * Computes a deterministic signature of the rendered activities dataset.
   * @param {Array} activities
   * @returns {string}
   */
  function computeActivitySignature(activities) {
    if (!Array.isArray(activities) || activities.length === 0) return 'empty';
    return activities.slice(0, 10).map(act => {
      const timeVal = act.timestamp instanceof Date ? act.timestamp.getTime() : (act.timestamp || '');
      return `${act.id}_${act.badgeLabel}_${act.badgeClass}_${act.title}_${act.meta}_${timeVal}`;
    }).join('|');
  }

  /**
   * Authoritative DOM renderer for activity tiles with signature diffing.
   * @param {Array} activities
   * @param {HTMLElement} container
   */
  function renderActivityCards(activities, container) {
    if (!container) return;

    if (!Array.isArray(activities) || activities.length === 0) {
      const sig = 'empty';
      if (container._lastActivitySignature === sig) return;
      container._lastActivitySignature = sig;
      container.innerHTML = `
        <div class="activity-empty">
          No recent system activity. System updates and audit logs will appear here.
        </div>
      `;
      return;
    }

    const signature = computeActivitySignature(activities);
    if (container._lastActivitySignature === signature) {
      return; // Signature match: identical dataset, skip DOM replacement and icon creation
    }
    container._lastActivitySignature = signature;

    container.innerHTML = activities.slice(0, 10).map(act => {
      const relTime = getRelativeTimeStr(act.timestamp);
      return `
        <div class="activity-tile">
          <div class="activity-tile-left">
            <div class="activity-tile-icon ${act.badgeClass}">
              <i data-lucide="${act.icon}"></i>
            </div>
            <div class="activity-tile-details">
              <div class="activity-tile-title">${escapeStr(act.title)}</div>
              <div class="activity-tile-meta">${escapeStr(act.meta)}</div>
            </div>
          </div>
          <div class="activity-tile-right">
            <span class="activity-status-pill ${act.badgeClass}">${escapeStr(act.badgeLabel)}</span>
            <span class="activity-tile-time">${relTime}</span>
          </div>
        </div>
      `;
    }).join('');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: container });
    }
  }

  /**
   * Transforms raw notifications or reports and renders activity cards synchronously.
   * @param {Array|null} notifications
   * @param {Array|null} reports
   * @param {HTMLElement} container
   * @returns {boolean} True if items were rendered, false otherwise.
   */
  function renderFromRawData(notifications, reports, container) {
    if (!container) return false;
    let activities = [];

    if (Array.isArray(notifications) && notifications.length > 0) {
      const isMisPage = typeof window !== 'undefined' && window.location.pathname.includes('mis-');
      const filtered = isMisPage
        ? notifications.filter(n => n.type === 'report')
        : notifications;
      activities = filtered.map(n => transformNotificationToActivity(n));
    } else if (Array.isArray(reports) && reports.length > 0) {
      activities = reports.map(r => transformReportToActivity(r));
    }

    if (activities.length > 0) {
      activities.sort((a, b) => b.timestamp - a.timestamp);
      renderActivityCards(activities, container);
      return true;
    }
    return false;
  }

  /**
   * System Activity Stream & Audit Log Fetcher (Live API Data with SWR Cache & Signature Diffing).
   * @param {string|HTMLElement} targetContainer
   * @param {Array|null} [optionalReports=null]
   * @param {Array|null} [optionalNotifications=null]
   */
  async function loadSystemActivityFeed(targetContainer, optionalReports = null, optionalNotifications = null) {
    const container = typeof targetContainer === 'string'
      ? document.getElementById(targetContainer)
      : (targetContainer || document.getElementById('misDashboardActivityList') || document.querySelector('.activity-feed-list'));

    if (!container) return;

    // 1. SWR Fast-path: Pre-render from passed notifications/reports or session cache if container is unpopulated
    if (!container._lastActivitySignature) {
      let cachedNotifs = optionalNotifications;
      if (!cachedNotifs) {
        try {
          cachedNotifs = JSON.parse(sessionStorage.getItem('labsync_cached_notifications') || 'null');
        } catch (e) { }
      }

      let cachedReports = optionalReports;
      if (!cachedReports) {
        try {
          cachedReports = JSON.parse(sessionStorage.getItem('labsync_cached_reports') || 'null');
        } catch (e) { }
      }

      renderFromRawData(cachedNotifs, cachedReports, container);
    }

    let activities = [];

    try {
      // 2. Fetch real merged system audit notifications from Notification Service
      const fetchNotifsFn = global.fetchNotifications || (global.notificationService && global.notificationService.fetchNotifications);
      const rawNotifs = typeof fetchNotifsFn === 'function' ? await fetchNotifsFn() : null;

      if (Array.isArray(rawNotifs) && rawNotifs.length > 0) {
        const isMisPage = typeof window !== 'undefined' && window.location.pathname.includes('mis-');
        const filteredNotifs = isMisPage
          ? rawNotifs.filter(n => n.type === 'report')
          : rawNotifs;
        activities = filteredNotifs.map(n => transformNotificationToActivity(n));
      }
    } catch (err) {
      console.warn('[ActivityFeed] Could not fetch /api/notifications:', err);
    }

    // 3. Fallback / Merge with live PC reports from API if notifications empty
    if (activities.length === 0) {
      let reports = optionalReports;
      if (!reports) {
        try {
          const fetchFn = global.fetchReports || (global.reportService && global.reportService.fetchReports);
          if (typeof fetchFn === 'function') {
            reports = await fetchFn();
          } else {
            const repRes = await fetch('/api/reports');
            if (repRes.ok) reports = await repRes.json();
          }
        } catch (e) {
          console.warn('[ActivityFeed] Could not fetch /api/reports fallback:', e);
        }
      }

      if (Array.isArray(reports) && reports.length > 0) {
        activities = reports.map(r => transformReportToActivity(r));
      }
    }

    // Sort descending by timestamp
    if (activities.length > 0) {
      activities.sort((a, b) => b.timestamp - a.timestamp);
    }

    // 4. Render with signature diffing (zero DOM writes if identical)
    renderActivityCards(activities, container);
  }

  /**
   * Alias for backward compatibility with inline page callers.
   */
  function renderEcosystemActivityFeed(reports, container, optionalNotifications = null) {
    return loadSystemActivityFeed(container, reports, optionalNotifications);
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.activityFeed = {
    computeActivitySignature,
    renderActivityCards,
    renderFromRawData,
    loadSystemActivityFeed,
    transformNotificationToActivity,
    transformReportToActivity
  };
  global.loadSystemActivityFeed = loadSystemActivityFeed;
  global.renderEcosystemActivityFeed = renderEcosystemActivityFeed;

})(typeof window !== 'undefined' ? window : this);
