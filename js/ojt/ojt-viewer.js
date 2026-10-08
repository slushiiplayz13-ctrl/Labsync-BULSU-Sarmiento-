/* ================================================================
   LabSync – OJT Interns Directory Viewer | js/ojt/ojt-viewer.js
   Provides read-only roster browsing and inspection for Dept Heads.
   ================================================================ */

'use strict';

(function (global) {
  let _allOjts = [];
  let _activeFilter = 'ALL'; // 'ALL' | 'ACTIVE' | 'INACTIVE'
  let _searchQuery = '';
  let _hasLoadedOnce = false;

  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getInitials(name) {
    if (!name) return 'OJ';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatOjtDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return '—';
    }
  }

  function getDaysRemaining(endDateStr) {
    if (!endDateStr) return null;
    try {
      const end = new Date(endDateStr);
      if (isNaN(end.getTime())) return null;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const diffTime = end.getTime() - today.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch (e) {
      return null;
    }
  }

  function getDerivedStatus(u) {
    if (u.Status === 'DEACTIVATED' || u.status === 'DEACTIVATED' || u.status === 'Inactive') {
      return 'DEACTIVATED';
    }
    const daysLeft = getDaysRemaining(u.OJT_End_Date || u.endDate);
    if (daysLeft !== null && daysLeft < 0) {
      return 'EXPIRED';
    }
    return 'ACTIVE';
  }

  /**
   * Fetches OJT list from server and renders directory.
   */
  async function loadOjts() {
    const container = document.getElementById('ojt-directory-container');
    if (!container) return;

    if (!_hasLoadedOnce) {
      container.innerHTML = `
        <div style="padding:40px 20px;text-align:center;color:var(--text-light);">
          <div class="sched-spinner" style="width:28px;height:28px;border:3px solid var(--border-light);border-top-color:var(--primary-teal);border-radius:50%;margin:0 auto 12px auto;"></div>
          <p style="font-size:13.5px;margin:0;">Loading OJT intern directory...</p>
        </div>
      `;
    }

    try {
      const res = await fetch('/api/ojt', {
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      _allOjts = Array.isArray(data) ? data : [];
      _hasLoadedOnce = true;

      renderDirectory();
    } catch (err) {
      console.error('[OJT Viewer] Error loading records:', err);
      const isForbidden = err.message && err.message.includes('403');
      container.innerHTML = `
        <div class="ojt-empty-state">
          <div class="ojt-empty-icon" style="background:#FEE2E2;color:#EF4444;">
            <i data-lucide="alert-circle" style="width:24px;height:24px;"></i>
          </div>
          <p style="margin:0 0 6px 0;font-weight:600;color:var(--text-dark);">Failed to Load OJT Interns</p>
          <p style="margin:0 0 14px 0;font-size:12.5px;color:var(--text-mid);max-width:440px;margin-left:auto;margin-right:auto;line-height:1.45;">
            ${isForbidden 
              ? 'The backend server was running prior to route permission updates. Please restart the backend server (<code style="background:var(--bg-card);padding:2px 6px;border-radius:4px;border:1px solid var(--border-light);font-family:monospace;">npm start</code>) to load the new permissions.' 
              : 'Please refresh the page or ensure the server connection is active.'}
          </p>
          <button type="button" id="ojt-retry-btn" class="ojt-filter-btn" style="background:var(--primary-teal);color:#fff;border-color:transparent;display:inline-flex;align-items:center;gap:6px;padding:8px 18px;cursor:pointer;margin:0 auto;box-shadow:0 2px 6px rgba(30,187,215,0.25);">
            <i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Retry Connection
          </button>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }
      container.querySelector('#ojt-retry-btn')?.addEventListener('click', () => {
        _hasLoadedOnce = false;
        loadOjts();
      });
    }
  }

  /**
   * Renders the directory table based on active filter and search terms.
   */
  function renderDirectory() {
    const container = document.getElementById('ojt-directory-container');
    if (!container) return;

    const filtered = _allOjts.filter(u => {
      const status = getDerivedStatus(u);

      if (_activeFilter === 'ACTIVE' && status !== 'ACTIVE') return false;
      if (_activeFilter === 'INACTIVE' && status === 'ACTIVE') return false;

      if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        const name = String(u.Name || '').toLowerCase();
        const email = String(u.Email || '').toLowerCase();
        const phone = String(u.Phone || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q)) {
          return false;
        }
      }

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="ojt-empty-state">
          <div class="ojt-empty-icon">
            <i data-lucide="users" style="width:24px;height:24px;"></i>
          </div>
          <p style="margin:0 0 4px 0;font-weight:600;color:var(--text-dark);">No OJT Interns Found</p>
          <p style="margin:0;font-size:12.5px;color:var(--text-mid);">
            ${_searchQuery ? 'No records match your search criteria.' : 'No OJT interns are currently registered in this category.'}
          </p>
        </div>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }
      return;
    }

    let rowsHtml = '';
    filtered.forEach(u => {
      const name = u.Name || 'Unnamed Intern';
      const email = u.Email || 'No email';
      const phone = u.Phone || '—';
      const rawStart = u.OJT_Start_Date || u.startDate;
      const rawEnd = u.OJT_End_Date || u.endDate;
      const startDisplay = formatOjtDate(rawStart);
      const endDisplay = formatOjtDate(rawEnd);
      const status = getDerivedStatus(u);
      const daysLeft = getDaysRemaining(rawEnd);
      const initials = getInitials(name);

      const isSafePhoto = typeof u.Profile_Photo === 'string' &&
        /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(u.Profile_Photo.trim());

      const avatarHtml = isSafePhoto
        ? `<img src="${escapeHtml(u.Profile_Photo)}" alt="${escapeHtml(name)}">`
        : escapeHtml(initials);

      // Status pill
      let statusBadge = '';
      if (status === 'ACTIVE') {
        if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 7) {
          statusBadge = `
            <span class="mis-badge-active" style="background:#FEF3C7;color:#D97706;border-color:#FDE68A;">
              <span class="mis-badge-dot" style="background:#F59E0B;"></span> Expiring Soon
            </span>
          `;
        } else {
          statusBadge = `
            <span class="mis-badge-active">
              <span class="mis-badge-dot"></span> Active
            </span>
          `;
        }
      } else if (status === 'EXPIRED') {
        statusBadge = `
          <span class="mis-badge-deact" style="background:rgba(245,158,11,0.1);color:#D97706;border-color:rgba(245,158,11,0.3);">
            <i data-lucide="calendar-x" style="width:11px;height:11px;"></i> Concluded
          </span>
        `;
      } else {
        statusBadge = `
          <span class="mis-badge-deact">
            Deactivated
          </span>
        `;
      }

      // Period meta
      let periodSub = '';
      if (status === 'ACTIVE') {
        if (daysLeft !== null) {
          if (daysLeft === 0) {
            periodSub = '<span class="ojt-period-sub" style="color:#D97706;"><i data-lucide="clock" style="width:11px;height:11px;"></i> Last Day Today</span>';
          } else if (daysLeft <= 7) {
            periodSub = `<span class="ojt-period-sub" style="color:#D97706;"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining</span>`;
          } else {
            periodSub = `<span class="ojt-period-sub" style="color:#059669;"><i data-lucide="calendar" style="width:11px;height:11px;"></i> ${daysLeft} days remaining</span>`;
          }
        }
      } else if (status === 'EXPIRED') {
        periodSub = '<span class="ojt-period-sub" style="color:#D97706;"><i data-lucide="check-circle" style="width:11px;height:11px;"></i> Term Completed</span>';
      } else {
        periodSub = '<span class="ojt-period-sub" style="color:var(--text-light);"><i data-lucide="slash" style="width:11px;height:11px;"></i> Inactive</span>';
      }

      rowsHtml += `
        <tr data-user-id="${u.User_ID}">
          <td>
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="ojt-roster-avatar">
                ${avatarHtml}
              </div>
              <div>
                <div style="font-weight:600;color:var(--text-dark);font-size:13.5px;line-height:1.3;">
                  ${escapeHtml(name)}
                </div>
                <div style="font-size:11.5px;color:var(--text-light);display:flex;align-items:center;gap:4px;margin-top:2px;">
                  <i data-lucide="graduation-cap" style="width:12px;height:12px;color:var(--primary-teal);"></i> OJT Intern
                </div>
              </div>
            </div>
          </td>
          <td>
            <div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dark);">
              <i data-lucide="mail" style="width:14px;height:14px;color:var(--primary-teal);flex-shrink:0;"></i>
              <span style="font-weight:500;">${escapeHtml(email)}</span>
            </div>
          </td>
          <td>
            <span style="font-size:13px;color:var(--text-mid);">${escapeHtml(phone)}</span>
          </td>
          <td>
            <div class="ojt-period-cell">
              <span class="ojt-period-dates">${escapeHtml(startDisplay)} &rarr; ${escapeHtml(endDisplay)}</span>
              ${periodSub}
            </div>
          </td>
          <td>
            ${statusBadge}
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="ojt-roster-wrapper">
        <table class="ojt-roster-table">
          <thead>
            <tr>
              <th>Intern Account</th>
              <th>Official Email</th>
              <th>Contact Number</th>
              <th>Internship Period</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: container });
    }
  }

  /**
   * Modal: Displays Read-Only OJT details for Dept Head inspection.
   */
  function showOjtDetailsModal(intern) {
    if (!intern) return;
    const existing = document.getElementById('ojt-details-modal');
    if (existing) existing.remove();

    const name = intern.Name || 'Unnamed Intern';
    const email = intern.Email || 'No email';
    const phone = intern.Phone || 'Not specified';
    const rawStart = intern.OJT_Start_Date || intern.startDate;
    const rawEnd = intern.OJT_End_Date || intern.endDate;
    const startDisplay = formatOjtDate(rawStart);
    const endDisplay = formatOjtDate(rawEnd);
    const daysLeft = getDaysRemaining(rawEnd);
    const status = getDerivedStatus(intern);
    const initials = getInitials(name);

    const isSafePhoto = typeof intern.Profile_Photo === 'string' &&
      /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(intern.Profile_Photo.trim());

    const avatarHtml = isSafePhoto
      ? `<img src="${escapeHtml(intern.Profile_Photo)}" alt="${escapeHtml(name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
      : escapeHtml(initials);

    let statusPill = '';
    if (status === 'ACTIVE') {
      statusPill = '<span class="mis-badge-active"><span class="mis-badge-dot"></span> Active Intern</span>';
    } else if (status === 'EXPIRED') {
      statusPill = '<span class="mis-badge-deact" style="background:rgba(245,158,11,0.12);color:#D97706;border-color:rgba(245,158,11,0.3);"><i data-lucide="calendar-x" style="width:11px;height:11px;"></i> Internship Concluded</span>';
    } else {
      statusPill = '<span class="mis-badge-deact">Deactivated Record</span>';
    }

    const modal = document.createElement('div');
    modal.id = 'ojt-details-modal';
    modal.className = 'mis-modal-overlay';

    modal.innerHTML = `
      <div class="mis-modal-dialog" style="max-width:520px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
              <h2 style="font-family:var(--font-display);font-size:19px;font-weight:700;color:var(--text-dark);margin:0;">OJT Intern Profile</h2>
              <span class="ojt-badge-readonly">Read-Only</span>
            </div>
            <p style="font-size:12.5px;color:var(--text-light);margin:0;">OJT Intern technical operations account</p>
          </div>
          <button id="close-ojt-details" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
          </button>
        </div>

        <!-- Identity Banner -->
        <div style="display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-page);border:1px solid var(--border-light);border-radius:14px;margin-bottom:18px;">
          <div class="ojt-roster-avatar" style="width:54px;height:54px;font-size:18px;">
            ${avatarHtml}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
              <h3 style="font-family:var(--font-display);font-size:17px;font-weight:700;color:var(--text-dark);margin:0;">${escapeHtml(name)}</h3>
              ${statusPill}
            </div>
            <div style="font-size:12px;color:var(--primary-teal);font-weight:600;display:flex;align-items:center;gap:4px;">
              <i data-lucide="graduation-cap" style="width:13px;height:13px;"></i> OJT Intern
            </div>
          </div>
        </div>

        <!-- Bento Grid Details -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:18px;">
          <div class="mis-contact-card" style="padding:12px 14px;">
            <div class="mis-contact-icon-wrap email-wrap" style="width:34px;height:34px;">
              <i data-lucide="mail" style="width:16px;height:16px;"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Official Email</span>
              <span class="mis-contact-val" style="font-size:13px;" title="${escapeHtml(email)}">${escapeHtml(email)}</span>
            </div>
          </div>

          <div class="mis-contact-card" style="padding:12px 14px;">
            <div class="mis-contact-icon-wrap phone-wrap" style="width:34px;height:34px;">
              <i data-lucide="phone" style="width:16px;height:16px;"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Contact Number</span>
              <span class="mis-contact-val" style="font-size:13px;">${escapeHtml(phone)}</span>
            </div>
          </div>

          <div class="mis-contact-card" style="padding:12px 14px;">
            <div class="mis-contact-icon-wrap" style="width:34px;height:34px;background:rgba(245,158,11,0.1);color:#D97706;">
              <i data-lucide="calendar" style="width:16px;height:16px;"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Internship Start</span>
              <span class="mis-contact-val" style="font-size:13px;">${escapeHtml(startDisplay)}</span>
            </div>
          </div>

          <div class="mis-contact-card" style="padding:12px 14px;">
            <div class="mis-contact-icon-wrap" style="width:34px;height:34px;background:rgba(16,185,129,0.1);color:#10B981;">
              <i data-lucide="calendar-check" style="width:16px;height:16px;"></i>
            </div>
            <div class="mis-contact-info">
              <span class="mis-contact-label">Internship End</span>
              <span class="mis-contact-val" style="font-size:13px;">${escapeHtml(endDisplay)}</span>
            </div>
          </div>
        </div>

        <!-- Managed Exclusively by MIS Notice -->
        <div class="mis-info-callout" style="margin-bottom:20px;">
          <i data-lucide="shield-check" style="width:16px;height:16px;color:var(--primary-teal);flex-shrink:0;margin-top:2px;"></i>
          <p style="margin:0;font-size:12.5px;color:var(--text-dark);line-height:1.45;">
            <strong>Custody &amp; Administration:</strong> OJT accounts and credentials are administered exclusively by the designated <strong>MIS Staff</strong> member. Department Heads maintain viewing directory access.
          </p>
        </div>

        <div>
          <button type="button" id="done-ojt-details" style="width:100%;padding:11px;border:none;background:var(--primary-teal);color:#fff;border-radius:9px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:var(--font-body);box-shadow:0 4px 12px rgba(30,187,215,0.25);">
            Done
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    const closeModal = () => modal.remove();
    modal.querySelector('#close-ojt-details')?.addEventListener('click', closeModal);
    modal.querySelector('#done-ojt-details')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  function initListeners() {
    const filterBtns = document.querySelectorAll('[data-ojt-filter]');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeFilter = btn.getAttribute('data-ojt-filter');
        renderDirectory();
      });
    });

    const searchInput = document.getElementById('ojt-directory-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _searchQuery = e.target.value.trim();
        renderDirectory();
      });
    }
  }

  // Initialize event listeners when DOM is loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initListeners);
  } else {
    initListeners();
  }

  global.ojtViewer = {
    loadOjts,
    showOjtDetailsModal
  };

})(typeof window !== 'undefined' ? window : this);
