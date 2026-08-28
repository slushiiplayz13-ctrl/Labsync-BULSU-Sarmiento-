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
    const legendItems = container.querySelectorAll('.sl-item');
    const cells = container.querySelectorAll('.sg-cell.filled');

    legendItems.forEach(item => {
      item.addEventListener('click', () => {
        const selectedFilter = item.dataset.filter;

        if (currentFilter === selectedFilter && selectedFilter !== 'all') {
          currentFilter = 'all';
        } else {
          currentFilter = selectedFilter;
        }

        legendItems.forEach(el => {
          if (el.dataset.filter === currentFilter) {
            el.classList.add('active');
            el.style.opacity = '1';
          } else {
            el.classList.remove('active');
            el.style.opacity = currentFilter === 'all' ? '1' : '0.45';
          }
        });

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
      });
    });
  }

  const facultyScheduleFilters = {
    initLegendFilter
  };

  global.facultyScheduleFilters = facultyScheduleFilters;

})(typeof window !== 'undefined' ? window : this);
