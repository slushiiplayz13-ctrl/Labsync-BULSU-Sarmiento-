/* ================================================================
   LabSync – Faculty Card Component  |  js/components/faculty-card.js
   Responsible for rendering individual faculty cards and roster grid.
   ================================================================ */

'use strict';

(function (global) {
  function escapeHtml(str) {
    if (typeof global.escapeHtml === 'function') {
      return global.escapeHtml(str);
    }
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
           style="position:relative;${borderStyle}">
        
        <!-- Top: Avatar + Name + Status + Menu -->
        <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
          <div style="position:relative;flex-shrink:0;display:inline-block;" class="faculty-avatar-wrap">
            <div style="width:50px;height:50px;border-radius:50%;${avatarGradient}display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;font-family:var(--font-display);overflow:hidden;">
              ${avatarContent}
            </div>
            ${crownIcon}
          </div>
          
          <div style="flex:1;min-width:0;">
            <div style="font-size:16px;font-weight:700;color:#1F2937;margin-bottom:2px;font-family:var(--font-display);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(member.Name)}</div>
            ${roleTag}
          </div>
          
          <div style="display:flex;align-items:center;gap:6px;">
            <div style="position: relative;">
              <button type="button" class="faculty-menu-btn" data-menu-id="menu-${memberId}" aria-label="Faculty options">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-more-vertical"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>
              <div id="menu-${memberId}" class="faculty-dropdown-menu">
                <div class="menu-item" data-action="schedule" data-prof="${escapedProfName}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg> View Schedule
                </div>
                ${isBoss ? '' : `
                <div class="menu-item" data-action="role" data-user-id="${member.User_ID}" data-prof="${escapedProfName}" data-role="${escapedRole}">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shield"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Change Role
                </div>
                <div class="menu-divider"></div>
                <div class="menu-item" data-action="delete" data-user-id="${member.User_ID}" data-prof="${escapedProfName}" style="color: #EF4444;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-x" style="color:#EF4444;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/></svg> Remove Faculty
                </div>
                `}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Contact Info -->
        <div style="display:flex;flex-direction:column;gap:7px;">
          <div style="display:flex;align-items:center;gap:9px;font-size:12px;color:#6B7280;">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-mail" style="color:var(--primary-teal);flex-shrink:0;"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <span>${escapeHtml(member.Email || 'No email')}</span>
          </div>
          <div style="display:flex;align-items:center;gap:9px;font-size:12px;color:#6B7280;">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-phone" style="color:var(--primary-teal);flex-shrink:0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
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
    renderFacultyCards(facultyList, containerTarget, force = false) {
      const container = typeof containerTarget === 'string'
        ? document.querySelector(containerTarget)
        : containerTarget;

      if (!container) return;

      if (!Array.isArray(facultyList) || facultyList.length === 0) {
        if (!container.querySelector('.ui-empty-state')) {
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
        }
        return;
      }

      const emptyState = container.querySelector('.ui-empty-state');
      if (emptyState) {
        emptyState.remove();
      }

      const existingCards = container.querySelectorAll('.faculty-card');
      if (!force && existingCards.length === facultyList.length) {
        const existingSignatures = Array.from(existingCards).map(c => `${c.getAttribute('data-name') || ''}:${c.getAttribute('data-role') || ''}`).join('|');
        const newSignatures = facultyList.map(m => `${String(m.Name || '').toLowerCase()}:${String(m.Role || '').toLowerCase()}`).join('|');
        const hasMenu = container.querySelector('.faculty-menu-btn');
        if (existingSignatures === newSignatures && hasMenu) {
          // Both names and roles match perfectly, keep DOM intact without reflow
          return;
        }
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
