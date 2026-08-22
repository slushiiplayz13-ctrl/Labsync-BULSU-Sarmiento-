/* ================================================================
   LabSync – Faculty Card Component  |  js/components/faculty-card.js
   Responsible for rendering individual faculty cards and roster grid.
   ================================================================ */

'use strict';

(function (global) {
  /**
   * Helper to escape HTML safely.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const facultyCard = {
    /**
     * Generates HTML markup for a single faculty member card.
     * @param {Object} member
     * @returns {string}
     */
    createCardHtml(member) {
      if (!member) return '';
      const isBoss = member.Role && member.Role.toLowerCase().includes('head');

      const borderStyle = isBoss 
        ? '' 
        : 'border: 1px solid #E5E7EB; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

      const avatarGradient = 'background: linear-gradient(135deg, var(--primary-teal) 0%, var(--accent-blue) 100%);';

      const crownIcon = isBoss 
        ? `<div class="boss-crown"><i data-lucide="crown" style="width:18px;height:18px;"></i></div>` 
        : '';

      const roleTag = isBoss 
        ? `<div class="boss-role"><i data-lucide="shield-check" style="width:13px;height:13px;"></i> ${escapeHtml(member.Role)}</div>`
        : `<div style="font-size:12px;color:#6B7280;line-height:1.4;">${escapeHtml(member.Role || 'Faculty')}</div>`;

      const initials = (global.facultyUtils && typeof global.facultyUtils.getFacultyInitials === 'function')
        ? global.facultyUtils.getFacultyInitials(member.Name)
        : (member.Name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

      const avatarContent = member.Profile_Photo
        ? `<img src="${escapeHtml(member.Profile_Photo)}" alt="${escapeHtml(member.Name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
        : escapeHtml(initials);

      const searchString = (global.facultyUtils && typeof global.facultyUtils.buildFacultySearchString === 'function')
        ? global.facultyUtils.buildFacultySearchString(member)
        : `${member.Name || ''} ${member.Email || ''} ${member.Role || ''} ${member.Phone || ''}`.toLowerCase();

      const memberId = member.User_ID || String(member.Name || '').replace(/\s+/g, '');
      const escapedProfName = String(member.Name || '').replace(/'/g, "\\'");
      const escapedRole = String(member.Role || 'Faculty').replace(/'/g, "\\'");

      return `
      <div class="faculty-card ${isBoss ? 'boss-card' : ''}" 
           data-role="${member.Role ? member.Role.toLowerCase() : 'faculty'}" 
           data-name="${escapeHtml((member.Name || '').toLowerCase())}" 
           data-dept="${escapeHtml((member.Email || '').toLowerCase())}" 
           data-search="${escapeHtml(searchString)}" 
           style="background:#fff;border-radius:12px;padding:20px 18px;transition:all 0.3s ease;position:relative;${borderStyle}">
        
        <!-- Top: Avatar + Name + Status + Menu -->
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
          <div style="position:relative;flex-shrink:0;display:inline-block;" class="faculty-avatar-wrap">
            <div style="width:50px;height:50px;border-radius:50%;${avatarGradient}display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;font-family:var(--font-display);overflow:hidden;">
              ${avatarContent}
            </div>
            ${crownIcon}
          </div>
          
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:700;color:#1F2937;margin-bottom:2px;font-family:var(--font-display);">${escapeHtml(member.Name)}</div>
            ${roleTag}
          </div>
          
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="position: relative;">
              <button class="faculty-menu-btn" onclick="toggleMenu(event, 'menu-${memberId}')">
                <i data-lucide="more-vertical" style="width:16px;height:16px;"></i>
              </button>
              <div id="menu-${memberId}" class="faculty-dropdown-menu">
                <div class="menu-item" onclick="viewFacultySchedule('${escapedProfName}')">
                  <i data-lucide="calendar" style="width:15px;height:15px;"></i> View Schedule
                </div>
                ${isBoss ? '' : `
                <div class="menu-item" onclick="changeFacultyRole('${member.User_ID}', '${escapedProfName}', '${escapedRole}')">
                  <i data-lucide="shield" style="width:15px;height:15px;"></i> Change Role
                </div>
                <div class="menu-divider"></div>
                <div class="menu-item" onclick="confirmDeleteFaculty('${member.User_ID}', '${escapedProfName}')" style="color: #EF4444;">
                  <i data-lucide="user-x" style="width:15px;height:15px;color:#EF4444;"></i> Remove Faculty
                </div>
                `}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Contact Info -->
        <div style="display:flex;flex-direction:column;gap:7px;">
          <div style="display:flex;align-items:center;gap:9px;font-size:12px;color:#6B7280;">
            <i data-lucide="mail" style="width:15px;height:15px;color:var(--primary-teal);flex-shrink:0;"></i>
            <span>${escapeHtml(member.Email || 'No email')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;font-size:12px;color:#6B7280;">
            <i data-lucide="phone" style="width:15px;height:15px;color:var(--primary-teal);flex-shrink:0;"></i>
            <span>${escapeHtml(member.Phone || 'Not specified')}</span>
          </div>
        </div>
        
      </div>
      `;
    },

    /**
     * Renders a list of faculty cards into a container element.
     * @param {Array} facultyList
     * @param {HTMLElement|string} containerTarget
     */
    renderFacultyCards(facultyList, containerTarget) {
      const container = typeof containerTarget === 'string'
        ? document.querySelector(containerTarget)
        : containerTarget;

      if (!container) return;

      if (!Array.isArray(facultyList) || facultyList.length === 0) {
        container.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="users" style="width:24px;height:24px;"></i>
            </div>
            <p>No faculty records yet. Add faculty or sync your directory to see members here.</p>
          </div>
        `;
        if (global.lucide && typeof global.lucide.createIcons === 'function') {
          global.lucide.createIcons({ root: container });
        }
        return;
      }

      container.innerHTML = facultyList.map(member => facultyCard.createCardHtml(member)).join('');

      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons({ root: container });
      }
    }
  };

  // Expose globally
  global.facultyCard = facultyCard;
})(typeof window !== 'undefined' ? window : this);
