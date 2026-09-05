/**
 * LabSync Faculty Schedule Filter Interactions | js/faculty-schedule/faculty-schedule.filters.js
 * Attaches interactive legend filtering, card highlighting, and grayscale dimming effects.
 */

(function (global) {
  'use strict';

  /**
   * Initializes click handlers on legend items to filter schedule cells.
   * @param {HTMLElement} container
   */
  function initLegendFilter(container) {
    if (!container) return;

    let currentFilter = 'all';
    const allBtn = container.querySelector('#subject-filter-all') || container.querySelector('.sl-item[data-filter="all"]');
    const dropdownWrapper = container.querySelector('#subject-filter-dropdown-wrapper');
    const triggerBtn = dropdownWrapper ? dropdownWrapper.querySelector('.custom-select-trigger') : null;
    const triggerText = triggerBtn ? triggerBtn.querySelector('.subject-trigger-text') : null;
    const options = dropdownWrapper ? dropdownWrapper.querySelectorAll('.custom-select-option') : [];
    const cells = container.querySelectorAll('.sg-cell.filled');

    /**
     * Applies filter to timetable cells and syncs All button + Subject dropdown state.
     * @param {string} selectedFilter
     * @param {string} [label]
     */
    function applySubjectFilter(selectedFilter, label) {
      currentFilter = selectedFilter || 'all';

      // 1. Update "All" button state
      if (allBtn) {
        if (currentFilter === 'all') {
          allBtn.classList.add('active');
          allBtn.setAttribute('aria-pressed', 'true');
          allBtn.style.opacity = '1';
        } else {
          allBtn.classList.remove('active');
          allBtn.setAttribute('aria-pressed', 'false');
          allBtn.style.opacity = '1';
        }
      }

      // 2. Update Dropdown trigger state & text
      if (dropdownWrapper) {
        dropdownWrapper.dataset.value = currentFilter;
        if (currentFilter === 'all') {
          dropdownWrapper.classList.remove('is-filtered');
          if (triggerBtn) {
            triggerBtn.classList.remove('active');
            triggerBtn.setAttribute('title', 'Filter by subject');
          }
          if (triggerText) {
            triggerText.textContent = 'Subject';
          }
        } else {
          dropdownWrapper.classList.add('is-filtered');
          if (triggerBtn) {
            triggerBtn.classList.add('active');
            triggerBtn.setAttribute('title', currentFilter);
          }
          if (triggerText) {
            triggerText.textContent = label || currentFilter;
          }
        }
      }

      // 3. Update Dropdown options selected state
      options.forEach(opt => {
        const optVal = opt.getAttribute('data-value');
        if (optVal === currentFilter) {
          opt.classList.add('selected');
          opt.setAttribute('aria-selected', 'true');
        } else {
          opt.classList.remove('selected');
          opt.setAttribute('aria-selected', 'false');
        }
      });

      // 4. Update Timetable cells (preserving exact existing opacity/grayscale/transform behavior)
      cells.forEach(cell => {
        const cellSubj = cell.dataset.subjectName;
        if (currentFilter === 'all' || cellSubj === currentFilter) {
          cell.style.opacity = '1';
          cell.style.filter = 'none';
          if (currentFilter !== 'all') {
            cell.style.transform = 'scale(1.03)';
            cell.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--primary-teal)';
            cell.style.zIndex = '10';
          } else {
            cell.style.transform = 'none';
            cell.style.boxShadow = '';
            cell.style.zIndex = '1';
          }
        } else {
          cell.style.opacity = '0.2';
          cell.style.filter = 'grayscale(60%)';
          cell.style.transform = 'scale(0.97)';
          cell.style.boxShadow = 'none';
          cell.style.zIndex = '1';
        }
      });
    }

    // Bind "All" button click
    if (allBtn) {
      allBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applySubjectFilter('all');
        if (dropdownWrapper) {
          dropdownWrapper.classList.remove('open');
          if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
        }
      });
    }

    // Bind Dropdown trigger toggle click
    if (triggerBtn && dropdownWrapper) {
      triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdownWrapper.classList.toggle('open');
        triggerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

        // Close other open custom-select-wrappers
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
          if (w !== dropdownWrapper) {
            w.classList.remove('open');
            const otherTrig = w.querySelector('.custom-select-trigger');
            if (otherTrig) otherTrig.setAttribute('aria-expanded', 'false');
          }
        });
      });
    }

    // Bind dropdown option clicks
    options.forEach(opt => {
      // Mark listenerAdded to coordinate with custom-select.js
      opt.dataset.listenerAdded = 'true';

      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opt.classList.contains('disabled')) return;

        const val = opt.getAttribute('data-value');
        if (!val) return;

        const code = opt.getAttribute('data-code');
        const textSpan = opt.querySelector('.subject-option-text');
        const label = code || (textSpan ? textSpan.textContent.trim() : opt.textContent.trim());

        if (currentFilter === val) {
          applySubjectFilter('all');
        } else {
          applySubjectFilter(val, label);
        }

        if (dropdownWrapper) {
          dropdownWrapper.classList.remove('open');
        }
        if (triggerBtn) {
          triggerBtn.setAttribute('aria-expanded', 'false');
        }
      });
    });

    // Clean up any previously attached document listeners for this container
    if (typeof container._cleanupSubjectFilterListeners === 'function') {
      container._cleanupSubjectFilterListeners();
    }

    function handleDocClick(e) {
      if (dropdownWrapper && dropdownWrapper.classList.contains('open')) {
        if (!dropdownWrapper.contains(e.target)) {
          dropdownWrapper.classList.remove('open');
          if (triggerBtn) triggerBtn.setAttribute('aria-expanded', 'false');
        }
      }
    }

    function handleDocKeydown(e) {
      if (e.key === 'Escape' && dropdownWrapper && dropdownWrapper.classList.contains('open')) {
        dropdownWrapper.classList.remove('open');
        if (triggerBtn) {
          triggerBtn.setAttribute('aria-expanded', 'false');
          triggerBtn.focus();
        }
      }
    }

    document.addEventListener('click', handleDocClick);
    document.addEventListener('keydown', handleDocKeydown);

    container._cleanupSubjectFilterListeners = function () {
      document.removeEventListener('click', handleDocClick);
      document.removeEventListener('keydown', handleDocKeydown);
    };

    // Fallback for any standalone legacy .sl-item elements
    const legacyItems = container.querySelectorAll('.sl-item:not(#subject-filter-all)');
    legacyItems.forEach(item => {
      item.addEventListener('click', () => {
        const filterVal = item.dataset.filter;
        applySubjectFilter(filterVal, item.textContent.trim());
      });
    });
  }

  const facultyScheduleFilters = {
    initLegendFilter
  };

  global.facultyScheduleFilters = facultyScheduleFilters;

})(typeof window !== 'undefined' ? window : this);
