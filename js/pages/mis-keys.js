/**
 * LabSync – MIS Key Inventory Management Script  |  js/pages/mis-keys.js
 * Handles key inventory rendering, status visibility, search filtering,
 * selection checkboxes, and batch 2-sided printable Key Transfer QR tag preview/printing.
 */

(function () {
  'use strict';

  let currentKeys = [];
  let currentFilter = 'ALL';
  let currentFilteredKeys = [];
  const selectedKeyIds = new Set();
  let activePrintKeyIds = [];

  document.addEventListener('DOMContentLoaded', () => {
    initKeysPage();
  });

  async function initKeysPage() {
    setupEventListeners();
    await refreshKeys();
  }

  /**
   * Refreshes key list and summary metrics from API.
   */
  async function refreshKeys() {
    const tableBody = document.getElementById('keysTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-table-cell">
            <i data-lucide="loader" class="spin" style="width: 20px; height: 20px; display: inline-block; vertical-align: middle; margin-right: 8px;"></i>
            Loading laboratory keys...
          </td>
        </tr>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const res = await window.keysService.fetchKeys();
      currentKeys = res.keys || [];
      const summary = res.summary || { total: 0, inDock: 0, inUse: 0 };
      updateStatsSummary(summary);
      renderKeysTable();
    } catch (err) {
      console.error('[MISKeys] Error fetching keys:', err);
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="7" class="table-cell text-center" style="padding: 40px; color: #EF4444;">
              <i data-lucide="alert-circle" style="width: 24px; height: 24px; display: inline-block; vertical-align: middle; margin-right: 8px;"></i>
              Failed to load key inventory: ${err.message}
            </td>
          </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  /**
   * Updates stat counter cards.
   */
  function updateStatsSummary(summary) {
    const elTotal = document.getElementById('statTotalKeys');
    const elInDock = document.getElementById('statInDockKeys');
    const elInUse = document.getElementById('statInUseKeys');

    if (elTotal) elTotal.textContent = summary.total ?? 0;
    if (elInDock) elInDock.textContent = summary.inDock ?? 0;
    if (elInUse) elInUse.textContent = summary.inUse ?? 0;
  }

  /**
   * Updates the Select All checkbox state (checked, unchecked, or indeterminate).
   */
  function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('selectAllKeysCheckbox');
    if (!selectAllCheckbox) return;

    if (currentFilteredKeys.length === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }

    const selectedFilteredCount = currentFilteredKeys.filter(k => selectedKeyIds.has(Number(k.Key_ID))).length;

    if (selectedFilteredCount === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedFilteredCount === currentFilteredKeys.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  /**
   * Updates toolbar batch buttons and count indicators.
   */
  function updateBatchToolbar() {
    const btnSelected = document.getElementById('btnBatchPrintSelected');
    const btnSelectedText = document.getElementById('btnBatchPrintSelectedText');
    const btnSelectedBadge = document.getElementById('btnBatchPrintSelectedBadge');
    const btnAll = document.getElementById('btnBatchPrintAll');
    const btnAllText = document.getElementById('btnBatchPrintAllText');

    const selectedCount = selectedKeyIds.size;
    const filteredCount = currentFilteredKeys.length;

    if (btnSelected && btnSelectedText) {
      btnSelectedText.textContent = 'Print Selected';
      if (btnSelectedBadge) {
        btnSelectedBadge.textContent = selectedCount;
        btnSelectedBadge.style.display = selectedCount > 0 ? 'inline-flex' : 'none';
      }
      if (selectedCount > 0) {
        btnSelected.disabled = false;
        btnSelected.classList.add('has-selection');
        btnSelected.removeAttribute('style');
      } else {
        btnSelected.disabled = true;
        btnSelected.classList.remove('has-selection');
        btnSelected.removeAttribute('style');
      }
    }

    if (btnAll && btnAllText) {
      btnAllText.textContent = 'Print All';
      btnAll.disabled = filteredCount === 0;
      btnAll.removeAttribute('style');
    }
  }

  /**
   * Renders filtered keys table rows.
   */
  function renderKeysTable() {
    const tableBody = document.getElementById('keysTableBody');
    if (!tableBody) return;

    const searchInput = document.getElementById('keySearchInput');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

    currentFilteredKeys = currentKeys.filter(k => {
      const isPresent = (k.Room_Key_Status || 'Present') === 'Present';

      // Filter tab check
      if (currentFilter === 'PRESENT' && !isPresent) return false;
      if (currentFilter === 'ABSENT' && isPresent) return false;

      // Search check
      if (query) {
        const codeStr = String(k.Key_Code || '').toLowerCase();
        const rawRoom = String(k.Room_Number || '').toLowerCase();
        const roomStr = rawRoom.startsWith('room') ? rawRoom : `room ${rawRoom}`;
        const bldgStr = String(k.Building || '').toLowerCase();
        const holderStr = String(k.Current_Holder_Name || '').toLowerCase();
        const statusStr = isPresent ? 'in key box docked available present' : 'in use with faculty absent';

        const fullSearchable = `${codeStr} ${rawRoom} ${roomStr} ${bldgStr} ${holderStr} ${statusStr}`;
        const queryWords = query.split(/\s+/).filter(Boolean);
        return queryWords.every(word => fullSearchable.includes(word));
      }
      return true;
    });

    updateSelectAllCheckboxState();
    updateBatchToolbar();

    if (currentFilteredKeys.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-table-cell">
            No laboratory keys matching the criteria.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = currentFilteredKeys.map(k => {
      const keyId = Number(k.Key_ID);
      const isChecked = selectedKeyIds.has(keyId);
      const rawRoom = String(k.Room_Number || '').trim();
      const roomFormatted = rawRoom.toLowerCase().startsWith('room') ? rawRoom : `Room ${rawRoom}`;
      const building = k.Building || 'IT Building';
      const isPresent = (k.Room_Key_Status || 'Present') === 'Present';

      // Last activity format
      let hasRecentActivity = false;
      let dateLine = 'No recent activity';
      let timeStr = '';
      let actionTag = '';
      if (k.Last_Activity_At || k.Last_Taken_At) {
        const dateObj = new Date(k.Last_Activity_At || k.Last_Taken_At);
        const m = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const t = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        dateLine = m;
        actionTag = isPresent ? 'Returned' : 'Taken';
        timeStr = t;
        hasRecentActivity = true;
      }

      // System status read-only badge
      const statusBadgeHtml = isPresent
        ? '<span class="status-badge-pulse resolved" title="Key is docked in the IoT key box"><span class="pulse-dot"></span> In Key Box</span>'
        : '<span class="status-badge-pulse pending" title="Key is held by faculty"><span class="pulse-dot"></span> In Use</span>';

      // Status & Custody display
      let custodyHtml = '';
      if (isPresent) {
        custodyHtml = `
          <div class="custody-cell-wrap">
            ${statusBadgeHtml}
          </div>
        `;
      } else {
        const cleanName = k.Current_Holder_Name
          ? (k.Current_Holder_Name.startsWith('Prof.') ? k.Current_Holder_Name : `Prof. ${k.Current_Holder_Name}`)
          : 'Faculty Member';
        custodyHtml = `
          <div class="custody-cell-wrap">
            ${statusBadgeHtml}
            <div class="custody-holder-row">
              <i data-lucide="user-check" class="custody-holder-icon"></i>
              <span class="custody-holder-name">${cleanName}</span>
            </div>
          </div>
        `;
      }

      // Last Activity display (prominent two-line date & time with status badge)
      let activityHtml = '';
      if (hasRecentActivity) {
        const tagClass = isPresent ? 'action-tag-returned' : 'action-tag-taken';
        activityHtml = `
          <div class="activity-cell-wrap">
            <span class="activity-date-line">${dateLine}</span>
            <div class="activity-meta-line">
              <span class="activity-time-text">
                <i data-lucide="clock" class="activity-clock-icon"></i>
                <span>${timeStr}</span>
              </span>
              <span class="activity-action-tag ${tagClass}">${actionTag}</span>
            </div>
          </div>
        `;
      } else {
        activityHtml = `
          <div class="activity-cell-wrap">
            <span class="activity-empty-line">
              <i data-lucide="minus" class="activity-clock-icon"></i>
              <span>No recent activity</span>
            </span>
          </div>
        `;
      }

      return `
        <tr class="key-data-row ${isChecked ? 'row-selected' : ''}" data-key-id="${keyId}">
          <td class="col-checkbox text-center" style="white-space: nowrap; text-align: center;">
            <input type="checkbox" class="key-row-checkbox" data-id="${keyId}" ${isChecked ? 'checked' : ''} aria-label="Select Key ${k.Key_Code}" />
          </td>
          <td class="col-ticket" style="white-space: nowrap;">
            <span class="key-code-chip">
              <i data-lucide="key" class="key-chip-icon"></i>
              <span>${k.Key_Code}</span>
            </span>
          </td>
          <td class="col-room" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="map-pin" class="cell-icon room"></i>
              <span class="cell-text-room">${roomFormatted}</span>
            </div>
          </td>
          <td class="col-building" style="white-space: nowrap;">
            <div class="cell-icon-wrap">
              <i data-lucide="building" class="cell-icon bldg"></i>
              <span class="cell-text-bldg">${building}</span>
            </div>
          </td>
          <td class="col-custody" style="white-space: nowrap;">
            ${custodyHtml}
          </td>
          <td class="col-activity" style="white-space: nowrap;">
            ${activityHtml}
          </td>
          <td class="col-actions text-center" style="white-space: nowrap; text-align: center;">
            <button type="button" class="btn-table-action key-action-btn btn-tag" data-action="print-tag" data-id="${keyId}" title="Preview & Print Key QR Tag" style="padding: 7px 12px; gap: 6px; font-size: 13px; font-weight: 700; border-radius: 8px;">
              <i data-lucide="qr-code"></i> <span>Print QR Tag</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  /**
   * Builds the side-by-side pair HTML for a single key (Side 1 Front + Side 2 Back).
   */
  function buildKeyPairHtml(tagData) {
    const rawRoom = String(tagData.roomNumber || '').trim();
    const roomStr = rawRoom.toLowerCase().startsWith('room') ? rawRoom : `Room ${rawRoom}`;
    const buildingStr = tagData.building || 'BLDG. B';

    return `
      <div class="keychain-print-pair" data-key-id="${tagData.keyId}">
        <div class="keychain-pair-header">
          <span>${roomStr}</span>
          <span>&bull;</span>
          <span>${buildingStr}</span>
        </div>
        <div class="keychain-pair-slots">
          <!-- FRONT SIDE (1.14in x 1.84in) -->
          <div class="keychain-slot">
            <div class="keychain-card-wrapper">
              <div class="keychain-side-label">SIDE 1 — FRONT</div>
              <div class="keychain-card keychain-front-card">
                <div class="keychain-front-dark-header">
                  <img src="assets/labsync-logo - dark mode.png" alt="LabSync" class="keychain-front-dark-logo" />
                  <div class="keychain-front-univ-badge">BULSU - SARMIENTO CAMPUS</div>
                </div>
                
                <div class="keychain-front-body">
                  <div class="keychain-room-label">ROOM</div>
                  <div class="keychain-room-number-huge">${tagData.roomNumber}</div>
                  <div class="keychain-bldg-blue">${buildingStr}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- BACK SIDE (1.14in x 1.84in) -->
          <div class="keychain-slot">
            <div class="keychain-card-wrapper">
              <div class="keychain-side-label">SIDE 2 — BACK</div>
              <div class="keychain-card keychain-back-card">
                <div class="keychain-back-heading">KEY TRANSFER & CLAIM</div>
                <div class="keychain-qr-wrapper">
                  <img src="${tagData.qrCode}" alt="Key Transfer QR Code" />
                </div>
                <div class="keychain-back-instruction">
                  <div class="instruction-lead">Need to transfer<br>or claim this room?</div>
                  <div class="instruction-sub">Scan QR to continue.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Sets up event listeners for filters, search, selection, and tag printing.
   */
  function setupEventListeners() {
    // Filter tabs
    const filterBtns = document.querySelectorAll('.key-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'ALL';
        renderKeysTable();
      });
    });

    // Real-time search
    const searchInput = document.getElementById('keySearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderKeysTable();
      });
    }

    // Header "Select All" checkbox
    const selectAllCheckbox = document.getElementById('selectAllKeysCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        currentFilteredKeys.forEach(k => {
          const id = Number(k.Key_ID);
          if (isChecked) {
            selectedKeyIds.add(id);
          } else {
            selectedKeyIds.delete(id);
          }
        });

        document.querySelectorAll('.key-row-checkbox').forEach(cb => {
          cb.checked = isChecked;
          cb.closest('tr')?.classList.toggle('row-selected', isChecked);
        });

        updateSelectAllCheckboxState();
        updateBatchToolbar();
      });
    }

    // Table checkbox toggle & Action button delegation
    const tableBody = document.getElementById('keysTableBody');
    if (tableBody) {
      // Row checkbox change
      tableBody.addEventListener('change', (e) => {
        const cb = e.target.closest('.key-row-checkbox');
        if (!cb) return;

        const keyId = Number(cb.dataset.id);
        if (cb.checked) {
          selectedKeyIds.add(keyId);
          cb.closest('tr')?.classList.add('row-selected');
        } else {
          selectedKeyIds.delete(keyId);
          cb.closest('tr')?.classList.remove('row-selected');
        }

        updateSelectAllCheckboxState();
        updateBatchToolbar();
      });

      // Print Tag single button click
      tableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('.key-action-btn');
        if (!btn) return;

        const action = btn.dataset.action;
        const keyId = Number(btn.dataset.id);

        if (action === 'print-tag') {
          await openBatchPrintModal([keyId]);
        }
      });
    }

    // Toolbar Batch Print Buttons
    const btnBatchPrintSelected = document.getElementById('btnBatchPrintSelected');
    if (btnBatchPrintSelected) {
      btnBatchPrintSelected.addEventListener('click', async () => {
        if (selectedKeyIds.size === 0) return;
        await openBatchPrintModal(Array.from(selectedKeyIds));
      });
    }

    const btnBatchPrintAll = document.getElementById('btnBatchPrintAll');
    if (btnBatchPrintAll) {
      btnBatchPrintAll.addEventListener('click', async () => {
        if (currentFilteredKeys.length === 0) return;
        await openBatchPrintModal(currentFilteredKeys.map(k => Number(k.Key_ID)));
      });
    }

    // Zoom controls for modal preview
    const btnZoom100 = document.getElementById('btnZoom100');
    const btnZoom140 = document.getElementById('btnZoom140');
    const previewContainer = document.getElementById('keyTagPreviewContainer');

    if (btnZoom100 && btnZoom140 && previewContainer) {
      btnZoom100.addEventListener('click', () => {
        previewContainer.classList.remove('zoomed-140');
        btnZoom100.classList.add('active');
        btnZoom100.style.background = 'var(--bg-white)';
        btnZoom100.style.color = 'var(--primary-teal)';
        btnZoom100.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        btnZoom140.classList.remove('active');
        btnZoom140.style.background = 'transparent';
        btnZoom140.style.color = 'var(--text-light)';
      });

      btnZoom140.addEventListener('click', () => {
        previewContainer.classList.add('zoomed-140');
        btnZoom140.classList.add('active');
        btnZoom140.style.background = 'var(--bg-white)';
        btnZoom140.style.color = 'var(--primary-teal)';
        btnZoom140.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        btnZoom100.classList.remove('active');
        btnZoom100.style.background = 'transparent';
        btnZoom100.style.color = 'var(--text-light)';
        btnZoom100.style.boxShadow = 'none';
      });
    }

    // Print Modal Close & Trigger
    const modalPrint = document.getElementById('printKeyModalOverlay');
    const btnClosePrint = document.getElementById('btnClosePrintModal');
    const btnCancelPrint = document.getElementById('btnCancelPrintModal');
    const btnExecPrint = document.getElementById('btnExecutePrintKeyTag');

    const closePrintModal = () => {
      if (modalPrint) modalPrint.style.display = 'none';
      if (global.setModalOpenState) global.setModalOpenState(false);
      if (previewContainer) previewContainer.classList.remove('zoomed-140');
      if (btnZoom100) {
        btnZoom100.classList.add('active');
        btnZoom100.style.background = 'var(--bg-white)';
        btnZoom100.style.color = 'var(--primary-teal)';
      }
      if (btnZoom140) {
        btnZoom140.classList.remove('active');
        btnZoom140.style.background = 'transparent';
        btnZoom140.style.color = 'var(--text-light)';
      }
      activePrintKeyIds = [];
    };

    if (btnClosePrint) btnClosePrint.addEventListener('click', closePrintModal);
    if (btnCancelPrint) btnCancelPrint.addEventListener('click', closePrintModal);
    if (modalPrint) {
      modalPrint.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      modalPrint.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
    }

    if (btnExecPrint) {
      btnExecPrint.addEventListener('click', () => {
        executePrintKeyInsert();
      });
    }
  }

  /**
   * Opens Print Preview Modal and generates key tag insert HTML (1.14in x 1.84in) for one or multiple keys.
   */
  async function openBatchPrintModal(keyIds) {
    if (!keyIds || keyIds.length === 0) return;
    activePrintKeyIds = keyIds;

    const modalPrint = document.getElementById('printKeyModalOverlay');
    const previewContainer = document.getElementById('keyTagPreviewContainer');
    const modalTitle = document.getElementById('printModalTitle');
    const modalSubtitle = document.getElementById('printModalSubtitle');
    const btnExecText = document.getElementById('btnExecutePrintText');

    if (modalPrint) {
      modalPrint.style.display = 'flex';
      if (global.setModalOpenState) global.setModalOpenState(true);
    }

    const count = keyIds.length;
    if (modalTitle) {
      modalTitle.textContent = count === 1 ? 'Two-Sided Keychain Insert' : `Batch Keychain Inserts (${count} Keys)`;
    }
    if (modalSubtitle) {
      modalSubtitle.innerHTML = count === 1
        ? 'Exact Cutout Size: <strong>1.14 in × 1.84 in</strong> &bull; For Acrylic Key Tag'
        : `Exact Cutout Size: <strong>1.14 in × 1.84 in</strong> &bull; ${count} Inserts (${count * 2} Printable Tags)`;
    }
    if (btnExecText) {
      btnExecText.textContent = count === 1 ? 'Print Insert' : `Print ${count} Inserts (${count * 2} Tags)`;
    }

    if (previewContainer) {
      previewContainer.classList.remove('zoomed-140');
      previewContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px; width: 100%;">
          <i data-lucide="loader" class="spin" style="width: 24px; height: 24px; display: inline-block; vertical-align: middle; margin-bottom: 8px;"></i>
          <div style="font-size: 13.5px; font-weight: 600;">Generating ${count} printable key tag${count > 1 ? 's' : ''}...</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const tagResults = await Promise.all(
        keyIds.map(id => window.keysService.fetchKeyTag(id).catch(err => {
          console.error(`[MISKeys] Error generating tag for key ${id}:`, err);
          return null;
        }))
      );

      const validTags = tagResults.filter(Boolean);

      if (validTags.length === 0) {
        if (previewContainer) {
          previewContainer.innerHTML = '<div style="color: #EF4444; font-weight: 600; padding: 24px; text-align: center;">Failed to generate printable key tags.</div>';
        }
        return;
      }

      if (previewContainer) {
        previewContainer.innerHTML = validTags.map(buildKeyPairHtml).join('');
      }
      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.error('[MISKeys] Error building batch key tag preview:', err);
      if (previewContainer) {
        previewContainer.innerHTML = `<div style="color: #EF4444; font-weight: 600; padding: 20px;">Failed to generate tag preview: ${err.message}</div>`;
      }
    }
  }

  // Alias for backward compatibility
  const openPrintModal = (keyId) => openBatchPrintModal([Number(keyId)]);

  /**
   * Executes window.print() for the two-sided keychain inserts.
   * Prints at exact 1.14in x 1.84in physical dimensions at 100% scale.
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
    }, 120);
  }

})();
