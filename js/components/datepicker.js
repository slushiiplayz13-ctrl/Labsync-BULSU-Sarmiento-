'use strict';

/**
 * LabSync – Custom Modern Datepicker Component
 * js/components/datepicker.js
 *
 * Provides a high-end, responsive calendar dropdown matching LabSync's design system:
 * - Clean typography (Poppins + Plus Jakarta Sans)
 * - Teal / Cyan gradient accents and soft glows
 * - Quick Month/Year switching
 * - Today & Clear shortcuts
 * - Min/Max date constraints and auto-linking (e.g., Start Date <= End Date)
 * - Full Dark Mode & Accessibility support
 */

(function () {
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const MONTH_SHORT = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const WEEKDAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // Global State
  let popoverEl = null;
  let currentInput = null;
  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedDateStr = null;
  let viewMode = 'days'; // 'days' | 'months'

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatIso(year, monthIndex, day) {
    return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
  }

  function formatDisplay(isoStr) {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return isoStr;
    return `${MONTH_SHORT[m]} ${d}, ${y}`;
  }

  function parseIso(isoStr) {
    if (!isoStr || typeof isoStr !== 'string') return null;
    const match = isoStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const y = parseInt(match[1], 10);
    const m = parseInt(match[2], 10) - 1;
    const d = parseInt(match[3], 10);
    const date = new Date(y, m, d);
    if (isNaN(date.getTime()) || date.getMonth() !== m || date.getDate() !== d) return null;
    return { year: y, month: m, day: d };
  }

  function createPopover() {
    if (popoverEl) return popoverEl;

    popoverEl = document.createElement('div');
    popoverEl.className = 'labsync-datepicker-popover';
    popoverEl.setAttribute('role', 'dialog');
    popoverEl.setAttribute('aria-modal', 'true');
    popoverEl.setAttribute('aria-label', 'Choose date');

    document.body.appendChild(popoverEl);

    // Prevent clicks inside popover from closing it
    popoverEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    return popoverEl;
  }

  function getMinDateConstraint(input) {
    if (!input) return null;
    // Explicit min attribute
    const minAttr = input.getAttribute('min') || input.dataset.min;
    if (minAttr) return minAttr;

    // Automatic linking for OJT end date
    if (input.id === 'addOjtEndDate') {
      const startVal = document.getElementById('addOjtStartDate')?.value;
      if (startVal && /^\d{4}-\d{2}-\d{2}$/.test(startVal)) return startVal;
    }
    if (input.id === 'editOjtEndDate') {
      const startVal = document.getElementById('editOjtStartDate')?.value;
      if (startVal && /^\d{4}-\d{2}-\d{2}$/.test(startVal)) return startVal;
    }

    return null;
  }

  function getMaxDateConstraint(input) {
    if (!input) return null;
    // Explicit max attribute
    const maxAttr = input.getAttribute('max') || input.dataset.max;
    if (maxAttr) return maxAttr;

    // Automatic linking for OJT start date
    if (input.id === 'addOjtStartDate') {
      const endVal = document.getElementById('addOjtEndDate')?.value;
      if (endVal && /^\d{4}-\d{2}-\d{2}$/.test(endVal)) return endVal;
    }
    if (input.id === 'editOjtStartDate') {
      const endVal = document.getElementById('editOjtEndDate')?.value;
      if (endVal && /^\d{4}-\d{2}-\d{2}$/.test(endVal)) return endVal;
    }

    return null;
  }

  function render() {
    if (!popoverEl) return;

    const today = new Date();
    const todayStr = formatIso(today.getFullYear(), today.getMonth(), today.getDate());
    const minConstraint = getMinDateConstraint(currentInput);
    const maxConstraint = getMaxDateConstraint(currentInput);

    let html = '';

    // Header HTML
    html += '<div class="ldp-header">';
    html += `  <button type="button" class="ldp-nav-btn" id="ldpPrevBtn" aria-label="Previous">`;
    html += `    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
    html += `  </button>`;

    if (viewMode === 'days') {
      html += `  <button type="button" class="ldp-title-btn" id="ldpTitleBtn" title="Quick month & year jump">`;
      html += `    <span>${MONTH_NAMES[viewMonth]} ${viewYear}</span>`;
      html += `    <svg class="ldp-title-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
      html += `  </button>`;
    } else {
      html += `  <button type="button" class="ldp-title-btn expanded" id="ldpTitleBtn">`;
      html += `    <span>${viewYear}</span>`;
      html += `    <svg class="ldp-title-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
      html += `  </button>`;
    }

    html += `  <button type="button" class="ldp-nav-btn" id="ldpNextBtn" aria-label="Next">`;
    html += `    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`;
    html += `  </button>`;
    html += '</div>';

    // Body content
    if (viewMode === 'days') {
      // Weekday columns
      html += '<div class="ldp-weekdays">';
      WEEKDAY_NAMES.forEach(dayName => {
        html += `<div class="ldp-weekday">${dayName}</div>`;
      });
      html += '</div>';

      // Days grid
      html += '<div class="ldp-days">';

      const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
      const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

      // Trailing days from previous month
      for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        const prevMonthIndex = viewMonth === 0 ? 11 : viewMonth - 1;
        const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
        const iso = formatIso(prevYear, prevMonthIndex, d);
        const isSelected = iso === selectedDateStr;
        const isToday = iso === todayStr;
        let disabled = false;
        if (minConstraint && iso < minConstraint) disabled = true;
        if (maxConstraint && iso > maxConstraint) disabled = true;

        html += `<button type="button" class="ldp-day other-month ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${disabled ? 'disabled' : ''}" data-date="${iso}" ${disabled ? 'disabled' : ''}>${d}</button>`;
      }

      // Current month's days
      for (let d = 1; d <= daysInCurrentMonth; d++) {
        const iso = formatIso(viewYear, viewMonth, d);
        const isSelected = iso === selectedDateStr;
        const isToday = iso === todayStr;
        let disabled = false;
        if (minConstraint && iso < minConstraint) disabled = true;
        if (maxConstraint && iso > maxConstraint) disabled = true;

        html += `<button type="button" class="ldp-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${disabled ? 'disabled' : ''}" data-date="${iso}" ${disabled ? 'disabled' : ''}>${d}</button>`;
      }

      // Leading days from next month to fill grid
      const totalCells = firstDayOfWeek + daysInCurrentMonth;
      const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
      for (let d = 1; d <= remainingCells; d++) {
        const nextMonthIndex = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        const iso = formatIso(nextYear, nextMonthIndex, d);
        const isSelected = iso === selectedDateStr;
        const isToday = iso === todayStr;
        let disabled = false;
        if (minConstraint && iso < minConstraint) disabled = true;
        if (maxConstraint && iso > maxConstraint) disabled = true;

        html += `<button type="button" class="ldp-day other-month ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${disabled ? 'disabled' : ''}" data-date="${iso}" ${disabled ? 'disabled' : ''}>${d}</button>`;
      }

      html += '</div>'; // End ldp-days
    } else {
      // Month selection grid
      html += '<div class="ldp-months-view">';
      MONTH_SHORT.forEach((mName, idx) => {
        const isActive = idx === viewMonth;
        html += `<button type="button" class="ldp-month-btn ${isActive ? 'active' : ''}" data-month="${idx}">${mName}</button>`;
      });
      html += '</div>';
    }

    // Footer HTML
    html += '<div class="ldp-footer">';
    html += `  <button type="button" class="ldp-btn-clear" id="ldpClearBtn">Clear</button>`;
    html += `  <div class="ldp-footer-right">`;
    if (selectedDateStr) {
      html += `    <span class="ldp-preview-badge">${formatDisplay(selectedDateStr)}</span>`;
    }
    html += `    <button type="button" class="ldp-btn-today" id="ldpTodayBtn">Today</button>`;
    html += `  </div>`;
    html += '</div>';

    popoverEl.innerHTML = html;

    // Attach listeners inside popover
    bindPopoverEvents();
  }

  function bindPopoverEvents() {
    const prevBtn = popoverEl.querySelector('#ldpPrevBtn');
    const nextBtn = popoverEl.querySelector('#ldpNextBtn');
    const titleBtn = popoverEl.querySelector('#ldpTitleBtn');
    const clearBtn = popoverEl.querySelector('#ldpClearBtn');
    const todayBtn = popoverEl.querySelector('#ldpTodayBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (viewMode === 'days') {
          if (viewMonth === 0) {
            viewMonth = 11;
            viewYear--;
          } else {
            viewMonth--;
          }
        } else {
          viewYear--;
        }
        render();
        positionPopover();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (viewMode === 'days') {
          if (viewMonth === 11) {
            viewMonth = 0;
            viewYear++;
          } else {
            viewMonth++;
          }
        } else {
          viewYear++;
        }
        render();
        positionPopover();
      });
    }

    if (titleBtn) {
      titleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewMode = viewMode === 'days' ? 'months' : 'days';
        render();
        positionPopover();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentInput) {
          currentInput.value = '';
          currentInput.dispatchEvent(new Event('input', { bubbles: true }));
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        selectedDateStr = null;
        close();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const now = new Date();
        const todayIso = formatIso(now.getFullYear(), now.getMonth(), now.getDate());
        selectDate(todayIso);
      });
    }

    // Day buttons click
    const dayButtons = popoverEl.querySelectorAll('.ldp-day:not(.disabled)');
    dayButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const dateVal = btn.getAttribute('data-date');
        if (dateVal) selectDate(dateVal);
      });
    });

    // Month buttons click
    const monthButtons = popoverEl.querySelectorAll('.ldp-month-btn');
    monthButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = parseInt(btn.getAttribute('data-month'), 10);
        if (!isNaN(m)) {
          viewMonth = m;
          viewMode = 'days';
          render();
          positionPopover();
        }
      });
    });
  }

  function selectDate(isoDate) {
    if (!currentInput) return;
    selectedDateStr = isoDate;
    currentInput.value = isoDate;

    // Trigger both input and change events for framework/DOM compatibility
    currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    currentInput.dispatchEvent(new Event('change', { bubbles: true }));

    close();
  }

  function positionPopover() {
    if (!popoverEl || !currentInput) return;

    const rect = currentInput.getBoundingClientRect();
    const popoverWidth = popoverEl.offsetWidth || 324;
    const popoverHeight = popoverEl.offsetHeight || 360;
    const padding = 12;

    let left = rect.left;

    // Detect if input is inside a modal dialog to stay neatly within modal bounds
    const modalEl = currentInput.closest('.ojt-modal, .modal-card, .modal-content, [role="dialog"]');
    if (modalEl) {
      const modalRect = modalEl.getBoundingClientRect();
      if (rect.left + popoverWidth > modalRect.right - 12) {
        // Align right edge of popover with right edge of input
        left = Math.max(modalRect.left + 12, rect.right - popoverWidth);
      }
    } else if (left + popoverWidth > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - popoverWidth - padding);
    }
    if (left < padding) left = padding;

    let top = rect.bottom + 6;
    // If not enough room at the bottom, place it above the input
    if (top + popoverHeight > window.innerHeight - padding && rect.top - popoverHeight - 6 > padding) {
      top = rect.top - popoverHeight - 6;
    }

    popoverEl.style.left = `${Math.round(left)}px`;
    popoverEl.style.top = `${Math.round(top)}px`;
  }

  function open(input) {
    if (!input) return;
    createPopover();

    currentInput = input;
    const parsed = parseIso(input.value);

    if (parsed) {
      selectedDateStr = input.value.trim();
      viewYear = parsed.year;
      viewMonth = parsed.month;
    } else {
      selectedDateStr = null;
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
    }

    viewMode = 'days';
    render();

    popoverEl.classList.add('active');
    positionPopover();

    // Re-position on next frame once rendered
    requestAnimationFrame(positionPopover);
  }

  function close() {
    if (!popoverEl) return;
    popoverEl.classList.remove('active');
    currentInput = null;
  }

  function isOpen() {
    return popoverEl && popoverEl.classList.contains('active');
  }

  /**
   * Enhances a target input element with the custom datepicker.
   */
  function attach(input) {
    if (!input || input._labsyncDatepickerAttached) return;
    input._labsyncDatepickerAttached = true;

    // Ensure it doesn't trigger the native browser datepicker
    if (input.type === 'date') {
      try {
        input.type = 'text';
      } catch (e) {}
    }
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('inputmode', 'none'); // Prevents virtual keyboards on mobile while keeping cursor
    input.readOnly = true;

    // Wrap in container if not already wrapped
    let container = input.closest('.labsync-date-input-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'labsync-date-input-container';
      input.parentNode.insertBefore(container, input);
      container.appendChild(input);

      const iconSpan = document.createElement('span');
      iconSpan.className = 'labsync-date-icon';
      iconSpan.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>';
      container.appendChild(iconSpan);
    }

    // Toggle on click
    input.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen() && currentInput === input) {
        close();
      } else {
        open(input);
      }
    });

    container.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen() && currentInput === input) {
        close();
      } else {
        open(input);
      }
    });
  }

  /**
   * Automatically scans document for eligible date inputs.
   */
  function init() {
    createPopover();

    const selectors = [
      'input.custom-datepicker-input',
      'input[data-datepicker]',
      '#addOjtStartDate',
      '#addOjtEndDate',
      '#editOjtStartDate',
      '#editOjtEndDate'
    ];

    document.querySelectorAll(selectors.join(',')).forEach(attach);

    // Global dismiss listeners
    document.addEventListener('mousedown', (e) => {
      if (!isOpen()) return;
      if (popoverEl.contains(e.target)) return;
      if (currentInput && (currentInput === e.target || currentInput.contains(e.target))) return;
      const container = currentInput?.closest('.labsync-date-input-container');
      if (container && container.contains(e.target)) return;
      close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        close();
      }
    });

    window.addEventListener('resize', () => {
      if (isOpen()) positionPopover();
    });

    window.addEventListener('scroll', () => {
      if (isOpen()) positionPopover();
    }, true);
  }

  // Self-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export to global window
  window.LabSyncDatePicker = {
    init,
    attach,
    open,
    close,
    isOpen
  };
})();
