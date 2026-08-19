/* ================================================================
   LabSync – Professor Dashboard  |  script.js
   ================================================================ */

// =========================================================
// Global UI Toast Notification System for LabSync
// =========================================================
window.showToast = function (message, type = 'success', title = null) {
  if (!message) return;

  let container = document.getElementById('labsync-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'labsync-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: calc(100vw - 32px);
    `;
    const targetParent = document.body || document.documentElement;
    if (targetParent) targetParent.appendChild(container);
  }

  const isError = type === 'error' || (typeof message === 'string' && (message.toLowerCase().includes('failed') || message.toLowerCase().includes('error') || message.toLowerCase().includes('invalid')));
  const isWarning = type === 'warning';
  const isInfo = type === 'info';

  const iconName = isError ? 'alert-triangle' : (isWarning ? 'alert-circle' : (isInfo ? 'info' : 'check-circle-2'));
  const iconColor = isError ? '#EF4444' : (isWarning ? '#F59E0B' : (isInfo ? '#3B82F6' : '#1EBBD7'));
  const iconBg = isError ? 'rgba(239, 68, 68, 0.12)' : (isWarning ? 'rgba(245, 158, 11, 0.12)' : (isInfo ? 'rgba(59, 130, 246, 0.12)' : 'rgba(30, 187, 215, 0.12)'));
  const borderColor = isError ? 'rgba(239, 68, 68, 0.25)' : (isWarning ? 'rgba(245, 158, 11, 0.25)' : (isInfo ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 187, 215, 0.3)'));
  const defaultTitle = isError ? 'Notice' : (isWarning ? 'Warning' : (isInfo ? 'Information' : 'Success'));
  const toastTitle = title || defaultTitle;

  const card = document.createElement('div');
  card.className = 'labsync-toast-card';
  card.style.cssText = `
    pointer-events: auto;
    background: #ffffff;
    border: 1.5px solid ${borderColor};
    border-radius: 14px;
    padding: 14px 16px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(0, 0, 0, 0.05);
    min-width: 280px;
    max-width: 380px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    opacity: 0;
    transform: translateY(-16px) scale(0.96);
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    font-family: var(--font-body, sans-serif);
  `;

  if (document.documentElement.classList.contains('high-contrast')) {
    card.style.background = '#1E293B';
    card.style.color = '#F8FAFC';
  }

  if (!window.escapeHtml) {
    window.escapeHtml = function (str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };
  }

  card.innerHTML = `
    <div style="width: 34px; height: 34px; min-width: 34px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;">
      <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 13.5px; font-weight: 700; color: var(--text-dark, #0F172A); margin-bottom: 2px; font-family: var(--font-display, sans-serif); display: flex; align-items: center; justify-content: space-between;">
        <span>${window.escapeHtml(toastTitle)}</span>
        <button class="labsync-toast-close" style="background: none; border: none; font-size: 16px; color: var(--text-muted, #94A3B8); cursor: pointer; padding: 0 4px; line-height: 1; margin-left: 8px;">&times;</button>
      </div>
      <div style="font-size: 13.5px; color: var(--text-mid, #475569); line-height: 1.4; word-break: break-word;">${window.escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(card);
  if (window.lucide && lucide.createIcons) lucide.createIcons({ root: card });

  requestAnimationFrame(() => {
    card.style.opacity = '1';
    card.style.transform = 'translateY(0) scale(1)';
  });

  function removeToast() {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-12px) scale(0.95)';
    setTimeout(() => card.remove(), 350);
  }

  const closeBtn = card.querySelector('.labsync-toast-close');
  if (closeBtn) closeBtn.addEventListener('click', removeToast);

  setTimeout(removeToast, 3800);
};

// Override browser native alert to use LabSync UI Toast
window.alert = function (msg) {
  if (window.showToast) {
    const isErr = typeof msg === 'string' && (msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error') || msg.toLowerCase().includes('invalid'));
    window.showToast(msg, isErr ? 'error' : 'success');
  } else {
    console.log('[LabSync Alert]:', msg);
  }
};

// ── Apply Accessibility Settings Immediately ──────────────────────
(function applyAccessibilitySettings() {
  const savedScale = localStorage.getItem('labsync-text-scale') || 'normal';
  const savedContrast = localStorage.getItem('labsync-high-contrast') === 'true';

  // Clean existing scale classes
  document.documentElement.classList.remove('text-scale-small', 'text-scale-normal', 'text-scale-large', 'text-scale-xlarge');
  document.documentElement.classList.add(`text-scale-${savedScale}`);

  // Clean and set high contrast class
  if (savedContrast) {
    document.documentElement.classList.add('high-contrast');
  } else {
    document.documentElement.classList.remove('high-contrast');
  }
})();

// ── Initialize Lucide Icons ──────────────────────────────────────
if (typeof lucide !== 'undefined' && lucide.createIcons) {
  lucide.createIcons();
}

// ── Constants ────────────────────────────────────────────────────
const DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday'
];

const MONTHS = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'
];

// ── Helpers ──────────────────────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, '0');
}

function getGreeting(hour) {
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// ── Live Clock & Dynamic Greeting ────────────────────────────────
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;

  // Update clock time
  document.getElementById('clockTime').textContent =
    `${pad(h)}:${pad(m)}:${pad(s)} ${ampm}`;

  // Update date
  const day = DAYS[now.getDay()];
  const date = now.getDate();
  const mon = MONTHS[now.getMonth()];
  const yr = now.getFullYear();
  document.getElementById('clockDate').textContent =
    `${day}, ${mon} ${date}, ${yr}`;

  // Update greeting based on current hour ONLY if dashboard is active
  if (document.body.dataset.page === 'dashboard') {
    const greet = getGreeting(now.getHours());

    // Get the name from the profile section dynamically
    const profileNameEl = document.querySelector('.profile-name');
    let firstName = 'User';

    if (profileNameEl) {
      const fullName = profileNameEl.textContent.trim();
      if (fullName === 'MIS Staff' || fullName.startsWith('MIS ')) {
        firstName = 'MIS Staff';
      } else {
        firstName = fullName.split(/\s+/)[0] || 'User';
      }
    }

    const greetingTextEl = document.getElementById('greetingText');
    if (greetingTextEl) {
      greetingTextEl.textContent = `${greet}, ${firstName}!`;
    }

    const greetingSubEl = document.getElementById('greetingSub');
    if (greetingSubEl) {
      greetingSubEl.textContent = 'Here\'s an overview of your IT laboratories today.';
    }
  }
}

// Run immediately, then tick every second
updateClock();
setInterval(updateClock, 1000);

// ── Logout Handler ───────────────────────────────────────────────
async function handleLogout() {
  try {
    await fetch('/api/logout', {
      method: 'POST',
      credentials: 'include'
    });
    window.location.href = '/login.html';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login.html';
  }
}

// ── Load Current User ────────────────────────────────────────────
async function loadCurrentUser() {
  try {
    const response = await fetch('/api/user/current', {
      credentials: 'include'
    });
    const user = await response.json();

    if (response.ok) {
      // Update profile name and role
      const profileNameEl = document.querySelector('.profile-name');
      const profileRoleEl = document.querySelector('.profile-role');
      const avatarEl = document.querySelector('.avatar');

      if (profileNameEl) {
        profileNameEl.textContent = user.name || 'User';
      }

      if (profileRoleEl) {
        profileRoleEl.textContent = user.role || 'User';
      }

      // Update avatar initials or photo
      if (avatarEl) {
        if (user.profilePhoto) {
          avatarEl.innerHTML = `<img src="${user.profilePhoto}" alt="Profile Photo">`;
        } else {
          const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
          avatarEl.textContent = initials;
        }
      }

      // Update greeting if on dashboard page
      if (document.body.dataset.page === 'dashboard') {
        updateClock(); // This will update the greeting with the correct name
      }
    }
  } catch (error) {
    console.error('Error loading user:', error);
  }
}

// Load user info on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadCurrentUser);
} else {
  loadCurrentUser();
}

// ── Profile Dropdown Handler ─────────────────────────────────────────────────
function initProfileDropdown() {
  // Create dropdown menu if it doesn't exist
  const headerRight = document.querySelector('.header-right');
  if (!headerRight) return;

  let profileMenu = document.getElementById('profile-menu');
  if (!profileMenu) {
    profileMenu = document.createElement('div');
    profileMenu.id = 'profile-menu';
    profileMenu.className = 'profile-menu';
    profileMenu.innerHTML = `
      <button onclick="openAccountSettings()" class="profile-menu-item">
        <i data-lucide="user-cog" style="width:16px;height:16px;"></i>
        Account Settings
      </button>
      <button onclick="openAccessibilitySettings()" class="profile-menu-item">
        <i data-lucide="eye" style="width:16px;height:16px;"></i>
        Accessibility Settings
      </button>
      <button onclick="openHelpModal()" class="profile-menu-item profile-help-btn">
        <i data-lucide="circle-help" style="width:16px;height:16px;"></i>
        Help Center
      </button>
      <div class="profile-menu-divider"></div>
      <button onclick="handleLogout()" class="profile-menu-item logout">
        <i data-lucide="log-out" style="width:16px;height:16px;"></i>
        Logout
      </button>
    `;
    headerRight.appendChild(profileMenu);
    lucide.createIcons();
  }

  // Add click handlers
  const profileDropdown = document.querySelector('.profile-dropdown');
  const chevronBtn = document.querySelector('.chevron-btn');

  if (profileDropdown) {
    profileDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      profileMenu.style.display = profileMenu.style.display === 'block' ? 'none' : 'block';
      lucide.createIcons();
    });
  }

  if (chevronBtn) {
    chevronBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileMenu.style.display = profileMenu.style.display === 'block' ? 'none' : 'block';
      lucide.createIcons();
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    profileMenu.style.display = 'none';
  });
}

