/**
 * LabSync – Sidebar Navigation & Admin Floating Menu | js/components/sidebar-nav.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  /**
   * Toggles the floating quick navigation menu for Admin Panel (Master Schedule & Faculty Management).
   * @param {Event} event
   * @param {HTMLElement} btnEl
   */
  function toggleAdminMenu(event, btnEl) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Close any existing menus first
    const existingMenu = document.getElementById('admin-floating-menu');
    if (existingMenu) {
      existingMenu.remove();
      // If clicking the same button that opened it, just close and return
      if (existingMenu.dataset.triggeredBy === (btnEl.title || btnEl.textContent)) {
        return;
      }
    }

    // Create menu container
    const menu = document.createElement('div');
    menu.id = 'admin-floating-menu';
    menu.dataset.triggeredBy = btnEl.title || btnEl.textContent;

    // Opaque premium styling matching brand
    menu.style.cssText = `
      position: fixed;
      background: #ffffff;
      border: 1px solid var(--border-light);
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 16px -6px rgba(15, 23, 42, 0.08);
      padding: 5px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: max-content;
      min-width: 150px;
      max-width: calc(100vw - 24px);
      box-sizing: border-box;
      animation: adminMenuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    `;

    // High contrast mode override
    if (document.documentElement && document.documentElement.classList.contains('high-contrast')) {
      menu.style.background = '#1e293b';
      menu.style.borderColor = '#374151';
    }

    // Inject keyframe style if not already exists
    if (!document.getElementById('admin-menu-keyframes')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'admin-menu-keyframes';
      styleEl.innerHTML = `
        @keyframes adminMenuFadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(styleEl);
    }

    // Check if current page is active to highlight
    const isMasterActive = window.location.pathname.includes('master-schedule.html') || window.location.pathname.includes('room-schedule-editor.html');
    const isFacultyActive = window.location.pathname.includes('faculty-management.html');

    menu.innerHTML = `
      <button onclick="window.location.href='master-schedule.html'" class="admin-menu-item ${isMasterActive ? 'active' : ''}" style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border: none;
        background: transparent;
        color: var(--text-dark, #0F172A);
        font-size: 11.5px;
        font-weight: 500;
        border-radius: 8px;
        cursor: pointer;
        width: 100%;
        text-align: left;
        font-family: var(--font-body);
        transition: all 0.2s;
        white-space: nowrap;
        box-sizing: border-box;
      ">
        <i data-lucide="calendar" style="width:14px;height:14px;flex-shrink:0;color:${isMasterActive ? 'var(--primary-teal)' : '#64748B'};"></i>
        <span>Master Schedule</span>
      </button>
      <button onclick="window.location.href='faculty-management.html'" class="admin-menu-item ${isFacultyActive ? 'active' : ''}" style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 10px;
        border: none;
        background: transparent;
        color: var(--text-dark, #0F172A);
        font-size: 11.5px;
        font-weight: 500;
        border-radius: 8px;
        cursor: pointer;
        width: 100%;
        text-align: left;
        font-family: var(--font-body);
        transition: all 0.2s;
        white-space: nowrap;
        box-sizing: border-box;
      ">
        <i data-lucide="users" style="width:14px;height:14px;flex-shrink:0;color:${isFacultyActive ? 'var(--primary-teal)' : '#64748B'};"></i>
        <span>Faculty Management</span>
      </button>
    `;

    document.body.appendChild(menu);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: menu });
    }

    // Highlight hovering styles
    const items = menu.querySelectorAll('.admin-menu-item');
    items.forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--primary-teal-light)';
        item.style.color = 'var(--primary-teal)';
      });
      item.addEventListener('mouseleave', () => {
        if (!item.classList.contains('active')) {
          item.style.background = 'transparent';
          item.style.color = 'var(--text-dark, #0F172A)';
        } else {
          item.style.background = 'var(--primary-teal-light)';
          item.style.color = 'var(--primary-teal)';
        }
      });
      if (item.classList.contains('active')) {
        item.style.background = 'var(--primary-teal-light)';
        item.style.color = 'var(--primary-teal)';
        item.style.fontWeight = '600';
      }
    });

    // Calculate position dynamically based on document layout bounds & actual menu dimensions
    const rect = btnEl.getBoundingClientRect();
    const screenWidth = document.documentElement.clientWidth || window.innerWidth;
    const screenHeight = document.documentElement.clientHeight || window.innerHeight;
    const actualMenuWidth = Math.ceil(menu.getBoundingClientRect().width) || menu.offsetWidth || 150;
    const actualMenuHeight = Math.ceil(menu.getBoundingClientRect().height) || menu.offsetHeight || 75;

    // 1. If it's a mobile bottom nav or near bottom of screen:
    if (rect.bottom > screenHeight - 120 || (screenWidth <= 1024 && rect.top > screenHeight / 2)) {
      menu.style.bottom = `${Math.max(8, screenHeight - rect.top + 8)}px`;
      menu.style.top = 'auto';
      if (rect.left + (rect.width / 2) > screenWidth / 2) {
        const rightMargin = Math.max(12, screenWidth - rect.right);
        menu.style.right = `${rightMargin}px`;
        menu.style.left = 'auto';
      } else {
        let left = rect.left + (rect.width / 2) - (actualMenuWidth / 2);
        left = Math.max(8, Math.min(left, screenWidth - actualMenuWidth - 8));
        menu.style.left = `${left}px`;
        menu.style.right = 'auto';
      }
    }
    // 2. If it's a desktop sidebar (left of screen):
    else if (rect.left < 100) {
      let top = rect.top + (rect.height / 2) - (actualMenuHeight / 2);
      top = Math.max(8, Math.min(top, screenHeight - actualMenuHeight - 8));
      menu.style.left = `${rect.right + 12}px`;
      menu.style.top = `${top}px`;
    }
    // 3. If it's the header menu (top of screen):
    else {
      let left = rect.left + (rect.width / 2) - (actualMenuWidth / 2);
      left = Math.max(8, Math.min(left, screenWidth - actualMenuWidth - 8));
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.left = `${left}px`;
    }

    // Dismiss listeners
    const closeHandler = function (e) {
      if (!menu.contains(e.target) && e.target !== btnEl && !btnEl.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 0);
  }

  /**
   * Initializes floating tooltip attributes for standard sidebar navigation buttons.
   */
  function initSidebarTooltips() {
    const tooltipMap = {
      'Home': 'Dashboard',
      'Lab Rooms': 'Room Status',
      'Help': 'Help & Support'
    };

    document.querySelectorAll('.sidebar-btn').forEach(btn => {
      let tooltip = btn.getAttribute('data-tooltip') || btn.getAttribute('title');
      if (tooltip) {
        if (tooltipMap[tooltip]) {
          tooltip = tooltipMap[tooltip];
        }
        btn.setAttribute('data-tooltip', tooltip);
        btn.removeAttribute('title');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarTooltips);
  } else {
    initSidebarTooltips();
  }

  // Preserve global contracts for legacy scripts, inline onclick handlers, and HTML callers
  global.toggleAdminMenu = toggleAdminMenu;
  global.initSidebarTooltips = initSidebarTooltips;

})(typeof window !== 'undefined' ? window : this);
