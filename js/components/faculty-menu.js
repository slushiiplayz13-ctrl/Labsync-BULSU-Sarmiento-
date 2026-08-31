/* ================================================================
   LabSync – Faculty Menu Component  |  js/components/faculty-menu.js
   Manages action dropdowns, role options, filter menu, and click-outside dismissal.
   ================================================================ */

'use strict';

(function (global) {
  const facultyMenu = {
    /**
     * Closes all active dropdown menus and filter popups.
     */
    closeAllMenus() {
      document.querySelectorAll('.faculty-dropdown-menu').forEach(menu => {
        menu.style.display = 'none';
      });
      const filterDropdown = document.getElementById('filter-dropdown');
      if (filterDropdown) filterDropdown.style.display = 'none';
    },

    /**
     * Toggles a specific faculty card action menu.
     * @param {Event} event
     * @param {string} menuId
     */
    toggleMenu(event, menuId) {
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      const menu = document.getElementById(menuId);
      const isVisible = menu && menu.style.display === 'block';
      facultyMenu.closeAllMenus();
      if (!isVisible && menu) {
        menu.style.display = 'block';
      }
    },

    /**
     * Toggles the role filter dropdown menu.
     * @param {Event} [e]
     */
    toggleFacultyFilterDropdown(e) {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      const dropdown = document.getElementById('filter-dropdown');
      if (dropdown) {
        const isShowing = dropdown.style.display === 'block';
        facultyMenu.closeAllMenus();
        dropdown.style.display = isShowing ? 'none' : 'block';
      }
    },

    /**
     * Initializes global click-outside and delegated action listeners.
     */
    initClickOutsideListener() {
      if (facultyMenu._listenerInitialized) return;
      facultyMenu._listenerInitialized = true;

      document.addEventListener('click', (e) => {
        const menuBtn = e.target.closest('.faculty-menu-btn');
        if (menuBtn) {
          e.preventDefault();
          e.stopPropagation();
          const menuId = menuBtn.getAttribute('data-menu-id') || menuBtn.nextElementSibling?.id;
          if (menuId) {
            facultyMenu.toggleMenu(e, menuId);
          }
          return;
        }

        const menuItem = e.target.closest('.faculty-dropdown-menu .menu-item');
        if (menuItem) {
          e.preventDefault();
          e.stopPropagation();
          const action = menuItem.getAttribute('data-action');
          const prof = menuItem.getAttribute('data-prof');
          const userId = menuItem.getAttribute('data-user-id');
          const role = menuItem.getAttribute('data-role');
          facultyMenu.closeAllMenus();

          if (action === 'schedule' && typeof global.viewFacultySchedule === 'function') {
            global.viewFacultySchedule(prof);
          } else if (action === 'role' && typeof global.changeFacultyRole === 'function') {
            global.changeFacultyRole(userId, prof, role);
          } else if (action === 'delete' && typeof global.confirmDeleteFaculty === 'function') {
            global.confirmDeleteFaculty(userId, prof);
          }
          return;
        }

        const filterBtn = e.target.closest('#filter-btn, .faculty-filter-btn');
        if (filterBtn) {
          e.preventDefault();
          e.stopPropagation();
          facultyMenu.toggleFacultyFilterDropdown(e);
          return;
        }

        if (!e.target.closest('.faculty-dropdown-menu') && !e.target.closest('#filter-dropdown')) {
          facultyMenu.closeAllMenus();
        }
      });
    }
  };

  // Auto-init delegated listeners
  facultyMenu.initClickOutsideListener();

  // Expose globally
  global.facultyMenu = facultyMenu;
  global.toggleMenu = facultyMenu.toggleMenu;
  global.closeAllMenus = facultyMenu.closeAllMenus;
  global.toggleFacultyFilterDropdown = facultyMenu.toggleFacultyFilterDropdown;
})(typeof window !== 'undefined' ? window : this);
