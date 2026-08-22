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
      if (status === 'Key Taken') {
        titleText = n.description && n.description !== 'Room Key'
          ? `Room key for Room ${n.room_number || 'N/A'} taken by ${n.description}`
          : `Room key for Room ${n.room_number || 'N/A'} taken`;
      } else if (status === 'Key Returned') {
        titleText = `Room key for Room ${n.room_number || 'N/A'} returned (Room Secured)`;
      } else {
        titleText = `Access verified for ${n.description || 'User'} in Room ${n.room_number || 'N/A'}`;
      }

      return {
        id: `occ-${n.id}`,
        title: titleText,
        meta: `${n.detail || 'System'} • Room ${n.room_number || 'N/A'}`,
        badgeLabel: status,
        badgeClass: status === 'Key Returned' ? 'iot-online' : status === 'Key Taken' ? 'schedule' : 'security',
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
   * System Activity Stream & Audit Log Fetcher (Live API Data).
   * @param {string|HTMLElement} targetContainer
   * @param {Array|null} [optionalReports=null]
   */
  async function loadSystemActivityFeed(targetContainer, optionalReports = null) {
    const container = typeof targetContainer === 'string'
      ? document.getElementById(targetContainer)
      : (targetContainer || document.getElementById('misDashboardActivityList') || document.querySelector('.activity-feed-list'));

    if (!container) return;

    let activities = [];

    try {
      // 1. Fetch real merged system audit notifications from Notification Service
      const rawNotifs = typeof global.fetchNotifications === 'function'
        ? await global.fetchNotifications()
        : (global.notificationService && typeof global.notificationService.fetchNotifications === 'function'
          ? await global.notificationService.fetchNotifications()
          : await (async () => {
            const res = await fetch('/api/notifications', { credentials: 'include' });
            return res.ok ? await res.json() : null;
          })());

      if (Array.isArray(rawNotifs) && rawNotifs.length > 0) {
        activities = rawNotifs.map(n => transformNotificationToActivity(n));
      }
    } catch (err) {
      console.warn('[ActivityFeed] Could not fetch /api/notifications:', err);
    }

    // 2. Fallback / Merge with live PC reports from API if notifications empty or unauthenticated
    if (activities.length === 0) {
      let reports = optionalReports;
      if (!reports) {
        try {
          const repRes = await fetch('/api/reports');
          if (repRes.ok) reports = await repRes.json();
        } catch (e) {
          console.warn('[ActivityFeed] Could not fetch /api/reports fallback:', e);
        }
      }

      if (Array.isArray(reports) && reports.length > 0) {
        activities = reports.map(r => transformReportToActivity(r));
      }
    }

    // If no data exists in database, render clean empty state
    if (!activities || activities.length === 0) {
      container.innerHTML = `
        <div class="activity-empty">
          No recent system activity. System updates and audit logs will appear here.
        </div>
      `;
      return;
    }

    // Sort descending by timestamp
    activities.sort((a, b) => b.timestamp - a.timestamp);

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
   * Alias for backward compatibility with inline page callers.
   */
  function renderEcosystemActivityFeed(reports, container) {
    return loadSystemActivityFeed(container, reports);
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.loadSystemActivityFeed = loadSystemActivityFeed;
  global.renderEcosystemActivityFeed = renderEcosystemActivityFeed;

})(typeof window !== 'undefined' ? window : this);
