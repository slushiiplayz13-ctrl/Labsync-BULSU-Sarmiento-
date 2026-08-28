/**
 * LabSync Faculty Schedule Colors | js/faculty-schedule/faculty-schedule.colors.js
 * Manages dynamic palette assignment and color mapping for subject cards and legend dots.
 */

(function (global) {
  'use strict';

  const SUBJECT_COLOR_PALETTES = [
    { name: 'blue', class: 'subject-webdev', dot: '#3B82F6', bg: 'linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 100%)', color: '#EFF6FF' },
    { name: 'amber', class: 'subject-intro', dot: '#F59E0B', bg: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)', color: '#FEF3C7' },
    { name: 'cyan', class: 'subject-network', dot: '#06B6D4', bg: 'linear-gradient(135deg, #0E7490 0%, #155E75 100%)', color: '#E0F2FE' },
    { name: 'purple', class: 'subject-capstone', dot: '#A855F7', bg: 'linear-gradient(135deg, #7E22CE 0%, #581C87 100%)', color: '#FAF5FF' },
    { name: 'emerald', class: 'subject-prog', dot: '#22C55E', bg: 'linear-gradient(135deg, #15803D 0%, #14532D 100%)', color: '#F0FDF4' },
    { name: 'rose', class: 'subject-rose', dot: '#F43F5E', bg: 'linear-gradient(135deg, #BE123C 0%, #881337 100%)', color: '#FFE4E6' },
    { name: 'indigo', class: 'subject-indigo', dot: '#6366F1', bg: 'linear-gradient(135deg, #4338CA 0%, #312E81 100%)', color: '#E0E7FF' },
    { name: 'orange', class: 'subject-orange', dot: '#EA580C', bg: 'linear-gradient(135deg, #C2410C 0%, #7C2D12 100%)', color: '#FFEDD5' }
  ];

  /**
   * Builds a map of subject name to curated color palette.
   * @param {Array} schedules - List of schedule objects
   * @returns {Map<string, Object>}
   */
  function buildSubjectColorMap(schedules) {
    const palettes = global.SUBJECT_COLOR_PALETTES || SUBJECT_COLOR_PALETTES;
    const subjectMap = new Map();
    let paletteIdx = 0;

    (schedules || []).forEach(s => {
      const name = (s.Subject_Name || 'General Subject').trim();
      if (!subjectMap.has(name)) {
        const lower = name.toLowerCase();
        let selectedPalette;
        if (lower.includes('web')) selectedPalette = palettes[0];
        else if (lower.includes('net')) selectedPalette = palettes[2];
        else if (lower.includes('cap')) selectedPalette = palettes[3];
        else if (lower.includes('prog')) selectedPalette = palettes[4];
        else if (lower.includes('data') || lower.includes('db') || lower.includes('base')) selectedPalette = palettes[7];
        else if (lower.includes('intro') || lower.includes('itc')) selectedPalette = palettes[1];
        else {
          selectedPalette = palettes[paletteIdx % palettes.length];
          paletteIdx++;
        }
        subjectMap.set(name, selectedPalette);
      }
    });

    return subjectMap;
  }

  const facultyScheduleColors = {
    SUBJECT_COLOR_PALETTES,
    buildSubjectColorMap
  };

  global.facultyScheduleColors = facultyScheduleColors;
  global.SUBJECT_COLOR_PALETTES = SUBJECT_COLOR_PALETTES;

})(typeof window !== 'undefined' ? window : this);
