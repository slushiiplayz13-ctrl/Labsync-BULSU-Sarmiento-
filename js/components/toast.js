/**
 * LabSync UI Toast Notification System
 * Extracted in Phase 6A-03 (Shared UI Infrastructure)
 */

(function (global) {
  'use strict';

  /**
   * Displays an animated glassmorphic toast notification.
   * @param {string} message - Toast message text
   * @param {string} [type='success'] - Toast type: 'success' | 'error' | 'warning' | 'info'
   * @param {string|null} [title=null] - Custom toast title
   */
  function showToast(message, type = 'success', title = null) {
    if (!message) return;

    let displayMsg = typeof message === 'string' ? message : String(message || '');
    if (displayMsg.includes('max_allowed_packet') || displayMsg.includes('packet bigger')) {
      displayMsg = 'The selected profile photo is too large to save. Please choose a smaller image and try again.';
      if (!type || type === 'info' || type === 'success') {
        type = 'error';
      }
    }

    let container = document.getElementById('labsync-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'labsync-toast-container';
      container.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: calc(100vw - 32px);
      `;
      const targetParent = document.body || document.documentElement;
      if (targetParent) targetParent.appendChild(container);
    }

    const lowerMsg = displayMsg.toLowerCase();
    const isError = type === 'error' || (!type && (lowerMsg.includes('failed') || lowerMsg.includes('error') || lowerMsg.includes('invalid') || lowerMsg.includes('too large') || lowerMsg.includes('exceed')));
    const isWarning = type === 'warning' || (!type && (lowerMsg.includes('conflict') || lowerMsg.includes('overlap') || lowerMsg.includes('already scheduled') || lowerMsg.includes('already assigned') || lowerMsg.includes('warning')));
    const isInfo = type === 'info';

    const iconName = isError ? 'alert-triangle' : (isWarning ? 'alert-circle' : (isInfo ? 'info' : 'check-circle-2'));
    const iconColor = isError ? '#EF4444' : (isWarning ? '#F59E0B' : (isInfo ? '#3B82F6' : '#1EBBD7'));
    const iconBg = isError ? 'rgba(239, 68, 68, 0.12)' : (isWarning ? 'rgba(245, 158, 11, 0.12)' : (isInfo ? 'rgba(59, 130, 246, 0.12)' : 'rgba(30, 187, 215, 0.12)'));
    const borderColor = isError ? 'rgba(239, 68, 68, 0.25)' : (isWarning ? 'rgba(245, 158, 11, 0.25)' : (isInfo ? 'rgba(59, 130, 246, 0.25)' : 'rgba(30, 187, 215, 0.3)'));
    const defaultTitle = isError ? 'Notice' : (isWarning ? (lowerMsg.includes('conflict') || lowerMsg.includes('overlap') ? 'Schedule Conflict' : 'Warning') : (isInfo ? 'Information' : 'Success'));
    const toastTitle = title || defaultTitle;

    const card = document.createElement('div');
    card.className = 'labsync-toast-card';
    card.style.cssText = `
      pointer-events: auto;
      background: #ffffff;
      border: 1.5px solid ${borderColor};
      border-radius: 14px;
      padding: 14px 16px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14), 0 4px 12px rgba(0, 0, 0, 0.05);
      min-width: 280px;
      max-width: 380px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      opacity: 0;
      transform: translateY(-16px) scale(0.96);
      transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: var(--font-body, sans-serif);
    `;

    if (document.documentElement && document.documentElement.classList.contains('high-contrast')) {
      card.style.background = '#1E293B';
      card.style.color = '#F8FAFC';
    }

    const escapeFn = global.escapeHtml || window.escapeHtml || ((str) => String(str || ''));

    card.innerHTML = `
      <div style="width: 34px; height: 34px; min-width: 34px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;">
        <i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 13.5px; font-weight: 700; color: var(--text-dark, #0F172A); margin-bottom: 2px; font-family: var(--font-display, sans-serif); display: flex; align-items: center; justify-content: space-between;">
          <span>${escapeFn(toastTitle)}</span>
          <button class="labsync-toast-close" style="background: none; border: none; font-size: 16px; color: var(--text-muted, #94A3B8); cursor: pointer; padding: 0 4px; line-height: 1; margin-left: 8px;">&times;</button>
        </div>
        <div style="font-size: 13.5px; color: var(--text-mid, #475569); line-height: 1.4; word-break: break-word;">${escapeFn(displayMsg)}</div>
      </div>
    `;

    container.appendChild(card);

    if (typeof global.renderIcons === 'function') {
      global.renderIcons(card);
    } else if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: card });
    }

    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0) scale(1)';
    });

    function removeToast() {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-12px) scale(0.95)';
      setTimeout(() => card.remove(), 350);
    }

    const closeBtn = card.querySelector('.labsync-toast-close');
    if (closeBtn) closeBtn.addEventListener('click', removeToast);

    setTimeout(removeToast, 3800);
  }

  /**
   * Displays an animated, glassmorphic in-app confirmation modal.
   * @param {Object|string} options - Configuration object or message string
   * @param {string} [options.title='Confirm Action'] - Modal title
   * @param {string} options.message - Confirmation prompt message
   * @param {string} [options.confirmText='Confirm'] - Text for confirm button
   * @param {string} [options.cancelText='Cancel'] - Text for cancel button
   * @param {boolean} [options.isDestructive=false] - If true, displays warning/danger red theme
   * @param {string} [options.icon='alert-triangle'] - Lucide icon name
   * @returns {Promise<boolean>} Resolves to true if user confirmed, false otherwise
   */
  function showConfirmModal(options) {
    return new Promise((resolve) => {
      let config = {
        title: 'Confirm Action',
        message: '',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        isDestructive: false,
        icon: null
      };

      if (typeof options === 'string') {
        config.message = options;
        const lower = options.toLowerCase();
        if (lower.includes('delete') || lower.includes('clear') || lower.includes('remove') || lower.includes('permanently')) {
          config.isDestructive = true;
          config.title = lower.includes('clear') ? 'Clear Subjects' : (lower.includes('delete') ? 'Delete Item' : 'Confirm Action');
          config.confirmText = lower.includes('clear') ? 'Clear All' : (lower.includes('delete') ? 'Delete' : 'Confirm');
        }
      } else if (typeof options === 'object' && options !== null) {
        config = { ...config, ...options };
      }

      // Remove existing confirm modal if any
      const existing = document.getElementById('labsync-confirm-modal');
      if (existing) existing.remove();

      const isDestructive = config.isDestructive;
      const iconName = config.icon || (isDestructive ? 'alert-triangle' : 'help-circle');
      const iconBg = isDestructive ? 'rgba(239, 68, 68, 0.12)' : 'rgba(30, 187, 215, 0.12)';
      const iconColor = isDestructive ? '#EF4444' : '#1EBBD7';
      const confirmBtnBg = isDestructive ? '#EF4444' : 'var(--primary-teal, #1EBBD7)';
      const confirmBtnShadow = isDestructive ? '0 4px 14px rgba(239, 68, 68, 0.3)' : '0 4px 14px var(--primary-teal-glow, rgba(30, 187, 215, 0.3))';

      const overlay = document.createElement('div');
      overlay.id = 'labsync-confirm-modal';
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.55);
        backdrop-filter: blur(8px);
        opacity: 0;
        transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        padding: 16px;
        box-sizing: border-box;
      `;

      const isDark = (document.documentElement && (document.documentElement.classList.contains('high-contrast') || document.documentElement.classList.contains('dark-mode') || document.documentElement.getAttribute('data-theme') === 'dark')) || (document.body && (document.body.classList.contains('high-contrast') || document.body.classList.contains('dark-mode'))) || localStorage.getItem('labsync-high-contrast') === 'true';
      const cardBg = isDark ? '#1E293B' : '#FFFFFF';
      const cardBorder = isDark ? '1px solid #374151' : '1px solid rgba(226, 232, 240, 0.8)';
      const titleColor = isDark ? '#F8FAFC' : '#0F172A';
      const msgColor = isDark ? '#CBD5E1' : '#64748B';
      const cancelBg = isDark ? '#334155' : '#F1F5F9';
      const cancelTextColor = isDark ? '#F8FAFC' : '#334155';
      const cancelBorder = isDark ? '1px solid #475569' : '1px solid #E2E8F0';

      const escapeFn = global.escapeHtml || window.escapeHtml || ((str) => String(str || ''));

      overlay.innerHTML = `
        <div class="labsync-confirm-card" style="
          background: ${cardBg};
          border: ${cardBorder};
          border-radius: 20px;
          padding: 28px 24px 22px 24px;
          max-width: 420px;
          width: 100%;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          transform: scale(0.94) translateY(8px);
          transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
          font-family: var(--font-body, 'Plus Jakarta Sans', sans-serif);
          box-sizing: border-box;
        ">
          <div style="
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: ${iconBg};
            color: ${iconColor};
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            flex-shrink: 0;
          ">
            <i data-lucide="${iconName}" style="width: 24px; height: 24px;"></i>
          </div>

          <h3 style="
            font-family: var(--font-display, 'Poppins', sans-serif);
            font-size: 17px;
            font-weight: 700;
            color: ${titleColor};
            margin: 0 0 8px 0;
            line-height: 1.3;
          ">${escapeFn(config.title)}</h3>

          <p style="
            font-size: 13.5px;
            color: ${msgColor};
            line-height: 1.5;
            margin: 0 0 22px 0;
            word-break: break-word;
          ">${escapeFn(config.message)}</p>

          <div style="
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            width: 100%;
          ">
            <button type="button" class="btn-confirm-cancel" style="
              flex: 1;
              padding: 10px 16px;
              border-radius: 12px;
              background: ${cancelBg};
              color: ${cancelTextColor};
              border: ${cancelBorder};
              font-size: 13.5px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s ease;
              font-family: inherit;
            ">${escapeFn(config.cancelText)}</button>

            <button type="button" class="btn-confirm-ok" style="
              flex: 1;
              padding: 10px 16px;
              border-radius: 12px;
              background: ${confirmBtnBg};
              color: #FFFFFF;
              border: none;
              font-size: 13.5px;
              font-weight: 700;
              cursor: pointer;
              box-shadow: ${confirmBtnShadow};
              transition: all 0.2s ease;
              font-family: inherit;
            ">${escapeFn(config.confirmText)}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      if (global.setModalOpenState) global.setModalOpenState(true);

      if (typeof global.renderIcons === 'function') {
        global.renderIcons(overlay);
      } else if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: overlay });
      }

      requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        const card = overlay.querySelector('.labsync-confirm-card');
        if (card) card.style.transform = 'scale(1) translateY(0)';
      });

      const card = overlay.querySelector('.labsync-confirm-card');
      const cancelBtn = overlay.querySelector('.btn-confirm-cancel');
      const okBtn = overlay.querySelector('.btn-confirm-ok');

      function cleanup(result) {
        overlay.style.opacity = '0';
        if (card) card.style.transform = 'scale(0.95) translateY(6px)';
        window.removeEventListener('keydown', handleKey);
        setTimeout(() => {
          overlay.remove();
          if (global.setModalOpenState) global.setModalOpenState(false);
          resolve(result);
        }, 220);
      }

      function handleKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          cleanup(true);
        }
      }

      window.addEventListener('keydown', handleKey);

      if (cancelBtn) cancelBtn.addEventListener('click', () => cleanup(false));
      if (okBtn) okBtn.addEventListener('click', () => cleanup(true));

      overlay.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      overlay.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      if (okBtn) okBtn.focus();
    });
  }

  // Override browser native alert to use LabSync UI Toast
  function customAlert(msg) {
    if (global.showToast) {
      let displayMsg = typeof msg === 'string' ? msg : String(msg || '');
      if (displayMsg.includes('max_allowed_packet') || displayMsg.includes('packet bigger')) {
        displayMsg = 'The selected profile photo is too large to save. Please choose a smaller image and try again.';
      }

      const lower = displayMsg.toLowerCase();
      const isErr = lower.includes('failed') || lower.includes('error') || lower.includes('invalid') || lower.includes('cannot') || lower.includes('too large') || lower.includes('exceed') || lower.includes('packet');
      const isWarn = lower.includes('conflict') || lower.includes('overlap') || lower.includes('already') || lower.includes('warning') || (lower.includes('please') && !isErr);
      const isSuccess = (lower.includes('success') || lower.includes('saved') || lower.includes('updated') || lower.includes('added') || lower.includes('created') || lower.includes('resolved') || lower.includes('completed')) && !isErr;

      let type = 'info';
      let title = null;
      if (isErr) {
        type = 'error';
      } else if (isWarn) {
        type = 'warning';
        if (lower.includes('conflict') || lower.includes('overlap')) {
          title = 'Schedule Conflict';
        }
      } else if (isSuccess) {
        type = 'success';
      }

      global.showToast(displayMsg, type, title);
    } else {
      console.log('[LabSync Alert]:', msg);
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.showToast = showToast;
  global.showConfirmModal = showConfirmModal;
  global.confirmModal = showConfirmModal;
  global.showConfirm = showConfirmModal;
  global.alert = customAlert;

})(typeof window !== 'undefined' ? window : this);
