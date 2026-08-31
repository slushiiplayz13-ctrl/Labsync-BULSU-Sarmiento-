/**
 * LabSync – MIS Key Management Page Script  |  js/pages/mis-keys.js
 * Controls physical laboratory key inventory, keychain insert printing, status lifecycle, and found reports.
 */

(function () {
  'use strict';

  let currentKeys = [];
  let currentFilter = 'ALL';
  let activePrintKeyId = null;

  document.addEventListener('DOMContentLoaded', () => {
    initPage();
  });

  async function initPage() {
    setupEventListeners();
    await refreshKeys();
  }

  /**
   * Fetches latest keys from server and renders table.
   */
  async function refreshKeys() {
    const tableBody = document.getElementById('keysTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="table-cell text-center" style="padding: 40px; color: var(--text-muted);">
            Loading physical keys...
          </td>
        </tr>
      `;
    }

    try {
      const res = await window.keysService.fetchKeys();
      currentKeys = (res && res.keys) ? res.keys : [];
      const summary = (res && res.summary) ? res.summary : { total: 0, active: 0, missing: 0, found: 0 };

      updateStatsSummary(summary);
      renderKeysTable();
    } catch (err) {
      console.error('[MISKeys] Failed to refresh keys:', err);
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" class="table-cell text-center" style="padding: 40px; color: #EF4444; font-weight: 600;">
              Failed to load keys: ${err.message}
            </td>
          </tr>
        `;
      }
    }
  }

  /**
   * Updates stat counter cards and filter badges.
   */
  function updateStatsSummary(summary) {
    const elTotal = document.getElementById('statTotalKeys');
    const elActive = document.getElementById('statActiveKeys');
    const elMissing = document.getElementById('statMissingKeys');
    const elFound = document.getElementById('statFoundKeys');

    if (elTotal) elTotal.textContent = summary.total;
    if (elActive) elActive.textContent = summary.active;
    if (elMissing) elMissing.textContent = summary.missing;
    if (elFound) elFound.textContent = summary.found;
  }

  /**
   * Renders filtered keys table rows.
   */
  function renderKeysTable() {
    const tableBody = document.getElementById('keysTableBody');
    if (!tableBody) return;

    const searchInput = document.getElementById('keySearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = currentKeys.filter(k => {
      // Filter tab check
      if (currentFilter !== 'ALL' && k.Status !== currentFilter) {
        return false;
      }
      // Multi-keyword search check
      if (query) {
        const codeStr = String(k.Key_Code || '').toLowerCase();
        const rawRoom = String(k.Room_Number || '').toLowerCase();
        const roomStr = rawRoom.startsWith('room') ? rawRoom : `room ${rawRoom}`;
        const bldgStr = String(k.Building || '').toLowerCase();
        const statusStr = String(k.Status || '').toLowerCase();

        const fullSearchable = `${codeStr} ${rawRoom} ${roomStr} ${bldgStr} ${statusStr}`;
        const queryWords = query.split(/\s+/).filter(Boolean);
        return queryWords.every(word => fullSearchable.includes(word));
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="table-cell text-center" style="padding: 40px; color: var(--text-muted);">
            No matching physical keys found.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(k => {
      const rawRoom = String(k.Room_Number || '').trim();
      const roomFormatted = rawRoom.toLowerCase().startsWith('room') ? rawRoom : `Room ${rawRoom}`;
      const building = k.Building || 'IT Building';
      
      let dateDisplayHtml = '';
      if (k.Last_Taken_At) {
        const dateObj = new Date(k.Last_Taken_At);
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        dateDisplayHtml = `
          <div class="col-date-wrap">
            <i data-lucide="calendar" class="col-date-icon"></i>
            <div class="col-date-text">
              <span class="date-main">${dateStr}</span>
              <span class="time-sub">${timeStr}</span>
            </div>
          </div>
        `;
      } else {
        dateDisplayHtml = `
          <span style="font-size: 12.5px; color: var(--text-muted); font-weight: 600; font-style: italic;">Not Yet Taken</span>
        `;
      }

      let statusBadgeHtml = '';
      if (k.Status === 'ACTIVE') {
        statusBadgeHtml = '<span class="status-badge-pulse resolved"><span class="pulse-dot"></span> Active</span>';
      } else if (k.Status === 'MISSING') {
        statusBadgeHtml = '<span class="status-badge-pulse pending"><span class="pulse-dot"></span> Missing</span>';
      } else if (k.Status === 'FOUND') {
        statusBadgeHtml = '<span class="status-badge-pulse found"><span class="pulse-dot"></span> Found Report</span>';
      } else {
        statusBadgeHtml = `<span class="status-badge-pulse resolved"><span class="pulse-dot"></span> ${k.Status}</span>`;
      }

      // Actions
      let actionButtons = `
        <button type="button" class="btn-table-action key-action-btn btn-tag" data-action="print-tag" data-id="${k.Key_ID}" title="Print 2-Sided Keychain Insert">
          <i data-lucide="printer"></i> Tag
        </button>
      `;

      if (k.Status === 'ACTIVE') {
        actionButtons += `
          <button type="button" class="btn-table-action key-action-btn btn-missing" data-action="mark-missing" data-id="${k.Key_ID}" title="Mark Key as Missing">
            <i data-lucide="alert-triangle"></i> Missing
          </button>
        `;
      } else if (k.Status === 'MISSING' || k.Status === 'FOUND') {
        actionButtons += `
          <button type="button" class="btn-table-action key-action-btn btn-recovered" data-action="mark-active" data-id="${k.Key_ID}" title="Mark Physical Key Recovered / Active">
            <i data-lucide="check-circle"></i> Mark Recovered
          </button>
        `;
      }

      if (k.Status === 'FOUND' || (k.Open_Reports_Count && k.Open_Reports_Count > 0)) {
        actionButtons += `
          <button type="button" class="btn-table-action key-action-btn btn-reports" data-action="view-reports" data-id="${k.Key_ID}" title="View Public Found Key Reports">
            <i data-lucide="search"></i> Reports (${k.Open_Reports_Count || 1})
          </button>
        `;
      }

      return `
        <tr class="maintenance-row">
          <td class="col-ticket" style="white-space: nowrap;">
            <span class="ticket-chip">
              ${k.Key_Code}
            </span>
          </td>
          <td class="col-building" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="building" class="cell-icon pc"></i>
              ${building}
            </div>
          </td>
          <td class="col-room" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="map-pin" class="cell-icon room"></i>
              ${roomFormatted}
            </div>
          </td>
          <td class="col-status text-center" style="white-space: nowrap;">
            ${statusBadgeHtml}
          </td>
          <td class="col-date" style="white-space: nowrap;">
            ${dateDisplayHtml}
          </td>
          <td class="col-actions text-center" style="white-space: nowrap; text-align: center;">
            <div style="display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
              ${actionButtons}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Sets up event listeners for filters, search, buttons, and modals.
   */
  function setupEventListeners() {
    // Filter tabs
    const filterBtns = document.querySelectorAll('.key-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => {
          b.classList.remove('active');
          b.style.background = 'transparent';
          b.style.color = 'var(--text-light)';
          b.style.boxShadow = 'none';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--bg-white)';
        btn.style.color = 'var(--primary-teal)';
        btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

        currentFilter = btn.getAttribute('data-filter') || 'ALL';
        renderKeysTable();
      });
    });

    // Search input
    const searchInput = document.getElementById('keySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderKeysTable();
      });
    }

    // Table action delegation
    const tableBody = document.getElementById('keysTableBody');
    if (tableBody) {
      tableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.btn-table-action');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const keyId = btn.getAttribute('data-id');

        if (action === 'print-tag') {
          await openPrintModal(keyId);
        } else if (action === 'mark-missing') {
          if (confirm('Are you sure you want to mark this key as MISSING?')) {
            try {
              const res = await window.keysService.markKeyMissing(keyId);
              if (window.showToast) window.showToast(res.message);
              await refreshKeys();
            } catch (err) {
              alert(err.message);
            }
          }
        } else if (action === 'mark-active') {
          if (confirm('Mark this physical key as recovered and ACTIVE?')) {
            try {
              const res = await window.keysService.markKeyActive(keyId);
              if (window.showToast) window.showToast(res.message);
              await refreshKeys();
            } catch (err) {
              alert(err.message);
            }
          }
        } else if (action === 'view-reports') {
          await openReportsModal(keyId);
        }
      });
    }

    // Print Modal Close & Trigger
    const modalPrint = document.getElementById('printKeyModalOverlay');
    const btnClosePrint = document.getElementById('btnClosePrintModal');
    const btnCancelPrint = document.getElementById('btnCancelPrintModal');
    const btnExecPrint = document.getElementById('btnExecutePrintKeyTag');

    const closePrintModal = () => {
      if (modalPrint) modalPrint.style.display = 'none';
      activePrintKeyId = null;
    };

    if (btnClosePrint) btnClosePrint.addEventListener('click', closePrintModal);
    if (btnCancelPrint) btnCancelPrint.addEventListener('click', closePrintModal);

    if (btnExecPrint) {
      btnExecPrint.addEventListener('click', () => {
        executePrintKeyInsert();
      });
    }

    // View Reports Modal Close
    const modalReports = document.getElementById('viewReportsModalOverlay');
    const btnCloseReports = document.getElementById('btnCloseReportsModal');
    const btnDoneReports = document.getElementById('btnDoneReportsModal');

    const closeReportsModal = () => {
      if (modalReports) modalReports.style.display = 'none';
    };

    if (btnCloseReports) btnCloseReports.addEventListener('click', closeReportsModal);
    if (btnDoneReports) btnDoneReports.addEventListener('click', closeReportsModal);
  }

  /**
   * Opens Print Preview Modal and generates key tag insert HTML.
   */
  async function openPrintModal(keyId) {
    activePrintKeyId = keyId;
    const modalPrint = document.getElementById('printKeyModalOverlay');
    const previewContainer = document.getElementById('keyTagPreviewContainer');

    if (modalPrint) modalPrint.style.display = 'flex';
    if (previewContainer) {
      previewContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Generating printable key insert...</div>';
    }

    try {
      const tagData = await window.keysService.fetchKeyTag(keyId);
      const rawRoom = String(tagData.roomNumber || '').trim();
      const roomStr = rawRoom.toLowerCase().startsWith('room') ? rawRoom : `Room ${rawRoom}`;

      const insertHtml = `
        <!-- FRONT SIDE -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <div class="keychain-side-label">SIDE 1 — FRONT</div>
          <div class="keychain-card">
            <div class="keychain-front-header">
              <img src="assets/labsync-logo.png" alt="LabSync Logo" class="keychain-front-logo" />
              <div class="keychain-brand-divider"></div>
              <div class="keychain-univ-title">BULACAN STATE UNIVERSITY<br>SARMIENTO CAMPUS</div>
            </div>
            
            <div class="keychain-location-box">
              <div class="keychain-bldg-name">${tagData.building || 'IT BUILDING'}</div>
              <div class="keychain-room-name">LABORATORY ${tagData.roomNumber}</div>
            </div>
            
            <div class="keychain-code-pill">${tagData.keyCode}</div>
          </div>
        </div>

        <!-- BACK SIDE -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
          <div class="keychain-side-label">SIDE 2 — BACK</div>
          <div class="keychain-card">
            <div class="keychain-back-text">
              <strong>Found this key?</strong> Return it to Campus Security or the IT/MIS Office.<br><br>
              <strong>Can’t return it now?</strong> Scan the QR to notify us.
            </div>
            <div class="keychain-qr-wrapper">
              <img src="${tagData.qrCode}" alt="Key QR Code" />
            </div>
          </div>
        </div>
      `;

      if (previewContainer) {
        previewContainer.innerHTML = insertHtml;
      }
    } catch (err) {
      console.error('[MISKeys] Error building key tag preview:', err);
      if (previewContainer) {
        previewContainer.innerHTML = `<div style="color: #EF4444; font-weight: 600; padding: 20px;">Failed to generate tag: ${err.message}</div>`;
      }
    }
  }

  /**
   * Executes window.print() for the two-sided keychain insert.
   */
  function executePrintKeyInsert() {
    const previewContainer = document.getElementById('keyTagPreviewContainer');
    const printArea = document.getElementById('printArea');

    if (!previewContainer || !printArea) return;

    printArea.innerHTML = `
      <div class="key-tag-print-container">
        ${previewContainer.innerHTML}
      </div>
    `;

    setTimeout(() => {
      window.print();
      printArea.innerHTML = '';
    }, 100);
  }

  /**
   * Opens Found Reports modal and renders report history.
   */
  async function openReportsModal(keyId) {
    const modalReports = document.getElementById('viewReportsModalOverlay');
    const listContainer = document.getElementById('reportsListContainer');

    if (modalReports) modalReports.style.display = 'flex';
    if (listContainer) {
      listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">Loading reports...</div>';
    }

    try {
      const reports = await window.keysService.fetchFoundReports(keyId);

      if (!Array.isArray(reports) || reports.length === 0) {
        if (listContainer) {
          listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 24px;">No found key reports recorded yet for this key.</div>';
        }
        return;
      }

      const html = reports.map(r => {
        const foundDate = r.Found_At ? new Date(r.Found_At).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown date';
        const createdDate = r.Created_At ? new Date(r.Created_At).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const isResolved = r.Status === 'RESOLVED';

        return `
          <div style="background: var(--bg-body); border: 1px solid var(--border-light); border-radius: 12px; padding: 14px 16px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <span style="font-size: 11px; font-weight: 800; color: var(--primary-teal); text-transform: uppercase;">KEY: ${r.Key_Code || 'KEY RECORD'} (Room ${r.Room_Number || ''})</span>
                <h4 style="margin: 2px 0 0 0; font-size: 14px; font-weight: 700; color: var(--text-dark);">Found at: ${r.Found_Location}</h4>
              </div>
              <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; ${isResolved ? 'background:rgba(16,185,129,0.12); color:#10B981;' : 'background:rgba(147,51,234,0.15); color:#9333EA;'}">
                ${r.Status}
              </span>
            </div>

            <div style="font-size: 12.5px; color: var(--text-dark); margin-bottom: 6px;">
              <strong>Date / Time Found:</strong> ${foundDate}
            </div>

            ${r.Finder_Contact ? `<div style="font-size: 12.5px; color: var(--text-dark); margin-bottom: 6px;"><strong>Finder Contact:</strong> ${r.Finder_Contact}</div>` : ''}
            ${r.Message ? `<div style="font-size: 12.5px; color: var(--text-light); font-style: italic; background: var(--bg-white); padding: 8px 10px; border-radius: 8px; margin-top: 6px;">"${r.Message}"</div>` : ''}

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-light);">
              <span style="font-size: 11px; color: var(--text-light);">Reported: ${createdDate}</span>
              ${!isResolved ? `
                <button type="button" class="btn-resolve-key-report" data-keyid="${r.Key_ID}"
                  style="padding: 5px 10px; background: rgba(16,185,129,0.12); color: #10B981; border: none; border-radius: 6px; font-size: 11.5px; font-weight: 700; cursor: pointer;">
                  Mark Recovered / Active
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      if (listContainer) {
        listContainer.innerHTML = html;

        // Attach resolve listener inside modal
        listContainer.querySelectorAll('.btn-resolve-key-report').forEach(btn => {
          btn.addEventListener('click', async () => {
            const keyIdToResolve = btn.getAttribute('data-keyid');
            if (confirm('Mark this physical key as recovered and ACTIVE?')) {
              try {
                const res = await window.keysService.markKeyActive(keyIdToResolve);
                if (window.showToast) window.showToast(res.message);
                document.getElementById('viewReportsModalOverlay').style.display = 'none';
                await refreshKeys();
              } catch (err) {
                alert(err.message);
              }
            }
          });
        });
      }
    } catch (err) {
      console.error('[MISKeys] Error opening reports modal:', err);
      if (listContainer) {
        listContainer.innerHTML = `<div style="color: #EF4444; font-weight: 600; padding: 20px;">Failed to load reports: ${err.message}</div>`;
      }
    }
  }

})();
