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

    const lowerMsg = typeof message === 'string' ? message.toLowerCase() : '';
    const isError = type === 'error' || (!type && (lowerMsg.includes('failed') || lowerMsg.includes('error') || lowerMsg.includes('invalid')));
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
        <div style="font-size: 13.5px; color: var(--text-mid, #475569); line-height: 1.4; word-break: break-word;">${escapeFn(message)}</div>
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

  // Override browser native alert to use LabSync UI Toast
  function customAlert(msg) {
    if (global.showToast) {
      const lower = typeof msg === 'string' ? msg.toLowerCase() : '';
      const isErr = lower.includes('failed') || lower.includes('error') || lower.includes('invalid') || lower.includes('cannot');
      const isWarn = lower.includes('conflict') || lower.includes('overlap') || lower.includes('already') || lower.includes('warning') || lower.includes('please');
      const isSuccess = lower.includes('success') || lower.includes('saved') || lower.includes('updated') || lower.includes('added') || lower.includes('created') || lower.includes('resolved') || lower.includes('completed');

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

      global.showToast(msg, type, title);
    } else {
      console.log('[LabSync Alert]:', msg);
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.showToast = showToast;
  global.alert = customAlert;

})(typeof window !== 'undefined' ? window : this);
