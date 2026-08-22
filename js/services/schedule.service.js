/**
 * LabSync – Schedule API Service | js/services/schedule.service.js
 * Extracted in Phase 2 (Scheduling Architecture Refactor)
 * Encapsulates all backend API calls for room schedules, user schedules, and professor conflict checks.
 */

(function (global) {
  'use strict';

  /**
   * Fetches the weekly schedule for a specific laboratory room.
   * @param {string|number} roomNum - Room number
   * @param {string} academicYear - Academic year string (e.g. "2026-2027")
   * @param {string} semester - Semester string (e.g. "1st Semester")
   * @returns {Promise<Array>}
   */
  async function getRoomSchedule(roomNum, academicYear = '', semester = '') {
    let url = `/api/schedules/room/${encodeURIComponent(roomNum)}`;
    const params = [];
    if (academicYear) params.push(`academicYear=${encodeURIComponent(academicYear)}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Failed to load schedule for room ${roomNum}`);
    return await res.json();
  }

  /**
   * Fetches the current logged-in user's weekly teaching schedule.
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @returns {Promise<Array>}
   */
  async function getUserSchedule(academicYear = '', semester = '') {
    let url = '/api/schedules/user';
    const params = [];
    if (academicYear) params.push(`academicYear=${encodeURIComponent(academicYear)}`);
    if (semester) params.push(`semester=${encodeURIComponent(semester)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch user schedule');
    return await res.json();
  }

  /**
   * Saves or updates a room's weekly schedule.
   * @param {string|number} roomNum - Room number
   * @param {Array} schedules - Array of schedule objects
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @returns {Promise<object>}
   */
  async function saveRoomSchedule(roomNum, schedules, academicYear, semester) {
    const res = await fetch('/api/schedules/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        roomNumber: roomNum,
        schedules: schedules,
        academicYear: academicYear,
        semester: semester
      })
    });
    if (!res.ok) throw new Error('Failed to save schedule');
    return await res.json();
  }

  /**
   * Checks if a professor is already scheduled in another room at the specified time.
   * @param {string} professorName - Professor name
   * @param {string} day - Day of week
   * @param {string} startTime - Start time (HH:MM)
   * @param {string} endTime - End time (HH:MM)
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @param {string|number} excludeRoomNumber - Current room number
   * @returns {Promise<{conflict: boolean, conflictingRoom?: string, startTime?: string, endTime?: string}>}
   */
  async function checkProfessorConflict(professorName, day, startTime, endTime, academicYear, semester, excludeRoomNumber) {
    if (!professorName || professorName === 'Not specified') return { conflict: false };

    try {
      const url = `/api/schedules/check-professor-conflict?professorName=${encodeURIComponent(professorName)}&day=${encodeURIComponent(day)}&startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(endTime)}&academicYear=${encodeURIComponent(academicYear || '')}&semester=${encodeURIComponent(semester || '')}&excludeRoomNumber=${encodeURIComponent(excludeRoomNumber || '')}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return { conflict: false };
      return await res.json();
    } catch (err) {
      console.error('Error checking professor conflict:', err);
      return { conflict: false };
    }
  }

  /**
   * Fetches all scheduled teaching slots for a professor across other rooms.
   * @param {string} professorName - Professor name
   * @param {string} academicYear - Academic year
   * @param {string} semester - Semester
   * @param {string|number} excludeRoomNumber - Exclude current room
   * @returns {Promise<Array>}
   */
  async function getProfessorSchedule(professorName, academicYear, semester, excludeRoomNumber) {
    if (!professorName || professorName === 'Not specified') return [];
    try {
      const url = `/api/schedules/professor?professorName=${encodeURIComponent(professorName)}&academicYear=${encodeURIComponent(academicYear || '')}&semester=${encodeURIComponent(semester || '')}&excludeRoomNumber=${encodeURIComponent(excludeRoomNumber || '')}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error('Error loading professor schedule:', err);
      return [];
    }
  }

  /**
   * Fetches list of all faculty members for dropdowns.
   * @returns {Promise<Array>}
   */
  async function getFaculty() {
    const res = await fetch('/api/faculty', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch faculty list');
    return await res.json();
  }

  const scheduleService = {
    getRoomSchedule,
    getUserSchedule,
    saveRoomSchedule,
    checkProfessorConflict,
    getProfessorSchedule,
    getFaculty
  };

  global.scheduleService = scheduleService;

})(typeof window !== 'undefined' ? window : this);
