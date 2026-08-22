/**
 * LabSync – Live Clock & Dynamic Greeting Module | js/core/clock.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  const DAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
  ];

  const MONTHS = [
    'January', 'February', 'March', 'April',
    'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'
  ];

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function getGreeting(hour) {
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  }

  /**
   * Updates real-time header clock, calendar date, and dynamic time-of-day greeting.
   */
  function updateClock() {
    const clockTimeEl = document.getElementById('clockTime');
    const clockDateEl = document.getElementById('clockDate');
    const now = new Date();

    if (clockTimeEl) {
      let h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;

      clockTimeEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)} ${ampm}`;
    }

    if (clockDateEl) {
      const day = DAYS[now.getDay()];
      const date = now.getDate();
      const mon = MONTHS[now.getMonth()];
      const yr = now.getFullYear();
      clockDateEl.textContent = `${day}, ${mon} ${date}, ${yr}`;
    }

    // Update greeting based on current hour ONLY if dashboard is active
    const pageType = document.body ? document.body.dataset.page : '';
    if (pageType === 'dashboard' || pageType === 'it-head-dashboard') {
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

  // Run immediately on script load, then tick every second
  updateClock();
  setInterval(updateClock, 1000);

  // Preserve global contracts for legacy scripts and HTML callers
  global.updateClock = updateClock;

})(typeof window !== 'undefined' ? window : this);
