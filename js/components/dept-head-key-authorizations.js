/* ================================================================
   LabSync – Department Head Key Authorizations Quick-Review Dropdown
   File: js/components/dept-head-key-authorizations.js
   Accessible on all Department Head pages beside the notification bell
   ================================================================ */

'use strict';

(function (global) {
  let _isPollingInitialized = false;
  let _currentFilter = 'pending';
  let _currentPendingRequests = [];
  let _currentApprovedRequests = [];

  function escapeText(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime12h(timeStr) {
    if (!timeStr) return '';
    try {
      const parts = String(timeStr).split(':');
      let h = parseInt(parts[0], 10);
      const m = parts[1] || '00';
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return `${h}:${m} ${ampm}`;
    } catch (e) {
      return timeStr;
    }
  }

  /**
   * Sets the active key request filter ('pending', 'approved', 'all').
   */
  function setKeyRequestsFilter(filter) {
    _currentFilter = (filter || 'pending').toLowerCase();
    const group = document.getElementById('keyRequestsFilterGroup');
    if (group) {
      const btns = group.querySelectorAll('.key-filter-btn');
      btns.forEach(btn => {
        const isMatch = (btn.getAttribute('data-filter') || '').toLowerCase() === _currentFilter;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
      });
    }
    renderDropdownContent();
  }

  /**
   * Ensures the header button and dropdown menu are mounted into .header-right
   * across any page accessed by an IT Department Head.
   */
  function ensureHeaderElementsMounted() {
    let user = null;
    try {
      const rawUser = JSON.parse(sessionStorage.getItem('labsync_user') || localStorage.getItem('user') || 'null');
      user = (rawUser && (rawUser.user || rawUser)) || null;
    } catch (e) {}

    // Only mount for IT Dept Head (Super Admin) - Program Coordinator is excluded
    const role = user ? (user.role || user.Role || '') : '';
    const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
    const isAuthorized = itHeadAliases.includes(role) || (role.toLowerCase().includes('head') && !role.toLowerCase().includes('coordinator'));
    if (!isAuthorized) {
      const existingBtn = document.getElementById('btnHeaderKeyRequests');
      if (existingBtn) existingBtn.remove();
      const existingMenu = document.getElementById('key-requests-menu');
      if (existingMenu) existingMenu.remove();
      return null;
    }

    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return null;

    let btn = document.getElementById('btnHeaderKeyRequests');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'header-key-requests-btn';
      btn.id = 'btnHeaderKeyRequests';
      btn.title = 'Key Authorization Requests';
      btn.setAttribute('aria-label', 'Key Authorization Requests');
      btn.setAttribute('aria-haspopup', 'true');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          class="lucide lucide-key-round" data-lucide="key-round">
          <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
          <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
        </svg>
        <span class="key-requests-btn-label">Key Requests</span>
        <span class="key-requests-btn-badge" id="headerKeyRequestsBadge" style="display: none;">0</span>
      `;

      // Insert right before notif-btn or profile-dropdown
      const notifBtn = headerRight.querySelector('.notif-btn');
      if (notifBtn) {
        headerRight.insertBefore(btn, notifBtn);
      } else {
        headerRight.prepend(btn);
      }
    } else {
      if (!btn.classList.contains('header-key-requests-btn')) {
        btn.classList.remove('notif-btn');
        btn.classList.remove('key-requests-btn');
        btn.classList.add('header-key-requests-btn');
      }
      if (!btn.querySelector('#headerKeyRequestsBadge')) {
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="lucide lucide-key-round" data-lucide="key-round">
            <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
            <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
          </svg>
          <span class="key-requests-btn-label">Key Requests</span>
          <span class="key-requests-btn-badge" id="headerKeyRequestsBadge" style="display: none;">0</span>
        `;
      }

      // Immediately restore cached pending state from sessionStorage to eliminate any visual flicker/glitch on navigation
      try {
        const cachedCount = parseInt(sessionStorage.getItem('labsync_dept_head_pending_key_count') || '0', 10);
        const badge = btn.querySelector('#headerKeyRequestsBadge') || document.getElementById('headerKeyRequestsBadge');
        if (cachedCount > 0) {
          if (!btn.classList.contains('has-pending')) btn.classList.add('has-pending');
          btn.setAttribute('title', `${cachedCount} pending key authorization request${cachedCount > 1 ? 's' : ''}`);
          if (badge) {
            if (badge.style.display !== 'inline-flex') badge.style.display = 'inline-flex';
            if (badge.textContent !== String(cachedCount)) badge.textContent = String(cachedCount);
          }
          const countPill = document.getElementById('keyRequestsDropdownCount');
          if (countPill && countPill.textContent !== `${cachedCount} Pending`) {
            countPill.textContent = `${cachedCount} Pending`;
          }
        }
      } catch (e) {}
    }

    if (btn && !btn.dataset.hasKeyAuthListener) {
      btn.dataset.hasKeyAuthListener = 'true';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleKeyRequestsDropdown();
      });
    }

    let menu = document.getElementById('key-requests-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'key-requests-menu';
      menu.className = 'notif-menu key-requests-menu';
      menu.style.display = 'none';
      menu.innerHTML = `
        <div class="notif-header key-requests-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="lucide lucide-key-round" data-lucide="key-round" style="color: #D97706;">
              <path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" />
              <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
            </svg>
            <span class="notif-header-title">Key Authorizations</span>
          </div>
          <span class="key-requests-count-pill" id="keyRequestsDropdownCount">0 Pending</span>
        </div>
        <div class="key-requests-filter-bar" id="keyRequestsFilterBar">
          <div class="key-requests-filter-group" id="keyRequestsFilterGroup" role="tablist" aria-label="Key Request Filters">
            <button type="button" class="key-filter-btn active" data-filter="pending" id="keyFilterPendingBtn" role="tab" aria-selected="true" aria-label="Pending key requests">
              <i data-lucide="clock" class="filter-tab-icon"></i>
              <span>Pending</span>
              <span class="key-filter-count" id="keyFilterPendingCount" style="display: none;">0</span>
            </button>
            <button type="button" class="key-filter-btn" data-filter="approved" id="keyFilterApprovedBtn" role="tab" aria-selected="false" aria-label="Approved key requests">
              <i data-lucide="check-circle-2" class="filter-tab-icon"></i>
              <span>Approved</span>
              <span class="key-filter-count" id="keyFilterApprovedCount" style="display: none;">0</span>
            </button>
            <button type="button" class="key-filter-btn" data-filter="all" id="keyFilterAllBtn" role="tab" aria-selected="false" aria-label="All key requests">
              <i data-lucide="layers" class="filter-tab-icon"></i>
              <span>All</span>
              <span class="key-filter-count" id="keyFilterAllCount" style="display: none;">0</span>
            </button>
          </div>
        </div>
        <div class="key-requests-dropdown-list" id="keyRequestsDropdownList">
          <div class="key-requests-empty-state">
            <i data-lucide="check-check"></i>
            <p>No pending key requests</p>
          </div>
        </div>
      `;
      headerRight.appendChild(menu);
    } else {
      // Ensure filter bar exists inside existing static menu
      if (!menu.querySelector('#keyRequestsFilterBar') && !menu.querySelector('.key-requests-filter-bar')) {
        const filterBar = document.createElement('div');
        filterBar.className = 'key-requests-filter-bar';
        filterBar.id = 'keyRequestsFilterBar';
        filterBar.innerHTML = `
          <div class="key-requests-filter-group" id="keyRequestsFilterGroup" role="tablist" aria-label="Key Request Filters">
            <button type="button" class="key-filter-btn active" data-filter="pending" id="keyFilterPendingBtn" role="tab" aria-selected="true" aria-label="Pending key requests">
              <i data-lucide="clock" class="filter-tab-icon"></i>
              <span>Pending</span>
              <span class="key-filter-count" id="keyFilterPendingCount" style="display: none;">0</span>
            </button>
            <button type="button" class="key-filter-btn" data-filter="approved" id="keyFilterApprovedBtn" role="tab" aria-selected="false" aria-label="Approved key requests">
              <i data-lucide="check-circle-2" class="filter-tab-icon"></i>
              <span>Approved</span>
              <span class="key-filter-count" id="keyFilterApprovedCount" style="display: none;">0</span>
            </button>
            <button type="button" class="key-filter-btn" data-filter="all" id="keyFilterAllBtn" role="tab" aria-selected="false" aria-label="All key requests">
              <i data-lucide="layers" class="filter-tab-icon"></i>
              <span>All</span>
              <span class="key-filter-count" id="keyFilterAllCount" style="display: none;">0</span>
            </button>
          </div>
        `;
        const listEl = menu.querySelector('#keyRequestsDropdownList');
        if (listEl) {
          menu.insertBefore(filterBar, listEl);
        } else {
          menu.appendChild(filterBar);
        }
      }
    }

    // Attach click listeners to filter buttons
    const filterGroup = menu.querySelector('#keyRequestsFilterGroup');
    if (filterGroup && !filterGroup.dataset.hasFilterListener) {
      filterGroup.dataset.hasFilterListener = 'true';
      filterGroup.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('.key-filter-btn');
        if (!filterBtn) return;
        e.stopPropagation();
        const targetFilter = filterBtn.getAttribute('data-filter');
        if (targetFilter) {
          setKeyRequestsFilter(targetFilter);
        }
      });
    }

    return { btn, menu };
  }

  /**
   * Toggles Key Authorizations dropdown menu visibility.
   */
  function toggleKeyRequestsDropdown(show) {
    const menu = document.getElementById('key-requests-menu');
    if (!menu) return;

    const isCurrentlyOpen = menu.style.display !== 'none';
    const willOpen = typeof show === 'boolean' ? show : !isCurrentlyOpen;

    const btn = document.getElementById('btnHeaderKeyRequests');
    if (btn) {
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }

    if (willOpen) {
      // Close other header menus
      const notifMenu = document.getElementById('notif-menu');
      if (notifMenu) notifMenu.style.display = 'none';

      const profileMenu = document.getElementById('profile-menu');
      if (profileMenu) profileMenu.style.display = 'none';

      const profileDropdown = document.querySelector('.profile-menu-dropdown');
      if (profileDropdown) profileDropdown.classList.remove('active');

      menu.style.display = 'block';

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: menu });
      }

      // Immediately refresh records when dropdown opens
      if (typeof loadPendingKeyAuthorizations === 'function') {
        loadPendingKeyAuthorizations().catch(() => {});
      }
    } else {
      menu.style.display = 'none';
    }
  }

  /**
   * Attaches approve and decline handlers to pending cards in the list.
   */
  function attachPendingCardHandlers(list) {
    if (!list) return;

    // Attach Approve Handlers
    list.querySelectorAll('.btn-pending-approve').forEach(btnApprove => {
      btnApprove.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reqId = btnApprove.getAttribute('data-id');
        btnApprove.disabled = true;
        btnApprove.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:13px;height:13px;"></i> Approving...';
        try {
          const resp = await fetch(`/api/keys/requests/${reqId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({})
          });
          const resJson = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(resJson.error || 'Failed to approve');

          if (typeof window.showToast === 'function') {
            window.showToast('Reservation approved successfully!', 'success');
          }
          await loadPendingKeyAuthorizations();
        } catch (err) {
          if (typeof window.showToast === 'function') {
            window.showToast(err.message || 'Approval failed', 'error');
          } else {
            alert(err.message || 'Approval failed');
          }
          btnApprove.disabled = false;
          btnApprove.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;"></i> Approve';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: btnApprove });
          }
        }
      });
    });

    // Attach Decline Handlers
    list.querySelectorAll('.btn-pending-decline').forEach(btnDecline => {
      btnDecline.addEventListener('click', (e) => {
        e.stopPropagation();
        const reqId = Number(btnDecline.getAttribute('data-id'));
        const req = _currentPendingRequests.find(r => Number(r.Request_ID) === reqId) || {
          Request_ID: reqId,
          Requested_Room_Number: btnDecline.getAttribute('data-room') || 'Unknown',
          Requester_Name: btnDecline.getAttribute('data-requester') || 'Faculty',
          Requester_Role: btnDecline.getAttribute('data-role') || 'Faculty'
        };
        toggleKeyRequestsDropdown(false);
        openDeclineKeyRequestModal(req);
      });
    });
  }

  /**
   * Renders the request list according to the active filter ('pending', 'approved', 'all').
   */
  function renderDropdownContent() {
    const list = document.getElementById('keyRequestsDropdownList');
    if (!list) return;

    const countPill = document.getElementById('keyRequestsDropdownCount');
    const pendingCount = _currentPendingRequests.length;
    const approvedCount = _currentApprovedRequests.length;
    const totalCount = pendingCount + approvedCount;

    if (countPill) {
      let targetText = `${pendingCount} Pending`;
      if (_currentFilter === 'approved') {
        targetText = `${approvedCount} Approved`;
      } else if (_currentFilter === 'all') {
        targetText = `${totalCount} Total`;
      }
      if (countPill.textContent !== targetText) {
        countPill.textContent = targetText;
      }
    }

    let itemsToRender = [];
    if (_currentFilter === 'approved') {
      itemsToRender = _currentApprovedRequests;
    } else if (_currentFilter === 'all') {
      itemsToRender = [..._currentPendingRequests, ..._currentApprovedRequests];
    } else {
      itemsToRender = _currentPendingRequests;
    }

    const currentSignature = `${_currentFilter}:` + itemsToRender.map(r => `${r.Request_ID}:${r.Status}:${r.Updated_At || ''}:${r.Approved_At || ''}`).join('|');
    if (list.dataset.renderedSignature === currentSignature) {
      return;
    }
    list.dataset.renderedSignature = currentSignature;

    if (itemsToRender.length === 0) {
      if (_currentFilter === 'approved') {
        list.innerHTML = `
          <div class="key-requests-empty-state">
            <i data-lucide="badge-check" style="width: 26px; height: 26px; color: #10B981; margin-bottom: 6px;"></i>
            <p style="font-weight: 500; font-size: 13px;">No approved key requests</p>
            <span style="font-size: 11.5px; color: var(--text-muted, #94A3B8);">No active approved key authorizations at this time.</span>
          </div>
        `;
      } else if (_currentFilter === 'all') {
        list.innerHTML = `
          <div class="key-requests-empty-state">
            <i data-lucide="layers" style="width: 26px; height: 26px; color: #94A3B8; margin-bottom: 6px;"></i>
            <p style="font-weight: 500; font-size: 13px;">No key authorization requests</p>
            <span style="font-size: 11.5px; color: var(--text-muted, #94A3B8);">No key requests found.</span>
          </div>
        `;
      } else {
        list.innerHTML = `
          <div class="key-requests-empty-state">
            <i data-lucide="check-check" style="width: 26px; height: 26px; color: #10B981; margin-bottom: 6px;"></i>
            <p style="font-weight: 500; font-size: 13px;">No pending key requests</p>
            <span style="font-size: 11.5px; color: var(--text-muted, #94A3B8);">All faculty custody requests are resolved.</span>
          </div>
        `;
      }

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: list });
      }
      return;
    }

    list.innerHTML = itemsToRender.map(req => {
      const isApproved = String(req.Status).toUpperCase() === 'APPROVED';
      const initials = req.Requester_Name
        ? req.Requester_Name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : 'U';
      const photoHtml = req.Requester_Profile_Photo
        ? `<img src="${escapeText(req.Requester_Profile_Photo)}" alt="${escapeText(req.Requester_Name)}">`
        : initials;

      const timeStr = req.Requested_At ? new Date(req.Requested_At).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
      const heldRooms = req.Currently_Held_Rooms ? `Holding RM ${escapeText(req.Currently_Held_Rooms)}` : 'No other key held';

      let resBadgeHtml = '';
      if (req.Reservation_Date && req.Start_Time && req.End_Time) {
        const resDateParts = String(req.Reservation_Date).split('T')[0].split('-');
        const dObj = new Date(parseInt(resDateParts[0], 10), parseInt(resDateParts[1], 10) - 1, parseInt(resDateParts[2], 10));
        const dateFriendly = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const sTime = formatTime12h(req.Start_Time);
        const eTime = formatTime12h(req.End_Time);
        resBadgeHtml = `
          <div class="pending-reservation-badge" style="margin-top: 4px;">
            <i data-lucide="calendar" style="width:12px;height:12px;"></i>
            <span>${escapeText(dateFriendly)} • ${escapeText(sTime)} – ${escapeText(eTime)}</span>
          </div>
        `;
      }

      if (isApproved) {
        let approverAttribution = '';
        let approvedDateStr = '';
        if (req.Approved_At) {
          try {
            const appDate = new Date(req.Approved_At);
            approvedDateStr = appDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
              appDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          } catch (e) {}
        }

        if (req.Approver_Name) {
          approverAttribution = `Approved by ${escapeText(req.Approver_Name)}${approvedDateStr ? ` on ${escapeText(approvedDateStr)}` : ''}`;
        } else if (approvedDateStr) {
          approverAttribution = `Approved on ${escapeText(approvedDateStr)}`;
        } else {
          approverAttribution = 'Authorized by Department Head';
        }

        return `
          <div class="pending-req-card approved-req-card" data-request-id="${req.Request_ID}">
            <div class="pending-req-top">
              <div class="pending-req-avatar" style="background: linear-gradient(135deg, #10B981, #059669);">${photoHtml}</div>
              <div class="pending-req-user-info">
                <h4 class="pending-req-name">${escapeText(req.Requester_Name)}</h4>
                <p class="pending-req-role">${escapeText(req.Requester_Role || 'Faculty')}</p>
              </div>
              <span class="status-chip approved">
                <i data-lucide="check-circle" style="width:11px;height:11px;"></i> Approved
              </span>
            </div>
            ${resBadgeHtml}
            <div class="pending-req-rooms">
              <span class="pending-room-tag held">${escapeText(heldRooms)}</span>
              <span>➔</span>
              <span class="pending-room-tag requested" style="background:#ECFDF5; border-color:#A7F3D0; color:#065F46;">Authorized RM ${escapeText(req.Requested_Room_Number)}</span>
            </div>
            <div class="pending-req-reason">"${escapeText(req.Reason)}"</div>
            <div class="approved-attribution-row">
              <i data-lucide="shield-check" style="width:13px;height:13px;color:#10B981;flex-shrink:0;"></i>
              <span>${approverAttribution}</span>
            </div>
          </div>
        `;
      }

      return `
        <div class="pending-req-card" data-request-id="${req.Request_ID}">
          <div class="pending-req-top">
            <div class="pending-req-avatar">${photoHtml}</div>
            <div class="pending-req-user-info">
              <h4 class="pending-req-name">${escapeText(req.Requester_Name)}</h4>
              <p class="pending-req-role">${escapeText(req.Requester_Role || 'Faculty')}</p>
            </div>
            <span class="pending-req-time">${timeStr}</span>
          </div>
          ${resBadgeHtml}
          <div class="pending-req-rooms">
            <span class="pending-room-tag held">${escapeText(heldRooms)}</span>
            <span>➔</span>
            <span class="pending-room-tag requested">Requesting RM ${escapeText(req.Requested_Room_Number)}</span>
          </div>
          <div class="pending-req-reason">"${escapeText(req.Reason)}"</div>
          <div class="pending-req-actions">
            <button type="button" class="btn-pending-approve" data-id="${req.Request_ID}" data-room="${escapeText(req.Requested_Room_Number)}">
              <i data-lucide="check" style="width:13px;height:13px;"></i> Approve
            </button>
            <button type="button" class="btn-pending-decline" data-id="${req.Request_ID}" data-room="${escapeText(req.Requested_Room_Number)}" data-requester="${escapeText(req.Requester_Name)}" data-role="${escapeText(req.Requester_Role || 'Faculty')}">
              <i data-lucide="x" style="width:13px;height:13px;"></i> Decline
            </button>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: list });
    }

    attachPendingCardHandlers(list);
  }

  /**
   * Fetches and renders pending and approved multi-key authorization requests for Dept Head.
   */
  async function loadPendingKeyAuthorizations() {
    if (!ensureHeaderElementsMounted()) return;

    const btn = document.getElementById('btnHeaderKeyRequests');
    const badge = document.getElementById('headerKeyRequestsBadge');
    const countPill = document.getElementById('keyRequestsDropdownCount');
    const pendingFilterCount = document.getElementById('keyFilterPendingCount');
    const approvedFilterCount = document.getElementById('keyFilterApprovedCount');
    const allFilterCount = document.getElementById('keyFilterAllCount');

    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch('/api/keys/pending-requests', { credentials: 'include' }).catch(() => null),
        fetch('/api/keys/approved-requests', { credentials: 'include' }).catch(() => null)
      ]);

      if (pendingRes && pendingRes.ok) {
        const pRequests = await pendingRes.json().catch(() => []);
        _currentPendingRequests = Array.isArray(pRequests) ? pRequests : [];
      }

      if (approvedRes && approvedRes.ok) {
        const aRequests = await approvedRes.json().catch(() => []);
        _currentApprovedRequests = Array.isArray(aRequests) ? aRequests : [];
      }

      const count = _currentPendingRequests.length;
      const approvedCount = _currentApprovedRequests.length;
      const totalCount = count + approvedCount;

      // Persist count to sessionStorage cache so subsequent navigations/refreshes render instantly without flashing
      try {
        sessionStorage.setItem('labsync_dept_head_pending_key_count', String(count));
      } catch (e) {}

      // 1. Update Header Button Badge & Active State without redundant DOM mutations
      if (btn) {
        const currentlyHas = btn.classList.contains('has-pending');
        const shouldHave = count > 0;
        if (currentlyHas !== shouldHave) {
          btn.classList.toggle('has-pending', shouldHave);
        }
        btn.setAttribute('title', count > 0
          ? `${count} pending key authorization request${count > 1 ? 's' : ''}`
          : 'Key Authorization Requests');
      }
      if (badge) {
        if (count > 0) {
          if (badge.style.display !== 'inline-flex') badge.style.display = 'inline-flex';
          if (badge.textContent !== String(count)) badge.textContent = String(count);
        } else {
          if (badge.style.display !== 'none') badge.style.display = 'none';
          if (badge.textContent !== '0') badge.textContent = '0';
        }
      }

      // 2. Update Filter Count Badges
      if (pendingFilterCount) {
        pendingFilterCount.textContent = String(count);
        pendingFilterCount.style.display = count > 0 ? 'inline-flex' : 'none';
      }
      if (approvedFilterCount) {
        approvedFilterCount.textContent = String(approvedCount);
        approvedFilterCount.style.display = approvedCount > 0 ? 'inline-flex' : 'none';
      }
      if (allFilterCount) {
        allFilterCount.textContent = String(totalCount);
        allFilterCount.style.display = totalCount > 0 ? 'inline-flex' : 'none';
      }

      // 3. Update Dropdown Header Pill based on active filter
      if (countPill) {
        let targetCountPill = `${count} Pending`;
        if (_currentFilter === 'approved') {
          targetCountPill = `${approvedCount} Approved`;
        } else if (_currentFilter === 'all') {
          targetCountPill = `${totalCount} Total`;
        }
        if (countPill.textContent !== targetCountPill) {
          countPill.textContent = targetCountPill;
        }
      }

      // 4. Render Dropdown Content
      renderDropdownContent();

    } catch (e) {
      console.error('[DeptHeadKeyAuth] Error loading key authorizations:', e);
    }
  }

  /**
   * Opens custom confirmation and reason modal for declining key request.
   */
  function openDeclineKeyRequestModal(req) {
    if (!req) return;

    let overlay = document.getElementById('deptHeadDeclineKeyModalOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'deptHeadDeclineKeyModalOverlay';
      overlay.className = 'kt-modal-backdrop';
      overlay.style.display = 'none';
      document.body.appendChild(overlay);
    }

    const requesterName = req.Requester_Name || 'Faculty Member';
    const requesterRole = req.Requester_Role || 'Faculty';
    const roomNumber = req.Requested_Room_Number || 'Unknown';
    const defaultReason = 'Room is currently unavailable or reserved.';

    let resBadgeHtml = '';
    if (req.Reservation_Date && req.Start_Time && req.End_Time) {
      const resDateParts = String(req.Reservation_Date).split('T')[0].split('-');
      const dObj = new Date(parseInt(resDateParts[0], 10), parseInt(resDateParts[1], 10) - 1, parseInt(resDateParts[2], 10));
      const dateFriendly = dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const sTime = formatTime12h(req.Start_Time);
      const eTime = formatTime12h(req.End_Time);
      resBadgeHtml = `
        <div class="kt-pill-row">
          <span class="kt-pill-label">
            <i data-lucide="calendar" style="width: 13px; height: 13px;"></i>
            <span>Schedule:</span>
          </span>
          <span class="kt-pill-val kt-pill-schedule">${escapeText(dateFriendly)} • ${escapeText(sTime)} – ${escapeText(eTime)}</span>
        </div>
      `;
    }

    overlay.innerHTML = `
      <div class="kt-modal-card" style="max-width: 440px;" role="dialog" aria-modal="true" aria-labelledby="declineModalTitle">
        <div class="kt-modal-header">
          <div class="kt-modal-icon-badge danger">
            <i data-lucide="x-circle" style="width: 20px; height: 20px;"></i>
          </div>
          <div>
            <h3 class="kt-modal-title" id="declineModalTitle">Decline Key Request</h3>
            <p class="kt-modal-sub">Notify ${escapeText(requesterName)} with a justification</p>
          </div>
          <button type="button" id="btnCloseDeclineModal" class="kt-modal-close" aria-label="Close dialog">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <div class="kt-modal-body">
          <div class="kt-request-info-pill" style="margin-bottom: 12px;">
            <div class="kt-pill-row">
              <span class="kt-pill-label">
                <i data-lucide="user" style="width: 13px; height: 13px;"></i>
                <span>Requester:</span>
              </span>
              <span class="kt-pill-val" style="font-weight: 600;">${escapeText(requesterName)} <span style="font-size: 11px; font-weight: normal; color: var(--text-muted, #94A3B8);">(${escapeText(requesterRole)})</span></span>
            </div>
            <div class="kt-pill-row">
              <span class="kt-pill-label">
                <i data-lucide="key-round" style="width: 13px; height: 13px;"></i>
                <span>Target Laboratory:</span>
              </span>
              <span class="kt-pill-val" style="font-weight: 700; color: #EF4444;">Laboratory ${escapeText(roomNumber)}</span>
            </div>
            ${resBadgeHtml}
            ${req.Reason ? `
              <div class="kt-pill-row" style="align-items: flex-start; margin-top: 3px;">
                <span class="kt-pill-label" style="flex-shrink: 0;">
                  <i data-lucide="message-square" style="width: 13px; height: 13px;"></i>
                  <span>Faculty Purpose:</span>
                </span>
                <span class="kt-pill-val kt-decline-purpose-quote">"${escapeText(req.Reason)}"</span>
              </div>
            ` : ''}
          </div>

          <div class="kt-label-row">
            <label for="declineReasonInput" class="kt-input-label">Reason for Declining (Optional)</label>
            <span class="kt-char-counter" id="declineReasonCharCount" aria-live="polite">${defaultReason.length} / 150</span>
          </div>
          <textarea id="declineReasonInput" class="kt-textarea" rows="3" maxlength="150" placeholder="e.g., Room is currently unavailable or reserved.">${defaultReason}</textarea>

          <div class="kt-reason-suggestions">
            <span style="font-size: 11px; color: var(--text-muted, #94A3B8); align-self: center; margin-right: 2px;">Quick presets:</span>
            <button type="button" class="kt-reason-chip" data-preset="Room is currently unavailable or reserved.">Unavailable</button>
            <button type="button" class="kt-reason-chip" data-preset="Schedule conflict with an existing class session.">Schedule Conflict</button>
            <button type="button" class="kt-reason-chip" data-preset="Laboratory undergoing scheduled maintenance.">Maintenance</button>
            <button type="button" class="kt-reason-chip" data-preset="Please consult with Department Head in person.">Consult Head</button>
          </div>
        </div>

        <div class="kt-modal-footer">
          <div class="kt-modal-footer-row">
            <button type="button" id="btnCancelDeclineModal" class="btn-modal-cancel">
              Cancel
            </button>
            <button type="button" id="btnConfirmDeclineModal" class="btn-modal-danger">
              <i data-lucide="x" style="width: 14px; height: 14px;"></i>
              <span>Decline Request</span>
            </button>
          </div>
        </div>
      </div>
    `;

    overlay.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: overlay });
    }

    const textarea = overlay.querySelector('#declineReasonInput');
    const charCounter = overlay.querySelector('#declineReasonCharCount');
    const btnConfirm = overlay.querySelector('#btnConfirmDeclineModal');
    const btnCancel = overlay.querySelector('#btnCancelDeclineModal');
    const btnClose = overlay.querySelector('#btnCloseDeclineModal');

    function updateCounter() {
      if (!textarea || !charCounter) return;
      const len = textarea.value.length;
      charCounter.textContent = `${len} / 150`;
      charCounter.classList.toggle('counter-warning', len >= 135 && len < 150);
      charCounter.classList.toggle('counter-limit', len >= 150);
    }

    if (textarea) {
      textarea.addEventListener('input', updateCounter);
      setTimeout(() => {
        textarea.focus();
        textarea.select();
      }, 50);
    }

    overlay.querySelectorAll('.kt-reason-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-preset');
        if (textarea && text) {
          textarea.value = text;
          updateCounter();
          textarea.focus();
        }
      });
    });

    function closeDeclineModal() {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
    }

    if (btnCancel) btnCancel.addEventListener('click', closeDeclineModal);
    if (btnClose) btnClose.addEventListener('click', closeDeclineModal);

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        closeDeclineModal();
      }
    };

    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        const finalReason = textarea ? textarea.value.trim() : '';
        btnConfirm.disabled = true;
        if (btnCancel) btnCancel.disabled = true;
        btnConfirm.innerHTML = '<i data-lucide="loader-2" class="animate-spin" style="width:14px;height:14px;"></i> <span>Declining...</span>';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: btnConfirm });
        }

        try {
          const resp = await fetch(`/api/keys/requests/${req.Request_ID}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ reason: finalReason || 'Declined by Department Head.' })
          });
          const resJson = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(resJson.error || 'Failed to decline');

          closeDeclineModal();
          if (typeof window.showToast === 'function') {
            window.showToast(`Request for Room ${escapeText(roomNumber)} declined.`, 'info');
          }
          await loadPendingKeyAuthorizations();
        } catch (err) {
          if (typeof window.showToast === 'function') {
            window.showToast(err.message || 'Decline failed', 'error');
          } else {
            alert(err.message || 'Decline failed');
          }
          btnConfirm.disabled = false;
          if (btnCancel) btnCancel.disabled = false;
          btnConfirm.innerHTML = '<i data-lucide="x" style="width:14px;height:14px;"></i> <span>Decline Request</span>';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: btnConfirm });
          }
        }
      });
    }
  }

  function initDeptHeadKeyAuthorizations() {
    if (!ensureHeaderElementsMounted()) return;

    // Close on outside click (capture phase ensures it runs even when other elements call stopPropagation)
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('key-requests-menu');
      const trigger = document.getElementById('btnHeaderKeyRequests');
      if (menu && menu.style.display !== 'none') {
        if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
          menu.style.display = 'none';
          if (trigger) trigger.setAttribute('aria-expanded', 'false');
        }
      }
    }, true);

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const declineOverlay = document.getElementById('deptHeadDeclineKeyModalOverlay');
        if (declineOverlay && declineOverlay.style.display !== 'none') {
          declineOverlay.style.display = 'none';
          declineOverlay.innerHTML = '';
          return;
        }
        toggleKeyRequestsDropdown(false);
      }
    });

    loadPendingKeyAuthorizations();

    if (!_isPollingInitialized) {
      _isPollingInitialized = true;
      setInterval(loadPendingKeyAuthorizations, 8000);
    }
  }

  // Expose globally
  global.loadPendingKeyAuthorizations = loadPendingKeyAuthorizations;
  global.loadKeyAuthorizations = loadPendingKeyAuthorizations;
  global.setKeyRequestsFilter = setKeyRequestsFilter;
  global.toggleKeyRequestsDropdown = toggleKeyRequestsDropdown;
  global.initDeptHeadKeyAuthorizations = initDeptHeadKeyAuthorizations;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDeptHeadKeyAuthorizations);
  } else {
    initDeptHeadKeyAuthorizations();
  }

})(typeof window !== 'undefined' ? window : this);