// ── Notifications Handler ──────────────────────────────────────────────────
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
    lucide.createIcons();
  }

  // Create notifications toast container if it doesn't exist
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
        text = `PC #${notif.pc_number} in Room ${notif.room_number}: ${notif.description.substring(0, 80)}`;
      }
    } else if (notif.type === 'occupancy') {
      iconName = 'key-round';
      iconClass = 'notif-icon-occupancy';
      if (notif.status === 'Key Taken') {
        title = 'Laboratory Key Taken';
        if (notif.description && notif.description !== 'Room Key') {
          text = `Room Key for Room ${notif.room_number} was taken by ${notif.description} (Registered to System).`;
        } else {
          text = `Room Key for Room ${notif.room_number} was taken from the holder.`;
        }
      } else if (notif.status === 'Key Returned') {
        title = 'Laboratory Key Returned';
        text = `Room Key for Room ${notif.room_number} was returned (Room Secured).`;
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

    // Dynamically position the toast container to center the arrow on the bell button
    const notifBtnRect = notifBtn.getBoundingClientRect();
    const rightOffset = window.innerWidth - (notifBtnRect.left + notifBtnRect.width / 2);
    toastContainer.style.right = `${rightOffset - 21}px`;

    const card = document.createElement('div');
    card.className = 'notif-toast-card';

    card.innerHTML = `
      <div class="notif-icon-box ${iconClass}">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="notif-toast-content">
        <div class="notif-toast-header-row">
          <span class="notif-toast-title">${title}</span>
          <button class="notif-toast-close-btn" title="Close">&times;</button>
        </div>
        <p class="notif-toast-message">${text}</p>
      </div>
    `;

    // Click on card navigates to relevant dashboard page
    card.addEventListener('click', () => {
      handleNotificationClick(notif);
    });

    // Close button dismisses toast card immediately
    const closeBtn = card.querySelector('.notif-toast-close-btn');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast(card);
    });

    toastContainer.appendChild(card);
    lucide.createIcons();

    // Setup auto-dismiss and hover pause behaviors
    let dismissTimeout;
    function startTimeout() {
      dismissTimeout = setTimeout(() => {
        dismissToast(card);
      }, 6000);
    }

    card.addEventListener('mouseenter', () => {
      if (dismissTimeout) clearTimeout(dismissTimeout);
    });

    card.addEventListener('mouseleave', () => {
      dismissTimeout = setTimeout(() => {
        dismissToast(card);
      }, 3000); // 3 more seconds of life when mouse leaves
    });

    startTimeout();
  }

  function dismissToast(card) {
    card.classList.add('fade-out');
    card.addEventListener('transitionend', () => {
      card.remove();
    });
  }

  async function loadNotifications() {
    try {
      // Use cache-busting timestamp to prevent browser cache
      const response = await fetch(`/api/notifications?_=${Date.now()}`, { credentials: 'include' });
      if (!response.ok) return;
      const notifications = await response.json();

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

      notifList.innerHTML = '';

      if (notifications.length === 0) {
        notifList.innerHTML = `
          <div class="notif-empty-state">
            <i data-lucide="bell-off"></i>
            <p>No notifications yet</p>
          </div>
        `;
        if (notifDot) notifDot.style.display = 'none';
        lucide.createIcons();
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
        notifList.appendChild(item);

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

      // Keep only last 50 keys to prevent localStorage bloat
      if (newToastedKeys.length > 50) {
        newToastedKeys.splice(0, newToastedKeys.length - 50);
      }
      localStorage.setItem('shown_notification_toasts', JSON.stringify(newToastedKeys));

      if (notifDot) {
        notifDot.style.display = unreadCount > 0 ? 'block' : 'none';
      }

      // Build notification state signature including all fields that affect UI display
      const currentSignature = notifications.map(n => 
        `${n.id || ''}:${n.type || ''}:${n.status || ''}:${n.priority || ''}:${n.pc_number || ''}:${n.room_number || ''}:${n.description || ''}:${n.time || ''}`
      ).join('|');

      const notifStateChanged = lastNotifSignature !== null && lastNotifSignature !== currentSignature;
      lastNotifSignature = currentSignature;

      isInitialLoad = false;
      lucide.createIcons();

      // Real-time cards and timeline refresh (only when notification state actually changes after initial load)
      if (notifStateChanged) {
        if (document.body.dataset.page === 'dashboard' || document.body.dataset.page === 'room-status') {
          loadDashboardStatsAndLabs();
        } else if (document.body.dataset.page === 'mis-dashboard') {
          initMISDashboard();
        }
        if (document.body.dataset.page === 'room-status') {
          loadRoomStatusActivityLog();
        }
      }

    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  }

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

  clearNotifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    localStorage.setItem('last_read_notifications', new Date().toISOString());
    if (notifDot) notifDot.style.display = 'none';
    loadNotifications();
  });

  document.addEventListener('click', () => {
    notifMenu.style.display = 'none';
  });

  // Reposition toast container dynamically on window resize
  window.addEventListener('resize', () => {
    const notifBtnRect = notifBtn.getBoundingClientRect();
    const rightOffset = window.innerWidth - (notifBtnRect.left + notifBtnRect.width / 2);
    toastContainer.style.right = `${rightOffset - 21}px`;
  });

  loadNotifications();
  setInterval(loadNotifications, 3000); // Poll every 3 seconds for near-instantaneous live updates
}

// Bind click events to Help buttons dynamically
function initHelpButtons() {
  const helpButtons = document.querySelectorAll('.sidebar-btn[title="Help"]');
  helpButtons.forEach(btn => {
    btn.removeAttribute('onclick');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openHelpModal();
    });
  });
}

// Initialize profile dropdown, notifications and help buttons on page load
function initCommon() {
  initProfileDropdown();
  initNotifications();
  initHelpButtons();
  if (document.body.dataset.page === 'dashboard') {
    initDashboard();
  } else if (document.body.dataset.page === 'mis-dashboard') {
    initMISDashboard();
  } else if (document.body.dataset.page === 'room-status') {
    loadDashboardStatsAndLabs();
    loadRoomStatusActivityLog();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCommon);
} else {
  initCommon();
}

// Helper function to show email change confirmation modal
function showEmailChangeConfirmation(oldEmail, newEmail, onConfirm) {
  const overlay = document.createElement('div');
  overlay.id = 'email-confirm-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.4);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:2100;';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;width:100%;max-width:440px;padding:32px;box-shadow:0 20px 50px rgba(0,0,0,0.1);text-align:center;display:flex;flex-direction:column;align-items:center;gap:20px;font-family:var(--font-body);">
      <!-- Icon Container -->
      <div style="width:64px;height:64px;background:rgba(245,158,11,0.1);color:#F59E0B;border-radius:50%;display:flex;align-items:center;justify-content:center;">
        <i data-lucide="shield-alert" style="width:32px;height:32px;"></i>
      </div>
      
      <!-- Text -->
      <div>
        <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 10px 0;">Verify New Email Address</h3>
        <p style="font-size:13.5px;color:var(--text-mid);line-height:1.5;margin:0 0 16px 0;">
          Changing your email address to <strong style="color:var(--text-dark);">${newEmail}</strong> requires verification.
        </p>
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:12px;text-align:left;font-size:12px;color:var(--text-mid);line-height:1.5;display:flex;gap:10px;">
          <i data-lucide="info" style="width:16px;height:16px;color:#0EA5E9;flex-shrink:0;margin-top:2px;"></i>
          <span>A verification link will be sent to the new address. Your login email will remain <strong style="color:var(--text-dark);">${oldEmail}</strong> until verified.</span>
        </div>
      </div>
      
      <!-- Buttons -->
      <div style="display:flex;gap:12px;width:100%;margin-top:8px;">
        <button id="cancel-email-confirm" type="button" style="flex:1;padding:12px;border:1px solid var(--border-light);background:#fff;color:var(--text-mid);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Cancel</button>
        <button id="proceed-email-confirm" type="button" style="flex:1;padding:12px;border:none;background:var(--primary-teal);color:#fff;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);font-family:var(--font-body);">Confirm & Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  if (window.lucide) window.lucide.createIcons();

  // Handlers
  document.getElementById('cancel-email-confirm').addEventListener('click', () => {
    overlay.remove();
  });

  document.getElementById('proceed-email-confirm').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}

