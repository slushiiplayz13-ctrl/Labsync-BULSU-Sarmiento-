// Authentication & Role Authorization Check - Include this script in all protected pages
(async function checkAuth() {
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
        const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';

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
            if (isItHeadPage) {
                authorized = true;
            } else {
                // IT Head on wrong page, redirect to their dashboard
                window.location.replace('/it-head-dashboard.html');
                return;
            }
        } else if (role === 'MIS Staff') {
            if (isMisPage) {
                authorized = true;
            } else {
                // MIS Staff on wrong page, redirect to their dashboard
                window.location.replace('/mis-staff-dashboard.html');
                return;
            }
        } else {
            // Default: Faculty / other users
            if (isFacultyPage) {
                authorized = true;
            } else {
                // Faculty on wrong page, redirect to their dashboard
                window.location.replace('/index.html');
                return;
            }
        }

        if (authorized) {
            // Authenticated and authorized, reveal the page content
            const antiFlash = document.getElementById('auth-anti-flash');
            if (antiFlash) antiFlash.remove();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.replace('/login.html');
    }
})();
