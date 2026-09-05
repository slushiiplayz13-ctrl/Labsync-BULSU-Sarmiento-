/**
 * LabSync – Custom Select Dropdown Component | js/components/custom-select.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  /**
   * Initializes a custom stylized select dropdown wrapper.
   * @param {string|HTMLElement} wrapperId - Element ID or DOM node
   * @param {Function} [onChangeCallback] - Optional callback triggered on selection change
   */
  function initCustomSelect(wrapperId, onChangeCallback) {
    const wrapper = typeof wrapperId === 'string' ? document.getElementById(wrapperId) : wrapperId;
    if (!wrapper) {
      console.warn(`[CustomSelect] Wrapper not found: ${wrapperId}`);
      return;
    }

    const trigger = wrapper.querySelector('.custom-select-trigger');
    const dropdown = wrapper.querySelector('.custom-select-dropdown');
    if (!trigger || !dropdown) return;

    // Initialize wrapper.dataset.value from pre-selected option if not already defined
    if (!wrapper.dataset.value) {
      const preSelected = dropdown.querySelector('.custom-select-option.selected');
      if (preSelected) {
        wrapper.dataset.value = preSelected.getAttribute('data-value') !== null ? preSelected.getAttribute('data-value') : preSelected.textContent.trim();
      }
    }

    // Toggle dropdown on trigger click
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();

      // Close other open custom-select-wrappers
      document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        if (w !== wrapper) {
          w.classList.remove('open');
        }
      });

      wrapper.classList.toggle('open');
    });

    // Handle option selection
    const options = dropdown.querySelectorAll('.custom-select-option');

    function setupOptionListener(opt) {
      if (opt.dataset.listenerAdded) return;
      opt.dataset.listenerAdded = 'true';

      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value') !== null ? opt.getAttribute('data-value') : opt.textContent.trim();
        wrapper.dataset.value = val;

        const triggerSpan = trigger.querySelector('span');
        if (triggerSpan) {
          triggerSpan.textContent = opt.textContent.trim();
        }

        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        wrapper.classList.remove('open');

        if (typeof onChangeCallback === 'function') {
          onChangeCallback(val);
        }
      });
    }

    options.forEach(setupOptionListener);

    // Setup observer for dynamic option additions (e.g. professors list from API)
    const observer = new MutationObserver(() => {
      const currentOpts = dropdown.querySelectorAll('.custom-select-option');
      currentOpts.forEach(setupOptionListener);
    });
    observer.observe(dropdown, { childList: true });

    // Close dropdown on click outside
    if (!global.customSelectGlobalListenerAdded) {
      global.customSelectGlobalListenerAdded = true;
      document.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
          w.classList.remove('open');
        });
      });
    }
  }

  /**
   * Programmatically sets the active selected value of a custom select wrapper.
   * @param {string|HTMLElement} wrapperId
   * @param {string} value
   */
  function setCustomSelectValue(wrapperId, value) {
    const wrapper = typeof wrapperId === 'string' ? document.getElementById(wrapperId) : wrapperId;
    if (!wrapper) return;

    const trigger = wrapper.querySelector('.custom-select-trigger');
    const dropdown = wrapper.querySelector('.custom-select-dropdown');
    if (!trigger || !dropdown) return;

    const triggerSpan = trigger.querySelector('span');

    if (!value) {
      wrapper.dataset.value = '';
      const options = dropdown.querySelectorAll('.custom-select-option');
      options.forEach(o => o.classList.remove('selected'));
      return;
    }

    const options = dropdown.querySelectorAll('.custom-select-option');
    let found = false;
    options.forEach(opt => {
      const val = opt.getAttribute('data-value') !== null ? opt.getAttribute('data-value') : opt.textContent.trim();
      if (val === value) {
        found = true;
        opt.classList.add('selected');
        if (triggerSpan) {
          triggerSpan.textContent = opt.textContent.trim();
        }
        wrapper.dataset.value = value;
      } else {
        opt.classList.remove('selected');
      }
    });

    if (!found) {
      wrapper.dataset.value = value;
      if (triggerSpan) {
        triggerSpan.textContent = value;
      }
    }
  }

  /**
   * Dynamically populates standard academic year ranges into a custom select wrapper.
   */
  function populateCustomYearSelectors(arg1, arg2, arg3, arg4) {
    let targetId = 'academic-year-wrapper';
    let defaultAY = (global.AcademicTerm && typeof global.AcademicTerm.getCurrentAcademicYear === 'function')
      ? global.AcademicTerm.getCurrentAcademicYear()
      : `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`;
    let initAY = defaultAY;
    let callback = null;

    if (typeof arg1 === 'string' && document.getElementById(arg1)) {
      targetId = arg1;
    }

    if (typeof arg2 === 'string' && /^\d{4}-\d{4}$/.test(arg2)) {
      initAY = arg2;
      if (typeof arg3 === 'function') callback = arg3;
    } else if (typeof arg3 === 'string' && /^\d{4}-\d{4}$/.test(arg3)) {
      initAY = arg3;
      if (typeof arg4 === 'function') callback = arg4;
    } else if (typeof arg2 === 'function') {
      callback = arg2;
    }

    let wrapper = document.getElementById(targetId) || document.getElementById('academic-year-wrapper') || document.getElementById('academic-year-start-wrapper');
    if (!wrapper) return;

    const dropdown = wrapper.querySelector('.custom-select-dropdown');
    if (!dropdown) return;

    let yearOptions = (global.AcademicTerm && typeof global.AcademicTerm.getAvailableAcademicYears === 'function')
      ? global.AcademicTerm.getAvailableAcademicYears(initAY, 0, 5)
      : [];
    if (!yearOptions || yearOptions.length === 0) {
      const currentYear = new Date().getFullYear();
      yearOptions = [];
      for (let y = currentYear; y <= currentYear + 5; y++) {
        yearOptions.push(`${y}-${y + 1}`);
      }
    }

    dropdown.innerHTML = '';
    yearOptions.forEach(ay => {
      const displayLabel = ay.replace('-', '–');
      const opt = document.createElement('div');
      opt.className = 'custom-select-option';
      opt.dataset.value = ay;
      opt.textContent = displayLabel;
      dropdown.appendChild(opt);
    });

    if (!/^\d{4}-\d{4}$/.test(initAY)) {
      initAY = defaultAY;
    }

    initCustomSelect(wrapper.id, () => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    setCustomSelectValue(wrapper.id, initAY);
  }

  // Preserve global contracts for legacy scripts, inline onclick handlers, and HTML callers
  global.initCustomSelect = initCustomSelect;
  global.setCustomSelectValue = setCustomSelectValue;
  global.populateCustomYearSelectors = populateCustomYearSelectors;

})(typeof window !== 'undefined' ? window : this);
