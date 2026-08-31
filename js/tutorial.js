/**
 * LabSync System Interactive Spotlight Tutorial
 * Ordered strictly based on the sidebar menus (from top to bottom) and header profile.
 * Supports Faculty, IT Department Head, and MIS Staff roles.
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

    // ─── 1. FACULTY / PROFESSOR MENU-ORDERED TUTORIAL ─────────────────
    const facultyTutorialSteps = [
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Dashboard"], .sidebar-nav .sidebar-btn:nth-of-type(1), .sidebar .sidebar-btn[title="Dashboard"]',
            title: '📊 Faculty Dashboard',
            badge: 'Menu 1: Dashboard',
            description: 'Your central command center. View upcoming classes, today’s schedule, quick laboratory room availability, and important announcements at a glance.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Room Status"], .sidebar-nav .sidebar-btn:nth-of-type(2), .sidebar .sidebar-btn[title="Room Status"]',
            title: '🖥️ Room Status & Key Custody',
            badge: 'Menu 2: Room Status',
            description: 'Check real-time laboratory room availability (Available, Borrowed, In Session), verify physical key custody, and inspect room access logs before heading to class.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="PC Reports"], .sidebar-nav .sidebar-btn:nth-of-type(3), .sidebar .sidebar-btn[title="PC Reports"]',
            title: '🔧 PC Issue Reports',
            badge: 'Menu 3: PC Reports',
            description: 'Monitor and track student-reported computer hardware and software issues in your assigned laboratory classrooms to ensure devices are operational.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="My Schedule"], .sidebar-nav .sidebar-btn:nth-of-type(4), .sidebar .sidebar-btn[title="My Schedule"]',
            title: '📅 My Class Schedule',
            badge: 'Menu 4: My Schedule',
            description: 'Review your complete weekly teaching schedule, assigned laboratory rooms, section codes, subject details, and time slots configured by the Department Head.',
            position: 'right'
        },
        {
            selector: '.sidebar-bottom .sidebar-btn[data-tooltip="Help & Support"], .sidebar-bottom .sidebar-btn:first-child, .sidebar .sidebar-btn[title="Help & Support"], .header-right .profile-dropdown, .header-right',
            title: '❓ Help & Support',
            badge: 'Menu 5: Help & Support',
            description: 'Access laboratory operational guidelines, campus safety instructions, and emergency department contact numbers whenever you need assistance.',
            position: 'right'
        },
        {
            selector: '.header-right .profile-widget, .header-right .profile-info, .header-right .avatar, .header-right .profile-dropdown, .header-right',
            title: '🪪 Digital QR ID & Profile',
            badge: 'Menu 6: Profile & QR ID',
            description: 'Access your official digital QR access pass used as an electronic key to unlock laboratory doors, update account credentials, or customize theme preferences.',
            position: 'bottom-left'
        }
    ];

    // ─── 2. IT DEPARTMENT HEAD MENU-ORDERED TUTORIAL ──────────────────
    const itHeadTutorialSteps = [
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Dashboard"], .sidebar-nav .sidebar-btn:nth-of-type(1), .sidebar .sidebar-btn[title="Dashboard"]',
            title: '📊 IT Head Dashboard',
            badge: 'Menu 1: Dashboard',
            description: 'Your executive command center. Monitor department-wide laboratory room occupancy, active classes, quick stats, and live system activity feeds.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Room Status"], .sidebar-nav .sidebar-btn:nth-of-type(2), .sidebar .sidebar-btn[title="Room Status"]',
            title: '🖥️ Room Status & Key Logs',
            badge: 'Menu 2: Room Status',
            description: 'Oversee real-time laboratory room availability (Available, Borrowed, In Session), live key custody logs, device connectivity, and room access timeline.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="PC Reports"], .sidebar-nav .sidebar-btn:nth-of-type(3), .sidebar .sidebar-btn[title="PC Reports"]',
            title: '🔧 PC Maintenance Reports',
            badge: 'Menu 3: PC Reports',
            description: 'Review, prioritize, and inspect reported student and faculty computer issue tickets across all IT department computer laboratories.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="My Schedule"], .sidebar-nav .sidebar-btn:nth-of-type(4), .sidebar .sidebar-btn[title="My Schedule"]',
            title: '📆 My Teaching Schedule',
            badge: 'Menu 4: My Schedule',
            description: 'Quickly access and review your own personal weekly teaching hours, assigned course sections, and assigned laboratory classrooms.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Master Schedule"], .sidebar .sidebar-btn[title="Master Schedule"], .sidebar .sidebar-btn[data-tooltip="Admin Panel"], .sidebar .sidebar-btn[title="Admin Panel"]',
            title: '📅 Master Schedule Planner',
            badge: 'Menu 5: Master Schedule',
            description: 'Build, configure, and manage semester-wide laboratory timetables, room assignments, instructor allocations, and prevent class schedule overlaps.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Faculty Management"], .sidebar .sidebar-btn[title="Faculty Management"], .sidebar .sidebar-btn[data-tooltip="Admin Panel"], .sidebar .sidebar-btn[title="Admin Panel"]',
            title: '👥 Faculty Management',
            badge: 'Menu 6: Faculty Management',
            description: 'Oversee department faculty accounts, register new instructors, view individual faculty teaching timetables, and manage administrative roles.',
            position: 'right'
        },
        {
            selector: '.sidebar-bottom .sidebar-btn[data-tooltip="Help & Support"], .sidebar-bottom .sidebar-btn:first-child, .sidebar .sidebar-btn[title="Help & Support"], .header-right .profile-dropdown, .header-right',
            title: '❓ Help & Support',
            badge: 'Menu 7: Help & Support',
            description: 'Access department administrative guidelines, system operational documentation, and IT escalation channels.',
            position: 'right'
        },
        {
            selector: '.header-right .profile-widget, .header-right .profile-info, .header-right .avatar, .header-right .profile-dropdown, .header-right',
            title: '🪪 Digital QR ID & Profile',
            badge: 'Menu 8: Profile & QR ID',
            description: 'Access your official digital QR access pass used as an electronic key to unlock laboratory doors, manage account credentials, and customize settings.',
            position: 'bottom-left'
        }
    ];

    // ─── 3. MIS STAFF MENU-ORDERED TUTORIAL ───────────────────────────
    const misStaffTutorialSteps = [
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip="Dashboard"], .sidebar-nav .sidebar-btn:nth-of-type(1), .sidebar .sidebar-btn[title="Dashboard"]',
            title: '📊 MIS Staff Dashboard',
            badge: 'Menu 1: Dashboard',
            description: 'Overview of laboratory computer health, pending maintenance tickets, recent activity logs, and hardware status across all campus labs.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip*="Maintenance"], .sidebar .sidebar-btn[title*="Maintenance"]',
            title: '🛠️ Maintenance Tracker',
            badge: 'Menu 2: Maintenance Tracker',
            description: 'Log hardware and software repairs, update diagnostic statuses, assign repair technicians, and track resolution progress for reported issues.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip*="PC & QR"], .sidebar .sidebar-btn[title*="PC & QR"]',
            title: '🏷️ PC & QR Management',
            badge: 'Menu 3: PC & QR Management',
            description: 'Generate, print, and configure official scannable QR code labels for laboratory computer units and maintain laboratory hardware inventory.',
            position: 'right'
        },
        {
            selector: '.sidebar-nav .sidebar-btn[data-tooltip*="Key Management"], .sidebar .sidebar-btn[title*="Key Management"]',
            title: '🔑 Key Management & Tracking',
            badge: 'Menu 4: Key Management',
            description: 'Manage physical laboratory keys, print 2-sided QR keychain inserts, track Active/Missing/Found key status, and monitor IoT box access logs.',
            position: 'right'
        },
        {
            selector: '.sidebar-bottom .sidebar-btn[data-tooltip="Help & Support"], .sidebar-bottom .sidebar-btn:first-child, .sidebar .sidebar-btn[title="Help & Support"], .header-right .profile-dropdown, .header-right',
            title: '❓ Help & Support',
            badge: 'Menu 5: Help & Support',
            description: 'Access technical documentation, maintenance standard operating procedures, and system manuals.',
            position: 'right'
        },
        {
            selector: '.header-right .profile-widget, .header-right .profile-info, .header-right .avatar, .header-right .profile-dropdown, .header-right',
            title: '🪪 Digital QR ID & Profile',
            badge: 'Menu 6: Profile & Settings',
            description: 'Manage your MIS staff account credentials, update your password, and customize display preferences.',
            position: 'bottom-left'
        }
    ];

    /**
     * Determines active user role to select the appropriate menu tutorial sequence.
     * @returns {'head' | 'mis' | 'faculty'}
     */
    function getUserRole() {
        if (window.currentUser && window.currentUser.Role) {
            const r = String(window.currentUser.Role).toLowerCase();
            if (r.includes('head')) return 'head';
            if (r.includes('mis') || r.includes('staff')) return 'mis';
            return 'faculty';
        }
        try {
            const cachedUser = JSON.parse(sessionStorage.getItem('labsync_user') || 'null');
            if (cachedUser && (cachedUser.Role || cachedUser.role)) {
                const r = String(cachedUser.Role || cachedUser.role).toLowerCase();
                if (r.includes('head')) return 'head';
                if (r.includes('mis') || r.includes('staff')) return 'mis';
                return 'faculty';
            }
        } catch (e) {}

        const path = window.location.pathname.toLowerCase();
        if (path.includes('it-head') || path.includes('master-schedule') || path.includes('faculty-management')) return 'head';
        if (path.includes('mis')) return 'mis';

        const roleEl = document.querySelector('.profile-role');
        if (roleEl) {
            const text = roleEl.textContent.toLowerCase();
            if (text.includes('head')) return 'head';
            if (text.includes('mis') || text.includes('staff')) return 'mis';
        }
        return 'faculty';
    }

    function getTutorialStepsForRole() {
        const role = getUserRole();
        if (role === 'head') return itHeadTutorialSteps;
        if (role === 'mis') return misStaffTutorialSteps;
        return facultyTutorialSteps;
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

            // User-scoped guards
            if (localStorage.getItem(userKey) === 'true') return;
            if (sessionStorage.getItem(sessionKey) === 'true') return;

            const hasCompleted = user.hasCompletedTutorial === true || user.hasCompletedTutorial === 1 || user.Has_Completed_Tutorial === 1;
            if (hasCompleted) {
                localStorage.setItem(userKey, 'true');
                return;
            }

            // Auto launch ONLY ONCE on initial first login for newly created accounts
            sessionStorage.setItem(sessionKey, 'true');
            localStorage.setItem(userKey, 'true');
            markTutorialCompleteInDB();

            setTimeout(() => {
                startSystemTutorial(false);
            }, 400);
        } catch (err) {
            console.error('[Tutorial] Initialization error:', err);
        }
    }

    function createTutorialElements() {
        if (overlayEl) return;

        // Overlay canvas backdrop
        overlayEl = document.createElement('div');
        overlayEl.className = 'tutorial-overlay';
        document.body.appendChild(overlayEl);

        // Spotlight focus cutout ring
        spotlightEl = document.createElement('div');
        spotlightEl.className = 'tutorial-spotlight';
        document.body.appendChild(spotlightEl);

        // Tooltip Card
        cardEl = document.createElement('div');
        cardEl.className = 'tutorial-card';
        cardEl.innerHTML = `
            <div class="tutorial-card-header">
                <span class="tutorial-badge" id="tut-badge">Menu 1: Dashboard</span>
                <button class="tutorial-skip-btn" id="tut-skip-btn" title="Skip tutorial">Skip ✕</button>
            </div>
            <h3 class="tutorial-title" id="tut-title">Step Title</h3>
            <p class="tutorial-description" id="tut-desc">Step description text goes here.</p>
            <div class="tutorial-progress-bar">
                <div class="tutorial-progress-fill" id="tut-progress"></div>
            </div>
            <div class="tutorial-card-footer">
                <span class="tutorial-step-counter" id="tut-counter">Step 1 of 6</span>
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

        // Backdrop click to dismiss
        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) skipTutorial();
        });

        // Escape key to dismiss
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlayEl && overlayEl.classList.contains('active')) {
                skipTutorial();
            }
        });

        window.addEventListener('resize', handleReposition);
        window.addEventListener('scroll', handleReposition, { passive: true });
    }

    /**
     * Starts the interactive spotlight tutorial.
     * @param {boolean} force
     */
    function startSystemTutorial(force = false) {
        // Dismiss any open dropdowns or floating menus before tutorial starts
        const profileMenu = document.getElementById('profile-menu');
        if (profileMenu) profileMenu.style.display = 'none';
        const notifMenu = document.getElementById('notif-menu');
        if (notifMenu) notifMenu.style.display = 'none';
        const adminMenu = document.getElementById('admin-floating-menu');
        if (adminMenu) adminMenu.remove();

        activeTutorialSteps = getTutorialStepsForRole();
        createTutorialElements();
        currentStepIndex = 0;

        if (overlayEl) {
            overlayEl.style.display = 'block';
            overlayEl.classList.add('active');
        }
        if (cardEl) {
            cardEl.style.display = 'block';
            cardEl.style.opacity = '1';
            cardEl.style.visibility = 'visible';
            cardEl.style.pointerEvents = 'auto';
            cardEl.style.zIndex = '99999';
            cardEl.classList.add('active');
        }

        showStep(currentStepIndex);
    }

    function scrollTargetIntoViewIfNeeded(targetEl) {
        if (!targetEl) return;

        // If target is inside fixed header or sidebar bottom nav, no scrolling needed
        if (targetEl.closest('.sidebar') || targetEl.closest('.header') || targetEl.closest('header') || targetEl.closest('aside')) {
            return;
        }

        const isMobile = window.innerWidth <= 1024;
        const topHeaderHeight = isMobile ? 70 : 80;
        const bottomNavHeight = isMobile ? 75 : 0;
        const rect = targetEl.getBoundingClientRect();

        // Check if target is obscured by header, bottom nav, or outside viewport
        if (rect.top < topHeaderHeight + 10 || rect.bottom > window.innerHeight - bottomNavHeight - 10) {
            const targetScrollY = window.scrollY + rect.top - topHeaderHeight - 20;
            const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.scrollTo({
                top: Math.max(0, targetScrollY),
                behavior: prefersReducedMotion ? 'auto' : 'smooth'
            });
        }
    }

    function showStep(index) {
        if (!activeTutorialSteps || activeTutorialSteps.length === 0) {
            activeTutorialSteps = getTutorialStepsForRole();
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
            scrollTargetIntoViewIfNeeded(targetEl);
        }

        // Update Card Content
        const badgeEl = document.getElementById('tut-badge');
        const titleEl = document.getElementById('tut-title');
        const descEl = document.getElementById('tut-desc');

        if (badgeEl) badgeEl.textContent = step.badge;
        if (titleEl) titleEl.textContent = step.title;
        if (descEl) descEl.textContent = step.description;

        // Progress bar
        const total = activeTutorialSteps.length;
        const percent = Math.round(((index + 1) / total) * 100);
        const progressEl = document.getElementById('tut-progress');
        const counterEl = document.getElementById('tut-counter');

        if (progressEl) progressEl.style.width = `${percent}%`;
        if (counterEl) counterEl.textContent = `Step ${index + 1} of ${total}`;

        // Controls
        const prevBtn = document.getElementById('tut-prev-btn');
        const nextBtn = document.getElementById('tut-next-btn');

        if (prevBtn) prevBtn.disabled = index === 0;
        if (nextBtn) {
            if (index === total - 1) {
                nextBtn.innerHTML = 'Finish Tutorial 🎉';
            } else {
                nextBtn.innerHTML = 'Next →';
            }
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
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function positionTutorialElements(targetEl, preferredPos) {
        if (!targetEl) {
            // Center fallback if target element not found on current page
            if (spotlightEl) spotlightEl.style.display = 'none';
            if (overlayEl) overlayEl.classList.add('modal-fallback');
            cardEl.style.top = '50%';
            cardEl.style.left = '50%';
            cardEl.style.width = '';
            cardEl.style.transform = 'translate(-50%, -50%) scale(1)';
            return;
        }

        if (overlayEl) overlayEl.classList.remove('modal-fallback');
        if (spotlightEl) spotlightEl.style.display = 'block';

        const isMobile = window.innerWidth <= 1024;
        const rect = targetEl.getBoundingClientRect();
        const padding = isMobile ? 6 : 8;

        // Position glowing spotlight focus ring
        spotlightEl.style.top = `${Math.max(0, rect.top - padding)}px`;
        spotlightEl.style.left = `${Math.max(0, rect.left - padding)}px`;
        spotlightEl.style.width = `${Math.max(24, rect.width + padding * 2)}px`;
        spotlightEl.style.height = `${Math.max(24, rect.height + padding * 2)}px`;

        if (isMobile) {
            // Mobile-specific smart positioning
            const cardWidth = Math.min(400, window.innerWidth - 24);
            const cardHeight = cardEl.offsetHeight || 220;
            const margin = 12;
            const cardLeft = Math.max(margin, Math.round((window.innerWidth - cardWidth) / 2));

            const isBottomNav = targetEl.closest('.sidebar') !== null;
            const isHeader = targetEl.closest('.header') !== null || targetEl.closest('header') !== null;

            let cardTop;

            if (isBottomNav) {
                // Target is in bottom navigation -> card sits cleanly above bottom nav
                cardTop = rect.top - cardHeight - 12;
            } else if (isHeader) {
                // Target is in top header -> card sits cleanly below header
                cardTop = rect.bottom + 12;
            } else {
                // In-page content target -> place above or below depending on vertical position
                if (rect.top < window.innerHeight / 2) {
                    cardTop = rect.bottom + 12;
                } else {
                    cardTop = rect.top - cardHeight - 12;
                }
            }

            // Keep card strictly within usable mobile viewport
            const minTop = 68; // Below mobile header
            const maxTop = window.innerHeight - 74 - cardHeight; // Above mobile bottom nav

            if (maxTop >= minTop) {
                if (cardTop < minTop) cardTop = minTop;
                if (cardTop > maxTop) cardTop = maxTop;
            } else {
                // Extreme height constraints (landscape mobile e.g. < 400px height)
                cardTop = Math.max(8, (window.innerHeight - cardHeight) / 2);
            }

            cardEl.style.top = `${Math.round(cardTop)}px`;
            cardEl.style.left = `${cardLeft}px`;
            cardEl.style.width = `${cardWidth}px`;
            cardEl.style.transform = 'none';
        } else {
            // Desktop standard positioning (Preserves 100% of existing desktop behavior)
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
            cardEl.style.width = '';
            cardEl.style.transform = 'none';
            cardEl.style.opacity = '1';
            cardEl.style.visibility = 'visible';
            cardEl.style.pointerEvents = 'auto';
            cardEl.style.zIndex = '99999';
        }
    }

    function handleReposition() {
        if (!cardEl || !cardEl.classList.contains('active')) return;
        if (!activeTutorialSteps || activeTutorialSteps.length === 0) {
            activeTutorialSteps = getTutorialStepsForRole();
        }
        const step = activeTutorialSteps[currentStepIndex];
        const targetEl = findTargetElement(step ? step.selector : null);
        positionTutorialElements(targetEl, step ? step.position : 'right');
    }

    function nextStep() {
        if (!activeTutorialSteps || activeTutorialSteps.length === 0) {
            activeTutorialSteps = getTutorialStepsForRole();
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
        showToastNotification('Tutorial completed! You can re-watch it anytime from the profile menu.');
    }

    async function skipTutorial() {
        if (currentUserId) {
            localStorage.setItem('labsync_tut_done_' + currentUserId, 'true');
            sessionStorage.setItem('labsync_tut_session_' + currentUserId, 'true');
        }
        closeTutorialUI();
        await markTutorialCompleteInDB();
        showToastNotification('Tutorial skipped. Access it anytime from the profile menu.');
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

    // Export globally for manual trigger ("Watch System Tutorial")
    window.startFacultyTutorial = startSystemTutorial;
    window.startSystemTutorial = startSystemTutorial;

    // Run automatically on page load for newly registered accounts
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndInitTutorial);
    } else {
        checkAndInitTutorial();
    }
})();
