/**
 * LabSync – Database Backup & Sandbox Recovery Modal | js/components/backup/backup-recovery.modal.js
 * Feature #17 (Disaster Recovery & Business Continuity)
 *
 * Exclusively accessible to the IT Department Head.
 * Communicates with backend endpoints:
 *   - GET  /api/admin/backups/status
 *   - POST /api/admin/backups/create
 *   - POST /api/admin/backups/restore
 */

(function (global) {
  'use strict';

  let activeModal = null;
  let isRestoring = false;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(isoString) {
    if (!isoString) return 'Never';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return String(isoString);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (_) {
      return String(isoString);
    }
  }

  /**
   * Opens the Backup & Recovery administrative modal.
   */
  async function openBackupRecoveryModal() {
    // Prevent duplicate modals
    if (activeModal) {
      activeModal.remove();
      activeModal = null;
    }

    const modal = document.createElement('div');
    modal.id = 'backup-recovery-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'backup-modal-title');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(5px);
      -webkit-backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2600 !important;
      padding: 16px;
      box-sizing: border-box;
      opacity: 1;
      pointer-events: auto;
    `;

    modal.innerHTML = `
      <div class="backup-modal-card" style="
        background: var(--bg-white, #FFFFFF);
        border: 1.5px solid var(--border-light, #E2E8F0);
        border-radius: 20px;
        width: 100%;
        max-width: 820px;
        max-height: calc(100vh - 36px);
        box-shadow: 0 25px 60px rgba(15, 23, 42, 0.28);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: var(--font-body, 'Plus Jakarta Sans', sans-serif);
        color: var(--text-dark, #0F172A);
        box-sizing: border-box;
        animation: backupModalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      ">
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 28px;
          border-bottom: 1px solid var(--border-light, #E2E8F0);
          background: #FFFFFF;
        ">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="
              width: 44px;
              height: 44px;
              border-radius: 12px;
              background: var(--primary-teal-light, rgba(30, 187, 215, 0.12));
              color: var(--primary-teal, #1EBBD7);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            ">
              <i data-lucide="database" style="width: 22px; height: 22px;"></i>
            </div>
            <div>
              <h2 id="backup-modal-title" style="
                margin: 0 0 2px 0;
                font-family: var(--font-display, 'Poppins', sans-serif);
                font-size: 19px;
                font-weight: 700;
                color: var(--text-dark, #0F172A);
              ">Database Backup & Recovery</h2>
              <p style="margin: 0; font-size: 13px; color: var(--text-mid, #64748B);">
                Logical MySQL/MariaDB backup export and isolated sandbox disaster recovery
              </p>
            </div>
          </div>
          <button type="button" id="backup-modal-close-btn" aria-label="Close modal" style="
            background: var(--bg-card, #F1F5F9);
            border: 1px solid var(--border-light, #E2E8F0);
            border-radius: 10px;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-mid, #64748B);
            transition: all 0.15s;
          ">
            <i data-lucide="x" style="width: 18px; height: 18px;"></i>
          </button>
        </div>

        <!-- Scrollable Modal Body -->
        <div id="backup-modal-body" style="
          padding: 24px 28px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 24px;
          box-sizing: border-box;
        ">
          <!-- Loading placeholder until status loads -->
          <div id="backup-status-loading" style="
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 36px 0;
            color: var(--text-mid, #64748B);
            font-size: 14px;
          ">
            <i data-lucide="loader-2" class="spin" style="width: 20px; height: 20px; animation: spin 1s linear infinite;"></i>
            <span>Connecting to database service...</span>
          </div>

          <!-- Main Status & Action Content (Injected by loadStatus) -->
          <div id="backup-modal-content" style="display: none; flex-direction: column; gap: 24px;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    activeModal = modal;
    if (global.setModalOpenState) global.setModalOpenState(true);

    // Add keyframes if not existing
    if (!document.getElementById('backup-modal-keyframes')) {
      const style = document.createElement('style');
      style.id = 'backup-modal-keyframes';
      style.textContent = `
        @keyframes backupModalFadeIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    // Modal dismiss handlers
    const closeBtn = modal.querySelector('#backup-modal-close-btn');
    const closeModal = () => {
      if (isRestoring) return; // Prevent closing while restore is in flight
      if (global.setModalOpenState) global.setModalOpenState(false);
      modal.remove();
      activeModal = null;
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const keyHandler = (e) => {
      if (e.key === 'Escape' && !isRestoring) {
        closeModal();
        window.removeEventListener('keydown', keyHandler);
      }
    };
    window.addEventListener('keydown', keyHandler);

    // Load initial backup status and history
    await loadBackupStatus(modal);
  }

  /**
   * Helper to render the recent backups table or empty state.
   */
  function renderRecentBackupsTable(recent) {
    if (!recent || recent.length === 0) {
      return `
        <div style="text-align: center; padding: 20px; font-size: 13px; color: var(--text-muted, #94A3B8); background: var(--bg-card, #F8FAFC); border-radius: 10px; border: 1px dashed var(--border-light, #E2E8F0);">
          No previous successful backups found. Click "Create Backup" above to generate your first archive.
        </div>
      `;
    }
    return `
      <div style="overflow-x: auto; border: 1px solid var(--border-light, #E2E8F0); border-radius: 10px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px; text-align: left;">
          <thead>
            <tr style="background: var(--bg-card, #F8FAFC); border-bottom: 1px solid var(--border-light, #E2E8F0); color: var(--text-mid, #64748B);">
              <th style="padding: 9px 14px; font-weight: 600;">Filename</th>
              <th style="padding: 9px 14px; font-weight: 600;">Date & Time</th>
              <th style="padding: 9px 14px; font-weight: 600;">Size</th>
              <th style="padding: 9px 14px; font-weight: 600;">SHA-256 Checksum</th>
              <th style="padding: 9px 14px; font-weight: 600; text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${recent.map((b, idx) => `
              <tr style="border-bottom: ${idx === recent.length - 1 ? 'none' : '1px solid var(--border-light, #E2E8F0)'};">
                <td style="padding: 9px 14px; font-weight: 600; color: var(--text-dark, #0F172A); font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px;">
                  ${escapeHtml(b.Filename)}
                </td>
                <td style="padding: 9px 14px; color: var(--text-mid, #64748B); white-space: nowrap;">
                  ${escapeHtml(formatDate(b.Created_At))}
                </td>
                <td style="padding: 9px 14px; color: var(--text-mid, #64748B); white-space: nowrap;">
                  ${escapeHtml(formatBytes(b.File_Size_Bytes))}
                </td>
                <td style="padding: 9px 14px; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11px; color: var(--text-mid, #64748B);" title="${escapeHtml(b.Checksum_SHA256 || '')}">
                  ${escapeHtml(b.Checksum_SHA256 ? `${b.Checksum_SHA256.substring(0, 10)}...${b.Checksum_SHA256.substring(54)}` : 'N/A')}
                </td>
                <td style="padding: 9px 14px; text-align: right;">
                  <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; background: rgba(34, 197, 94, 0.12); color: #16A34A;">
                    SUCCESS
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Updates only dynamic status metrics and history table without re-rendering modal forms or destroying result boxes.
   */
  function updateModalStatus(modalEl, status) {
    const tableCount = status.baseTableCount || 0;
    const latest = status.latestBackup || null;
    const recent = status.recentBackups || [];

    const tablesEl = modalEl.querySelector('#backup-overview-tables');
    if (tablesEl) {
      tablesEl.innerHTML = `${escapeHtml(String(tableCount))} <span style="font-size: 12px; font-weight: 500; color: var(--text-mid, #64748B);">base tables</span>`;
    }

    const latestEl = modalEl.querySelector('#backup-overview-latest');
    if (latestEl) {
      latestEl.textContent = latest ? formatDate(latest.Created_At) : 'No backups recorded';
    }

    const tableContainer = modalEl.querySelector('#recent-backups-table-container');
    if (tableContainer) {
      tableContainer.innerHTML = renderRecentBackupsTable(recent);
    }
  }

  /**
   * Fetches status metadata and populates the modal sections.
   * @param {HTMLElement} modalEl
   */
  async function loadBackupStatus(modalEl) {
    const loadingEl = modalEl.querySelector('#backup-status-loading');
    const contentEl = modalEl.querySelector('#backup-modal-content');

    try {
      const res = await fetch('/api/admin/backups/status', {
        method: 'GET',
        credentials: 'include'
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with HTTP ${res.status}`);
      }

      const status = await res.json();
      const alreadyRendered = contentEl && contentEl.children.length > 0 && modalEl.querySelector('#backup-created-result-container');
      if (alreadyRendered) {
        updateModalStatus(modalEl, status);
      } else {
        renderModalContent(modalEl, status);
      }
    } catch (err) {
      if (loadingEl) {
        loadingEl.innerHTML = `
          <div style="color: #EF4444; display: flex; align-items: center; gap: 8px;">
            <i data-lucide="alert-triangle" style="width: 20px; height: 20px;"></i>
            <span>Failed to load backup status: ${escapeHtml(err.message)}</span>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: loadingEl });
        }
      }
    }
  }

  /**
   * Renders the modal's two distinct sections: Backup Export & Sandbox Recovery.
   * @param {HTMLElement} modalEl
   * @param {object} status
   */
  function renderModalContent(modalEl, status) {
    const loadingEl = modalEl.querySelector('#backup-status-loading');
    const contentEl = modalEl.querySelector('#backup-modal-content');
    if (!contentEl) return;

    if (loadingEl) loadingEl.style.display = 'none';
    contentEl.style.display = 'flex';

    const isProd = Boolean(status.isProduction);
    const recoverySandbox = status.recoverySandbox || {};
    const isRecoveryConfigured = Boolean(recoverySandbox.configured);
    const showRecoveryForm = !isProd || isRecoveryConfigured;
    const dbEngine = status.databaseEngine || 'MySQL';
    const dbVersion = status.databaseVersion || 'Unknown';
    const tableCount = status.baseTableCount || 0;
    const latest = status.latestBackup || null;
    const recent = status.recentBackups || [];

    const targetLabel = isRecoveryConfigured ? 'Online Recovery Sandbox' : (isProd ? 'Locked (Production)' : 'labsync_test (Sandbox)');
    const targetColor = isRecoveryConfigured ? '#10B981' : (isProd ? '#EF4444' : 'var(--primary-teal, #1EBBD7)');

    contentEl.innerHTML = `
      <!-- System Overview Banner -->
      <div style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      ">
        <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-mid, #64748B); margin-bottom: 4px;">Engine / Version</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--text-dark, #0F172A); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(dbVersion)}">
            ${escapeHtml(dbEngine)} <span style="font-size: 12px; font-weight: 500; color: var(--text-mid, #64748B);">(${escapeHtml(dbVersion.split('-')[0])})</span>
          </div>
        </div>
        <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-mid, #64748B); margin-bottom: 4px;">Application Tables</div>
          <div id="backup-overview-tables" style="font-size: 14px; font-weight: 700; color: var(--text-dark, #0F172A);">
            ${escapeHtml(String(tableCount))} <span style="font-size: 12px; font-weight: 500; color: var(--text-mid, #64748B);">base tables</span>
          </div>
        </div>
        <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-mid, #64748B); margin-bottom: 4px;">Restoration Target</div>
          <div id="backup-overview-target" style="font-size: 14px; font-weight: 700; color: ${targetColor};">
            ${targetLabel}
          </div>
        </div>
        <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-mid, #64748B); margin-bottom: 4px;">Latest Backup</div>
          <div id="backup-overview-latest" style="font-size: 13.5px; font-weight: 600; color: var(--text-dark, #0F172A);">
            ${latest ? escapeHtml(formatDate(latest.Created_At)) : 'No backups recorded'}
          </div>
        </div>
      </div>

      <!-- ── SECTION A: DATABASE BACKUP (EXPORT) ───────────────────────── -->
      <div style="
        border: 1px solid var(--border-light, #E2E8F0);
        border-radius: 16px;
        padding: 20px 22px;
        background: #FFFFFF;
        display: flex;
        flex-direction: column;
        gap: 16px;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0 0 3px 0; font-size: 16px; font-weight: 700; color: var(--text-dark, #0F172A); display: flex; align-items: center; gap: 8px;">
              <i data-lucide="download" style="width: 17px; height: 17px; color: var(--primary-teal, #1EBBD7);"></i>
              Database Backup Export
            </h3>
            <p style="margin: 0; font-size: 12.5px; color: var(--text-mid, #64748B);">
              Generates a compressed, topologically sorted <code style="background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">.sql.gz</code> archive with a verified SHA-256 integrity digest.
            </p>
          </div>
          <button type="button" id="btn-create-backup" style="
            background: var(--primary-teal, #1EBBD7);
            color: #FFFFFF;
            border: none;
            border-radius: 10px;
            padding: 10px 18px;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 14px var(--primary-teal-glow, rgba(30, 187, 215, 0.3));
            transition: all 0.15s ease;
          ">
            <i data-lucide="file-archive" style="width: 16px; height: 16px;"></i>
            <span>Create Backup</span>
          </button>
        </div>

        <!-- Dynamic Container for Newly Created Backup Download & SHA-256 Display -->
        <div id="backup-created-result-container" style="display: none;"></div>

        <!-- Recent Backups Table -->
        <div style="margin-top: 4px;">
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-mid, #64748B); margin-bottom: 8px;">
            Recent Backup History
          </div>
          <div id="recent-backups-table-container">
            ${renderRecentBackupsTable(recent)}
          </div>
        </div>
      </div>

      <!-- ── SECTION B: SANDBOX RECOVERY (RESTORE) ─────────────────────── -->
      <div style="
        border: 1px solid var(--border-light, #E2E8F0);
        border-radius: 16px;
        padding: 20px 22px;
        background: #FFFFFF;
        display: flex;
        flex-direction: column;
        gap: 16px;
      ">
        <div>
          <h3 style="margin: 0 0 3px 0; font-size: 16px; font-weight: 700; color: var(--text-dark, #0F172A); display: flex; align-items: center; gap: 8px;">
            <i data-lucide="refresh-cw" style="width: 17px; height: 17px; color: ${isRecoveryConfigured ? '#10B981' : (isProd ? '#94A3B8' : '#F59E0B')};"></i>
            ${isRecoveryConfigured ? 'Online Recovery Sandbox' : 'Isolated Sandbox Recovery'}
          </h3>
          <p style="margin: 0; font-size: 12.5px; color: var(--text-mid, #64748B);">
            ${isRecoveryConfigured ? 'Restores a verified <code style="background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">.sql.gz</code> archive strictly into the isolated <strong>Online Recovery Sandbox</strong> database. Live production is never modified.' : 'Restores a verified <code style="background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">.sql.gz</code> archive strictly into the isolated local <code style="background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">labsync_test</code> database.'}
          </p>
        </div>

        ${!showRecoveryForm ? `
          <!-- Production Lockout Warning Banner -->
          <div style="
            background: rgba(239, 68, 68, 0.08);
            border: 1.5px solid rgba(239, 68, 68, 0.25);
            border-radius: 12px;
            padding: 16px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
          ">
            <i data-lucide="shield-alert" style="width: 22px; height: 22px; color: #EF4444; flex-shrink: 0; margin-top: 2px;"></i>
            <div>
              <div style="font-size: 14px; font-weight: 700; color: #B91C1C; margin-bottom: 3px;">
                Restoration Permanently Disabled on Production Deployment
              </div>
              <p style="margin: 0; font-size: 12.5px; color: var(--text-dark, #0F172A); line-height: 1.5;">
                In accordance with LabSync security governance, database restoration is permanently locked out on the cloud production environment. Database restoration may only be executed within an authorized isolated local development sandbox. Backup creation remains fully available.
              </p>
            </div>
          </div>
        ` : `
          <!-- Sandbox Environment Guidance -->
          <div style="
            background: ${isRecoveryConfigured ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)'};
            border: 1.5px solid ${isRecoveryConfigured ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'};
            border-radius: 12px;
            padding: 14px 16px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
          ">
            <i data-lucide="${isRecoveryConfigured ? 'shield-check' : 'info'}" style="width: 19px; height: 19px; color: ${isRecoveryConfigured ? '#059669' : '#D97706'}; flex-shrink: 0; margin-top: 2px;"></i>
            <div style="font-size: 12.5px; color: var(--text-dark, #0F172A); line-height: 1.45;">
              ${isRecoveryConfigured ? '<strong>Online Recovery Sandbox Invariants:</strong> The uploaded archive is verified and restored strictly into the dedicated Railway recovery database. The live production database will never be overwritten. Re-authentication with your administrator password is required.' : '<strong>Sandbox Isolation Invariants:</strong> The uploaded archive is verified and restored into the local <code>labsync_test</code> database only. The main <code>labsync</code> database is never modified or overwritten. Re-authentication with your administrator password is required.'}
            </div>
          </div>

          <!-- Sandbox Restore Form -->
          <form id="sandbox-restore-form" style="display: flex; flex-direction: column; gap: 16px; margin: 0;">
            <!-- 1. Archive File Input -->
            <div>
              <label for="restore-file-input" style="display: block; font-size: 13px; font-weight: 600; color: var(--text-dark, #0F172A); margin-bottom: 6px;">
                Backup Archive File (.sql.gz) *
              </label>
              <div style="display: flex; align-items: center; gap: 10px;">
                <input
                  type="file"
                  id="restore-file-input"
                  accept=".gz,.sql.gz,application/gzip"
                  required
                  style="
                    flex: 1;
                    padding: 9px 12px;
                    border: 1.5px solid var(--border-light, #E2E8F0);
                    border-radius: 10px;
                    font-size: 13px;
                    background: var(--bg-card, #F8FAFC);
                    color: var(--text-dark, #0F172A);
                    box-sizing: border-box;
                  "
                />
              </div>
              <div id="restore-file-info" style="font-size: 12px; color: var(--text-mid, #64748B); margin-top: 4px;">
                Select a valid gzip-compressed SQL backup archive (up to 50MB).
              </div>
            </div>

            <!-- 2. Checksum Input & .sha256 Loader -->
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <label for="restore-checksum-input" style="font-size: 13px; font-weight: 600; color: var(--text-dark, #0F172A); margin: 0;">
                  Expected SHA-256 Checksum *
                </label>
                <label for="restore-sha-file-input" style="
                  font-size: 12px;
                  font-weight: 600;
                  color: var(--primary-teal, #1EBBD7);
                  cursor: pointer;
                  display: inline-flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <i data-lucide="file-check" style="width: 14px; height: 14px;"></i>
                  <span>Load from .sha256 file</span>
                  <input type="file" id="restore-sha-file-input" accept=".sha256,.txt" style="display: none;" />
                </label>
              </div>
              <input
                type="text"
                id="restore-checksum-input"
                required
                maxlength="64"
                placeholder="64-character hexadecimal SHA-256 digest"
                style="
                  width: 100%;
                  padding: 10px 14px;
                  border: 1.5px solid var(--border-light, #E2E8F0);
                  border-radius: 10px;
                  font-size: 12.5px;
                  font-family: ui-monospace, SFMono-Regular, monospace;
                  background: var(--bg-card, #F8FAFC);
                  color: var(--text-dark, #0F172A);
                  box-sizing: border-box;
                "
              />
              <div id="restore-checksum-status" style="font-size: 12px; color: var(--text-mid, #64748B); margin-top: 4px;">
                Must match the original digest generated during backup creation.
              </div>
            </div>

            <!-- 3. Administrator Re-Authentication Password Input -->
            <div>
              <label for="restore-admin-password" style="display: block; font-size: 13px; font-weight: 600; color: var(--text-dark, #0F172A); margin-bottom: 6px;">
                IT Department Head Password Confirmation *
              </label>
              <div style="position: relative;">
                <input
                  type="password"
                  id="restore-admin-password"
                  required
                  placeholder="Enter your current password to authorize sandbox restoration"
                  autocomplete="current-password"
                  style="
                    width: 100%;
                    padding: 10px 42px 10px 14px;
                    border: 1.5px solid var(--border-light, #E2E8F0);
                    border-radius: 10px;
                    font-size: 13px;
                    background: var(--bg-card, #F8FAFC);
                    color: var(--text-dark, #0F172A);
                    box-sizing: border-box;
                  "
                />
                <button
                  type="button"
                  id="btn-toggle-restore-password"
                  aria-label="Toggle password visibility"
                  style="
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: var(--text-mid, #64748B);
                    padding: 6px;
                    display: flex;
                    align-items: center;
                  "
                >
                  <i data-lucide="eye" style="width: 18px; height: 18px;"></i>
                </button>
              </div>
              <div style="font-size: 12px; color: var(--text-mid, #64748B); margin-top: 4px;">
                Verified server-side via bcrypt. Never logged or stored.
              </div>
            </div>

            <!-- Restore Action Buttons & Status -->
            <div id="restore-status-message-container" style="display: none;"></div>

            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-top: 4px;">
              <button
                type="submit"
                id="btn-execute-restore"
                style="
                  background: ${isRecoveryConfigured ? '#059669' : '#D97706'};
                  color: #FFFFFF;
                  border: none;
                  border-radius: 10px;
                  padding: 11px 22px;
                  font-size: 13.5px;
                  font-weight: 700;
                  cursor: pointer;
                  display: inline-flex;
                  align-items: center;
                  gap: 8px;
                  box-shadow: 0 4px 14px ${isRecoveryConfigured ? 'rgba(5, 150, 105, 0.3)' : 'rgba(217, 119, 6, 0.3)'};
                  transition: all 0.15s ease;
                "
              >
                <i data-lucide="rotate-ccw" style="width: 16px; height: 16px;"></i>
                <span>${isRecoveryConfigured ? 'Restore into Online Sandbox' : 'Restore into Sandbox'}</span>
              </button>
            </div>
          </form>
        `}

        <!-- Recovery Verification Screen & Demonstration Tool Panel -->
        <div id="recovery-verification-panel" style="display: none;"></div>
      </div>
    `;

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: contentEl });
    }

    // Attach Event Listeners
    setupBackupAction(modalEl);
    if (showRecoveryForm) {
      setupRestoreAction(modalEl, isRecoveryConfigured);
    }
    if (recoverySandbox && recoverySandbox.latestRecovery) {
      renderRecoveryVerification(modalEl, recoverySandbox.latestRecovery);
    }
  }

  /**
   * Sets up the Backup Export click listener and download flow.
   * @param {HTMLElement} modalEl
   */
  function setupBackupAction(modalEl) {
    const createBtn = modalEl.querySelector('#btn-create-backup');
    const resultContainer = modalEl.querySelector('#backup-created-result-container');
    if (!createBtn) return;

    createBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      createBtn.disabled = true;
      if (resultContainer) {
        resultContainer.style.display = 'none';
        resultContainer.innerHTML = '';
      }
      const originalHtml = createBtn.innerHTML;
      createBtn.innerHTML = `
        <i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i>
        <span>Generating Backup...</span>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: createBtn });
      }

      try {
        let res;
        try {
          res = await fetch('/api/admin/backups/create', {
            method: 'POST',
            credentials: 'include'
          });
        } catch (fetchErr) {
          throw new Error('Network error: Unable to connect to the server. Please check your network connection.');
        }

        if (!res.ok) {
          let errMsg = `Backup creation failed (HTTP ${res.status})`;
          if (res.status === 401) {
            errMsg = 'Session expired or unauthenticated. Please refresh and log in as IT Department Head.';
          } else if (res.status === 403) {
            errMsg = 'Access denied. Only the IT Department Head is authorized to generate database backups.';
          } else if (res.status === 429) {
            errMsg = 'Backup rate limit reached. Please wait a few moments before requesting another backup.';
          } else {
            try {
              const errJson = await res.json();
              if (errJson && typeof errJson.error === 'string' && errJson.error.trim()) {
                errMsg = errJson.error.trim();
              }
            } catch (_) {}
          }
          throw new Error(errMsg);
        }

        // 1. Extract and validate SHA-256 Checksum header
        const checksumSha256 = (res.headers.get('x-backup-checksum') || '').trim();
        if (!checksumSha256 || !/^[0-9a-fA-F]{64}$/.test(checksumSha256)) {
          throw new Error('Archive integrity check failed: Missing or invalid SHA-256 checksum from server.');
        }

        // 2. Extract filename from Content-Disposition header safely
        let filename = `labsync_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql.gz`;
        const disp = res.headers.get('content-disposition');
        if (disp) {
          const match = disp.match(/filename=["']?([^"';]+)["']?/i);
          if (match && match[1]) {
            filename = match[1].trim();
          }
        }

        // 3. Receive archive blob
        let blob;
        try {
          blob = await res.blob();
        } catch (blobErr) {
          throw new Error('Download interrupted: Failed to receive the complete backup archive.');
        }

        const fileSizeBytes = blob ? blob.size : 0;
        if (!blob || fileSizeBytes === 0) {
          throw new Error('Archive download failed: Received empty backup file from server.');
        }

        // 4. Trigger primary single download for .sql.gz
        const blobUrl = window.URL.createObjectURL(blob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        setTimeout(() => {
          document.body.removeChild(downloadLink);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);

        // 5. Display the SHA-256 Checksum & companion download button
        if (resultContainer) {
          resultContainer.style.display = 'block';
          resultContainer.innerHTML = `
            <div style="
              background: rgba(34, 197, 94, 0.08);
              border: 1.5px solid rgba(34, 197, 94, 0.25);
              border-radius: 12px;
              padding: 16px;
              display: flex;
              flex-direction: column;
              gap: 12px;
            ">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; color: #16A34A; font-weight: 700; font-size: 14px;">
                  <i data-lucide="check-circle" style="width: 18px; height: 18px;"></i>
                  <span>Backup Download Started: ${escapeHtml(filename)} (${formatBytes(fileSizeBytes)})</span>
                </div>
              </div>

              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-dark, #0F172A); margin-bottom: 4px;">
                  Verified SHA-256 Checksum:
                </label>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input
                    type="text"
                    readonly
                    id="created-backup-checksum-field"
                    value="${escapeHtml(checksumSha256)}"
                    style="
                      flex: 1;
                      padding: 8px 12px;
                      border: 1px solid rgba(34, 197, 94, 0.35);
                      border-radius: 8px;
                      font-family: ui-monospace, SFMono-Regular, monospace;
                      font-size: 12px;
                      background: #FFFFFF;
                      color: #0F172A;
                    "
                  />
                  <button
                    type="button"
                    id="btn-copy-checksum"
                    style="
                      padding: 8px 14px;
                      background: #FFFFFF;
                      border: 1.5px solid var(--border-light, #E2E8F0);
                      border-radius: 8px;
                      font-size: 12.5px;
                      font-weight: 600;
                      color: var(--text-dark, #0F172A);
                      cursor: pointer;
                      display: inline-flex;
                      align-items: center;
                      gap: 6px;
                      white-space: nowrap;
                    "
                  >
                    <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
                    <span>Copy Checksum</span>
                  </button>
                  <button
                    type="button"
                    id="btn-download-sha256-companion"
                    style="
                      padding: 8px 14px;
                      background: #16A34A;
                      border: none;
                      border-radius: 8px;
                      font-size: 12.5px;
                      font-weight: 600;
                      color: #FFFFFF;
                      cursor: pointer;
                      display: inline-flex;
                      align-items: center;
                      gap: 6px;
                      white-space: nowrap;
                    "
                  >
                    <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
                    <span>Download .sha256</span>
                  </button>
                </div>
              </div>
            </div>
          `;

          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: resultContainer });
          }

          // Copy Checksum button handler
          const copyBtn = resultContainer.querySelector('#btn-copy-checksum');
          if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
              try {
                await navigator.clipboard.writeText(checksumSha256);
                if (global.showToast) {
                  global.showToast('SHA-256 checksum copied to clipboard.', 'success');
                }
              } catch (_) {
                const field = resultContainer.querySelector('#created-backup-checksum-field');
                if (field) {
                  field.select();
                  document.execCommand('copy');
                  if (global.showToast) global.showToast('Checksum copied.', 'success');
                }
              }
            });
          }

          // Explicit Download .sha256 button handler
          const downloadShaBtn = resultContainer.querySelector('#btn-download-sha256-companion');
          if (downloadShaBtn) {
            downloadShaBtn.addEventListener('click', () => {
              const shaContent = `${checksumSha256}  ${filename}\n`;
              const shaBlob = new Blob([shaContent], { type: 'text/plain' });
              const shaUrl = window.URL.createObjectURL(shaBlob);
              const shaLink = document.createElement('a');
              shaLink.href = shaUrl;
              shaLink.download = `${filename}.sha256`;
              document.body.appendChild(shaLink);
              shaLink.click();
              setTimeout(() => {
                document.body.removeChild(shaLink);
                window.URL.revokeObjectURL(shaUrl);
              }, 100);

              if (global.showToast) {
                global.showToast(`Saved ${filename}.sha256`, 'info');
              }
            });
          }
        }

        if (global.showToast) {
          global.showToast('Database backup archive created and verified successfully.', 'success');
        }

        // Refresh status to update table history
        await loadBackupStatus(modalEl);
      } catch (err) {
        const errorText = escapeHtml(err.message || 'Backup generation failed');
        if (resultContainer) {
          resultContainer.style.display = 'block';
          resultContainer.innerHTML = `
            <div style="
              background: rgba(239, 68, 68, 0.08);
              border: 1.5px solid rgba(239, 68, 68, 0.25);
              border-radius: 12px;
              padding: 14px 16px;
              display: flex;
              align-items: flex-start;
              gap: 12px;
            ">
              <i data-lucide="alert-triangle" style="width: 20px; height: 20px; color: #DC2626; flex-shrink: 0; margin-top: 1px;"></i>
              <div style="flex: 1;">
                <div style="font-weight: 700; color: #DC2626; font-size: 13.5px; margin-bottom: 2px;">
                  Backup Export Failed
                </div>
                <div style="font-size: 12.5px; color: #7F1D1D; line-height: 1.4;">
                  ${errorText}
                </div>
              </div>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: resultContainer });
          }
        }

        if (global.showToast) {
          global.showToast(err.message || 'Backup generation failed', 'error');
        } else {
          alert(`Backup error: ${err.message}`);
        }
      } finally {
        createBtn.disabled = false;
        createBtn.innerHTML = originalHtml;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: createBtn });
        }
      }
    });
  }

  /**
   * Renders the Recovery Verification & Demonstration Comparison Screen.
   * @param {HTMLElement} modalEl
   * @param {object} summary
   */
  function renderRecoveryVerification(modalEl, summary) {
    const panel = modalEl.querySelector('#recovery-verification-panel');
    if (!panel || !summary) return;

    panel.style.display = 'block';

    const isSuccess = summary.status === 'SUCCESS';
    const targetLabel = summary.targetLabel || 'Recovery Sandbox';
    const restoredAt = formatDate(summary.restoredAt);
    const tableCount = summary.tableCount || 0;
    const recordCounts = summary.recordCounts || {};
    const checksum = summary.checksumSha256 || 'Verified';

    panel.innerHTML = `
      <div style="
        margin-top: 8px;
        background: var(--bg-card, #F8FAFC);
        border: 1.5px solid ${isSuccess ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'};
        border-radius: 14px;
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      ">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 34px; height: 34px; border-radius: 10px; background: ${isSuccess ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)'}; display: flex; align-items: center; justify-content: center;">
              <i data-lucide="${isSuccess ? 'shield-check' : 'alert-octagon'}" style="width: 20px; height: 20px; color: ${isSuccess ? '#16A34A' : '#EF4444'};"></i>
            </div>
            <div>
              <h4 style="margin: 0; font-size: 14.5px; font-weight: 700; color: var(--text-dark, #0F172A);">
                Recovery Verification & Snapshot Audit
              </h4>
              <div style="font-size: 12px; color: var(--text-mid, #64748B);">
                Target: <strong style="color: ${isSuccess ? '#16A34A' : '#EF4444'};">${escapeHtml(targetLabel)}</strong> | Restored: ${escapeHtml(restoredAt)}
              </div>
            </div>
          </div>
          <span style="display: inline-block; padding: 4px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700; background: ${isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${isSuccess ? '#15803D' : '#B91C1C'};">
            ${isSuccess ? 'VERIFIED SUCCESS' : 'RESTORATION FAILED'}
          </span>
        </div>

        <!-- Metrics Overview Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
          <div style="background: #FFFFFF; border: 1px solid var(--border-light, #E2E8F0); border-radius: 10px; padding: 10px 12px;">
            <div style="font-size: 11px; font-weight: 600; color: var(--text-mid, #64748B); text-transform: uppercase;">Restored Tables</div>
            <div style="font-size: 15px; font-weight: 700; color: var(--text-dark, #0F172A); margin-top: 2px;">${escapeHtml(String(tableCount))}</div>
          </div>
          ${Object.entries(recordCounts).map(([tbl, cnt]) => `
            <div style="background: #FFFFFF; border: 1px solid var(--border-light, #E2E8F0); border-radius: 10px; padding: 10px 12px;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-mid, #64748B); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(tbl)}">${escapeHtml(tbl)}</div>
              <div style="font-size: 15px; font-weight: 700; color: var(--text-dark, #0F172A); margin-top: 2px;">${escapeHtml(String(cnt))}</div>
            </div>
          `).join('')}
        </div>

        <!-- Checksum Verification Row -->
        <div style="font-size: 11.5px; color: var(--text-mid, #64748B); font-family: ui-monospace, SFMono-Regular, monospace; background: #FFFFFF; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-light, #E2E8F0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          SHA-256 Digest: <strong>${escapeHtml(checksum)}</strong>
        </div>

        <!-- Demonstration Room Comparison Tool -->
        <div style="border-top: 1px solid var(--border-light, #E2E8F0); padding-top: 14px;">
          <div style="font-size: 13px; font-weight: 700; color: var(--text-dark, #0F172A); margin-bottom: 2px;">
            Demonstration Proof: Verify Snapshot Isolation
          </div>
          <p style="margin: 0 0 10px 0; font-size: 12px; color: var(--text-mid, #64748B); line-height: 1.4;">
            Search for a room created in live production <em>after</em> the backup (e.g. <code>RESTORE-DEMO-999</code> or <code>999</code>). Proof is established when the record exists in live production but is absent in the restored sandbox snapshot.
          </p>

          <div style="display: flex; gap: 8px; align-items: center;">
            <input
              type="text"
              id="recovery-demo-room-input"
              placeholder="Enter room number (e.g. RESTORE-DEMO-999 or 999)"
              style="
                flex: 1;
                padding: 9px 12px;
                border: 1.5px solid var(--border-light, #E2E8F0);
                border-radius: 8px;
                font-size: 12.5px;
                background: #FFFFFF;
                color: var(--text-dark, #0F172A);
              "
            />
            <button
              type="button"
              id="btn-compare-demo-room"
              style="
                padding: 9px 16px;
                background: var(--primary-teal, #1EBBD7);
                color: #FFFFFF;
                border: none;
                border-radius: 8px;
                font-size: 12.5px;
                font-weight: 600;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
              "
            >
              <i data-lucide="search" style="width: 14px; height: 14px;"></i>
              <span>Compare with Production</span>
            </button>
          </div>

          <!-- Comparison Result Output -->
          <div id="recovery-demo-comparison-result" style="margin-top: 10px;"></div>
        </div>

        <!-- Blue-Green Production Database Promotion Section -->
        <div style="border-top: 1.5px dashed var(--border-light, #E2E8F0); padding-top: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <div style="width: 28px; height: 28px; border-radius: 8px; background: rgba(30, 187, 215, 0.12); display: flex; align-items: center; justify-content: center;">
                <i data-lucide="server" style="width: 16px; height: 16px; color: var(--primary-teal, #1EBBD7);"></i>
              </div>
              <div>
                <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: var(--text-dark, #0F172A);">
                  Blue-Green Production Database Promotion
                </h4>
                <div style="font-size: 11.5px; color: var(--text-mid, #64748B);">
                  Promote the verified recovered database (Green) to active production without modifying the original (Blue).
                </div>
              </div>
            </div>
            <button
              type="button"
              id="btn-check-promotion-readiness"
              style="
                padding: 7px 14px;
                background: #FFFFFF;
                border: 1.5px solid var(--border-light, #E2E8F0);
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                color: var(--text-dark, #0F172A);
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                gap: 6px;
              "
            >
              <i data-lucide="shield-check" style="width: 14px; height: 14px; color: #10B981;"></i>
              <span>Verify Promotion Readiness</span>
            </button>
          </div>

          <!-- Promotion Readiness Output Container -->
          <div id="promotion-readiness-container" style="display: none; margin-top: 12px;"></div>
        </div>
      </div>
    `;

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: panel });
    }

    // Attach listener to Compare button
    const compareBtn = panel.querySelector('#btn-compare-demo-room');
    const roomInput = panel.querySelector('#recovery-demo-room-input');
    const compResultContainer = panel.querySelector('#recovery-demo-comparison-result');

    if (compareBtn && roomInput && compResultContainer) {
      compareBtn.addEventListener('click', async () => {
        const query = (roomInput.value || '').trim();
        if (!query) {
          if (global.showToast) global.showToast('Please enter a room number to compare.', 'warning');
          return;
        }

        compareBtn.disabled = true;
        compareBtn.innerHTML = `<span>Comparing...</span>`;

        try {
          const res = await fetch(`/api/admin/backups/recovery/compare?room=${encodeURIComponent(query)}`, {
            method: 'GET',
            credentials: 'include'
          });

          const comp = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(comp.error || `Comparison failed with HTTP ${res.status}`);
          }

          const isProven = comp.demonstrationStatus === 'DEMONSTRATION_PROVEN';

          compResultContainer.innerHTML = `
            <div style="background: #FFFFFF; border: 1.5px solid ${isProven ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)'}; border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                <span style="font-size: 13px; font-weight: 700; color: var(--text-dark, #0F172A);">
                  Comparison Query: <code>${escapeHtml(comp.query)}</code>
                </span>
                <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; background: ${isProven ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.12)'}; color: ${isProven ? '#15803D' : '#B45309'};">
                  ${isProven ? 'DEMONSTRATION VERIFIED' : escapeHtml(comp.demonstrationStatus)}
                </span>
              </div>

              <!-- Side by Side Cards -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <!-- Production Card -->
                <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 11px; font-weight: 600; color: var(--text-mid, #64748B); text-transform: uppercase;">
                    ${escapeHtml(comp.production.label)}
                  </div>
                  <div style="font-size: 13.5px; font-weight: 700; color: ${comp.production.exists ? '#15803D' : '#64748B'}; margin-top: 2px;">
                    ${comp.production.exists ? '✓ Record Exists (Found)' : '✗ Not Found'}
                  </div>
                  ${comp.production.roomNumber ? `
                    <div style="font-size: 11.5px; color: var(--text-mid, #64748B); margin-top: 2px;">
                      Room: <strong>${escapeHtml(comp.production.roomNumber)}</strong> (${escapeHtml(comp.production.building || 'Main')})
                    </div>
                  ` : ''}
                </div>

                <!-- Recovery Sandbox Card -->
                <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 11px; font-weight: 600; color: var(--text-mid, #64748B); text-transform: uppercase;">
                    ${escapeHtml(comp.recoverySandbox.label)}
                  </div>
                  <div style="font-size: 13.5px; font-weight: 700; color: ${comp.recoverySandbox.exists ? '#B45309' : '#15803D'}; margin-top: 2px;">
                    ${comp.recoverySandbox.exists ? 'Record Exists in Snapshot' : '✓ Record Absent (Snapshot Restored)'}
                  </div>
                  ${comp.recoverySandbox.roomNumber ? `
                    <div style="font-size: 11.5px; color: var(--text-mid, #64748B); margin-top: 2px;">
                      Room: <strong>${escapeHtml(comp.recoverySandbox.roomNumber)}</strong>
                    </div>
                  ` : ''}
                </div>
              </div>

              <!-- Explanation Text -->
              <div style="font-size: 12px; color: ${isProven ? '#15803D' : 'var(--text-dark, #0F172A)'}; line-height: 1.45; background: ${isProven ? 'rgba(34, 197, 94, 0.05)' : 'transparent'}; padding: 6px 8px; border-radius: 6px;">
                ${escapeHtml(comp.explanation)}
              </div>
            </div>
          `;
        } catch (err) {
          compResultContainer.innerHTML = `
            <div style="color: #EF4444; font-size: 12px;">
              Comparison error: ${escapeHtml(err.message)}
            </div>
          `;
        } finally {
          compareBtn.disabled = false;
          compareBtn.innerHTML = `<i data-lucide="search" style="width: 14px; height: 14px;"></i><span>Compare with Production</span>`;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: compareBtn });
          }
        }
      });
    }

    // Attach listener to Promotion Readiness button
    const promoCheckBtn = panel.querySelector('#btn-check-promotion-readiness');
    const promoContainer = panel.querySelector('#promotion-readiness-container');

    if (promoCheckBtn && promoContainer) {
      promoCheckBtn.addEventListener('click', async () => {
        promoCheckBtn.disabled = true;
        promoCheckBtn.innerHTML = `<span>Checking readiness...</span>`;

        try {
          const res = await fetch('/api/admin/backups/recovery/promotion-status', {
            method: 'GET',
            credentials: 'include'
          });
          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(data.error || `Readiness check failed with HTTP ${res.status}`);
          }

          promoContainer.style.display = 'block';

          const ready = Boolean(data.ready);
          const active = data.activeDatabase || {};
          const cand = data.candidateDatabase || {};
          const checks = data.checks || {};
          const isMaint = Boolean(checks.maintenanceModeActive);
          const isEnvDriven = Boolean(checks.isEnvironmentDriven);

          promoContainer.innerHTML = `
            <div style="background: #FFFFFF; border: 1.5px solid ${ready ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px;">
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <i data-lucide="${ready ? 'check-circle' : 'alert-triangle'}" style="width: 18px; height: 18px; color: ${ready ? '#10B981' : '#F59E0B'};"></i>
                  <strong style="font-size: 13.5px; color: var(--text-dark, #0F172A);">
                    ${ready ? 'Ready for Blue-Green Promotion' : 'Promotion Pre-Checks Pending'}
                  </strong>
                </div>
                <span style="font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px; background: ${ready ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}; color: ${ready ? '#059669' : '#DC2626'};">
                  ${ready ? 'PRE-CHECKS PASSED' : (data.reason || 'ACTION REQUIRED')}
                </span>
              </div>

              <!-- Blue vs Green Identity Cards -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 11px; font-weight: 700; color: #3B82F6; text-transform: uppercase;">
                    Blue (Current Active Production)
                  </div>
                  <div style="font-size: 12px; color: var(--text-dark, #0F172A); margin-top: 4px;">
                    Engine: <strong>${escapeHtml(active.engine || 'MySQL')}</strong><br/>
                    Database: <code>${escapeHtml(active.database || 'railway')}</code><br/>
                    <span style="font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--text-mid, #64748B);">UUID: ${escapeHtml(active.serverUuid || 'Unknown')}</span>
                  </div>
                  <div style="margin-top: 6px; font-size: 11px; color: #15803D; font-weight: 600;">
                    ✓ Remains untouched as fallback
                  </div>
                </div>

                <div style="background: var(--bg-card, #F8FAFC); border: 1px solid var(--border-light, #E2E8F0); border-radius: 8px; padding: 10px 12px;">
                  <div style="font-size: 11px; font-weight: 700; color: #10B981; text-transform: uppercase;">
                    Green (Recovered Candidate)
                  </div>
                  <div style="font-size: 12px; color: var(--text-dark, #0F172A); margin-top: 4px;">
                    Engine: <strong>${escapeHtml(cand.engine || 'MySQL 8.4')}</strong><br/>
                    Tables: <strong>${escapeHtml(String(cand.tableCount || 0))} verified</strong><br/>
                    <span style="font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--text-mid, #64748B);">UUID: ${escapeHtml(cand.serverUuid || 'Unknown')}</span>
                  </div>
                  <div style="margin-top: 6px; font-size: 11px; color: #0284C7; font-weight: 600;">
                    ✓ Restored snapshot ready
                  </div>
                </div>
              </div>

              <!-- Maintenance Mode Cutover Banner & Toggle -->
              <div style="background: ${isMaint ? 'rgba(245, 158, 11, 0.1)' : 'rgba(241, 245, 249, 0.7)'}; border: 1px solid ${isMaint ? 'rgba(245, 158, 11, 0.3)' : 'var(--border-light, #E2E8F0)'}; border-radius: 8px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                <div>
                  <div style="font-size: 12px; font-weight: 700; color: ${isMaint ? '#B45309' : 'var(--text-dark, #0F172A)'};">
                    Cutover Maintenance Mode: ${isMaint ? (isEnvDriven ? 'ACTIVE (Railway Environment Enforced)' : 'ACTIVE (Runtime Writes Blocked)') : 'INACTIVE (Writes Allowed)'}
                  </div>
                  <div style="font-size: 11.5px; color: var(--text-mid, #64748B); margin-top: 2px;">
                    ${isEnvDriven
                      ? 'Enforced by Railway Variable (MAINTENANCE_MODE=true). Mutating requests blocked (503). To resume ordinary operations, set MAINTENANCE_MODE=false in Railway and redeploy.'
                      : (isMaint ? 'All modifying HTTP requests are currently blocked with HTTP 503 to ensure zero data divergence.' : 'Enable maintenance mode before switching Railway variables to prevent concurrent writes.')}
                  </div>
                  <div style="font-size: 11px; margin-top: 4px; color: ${checks.cutoverDrained !== false ? '#15803D' : '#D97706'}; font-weight: 600;">
                    ${checks.cutoverDrained !== false
                      ? '✓ All operations drained &amp; idle (0 active requests, workers idle)'
                      : `⏳ Draining operations (${checks.activeMutationRequests || 0} active mutation requests, workers ${checks.backgroundJobsDrained !== false ? 'idle' : 'running'})...`}
                  </div>
                </div>
                ${isEnvDriven ? `
                <div style="font-size: 11px; font-weight: 700; color: #B45309; background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 6px; padding: 4px 8px; white-space: nowrap;">
                  Controlled by Railway
                </div>
                ` : `
                <button
                  type="button"
                  id="btn-toggle-cutover-maintenance"
                  style="
                    padding: 6px 14px;
                    background: ${isMaint ? '#DC2626' : '#D97706'};
                    color: #FFFFFF;
                    border: none;
                    border-radius: 6px;
                    font-size: 11.5px;
                    font-weight: 700;
                    cursor: pointer;
                    white-space: nowrap;
                  "
                >
                  ${isMaint ? 'Disable Maintenance' : 'Enable Maintenance'}
                </button>
                `}
              </div>

              <!-- Manual Connection Switch Instructions -->
              <div style="border-top: 1px solid var(--border-light, #E2E8F0); padding-top: 10px;">
                <div style="font-size: 12px; font-weight: 700; color: var(--text-dark, #0F172A); margin-bottom: 4px;">
                  Railway Service Connection Switch Procedure:
                </div>
                <p style="margin: 0 0 8px 0; font-size: 11.5px; color: var(--text-mid, #64748B); line-height: 1.4;">
                  In Railway &rarr; <strong>Labsync-BULSU-Sarmiento-</strong> &rarr; <strong>Variables</strong>, update the production database references:
                </p>
                <pre style="background: #0F172A; color: #38BDF8; padding: 10px 12px; border-radius: 8px; font-size: 11px; margin: 0; overflow-x: auto; font-family: ui-monospace, monospace;">DB_HOST=\${{LabSync-Recovery-Sandbox.MYSQLHOST}}
DB_PORT=\${{LabSync-Recovery-Sandbox.MYSQLPORT}}
DB_USER=labsync_app
DB_PASSWORD=&lt;PRIVATE_RUNTIME_PASSWORD&gt;
DB_NAME=\${{LabSync-Recovery-Sandbox.MYSQLDATABASE}}
PROD_SERVER_UUID=df694bff-d6ae-11f1-85d7-a2aaf5f6dd9c
MAINTENANCE_MODE=true</pre>
                <div style="margin-top: 8px; font-size: 11.5px; color: var(--text-mid, #64748B); line-height: 1.4;">
                  <strong>Safety Note:</strong> Rollback before new writes is 100% lossless by changing references back to the Blue MySQL service. For your demonstration, maintain Maintenance Mode active so the restored records can be viewed in Room Management without post-promotion writes.
                </div>
              </div>
            </div>
          `;

          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: promoContainer });
          }

          // Attach listener to maintenance toggle button
          const maintToggleBtn = promoContainer.querySelector('#btn-toggle-cutover-maintenance');
          if (maintToggleBtn) {
            maintToggleBtn.addEventListener('click', async () => {
              maintToggleBtn.disabled = true;
              try {
                const toggleRes = await fetch('/api/admin/backups/maintenance-mode', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ enabled: !isMaint })
                });
                const toggleData = await toggleRes.json().catch(() => ({}));
                if (!toggleRes.ok) {
                  throw new Error(toggleData.error || 'Failed to toggle maintenance mode');
                }
                if (global.showToast) {
                  global.showToast(toggleData.message || 'Maintenance mode updated', 'info');
                }
                // Refresh readiness view
                promoCheckBtn.click();
              } catch (toggleErr) {
                if (global.showToast) {
                  global.showToast(toggleErr.message, 'error');
                }
                maintToggleBtn.disabled = false;
              }
            });
          }
        } catch (err) {
          promoContainer.style.display = 'block';
          promoContainer.innerHTML = `
            <div style="color: #EF4444; font-size: 12px; padding: 8px;">
              Readiness check error: ${escapeHtml(err.message)}
            </div>
          `;
        } finally {
          promoCheckBtn.disabled = false;
          promoCheckBtn.innerHTML = `<i data-lucide="shield-check" style="width: 14px; height: 14px; color: #10B981;"></i><span>Verify Promotion Readiness</span>`;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: promoCheckBtn });
          }
        }
      });
    }
  }

  /**
   * Sets up the Sandbox Recovery form, file loaders, password toggles, and execution flow.
   * @param {HTMLElement} modalEl
   * @param {boolean} [isOnlineRecovery=false]
   */
  function setupRestoreAction(modalEl, isOnlineRecovery = false) {
    const form = modalEl.querySelector('#sandbox-restore-form');
    const fileInput = modalEl.querySelector('#restore-file-input');
    const fileInfo = modalEl.querySelector('#restore-file-info');
    const checksumInput = modalEl.querySelector('#restore-checksum-input');
    const shaFileInput = modalEl.querySelector('#restore-sha-file-input');
    const passwordInput = modalEl.querySelector('#restore-admin-password');
    const togglePasswordBtn = modalEl.querySelector('#btn-toggle-restore-password');
    const restoreBtn = modalEl.querySelector('#btn-execute-restore');
    const statusMsgContainer = modalEl.querySelector('#restore-status-message-container');

    if (!form) return;

    // Password visibility toggle
    if (passwordInput && togglePasswordBtn) {
      togglePasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        togglePasswordBtn.innerHTML = `<i data-lucide="${isHidden ? 'eye-off' : 'eye'}" style="width: 18px; height: 18px;"></i>`;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: togglePasswordBtn });
        }
      });
    }

    // Display selected file info
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
          const f = fileInput.files[0];
          fileInfo.textContent = `Selected: ${f.name} (${formatBytes(f.size)})`;
          fileInfo.style.color = 'var(--text-dark, #0F172A)';
        } else {
          fileInfo.textContent = 'Select a valid gzip-compressed SQL backup archive (up to 50MB).';
          fileInfo.style.color = 'var(--text-mid, #64748B)';
        }
      });
    }

    // Load checksum from companion .sha256 file
    if (shaFileInput && checksumInput) {
      shaFileInput.addEventListener('change', async () => {
        if (!shaFileInput.files || !shaFileInput.files[0]) return;
        const shaFile = shaFileInput.files[0];
        try {
          const text = await shaFile.text();
          const match = text.match(/[a-fA-F0-9]{64}/);
          if (match && match[0]) {
            checksumInput.value = match[0].toLowerCase();
            const statusEl = modalEl.querySelector('#restore-checksum-status');
            if (statusEl) {
              statusEl.textContent = `Extracted from ${shaFile.name}`;
              statusEl.style.color = '#16A34A';
            }
            if (global.showToast) {
              global.showToast(`Loaded SHA-256 checksum from ${shaFile.name}`, 'info');
            }
          } else {
            throw new Error('No valid 64-character SHA-256 hexadecimal hash found in the file.');
          }
        } catch (err) {
          if (global.showToast) global.showToast(err.message, 'error');
        } finally {
          shaFileInput.value = '';
        }
      });
    }

    // Form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isRestoring) return;

      const file = fileInput.files ? fileInput.files[0] : null;
      if (!file) {
        if (global.showToast) global.showToast('Please select a backup archive file to restore.', 'warning');
        return;
      }

      if (file.size > 50 * 1024 * 1024) {
        if (global.showToast) global.showToast('Selected file exceeds maximum 50MB limit.', 'error');
        return;
      }

      const checksum = (checksumInput.value || '').trim();
      if (!/^[a-fA-F0-9]{64}$/.test(checksum)) {
        if (global.showToast) global.showToast('Checksum must be a 64-character hexadecimal SHA-256 digest.', 'error');
        return;
      }

      const password = passwordInput.value;
      // Immediately clear the password from the DOM input
      passwordInput.value = '';
      if (!password) {
        if (global.showToast) global.showToast('Administrator password confirmation is required.', 'warning');
        return;
      }

      // Restore confirmation prompt
      let confirmed = false;
      const targetDbName = isOnlineRecovery ? 'Online Recovery Sandbox' : 'labsync_test';
      const confirmFn = global.showConfirmModal || (typeof window !== 'undefined' ? window.showConfirmModal : null);
      if (typeof confirmFn === 'function') {
        confirmed = await confirmFn({
          title: isOnlineRecovery ? 'Confirm Online Recovery Restoration' : 'Confirm Sandbox Database Restoration',
          message: `Restore archive "${file.name}" into the isolated "${targetDbName}" database? The main "labsync" database will not be altered.`,
          confirmText: isOnlineRecovery ? 'Restore Online Sandbox' : 'Restore Sandbox',
          cancelText: 'Cancel',
          icon: 'rotate-ccw',
          isDestructive: true
        });
      } else {
        confirmed = window.confirm(
          `Confirm Database Restoration:\n\nRestore archive "${file.name}" into the isolated "${targetDbName}" database?\n\nThe main "labsync" database will NOT be altered.`
        );
      }

      if (!confirmed) return;

      // Lock UI and show in-flight status
      isRestoring = true;
      restoreBtn.disabled = true;
      const originalRestoreHtml = restoreBtn.innerHTML;
      restoreBtn.innerHTML = `
        <i data-lucide="loader-2" class="spin" style="width: 16px; height: 16px; animation: spin 1s linear infinite;"></i>
        <span>Restoring into Sandbox...</span>
      `;
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: restoreBtn });
      }

      if (statusMsgContainer) {
        statusMsgContainer.style.display = 'block';
        statusMsgContainer.innerHTML = `
          <div style="background: rgba(245, 158, 11, 0.1); border: 1.5px solid rgba(245, 158, 11, 0.3); border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #92400E; display: flex; align-items: center; gap: 10px;">
            <i data-lucide="loader-2" class="spin" style="width: 18px; height: 18px; animation: spin 1s linear infinite; flex-shrink: 0;"></i>
            <span>Executing ${isOnlineRecovery ? 'online recovery into <strong>Online Recovery Sandbox</strong>' : 'native sandbox restore into <strong>labsync_test</strong>'}. Please do not close this window...</span>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: statusMsgContainer });
        }
      }

      try {
        const endpoint = isOnlineRecovery ? '/api/admin/backups/recovery/restore' : '/api/admin/backups/restore';
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/gzip',
            'X-Confirm-Password': encodeURIComponent(password),
            'X-Backup-Checksum': checksum.toLowerCase(),
            'X-Backup-Filename': encodeURIComponent(file.name)
          },
          body: file
        });

        // Always scrub password from DOM input immediately
        passwordInput.value = '';

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || `Restoration failed with HTTP ${response.status}`);
        }

        const summary = data.summary || {
          status: 'SUCCESS',
          targetLabel: isOnlineRecovery ? 'Online Recovery Sandbox' : 'Local Test Sandbox',
          targetDatabase: data.targetDatabase || (isOnlineRecovery ? 'Online Recovery Sandbox' : 'labsync_test'),
          restoredAt: data.restoredAt,
          checksumSha256: checksum.toLowerCase(),
          filename: file.name
        };

        // Render verification panel
        renderRecoveryVerification(modalEl, summary);

        // Successful restoration feedback
        if (statusMsgContainer) {
          statusMsgContainer.style.display = 'block';
          statusMsgContainer.innerHTML = `
            <div style="background: rgba(34, 197, 94, 0.1); border: 1.5px solid rgba(34, 197, 94, 0.3); border-radius: 10px; padding: 14px 16px; display: flex; align-items: flex-start; gap: 10px;">
              <i data-lucide="check-circle" style="width: 20px; height: 20px; color: #16A34A; flex-shrink: 0; margin-top: 1px;"></i>
              <div>
                <div style="font-size: 13.5px; font-weight: 700; color: #15803D; margin-bottom: 2px;">
                  Sandbox Restoration Completed Successfully
                </div>
                <div style="font-size: 12.5px; color: var(--text-dark, #0F172A);">
                  Target database: <strong>${escapeHtml(summary.targetDatabase || data.targetDatabase || 'labsync_test')}</strong> | Restored at: ${escapeHtml(formatDate(summary.restoredAt || data.restoredAt))}
                </div>
              </div>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: statusMsgContainer });
          }
        }

        if (global.showToast) {
          global.showToast(isOnlineRecovery ? 'Database restored into Online Recovery Sandbox successfully.' : 'Database restoration into labsync_test completed successfully.', 'success');
        }

        // Reset file and checksum inputs
        fileInput.value = '';
        checksumInput.value = '';
        fileInfo.textContent = 'Select a valid gzip-compressed SQL backup archive (up to 50MB).';

        // Refresh status overview
        await loadBackupStatus(modalEl);
      } catch (err) {
        if (statusMsgContainer) {
          statusMsgContainer.style.display = 'block';
          statusMsgContainer.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.1); border: 1.5px solid rgba(239, 68, 68, 0.3); border-radius: 10px; padding: 14px 16px; display: flex; align-items: flex-start; gap: 10px;">
              <i data-lucide="alert-octagon" style="width: 20px; height: 20px; color: #DC2626; flex-shrink: 0; margin-top: 1px;"></i>
              <div>
                <div style="font-size: 13.5px; font-weight: 700; color: #B91C1C; margin-bottom: 2px;">
                  Restoration Failed
                </div>
                <div style="font-size: 12.5px; color: #7F1D1D;">
                  ${escapeHtml(err.message)}
                </div>
              </div>
            </div>
          `;
          if (global.lucide && typeof global.lucide.createIcons === 'function') {
            global.lucide.createIcons({ root: statusMsgContainer });
          }
        }

        if (global.showToast) {
          global.showToast(`Restoration failed: ${err.message}`, 'error');
        }
      } finally {
        isRestoring = false;
        passwordInput.value = ''; // Always ensure password is cleared
        restoreBtn.disabled = false;
        restoreBtn.innerHTML = originalRestoreHtml;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: restoreBtn });
        }
      }
    });
  }

  // Expose global contract
  global.openBackupRecoveryModal = openBackupRecoveryModal;

})(typeof window !== 'undefined' ? window : this);