// ── Account Settings Modal ───────────────────────────────────────────────
function openAccountSettings() {
  const profileMenu = document.getElementById('profile-menu');
  if (profileMenu) profileMenu.style.display = 'none';

  const modal = document.createElement('div');
  modal.id = 'account-settings-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;';

  modal.innerHTML = `
    <div class="settings-modal-content-box" style="background:#fff;border-radius:20px;width:100%;max-width:900px;height:85vh;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;">
      <!-- Header -->
      <div style="padding:28px 32px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%);flex-shrink:0;">
        <div>
          <h2 style="font-family:var(--font-display);font-size:24px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Account Settings</h2>
          <p style="font-size:13px;color:var(--text-mid);margin:0;">Manage your profile information and security settings</p>
        </div>
        <button id="close-settings-modal" style="background:#F5F5F5;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all 0.2s;">
          <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
        </button>
      </div>
      
      <!-- Body Split View -->
      <div class="settings-modal-body" style="flex:1; display:flex; min-height:0; position:relative; overflow:hidden;">
        <!-- Left Sidebar Navigation -->
        <div class="settings-modal-sidebar" style="width:240px; border-right:1px solid var(--border-light); background:#F8FAFC; padding:24px 16px; display:flex; flex-direction:column; gap:8px; flex-shrink:0; overflow-y:auto;">
          <button type="button" class="settings-tab-btn active" onclick="switchSettingsTab('profile', this)">
            <i data-lucide="user" style="width:18px;height:18px;"></i>
            Profile Details
          </button>
          <button type="button" class="settings-tab-btn" onclick="switchSettingsTab('security', this)">
            <i data-lucide="lock" style="width:18px;height:18px;"></i>
            Security & Login
          </button>
          <button type="button" class="settings-tab-btn" onclick="switchSettingsTab('qrcode', this)">
            <i data-lucide="qr-code" style="width:18px;height:18px;"></i>
            My QR Code
          </button>
        </div>

        <!-- Right Content Area (Form wrapper) -->
        <form id="account-settings-form" class="settings-modal-form" style="flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg-card); margin:0;">
          <div class="settings-modal-scroll" style="flex:1; overflow-y:auto; padding:32px 40px;">
            
            <!-- PANEL 1: PROFILE DETAILS -->
            <div id="panel-profile" class="settings-tab-panel" style="display:block;">
              <div style="margin-bottom:28px;">
                <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Profile Details</h3>
                <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Update your personal details and profile photo</p>
              </div>

              <!-- Shared MIS Staff Account Notice Banner -->
              <div id="mis-shared-account-banner" class="banner-mis-notice info" style="display:none; border-radius:12px; padding:14px 16px; margin-bottom:24px; align-items:flex-start; gap:12px;">
                <i data-lucide="shield-alert" class="banner-icon" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;"></i>
                <div>
                  <div class="banner-title" style="font-weight:700;font-size:13.5px;margin-bottom:2px;">Shared Department Account</div>
                  <p class="banner-text" style="font-size:13px;margin:0;line-height:1.4;">This account is shared by all MIS Personnel. Profile information (Full Name, Email Address, Mobile Number) is restricted to maintain department access.</p>
                </div>
              </div>

              <!-- Side-by-side: Photo Upload (Left) and Fields (Right) -->
              <div style="display:flex; gap:36px; align-items:flex-start; flex-wrap:wrap;">
                <!-- Profile Photo Box -->
                <div style="width:190px; display:flex; flex-direction:column; align-items:center; gap:16px; padding:24px 16px; border:2px dashed var(--border-light); border-radius:16px; background:var(--bg-card); flex-shrink:0;">
                  <div id="profile-photo-preview" style="width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg, #1EBBD7 0%, #0EA5E9 100%);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;color:#fff;font-family:var(--font-display);box-shadow:0 8px 20px rgba(30,187,215,0.25);position:relative;overflow:hidden;flex-shrink:0;">
                    <span id="avatar-initials">U</span>
                    <img id="profile-photo-img" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;display:none;">
                  </div>
                  <input type="file" id="profile-photo-input" accept="image/*" style="display:none;">
                  <button type="button" onclick="document.getElementById('profile-photo-input').click()" style="padding:10px 16px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 10px rgba(30,187,215,0.2);font-family:var(--font-body);display:flex;align-items:center;gap:6px;">
                    <i data-lucide="upload" style="width:14px;height:14px;"></i>
                    Upload Photo
                  </button>
                  <button type="button" id="remove-photo-btn" style="padding:6px 12px;border:1px solid var(--border-light);background:var(--bg-card);color:var(--text-mid);border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);display:none;">Remove Photo</button>
                  <p style="font-size:11.5px;color:var(--text-muted);text-align:center;margin:0;line-height:1.4;">JPG, PNG or GIF<br>Max size: 2MB</p>
                </div>

                <!-- Input Fields Column -->
                <div style="flex:1; min-width:260px; display:flex; flex-direction:column; gap:20px;">
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Full Name *</label>
                    <input type="text" id="settings-name" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Your full name">
                  </div>
                  <div style="display:grid; grid-template-columns:1fr; gap:20px;">
                    <div>
                      <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Email Address</label>
                      <input type="email" id="settings-email" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;" placeholder="your.email@bsu.edu.ph">
                      <div id="settings-email-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Invalid email address (e.g., user@domain.com)</div>
                    </div>
                    <div>
                      <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Mobile Number *</label>
                      <input type="tel" id="settings-phone" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="09XXXXXXXXX" pattern="09[0-9]{9}" title="Please enter a valid 11-digit mobile number starting with 09.">
                    </div>
                  </div>
                  <div class="alert-info-box" style="margin-top:4px;">
                    <i data-lucide="info"></i>
                    <p>Changing your email address will require verification. A verification link will be sent to the new address.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- PANEL 2: SECURITY & LOGIN -->
            <div id="panel-security" class="settings-tab-panel" style="display:none;">
              <div style="margin-bottom:28px;">
                <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">Security & Login</h3>
                <p style="font-size:13.5px;color:var(--text-mid);margin:0;">Update your account password to remain secure</p>
              </div>

              <!-- Shared Password Notice for MIS -->
              <div id="mis-password-notice" class="banner-mis-notice warning" style="display:none; border-radius:12px; padding:14px 16px; margin-bottom:24px; align-items:flex-start; gap:12px;">
                <i data-lucide="alert-triangle" class="banner-icon" style="width:20px;height:20px;flex-shrink:0;margin-top:2px;"></i>
                <div>
                  <div class="banner-title" style="font-weight:700;font-size:13.5px;margin-bottom:2px;">Shared Account Password Warning</div>
                  <p class="banner-text" style="font-size:13px;margin:0;line-height:1.4;">Attention: Changing this password will update the login password for ALL MIS personnel using this shared department account.</p>
                </div>
              </div>

              <div style="display:flex; flex-direction:column; gap:20px;">
                <div>
                  <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Current Password</label>
                  <div style="position:relative;">
                    <input type="password" id="settings-current-password" style="width:100%;padding:12px 48px 12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Enter current password">
                    <button type="button" onclick="togglePasswordVisibility('settings-current-password', this)" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:#CBD5E1;transition:color 0.2s;outline:none;" onmouseenter="this.style.color='var(--primary-teal)'" onmouseleave="this.style.color='#CBD5E1'">
                      <i data-lucide="eye" style="width:18px;height:18px;"></i>
                    </button>
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">New Password</label>
                    <div style="position:relative;">
                      <input type="password" id="settings-new-password" style="width:100%;padding:12px 48px 12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Minimum 8 characters">
                      <button type="button" onclick="togglePasswordVisibility('settings-new-password', this)" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:#CBD5E1;transition:color 0.2s;outline:none;" onmouseenter="this.style.color='var(--primary-teal)'" onmouseleave="this.style.color='#CBD5E1'">
                        <i data-lucide="eye" style="width:18px;height:18px;"></i>
                      </button>
                    </div>
                  </div>
                  <div>
                    <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Confirm New Password</label>
                    <div style="position:relative;">
                      <input type="password" id="settings-confirm-password" style="width:100%;padding:12px 48px 12px 16px;border:1px solid var(--border-light);border-radius:10px;font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.2s;" placeholder="Re-enter new password">
                      <button type="button" onclick="togglePasswordVisibility('settings-confirm-password', this)" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;color:#CBD5E1;transition:color 0.2s;outline:none;" onmouseenter="this.style.color='var(--primary-teal)'" onmouseleave="this.style.color='#CBD5E1'">
                        <i data-lucide="eye" style="width:18px;height:18px;"></i>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Security Tip Box -->
                <div class="alert-warning-box" style="margin-top:8px;">
                  <i data-lucide="shield-check"></i>
                  <div>
                    <p class="alert-title">Security Tip</p>
                    <p class="alert-desc">Use a strong password with at least 8 characters, including numbers and symbols.</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- PANEL 3: MY QR CODE -->
            <div id="panel-qrcode" class="settings-tab-panel" style="display:none;">
              <div style="margin-bottom:28px;">
                <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;">My QR Code</h3>
                <p style="font-size:12.5px;color:var(--text-mid);margin:0;">Your unique access key for attendance and lab operations</p>
              </div>

              <div style="display:flex; gap:32px; align-items:center; background:#FAFAFA; border:1px solid var(--border-light); border-radius:16px; padding:32px; flex-wrap:wrap; justify-content:center;">
                <div id="qr-code-container" style="width:170px;height:170px;border:1px solid var(--border-light);border-radius:12px;display:flex;align-items:center;justify-content:center;background:#fff;padding:12px;box-shadow:var(--shadow-sm);flex-shrink:0;">
                  <div style="color:var(--text-muted);font-size:12px;text-align:center;">Loading...</div>
                </div>
                <div style="flex:1; min-width:240px; display:flex; flex-direction:column; gap:16px;">
                  <p style="font-size:13.5px;color:var(--text-mid);margin:0;line-height:1.6;">
                    This QR code contains your unique identifier. Keep it secure and use it to log in, register attendance, or scan into active lab sessions.
                  </p>
                  <button type="button" id="download-qr-btn" style="padding:10px 20px;border:1px solid var(--primary-teal);background:#fff;color:var(--primary-teal);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);display:flex;align-items:center;gap:8px;width:fit-content;" onmouseenter="this.style.background='var(--primary-teal-light)'" onmouseleave="this.style.background='#fff'">
                    <i data-lucide="download" style="width:16px;height:16px;"></i>
                    Download QR Code
                  </button>
                </div>
              </div>
            </div>

          </div>
        </form>
      </div>

      <!-- Footer (Fixed bottom) -->
      <div class="settings-modal-footer" style="padding:20px 32px;border-top:1px solid var(--border-light);background:#FAFAFA;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
        <p id="settings-last-updated" style="font-size:12px;color:var(--text-muted);margin:0;">Last updated: Loading...</p>
        <div style="display:flex;gap:12px;">
          <button type="button" id="cancel-settings-btn" style="padding:12px 24px;border:1px solid var(--border-light);background:#fff;border-radius:10px;font-size:14px;font-weight:600;color:var(--text-mid);cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Cancel</button>
          <button type="submit" form="account-settings-form" style="padding:12px 32px;border:none;background:var(--primary-teal);color:#fff;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);font-family:var(--font-body);display:flex;align-items:center;gap:8px;">
            <i data-lucide="save" style="width:16px;height:16px;"></i>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();

  // Load user data and QR code
  loadAccountSettingsData();

  // Tab switching helper
  window.switchSettingsTab = function (tabName, btnEl) {
    document.querySelectorAll('.settings-tab-panel').forEach(p => p.style.display = 'none');
    const targetPanel = document.getElementById(`panel-${tabName}`);
    if (targetPanel) {
      targetPanel.style.display = 'block';
    }
    document.querySelectorAll('.settings-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (btnEl) {
      btnEl.classList.add('active');
    }
  };

  // Add validation redirect UX helper
  document.querySelectorAll('#account-settings-form input').forEach(input => {
    input.addEventListener('invalid', () => {
      const panel = input.closest('.settings-tab-panel');
      if (panel) {
        const tabName = panel.id.replace('panel-', '');
        const btn = document.querySelector(`.settings-tab-btn[onclick*="${tabName}"]`);
        window.switchSettingsTab(tabName, btn);
      }
    });
  });

  // Photo upload handler
  const photoInput = document.getElementById('profile-photo-input');
  const photoImg = document.getElementById('profile-photo-img');
  const avatarInitials = document.getElementById('avatar-initials');
  const removePhotoBtn = document.getElementById('remove-photo-btn');

  photoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        photoImg.src = e.target.result;
        photoImg.style.display = 'block';
        avatarInitials.style.display = 'none';
        removePhotoBtn.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }
  });

  removePhotoBtn.addEventListener('click', () => {
    photoInput.value = '';
    photoImg.style.display = 'none';
    photoImg.src = '';
    avatarInitials.style.display = 'block';
    removePhotoBtn.style.display = 'none';
  });

  // Close handlers
  document.getElementById('close-settings-modal').addEventListener('click', () => modal.remove());
  document.getElementById('cancel-settings-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // Input focus effects
  document.querySelectorAll('input[type="text"], input[type="password"], input[type="email"], input[type="tel"]').forEach(input => {
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--primary-teal)';
      input.style.boxShadow = '0 0 0 3px rgba(30, 187, 215, 0.1)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--border-light)';
      input.style.boxShadow = 'none';
    });
  });

  // Live email validation
  const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const cleanEmail = email.trim().toLowerCase();
    const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
    if (!basicRegex.test(cleanEmail)) return false;
    if (cleanEmail.includes('..') || cleanEmail.includes('@.') || cleanEmail.includes('.@')) return false;

    const parts = cleanEmail.split('@');
    if (parts.length !== 2) return false;
    const domainParts = parts[1].split('.');
    if (domainParts.length < 2) return false;

    const fullTld = domainParts.slice(1).join('.');
    const mainTld = domainParts[domainParts.length - 1];

    const validTLDs = new Set([
      'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'store', 'tech', 'app', 'dev',
      'ph', 'edu.ph', 'com.ph', 'gov.ph', 'org.ph', 'net.ph',
      'us', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'de', 'fr', 'br', 'ru', 'sg', 'my'
    ]);

    return validTLDs.has(fullTld) || validTLDs.has(mainTld);
  };
  const settingsEmailInput = document.getElementById('settings-email');
  const emailErrDiv = document.getElementById('settings-email-error');
  if (settingsEmailInput && emailErrDiv) {
    settingsEmailInput.addEventListener('input', () => {
      const val = settingsEmailInput.value.trim();
      if (val && !isValidEmail(val)) {
        settingsEmailInput.style.borderColor = '#EF4444';
        emailErrDiv.style.display = 'block';
      } else {
        settingsEmailInput.style.borderColor = 'var(--border-light)';
        emailErrDiv.style.display = 'none';
      }
    });
  }

  // Form submit
  document.getElementById('account-settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('settings-name').value.trim();
    const currentPassword = document.getElementById('settings-current-password').value;
    const newPassword = document.getElementById('settings-new-password').value;
    const confirmPassword = document.getElementById('settings-confirm-password').value;

    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword) {
        alert('Please enter your current password');
        return;
      }
      if (!newPassword) {
        alert('Please enter a new password');
        return;
      }
      if (newPassword.length < 8) {
        alert('New password must be at least 8 characters');
        return;
      }
      if (newPassword !== confirmPassword) {
        alert('New passwords do not match');
        return;
      }
    }

    const profilePhoto = (photoImg && photoImg.style.display === 'block') ? photoImg.src : null;
    const initialEmail = document.getElementById('settings-email').dataset.initialEmail || '';
    const newEmail = document.getElementById('settings-email').value.trim();

    if (!isValidEmail(newEmail)) {
      alert('Security Warning: Invalid email address format!\n\nPlease enter a valid email address (e.g., name@example.com). Random letters or malformed email strings are not allowed.');
      if (settingsEmailInput) {
        settingsEmailInput.focus();
        settingsEmailInput.style.borderColor = '#EF4444';
        if (emailErrDiv) emailErrDiv.style.display = 'block';
      }
      return;
    }

    const isEmailChanging = newEmail.toLowerCase() !== initialEmail.toLowerCase();

    const executeUpdate = async () => {
      try {
        const response = await fetch('/api/user/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: name,
            email: newEmail,
            currentPassword: currentPassword || null,
            newPassword: newPassword || null,
            profilePhoto: profilePhoto,
            phone: document.getElementById('settings-phone').value.trim()
          })
        });

        let result = {};
        try {
          result = await response.json();
        } catch (e) {
          result = { error: 'Server error (HTTP ' + response.status + '). Please try again.' };
        }

        if (response.ok) {
          try {
            localStorage.setItem('labsync_last_updated', new Date().toISOString());
          } catch (e) { }

          if (window.showToast) {
            window.showToast(result.message || 'Account updated successfully!');
          } else {
            alert(result.message || 'Account updated successfully!');
          }

          modal.remove();

          // Dynamically update UI elements across the page without jarring reload
          const profileNameEls = document.querySelectorAll('.user-name, .profile-name, #user-name-display, .user-profile-name');
          profileNameEls.forEach(el => {
            if (el && name) el.textContent = name;
          });

          if (profilePhoto) {
            const avatarImgs = document.querySelectorAll('.user-avatar img, .profile-avatar img, #user-avatar-img');
            avatarImgs.forEach(img => {
              if (img) {
                img.src = profilePhoto;
                img.style.display = 'block';
              }
            });
          }
        } else {
          alert('Error: ' + (result.error || 'Failed to update account'));
        }
      } catch (error) {
        console.error('Error updating account:', error);
        alert('Failed to update account. Please check your connection or try again.');
      }
    };

    if (isEmailChanging) {
      showEmailChangeConfirmation(initialEmail, newEmail, executeUpdate);
    } else {
      executeUpdate();
    }
  });
}

function formatLastUpdatedTime(timestampStr) {
  if (!timestampStr) return 'Never';
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return 'Never';

  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadAccountSettingsData() {
  try {
    const response = await fetch('/api/user/current', { credentials: 'include' });
    const user = await response.json();
    if (response.ok) {
      const nameInput = document.getElementById('settings-name');
      const emailInput = document.getElementById('settings-email');
      const phoneInput = document.getElementById('settings-phone');

      nameInput.value = user.name || '';
      emailInput.value = user.email || '';
      emailInput.dataset.initialEmail = user.email || '';
      phoneInput.value = user.phone || '';

      const isMisStaff = user.role === 'MIS Staff';
      if (isMisStaff) {
        if (nameInput) {
          nameInput.readOnly = true;
          nameInput.style.background = '#F8FAFC';
          nameInput.style.cursor = 'not-allowed';
          nameInput.title = 'Full Name is restricted for the shared MIS Staff account.';
        }
        if (emailInput) {
          emailInput.readOnly = true;
          emailInput.style.background = '#F8FAFC';
          emailInput.style.cursor = 'not-allowed';
          emailInput.title = 'Email Address is restricted for the shared MIS Staff account.';
        }
        if (phoneInput) {
          phoneInput.readOnly = true;
          phoneInput.style.background = '#F8FAFC';
          phoneInput.style.cursor = 'not-allowed';
          phoneInput.title = 'Mobile Number is restricted for the shared MIS Staff account.';
        }

        const photoUploadBtn = document.querySelector('button[onclick*="profile-photo-input"]');
        if (photoUploadBtn) photoUploadBtn.style.display = 'none';

        const misBanner = document.getElementById('mis-shared-account-banner');
        if (misBanner) misBanner.style.display = 'flex';

        const misPasswordNotice = document.getElementById('mis-password-notice');
        if (misPasswordNotice) misPasswordNotice.style.display = 'flex';
      }

      const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
      document.getElementById('avatar-initials').textContent = initials;

      const lastUpdatedEl = document.getElementById('settings-last-updated');
      if (lastUpdatedEl) {
        const lastUpdated = user.updatedAt || user.updated_at || user.last_updated || localStorage.getItem('labsync_last_updated');
        lastUpdatedEl.textContent = `Last updated: ${formatLastUpdatedTime(lastUpdated)}`;
      }

      if (user.profilePhoto) {
        const photoImg = document.getElementById('profile-photo-img');
        const avatarInitials = document.getElementById('avatar-initials');
        const removePhotoBtn = document.getElementById('remove-photo-btn');
        if (photoImg && avatarInitials && removePhotoBtn) {
          photoImg.src = user.profilePhoto;
          photoImg.style.display = 'block';
          avatarInitials.style.display = 'none';
          if (!isMisStaff) removePhotoBtn.style.display = 'block';
        }
      }
    }

    const qrResponse = await fetch('/api/user/qrcode', { credentials: 'include' });
    const qrData = await qrResponse.json();
    if (qrResponse.ok) {
      document.getElementById('qr-code-container').innerHTML = `<img src="${qrData.qrCode}" style="width:100%;height:100%;object-fit:contain;">`;
      document.getElementById('download-qr-btn').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `LabSync-QR-${qrData.user.name.replace(/\s+/g, '-')}.png`;
        link.href = qrData.qrCode;
        link.click();
      });
      lucide.createIcons();
    }
  } catch (error) {
    console.error('Error loading account settings data:', error);
  }
}

// ── Accessibility Settings Modal ──────────────────────────────────────────
function openAccessibilitySettings() {
  const profileMenu = document.getElementById('profile-menu');
  if (profileMenu) profileMenu.style.display = 'none';

  const modal = document.createElement('div');
  modal.id = 'accessibility-settings-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;';

  // Retrieve saved settings
  const currentScale = localStorage.getItem('labsync-text-scale') || 'normal';
  const isContrast = localStorage.getItem('labsync-high-contrast') === 'true';

  modal.innerHTML = `
    <div class="accessibility-modal-card" style="background:#fff;border-radius:20px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;animation: modalScale 0.25s ease-out;">
      <!-- Header -->
      <div class="accessibility-modal-header" style="padding:24px 32px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%);">
        <div>
          <h2 style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;display:flex;align-items:center;gap:10px;">
            <i data-lucide="eye" style="width:22px;height:22px;color:var(--primary-teal);"></i>
            Accessibility Settings
          </h2>
          <p style="font-size:13px;color:var(--text-mid);margin:0;">Adjust text size and color contrast for better readability</p>
        </div>
        <button id="close-accessibility-modal" style="background:#F5F5F5;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all 0.2s;">
          <i data-lucide="x" style="width:18px;height:18px;color:var(--text-mid);"></i>
        </button>
      </div>
      
      <!-- Content -->
      <div class="accessibility-modal-body" style="padding:32px;display:flex;flex-direction:column;gap:28px;">
        
        <!-- Text Size Option -->
        <div>
          <label style="display:block;font-size:14px;font-weight:700;color:var(--text-dark);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
            <i data-lucide="type" style="width:16px;height:16px;color:var(--primary-teal);"></i>
            Adjust Text Size
          </label>
          <div class="accessibility-scale-grid" style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;background:#F8FAFC;padding:6px;border-radius:12px;border:1px solid var(--border-light);">
            <button id="btn-scale-small" onclick="setAccessibilityScale('small')" class="accessibility-scale-btn scale-small" style="border:none;padding:10px;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;transition:all 0.2s;background:none;color:var(--text-mid);font-family:var(--font-body);">Small (90%)</button>
            <button id="btn-scale-normal" onclick="setAccessibilityScale('normal')" class="accessibility-scale-btn scale-normal" style="border:none;padding:10px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;transition:all 0.2s;background:none;color:var(--text-mid);font-family:var(--font-body);">Normal</button>
            <button id="btn-scale-large" onclick="setAccessibilityScale('large')" class="accessibility-scale-btn scale-large" style="border:none;padding:10px;border-radius:8px;font-weight:600;font-size:16px;cursor:pointer;transition:all 0.2s;background:none;color:var(--text-mid);font-family:var(--font-body);">Large</button>
            <button id="btn-scale-xlarge" onclick="setAccessibilityScale('xlarge')" class="accessibility-scale-btn scale-xlarge" style="border:none;padding:10px;border-radius:8px;font-weight:700;font-size:18px;cursor:pointer;transition:all 0.2s;background:none;color:var(--text-mid);font-family:var(--font-body);">X-Large</button>
          </div>
        </div>

        <!-- High Contrast Mode Option -->
        <div style="display:flex;align-items:center;justify-content:space-between;background:#F8FAFC;padding:16px 20px;border-radius:12px;border:1px solid var(--border-light);gap:12px;">
          <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
            <div style="width:36px;height:36px;min-width:36px;border-radius:50%;background:rgba(30, 187, 215, 0.1);color:var(--primary-teal);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i data-lucide="contrast" style="width:18px;height:18px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
              <span style="display:block;font-size:14px;font-weight:700;color:var(--text-dark);">High Contrast Theme</span>
              <span style="font-size:12.5px;color:var(--text-muted);display:block;line-height:1.35;">Use dark contrast theme for low light or visual assistance</span>
            </div>
          </div>
          <label class="accessibility-switch" style="position:relative;display:inline-block;width:48px;height:26px;min-width:48px;flex-shrink:0;cursor:pointer;margin-left:8px;">
            <input type="checkbox" id="contrast-toggle" style="opacity:0;width:0;height:0;" onchange="toggleAccessibilityContrast(this.checked)" ${isContrast ? 'checked' : ''}>
            <span style="position:absolute;top:0;left:0;right:0;bottom:0;background-color:#CBD5E1;transition:.3s ease;border-radius:26px;" id="switch-slider"></span>
          </label>
        </div>

      </div>

      <!-- Footer -->
      <div class="accessibility-modal-footer" style="padding:20px 32px;border-top:1px solid var(--border-light);background:#FAFAFA;display:flex;justify-content:flex-end;">
        <button id="close-accessibility-settings-btn" style="padding:10px 24px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Done</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Add Switch Slider CSS logic dynamically
  let styleSheet = document.getElementById('accessibility-switch-styles');
  if (!styleSheet) {
    styleSheet = document.createElement('style');
    styleSheet.id = 'accessibility-switch-styles';
    styleSheet.innerHTML = `
      .accessibility-modal-card {
        max-height: 90vh !important;
        box-sizing: border-box !important;
      }
      .accessibility-scale-grid {
        box-sizing: border-box !important;
        width: 100% !important;
      }
      .accessibility-scale-btn {
        box-sizing: border-box !important;
        min-width: 0 !important;
        width: 100% !important;
        text-align: center !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      @media (max-width: 520px) {
        #accessibility-settings-modal {
          padding: 12px !important;
        }
        .accessibility-modal-card {
          max-width: 100% !important;
        }
        .accessibility-modal-header {
          padding: 16px 18px !important;
        }
        .accessibility-modal-body {
          padding: 18px 14px !important;
          gap: 20px !important;
        }
        .accessibility-modal-footer {
          padding: 14px 18px !important;
        }
        .accessibility-scale-grid {
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 8px !important;
          padding: 8px !important;
        }
        .accessibility-scale-btn {
          padding: 10px 6px !important;
          font-size: 13px !important;
        }
      }
      .accessibility-switch {
        width: 48px !important;
        height: 26px !important;
        min-width: 48px !important;
        flex-shrink: 0 !important;
      }
      #switch-slider {
        position: absolute !important;
        top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
        background-color: #CBD5E1;
        border-radius: 26px !important;
        transition: background-color 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        box-sizing: border-box !important;
      }
      #switch-slider::before {
        position: absolute !important;
        content: "" !important;
        height: 20px !important;
        width: 20px !important;
        left: 3px !important;
        top: 3px !important;
        background-color: #ffffff !important;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        border-radius: 50% !important;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25) !important;
      }
      #contrast-toggle:checked + #switch-slider {
        background-color: var(--primary-teal) !important;
      }
      #contrast-toggle:checked + #switch-slider::before {
        transform: translateX(22px) !important;
      }
    `;
    document.head.appendChild(styleSheet);
  }

  lucide.createIcons();

  // Highlight active scale button
  updateScaleButtonHighlights(currentScale);

  // Bind close events
  document.getElementById('close-accessibility-modal').addEventListener('click', () => modal.remove());
  document.getElementById('close-accessibility-settings-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function updateScaleButtonHighlights(activeScale) {
  const scales = ['small', 'normal', 'large', 'xlarge'];
  scales.forEach(scale => {
    const btn = document.getElementById(`btn-scale-${scale}`);
    if (btn) {
      if (scale === activeScale) {
        btn.style.background = 'var(--primary-teal)';
        btn.style.color = '#fff';
        btn.style.boxShadow = '0 4px 10px rgba(30, 187, 215, 0.25)';
      } else {
        btn.style.background = 'none';
        btn.style.color = 'var(--text-mid)';
        btn.style.boxShadow = 'none';
      }
    }
  });
}

window.setAccessibilityScale = function (scale) {
  localStorage.setItem('labsync-text-scale', scale);

  // Apply classes
  document.documentElement.classList.remove('text-scale-small', 'text-scale-normal', 'text-scale-large', 'text-scale-xlarge');
  document.documentElement.classList.add(`text-scale-${scale}`);

  // Update UI highlights
  updateScaleButtonHighlights(scale);
};

window.toggleAccessibilityContrast = function (isChecked) {
  localStorage.setItem('labsync-high-contrast', isChecked);

  if (isChecked) {
    document.documentElement.classList.add('high-contrast');
  } else {
    document.documentElement.classList.remove('high-contrast');
  }
};

// ── Help Modal ───────────────────────────────────────────────────
async function openHelpModal() {
  // Get current user role and page path
  let userRole = 'Faculty';
  const path = window.location.pathname;
  const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

  try {
    const response = await fetch('/api/user/current', { credentials: 'include' });
    const user = await response.json();
    if (response.ok) userRole = user.role || 'Faculty';
  } catch (error) {
    console.error('Error fetching user role:', error);
  }

  const isMis = userRole === 'MIS Staff' || page.startsWith('mis-');
  const isItHead = (userRole && userRole.toLowerCase().includes('head')) || page.startsWith('it-head-') || page === 'master-schedule.html' || page === 'faculty-management.html' || page === 'room-schedule-editor.html';

  const modal = document.createElement('div');
  modal.id = 'help-modal';
  modal.className = 'help-modal-overlay';

  let quickStartHTML = '';
  let featuresHTML = '';

  if (isMis) {
    quickStartHTML = `
      <div class="help-qs-card theme-teal">
        <div class="help-qs-title">📊 Dashboard</div>
        <p class="help-qs-text">Monitor active work orders, total registered PC counts, and recent student report submissions at a glance.</p>
      </div>
      <div class="help-qs-card theme-red">
        <div class="help-qs-title">🛠️ Maintenance Tracker</div>
        <p class="help-qs-text">Filter tickets by status (All, Pending, Resolved), view issue details, and mark broken PCs as resolved with 1 click.</p>
      </div>
      <div class="help-qs-card theme-blue">
        <div class="help-qs-title">📱 PC & QR Management</div>
        <p class="help-qs-text">Add or delete workstation units, inspect room-by-room lab health, and generate printable QR code stickers.</p>
      </div>`;

    featuresHTML = `
      <div class="help-feature-card theme-indigo">
        <div class="help-feat-title">
          <i data-lucide="bell"></i>
          Instant Ticket Alerts
        </div>
        <p class="help-feat-desc">Receive live notifications whenever students or faculty submit new hardware issue reports.</p>
      </div>
      <div class="help-feature-card theme-blue">
        <div class="help-feat-title">
          <i data-lucide="check-circle-2"></i>
          1-Click Ticket Repair
        </div>
        <p class="help-feat-desc">Resolving a ticket updates the work order and restores the PC unit to Functional condition in the database.</p>
      </div>
      <div class="help-feature-card theme-purple">
        <div class="help-feat-title">
          <i data-lucide="qr-code"></i>
          QR Sticker Generator
        </div>
        <p class="help-feat-desc">Export high-resolution QR stickers per laboratory room for fast workstation scanning.</p>
      </div>
      <div class="help-feature-card theme-amber">
        <div class="help-feat-title">
          <i data-lucide="shield-check"></i>
          Shared Account Control
        </div>
        <p class="help-feat-desc">Securely manage shared department access credentials and profile security settings.</p>
      </div>`;
  } else if (isItHead) {
    quickStartHTML = `
      <div class="help-qs-card theme-teal">
        <div class="help-qs-title">📊 IT Head Dashboard</div>
        <p class="help-qs-text">Overview of overall lab usage, schedule publishing, and department activity.</p>
      </div>
      <div class="help-qs-card theme-green">
        <div class="help-qs-title">📆 Master Schedule</div>
        <p class="help-qs-text">View and manage the complete laboratory schedule for all faculty members and classes.</p>
      </div>
      <div class="help-qs-card theme-pink">
        <div class="help-qs-title">👥 Faculty Management</div>
        <p class="help-qs-text">Add new faculty members, manage accounts, and send automated credentials.</p>
      </div>
      <div class="help-qs-card theme-purple">
        <div class="help-qs-title">✏️ Schedule Editor</div>
        <p class="help-qs-text">Create and customize room schedule blocks with imported subject catalogs.</p>
      </div>`;

    featuresHTML = `
      <div class="help-feature-card theme-blue">
        <div class="help-feat-title">
          <i data-lucide="file-spreadsheet"></i>
          Curriculum Import
        </div>
        <p class="help-feat-desc">Bulk upload subject catalogs using Excel or CSV templates.</p>
      </div>
      <div class="help-feature-card theme-indigo">
        <div class="help-feat-title">
          <i data-lucide="printer"></i>
          Schedule Export
        </div>
        <p class="help-feat-desc">Print and export laboratory schedules for department display.</p>
      </div>
      <div class="help-feature-card theme-amber">
        <div class="help-feat-title">
          <i data-lucide="shield-check"></i>
          Secure Access
        </div>
        <p class="help-feat-desc">High-level administrative control over department scheduling.</p>
      </div>
      <div class="help-feature-card theme-green">
        <div class="help-feat-title">
          <i data-lucide="user-cog"></i>
          Account Settings
        </div>
        <p class="help-feat-desc">Manage your profile, credentials, and department settings.</p>
      </div>`;
  } else {
    quickStartHTML = `
      <div class="help-qs-card theme-teal">
        <div class="help-qs-title">📊 Dashboard</div>
        <p class="help-qs-text">View real-time lab status, your schedule, and pending PC reports at a glance.</p>
      </div>
      <div class="help-qs-card theme-blue">
        <div class="help-qs-title">🖥️ Room Status</div>
        <p class="help-qs-text">Monitor all laboratory rooms and their availability across campus.</p>
      </div>
      <div class="help-qs-card theme-warning">
        <div class="help-qs-title">📝 PC Reports</div>
        <p class="help-qs-text">Submit and track computer issues and maintenance requests for lab equipment.</p>
      </div>
      <div class="help-qs-card theme-purple">
        <div class="help-qs-title">📅 My Schedule</div>
        <p class="help-qs-text">View your complete weekly teaching schedule and class assignments.</p>
      </div>`;

    featuresHTML = `
      <div class="help-feature-card theme-blue">
        <div class="help-feat-title">
          <i data-lucide="qr-code"></i>
          QR Code Access
        </div>
        <p class="help-feat-desc">Use your unique QR code for lab access and attendance tracking.</p>
      </div>
      <div class="help-feature-card theme-indigo">
        <div class="help-feat-title">
          <i data-lucide="bell"></i>
          Real-time Updates
        </div>
        <p class="help-feat-desc">Get instant notifications about lab status changes and reports.</p>
      </div>
      <div class="help-feature-card theme-amber">
        <div class="help-feat-title">
          <i data-lucide="shield-check"></i>
          Secure Access
        </div>
        <p class="help-feat-desc">Your account is protected with secure authentication.</p>
      </div>
      <div class="help-feature-card theme-green">
        <div class="help-feat-title">
          <i data-lucide="user-cog"></i>
          Account Settings
        </div>
        <p class="help-feat-desc">Manage your profile, password, and QR code from your account.</p>
      </div>`;
  }

  modal.innerHTML = `
    <div class="help-modal-dialog">
      <!-- Header -->
      <div class="help-modal-header">
        <div class="help-modal-header-left">
          <div class="help-modal-icon-box">
            <i data-lucide="circle-help"></i>
          </div>
          <div class="help-modal-title-wrap">
            <h2 class="help-modal-title">Help & Support</h2>
            <p class="help-modal-subtitle">Quick guide to using LabSync</p>
          </div>
        </div>
        <button id="close-help-modal" class="help-modal-close-btn">
          <i data-lucide="x"></i>
        </button>
      </div>
      
      <!-- Content -->
      <div class="help-modal-body">
        
        <!-- Quick Start -->
        <div style="margin-bottom:32px;">
          <h3 class="help-modal-section-title">
            <i data-lucide="zap"></i>
            Quick Start Guide
          </h3>
          <div class="help-qs-list">
            ${quickStartHTML}
          </div>
        </div>
        
        <!-- Features -->
        <div style="margin-bottom:32px;">
          <h3 class="help-modal-section-title">
            <i data-lucide="sparkles"></i>
            Key Features
          </h3>
          <div class="help-features-grid">
            ${featuresHTML}
          </div>
        </div>
        
        <!-- Need Help -->
        <div class="help-support-box">
          <h3 class="help-support-title">
            <i data-lucide="headphones"></i>
            Need More Help?
          </h3>
          <p class="help-support-desc">If you encounter any issues or have questions, please contact:</p>
          <div class="help-support-list">
            <div class="help-support-item">
              <i data-lucide="mail"></i>
              <strong>Email:</strong> <span class="highlight">support@labsync.bsu.edu.ph</span>
            </div>
            <div class="help-support-item">
              <i data-lucide="phone"></i>
              <strong>Phone:</strong> <span class="highlight">+63 123 456 7890</span>
            </div>
            <div class="help-support-item">
              <i data-lucide="map-pin"></i>
              <strong>Office:</strong> <span>IT Department, BSU Sarmiento Campus</span>
            </div>
          </div>
        </div>
        
      </div>
      
      <!-- Footer -->
      <div class="help-modal-footer">
        <p>LabSync v1.0 - BSU Sarmiento Campus</p>
        <button id="close-help-btn" class="help-modal-got-it-btn">
          Got it!
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  lucide.createIcons();

  // Close handlers
  document.getElementById('close-help-modal').addEventListener('click', () => modal.remove());
  document.getElementById('close-help-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// Global function to toggle password visibility
window.togglePasswordVisibility = function (inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const icon = btnEl.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) {
      icon.setAttribute('data-lucide', 'eye-off');
    }
  } else {
    input.type = 'password';
    if (icon) {
      icon.setAttribute('data-lucide', 'eye');
    }
  }

  // Re-create lucide icons for the button
  if (window.lucide) {
    window.lucide.createIcons({
      attrs: {
        class: 'lucide-icon'
      },
      nameAttr: 'data-lucide'
    });
  }
};

// ── Dashboard Loader Logic ───────────────────────────────────────────────────
async function initDashboard() {
  await loadDashboardStatsAndLabs();
  await loadDashboardSchedule();
}

async function loadDashboardSchedule() {
  const timelineList = document.querySelector('.timeline-list');
  if (!timelineList) return;

  timelineList.innerHTML = `
    <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
      <div class="ui-empty-icon">
        <i data-lucide="loader-2" class="animate-spin" style="width:24px;height:24px;"></i>
      </div>
      <p>Loading today's classes...</p>
    </div>
  `;
  if (window.lucide) lucide.createIcons({ root: timelineList });

  const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  try {
    const currentYear = new Date().getFullYear();
    // Default current term params
    const ay = `${currentYear}-${currentYear + 1}`;
    const sem = '1st Semester';

    const res = await fetch(`/api/schedules/user?academicYear=${encodeURIComponent(ay)}&semester=${encodeURIComponent(sem)}`);
    if (!res.ok) throw new Error('Failed to load schedules');
    const schedules = await res.json();

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[new Date().getDay()];

    // Filter for today
    const todaySchedules = schedules.filter(s => s.Day_of_Week === todayName);

    // Sort chronologically
    todaySchedules.sort((a, b) => (a.Start_Time || '').localeCompare(b.Start_Time || ''));

    // Update stats grid card for Classes Today
    const classesTodayVal = document.querySelector('.stat-card:nth-child(4) .stat-value');
    const classesTodayMeta = document.querySelector('.stat-card:nth-child(4) .stat-meta');
    if (classesTodayVal) {
      classesTodayVal.textContent = todaySchedules.length;
    }
    if (classesTodayMeta) {
      classesTodayMeta.textContent = todaySchedules.length > 0
        ? `${todaySchedules.length} session(s) scheduled`
        : 'No classes today';
    }

    if (todaySchedules.length === 0) {
      timelineList.style.paddingLeft = '0';
      timelineList.style.paddingRight = '0';
      timelineList.style.display = 'flex';
      timelineList.style.flexDirection = 'column';
      timelineList.style.justifyContent = 'center';
      timelineList.style.alignItems = 'center';
      timelineList.style.flex = '1';
      timelineList.style.height = '100%';
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column: unset; width: 100%; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; margin: auto 0;">
          <div class="ui-empty-icon">
            <i data-lucide="calendar-days" style="width:24px;height:24px;"></i>
          </div>
          <p>No classes scheduled for today.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: timelineList });
      return;
    } else {
      timelineList.style.paddingLeft = '';
      timelineList.style.paddingRight = '';
      timelineList.style.display = '';
      timelineList.style.flexDirection = '';
      timelineList.style.justifyContent = '';
      timelineList.style.alignItems = '';
      timelineList.style.flex = '';
      timelineList.style.height = '';
    }

    // Determine current time to mark items as active or future
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let html = '';
    todaySchedules.forEach((s) => {
      // Parse start and end times to see if active
      let isActive = false;
      let isFuture = false;
      if (s.Start_Time && s.End_Time) {
        const startParts = s.Start_Time.split(':');
        const endParts = s.End_Time.split(':');
        const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

        if (nowMinutes >= startMin && nowMinutes <= endMin) {
          isActive = true;
        } else if (nowMinutes < startMin) {
          isFuture = true;
        }
      }

      let timeClass = 'timeline-item';
      if (isActive) timeClass += ' active';
      else if (isFuture) timeClass += ' future';

      // formatting helpers
      const formatTime12 = (timeStr) => {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        let hour = parseInt(parts[0], 10);
        const minute = parts[1];
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12;
        hour = hour ? hour : 12;
        return `${hour}:${minute} ${ampm}`;
      };

      html += `
        <div class="${timeClass}" style="width: 100%; box-sizing: border-box;">
          <div class="time-marker"></div>
          <div class="time-content">
            <div class="tc-top-row">
              <div class="tc-time">
                <i data-lucide="clock" style="width:13px;height:13px;flex-shrink:0;"></i>
                <span>${formatTime12(s.Start_Time)} – ${formatTime12(s.End_Time)}</span>
              </div>
              ${isActive ? '<span class="tc-status-pill ongoing"><span class="dot"></span> ONGOING</span>' : (isFuture ? '<span class="tc-status-pill upcoming">UPCOMING</span>' : '<span class="tc-status-pill completed">COMPLETED</span>')}
            </div>
            <div class="tc-title">${escapeHtml(s.Subject_Name || 'Class Session')}</div>
            <div class="tc-bottom-row">
              <span class="tc-room-badge">
                <i data-lucide="map-pin" style="width:12px;height:12px;"></i> RM ${escapeHtml(s.Room_Number || 'TBA')}
              </span>
              ${s.Section ? `<span class="tc-section-badge">${escapeHtml(s.Section)}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    timelineList.innerHTML = html;

    if (window.lucide) lucide.createIcons({ root: timelineList });

  } catch (err) {
    console.error('Error loading dashboard schedule:', err);
    timelineList.innerHTML = `
      <div class="ui-empty-state" style="grid-column: unset; width: 100%; min-height: 200px;">
        <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
          <i data-lucide="alert-circle"></i>
        </div>
        <p>Failed to load schedule.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ root: timelineList });
  }
}

