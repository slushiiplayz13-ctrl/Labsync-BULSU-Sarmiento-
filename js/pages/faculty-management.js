/**
 * Faculty Management Page Controller
 * LabSync - Phase 6A-07H
 *
 * Encapsulates faculty roster loading, searching/filtering, faculty CRUD,
 * schedule viewing modal, role changes, leadership transfer confirmation,
 * and deletion workflows.
 */

(function () {
  'use strict';

  // Page State
  window.allFacultyMembers = window.allFacultyMembers || [];
  window.currentFacultyFilter = window.currentFacultyFilter || 'all';

  // Sidebar scroll clue
  function initSidebarScrollClue() {
    const sidebar = document.querySelector('.sidebar');
    const scrollClue = document.getElementById('sidebarScrollClue');
    if (!sidebar || !scrollClue) return;
    if (sidebar.scrollHeight <= sidebar.clientHeight) scrollClue.style.display = 'none';
    sidebar.addEventListener('scroll', () => {
      scrollClue.style.opacity = sidebar.scrollTop > 10 ? '0' : '1';
    });
  }

  // Load faculty members on page load
  async function loadFacultyMembers() {
    try {
      const response = await fetch('/api/faculty', { credentials: 'include' });
      if (!response.ok) {
        console.error('Failed to fetch faculty:', response.status);
        return;
      }
      const faculty = await response.json();
      window.allFacultyMembers = faculty;
      
      const grid = document.getElementById('faculty-grid');
      if (!grid) return;
      
      if (faculty.length === 0) {
        grid.innerHTML = `
          <div class="ui-empty-state">
            <div class="ui-empty-icon">
              <i data-lucide="users" style="width:24px;height:24px;"></i>
            </div>
            <p>No faculty records yet. Add faculty or sync your directory to see members here.</p>
          </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
      }
      // Sort so the IT Head is always first
      faculty.sort((a, b) => {
        const aIsBoss = a.Role && a.Role.toLowerCase().includes('head');
        const bIsBoss = b.Role && b.Role.toLowerCase().includes('head');
        if (aIsBoss && !bIsBoss) return -1;
        if (!aIsBoss && bIsBoss) return 1;
        return (a.Name || '').localeCompare(b.Name || '');
      });

      grid.innerHTML = faculty.map(member => {
        const isBoss = member.Role && member.Role.toLowerCase().includes('head');
        
        const borderStyle = isBoss 
          ? '' 
          : 'border: 1px solid #E5E7EB; box-shadow: 0 1px 3px rgba(0,0,0,0.05);';
          
        const avatarGradient = 'background: linear-gradient(135deg, var(--primary-teal) 0%, var(--accent-blue) 100%);';

        const crownIcon = isBoss 
          ? `<div class="boss-crown"><i data-lucide="crown" style="width:18px;height:18px;"></i></div>` 
          : '';

        const roleTag = isBoss 
          ? `<div class="boss-role"><i data-lucide="shield-check" style="width:13px;height:13px;"></i> ${member.Role}</div>`
          : `<div style="font-size:12px;color:#6B7280;line-height:1.4;">${member.Role || 'Faculty'}</div>`;

        const avatarContent = member.Profile_Photo
          ? `<img src="${member.Profile_Photo}" alt="${member.Name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
          : (member.Name || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        const searchString = `${member.Name || ''} ${member.Email || ''} ${member.Role || ''} ${member.Phone || ''}`.toLowerCase();

        return `
        <div class="faculty-card ${isBoss ? 'boss-card' : ''}" data-role="${member.Role ? member.Role.toLowerCase() : 'faculty'}" data-name="${(member.Name || '').toLowerCase()}" data-dept="${(member.Email || '').toLowerCase()}" data-search="${searchString}" style="background:#fff;border-radius:12px;padding:20px 18px;transition:all 0.3s ease;position:relative;${borderStyle}">
          
          <!-- Top: Avatar + Name + Status + Menu -->
          <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;">
            <div style="position:relative;flex-shrink:0;display:inline-block;" class="faculty-avatar-wrap">
              <div style="width:50px;height:50px;border-radius:50%;${avatarGradient}display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;font-family:var(--font-display);overflow:hidden;">
                ${avatarContent}
              </div>
              ${crownIcon}
            </div>
            
            <div style="flex:1;min-width:0;">
              <div style="font-size:16px;font-weight:700;color:#1F2937;margin-bottom:2px;font-family:var(--font-display);">${member.Name}</div>
              ${roleTag}
            </div>
            
            <div style="display:flex;align-items:center;gap:6px;">
              <div style="position: relative;">
                <button class="faculty-menu-btn" onclick="toggleMenu(event, 'menu-${member.User_ID || member.Name.replace(/\s+/g, '')}')">
                  <i data-lucide="more-vertical" style="width:16px;height:16px;"></i>
                </button>
                <div id="menu-${member.User_ID || member.Name.replace(/\s+/g, '')}" class="faculty-dropdown-menu">
                  <div class="menu-item" onclick="viewFacultySchedule('${member.Name.replace(/'/g, "\\'")}')"><i data-lucide="calendar" style="width:15px;height:15px;"></i> View Schedule</div>
                  ${isBoss ? '' : `
                  <div class="menu-item" onclick="changeFacultyRole('${member.User_ID}', '${member.Name.replace(/'/g, "\\'")}', '${member.Role.replace(/'/g, "\\'")}')"><i data-lucide="shield" style="width:15px;height:15px;"></i> Change Role</div>
                  <div class="menu-divider"></div>
                  <div class="menu-item" onclick="confirmDeleteFaculty('${member.User_ID}', '${member.Name.replace(/'/g, "\\'")}')" style="color: #EF4444;"><i data-lucide="user-x" style="width:15px;height:15px;color:#EF4444;"></i> Remove Faculty</div>
                  `}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Contact Info -->
          <div style="display:flex;flex-direction:column;gap:7px;">
            <div style="display:flex;align-items:center;gap:9px;font-size:12px;color:#6B7280;">
              <i data-lucide="mail" style="width:15px;height:15px;color:var(--primary-teal);flex-shrink:0;"></i>
              <span>${member.Email}</span>
            </div>
            <div style="display:flex;align-items:center;gap:9px;font-size:12px;color:#6B7280;">
              <i data-lucide="phone" style="width:15px;height:15px;color:var(--primary-teal);flex-shrink:0;"></i>
              <span>${member.Phone || 'Not specified'}</span>
            </div>
          </div>
          
        </div>
      `;
      }).join('');
      
      if (typeof lucide !== 'undefined') lucide.createIcons();
      applySearchAndFilter();
    } catch (error) {
      console.error('Error loading faculty:', error);
    }
  }

  // Close all dropdown menus
  function closeAllMenus() {
    document.querySelectorAll('.faculty-dropdown-menu').forEach(menu => {
      menu.style.display = 'none';
    });
    const filterDropdown = document.getElementById('filter-dropdown');
    if (filterDropdown) filterDropdown.style.display = 'none';
  }

  // Toggle specific menu
  function toggleMenu(event, menuId) {
    if (event) event.stopPropagation();
    const menu = document.getElementById(menuId);
    const isVisible = menu && menu.style.display === 'block';
    closeAllMenus();
    if (!isVisible && menu) {
      menu.style.display = 'block';
    }
  }

  // Filter dropdown toggle
  function toggleFacultyFilterDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dropdown = document.getElementById('filter-dropdown');
    if (dropdown) {
      const isShowing = dropdown.style.display === 'block';
      closeAllMenus();
      dropdown.style.display = isShowing ? 'none' : 'block';
    }
  }

  // Filter and search unified logic
  function filterFaculty(role) {
    window.currentFacultyFilter = role;
    
    // Update UI list checkmarks
    document.querySelectorAll('.filter-item').forEach(item => {
      item.style.fontWeight = '500';
      const icon = item.querySelector('i');
      if (icon) icon.style.display = 'none';
    });
    
    // Find selected item
    const activeItem = document.querySelector(`.filter-item[onclick*="'${role}'"]`);
    if (activeItem) {
      activeItem.style.fontWeight = '600';
      const icon = activeItem.querySelector('i');
      if (icon) icon.style.display = 'block';
    }

    const dropdown = document.getElementById('filter-dropdown');
    if (dropdown) dropdown.style.display = 'none';

    applySearchAndFilter();
  }

  function applySearchAndFilter() {
    const searchInput = document.getElementById('faculty-search');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const filter = window.currentFacultyFilter || 'all';
    
    document.querySelectorAll('.faculty-card').forEach(card => {
      const name = card.dataset.name || '';
      const email = card.dataset.dept || '';
      const role = card.dataset.role || '';
      const searchStr = card.dataset.search || (name + ' ' + email + ' ' + role);
      
      const matchesSearch = !q || searchStr.includes(q);
      let matchesFilter = false;
      
      if (filter === 'all') {
        matchesFilter = true;
      } else if (filter === 'head') {
        matchesFilter = role.includes('head');
      } else if (filter === 'faculty') {
        matchesFilter = role === 'faculty' || (!role.includes('head') && !role.includes('mis'));
      } else if (filter === 'mis') {
        matchesFilter = role.includes('mis');
      }
      
      const isVisible = matchesSearch && matchesFilter;
      if (isVisible) {
        card.classList.remove('hidden-card');
        card.style.setProperty('display', '', 'important');
      } else {
        card.classList.add('hidden-card');
        card.style.setProperty('display', 'none', 'important');
      }
    });
  }

  // Add Faculty modal
  function showAddFacultyModal() {
    const modal = document.createElement('div');
    modal.id = 'add-faculty-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
    
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;width:90%;max-width:500px;padding:32px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
          <h2 style="font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text-dark);margin:0;">Add New Faculty</h2>
          <button id="close-modal" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="x" style="width:20px;height:20px;color:var(--text-mid);"></i>
          </button>
        </div>
        
        <form id="add-faculty-form" style="display:flex;flex-direction:column;gap:20px;">
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Full Name *</label>
            <input type="text" id="faculty-name" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:8px;font-size:14px;font-family:var(--font-body);outline:none;transition:border-color 0.2s;" placeholder="e.g. Juan Dela Cruz">
          </div>
          
          <div>
            <label style="display:block;font-size:13px;font-weight:600;color:var(--text-dark);margin-bottom:8px;">Email Address *</label>
            <input type="email" id="faculty-email" required style="width:100%;padding:12px 16px;border:1px solid var(--border-light);border-radius:8px;font-size:14px;font-family:var(--font-body);outline:none;transition:border-color 0.2s;" placeholder="e.g. juan.delacruz@bsu.edu.ph">
            <div id="faculty-email-error" style="display:none;color:#EF4444;font-size:12px;margin-top:4px;font-weight:600;"><i data-lucide="alert-circle" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i>Invalid email address (e.g., user@domain.com)</div>
          </div>
          
          <div class="alert-info-box">
            <i data-lucide="info"></i>
            <p>A temporary password will be auto-generated and sent to the faculty member's email address.</p>
          </div>
          
          <div style="display:flex;gap:12px;margin-top:8px;">
            <button type="button" id="cancel-btn" style="flex:1;padding:12px;border:1px solid var(--border-light);background:#fff;border-radius:8px;font-size:14px;font-weight:600;color:var(--text-mid);cursor:pointer;transition:all 0.2s;font-family:var(--font-body);">Cancel</button>
            <button type="submit" style="flex:1;padding:12px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);font-family:var(--font-body);">Add Faculty</button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // Focus on first input
    setTimeout(() => {
      const input = document.getElementById('faculty-name');
      if (input) input.focus();
    }, 100);
    
    // Close handlers
    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => modal.remove());
    if (cancelBtn) cancelBtn.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    
    // Live email validation
    const emailInput = document.getElementById('faculty-email');
    const emailErrDiv = document.getElementById('faculty-email-error');
    const isValidEmail = (email) => {
      if (!email || typeof email !== 'string') return false;
      const cleanEmail = email.trim().toLowerCase();
      const basicRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
      if (!basicRegex.test(cleanEmail)) return false;
      if (cleanEmail.includes('..') || cleanEmail.includes('@.') || cleanEmail.includes('.@')) return false;

      const parts = cleanEmail.split('@');
      if (parts.length !== 2) return false;
      const domainParts = parts[1].split('.');
      if (domainParts.length < 2) return false;

      const fullTld = domainParts.slice(1).join('.');
      const mainTld = domainParts[domainParts.length - 1];

      const validTLDs = new Set([
        'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'co', 'info', 'biz', 'me', 'tv', 'xyz', 'online', 'site', 'store', 'tech', 'app', 'dev',
        'ph', 'edu.ph', 'com.ph', 'gov.ph', 'org.ph', 'net.ph',
        'us', 'uk', 'ca', 'au', 'jp', 'cn', 'in', 'de', 'fr', 'br', 'ru', 'sg', 'my'
      ]);

      return validTLDs.has(fullTld) || validTLDs.has(mainTld);
    };

    if (emailInput && emailErrDiv) {
      emailInput.addEventListener('input', () => {
        const val = emailInput.value.trim();
        if (val && !isValidEmail(val)) {
          emailInput.style.borderColor = '#EF4444';
          emailErrDiv.style.display = 'block';
        } else {
          emailInput.style.borderColor = 'var(--border-light)';
          emailErrDiv.style.display = 'none';
        }
      });
    }

    // Form submit
    const addForm = document.getElementById('add-faculty-form');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
          name: document.getElementById('faculty-name').value.trim(),
          email: document.getElementById('faculty-email').value.trim(),
          role: 'Faculty'
        };
        
        if (!isValidEmail(formData.email)) {
          alert('Security Warning: Invalid email address format!\n\nPlease enter a valid email address (e.g., name@example.com). Random letters or malformed email strings are not allowed.');
          if (emailInput) {
            emailInput.focus();
            emailInput.style.borderColor = '#EF4444';
            if (emailErrDiv) emailErrDiv.style.display = 'block';
          }
          return;
        }
        
        try {
          const response = await fetch('/api/faculty/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(formData)
          });
          
          const result = await response.json();
          
          if (response.ok) {
            alert(`Faculty member added successfully!\n\nLogin credentials have been sent to ${formData.email}`);
            modal.remove();
            loadFacultyMembers();
          } else {
            console.error('Add faculty failed:', response.status, result);
            alert('Error: ' + (result.error || 'Failed to add faculty'));
          }
        } catch (error) {
          console.error('Error adding faculty:', error);
          alert('Failed to add faculty. Please try again.');
        }
      });
    }
  }

  // View specific faculty schedule
  async function viewFacultySchedule(profName) {
    const modal = document.createElement('div');
    modal.id = 'schedule-view-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';
    
    modal.innerHTML = `
      <div class="sched-modal-dialog">
        <div class="sched-modal-header">
          <div>
            <h2 class="sched-modal-title">Faculty Schedule</h2>
            <p class="sched-modal-subtitle">Weekly class assignments for <strong>${profName}</strong></p>
          </div>
          <button id="close-sched-modal" class="sched-modal-close-btn">
            <i data-lucide="x"></i>
          </button>
        </div>
        
        <div id="sched-modal-body" style="padding:28px;overflow-y:auto;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:200px;">
          <div class="sched-spinner" style="border: 3px solid #E5E7EB; border-top: 3px solid #1EBBD7; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom:12px;"></div>
          <span style="font-family:var(--font-body);font-size:14px;color:#6B7280;">Loading schedule data from all rooms...</span>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(0)';
    }, 10);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    const closeModal = () => {
      modal.style.opacity = '0';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => modal.remove(), 250);
    };
    
    const closeBtn = document.getElementById('close-sched-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    try {
      const encodedName = encodeURIComponent(profName);
      const schedRes = await fetch(`/api/schedules/faculty/${encodedName}`);
      if (!schedRes.ok) throw new Error('Failed to load faculty schedule');
      const profSchedules = await schedRes.json();
      
      const body = document.getElementById('sched-modal-body');
      if (!body) return;
      body.style.display = 'block';
      body.style.alignItems = 'initial';
      body.style.justifyContent = 'initial';
      body.innerHTML = '';
      
      if (profSchedules.length === 0) {
        body.innerHTML = `
          <div class="sched-modal-empty">
            <div class="sched-modal-empty-icon">
              <i data-lucide="calendar"></i>
            </div>
            <h3 class="sched-modal-empty-title">No Active Assignments</h3>
            <p class="sched-modal-empty-desc">This faculty member is not currently assigned to teach in any computer laboratories.</p>
          </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
      }
      
      const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      profSchedules.sort((a, b) => {
        const dayA = a.day || a.Day_of_Week;
        const dayB = b.day || b.Day_of_Week;
        const indexA = daysOrder.indexOf(dayA);
        const indexB = daysOrder.indexOf(dayB);
        if (indexA !== indexB) return indexA - indexB;
        return (a.startTime || a.Start_Time || '').localeCompare(b.startTime || b.Start_Time || '');
      });
      
      function formatTime(t) {
        if (!t) return '--';
        let [h, m] = t.split(':');
        h = parseInt(h);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
      }
      
      let html = `<div style="display:flex;flex-direction:column;gap:18px;font-family:var(--font-body);">`;
      let currentDay = '';
      
      profSchedules.forEach(s => {
        const day = s.day || s.Day_of_Week;
        if (day !== currentDay) {
          currentDay = day;
          html += `<div class="sched-modal-day-divider">${currentDay}</div>`;
        }
        
        const subj = s.subject || s.Subject_Name || 'Class';
        const sec = s.section || s.Section || 'N/A';
        const rm = s.Room_Number;
        const bldg = s.Building || 'Laboratory';
        const start = formatTime(s.startTime || s.Start_Time);
        const end = formatTime(s.endTime || s.End_Time);
        
        html += `
          <div class="sched-modal-card">
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--text-dark);margin-bottom:3px;font-family:var(--font-display);">${subj}</div>
              <div style="display:flex;align-items:center;gap:14px;font-size:12.5px;color:var(--text-mid);">
                <span style="display:flex;align-items:center;gap:4px;"><i data-lucide="users" style="width:14px;height:14px;color:var(--text-muted);"></i> Section: <strong>${sec}</strong></span>
                <span style="display:flex;align-items:center;gap:4px;"><i data-lucide="map-pin" style="width:14px;height:14px;color:var(--text-muted);"></i> ${bldg} Rm ${rm}</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:13.5px;font-weight:600;color:var(--text-dark);display:flex;align-items:center;gap:5px;justify-content:flex-end;"><i data-lucide="clock" style="width:14px;height:14px;color:var(--primary-teal);"></i> ${start} - ${end}</div>
              <span class="rc-badge in-progress" style="margin-top:4px;display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;">Scheduled</span>
            </div>
          </div>
        `;
      });
      
      html += `</div>`;
      body.innerHTML = html;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (error) {
      console.error(error);
      const body = document.getElementById('sched-modal-body');
      if (body) {
        body.innerHTML = `
          <div style="text-align:center;padding:30px 10px;color:#EF4444;font-family:var(--font-body);">
            <i data-lucide="alert-circle" style="width:36px;height:36px;margin-bottom:12px;"></i>
            <p style="margin:0;font-size:14px;font-weight:600;">Failed to load schedule. Please try again.</p>
          </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  }

  // Change faculty role with PUT request
  function changeFacultyRole(userId, name, currentRole) {
    const modal = document.createElement('div');
    modal.id = 'role-edit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';
    
    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;width:90%;max-width:440px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,0.2);transform:translateY(20px);transition:transform 0.25s ease;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#1F2937;margin:0;">Change Faculty Role</h2>
          <button id="close-role-modal" style="background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
            <i data-lucide="x" style="width:18px;height:18px;color:#9CA3AF;"></i>
          </button>
        </div>
        
        <p style="margin:0 0 20px 0;font-size:14px;color:#4B5563;font-family:var(--font-body);line-height:1.5;">
          Update the administrative permissions and role for <strong>${name}</strong>.
        </p>
        
        <form id="change-role-form" style="display:flex;flex-direction:column;gap:18px;font-family:var(--font-body);">
          <div>
            <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Select Role</label>
            <div class="custom-select-wrapper" id="role-select-wrapper" style="width: 100%;">
              <div class="custom-select-trigger" style="width: 100%; padding: 12px 14px; border: 1.5px solid var(--border-light); border-radius: 8px; font-family: var(--font-body); font-size: 14px; background: var(--bg-white); color: var(--text-dark); cursor: pointer; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box;">
                <span>${currentRole === 'Faculty' ? 'Faculty (Regular Lecturer)' : 'IT Dept. Head (Administrator)'}</span>
                <i data-lucide="chevron-down" style="width: 18px; height: 18px; color: var(--text-light);"></i>
              </div>
              <div class="custom-select-dropdown" style="color: var(--text-dark);">
                <div class="custom-select-option ${currentRole === 'Faculty' ? 'selected' : ''}" data-value="Faculty">Faculty (Regular Lecturer)</div>
                <div class="custom-select-option ${currentRole.includes('Head') ? 'selected' : ''}" data-value="IT Dept. Head">IT Dept. Head (Administrator)</div>
              </div>
            </div>
          </div>
          
          <div class="alert-info-box">
            <i data-lucide="info"></i>
            <p>Upgrading a user to Department Head grants them access to master schedule overrides and faculty roster updates.</p>
          </div>
          
          <div style="display:flex;gap:12px;margin-top:8px;">
            <button type="button" id="cancel-role-btn" style="flex:1;padding:12px;border:1px solid #E5E7EB;background:#fff;border-radius:8px;font-size:14px;font-weight:600;color:#4B5563;cursor:pointer;transition:all 0.2s;">Cancel</button>
            <button type="submit" style="flex:1;padding:12px;border:none;background:var(--primary-teal);color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(30,187,215,0.3);">Save Changes</button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(0)';
    }, 10);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    if (window.initCustomSelect) {
      window.initCustomSelect('role-select-wrapper');
    }
    
    const closeModal = () => {
      modal.style.opacity = '0';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => modal.remove(), 250);
    };
    
    const closeBtn = document.getElementById('close-role-modal');
    const cancelBtn = document.getElementById('cancel-role-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    const roleForm = document.getElementById('change-role-form');
    if (roleForm) {
      roleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const wrapper = document.getElementById('role-select-wrapper');
        const select = document.getElementById('role-select');
        const newRole = (wrapper && wrapper.dataset ? wrapper.dataset.value : null) || (select ? select.value : null) || 'Faculty';
        
        const executeUpdate = async () => {
          try {
            const response = await fetch(`/api/faculty/${userId}/role`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ role: newRole })
            });
            
            if (response.ok) {
              closeModal();
              loadFacultyMembers();
              
              // If transferring leadership to a new IT Dept Head, demote the current user visually in real-time
              if (newRole === 'IT Dept. Head') {
                const profileRoleEl = document.querySelector('.profile-role');
                if (profileRoleEl) {
                  profileRoleEl.textContent = 'Faculty';
                }
                
                const cachedUser = localStorage.getItem('user');
                if (cachedUser) {
                  try {
                    const userObj = JSON.parse(cachedUser);
                    userObj.role = 'Faculty';
                    localStorage.setItem('user', JSON.stringify(userObj));
                  } catch (err) {
                    console.error('Error updating cached user:', err);
                  }
                }
                
                showSuccessGreetingModal(name);
              }
            } else {
              alert('Failed to update role. Please try again.');
            }
          } catch (err) {
            console.error(err);
            alert('Error updating role.');
          }
        };

        // If transferring Department Head leadership to someone else, confirm first to prevent misclick!
        if (newRole === 'IT Dept. Head' && !currentRole.includes('Head')) {
          modal.style.display = 'none';
          
          showTransferConfirmation(
            () => {
              executeUpdate();
            },
            () => {
              modal.style.display = 'flex';
            }
          );
        } else {
          executeUpdate();
        }
      });
    }
  }

  // Confirm transfer dialog helper
  function showTransferConfirmation(onConfirm, onCancel) {
    const confirmModal = document.createElement('div');
    confirmModal.id = 'transfer-confirm-modal';
    confirmModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1100;opacity:0;transition:opacity 0.25s ease;';
    
    confirmModal.innerHTML = `
      <div style="background:#fff;border-radius:18px;width:90%;max-width:440px;padding:32px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.3);transform:translateY(20px);transition:transform 0.25s ease;text-align:center;">
        <div style="width:60px;height:60px;background:#FEF3C7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;color:#D97706;">
          <i data-lucide="shield-alert" style="width:30px;height:30px;"></i>
        </div>
        
        <h3 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:#1F2937;margin:0 0 10px 0;">Transfer Department Leadership?</h3>
        
        <p style="margin:0 0 24px 0;font-size:14px;color:#4B5563;font-family:var(--font-body);line-height:1.55;">
          You are about to transfer the **IT Department Head** role to <strong>${name}</strong>.<br><br>
          <strong style="color:#D97706;">Warning:</strong> This will promote them to the main admin slot and re-assign system privileges. Are you sure you want to proceed?
        </p>
        
        <div style="display:flex;gap:12px;font-family:var(--font-body);">
          <button id="btn-cancel-transfer" style="flex:1;padding:12px;border:1px solid #E5E7EB;background:#fff;border-radius:8px;font-size:14px;font-weight:600;color:#4B5563;cursor:pointer;transition:all 0.2s;">No, Cancel</button>
          <button id="btn-confirm-transfer" style="flex:1;padding:12px;border:none;background:#D97706;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(217,119,6,0.3);">Yes, Transfer</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(confirmModal);
    setTimeout(() => {
      confirmModal.style.opacity = '1';
      const dialog = confirmModal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(0)';
    }, 10);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    const cancelTransferBtn = document.getElementById('btn-cancel-transfer');
    if (cancelTransferBtn) {
      cancelTransferBtn.addEventListener('click', () => {
        confirmModal.style.opacity = '0';
        const dialog = confirmModal.querySelector('div');
        if (dialog) dialog.style.transform = 'translateY(20px)';
        setTimeout(() => {
          confirmModal.remove();
          if (onCancel) onCancel();
        }, 250);
      });
    }
    
    const confirmTransferBtn = document.getElementById('btn-confirm-transfer');
    if (confirmTransferBtn) {
      confirmTransferBtn.addEventListener('click', () => {
        confirmModal.style.opacity = '0';
        const dialog = confirmModal.querySelector('div');
        if (dialog) dialog.style.transform = 'translateY(20px)';
        setTimeout(() => {
          confirmModal.remove();
          if (onConfirm) onConfirm();
        }, 250);
      });
    }
  }

  // Celebratory Greeting success modal
  function showSuccessGreetingModal(newName) {
    const currentHead = (window.allFacultyMembers || []).find(m => m.Role && m.Role.toLowerCase().includes('head'));
    const currentHeadName = currentHead ? currentHead.Name : 'Department Head';

    const successModal = document.createElement('div');
    successModal.id = 'success-greeting-modal';
    successModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1200;opacity:0;transition:opacity 0.3s ease;';
    
    successModal.innerHTML = `
      <div class="sched-modal-dialog" style="max-width:520px;padding:36px 32px;text-align:center;position:relative;overflow:hidden;">
        
        <div style="position:absolute;top:0;left:0;width:100%;height:6px;background:var(--gradient-primary);"></div>
        
        <div class="heart-container">
          <i data-lucide="heart" style="width:36px;height:36px;fill:#EF4444;animation:pulse 1.5s infinite;"></i>
        </div>
        
        <h2 style="font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--text-dark);margin:0 0 10px 0;">Thank You for Your Leadership!</h2>
        
        <div style="font-size:14.5px;color:var(--text-mid);font-family:var(--font-body);line-height:1.6;margin-bottom:28px;">
          <p style="margin:0 0 16px 0;">The IT Department Head role has been successfully transferred to <strong>Prof. ${newName}</strong>.</p>
          
          <div class="tribute-card">
            <span style="display:block;font-size:11px;font-weight:800;color:#B45309;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:8px;">A Tribute of Gratitude</span>
            <span style="font-size:14.5px;font-weight:500;color:#78350F;line-height:1.6;display:block;">
              "We extend our heartfelt gratitude to <strong>Prof. ${currentHeadName}</strong> for your exceptional leadership, vision, and dedicated service as our Department Head. Thank you for your guidance and for making a lasting difference in our department!"
            </span>
            <div style="margin-top:12px;display:flex;align-items:center;gap:6px;font-size:12.5px;color:#D97706;font-weight:700;">
              <i data-lucide="award" style="width:16px;height:16px;"></i> Dedicated Service & Leadership
            </div>
          </div>
          
          <div class="successor-card">
            <div style="background:#14B8A6;color:white;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i data-lucide="user-check" style="width:16px;height:16px;"></i>
            </div>
            <div>
              <span style="display:block;font-size:11px;color:#0D9488;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Successor</span>
              <span style="font-size:13.5px;color:#0f766e;font-weight:700;">Prof. ${newName} is now active as the new IT Dept. Head.</span>
            </div>
          </div>
        </div>
        
        <button id="btn-close-success" style="width:100%;padding:14px;border:none;background:linear-gradient(135deg, #1EBBD7 0%, #0EA5E9 100%);color:#fff;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.25s;box-shadow:0 6px 20px rgba(14,165,233,0.3);" onmouseover="this.style.transform='translateY(-1px)';" onmouseout="this.style.transform='none';">
          Wonderful, Thank you!
        </button>
      </div>
    `;
    
    document.body.appendChild(successModal);
    setTimeout(() => {
      successModal.style.opacity = '1';
      const dialog = successModal.querySelector('div');
      if (dialog) dialog.style.transform = 'scale(1)';
    }, 10);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    const closeSuccessBtn = document.getElementById('btn-close-success');
    if (closeSuccessBtn) {
      closeSuccessBtn.addEventListener('click', () => {
        successModal.style.opacity = '0';
        const dialog = successModal.querySelector('div');
        if (dialog) dialog.style.transform = 'scale(0.9)';
        setTimeout(() => {
          successModal.remove();
          window.location.href = 'index.html';
        }, 250);
      });
    }
  }

  // Confirm and Delete faculty
  function confirmDeleteFaculty(userId, name) {
    const modal = document.createElement('div');
    modal.id = 'delete-confirm-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000;opacity:0;transition:opacity 0.25s ease;';
    
    modal.innerHTML = `
      <div style="background:var(--bg-white);color:var(--text-dark);border:1px solid var(--border-light);border-radius:18px;width:90%;max-width:400px;padding:28px;box-shadow:0 20px 40px rgba(0,0,0,0.3);transform:translateY(20px);transition:transform 0.25s ease;text-align:center;">
        <div style="width:56px;height:56px;background:rgba(239,68,68,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px auto;color:#EF4444;">
          <i data-lucide="user-x" style="width:28px;height:28px;"></i>
        </div>
        
        <h2 style="font-family:var(--font-display);font-size:18px;font-weight:700;color:var(--text-dark);margin:0 0 10px 0;">Remove Faculty Member</h2>
        
        <p style="margin:0 0 24px 0;font-size:14px;color:var(--text-mid);font-family:var(--font-body);line-height:1.5;">
          Are you sure you want to remove <strong>${name}</strong>? This action will revoke their login access and clear their schedule assignments.
        </p>
        
        <div style="display:flex;gap:12px;font-family:var(--font-body);">
          <button id="cancel-delete-btn" style="flex:1;padding:12px;border:1px solid var(--border-light);background:var(--bg-card);border-radius:8px;font-size:14px;font-weight:600;color:var(--text-dark);cursor:pointer;transition:all 0.2s;">Cancel</button>
          <button id="confirm-delete-btn" style="flex:1;padding:12px;border:none;background:#EF4444;color:#fff;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 12px rgba(239,68,68,0.25);">Remove</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    setTimeout(() => {
      modal.style.opacity = '1';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(0)';
    }, 10);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    const closeModal = () => {
      modal.style.opacity = '0';
      const dialog = modal.querySelector('div');
      if (dialog) dialog.style.transform = 'translateY(20px)';
      setTimeout(() => modal.remove(), 250);
    };
    
    const cancelBtn = document.getElementById('cancel-delete-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    
    const confirmBtn = document.getElementById('confirm-delete-btn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        try {
          const response = await fetch(`/api/faculty/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          
          if (response.ok) {
            closeModal();
            loadFacultyMembers();
          } else {
            alert('Failed to remove faculty member.');
          }
        } catch (err) {
          console.error(err);
          alert('Error removing faculty.');
        }
      });
    }
  }

  // Bind Global Event Listeners & Initialize
  function initPage() {
    initSidebarScrollClue();

    // Close menus when clicking outside
    document.addEventListener('click', () => {
      closeAllMenus();
    });

    // Filter button click listener
    const filterBtn = document.getElementById('filter-btn');
    if (filterBtn) {
      filterBtn.addEventListener('click', (e) => toggleFacultyFilterDropdown(e));
    }

    // Search input listeners
    const searchInput = document.getElementById('faculty-search');
    if (searchInput) {
      ['input', 'keyup', 'change', 'clear', 'paste'].forEach(evt => {
        searchInput.addEventListener(evt, () => applySearchAndFilter());
      });
    }

    // Add faculty button listener
    const addFacultyBtn = document.getElementById('add-faculty-btn');
    if (addFacultyBtn) {
      addFacultyBtn.addEventListener('click', () => {
        showAddFacultyModal();
      });
    }

    // Initial load
    loadFacultyMembers();
  }

  // Global Compatibility Bridges
  window.toggleMenu = toggleMenu;
  window.toggleFacultyFilterDropdown = toggleFacultyFilterDropdown;
  window.filterFaculty = filterFaculty;
  window.showAddFacultyModal = showAddFacultyModal;
  window.viewFacultySchedule = viewFacultySchedule;
  window.changeFacultyRole = changeFacultyRole;
  window.confirmDeleteFaculty = confirmDeleteFaculty;

  // Initialize on DOM ready or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }

})();
