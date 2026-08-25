/**
 * LabSync – Room Status Page Controller | js/pages/room-status.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  let _activityLogFirstLoad = true;
  let _activityLogLastDataKey = '';

  /**
   * Loads and renders all laboratory room status cards.
   */
  async function loadAllRoomStatusLabs() {
    const labsGrid = document.querySelector('.labs-grid');
    if (!labsGrid) return;

    try {
      const fetchFn = typeof global.fetchLaboratories === 'function'
        ? global.fetchLaboratories
        : (global.laboratoryService && typeof global.laboratoryService.fetchLaboratories === 'function'
          ? global.laboratoryService.fetchLaboratories
          : async () => {
            const res = await fetch('/api/laboratories', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to load laboratories');
            return await res.json();
          });

      const allLabs = await fetchFn();
      if (typeof global.renderLabCards === 'function') {
        global.renderLabCards(allLabs, labsGrid);
      }
    } catch (err) {
      console.error('[RoomStatus] Error loading all room status labs:', err);
      if (typeof global.renderLabCardsError === 'function') {
        global.renderLabCardsError(labsGrid);
      } else {
        labsGrid.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
              <i data-lucide="alert-circle"></i>
            </div>
            <p>Failed to load laboratories.</p>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: labsGrid });
        }
      }
    }
  }

  function getRelativeTime(dateString) {
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
   * Fetches and loads live occupancy access events on the room status timeline.
   */
  async function loadRoomStatusActivityLog() {
    const timelineList = document.querySelector('.timeline-list');
    if (!timelineList) return;

    // Only show the loading spinner on the very first load
    if (_activityLogFirstLoad) {
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
      const activities = typeof global.fetchNotifications === 'function'
        ? await global.fetchNotifications()
        : (global.notificationService && typeof global.notificationService.fetchNotifications === 'function'
          ? await global.notificationService.fetchNotifications()
          : await (async () => {
            const res = await fetch('/api/notifications', { credentials: 'include' });
            return res.ok ? await res.json() : null;
          })());

      if (!activities || !Array.isArray(activities)) throw new Error('Failed to load activities');

      // Filter only occupancy log notifications
      const occupancyLogs = activities.filter(a => a.type === 'occupancy');

      // Build a data fingerprint so we only re-render when actual log entries change
      const dataKey = occupancyLogs.map(l => `${l.id}-${l.status}-${l.room_number}-${l.description}-${l.session_type || ''}`).join('|');
      const dataChanged = dataKey !== _activityLogLastDataKey;

      if (occupancyLogs.length === 0) {
        if (dataChanged || _activityLogFirstLoad) {
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
        }
        _activityLogLastDataKey = dataKey;
        _activityLogFirstLoad = false;
        return;
      }

      // Only re-render if the data actually changed
      if (dataChanged || _activityLogFirstLoad) {
        // Save scroll position before re-render
        const savedScrollTop = timelineList.scrollTop;

        let html = '';
        occupancyLogs.forEach(log => {
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

          html += `
            <div class="timeline-item" style="display:flex;gap:16px;margin-bottom:20px;position:relative;">
              <div class="timeline-badge" style="width:40px;height:40px;border-radius:50%;background:#E8F9FC;color:#1EBBD7;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:2;">
                <i data-lucide="key-round" style="width:18px;height:18px;"></i>
              </div>
              <div class="timeline-panel" style="flex:1;background:var(--bg-white, #fff);border:1px solid var(--border-light, #e2e8f0);border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.02);">
                <div class="timeline-heading" style="margin-bottom:6px;">
                  <h4 class="timeline-title" style="font-family:var(--font-display);font-size:14.5px;font-weight:700;color:var(--text-dark, #1e293b);margin:0;">${log.description}</h4>
                  <p style="margin:2px 0 0 0;font-size:12px;color:var(--text-light, #64748b);display:flex;align-items:center;gap:4px;">
                    <i data-lucide="clock" style="width:12px;height:12px;"></i>
                    <span>${getRelativeTime(log.time)}</span>
                    <span style="color:var(--border-light, #cbd5e1);">•</span>
                    <span>${log.detail}</span>
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

        // Restore scroll position after re-render
        timelineList.scrollTop = savedScrollTop;
      }

      _activityLogLastDataKey = dataKey;
      _activityLogFirstLoad = false;
    } catch (err) {
      console.error('[RoomStatus] Error loading room status activities:', err);
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

  // Preserve global contracts for legacy scripts and HTML callers
  global.loadAllRoomStatusLabs = loadAllRoomStatusLabs;
  global.loadRoomStatusActivityLog = loadRoomStatusActivityLog;

})(typeof window !== 'undefined' ? window : this);
