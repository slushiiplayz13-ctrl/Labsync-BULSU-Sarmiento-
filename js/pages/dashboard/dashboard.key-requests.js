/* ================================================================
   LabSync – Faculty Key Request Status Banner & Advance Reservation Modal
   File: js/pages/dashboard/dashboard.key-requests.js
   ================================================================ */

'use strict';

(function (global) {
  let _keyRequestsInitialized = false;
  let _dismissedRequestId = null;
  let _lastStatus = null;
  let _cachedLabs = null;
  let _lastFacultyReqData = null;

  function getCurrentUserRole() {
    try {
      const rawUser = JSON.parse(sessionStorage.getItem('labsync_user') || localStorage.getItem('user') || 'null');
      const user = (rawUser && (rawUser.user || rawUser)) || null;
      return user ? (user.role || user.Role || '') : '';
    } catch (e) {
      return '';
    }
  }

  function isApproverOnlyRole(role) {
    if (!role) return false;
    const cleanRole = String(role).trim();
    const itHeadAliases = ['IT Dept. Head', 'IT Head', 'IT Dept Head', 'Department Head'];
    return itHeadAliases.includes(cleanRole) || (cleanRole.toLowerCase().includes('head') && !cleanRole.toLowerCase().includes('coordinator'));
  }

  function isKeyRequesterRole(role) {
    if (!role) return true;
    if (isApproverOnlyRole(role)) return false;
    const cleanRole = String(role).trim().toLowerCase();
    const unrelatedRoles = ['mis staff', 'mis', 'ojt', 'student', 'guest', 'admin'];
    return !unrelatedRoles.includes(cleanRole);
  }

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

  function formatDateFriendly(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = String(dateStr).split('T')[0].split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function addMinutesToTime(timeStr, minutes) {
    if (!timeStr) return '09:00';
    const [h, m] = timeStr.split(':').map(Number);
    const totalMin = Math.min(21 * 60, h * 60 + m + minutes);
    const newH = Math.floor(totalMin / 60);
    const newM = totalMin % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }

  function getEarlyPickupTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    let totalMin = h * 60 + m - 15;
    if (totalMin < 0) totalMin = 0;
    const earlyH = Math.floor(totalMin / 60);
    const earlyM = totalMin % 60;
    return formatTime12h(`${String(earlyH).padStart(2, '0')}:${String(earlyM).padStart(2, '0')}`);
  }

  /**
   * Generates a list of valid class dates (Monday to Saturday) from today through Saturday of next week.
   */
  function generateReservationDateOptions() {
    const dates = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dayOfWeek = today.getDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
    const daysToThisSat = dayOfWeek === 0 ? 6 : (6 - dayOfWeek);
    const daysToNextSat = daysToThisSat + 7;

    for (let offset = 0; offset <= daysToNextSat; offset++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      if (d.getDay() === 0) continue; // Exclude Sundays (no classes)

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const value = `${y}-${m}-${dayNum}`;

      let dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      if (offset === 0) dayName = 'Today';
      else if (offset === 1) dayName = 'Tomorrow';

      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      let prefix = '';
      if (offset === 0) prefix = 'Today — ';
      else if (offset === 1) prefix = 'Tomorrow — ';

      const label = prefix + d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      dates.push({ value, label, dayName, monthDay });
    }
    return dates;
  }

  /**
   * Generates 30-minute time slots between 07:00 AM and 08:30 PM.
   */
  function generateTimeOptions() {
    const slots = [];
    for (let h = 7; h <= 20; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 20 && m > 30) break;
        const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        const label = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
        slots.push({ value: val, label });
      }
    }
    return slots;
  }

  /**
   * Generates 30-minute time slots up to 09:00 PM (21:00) for class end times.
   */
  function generateEndTimeOptions() {
    const slots = [];
    for (let h = 7; h <= 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 7 && m === 0) continue;
        if (h === 21 && m > 0) break;
        const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 || 12;
        const label = `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
        slots.push({ value: val, label });
      }
    }
    return slots;
  }

  /**
   * Fetches active key authorization request for the current faculty user
   * and renders the real-time status banner on the dashboard or room status page.
   */
  async function loadFacultyKeyRequestStatus() {
    const role = getCurrentUserRole();
    if (isApproverOnlyRole(role)) {
      const banner = document.getElementById('facultyKeyStatusBanner');
      if (banner) {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
      initHeaderReserveButton();
      return;
    }

    initHeaderReserveButton();
    const banner = document.getElementById('facultyKeyStatusBanner');

    try {
      const response = await fetch('/api/keys/my-request-status', { credentials: 'include' });
      if (!response.ok) return;
      const req = await response.json();

      _lastFacultyReqData = req || null;
      initHeaderReserveButton();

      if (!banner) return;

      if (!req) {
        banner.style.display = 'none';
        banner.innerHTML = '';
        return;
      }

      // Check transition events for real-time toast feedback
      if (_lastStatus === 'PENDING' && req.Status === 'APPROVED') {
        if (typeof global.showToast === 'function') {
          global.showToast(
            `Dept. Head approved your key reservation for Room ${req.Room_Number}!`,
            'success',
            'Reservation Approved'
          );
        }
      } else if (_lastStatus === 'PENDING' && req.Status === 'REJECTED') {
        if (typeof global.showToast === 'function') {
          global.showToast(
            `Dept. Head declined your reservation for Room ${req.Room_Number}: ${req.Rejection_Reason || 'Declined'}`,
            'error',
            'Reservation Declined'
          );
        }
      }
      _lastStatus = req.Status || null;

      // Handle dismissed rejected requests
      const isDismissed = req.Status === 'REJECTED' && String(_dismissedRequestId) === String(req.Request_ID);

      let bannerHtml = '';
      banner.className = 'faculty-key-status-banner';

      if (req.Status === 'PENDING') {
        banner.classList.add('is-pending');
        const sessionInfo = (req.Reservation_Date_Str && req.Start_Time_Str && req.End_Time_Str)
          ? `Scheduled for <strong>${escapeText(formatDateFriendly(req.Reservation_Date_Str))}</strong> (${escapeText(formatTime12h(req.Start_Time_Str))} – ${escapeText(formatTime12h(req.End_Time_Str))}).`
          : 'Advance key request awaiting Department Head approval.';

        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="clock" style="width:20px;height:20px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Key Reservation Pending — Room ${escapeText(req.Room_Number)}</h4>
              <p class="fks-desc">${sessionInfo} Reason: <em>"${escapeText(req.Reason)}"</em></p>
            </div>
          </div>
          <div class="fks-actions">
            <button type="button" class="fks-btn-dismiss" id="btnCancelKeyRequest" data-id="${req.Request_ID}">
              <i data-lucide="x" style="width:13px;height:13px;"></i>
              <span>Cancel Request</span>
            </button>
          </div>
        `;
      } else if (req.Status === 'APPROVED') {
        const isReady = req.isPickupReady;
        const isFuture = req.isFutureReservation;

        if (isReady) {
          banner.classList.add('is-approved');
          bannerHtml = `
            <div class="fks-left">
              <div class="fks-icon-wrap">
                <i data-lucide="shield-check" style="width:22px;height:22px;"></i>
              </div>
              <div>
                <h4 class="fks-title">Key Ready to Claim! — Room ${escapeText(req.Room_Number)}</h4>
                <p class="fks-desc">Your session window is active now (${escapeText(formatTime12h(req.Start_Time_Str))} – ${escapeText(formatTime12h(req.End_Time_Str))}). Scan your ID QR code at the Key Box or claim via mobile.</p>
              </div>
            </div>
          `;
        } else if (isFuture) {
          banner.classList.add('is-scheduled');
          bannerHtml = `
            <div class="fks-left">
              <div class="fks-icon-wrap">
                <i data-lucide="calendar-check" style="width:22px;height:22px;"></i>
              </div>
              <div>
                <h4 class="fks-title">Reservation Confirmed — Room ${escapeText(req.Room_Number)}</h4>
                <p class="fks-desc">Approved for <strong>${escapeText(formatDateFriendly(req.Reservation_Date_Str))}</strong> at <strong>${escapeText(formatTime12h(req.Start_Time_Str))} – ${escapeText(formatTime12h(req.End_Time_Str))}</strong>. Pickup opens 15 mins before session.</p>
              </div>
            </div>
            <div class="fks-actions">
              <button type="button" class="fks-btn-dismiss" id="btnCancelKeyRequest" data-id="${req.Request_ID}">
                <i data-lucide="x" style="width:13px;height:13px;"></i>
                <span>Cancel Reservation</span>
              </button>
            </div>
          `;
        } else {
          banner.classList.add('is-approved');
          bannerHtml = `
            <div class="fks-left">
              <div class="fks-icon-wrap">
                <i data-lucide="shield-check" style="width:22px;height:22px;"></i>
              </div>
              <div>
                <h4 class="fks-title">Key Reservation Approved — Room ${escapeText(req.Room_Number)}</h4>
                <p class="fks-desc">Cleared by Dept Head! You can claim the key at the Key Box during your session.</p>
              </div>
            </div>
          `;
        }
      } else if (req.Status === 'REJECTED' && !isDismissed) {
        banner.classList.add('is-rejected');
        bannerHtml = `
          <div class="fks-left">
            <div class="fks-icon-wrap">
              <i data-lucide="x-circle" style="width:20px;height:20px;"></i>
            </div>
            <div>
              <h4 class="fks-title">Reservation Declined — Room ${escapeText(req.Room_Number)}</h4>
              <p class="fks-desc">Dept. Head declined this request: <strong>"${escapeText(req.Rejection_Reason || 'No specific reason provided')}"</strong></p>
            </div>
          </div>
          <div class="fks-actions">
            <button type="button" class="fks-btn-dismiss" id="btnDismissKeyBanner" data-id="${req.Request_ID}">
              <i data-lucide="check" style="width:13px;height:13px;"></i>
              <span>Dismiss</span>
            </button>
          </div>
        `;
      } else {
        banner.style.display = 'none';
        banner.innerHTML = '';
        return;
      }

      banner.innerHTML = bannerHtml;
      banner.style.display = 'flex';

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: banner });
      }

      const dismissBtn = banner.querySelector('#btnDismissKeyBanner');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          _dismissedRequestId = dismissBtn.getAttribute('data-id');
          banner.style.display = 'none';
        });
      }

      const cancelBtn = banner.querySelector('#btnCancelKeyRequest');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
          const reqId = cancelBtn.getAttribute('data-id');

          const confirmFn = global.showConfirmModal || window.showConfirmModal;
          let confirmed = false;
          if (typeof confirmFn === 'function') {
            confirmed = await confirmFn({
              title: 'Cancel Key Reservation',
              message: 'Are you sure you want to cancel this key reservation request? The reserved slot will be released.',
              confirmText: 'Yes, Cancel Reservation',
              cancelText: 'Keep Reservation',
              isDestructive: true,
              icon: 'calendar-x'
            });
          } else {
            confirmed = confirm('Are you sure you want to cancel this key reservation request?');
          }

          if (!confirmed) return;

          try {
            cancelBtn.disabled = true;
            const res = await fetch(`/api/keys/requests/${reqId}/cancel`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to cancel reservation');
            if (typeof global.showToast === 'function') {
              global.showToast('Reservation cancelled successfully.', 'info', 'Reservation Cancelled');
            }
            await loadFacultyKeyRequestStatus();
          } catch (err) {
            if (typeof global.showToast === 'function') {
              global.showToast(err.message || 'Cancellation failed', 'error');
            } else {
              alert(err.message || 'Cancellation failed');
            }
            cancelBtn.disabled = false;
          }
        });
      }

      const openModalBtn = banner.querySelector('#btnOpenDashboardReqModal');
      if (openModalBtn) {
        openModalBtn.addEventListener('click', () => {
          openAdvanceKeyRequestModal(req);
        });
      }

    } catch (e) {
      console.error('[DashboardKeyRequests] Failed to load request status:', e);
    }
  }

  /**
   * Lazily loads campus laboratories for the room picker dropdown.
   */
  async function fetchCampusLaboratories() {
    if (_cachedLabs && _cachedLabs.length > 0) return _cachedLabs;
    try {
      const res = await fetch('/api/laboratories', { credentials: 'include' });
      if (res.ok) {
        _cachedLabs = await res.json();
      }
    } catch (e) {
      console.warn('[DashboardKeyRequests] Could not fetch laboratories:', e);
    }
    return _cachedLabs || [];
  }

  /**
   * Opens the Advance Key Reservation Modal on the dashboard.
   */
  async function openAdvanceKeyRequestModal(facultyReqData) {
    let modal = document.getElementById('dashboardKeyRequestModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboardKeyRequestModal';
      modal.className = 'kt-modal-backdrop';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const heldRooms = facultyReqData.heldRooms || [];
    const heldIds = new Set(heldRooms.map(r => r.Room_ID));
    const isHoldingKey = heldRooms.length > 0;
    const heldName = isHoldingKey ? heldRooms[0].Room_Number : null;

    const holdingBadgeHtml = isHoldingKey
      ? `<span class="kt-pill-held">Room ${escapeText(heldName)}</span>`
      : `<span class="kt-pill-held" style="background: rgba(14, 165, 201, 0.12); color: #0284C7; border: 1px solid rgba(14, 165, 201, 0.25);">None (1st Key Direct via Key Box)</span>`;

    // Fetch labs
    const labs = await fetchCampusLaboratories();
    const availableLabs = labs.filter(l => !heldIds.has(l.Room_ID));

    const dateOptions = generateReservationDateOptions();
    const allSlots = generateTimeOptions();
    const morningSlots = allSlots.filter(s => {
      const h = parseInt(s.value.split(':')[0], 10);
      return h >= 7 && h < 12;
    });
    const afternoonSlots = allSlots.filter(s => {
      const h = parseInt(s.value.split(':')[0], 10);
      return h >= 12 && h < 17;
    });
    const eveningSlots = allSlots.filter(s => {
      const h = parseInt(s.value.split(':')[0], 10);
      return h >= 17;
    });

    // Default time: next hour rounded
    const now = new Date();
    const currentTotalMin = now.getHours() * 60 + now.getMinutes();
    // Latest start slot for a 30-min lab class is 20:30 (8:30 PM), since labs close at 21:00 (9:00 PM)
    const hasSlotsToday = currentTotalMin < (20 * 60 + 30);
    const initialDateIndex = (!hasSlotsToday && dateOptions.length > 1) ? 1 : 0;
    const initialDate = dateOptions[initialDateIndex] || dateOptions[0];

    let defaultStartHour = (initialDateIndex === 0) ? (now.getHours() + 1) : 8;
    if (defaultStartHour < 7) defaultStartHour = 8;
    if (defaultStartHour > 19) defaultStartHour = 19;
    const defaultStartTime = `${String(defaultStartHour).padStart(2, '0')}:00`;

    let initialPeriod = 'morning';
    if (defaultStartHour >= 12 && defaultStartHour < 17) initialPeriod = 'afternoon';
    else if (defaultStartHour >= 17) initialPeriod = 'evening';

    let selectedStartTime = (initialDateIndex === 0 && !hasSlotsToday) ? null : defaultStartTime;
    let selectedDurationMin = 120; // 2.0 hrs default
    let isCustomDuration = false;

    modal.innerHTML = `
      <div class="kt-modal-card">
        <div class="kt-modal-header">
          <div class="kt-modal-icon-badge">
            <i data-lucide="key-round" style="width: 20px; height: 20px;"></i>
          </div>
          <div>
            <h3 class="kt-modal-title">Reserve Laboratory Key</h3>
          </div>
          <button type="button" id="btnCloseDashReqModal" class="kt-modal-close" aria-label="Close">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <div class="kt-modal-body">
          <!-- Laboratory Room Custom Dropdown Picker -->
          <div class="kt-picker-group">
            <label class="kt-input-label">Laboratory Room</label>
            <div class="kt-custom-picker" id="ktRoomPicker">
              <button type="button" class="kt-picker-trigger" id="ktRoomTrigger" aria-haspopup="listbox" aria-expanded="false">
                <div class="kt-trigger-content">
                  <span class="kt-trigger-title" id="ktRoomSelectedTitle">
                    ${availableLabs[0] ? `Room ${escapeText(availableLabs[0].Room_Number)} (${escapeText(availableLabs[0].Building || 'Campus')})` : 'Select a laboratory'}
                  </span>
                  <span class="kt-opt-badge is-available" id="ktRoomSelectedBadge">Available</span>
                </div>
                <i data-lucide="chevron-down" class="kt-picker-chevron"></i>
              </button>
              <div class="kt-picker-menu" id="ktRoomMenu" role="listbox" style="display: none;">
                ${availableLabs.map((lab, idx) => `
                  <div class="kt-picker-option ${idx === 0 ? 'selected' : ''}" role="option" data-value="${lab.Room_ID}" data-title="Room ${escapeText(lab.Room_Number)} (${escapeText(lab.Building || 'Campus')})">
                    <div class="kt-opt-left">
                      <span class="kt-opt-title">Room ${escapeText(lab.Room_Number)}</span>
                      <span class="kt-opt-sub">${escapeText(lab.Building || 'Campus')}</span>
                    </div>
                    <div class="kt-opt-right">
                      <span class="kt-opt-badge is-available">Available</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
            <div class="kt-room-conflict-banner" id="ktRoomConflictBanner" style="display: none;"></div>
            <input type="hidden" id="dashReqRoomSelect" value="${availableLabs[0] ? availableLabs[0].Room_ID : ''}">
          </div>

          <!-- Date Custom Dropdown Picker -->
          <div class="kt-picker-group">
            <label class="kt-input-label">Date</label>
            <div class="kt-custom-picker" id="ktDatePicker">
              <button type="button" class="kt-picker-trigger" id="ktDateTrigger" aria-haspopup="listbox" aria-expanded="false">
                <div class="kt-trigger-content">
                  <span class="kt-trigger-title" id="ktDateSelectedTitle">${escapeText(initialDate ? initialDate.label : '')}</span>
                </div>
                <i data-lucide="chevron-down" class="kt-picker-chevron"></i>
              </button>
              <div class="kt-picker-menu" id="ktDateMenu" role="listbox" style="display: none;">
                ${dateOptions.map((opt, idx) => `
                  <div class="kt-picker-option ${idx === initialDateIndex ? 'selected' : ''}" role="option" data-value="${opt.value}" data-title="${escapeText(opt.label)}">
                    <div class="kt-opt-left">
                      <span class="kt-opt-title">${escapeText(opt.label)}</span>
                    </div>
                    ${(opt.dayName === 'Today' || opt.dayName === 'Tomorrow') ? `
                      <div class="kt-opt-right">
                        ${opt.dayName === 'Today' ? (hasSlotsToday ? '<span class="kt-opt-badge is-today">Today</span>' : '<span class="kt-opt-badge is-ended">Ended</span>') : '<span class="kt-opt-badge is-tomorrow">Tomorrow</span>'}
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
            <input type="hidden" id="dashReqDateSelect" value="${initialDate ? initialDate.value : ''}">
          </div>

          <!-- Start Time Selection: Period Tabs + Clickable Chips -->
          <div style="margin-bottom: 12px;" id="ktTimeSelectionContainer">
            <label class="kt-input-label">Start Time</label>

            <!-- No slots remaining notice -->
            <div class="kt-no-slots-notice" id="ktNoSlotsNotice" style="display: none;">
              <div class="kt-nsn-icon">
                <i data-lucide="clock" style="width: 16px; height: 16px;"></i>
              </div>
              <div class="kt-nsn-content">
                <span class="kt-nsn-title">No reservation slots available for today</span>
                <span class="kt-nsn-sub">Campus laboratory hours end at 9:00 PM. Please select tomorrow or an advance date above.</span>
              </div>
            </div>

            <div class="kt-period-tabs" id="ktPeriodTabs">
              <button type="button" class="kt-period-btn ${initialPeriod === 'morning' ? 'active' : ''}" data-period="morning">Morning</button>
              <button type="button" class="kt-period-btn ${initialPeriod === 'afternoon' ? 'active' : ''}" data-period="afternoon">Afternoon</button>
              <button type="button" class="kt-period-btn ${initialPeriod === 'evening' ? 'active' : ''}" data-period="evening">Evening</button>
            </div>

            <!-- Morning Grid -->
            <div class="kt-time-grid" id="ktGridMorning" style="${initialPeriod === 'morning' ? '' : 'display: none;'}">
              ${morningSlots.map(s => `
                <button type="button" class="kt-time-chip ${s.value === selectedStartTime ? 'active' : ''}" data-time="${s.value}">
                  ${s.label.replace(' AM', 'am').replace(' PM', 'pm')}
                </button>
              `).join('')}
            </div>

            <!-- Afternoon Grid -->
            <div class="kt-time-grid" id="ktGridAfternoon" style="${initialPeriod === 'afternoon' ? '' : 'display: none;'}">
              ${afternoonSlots.map(s => `
                <button type="button" class="kt-time-chip ${s.value === selectedStartTime ? 'active' : ''}" data-time="${s.value}">
                  ${s.label.replace(' AM', 'am').replace(' PM', 'pm')}
                </button>
              `).join('')}
            </div>

            <!-- Evening Grid -->
            <div class="kt-time-grid" id="ktGridEvening" style="${initialPeriod === 'evening' ? '' : 'display: none;'}">
              ${eveningSlots.map(s => `
                <button type="button" class="kt-time-chip ${s.value === selectedStartTime ? 'active' : ''}" data-time="${s.value}">
                  ${s.label.replace(' AM', 'am').replace(' PM', 'pm')}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Class Duration Selection: Quick Pills -->
          <div style="margin-bottom: 12px;">
            <label class="kt-input-label">Duration</label>
            <div class="kt-duration-row" id="ktDurationRow">
              <button type="button" class="kt-dur-chip" data-min="30">30 mins</button>
              <button type="button" class="kt-dur-chip" data-min="60">1 hr</button>
              <button type="button" class="kt-dur-chip" data-min="90">1.5 hrs</button>
              <button type="button" class="kt-dur-chip active" data-min="120">2 hrs</button>
              <button type="button" class="kt-dur-chip" data-min="180">3 hrs</button>
              <button type="button" class="kt-dur-chip" data-min="240">4 hrs</button>
              <button type="button" class="kt-dur-chip" data-min="custom">Custom</button>
            </div>

            <!-- Custom End Time Picker -->
            <div class="kt-custom-end-row" id="ktCustomEndRow">
              <label class="kt-custom-end-label" for="ktCustomEndTrigger">
                <i data-lucide="clock" class="kt-custom-end-icon"></i>
                <span>End Time:</span>
              </label>
              <div class="kt-custom-picker kt-custom-end-picker" id="ktCustomEndPicker">
                <button type="button" class="kt-picker-trigger kt-custom-end-trigger" id="ktCustomEndTrigger" aria-haspopup="listbox" aria-expanded="false">
                  <div class="kt-trigger-content">
                    <span class="kt-trigger-title" id="ktCustomEndSelectedTitle">Select End Time</span>
                  </div>
                  <i data-lucide="chevron-down" class="kt-picker-chevron"></i>
                </button>
                <div class="kt-picker-menu kt-custom-end-menu" id="ktCustomEndMenu" role="listbox" style="display: none;"></div>
              </div>
              <input type="hidden" id="dashReqCustomEndTime" value="">
            </div>
          </div>

          <!-- Live Session Summary Card -->
          <div class="kt-session-summary-card" id="ktSessionSummaryCard">
            <i data-lucide="clock" class="kt-ssc-icon-svg" style="width: 15px; height: 15px; flex-shrink: 0;"></i>
            <span class="kt-ssc-time" id="ktSscTimeText">${formatTime12h(selectedStartTime)} – ${formatTime12h(addMinutesToTime(selectedStartTime, 120))} (2 hrs)</span>
            <span class="kt-ssc-sep">•</span>
            <span class="kt-ssc-detail" id="ktSscDetailText">Pickup from ${getEarlyPickupTime(selectedStartTime)}</span>
          </div>

          <div class="kt-label-row">
            <label for="dashReqReasonInput" class="kt-input-label">Purpose</label>
            <span class="kt-char-counter" id="dashReqCharCount" aria-live="polite">0 / 150</span>
          </div>
          <textarea id="dashReqReasonInput" class="kt-textarea" rows="2" maxlength="150" placeholder="e.g., Simultaneous lab class, exam session..."></textarea>
        </div>

        <div class="kt-modal-footer">
          <button type="button" id="btnSubmitDashKeyRequest" class="btn-modal-submit">
            <i data-lucide="calendar-check" style="width: 16px; height: 16px;"></i>
            <span>Confirm Reservation</span>
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons({ root: modal });
    }

    function closeAllPickers() {
      modal.querySelectorAll('.kt-picker-menu').forEach(m => { m.style.display = 'none'; });
      modal.querySelectorAll('.kt-picker-trigger').forEach(t => {
        t.classList.remove('is-open');
        t.setAttribute('aria-expanded', 'false');
      });
    }

    function closeModal() {
      closeAllPickers();
      modal.style.display = 'none';
      document.removeEventListener('keydown', handleKeyDown);
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        const openMenu = modal.querySelector('.kt-picker-menu:not([style*="display: none"])');
        if (openMenu) {
          closeAllPickers();
        } else {
          closeModal();
        }
      }
    }

    const closeBtn = modal.querySelector('#btnCloseDashReqModal');
    if (closeBtn) closeBtn.onclick = closeModal;

    modal.onclick = (e) => {
      if (e.target === modal) {
        closeModal();
      } else if (!e.target.closest('.kt-custom-picker')) {
        closeAllPickers();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const periodBtns = modal.querySelectorAll('.kt-period-btn');
    const grids = {
      morning: modal.querySelector('#ktGridMorning'),
      afternoon: modal.querySelector('#ktGridAfternoon'),
      evening: modal.querySelector('#ktGridEvening')
    };
    const timeChips = modal.querySelectorAll('.kt-time-chip');
    const durChips = modal.querySelectorAll('.kt-dur-chip');
    const customSelect = modal.querySelector('#dashReqCustomEndTime');
    const customEndRow = modal.querySelector('#ktCustomEndRow');
    const customEndTrigger = modal.querySelector('#ktCustomEndTrigger');
    const customEndMenu = modal.querySelector('#ktCustomEndMenu');
    const customEndTitle = modal.querySelector('#ktCustomEndSelectedTitle');
    const dateSelect = modal.querySelector('#dashReqDateSelect');

    function formatDurationLabel(minutes) {
      if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''}`;
      const hrs = minutes / 60;
      return hrs % 1 === 0 ? `${hrs} hr${hrs > 1 ? 's' : ''}` : `${hrs.toFixed(1)} hrs`;
    }

    function switchPeriodTab(period) {
      periodBtns.forEach(b => b.classList.toggle('active', b.dataset.period === period));
      Object.keys(grids).forEach(k => {
        if (grids[k]) grids[k].style.display = (k === period) ? 'grid' : 'none';
      });

      // Keep selection in sync when user clicks a period tab
      const activeGrid = grids[period];
      if (activeGrid) {
        const availableInGrid = Array.from(activeGrid.querySelectorAll('.kt-time-chip:not(:disabled)'));
        const isCurrentInPeriod = availableInGrid.some(c => c.dataset.time === selectedStartTime);
        if (!isCurrentInPeriod && availableInGrid.length > 0) {
          selectedStartTime = availableInGrid[0].dataset.time;
          timeChips.forEach(c => c.classList.toggle('active', c.dataset.time === selectedStartTime && !c.disabled));
          updateDurationOptions();
          updateSchedulePreview();
        }
      }
    }

    function populateCustomEndOptions() {
      if (!customSelect || !customEndMenu) return;
      const [sh, sm] = selectedStartTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endSlots = generateEndTimeOptions();
      const filtered = endSlots.filter(s => {
        const [h, m] = s.value.split(':').map(Number);
        return (h * 60 + m) > startMin;
      });

      const previousVal = customSelect.value;
      let targetVal = '';
      if (filtered.length > 0) {
        const hasPrev = filtered.some(f => f.value === previousVal);
        const defTarget = addMinutesToTime(selectedStartTime, 120);
        const hasDef = filtered.some(f => f.value === defTarget);
        if (hasPrev) {
          targetVal = previousVal;
        } else if (hasDef) {
          targetVal = defTarget;
        } else {
          targetVal = filtered[0].value;
        }
      }

      customSelect.value = targetVal;
      const matched = filtered.find(f => f.value === targetVal);
      if (customEndTitle) {
        customEndTitle.textContent = matched ? matched.label : (filtered[0] ? filtered[0].label : 'Select End Time');
      }

      customEndMenu.innerHTML = filtered.map(s => {
        const isSel = s.value === targetVal;
        const [eh, em] = s.value.split(':').map(Number);
        const diff = (eh * 60 + em) - startMin;
        const durLabel = formatDurationLabel(diff);
        return `
          <div class="kt-picker-option ${isSel ? 'selected' : ''}" role="option" data-value="${s.value}" data-title="${s.label}">
            <div class="kt-opt-left">
              <span class="kt-opt-title">${s.label}</span>
              <span class="kt-opt-sub">(${durLabel})</span>
            </div>
          </div>
        `;
      }).join('');

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: customEndMenu });
      }

      const options = customEndMenu.querySelectorAll('.kt-picker-option');
      options.forEach(opt => {
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const title = opt.dataset.title;

          options.forEach(o => {
            o.classList.toggle('selected', o === opt);
          });

          customSelect.value = val;
          if (customEndTitle) customEndTitle.textContent = title;

          customEndMenu.style.display = 'none';
          if (customEndTrigger) {
            customEndTrigger.classList.remove('is-open');
            customEndTrigger.setAttribute('aria-expanded', 'false');
          }

          updateSchedulePreview();
        };
      });
    }

    /**
     * Dynamically enables or disables duration chips based on campus laboratory closing time (9:00 PM).
     * If the current selection would exceed 9:00 PM, automatically selects the largest valid duration.
     */
    function updateDurationOptions() {
      if (!selectedStartTime) {
        durChips.forEach(chip => {
          chip.disabled = true;
          chip.classList.add('disabled');
          chip.classList.remove('active');
          chip.title = 'No available start time for this date';
        });
        if (customEndRow) customEndRow.classList.remove('show');
        return;
      }

      const [sh, sm] = selectedStartTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const closingMin = 21 * 60; // 9:00 PM (end of all laboratory classes)
      const remainingMin = Math.max(0, closingMin - startMin);

      let currentSelectionValid = false;

      durChips.forEach(chip => {
        const val = chip.dataset.min;
        if (val === 'custom') {
          const canCustom = remainingMin >= 30;
          chip.disabled = !canCustom;
          chip.classList.toggle('disabled', !canCustom);
          if (isCustomDuration && canCustom) currentSelectionValid = true;
        } else {
          const chipMin = parseInt(val, 10);
          const exceedsClose = chipMin > remainingMin;
          chip.disabled = exceedsClose;
          chip.classList.toggle('disabled', exceedsClose);
          if (exceedsClose) {
            chip.title = `Exceeds campus laboratory hours (closing at 9:00 PM). Max: ${formatDurationLabel(remainingMin)}`;
          } else {
            chip.removeAttribute('title');
            if (!isCustomDuration && selectedDurationMin === chipMin) {
              currentSelectionValid = true;
            }
          }
        }
      });

      // If current duration exceeds remaining time until 9:00 PM, fallback to largest valid duration
      if (!currentSelectionValid) {
        if (isCustomDuration && remainingMin < 30) {
          isCustomDuration = false;
        }
        if (!isCustomDuration) {
          const validChips = Array.from(durChips).filter(c => c.dataset.min !== 'custom' && !c.disabled);
          if (validChips.length > 0) {
            // Prefer 120 (2 hrs) if valid, otherwise the largest valid chip
            const preferred = validChips.find(c => c.dataset.min === '120') || validChips[validChips.length - 1];
            selectedDurationMin = parseInt(preferred.dataset.min, 10);
            durChips.forEach(c => c.classList.toggle('active', c === preferred));
          } else {
            selectedDurationMin = 30;
          }
        }
      }

      if (isCustomDuration) {
        populateCustomEndOptions();
      }
    }

    // Dynamic Live Preview Calculator
    function updateSchedulePreview() {
      const sscTime = modal.querySelector('#ktSscTimeText');
      const sscDetail = modal.querySelector('#ktSscDetailText');
      const sscCard = modal.querySelector('#ktSessionSummaryCard');
      const submitBtn = modal.querySelector('#btnSubmitDashKeyRequest');

      if (!selectedStartTime) {
        if (sscTime) {
          sscTime.textContent = 'No reservation time available for this date';
          sscTime.style.color = '#EF4444';
        }
        if (sscDetail) {
          sscDetail.textContent = 'Please choose another date from the date selector above';
        }
        if (sscCard) sscCard.classList.add('is-empty');
        if (customEndRow) customEndRow.classList.remove('show');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add('disabled');
          submitBtn.innerHTML = '<i data-lucide="calendar-x" style="width:16px;height:16px;"></i><span>No Slots Available for this Date</span>';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
        }
        return;
      }

      if (sscCard) sscCard.classList.remove('is-empty');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('disabled');
        submitBtn.innerHTML = '<i data-lucide="calendar-check" style="width:16px;height:16px;"></i><span>Submit Advance Reservation</span>';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: submitBtn });
        }
      }

      let effectiveEndTime = '';
      let effectiveDurationText = '';

      const [sh, sm] = selectedStartTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      let endMin = startMin;

      if (isCustomDuration && customSelect) {
        effectiveEndTime = customSelect.value;
        const [eh, em] = (effectiveEndTime || selectedStartTime).split(':').map(Number);
        endMin = eh * 60 + em;
      } else {
        effectiveEndTime = addMinutesToTime(selectedStartTime, selectedDurationMin);
        const [eh, em] = effectiveEndTime.split(':').map(Number);
        endMin = eh * 60 + em;
      }

      const diffMin = endMin - startMin;
      if (diffMin <= 0) {
        if (sscTime) {
          sscTime.textContent = `${formatTime12h(selectedStartTime)} – ${formatTime12h(effectiveEndTime)} (Invalid)`;
          sscTime.style.color = '#DC2626';
        }
        if (sscDetail) sscDetail.textContent = 'End time must be after start time';
        return;
      } else {
        effectiveDurationText = formatDurationLabel(diffMin);
      }

      if (customEndRow) {
        customEndRow.classList.toggle('show', isCustomDuration);
      }

      const earlyPickupStr = getEarlyPickupTime(selectedStartTime);
      if (sscTime) {
        sscTime.textContent = `${formatTime12h(selectedStartTime)} – ${formatTime12h(effectiveEndTime)} (${effectiveDurationText})`;
        sscTime.style.color = '';
      }
      if (sscDetail) {
        sscDetail.textContent = `Pickup from ${earlyPickupStr}`;
      }

      queueRoomsAvailabilityStatus();
    }

    function updateAvailableTimeSlots() {
      const chosenDate = dateSelect ? dateSelect.value : null;
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const isToday = chosenDate === todayStr;
      const currentTotalMin = now.getHours() * 60 + now.getMinutes();

      let firstAvailableChip = null;
      let currentSelectionStillValid = false;

      timeChips.forEach(chip => {
        const timeVal = chip.dataset.time;
        const [h, m] = timeVal.split(':').map(Number);
        const chipTotalMin = h * 60 + m;

        if (isToday && chipTotalMin <= currentTotalMin) {
          chip.disabled = true;
          chip.classList.add('disabled');
          chip.classList.remove('active');
        } else {
          chip.disabled = false;
          chip.classList.remove('disabled');
          if (!firstAvailableChip) {
            firstAvailableChip = chip;
          }
          if (timeVal === selectedStartTime) {
            currentSelectionStillValid = true;
          }
        }
      });

      const noSlotsNotice = modal.querySelector('#ktNoSlotsNotice');
      const periodTabs = modal.querySelector('#ktPeriodTabs');

      if (!firstAvailableChip) {
        selectedStartTime = null;
        if (noSlotsNotice) noSlotsNotice.style.display = 'flex';
        if (periodTabs) periodTabs.style.display = 'none';
        Object.keys(grids).forEach(k => {
          if (grids[k]) grids[k].style.display = 'none';
        });
      } else {
        if (noSlotsNotice) noSlotsNotice.style.display = 'none';
        if (periodTabs) periodTabs.style.display = 'flex';

        if (!currentSelectionStillValid) {
          selectedStartTime = firstAvailableChip.dataset.time;
        }

        // Auto-activate the period tab corresponding to selectedStartTime
        if (selectedStartTime) {
          const h = parseInt(selectedStartTime.split(':')[0], 10);
          let targetPeriod = 'morning';
          if (h >= 12 && h < 17) targetPeriod = 'afternoon';
          else if (h >= 17) targetPeriod = 'evening';
          switchPeriodTab(targetPeriod);
        }
      }

      timeChips.forEach(c => c.classList.toggle('active', c.dataset.time === selectedStartTime && !c.disabled));
      updateDurationOptions();
      updateSchedulePreview();
    }

    // Period Tabs Switching
    periodBtns.forEach(btn => {
      btn.onclick = () => {
        switchPeriodTab(btn.dataset.period);
      };
    });

    // Time Chips Click
    timeChips.forEach(chip => {
      chip.onclick = () => {
        if (chip.disabled) return;
        selectedStartTime = chip.dataset.time;
        timeChips.forEach(c => c.classList.toggle('active', c === chip));
        updateDurationOptions();
        updateSchedulePreview();
      };
    });

    // Duration Chips Click
    durChips.forEach(chip => {
      chip.onclick = () => {
        if (chip.disabled || !selectedStartTime) return;
        const minVal = chip.dataset.min;
        durChips.forEach(c => c.classList.toggle('active', c === chip));
        if (minVal === 'custom') {
          isCustomDuration = true;
          populateCustomEndOptions();
        } else {
          isCustomDuration = false;
          selectedDurationMin = parseInt(minVal, 10);
        }
        updateSchedulePreview();
      };
    });

    if (customSelect) {
      customSelect.onchange = () => {
        updateSchedulePreview();
      };
    }

    let _roomAvailabilityData = {};
    let _availDebounceTimer = null;

    function applyRoomAvailabilityUI() {
      const roomsInfo = _roomAvailabilityData || {};
      const currentRoomId = roomInput ? roomInput.value : null;
      const roomBadge = modal.querySelector('#ktRoomSelectedBadge');
      const conflictBanner = modal.querySelector('#ktRoomConflictBanner');
      const submitBtn = modal.querySelector('#btnSubmitDashKeyRequest');

      // Update options badges in the room menu
      const roomOptions = roomMenu ? roomMenu.querySelectorAll('.kt-picker-option') : [];
      roomOptions.forEach(opt => {
        const rId = opt.dataset.value;
        const info = roomsInfo[rId] || {
          status: 'AVAILABLE',
          label: 'Available',
          badgeClass: 'is-available'
        };

        let rightWrap = opt.querySelector('.kt-opt-right');
        if (!rightWrap) {
          rightWrap = document.createElement('div');
          rightWrap.className = 'kt-opt-right';
          opt.appendChild(rightWrap);
        }
        rightWrap.innerHTML = `<span class="kt-opt-badge ${info.badgeClass}">${info.label}</span>`;
      });

      // Update trigger badge for the currently selected room
      const selectedInfo = roomsInfo[currentRoomId] || {
        status: 'AVAILABLE',
        label: 'Available',
        badgeClass: 'is-available'
      };

      if (roomBadge) {
        roomBadge.className = `kt-opt-badge ${selectedInfo.badgeClass}`;
        roomBadge.textContent = selectedInfo.label;
      }

      // If no valid start time, schedule preview handles submitBtn & banner
      if (!selectedStartTime) {
        if (conflictBanner) conflictBanner.style.display = 'none';
        return;
      }

      if (selectedInfo.status === 'RESERVED') {
        if (conflictBanner) {
          conflictBanner.className = 'kt-room-conflict-banner is-reserved';
          conflictBanner.style.display = 'flex';
          conflictBanner.innerHTML = `
            <i data-lucide="alert-triangle"></i>
            <div>
              <strong>Room already reserved:</strong> This laboratory is reserved by <em>${escapeText(selectedInfo.requesterName || 'another faculty')}</em> on this date (${formatTime12h(selectedInfo.startTime)} – ${formatTime12h(selectedInfo.endTime)}). Please choose another room or time slot.
            </div>
          `;
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: conflictBanner });
          }
        }
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add('disabled');
          submitBtn.innerHTML = '<i data-lucide="ban" style="width:16px;height:16px;"></i><span>Room Already Reserved</span>';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
        }
      } else if (selectedInfo.status === 'PENDING') {
        if (conflictBanner) {
          conflictBanner.className = 'kt-room-conflict-banner is-pending';
          conflictBanner.style.display = 'flex';
          conflictBanner.innerHTML = `
            <i data-lucide="clock"></i>
            <div>
              <strong>Pending reservation request:</strong> A reservation request by <em>${escapeText(selectedInfo.requesterName || 'another faculty')}</em> (${formatTime12h(selectedInfo.startTime)} – ${formatTime12h(selectedInfo.endTime)}) is awaiting Department Head review for this room.
            </div>
          `;
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: conflictBanner });
          }
        }
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.classList.add('disabled');
          submitBtn.innerHTML = '<i data-lucide="clock" style="width:16px;height:16px;"></i><span>Pending Request Exists</span>';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
        }
      } else {
        if (conflictBanner) {
          conflictBanner.style.display = 'none';
          conflictBanner.innerHTML = '';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('disabled');
          submitBtn.innerHTML = '<i data-lucide="calendar-check" style="width:16px;height:16px;"></i><span>Submit Advance Reservation</span>';
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
        }
      }
    }

    async function fetchRoomsAvailability() {
      const chosenDate = dateSelect ? dateSelect.value : null;
      const startTime = selectedStartTime;
      let endTime = '';

      if (isCustomDuration && customSelect) {
        endTime = customSelect.value;
      } else if (selectedStartTime) {
        endTime = addMinutesToTime(selectedStartTime, selectedDurationMin);
      }

      if (!chosenDate || !startTime || !endTime) return;

      try {
        const query = new URLSearchParams({
          date: chosenDate,
          startTime,
          endTime
        });
        const res = await fetch(`/api/keys/room-availability?${query.toString()}`, {
          credentials: 'include'
        });
        if (!res.ok) return;
        const resData = await res.json();
        _roomAvailabilityData = resData.rooms || {};
        applyRoomAvailabilityUI();
      } catch (err) {
        console.warn('[DashboardKeyRequests] Failed to check room availability:', err);
      }
    }

    function queueRoomsAvailabilityStatus() {
      if (_availDebounceTimer) clearTimeout(_availDebounceTimer);
      _availDebounceTimer = setTimeout(fetchRoomsAvailability, 80);
    }

    // Laboratory Room Custom Picker
    const roomTrigger = modal.querySelector('#ktRoomTrigger');
    const roomMenu = modal.querySelector('#ktRoomMenu');
    const roomTitle = modal.querySelector('#ktRoomSelectedTitle');
    const roomBadge = modal.querySelector('#ktRoomSelectedBadge');
    const roomInput = modal.querySelector('#dashReqRoomSelect');

    if (roomTrigger && roomMenu) {
      roomTrigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = roomMenu.style.display !== 'none';
        closeAllPickers();
        if (!isOpen) {
          roomMenu.style.display = 'flex';
          roomTrigger.classList.add('is-open');
          roomTrigger.setAttribute('aria-expanded', 'true');
        }
      };

      const roomOptions = roomMenu.querySelectorAll('.kt-picker-option');
      roomOptions.forEach(opt => {
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const title = opt.dataset.title;

          roomOptions.forEach(o => {
            o.classList.toggle('selected', o === opt);
          });

          if (roomInput) roomInput.value = val;
          if (roomTitle) roomTitle.textContent = title;

          applyRoomAvailabilityUI();

          roomMenu.style.display = 'none';
          roomTrigger.classList.remove('is-open');
          roomTrigger.setAttribute('aria-expanded', 'false');
        };
      });
    }

    // Date Custom Picker
    const dateTrigger = modal.querySelector('#ktDateTrigger');
    const dateMenu = modal.querySelector('#ktDateMenu');
    const dateTitle = modal.querySelector('#ktDateSelectedTitle');

    if (dateTrigger && dateMenu) {
      dateTrigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = dateMenu.style.display !== 'none';
        closeAllPickers();
        if (!isOpen) {
          dateMenu.style.display = 'flex';
          dateTrigger.classList.add('is-open');
          dateTrigger.setAttribute('aria-expanded', 'true');
        }
      };

      const dateOptionsList = dateMenu.querySelectorAll('.kt-picker-option');
      dateOptionsList.forEach(opt => {
        opt.onclick = (e) => {
          e.stopPropagation();
          const val = opt.dataset.value;
          const title = opt.dataset.title;

          dateOptionsList.forEach(o => {
            o.classList.toggle('selected', o === opt);
          });

          if (dateSelect) dateSelect.value = val;
          if (dateTitle) dateTitle.textContent = title;

          dateMenu.style.display = 'none';
          dateTrigger.classList.remove('is-open');
          dateTrigger.setAttribute('aria-expanded', 'false');

          updateAvailableTimeSlots();
        };
      });
    }

    if (customEndTrigger && customEndMenu) {
      customEndTrigger.onclick = (e) => {
        e.stopPropagation();
        const isOpen = customEndMenu.style.display !== 'none';
        closeAllPickers();
        if (!isOpen) {
          customEndMenu.style.display = 'flex';
          customEndTrigger.classList.add('is-open');
          customEndTrigger.setAttribute('aria-expanded', 'true');
        }
      };
    }

    if (dateSelect) {
      dateSelect.onchange = updateAvailableTimeSlots;
    }

    // Run initial time slot availability check and preview
    updateAvailableTimeSlots();

    const submitBtn = modal.querySelector('#btnSubmitDashKeyRequest');
    const roomSelect = modal.querySelector('#dashReqRoomSelect');
    const reasonInput = modal.querySelector('#dashReqReasonInput');
    const charCountEl = modal.querySelector('#dashReqCharCount');

    if (reasonInput && charCountEl) {
      const updateCharCount = () => {
        const len = reasonInput.value.length;
        charCountEl.textContent = `${len} / 150`;
        charCountEl.classList.toggle('counter-warning', len >= 135 && len < 150);
        charCountEl.classList.toggle('counter-limit', len >= 150);
      };
      reasonInput.addEventListener('input', updateCharCount);
      updateCharCount();
    }

    if (submitBtn) {
      submitBtn.onclick = async () => {
        const roomId = roomSelect ? roomSelect.value : null;
        const reservationDate = dateSelect ? dateSelect.value : null;
        const startTime = selectedStartTime;
        let endTime = isCustomDuration
          ? (customSelect ? customSelect.value : addMinutesToTime(selectedStartTime, 120))
          : addMinutesToTime(selectedStartTime, selectedDurationMin);
        const reason = reasonInput ? reasonInput.value.trim() : '';

        if (!roomId) {
          if (typeof global.showToast === 'function') global.showToast('Please select a target laboratory room.', 'error');
          return;
        }

        if (_roomAvailabilityData && _roomAvailabilityData[roomId]) {
          const roomStatus = _roomAvailabilityData[roomId].status;
          if (roomStatus === 'RESERVED') {
            if (typeof global.showToast === 'function') {
              global.showToast('This room is already reserved for this date and time window. Please select another room or time.', 'error', 'Room Unavailable');
            }
            return;
          }
          if (roomStatus === 'PENDING') {
            if (typeof global.showToast === 'function') {
              global.showToast('A reservation request for this room is already pending review for this time window.', 'warning', 'Pending Request');
            }
            return;
          }
        }

        if (!reservationDate) {
          if (typeof global.showToast === 'function') global.showToast('Please select a reservation date.', 'error');
          return;
        }

        if (!startTime || !endTime) {
          if (typeof global.showToast === 'function') global.showToast('Please select valid start and end times.', 'error');
          return;
        }

        if (reason.length < 5) {
          if (typeof global.showToast === 'function') global.showToast('Please provide a justification (at least 5 characters).', 'warning');
          return;
        }

        if (reason.length > 150) {
          if (typeof global.showToast === 'function') global.showToast('Purpose cannot exceed 150 characters.', 'warning');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <i data-lucide="loader-2" class="animate-spin" style="width:16px;height:16px;"></i>
          <span>Submitting Reservation...</span>
        `;
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: submitBtn });
        }

        try {
          const res = await fetch('/api/keys/request-additional', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              roomId: Number(roomId),
              reservationDate,
              startTime,
              endTime,
              reason
            })
          });

          const data = await res.json();

          if (!res.ok) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="calendar-check" style="width: 16px; height: 16px;"></i><span>Submit Advance Reservation</span>`;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons({ root: submitBtn });
            }
            if (typeof global.showToast === 'function') {
              global.showToast(data.error || 'Failed to submit reservation.', 'error');
            }
            return;
          }

          closeModal();
          if (typeof global.showToast === 'function') {
            global.showToast('Advance key reservation submitted successfully to Department Head!', 'success', 'Reservation Sent');
          }
          await loadFacultyKeyRequestStatus();

        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<i data-lucide="calendar-check" style="width: 16px; height: 16px;"></i><span>Submit Advance Reservation</span>`;
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: submitBtn });
          }
          if (typeof global.showToast === 'function') {
            global.showToast('Network error while submitting reservation.', 'error');
          }
        }
      };
    }
  }

  function initHeaderReserveButton() {
    const role = getCurrentUserRole();
    const btns = document.querySelectorAll('.btn-reserve-key-header, #btnHeaderReserveKey');

    if (isApproverOnlyRole(role) || !isKeyRequesterRole(role)) {
      btns.forEach(btn => {
        btn.style.display = 'none';
      });
      return;
    }

    btns.forEach(btn => {
      btn.style.display = 'inline-flex';
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        if (_lastFacultyReqData && _lastFacultyReqData.heldCount >= 2) {
          if (typeof global.showToast === 'function') {
            global.showToast('You already hold 2 laboratory keys (maximum allowed). Please return one before requesting another.', 'warning', 'Limit Reached');
          } else {
            alert('You already hold 2 laboratory keys (maximum allowed). Please return one before requesting another.');
          }
          return;
        }
        openAdvanceKeyRequestModal(_lastFacultyReqData || {});
      });
    });

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function initFacultyKeyRequests() {
    if (_keyRequestsInitialized) return;
    _keyRequestsInitialized = true;

    const role = getCurrentUserRole();
    if (isApproverOnlyRole(role) || !isKeyRequesterRole(role)) {
      initHeaderReserveButton();
      const banner = document.getElementById('facultyKeyStatusBanner');
      if (banner) {
        banner.style.display = 'none';
        banner.innerHTML = '';
      }
      return;
    }

    initHeaderReserveButton();
    loadFacultyKeyRequestStatus();

    // Auto-poll for status updates every 6 seconds
    setInterval(loadFacultyKeyRequestStatus, 6000);
  }

  // Expose
  global.dashboardKeyRequests = {
    loadFacultyKeyRequestStatus,
    openAdvanceKeyRequestModal,
    initFacultyKeyRequests,
    generateReservationDateOptions,
    generateTimeOptions,
    getCurrentUserRole,
    isApproverOnlyRole,
    isKeyRequesterRole
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFacultyKeyRequests);
  } else {
    initFacultyKeyRequests();
  }

})(typeof window !== 'undefined' ? window : this);
