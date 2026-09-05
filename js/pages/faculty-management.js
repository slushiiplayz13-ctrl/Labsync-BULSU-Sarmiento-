/* ================================================================
   LabSync – Faculty Management Page Coordinator  |  js/pages/faculty-management.js
   Coordinating search/filter, roster loading, and modal workflows.
   ================================================================ */

'use strict';

(function (global) {
  // Page State
  global.allFacultyMembers = global.allFacultyMembers || [];
  global.currentFacultyFilter = global.currentFacultyFilter || 'all';

  /**
   * Initializes sidebar scroll clue.
   */
  function initSidebarScrollClue() {
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');
    if (!sidebar || !scrollClue) return;
    if (sidebar.scrollHeight <= sidebar.clientHeight) scrollClue.style.display = 'none';
    sidebar.addEventListener('scroll', () => {
      scrollClue.style.opacity = sidebar.scrollTop > 10 ? '0' : '1';
    });
  }

  /**
   * Loads faculty roster from server and renders cards.
   */
  async function loadFacultyMembers(force = false) {
    const grid = document.getElementById('faculty-grid');
    if (!grid) return;

    try {
      let faculty = [];
      if (global.facultyService && typeof global.facultyService.getFaculty === 'function') {
        faculty = await global.facultyService.getFaculty();
      } else {
        const response = await fetch('/api/faculty', { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        faculty = await response.json();
      }

      global.allFacultyMembers = faculty;

      // Sort with IT Head first, then alphabetical by name
      if (global.facultyUtils && typeof global.facultyUtils.sortFaculty === 'function') {
        faculty = global.facultyUtils.sortFaculty(faculty);
      } else {
        faculty.sort((a, b) => {
          const aIsBoss = a.Role && a.Role.toLowerCase().includes('head');
          const bIsBoss = b.Role && b.Role.toLowerCase().includes('head');
          if (aIsBoss && !bIsBoss) return -1;
          if (!aIsBoss && bIsBoss) return 1;
          return (a.Name || '').localeCompare(b.Name || '');
        });
      }

      // Delegate rendering to facultyCard component
      if (global.facultyCard && typeof global.facultyCard.renderFacultyCards === 'function') {
        global.facultyCard.renderFacultyCards(faculty, grid, force);
      }

      applySearchAndFilter();
    } catch (error) {
      console.error('Error loading faculty:', error);
      grid.innerHTML = `
        <div class="ui-empty-state">
          <div class="ui-empty-icon" style="background:#FEE2E2; color:#EF4444;">
            <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
          </div>
          <p>Failed to load faculty members. Please check your connection or refresh the page.</p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: grid });
      }
    }
  }

  /**
   * Updates active role filter and triggers search & filter update.
   * @param {string} role
   */
  function filterFaculty(role) {
    global.currentFacultyFilter = role || 'all';

    const dropdown = document.getElementById('filter-dropdown');
    if (dropdown) dropdown.style.display = 'none';

    applySearchAndFilter();
  }

  /**
   * Evaluates search query and active role filter against rendered faculty cards.
   */
  function applySearchAndFilter() {
    const searchInput = document.getElementById('faculty-search');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filter = global.currentFacultyFilter || 'all';

    // Sync filter dropdown checkmarks and active styles
    document.querySelectorAll('.filter-item').forEach(item => {
      const itemRole = item.dataset.filter || (item.getAttribute('onclick') || '').match(/'([^']+)'/)?.[1];
      const isSelected = itemRole === filter;
      item.style.fontWeight = isSelected ? '600' : '500';
      const icon = item.querySelector('i, svg');
      if (icon) {
        icon.style.display = isSelected ? 'block' : 'none';
      }
    });

    document.querySelectorAll('.faculty-card').forEach(card => {
      const name = card.dataset.name || '';
      const email = card.dataset.dept || '';
      const role = card.dataset.role || '';
      const searchStr = card.dataset.search || (name + ' ' + email + ' ' + role);

      const matchesSearch = !q || searchStr.includes(q);
      let matchesFilter = false;

      if (global.facultyUtils && typeof global.facultyUtils.matchesRoleFilter === 'function') {
        matchesFilter = global.facultyUtils.matchesRoleFilter(role, filter);
      } else {
        if (filter === 'all') {
          matchesFilter = true;
        } else if (filter === 'head') {
          matchesFilter = role.includes('head');
        } else if (filter === 'faculty') {
          matchesFilter = role === 'faculty' || (!role.includes('head') && !role.includes('mis'));
        } else if (filter === 'mis') {
          matchesFilter = role.includes('mis');
        }
      }

      const isVisible = matchesSearch && matchesFilter;
      if (isVisible) {
        card.classList.remove('hidden-card');
        card.style.setProperty('display', '', 'important');
      } else {
        card.classList.add('hidden-card');
        card.style.setProperty('display', 'none', 'important');
      }
    });
  }

  /**
   * Initializes page DOM event bindings.
   */
  function initPage() {
    initSidebarScrollClue();

    // Close menus when clicking outside
    if (global.facultyMenu && typeof global.facultyMenu.initClickOutsideListener === 'function') {
      global.facultyMenu.initClickOutsideListener();
    } else {
      document.addEventListener('click', () => {
        if (typeof global.closeAllMenus === 'function') global.closeAllMenus();
      });
    }

    // Filter button listener
    const filterBtn = document.getElementById('filter-btn');
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => {
        if (typeof global.toggleFacultyFilterDropdown === 'function') {
          global.toggleFacultyFilterDropdown(e);
        }
      });
    }

    // Search input listeners
    const searchInput = document.getElementById('faculty-search');
    if (searchInput) {
      ['input', 'keyup', 'change', 'clear', 'paste'].forEach(evt => {
        searchInput.addEventListener(evt, () => applySearchAndFilter());
      });
    }

    // Add faculty button listener
    const addFacultyBtn = document.getElementById('add-faculty-btn');
    if (addFacultyBtn) {
      addFacultyBtn.addEventListener('click', () => {
        if (typeof global.showAddFacultyModal === 'function') {
          global.showAddFacultyModal(loadFacultyMembers);
        }
      });
    }

    // Initial roster load
    loadFacultyMembers();
  }

  // Global Compatibility Bridges
  global.loadFacultyMembers = loadFacultyMembers;
  global.filterFaculty = filterFaculty;
  global.applySearchAndFilter = applySearchAndFilter;
  global.initFacultyManagementPage = initPage;

  // Initialize on DOM ready or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})(typeof window !== 'undefined' ? window : this);
