/**
 * LabSync – Notifications UI & Live Polling Component | js/components/notifications.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  /**
   * Initializes real-time notifications dropdown, badges, toasts, and background polling.
   */
  function initNotifications() {
    const headerRight = document.querySelector('.header-right');
    const notifBtn = document.querySelector('.notif-btn');
    if (!headerRight || !notifBtn) return;

    let isInitialLoad = true;
    let lastNotifSignature = null;

    // 1. Create notifications dropdown element if it doesn't exist
    let notifMenu = document.getElementById('notif-menu');
    if (!notifMenu) {
      notifMenu = document.createElement('div');
      notifMenu.id = 'notif-menu';
      notifMenu.className = 'notif-menu';
      notifMenu.style.display = 'none';
      notifMenu.innerHTML = `
        <div class="notif-header">
          <span class="notif-header-title">Notifications</span>
          <button id="clear-notif-btn">Mark all as read</button>
        </div>
        <div id="notif-list" class="notif-list">
          <div class="notif-empty-state">
            <i data-lucide="bell-off"></i>
            <p>No notifications yet</p>
          </div>
        </div>
      `;
      headerRight.appendChild(notifMenu);
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: notifMenu });
      }
    }

    // 2. Create notifications toast container if it doesn't exist
    let toastContainer = document.getElementById('notif-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'notif-toast-container';
      toastContainer.className = 'notif-toast-container';
      headerRight.appendChild(toastContainer);
    }

    const notifList = document.getElementById('notif-list');
    const notifDot = document.querySelector('.notif-dot');
    const clearNotifBtn = document.getElementById('clear-notif-btn');

    // Helper to format date relatively
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

    // Helper to map type to styled UI details
    function getNotificationDetails(notif) {
      let iconName = 'bell';
      let iconClass = 'notif-icon-default';
      let title = 'System Update';
      let text = notif.description || '';

      if (notif.type === 'report') {
        if (notif.status === 'Resolved') {
          iconName = 'check-circle';
          iconClass = 'notif-icon-resolved';
          title = 'PC Report Resolved';
          text = `PC #${notif.pc_number} in Room ${notif.room_number} is now functional.`;
        } else {
          iconName = 'alert-triangle';
          iconClass = notif.priority === 'High' ? 'notif-icon-high' : 'notif-icon-warning';
          title = `New PC Report (${notif.priority} Priority)`;
          text = `PC #${notif.pc_number} in Room ${notif.room_number}: ${(notif.description || '').substring(0, 80)}`;
        }
      } else if (notif.type === 'occupancy') {
        iconName = 'key-round';
        iconClass = 'notif-icon-occupancy';
        const hasUser = notif.description && notif.description !== 'Room Key';
        const profText = hasUser
          ? (notif.description.startsWith('Prof.') ? notif.description : `Prof. ${notif.description}`)
          : '';

        if (notif.status === 'Key Taken') {
          if (notif.session_type === 'In Session') {
            title = 'Key Taken (In Session)';
            text = `Key taken by ${profText || 'Faculty'} (In Session) for Room ${notif.room_number}.`;
          } else if (notif.session_type === 'Borrowed' || hasUser) {
            title = 'Key Borrowed';
            text = `Key borrowed by ${profText || 'Faculty'} for Room ${notif.room_number}.`;
          } else {
            title = 'Laboratory Key Taken';
            text = `Key taken for Room ${notif.room_number}.`;
          }
        } else if (notif.status === 'Key Returned') {
          title = 'Laboratory Key Returned';
          text = `Key returned for RM ${notif.room_number}.`;
        } else {
          title = 'QR Identity Verified';
          text = `${notif.description} verified QR code identity (Ready to take key).`;
        }
      }
      return { iconName, iconClass, title, text };
    }

    // Helper to handle navigation clicking
    function handleNotificationClick(notif) {
      if (notif.type === 'report') {
        const isMis = document.querySelector('.profile-role')?.textContent.trim() === 'MIS Staff';
        const isHead = document.querySelector('.profile-role')?.textContent.trim().toLowerCase().includes('head');
        if (isMis) {
          window.location.href = 'mis-maintenance.html';
        } else if (isHead) {
          window.location.href = 'it-head-pc-reports.html';
        } else {
          window.location.href = 'faculty-pc-reports.html';
        }
      } else {
        const isHead = document.querySelector('.profile-role')?.textContent.trim().toLowerCase().includes('head');
        window.location.href = isHead ? 'it-head-room-status.html' : 'room-status.html';
      }
    }

    // Helper to map type to styled UI element
    function createNotificationItem(notif, isUnread) {
      const { iconName, iconClass, title, text } = getNotificationDetails(notif);

      const item = document.createElement('div');
      item.className = `notif-item${isUnread ? ' unread' : ''}`;

      item.innerHTML = `
        <div class="notif-icon-box ${iconClass}">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="notif-content">
          <div class="notif-meta-row">
            <span class="notif-title">${title}</span>
            <span class="notif-time">${getRelativeTime(notif.time)}</span>
          </div>
          <p class="notif-message">${text}</p>
        </div>
        ${isUnread ? '<div class="notif-unread-dot"></div>' : ''}
      `;

      item.addEventListener('click', () => {
        handleNotificationClick(notif);
      });

      return item;
    }

    // Show a small auto-dismissing toast placed relative to the bell button
    function showNotificationToast(notif) {
      const { iconName, iconClass, title, text } = getNotificationDetails(notif);

      // Dynamically position the toast container to center the arrow precisely on the bell button
      const notifBtnRect = notifBtn.getBoundingClientRect();
      const rightOffset = window.innerWidth - (notifBtnRect.left + notifBtnRect.width / 2);
      toastContainer.style.right = `${Math.max(12, rightOffset - 28)}px`;

      const card = document.createElement('div');
      card.className = 'notif-toast-card';

      const relTime = getRelativeTime(notif.time || new Date());
      const roomNum = notif.room_number ? String(notif.room_number).replace(/^RM\s*/i, '') : null;
      const isReport = notif.type === 'report';

      card.innerHTML = `
        <div class="notif-icon-box ${iconClass}">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="notif-toast-content">
          <div class="notif-toast-header-row">
            <span class="notif-toast-title">${title}</span>
            <div class="notif-toast-meta-right">
              <span class="notif-toast-time">${relTime}</span>
              <button class="notif-toast-close-btn" title="Close" aria-label="Close">&times;</button>
            </div>
          </div>
          <p class="notif-toast-message">${text}</p>
          <div class="notif-toast-footer-row">
            <div class="notif-toast-tags">
              ${roomNum ? `<span class="notif-toast-tag room"><i data-lucide="map-pin"></i> RM ${roomNum}</span>` : ''}
              ${isReport && notif.priority ? `<span class="notif-toast-tag priority-${String(notif.priority).toLowerCase()}">${notif.priority} Priority</span>` : ''}
              ${!isReport && notif.session_type ? `<span class="notif-toast-tag session">${notif.session_type}</span>` : (!isReport && notif.status ? `<span class="notif-toast-tag status">${notif.status}</span>` : '')}
            </div>
            <span class="notif-toast-cta">View details <i data-lucide="chevron-right"></i></span>
          </div>
        </div>
      `;

      // Click on card navigates to relevant dashboard page
      card.addEventListener('click', () => {
        handleNotificationClick(notif);
      });

      // Close button dismisses toast card immediately
      const closeBtn = card.querySelector('.notif-toast-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissToast(card);
        });
      }

      // Limit max stacked toasts (1 on mobile <= 600px, 3 on desktop) to prevent viewport blocking
      const maxToasts = window.innerWidth <= 600 ? 1 : 3;
      while (toastContainer.children.length >= maxToasts) {
        toastContainer.firstElementChild.remove();
      }

      toastContainer.appendChild(card);
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: card });
      }

      // Setup auto-dismiss and hover pause behaviors
      let dismissTimeout;
      function startTimeout() {
        dismissTimeout = setTimeout(() => {
          dismissToast(card);
        }, 7000);
      }

      card.addEventListener('mouseenter', () => {
        if (dismissTimeout) clearTimeout(dismissTimeout);
      });

      card.addEventListener('mouseleave', () => {
        dismissTimeout = setTimeout(() => {
          dismissToast(card);
        }, 2000);
      });

      startTimeout();
    }

    function dismissToast(card) {
      if (!card || !card.parentNode) return;
      card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-10px) scale(0.92)';
      setTimeout(() => {
        if (card && card.parentNode) {
          card.remove();
        }
      }, 300);
    }

    async function loadNotifications() {
      try {
        const notifications = typeof global.fetchNotifications === 'function'
          ? await global.fetchNotifications()
          : (global.notificationService && typeof global.notificationService.fetchNotifications === 'function'
            ? await global.notificationService.fetchNotifications()
            : await (async () => {
              const res = await fetch(`/api/notifications?_=${Date.now()}`, { credentials: 'include' });
              return res.ok ? await res.json() : null;
            })());

        if (!notifications || !Array.isArray(notifications)) return;

        const lastRead = localStorage.getItem('last_read_notifications');
        let unreadCount = 0;

        // Load already toasted keys from localStorage
        let toastedKeys = [];
        try {
          toastedKeys = JSON.parse(localStorage.getItem('shown_notification_toasts') || '[]');
          if (!Array.isArray(toastedKeys)) toastedKeys = [];
        } catch (e) {
          toastedKeys = [];
        }
        const newToastedKeys = [...toastedKeys];

        if (notifList) notifList.innerHTML = '';

        if (notifications.length === 0) {
          if (notifList) {
            notifList.innerHTML = `
              <div class="notif-empty-state">
                <i data-lucide="bell-off"></i>
                <p>No notifications yet</p>
              </div>
            `;
          }
          if (notifDot) notifDot.style.display = 'none';
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: notifList });
          }
          return;
        }

        notifications.forEach(notif => {
          // Safeguard: MIS Staff only receives PC hardware report notifications
          if (window.location.pathname.includes('mis-') && notif.type !== 'report') {
            return;
          }

          const isUnread = !lastRead || new Date(notif.time) > new Date(lastRead);
          if (isUnread) unreadCount++;
          const item = createNotificationItem(notif, isUnread);
          if (notifList) notifList.appendChild(item);

          // Check if notification is new/unread and has not been toasted yet
          const key = `${notif.type}-${notif.id}-${notif.status}`;

          if (isUnread && !toastedKeys.includes(key)) {
            if (!isInitialLoad) {
              showNotificationToast(notif);
            }
            newToastedKeys.push(key);
          } else if (!toastedKeys.includes(key)) {
            // Track it so we don't try to show it in the future
            newToastedKeys.push(key);
          }
        });

        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: notifList });
        }

        // Keep only last 50 keys to prevent localStorage bloat
        if (newToastedKeys.length > 50) {
          newToastedKeys.splice(0, newToastedKeys.length - 50);
        }
        try {
          localStorage.setItem('shown_notification_toasts', JSON.stringify(newToastedKeys));
        } catch (e) { }

        if (notifDot) {
          const hasUnread = unreadCount > 0;
          notifDot.style.display = hasUnread ? 'block' : 'none';
          try { sessionStorage.setItem('labsync_has_unread_notifs', String(hasUnread)); } catch (e) { }
        }

        // Build notification state signature including all fields that affect UI display
        const currentSignature = notifications.map(n =>
          `${n.id || ''}:${n.type || ''}:${n.status || ''}:${n.priority || ''}:${n.pc_number || ''}:${n.room_number || ''}:${n.description || ''}:${n.time || ''}`
        ).join('|');

        const notifStateChanged = lastNotifSignature !== null && lastNotifSignature !== currentSignature;
        lastNotifSignature = currentSignature;

        const currentPage = document.body ? document.body.dataset.page : '';

        // Real-time cards and timeline refresh
        if (notifStateChanged) {
          if (currentPage === 'dashboard') {
            if (typeof global.loadDashboardStatsAndLabs === 'function') global.loadDashboardStatsAndLabs();
          } else if (currentPage === 'room-status') {
            if (typeof global.loadAllRoomStatusLabs === 'function') global.loadAllRoomStatusLabs();
            if (typeof global.loadRoomStatusActivityLog === 'function') global.loadRoomStatusActivityLog();
          } else if (currentPage === 'it-head-dashboard') {
            if (typeof global.loadITHeadDashboardData === 'function') global.loadITHeadDashboardData();
          } else if (currentPage === 'it-head-room-status') {
            if (typeof global.loadITHeadRoomStatus === 'function') {
              global.loadITHeadRoomStatus();
            } else if (typeof global.loadAllRoomStatusLabs === 'function') {
              global.loadAllRoomStatusLabs();
            }
          }
        } else {
          // Continuous live refresh for room status cards to detect IoT Offline & Reconnect state changes
          if (currentPage === 'room-status') {
            if (typeof global.loadAllRoomStatusLabs === 'function') global.loadAllRoomStatusLabs();
          } else if (currentPage === 'it-head-room-status') {
            if (typeof global.loadITHeadRoomStatus === 'function') {
              global.loadITHeadRoomStatus();
            } else if (typeof global.loadAllRoomStatusLabs === 'function') {
              global.loadAllRoomStatusLabs();
            }
          } else if (currentPage === 'dashboard') {
            if (typeof global.loadDashboardStatsAndLabs === 'function') global.loadDashboardStatsAndLabs();
          } else if (currentPage === 'it-head-dashboard') {
            if (typeof global.loadITHeadDashboardData === 'function') {
              global.loadITHeadDashboardData();
            }
          }
        }

      } catch (err) {
        console.error('[Notifications] Error loading notifications:', err);
      } finally {
        isInitialLoad = false;
      }
    }

    if (notifBtn.dataset.listenerAttached) return;
    notifBtn.dataset.listenerAttached = 'true';

    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isShowing = notifMenu.style.display === 'block';

      const profileMenu = document.getElementById('profile-menu');
      if (profileMenu) profileMenu.style.display = 'none';

      if (!isShowing) {
        // Align the dropdown under the bell button dynamically
        const notifBtnRect = notifBtn.getBoundingClientRect();
        const rightOffset = window.innerWidth - (notifBtnRect.left + notifBtnRect.width / 2);
        const calculatedRight = rightOffset - 190;
        notifMenu.style.right = `${Math.max(20, calculatedRight)}px`;

        notifMenu.style.display = 'block';
        loadNotifications();
      } else {
        notifMenu.style.display = 'none';
      }
    });

    if (clearNotifBtn) {
      clearNotifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        localStorage.setItem('last_read_notifications', new Date().toISOString());
        try { sessionStorage.setItem('labsync_has_unread_notifs', 'false'); } catch (e) { }
        if (notifDot) notifDot.style.display = 'none';
        loadNotifications();
      });
    }

    document.addEventListener('click', () => {
      if (notifMenu) notifMenu.style.display = 'none';
    });

    // Reposition toast container dynamically on window resize
    window.addEventListener('resize', () => {
      if (notifBtn && toastContainer) {
        const notifBtnRect = notifBtn.getBoundingClientRect();
        const rightOffset = window.innerWidth - (notifBtnRect.left + notifBtnRect.width / 2);
        toastContainer.style.right = `${Math.max(12, rightOffset - 28)}px`;
      }
    });

    loadNotifications();
    setInterval(loadNotifications, 2000); // Snappy 2s background polling
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.initNotifications = initNotifications;

})(typeof window !== 'undefined' ? window : this);
