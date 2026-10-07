/**
 * LabSync – Client-Side Authentication & Authorization Guard | js/auth-check.js
 * Synchronously executes in <head> to enforce session validity and role access with zero UI flash.
 */

// 1. Synchronously apply saved accessibility theme settings before any visual paint
(function initAntiFlashTheme() {
    try {
        localStorage.removeItem('labsync-text-scale');
        document.documentElement.removeAttribute('data-text-scale');
        const savedContrast = localStorage.getItem('labsync-high-contrast') === 'true';
        if (savedContrast) {
            document.documentElement.classList.add('high-contrast');
        } else {
            document.documentElement.classList.remove('high-contrast');
        }

        // Synchronously check if cached user is OJT and tag root element before DOM paint
        const cachedUserStr = sessionStorage.getItem('labsync_user') || localStorage.getItem('user');
        if (cachedUserStr) {
            const rawUser = JSON.parse(cachedUserStr);
            const user = (rawUser && (rawUser.user || rawUser)) || null;
            const userRole = user && (user.role || user.Role);
            if (String(userRole || '').trim().toLowerCase() === 'ojt') {
                document.documentElement.classList.add('role-ojt');
            }
        }
    } catch (e) {
        // Guard against restricted localStorage
    }
})();

const OJT_ALLOWED_PAGES = new Set([
    'mis-staff-dashboard.html',
    'mis-maintenance.html'
]);

/**
 * Checks whether a given user role is permitted on the specified page.
 * @param {string} role
 * @param {string} page
 * @returns {boolean}
 */
function isPageAuthorized(role, page) {
    if (!role) return false;
    const cleanRole = String(role).trim();
    const isDeptAdmin = cleanRole.toLowerCase().includes('head') || cleanRole === 'Program Coordinator';
    const isMisPage = page.startsWith('mis-');
    const isItHeadPage = page.startsWith('it-head-') ||
        page === 'master-schedule.html' ||
        page === 'room-schedule-editor.html' ||
        page === 'faculty-management.html' ||
        page === 'print-all-schedules.html' ||
        page === 'print-schedule.html';
    const isFacultyPage = page === 'index.html' ||
        page === 'room-status.html' ||
        page === 'faculty-pc-reports.html' ||
        page === 'my-schedule.html';

    if (isDeptAdmin) {
        return isItHeadPage;
    } else if (cleanRole === 'MIS Staff') {
        return isMisPage;
    } else if (cleanRole === 'OJT') {
        return OJT_ALLOWED_PAGES.has(page);
    } else {
        return isFacultyPage;
    }
}

/**
 * Returns the appropriate dashboard/page URL for the given role and current page context.
 * @param {string} role
 * @param {string} page
 * @returns {string}
 */
function getAuthorizedRedirect(role, page) {
    const normRole = String(role || '').trim().toLowerCase();
    const isDeptAdmin = normRole.includes('head') || normRole === 'program coordinator';
    if (isDeptAdmin) {
        if (page === 'room-status.html') return '/it-head-room-status.html';
        if (page === 'faculty-pc-reports.html') return '/it-head-pc-reports.html';
        if (page === 'my-schedule.html') return '/it-head-my-schedule.html';
        return '/it-head-dashboard.html';
    } else if (normRole === 'mis staff' || normRole === 'mis' || normRole === 'ojt') {
        return '/mis-staff-dashboard.html';
    } else {
        if (page === 'it-head-room-status.html') return '/room-status.html';
        if (page === 'it-head-pc-reports.html') return '/faculty-pc-reports.html';
        if (page === 'it-head-my-schedule.html') return '/my-schedule.html';
        return '/index.html';
    }
}

/**
 * Reveals the protected page content once authentication is confirmed.
 */
function revealPage() {
    const antiFlash = document.getElementById('auth-anti-flash');
    if (antiFlash) antiFlash.remove();
}

