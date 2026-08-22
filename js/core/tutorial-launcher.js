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
  function startSystemTutorial(force = true) {
    if (typeof global.startFacultyTutorial === 'function' && global.startFacultyTutorial !== startSystemTutorial) {
      global.startFacultyTutorial(force);
    } else {
      const existing = document.querySelector('script[src*="tutorial.js"]');
      if (existing) {
        if (typeof global.startFacultyTutorial === 'function' && global.startFacultyTutorial !== startSystemTutorial) {
          global.startFacultyTutorial(force);
        }
      } else {
        const s = document.createElement('script');
        s.src = 'js/tutorial.js';
        s.onload = () => {
          if (typeof global.startFacultyTutorial === 'function' && global.startFacultyTutorial !== startSystemTutorial) {
            global.startFacultyTutorial(force);
          }
        };
        document.body.appendChild(s);
      }
    }
  }

  // Preserve global contracts for legacy scripts and HTML callers
  global.startSystemTutorial = startSystemTutorial;
  global.startFacultyTutorial = global.startFacultyTutorial || startSystemTutorial;

})(typeof window !== 'undefined' ? window : this);