// ── System Activity Stream & Audit Log Fetcher (100% Live API Data) ──
window.loadSystemActivityFeed = async function (targetContainer, optionalReports = null) {
  const container = typeof targetContainer === 'string'
    ? document.getElementById(targetContainer)
    : (targetContainer || document.getElementById('misDashboardActivityList') || document.querySelector('.activity-feed-list'));

  if (!container) return;

  let activities = [];

  try {
    // 1. Fetch real merged system audit notifications from API (/api/notifications)
    const notifRes = await fetch('/api/notifications', { credentials: 'include' });
    if (notifRes.ok) {
      const rawNotifs = await notifRes.json();
      if (Array.isArray(rawNotifs) && rawNotifs.length > 0) {
        activities = rawNotifs.map(n => transformNotificationToActivity(n));
      }
    }
  } catch (err) {
    console.warn('Could not fetch /api/notifications:', err);
  }

  // 2. Fallback / Merge with live PC reports from API if notifications empty or unauthenticated
  if (activities.length === 0) {
    let reports = optionalReports;
    if (!reports) {
      try {
        const repRes = await fetch('/api/reports');
        if (repRes.ok) reports = await repRes.json();
      } catch (e) {
        console.warn('Could not fetch /api/reports fallback:', e);
      }
    }

    if (Array.isArray(reports) && reports.length > 0) {
      activities = reports.map(r => transformReportToActivity(r));
    }
  }

  // If no data exists in database, render clean empty state (NO FAKE DATA)
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

  function escapeStr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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

  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
};

