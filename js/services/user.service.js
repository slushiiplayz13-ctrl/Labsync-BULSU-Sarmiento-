/**
 * LabSync – User & Session Service | js/services/user.service.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  /**
   * Clears user storage and initiates backend logout session invalidation.
   */
  async function handleLogout() {
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('labsync_tutorial_completed');
      sessionStorage.clear();
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
      });
      window.location.href = '/login.html';
    } catch (error) {
      console.error('[UserService] Logout error:', error);
      window.location.href = '/login.html';
    }
  }

  /**
   * Applies user payload to header UI elements.
   * @param {Object} user
   */
  function applyUserToUI(user) {
    if (!user) return;
    const profileNameEl = document.querySelector('.profile-name');
    const profileRoleEl = document.querySelector('.profile-role');
    const avatarEl = document.querySelector('.avatar');

    if (profileNameEl && user.name && profileNameEl.textContent !== user.name) {
      profileNameEl.textContent = user.name;
    }

    if (profileRoleEl && user.role && profileRoleEl.textContent !== user.role) {
      profileRoleEl.textContent = user.role;
    }

    if (avatarEl) {
      if (user.profilePhoto) {
        avatarEl.innerHTML = `<img src="${user.profilePhoto}" alt="Profile Photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      } else if (user.name) {
        const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        avatarEl.textContent = initials;
      }
    }
  }

  /**
   * Fetches currently authenticated user payload and updates header UI elements.
   */
  async function loadCurrentUser() {
    // Instant pre-hydration from cached session
    try {
      const cached = JSON.parse(sessionStorage.getItem('labsync_user') || 'null');
      if (cached) applyUserToUI(cached);
    } catch (e) {}

    try {
      const response = await fetch('/api/user/current', {
        credentials: 'include'
      });
      if (!response.ok) return;

      const user = await response.json();
      try { sessionStorage.setItem('labsync_user', JSON.stringify(user)); } catch (e) {}

      applyUserToUI(user);

      // Update dynamic greeting if on dashboard
      const pageType = document.body ? document.body.dataset.page : '';
      if (pageType === 'dashboard' || pageType === 'it-head-dashboard') {
        if (typeof global.updateClock === 'function') {
          global.updateClock();
        }
      }
      return user;
    } catch (error) {
      console.error('[UserService] Error loading user:', error);
      return null;
    }
  }

  // Auto-load current user on initial DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCurrentUser);
  } else {
    loadCurrentUser();
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.handleLogout = handleLogout;
  global.loadCurrentUser = loadCurrentUser;
  global.userService = {
    loadCurrentUser,
    handleLogout
  };

})(typeof window !== 'undefined' ? window : this);
