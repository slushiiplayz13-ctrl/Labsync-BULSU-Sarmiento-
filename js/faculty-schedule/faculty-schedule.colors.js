/**
 * LabSync Faculty Schedule Colors | js/faculty-schedule/faculty-schedule.colors.js
 * Manages deterministic palette assignment and distinct color mapping for subject cards and legend dots.
 */

(function (global) {
  'use strict';

  // Curated, rich, high-contrast palette with gradient backgrounds and luminous indicator dots
  const SUBJECT_COLOR_PALETTES = [
    { name: 'blue', class: 'subject-webdev', dot: '#3B82F6', bg: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)', color: '#EFF6FF' },
    { name: 'emerald', class: 'subject-prog', dot: '#10B981', bg: 'linear-gradient(135deg, #047857 0%, #064E3B 100%)', color: '#ECFDF5' },
    { name: 'purple', class: 'subject-capstone', dot: '#A855F7', bg: 'linear-gradient(135deg, #7E22CE 0%, #581C87 100%)', color: '#FAF5FF' },
    { name: 'amber', class: 'subject-intro', dot: '#F59E0B', bg: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)', color: '#FEF3C7' },
    { name: 'cyan', class: 'subject-network', dot: '#06B6D4', bg: 'linear-gradient(135deg, #0E7490 0%, #155E75 100%)', color: '#E0F2FE' },
    { name: 'rose', class: 'subject-rose', dot: '#F43F5E', bg: 'linear-gradient(135deg, #BE123C 0%, #881337 100%)', color: '#FFE4E6' },
    { name: 'indigo', class: 'subject-indigo', dot: '#6366F1', bg: 'linear-gradient(135deg, #4338CA 0%, #312E81 100%)', color: '#E0E7FF' },
    { name: 'orange', class: 'subject-orange', dot: '#EA580C', bg: 'linear-gradient(135deg, #C2410C 0%, #7C2D12 100%)', color: '#FFEDD5' },
    { name: 'teal', class: 'subject-teal', dot: '#14B8A6', bg: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)', color: '#CCFBF1' },
    { name: 'fuchsia', class: 'subject-fuchsia', dot: '#D946EF', bg: 'linear-gradient(135deg, #A21CAF 0%, #701A75 100%)', color: '#FAE8FF' },
    { name: 'sky', class: 'subject-sky', dot: '#0EA5E9', bg: 'linear-gradient(135deg, #0369A1 0%, #075985 100%)', color: '#E0F2FE' },
    { name: 'crimson', class: 'subject-crimson', dot: '#E11D48', bg: 'linear-gradient(135deg, #9F1239 0%, #4C0519 100%)', color: '#FFE4E6' },
    { name: 'lime', class: 'subject-lime', dot: '#84CC16', bg: 'linear-gradient(135deg, #4D7C0F 0%, #365314 100%)', color: '#ECFCCB' },
    { name: 'violet', class: 'subject-violet', dot: '#8B5CF6', bg: 'linear-gradient(135deg, #6D28D9 0%, #4C1D95 100%)', color: '#EDE9FE' },
    { name: 'bronze', class: 'subject-bronze', dot: '#D97706', bg: 'linear-gradient(135deg, #92400E 0%, #451A03 100%)', color: '#FEF3C7' },
    { name: 'slate', class: 'subject-slate', dot: '#64748B', bg: 'linear-gradient(135deg, #334155 0%, #1E293B 100%)', color: '#F1F5F9' }
  ];

  /**
   * Normalizes a subject name for consistent identity matching.
   * @param {string} name
   * @returns {string}
   */
  function normalizeSubjectName(name) {
    if (!name) return 'General Subject';
    return String(name).trim().replace(/\s+/g, ' ');
  }

  /**
   * Builds a map of subject name to curated color palette.
   * Ensures distinct subjects receive different colors deterministically.
   * @param {Array} schedules - List of schedule objects
   * @returns {Map<string, Object>}
   */
  function buildSubjectColorMap(schedules) {
    const palettes = (global.SUBJECT_COLOR_PALETTES && global.SUBJECT_COLOR_PALETTES.length)
      ? global.SUBJECT_COLOR_PALETTES
      : SUBJECT_COLOR_PALETTES;

    // 1. Collect and deduplicate unique subject names
    const uniqueSubjectMap = new Map(); // normalizedKey -> canonicalName
    (schedules || []).forEach(s => {
      const rawName = s && s.Subject_Name ? s.Subject_Name : 'General Subject';
      const cleanName = normalizeSubjectName(rawName);
      const key = cleanName.toLowerCase();
      if (!uniqueSubjectMap.has(key)) {
        uniqueSubjectMap.set(key, cleanName);
      }
    });

    // 2. Sort distinct subject names deterministically for stable palette assignment
    const sortedCanonicalSubjects = Array.from(uniqueSubjectMap.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
    );

    // 3. Construct Subject Map with enhanced case-insensitive lookup
    const subjectMap = new Map();
    const normalizedLookup = new Map();

    sortedCanonicalSubjects.forEach((subjName, index) => {
      const palette = palettes[index % palettes.length];
      subjectMap.set(subjName, palette);
      normalizedLookup.set(normalizeSubjectName(subjName).toLowerCase(), palette);
    });

    // Wrap subjectMap.get to transparently support raw un-trimmed / case variations
    const nativeGet = subjectMap.get.bind(subjectMap);
    subjectMap.get = function (key) {
      if (!key) return nativeGet(key) || palettes[0];
      if (subjectMap.has(key)) return nativeGet(key);
      const cleanKey = normalizeSubjectName(key).toLowerCase();
      if (normalizedLookup.has(cleanKey)) return normalizedLookup.get(cleanKey);
      return nativeGet(key) || palettes[0];
    };

    return subjectMap;
  }

  const facultyScheduleColors = {
    SUBJECT_COLOR_PALETTES,
    normalizeSubjectName,
    buildSubjectColorMap
  };

  global.facultyScheduleColors = facultyScheduleColors;
  global.SUBJECT_COLOR_PALETTES = SUBJECT_COLOR_PALETTES;

})(typeof window !== 'undefined' ? window : this);
