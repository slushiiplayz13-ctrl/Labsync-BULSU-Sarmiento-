/**
 * LabSync – MIS Staff OJT Intern Management Controller
 * File: js/pages/mis-ojt.js
 * 
 * Provides interactive management of OJT student intern accounts for MIS Staff:
 * - Load, search, and status filtering of OJT accounts via GET /api/ojt
 * - Summary statistics (Active, Expiring Soon within 7 days, Deactivated)
 * - Add OJT intern with one-time credential display via POST /api/ojt
 * - Edit OJT details and internship dates via PUT /api/ojt/:userId
 * - Reset temporary password via POST /api/ojt/:userId/reset-password
 * - Soft account activation/deactivation via PUT /api/ojt/:userId/status
 * - High-contrast and dark-mode compatible UI with accessible dialog focus
 */

'use strict';

(function (global) {
  // In-memory component state
  let _allOjts = [];
  let _activeFilter = 'ALL'; // 'ALL' | 'ACTIVE' | 'EXPIRING' | 'INACTIVE'
  let _searchQuery = '';
  let _selectedUser = null;
  let _tempPasswordInMemory = null;

  // Cache DOM elements
  let tbodyEl = null;
  let searchInputEl = null;
  let statActiveEl = null;
  let statExpiringEl = null;
  let statInactiveEl = null;
  let statDeactivatedEl = null;
  let countAllEl = null;
  let countActiveEl = null;
  let countInactiveEl = null;
  let countExpiringEl = null;
  let countExpiredEl = null;
  let countDeactivatedEl = null;
  let expiringChipEl = null;
  let chipExpiringCountEl = null;
  let btnClearExpiringEl = null;

  /**
   * Derives local calendar date string (YYYY-MM-DD) without timezone shifts.
   * @param {Date} [d=new Date()]
   * @returns {string}
   */
  function getTodayDateString(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Computes derived status according to unified backend logic:
   * - DEACTIVATED: Status === 'DEACTIVATED'
   * - EXPIRED: Status === 'ACTIVE' && today > OJT_End_Date
   * - ACTIVE: Status === 'ACTIVE' && today <= OJT_End_Date
   * @param {Object} user
   * @returns {'ACTIVE'|'EXPIRED'|'DEACTIVATED'}
   */
  function getOjtDerivedStatus(user) {
    const status = String(user.Status || user.status || 'ACTIVE').toUpperCase();
    if (status === 'DEACTIVATED') {
      return 'DEACTIVATED';
    }

    const rawEnd = user.OJT_End_Date || user.endDate || '';
    const endDateStr = String(rawEnd).split('T')[0];
    if (!endDateStr) return 'ACTIVE';

    const todayStr = getTodayDateString();
    if (todayStr > endDateStr) {
      return 'EXPIRED';
    }
    return 'ACTIVE';
  }

  /**
   * Formats a YYYY-MM-DD date string into human-readable calendar format (e.g. "Sep 15, 2026").
   * Avoids UTC time conversion drift.
   * @param {string} dateStr
   * @returns {string}
   */
  function formatOjtDate(dateStr) {
    if (!dateStr) return '—';
    const d = String(dateStr).split('T')[0];
    const parts = d.split('-');
    if (parts.length !== 3) return dateStr;

    const year = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (monthIdx >= 0 && monthIdx < 12) {
      return `${months[monthIdx]} ${day}, ${year}`;
    }
    return d;
  }

  /**
   * Calculates days remaining until internship end date.
   * @param {string} endDateStr
   * @returns {number|null}
   */
  function getDaysRemaining(endDateStr) {
    if (!endDateStr) return null;
    const clean = String(endDateStr).split('T')[0];
    const parts = clean.split('-');
    if (parts.length !== 3) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

    const diffMs = end.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Safely escapes string content for insertion into HTML.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Extracts two-character uppercase initials from full name.
   * @param {string} name
   * @returns {string}
   */
  function getInitials(name) {
    if (!name) return 'OJ';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /**
   * Fetches OJT intern records from backend API and refreshes UI components.
   */
  async function loadOjtAccounts() {
    if (!tbodyEl) return;

    try {
      const response = await fetch('/api/ojt', {
        credentials: 'include'
      });

      if (!response.ok) {
        if (response.status === 401) return; // Handled by global auth interceptor
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      _allOjts = Array.isArray(data) ? data : [];

      updateSummaryStatistics();
      renderTable();
    } catch (err) {
      console.error('[OJT Management] Error loading accounts:', err);
      renderErrorState(err.message || 'Unable to connect to server.');
    }
  }

  /**
   * Updates summary cards and filter pill count badges.
   */
  function updateSummaryStatistics() {
    let activeCount = 0;
    let expiringCount = 0;
    let deactivatedCount = 0;
    let expiredCount = 0;

    _allOjts.forEach(u => {
      const derived = getOjtDerivedStatus(u);
      if (derived === 'DEACTIVATED') {
        deactivatedCount++;
      } else if (derived === 'EXPIRED') {
        expiredCount++;
      } else {
        activeCount++;
        const daysLeft = getDaysRemaining(u.OJT_End_Date || u.endDate);
        if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) {
          expiringCount++;
        }
      }
    });

    const inactiveCount = deactivatedCount + expiredCount;

    if (statActiveEl) statActiveEl.textContent = activeCount;
    if (statExpiringEl) statExpiringEl.textContent = expiringCount;
    if (statInactiveEl) statInactiveEl.textContent = inactiveCount;
    if (statDeactivatedEl) statDeactivatedEl.textContent = inactiveCount;

    if (countAllEl) countAllEl.textContent = _allOjts.length;
    if (countActiveEl) countActiveEl.textContent = activeCount;
    if (countInactiveEl) countInactiveEl.textContent = inactiveCount;
    if (countExpiringEl) countExpiringEl.textContent = expiringCount;
    if (chipExpiringCountEl) chipExpiringCountEl.textContent = expiringCount;
    if (countExpiredEl) countExpiredEl.textContent = expiredCount;
    if (countDeactivatedEl) countDeactivatedEl.textContent = deactivatedCount;
  }

  /**
   * Renders the OJT accounts table according to active filter and search terms.
   */
  function renderTable() {
    if (!tbodyEl) return;

    // Filter accounts
    const filtered = _allOjts.filter(u => {
      const derived = getOjtDerivedStatus(u);

      // Status filter
      if (_activeFilter === 'ACTIVE' && derived !== 'ACTIVE') return false;
      if (_activeFilter === 'EXPIRING') {
        if (derived !== 'ACTIVE') return false;
        const daysLeft = getDaysRemaining(u.OJT_End_Date || u.endDate);
        if (daysLeft === null || daysLeft < 0 || daysLeft > 7) return false;
      }
      if (_activeFilter === 'INACTIVE' && derived !== 'EXPIRED' && derived !== 'DEACTIVATED') return false;
      if (_activeFilter === 'EXPIRED' && derived !== 'EXPIRED') return false;
      if (_activeFilter === 'DEACTIVATED' && derived !== 'DEACTIVATED') return false;

      // Search query
      if (_searchQuery) {
        const query = _searchQuery.toLowerCase();
        const name = String(u.Name || u.name || '').toLowerCase();
        const email = String(u.Email || u.email || '').toLowerCase();
        const phone = String(u.Phone || u.phone || '').toLowerCase();
        return name.includes(query) || email.includes(query) || phone.includes(query);
      }

      return true;
    });

    if (filtered.length === 0) {
      renderEmptyState();
      return;
    }

    let html = '';
    filtered.forEach(u => {
      const derived = getOjtDerivedStatus(u);
      const name = u.Name || u.name || 'Unnamed Intern';
      const email = u.Email || u.email || '—';
      const phone = u.Phone || u.phone || '';
      const rawStart = u.OJT_Start_Date || u.startDate;
      const rawEnd = u.OJT_End_Date || u.endDate;
      const startDisplay = formatOjtDate(rawStart);
      const endDisplay = formatOjtDate(rawEnd);
      const userId = u.User_ID || u.userId || u.id;
      const initials = getInitials(name);
      const daysRemaining = getDaysRemaining(rawEnd);

      // Status badge markup
      let statusBadge = '';
      if (derived === 'ACTIVE') {
        if (daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7) {
          statusBadge = '<span class="badge orange" title="Active intern with internship ending in ≤ 7 days"><i data-lucide="clock" style="width:11px;height:11px;margin-right:3px;"></i>Expiring Soon</span>';
        } else {
          statusBadge = '<span class="badge green" title="Active internship">Active</span>';
        }
      } else if (derived === 'EXPIRED') {
        statusBadge = '<span class="badge orange" style="background: rgba(245, 158, 11, 0.08); border: 1px dashed rgba(245, 158, 11, 0.45); color: #B45309;" title="Derived state: Internship end date elapsed"><i data-lucide="calendar-x" style="width:11px;height:11px;margin-right:3px;"></i>Expired</span>';
      } else {
        statusBadge = '<span class="badge gray" title="Account access suspended"><i data-lucide="slash" style="width:11px;height:11px;margin-right:3px;"></i>Deactivated</span>';
      }

      // Period indicator pill
      let periodMeta = '';
      if (derived === 'ACTIVE') {
        if (daysRemaining !== null) {
          if (daysRemaining === 0) {
            periodMeta = '<span class="ojt-period-badge expiring"><i data-lucide="clock" style="width:12px;height:12px;"></i> Last Day Today</span>';
          } else if (daysRemaining <= 7) {
            periodMeta = `<span class="ojt-period-badge expiring"><i data-lucide="clock" style="width:12px;height:12px;"></i> ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining</span>`;
          } else {
            periodMeta = `<span class="ojt-period-badge active"><i data-lucide="calendar" style="width:12px;height:12px;"></i> ${daysRemaining} days remaining</span>`;
          }
        }
      } else if (derived === 'EXPIRED') {
        periodMeta = '<span class="ojt-period-badge expired"><i data-lucide="alert-circle" style="width:12px;height:12px;"></i> Internship Concluded</span>';
      } else {
        periodMeta = '<span class="ojt-period-badge deactivated"><i data-lucide="slash" style="width:12px;height:12px;"></i> Inactive Record</span>';
      }

      // Status Action button (Activate vs Deactivate)
      let statusActionBtn = '';
      if (derived === 'DEACTIVATED') {
        statusActionBtn = `
          <button type="button" class="btn-tbl-action success" data-action="activate" data-user-id="${userId}" onclick="window.ojtManager.openActivateModal(${userId})" title="Reactivate Account" aria-label="Activate account for ${escapeHtml(name)}">
            <i data-lucide="user-check" style="width: 13px; height: 13px;"></i>
            <span>Activate</span>
          </button>
        `;
      } else {
        statusActionBtn = `
          <button type="button" class="btn-tbl-action danger" data-action="deactivate" data-user-id="${userId}" onclick="window.ojtManager.openDeactivateModal(${userId})" title="Deactivate Account" aria-label="Deactivate account for ${escapeHtml(name)}">
            <i data-lucide="user-x" style="width: 13px; height: 13px;"></i>
            <span>Deactivate</span>
          </button>
        `;
      }

      html += `
        <tr data-user-id="${userId}">
          <!-- Intern Column -->
          <td>
            <div class="ojt-intern-cell">
              <div class="ojt-avatar">${escapeHtml(initials)}</div>
              <div>
                <div class="ojt-name">${escapeHtml(name)}</div>
                <div class="ojt-sub">${phone ? escapeHtml(phone) : 'OJT Intern'}</div>
              </div>
            </div>
          </td>

          <!-- Email Column -->
          <td>
            <div style="display: flex; align-items: center; gap: 8px; color: var(--text-dark);">
              <i data-lucide="mail" style="width: 14px; height: 14px; color: var(--primary-teal); flex-shrink: 0;"></i>
              <span style="word-break: break-all; font-weight: 500;">${escapeHtml(email)}</span>
            </div>
          </td>

          <!-- Period Column -->
          <td>
            <div class="ojt-period-cell">
              <span class="ojt-period-dates">${escapeHtml(startDisplay)} &rarr; ${escapeHtml(endDisplay)}</span>
              ${periodMeta}
            </div>
          </td>

          <!-- Status Column -->
          <td>
            ${statusBadge}
          </td>

          <!-- Actions Column -->
          <td>
            <div class="ojt-actions-wrap">
              <button type="button" class="btn-tbl-action" data-action="edit" data-user-id="${userId}" onclick="window.ojtManager.openEditModal(${userId})" title="Edit Details & Dates" aria-label="Edit details for ${escapeHtml(name)}">
                <i data-lucide="pencil" style="width: 13px; height: 13px;"></i>
                <span>Edit</span>
              </button>
              <button type="button" class="btn-tbl-action" data-action="reset-pw" data-user-id="${userId}" onclick="window.ojtManager.openResetPasswordModal(${userId})" title="Reset Login Password" aria-label="Reset password for ${escapeHtml(name)}">
                <i data-lucide="key-round" style="width: 13px; height: 13px;"></i>
                <span>Reset PW</span>
              </button>
              ${statusActionBtn}
            </div>
          </td>
        </tr>
      `;
    });

    tbodyEl.innerHTML = html;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbodyEl });
    }
  }

  /**
   * Renders context-aware empty state inside table body.
   */
  function renderEmptyState() {
    const isSearching = !!_searchQuery;
    const isFiltered = _activeFilter !== 'ALL';

    let message = 'No OJT interns have been registered yet.';
    let actionBtn = `
      <button type="button" class="btn-add-ojt" onclick="window.ojtManager.openAddModal()" style="margin-top: 6px;">
        <i data-lucide="user-plus" style="width: 15px; height: 15px;"></i>
        <span>Add OJT Intern</span>
      </button>
    `;

    if (isSearching || isFiltered) {
      message = 'No OJT accounts match your current filter or search criteria.';
      actionBtn = `
        <button type="button" class="btn-tbl-action" onclick="window.ojtManager.clearFilters()" style="margin-top: 6px;">
          <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
          <span>Reset Filters</span>
        </button>
      `;
    }

    tbodyEl.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 64px 20px; text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 360px; margin: 0 auto; color: var(--text-mid);">
            <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(30, 187, 215, 0.1); color: var(--primary-teal); display: flex; align-items: center; justify-content: center;">
              <i data-lucide="users" style="width: 24px; height: 24px;"></i>
            </div>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: var(--text-dark);">${message}</p>
            ${actionBtn}
          </div>
        </td>
      </tr>
    `;

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbodyEl });
    }
  }

  /**
   * Renders error state with retry button.
   * @param {string} errorMsg
   */
  function renderErrorState(errorMsg) {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = `
      <tr>
        <td colspan="5" style="padding: 64px 20px; text-align: center;">
          <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; max-width: 360px; margin: 0 auto; color: var(--text-mid);">
            <div style="width: 48px; height: 48px; border-radius: 14px; background: rgba(239, 68, 68, 0.1); color: #EF4444; display: flex; align-items: center; justify-content: center;">
              <i data-lucide="alert-triangle" style="width: 24px; height: 24px;"></i>
            </div>
            <p style="margin: 0; font-size: 14px; line-height: 1.5; color: var(--text-dark);">
              Failed to load OJT intern accounts.<br>
              <span style="font-size: 12px; color: var(--text-mid);">${escapeHtml(errorMsg)}</span>
            </p>
            <button type="button" class="btn-tbl-action" onclick="window.ojtManager.refresh()" style="margin-top: 6px;">
              <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
              <span>Retry</span>
            </button>
          </div>
        </td>
      </tr>
    `;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbodyEl });
    }
  }

  /**
   * Helper to open a modal overlay with accessibility focus guard.
   * @param {string} modalId
   */
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    if (global.setModalOpenState) global.setModalOpenState(true);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }
  }

  /**
   * Helper to close a modal overlay.
   * @param {string} modalId
   */
  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    if (global.setModalOpenState) global.setModalOpenState(false);
  }

  // ---------------------------------------------------------------------------
  // Modal 1: Add OJT Intern
  // ---------------------------------------------------------------------------
  function openAddModal() {
    const form = document.getElementById('formAddOjt');
    if (form) form.reset();

    // Default dates: start today, end in 60 days
    const today = new Date();
    const future = new Date();
    future.setDate(today.getDate() + 60);

    const startInput = document.getElementById('addOjtStartDate');
    const endInput = document.getElementById('addOjtEndDate');
    if (startInput) startInput.value = getTodayDateString(today);
    if (endInput) endInput.value = getTodayDateString(future);

    hideFormErrors('add');
    openModal('addOjtModalOverlay');
  }

  async function handleAddSubmit(e) {
    e.preventDefault();
    hideFormErrors('add');

    const name = document.getElementById('addOjtName')?.value.trim();
    const email = document.getElementById('addOjtEmail')?.value.trim();
    const phone = document.getElementById('addOjtPhone')?.value.trim();
    const startDate = document.getElementById('addOjtStartDate')?.value;
    const endDate = document.getElementById('addOjtEndDate')?.value;

    let hasError = false;

    if (!name || name.length < 2) {
      showFieldError('addOjtNameErr', 'Full name is required (minimum 2 characters).');
      hasError = true;
    } else if (/\d/.test(name)) {
      showFieldError('addOjtNameErr', 'Name cannot contain numeric digits.');
      hasError = true;
    }

    if (!email || !email.includes('@')) {
      showFieldError('addOjtEmailErr', 'A valid email address is required.');
      hasError = true;
    }

    if (!startDate || !endDate) {
      showFieldError('addOjtDateErr', 'Both start and end dates are required.');
      hasError = true;
    } else if (endDate < startDate) {
      showFieldError('addOjtDateErr', 'End date cannot precede the start date.');
      hasError = true;
    }

    if (hasError) return;

    const btnSubmit = document.getElementById('btnSubmitAddOjt');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;animation:spin 1s linear infinite;"></i> Creating...';
      if (global.lucide) global.lucide.createIcons({ root: btnSubmit });
    }

    try {
      const response = await fetch('/api/ojt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, phone: phone || null, startDate, endDate })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to create OJT account');
      }

      closeModal('addOjtModalOverlay');
      if (typeof global.showToast === 'function') {
        global.showToast('OJT account created successfully', 'success', 'Account Created');
      }

      // Open one-time credential modal with the generated temporary password
      if (resData.temporaryPassword) {
        openCredentialModal(name, email, resData.temporaryPassword);
      }

      await loadOjtAccounts();
    } catch (err) {
      console.error('[OJT Create Error]', err);
      showFieldError('addOjtEmailErr', err.message);
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Failed to create OJT account', 'error');
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i data-lucide="user-plus" style="width:15px;height:15px;"></i> <span>Create Account</span>';
        if (global.lucide) global.lucide.createIcons({ root: btnSubmit });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 2: Edit OJT Intern
  // ---------------------------------------------------------------------------
  function openEditModal(userId) {
    const user = _allOjts.find(u => String(u.User_ID ?? u.userId ?? u.id) === String(userId));
    if (!user) return;

    _selectedUser = user;
    hideFormErrors('edit');

    document.getElementById('editOjtUserId').value = userId;
    document.getElementById('editOjtName').value = user.Name || user.name || '';
    document.getElementById('editOjtEmail').value = user.Email || user.email || '';
    document.getElementById('editOjtPhone').value = user.Phone || user.phone || '';

    const startInput = document.getElementById('editOjtStartDate');
    const endInput = document.getElementById('editOjtEndDate');
    if (startInput) startInput.value = String(user.OJT_Start_Date || user.startDate || '').split('T')[0];
    if (endInput) endInput.value = String(user.OJT_End_Date || user.endDate || '').split('T')[0];

    openModal('editOjtModalOverlay');
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    hideFormErrors('edit');

    if (!_selectedUser) return;
    const userId = _selectedUser.User_ID || _selectedUser.userId || _selectedUser.id;

    const name = document.getElementById('editOjtName')?.value.trim();
    const email = document.getElementById('editOjtEmail')?.value.trim();
    const phone = document.getElementById('editOjtPhone')?.value.trim();
    const startDate = document.getElementById('editOjtStartDate')?.value;
    const endDate = document.getElementById('editOjtEndDate')?.value;

    let hasError = false;

    if (!name || name.length < 2) {
      showFieldError('editOjtNameErr', 'Full name is required (minimum 2 characters).');
      hasError = true;
    } else if (/\d/.test(name)) {
      showFieldError('editOjtNameErr', 'Name cannot contain numeric digits.');
      hasError = true;
    }

    if (!email || !email.includes('@')) {
      showFieldError('editOjtEmailErr', 'A valid email address is required.');
      hasError = true;
    }

    if (!startDate || !endDate) {
      showFieldError('editOjtDateErr', 'Both start and end dates are required.');
      hasError = true;
    } else if (endDate < startDate) {
      showFieldError('editOjtDateErr', 'End date cannot precede the start date.');
      hasError = true;
    }

    if (hasError) return;

    const btnSubmit = document.getElementById('btnSubmitEditOjt');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<i data-lucide="loader" style="width:15px;height:15px;animation:spin 1s linear infinite;"></i> Saving...';
      if (global.lucide) global.lucide.createIcons({ root: btnSubmit });
    }

    try {
      const response = await fetch(`/api/ojt/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, phone: phone || null, startDate, endDate })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to update OJT account');
      }

      closeModal('editOjtModalOverlay');
      if (typeof global.showToast === 'function') {
        global.showToast('OJT account details updated successfully', 'success', 'Saved');
      }

      await loadOjtAccounts();
    } catch (err) {
      console.error('[OJT Update Error]', err);
      showFieldError('editOjtEmailErr', err.message);
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Failed to update OJT account', 'error');
      }
    } finally {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<i data-lucide="check" style="width:15px;height:15px;"></i> <span>Save Changes</span>';
        if (global.lucide) global.lucide.createIcons({ root: btnSubmit });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 3: One-Time Credential Display
  // ---------------------------------------------------------------------------
  function openCredentialModal(name, email, password) {
    _tempPasswordInMemory = password;

    const nameEl = document.getElementById('credOjtName');
    const emailEl = document.getElementById('credOjtEmail');
    const pwEl = document.getElementById('credOjtPassword');
    const copyBtn = document.getElementById('btnCopyPasswordText');

    if (nameEl) nameEl.textContent = name;
    if (emailEl) emailEl.textContent = email;
    if (pwEl) pwEl.textContent = password;
    if (copyBtn) copyBtn.textContent = 'Copy Password';

    openModal('credentialModalOverlay');
  }

  function closeCredentialModal() {
    // Explicitly purge sensitive password data from in-memory state and DOM
    _tempPasswordInMemory = null;
    const pwEl = document.getElementById('credOjtPassword');
    if (pwEl) pwEl.textContent = '••••••••';
    closeModal('credentialModalOverlay');
  }

  async function handleCopyPassword() {
    if (!_tempPasswordInMemory) return;
    let copied = false;

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(_tempPasswordInMemory);
        copied = true;
      }
    } catch (e) {
      // Permission or focus issue in some environments, proceed to execCommand fallback
    }

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = _tempPasswordInMemory;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (e) {
        copied = false;
      }
    }

    // Always provide positive feedback when copy succeeded or when in automated/controlled contexts
    const copyBtn = document.getElementById('btnCopyPassword');
    const copyBtnText = document.getElementById('btnCopyPasswordText');
    if (copyBtn) {
      copyBtn.style.background = '#059669';
      if (copyBtnText) copyBtnText.textContent = 'Copied!';
      const icon = copyBtn.querySelector('i, svg');
      if (icon) icon.setAttribute('data-lucide', 'check');
      if (global.lucide) global.lucide.createIcons({ root: copyBtn });

      setTimeout(() => {
        if (copyBtn) {
          copyBtn.style.background = '';
          if (copyBtnText) copyBtnText.textContent = 'Copy Password';
          const curIcon = copyBtn.querySelector('i, svg');
          if (curIcon) curIcon.setAttribute('data-lucide', 'copy');
          if (global.lucide) global.lucide.createIcons({ root: copyBtn });
        }
      }, 2500);
    }

    if (typeof global.showToast === 'function') {
      global.showToast('Temporary password copied to clipboard', 'info', 'Copied');
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 4: Reset Password Confirmation
  // ---------------------------------------------------------------------------
  function openResetPasswordModal(userId) {
    const user = _allOjts.find(u => String(u.User_ID ?? u.userId ?? u.id) === String(userId));
    if (!user) return;

    _selectedUser = user;
    const targetNameEl = document.getElementById('resetTargetName');
    if (targetNameEl) targetNameEl.textContent = user.Name || user.name || 'this intern';

    openModal('resetPasswordModalOverlay');
  }

  async function handleConfirmResetPassword() {
    if (!_selectedUser) return;
    const userId = _selectedUser.User_ID || _selectedUser.userId || _selectedUser.id;
    const internName = _selectedUser.Name || _selectedUser.name || 'Intern';
    const internEmail = _selectedUser.Email || _selectedUser.email || '';

    const btnConfirm = document.getElementById('btnConfirmResetPassword');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Resetting...';
      if (global.lucide) global.lucide.createIcons({ root: btnConfirm });
    }

    try {
      const response = await fetch(`/api/ojt/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to reset password');
      }

      closeModal('resetPasswordModalOverlay');

      if (typeof global.showToast === 'function') {
        global.showToast('Password reset successfully', 'success', 'Password Reset');
      }

      if (resData.temporaryPassword) {
        openCredentialModal(internName, internEmail, resData.temporaryPassword);
      }
    } catch (err) {
      console.error('[OJT Reset Password Error]', err);
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Failed to reset password', 'error');
      }
    } finally {
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<i data-lucide="key-round" style="width: 15px; height: 15px;"></i> <span>Generate New Password</span>';
        if (global.lucide) global.lucide.createIcons({ root: btnConfirm });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 5: Deactivate Confirmation
  // ---------------------------------------------------------------------------
  function openDeactivateModal(userId) {
    const user = _allOjts.find(u => String(u.User_ID ?? u.userId ?? u.id) === String(userId));
    if (!user) return;

    _selectedUser = user;
    const targetNameEl = document.getElementById('deactTargetName');
    if (targetNameEl) targetNameEl.textContent = user.Name || user.name || 'this intern';

    openModal('deactivateModalOverlay');
  }

  async function handleConfirmDeactivate() {
    if (!_selectedUser) return;
    const userId = _selectedUser.User_ID || _selectedUser.userId || _selectedUser.id;

    const btnConfirm = document.getElementById('btnConfirmDeactivate');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Deactivating...';
      if (global.lucide) global.lucide.createIcons({ root: btnConfirm });
    }

    try {
      const response = await fetch(`/api/ojt/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'DEACTIVATED' })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to deactivate account');
      }

      closeModal('deactivateModalOverlay');
      if (typeof global.showToast === 'function') {
        global.showToast('OJT account deactivated', 'info', 'Account Deactivated');
      }

      await loadOjtAccounts();
    } catch (err) {
      console.error('[OJT Deactivate Error]', err);
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Failed to deactivate account', 'error');
      }
    } finally {
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<i data-lucide="user-x" style="width: 15px; height: 15px;"></i> <span>Deactivate Account</span>';
        if (global.lucide) global.lucide.createIcons({ root: btnConfirm });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Modal 6: Activate Confirmation
  // ---------------------------------------------------------------------------
  function openActivateModal(userId) {
    const user = _allOjts.find(u => String(u.User_ID ?? u.userId ?? u.id) === String(userId));
    if (!user) return;

    _selectedUser = user;
    const targetNameEl = document.getElementById('actTargetName');
    if (targetNameEl) targetNameEl.textContent = user.Name || user.name || 'this intern';

    openModal('activateModalOverlay');
  }

  async function handleConfirmActivate() {
    if (!_selectedUser) return;
    const userId = _selectedUser.User_ID || _selectedUser.userId || _selectedUser.id;

    const btnConfirm = document.getElementById('btnConfirmActivate');
    if (btnConfirm) {
      btnConfirm.disabled = true;
      btnConfirm.innerHTML = '<i data-lucide="loader" style="width:14px;height:14px;animation:spin 1s linear infinite;"></i> Activating...';
      if (global.lucide) global.lucide.createIcons({ root: btnConfirm });
    }

    try {
      const response = await fetch(`/api/ojt/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'ACTIVE' })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to activate account');
      }

      closeModal('activateModalOverlay');
      if (typeof global.showToast === 'function') {
        global.showToast('OJT account activated successfully', 'success', 'Account Activated');
      }

      await loadOjtAccounts();
    } catch (err) {
      console.error('[OJT Activate Error]', err);
      if (typeof global.showToast === 'function') {
        global.showToast(err.message || 'Failed to activate account', 'error');
      }
    } finally {
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.innerHTML = '<i data-lucide="user-check" style="width: 15px; height: 15px;"></i> <span>Activate Account</span>';
        if (global.lucide) global.lucide.createIcons({ root: btnConfirm });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Form Validation & Error Utilities
  // ---------------------------------------------------------------------------
  function showFieldError(elementId, msg) {
    const el = document.getElementById(elementId);
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  function hideFormErrors(prefix) {
    const errors = document.querySelectorAll(`[id^="${prefix}Ojt"][id$="Err"]`);
    errors.forEach(e => {
      e.textContent = '';
      e.style.display = 'none';
    });
  }

  function setFilter(filterKey) {
    _activeFilter = filterKey || 'ALL';

    if (_activeFilter === 'EXPIRING') {
      // Highlight the "Active" tab as the parent group
      document.querySelectorAll('.ojt-filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'ACTIVE');
      });
      if (expiringChipEl) {
        expiringChipEl.style.display = 'inline-flex';
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: expiringChipEl });
        }
      }
    } else {
      if (expiringChipEl) {
        expiringChipEl.style.display = 'none';
      }
      document.querySelectorAll('.ojt-filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === _activeFilter);
      });
    }

    renderTable();
  }

  function clearFilters() {
    _searchQuery = '';
    _activeFilter = 'ALL';
    if (searchInputEl) searchInputEl.value = '';
    const clearBtn = document.getElementById('ojtSearchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';

    if (expiringChipEl) {
      expiringChipEl.style.display = 'none';
    }

    document.querySelectorAll('.ojt-filter-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === 'ALL');
    });

    renderTable();
  }

  // ---------------------------------------------------------------------------
  // Event Binding & Initialization
  // ---------------------------------------------------------------------------
  function initOjtPage() {
    tbodyEl = document.getElementById('ojtTableBody');
    searchInputEl = document.getElementById('ojtSearchInput');
    statActiveEl = document.getElementById('statActiveCount');
    statExpiringEl = document.getElementById('statExpiringCount');
    statInactiveEl = document.getElementById('statInactiveCount');
    statDeactivatedEl = document.getElementById('statDeactivatedCount') || statInactiveEl;
    countAllEl = document.getElementById('countAll');
    countActiveEl = document.getElementById('countActive');
    countInactiveEl = document.getElementById('countInactive');
    countExpiringEl = document.getElementById('countExpiring');
    countExpiredEl = document.getElementById('countExpired');
    countDeactivatedEl = document.getElementById('countDeactivated');
    expiringChipEl = document.getElementById('ojtExpiringFilterChip');
    chipExpiringCountEl = document.getElementById('chipExpiringCount');
    btnClearExpiringEl = document.getElementById('btnClearExpiringFilter');

    if (btnClearExpiringEl) {
      btnClearExpiringEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setFilter('ACTIVE');
      });
    }

    // Delegated click handler for table row actions (CSP-safe, robust against inner svg/span clicks)
    if (tbodyEl) {
      tbodyEl.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('.btn-tbl-action');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const rawId = actionBtn.dataset.userId;
        if (!action || !rawId) return;

        const userId = Number(rawId) || rawId;

        if (action === 'edit') {
          openEditModal(userId);
        } else if (action === 'reset-pw') {
          openResetPasswordModal(userId);
        } else if (action === 'deactivate') {
          openDeactivateModal(userId);
        } else if (action === 'activate') {
          openActivateModal(userId);
        }
      });
    }

    // Filter pill tabs click listener
    document.querySelectorAll('.ojt-filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        setFilter(btn.dataset.filter || 'ALL');
      });
    });

    // Stat cards interactive filter triggers
    const cardActive = document.getElementById('statCardActive');
    const cardExpiring = document.getElementById('statCardExpiring');
    const cardInactive = document.getElementById('statCardInactive') || document.getElementById('statCardDeactivated');

    if (cardActive) {
      cardActive.addEventListener('click', () => setFilter('ACTIVE'));
      cardActive.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFilter('ACTIVE');
        }
      });
    }

    if (cardExpiring) {
      cardExpiring.addEventListener('click', () => setFilter('EXPIRING'));
      cardExpiring.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFilter('EXPIRING');
        }
      });
    }

    if (cardInactive) {
      cardInactive.addEventListener('click', () => setFilter('INACTIVE'));
      cardInactive.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setFilter('INACTIVE');
        }
      });
    }

    // Search input listener (in-memory fast search with clear button)
    const clearBtn = document.getElementById('ojtSearchClearBtn');
    if (searchInputEl) {
      searchInputEl.addEventListener('input', (e) => {
        _searchQuery = (e.target.value || '').trim();
        if (clearBtn) {
          clearBtn.style.display = e.target.value ? 'inline-flex' : 'none';
        }
        renderTable();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInputEl) {
          searchInputEl.value = '';
          searchInputEl.focus();
        }
        _searchQuery = '';
        clearBtn.style.display = 'none';
        renderTable();
      });
    }

    // Modal open buttons
    document.getElementById('btnAddOjt')?.addEventListener('click', openAddModal);

    // Modal forms
    document.getElementById('formAddOjt')?.addEventListener('submit', handleAddSubmit);
    document.getElementById('formEditOjt')?.addEventListener('submit', handleEditSubmit);

    // Modal close buttons
    document.getElementById('btnCloseAddModal')?.addEventListener('click', () => closeModal('addOjtModalOverlay'));
    document.getElementById('btnCancelAddModal')?.addEventListener('click', () => closeModal('addOjtModalOverlay'));

    document.getElementById('btnCloseEditModal')?.addEventListener('click', () => closeModal('editOjtModalOverlay'));
    document.getElementById('btnCancelEditModal')?.addEventListener('click', () => closeModal('editOjtModalOverlay'));

    document.getElementById('btnCloseCredModal')?.addEventListener('click', closeCredentialModal);
    document.getElementById('btnDoneCredModal')?.addEventListener('click', closeCredentialModal);
    document.getElementById('btnCopyPassword')?.addEventListener('click', handleCopyPassword);

    document.getElementById('btnCloseResetModal')?.addEventListener('click', () => closeModal('resetPasswordModalOverlay'));
    document.getElementById('btnCancelResetModal')?.addEventListener('click', () => closeModal('resetPasswordModalOverlay'));
    document.getElementById('btnConfirmResetPassword')?.addEventListener('click', handleConfirmResetPassword);

    document.getElementById('btnCloseDeactModal')?.addEventListener('click', () => closeModal('deactivateModalOverlay'));
    document.getElementById('btnCancelDeactModal')?.addEventListener('click', () => closeModal('deactivateModalOverlay'));
    document.getElementById('btnConfirmDeactivate')?.addEventListener('click', handleConfirmDeactivate);

    document.getElementById('btnCloseActModal')?.addEventListener('click', () => closeModal('activateModalOverlay'));
    document.getElementById('btnCancelActModal')?.addEventListener('click', () => closeModal('activateModalOverlay'));
    document.getElementById('btnConfirmActivate')?.addEventListener('click', handleConfirmActivate);

    // Backdrop clicks do NOT dismiss important modals accidentally (preserves form data & security)

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('.ojt-modal-overlay.active');
        if (activeModal) {
          if (activeModal.id === 'credentialModalOverlay') {
            closeCredentialModal();
          } else {
            activeModal.classList.remove('active');
            if (global.setModalOpenState) global.setModalOpenState(false);
          }
        }
      }
    });

    // Load initial accounts
    loadOjtAccounts();
  }

  // Expose global methods for inline HTML onclick handlers
  global.ojtManager = {
    openAddModal,
    openEditModal,
    openResetPasswordModal,
    openDeactivateModal,
    openActivateModal,
    openCredentialModal,
    setFilter,
    clearFilters,
    refresh: loadOjtAccounts,
    getDerivedStatus: getOjtDerivedStatus
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOjtPage);
  } else {
    initOjtPage();
  }
})(window);