// 2. Synchronous Anti-Flash Guard: Hides protected content immediately if unauthenticated
(function initAntiFlashGuard() {
    const path = window.location.pathname;
    let page = path.substring(path.lastIndexOf('/') + 1);
    if (!page || page === '/') page = 'index.html';

    const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
    const timeout = (typeof window !== 'undefined' && window.__LABSYNC_SESSION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

    try {
        const lastActivityStr = localStorage.getItem('labsync_last_activity');
        if (lastActivityStr) {
            const lastActivity = parseInt(lastActivityStr, 10);
            if (!isNaN(lastActivity) && (Date.now() - lastActivity >= timeout)) {
                localStorage.removeItem('user');
                localStorage.removeItem('labsync_last_activity');
                localStorage.setItem('labsync_session_expired', Date.now().toString());
                sessionStorage.clear();
                window.location.replace('/login.html?reason=inactivity');
                return;
            }
        }
    } catch (e) { }

    let isPreAuthorized = false;
    try {
        const cachedUserStr = sessionStorage.getItem('labsync_user') || localStorage.getItem('user');
        if (cachedUserStr) {
            const rawUser = JSON.parse(cachedUserStr);
            const user = (rawUser && (rawUser.user || rawUser)) || {};
            const role = user.role || '';
            if (role && isPageAuthorized(role, page)) {
                isPreAuthorized = true;
            }
        }
    } catch (e) { }

    // If no valid cached session for this page, hide the document immediately before rendering
    if (!isPreAuthorized) {
        let style = document.getElementById('auth-anti-flash');
        if (!style) {
            style = document.createElement('style');
            style.id = 'auth-anti-flash';
            style.textContent = 'html { visibility: hidden !important; opacity: 0 !important; }';
            (document.head || document.documentElement).appendChild(style);
        }
    }
})();

// 3. Synchronously pre-hydrate user profile, clock, date, and greeting from session cache
(function initInstantPreHydration() {
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    function pad(n) { return String(n).padStart(2, '0'); }

    let _isHydrating = false;

    function hydrate() {
        if (_isHydrating) return;
        _isHydrating = true;
        try {
            const now = new Date();
            let h = now.getHours();
            const m = now.getMinutes();
            const s = now.getSeconds();
            const ampm = h >= 12 ? 'PM' : 'AM';
            const formattedH = h % 12 || 12;

            const clockTimeEl = document.getElementById('clockTime');
            if (clockTimeEl && clockTimeEl.textContent !== `${pad(formattedH)}:${pad(m)}:${pad(s)} ${ampm}`) {
                clockTimeEl.textContent = `${pad(formattedH)}:${pad(m)}:${pad(s)} ${ampm}`;
            }

            const clockDateEl = document.getElementById('clockDate');
            const expectedDate = `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
            if (clockDateEl && clockDateEl.textContent !== expectedDate) {
                clockDateEl.textContent = expectedDate;
            }

            const hasUnread = sessionStorage.getItem('labsync_has_unread_notifs') === 'true';
            const notifDot = document.querySelector('.notif-dot');
            if (notifDot) {
                const expectedDisp = hasUnread ? 'block' : 'none';
                if (notifDot.style.display !== expectedDisp) {
                    notifDot.style.display = expectedDisp;
                }
            }

            const cachedUserStr = sessionStorage.getItem('labsync_user') || localStorage.getItem('user');
            if (cachedUserStr) {
                const rawUser = JSON.parse(cachedUserStr);
                const user = (rawUser && (rawUser.user || rawUser)) || null;
                if (user) {
                    const profileNameEl = document.querySelector('.profile-name');
                    if (profileNameEl && user.name && profileNameEl.textContent !== user.name) {
                        profileNameEl.textContent = user.name;
                    }

                    const profileRoleEl = document.querySelector('.profile-role');
                    if (profileRoleEl && user.role && profileRoleEl.textContent !== user.role) {
                        profileRoleEl.textContent = user.role;
                    }

                    const avatarEl = document.querySelector('.avatar');
                    if (avatarEl && !avatarEl.dataset.hydrated) {
                        const isSafePhoto = typeof user.profilePhoto === 'string' &&
                            (typeof window.isValidProfilePhotoUrl === 'function'
                                ? window.isValidProfilePhotoUrl(user.profilePhoto)
                                : /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(user.profilePhoto.trim()));

                        if (isSafePhoto) {
                            avatarEl.innerHTML = '';
                            const img = document.createElement('img');
                            img.src = user.profilePhoto;
                            img.alt = 'Profile Photo';
                            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
                            avatarEl.appendChild(img);
                            avatarEl.dataset.hydrated = 'true';
                        } else if (user.name) {
                            const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
                            avatarEl.textContent = initials;
                            avatarEl.dataset.hydrated = 'true';
                        }
                    }

                    const pageType = document.body ? document.body.dataset.page : '';
                    const isDashboard = pageType === 'dashboard' || pageType === 'it-head-dashboard' || pageType === 'mis-dashboard';
                    if (isDashboard) {
                        const greetingTextEl = document.getElementById('greetingText');
                        if (greetingTextEl) {
                            const greet = h < 12 ? 'Good Morning' : (h < 18 ? 'Good Afternoon' : 'Good Evening');
                            const firstName = (user.name && user.name.trim()) ? user.name.split(/\s+/)[0] : 'User';
                            const expectedGreeting = `${greet}, ${firstName}!`;
                            if (greetingTextEl.textContent !== expectedGreeting) {
                                greetingTextEl.textContent = expectedGreeting;
                            }
                        }
                    }

                    const userRole = (user && (user.role || user.Role)) || '';
                    if (String(userRole).trim().toLowerCase() === 'ojt') {
                        applyRoleNavigation(userRole);
                    }
                }
            }
        } catch (e) {
        } finally {
            _isHydrating = false;
        }
    }

    if (document.readyState === 'loading') {
        const observer = new MutationObserver(() => {
            hydrate();
            const avatarEl = document.querySelector('.avatar');
            if (avatarEl && avatarEl.dataset.hydrated) {
                observer.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener('DOMContentLoaded', () => {
            observer.disconnect();
            hydrate();
        });
        hydrate();
    } else {
        hydrate();
    }
})();

/**
 * Hides administrative and restricted navigation buttons for OJT users across both desktop and mobile views.
 * @param {string} role
 */
function applyRoleNavigation(role) {
    const cleanRole = String(role || '').trim().toLowerCase();
    if (cleanRole === 'ojt') {
        document.documentElement.classList.add('role-ojt');
        if (document.body) document.body.classList.add('role-ojt');
        document.querySelectorAll(
            '.sidebar-btn[onclick*="mis-keys.html"], ' +
            '.sidebar-btn[onclick*="mis-qr-generator.html"], ' +
            '.sidebar-btn[onclick*="mis-ojt.html"], ' +
            '.sidebar-btn[data-tooltip*="Key Management"], ' +
            '.sidebar-btn[title*="Key Management"], ' +
            '.sidebar-btn[data-tooltip*="PC & QR"], ' +
            '.sidebar-btn[title*="PC & QR"], ' +
            '.sidebar-btn[data-tooltip*="OJT"], ' +
            '.sidebar-btn[title*="OJT"], ' +
            '.sidebar-btn[aria-label*="Key Management"], ' +
            '.sidebar-btn[aria-label*="PC & QR"], ' +
            '.sidebar-btn[aria-label*="OJT"]'
        ).forEach(btn => {
            btn.style.setProperty('display', 'none', 'important');
            btn.setAttribute('hidden', '');
            btn.classList.add('hidden');
        });
    }
}

// 4. Asynchronous Authentication & Role Authorization Check
(async function checkAuth() {
    const path = window.location.pathname;
    let page = path.substring(path.lastIndexOf('/') + 1);
    if (!page || page === '/') page = 'index.html';

    try {
        const response = await fetch('/api/user/current', {
            credentials: 'include'
        });

        if (!response.ok) {
            let reason = '';
            let isExpired = false;
            try {
                const data = await response.json();
                if (data && data.code === 'ACCOUNT_DEACTIVATED') {
                    reason = 'deactivated';
                } else if (data && (data.code === 'OJT_EXPIRED' || (data.error && data.error.includes('internship period has concluded')))) {
                    reason = 'ojt_expired';
                } else if (data && (data.code === 'SESSION_EXPIRED' || (data.error && data.error.includes('expired')))) {
                    isExpired = true;
                    reason = 'inactivity';
                }
            } catch (e) {}

            try {
                sessionStorage.removeItem('labsync_user');
                localStorage.removeItem('user');
                localStorage.removeItem('labsync_last_activity');
                if (isExpired) {
                    localStorage.setItem('labsync_session_expired', Date.now().toString());
                }
            } catch (e) { }
            window.location.replace(reason ? `/login.html?reason=${encodeURIComponent(reason)}` : '/login.html');
            return;
        }

        const rawData = await response.json();
        const user = (rawData && (rawData.user || rawData)) || {};
        try {
            sessionStorage.setItem('labsync_user', JSON.stringify(user));
            localStorage.setItem('user', JSON.stringify(user));
        } catch (e) { }
        const role = user.role || user.Role || '';
        const normRole = String(role).trim().toLowerCase();

        if (!isPageAuthorized(role, page)) {
            const redirectUrl = getAuthorizedRedirect(role, page);
            window.location.replace(redirectUrl);
            return;
        }

        applyRoleNavigation(role);

        // Successfully authorized - reveal protected page and initialize activity timestamp
        try {
            if (!localStorage.getItem('labsync_last_activity')) {
                localStorage.setItem('labsync_last_activity', Date.now().toString());
            }
        } catch (e) {}
        revealPage();

        // Start live role watcher for real-time role changes
        startLiveRoleWatcher();
    } catch (error) {
        console.error('Auth check failed:', error);
        // Fallback: if session was cached, reveal; otherwise redirect to login
        const cachedUserStr = sessionStorage.getItem('labsync_user') || localStorage.getItem('user');
        if (cachedUserStr) {
            revealPage();
            startLiveRoleWatcher();
        } else {
            window.location.replace('/login.html');
        }
    }
})();

// 5. Live Role Synchronization Watcher
let _isRoleChecking = false;

async function checkLiveRoleChange() {
    if (_isRoleChecking) return;
    _isRoleChecking = true;

    try {
        const response = await fetch('/api/user/current', {
            credentials: 'include',
            headers: { 'X-Background-Poll': 'true' }
        });

        if (!response.ok) {
            let reason = '';
            let isExpired = false;
            try {
                const data = await response.json();
                if (data && data.code === 'ACCOUNT_DEACTIVATED') {
                    reason = 'deactivated';
                } else if (data && (data.code === 'OJT_EXPIRED' || (data.error && data.error.includes('internship period has concluded')))) {
                    reason = 'ojt_expired';
                } else if (data && (data.code === 'SESSION_EXPIRED' || (data.error && data.error.includes('expired')))) {
                    isExpired = true;
                    reason = 'inactivity';
                }
            } catch (e) {}

            try {
                sessionStorage.removeItem('labsync_user');
                localStorage.removeItem('user');
                localStorage.removeItem('labsync_last_activity');
                if (isExpired) {
                    localStorage.setItem('labsync_session_expired', Date.now().toString());
                }
            } catch (e) {}

            window.location.replace(reason ? `/login.html?reason=${encodeURIComponent(reason)}` : '/login.html');
            return;
        }

        const rawData = await response.json();
        const user = (rawData && (rawData.user || rawData)) || {};
        const newRole = user.role || user.Role || '';
        if (!newRole) return;

        // Retrieve previously cached role
        let oldRole = '';
        try {
            const cachedStr = sessionStorage.getItem('labsync_user') || localStorage.getItem('user');
            if (cachedStr) {
                const cached = JSON.parse(cachedStr);
                const cu = (cached && (cached.user || cached)) || {};
                oldRole = cu.role || cu.Role || '';
            }
        } catch (e) {}

        const path = window.location.pathname;
        let page = path.substring(path.lastIndexOf('/') + 1);
        if (!page || page === '/') page = 'index.html';

        const normNew = String(newRole).trim().toLowerCase();
        const normOld = String(oldRole).trim().toLowerCase();

        // Update local session caches with fresh user data
        try {
            sessionStorage.setItem('labsync_user', JSON.stringify(user));
            localStorage.setItem('user', JSON.stringify(user));
        } catch (e) {}

        // If role changed or current page is no longer authorized for new role, redirect
        const roleChanged = Boolean(oldRole && (normNew !== normOld));
        const unauthorized = !isPageAuthorized(newRole, page);

        if (unauthorized || roleChanged) {
            const target = getAuthorizedRedirect(newRole, page);
            const currentNormPath = (path.startsWith('/') ? path : `/${path}`).toLowerCase();
            const targetNormPath = (target.startsWith('/') ? target : `/${target}`).toLowerCase();

            if (currentNormPath !== targetNormPath && !currentNormPath.endsWith(targetNormPath)) {
                window.location.replace(target);
                return;
            }
        }

        // If on authorized page, keep DOM role and name labels in sync
        const profileRoleEl = document.querySelector('.profile-role');
        if (profileRoleEl && user.role && profileRoleEl.textContent !== user.role) {
            profileRoleEl.textContent = user.role;
        }
        const profileNameEl = document.querySelector('.profile-name');
        if (profileNameEl && user.name && profileNameEl.textContent !== user.name) {
            profileNameEl.textContent = user.name;
        }

        applyRoleNavigation(newRole);
    } catch (e) {
        // Network blip, will retry on next poll interval
    } finally {
        _isRoleChecking = false;
    }
}

function startLiveRoleWatcher() {
    if (typeof window === 'undefined' || window.__labsync_role_watcher_started) return;
    window.__labsync_role_watcher_started = true;

    // Check periodically every 3 seconds
    setInterval(checkLiveRoleChange, 3000);

    // Check on window focus and visibility changes (user returns to tab)
    window.addEventListener('focus', checkLiveRoleChange);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkLiveRoleChange();
        }
    });

    // Cross-tab broadcast listener
    window.addEventListener('storage', (e) => {
        if (e.key === 'labsync_role_updated' || e.key === 'user' || e.key === 'labsync_user') {
            checkLiveRoleChange();
        }
    });
}
