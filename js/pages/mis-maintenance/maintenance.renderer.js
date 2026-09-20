/**
 * LabSync – MIS Maintenance Renderer  |  js/pages/mis-maintenance/maintenance.renderer.js
 * Pure presentation component for maintenance table rows, issue badges, and error/empty states.
 */

(function (global) {
  'use strict';

  /**
   * Safe HTML string escaper.
   * @param {string} str
   * @returns {string}
   */
  function escapeText(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    if (typeof window !== 'undefined' && typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Helper to parse raw issue description.
   * Delegates to canonical reportParser (js/reports/report.parser.js).
   * @param {string} desc - Raw issue description text
   * @returns {{section: string, issues: string, remarks: string}}
   */
  function parseIssueDesc(desc) {
    if (global.reportParser && typeof global.reportParser.parseIssueDescription === 'function') {
      return global.reportParser.parseIssueDescription(desc);
    }
    if (typeof global.parseIssueDescription === 'function') {
      return global.parseIssueDescription(desc);
    }
    if (!desc) return { section: 'N/A', issues: 'Hardware Issue', remarks: '' };

    const sectionMatch = desc.match(/\[Program & Section:\s*([^\]]+)\]/i);
    const issuesMatch = desc.match(/\[Issues:\s*([^\]]+)\]/i);
    const remarksMatch = desc.match(/Remarks:\s*(.*)$/is);

    const section = sectionMatch ? sectionMatch[1].trim() : 'N/A';
    const issues = issuesMatch ? issuesMatch[1].trim() : 'Hardware Issue';
    let remarks = remarksMatch ? remarksMatch[1].trim() : '';

    if (!remarks) {
      if (!desc.includes('[') && !desc.includes(']')) {
        remarks = desc.trim();
      } else {
        remarks = desc
          .replace(/\[Program & Section:[^\]]+\]/gi, '')
          .replace(/\[Issues:[^\]]+\]/gi, '')
          .replace(/Remarks:/gi, '')
          .trim();
      }
    }

    return { section, issues, remarks: remarks || 'None' };
  }

  /**
   * Formats issue tag HTML elements with Lucide icons.
   * @param {string} issuesStr
   * @param {string} remarksStr
   * @param {boolean} isModal
   * @returns {string} HTML string
   */
  function formatIssueBadges(issuesStr, remarksStr, isModal = false) {
    const iconSize = isModal ? '13px' : '12px';
    const extraStyle = isModal ? ' style="font-size:12.5px;padding:5px 12px;"' : '';
    const issues = (issuesStr || '').split(',').map(s => s.trim()).filter(Boolean);
    const remarks = (remarksStr || '').trim();
    const hasRemarks = remarks.length > 0 &&
      remarks.toLowerCase() !== 'none' &&
      remarks.toLowerCase() !== 'no remarks provided' &&
      remarks.toLowerCase() !== 'no details provided.';

    if (issues.length === 0) {
      if (hasRemarks) {
        return `<span class="issue-tag other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Other</span>`;
      }
      return `<span class="issue-tag ok"${extraStyle}><i data-lucide="check-square" style="width:${iconSize};height:${iconSize};"></i> None</span>`;
    }

    return issues.map(item => {
      const lower = item.toLowerCase();
      if (lower === 'none' || lower === 'n/a') {
        if (hasRemarks) {
          return `<span class="issue-tag other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Other</span>`;
        }
        return `<span class="issue-tag ok"${extraStyle}><i data-lucide="check-square" style="width:${iconSize};height:${iconSize};"></i> None</span>`;
      }
      if (lower === 'others' || lower === 'other') {
        return `<span class="issue-tag other"${extraStyle}><i data-lucide="alert-circle" style="width:${iconSize};height:${iconSize};"></i> Other</span>`;
      }
      return `<span class="issue-tag bad"${extraStyle}><i data-lucide="alert-triangle" style="width:${iconSize};height:${iconSize};"></i> ${escapeText(item)}</span>`;
    }).join(' ');
  }

  /**
   * Computes a deterministic signature of the rendered maintenance dataset.
   * @param {Array} reports
   * @returns {string}
   */
  function computeMaintenanceSignature(reports) {
    if (!Array.isArray(reports) || reports.length === 0) return 'empty';
    return reports.map(r =>
      `${r.Report_ID}_${r.Status}_${r.Room_Number}_${r.PC_Number}_${r.Priority_Level || ''}_${r.Date_Reported || ''}_${r.Issue_Description || ''}_${r.Resolved_By_Name || ''}_${r.Resolved_By_Role || ''}`
    ).join('|');
  }

  /**
   * Renders table rows into #dynamicMaintenanceRows.
   * @param {Array} reports - Array of filtered report objects
   * @param {HTMLElement} [targetElement] - Optional tbody override
   */
  function renderTableRows(reports, targetElement) {
    const tbody = targetElement || document.getElementById('dynamicMaintenanceRows');
    if (!tbody) return;

    const wrapper = tbody.closest ? tbody.closest('.maint-table-wrapper') : null;
    const table = tbody.closest ? tbody.closest('.maint-table') : (tbody.parentElement && tbody.parentElement.tagName === 'TABLE' ? tbody.parentElement : null);

    if (!Array.isArray(reports) || reports.length === 0) {
      if (wrapper && wrapper.classList) wrapper.classList.add('is-empty');
      if (table && table.classList) table.classList.add('is-empty');

      const sig = 'empty';
      if (tbody._lastRenderSignature === sig) return;
      tbody._lastRenderSignature = sig;
      tbody.innerHTML = `
        <tr class="maintenance-empty-row">
          <td colspan="6" class="maintenance-empty-cell">
            <div class="maintenance-empty-state" role="status" aria-live="polite">
              <div class="maintenance-empty-icon-wrap" aria-hidden="true">
                <i data-lucide="clipboard-list"></i>
              </div>
              <p class="maintenance-empty-text">No maintenance tickets match the selected filter.</p>
            </div>
          </td>
        </tr>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: tbody });
      }
      return;
    }

    if (wrapper && wrapper.classList) wrapper.classList.remove('is-empty');
    if (table && table.classList) table.classList.remove('is-empty');

    const signature = computeMaintenanceSignature(reports);
    if (tbody._lastRenderSignature === signature) {
      return; // Signature match: identical rendered dataset, skip DOM write and icon recreation
    }
    tbody._lastRenderSignature = signature;

    tbody.innerHTML = reports.map(report => {
      const dateObj = new Date(report.Date_Reported);
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const parsed = parseIssueDesc(report.Issue_Description);

      const viewInfoBtnHtml = `
        <button type="button"
                class="btn-view-ticket-info"
                data-action="view-ticket-details"
                data-report-id="${report.Report_ID}"
                title="View full ticket details"
                aria-label="View full ticket details for ticket LS-TKT-${report.Report_ID}">
          <i data-lucide="eye" style="width:14px;height:14px;"></i>
          <span>View Details</span>
        </button>
      `;

      let actionsHtml = '';
      if (report.Status !== 'Resolved') {
        actionsHtml = `
          <div class="table-actions-cluster">
            ${viewInfoBtnHtml}
            <button type="button" class="btn-resolve-ticket" data-action="resolve-ticket" data-report-id="${report.Report_ID}">
              <i data-lucide="check" style="width:14px;height:14px;"></i> Mark Resolved
            </button>
          </div>
        `;
      } else {
        let resTimeFormatted = '';
        if (report.Resolved_At) {
          const resDateObj = new Date(report.Resolved_At);
          if (!isNaN(resDateObj.getTime())) {
            resTimeFormatted = resDateObj.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }) + ' • ' + resDateObj.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
          }
        }

        const resolverTitle = report.Resolved_By_Name
          ? `Resolved by ${escapeText(report.Resolved_By_Name)} (${escapeText(report.Resolved_By_Role || 'MIS Staff')})`
          : 'Work Order Completed';

        actionsHtml = `
          <div class="table-actions-cluster">
            ${viewInfoBtnHtml}
            <div class="table-resolved-wrap">
              <button type="button"
                      class="completed-chip interactive"
                      data-action="view-ticket-details"
                      data-report-id="${report.Report_ID}"
                      data-resolver-name="${escapeText(report.Resolved_By_Name || '')}"
                      data-resolver-role="${escapeText(report.Resolved_By_Role || 'MIS Staff')}"
                      data-resolved-at="${resTimeFormatted || ''}"
                      aria-label="${resolverTitle}"
                      title="${resolverTitle}">
                <i data-lucide="check-check" style="width:14px;height:14px;"></i><span>Completed</span>
              </button>
            </div>
          </div>
        `;
      }

      const sectionChip = parsed.section && parsed.section !== 'N/A'
        ? `<span class="section-chip">${escapeText(parsed.section)}</span>`
        : '';

      const issueBadges = formatIssueBadges(parsed.issues, parsed.remarks, false);

      const rawRemarks = (parsed.remarks || '').trim();
      const lowerRemarks = rawRemarks.toLowerCase();
      const isNone = !rawRemarks ||
        lowerRemarks === 'none' ||
        lowerRemarks === 'n/a' ||
        lowerRemarks === 'no remarks provided' ||
        lowerRemarks === 'no details provided.' ||
        lowerRemarks === 'none.';

      // Threshold: Single-line limit (~30 chars) before adding the View All expander
      const isLong = !isNone && (rawRemarks.length > 30 || rawRemarks.includes('\n'));

      let remarksHtml = '';
      const remarksText = isNone ? 'None' : rawRemarks;
      const tooltipTitle = isNone ? 'No student remarks provided' : `Student Remarks: "${escapeText(rawRemarks)}" (Click to view full report)`;

      remarksHtml = `
        <div class="remarks-fixed-box ${isNone ? 'is-none' : ''}" data-action="view-ticket-details" data-report-id="${report.Report_ID}" title="${tooltipTitle}">
          <i data-lucide="message-square" class="remarks-icon" style="width:13px; height:13px; color:var(--primary-teal); flex-shrink:0;"></i>
          <span class="remarks-fixed-text ${isNone ? 'empty-text' : ''}">${escapeText(remarksText)}</span>
        </div>
      `;

      return `
        <tr class="maintenance-row" data-report-id="${report.Report_ID}">
          <td class="col-ticket" style="white-space: nowrap;">
            <span class="ticket-chip" data-action="view-ticket-details" data-report-id="${report.Report_ID}">
              LS-TKT-${report.Report_ID}
            </span>
          </td>
          <td class="col-date" style="white-space: nowrap;">
            <div class="col-date-wrap">
              <i data-lucide="calendar" class="col-date-icon"></i>
              <div class="col-date-text">
                <span class="date-main">${dateStr}</span>
                <span class="time-sub">${timeStr}</span>
              </div>
            </div>
          </td>
          <td class="col-room" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="map-pin" class="cell-icon room"></i>
              Room ${escapeText(report.Room_Number)}
            </div>
          </td>
          <td class="col-pc" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="monitor" class="cell-icon pc"></i>
              PC #${escapeText(report.PC_Number)}
            </div>
          </td>
          <td class="col-issues">
            <div class="ticket-badge-group">
              ${issueBadges}
              ${sectionChip}
            </div>
            ${remarksHtml}
          </td>
          <td class="col-actions" style="text-align: center; white-space: nowrap;">
            ${actionsHtml}
          </td>
        </tr>
      `;
    }).join('');

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbody });
    }

    initResolverPopoverDelegation();
  }  let _popoverDelegationReady = false;
  let _activeChip = null;
  let _popoverHideTimeout = null;
  let _singletonTooltip = null;

  function getSingletonTooltip() {
    if (typeof document === 'undefined') return null;
    let tooltip = document.getElementById('table-resolver-tooltip');
    if (!tooltip && document.body) {
      tooltip = document.createElement('div');
      tooltip.id = 'table-resolver-tooltip';
      tooltip.className = 'table-resolver-popover';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.setAttribute('aria-hidden', 'true');
      document.body.appendChild(tooltip);

      tooltip.addEventListener('mouseenter', () => {
        clearTimeout(_popoverHideTimeout);
      });
      tooltip.addEventListener('mouseleave', () => {
        scheduleDismissPopover();
      });
      tooltip.addEventListener('click', (e) => {
        const actionEl = e.target.closest('[data-action="view-ticket-details"]');
        if (actionEl) {
          const repId = actionEl.getAttribute('data-report-id');
          if (repId && typeof global.viewTicketModal === 'function') {
            global.viewTicketModal(repId);
          }
          dismissResolverPopover();
        }
      });
    }
    _singletonTooltip = tooltip;
    return tooltip;
  }

  function positionResolverPopover(chip) {
    if (!chip || (typeof window !== 'undefined' && window.innerWidth <= 768)) return;
    if (typeof clearTimeout === 'function') clearTimeout(_popoverHideTimeout);
    _activeChip = chip;

    const tooltip = getSingletonTooltip();
    if (!tooltip) return;

    const resolverName = chip.getAttribute('data-resolver-name') || '';
    const resolverRole = chip.getAttribute('data-resolver-role') || 'MIS Staff';
    const resolvedAt = chip.getAttribute('data-resolved-at') || '';

    tooltip.innerHTML = `
      <div class="popover-arrow"></div>
      <div class="popover-header">
        <span class="popover-tag">${resolverName ? 'RESOLVED BY' : 'WORK ORDER COMPLETED'}</span>
        <span class="popover-time">${resolvedAt}</span>
      </div>
      ${resolverName ? `
      <div class="popover-user-row">
        <div class="popover-avatar">
          <i data-lucide="user" style="width:13px;height:13px;"></i>
        </div>
        <div class="popover-user-info">
          <span class="popover-name">${escapeText(resolverName)}</span>
          <span class="popover-role">${escapeText(resolverRole)}</span>
        </div>
      </div>
      ` : ''}
    `;

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tooltip });
    }

    if (typeof chip.getBoundingClientRect !== 'function') return;
    const chipRect = chip.getBoundingClientRect();

    tooltip.style.visibility = 'hidden';
    tooltip.style.display = 'block';

    const tooltipWidth = tooltip.offsetWidth || 280;
    const tooltipHeight = tooltip.offsetHeight || 72;

    // Check space above chip (accounting for sticky table header / nav bar)
    const spaceAbove = chipRect.top - 70;
    const flipDown = spaceAbove < (tooltipHeight + 14);

    tooltip.classList.toggle('popover-flip-down', flipDown);

    // 6px air gap: with 10px rotated square (sticks out 5px), arrow tip points cleanly 1px above/below chip
    const airGap = 6;
    const top = flipDown
      ? (chipRect.bottom + airGap)
      : (chipRect.top - tooltipHeight - airGap);

    // Center popover horizontally over the chip
    const chipCenter = chipRect.left + (chipRect.width / 2);
    let left = chipCenter - (tooltipWidth / 2);

    // Keep popover comfortably within viewport bounds
    const winWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1200;
    const maxLeft = winWidth - tooltipWidth - 16;
    const minLeft = 16;
    if (left > maxLeft) left = maxLeft;
    if (left < minLeft) left = minLeft;

    // Direct arrow precisely at chip center
    const arrowLeft = chipCenter - left;
    const clampedArrowLeft = Math.max(22, Math.min(tooltipWidth - 22, arrowLeft));
    tooltip.style.setProperty('--arrow-left', `${Math.round(clampedArrowLeft)}px`);

    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.visibility = 'visible';
    tooltip.setAttribute('aria-hidden', 'false');
    tooltip.classList.add('popover-active');
  }

  function scheduleDismissPopover() {
    if (typeof clearTimeout === 'function') clearTimeout(_popoverHideTimeout);
    if (typeof setTimeout === 'function') {
      _popoverHideTimeout = setTimeout(() => {
        dismissResolverPopover();
      }, 120);
    } else {
      dismissResolverPopover();
    }
  }

  function dismissResolverPopover() {
    if (typeof clearTimeout === 'function') clearTimeout(_popoverHideTimeout);
    if (_singletonTooltip) {
      _singletonTooltip.classList.remove('popover-active');
      _singletonTooltip.setAttribute('aria-hidden', 'true');
      _singletonTooltip.style.visibility = 'hidden';
    }
    _activeChip = null;
  }

  function initResolverPopoverDelegation() {
    if (_popoverDelegationReady || typeof document === 'undefined') return;
    _popoverDelegationReady = true;

    document.addEventListener('mouseover', (e) => {
      const chip = e.target && e.target.closest && e.target.closest('.completed-chip.interactive');
      if (chip) {
        positionResolverPopover(chip);
      }
    }, true);

    document.addEventListener('mouseout', (e) => {
      const chip = e.target && e.target.closest && e.target.closest('.completed-chip.interactive');
      if (chip) {
        const related = e.relatedTarget;
        if (related && (chip.contains(related) || (_singletonTooltip && _singletonTooltip.contains(related)))) {
          return;
        }
        scheduleDismissPopover();
      }
    }, true);

    document.addEventListener('focusin', (e) => {
      const chip = e.target && e.target.closest && e.target.closest('.completed-chip.interactive');
      if (chip) {
        positionResolverPopover(chip);
      }
    }, true);

    document.addEventListener('focusout', (e) => {
      const chip = e.target && e.target.closest && e.target.closest('.completed-chip.interactive');
      if (chip) {
        scheduleDismissPopover();
      }
    }, true);

    document.addEventListener('click', (e) => {
      const chip = e.target && e.target.closest && e.target.closest('.completed-chip.interactive');
      if (chip) {
        dismissResolverPopover();
      }
    }, true);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('scroll', () => dismissResolverPopover(), { passive: true });
    }

    const tableWrapper = (typeof document !== 'undefined' && typeof document.querySelector === 'function')
      ? document.querySelector('.maint-table-wrapper')
      : null;
    if (tableWrapper && typeof tableWrapper.addEventListener === 'function') {
      tableWrapper.addEventListener('scroll', () => dismissResolverPopover(), { passive: true });
    }
  }

  /**
   * Renders an error message row into the maintenance table.
   * @param {string} [message]
   * @param {HTMLElement} [targetElement]
   */
  function renderTableError(message, targetElement) {
    const tbody = targetElement || document.getElementById('dynamicMaintenanceRows');
    if (!tbody) return;

    const wrapper = tbody.closest ? tbody.closest('.maint-table-wrapper') : null;
    const table = tbody.closest ? tbody.closest('.maint-table') : (tbody.parentElement && tbody.parentElement.tagName === 'TABLE' ? tbody.parentElement : null);
    if (wrapper && wrapper.classList) wrapper.classList.add('is-empty');
    if (table && table.classList) table.classList.add('is-empty');

    tbody._lastRenderSignature = 'error';
    tbody.innerHTML = `
      <tr class="maintenance-empty-row maintenance-error-row">
        <td colspan="6" class="maintenance-empty-cell">
          <div class="maintenance-empty-state" role="alert">
            <div class="maintenance-empty-icon-wrap error" aria-hidden="true">
              <i data-lucide="alert-circle"></i>
            </div>
            <p class="maintenance-empty-text error">${escapeText(message || 'Failed to load maintenance tickets. Please refresh or try again later.')}</p>
          </div>
        </td>
      </tr>
    `;
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: tbody });
    }
  }

  const maintenanceRenderer = {
    parseIssueDesc,
    formatIssueBadges,
    renderTableRows,
    renderTableError,
    positionResolverPopover,
    dismissResolverPopover,
    getSingletonTooltip
  };

  global.maintenanceRenderer = maintenanceRenderer;
  global.formatIssueBadges = formatIssueBadges;

})(typeof window !== 'undefined' ? window : this);
