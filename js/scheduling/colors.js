/**
 * LabSync – Scheduling Color & Theme Engine | js/scheduling/colors.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Handles color palettes, custom hex parsing, dark mode support, and card styling.
 */

(function (global) {
  'use strict';

  // Customizable premium glassmorphic color themes (with light & dark variants)
  const COLOR_PALETTES = {
    Default: {
      light: { bg: 'rgba(30, 187, 215, 0.08)', border: 'rgba(30, 187, 215, 0.3)', accent: '#1EBBD7', text: '#0B5E6D', subtext: 'rgba(11, 94, 109, 0.85)' },
      dark:  { bg: 'rgba(13, 33, 55, 0.92)', border: 'rgba(56, 189, 248, 0.65)', accent: '#22D3EE', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Default'
    },
    Indigo: {
      light: { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.3)', accent: '#6366F1', text: '#312E81', subtext: 'rgba(49, 46, 129, 0.85)' },
      dark:  { bg: 'rgba(30, 27, 75, 0.92)', border: 'rgba(129, 140, 248, 0.65)', accent: '#818CF8', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Indigo'
    },
    Emerald: {
      light: { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.3)', accent: '#10B981', text: '#064E3B', subtext: 'rgba(6, 78, 59, 0.85)' },
      dark:  { bg: 'rgba(6, 78, 59, 0.92)', border: 'rgba(52, 211, 153, 0.65)', accent: '#34D399', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Emerald'
    },
    Amber: {
      light: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.3)', accent: '#F59E0B', text: '#78350F', subtext: 'rgba(120, 53, 15, 0.85)' },
      dark:  { bg: 'rgba(69, 30, 7, 0.92)', border: 'rgba(251, 191, 36, 0.65)', accent: '#FBBF24', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Amber'
    },
    Rose: {
      light: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)', accent: '#EF4444', text: '#7F1D1D', subtext: 'rgba(127, 29, 29, 0.85)' },
      dark:  { bg: 'rgba(69, 10, 10, 0.92)', border: 'rgba(248, 113, 113, 0.65)', accent: '#F87171', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Rose'
    },
    Blue: {
      light: { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59, 130, 246, 0.3)', accent: '#3B82F6', text: '#1E3A8A', subtext: 'rgba(30, 58, 138, 0.85)' },
      dark:  { bg: 'rgba(30, 58, 138, 0.92)', border: 'rgba(96, 165, 250, 0.65)', accent: '#60A5FA', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Blue'
    },
    Purple: {
      light: { bg: 'rgba(168, 85, 247, 0.08)', border: 'rgba(168, 85, 247, 0.3)', accent: '#A855F7', text: '#581C87', subtext: 'rgba(88, 28, 135, 0.85)' },
      dark:  { bg: 'rgba(58, 12, 94, 0.92)', border: 'rgba(192, 132, 252, 0.65)', accent: '#C084FC', text: '#FFFFFF', subtext: '#E2E8F0' },
      label: 'Purple'
    },
    Teal: {
      light: { bg: 'rgba(20, 184, 166, 0.08)', border: 'rgba(20, 184, 166, 0.3)', accent: '#20B8A6', text: '#115E59', subtext: 'rgba(17, 94, 89, 0.85)' },
      dark:  { bg: 'rgba(17, 94, 89, 0.92)', border: 'rgba(45, 212, 191, 0.65)', accent: '#2DD4BF', text: '#FFFFFF', subtext: '#CBD5E1' },
      label: 'Teal'
    },
    Pink: {
      light: { bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.3)', accent: '#EC4899', text: '#831843', subtext: 'rgba(131, 24, 67, 0.85)' },
      dark:  { bg: 'rgba(131, 24, 67, 0.92)', border: 'rgba(244, 114, 182, 0.65)', accent: '#F472B6', text: '#FFFFFF', subtext: '#CBD5E1' },
      label: 'Pink'
    }
  };

  // Color palettes for dynamic timetable subject cards and legend dots
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
   * Checks whether dark mode or high-contrast theme is active in the document.
   * @returns {boolean}
   */
  function isDarkModeActive() {
    return document.documentElement.classList.contains('high-contrast') ||
           document.documentElement.classList.contains('dark-mode') ||
           document.body.classList.contains('dark-mode') ||
           document.body.classList.contains('dark-theme') ||
           document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /**
   * Converts a 3 or 6 digit hex string to {r, g, b} object.
   * @param {string} hex - Hex color code
   * @returns {{r: number, g: number, b: number}}
   */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const num = parseInt(hex, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  /**
   * Generates a complete palette entry from a custom hex value with light/dark contrast math.
   * @param {string} hex - Custom hex color
   * @returns {object} Palette configuration
   */
  function customColorToPalette(hex) {
    const { r, g, b } = hexToRgb(hex);
    const isDark = isDarkModeActive();
    if (isDark) {
      return {
        bg: `rgba(${r}, ${g}, ${b}, 0.25)`,
        border: `rgba(${r}, ${g}, ${b}, 0.65)`,
        accent: hex,
        text: '#FFFFFF',
        subtext: '#CBD5E1',
        label: 'Custom Color'
      };
    } else {
      const textR = Math.floor(r * 0.4);
      const textG = Math.floor(g * 0.4);
      const textB = Math.floor(b * 0.4);
      const textHex = `#${((1 << 24) + (textR << 16) + (textG << 8) + textB).toString(16).slice(1)}`;
      return {
        bg: `rgba(${r}, ${g}, ${b}, 0.08)`,
        border: `rgba(${r}, ${g}, ${b}, 0.3)`,
        accent: hex,
        text: textHex,
        subtext: `${textHex}bf`,
        label: 'Custom Color'
      };
    }
  }

  /**
   * Applies dynamic palette styling to a schedule card element.
   * @param {HTMLElement} card - Schedule grid card
   * @param {string} colorName - Named theme or hex string
   */
  function applyCardColor(card, colorName) {
    if (!card) return;
    const isDark = isDarkModeActive();
    let entry;
    if (colorName && colorName.startsWith('#')) {
      entry = customColorToPalette(colorName);
    } else {
      entry = COLOR_PALETTES[colorName] || COLOR_PALETTES.Default;
    }

    const palette = entry.dark ? (isDark ? entry.dark : entry.light) : entry;

    card.dataset.color = colorName || 'Default';
    card.style.backgroundColor = palette.bg;
    card.style.border = `1.5px solid ${palette.border}`;
    card.style.borderLeft = `5px solid ${palette.accent}`;
    card.style.color = palette.text;
    if (isDark) {
      card.style.boxShadow = `0 4px 16px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15)`;
    } else {
      card.style.boxShadow = `0 4px 12px rgba(15, 23, 42, 0.03)`;
    }

    const title = card.querySelector('.grid-card-title');
    if (title) title.style.color = palette.text;

    const sec = card.querySelector('.grid-card-section');
    if (sec) sec.style.color = palette.subtext;

    const prof = card.querySelector('.grid-card-prof');
    if (prof) prof.style.color = palette.subtext;

    const time = card.querySelector('.grid-card-time');
    if (time) time.style.color = palette.accent;
  }

  const scheduleColors = {
    COLOR_PALETTES,
    SUBJECT_COLOR_PALETTES,
    isDarkModeActive,
    hexToRgb,
    customColorToPalette,
    applyCardColor
  };

  global.scheduleColors = scheduleColors;
  global.COLOR_PALETTES = COLOR_PALETTES;
  global.SUBJECT_COLOR_PALETTES = SUBJECT_COLOR_PALETTES;
  global.isDarkModeActive = isDarkModeActive;
  global.hexToRgb = hexToRgb;
  global.customColorToPalette = customColorToPalette;
  global.applyCardColor = applyCardColor;

})(typeof window !== 'undefined' ? window : this);