// Also expose alias for backward compatibility with inline page callers
window.renderEcosystemActivityFeed = function (reports, container) {
  return window.loadSystemActivityFeed(container, reports);
};

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

async function initMISDashboard() {
  if (document.body.dataset.page !== 'mis-dashboard') return;

  try {
    const [reportsRes, labsRes] = await Promise.all([
      fetch('/api/reports'),
      fetch('/api/laboratories')
    ]);

    let reports = [];
    let labs = [];

    if (reportsRes.ok) reports = await reportsRes.json();
    if (labsRes.ok) labs = await labsRes.json();

    // Fetch PC counts for all registered laboratories
    let totalPcCount = 0;
    if (labs.length > 0) {
      try {
        const pcPromises = labs.map(lab => fetch(`/api/laboratories/${lab.Room_ID}/pcs`).then(r => r.ok ? r.json() : []));
        const pcResults = await Promise.all(pcPromises);
        totalPcCount = pcResults.reduce((acc, pcs) => acc + pcs.length, 0);
      } catch (e) {
        console.warn('Could not fetch PC counts:', e);
      }
    }

    const totalLabs = labs.length;
    const pendingCount = reports.filter(r => r.Status === 'Pending').length;
    const inProgressCount = reports.filter(r => r.Status === 'In Progress').length;
    const totalReports = reports.length;

    // 1. Stat 1 (Registered PC Units)
    const stat1Title = document.querySelector('.mis-stats .stat-card.theme-blue .stat-title');
    if (stat1Title) stat1Title.textContent = 'Registered PC Units';

    const stat1Val = document.querySelector('.mis-stats .stat-card.theme-blue .stat-value');
    if (stat1Val) {
      stat1Val.innerHTML = `${totalPcCount} <span class="stat-pill-badge">Across ${totalLabs} Room${totalLabs !== 1 ? 's' : ''}</span>`;
    }

    // 2. Stat 2 (Pending PC Reports)
    const stat2Val = document.querySelector('.mis-stats .stat-card.theme-orange .stat-value');
    if (stat2Val) {
      stat2Val.innerHTML = `${pendingCount} <span class="stat-pill-badge">${totalReports} Total Ticket${totalReports !== 1 ? 's' : ''}</span>`;
    }

    // 3. Stat 3 (Active Maintenance / In Progress)
    const stat3Val = document.querySelector('.mis-stats .stat-card.theme-red .stat-value');
    if (stat3Val) {
      stat3Val.innerHTML = `${inProgressCount} <span class="stat-pill-badge">In Progress</span>`;
    }

    // Helper to parse issue description safely
    function parseIssueDesc(desc) {
      if (!desc) return { section: 'N/A', issues: 'Hardware Issue', remarks: '' };

      const sectionMatch = desc.match(/\[Program & Section:\s*([^\]]+)\]/i);
      const issuesMatch = desc.match(/\[Issues:\s*([^\]]+)\]/i);
      const remarksMatch = desc.match(/Remarks:\s*(.*)$/is);

      const section = sectionMatch ? sectionMatch[1].trim() : 'N/A';
      const issues = issuesMatch ? issuesMatch[1].trim() : 'Hardware Issue';
      let remarks = remarksMatch ? remarksMatch[1].trim() : '';

      if (!remarks) {
        if (!desc.includes('[') && !desc.includes(']')) {
          remarks = desc.trim();
        } else {
          remarks = desc
            .replace(/\[Program & Section:[^\]]+\]/gi, '')
            .replace(/\[Issues:[^\]]+\]/gi, '')
            .replace(/Remarks:/gi, '')
            .trim();
        }
      }

      return { section, issues, remarks: remarks || 'None' };
    }

    // 4. Populate Table of Recent PC Reports
    const tbody = document.querySelector('.table-container table tbody');
    if (tbody) {
      if (reports.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" class="table-cell text-center" style="padding: 40px; color: var(--text-muted);">
              No PC reports available. Reports will appear here when submitted.
            </td>
          </tr>
        `;
      } else {
        const recentReports = reports.slice(0, 10);
        tbody.innerHTML = recentReports.map(r => {
          const dateObj = new Date(r.Date_Reported);
          const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          const parsed = parseIssueDesc(r.Issue_Description);
          const rawIssue = (parsed.issues || '').trim();
          const lowerIssue = rawIssue.toLowerCase();
          const hasRemarks = parsed.remarks &&
            parsed.remarks.trim().length > 0 &&
            parsed.remarks.toLowerCase() !== 'none' &&
            parsed.remarks.toLowerCase() !== 'no remarks provided' &&
            parsed.remarks.toLowerCase() !== 'no details provided.';

          let displayIssue = rawIssue;
          if (!rawIssue || lowerIssue === 'none' || lowerIssue === 'n/a') {
            displayIssue = hasRemarks ? 'Other' : 'None';
          } else if (lowerIssue === 'others' || lowerIssue === 'other') {
            displayIssue = 'Other';
          }

          let statusBadge = '';
          const statusLower = (r.Status || '').toLowerCase();
          if (statusLower === 'pending') {
            statusBadge = '<span class="status-pill pending">Pending</span>';
          } else if (statusLower === 'in progress') {
            statusBadge = '<span class="status-pill in-progress">In Progress</span>';
          } else {
            statusBadge = '<span class="status-pill resolved">Resolved</span>';
          }

          return `
            <tr class="table-data-row">
              <td class="table-cell ticket-id-cell">
                <a href="mis-maintenance.html" class="ticket-id-link">LS-TKT-${r.Report_ID}</a>
              </td>
              <td class="table-cell date-cell col-date">${dateStr}</td>
              <td class="table-cell room-cell text-center">${r.Room_Number}</td>
              <td class="table-cell pc-cell text-center">#${r.PC_Number}</td>
              <td class="table-cell issue-cell">
                <strong>${displayIssue}</strong>
              </td>
              <td class="table-cell text-center">${statusBadge}</td>
              <td class="table-cell text-center">
                <a href="mis-maintenance.html" class="action-link">View</a>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 5. Update Table Footer
    const paginationContainer = document.querySelector('.table-pagination') || document.querySelector('.table-container + div');
    if (paginationContainer) {
      paginationContainer.className = 'table-pagination';
      paginationContainer.innerHTML = `
        <div class="pagination-info">
          Showing <strong>${Math.min(10, reports.length)}</strong> of <strong>${reports.length}</strong> reports
        </div>
        <div class="pagination-controls">
          <button class="btn-page btn-prev" disabled>Previous</button>
          <button class="btn-page btn-next" disabled>Next</button>
        </div>
      `;
    }

    // 6. Populate System Activity Feed with Multi-Category Ecosystem Events
    const activityFeedContainer = document.getElementById('misDashboardActivityList') || document.querySelector('.activity-feed-list') || document.querySelector('.dashboard-main-grid .content-card:last-child > div:last-child > div:last-child');
    if (activityFeedContainer) {
      window.renderEcosystemActivityFeed(reports, activityFeedContainer);
    }

    // 7. Enhanced live search box filtering (preserves active search across polling refreshes)
    function applyMISSearchFilter() {
      const searchInput = document.querySelector('.search-input');
      const tbody = document.querySelector('.table-container table tbody');
      if (!searchInput || !tbody) return;

      const rawInput = searchInput.value.toLowerCase().trim();
      const rows = tbody.querySelectorAll('tr');

      if (!rawInput) {
        rows.forEach(row => row.style.display = '');
        return;
      }

      const cleanQuery = rawInput.replace(/[^a-z0-9]/g, '');
      const numOnlyQuery = rawInput.replace(/[^0-9]/g, '');

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const cleanText = text.replace(/[^a-z0-9]/g, '');

        // Standard substring match
        let isMatch = text.includes(rawInput) || cleanText.includes(cleanQuery);

        // Flexible Ticket ID / Room / PC matching
        if (!isMatch && numOnlyQuery) {
          if (cleanQuery.includes('tkt') || cleanQuery.includes('ls') || cleanQuery.includes('ticket')) {
            isMatch = cleanText.includes('lstkt' + numOnlyQuery) || cleanText.includes('tkt' + numOnlyQuery);
          }
        }

        row.style.display = isMatch ? '' : 'none';
      });
    }

    // Instantly preserve active search filter when table rows are re-rendered
    applyMISSearchFilter();

    const searchInput = document.querySelector('.search-input');
    if (searchInput && !searchInput.dataset.boundSearch) {
      searchInput.dataset.boundSearch = 'true';
      searchInput.addEventListener('input', applyMISSearchFilter);
    }

  } catch (err) {
    console.error('Error loading MIS dashboard reports:', err);
  }
}

