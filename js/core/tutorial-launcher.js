/**
 * LabSync – Tutorial Launcher Bridge | js/core/tutorial-launcher.js
 * Extracted in Phase 1 (Frontend Architectural Refactor)
 */

(function (global) {
  'use strict';

  /**
   * Dynamically loads and launches the interactive system tutorial.
   * @param {boolean} force - Whether to force display regardless of completed flag
   */
  function launchTutorial(force = true) {
    if (typeof global.startFacultyTutorial === 'function' && global.startFacultyTutorial !== launcherBridge) {
      return global.startFacultyTutorial(force);
    }
    if (typeof global.startSystemTutorial === 'function' && global.startSystemTutorial !== launcherBridge) {
      return global.startSystemTutorial(force);
    }

    const existing = document.querySelector('script[src*="tutorial.js"]');
    if (existing) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (typeof global.startFacultyTutorial === 'function' && global.startFacultyTutorial !== launcherBridge) {
          clearInterval(interval);
          global.startFacultyTutorial(force);
        } else if (typeof global.startSystemTutorial === 'function' && global.startSystemTutorial !== launcherBridge) {
          clearInterval(interval);
          global.startSystemTutorial(force);
        } else if (attempts >= 30) {
          clearInterval(interval);
          console.warn('[Tutorial Launcher] tutorial.js could not be initialized.');
        }
      }, 50);
      return;
    }

    const s = document.createElement('script');
    s.src = 'js/tutorial.js';
    s.onload = () => {
      if (typeof global.startFacultyTutorial === 'function' && global.startFacultyTutorial !== launcherBridge) {
        global.startFacultyTutorial(force);
      } else if (typeof global.startSystemTutorial === 'function' && global.startSystemTutorial !== launcherBridge) {
        global.startSystemTutorial(force);
      }
    };
    document.body.appendChild(s);
  }

  function launcherBridge(force = true) {
    launchTutorial(force);
  }

  // Preserve global contracts for legacy scripts and HTML callers
  if (typeof global.startSystemTutorial !== 'function' || global.startSystemTutorial === launcherBridge) {
    global.startSystemTutorial = launcherBridge;
  }
  if (typeof global.startFacultyTutorial !== 'function' || global.startFacultyTutorial === launcherBridge) {
    global.startFacultyTutorial = launcherBridge;
  }

})(typeof window !== 'undefined' ? window : this);
