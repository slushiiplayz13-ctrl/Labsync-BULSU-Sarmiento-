// Authentication & Role Authorization Check - Include this script in all protected pages
(async function checkAuth() {
    function revealPage() {
        const antiFlash = document.getElementById('auth-anti-flash');
        if (antiFlash) antiFlash.remove();
    }

    // Safety fallback: reveal page after 1.5s max to prevent permanent blank blue screen
    const safetyTimer = setTimeout(revealPage, 1500);

    try {
        const response = await fetch('/api/user/current', {
            credentials: 'include'
        });

        if (!response.ok) {
            // Not authenticated, redirect to login
            window.location.replace('/login.html');
            return;
        }

        const user = await response.json();
        const role = user.role || '';
        const path = window.location.pathname;
        let page = path.substring(path.lastIndexOf('/') + 1);
        if (!page || page === '/') page = 'index.html';

        // Categorize the current page
        const isMisPage = page.startsWith('mis-');
        const isItHeadPage = page.startsWith('it-head-') ||
            page === 'master-schedule.html' ||
            page === 'room-schedule-editor.html' ||
            page === 'faculty-management.html' ||
            page === 'print-all-schedules.html' ||
            page === 'print-schedule.html';
        const isFacultyPage = page === 'index.html' ||
            page === 'room-status.html' ||
            page === 'pc-reports.html' ||
            page === 'my-schedule.html';

        let authorized = false;

        if (role.toLowerCase().includes('head')) {
            if (isItHeadPage || isFacultyPage) {
                authorized = true;
            } else {
                window.location.replace('/it-head-dashboard.html');
                return;
            }
        } else if (role === 'MIS Staff') {
            if (isMisPage) {
                authorized = true;
            } else {
                window.location.replace('/mis-staff-dashboard.html');
                return;
            }
        } else {
            if (isFacultyPage) {
                authorized = true;
            } else {
                window.location.replace('/index.html');
                return;
            }
        }

        if (authorized) {
            clearTimeout(safetyTimer);
            revealPage();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        clearTimeout(safetyTimer);
        revealPage();
    }
})();
