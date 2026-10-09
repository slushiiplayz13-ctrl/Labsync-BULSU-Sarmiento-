/**
 * IT Head Room Status Page Controller
 * LabSync - Phase 6A-07J-A
 *
 * Encapsulates room status overview grid, occupancy activity logs with data fingerprinting,
 * and sidebar scroll clue interactions.
 */

(function () {
  'use strict';

  const escapeHtml = (typeof window !== 'undefined' && typeof window.escapeHtml === 'function')
    ? window.escapeHtml
    : function (str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

  // State fingerprint to avoid unnecessary re-renders
  let _inlineActivityLogLastKey = '';
  let _itHeadRequestId = 0;
  let _itHeadFirstLoad = true;

  // Sidebar scroll clue
  function initSidebarScrollClue() {
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');

    if (sidebar && scrollClue) {
      if (sidebar.scrollHeight <= sidebar.clientHeight) {
        scrollClue.style.display = 'none';
      }
      sidebar.addEventListener('scroll', () => {
        if (sidebar.scrollTop > 10) {
          scrollClue.style.opacity = '0';
        } else {
          scrollClue.style.opacity = '1';
        }
      });
    }
  }

  /**
   * Formats a date string into human-readable relative time.
   * @param {string} dateString
   * @returns {string}
   */
  function getRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Just now';
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  }

  /**
   * Normalizes, deterministically sorts, and deduplicates activity logs.
   * @param {Array} rawLogs
   * @returns {Array}
   */
  function processOccupancyLogs(rawLogs) {
    if (!Array.isArray(rawLogs)) return [];

    // Filter only meaningful room key custody & hardware security events (exclude intermediate QR scan events)
    const occupancyOnly = rawLogs.filter(item => {
      if (!item) return false;
      const status = String(item.status || '').trim().toLowerCase();
      if (status === 'qr code' || status === 'qr verified' || status === 'qr' || status.includes('qr verified')) {
        return false;
      }
      return (item.type === 'occupancy' || (!item.type && item.status && item.status !== 'Pending' && item.status !== 'In Progress' && item.status !== 'Resolved'));
    });

    // Deterministic sort: Newest timestamp first; stable tie-breaker: highest record ID first
    const sorted = [...occupancyOnly].sort((a, b) => {
      const timeA = new Date(a.time || 0).getTime();
      const timeB = new Date(b.time || 0).getTime();
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

    // Deduplicate by stable identifier
    const seenIds = new Set();
    const deduped = [];
    for (const log of sorted) {
      const idKey = log.id != null ? String(log.id) : null;
      if (idKey) {
        if (seenIds.has(idKey)) continue;
        seenIds.add(idKey);
      }
      deduped.push(log);
    }

    return deduped;
  }

  // Load room status & activity logs concurrently with instant SWR cache
  async function loadRoomStatusAndLogs() {
    // 1. Instant SWR pre-render from cache ONLY on initial first load
    if (_itHeadFirstLoad) {
      try {
        const cachedRooms = JSON.parse(sessionStorage.getItem('labsync_cached_labs') || 'null');
        if (Array.isArray(cachedRooms) && cachedRooms.length > 0) {
          renderRoomStatusGrid(cachedRooms);
        }
        const cachedNotifs = JSON.parse(sessionStorage.getItem('labsync_cached_activities') || 'null');
        if (Array.isArray(cachedNotifs) && cachedNotifs.length > 0) {
          renderActivityLogList(cachedNotifs);
        }
      } catch (e) {}
    }

    const currentReqId = ++_itHeadRequestId;

    try {
      const fetchLabsFn = window.fetchLaboratories || (window.laboratoryService && window.laboratoryService.fetchLaboratories);
      const roomsPromise = typeof fetchLabsFn === 'function'
        ? fetchLabsFn().catch(() => [])
        : fetch('/api/laboratories', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []);

      const fetchTimelineFn = window.fetchTimelineActivities || (window.notificationService && window.notificationService.fetchTimelineActivities);
      const notifsPromise = typeof fetchTimelineFn === 'function'
        ? fetchTimelineFn().then(n => n || []).catch(() => [])
        : ((window.fetchNotifications || (window.notificationService && window.notificationService.fetchNotifications))
          ? (window.fetchNotifications || window.notificationService.fetchNotifications)({ scope: 'timeline' }).then(n => n || []).catch(() => [])
          : Promise.resolve([]));

      const [rooms, notifs] = await Promise.all([roomsPromise, notifsPromise]);

      // Discard stale out-of-order response if another request completed
      if (currentReqId !== _itHeadRequestId) return;

      if (Array.isArray(rooms) && rooms.length > 0) {
        renderRoomStatusGrid(rooms);
      }

      if (Array.isArray(notifs) && notifs.length > 0) {
        try { sessionStorage.setItem('labsync_cached_activities', JSON.stringify(notifs)); } catch (e) {}
        renderActivityLogList(notifs);
      }

      _itHeadFirstLoad = false;
    } catch (err) {
      if (currentReqId !== _itHeadRequestId) return;
      console.error('Error loading room status:', err);
    }
  }

  // Render room status cards using unified Laboratory Service design
  function renderRoomStatusGrid(rooms, targetGrid) {
    const grid = typeof targetGrid === 'string'
      ? document.querySelector(targetGrid)
      : (targetGrid || document.getElementById('ithead-room-grid'));
    if (!grid) return;

    if (window.laboratoryService && typeof window.laboratoryService.renderLabCards === 'function') {
      window.laboratoryService.renderLabCards(rooms, grid);
    } else if (typeof window.renderLabCards === 'function') {
      window.renderLabCards(rooms, grid);
    } else if (typeof renderLabCards === 'function') {
      renderLabCards(rooms, grid);
    }
  }

  // Formats date string into accessible full date and time string
  function formatExactDateTime(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString);
    const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  }

  // Derives presentation metadata for an activity log action
  function getActionPresentation(log) {
    if (window.roomStatusTimeline && typeof window.roomStatusTimeline.getActionPresentation === 'function') {
      return window.roomStatusTimeline.getActionPresentation(log);
    }
    const status = String(log.status || '').trim();
    const sessionType = String(log.session_type || '').trim();

    if (status === 'Key Returned' || status === 'KEY_RETURN' || status.toLowerCase() === 'returned') {
      return { label: 'Key Returned', actionType: 'returned', icon: 'check-circle-2' };
    }
    if (status === 'Key Taken' || status.toLowerCase() === 'taken') {
      if (sessionType === 'Borrowed') {
        return { label: 'Key Borrowed', actionType: 'borrowed', icon: 'key-round' };
      }
      return { label: 'Key Taken', actionType: 'taken', icon: 'key-round' };
    }
    if (status === 'Key Transfer' || status === 'KEY_TRANSFER' || status.toLowerCase() === 'key transferred') {
      return { label: 'Key Transferred', actionType: 'transfer', icon: 'arrow-right-left' };
    }
    if (status.toLowerCase().includes('qr') || status === 'QR Code') {
      return { label: 'QR Verified', actionType: 'qr', icon: 'qr-code' };
    }
    if (status === 'UNAUTHORIZED' || status.toLowerCase().includes('unauthorized')) {
      return { label: 'Unauthorized Key Access', actionType: 'security', icon: 'alert-triangle' };
    }
    if (status === 'WRONG_SLOT' || status.toLowerCase().includes('wrong')) {
      return { label: 'Wrong Key Slot', actionType: 'warning', icon: 'alert-triangle' };
    }
    if (status === 'Resolved') {
      return { label: 'Issue Resolved', actionType: 'resolved', icon: 'check-circle-2' };
    }
    if (status === 'In Progress') {
      return { label: 'In Progress', actionType: 'progress', icon: 'wrench' };
    }
    if (status === 'Pending') {
      return { label: 'Issue Reported', actionType: 'pending', icon: 'alert-circle' };
    }
    return { label: status || 'Activity Logged', actionType: 'neutral', icon: 'clock' };
  }

  // Render activity logs with scroll preservation & change fingerprinting
  function renderActivityLogList(notifs, targetContainer) {
    const container = typeof targetContainer === 'string'
      ? document.querySelector(targetContainer)
      : (targetContainer || document.getElementById('ithead-activity-list'));
    if (!container) return;

    // Normalize, deterministically sort, and deduplicate occupancy logs
    const occupancyOnly = processOccupancyLogs(notifs);

    // Build a data fingerprint to detect real changes
    const dataKey = occupancyOnly.length === 0
      ? '__EMPTY__'
      : occupancyOnly.map(n => `${n.id || ''}:${n.time || ''}:${n.status || ''}:${n.room_number || ''}:${n.description || ''}:${n.session_type || ''}`).join('|');

    if (container._lastActivitySignature === dataKey) {
      if (occupancyOnly.length === 0 && container.querySelector('.ui-empty-state')) {
        return;
      }
      if (occupancyOnly.length > 0 && container.querySelector('.timeline-item')) {
        return; // No change, skip re-render
      }
    }
    container._lastActivitySignature = dataKey;
    _inlineActivityLogLastKey = dataKey;

    // Save scroll position
    const savedScrollTop = container.scrollTop;

    if (occupancyOnly.length === 0) {
      container.innerHTML = `
        <div class="ui-empty-state" style="grid-column:unset;width:100%;min-height:200px;">
          <div class="ui-empty-icon"><i data-lucide="clock-4"></i></div>
          <p>No recent activity events recorded.</p>
        </div>
      `;
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: container });
      }
      return;
    }

    container.innerHTML = occupancyOnly.map(log => {
      const rawStatus = String(log.status || '').trim();
      const isSecurityAlert = rawStatus === 'UNAUTHORIZED' || rawStatus.toLowerCase().includes('unauthorized');
      const isWrongSlot = rawStatus === 'WRONG_SLOT' || rawStatus.toLowerCase().includes('wrong');
      const isUnauthorizedReturn = (rawStatus === 'Key Returned' || rawStatus === 'KEY_RETURN' || rawStatus.toLowerCase() === 'returned') && (log.detail === 'Alarm Cleared' || log.description === 'Unidentified Person');

      let actorName = '';
      let detailText = '';
      let hasUser = false;

      if (isSecurityAlert) {
        actorName = 'Unidentified Person';
        detailText = 'Security Alert';
        hasUser = true;
      } else if (isWrongSlot) {
        actorName = 'Unidentified Person';
        detailText = 'Hardware Warning';
        hasUser = true;
      } else if (isUnauthorizedReturn) {
        actorName = 'Unidentified Person';
        detailText = 'Alarm Cleared';
        hasUser = true;
      } else {
        let profName = (log.description && log.description !== 'Room Key' && log.description !== 'Unidentified Person' && log.description !== 'Unregistered' && log.description !== 'None' && log.description !== 'N/A') ? log.description : '';

        hasUser = !!profName && profName !== 'None' && profName !== 'N/A';
        const role = String(log.detail || log.role || log.actor_role || log.Actor_Role || '').trim();
        const isMisPersonnel = /MIS/i.test(role) || /OJT/i.test(role) || role === 'MIS Staff' || role === 'OJT' || log.borrow_purpose === 'IT Maintenance' || log.Borrow_Purpose === 'IT Maintenance';

        if (hasUser) {
          if (isMisPersonnel) {
            actorName = String(profName).replace(/^Prof\.?\s*/i, '').trim();
          } else {
            actorName = (profName.startsWith('Prof.') || profName.startsWith('Dr.') || profName.startsWith('Engr.'))
              ? profName
              : `Prof. ${profName}`;
          }
          detailText = role || 'Faculty';
        } else {
          actorName = (role && role !== 'Faculty') ? role : 'System';
          detailText = 'Automated Event';
        }
      }

      const relTime = getRelativeTime(log.time);
      const exactStamp = formatExactDateTime(log.time);
      const isoTime = (function () {
        if (!log.time) return '';
        const d = new Date(log.time);
        return isNaN(d.getTime()) ? '' : d.toISOString();
      })();

      const actionInfo = getActionPresentation(log);

      const targetHtml = log.room_number
        ? `<span class="audit-target-tag"><span>RM ${escapeHtml(log.room_number)}</span></span>`
        : '';

      const extraNoteHtml = (log.description && !hasUser && log.description !== 'Room Key' && log.description !== 'None' && log.description !== 'N/A' && log.description !== actorName)
        ? `<div class="audit-extra-note">${escapeHtml(log.description)}</div>`
        : '';

      return `
        <div class="timeline-item audit-item type-${escapeHtml(actionInfo.actionType)}">
          <div class="timeline-dot audit-timeline-dot dot-${escapeHtml(actionInfo.actionType)}" aria-hidden="true"></div>
          <div class="audit-row-header">
            <time class="audit-time-badge" datetime="${escapeHtml(isoTime)}" title="${escapeHtml(relTime)}" aria-label="${escapeHtml(exactStamp)}">
              <span>${escapeHtml(exactStamp)}</span>
            </time>
          </div>
          <div class="timeline-panel audit-panel">
            <div class="audit-action-row">
              <i data-lucide="${escapeHtml(actionInfo.icon)}" class="audit-type-icon icon-${escapeHtml(actionInfo.actionType)}"></i>
              <span class="audit-action-badge action-${escapeHtml(actionInfo.actionType)}">${escapeHtml(actionInfo.label)}</span>
            </div>
            <div class="audit-meta-line">
              ${targetHtml}
              <span class="audit-actor-group">
                ${hasUser ? '<span class="audit-by-prefix">by</span>' : ''}
                <strong class="audit-actor-name" title="${escapeHtml(detailText)}">${escapeHtml(actorName)}</strong>
                <span class="audit-dot">·</span>
                <span class="audit-role-text">${escapeHtml(detailText)}</span>
              </span>
            </div>
            ${extraNoteHtml}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: container });
    }

    // Restore scroll position after re-render
    container.scrollTop = savedScrollTop;
  }

  // ─── Room Status Activity Log Report Modal Controller ─────────────
  function initRoomStatusReportModal() {
    const modal = document.getElementById('roomStatusReportModal');
    if (!modal) return;

    const modalContent = modal.querySelector('.modal-content');
    const openBtn = document.getElementById('btnOpenReportModal');

    // Role-based UI visibility: Room Status PDF report is IT Dept Head exclusive
    try {
      const rawUser = JSON.parse(
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('labsync_user')) ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('user')) ||
        'null'
      );
      const user = (rawUser && (rawUser.user || rawUser)) || null;
      const role = String((user && (user.role || user.Role)) || '').trim();
      const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
      const isExclusiveDeptHead = itHeadAliases.includes(role) ||
        (role.toLowerCase().includes('head') && !role.toLowerCase().includes('coordinator'));

      if (openBtn && !isExclusiveDeptHead) {
        openBtn.style.display = 'none';
      }
    } catch (e) {
      // In case of storage parsing error, continue modal initialization
    }

    const closeBtn = document.getElementById('closeReportModalBtn');
    const cancelBtn = document.getElementById('cancelReportModalBtn');
    const submitBtn = document.getElementById('btnSubmitGenerateReport');
    const submitText = document.getElementById('btnSubmitReportText');

    const periodRadios = modal.querySelectorAll('input[name="reportPeriod"]');
    const radioCards = modal.querySelectorAll('.period-radio-card');
    const customContainer = document.getElementById('customDateRangeContainer');
    const startDateInput = document.getElementById('reportStartDate');
    const endDateInput = document.getElementById('reportEndDate');
    const roomSelect = document.getElementById('reportRoomFilter');
    const summaryText = document.getElementById('reportPeriodSummaryText');
    const errorBanner = document.getElementById('reportErrorBanner');
    const errorText = document.getElementById('reportErrorText');

    const MONTHS = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const SHORT_MONTHS = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    function formatLongDate(dateObj) {
      if (!dateObj || isNaN(dateObj.getTime())) return '';
      return `${MONTHS[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
    }

    function formatShortDate(dateObj) {
      if (!dateObj || isNaN(dateObj.getTime())) return '';
      return `${SHORT_MONTHS[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
    }

    function formatIsoDate(d) {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function updatePeriodSummary() {
      const selected = modal.querySelector('input[name="reportPeriod"]:checked');
      const val = selected ? selected.value : 'today';
      const now = new Date();

      if (val === 'today') {
        if (summaryText) summaryText.textContent = `Today (${formatShortDate(now)})`;
      } else if (val === 'yesterday') {
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (summaryText) summaryText.textContent = `Yesterday (${formatShortDate(y)})`;
      } else if (val === 'both') {
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (y.getMonth() === now.getMonth() && y.getFullYear() === now.getFullYear()) {
          if (summaryText) summaryText.textContent = `Today + Yesterday (${SHORT_MONTHS[y.getMonth()]} ${y.getDate()} – ${now.getDate()}, ${now.getFullYear()})`;
        } else if (y.getFullYear() === now.getFullYear()) {
          if (summaryText) summaryText.textContent = `Today + Yesterday (${SHORT_MONTHS[y.getMonth()]} ${y.getDate()} – ${SHORT_MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()})`;
        } else {
          if (summaryText) summaryText.textContent = `Today + Yesterday (${formatShortDate(y)} – ${formatShortDate(now)})`;
        }
      } else if (val === 'custom') {
        const sVal = startDateInput ? startDateInput.value : '';
        const eVal = endDateInput ? endDateInput.value : '';
        if (!sVal || !eVal) {
          if (summaryText) summaryText.textContent = 'Please choose start and end dates';
          return;
        }
        const [sY, sM, sD] = sVal.split('-').map(Number);
        const [eY, eM, eD] = eVal.split('-').map(Number);
        const sDate = new Date(sY, sM - 1, sD);
        const eDate = new Date(eY, eM - 1, eD);

        if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
          if (summaryText) summaryText.textContent = 'Please choose valid dates';
        } else if (sVal === eVal) {
          if (summaryText) summaryText.textContent = formatShortDate(sDate);
        } else if (sDate.getMonth() === eDate.getMonth() && sDate.getFullYear() === eDate.getFullYear()) {
          if (summaryText) summaryText.textContent = `${SHORT_MONTHS[sDate.getMonth()]} ${sDate.getDate()} – ${eDate.getDate()}, ${sDate.getFullYear()}`;
        } else if (sDate.getFullYear() === eDate.getFullYear()) {
          if (summaryText) summaryText.textContent = `${SHORT_MONTHS[sDate.getMonth()]} ${sDate.getDate()} – ${SHORT_MONTHS[eDate.getMonth()]} ${eDate.getDate()}, ${sDate.getFullYear()}`;
        } else {
          if (summaryText) summaryText.textContent = `${formatShortDate(sDate)} – ${formatShortDate(eDate)}`;
        }
      }
    }

    function hideError() {
      if (errorBanner) errorBanner.style.display = 'none';
      if (errorText) errorText.textContent = '';
    }

    function showError(msg) {
      if (errorBanner) {
        errorBanner.style.display = 'flex';
        if (errorText) errorText.textContent = msg;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: errorBanner });
        }
      }
    }

    function openModal() {
      hideError();
      const now = new Date();
      const todayStr = formatIsoDate(now);

      // Default dates
      if (startDateInput && !startDateInput.value) startDateInput.value = todayStr;
      if (endDateInput && !endDateInput.value) endDateInput.value = todayStr;

      // Ensure 'today' radio is checked if nothing was selected
      const checkedRadio = modal.querySelector('input[name="reportPeriod"]:checked');
      if (!checkedRadio) {
        const todayRadio = modal.querySelector('input[name="reportPeriod"][value="today"]');
        if (todayRadio) todayRadio.checked = true;
      }

      // Sync active card visual classes
      periodRadios.forEach(r => {
        const card = r.closest('.period-radio-card');
        if (card) card.classList.toggle('active', r.checked);
      });

      const isCustom = modal.querySelector('input[name="reportPeriod"][value="custom"]:checked');
      if (customContainer) customContainer.style.display = isCustom ? 'block' : 'none';

      updatePeriodSummary();

      modal.classList.remove('closing');
      modal.removeAttribute('data-closing');
      modal.style.display = 'flex';
      modal.style.pointerEvents = 'auto';

      void modal.offsetWidth;
      modal.style.opacity = '1';
      if (modalContent) modalContent.style.transform = 'translateY(0)';

      setupCustomSelect();
      if (typeof window.setCustomSelectValue === 'function') {
        window.setCustomSelectValue('reportRoomFilterWrapper', roomSelect ? roomSelect.value : 'all');
      }
      if (window.LabSyncDatePicker && typeof window.LabSyncDatePicker.init === 'function') {
        window.LabSyncDatePicker.init();
      }

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: modal });
      }
    }

    function closeModal() {
      if (modal.style.display === 'none' || modal.classList.contains('closing')) return;

      if (window.LabSyncDatePicker && typeof window.LabSyncDatePicker.close === 'function') {
        window.LabSyncDatePicker.close();
      }
      const selectWrapper = document.getElementById('reportRoomFilterWrapper');
      if (selectWrapper) selectWrapper.classList.remove('open');

      modal.classList.add('closing');
      modal.setAttribute('data-closing', 'true');
      modal.style.opacity = '0';
      modal.style.pointerEvents = 'none';
      if (modalContent) modalContent.style.transform = 'translateY(12px)';

      setTimeout(() => {
        modal.style.display = 'none';
        modal.classList.remove('closing');
        modal.removeAttribute('data-closing');
        if (modalContent) modalContent.style.transform = '';
        hideError();
      }, 200);
    }

    // Custom Select Initialization & Synchronization
    let customSelectInitialized = false;
    function setupCustomSelect() {
      if (customSelectInitialized) return;
      if (typeof window.initCustomSelect === 'function') {
        window.initCustomSelect('reportRoomFilterWrapper', (val) => {
          if (roomSelect) {
            roomSelect.value = val;
            roomSelect.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        customSelectInitialized = true;
      }
    }
    setupCustomSelect();
    if (!customSelectInitialized) {
      setTimeout(setupCustomSelect, 150);
    }

    if (roomSelect) {
      roomSelect.addEventListener('change', () => {
        if (typeof window.setCustomSelectValue === 'function') {
          window.setCustomSelectValue('reportRoomFilterWrapper', roomSelect.value);
        }
      });
    }

    // Attach open button
    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openModal();
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.style.display === 'flex') {
        closeModal();
      }
    });

    // Radio change handlers
    periodRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        hideError();
        radioCards.forEach(card => {
          const r = card.querySelector('input[type="radio"]');
          card.classList.toggle('active', Boolean(r && r.checked));
        });

        const isCustom = radio.value === 'custom';
        if (customContainer) customContainer.style.display = isCustom ? 'block' : 'none';
        updatePeriodSummary();
      });
    });

    // Custom date inputs change handlers
    if (startDateInput) startDateInput.addEventListener('change', () => { hideError(); updatePeriodSummary(); });
    if (endDateInput) endDateInput.addEventListener('change', () => { hideError(); updatePeriodSummary(); });

    // Submit / Download Action
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        hideError();

        const selectedRadio = modal.querySelector('input[name="reportPeriod"]:checked');
        const periodVal = selectedRadio ? selectedRadio.value : 'today';
        const roomVal = roomSelect ? roomSelect.value : 'all';

        let startDate = '';
        let endDate = '';

        if (periodVal === 'custom') {
          startDate = startDateInput ? startDateInput.value.trim() : '';
          endDate = endDateInput ? endDateInput.value.trim() : '';

          if (!startDate || !endDate) {
            showError('Please select both start date and end date.');
            return;
          }

          if (startDate > endDate) {
            showError('End date cannot be earlier than start date.');
            return;
          }
        }

        // Set Loading State
        submitBtn.disabled = true;
        submitBtn.classList.add('loading');
        if (submitText) submitText.textContent = 'Generating PDF...';

        try {
          const params = new URLSearchParams();
          params.set('period', periodVal);
          if (roomVal && roomVal !== 'all') {
            params.set('roomNumber', roomVal);
          }
          if (periodVal === 'custom') {
            params.set('startDate', startDate);
            params.set('endDate', endDate);
          }

          const response = await fetch(`/api/reports/room-status?${params.toString()}`, {
            method: 'GET',
            credentials: 'include'
          });

          if (!response.ok) {
            let errorMsg = 'Failed to generate room status report.';
            try {
              const errData = await response.json();
              if (errData && errData.error) errorMsg = errData.error;
            } catch (e) {}
            showError(errorMsg);
            return;
          }

          // Successful response - extract filename and trigger download
          const blob = await response.blob();
          const contentDisposition = response.headers.get('content-disposition') || '';
          let filename = 'LabSync_Room_Status_Report.pdf';

          const match = contentDisposition.match(/filename=["']?([^"';]+)["']?/i);
          if (match && match[1]) {
            filename = match[1].trim();
          }

          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(blobUrl);

          if (typeof window.showToast === 'function') {
            window.showToast('Room status activity report downloaded successfully.', 'success');
          }

          closeModal();
        } catch (err) {
          console.error('Error generating report:', err);
          showError('A network error occurred while generating the report. Please try again.');
        } finally {
          submitBtn.disabled = false;
          submitBtn.classList.remove('loading');
          if (submitText) submitText.textContent = 'Generate PDF';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
        }
      });
    }
  }

  // Initialize Page Component
  function initPage() {
    initSidebarScrollClue();
    loadRoomStatusAndLogs();
    initRoomStatusReportModal();
  }

  // Expose globally for real-time polling and parser-time hydration
  window.loadITHeadRoomStatus = loadRoomStatusAndLogs;
  window.loadRoomStatusAndLogs = loadRoomStatusAndLogs;
  window.renderRoomStatusGrid = renderRoomStatusGrid;
  window.renderActivityLogList = renderActivityLogList;

  // Execute on DOM Ready or immediately
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
