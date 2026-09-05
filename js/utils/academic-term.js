/**
 * LabSync – Academic Term & Calendar Intelligence Utility | js/utils/academic-term.js
 * Automatically detects the current Academic Year and Semester based on the campus calendar
 * while supporting session-persisted manual overrides across schedule views.
 *
 * Campus Calendar Rules:
 * - 1st Semester: June to October (Months 5 to 9, 0-indexed)
 * - 2nd Semester: November to April (Months 10, 11, and 0 to 3)
 * - Summer: May (Month 4)
 *
 * Academic Year Rules:
 * - June to December: currentYear - (currentYear + 1) [e.g. Sep 2026 -> 2026-2027]
 * - January to May:   (currentYear - 1) - currentYear [e.g. Feb 2027 -> 2026-2027]
 */

(function (global) {
  'use strict';

  const SEMESTER_1 = '1st Semester';
  const SEMESTER_2 = '2nd Semester';
  const SEMESTER_SUMMER = 'Summer';

  const AcademicTerm = {
    SEMESTER_1,
    SEMESTER_2,
    SEMESTER_SUMMER,

    /**
     * Determines the active Semester based on the provided date (defaults to today).
     * @param {Date} [date=new Date()]
     * @returns {string} '1st Semester' | '2nd Semester' | 'Summer'
     */
    getCurrentSemester(date = new Date()) {
      const month = date.getMonth(); // 0 = Jan, 1 = Feb, ..., 11 = Dec

      // June (5) through October (9) -> 1st Semester
      if (month >= 5 && month <= 9) {
        return SEMESTER_1;
      }

      // May (4) -> Summer / Midyear
      if (month === 4) {
        return SEMESTER_SUMMER;
      }

      // November (10), December (11), January (0) through April (3) -> 2nd Semester
      return SEMESTER_2;
    },

    /**
     * Determines the active Academic Year based on the June cutoff.
     * @param {Date} [date=new Date()]
     * @returns {string} e.g. "2026-2027"
     */
    getCurrentAcademicYear(date = new Date()) {
      const year = date.getFullYear();
      const month = date.getMonth();

      // June through December belongs to year-(year+1)
      if (month >= 5) {
        return `${year}-${year + 1}`;
      }

      // January through May still belongs to the previous calendar year's cycle (year-1)-year
      return `${year - 1}-${year}`;
    },

    /**
     * Returns the live active term object based on current calendar date.
     * @param {Date} [date=new Date()]
     * @returns {{ academicYear: string, semester: string }}
     */
    getActiveTerm(date = new Date()) {
      return {
        academicYear: this.getCurrentAcademicYear(date),
        semester: this.getCurrentSemester(date)
      };
    },

    /**
     * Generates a list of Academic Year ranges for select dropdowns starting from the active year.
     * @param {string} [baseAY] - e.g. "2026-2027"
     * @param {number} [pastCount=0] - Number of previous AYs to include (default 0: no older years)
     * @param {number} [futureCount=5] - Number of future AYs to include
     * @returns {string[]} e.g. ["2026-2027", "2027-2028", "2028-2029", ...]
     */
    getAvailableAcademicYears(baseAY, pastCount = 0, futureCount = 5) {
      let startYear;
      if (baseAY && /^\d{4}-\d{4}$/.test(baseAY)) {
        startYear = parseInt(baseAY.split('-')[0], 10);
      } else {
        const activeAY = this.getCurrentAcademicYear();
        startYear = parseInt(activeAY.split('-')[0], 10);
      }

      const years = [];
      for (let y = startYear - pastCount; y <= startYear + futureCount; y++) {
        years.push(`${y}-${y + 1}`);
      }
      return years;
    },

    /**
     * Retrieves the term for a specific page or feature.
     * Checks sessionStorage first for user manual override; falls back to live active term.
     * @param {string} [pageKey='default']
     * @returns {{ academicYear: string, semester: string, isOverridden: boolean }}
     */
    getSelectedTerm(pageKey = 'default') {
      const active = this.getActiveTerm();
      try {
        const storageKey = `labsync_term_${pageKey}`;
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.academicYear && parsed.semester) {
            return {
              academicYear: parsed.academicYear,
              semester: parsed.semester,
              isOverridden: true
            };
          }
        }
      } catch (e) {
        // Fall back to active on storage error
      }

      return {
        academicYear: active.academicYear,
        semester: active.semester,
        isOverridden: false
      };
    },

    /**
     * Saves user manual selection for the session so browsing persists without resetting on page switch.
     * @param {string} pageKey
     * @param {string} academicYear
     * @param {string} semester
     */
    setSelectedTerm(pageKey = 'default', academicYear, semester) {
      if (!academicYear || !semester) return;
      try {
        const storageKey = `labsync_term_${pageKey}`;
        sessionStorage.setItem(storageKey, JSON.stringify({ academicYear, semester }));
      } catch (e) {}
    },

    /**
     * Clears user manual selection to return to the active calendar term.
     * @param {string} [pageKey='default']
     */
    resetTerm(pageKey = 'default') {
      try {
        sessionStorage.removeItem(`labsync_term_${pageKey}`);
      } catch (e) {}
    }
  };

  global.AcademicTerm = AcademicTerm;

  // Node.js module export for testing/server usage
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AcademicTerm;
  }
})(typeof window !== 'undefined' ? window : global);
