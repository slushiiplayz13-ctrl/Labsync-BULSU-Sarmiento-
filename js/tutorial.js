/**
 * LabSync Faculty Onboarding Interactive Spotlight Tutorial
 * Automatically runs on first login for newly created faculty accounts.
 */

(function () {
    'use strict';

    let currentStepIndex = 0;
    let overlayEl = null;
    let spotlightEl = null;
    let cardEl = null;
    let activeHighlightedEl = null;
    let currentUserId = null;
    let activeTutorialSteps = [];

    const facultyTutorialSteps = [
        {
            selector: '.header-logos, .header, .header-title',
            title: 'Welcome to LabSync! 👋',
            badge: 'Getting Started',
            description: 'Welcome to your LabSync faculty portal. This interactive walkthrough will guide you through your dashboard, class schedules, and room tools.',
            position: 'bottom'
        },
        {
            selector: 'button[onclick*="my-schedule"], .sidebar-btn[title*="Schedule"], .sidebar-btn[data-tooltip*="Schedule"], a[href*="my-schedule.html"]',
            title: '📅 My Schedule',
            badge: 'Class Schedule',
            description: 'View all your assigned laboratory classes, room assignments, subject codes, and weekly time slots configured by your Department Head.',
            position: 'right'
        },
        {
            selector: 'button[onclick*="room-status"], .sidebar-btn[title*="Room"], .sidebar-btn[data-tooltip*="Room"], a[href*="room-status.html"]',
            title: '🖥️ Room Status & Key Log',
            badge: 'Room Status',
            description: 'Check real-time laboratory room availability, active occupancy, and physical key custody before heading to class.',
            position: 'right'
        },
        {
            selector: 'button[onclick*="pc-reports"], button[onclick*="faculty-pc-reports"], .sidebar-btn[title*="PC"], .sidebar-btn[data-tooltip*="PC"], a[href*="faculty-pc-reports.html"]',
            title: '🔧 PC Reports',
            badge: 'PC Issues',
            description: 'View and check reported student PC issues in your assigned laboratory rooms.',
            position: 'right'
        },
        {
            selector: '.profile-dropdown, .header-right, .profile-info, .avatar',
            title: '🪪 Digital QR ID & Profile',
            badge: 'QR Door Access',
            description: 'Access your official digital QR code used as a key to unlock and access laboratory rooms, update your credentials, and customize preferences.',
            position: 'bottom-left'
        }
    ];

    const itHeadTutorialSteps = [
        {
            selector: '.header-logos, .header, .header-title',
            title: 'Welcome, Department Head! 🎓',
            badge: 'IT Head Portal',
            description: 'Welcome to the LabSync IT Department Head management portal. This interactive guide will introduce your administrative tools and academic controls.',
            position: 'bottom'
        },
        {
            selector: 'button[onclick*="master-schedule"], .sidebar-btn[title*="Master Schedule"], .sidebar-btn[data-tooltip*="Master Schedule"], a[href*="master-schedule.html"]',
            title: '📅 Master Schedule Planner',
            badge: 'Master Schedule',
            description: 'Build, configure, and manage semester-wide laboratory timetables, room assignments, and course sections across IT laboratories.',
            position: 'right'
        },
        {
            selector: 'button[onclick*="faculty-management"], .sidebar-btn[title*="Faculty Management"], .sidebar-btn[data-tooltip*="Faculty Management"], a[href*="faculty-management.html"]',
            title: '👥 Faculty Management',
            badge: 'Faculty Roster',
            description: 'Oversee department faculty accounts, register new instructors, update account permissions, and promote faculty to Department Head.',
            position: 'right'
        },
        {
            selector: 'button[onclick*="room-status"], .sidebar-btn[title*="Room"], .sidebar-btn[data-tooltip*="Room"], a[href*="it-head-room-status.html"], a[href*="room-status.html"]',
            title: '🖥️ Room Status & Key Logs',
            badge: 'Room Status',
            description: 'Monitor real-time laboratory room availability, live key custody, device connectivity status, and access activity streams.',
            position: 'right'
        },
        {
            selector: 'button[onclick*="pc-reports"], button[onclick*="it-head-pc-reports"], .sidebar-btn[title*="PC"], .sidebar-btn[data-tooltip*="PC"], a[href*="it-head-pc-reports.html"]',
            title: '🔧 PC Maintenance Reports',
            badge: 'PC Tickets',
            description: 'View and monitor reported student PC issues across laboratory rooms.',
            position: 'right'
        },
        {
            selector: 'button[onclick*="my-schedule"], .sidebar-btn[title*="Schedule"], .sidebar-btn[data-tooltip*="Schedule"], a[href*="it-head-my-schedule.html"], a[href*="my-schedule.html"]',
            title: '📆 My Teaching Schedule',
            badge: 'My Teaching',
            description: 'Quickly access and review your own scheduled teaching hours and assigned laboratory classrooms.',
            position: 'right'
        },
        {
            selector: '.profile-dropdown, .header-right, .profile-info, .avatar',
            title: '🪪 Digital QR ID & Profile',
            badge: 'QR Door Access',
            description: 'Access your official digital QR code used as a key to unlock and access laboratory rooms, manage account settings, and customize preferences.',
            position: 'bottom-left'
        }
    ];

    function isItHeadUser() {
        if (window.currentUser && String(window.currentUser.Role || '').toLowerCase().includes('head')) return true;
        if (window.location.pathname.includes('it-head')) return true;
        const roleEl = document.querySelector('.profile-role');
        if (roleEl && roleEl.textContent.toLowerCase().includes('head')) return true;
        return false;
    }


    async function checkAndInitTutorial() {
        try {
            const res = await fetch('/api/user/current', { credentials: 'include' });
            if (!res.ok) return;
            const user = await res.json();

            if (!user || !user.id) return;
            currentUserId = user.id;

            const userKey = 'labsync_tut_done_' + user.id;
            const sessionKey = 'labsync_tut_session_' + user.id;

            // User-scoped guards (prevents cross-account state leakage in same browser)
            if (localStorage.getItem(userKey) === 'true') {
                return;
            }
            if (sessionStorage.getItem(sessionKey) === 'true') {
                return;
            }

            const hasCompleted = user.hasCompletedTutorial === true || user.hasCompletedTutorial === 1 || user.Has_Completed_Tutorial === 1;

            if (hasCompleted) {
                localStorage.setItem(userKey, 'true');
                return;
            }

            // Auto launch ONLY ONCE on initial first login for newly created accounts
            const isEligibleRole = isFacultyRole(user.role) || String(user.role || '').toLowerCase().includes('head');
            if (user && !hasCompleted && isEligibleRole) {
                sessionStorage.setItem(sessionKey, 'true');
                localStorage.setItem(userKey, 'true');
                markTutorialCompleteInDB();

                setTimeout(() => {
                    startFacultyTutorial(false);
                }, 400);
            }
        } catch (err) {
            console.error('[Tutorial] Initialization error:', err);
        }
    }

    function isFacultyRole(role) {
        if (!role) return true;
        const cleanRole = role.toLowerCase();
        return !cleanRole.includes('head') && !cleanRole.includes('admin') && !cleanRole.includes('mis');
    }

    function createTutorialElements() {
        if (overlayEl) return;

        // Overlay
        overlayEl = document.createElement('div');
        overlayEl.className = 'tutorial-overlay';
        document.body.appendChild(overlayEl);

        // Spotlight focus ring
        spotlightEl = document.createElement('div');
        spotlightEl.className = 'tutorial-spotlight';
        document.body.appendChild(spotlightEl);

        // Tooltip Card
        cardEl = document.createElement('div');
        cardEl.className = 'tutorial-card';
        cardEl.innerHTML = `
            <div class="tutorial-card-header">
                <span class="tutorial-badge" id="tut-badge">Getting Started</span>
                <button class="tutorial-skip-btn" id="tut-skip-btn" title="Skip tutorial">Skip ✕</button>
            </div>
            <h3 class="tutorial-title" id="tut-title">Step Title</h3>
            <p class="tutorial-description" id="tut-desc">Step description text goes here.</p>
            <div class="tutorial-progress-bar">
                <div class="tutorial-progress-fill" id="tut-progress"></div>
            </div>
            <div class="tutorial-card-footer">
                <span class="tutorial-step-counter" id="tut-counter">Step 1 of 5</span>
                <div class="tutorial-nav-buttons">
                    <button class="tutorial-btn-prev" id="tut-prev-btn" type="button">Back</button>
                    <button class="tutorial-btn-next" id="tut-next-btn" type="button">Next →</button>
                </div>
            </div>
        `;
        document.body.appendChild(cardEl);

        // Event Listeners
        document.getElementById('tut-skip-btn').addEventListener('click', skipTutorial);
        document.getElementById('tut-prev-btn').addEventListener('click', previousStep);
        document.getElementById('tut-next-btn').addEventListener('click', nextStep);

        window.addEventListener('resize', handleReposition);
        window.addEventListener('scroll', handleReposition, { passive: true });
    }

    function startFacultyTutorial(force = false) {
        activeTutorialSteps = isItHeadUser() ? itHeadTutorialSteps : facultyTutorialSteps;
        createTutorialElements();
        currentStepIndex = 0;

        if (overlayEl) overlayEl.style.display = 'block';
        if (cardEl) cardEl.style.display = 'block';

        overlayEl.classList.add('active');
        cardEl.classList.add('active');
        showStep(currentStepIndex);
    }

    function showStep(index) {
        if (!activeTutorialSteps || activeTutorialSteps.length === 0) {
            activeTutorialSteps = isItHeadUser() ? itHeadTutorialSteps : facultyTutorialSteps;
        }
        if (index < 0 || index >= activeTutorialSteps.length) return;

        // Clear previous highlight ring
        if (activeHighlightedEl) {
            activeHighlightedEl.classList.remove('tutorial-target-highlight');
            activeHighlightedEl = null;
        }

        const step = activeTutorialSteps[index];
        const targetEl = findTargetElement(step.selector);

        if (targetEl) {
            activeHighlightedEl = targetEl;
            targetEl.classList.add('tutorial-target-highlight');
        }

        // Update Card Content
        document.getElementById('tut-badge').textContent = step.badge;
        document.getElementById('tut-title').textContent = step.title;
        document.getElementById('tut-desc').textContent = step.description;

        // Progress bar
        const total = activeTutorialSteps.length;
        const percent = Math.round(((index + 1) / total) * 100);
        document.getElementById('tut-progress').style.width = `${percent}%`;
        document.getElementById('tut-counter').textContent = `Step ${index + 1} of ${total}`;

        // Controls
        const prevBtn = document.getElementById('tut-prev-btn');
        const nextBtn = document.getElementById('tut-next-btn');

        prevBtn.disabled = index === 0;
        if (index === total - 1) {
            nextBtn.innerHTML = 'Finish Tutorial 🎉';
        } else {
            nextBtn.innerHTML = 'Next →';
        }

        // Position Spotlight Box & Tooltip Card
        positionTutorialElements(targetEl, step.position);
    }

    function findTargetElement(selectorStr) {
        if (!selectorStr) return null;
        const selectors = selectorStr.split(',').map(s => s.trim());
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && isElementVisible(el)) {
                return el;
            }
        }
        return null;
    }

    function isElementVisible(el) {
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    }

    function positionTutorialElements(targetEl, preferredPos) {
        if (!targetEl) {
            // Center fallback if target element not found
            if (spotlightEl) spotlightEl.style.display = 'none';
            if (overlayEl) overlayEl.classList.add('modal-fallback');
            cardEl.style.top = '50%';
            cardEl.style.left = '50%';
            cardEl.style.transform = 'translate(-50%, -50%) scale(1)';
            return;
        }

        if (overlayEl) overlayEl.classList.remove('modal-fallback');
        if (spotlightEl) spotlightEl.style.display = 'block';

        const rect = targetEl.getBoundingClientRect();
        const padding = 8;

        // Position glowing spotlight focus ring
        spotlightEl.style.top = `${Math.max(0, rect.top - padding)}px`;
        spotlightEl.style.left = `${Math.max(0, rect.left - padding)}px`;
        spotlightEl.style.width = `${rect.width + padding * 2}px`;
        spotlightEl.style.height = `${rect.height + padding * 2}px`;

        const cardWidth = Math.min(410, window.innerWidth - 32);
        const cardHeight = cardEl.offsetHeight || 240;

        let cardTop = rect.bottom + 16;
        let cardLeft = rect.left + (rect.width / 2) - (cardWidth / 2);

        if (preferredPos === 'right') {
            cardLeft = rect.right + 24;
            cardTop = rect.top + (rect.height / 2) - (cardHeight / 2);
        } else if (preferredPos === 'bottom-left' || preferredPos === 'left') {
            cardLeft = rect.right - cardWidth;
            if (cardLeft < 16) {
                cardLeft = rect.left;
            }
            cardTop = rect.bottom + 16;
        }

        // Keep inside viewport limits
        const margin = 16;
        if (cardLeft < margin) cardLeft = margin;
        if (cardLeft + cardWidth > window.innerWidth - margin) {
            cardLeft = window.innerWidth - cardWidth - margin;
        }

        if (cardTop + cardHeight > window.innerHeight - margin) {
            cardTop = rect.top - cardHeight - 16;
        }
        if (cardTop < margin) cardTop = margin;

        cardEl.style.top = `${cardTop}px`;
        cardEl.style.left = `${cardLeft}px`;
        cardEl.style.transform = 'none';
    }

    function handleReposition() {
        if (!cardEl || !cardEl.classList.contains('active')) return;
        if (!activeTutorialSteps || activeTutorialSteps.length === 0) {
            activeTutorialSteps = isItHeadUser() ? itHeadTutorialSteps : facultyTutorialSteps;
        }
        const step = activeTutorialSteps[currentStepIndex];
        const targetEl = findTargetElement(step ? step.selector : null);
        positionTutorialElements(targetEl, step ? step.position : 'bottom');
    }

    function nextStep() {
        if (!activeTutorialSteps || activeTutorialSteps.length === 0) {
            activeTutorialSteps = isItHeadUser() ? itHeadTutorialSteps : facultyTutorialSteps;
        }
        if (currentStepIndex < activeTutorialSteps.length - 1) {
            currentStepIndex++;
            showStep(currentStepIndex);
        } else {
            completeTutorial();
        }
    }

    function previousStep() {
        if (currentStepIndex > 0) {
            currentStepIndex--;
            showStep(currentStepIndex);
        }
    }

    async function completeTutorial() {
        if (currentUserId) {
            localStorage.setItem('labsync_tut_done_' + currentUserId, 'true');
            sessionStorage.setItem('labsync_tut_session_' + currentUserId, 'true');
        }
        closeTutorialUI();
        await markTutorialCompleteInDB();
        showToastNotification('Tutorial completed! You can re-watch it anytime from the Help menu.');
    }

    async function skipTutorial() {
        if (currentUserId) {
            localStorage.setItem('labsync_tut_done_' + currentUserId, 'true');
            sessionStorage.setItem('labsync_tut_session_' + currentUserId, 'true');
        }
        closeTutorialUI();
        await markTutorialCompleteInDB();
        showToastNotification('Tutorial skipped. Access it anytime from the Help menu.');
    }

    function closeTutorialUI() {
        if (activeHighlightedEl) {
            activeHighlightedEl.classList.remove('tutorial-target-highlight');
            activeHighlightedEl = null;
        }
        if (overlayEl) {
            overlayEl.classList.remove('active');
            overlayEl.style.display = 'none';
        }
        if (cardEl) {
            cardEl.classList.remove('active');
            cardEl.style.display = 'none';
        }
        if (spotlightEl) {
            spotlightEl.style.display = 'none';
        }
    }

    async function markTutorialCompleteInDB() {
        try {
            await fetch('/api/user/tutorial-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true }),
                credentials: 'include'
            });
        } catch (err) {
            console.error('[Tutorial] Error updating tutorial status in DB:', err);
        }
    }

    function showToastNotification(msg) {
        if (window.showToast) {
            window.showToast(msg, 'info');
            return;
        }
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #1e293b;
            color: #ffffff;
            padding: 12px 20px;
            border-radius: 10px;
            font-size: 0.875rem;
            font-weight: 500;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            z-index: 999999;
            transition: opacity 0.3s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // Export globally for manual trigger ("Re-watch tutorial")
    window.startFacultyTutorial = startFacultyTutorial;
    window.startSystemTutorial = startFacultyTutorial;

    // Run automatically on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndInitTutorial);
    } else {
        checkAndInitTutorial();
    }
})();
