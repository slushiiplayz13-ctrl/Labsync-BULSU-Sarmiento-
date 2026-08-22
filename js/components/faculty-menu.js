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
     * Initializes global click-outside listener to dismiss menus.
     */
    initClickOutsideListener() {
      document.addEventListener('click', () => {
        facultyMenu.closeAllMenus();
      });
    }
  };

  // Expose globally
  global.facultyMenu = facultyMenu;
  global.toggleMenu = facultyMenu.toggleMenu;
  global.closeAllMenus = facultyMenu.closeAllMenus;
  global.toggleFacultyFilterDropdown = facultyMenu.toggleFacultyFilterDropdown;
})(typeof window !== 'undefined' ? window : this);
