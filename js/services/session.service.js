/**
 * LabSync – Session & Inactivity Management Service
 * js/services/session.service.js
 *
 * Implements 10-minute inactivity auto-logout, multi-tab synchronization,
 * force-closure / reopen handling, and real user activity detection.
 */

(function (global) {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (600,000 ms)
  const CHECK_INTERVAL_MS = 5000; // Check every 5 seconds
  const SERVER_TOUCH_THROTTLE_MS = 60000; // At most once per minute while user is active
  const ACTIVITY_RECORD_THROTTLE_MS = 1000; // Throttle local storage activity writes to 1s

  let isExpiring = false;
  let checkTimer = null;
  let lastRecordedTime = 0;
  let lastServerTouchTime = 0;

  function getTimeoutDuration() {
    return (typeof window !== 'undefined' && window.__LABSYNC_SESSION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  }

  function getLastActivityTime() {
    try {
      const val = localStorage.getItem('labsync_last_activity');
      return val ? parseInt(val, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  function setLastActivityTime(timestamp) {
    try {
      localStorage.setItem('labsync_last_activity', String(timestamp));
    } catch (e) { }
  }

  /**
   * Heartbeats user presence to server to keep server session in sync,
   * explicitly marking this as user-initiated activity.
   */
  async function touchServerSession() {
    try {
      await fetch('/api/auth/touch-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-User-Activity': 'true' }
      });
    } catch (e) { }
  }

  /**
   * Records genuine user activity (mouse, keyboard, touch, click).
   * Background polling and automated events must NOT call this.
   */
  function recordUserActivity() {
    const now = Date.now();
    if (now - lastRecordedTime < ACTIVITY_RECORD_THROTTLE_MS) return;
    lastRecordedTime = now;
    setLastActivityTime(now);

    // Heartbeat server session periodically while user is actively interacting
    if (now - lastServerTouchTime > SERVER_TOUCH_THROTTLE_MS) {
      lastServerTouchTime = now;
      touchServerSession();
    }
  }

  /**
   * Clears credentials, invalidates server session, and redirects to login with reason.
   * @param {string} [reason='inactivity']
   */
  async function expireSession(reason = 'inactivity') {
    if (isExpiring) return;
    isExpiring = true;

    if (checkTimer) {
      clearInterval(checkTimer);
      checkTimer = null;
    }

    try {
      localStorage.removeItem('user');
      localStorage.removeItem('labsync_last_activity');
      localStorage.setItem('labsync_session_expired', Date.now().toString());
      sessionStorage.clear();
    } catch (e) { }

    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) { }

    const targetUrl = '/login.html?reason=' + encodeURIComponent(reason);
    if (window.location.pathname !== '/login.html') {
      window.location.replace(targetUrl);
    }
  }

  /**
   * Checks whether the current session has exceeded the inactivity limit.
   */
  function checkInactivity() {
    // Only monitor on authenticated pages where a cached user exists
    let hasUser = false;
    try {
      hasUser = !!(localStorage.getItem('user') || sessionStorage.getItem('labsync_user'));
    } catch (e) { }

    if (!hasUser) return;

    const now = Date.now();
    const lastActivity = getLastActivityTime();
    const timeout = getTimeoutDuration();

    if (!lastActivity) {
      // First page interaction
      setLastActivityTime(now);
      return;
    }

    if (now - lastActivity >= timeout) {
      expireSession('inactivity');
    }
  }

  /**
   * Sets up meaningful user interaction listeners.
   */
  function bindActivityListeners() {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const options = { passive: true, capture: true };

    events.forEach(evt => {
      window.addEventListener(evt, recordUserActivity, options);
    });

    // Multi-tab synchronization via storage event
    window.addEventListener('storage', (e) => {
      if (e.key === 'labsync_session_expired') {
        expireSession('inactivity');
      } else if (e.key === 'labsync_last_activity' && e.newValue) {
        lastRecordedTime = parseInt(e.newValue, 10);
      }
    });

    // Visibility change: when user switches back to this tab, immediately check inactivity
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        checkInactivity();
      }
    });

    // Intercept 401 SESSION_EXPIRED responses globally from any application fetch
    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);
        if (response && response.status === 401) {
          try {
            const clone = response.clone();
            const data = await clone.json();
            if (data && data.code === 'SESSION_EXPIRED') {
              expireSession('inactivity');
            }
          } catch (e) { }
        }
        return response;
      };
    }
  }

  /**
   * Initializes session inactivity monitoring.
   */
  function initSessionService() {
    // Do not run tracker on login or reset-password pages
    const path = window.location.pathname;
    if (path.includes('login.html') || path.includes('reset-password.html')) {
      return;
    }

    // Immediately check if already expired (e.g. reopened tab)
    checkInactivity();

    // Start background activity check interval
    if (!checkTimer) {
      checkTimer = setInterval(checkInactivity, CHECK_INTERVAL_MS);
    }

    // Bind interaction event listeners
    bindActivityListeners();
  }

  // Initialize immediately or on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSessionService);
  } else {
    initSessionService();
  }

  // Public Service API
  const sessionService = {
    recordUserActivity,
    checkInactivity,
    expireSession,
    getTimeoutDuration,
    getLastActivityTime,
    setLastActivityTime
  };

  global.sessionService = sessionService;

})(typeof window !== 'undefined' ? window : this);
