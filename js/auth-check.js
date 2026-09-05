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
    } catch (e) {
        // Guard against restricted localStorage
    }
})();

/**
 * Checks whether a given user role is permitted on the specified page.
 * @param {string} role
 * @param {string} page
 * @returns {boolean}
 */
function isPageAuthorized(role, page) {
    if (!role) return false;
    const cleanRole = String(role).trim();
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

    if (cleanRole.toLowerCase().includes('head')) {
        return isItHeadPage || isFacultyPage;
    } else if (cleanRole === 'MIS Staff') {
        return isMisPage;
    } else {
        return isFacultyPage;
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
                        if (user.profilePhoto) {
                            avatarEl.innerHTML = `<img src="${user.profilePhoto}" alt="Profile Photo" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
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
                            const firstName = (user.name && user.name.trim()) ? (user.name.startsWith('MIS ') || user.role === 'MIS Staff' ? 'MIS Staff' : user.name.split(/\s+/)[0]) : 'User';
                            const expectedGreeting = `${greet}, ${firstName}!`;
                            if (greetingTextEl.textContent !== expectedGreeting) {
                                greetingTextEl.textContent = expectedGreeting;
                            }
                        }
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
            let isExpired = false;
            try {
                const data = await response.json();
                if (data && (data.code === 'SESSION_EXPIRED' || (data.error && data.error.includes('expired')))) {
                    isExpired = true;
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
            window.location.replace(isExpired ? '/login.html?reason=inactivity' : '/login.html');
            return;
        }

        const rawData = await response.json();
        const user = (rawData && (rawData.user || rawData)) || {};
        try { sessionStorage.setItem('labsync_user', JSON.stringify(user)); } catch (e) { }
        const role = user.role || '';

        if (!isPageAuthorized(role, page)) {
            if (role.toLowerCase().includes('head')) {
                window.location.replace('/it-head-dashboard.html');
            } else if (role === 'MIS Staff') {
                window.location.replace('/mis-staff-dashboard.html');
            } else {
                window.location.replace('/index.html');
            }
            return;
        }

        // Successfully authorized - reveal protected page and initialize activity timestamp
        try {
            if (!localStorage.getItem('labsync_last_activity')) {
                localStorage.setItem('labsync_last_activity', Date.now().toString());
            }
        } catch (e) {}
        revealPage();
    } catch (error) {
        console.error('Auth check failed:', error);
        // Fallback: if session was cached, reveal; otherwise redirect to login
        const cachedUserStr = sessionStorage.getItem('labsync_user') || localStorage.getItem('user');
        if (cachedUserStr) {
            revealPage();
        } else {
            window.location.replace('/login.html');
        }
    }
})();
