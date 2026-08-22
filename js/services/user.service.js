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
   * Fetches currently authenticated user payload and updates header UI elements.
   */
  async function loadCurrentUser() {
    try {
      const response = await fetch('/api/user/current', {
        credentials: 'include'
      });
      if (!response.ok) return;

      const user = await response.json();

      // Update profile name, role, and avatar
      const profileNameEl = document.querySelector('.profile-name');
      const profileRoleEl = document.querySelector('.profile-role');
      const avatarEl = document.querySelector('.avatar');

      if (profileNameEl) {
        profileNameEl.textContent = user.name || 'User';
      }

      if (profileRoleEl) {
        profileRoleEl.textContent = user.role || 'User';
      }

      if (avatarEl) {
        if (user.profilePhoto) {
          avatarEl.innerHTML = `<img src="${user.profilePhoto}" alt="Profile Photo">`;
        } else {
          const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U';
          avatarEl.textContent = initials;
        }
      }

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
