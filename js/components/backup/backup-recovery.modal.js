/**
 * LabSync – Database Backup & Recovery Modal | js/components/backup/backup-recovery.modal.js
 * Administrative interface for Security Feature #17:
 * - Backup generation and verified direct streaming download (.sql.gz).
 * - Isolated disaster recovery restoration testing strictly into labsync_test.
 * - Production safety indicators and tamper-evident metadata display.
 */

(function (global) {
  'use strict';

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(isoStr) {
    if (!isoStr) return 'Never';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      });
    } catch (_) {
      return isoStr;
    }
  }

  async function openBackupRecoveryModal() {
    let user = null;
    try {
      const rawUser = JSON.parse(sessionStorage.getItem('labsync_user') || localStorage.getItem('user') || 'null');
      user = (rawUser && (rawUser.user || rawUser)) || null;
    } catch (e) {}
    const role = user ? (user.role || user.Role || '') : '';
    const clean = String(role).trim().toLowerCase();
    if (clean.includes('coordinator') || clean.includes('mis') || clean.includes('ojt') || clean.includes('faculty') || clean.includes('student')) {
      console.warn('[BackupRecovery] Access denied: exclusive to IT Department Head.');
      return;
    }

    const existing = document.getElementById('backup-recovery-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'backup-recovery-modal';
    modal.className = 'custom-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; padding: 20px; box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div class="modal-box" style="
        background: var(--bg-white, #ffffff);
        border: 1px solid var(--border-light, #e2e8f0);
        border-radius: 16px;
        width: 100%; max-width: 680px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        display: flex; flex-direction: column;
        animation: modalFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      ">
        <!-- Header -->
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--border-light, #e2e8f0); display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(0, 163, 196, 0.12); display: flex; align-items: center; justify-content: center; color: var(--primary-teal, #00A3C4);">
              <i data-lucide="archive-restore" style="width: 20px; height: 20px;"></i>
            </div>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: var(--text-dark, #0F172A); font-family: var(--font-display);">Database Backup & Recovery</h2>
              <p style="margin: 2px 0 0 0; font-size: 12.5px; color: var(--text-mid, #64748B);">Security Feature #17 — Disaster Recovery Controls</p>
            </div>
          </div>
          <button id="closeBackupModalBtn" style="background: transparent; border: none; cursor: pointer; color: var(--text-mid, #64748B); padding: 6px; border-radius: 8px;">
            <i data-lucide="x" style="width: 20px; height: 20px;"></i>
          </button>
        </div>

        <!-- Body -->
        <div style="padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          
          <!-- Environment & Safety Status Banner -->
          <div id="backupEnvBanner" style="padding: 14px 16px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 13px; display: flex; align-items: flex-start; gap: 12px;">
            <i data-lucide="shield-alert" id="backupBannerIcon" style="width: 18px; height: 18px; color: #0284c7; flex-shrink: 0; margin-top: 1px;"></i>
            <div id="backupBannerText" style="color: var(--text-dark, #0F172A); line-height: 1.45;">
              Checking environment security invariants...
            </div>
          </div>

          <!-- Section 1: Create & Download Genuine Backup -->
          <div style="background: var(--bg-card, #f8fafc); border: 1px solid var(--border-light, #e2e8f0); border-radius: 12px; padding: 18px 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
              <div>
                <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: var(--text-dark, #0F172A);">1. Create & Download Backup</h3>
                <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-mid, #64748B);">Generates a verified, gzip-compressed snapshot (.sql.gz) using native transactional client tools.</p>
              </div>
            </div>

            <!-- Metadata info grid -->
            <div id="backupMetadataGrid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 14px; font-size: 12px;">
              <div style="background: var(--bg-white, #ffffff); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-light, #e2e8f0);">
                <span style="color: var(--text-light, #94a3b8); display: block;">Active Database:</span>
                <strong id="metaActiveDb" style="color: var(--text-dark, #0F172A); font-family: monospace;">Loading...</strong>
              </div>
              <div style="background: var(--bg-white, #ffffff); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-light, #e2e8f0);">
                <span style="color: var(--text-light, #94a3b8); display: block;">Client Tooling:</span>
                <strong id="metaTooling" style="color: var(--text-dark, #0F172A); font-family: monospace;">Checking...</strong>
              </div>
              <div style="background: var(--bg-white, #ffffff); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-light, #e2e8f0); grid-column: span 2;">
                <span style="color: var(--text-light, #94a3b8); display: block;">Last Backup Created:</span>
                <strong id="metaLastBackup" style="color: var(--text-dark, #0F172A);">Never</strong>
              </div>
            </div>

            <button type="button" id="btnTriggerBackup" style="
              width: 100%; padding: 11px 18px; border: none; border-radius: 10px;
              background: var(--primary-teal, #00A3C4); color: #ffffff;
              font-size: 13.5px; font-weight: 600; cursor: pointer;
              display: flex; align-items: center; justify-content: center; gap: 8px;
              transition: background 0.15s; font-family: var(--font-body);
            ">
              <i data-lucide="download" style="width: 16px; height: 16px;"></i>
              <span>Create &amp; Download Verified Backup (.sql.gz)</span>
            </button>
            <div id="backupDownloadStatus" style="display: none; margin-top: 10px; font-size: 12px; text-align: center; color: var(--primary-teal, #00A3C4);"></div>
          </div>

          <!-- Section 2: Isolated Sandbox Restoration Demonstration -->
          <div style="background: var(--bg-card, #f8fafc); border: 1px solid var(--border-light, #e2e8f0); border-radius: 12px; padding: 18px 20px;">
            <div style="margin-bottom: 12px;">
              <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: var(--text-dark, #0F172A);">2. Disaster Recovery Demonstration (Sandbox)</h3>
              <p style="margin: 3px 0 0 0; font-size: 12px; color: var(--text-mid, #64748B);">
                Restores a previously created backup archive into the isolated test database (<code style="background:#e2e8f0;padding:1px 4px;border-radius:4px;">labsync_test</code>).
              </p>
            </div>

            <div id="restoreDisabledNotice" style="display: none; padding: 12px 14px; border-radius: 8px; background: #fffbeb; border: 1px solid #fef3c7; color: #92400e; font-size: 12px; margin-bottom: 12px;">
              <strong>Restoration Disabled in Production:</strong> Destructive restoration operations are permanently blocked on the live production deployment. To conduct disaster recovery verification, run the local demonstration sandbox.
            </div>

            <div id="restoreControlsContainer" style="display: flex; flex-direction: column; gap: 12px;">
              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-dark, #0F172A); margin-bottom: 4px;">Select Backup Archive (.sql.gz or .sql):</label>
                <input type="file" id="restoreFileInput" accept=".gz,.sql,.sql.gz" style="
                  width: 100%; padding: 8px; border: 1px dashed var(--border-light, #cbd5e1);
                  border-radius: 8px; background: var(--bg-white, #ffffff); font-size: 12.5px;
                  box-sizing: border-box; cursor: pointer;
                " />
              </div>

              <div>
                <label style="display: block; font-size: 12px; font-weight: 600; color: var(--text-dark, #0F172A); margin-bottom: 4px;">Confirm Administrator Password:</label>
                <input type="password" id="restorePasswordInput" placeholder="Enter your IT Head password" style="
                  width: 100%; padding: 9px 12px; border: 1px solid var(--border-light, #cbd5e1);
                  border-radius: 8px; background: var(--bg-white, #ffffff); font-size: 13px;
                  box-sizing: border-box; font-family: var(--font-body);
                " />
              </div>

              <button type="button" id="btnTriggerRestore" style="
                width: 100%; padding: 11px 18px; border: none; border-radius: 10px;
                background: #0f172a; color: #ffffff;
                font-size: 13.5px; font-weight: 600; cursor: pointer;
                display: flex; align-items: center; justify-content: center; gap: 8px;
                transition: background 0.15s; font-family: var(--font-body);
              ">
                <i data-lucide="refresh-ccw" style="width: 16px; height: 16px;"></i>
                <span>Restore into Isolated Test Sandbox (labsync_test)</span>
              </button>
              <div id="restoreActionStatus" style="display: none; margin-top: 6px; font-size: 12.5px; text-align: center;"></div>
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(modal);

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    // Modal close handlers
    const closeBtn = modal.querySelector('#closeBackupModalBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.remove());
    }
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Populate Status Metadata
    await loadBackupStatus(modal);

    // Bind Backup Download Handler
    const backupBtn = modal.querySelector('#btnTriggerBackup');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => triggerBackupDownload(modal));
    }

    // Bind Sandbox Restore Handler
    const restoreBtn = modal.querySelector('#btnTriggerRestore');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', () => triggerSandboxRestore(modal));
    }
  }

  async function loadBackupStatus(modal) {
    try {
      const res = await fetch('/api/admin/backups/status');
      if (!res.ok) throw new Error('Status query failed');
      const data = await res.json();

      const banner = modal.querySelector('#backupEnvBanner');
      const bannerText = modal.querySelector('#backupBannerText');
      const bannerIcon = modal.querySelector('#backupBannerIcon');
      const metaActiveDb = modal.querySelector('#metaActiveDb');
      const metaTooling = modal.querySelector('#metaTooling');
      const metaLastBackup = modal.querySelector('#metaLastBackup');
      const restoreNotice = modal.querySelector('#restoreDisabledNotice');
      const restoreControls = modal.querySelector('#restoreControlsContainer');

      if (metaActiveDb) metaActiveDb.textContent = data.activeDatabase || 'unknown';
      if (metaTooling) metaTooling.textContent = data.toolingAvailable ? (data.toolingVersion ? data.toolingVersion.split(' ')[0] : 'Available') : 'Missing CLI';
      if (metaLastBackup && data.latestBackup) {
        metaLastBackup.innerHTML = `
          <strong>${data.latestBackup.Filename}</strong> (${formatBytes(data.latestBackup.File_Size_Bytes)})<br/>
          <span style="font-size:11px;color:var(--text-light);">${formatDate(data.latestBackup.Created_At)}</span><br/>
          <span style="font-size:10px;font-family:monospace;color:#64748b;">SHA-256: ${data.latestBackup.Checksum_SHA256 ? data.latestBackup.Checksum_SHA256.slice(0, 16) + '...' : 'N/A'}</span>
        `;
      }

      if (data.isProduction) {
        if (banner) {
          banner.style.background = '#fef2f2';
          banner.style.borderColor = '#fecaca';
        }
        if (bannerIcon) {
          bannerIcon.style.color = '#dc2626';
          bannerIcon.setAttribute('data-lucide', 'shield-ban');
        }
        if (bannerText) {
          bannerText.innerHTML = `
            <strong>Production Environment Active:</strong> For database safety, destructive restoration is permanently disabled in production. You may create and download verified backups below.
          `;
        }
        if (restoreNotice) restoreNotice.style.display = 'block';
        if (restoreControls) {
          restoreControls.style.opacity = '0.5';
          restoreControls.style.pointerEvents = 'none';
        }
      } else {
        if (banner) {
          banner.style.background = '#f0fdf4';
          banner.style.borderColor = '#bbf7d0';
        }
        if (bannerIcon) {
          bannerIcon.style.color = '#16a34a';
          bannerIcon.setAttribute('data-lucide', 'shield-check');
        }
        if (bannerText) {
          bannerText.innerHTML = `
            <strong>Local Demonstration Sandbox Active:</strong> Connected to <code style="background:#dcfce7;padding:1px 4px;border-radius:4px;">${data.activeDatabase}</code>. Full backup generation and isolated sandbox restoration are enabled.
          `;
        }
        if (restoreNotice) restoreNotice.style.display = 'none';
      }

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: modal });
      }
    } catch (err) {
      console.error('[BackupModal] Error loading status:', err);
    }
  }

  async function triggerBackupDownload(modal) {
    const btn = modal.querySelector('#btnTriggerBackup');
    const statusEl = modal.querySelector('#backupDownloadStatus');
    if (!btn) return;

    btn.disabled = true;
    btn.style.opacity = '0.7';
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = 'var(--primary-teal, #00A3C4)';
      statusEl.textContent = 'Generating and verifying backup archive on server...';
    }

    try {
      const response = await fetch('/api/admin/backups/create', {
        method: 'POST'
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || `Server responded with ${response.status}`);
      }

      const contentDisposition = response.headers.get('Content-Disposition') || '';
      let filename = 'labsync_backup.sql.gz';
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);

      if (statusEl) {
        statusEl.style.color = '#16a34a';
        statusEl.textContent = `✔ Download complete: ${filename} (${formatBytes(blob.size)})`;
      }
      await loadBackupStatus(modal);
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = `❌ Backup failed: ${err.message}`;
      }
    } finally {
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  async function triggerSandboxRestore(modal) {
    const btn = modal.querySelector('#btnTriggerRestore');
    const fileInput = modal.querySelector('#restoreFileInput');
    const passwordInput = modal.querySelector('#restorePasswordInput');
    const statusEl = modal.querySelector('#restoreActionStatus');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      alert('Please select a backup archive file to restore.');
      return;
    }

    const password = passwordInput ? passwordInput.value.trim() : '';
    if (!password) {
      alert('Please enter your administrator password to confirm restoration.');
      if (passwordInput) passwordInput.focus();
      return;
    }

    const file = fileInput.files[0];
    if (!confirm(`CAUTION: This will overwrite tables in the isolated test sandbox with the contents of ${file.name}.\n\nAre you sure you want to proceed?`)) {
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.7';
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#0284c7';
      statusEl.textContent = 'Streaming archive to test sandbox and verifying schema... Please wait...';
    }

    try {
      const response = await fetch('/api/admin/backups/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/gzip',
          'X-Confirm-Password': encodeURIComponent(password)
        },
        body: file
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || data.details || `Server responded with ${response.status}`);
      }

      if (statusEl) {
        statusEl.style.color = '#16a34a';
        statusEl.innerHTML = `
          <strong>✔ Restoration Completed!</strong><br/>
          Restored into <code style="background:#dcfce7;padding:1px 4px;border-radius:4px;">${data.targetDatabase}</code> at ${formatDate(data.restoredAt)}.<br/>
          <button type="button" onclick="window.location.reload()" style="margin-top:8px;padding:5px 12px;border:none;border-radius:6px;background:#16a34a;color:#fff;cursor:pointer;font-size:12px;">Refresh Page to View Restored Records</button>
        `;
      }
      if (passwordInput) passwordInput.value = '';
      if (fileInput) fileInput.value = '';
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = `❌ Restoration failed: ${err.message}`;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    }
  }

  global.openBackupRecoveryModal = openBackupRecoveryModal;

})(typeof window !== 'undefined' ? window : this);