async function loadDashboardStatsAndLabs() {
  const labsGrid = document.querySelector('.labs-grid');

  try {
    // 1. Fetch laboratories
    const labsRes = await fetch('/api/laboratories');
    if (!labsRes.ok) throw new Error('Failed to load laboratories');
    const labs = await labsRes.json();

    // 2. Fetch PC reports (for pending count)
    const reportsRes = await fetch('/api/reports');
    let reportsCount = 0;
    if (reportsRes.ok) {
      const reports = await reportsRes.json();
      reportsCount = reports.filter(r => r.Status.toLowerCase() === 'pending').length;
    }

    // 3. Update Stats Grid
    const totalLabsVal = document.querySelector('.stat-card:nth-child(1) .stat-value');
    const totalLabsMeta = document.querySelector('.stat-card:nth-child(1) .stat-meta');
    if (totalLabsVal) totalLabsVal.textContent = labs.length;
    if (totalLabsMeta) totalLabsMeta.textContent = `${labs.length} room(s) registered`;

    const availLabsVal = document.querySelector('.stat-card:nth-child(2) .stat-value');
    const availLabsMeta = document.querySelector('.stat-card:nth-child(2) .stat-meta');
    const availableCount = labs.filter(r => r.Current_Status.toLowerCase() === 'available').length;
    if (availLabsVal) availLabsVal.textContent = availableCount;
    if (availLabsMeta) availLabsMeta.textContent = `${availableCount} available now`;

    const pendingReportsVal = document.querySelector('.stat-card:nth-child(3) .stat-value');
    const pendingReportsMeta = document.querySelector('.stat-card:nth-child(3) .stat-meta');
    if (pendingReportsVal) pendingReportsVal.textContent = reportsCount;
    if (pendingReportsMeta) pendingReportsMeta.textContent = `${reportsCount} active ticket(s)`;

    // 4. Update Laboratories Grid if it exists
    if (labsGrid) {
      if (labs.length === 0) {
        labsGrid.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="monitor-dot" style="width:24px;height:24px;"></i>
            </div>
            <p>No laboratories registered.</p>
          </div>
        `;
        if (window.lucide) lucide.createIcons({ root: labsGrid });
        return;
      }

      labsGrid.innerHTML = labs.map(room => {
        let statusTheme = 'green-theme';
        if (room.Current_Status.toLowerCase() === 'claimed') statusTheme = 'orange-theme';
        else if (room.Current_Status.toLowerCase() === 'in use') statusTheme = 'red-theme';

        return `
          <div class="lab-card ${statusTheme}">
            <div class="lab-header lc-header">
              <span class="room-num">RM ${room.Room_Number}</span>
              <span class="badge ${room.Current_Status.toLowerCase() === 'in use' ? 'red' : (room.Current_Status.toLowerCase() === 'claimed' ? 'orange' : 'green')}">${room.Current_Status}</span>
            </div>
            <div class="lab-details lc-details">
              <div class="ld-row">
                <span>Building:</span>
                <strong>${room.Building || 'Main'}</strong>
              </div>
              <div class="ld-row">
                <span>Active Class:</span>
                <strong class="teal-text">${room.Current_Class || 'None'}</strong>
              </div>
              <div class="ld-row">
                <span>Key Status:</span>
                <strong style="color: ${room.Key_Status === 'Absent' ? '#ef4444' : '#10b981'};">${room.Key_Status || 'Present'}</strong>
              </div>
            </div>
          </div>
        `;
      }).join('');
      if (window.lucide) lucide.createIcons({ root: labsGrid });
    }

  } catch (err) {
    console.error('Error loading dashboard stats and labs:', err);
    if (labsGrid) {
      labsGrid.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
            <i data-lucide="alert-circle"></i>
          </div>
          <p>Failed to load laboratories.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: labsGrid });
    }
  }
}

// ── Custom Beautiful Select Dropdown Helpers ─────────────────────────────────

window.initCustomSelect = function (wrapperId, onChangeCallback) {
  const wrapper = typeof wrapperId === 'string' ? document.getElementById(wrapperId) : wrapperId;
  if (!wrapper) {
    console.error(`Custom select wrapper not found: ${wrapperId}`);
    return;
  }

  const trigger = wrapper.querySelector('.custom-select-trigger');
  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  if (!trigger || !dropdown) return;

  // Toggle dropdown on trigger click
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();

    // Close other open custom-select-wrappers
    document.querySelectorAll('.custom-select-wrapper').forEach(w => {
      if (w !== wrapper) {
        w.classList.remove('open');
      }
    });

    wrapper.classList.toggle('open');
  });

  // Handle option selection
  const options = dropdown.querySelectorAll('.custom-select-option');

  function setupOptionListener(opt) {
    if (opt.dataset.listenerAdded) return;
    opt.dataset.listenerAdded = 'true';

    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = opt.getAttribute('data-value') !== null ? opt.getAttribute('data-value') : opt.textContent.trim();
      wrapper.dataset.value = val;

      const triggerSpan = trigger.querySelector('span');
      if (triggerSpan) {
        triggerSpan.textContent = opt.textContent.trim();
      }

      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');

      wrapper.classList.remove('open');

      if (typeof onChangeCallback === 'function') {
        onChangeCallback(val);
      }
    });
  }

  options.forEach(setupOptionListener);

  // Setup observer for dynamic option additions (e.g. professors list from API)
  const observer = new MutationObserver(() => {
    const currentOpts = dropdown.querySelectorAll('.custom-select-option');
    currentOpts.forEach(setupOptionListener);
  });
  observer.observe(dropdown, { childList: true });

  // Close dropdown on click outside
  if (!window.customSelectGlobalListenerAdded) {
    window.customSelectGlobalListenerAdded = true;
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        w.classList.remove('open');
      });
    });
  }
};

window.setCustomSelectValue = function (wrapperId, value) {
  const wrapper = typeof wrapperId === 'string' ? document.getElementById(wrapperId) : wrapperId;
  if (!wrapper) return;

  const trigger = wrapper.querySelector('.custom-select-trigger');
  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  if (!trigger || !dropdown) return;

  const triggerSpan = trigger.querySelector('span');

  if (!value) {
    wrapper.dataset.value = '';
    const options = dropdown.querySelectorAll('.custom-select-option');
    options.forEach(o => o.classList.remove('selected'));
    return;
  }

  const options = dropdown.querySelectorAll('.custom-select-option');
  let found = false;
  options.forEach(opt => {
    const val = opt.getAttribute('data-value') !== null ? opt.getAttribute('data-value') : opt.textContent.trim();
    if (val === value) {
      found = true;
      opt.classList.add('selected');
      if (triggerSpan) {
        triggerSpan.textContent = opt.textContent.trim();
      }
      wrapper.dataset.value = value;
    } else {
      opt.classList.remove('selected');
    }
  });

  if (!found) {
    wrapper.dataset.value = value;
    if (triggerSpan) {
      triggerSpan.textContent = value;
    }
  }
};

window.populateCustomYearSelectors = function (arg1, arg2, arg3, arg4) {
  let targetId = 'academic-year-wrapper';
  let initAY = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
  let callback = null;

  if (typeof arg1 === 'string' && document.getElementById(arg1)) {
    targetId = arg1;
  }

  if (typeof arg2 === 'string' && /^\d{4}-\d{4}$/.test(arg2)) {
    initAY = arg2;
    if (typeof arg3 === 'function') callback = arg3;
  } else if (typeof arg3 === 'string' && /^\d{4}-\d{4}$/.test(arg3)) {
    initAY = arg3;
    if (typeof arg4 === 'function') callback = arg4;
  } else if (typeof arg2 === 'function') {
    callback = arg2;
  }

  let wrapper = document.getElementById(targetId) || document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
  if (!wrapper) return;

  const dropdown = wrapper.querySelector('.custom-select-dropdown');
  if (!dropdown) return;

  const currentYear = new Date().getFullYear();
  const yearOptions = [];

  for (let y = currentYear; y <= currentYear + 6; y++) {
    yearOptions.push(`${y}-${y + 1}`);
  }

  dropdown.innerHTML = '';
  yearOptions.forEach(ay => {
    const displayLabel = ay.replace('-', '–');
    const opt = document.createElement('div');
    opt.className = 'custom-select-option';
    opt.dataset.value = ay;
    opt.textContent = displayLabel;
    dropdown.appendChild(opt);
  });

  if (!/^\d{4}-\d{4}$/.test(initAY)) {
    initAY = `${currentYear}-${currentYear + 1}`;
  }

  window.initCustomSelect(wrapper.id, () => {
    if (typeof callback === 'function') {
      callback();
    }
  });

  window.setCustomSelectValue(wrapper.id, initAY);
};

// Fetch and load occupancy access events on room status timeline
// Track whether we've done the first load of the activity log
let _activityLogFirstLoad = true;
// Track the last rendered data fingerprint to avoid unnecessary re-renders
let _activityLogLastDataKey = '';

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
    if (window.lucide) lucide.createIcons({ root: timelineList });
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

  try {
    const res = await fetch('/api/notifications', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load activities');
    const activities = await res.json();

    // Filter only occupancy log notifications
    const occupancyLogs = activities.filter(a => a.type === 'occupancy');

    // Build a data fingerprint (ignoring relative time which always changes)
    // so we only re-render when the actual log entries change
    const dataKey = occupancyLogs.map(l => `${l.id}-${l.status}-${l.room_number}-${l.description}`).join('|');
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
        if (window.lucide) lucide.createIcons({ root: timelineList });
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
        if (log.status === 'Key Taken') {
          if (log.description && log.description !== 'Room Key') {
            activityText = `Room key for Room ${log.room_number} taken by ${log.description} (Registered to system).`;
          } else {
            activityText = `Room key for Room ${log.room_number} was taken from the holder.`;
          }
        } else if (log.status === 'Key Returned') {
          activityText = `Room key for Room ${log.room_number} was returned (Room Secured).`;
        } else {
          activityText = `QR Code verified for ${log.description} (Awaiting key retrieval).`;
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
      if (window.lucide) lucide.createIcons({ root: timelineList });

      // Restore scroll position after re-render
      timelineList.scrollTop = savedScrollTop;
    }

    _activityLogLastDataKey = dataKey;
    _activityLogFirstLoad = false;
  } catch (err) {
    console.error('Error loading room status activities:', err);
    // Only show error state if this was the first load (don't replace existing content on network blip)
    if (_activityLogFirstLoad) {
      timelineList.innerHTML = `
        <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
          <div class="ui-empty-icon" style="background:#FEE2E2;color:#EF4444;">
            <i data-lucide="alert-circle"></i>
          </div>
          <p>Failed to load activity logs.</p>
        </div>
      `;
      if (window.lucide) lucide.createIcons({ root: timelineList });
    }
  }
}

// ── Combined Admin Navigation Menu (Master Schedule + Faculty) ────────────
function toggleAdminMenu(event, btnEl) {
  event.preventDefault();
  event.stopPropagation();

  // Close any existing menus first
  const existingMenu = document.getElementById('admin-floating-menu');
  if (existingMenu) {
    existingMenu.remove();
    // If clicking the same button that opened it, just close and return
    if (existingMenu.dataset.triggeredBy === btnEl.title || existingMenu.dataset.triggeredBy === btnEl.textContent) {
      return;
    }
  }

  // Create menu container
  const menu = document.createElement('div');
  menu.id = 'admin-floating-menu';
  menu.dataset.triggeredBy = btnEl.title || btnEl.textContent;

  // Opaque premium styling matching brand
  menu.style.cssText = `
    position: fixed;
    background: #ffffff;
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 16px -6px rgba(15, 23, 42, 0.08);
    padding: 5px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 3px;
    width: max-content;
    min-width: 150px;
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    animation: adminMenuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;

  // High contrast mode override
  if (document.documentElement.classList.contains('high-contrast')) {
    menu.style.background = '#1e293b';
    menu.style.borderColor = '#374151';
  }

  // Inject keyframe style if not already exists
  if (!document.getElementById('admin-menu-keyframes')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'admin-menu-keyframes';
    styleEl.innerHTML = `
      @keyframes adminMenuFadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // Check if current page is active to highlight
  const isMasterActive = window.location.pathname.includes('master-schedule.html') || window.location.pathname.includes('room-schedule-editor.html');
  const isFacultyActive = window.location.pathname.includes('faculty-management.html');

  menu.innerHTML = `
    <button onclick="window.location.href='master-schedule.html'" class="admin-menu-item ${isMasterActive ? 'active' : ''}" style="
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border: none;
      background: transparent;
      color: var(--text-dark, #0F172A);
      font-size: 11.5px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      font-family: var(--font-body);
      transition: all 0.2s;
      white-space: nowrap;
      box-sizing: border-box;
    ">
      <i data-lucide="calendar" style="width:14px;height:14px;flex-shrink:0;color:${isMasterActive ? 'var(--primary-teal)' : '#64748B'};"></i>
      <span>Master Schedule</span>
    </button>
    <button onclick="window.location.href='faculty-management.html'" class="admin-menu-item ${isFacultyActive ? 'active' : ''}" style="
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border: none;
      background: transparent;
      color: var(--text-dark, #0F172A);
      font-size: 11.5px;
      font-weight: 500;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      text-align: left;
      font-family: var(--font-body);
      transition: all 0.2s;
      white-space: nowrap;
      box-sizing: border-box;
    ">
      <i data-lucide="users" style="width:14px;height:14px;flex-shrink:0;color:${isFacultyActive ? 'var(--primary-teal)' : '#64748B'};"></i>
      <span>Faculty Management</span>
    </button>
  `;

  document.body.appendChild(menu);
  if (window.lucide) lucide.createIcons();

  // Highlight hovering styles via stylesheet or inline dynamically
  const items = menu.querySelectorAll('.admin-menu-item');
  items.forEach(item => {
    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--primary-teal-light)';
      item.style.color = 'var(--primary-teal)';
    });
    item.addEventListener('mouseleave', () => {
      if (!item.classList.contains('active')) {
        item.style.background = 'transparent';
        item.style.color = 'var(--text-dark, #0F172A)';
      } else {
        item.style.background = 'var(--primary-teal-light)';
        item.style.color = 'var(--primary-teal)';
      }
    });
    if (item.classList.contains('active')) {
      item.style.background = 'var(--primary-teal-light)';
      item.style.color = 'var(--primary-teal)';
      item.style.fontWeight = '600';
    }
  });

  // Calculate position dynamically based on document layout bounds & actual menu dimensions
  const rect = btnEl.getBoundingClientRect();
  const screenWidth = document.documentElement.clientWidth || window.innerWidth;
  const screenHeight = document.documentElement.clientHeight || window.innerHeight;
  const actualMenuWidth = Math.ceil(menu.getBoundingClientRect().width) || menu.offsetWidth || 150;
  const actualMenuHeight = Math.ceil(menu.getBoundingClientRect().height) || menu.offsetHeight || 75;

  // Let's determine positioning:
  // 1. If it's a mobile bottom nav or near bottom of screen:
  if (rect.bottom > screenHeight - 120 || (screenWidth <= 1024 && rect.top > screenHeight / 2)) {
    menu.style.bottom = `${Math.max(8, screenHeight - rect.top + 8)}px`;
    menu.style.top = 'auto';
    if (rect.left + (rect.width / 2) > screenWidth / 2) {
      const rightMargin = Math.max(12, screenWidth - rect.right);
      menu.style.right = `${rightMargin}px`;
      menu.style.left = 'auto';
    } else {
      let left = rect.left + (rect.width / 2) - (actualMenuWidth / 2);
      left = Math.max(8, Math.min(left, screenWidth - actualMenuWidth - 8));
      menu.style.left = `${left}px`;
      menu.style.right = 'auto';
    }
  }
  // 2. If it's a desktop sidebar (left of screen):
  else if (rect.left < 100) {
    let top = rect.top + (rect.height / 2) - (actualMenuHeight / 2);
    top = Math.max(8, Math.min(top, screenHeight - actualMenuHeight - 8));
    menu.style.left = `${rect.right + 12}px`;
    menu.style.top = `${top}px`;
  }
  // 3. If it's the header menu (top of screen):
  else {
    let left = rect.left + (rect.width / 2) - (actualMenuWidth / 2);
    left = Math.max(8, Math.min(left, screenWidth - actualMenuWidth - 8));
    menu.style.top = `${rect.bottom + 8}px`;
    menu.style.left = `${left}px`;
  }

  // Dismiss listeners
  const closeHandler = function (e) {
    if (!menu.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 0);
}

// ── Initialize Floating Tooltips for Sidebar ───────────────────────
function initSidebarTooltips() {
  const tooltipMap = {
    'Home': 'Dashboard',
    'Lab Rooms': 'Room Status',
    'Help': 'Help & Support'
  };

  document.querySelectorAll('.sidebar-btn').forEach(btn => {
    let tooltip = btn.getAttribute('data-tooltip') || btn.getAttribute('title');
    if (tooltip) {
      if (tooltipMap[tooltip]) {
        tooltip = tooltipMap[tooltip];
      }
      btn.setAttribute('data-tooltip', tooltip);
      btn.removeAttribute('title');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebarTooltips);
} else {
  initSidebarTooltips();
}


