/**
 * LabSync Completed Tickets & Ticket Details Modal Coordinator | js/reports/report.modal.js
 * Manages the resolved tickets history modal, ticket details modal (full remarks view), and backdrop dismissal.
 */

(function (global) {
  'use strict';

  let _modalInitialized = false;
  let _delegationInitialized = false;
  let _modalTimeFilter = 'all';

  function getEscapeFn() {
    return global.escapeHtml || window.escapeHtml || ((s) => s || '');
  }

  /**
   * Filters and renders resolved completed tickets in the modal.
   */
  function filterCompletedTickets() {
    const modal = document.getElementById('completedTicketsModal');
    const modalBody = document.getElementById('modalCompletedList');
    const countBadge = document.getElementById('modalResolvedCountBadge');
    if (!modal || !modalBody) return;

    const modalSearch = document.getElementById('modalTicketSearch');
    const query = modalSearch ? modalSearch.value.trim() : '';

    const allReports = (global.reportStore && typeof global.reportStore.getReports === 'function')
      ? global.reportStore.getReports()
      : (global.allReports || []);

    let resolved = allReports.filter(r => (r.Status || '').toLowerCase() === 'resolved');

    const filters = global.reportFilters;
    if (filters && typeof filters.filterByTimeRange === 'function') {
      resolved = filters.filterByTimeRange(resolved, _modalTimeFilter);
    }

    if (query) {
      const matchFn = (filters && typeof filters.matchesReportQuery === 'function')
        ? filters.matchesReportQuery
        : (global.matchesReportQuery || (() => true));
      resolved = resolved.filter(r => matchFn(r, query));
    }

    if (countBadge) {
      countBadge.textContent = `${resolved.length} Resolved`;
    }

    const escapeFn = getEscapeFn();

    if (resolved.length === 0) {
      modalBody.innerHTML = `
        <div class="ui-empty-state" style="padding: 48px 0;">
          <div class="ui-empty-icon" style="width: 48px; height: 48px; border-radius: 50%; background: #F1F5F9; color: #64748B; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            <i data-lucide="check-circle-2" style="width: 24px; height: 24px;"></i>
          </div>
          <p style="font-size: 14px; font-weight: 600; color: var(--text-dark, #0F172A); margin: 0 0 4px 0;">No completed tickets found</p>
          <p style="font-size: 12.5px; color: var(--text-muted, #94A3B8); margin: 0;">${query ? `No resolved logs match "${escapeFn(query)}".` : 'There are no completed tickets in this time range.'}</p>
        </div>
      `;
    } else {
      const renderModalCard = (global.reportRenderer && global.reportRenderer.renderModalTicketCard) || global.renderModalTicketCard;
      modalBody.innerHTML = `
        <div class="modal-tickets-grid">
          ${resolved.map(r => renderModalCard(r)).join('')}
        </div>
      `;
    }

    if (global.lucide) global.lucide.createIcons();
  }

  /**
   * Syncs clear button visibility and accessibility attributes for modal search.
   */
  function syncModalSearchClearVisibility() {
    const modalSearch = document.getElementById('modalTicketSearch');
    const clearBtn = document.getElementById('modalTicketSearchClear');
    if (!modalSearch || !clearBtn) return;

    const hasText = modalSearch.value.length > 0;
    clearBtn.hidden = !hasText;
    clearBtn.style.display = hasText ? 'flex' : 'none';
    clearBtn.tabIndex = hasText ? 0 : -1;
    clearBtn.setAttribute('aria-hidden', String(!hasText));
  }

  /**
   * Initializes the search clear button behavior in Completed Tickets modal.
   */
  function initModalSearchClear() {
    const modalSearch = document.getElementById('modalTicketSearch');
    if (!modalSearch) return;

    let clearBtn = document.getElementById('modalTicketSearchClear');
    if (!clearBtn && modalSearch.parentElement) {
      clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.id = 'modalTicketSearchClear';
      clearBtn.className = 'modal-search-clear-btn input-icon-btn';
      clearBtn.setAttribute('aria-label', 'Clear search');
      clearBtn.title = 'Clear search';
      clearBtn.hidden = true;
      clearBtn.tabIndex = -1;
      clearBtn.style.display = 'none';
      clearBtn.setAttribute('aria-hidden', 'true');
      clearBtn.innerHTML = '<i data-lucide="x" style="width: 15px; height: 15px;"></i>';
      modalSearch.parentElement.appendChild(clearBtn);
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: clearBtn });
      }
    }

    if (!clearBtn) return;

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      modalSearch.value = '';
      syncModalSearchClearVisibility();
      filterCompletedTickets();
      modalSearch.focus();
    });

    ['input', 'change', 'focus', 'blur', 'keyup', 'paste'].forEach(evt => {
      modalSearch.addEventListener(evt, syncModalSearchClearVisibility);
    });

    syncModalSearchClearVisibility();
  }

  /**
   * Opens completed tickets modal and pre-fills search from page search if present.
   */
  function openCompletedModal() {
    const modal = document.getElementById('completedTicketsModal');
    if (!modal) return;

    if (!_modalInitialized) {
      _modalInitialized = true;

      initModalSearchClear();

      const modalSearch = document.getElementById('modalTicketSearch');
      if (modalSearch) {
        modalSearch.addEventListener('input', () => {
          syncModalSearchClearVisibility();
          filterCompletedTickets();
        });
      }

      const timeChips = modal.querySelectorAll('[data-time-filter]');
      timeChips.forEach(chip => {
        chip.addEventListener('click', () => {
          timeChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          _modalTimeFilter = chip.dataset.timeFilter;
          filterCompletedTickets();
        });
      });
    }

    const pageSearch = document.getElementById('reportSearchInput');
    const modalSearch = document.getElementById('modalTicketSearch');
    if (pageSearch && modalSearch && !modalSearch.value) {
      modalSearch.value = pageSearch.value.trim();
    }

    syncModalSearchClearVisibility();
    filterCompletedTickets();
    modal.style.display = 'flex';
    if (global.setModalOpenState) global.setModalOpenState(true);
    if (global.lucide) global.lucide.createIcons();
  }

  /**
   * Closes completed tickets modal.
   */
  function closeCompletedModal() {
    const modal = document.getElementById('completedTicketsModal');
    if (modal) modal.style.display = 'none';
    if (global.setModalOpenState) global.setModalOpenState(false);
    syncModalSearchClearVisibility();
  }

  /**
   * Closes and removes the Ticket Details Modal from DOM if present.
   */
  function closeTicketModal() {
    const existingModal = document.getElementById('ticket-details-modal');
    if (existingModal) {
      if (global.setModalOpenState) global.setModalOpenState(false);
      existingModal.remove();
    }
  }

  /**
   * Builds and presents the Full Report Modal overlay showing all report fields and linked submissions.
   * @param {number|string} reportId - ID of the report/issue to display
   * @param {Array} [reportsList] - Optional array of reports; defaults to global store
   */
  function viewTicketModal(reportId, reportsList) {
    const allReports = reportsList || (global.reportStore && typeof global.reportStore.getReports === 'function' ? global.reportStore.getReports() : global.allReports) || [];
    const report = allReports.find(r => r && (String(r.Report_ID) === String(reportId) || String(r.Issue_ID) === String(reportId)));
    if (!report) return;

    const dateObj = new Date(report.Date_Reported || report.Created_At || Date.now());
    const formattedDate = dateObj.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }) + ' · ' + dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const parser = global.reportParser || {};
    const parseFn = typeof parser.parseIssueDescription === 'function' ? parser.parseIssueDescription : (global.parseIssueDescription || (() => ({})));
    const parsed = parseFn(report.Issue_Description) || { section: 'N/A', issues: report.Issue_Type || 'Hardware Issue', remarks: '' };

    const escapeFn = getEscapeFn();
    const rawRemarks = (parsed.remarks || '').trim();
    const roomNum = report.Room_Number != null ? report.Room_Number : 'N/A';
    const pcNumRaw = report.PC_Number != null ? report.PC_Number : 'N/A';
    const formattedPcNum = (!isNaN(pcNumRaw) && String(pcNumRaw).length === 1) ? `0${pcNumRaw}` : String(pcNumRaw).replace(/^pc\s*/i, '');
    const studentName = report.Student_Name || 'Student';

    closeTicketModal();

    const linkedReports = Array.isArray(report.reports) && report.reports.length > 0
      ? report.reports
      : [{
          Student_Name: studentName,
          Issue_Description: report.Issue_Description,
          Issue_Type: report.Issue_Type,
          Date_Reported: report.Date_Reported || report.Created_At
        }];

    // Comprehensive Issue Extraction (collect and deduplicate all flagged components)
    const allIssueNames = [];
    const addIssues = (str) => {
      if (!str) return;
      str.split(',').map(s => s.trim()).filter(Boolean).forEach(comp => {
        const lower = comp.toLowerCase();
        if (lower !== 'none' && lower !== 'n/a' && !allIssueNames.some(existing => existing.toLowerCase() === lower)) {
          allIssueNames.push(comp);
        }
      });
    };

    if (parsed.issues && parsed.issues.toLowerCase() !== 'none') {
      addIssues(parsed.issues);
    }
    if (report.Issue_Type && report.Issue_Type.toLowerCase() !== 'hardware issue') {
      addIssues(report.Issue_Type);
    }
    if (Array.isArray(report.reports)) {
      report.reports.forEach(r => {
        if (r && r.Issue_Description) {
          const p = parseFn(r.Issue_Description);
          if (p && p.issues && p.issues.toLowerCase() !== 'none') {
            addIssues(p.issues);
          }
        }
        if (r && r.Issue_Type && r.Issue_Type.toLowerCase() !== 'hardware issue') {
          addIssues(r.Issue_Type);
        }
      });
    }

    if (allIssueNames.length === 0) {
      if (report.Issue_Type) addIssues(report.Issue_Type);
      else allIssueNames.push('Hardware Issue');
    }

    // Generate Issue Badges
    const issueBadgesHtml = allIssueNames.map(comp => {
      const lower = comp.toLowerCase();
      if (lower === 'none' || lower === 'n/a') {
        return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:12.5px; font-weight:600; padding:4px 10px; border-radius:8px; background:#F1F5F9; color:#475569; border:1px solid #E2E8F0;"><i data-lucide="check-circle-2" style="width:13px;height:13px;color:#10B981;"></i> No Faults</span>`;
      }
      if (lower === 'others' || lower === 'other') {
        return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:700; padding:4px 11px; border-radius:8px; background:#FEF3C7; color:#D97706; border:1.5px solid #FDE68A;"><i data-lucide="alert-circle" style="width:14px;height:14px;color:#D97706;"></i> Others</span>`;
      }
      return `<span style="display:inline-flex; align-items:center; gap:5px; font-size:13px; font-weight:800; padding:4px 11px; border-radius:8px; background:#FEF2F2; color:#DC2626; border:1.5px solid #FCA5A5;"><i data-lucide="alert-triangle" style="width:14px;height:14px;color:#EF4444;"></i> ${escapeFn(comp)}</span>`;
    }).join('');

    let bodyContentHtml = '';

    if (linkedReports.length === 1) {
      const singleReport = linkedReports[0];
      const singleParsed = parseFn(singleReport.Issue_Description) || { section: 'N/A', remarks: singleReport.Issue_Description || 'None' };
      const singleRemarks = (singleParsed.remarks || rawRemarks || '').trim();
      const isEmpty = !singleRemarks || singleRemarks.toLowerCase() === 'none' || singleRemarks.toLowerCase() === 'n/a' || singleRemarks.toLowerCase() === 'no remarks provided.';

      bodyContentHtml = `
        <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:20px;">
          <!-- 2x2 Grid: Laboratory, Computer, Reporter, Section -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:var(--bg-page); padding:14px 16px; border-radius:12px; border:1px solid var(--border-light);">
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; letter-spacing:0.4px;">Laboratory</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">Room ${escapeFn(String(roomNum))}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; letter-spacing:0.4px;">Computer</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">PC ${escapeFn(String(formattedPcNum))}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; letter-spacing:0.4px;">Reporter</div>
              <div style="font-size:13.5px; font-weight:700; color:var(--text-dark);">${escapeFn(singleReport.Student_Name || studentName)}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; letter-spacing:0.4px;">Section</div>
              <div style="font-size:13.5px; font-weight:700; color:var(--text-dark);">${escapeFn(singleParsed.section || parsed.section || 'N/A')}</div>
            </div>
          </div>

          <!-- Reported Issue -->
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">Reported Issue</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${issueBadgesHtml}
            </div>
          </div>

          <!-- Issue Details / Remarks -->
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">Issue Details / Remarks</div>
            <div style="display:flex; align-items:center; gap:10px; background:var(--bg-page); border:1px solid var(--border-light); padding:14px 16px; border-radius:12px; max-height:220px; overflow-y:auto; box-sizing:border-box;">
              <i data-lucide="message-square" style="width:18px; height:18px; min-width:18px; min-height:18px; color:var(--primary-teal, #0891B2); flex-shrink:0;"></i>
              <div style="font-size:14px; color:${isEmpty ? 'var(--text-muted)' : 'var(--text-dark)'}; ${isEmpty ? 'font-style:italic;' : ''} line-height:1.45; font-weight:500; word-break:break-word; white-space:pre-wrap; flex:1;">
                ${isEmpty ? 'No additional remarks provided.' : escapeFn(singleRemarks)}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      const studentReportsHtml = linkedReports.map((rep) => {
        const repDate = rep.Date_Reported ? new Date(rep.Date_Reported) : new Date();
        const repTimeStr = (global.formatTicketDate && typeof global.formatTicketDate === 'function')
          ? global.formatTicketDate(rep.Date_Reported)
          : (repDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + repDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
        const repParsed = parseFn(rep.Issue_Description) || { section: 'N/A', remarks: rep.Issue_Description || 'None' };
        const repRemarks = (repParsed.remarks || '').trim();
        const isRepEmpty = !repRemarks || repRemarks.toLowerCase() === 'none' || repRemarks.toLowerCase() === 'n/a';

        return `
          <div style="background:var(--bg-page); border:1px solid var(--border-light); padding:14px 16px; border-radius:12px; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span style="font-weight:750; font-size:14px; color:var(--text-dark);">${escapeFn(rep.Student_Name || 'Student')}</span>
                <span style="font-size:11px; color:#0284C7; background:#E0F2FE; padding:2px 8px; border-radius:6px; font-weight:700;">${escapeFn(repParsed.section || 'N/A')}</span>
              </div>
              <span style="font-size:12px; color:var(--text-muted); font-weight:500;">${repTimeStr}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <i data-lucide="message-square" style="width:17px; height:17px; min-width:17px; min-height:17px; color:var(--primary-teal, #0891B2); flex-shrink:0;"></i>
              <span style="font-size:14px; color:${isRepEmpty ? 'var(--text-muted)' : 'var(--text-dark)'}; ${isRepEmpty ? 'font-style:italic;' : ''} line-height:1.45; font-weight:500; word-break:break-word; white-space:pre-wrap; flex:1;">
                ${isRepEmpty ? 'No remarks provided.' : escapeFn(repRemarks)}
              </span>
            </div>
          </div>
        `;
      }).join('');

      bodyContentHtml = `
        <div style="display:flex; flex-direction:column; gap:16px; margin-bottom:20px;">
          <!-- 2x2 Grid: Laboratory, Computer, Category -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; background:var(--bg-page); padding:14px 16px; border-radius:12px; border:1px solid var(--border-light);">
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; letter-spacing:0.4px;">Laboratory</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">Room ${escapeFn(String(roomNum))}</div>
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:4px; letter-spacing:0.4px;">Computer</div>
              <div style="font-size:14px; font-weight:800; color:var(--text-dark);">PC ${escapeFn(String(formattedPcNum))}</div>
            </div>
          </div>

          <!-- Flagged Components -->
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.4px;">Flagged Component Issues</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${issueBadgesHtml}
            </div>
          </div>

          <!-- Linked Submissions -->
          <div>
            <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
              <span>Student Reports (${linkedReports.length})</span>
              <span style="font-size:11px; background:rgba(30,187,215,0.12); color:var(--primary-teal); padding:2px 8px; border-radius:99px; font-weight:600;">Linked Submissions</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px; max-height:220px; overflow-y:auto; padding-right:4px;">
              ${studentReportsHtml}
            </div>
          </div>
        </div>
      `;
    }

    const modal = document.createElement('div');
    modal.id = 'ticket-details-modal';
    modal.className = 'modal-backdrop active';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'fullReportModalTitle');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,23,42,0.65);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:2500;padding:20px;box-sizing:border-box;overflow-y:auto;';

    const isResolved = (report.Status || '').toLowerCase() === 'resolved';

    let headerSubtitle = '';
    if (linkedReports.length > 1) {
      headerSubtitle = `${linkedReports.length} Linked Submissions · Latest update: ${formattedDate}`;
    } else {
      headerSubtitle = `Reported on ${formattedDate}`;
    }

    let actionBtnHtml = '';
    const currentPage = document.body ? document.body.dataset.page : '';
    if (currentPage === 'mis-pc-reports' || currentPage === 'mis-maintenance' || currentPage === 'mis-dashboard') {
      if (!isResolved) {
        actionBtnHtml = `
          <button type="button" class="btn-resolve-ticket" data-action="resolve-ticket-modal" data-report-id="${report.Report_ID}" style="padding:9px 18px;font-size:13px;background:var(--primary-teal);color:#fff;border:none;border-radius:99px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
            <i data-lucide="check" style="width:14px;height:14px;"></i> Mark Resolved
          </button>
        `;
      }
    }

    modal.innerHTML = `
      <div class="modal-container" style="max-width: 540px; width: 92%; border-radius: 20px; padding: 24px 28px; background: var(--bg-card); border: 1px solid var(--border-light); box-shadow: 0 20px 50px rgba(0,0,0,0.25);">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:18px; border-bottom:1px solid var(--border-light); padding-bottom:14px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <h3 id="fullReportModalTitle" class="full-report-ticket-title" style="font-family:var(--font-display); font-weight:800; font-size:18px; color:var(--primary-teal, #1EBBD7); margin:0; letter-spacing:0.2px;">
                #LS-TKT-${report.Report_ID}
              </h3>
              <span class="status-badge ${isResolved ? 'resolved' : 'pending'}">
                ${isResolved ? 'RESOLVED' : 'PENDING'}
              </span>
            </div>
            <div style="font-size:12.5px; color:var(--text-muted); margin-top:4px; font-weight:500;">
              ${headerSubtitle}
            </div>
          </div>
          <button type="button" data-action="close-modal" class="modal-close-btn" aria-label="Close modal" style="background:#F1F5F9; border:none; color:var(--text-mid); cursor:pointer; width:32px; height:32px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;">
            <i data-lucide="x" style="width:16px;height:16px;"></i>
          </button>
        </div>

        <!-- Body Info -->
        ${bodyContentHtml}

        <!-- Footer Actions -->
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; border-top:1px solid var(--border-light); padding-top:16px;">
          <button type="button" data-action="close-modal" class="btn-modal-close" style="padding:8px 22px; border:1px solid var(--border-light); background:var(--bg-white); color:var(--text-dark); border-radius:99px; font-size:13px; font-weight:600; cursor:pointer;">Close</button>
          ${actionBtnHtml}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    if (global.setModalOpenState) global.setModalOpenState(true);
    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    // Accessible Focus Management: Focus close button inside modal
    const closeBtn = modal.querySelector('.modal-close-btn, .btn-modal-close');
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 50);
    }
  }

  /**
   * Initializes delegated click listeners for completed tickets modal & details modal (CSP compliant).
   */
  function initCompletedModalDelegation() {
    if (_delegationInitialized) return;
    _delegationInitialized = true;

    document.addEventListener('click', (e) => {
      // View Ticket Details / Remarks Modal
      const viewDetailsBtn = e.target.closest('[data-action="view-ticket-details"], .remarks-quote-box.interactive, .remarks-expand-badge');
      if (viewDetailsBtn) {
        e.preventDefault();
        e.stopPropagation();
        const reportId = viewDetailsBtn.getAttribute('data-report-id') || viewDetailsBtn.closest('[data-report-id]')?.getAttribute('data-report-id');
        if (reportId) {
          viewTicketModal(reportId);
        }
        return;
      }

      // Close Ticket Details Modal
      const closeDetailsBtn = e.target.closest('[data-action="close-modal"]');
      if (closeDetailsBtn) {
        e.preventDefault();
        e.stopPropagation();
        closeTicketModal();
        return;
      }

      if (e.target.id === 'ticket-details-modal') {
        e.stopPropagation();
        return;
      }

      // Resolve inside details modal
      const resolveModalBtn = e.target.closest('[data-action="resolve-ticket-modal"]');
      if (resolveModalBtn) {
        e.preventDefault();
        e.stopPropagation();
        const reportId = resolveModalBtn.getAttribute('data-report-id');
        closeTicketModal();
        if (reportId && typeof global.updateReportStatus === 'function') {
          global.updateReportStatus(reportId, 'Resolved');
        }
        return;
      }

      // Open Completed Modal
      const openBtn = e.target.closest('.toggle-completed-btn, [data-action="open-completed-modal"], .open-completed-link');
      if (openBtn) {
        e.preventDefault();
        openCompletedModal();
        return;
      }

      // Close Completed Modal
      const closeBtn = e.target.closest('.modal-close-btn, #closeCompletedModalBtn, [data-action="close-completed-modal"]');
      if (closeBtn && e.target.closest('#completedTicketsModal')) {
        e.preventDefault();
        closeCompletedModal();
        return;
      }

      const modal = document.getElementById('completedTicketsModal');
      if (modal && e.target === modal) {
        e.stopPropagation();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeTicketModal();
        const modal = document.getElementById('completedTicketsModal');
        if (modal && modal.style.display === 'flex') {
          closeCompletedModal();
        }
      }
    });
  }

  // Auto-initialize delegation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCompletedModalDelegation);
  } else {
    initCompletedModalDelegation();
  }

  const reportModal = {
    openCompletedModal,
    closeCompletedModal,
    filterCompletedTickets,
    syncModalSearchClearVisibility,
    initModalSearchClear,
    viewTicketModal,
    closeTicketModal,
    initCompletedModalDelegation
  };

  global.reportModal = reportModal;
  global.openCompletedModal = openCompletedModal;
  global.closeCompletedModal = closeCompletedModal;
  global.filterCompletedTickets = filterCompletedTickets;
  global.syncModalSearchClearVisibility = syncModalSearchClearVisibility;
  global.viewTicketModal = viewTicketModal;
  global.closeTicketModal = closeTicketModal;

})(typeof window !== 'undefined' ? window : this);
