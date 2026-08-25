/**
 * LabSync – Accessibility Core Module | js/core/accessibility.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  /**
   * Apply stored accessibility settings (high contrast) immediately to prevent visual flash.
   */
  function applyAccessibilitySettings() {
    try {
      // Clean up legacy text scaling artifacts if previously set
      localStorage.removeItem('labsync-text-scale');
      document.documentElement.classList.remove('text-scale-small', 'text-scale-normal', 'text-scale-large', 'text-scale-xlarge');
      document.documentElement.removeAttribute('data-text-scale');

      // Clean and set high contrast class
      const savedContrast = localStorage.getItem('labsync-high-contrast') === 'true';
      if (savedContrast) {
        document.documentElement.classList.add('high-contrast');
      } else {
        document.documentElement.classList.remove('high-contrast');
      }
    } catch (e) {
      // Guard against restricted localStorage in private/embedded contexts
    }
  }

  // Run immediately upon script load
  applyAccessibilitySettings();

  /**
   * Toggle high contrast theme preference and persist to localStorage.
   * @param {boolean} isChecked
   */
  function toggleAccessibilityContrast(isChecked) {
    try {
      localStorage.setItem('labsync-high-contrast', isChecked);
    } catch (e) {}

    if (isChecked) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
  }

  /**
   * Opens the interactive Accessibility Settings Modal.
   */
  function openAccessibilitySettings() {
    const profileMenu = document.getElementById('profile-menu');
    if (profileMenu) profileMenu.style.display = 'none';

    // Remove any existing accessibility modal
    const existing = document.getElementById('accessibility-settings-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'accessibility-settings-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:20px;';

    // Retrieve saved settings
    const isContrast = localStorage.getItem('labsync-high-contrast') === 'true';

    modal.innerHTML = `
      <div class="accessibility-modal-card" style="background:#fff;border-radius:20px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;animation: modalScale 0.25s ease-out;">
        <!-- Header -->
        <div class="accessibility-modal-header" style="padding:20px 24px;border-bottom:1px solid var(--border-light);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg, #F0F9FF 0%, #FFFFFF 100%);">
          <div>
            <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 4px 0;display:flex;align-items:center;gap:10px;">
              <i data-lucide="eye" style="width:20px;height:20px;color:var(--primary-teal);"></i>
              Accessibility Settings
            </h2>
            <p style="font-size:12.5px;color:var(--text-mid);margin:0;">Adjust color contrast for better readability</p>
          </div>
          <button id="close-accessibility-modal" style="background:#F5F5F5;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:all 0.2s;">
            <i data-lucide="x" style="width:18px;height:18px;color:var(--text-mid);"></i>
          </button>
        </div>
        
        <!-- Content -->
        <div class="accessibility-modal-body" style="padding:24px;display:flex;flex-direction:column;gap:20px;">
          
          <!-- High Contrast Mode Option -->
          <div style="display:flex;align-items:center;justify-content:space-between;background:#F8FAFC;padding:16px 18px;border-radius:12px;border:1px solid var(--border-light);gap:12px;">
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
              <div style="width:36px;height:36px;min-width:36px;border-radius:50%;background:rgba(30, 187, 215, 0.1);color:var(--primary-teal);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i data-lucide="contrast" style="width:18px;height:18px;"></i>
              </div>
              <div style="flex:1;min-width:0;">
                <span style="display:block;font-size:14px;font-weight:700;color:var(--text-dark);">High Contrast Theme</span>
                <span style="font-size:12.5px;color:var(--text-muted);display:block;line-height:1.35;">Use dark contrast theme for low light or visual assistance</span>
              </div>
            </div>
            <label class="accessibility-switch" style="position:relative;display:inline-block;width:48px;height:26px;min-width:48px;flex-shrink:0;cursor:pointer;margin-left:8px;">
              <input type="checkbox" id="contrast-toggle" style="opacity:0;width:0;height:0;" onchange="toggleAccessibilityContrast(this.checked)" ${isContrast ? 'checked' : ''}>
              <span style="position:absolute;top:0;left:0;right:0;bottom:0;background-color:#CBD5E1;transition:.3s ease;border-radius:26px;" id="switch-slider"></span>
            </label>
          </div>

        </div>

        <!-- Footer -->
        <div class="accessibility-modal-footer" style="padding:16px 24px;border-top:1px solid var(--border-light);background:#FAFAFA;display:flex;justify-content:flex-end;">
          <button id="close-accessibility-settings-btn" style="padding:9px 22px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:var(--font-body);box-shadow:0 2px 6px rgba(30, 187, 215, 0.25);">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add Switch Slider CSS logic dynamically if not yet injected
    let styleSheet = document.getElementById('accessibility-switch-styles');
    if (!styleSheet) {
      styleSheet = document.createElement('style');
      styleSheet.id = 'accessibility-switch-styles';
      styleSheet.innerHTML = `
        .accessibility-modal-card {
          max-height: 90vh !important;
          box-sizing: border-box !important;
        }
        @media (max-width: 520px) {
          #accessibility-settings-modal {
            padding: 12px !important;
          }
          .accessibility-modal-card {
            max-width: 100% !important;
          }
          .accessibility-modal-header {
            padding: 16px 18px !important;
          }
          .accessibility-modal-body {
            padding: 18px 14px !important;
            gap: 16px !important;
          }
          .accessibility-modal-footer {
            padding: 14px 18px !important;
          }
        }
        .accessibility-switch {
          width: 48px !important;
          height: 26px !important;
          min-width: 48px !important;
          flex-shrink: 0 !important;
        }
        #switch-slider {
          position: absolute !important;
          top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
          background-color: #CBD5E1;
          border-radius: 26px !important;
          transition: background-color 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          box-sizing: border-box !important;
        }
        #switch-slider::before {
          position: absolute !important;
          content: "" !important;
          height: 20px !important;
          width: 20px !important;
          left: 3px !important;
          top: 3px !important;
          background-color: #ffffff !important;
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          border-radius: 50% !important;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25) !important;
        }
        #contrast-toggle:checked + #switch-slider {
          background-color: var(--primary-teal) !important;
        }
        #contrast-toggle:checked + #switch-slider::before {
          transform: translateX(22px) !important;
        }
      `;
      document.head.appendChild(styleSheet);
    }

    if (global.lucide && typeof global.lucide.createIcons === 'function') {
      global.lucide.createIcons({ root: modal });
    }

    // Bind close events
    const closeBtn = document.getElementById('close-accessibility-modal');
    const doneBtn = document.getElementById('close-accessibility-settings-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
    if (doneBtn) doneBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  // Preserve global contracts for legacy scripts, inline onclick handlers, and HTML callers
  global.applyAccessibilitySettings = applyAccessibilitySettings;
  global.toggleAccessibilityContrast = toggleAccessibilityContrast;
  global.openAccessibilitySettings = openAccessibilitySettings;

})(typeof window !== 'undefined' ? window : this);
